import {Unknown, exact, integer} from './value.mjs';
import {canonicalProposal, proposal} from './model.mjs';
import {admittedChallenge, identity, receiptProof, readbackProof} from './evidence.mjs';

// An online nonce is committed at most once. Persistence and the trusted
// transport are injected; no endpoint, bearer or writer is selected here.
export class PendingWrite {
  constructor({identity: who, store, transport, sign, now = () => Math.floor(Date.now() / 1000)}) {
    Object.assign(this, {identity: identity(who), store, transport, sign, now});
    this.busy = false;
  }
  async submit(expected, notAfter) {
    if (this.busy) throw new Unknown('An intent is already active');
    this.busy = true;
    try {
      const before = await this.store.get();
      if (before) throw new Unknown('Reconcile the retained intent before another submission');
      const p = proposal(expected);
      integer(notAfter);
      const issued = await this.transport.challenge(p);
      const admitted = await admittedChallenge(issued, p, this.identity, this.now());
      if (admitted.challenge.expires_at > notAfter) throw new Unknown('Server challenge would outlive the request');
      // Durable custody precedes the authenticator and the one commit call.
      const record = {proposal: p, nonce: admitted.challenge.nonce, contentHash: admitted.contentHash, notAfter, state: 'PENDING'};
      await this.store.insert(record);
      let assertion;
      try { assertion = await this.sign(admitted); }
      catch { return record; } // No commit; explicit operator reconciliation required.
      exact(assertion, ['client_data_json', 'authenticator_data', 'signature']);
      await this.store.change(record.nonce, {state: 'UNKNOWN'});
      try { await this.transport.commit({nonce: record.nonce, ...assertion}); }
      catch { /* A lost response proves neither acceptance nor refusal. */ }
      return await this.reconcile();
    } finally { this.busy = false; }
  }
  async reconcile() {
    const record = await this.store.get();
    if (!record) return null;
    if (canonicalProposal(record.proposal) !== JSON.stringify(record.proposal)) throw new Unknown('Changed retained intent');
    let proof;
    try {
      proof = await receiptProof(await this.transport.receipt({nonce: record.nonce}), record.proposal, this.identity, record.nonce);
      if (proof.contentHash !== record.contentHash) throw new Unknown('Changed retained content hash');
      if (proof.expiresAt > integer(record.notAfter)) throw new Unknown('Receipt exceeds retained request deadline');
      readbackProof(await this.transport.readback(proof), proof);
    } catch { return {...record, state: 'UNKNOWN'}; }
    // The persistence adapter must compare the nonce atomically. Unknown,
    // absent, malformed and foreign receipts never clear pending custody.
    await this.store.change(record.nonce, {state: 'ACCEPTED', proof});
    return {...record, state: 'ACCEPTED', proof};
  }
  async acknowledge() {
    const record = await this.store.get();
    if (record?.state !== 'ACCEPTED') throw new Unknown('Verified receipt and fact read-back required');
    await this.store.remove(record.nonce, 'ACCEPTED');
  }
  async cancelUnsigned() {
    const record = await this.store.get();
    if (record?.state !== 'PENDING') throw new Unknown('A possibly submitted intent cannot be discarded');
    await this.store.remove(record.nonce, 'PENDING');
  }
}
