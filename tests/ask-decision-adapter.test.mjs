import test from 'node:test';
import assert from 'node:assert/strict';
import {makeAskDecisionAdapter, NOT_ADMITTED} from '../web/today/ask-decision-adapter.mjs';
import {boundary, who, memory} from './deck-fixture.mjs';

const row = Object.freeze({kind: 'ask', item: boundary.itemPrefix + '1'});
const environment = {secure: true, origin: who.origin, credentials: {get: async () => {throw Error('no signing in this test');}}};
const transport = {challenge: async () => {}, commit: async () => {}, receipt: async () => {}, readback: async () => {}};
const nativeSettlement = {settle: async () => {}, reconcile: async () => {}};
const readRequest = async () => ({complete: true});
const admitted = {identity: who, environment, boundary, readRequest, transport, nativeSettlement, openStore: async () => memory()};

test('the public build (no deployment) refuses with a stated reason', async () => {
  for (const deployment of [undefined, null, {}]) {
    const deps = await makeAskDecisionAdapter(deployment)(row);
    assert.deepEqual(deps, {enabled: false, reason: NOT_ADMITTED.signer});
    assert.match(deps.reason, /^Signing not admitted on this deployment/);
  }
});

test('each missing admission refuses with its own reason and never opens a store', async () => {
  const cases = [
    [{identity: {...who, origin: 'http://sign.example.test'}}, 'signer'],
    [{identity: undefined}, 'signer'],
    [{environment: {...environment, secure: false}}, 'origin'],
    [{environment: {...environment, origin: 'https://other.example.test'}}, 'origin'],
    [{environment: {secure: true, origin: who.origin}}, 'origin'],
    [{readRequest: undefined}, 'curator'],
    [{transport: {challenge: transport.challenge}}, 'transport'],
    [{nativeSettlement: undefined}, 'settlement'],
    [{nativeSettlement: {settle: nativeSettlement.settle}}, 'settlement'],
    [{boundary: {...boundary, answerGraph: boundary.requestGraph}}, 'boundary']
  ];
  for (const [change, key] of cases) {
    let opened = 0;
    const deps = await makeAskDecisionAdapter({...admitted, ...change, openStore: async () => {opened++; return memory();}})(row);
    assert.deepEqual(deps, {enabled: false, reason: NOT_ADMITTED[key]}, key);
    assert.equal(opened, 0);
  }
});

test('an unavailable durable store and a non-Ask row refuse; there is no memory fallback', async () => {
  assert.deepEqual(await makeAskDecisionAdapter({...admitted, openStore: async () => {throw Error('blocked');}})(row), {enabled: false, reason: NOT_ADMITTED.store});
  assert.deepEqual(await makeAskDecisionAdapter(admitted)({...row, kind: 'human-gate'}), {enabled: false, reason: NOT_ADMITTED.ask});
});

test('an admitted deployment composes the Deck PendingWrite once and binds the read to the card', async () => {
  let opened = 0, seen;
  const adapter = makeAskDecisionAdapter({...admitted, readRequest: async card => {seen = card; return {complete: true};}, openStore: async () => {opened++; return memory();}});
  const a = await adapter(row), b = await adapter({...row, item: boundary.itemPrefix + '2'});
  assert.equal(a.enabled, true);
  assert.equal(opened, 1);
  assert.equal(a.writer, b.writer);
  assert.deepEqual(a.writer.identity, who);
  for (const name of ['submit', 'reconcile', 'acknowledge', 'cancelUnsigned']) assert.equal(typeof a.writer[name], 'function');
  assert.equal(a.nativeSettlement, nativeSettlement);
  await b.read();
  assert.equal(seen.item, boundary.itemPrefix + '2');
  assert.ok(Object.isFrozen(seen));
});
