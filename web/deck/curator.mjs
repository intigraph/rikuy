import {request, requestPublication, readRequest, revisionIri, scope} from './model.mjs';
import {Unknown, NS, exact, integer, utf8} from './value.mjs';

const term = value => `<${value}>`;
const literal = value => JSON.stringify(value);
const number = value => `"${value}"^^<http://www.w3.org/2001/XMLSchema#integer>`;
const slot = (s, p, o) => `${term(s)} ${term(p)} ${o} .`;
function unique(s, p, expected, variable) {
  return `${slot(s, p, expected)} FILTER NOT EXISTS { ${term(s)} ${term(p)} ?${variable} . FILTER (!sameTerm(?${variable}, ${expected})) }`;
}

// One existing /update operation, with writes confined to the request graph.
// This builder neither registers a graph nor grants the caller write authority.
export function publicationPlan({boundary, next, previous, now}) {
  const b = scope(boundary), r = request(next, b);
  if (!Number.isSafeInteger(now) || now < 0 || now >= r.expiresAt) throw new Unknown('Expired publication');
  const old = previous === null ? null : request(previous, b);
  if (old ? old.id !== r.id || old.seed !== r.seed || old.revision === Number.MAX_SAFE_INTEGER || r.revision !== old.revision + 1 : r.revision !== 1) throw new Unknown('Publication must advance exactly one revision');
  const pub = requestPublication(r, b), current = NS + 'currentRevision', manifest = NS + 'requestManifest';
  const removed = old ? slot(r.id, current, number(old.revision)) : '';
  const head = old ? unique(r.id, current, number(old.revision), 'otherHead') : `FILTER NOT EXISTS { ${term(r.id)} ${term(current)} ?head . }`;
  const retained = old ? unique(revisionIri(old), manifest, literal(requestPublication(old, b).datums[1].o.value), 'otherManifest') : '';
  const inserted = `${slot(r.id, current, number(r.revision))}\n${slot(revisionIri(r), manifest, literal(pub.datums[1].o.value))}`;
  const query = `DELETE { GRAPH ${term(b.requestGraph)} { ${removed} } }
INSERT { GRAPH ${term(b.requestGraph)} { ${inserted} } }
WHERE {
  GRAPH ${term(b.itemGraph)} {
    ${unique(r.seed, b.revisionPredicate, number(r.itemRevision), 'otherItemRevision')}
    ${unique(r.seed, b.statusPredicate, term(b.openStatus), 'otherStatus')}
  }
  ${old ? `GRAPH ${term(b.requestGraph)} { ${head} ${retained} }` : `FILTER NOT EXISTS { GRAPH ${term(b.requestGraph)} { ${term(r.id)} ${term(current)} ?head . } }`}
  FILTER NOT EXISTS { GRAPH ${term(b.requestGraph)} { ${term(revisionIri(r))} ?occupiedPredicate ?occupiedValue . } }
}`;
  if (utf8(query).length > 65536) throw new Unknown('Publication update too large');
  return {boundary: b, next: r, previous: old, query};
}

export function publicationReport(value, plan) {
  exact(value, ['tx', 'asserted', 'retracted', 'graphs']);
  if (value.tx === null && value.asserted === 0 && value.retracted === 0 && Array.isArray(value.graphs) && value.graphs.length === 0) return 'NO_CHANGE';
  integer(value.tx);
  if (value.asserted !== 2 || value.retracted !== (plan.previous === null ? 0 : 1) || !Array.isArray(value.graphs) || value.graphs.length !== 1) throw new Unknown('Unexpected publication changes');
  const g = value.graphs[0]; exact(g, ['graph', 'tx', 'asserted', 'retracted']);
  if (g.graph !== plan.boundary.requestGraph || g.tx !== value.tx || g.asserted !== value.asserted || g.retracted !== value.retracted) throw new Unknown('Foreign publication transaction');
  return 'CHANGED';
}

export function publicationReadback(row, plan) {
  const observed = readRequest(row, plan.boundary);
  if (JSON.stringify(observed) !== JSON.stringify(plan.next)) throw new Unknown('Publication not confirmed');
  return observed;
}
