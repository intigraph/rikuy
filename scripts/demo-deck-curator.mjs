// Focused library demo with synthetic adapters, not a native or served proof.
import assert from 'node:assert/strict';
import {mkdtemp, chmod, rm, readdir, readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync, execFileSync} from 'node:child_process';
import {CuratorJob} from './deck-curator-job.mjs';
import {requestPublication, revisionIri} from '../web/deck/model.mjs';
import {ask, boundary} from '../tests/deck-fixture.mjs';

const directory = await mkdtemp(join(tmpdir(), 'rikuy-curator-demo-')); await chmod(directory, 0o700);
const next = {...ask, revision: 1}, input = {boundary, next, previous: null, now: 1};
const storeId = 'urn:uuid:synthetic-demo-store';
const creation = {actor: 'synthetic-curator', timestamp: '2026-10-25T00:00:00Z'};
let sends = 0, present = false;
const options = {directory, storeId, registration: {iri: boundary.requestGraph, creation}, inspect: async () => ({storeId, graph: {iri: boundary.requestGraph, g: 1, class: 'committed', creation}}), send: async () => {
  const file = (await readdir(directory))[0];
  const saved = JSON.parse(await readFile(join(directory, file), 'utf8'));
  console.log('Before send, durable custody:', saved.state); assert.equal(saved.state, 'UNKNOWN');
  sends++; present = true; throw Error('Synthetic lost reply after fixture mutation');
}, readBack: async () => {
  assert(present); return {storeId, requestRow: {graph: boundary.requestGraph, requestId: next.id, currentRevision: 1, revisionIri: revisionIri(next), manifest: requestPublication(next, boundary).datums[1].o.value, complete: true}};
}};
try {
  const base = 'b290c515bfb3cda35eba38af3533c6c9200a0003';
  assert.equal(spawnSync('git', ['cat-file', '-e', base + ':web/deck/model.mjs'], {stdio: 'ignore'}).status, 0);
  const before = spawnSync('git', ['cat-file', '-e', base + ':scripts/deck-curator-job.mjs'], {stdio: 'ignore'}).status;
  assert.equal(before, 128);
  console.log('Base', base, ': request fact builder exists; publication job absent.');
  console.log('Demonstrated source HEAD:', execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim());
  console.log('Target: source library, synthetic transport and reader; no service or credential.');
  console.log('Trigger: first publication; transport loses its reply after the fixture changes.');
  const lost = await new CuratorJob(options).publish(input); console.log('First call:', JSON.stringify(lost)); assert.equal(lost.state, 'UNKNOWN');
  console.log('Restart with the SAME durable directory; reconcile by reading.');
  const recovered = await new CuratorJob(options).reconcile(input); console.log('Recovery:', JSON.stringify(recovered)); assert.equal(recovered.state, 'CONFIRMED'); assert.equal(recovered.sent, false);
  console.log('Send count:', sends); assert.equal(sends, 1);
  let refused = false;
  try {await new CuratorJob(options).publish({...input, next: {...next, title: 'Changed payload'}});} catch {refused = true;}
  console.log('Changed payload in same revision refused:', refused); assert(refused); assert.equal(sends, 1);
  console.log('Observed: UNKNOWN -> CONFIRMED by read-back; one send retained.');
} finally {await rm(directory, {recursive: true, force: true});}
