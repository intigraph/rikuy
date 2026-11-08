import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, chmod, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {curatorAdapters} from '../scripts/deck-curator-http.mjs';
import {CuratorJob} from '../scripts/deck-curator-job.mjs';
import {readerDefinitions, NATIVE_PROVENANCE_NS, renderReaderQuery} from '../web/deck/reader.mjs';
import {sha256, utf8} from '../web/deck/value.mjs';
import {requestPublication, revisionIri} from '../web/deck/model.mjs';
import {boundary, ask} from './deck-fixture.mjs';

const definition = readerDefinitions(boundary, NATIVE_PROVENANCE_NS).request;
const registration = {iri: boundary.requestGraph, creation: {actor: 'synthetic', timestamp: '2026-11-08T00:00:00Z'}};
async function fixture(change = {}) {
  const calls = [];
  const settings = {endpoint: 'https://synthetic.example.test/', storeId: 'urn:fixture:store', generation: 1, registration, definitionHash: await sha256(utf8(JSON.stringify(definition))), boundary, bearer: 'synthetic-test-only', fetcher: async (url, options) => {
    calls.push({url, options});
    const path = new URL(url).pathname;
    const body = path === '/watermark' ? {store_id: 'urn:fixture:store'} : path === '/graphs' ? {count: 1, graphs: [{...registration, g: 1, class: 'committed'}]} : path === '/update' ? {tx: 1} : {query: definition.name, sparql: renderReaderQuery(definition, {requestId: 'urn:fixture:request'}), count: 1, truncated: false, rows: [{revision: 1, revisionIri: 'urn:fixture:request#revision-1', manifest: '{}'}]};
    return new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}});
  }, ...change};
  return {settings, calls, adapters: await curatorAdapters(settings)};
}

test('only explicit pinned routes run; bearer is sent only to update', async () => {
  const {adapters, calls} = await fixture();
  assert.equal((await adapters.inspect(boundary.requestGraph)).storeId, 'urn:fixture:store');
  assert.equal((await adapters.readBack('urn:fixture:request')).requestRow.currentRevision, 1);
  assert.deepEqual(await adapters.send('DELETE {} INSERT {} WHERE {}'), {tx: 1});
  assert.equal(calls.filter(c => c.options.headers.Authorization).length, 1);
  assert.equal(new URL(calls.at(-1).url).pathname, '/update');
  assert.equal(calls.at(-1).options.headers.Authorization, 'Bearer synthetic-test-only');
  assert.equal(calls.at(-1).options.redirect, 'error');
  assert.equal(calls.filter(c => new URL(c.url).pathname === '/ask').length, 1);
  assert(!calls.some(c => new URL(c.url).pathname === '/query'));
});

test('missing or changed pins refuse before any request', async () => {
  for (const change of [{endpoint: 'http://synthetic.example.test/'}, {bearer: ''}, {generation: undefined}, {definitionHash: '0'.repeat(64)}, {registration: {...registration, iri: 'urn:foreign'}}]) {
    let calls = 0;
    await assert.rejects(() => fixture({...change, fetcher: async () => {calls++; throw Error('must not call');}}));
    assert.equal(calls, 0);
  }
});

test('foreign graph, store or replaced graph never produces usable inspection', async () => {
  const normal = await fixture();
  await assert.rejects(() => normal.adapters.inspect('urn:foreign'));
  assert.equal(normal.calls.length, 0);
  const replaced = await fixture({generation: 2});
  await assert.rejects(() => replaced.adapters.inspect(boundary.requestGraph));
  for (const body of [{store_id: 'urn:foreign'}, {count: 0, graphs: []}]) {
    const {adapters} = await fixture({fetcher: async () => new Response(JSON.stringify(body), {headers: {'content-type': 'application/json'}})});
    await assert.rejects(() => adapters.inspect(boundary.requestGraph));
  }
});

test('HTTP errors, overflow, wrong content type and stalled transport remain UNKNOWN', async () => {
  for (const fetcher of [async () => new Response('{}', {status: 403}), async () => new Response('x'.repeat(262145), {headers: {'content-type': 'application/json'}}), async () => new Response('{}'), async () => new Promise(() => {})]) {
    const {adapters} = await fixture({fetcher, deadlineMs: 20});
    await assert.rejects(() => adapters.send('DELETE {} INSERT {} WHERE {}'));
  }
});

test('actual custody job loses an HTTP reply then reconciles without a second write', async () => {
  const f = await fixture(), directory = await mkdtemp(join(tmpdir(), 'curator-http-'));
  await chmod(directory, 0o700);
  const next = {...ask, revision: 1}; let writes = 0;
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname;
    if (path === '/update') {writes++; throw Error('Synthetic lost response after commit');}
    if (path === '/ask') {
      const params = {requestId: next.id};
      return new Response(JSON.stringify({query: definition.name, sparql: renderReaderQuery(definition, params), count: 1, truncated: false, rows: [{revision: 1, revisionIri: revisionIri(next), manifest: requestPublication(next, boundary).datums[1].o.value}]}), {headers: {'content-type': 'application/json'}});
    }
    return f.settings.fetcher(url, options);
  };
  try {
    const adapters = await curatorAdapters({...f.settings, fetcher});
    const settings = {directory, storeId: f.settings.storeId, registration, ...adapters};
    const input = {boundary, next, previous: null, now: 1};
    assert.equal((await new CuratorJob(settings).publish(input)).state, 'UNKNOWN');
    assert.deepEqual(await new CuratorJob(settings).reconcile(input), {state: 'CONFIRMED', sent: false, transaction: null});
    assert.equal(writes, 1);
  } finally {await rm(directory, {recursive: true, force: true});}
});

test('changed named query and saturated population refuse readback', async () => {
  const f = await fixture();
  for (const delta of [{sparql: 'SELECT ?forged WHERE {}'}, {count: 3, rows: [{}, {}, {}]}]) {
    const fetcher = async (url, options) => {
      const response = await f.settings.fetcher(url, options);
      if (new URL(url).pathname !== '/ask') return response;
      return new Response(JSON.stringify({...await response.json(), ...delta}), {headers: {'content-type': 'application/json'}});
    };
    const adapters = await curatorAdapters({...f.settings, fetcher});
    await assert.rejects(() => adapters.readBack('urn:fixture:request'));
  }
});
