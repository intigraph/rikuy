// SYNTHETIC conformance engine only. No HTTP listener, Quipu backend, actual
// enrollment, graph writer, production capability or history API is provided.
import {canonical,digest,utf8,requestHash,sameScope,Refused} from '../protocol.mjs';
import {verifyFixtureAssertion,b64,unb64} from '../crypto.mjs';
export class FixtureEngine{
  constructor({identity,registered,asks,now=()=>Date.now()}){Object.assign(this,{identity,registered,now});this.registrations=new Map([[registered.credentialId,registered]]);this.asks=new Map(asks.map(a=>[a.id,structuredClone(a)]));this.snapshots=new Map();this.receipts=new Map();this.decided=new Map();this.tx=10;this.lock=Promise.resolve();this.protocol='quipu-brief-offline-v1';}
  async initialize(){this.witness=await crypto.subtle.generateKey({name:'Ed25519'},false,['sign','verify']);return this;}
  forDevice(identity){return {protocol:this.protocol,snapshot:()=>this.snapshot(identity),submit:w=>this.submit(w),receipt:(...a)=>this.receipt(...a)};}
  async snapshot(identity=this.identity){
    if(!this.registrations.has(identity.credentialId)||!sameScope(identity,this.registrations.get(identity.credentialId)))throw new Refused('Snapshot credential not enrolled');
    const tx=++this.tx,createdAt=new Date(this.now()).toISOString(),expiresAt=new Date(this.now()+86400000).toISOString();
    const value={...identity,tx,createdAt,expiresAt,asks:structuredClone([...this.asks.values()].filter(a=>!a.withdrawn&&!this.decided.has(JSON.stringify([a.id,a.revision]))))};
    this.snapshots.set(tx,structuredClone(value));return value;
  }
  async admitSnapshot(raw){if(JSON.stringify(this.snapshots.get(raw.tx))!==JSON.stringify(raw))throw new Refused('Snapshot not in authoritative fixture ledger');}
  async receipt(nonce,hash){const r=this.receipts.get(nonce);if(!r)return {state:'ABSENT',authoritative:true,clientNonce:nonce,digest:hash};if(r.digest!==hash)throw new Refused('Nonce collision');return {state:'MERGED',clientNonce:nonce,digest:hash,receipt:structuredClone(r)};}
  async verifyReceipt(receipt,record){
    const {witness,...body}=receipt;if(!await crypto.subtle.verify('Ed25519',this.witness.publicKey,Uint8Array.from(atob(witness),c=>c.charCodeAt(0)),utf8(JSON.stringify(body))))throw new Refused('Receipt witness refused');
    if(body.digest!==record.digest)throw new Refused('Receipt signed another intent');
  }
  async submit(wire){
    const previous=this.lock;let release;this.lock=new Promise(r=>{release=r;});await previous;
    try{const result=await this.settle(wire),e=JSON.parse(wire).envelope;return {...result,clientNonce:e.clientNonce,digest:await digest(canonical(e))};}finally{release();}
  }
  async settle(wire){
    if(typeof wire!=='string'||utf8(wire).length>32768)throw new Refused('Bounded wire required');
    const input=JSON.parse(wire);if(wire!==JSON.stringify(input)||Object.keys(input).join()!=='envelope,assertion,note')throw new Refused('Ambiguous wire serialization');
    const e=input.envelope,hash=await digest(canonical(e));
    if(this.receipts.has(e.clientNonce))return {state:'REFUSED',reason:'REPLAY'};
    const registered=this.registrations.get(e.credentialId);
    if(!registered||!sameScope(e,registered)||typeof input.note!=='string'||utf8(input.note).length>8192||await digest(utf8(input.note))!==e.noteHash)return {state:'REFUSED',reason:'INTENT_MISMATCH'};
    let verified;try{verified=await verifyFixtureAssertion(e,input.assertion,registered);}catch{return {state:'REFUSED',reason:'SIGNATURE'};}
    const cached=this.snapshots.get(e.snapshotTx),old=cached?.asks.find(a=>a.id===e.askId),current=this.asks.get(e.askId);
    if(!old||!sameScope(cached,e)||old.revision!==e.askRevision||await requestHash(old)!==e.requestHash||!old.choices.includes(e.choice))return {state:'REFUSED',reason:'UNKNOWN_SNAPSHOT_INTENT'};
    const conflict=reason=>({state:'CONFLICT',reason,current:current?structuredClone(current):null});
    if(registered.revoked)return conflict('KEY_REVOKED');
    if(!Number.isFinite(Date.parse(registered.expiresAt)))return {state:'REFUSED',reason:'UNKNOWN_CREDENTIAL_EXPIRY'};
    if(this.now()>=Date.parse(registered.expiresAt))return conflict('KEY_EXPIRED');
    if(this.now()>=Date.parse(cached.expiresAt))return conflict('SNAPSHOT_STALE');
    if(!current||current.withdrawn)return conflict('WITHDRAWN');
    if(this.now()>=Date.parse(current.expiresAt))return conflict('EXPIRED');
    if(current.revision!==e.askRevision||await requestHash(current)!==e.requestHash)return conflict('CHANGED');
    const semanticKey=JSON.stringify([e.askId,e.askRevision]);
    if(this.decided.has(semanticKey))return conflict('ALREADY_DECIDED');
    // Model a single protected commit. Build/sign the receipt before mutating
    // nonce, counter, semantic uniqueness or receipt state. Fault injection
    // therefore cannot half-spend an offline decision.
    const receipt={...Object.fromEntries(['audience','origin','rpId','actor','deviceId','credentialId'].map(k=>[k,e[k]])),clientNonce:e.clientNonce,digest:hash,askId:e.askId,askRevision:e.askRevision,snapshotTx:e.snapshotTx,choice:e.choice,validTime:e.deviceTime,deviceTimeTrusted:false,mergedAt:new Date(this.now()).toISOString(),transactionTx:this.tx+1};
    const witness=await crypto.subtle.sign('Ed25519',this.witness.privateKey,utf8(JSON.stringify(receipt)));
    if(this.failBeforeCommit)throw new Refused('Injected transaction failure');
    receipt.witness=btoa(String.fromCharCode(...new Uint8Array(witness)));
    this.tx++;registered.counter=verified.counter;this.decided.set(semanticKey,e.clientNonce);this.receipts.set(e.clientNonce,receipt);
    return {state:'MERGED',receipt:structuredClone(receipt)};
  }
}
export async function softwareDevice(identity,{algorithm='ECDSA',counter=0,keyPair=null,flags=5,origin=identity.origin,rpId=identity.rpId}={}){
  const keys=keyPair??await crypto.subtle.generateKey(algorithm==='ECDSA'?{name:'ECDSA',namedCurve:'P-256'}:{name:'Ed25519'},false,['sign','verify']);
  const registered={...identity,scheme:algorithm==='ECDSA'?'webauthn-es256':'webauthn-eddsa',publicKey:keys.publicKey,counter:0,expiresAt:'2026-12-31T00:00:00.000Z'};
  const {challenge}=await import('../crypto.mjs');
  const produce=async challengeBytes=>{
    const ad=new Uint8Array(37);ad.set(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8(rpId))));ad[32]=flags;new DataView(ad.buffer).setUint32(33,counter?counter++:0);
    const client=utf8(JSON.stringify({type:'webauthn.get',challenge:b64(challengeBytes),origin,crossOrigin:false}));
    const signed=new Uint8Array(69);signed.set(ad);signed.set(new Uint8Array(await crypto.subtle.digest('SHA-256',client)),37);
    let signature=new Uint8Array(await crypto.subtle.sign(algorithm==='ECDSA'?{name:'ECDSA',hash:'SHA-256'}:'Ed25519',keys.privateKey,signed));
    if(algorithm==='ECDSA'){
      const integer=part=>{while(part.length>1&&part[0]===0)part=part.slice(1);return part[0]&128?Uint8Array.from([0,...part]):part;};
      const r=integer(signature.slice(0,32)),s=integer(signature.slice(32));signature=Uint8Array.from([48,4+r.length+s.length,2,r.length,...r,2,s.length,...s]);
    }
    return {scheme:registered.scheme,credentialId:identity.credentialId,authenticatorData:b64(ad),clientDataJSON:b64(client),signature:b64(signature)};
  };
  const sign=async envelope=>produce(await challenge(envelope));
  const get=async({publicKey})=>{
    if(publicKey.rpId!==identity.rpId||publicKey.userVerification!=='required'||publicKey.allowCredentials.length!==1||b64(publicKey.allowCredentials[0].id)!==identity.credentialId)throw new Refused('Fixture ceremony scope mismatch');
    const a=await produce(new Uint8Array(publicKey.challenge));
    return {type:'public-key',rawId:unb64(identity.credentialId),response:{authenticatorData:unb64(a.authenticatorData),clientDataJSON:unb64(a.clientDataJSON),signature:unb64(a.signature)}};
  };
  return {registered,sign,get,keyPair:keys};
}
