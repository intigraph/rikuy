import test from 'node:test';
import assert from 'node:assert/strict';
import {NS, RDF_TYPE, base64url, unbase64url} from '../web/deck/value.mjs';
import {request, requestPublication, readRequest, buildProposal, canonicalProposal, decodeProposal, revisionIri} from '../web/deck/model.mjs';
import {admittedChallenge, readAnswer, disposition, receiptProof, readbackProof} from '../web/deck/evidence.mjs';
import {PendingWrite} from '../web/deck/pending.mjs';
import {webauthnSigner} from '../web/deck/sign.mjs';
import {boundary, who, ask, freshItem, action, make, issued, evidence, memory} from './deck-fixture.mjs';
const copy = value => structuredClone(value);
test('curated request manifests bind the complete declared card to one current graph and revision', () => {
  const publication = requestPublication(ask, boundary);
  const row = {graph: publication.graph, requestId: ask.id, currentRevision: ask.revision, revisionIri: revisionIri(ask), manifest: publication.datums[1].o.value, complete: true};
  assert.deepEqual(readRequest(row, boundary), request(ask, boundary));
  for (const patch of [{graph: boundary.answerGraph}, {currentRevision: 4}, {revisionIri: ask.id + '#revision-2'}, {complete: false}, {manifest: row.manifest.replace('"revision":3', '"revision":2,"revision":3')}]) assert.throws(() => readRequest({...row, ...patch}, boundary));
});
test('online proposals retain all five slots across three graphs with exact native value kinds', () => {
  const p = make();
  assert.equal(p.expect.length, 5);
  assert.equal(new Set(p.expect.map(e => e.graph)).size, 3);
  assert.equal(p.expect[0].o.kind, 'int');
  assert.equal(p.expect[1].o, null);
  assert.equal(p.expect[3].o.kind, 'iri');
  assert.deepEqual(decodeProposal(canonicalProposal(p)), p);
  assert.ok(p.datums.some(d => d.p === NS + 'decided' && d.s === revisionIri(ask)));
  assert.equal(p.datums.find(d => d.p === NS + 'comment').o.value, action.comment);
});
test('changed or closed item, foreign graph, stale revision, expiry and undeclared choices refuse', () => {
  for (const changed of [{revision: 8}, {status: 'https://schema.org/CompletedActionStatus'}, {graph: boundary.answerGraph}, {seed: 'https://example.test/item/2'}]) assert.throws(() => make({freshItem: {...freshItem, ...changed}}));
  assert.throws(() => make({now: ask.expiresAt}));
  for (const changed of [{optionLabel: 'Maybe'}, {action: 'unknown'}, {operationId: 'bad'}, {comment: 'x'.repeat(4097)}]) assert.throws(() => make({action: {...action, ...changed}}));
  assert.throws(() => request({...ask, seed: 'https://other.test/item/1'}, boundary));
  assert.throws(() => request({...ask, options: ['Yes', 'Yes']}, boundary));
  assert.throws(() => make({boundary: {...boundary, answerGraph: boundary.requestGraph}}));
});
test('canonical manifest rejects duplicate JSON fields, extra data fields, inexact and untyped values', () => {
  const raw = canonicalProposal(make());
  for (const bad of [raw.replace('"signer":', '"signer":"wrong","signer":'), ' ' + raw, raw.replace('"kind":"int","value":3', '"kind":"str","value":3')]) assert.throws(() => decodeProposal(bad));
  for (const mutate of [p => p.expect.push(p.expect[0]), p => p.datums.push(p.datums[0]), p => p.datums[0].o.extra = true, p => p.expect[0].o.value = 9007199254740992]) {const p = make(); mutate(p); assert.throws(() => canonicalProposal(p));}
});
test('bounded Unicode and multiline manifests round-trip without changing bytes, labels or typed slots', () => {
  const samples = ['Yes', 'quoted "choice"', 'back\\slash', 'café', '東京', '🙂', 'A\u2028B', 'e\u0301'];
  for (const label of samples) for (const note of ['', ...samples, 'line 1\nline 2\tindented']) {
    const p = make({ask: {...ask, options: [label]}, action: {...action, optionLabel: label, comment: note}});
    const bytes = canonicalProposal(p), decoded = decodeProposal(bytes);
    assert.equal(canonicalProposal(decoded), bytes);
    assert.deepEqual(decoded, p);
    assert.equal(decoded.datums.find(d => d.p === NS + 'optionLabel').o.value, label);
    assert.equal(decoded.datums.find(d => d.p === NS + 'comment')?.o.value ?? '', note);
  }
  assert.throws(() => make({action: {...action, comment: '\ud800'}}));
  assert.throws(() => make({action: {...action, comment: '🙂'.repeat(1025)}}));
});
test('choose, Later and comment fold from verified point receipts; comments do not decide', async () => {
  for (const kind of ['choose', 'later', 'comment']) {
    const p = make({action: {...action, action: kind, optionLabel: kind === 'choose' ? 'Yes' : null}}), e = await evidence(p);
    const admitted = await readAnswer(e.row, e.response, ask, boundary, who);
    assert.equal(disposition([admitted], ask, boundary).state, {choose: 'ANSWERED', later: 'LATER', comment: 'WAITING'}[kind]);
    assert.equal(disposition([admitted], ask, boundary).comments[0].text, action.comment);
    assert.equal(disposition([admitted], ask, boundary).comments[0].actor, who.actor);
    assert.equal(p.datums.some(d => d.p === NS + 'decided'), kind !== 'comment');
  }
  assert.throws(() => make({action: {...action, action: 'comment', optionLabel: null, comment: ' \n '}}));
  assert.throws(() => disposition(Array(101).fill({}), ask, boundary));
  assert.throws(() => disposition([{action: 'choose'}], ask, boundary));
});
for (const slot of [0, 1, 2, 3, 4]) test(`reader refuses a receipt manifest missing required precondition ${slot}`, async () => {
  const p = make(); p.expect.splice(slot, 1);
  const e = await evidence(p);
  await assert.rejects(readAnswer(e.row, e.response, ask, boundary, who));
});
test('ordinary graph, wrong revision, forged provenance, foreign receipt and extra facts never count', async () => {
  const positive = await evidence();
  await readAnswer(positive.row, positive.response, ask, boundary, who);
  const cases = [e => e.row.graph = boundary.requestGraph, e => e.row.receiptIri = 'urn:quipu:attest:' + 'c'.repeat(64), e => e.response.verified = false, e => e.response.found = false, e => e.response.tx = 0, e => e.response.receipt.challenge.actor = 'browser-asserted-human', e => e.response.receipt.content_hash = 'sha256:' + '0'.repeat(64)];
  for (const mutate of cases) {const e = copy(positive); mutate(e); await assert.rejects(readAnswer(e.row, e.response, ask, boundary, who));}
  await assert.rejects(readAnswer(positive.row, positive.response, {...ask, revision: 4}, boundary, who));
  for (const mutate of [p => p.expect[0].graph = boundary.answerGraph, p => p.datums.push({s: ask.seed, p: NS + 'unrelated', o: {kind: 'str', value: 'extra'}})]) {
    const p = make(); mutate(p);
    const e = await evidence(p); await assert.rejects(readAnswer(e.row, e.response, ask, boundary, who));
  }
  const malformed = make(); malformed.expect[2].o.kind = 'str';
  await assert.rejects(evidence(malformed));
});
test('returned challenge bytes, domain, derived WebAuthn challenge, scope and deadline are bound', async () => {
  const p = make(), positive = await issued(p);
  assert.equal((await admittedChallenge(positive, p, who, 1900000000)).challenge.nonce, 'b'.repeat(64));
  for (const changes of [{domain: 'quipu-decision-deck-v1'}, {audience: 'foreign-store'}, {expires_at: 1900000301}, {expires_at: 1900000000}, {origin: 'https://other.test'}]) await assert.rejects(admittedChallenge(await issued(p, changes), p, who, 1900000000));
  await assert.rejects(admittedChallenge({...positive, message: base64url(new Uint8Array([1, 2]))}, p, who, 1900000000));
  await assert.rejects(admittedChallenge({...positive, webauthn_challenge: 'a'.repeat(43)}, p, who, 1900000000));
  await assert.rejects(admittedChallenge(positive, make({action: {...action, optionLabel: 'No'}}), who, 1900000000));
});
test('receipt acceptance requires complete fact and provenance read-back', async () => {
  const p = make(), e = await evidence(p), proof = await receiptProof(e.response, p, who, 'b'.repeat(64));
  assert.equal(readbackProof(e.readback, proof), proof);
  for (const mutate of [r => r.complete = false, r => r.datums.pop(), r => r.attestedBy.pop(), r => r.attestedBy[0].receiptIri = 'urn:wrong', r => r.graph = boundary.requestGraph]) {const r = copy(e.readback); mutate(r); assert.throws(() => readbackProof(r, proof));}
});
test('lost commit response is reconciled once by nonce without retry or resign; read-back gates clearing', async () => {
  const p = make(), e = await evidence(p), store = memory(); let commits = 0, signs = 0, visible = false;
  const transport = {challenge: () => issued(p), commit: async () => {commits++; throw Error('lost response');}, receipt: async () => e.response, readback: async () => ({...e.readback, complete: visible})};
  const writer = new PendingWrite({identity: who, store, transport, sign: async () => {signs++; return {client_data_json: 'a', authenticator_data: 'b', signature: 'c'};}, now: () => 1900000000});
  assert.equal((await writer.submit(p, ask.expiresAt)).state, 'UNKNOWN');
  await assert.rejects(writer.acknowledge());
  await assert.rejects(writer.submit(p, ask.expiresAt));
  visible = true;
  assert.equal((await writer.reconcile()).state, 'ACCEPTED');
  assert.deepEqual([commits, signs], [1, 1]);
  await writer.acknowledge(); assert.equal(await store.get(), null);
});
test('absent, timed out and mismatched receipts retain stable custody and never permit commit retry', async () => {
  const p = make(), store = memory(); let commits = 0;
  const transport = {challenge: () => issued(p), commit: async () => {commits++;}, receipt: async () => ({found: false, verified: false, receipt: null, tx: null})};
  const writer = new PendingWrite({identity: who, store, transport, sign: async () => ({client_data_json: 'a', authenticator_data: 'b', signature: 'c'}), now: () => 1900000000});
  await writer.submit(p, ask.expiresAt);
  const before = await store.get();
  for (let i = 0; i < 3; i++) assert.equal((await writer.reconcile()).state, 'UNKNOWN');
  assert.deepEqual((await store.get()).proposal, before.proposal); assert.equal(commits, 1);
  const e = await evidence(make({action: {...action, optionLabel: 'No'}})); transport.receipt = async () => e.response;
  assert.equal((await writer.reconcile()).state, 'UNKNOWN');
});
test('store custody precedes signing and commit, cancellation and two-tab CAS do not submit', async () => {
  const p = make(), store = memory(); let commits = 0, signs = 0;
  const transport = {challenge: () => issued(p), commit: async () => {commits++;}};
  const writer = new PendingWrite({identity: who, store, transport, sign: async () => {signs++; assert.ok(await store.get()); throw Error('cancel');}, now: () => 1900000000});
  assert.equal((await writer.submit(p, ask.expiresAt)).state, 'PENDING'); assert.deepEqual([signs, commits], [1, 0]);
  const peer = new PendingWrite({identity: who, store, transport, sign: async () => {signs++;}, now: () => 1900000000});
  await assert.rejects(peer.submit(p, ask.expiresAt)); assert.deepEqual([signs, commits], [1, 0]);
});
test('real WebAuthn caller uses only enrolled credential and exact server-derived challenge', async () => {
  const p = make(), admitted = await admittedChallenge(await issued(p), p, who, 1900000000); let calls = 0;
  const environment = {secure: true, origin: who.origin, credentials: {get: async options => {
    calls++; assert.equal(base64url(options.publicKey.challenge), admitted.webauthnChallenge); assert.equal(options.publicKey.userVerification, 'required');
    assert.equal(base64url(options.publicKey.allowCredentials[0].id), who.signer);
    return {type: 'public-key', rawId: unbase64url(who.signer).buffer, response: {authenticatorData: new Uint8Array([1]).buffer, clientDataJSON: new Uint8Array([2]).buffer, signature: new Uint8Array([3]).buffer}};
  }}};
  assert.deepEqual(await webauthnSigner(who, environment)(admitted), {authenticator_data: 'AQ', client_data_json: 'Ag', signature: 'Aw'});
  await assert.rejects(webauthnSigner(who, {...environment, origin: 'https://wrong.test'})(admitted)); assert.equal(calls, 1);
});

test('a server deadline beyond the request refuses before signing or retaining a submission', async () => {
 const p = make(), store = memory(); let signs = 0;
 const writer = new PendingWrite({identity: who, store, transport: {challenge: () => issued(p)}, sign: async () => {signs++;}, now: () => 1900000000});
 await assert.rejects(writer.submit(p, 1900000100));
 assert.equal(signs, 0); assert.equal(await store.get(), null);
 const e = await evidence(); await assert.rejects(readAnswer(e.row, e.response, {...ask, expiresAt: 1900000100}, boundary, who));
});
