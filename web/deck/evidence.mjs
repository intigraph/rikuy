import {Unknown, NS, RDF_TYPE, exact, text, integer, iri, hexId, utf8, sha256, base64url, unbase64url} from './value.mjs';
import {scope, request, operationIri, proposal, canonicalProposal, decodeProposal, buildProposal} from './model.mjs';
const admittedAnswers = new WeakSet();
export function identity(value) {
  exact(value, ['signer', 'audience', 'origin', 'rpId', 'actor']);
  const result = {signer: text(value.signer, 1024), audience: text(value.audience, 256), origin: text(value.origin, 2048), rpId: text(value.rpId, 253), actor: text(value.actor, 256)};
  let url; try { url = new URL(result.origin); } catch { throw new Unknown('Invalid signing origin'); }
  if (url.protocol !== 'https:' || url.origin !== result.origin || url.hostname !== result.rpId || url.username || url.password) throw new Unknown('Exact HTTPS signing origin/RP required');
  return result;
}
export function challenge(value, expectedIdentity) {
  const who = identity(expectedIdentity);
  exact(value, ['domain', 'audience', 'nonce', 'origin', 'rp_id', 'actor', 'proposal', 'expires_at']);
  const result = {domain: value.domain, audience: value.audience, nonce: hexId(value.nonce), origin: value.origin, rp_id: value.rp_id, actor: value.actor, proposal: proposal(value.proposal), expires_at: integer(value.expires_at)};
  if (result.domain !== 'quipu-attested-write-v1' || result.audience !== who.audience || result.origin !== who.origin || result.rp_id !== who.rpId || result.actor !== who.actor || result.proposal.signer !== who.signer) throw new Unknown('Foreign signing scope');
  return result;
}
export async function admittedChallenge(issued, expectedProposal, who, now) {
  exact(issued, ['message', 'webauthn_challenge', 'challenge']);
  const c = challenge(issued.challenge, who), message = utf8(JSON.stringify(c));
  if (canonicalProposal(c.proposal) !== canonicalProposal(expectedProposal) || !Number.isSafeInteger(now) || c.expires_at <= now || c.expires_at > now + 300 || message.length > 32768 || base64url(message) !== issued.message) throw new Unknown('Changed or expired signed message');
  const prefix = utf8('quipu-verdict-webauthn-v1\0'), all = new Uint8Array(prefix.length + message.length);
  all.set(prefix); all.set(message, prefix.length);
  const derived = base64url(await crypto.subtle.digest('SHA-256', all));
  if (derived !== issued.webauthn_challenge) throw new Unknown('Wrong WebAuthn challenge');
  unbase64url(issued.message);
  return {challenge: c, message: issued.message, webauthnChallenge: derived, contentHash: 'sha256:' + await sha256(message)};
}
// The caller obtains this response from its pinned native /attest/receipt
// reader. A browser-provided row or its own `verified` flag is not authority.
export async function receiptProof(response, expectedProposal, who, nonce) {
  if (!response || utf8(JSON.stringify(response)).length > 131072 || response.found !== true || response.verified !== true || response.receipt_iri !== 'urn:quipu:attest:' + hexId(nonce)) throw new Unknown('Verified native receipt unavailable');
  integer(response.tx);
  const receipt = response.receipt, c = challenge(receipt?.challenge, who);
  const contentHash = 'sha256:' + await sha256(utf8(JSON.stringify(c)));
  if (c.nonce !== nonce || canonicalProposal(c.proposal) !== canonicalProposal(expectedProposal) || receipt.content_hash !== contentHash) throw new Unknown('Receipt is for another intent');
  const recordedAt = integer(receipt.recorded_at);
  if (recordedAt >= c.expires_at) throw new Unknown('Receipt time outside signed deadline');
  return {receiptIri: response.receipt_iri, nonce, tx: response.tx, actor: c.actor, recordedAt, expiresAt: c.expires_at, contentHash, proposal: c.proposal};
}
export function readbackProof(observed, proof) {
  exact(observed, ['graph', 'datums', 'attestedBy', 'complete']);
  if (observed.graph !== proof.proposal.graph || observed.complete !== true || !Array.isArray(observed.datums) || !Array.isArray(observed.attestedBy)) throw new Unknown('Incomplete answer read-back');
  const actual = proposal({...proof.proposal, datums: observed.datums});
  const keys = rows => rows.map(d => JSON.stringify(d)).sort();
  if (JSON.stringify(keys(actual.datums)) !== JSON.stringify(keys(proof.proposal.datums))) throw new Unknown('Answer facts not readable');
  const subjects = [...new Set(proof.proposal.datums.map(d => d.s))].sort();
  if (observed.attestedBy.length !== subjects.length) throw new Unknown('Missing answer provenance');
  for (const link of observed.attestedBy) { exact(link, ['s', 'receiptIri']); if (link.receiptIri !== proof.receiptIri) throw new Unknown('Foreign answer provenance'); }
  if (JSON.stringify(observed.attestedBy.map(x => x.s).sort()) !== JSON.stringify(subjects)) throw new Unknown('Conflicting answer provenance');
  return proof;
}
export async function readAnswer(row, response, ask, boundary, who) {
  const b = scope(boundary), r = request(ask, b);
  exact(row, ['graph', 'subject', 'receiptIri', 'manifest']);
  if (row.graph !== b.answerGraph) throw new Unknown('Answer from ordinary or foreign graph');
  const p = decodeProposal(row.manifest);
  if (p.graph !== b.answerGraph || p.signer !== identity(who).signer) throw new Unknown('Foreign proposal');
  const values = predicate => p.datums.filter(d => d.s === row.subject && d.p === predicate);
  const scalar = (predicate, kind, required = true) => {
    const found = values(predicate);
    if (!found.length && !required) return null;
    if (found.length !== 1 || found[0].o.kind !== kind) throw new Unknown('Missing or conflicting answer field');
    return found[0].o.value;
  };
  const operationId = scalar(NS + 'operationId', 'str');
  if (row.subject !== operationIri(operationId)) throw new Unknown('Foreign operation subject');
  const action = {operationId, action: scalar(NS + 'action', 'str'), optionLabel: scalar(NS + 'optionLabel', 'str', false), comment: scalar(NS + 'comment', 'str', false) ?? ''};
  // Reconstruct the entire permitted manifest, not just the field that the
  // renderer was studying: no omitted precondition or extra datum can pass.
  const expected = buildProposal({boundary: b, ask: r, signer: p.signer, action,
    freshItem: {graph: b.itemGraph, seed: r.seed, revision: r.itemRevision, status: b.openStatus}, now: r.expiresAt - 1});
  if (canonicalProposal(expected) !== row.manifest || values(RDF_TYPE).length !== 1) throw new Unknown('Invalid Deck manifest');
  if (!/^urn:quipu:attest:[0-9a-f]{64}$/.test(row.receiptIri)) throw new Unknown('Missing server provenance');
  const proof = await receiptProof(response, expected, who, row.receiptIri.slice('urn:quipu:attest:'.length));
  if (proof.expiresAt > r.expiresAt || proof.recordedAt >= r.expiresAt) throw new Unknown('Signed deadline exceeds the curated request deadline');
  const answer = Object.freeze({...action, requestId: r.id, seed: r.seed, revision: r.revision, ...proof});
  admittedAnswers.add(answer);
  return answer;
}
export function disposition(answers, ask, boundary) {
  const r = request(ask, boundary);
  if (!Array.isArray(answers) || answers.length > 100) throw new Unknown('Incomplete answer population');
  const operations = new Set(), comments = [], decisions = [];
  for (const answer of answers) {
    if (!admittedAnswers.has(answer) || answer.requestId !== r.id || answer.seed !== r.seed || answer.revision !== r.revision) throw new Unknown('Unadmitted or foreign answer');
    if (operations.has(answer.operationId)) throw new Unknown('Duplicate operation in answer population');
    operations.add(answer.operationId);
    if (answer.comment !== '') comments.push({text: answer.comment, actor: answer.actor, recordedAt: answer.recordedAt, receiptIri: answer.receiptIri});
    if (answer.action !== 'comment') decisions.push(answer);
  }
  if (decisions.length > 1) throw new Unknown('Competing decisions');
  const answer = decisions[0];
  return {state: !answer ? 'WAITING' : answer.action === 'later' ? 'LATER' : 'ANSWERED', answer: answer ?? null, comments};
}
