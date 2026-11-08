// Server-side source adapters only. Importing selects no deployment, reads no
// credential and performs no request. Server-enforced writer scope is required;
// these client pins are not a substitute for that separate admission.
import {Unknown, iri, text, integer, sha256, utf8, exact} from '../web/deck/value.mjs';
import {scope} from '../web/deck/model.mjs';
import {readerDefinitions, readerRows, NATIVE_PROVENANCE_NS} from '../web/deck/reader.mjs';

export async function curatorAdapters({endpoint, storeId, generation, registration, boundary, definitionHash, bearer, fetcher = globalThis.fetch, deadlineMs = 3000}) {
  const url = new URL(endpoint), b = scope(boundary);
  if (url.protocol !== 'https:' || url.origin + '/' !== endpoint || url.username || url.password || typeof fetcher !== 'function' || !Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 6000) throw new Unknown('Explicit bounded HTTPS curator required');
  iri(storeId); integer(generation); text(bearer, 8192);
  if (/\s/.test(bearer)) throw new Unknown('Invalid credential encoding');
  exact(registration, ['iri', 'creation']); exact(registration.creation, ['actor', 'timestamp']);
  if (registration.iri !== b.requestGraph) throw new Unknown('Foreign configured graph');
  text(registration.creation.timestamp);
  if (registration.creation.actor !== null) text(registration.creation.actor);
  const pin = structuredClone(registration);
  const def = readerDefinitions(b, NATIVE_PROVENANCE_NS).request;
  if (definitionHash !== await sha256(utf8(JSON.stringify(def)))) throw new Unknown('Unadmitted request definition');

  // One deadline covers the complete adapter operation, including all reads
  // and a non-cooperating injected transport. There is never a write retry.
  async function operation(run) {
    const controller = new AbortController();
    let rejectDeadline;
    const expired = new Promise((_, reject) => {rejectDeadline = reject;});
    const timer = setTimeout(() => {controller.abort(); rejectDeadline(new Unknown('Curator operation deadline exceeded'));}, deadlineMs);
    const call = async (path, body, write = false) => {
      if (controller.signal.aborted) throw new Unknown('Curator operation expired');
      const headers = {'Content-Type': write ? 'application/sparql-update' : 'application/json', 'X-Quipu-Client': 'daily-brief'};
      if (write) headers.Authorization = `Bearer ${bearer}`;
      const response = await fetcher(new URL(path, endpoint).href, {method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : write ? body : JSON.stringify(body), signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store'});
      if (!response.ok || response.redirected || response.url && new URL(response.url).origin !== url.origin || !response.body || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new Unknown('Curator response unavailable');
      const reader = response.body.getReader(), chunks = []; let size = 0;
      try {
        while (true) {
          if (controller.signal.aborted) throw new Unknown('Curator operation expired');
          const {done, value} = await reader.read(); if (done) break;
          size += value.byteLength;
          if (size > 262144) throw new Unknown('Curator response exceeds bound');
          chunks.push(value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
        return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
      } finally {await reader.cancel().catch(() => {}); reader.releaseLock();}
    };
    try {return await Promise.race([run(call), expired]);}
    // Errors deliberately never include bearer, response content or request.
    catch {throw new Unknown('Curator transport or pinned evidence UNKNOWN');}
    finally {clearTimeout(timer); controller.abort();}
  }
  async function inspectWith(call) {
    const identity = await call('/watermark');
    if (identity.store_id !== storeId) throw new Unknown('Foreign store');
    const metadata = await call('/graphs?graph=' + encodeURIComponent(pin.iri));
    if (metadata.count !== 1 || metadata.graphs?.length !== 1) throw new Unknown('Exact graph missing');
    const graph = metadata.graphs[0]; integer(graph.g);
    if (graph.g !== generation || graph.iri !== pin.iri || graph.class !== 'committed' || JSON.stringify(graph.creation) !== JSON.stringify(pin.creation)) throw new Unknown('Graph generation or creation changed');
    return {storeId, graph};
  }
  return Object.freeze({
    inspect: graph => {
      if (graph !== pin.iri) return Promise.reject(new Unknown('Foreign graph'));
      return operation(inspectWith);
    },
    send: query => {
      text(query, 131072, true);
      return operation(call => call('/update', query, true));
    },
    readBack: requestId => {
      iri(requestId);
      return operation(async call => {
        const before = await inspectWith(call);
        const rows = readerRows(await call('/ask', {name: def.name, params: {requestId}}), def, {requestId});
        if (rows.length !== 1) throw new Unknown('Request missing or ambiguous');
        exact(rows[0], ['revision', 'revisionIri', 'manifest']); integer(rows[0].revision); iri(rows[0].revisionIri); text(rows[0].manifest, 65536, true);
        const after = await inspectWith(call);
        if (JSON.stringify(before) !== JSON.stringify(after)) throw new Unknown('Target changed during readback');
        return {storeId, requestRow: {graph: pin.iri, requestId, currentRevision: rows[0].revision, revisionIri: rows[0].revisionIri, manifest: rows[0].manifest, complete: true}};
      });
    }
  });
}
