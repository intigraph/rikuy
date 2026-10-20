import {snapshot,request,makeEnvelope,canonical,digest,utf8,Refused,Unsupported,sameScope} from './protocol.mjs';
import {unb64} from './crypto.mjs';
const counter=record=>{try{const ad=unb64(JSON.parse(record.wire).assertion.authenticatorData);return new DataView(ad.buffer,ad.byteOffset,ad.byteLength).getUint32(33);}catch{return Number.MAX_SAFE_INTEGER;}};
export class OfflineOutbox{
  constructor({identity,store,sign,transport,verifyReceipt,admitSnapshot,now=()=>Date.now()}){Object.assign(this,{identity,store,sign,transport,verifyReceipt,admitSnapshot,now});this.signing=false;this.flushing=false;}
  async refresh(){
    if(!this.transport||!this.admitSnapshot)throw new Unsupported('Offline server snapshot admission is not available');
    const raw=await this.transport.snapshot();await this.admitSnapshot(raw);
    const admitted=await snapshot(raw,this.identity);await this.store.saveSnapshot(admitted);return admitted;
  }
  async decide(askId,choice,note=''){
    if(this.signing)throw new Refused('A signing ceremony is already active');this.signing=true;
    try{
      const cached=await this.store.getSnapshot();if(!cached)throw new Refused('No admitted offline ask snapshot');
      await snapshot(cached,this.identity);const ask=cached.asks.find(a=>a.id===askId);if(!ask)throw new Refused('Ask absent from cached snapshot');
      if(this.now()>=Date.parse(cached.expiresAt)||this.now()>=Date.parse(ask.expiresAt))throw new Refused('Cached ask/snapshot expired; reconnect before deciding');
      const pending=await this.store.list();if(pending.some(r=>r.envelope.askId===ask.id&&r.envelope.askRevision===ask.revision&&r.state!=='CONFLICT'&&r.state!=='REFUSED'))throw new Refused('This revision already has an outbox decision');
      const envelope=await makeEnvelope({identity:this.identity,cached,ask:request(ask),choice,note,now:this.now()});
      if(typeof this.sign!=='function')throw new Unsupported('Enrolled device signing unavailable');
      const assertion=await this.sign(envelope),wire={envelope,assertion,note};
      const encoded=JSON.stringify(wire);if(utf8(encoded).length>32768)throw new Refused('Signed decision exceeds bounded wire capacity; not queued or submitted');
      // Store the exact bytes ONCE. Recovery never re-signs or substitutes nonce.
      const record={id:envelope.clientNonce,envelope,wire:encoded,digest:await digest(canonical(envelope)),cachedAsk:ask,state:'PENDING',attempts:0};
      return await this.store.insert(record);
    }finally{this.signing=false;}
  }
  async accept(record,response){
    if(response?.clientNonce!==record.id||response?.digest!==record.digest)throw new Refused('Settlement response belongs to another intent');
    if(response?.state==='MERGED'){
      if(!this.verifyReceipt)throw new Unsupported('Protected receipt verification unavailable');
      await this.verifyReceipt(response.receipt,record);
      const r=response.receipt;
      if(r.clientNonce!==record.id||r.digest!==record.digest||r.askId!==record.envelope.askId||r.askRevision!==record.envelope.askRevision||!sameScope(r,record.envelope)||r.snapshotTx!==record.envelope.snapshotTx||!Number.isSafeInteger(r.transactionTx)||r.transactionTx<1||r.deviceTimeTrusted!==false||r.validTime!==record.envelope.deviceTime||!Number.isFinite(Date.parse(r.mergedAt)))throw new Refused('Receipt identity/time mismatch');
      return this.store.change(record.id,record.version,{state:'MERGED',receipt:r,reason:null});
    }
    if(response?.state==='CONFLICT'){
      if(!['CHANGED','WITHDRAWN','EXPIRED','ALREADY_DECIDED','KEY_REVOKED','KEY_EXPIRED','SNAPSHOT_STALE'].includes(response.reason))throw new Refused('Unknown conflict');
      return this.store.change(record.id,record.version,{state:'CONFLICT',reason:response.reason,current:response.current??null});
    }
    if(response?.state==='REFUSED'){
      if(response.reason==='REPLAY')throw new Refused('Replay refused; original receipt must be reconciled');
      return this.store.change(record.id,record.version,{state:'REFUSED',reason:String(response.reason??'Verification refused')});
    }
    throw new Refused('Unsupported settlement result');
  }
  async flush(){
    if(this.flushing)return;this.flushing=true;
    try{
      if(!this.transport||!this.verifyReceipt)throw new Unsupported('Offline settlement unsupported; queued intent retained');
      // Signing can finish in two tabs in a different order from IndexedDB
      // insertion. Preserve the signed authenticator counter, not nonce order.
      // A forged local counter never gains authority: the server verifies it.
      const records=(await this.store.list()).sort((a,b)=>counter(a)-counter(b)||a.sequence-b.sequence);
      for(let record of records){
        if(!['PENDING','SUBMITTING','UNCERTAIN'].includes(record.state))continue;
        try{
          if(record.state!=='PENDING'){
            const result=await this.transport.receipt(record.id,record.digest);
            if(result?.state==='MERGED'){await this.accept(record,result);continue;}
            if(result?.state!=='ABSENT'||result.authoritative!==true||result.clientNonce!==record.id||result.digest!==record.digest)continue; // UNKNOWN/404 cannot authorize resend.
          }
          record=await this.store.change(record.id,record.version,{state:'SUBMITTING',attempts:record.attempts+1});
          let response=await this.transport.submit(record.wire);
          if(response?.state==='REFUSED'&&response.reason==='REPLAY'&&response.clientNonce===record.id&&response.digest===record.digest){
            // A competing tab may have won after our authoritative ABSENT
            // read. Replay stays refused; recover the ORIGINAL protected fact.
            response=await this.transport.receipt(record.id,record.digest);
          }
          await this.accept(record,response);
        }catch(error){
          // An HTTP error is not proof of refusal/absence. Do not delete or
          // re-sign the queued action, including after a browser crash.
          try{await this.store.change(record.id,record.version,{state:'UNCERTAIN',reason:error.message});}catch{/* another tab won CAS; retain its newer result */}
        }
      }
    }finally{this.flushing=false;}
  }
}
