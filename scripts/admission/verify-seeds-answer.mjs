// Trusted-process producer only. Its DTO is never caller admission authority.
import {Unknown, NS, exact, integer, text} from '../../web/deck/value.mjs';
import {scope, proposal, readRequest} from '../../web/deck/model.mjs';
import {DeckReader, NATIVE_PROVENANCE_NS} from '../../web/deck/reader.mjs';
import {readAnswer, disposition} from '../../web/deck/evidence.mjs';
import {settlementBinding} from '../../web/deck/settlement.mjs';

export async function verifySeedsAnswer({binding, profile, request, signal}) {
  exact(binding, ['graph', 'ask', 'askRevision', 'target', 'targetRevision', 'receipt']);
  exact(profile, ['endpoint', 'storeId', 'boundary', 'operator', 'queryHashes', 'registrations']);
  const b = scope(profile.boundary);
  for (const key of ['ask', 'target']) if (typeof binding[key] !== 'string' || !/^[A-Za-z0-9_.-]{1,256}$/.test(binding[key])) throw new Unknown('Noncanonical Seeds ID');
  integer(binding.askRevision); integer(binding.targetRevision);
  if (binding.askRevision < 1 || binding.targetRevision < 1) throw new Unknown('Invalid settlement revision');
  if (binding.ask === binding.target || binding.graph !== b.itemGraph || !/^urn:quipu:attest:[0-9a-f]{64}$/.test(binding.receipt) || profile.operator.audience !== text(profile.storeId, 256)) throw new Unknown('Foreign native settlement binding');
  const call = (path, body, cap = 262144) => request(new URL(path, profile.endpoint).href, {body, cap, signal});
  const response = await call('/attest/receipt', {nonce: binding.receipt.slice('urn:quipu:attest:'.length)}, 131072);
  // This fetch is from the pinned native reader, not a supplied receipt DTO.
  if (response?.found !== true || response?.verified !== true || response.receipt_iri !== binding.receipt) throw new Unknown('Native receipt unavailable');
  const p = proposal(response.receipt?.challenge?.proposal);
  if (p.graph !== b.answerGraph || p.signer !== profile.operator.signer) throw new Unknown('Foreign native receipt scope');
  const ids = p.datums.filter(d => d.p === NS + 'request' && d.o.kind === 'iri');
  if (ids.length !== 1) throw new Unknown('Ambiguous signed request');
  if (!Array.isArray(profile.registrations) || profile.registrations.length !== 3) throw new Unknown('Three pinned registrations required');
  // The process boundary also pins numeric registration identity, independently
  // of the browser reader's retained creation checks.
  for (const graph of [b.requestGraph, b.answerGraph, b.itemGraph]) {
    const expected = profile.registrations.find(r => r.iri === graph);
    if (!expected || !Number.isSafeInteger(expected.g) || expected.g <= 0) throw new Unknown('Missing graph registration identity');
    const actual = await call('/graphs?graph=' + encodeURIComponent(graph));
    if (actual.count !== 1 || actual.graphs?.length !== 1 || actual.graphs[0].g !== expected.g) throw new Unknown('Replaced graph');
  }
  const reader = new DeckReader({...profile, provenanceNamespace: NATIVE_PROVENANCE_NS, request});
  const observed = await reader.read(ids[0].o.value);
  const curated = readRequest(observed.requestRow, b);
  const answers = await Promise.all(observed.rows.map(({row, receipt}) => readAnswer(row, receipt, curated, b, profile.operator)));
  const view = disposition(answers, curated, b);
  if (view.state !== 'ANSWERED') throw new Unknown('No unique admitted choice');
  const actual = settlementBinding(view.answer, curated, b);
  if (Object.keys(binding).some(key => binding[key] !== actual[key])) throw new Unknown('Native answer binds another settlement');
  const recordedAt = new Date(view.answer.recordedAt * 1000).toISOString();
  return {schema: 'seeds-native-answer/v1', binding: {graph: actual.graph, ask: actual.ask, ask_revision: actual.askRevision,
    target: actual.target, target_revision: actual.targetRevision, receipt: actual.receipt},
  choice: view.answer.optionLabel, actor: view.answer.actor, recorded_at: recordedAt,
  evidence: observed.rows.find(({row}) => row.receiptIri === actual.receipt).receipt};
}
