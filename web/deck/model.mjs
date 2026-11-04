import {Unknown, NS, RDF_TYPE, exact, text, integer, iri, typed, str, ref, int, hexId, utf8} from './value.mjs';
export function scope(value) {
  exact(value, ['requestGraph', 'answerGraph', 'itemGraph', 'itemPrefix', 'revisionPredicate', 'statusPredicate', 'openStatus']);
  const result = Object.fromEntries(Object.entries(value).map(([k, v]) => [k, iri(v)]));
  if (!result.itemPrefix.endsWith('/') || new Set([result.requestGraph, result.answerGraph, result.itemGraph]).size !== 3 || result.revisionPredicate === result.statusPredicate) throw new Unknown('Distinct graph and item slots required');
  return result;
}
export function request(value, boundary) {
  scope(boundary);
  exact(value, ['id', 'revision', 'seed', 'itemRevision', 'title', 'options', 'actions', 'expiresAt']);
  const result = {id: iri(value.id), revision: integer(value.revision), seed: iri(value.seed), itemRevision: integer(value.itemRevision), title: text(value.title, 4096, true)};
  if (result.id.includes('#') || !result.seed.startsWith(boundary.itemPrefix) || result.seed === boundary.itemPrefix) throw new Unknown('Foreign request or item');
  if (!Array.isArray(value.options) || value.options.length > 8 || new Set(value.options).size !== value.options.length) throw new Unknown('Invalid options');
  result.options = value.options.map(v => text(v, 256));
  if (!Array.isArray(value.actions) || !value.actions.length || value.actions.length > 3 || new Set(value.actions).size !== value.actions.length || value.actions.some(v => !['choose', 'later', 'comment'].includes(v)) || value.actions.includes('choose') && !result.options.length) throw new Unknown('Invalid declared actions');
  result.actions = [...value.actions]; result.expiresAt = integer(value.expiresAt);
  return result;
}
export const revisionIri = value => `${value.id}#revision-${value.revision}`;
export const operationIri = id => `urn:rikuy:operation:${hexId(id)}`;
export function requestPublication(value, boundary) {
  const r = request(value, boundary), manifest = JSON.stringify(r);
  if (utf8(manifest).length > 16384) throw new Unknown('Curated request too large');
  return {graph: boundary.requestGraph, datums: [
    {s: r.id, p: NS + 'currentRevision', o: int(r.revision)},
    {s: revisionIri(r), p: NS + 'requestManifest', o: {kind: 'str', value: manifest}}
  ]};
}
export function readRequest(row, boundary) {
  scope(boundary);
  exact(row, ['graph', 'requestId', 'currentRevision', 'revisionIri', 'manifest', 'complete']);
  if (row.graph !== boundary.requestGraph || row.complete !== true || typeof row.manifest !== 'string' || utf8(row.manifest).length > 16384) throw new Unknown('Incomplete curated request');
  let value; try {value = JSON.parse(row.manifest);} catch {throw new Unknown('Malformed curated request');}
  const r = request(value, boundary);
  if (JSON.stringify(r) !== row.manifest || r.id !== row.requestId || r.revision !== row.currentRevision || revisionIri(r) !== row.revisionIri) throw new Unknown('Foreign or ambiguous request revision');
  return r;
}
export function intent(value, ask) {
  exact(value, ['operationId', 'action', 'optionLabel', 'comment']);
  const result = {operationId: hexId(value.operationId), action: value.action, optionLabel: value.optionLabel, comment: value.comment};
  if (!ask.actions.includes(result.action) || typeof result.comment !== 'string') throw new Unknown('Undeclared action');
  if (result.comment !== '') text(result.comment, 4096, true);
  if (result.action === 'choose' ? !ask.options.includes(result.optionLabel) : result.optionLabel !== null) throw new Unknown('Undeclared option');
  if (result.action === 'comment' && !result.comment.trim()) throw new Unknown('Comment required');
  return result;
}
export function proposal(value) {
  exact(value, ['signer', 'graph', 'datums', 'expect']);
  const result = {signer: text(value.signer, 1024), graph: iri(value.graph)};
  if (!Array.isArray(value.datums) || !value.datums.length || value.datums.length > 64 || !Array.isArray(value.expect) || value.expect.length > 16) throw new Unknown('Proposal bounds exceeded');
  result.datums = value.datums.map(d => { exact(d, ['s', 'p', 'o']); return {s: iri(d.s), p: iri(d.p), o: typed(d.o)}; });
  result.expect = value.expect.map(e => { exact(e, ['graph', 's', 'p', 'o']); return {graph: iri(e.graph), s: iri(e.s), p: iri(e.p), o: e.o === null ? null : typed(e.o)}; });
  for (const [rows, key] of [[result.datums, d => JSON.stringify(d)], [result.expect, e => JSON.stringify([e.graph, e.s, e.p])]]) if (new Set(rows.map(key)).size !== rows.length) throw new Unknown('Duplicate proposal slot or datum');
  if (utf8(JSON.stringify(result)).length > 32768) throw new Unknown('Proposal too large');
  return result;
}
export const canonicalProposal = value => JSON.stringify(proposal(value));
export function decodeProposal(raw) {
  if (typeof raw !== 'string' || utf8(raw).length > 32768) throw new Unknown('Invalid manifest size');
  let value; try { value = JSON.parse(raw); } catch { throw new Unknown('Invalid manifest JSON'); }
  const normalized = proposal(value);
  if (JSON.stringify(normalized) !== raw) throw new Unknown('Noncanonical or duplicate manifest field');
  return normalized;
}
export function buildProposal({boundary, ask, freshItem, signer, action, now}) {
  const b = scope(boundary), r = request(ask, b), a = intent(action, r);
  exact(freshItem, ['graph', 'seed', 'revision', 'status']);
  if (freshItem.graph !== b.itemGraph || freshItem.seed !== r.seed || freshItem.revision !== r.itemRevision || freshItem.status !== b.openStatus || !Number.isSafeInteger(now) || now >= r.expiresAt) throw new Unknown('Changed, closed or expired request');
  const op = operationIri(a.operationId), rev = revisionIri(r);
  const datums = [
    {s: op, p: RDF_TYPE, o: ref(NS + (a.action === 'comment' ? 'Comment' : 'Decision'))},
    {s: op, p: NS + 'request', o: ref(r.id)}, {s: op, p: NS + 'revision', o: int(r.revision)},
    {s: op, p: NS + 'seed', o: ref(r.seed)}, {s: op, p: NS + 'action', o: str(a.action)},
    {s: op, p: NS + 'operationId', o: str(a.operationId)}
  ];
  if (a.optionLabel !== null) datums.push({s: op, p: NS + 'optionLabel', o: str(a.optionLabel)});
  if (a.comment !== '') datums.push({s: op, p: NS + 'comment', o: str(a.comment)});
  if (a.action !== 'comment') datums.push({s: rev, p: NS + 'decided', o: ref(op)});
  return proposal({signer, graph: b.answerGraph, datums, expect: [
    {graph: b.requestGraph, s: r.id, p: NS + 'currentRevision', o: int(r.revision)},
    {graph: b.answerGraph, s: rev, p: NS + 'decided', o: null},
    {graph: b.itemGraph, s: r.seed, p: b.revisionPredicate, o: int(r.itemRevision)},
    {graph: b.itemGraph, s: r.seed, p: b.statusPredicate, o: ref(b.openStatus)},
    {graph: b.answerGraph, s: op, p: RDF_TYPE, o: null}
  ]});
}
