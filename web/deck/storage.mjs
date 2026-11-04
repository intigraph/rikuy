import {Unknown, exact, integer, hexId, sha256, utf8} from './value.mjs';
import {proposal, scope} from './model.mjs';
import {identity} from './evidence.mjs';

// Separate database/domain from the offline outbox. One retained online
// intent per operator/store/graph scope; never fall back to memory storage.
export class PendingStore {
  constructor(db) { this.db = db; }
  static async open(who, boundary, indexedDB = globalThis.indexedDB) {
    if (!indexedDB) throw new Unknown('Durable online intent storage unavailable');
    const name = 'rikuy-online-intent-v1-' + await sha256(utf8(JSON.stringify([identity(who), scope(boundary)])));
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('pending');
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Unknown('Online intent storage blocked'));
      request.onsuccess = () => resolve(request.result);
    });
    return new PendingStore(db);
  }
  operation(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('pending', mode), store = tx.objectStore('pending'); let result;
      tx.oncomplete = () => resolve(structuredClone(result));
      tx.onabort = () => reject(tx.error || new Unknown('Concurrent online intent change'));
      tx.onerror = () => {};
      const get = store.get('intent');
      get.onsuccess = () => {
        try {result = fn(get.result ?? null, store, tx);}
        catch (error) {tx.abort(); reject(error);}
      };
    });
  }
  get() {return this.operation('readonly', value => value);}
  insert(record) {
    exact(record, ['proposal', 'nonce', 'contentHash', 'notAfter', 'state']);
    const p = proposal(record.proposal); hexId(record.nonce); integer(record.notAfter);
    if (record.state !== 'PENDING' || !/^sha256:[0-9a-f]{64}$/.test(record.contentHash)) throw new Unknown('Invalid initial intent');
    return this.operation('readwrite', (old, store) => {
      if (old) throw new Unknown('An intent already has durable custody');
      const value = {...record, proposal: p}; store.add(structuredClone(value), 'intent'); return value;
    });
  }
  change(nonce, patch) {
    if (!patch || Object.keys(patch).some(k => !['state', 'proof'].includes(k)) || !['UNKNOWN', 'ACCEPTED'].includes(patch.state)) throw new Unknown('Immutable online intent');
    return this.operation('readwrite', (old, store) => {
      if (!old || old.nonce !== nonce || old.state === 'ACCEPTED' && patch.state !== 'ACCEPTED') throw new Unknown('Concurrent online intent change');
      const value = {...old, ...structuredClone(patch)};
      if (utf8(JSON.stringify(value)).length > 131072) throw new Unknown('Online intent storage bound exceeded');
      store.put(value, 'intent'); return value;
    });
  }
  remove(nonce, state) {
    return this.operation('readwrite', (old, store) => {
      if (!old || old.nonce !== nonce || old.state !== state || !['PENDING', 'ACCEPTED'].includes(state)) throw new Unknown('A possibly submitted intent cannot be discarded');
      store.delete('intent'); return null;
    });
  }
  close() {this.db.close();}
}
