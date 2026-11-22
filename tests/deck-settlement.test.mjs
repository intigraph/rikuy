import test from 'node:test';
import assert from 'node:assert/strict';
import {request} from '../web/deck/model.mjs';
import {readAnswer, disposition} from '../web/deck/evidence.mjs';
import {settlementBinding, applySettlement} from '../web/deck/settlement.mjs';
import {boundary, who, ask, action, make, evidence} from './deck-fixture.mjs';
const bound = {...ask, settlement: {target: boundary.itemPrefix + 'linked-work', targetRevision: 12}};
const freshTarget = {graph: boundary.itemGraph, seed: bound.settlement.target, revision: 12};
const proposal = () => make({ask: bound, freshTarget});
async function admitted(p = proposal(), r = bound) {
  const e = await evidence(p);
  return readAnswer(e.row, e.response, r, boundary, who);
}
test('both item revisions are in the signed proposal; legacy manifest remains unchanged', async () => {
  assert.equal(make().expect.length, 5);
  assert.equal(proposal().expect.length, 6);
  assert.ok(proposal().datums.some(d => d.p.endsWith('settlementTargetRevision') && d.o.value === 12));
  assert.throws(() => make({ask: bound}));
  assert.throws(() => make({ask: bound, freshTarget: {...freshTarget, revision: 13}}));
  for (const settlement of [null, {target: ask.seed, targetRevision: 12}, {target: 'https://foreign.test/item/x', targetRevision: 12}, {target: freshTarget.seed, targetRevision: 0}]) assert.throws(() => request({...ask, settlement}, boundary));
  const answer = await admitted();
  assert.equal(disposition([answer], bound, boundary).state, 'ANSWERED');
  assert.throws(() => disposition([answer], {...bound, settlement: {...bound.settlement, targetRevision: 13}}, boundary));
  await assert.rejects(() => admitted(make()));
  const missing = proposal(); missing.expect.pop();
  await assert.rejects(() => admitted(missing));
});
test('only branded admitted choices call injected Seeds port; absent port stays disabled', async () => {
  const answer = await admitted(), binding = settlementBinding(answer, bound, boundary);
  assert.deepEqual(binding, {graph: boundary.itemGraph, ask: '1', askRevision: 7, target: 'linked-work', targetRevision: 12, receipt: answer.receiptIri});
  assert.throws(() => settlementBinding({...answer}, bound, boundary));
  assert.throws(() => settlementBinding(answer, ask, boundary));
  for (const kind of ['later', 'comment']) {
    const p = make({ask: bound, freshTarget, action: {...action, action: kind, optionLabel: null}});
    const nonchoice = await admitted(p);
    assert.throws(() => settlementBinding(nonchoice, bound, boundary));
  }
  let sends = 0, reads = 0;
  const result = {...binding, askRevision: 8, targetRevision: 13, commentIndex: 1, complete: true};
  const native = {settle: async input => {assert.deepEqual(input, binding); sends++; return result;}, reconcile: async input => {assert.deepEqual(input, binding); reads++; return result;}};
  await assert.rejects(() => applySettlement({native, answer, ask: bound, boundary}));
  assert.equal(sends, 0);
  assert.deepEqual(await applySettlement({enabled: true, native, answer, ask: bound, boundary}), result);
  await applySettlement({enabled: true, native, answer, ask: bound, boundary, recover: true});
  assert.deepEqual([sends, reads], [1, 1]);
});
test('lost response is never resent and partial or foreign read-back remains unknown', async () => {
  const answer = await admitted(); let sends = 0, reads = 0;
  const native = {settle: async () => {sends++; throw Error('lost response');}, reconcile: async b => {reads++; return {...b, askRevision: 8, targetRevision: 13, commentIndex: 1, complete: true};}};
  const input = {enabled: true, native, answer, ask: bound, boundary};
  await assert.rejects(() => applySettlement(input));
  await applySettlement({...input, recover: true});
  assert.deepEqual([sends, reads], [1, 1]);
  for (const changed of [{complete: false}, {askRevision: 7}, {targetRevision: 12}, {receipt: 'urn:foreign'}, {graph: 'urn:foreign'}, {commentIndex: 0}]) {
    native.reconcile = async b => ({...b, askRevision: 8, targetRevision: 13, commentIndex: 1, complete: true, ...changed});
    await assert.rejects(() => applySettlement({...input, recover: true}));
  }
  assert.equal(sends, 1);
});

test('admitted answer custody binds the original request even if nested proposal data is changed', async () => {
  const answer = await admitted();
  const altered = {...bound, settlement: {...bound.settlement, targetRevision: 13}};
  answer.proposal.datums.find(d => d.p.endsWith('settlementTargetRevision')).o.value = 13;
  answer.proposal.expect.find(e => e.s === bound.settlement.target).o.value = 13;
  assert.throws(() => settlementBinding(answer, altered, boundary));
  assert.throws(() => settlementBinding(answer, bound, boundary));
});
