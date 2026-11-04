import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm, chmod, readdir, readFile, writeFile, symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {publicationPlan, publicationReport, publicationReadback} from '../web/deck/curator.mjs';
import {CuratorJob} from '../scripts/deck-curator-job.mjs';
import {requestPublication, revisionIri} from '../web/deck/model.mjs';
import {ask, boundary} from './deck-fixture.mjs';

const first = {...ask, revision: 1};
const input = {boundary, next: first, previous: null, now: 1};
const row = r => ({graph: boundary.requestGraph, requestId: r.id, currentRevision: r.revision, revisionIri: revisionIri(r), manifest: requestPublication(r, boundary).datums[1].o.value, complete: true});
const report = (previous = null) => ({tx: 7, asserted: 2, retracted: previous ? 1 : 0, graphs: [{graph: boundary.requestGraph, tx: 7, asserted: 2, retracted: previous ? 1 : 0}]});
async function withJob(fn, adapters = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'rikuy-curator-')); await chmod(directory, 0o700);
  let sends = 0;
  const creation = {actor: 'fixture-curator', timestamp: '2026-10-25T00:00:00Z'};
  const settings = {directory, storeId: 'urn:uuid:fixture-store', registration: {iri: boundary.requestGraph, creation}, inspect: async () => ({storeId: 'urn:uuid:fixture-store', graph: {iri: boundary.requestGraph, g: 1, class: 'committed', creation}}), send: async () => {sends++; return report();}, readBack: async () => ({storeId: 'urn:uuid:fixture-store', requestRow: row(first)}), ...adapters};
  try {await fn({directory, settings, job: new CuratorJob(settings), sends: () => sends});} finally {await rm(directory, {recursive: true, force: true});}
}

test('first and next publication use one graph-confined conditional update', () => {
  const p = publicationPlan(input), advanced = publicationPlan({...input, next: {...first, revision: 2, title: 'Recurated'}, previous: first});
  assert(p.query.startsWith('DELETE { GRAPH <' + boundary.requestGraph + '> {  } }'));
  assert(p.query.includes('sameTerm(?otherItemRevision'));
  assert(p.query.includes('sameTerm(?otherStatus'));
  assert(p.query.includes('?occupiedPredicate ?occupiedValue'));
  assert(advanced.query.includes('sameTerm(?otherHead'));
  assert(advanced.query.includes('sameTerm(?otherManifest'));
  assert(!p.query.includes(boundary.answerGraph));
  assert.equal(publicationReport(report(), p), 'CHANGED');
  assert.equal(publicationReport(report(first), advanced), 'CHANGED');
  assert.deepEqual(publicationReadback(row(first), p), first);
});

test('foreign, skipped, inexact, expired and reused revisions refuse before a send', () => {
  for (const delta of [{next: {...first, revision: 2}}, {next: {...first, expiresAt: 1}}, {next: {...first, revision: 3}, previous: first}, {next: {...first, revision: 2}, previous: {...first, id: 'urn:other'}}, {next: {...first, revision: 2}, previous: {...first, seed: boundary.itemPrefix + 'other'}}, {now: NaN}]) assert.throws(() => publicationPlan({...input, ...delta}));
});

test('report must bind exact graph, single transaction and change counts', () => {
  const p = publicationPlan(input);
  assert.equal(publicationReport({tx: null, asserted: 0, retracted: 0, graphs: []}, p), 'NO_CHANGE');
  for (const mutate of [r => ({...r, asserted: 1}), r => ({...r, tx: null}), r => ({...r, graphs: []}), r => ({...r, graphs: [{...r.graphs[0], graph: boundary.answerGraph}]}), r => ({...r, graphs: [{...r.graphs[0], tx: 8}]}), r => ({...r, unknown: true})]) assert.throws(() => publicationReport(mutate(report()), p));
  for (const r of [{...first, title: 'Changed'}, {...first, revision: 2}]) assert.throws(() => publicationReadback(row(r), p));
});

test('durable UNKNOWN is synced before one send and retained across new job instances', async () => {
  await withJob(async ({directory, settings, sends}) => {
    const original = settings.send;
    settings.send = async query => {
      const files = await readdir(directory); assert.equal(files.length, 1);
      const retained = JSON.parse(await readFile(join(directory, files[0]), 'utf8'));
      assert.equal(retained.state, 'UNKNOWN'); assert.equal(retained.plan.query, query);
      return original(query);
    };
    assert.deepEqual(await new CuratorJob(settings).publish(input), {state: 'CONFIRMED', sent: true, transaction: 7});
    assert.deepEqual(await new CuratorJob(settings).publish(input), {state: 'CONFIRMED', sent: false, transaction: null});
    assert.equal(sends(), 1);
    await assert.rejects(() => new CuratorJob(settings).publish({...input, next: {...first, title: 'Conflicting payload'}}));
    assert.equal(sends(), 1);
  });
});

test('lost response and read timeout recover by reads, never a second send', async () => {
  let writes = 0, available = false;
  await withJob(async ({settings}) => {
    const job = new CuratorJob(settings);
    assert.deepEqual(await job.publish(input), {state: 'UNKNOWN', sent: true, transaction: null});
    assert.deepEqual(await new CuratorJob(settings).reconcile(input), {state: 'UNKNOWN', sent: false, transaction: null});
    available = true;
    assert.deepEqual(await new CuratorJob(settings).reconcile({...input, now: first.expiresAt + 1}), {state: 'CONFIRMED', sent: false, transaction: null});
    assert.equal(writes, 1);
  }, {send: async () => {writes++; throw Error('Lost reply');}, readBack: async () => {if (!available) throw Error('Read timeout'); return {storeId: 'urn:uuid:fixture-store', requestRow: row(first)};}});
});

test('concurrent publishers produce exactly one send', async () => {
  await withJob(async ({settings, sends}) => {
    await Promise.all(Array.from({length: 5}, async () => {
      try {await new CuratorJob(settings).publish(input);} catch {} // A partially written record stays UNKNOWN.
    }));
    assert.equal(sends(), 1);
    assert.equal((await new CuratorJob(settings).reconcile(input)).state, 'CONFIRMED');
  });
});

test('zero-change, malformed reports, incomplete and foreign-store evidence do not authorize resend', async () => {
  for (const adapters of [{send: async () => ({tx: null, asserted: 0, retracted: 0, graphs: []}), readBack: async () => {throw Error('No matching row');}}, {send: async () => ({tx: 8})}, {readBack: async () => ({storeId: 'urn:wrong', requestRow: row(first)})}, {readBack: async () => ({storeId: 'urn:uuid:fixture-store', requestRow: {...row(first), complete: false}})}]) {
    await withJob(async ({job}) => {assert.equal((await job.publish(input)).state, 'UNKNOWN'); assert.equal((await job.reconcile(input)).sent, false);}, adapters);
  }
});

test('unsafe custody modes, symlinks, corrupted and absent retained records refuse', async () => {
  await withJob(async ({directory, settings, job, sends}) => {
    await assert.rejects(() => job.reconcile(input)); assert.equal(sends(), 0);
    await chmod(directory, 0o755); await assert.rejects(() => job.publish(input)); assert.equal(sends(), 0);
    await chmod(directory, 0o700); await job.publish(input);
    const path = join(directory, (await readdir(directory))[0]); await writeFile(path, '{broken');
    await assert.rejects(() => new CuratorJob(settings).publish(input)); assert.equal(sends(), 1);
    await rm(path); await symlink(join(directory, 'missing'), path);
    await assert.rejects(() => job.publish(input)); assert.equal(sends(), 1);
  });
});

test('native target inspection requires retained creation, committed graph and store identity', async () => {
  for (const mutate of [v => ({...v, storeId: 'urn:other'}), v => ({...v, graph: null}), v => ({...v, graph: {...v.graph, g: 0}}), v => ({...v, graph: {...v.graph, class: 'overlay'}}), v => ({...v, graph: {...v.graph, iri: boundary.answerGraph}}), v => ({...v, graph: {...v.graph, creation: {...v.graph.creation, timestamp: 'replaced'}}})]) {
    await withJob(async ({settings, sends}) => {const inspect = settings.inspect; settings.inspect = async (...args) => mutate(await inspect(...args)); await assert.rejects(() => new CuratorJob(settings).publish(input)); assert.equal(sends(), 0);});
  }
});

test('replacing the retained graph pin cannot reuse an existing custody slot', async () => {
  await withJob(async ({settings, job, sends}) => {
    await job.publish(input);
    const registration = {...settings.registration, creation: {...settings.registration.creation, timestamp: '2026-10-26T00:00:00Z'}};
    const changed = new CuratorJob({...settings, registration, inspect: async () => ({storeId: settings.storeId, graph: {iri: registration.iri, g: 2, class: 'committed', creation: registration.creation}})});
    await assert.rejects(() => changed.reconcile(input)); assert.equal(sends(), 1);
  });
});
