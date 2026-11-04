// Synthetic reader/challenge fixtures, not signature or installed-service proof.
import {NS, base64url, sha256, utf8} from '../web/deck/value.mjs';
import {buildProposal, canonicalProposal, operationIri} from '../web/deck/model.mjs';
export const boundary = Object.freeze({requestGraph: 'https://example.test/requests', answerGraph: 'https://example.test/answers', itemGraph: 'https://example.test/items', itemPrefix: 'https://example.test/item/', revisionPredicate: 'https://example.test/revision', statusPredicate: 'https://schema.org/actionStatus', openStatus: 'https://schema.org/ActiveActionStatus'});
export const who = Object.freeze({signer: 'dGVzdA', audience: 'synthetic-store', origin: 'https://sign.example.test', rpId: 'sign.example.test', actor: 'fixture-operator'});
export const ask = Object.freeze({id: 'https://example.test/request/1', revision: 3, seed: 'https://example.test/item/1', itemRevision: 7, title: 'Approve the synthetic change?', options: ['Yes', 'No'], actions: ['choose', 'later', 'comment'], expiresAt: 2000000000});
export const freshItem = Object.freeze({graph: boundary.itemGraph, seed: ask.seed, revision: ask.itemRevision, status: boundary.openStatus});
export const action = Object.freeze({operationId: 'a'.repeat(64), action: 'choose', optionLabel: 'Yes', comment: 'A note\non two lines'});
export const make = (changes = {}) => buildProposal({boundary, ask, freshItem, signer: who.signer, action, now: 1900000000, ...changes});
export async function issued(p = make(), changes = {}) {
  const challenge = {domain: 'quipu-attested-write-v1', audience: who.audience, nonce: 'b'.repeat(64), origin: who.origin, rp_id: who.rpId, actor: who.actor, proposal: p, expires_at: 1900000300, ...changes};
  const message = utf8(JSON.stringify(challenge)), prefix = utf8('quipu-verdict-webauthn-v1\0'), all = new Uint8Array(prefix.length + message.length);
  all.set(prefix); all.set(message, prefix.length);
  return {challenge, message: base64url(message), webauthn_challenge: base64url(await crypto.subtle.digest('SHA-256', all))};
}
export async function evidence(p = make()) {
  const value = await issued(p);
  const receipt = {challenge: value.challenge, content_hash: 'sha256:' + await sha256(utf8(JSON.stringify(value.challenge))), recorded_at: 1900000001};
  const receiptIri = 'urn:quipu:attest:' + value.challenge.nonce;
  const operationId = p.datums.find(d => d.p === NS + 'operationId').o.value;
  return {row: {graph: boundary.answerGraph, subject: operationIri(operationId), receiptIri, manifest: canonicalProposal(p)}, response: {found: true, verified: true, tx: 9, receipt_iri: receiptIri, receipt}, readback: {graph: boundary.answerGraph, datums: p.datums, attestedBy: [...new Set(p.datums.map(d => d.s))].map(s => ({s, receiptIri})), complete: true}};
}
export function memory() {
  let value = null;
  return {get: async () => structuredClone(value), insert: async record => {if (value) throw Error('CAS conflict'); value = structuredClone(record);}, change: async (nonce, patch) => {if (value?.nonce !== nonce) throw Error('CAS conflict'); Object.assign(value, structuredClone(patch));}, remove: async (nonce, state) => {if (value?.nonce !== nonce || value?.state !== state) throw Error('CAS conflict'); value = null;}};
}
export const currentRevisionPredicate = NS + 'currentRevision';
