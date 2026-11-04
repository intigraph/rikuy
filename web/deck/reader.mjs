import {Unknown, NS, exact, iri, integer, text, utf8, sha256} from './value.mjs';
import {scope, readRequest, decodeProposal} from './model.mjs';
import {identity, readAnswer, receiptProof, readbackProof} from './evidence.mjs';

// Native provenance vocabulary identifier, fixed by the primitive's contract.
// A configurable lookalike would turn existing answers into a false empty set.
export const NATIVE_PROVENANCE_NS = 'http://aegis.gastown.local/ontology/';

// Source definitions only. An operator must separately register these exact
// templates and admit their cost on the served store. No registration writer.
export function readerDefinitions(boundary, provenanceNamespace) {
  const b = scope(boundary), q = iri(provenanceNamespace);
  if (q !== NATIVE_PROVENANCE_NS) throw new Unknown('Unknown native provenance vocabulary');
  const by = `<${q}attestedBy>`, graph = `<${b.answerGraph}>`;
  const define = (name, template, params, cap) => ({name: `rikuy_deck_${name}_v1`, template, params, cap});
  return {
    request: define('request', `SELECT ?revision ?revisionIri ?manifest WHERE { GRAPH <${b.requestGraph}> { <{requestId}> <${NS}currentRevision> ?revision . ?revisionIri <${NS}requestManifest> ?manifest . FILTER(?revisionIri = IRI(CONCAT(STR(<{requestId}>), "#revision-", STR(?revision)))) } } LIMIT 3`, {requestId: 'iri'}, 3),
    item: define('item', `SELECT ?revision ?status WHERE { GRAPH <${b.itemGraph}> { <{seed}> <${b.revisionPredicate}> ?revision ; <${b.statusPredicate}> ?status } } LIMIT 3`, {seed: 'iri'}, 3),
    answers: define('answers', `SELECT ?subject ?receiptIri ?manifest WHERE { GRAPH ${graph} { ?subject <${NS}request> <{requestId}> ; <${NS}revision> {revision} ; ${by} ?receiptIri . ?receiptIri <${q}attestProposal> ?manifest } } LIMIT 21`, {requestId: 'iri', revision: 'int'}, 21),
    facts: define('facts', `SELECT ?s ?p ?kind ?value WHERE { GRAPH ${graph} { ?s ${by} <{receiptIri}> ; ?p ?o . FILTER(?p != ${by}) BIND(STR(?o) AS ?value) BIND(IF(isIRI(?o), "iri", IF(datatype(?o) = <http://www.w3.org/2001/XMLSchema#integer>, "int", IF(datatype(?o) = <http://www.w3.org/2001/XMLSchema#string>, "str", "unsupported"))) AS ?kind) } } LIMIT 65`, {receiptIri: 'iri'}, 65),
    links: define('links', `SELECT ?s WHERE { GRAPH ${graph} { ?s ${by} <{receiptIri}> } } LIMIT 65`, {receiptIri: 'iri'}, 65)
  };
}

export function renderReaderQuery(def, params) {
  exact(params, Object.keys(def.params));
  let query = def.template;
  for (const [key, kind] of Object.entries(def.params)) {
    const value = kind === 'iri' ? iri(params[key]) : integer(params[key]);
    query = query.replaceAll(`{${key}}`, String(value));
  }
  return query;
}

export function readerRows(response, def, params) {
  if (!response || response.query !== def.name || response.sparql !== renderReaderQuery(def, params) || response.truncated !== false || !Array.isArray(response.rows) || response.count !== response.rows.length || response.rows.length >= def.cap || response.error) throw new Unknown('Query identity or bounded population UNKNOWN');
  const seen = new Set();
  for (const row of response.rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Unknown('Malformed query row');
    const key = JSON.stringify(Object.keys(row).sort().map(k => [k, row[k]]));
    if (seen.has(key)) throw new Unknown('Duplicate query row');
    seen.add(key);
  }
  return response.rows;
}

function creationBinding(response, expected) {
  if (response?.count !== 1 || response.graphs?.length !== 1) throw new Unknown('Exact registered graph required');
  const graph = response.graphs[0];
  if (graph.iri !== expected.iri || graph.class !== 'committed' || !Number.isSafeInteger(graph.g) || graph.g <= 0 || !expected.creation || JSON.stringify(graph.creation) !== JSON.stringify(expected.creation)) throw new Unknown('Graph creation identity changed');
}

export function readerTransport(endpoint, fetcher = globalThis.fetch) {
  const origin = new URL(endpoint);
  if (origin.protocol !== 'https:' || origin.origin + '/' !== endpoint || origin.username || origin.password || typeof fetcher !== 'function') throw new Unknown('Explicit HTTPS reader origin required');
  return async (address, {body, signal, cap}) => {
    const url = new URL(address);
    if (url.origin !== origin.origin || !['/graphs', '/ask', '/attest/receipt'].includes(url.pathname) || !Number.isSafeInteger(cap) || cap < 1 || cap > 262144) throw new Unknown('Reader route or byte bound refused');
    if (url.pathname === '/graphs' ? body !== undefined || [...url.searchParams.keys()].join(',') !== 'graph' : url.search !== '' || body === undefined) throw new Unknown('Reader route parameters refused');
    const response = await fetcher(url.href, {method: body === undefined ? 'GET' : 'POST', body: body === undefined ? undefined : JSON.stringify(body), signal, redirect: 'error', credentials: 'omit', cache: 'no-store', headers: {'Content-Type': 'application/json', 'X-Quipu-Client': 'daily-brief'}});
    if (!response.ok || response.redirected || response.url && new URL(response.url).origin !== origin.origin || !response.body || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Unknown('Reader HTTP response unavailable');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) {
        if (signal.aborted) throw new Unknown('Reader response aborted');
        const {done, value} = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > cap) throw new Unknown('Reader response exceeds byte bound');
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
      return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
    } finally {await reader.cancel().catch(() => {}); reader.releaseLock();}
  };
}

// The injected transport accepts (url, {body, signal, cap}), enforces the byte
// cap while streaming and propagates abort. This adapter also bounds decoded
// replies, and refuses overlapping cycles. It selects no default endpoint.
export class DeckReader {
  constructor({endpoint, boundary, operator, provenanceNamespace, queryHashes, registrations, request, deadlineMs = 6000}) {
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.origin + '/' !== endpoint || url.username || url.password || typeof request !== 'function' || !Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 6000) throw new Unknown('Explicit bounded HTTPS reader required');
    this.endpoint = endpoint; this.boundary = scope(boundary); this.operator = identity(operator);
    this.definitions = readerDefinitions(this.boundary, provenanceNamespace);
    exact(queryHashes, Object.keys(this.definitions));
    this.queryHashes = structuredClone(queryHashes); this.registrations = structuredClone(registrations);
    this.request = request; this.deadlineMs = deadlineMs; this.busy = false;
  }
  async read(requestId) {
    iri(requestId);
    if (this.busy) throw new Unknown('Reader cycle already active');
    this.busy = true;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), this.deadlineMs);
    let aborted;
    const abort = new Promise((_, reject) => {aborted = () => reject(new Unknown('Reader cycle deadline exceeded')); ctl.signal.addEventListener('abort', aborted, {once: true});});
    const call = async (path, body, cap = 262144) => {
      if (ctl.signal.aborted) throw new Unknown('Reader cycle deadline exceeded');
      const value = await Promise.race([this.request(new URL(path, this.endpoint).href, {body, signal: ctl.signal, cap}), abort]);
      if (utf8(JSON.stringify(value)).length > cap || ctl.signal.aborted) throw new Unknown('Reader response exceeds bound');
      return value;
    };
    const ask = async (role, params) => {
      const def = this.definitions[role];
      return readerRows(await call('/ask', {name: def.name, params}), def, params);
    };
    const requestRow = async () => {
      const rows = await ask('request', {requestId});
      if (rows.length !== 1) throw new Unknown('Request revision missing or ambiguous');
      exact(rows[0], ['revision', 'revisionIri', 'manifest']);
      const row = {graph: this.boundary.requestGraph, requestId, currentRevision: rows[0].revision, revisionIri: rows[0].revisionIri, manifest: rows[0].manifest, complete: true};
      readRequest(row, this.boundary); return row;
    };
    const itemRow = async askValue => {
      const items = await ask('item', {seed: askValue.seed});
      if (items.length !== 1) throw new Unknown('Item revision/status ambiguous');
      exact(items[0], ['revision', 'status']); integer(items[0].revision); iri(items[0].status);
      if (items[0].revision !== askValue.itemRevision || items[0].status !== this.boundary.openStatus) throw new Unknown('Changed or closed item');
      return {graph: this.boundary.itemGraph, seed: askValue.seed, ...items[0]};
    };
    try {
      for (const [role, def] of Object.entries(this.definitions)) {
        if (this.queryHashes[role] !== await sha256(utf8(JSON.stringify(def)))) throw new Unknown('Unadmitted reader definition');
      }
      const graphs = [this.boundary.requestGraph, this.boundary.answerGraph, this.boundary.itemGraph];
      if (!Array.isArray(this.registrations) || this.registrations.length !== 3 || new Set(this.registrations.map(r => r.iri)).size !== 3) throw new Unknown('Three graph creation receipts required');
      for (const graph of graphs) {
        const expected = this.registrations.find(r => r.iri === graph);
        if (!expected) throw new Unknown('Graph registration receipt missing');
        creationBinding(await call('/graphs?graph=' + encodeURIComponent(graph)), expected);
      }
      const first = await requestRow(), askValue = readRequest(first, this.boundary);
      const freshItem = await itemRow(askValue);
      const candidates = await ask('answers', {requestId, revision: askValue.revision});
      const rows = [], operations = new Set();
      // At most two requests in flight; no fanout of one request per answer.
      for (const candidate of candidates) {
        exact(candidate, ['subject', 'receiptIri', 'manifest']);
        if (!/^urn:quipu:attest:[0-9a-f]{64}$/.test(candidate.receiptIri) || operations.has(candidate.subject)) throw new Unknown('Ambiguous answer provenance');
        operations.add(candidate.subject);
        const row = {graph: this.boundary.answerGraph, ...candidate};
        const receipt = await call('/attest/receipt', {nonce: candidate.receiptIri.slice('urn:quipu:attest:'.length)}, 131072);
        await readAnswer(row, receipt, askValue, this.boundary, this.operator);
        const proof = await receiptProof(receipt, decodeProposal(candidate.manifest), this.operator, candidate.receiptIri.slice('urn:quipu:attest:'.length));
        const [facts, links] = await Promise.all([ask('facts', {receiptIri: candidate.receiptIri}), ask('links', {receiptIri: candidate.receiptIri})]);
        const datums = facts.map(f => {
          exact(f, ['s', 'p', 'kind', 'value']);
          text(f.value, 32768, true);
          if (!['iri', 'str', 'int'].includes(f.kind) || f.kind === 'int' && !/^-?(0|[1-9][0-9]*)$/.test(f.value)) throw new Unknown('Unsupported read-back term');
          return {s: f.s, p: f.p, o: {kind: f.kind, value: f.kind === 'int' ? Number(f.value) : f.value}};
        });
        const attestedBy = links.map(link => {exact(link, ['s']); return {s: link.s, receiptIri: candidate.receiptIri};});
        readbackProof({graph: this.boundary.answerGraph, datums, attestedBy, complete: true}, proof);
        rows.push({row, receipt});
      }
      const last = await requestRow();
      if (JSON.stringify(first) !== JSON.stringify(last)) throw new Unknown('Request changed during read');
      if (JSON.stringify(freshItem) !== JSON.stringify(await itemRow(askValue))) throw new Unknown('Item changed during read');
      return {complete: true, requestRow: last, freshItem, rows};
    } finally {
      clearTimeout(timer); ctl.signal.removeEventListener('abort', aborted); ctl.abort(); this.busy = false;
    }
  }
}
