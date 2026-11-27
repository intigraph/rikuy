import test from 'node:test';
import assert from 'node:assert/strict';
import {choiceReads} from './ask-choice-reads.mjs';

const row = {item: 'https://seeds.local/item/aegis-x', revision: 3};
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test('a re-render after one failed read issues 0 new reads for that card', async () => {
  let calls = 0;
  const reads = choiceReads(async () => {calls++; throw Error('timeout');});
  const seen = [];
  assert.deepEqual(reads.request(row, s => seen.push(s)), {state: 'loading'});
  await settle();
  assert.equal(calls, 1);
  assert.deepEqual(seen, [{state: 'failed'}]);
  // Re-render: the card starts failed and nothing is queued.
  assert.deepEqual(reads.request(row, s => seen.push(s)), {state: 'failed'});
  await settle();
  assert.equal(calls, 1);
  assert.equal(seen.length, 1);
});

test('Retry reads again; a success clears the failure', async () => {
  let calls = 0, fail = true;
  const reads = choiceReads(async () => {calls++; if (fail) throw Error('timeout'); return {options: 'A | B', rec: 'A'};});
  reads.request(row, () => {}); await settle();
  fail = false;
  const seen = [];
  assert.deepEqual(reads.retry(row, s => seen.push(s)), {state: 'loading'});
  await settle();
  assert.equal(calls, 2);
  assert.deepEqual(seen, [{state: 'read', options: 'A | B', rec: 'A'}]);
  assert.deepEqual(reads.request(row, () => {}), {state: 'loading'});
  await settle();
  assert.equal(calls, 3);
});

test('a new revision of a failed seed reads normally', async () => {
  let calls = 0;
  const reads = choiceReads(async () => {calls++; throw Error('timeout');});
  reads.request(row, () => {}); await settle();
  assert.deepEqual(reads.request({...row, revision: 4}, () => {}), {state: 'loading'});
  await settle();
  assert.equal(calls, 2);
});

test('at most two reads are in flight', async () => {
  let active = 0, peak = 0;
  const release = [];
  const reads = choiceReads(() => {active++; peak = Math.max(peak, active); return new Promise(r => release.push(() => {active--; r({});}));});
  for (let i = 0; i < 5; i++) reads.request({item: 'i' + i, revision: 1}, () => {});
  await settle();
  assert.equal(peak, 2);
  while (release.length) {release.shift()(); await settle(); await settle();}
  assert.equal(peak, 2);
  assert.equal(active, 0);
});
