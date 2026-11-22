import test from 'node:test';
import assert from 'node:assert/strict';
import {assessPacket, requiredPins} from '../scripts/admission/ask-packet.mjs';
const fixture = () => ({schema: 'rikuy-ask-preparation/v1', mode: 'PREPARATION_ONLY',
  pins: requiredPins.map(id => ({id, state: 'UNKNOWN', value: null, evidence: 'Not supplied in this bounded source fixture'})),
  rollback: {disable: 'Disable consumer', revoke: 'Revoke exact grants through qualified owner', retain: 'Retain all custody and audit facts', verify: 'Verify revocation refusal'},
  acceptance: Object.fromEntries(['smoke', 'forgery', 'replay', 'staleAsk', 'staleTarget', 'lostReply', 'revocation'].map(k => [k, 'Required admitted control']))});
test('complete inventory preserves UNKNOWN and never grants runtime authority', () => {
  const x = fixture(); assert.equal(assessPacket(x).unknown.length, requiredPins.length);
  for (const pin of x.pins) Object.assign(pin, {state: 'SELECTED', value: 'source-only', evidence: 'fixture source'});
  assert.equal(assessPacket(x).runtimeAuthorized, false);
});
test('partial inventory, guessed UNKNOWN, duplicate and credential-bearing extensions refuse', () => {
  for (const change of [x => x.pins.pop(), x => {x.pins[1] = x.pins[0];}, x => {x.pins[0].value = 'guessed';}, x => {x.credential = 'forbidden';}, x => {x.pins[0].secret = 'forbidden';}, x => {x.mode = 'GO';}, x => {x.rollback.retain = ''; }]) {
    const x = fixture(); change(x); assert.throws(() => assessPacket(x));
  }
});
test('reports contain identities of pins but never their values', () => {
  const x = fixture(); Object.assign(x.pins[0], {state: 'SELECTED', value: 'do-not-echo', evidence: 'fixture'});
  assert.equal(JSON.stringify(assessPacket(x)).includes('do-not-echo'), false);
});

const {nativeLibraries} = await import('../scripts/admission/native-libraries.mjs');
const artifact = (name, path) => JSON.stringify({reason: 'compiler-artifact', profile: {test: false}, target: {name, kind: ['lib']}, filenames: [path]});
test('ambiguous Cargo libraries require explicit producer membership and matching hash', () => {
  const inventory = [artifact('quipu', '/fixture/libquipu.rlib'), artifact('serde_json', '/fixture/first.rlib'), artifact('serde_json', '/fixture/second.rlib')].join('\n');
  assert.throws(() => nativeLibraries(inventory));
  const hash = 'a'.repeat(64), pin = {path: '/fixture/second.rlib', sha256: hash};
  assert.equal(nativeLibraries(inventory, pin, () => hash).get('serde_json'), pin.path);
  assert.throws(() => nativeLibraries(inventory, {...pin, path: '/outside/inventory.rlib'}, () => hash));
  assert.throws(() => nativeLibraries(inventory, pin, () => 'b'.repeat(64)));
  assert.throws(() => nativeLibraries(inventory, {path: pin.path}, () => hash));
});
