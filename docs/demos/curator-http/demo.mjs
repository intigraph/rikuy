// Synthetic library demonstration: no socket or installed credential is used.
import assert from 'node:assert/strict';
import {mkdtemp, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {curatorAdapters} from '../../../scripts/deck-curator-http.mjs';
import {CuratorJob} from '../../../scripts/deck-curator-job.mjs';
import {readerDefinitions, renderReaderQuery, NATIVE_PROVENANCE_NS} from '../../../web/deck/reader.mjs';
import {requestPublication, revisionIri} from '../../../web/deck/model.mjs';
import {sha256, utf8} from '../../../web/deck/value.mjs';
import {boundary, ask} from '../../../tests/deck-fixture.mjs';

const next = {...ask, revision: 1};
const definition = readerDefinitions(boundary, NATIVE_PROVENANCE_NS).request;
const registration = {iri: boundary.requestGraph, creation: {actor: 'synthetic', timestamp: '2026-11-08T00:00:00Z'}};
const directory = await mkdtemp(join(tmpdir(), 'curator-http-demo-')); await chmod(directory, 0o700);
let writes = 0, foreign = false, committed = false;
const json = body => new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}});
const fetcher = async (url, options) => {
  const path = new URL(url).pathname;
  if (path === '/update') {assert(options.headers.Authorization); writes++; committed = true; throw Error('Synthetic lost reply');}
  assert(!options.headers.Authorization);
  if (path === '/watermark') return json({store_id: foreign ? 'urn:fixture:foreign' : 'urn:fixture:store'});
  if (path === '/graphs') return json({count: 1, graphs: [{...registration, g: 1, class: 'committed'}]});
  assert.equal(path, '/ask'); assert(committed);
  return json({query: definition.name, sparql: renderReaderQuery(definition, {requestId: next.id}), count: 1, truncated: false, rows: [{revision: 1, revisionIri: revisionIri(next), manifest: requestPublication(next, boundary).datums[1].o.value}]});
};
try {
  const adapters = await curatorAdapters({endpoint: 'https://synthetic.example.test/', storeId: 'urn:fixture:store', generation: 1, registration, boundary, definitionHash: await sha256(utf8(JSON.stringify(definition))), bearer: 'synthetic-test-only', fetcher});
  const settings = {directory, storeId: 'urn:fixture:store', registration, ...adapters};
  const input = {boundary, next, previous: null, now: 1};
  const first = await new CuratorJob(settings).publish(input);
  console.log('Lost reply:', JSON.stringify(first), 'writes=' + writes);
  assert.equal(first.state, 'UNKNOWN');
  const recovered = await new CuratorJob(settings).reconcile(input);
  console.log('New job read-only recovery:', JSON.stringify(recovered), 'writes=' + writes);
  assert.equal(recovered.state, 'CONFIRMED'); assert.equal(writes, 1);
  foreign = true;
  await assert.rejects(() => new CuratorJob(settings).reconcile(input));
  console.log('Foreign store: REFUSED; writes=' + writes);
  foreign = false;
  assert.equal((await new CuratorJob(settings).reconcile(input)).state, 'CONFIRMED');
  console.log('Restored store positive control: CONFIRMED; writes=' + writes);
  assert.equal(writes, 1);
} finally {await rm(directory, {recursive: true, force: true});}
