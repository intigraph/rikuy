import test from 'node:test';
import assert from 'node:assert/strict';
import {admitted, base64url, creationOptions, createPublicCredential, publicPacket, fingerprint} from '../web/enroll/model.mjs';
import {config as shipped} from '../web/enroll/config.mjs';
import {coseKey} from '../web/enroll/cose.mjs';
const config = {enabled: true, origin: 'https://enroll.example.test', rpId: 'enroll.example.test'};
const key = Uint8Array.from([0xa4,1,1,3,0x27,0x20,6,0x21,0x58,0x20,...Array.from({length: 32}, (_, i) => i + 1)]);
const buffer = bytes => Uint8Array.from(bytes).buffer;
async function fixture(challenge = new Uint8Array(32)) {
  const id = Uint8Array.of(1,2,3,4);
  const auth = new Uint8Array(55 + id.length + key.length);
  auth.set(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(config.rpId))));
  auth[32] = 0x45; auth[54] = id.length; auth.set(id,55); auth.set(key,55+id.length);
  const client = {type:'webauthn.create', challenge:base64url(challenge), origin:config.origin, crossOrigin:false};
  const credential = {type:'public-key', id:base64url(id), rawId:id.buffer, response:{getAuthenticatorData:()=>auth.buffer, clientDataJSON:buffer(new TextEncoder().encode(JSON.stringify(client)))}};
  return {credential, auth, client, challenge};
}
test('shipped ceremony disabled; origin gates refuse before creating a credential', async () => {
  assert.equal(shipped.enabled, false);
  let calls = 0;
  for (const [cfg, origin, secure] of [[shipped,config.origin,true],[{...config,enabled:false},config.origin,true],[config,'https://other.example.test',true],[config,config.origin,false],[{...config,origin:'http://enroll.example.test'},'http://enroll.example.test',true],[{...config,rpId:'other.example.test'},config.origin,true]]) {
    await assert.rejects(createPublicCredential(cfg,{origin,secure,credentials:{create(){calls++;}},crypto}));
  }
  assert.equal(calls,0);
  assert.doesNotThrow(()=>admitted(config,config.origin,true));
});
test('actual creation options require verification and fresh unpredictable challenges', () => {
  const a=creationOptions(config), b=creationOptions(config);
  assert.equal(a.publicKey.authenticatorSelection.userVerification,'required');
  assert.equal(a.publicKey.challenge.length,32);assert.equal(a.publicKey.user.id.length,32);
  assert.notDeepEqual(a.publicKey.challenge,b.publicKey.challenge);
  assert.deepEqual(a.publicKey.pubKeyCredParams.map(p=>p.alg),[-7,-8]);
});
test('public COSE bytes and independent native fingerprint golden are exact', async () => {
  const f=await fixture();const packet=await publicPacket(f.credential,config,f.challenge);
  assert.equal(packet.cose_key,base64url(key));assert.equal(packet.fingerprint,'9bb1-7e67-b268-ca8b');
  assert.equal(await fingerprint(key),'9bb1-7e67-b268-ca8b');
  assert.equal(packet.scheme,'webauthn-eddsa');assert.equal(packet.backup_eligible,false);
  assert.deepEqual(Object.keys(packet).sort(),['backup_eligible','cose_key','credential_id','fingerprint','origin','rp_id','scheme']);
});
test('user presence, verification, attested data, backup flags and unexpected extensions are required/refused', async () => {
  for(const flag of [0x44,0x41,0x05,0x4d,0x55,0xc5]) {
    const f=await fixture();f.auth[32]=flag;
    await assert.rejects(publicPacket(f.credential,config,f.challenge),/single-device/);
  }
});
test('RP hash, credential ID, truncated key and trailing bytes fail closed', async () => {
  for(const change of [f=>f.auth[0]^=1,f=>f.auth[55]^=1,f=>f.auth[54]=5,f=>f.credential.id='foreign',f=>f.credential.response.getAuthenticatorData=()=>f.auth.slice(0,-1).buffer,f=>f.credential.response.getAuthenticatorData=()=>buffer([...f.auth,0])]) {
    const f=await fixture();change(f);await assert.rejects(publicPacket(f.credential,config,f.challenge));
  }
});
test('creation origin, challenge, type, cross-origin and duplicate JSON fields refuse export', async () => {
  for(const change of [c=>c.origin='https://other.example.test',c=>c.challenge='different',c=>c.type='webauthn.get',c=>c.crossOrigin=true]) {
    const f=await fixture();change(f.client);f.credential.response.clientDataJSON=buffer(new TextEncoder().encode(JSON.stringify(f.client)));
    await assert.rejects(publicPacket(f.credential,config,f.challenge),/context mismatch/);
  }
  const f=await fixture();f.credential.response.clientDataJSON=buffer(new TextEncoder().encode('{"origin":"wrong",'+JSON.stringify(f.client).slice(1)));
  await assert.rejects(publicPacket(f.credential,config,f.challenge),/context mismatch/);
});
test('bounded COSE parser rejects duplicate fields, wrong algorithms, indefinite lengths and oversize coordinates', () => {
  for(const bytes of [Uint8Array.from([0xbf]),Uint8Array.from([0xa6]),Uint8Array.from([...key.slice(0,3),1,...key.slice(4)]),Uint8Array.from([...key.slice(0,4),0x26,...key.slice(5)]),key.slice(0,-1)]) assert.throws(()=>coseKey(bytes,0));
  const p256=Uint8Array.from([0xa5,1,2,3,0x26,0x20,1,0x21,0x58,0x20,...new Uint8Array(32),0x22,0x58,0x20,...new Uint8Array(32)]);
  assert.equal(coseKey(p256,0).scheme,'webauthn-es256');
});
test('create uses the returned authenticator data and cancellation never produces a packet', async () => {
  let calls=0;
  const environment={origin:config.origin,secure:true,crypto,credentials:{async create(options){calls++;return (await fixture(options.publicKey.challenge)).credential;}}};
  assert.equal((await createPublicCredential(config,environment)).fingerprint,'9bb1-7e67-b268-ca8b');assert.equal(calls,1);
  await assert.rejects(createPublicCredential(config,{...environment,credentials:{}}),/unavailable/);
  environment.credentials.create=async()=>null;
  await assert.rejects(createPublicCredential(config,environment),/cancelled/);
});
