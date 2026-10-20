import {Refused,Unsupported} from './protocol.mjs';
const copy=value=>structuredClone(value);
export class IndexedStore{
  constructor(db){this.db=db;}
  static async open(name,indexedDB=globalThis.indexedDB){
    if(!indexedDB)throw new Unsupported('Durable browser storage unavailable');
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{r.result.createObjectStore('snapshots');r.result.createObjectStore('outbox',{keyPath:'id'});};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Refused('Storage upgrade blocked by another tab'));r.onsuccess=()=>resolve(r.result);});
    return new IndexedStore(db);
  }
  async operation(store,mode,fn){
    return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,mode),s=tx.objectStore(store);let result;
      tx.oncomplete=()=>resolve(copy(result));tx.onabort=()=>reject(tx.error||new Refused('Storage transaction aborted'));tx.onerror=()=>{};
      try{fn(s,value=>{result=value;},tx);}catch(error){tx.abort();reject(error);}
    });
  }
  getSnapshot(){return this.operation('snapshots','readonly',(s,done)=>{s.get('current').onsuccess=e=>done(e.target.result??null);});}
  saveSnapshot(value){return this.operation('snapshots','readwrite',(s,done)=>{s.put(copy(value),'current');done(value);});}
  list(){return this.operation('outbox','readonly',(s,done,tx)=>{s.getAll(undefined,1001).onsuccess=e=>{if(e.target.result.length>1000){tx.abort();return;}done(e.target.result);};});}
  insert(record){return this.operation('outbox','readwrite',(s,done,tx)=>{s.count().onsuccess=e=>{
    if(e.target.result>=1000){tx.abort();return;}
    // No automatic deletion/compaction: monotone insertion order survives
    // reloads and preserves WebAuthn counters across disconnected ceremonies.
    const value={...copy(record),version:1,sequence:e.target.result+1};s.add(value);done(value);
  };});}
  change(id,version,patch){return this.operation('outbox','readwrite',(s,done,tx)=>{
    s.get(id).onsuccess=e=>{const old=e.target.result;if(!old||old.version!==version){tx.abort();return;}
      const allowed=['state','reason','receipt','current','attempts'];if(Object.keys(patch).some(k=>!allowed.includes(k))){tx.abort();return;}
      const value={...old,...copy(patch),version:version+1};s.put(value);done(value);
    };
  });}
  close(){this.db.close();}
}
// Test-only adapter; not selected automatically when IndexedDB fails.
export class MemoryStore{
  constructor(){this.records=new Map();this.cached=null;}
  async getSnapshot(){return copy(this.cached);}
  async saveSnapshot(v){this.cached=copy(v);return copy(v);}
  async list(){return copy([...this.records.values()]);}
  async insert(r){if(this.records.has(r.id)||this.records.size>=1000)throw new Refused('Duplicate nonce or outbox full');const v={...copy(r),version:1,sequence:this.records.size+1};this.records.set(r.id,v);return copy(v);}
  async change(id,version,patch){const old=this.records.get(id);if(!old||old.version!==version)throw new Refused('Concurrent outbox change');if(Object.keys(patch).some(k=>!['state','reason','receipt','current','attempts'].includes(k)))throw new Refused('Immutable intent');const v={...old,...copy(patch),version:version+1};this.records.set(id,v);return copy(v);}
}
