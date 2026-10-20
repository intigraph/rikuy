import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OfflineOutbox} from './outbox.mjs';
import {MemoryStore} from './storage.mjs';
import {canonical,DOMAIN,makeEnvelope,requestHash,digest,utf8,Refused} from './protocol.mjs';
import {webauthnSigner,b64,unb64,verifyFixtureAssertion,challenge} from './crypto.mjs';
import {requireTransport} from './transport.mjs';
import {decodePendant} from './explorer.mjs';
import {FixtureEngine,softwareDevice} from './fixtures/engine.mjs';
const base=Date.parse('2026-10-20T04:00:00.000Z');
export const identity={audience:'fixture-store-lineage',origin:'https://brief.example',rpId:'brief.example',actor:'fixture-human-NOT-Stiwi',deviceId:'fixture-device',credentialId:b64(utf8('fixture-credential'))};
export const asks=()=>Array.from({length:3},(_,i)=>({id:`urn:fixture:ask:${i}`,revision:1,policy:'urn:fixture:policy',target:`urn:fixture:target:${i}`,summary:`Fixture ask ${i}`,expiresAt:'2026-10-22T04:00:00.000Z',choices:['approve','reject','changes'],curator:'fixture-curator'}));
async function setup(options={}){
  let clock=base;const store=options.store??new MemoryStore(),device=await softwareDevice(identity,options);
  const engine=await new FixtureEngine({identity,registered:device.registered,asks:asks(),now:()=>clock}).initialize();
  const outbox=new OfflineOutbox({identity,store,sign:device.sign,transport:engine,admitSnapshot:r=>engine.admitSnapshot(r),verifyReceipt:(r,v)=>engine.verifyReceipt(r,v),now:()=>clock});
  await outbox.refresh();return {outbox,engine,store,device,time:t=>{clock=t;}};
}
async function secondDevice(engine){
  const id={...identity,deviceId:'fixture-second-device',credentialId:b64(utf8('fixture-second-credential'))},device=await softwareDevice(id),store=new MemoryStore();
  engine.registrations.set(id.credentialId,device.registered); // explicit synthetic enrollment only
  const outbox=new OfflineOutbox({identity:id,store,sign:device.sign,transport:engine.forDevice(id),admitSnapshot:r=>engine.admitSnapshot(r),verifyReceipt:(r,v)=>engine.verifyReceipt(r,v),now:()=>base});
  await outbox.refresh();return {outbox,store};
}
test('canonical vector fixes full scope/revision/snapshot/request/note/time, rejects ambiguity',async()=>{
  const h=await setup(),cached=await h.store.getSnapshot(),e=await makeEnvelope({identity,cached,ask:cached.asks[0],choice:'approve',note:'note',now:base});
  e.clientNonce='00'.repeat(32);
  const expected={domain:DOMAIN,...identity,askId:'urn:fixture:ask:0',askRevision:1,snapshotTx:11,requestHash:await requestHash(asks()[0]),choice:'approve',noteHash:await digest(utf8('note')),clientNonce:'00'.repeat(32),deviceTime:'2026-10-20T04:00:00.000Z'};
  assert.equal(new TextDecoder().decode(canonical(e)),JSON.stringify(expected));
  assert.deepEqual(canonical(Object.fromEntries(Object.entries(e).reverse())),canonical(e));
  for(const bad of [{...e,extra:'smuggle'},{...e,snapshotTx:0},{...e,snapshotTx:Number.MAX_SAFE_INTEGER+1},{...e,domain:'quipu-decision-deck-v1'},{...e,origin:'https://brief.example/path'},{...e,choice:'execute'},{...e,actor:'\ud800'}])assert.throws(()=>canonical(bad));
});
test('three truly signed offline asks + one server revision change => two verified and one conflict',async()=>{
  const h=await setup();for(const ask of asks())await h.outbox.decide(ask.id,'approve','offline note');
  assert((await h.store.list()).every(r=>r.state==='PENDING'));h.engine.asks.get('urn:fixture:ask:1').revision=2;
  await h.outbox.flush();const records=await h.store.list();assert.deepEqual(records.map(r=>r.state),['MERGED','CONFLICT','MERGED']);
  assert.equal(records[1].cachedAsk.revision,1);assert.equal(records[1].current.revision,2);assert.equal(records[1].reason,'CHANGED');
  for(const r of records.filter(r=>r.state==='MERGED')){await h.engine.verifyReceipt(r.receipt,r);assert.equal(r.receipt.validTime,r.envelope.deviceTime);assert.equal(r.receipt.deviceTimeTrusted,false);assert(r.receipt.transactionTx>r.envelope.snapshotTx);}
});
test('exact replay refuses; another nonce/device decision cannot last-writer-win',async()=>{
  const h=await setup(),other=await secondDevice(h.engine),r=await h.outbox.decide(asks()[0].id,'approve');await h.outbox.flush();
  assert.equal((await h.engine.submit(r.wire)).reason,'REPLAY');
  await other.outbox.decide(asks()[0].id,'reject');await other.outbox.flush();
  assert.equal((await other.store.list())[0].reason,'ALREADY_DECIDED');assert.equal(h.engine.receipts.size,1);
});
test('tamper, forged signature, malformed wire and wrong origin refuse with paired valid control',async()=>{
  for(const mutate of [x=>{x.envelope.choice='reject';},x=>{x.note='tampered';},x=>{x.assertion.signature=b64(new Uint8Array(70));},x=>{x.envelope.origin='https://evil.example';x.envelope.rpId='evil.example';}]){
    const h=await setup(),r=await h.outbox.decide(asks()[0].id,'approve'),x=JSON.parse(r.wire);mutate(x);assert.equal((await h.engine.submit(JSON.stringify(x))).state,'REFUSED');assert.equal(h.engine.receipts.size,0);assert.equal((await h.engine.submit(r.wire)).state,'MERGED');
  }
  const h=await setup(),r=await h.outbox.decide(asks()[0].id,'approve');await assert.rejects(()=>h.engine.submit(r.wire.replace('{','{"note":"duplicate",')),/serialization/);
});
test('withdrawn, expired, revoked and stale snapshot remain explicit conflicts',async()=>{
  for(const [reason,change]of [['WITHDRAWN',h=>h.engine.asks.delete(asks()[0].id)],['EXPIRED',h=>{h.engine.asks.get(asks()[0].id).expiresAt='2026-10-20T03:00:00.000Z';}],['KEY_REVOKED',h=>{h.engine.registered.revoked=true;}],['SNAPSHOT_STALE',h=>h.time(base+86400001)]]){
    const h=await setup();await h.outbox.decide(asks()[0].id,'approve');change(h);await h.outbox.flush();assert.equal((await h.store.list())[0].reason,reason);assert.equal(h.engine.receipts.size,0);
  }
});
test('lost committed response resolves immutable receipt after reload, never resigns or resubmits',async()=>{
  const h=await setup();await h.outbox.decide(asks()[0].id,'approve');let submits=0;
  h.outbox.transport={snapshot:()=>h.engine.snapshot(),receipt:(...a)=>h.engine.receipt(...a),submit:async wire=>{submits++;await h.engine.submit(wire);throw Error('Lost HTTP response');}};
  await h.outbox.flush();assert.equal((await h.store.list())[0].state,'UNCERTAIN');
  const restored=new OfflineOutbox({...h.outbox,sign:()=>{throw Error('Must never resign');}});await restored.flush();
  assert.equal((await h.store.list())[0].state,'MERGED');assert.equal(submits,1);assert.equal(h.engine.receipts.size,1);
});
test('lost pre-commit response only retries byte-identical action after authoritative absence',async()=>{
  const h=await setup();const record=await h.outbox.decide(asks()[0].id,'approve');let wires=[];
  h.engine.failBeforeCommit=true;const submit=h.engine.submit.bind(h.engine);h.outbox.transport={receipt:(...a)=>h.engine.receipt(...a),submit:wire=>{wires.push(wire);return submit(wire);}};
  await h.outbox.flush();assert.equal(h.engine.receipts.size,0);assert.equal(h.engine.registered.counter,0);h.engine.failBeforeCommit=false;
  await h.outbox.flush();assert.equal((await h.store.list())[0].state,'MERGED');assert.deepEqual(wires,[record.wire,record.wire]);
});
test('unknown receipt cannot trigger resend, forged/mismatched receipt cannot mark MERGED',async()=>{
  const h=await setup();await h.outbox.decide(asks()[0].id,'approve');h.engine.failBeforeCommit=true;await h.outbox.flush();let sends=0;
  h.outbox.transport={receipt:async()=>({state:'UNKNOWN'}),submit:async()=>{sends++;}};await h.outbox.flush();assert.equal(sends,0);assert.equal((await h.store.list())[0].state,'UNCERTAIN');
  h.engine.failBeforeCommit=false;h.outbox.transport=h.engine;const verify=h.outbox.verifyReceipt;h.outbox.verifyReceipt=async()=>{throw Error('Witness forged');};await h.outbox.flush();assert.equal((await h.store.list())[0].state,'UNCERTAIN');h.outbox.verifyReceipt=verify;await h.outbox.flush();assert.equal((await h.store.list())[0].state,'MERGED');
});
test('nonzero WebAuthn counters settle in durable ceremony order',async()=>{
  const h=await setup({counter:1});for(const a of asks())await h.outbox.decide(a.id,'approve');
  // Simulate two tabs whose durable insertion completes out of ceremony order.
  for(const r of h.store.records.values())r.sequence=4-r.sequence;
  await h.outbox.flush();assert((await h.store.list()).every(r=>r.state==='MERGED'));assert.equal(h.engine.registered.counter,3);
});
test('EdDSA supported fixture; unsupported signing/transport never invents identity or authority',async()=>{
  const h=await setup({algorithm:'Ed25519'});await h.outbox.decide(asks()[0].id,'reject');await h.outbox.flush();assert.equal((await h.store.list())[0].state,'MERGED');
  assert.throws(()=>webauthnSigner({...identity,scheme:'ed25519'}),/no software-key fallback/);assert.throws(()=>requireTransport(null),/not been delivered/);
  h.outbox.transport=null;await assert.rejects(()=>h.outbox.flush(),/unsupported/);
});
test('fake snapshots, absent tx, expired cache, double sign and signature failures retain safety',async()=>{
  const h=await setup(),raw=await h.engine.snapshot();raw.tx=999;h.outbox.transport={snapshot:async()=>raw};await assert.rejects(()=>h.outbox.refresh(),/ledger/);
  await h.outbox.decide(asks()[0].id,'approve');await assert.rejects(()=>h.outbox.decide(asks()[0].id,'reject'),/already has/);
  h.time(base+86400001);await assert.rejects(()=>h.outbox.decide(asks()[1].id,'approve'),/expired/);
  const x=await setup();x.outbox.sign=async()=>{throw Error('User cancelled ceremony');};await assert.rejects(()=>x.outbox.decide(asks()[0].id,'approve'),/cancelled/);assert.equal((await x.store.list()).length,0);
});
test('concurrent settle admissions cannot both decide same revision; receipt lookup survives revocation',async()=>{
  const h=await setup(),a=await h.outbox.decide(asks()[0].id,'approve'),other=await secondDevice(h.engine),b=await other.outbox.decide(asks()[0].id,'reject');
  const results=await Promise.all([h.engine.submit(a.wire),h.engine.submit(b.wire)]);assert.deepEqual(results.map(r=>r.state),['MERGED','CONFLICT']);assert.equal(h.engine.receipts.size,1);
  h.engine.registered.revoked=true;const retained=await h.engine.receipt(a.id,a.digest);await h.engine.verifyReceipt(retained.receipt,a);assert.equal(retained.state,'MERGED');
});
test('supported WebAuthn caller binds exact enrolled credential/RP/UV and canonical challenge',async()=>{
  const h=await setup(),cached=await h.store.getSnapshot(),e=await makeEnvelope({identity,cached,ask:cached.asks[0],choice:'approve',note:'',now:base});
  const fixture=await h.device.sign(e);let opts;
  const sign=webauthnSigner({...identity,scheme:'webauthn-es256'},{get:async options=>{opts=options;return {type:'public-key',rawId:unb64(identity.credentialId),response:{authenticatorData:unb64(fixture.authenticatorData),clientDataJSON:unb64(fixture.clientDataJSON),signature:unb64(fixture.signature)}};}});
  const assertion=await sign(e);await verifyFixtureAssertion(e,assertion,h.device.registered);assert.equal(opts.publicKey.userVerification,'required');assert.equal(opts.publicKey.rpId,identity.rpId);assert.equal(opts.publicKey.allowCredentials.length,1);
});
test('valid enrolled signatures with missing UV/UP or wrong origin/RP are still refused',async()=>{
  for(const bad of [{flags:1},{flags:4},{origin:'https://evil.example'},{rpId:'evil.example'}]){
    const h=await setup(),device=await softwareDevice(identity,{keyPair:h.device.keyPair,...bad});h.outbox.sign=device.sign;
    const r=await h.outbox.decide(asks()[0].id,'approve');assert.equal((await h.engine.submit(r.wire)).reason,'SIGNATURE');assert.equal(h.engine.receipts.size,0);
    const wire=JSON.parse(r.wire);wire.assertion=await h.device.sign(r.envelope);assert.equal((await h.engine.submit(JSON.stringify(wire))).state,'MERGED');
  }
});
test('expired enrolled key conflicts; absent expiry cannot manufacture authority',async()=>{
  const h=await setup();await h.outbox.decide(asks()[0].id,'approve');h.engine.registered.expiresAt='2026-10-20T03:00:00.000Z';await h.outbox.flush();assert.equal((await h.store.list())[0].reason,'KEY_EXPIRED');
  const x=await setup();await x.outbox.decide(asks()[0].id,'approve');delete x.engine.registered.expiresAt;await x.outbox.flush();assert.equal((await x.store.list())[0].reason,'UNKNOWN_CREDENTIAL_EXPIRY');
});
test('mixed-intent responses and nonauthoritative absence cannot silently advance outbox',async()=>{
  const h=await setup();await h.outbox.decide(asks()[0].id,'approve');h.engine.failBeforeCommit=true;await h.outbox.flush();let sent=0;
  h.outbox.transport={receipt:async()=>({state:'ABSENT',clientNonce:'wrong',digest:'wrong',authoritative:true}),submit:async()=>{sent++;}};await h.outbox.flush();assert.equal(sent,0);assert.equal((await h.store.list())[0].state,'UNCERTAIN');
});
test('retained pendant transport is decoded and hash-checked before native import',async()=>{
  const raw=utf8('synthetic archive bytes'),encoded={encoding:'base64',data:btoa(new TextDecoder().decode(raw)),sha256:await digest(raw)};
  assert.deepEqual(await decodePendant(encoded),raw);
  await assert.rejects(()=>decodePendant({...encoded,sha256:'00'.repeat(32)}),/hash mismatch/);
  await assert.rejects(()=>decodePendant({...encoded,encoding:'json'}),/transport/);
});
test('two-tab ABSENT/commit race recovers the original receipt after refused replay',async()=>{
  const h=await setup(),r=await h.outbox.decide(asks()[0].id,'approve');let release,started;
  const hold=new Promise(resolve=>{release=resolve;}),start=new Promise(resolve=>{started=resolve;});let sends=0;
  const transport={receipt:(...a)=>h.engine.receipt(...a),submit:async wire=>{sends++;if(sends===1){started();await hold;return h.engine.submit(wire);}release();await h.engine.submit(wire);return h.engine.submit(wire);}};
  h.outbox.transport=transport;const first=h.outbox.flush();await start;
  const second=new OfflineOutbox({...h.outbox});await second.flush();await first;
  assert.equal(h.engine.receipts.size,1);assert.equal(sends,2);assert.equal((await h.store.list())[0].state,'MERGED');assert.equal((await h.store.list())[0].wire,r.wire);
});
test('retained cross-language vector verifies without any private key and binds every intent field',async()=>{
  const v=JSON.parse(readFileSync(new URL('./fixtures/vector-v1.json',import.meta.url))),publicKey=await crypto.subtle.importKey('jwk',v.publicKeyJWK,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  const registered={...v.identity,scheme:'webauthn-es256',publicKey,counter:0};
  assert.equal(new TextDecoder().decode(canonical(v.envelope)),v.canonicalUTF8);assert.equal(await digest(canonical(v.envelope)),v.digest);assert.equal(b64(await challenge(v.envelope)),v.challengeBase64url);
  await verifyFixtureAssertion(v.envelope,v.assertion,registered);
  for(const [key,value]of Object.entries({askRevision:2,snapshotTx:12,requestHash:'01'.repeat(32),choice:'reject',noteHash:'02'.repeat(32),clientNonce:'03'.repeat(32),deviceTime:'2026-10-20T04:00:01.000Z'}))await assert.rejects(()=>verifyFixtureAssertion({...v.envelope,[key]:value},v.assertion,registered));
});
test('multiline request text is retained exactly; oversized assertions cannot create unmergeable queued intent',async()=>{
  const h=await setup();h.engine.asks.get(asks()[0].id).summary='Exact first line\nSecond line\twith tab';await h.outbox.refresh();
  const r=await h.outbox.decide(asks()[0].id,'approve');assert.equal(r.cachedAsk.summary,'Exact first line\nSecond line\twith tab');await h.outbox.flush();assert.equal((await h.store.list())[0].state,'MERGED');
  const x=await setup();x.outbox.sign=async()=>({signature:'x'.repeat(40000)});await assert.rejects(()=>x.outbox.decide(asks()[0].id,'approve'),/wire capacity/);assert.equal((await x.store.list()).length,0);
});
