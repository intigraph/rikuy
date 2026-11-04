import test from 'node:test';
import assert from 'node:assert/strict';
import {DeckReader, readerDefinitions, renderReaderQuery, readerTransport, NATIVE_PROVENANCE_NS} from '../web/deck/reader.mjs';
import {requestPublication, revisionIri} from '../web/deck/model.mjs';
import {sha256, utf8} from '../web/deck/value.mjs';
import {ask, boundary, who, evidence} from './deck-fixture.mjs';

const provenance = NATIVE_PROVENANCE_NS;
async function fixture({change = value => value, deadlineMs = 6000} = {}) {
  const definitions = readerDefinitions(boundary, provenance), ev = await evidence();
  const queryHashes = Object.fromEntries(await Promise.all(Object.entries(definitions).map(async ([k, v]) => [k, await sha256(utf8(JSON.stringify(v)))])));
  const registrations = [boundary.requestGraph, boundary.answerGraph, boundary.itemGraph].map((iri, i) => ({iri, creation: {actor: 'fixture-curator', timestamp: '2026-10-25T00:00:00Z'}, g: i + 1}));
  let active = 0, peak = 0;
  const calls = [];
  const request = async (address, options) => {
    const url = new URL(address); calls.push({path: url.pathname, body: options.body}); active++; peak = Math.max(active, peak);
    try {
      await new Promise(resolve => setImmediate(resolve));
      let role, result;
      if (url.pathname === '/graphs') { const registration = registrations.find(r => r.iri === url.searchParams.get('graph')); result = {count: 1, graphs: [{...registration, class: 'committed'}]}; }
      else if (url.pathname === '/attest/receipt') result = structuredClone(ev.response);
      else {
        assert.equal(url.pathname, '/ask');
        role = Object.keys(definitions).find(k => definitions[k].name === options.body.name);
        const rows = {
          request: [{revision: ask.revision, revisionIri: revisionIri(ask), manifest: requestPublication(ask, boundary).datums[1].o.value}],
          item: [{revision: ask.itemRevision, status: boundary.openStatus}],
          answers: [{subject: ev.row.subject, receiptIri: ev.row.receiptIri, manifest: ev.row.manifest}],
          facts: ev.readback.datums.map(d => ({s: d.s, p: d.p, kind: d.o.kind, value: String(d.o.value)})),
          links: ev.readback.attestedBy.map(({s}) => ({s}))
        }[role];
        result = {query: definitions[role].name, sparql: renderReaderQuery(definitions[role], options.body.params), rows, count: rows.length, truncated: false};
      }
      return await change(result, {role, path: url.pathname, options, calls});
    } finally {active--;}
  };
  const options = {endpoint: 'https://reader.example.test/', boundary, operator: who, provenanceNamespace: provenance, queryHashes, registrations, request, deadlineMs};
  return {reader: new DeckReader(options), options, calls, peak: () => peak, ev};
}

test('bounded source adapter reads exact requests, native receipts and complete typed facts', async () => {
  const f = await fixture(), result = await f.reader.read(ask.id);
  assert.equal(result.complete, true); assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].receipt.receipt_iri, f.ev.row.receiptIri);
  assert.equal(result.requestRow.currentRevision, ask.revision);
  assert.equal(f.peak(), 2);
  assert.equal(f.calls.filter(c => c.path === '/attest/receipt').length, 1);
  assert(f.calls.every(c => ['/graphs', '/ask', '/attest/receipt'].includes(c.path)));
});

test('empty answer population needs positive request/item controls and graph bindings', async () => {
  const f = await fixture({change: (v, {role}) => role === 'answers' ? {...v, rows: [], count: 0} : v});
  assert.deepEqual((await f.reader.read(ask.id)).rows, []);
  for (const role of ['request', 'item']) {
    const bad = await fixture({change: (v, ctx) => ctx.role === role ? {...v, rows: [], count: 0} : v});
    await assert.rejects(() => bad.reader.read(ask.id));
  }
});

test('changed query, truncation, count mismatch, duplicate and overflow refuse', async () => {
  for (const mutate of [v => ({...v, query: 'another_query'}), v => ({...v, sparql: v.sparql + ' '}), v => ({...v, truncated: true}), v => ({...v, truncated: undefined}), v => ({...v, count: 99}), v => ({...v, rows: [v.rows[0], v.rows[0]], count: 2}), v => ({...v, rows: Array.from({length: 21}, (_, i) => ({...v.rows[0], subject: `urn:overflow:${i}`})), count: 21})]) {
    const f = await fixture({change: (v, {role}) => role === 'answers' ? mutate(v) : v});
    await assert.rejects(() => f.reader.read(ask.id));
  }
});

test('graph creation/class and pinned definition hashes must match', async () => {
  for (const mutate of [g => ({...g, iri: boundary.itemGraph}), g => ({...g, class: 'overlay'}), g => ({...g, g: 0}), g => ({...g, creation: null})]) {
    const f = await fixture({change: (v, {path}) => path === '/graphs' ? {...v, graphs: [mutate(v.graphs[0])]} : v});
    await assert.rejects(() => f.reader.read(ask.id));
    assert.equal(f.calls.some(c => c.path === '/ask'), false);
  }
  const f = await fixture(); f.reader.queryHashes.answers = '0'.repeat(64);
  await assert.rejects(() => f.reader.read(ask.id)); assert.equal(f.calls.length, 0);
});

test('missing/foreign/unverified receipt and incomplete facts or links refuse', async () => {
  const mutations = [
    (v, c) => c.path === '/attest/receipt' ? {...v, found: false} : v,
    (v, c) => c.path === '/attest/receipt' ? {...v, verified: false} : v,
    (v, c) => c.path === '/attest/receipt' ? {...v, receipt: {...v.receipt, challenge: {...v.receipt.challenge, audience: 'wrong-store'}}} : v,
    (v, c) => c.role === 'facts' || c.role === 'links' ? {...v, rows: v.rows.slice(1), count: v.rows.length - 1} : v,
    (v, c) => c.role === 'facts' ? {...v, rows: v.rows.map(r => r.kind === 'int' ? {...r, kind: 'str'} : r)} : v,
    (v, c) => c.role === 'facts' ? {...v, rows: v.rows.map(r => r.kind === 'int' ? {...r, value: '9007199254740992'} : r)} : v
  ];
  for (const change of mutations) {const f = await fixture({change}); await assert.rejects(() => f.reader.read(ask.id));}
});

test('changed/closed or ambiguous item refuses before receipt calls', async () => {
  for (const row of [{revision: ask.itemRevision + 1, status: boundary.openStatus}, {revision: ask.itemRevision, status: 'urn:closed'}, {revision: String(ask.itemRevision), status: boundary.openStatus}]) {
    const f = await fixture({change: (v, {role}) => role === 'item' ? {...v, rows: [row]} : v});
    await assert.rejects(() => f.reader.read(ask.id));
    assert.equal(f.calls.some(c => c.path === '/attest/receipt'), false);
  }
});

test('request bookend refuses a changed revision even after valid answer read-back', async () => {
  let count = 0;
  const f = await fixture({change: (v, {role}) => role === 'request' && ++count === 2 ? {...v, rows: [] , count: 0} : v});
  await assert.rejects(() => f.reader.read(ask.id));
  assert.equal(f.calls.filter(c => c.body?.name === 'rikuy_deck_request_v1').length, 2);
});

test('item bookend refuses closure during an otherwise valid answer read', async () => {
  let count = 0;
  const f = await fixture({change: (v, {role}) => role === 'item' && ++count === 2 ? {...v, rows: [{revision: ask.itemRevision, status: 'urn:closed'}]} : v});
  await assert.rejects(() => f.reader.read(ask.id), /closed/);
  assert.equal(f.calls.filter(c => c.body?.name === 'rikuy_deck_item_v1').length, 2);
});

test('one overall deadline bounds even a transport that fails to settle', async () => {
  const f = await fixture({deadlineMs: 20, change: () => new Promise(() => {})});
  await assert.rejects(() => f.reader.read(ask.id), /deadline/);
  assert.equal(f.reader.busy, false);
});

test('overlapping cycles refuse and no default or insecure endpoint is selected', async () => {
  const f = await fixture(); const running = f.reader.read(ask.id);
  await assert.rejects(() => f.reader.read(ask.id), /already active/); await running;
  for (const endpoint of ['http://reader.example.test/', 'https://reader.example.test/path', 'https://name:secret@reader.example.test/']) assert.throws(() => new DeckReader({...f.options, endpoint}));
  assert.throws(() => renderReaderQuery(readerDefinitions(boundary, provenance).request, {requestId: 'https://example.test/> SELECT'}));
  assert.throws(() => readerDefinitions(boundary, 'https://example.test/lookalike/'), /vocabulary/);
});

test('streaming transport caps bytes and restricts origin, methods, redirects and credentials', async () => {
  const calls = [], ctl = new AbortController();
  const transport = readerTransport('https://reader.example.test/', async (url, options) => {calls.push({url, options}); return new Response('{"ok":true}', {headers: {'content-type': 'application/json'}});});
  assert.deepEqual(await transport('https://reader.example.test/ask', {body: {name: 'fixture'}, signal: ctl.signal, cap: 100}), {ok: true});
  assert.equal(calls[0].options.method, 'POST'); assert.equal(calls[0].options.credentials, 'omit'); assert.equal(calls[0].options.redirect, 'error');
  await assert.rejects(() => transport('https://reader.example.test/ask', {body: {}, signal: ctl.signal, cap: 2}), /byte bound/);
  for (const url of ['https://other.example.test/ask', 'https://reader.example.test/episode', 'https://reader.example.test/attest/commit', 'https://reader.example.test/ask?raw=query']) await assert.rejects(() => transport(url, {body: {}, signal: ctl.signal, cap: 100}));
  for (const response of [new Response('denied', {status: 403}), new Response('{}', {headers: {'content-type': 'text/html'}}), new Response(new Uint8Array([255]), {headers: {'content-type': 'application/json'}})]) {
    await assert.rejects(() => readerTransport('https://reader.example.test/', async () => response)('https://reader.example.test/ask', {body: {}, signal: ctl.signal, cap: 100}));
  }
});
