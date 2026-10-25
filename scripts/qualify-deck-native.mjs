// # arming: agent-invoked explicit disposable qualification; no installed/default store.
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash, generateKeyPairSync, sign} from 'node:crypto';
import assert from 'node:assert/strict';
import {NS} from '../web/deck/value.mjs';
import {buildProposal, canonicalProposal, operationIri, requestPublication, readRequest, revisionIri} from '../web/deck/model.mjs';
import {admittedChallenge, readAnswer, disposition, readbackProof} from '../web/deck/evidence.mjs';
import {DeckReader, readerDefinitions} from '../web/deck/reader.mjs';
const cli = process.env.QUIPU_CLI, artifacts = process.env.QUIPU_ARTIFACTS;
if (!cli || !artifacts) throw Error('Explicit candidate QUIPU_CLI and fresh QUIPU_ARTIFACTS JSONL required');
const root = mkdtempSync(join(tmpdir(), 'rikuy-native-')), source = resolve(import.meta.dirname, '..');
const libraries = new Map();
for (const line of readFileSync(artifacts, 'utf8').split('\n')) {
  let record; try {record = JSON.parse(line);} catch {continue;}
  if (record.reason !== 'compiler-artifact' || record.profile?.test || !record.target?.kind?.includes('lib') || !['quipu', 'serde_json'].includes(record.target.name)) continue;
  const paths = record.filenames.filter(p => p.endsWith('.rlib'));
  if (paths.length !== 1 || libraries.has(record.target.name) && libraries.get(record.target.name) !== paths[0]) throw Error('Ambiguous candidate library population');
  libraries.set(record.target.name, paths[0]);
}
if (libraries.size !== 2) throw Error('Candidate quipu and serde_json library artifacts missing');
const buildAt = process.argv[2] === '--build-helper' ? process.argv[3] : null;
const native = buildAt || process.env.QUIPU_NATIVE_FIXTURE || join(root, 'native-fixture');
const results = [], sha = bytes => createHash('sha256').update(bytes).digest('hex');
const boundary = {requestGraph: 'https://example.test/requests', answerGraph: 'https://example.test/answers', itemGraph: 'https://example.test/items', itemPrefix: 'https://example.test/item/', revisionPredicate: 'https://example.test/revision', statusPredicate: 'https://schema.org/actionStatus', openStatus: 'https://schema.org/ActiveActionStatus'};
const ask = () => ({id: 'https://example.test/request/1', revision: 3, seed: 'https://example.test/item/1', itemRevision: 7, title: 'Approve the synthetic change?', options: ['Yes', 'No'], actions: ['choose', 'later', 'comment'], expiresAt: Math.floor(Date.now() / 1000) + 3600});
function command(db, verb, value) {
  return JSON.parse(execFileSync(native, [db, verb], {input: JSON.stringify(value), encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']}));
}
function cliRun(db, args) {
  return execFileSync(cli, [...args, '--db', db], {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']});
}
function put(db, graph, datums, retract = false) {return command(db, 'seed', {graph, datums, retract});}
function replace(db, graph, s, p, old, value) {put(db, graph, [{s, p, o: old}], true); put(db, graph, [{s, p, o: value}]);}
function setup(index, kind = 'choose') {
  const db = join(root, `case-${index}.db`), r = ask();
  const {privateKey, publicKey} = generateKeyPairSync('ed25519');
  const x = Buffer.from(publicKey.export({format: 'jwk'}).x, 'base64url');
  const cose = Buffer.concat([Buffer.from([0xa4, 1, 1, 3, 0x27, 0x20, 6, 0x21, 0x58, 0x20]), x]);
  const publication = requestPublication(r, boundary);
  put(db, publication.graph, publication.datums);
  const requestFacts = command(db, 'facts', {graph: boundary.requestGraph}).datums;
  const requestRow = {graph: boundary.requestGraph, requestId: r.id, currentRevision: requestFacts.find(d => d.s === r.id && d.p === NS + 'currentRevision').o.value, revisionIri: revisionIri(r), manifest: requestFacts.find(d => d.s === revisionIri(r) && d.p === NS + 'requestManifest').o.value, complete: true};
  assert.deepEqual(readRequest(requestRow, boundary), r);
  put(db, boundary.itemGraph, [{s: r.seed, p: boundary.revisionPredicate, o: {kind: 'int', value: r.itemRevision}}, {s: r.seed, p: boundary.statusPredicate, o: {kind: 'iri', value: boundary.openStatus}}]);
  cliRun(db, ['shapes', 'load', 'rikuy-deck', join(source, 'shapes/deck.shapes.ttl')]);
  cliRun(db, ['signer', 'enroll', '--credential-id', 'dGVzdA', '--cose-key', cose.toString('base64url'), '--scheme', 'webauthn-eddsa', '--origin', 'https://sign.example.test', '--rp-id', 'sign.example.test', '--actor', 'fixture-operator', '--graph', boundary.answerGraph, '--expires-at', String(r.expiresAt)]);
  assert.equal(JSON.parse(cliRun(db, ['signer', 'status'])).enabled, false);
  cliRun(db, ['signer', 'protect-graph', boundary.answerGraph]);
  cliRun(db, ['signer', 'enable']); // Synthetic temporary database only.
  const who = {signer: 'dGVzdA', audience: command(db, 'store-id', {}).store_id, origin: 'https://sign.example.test', rpId: 'sign.example.test', actor: 'fixture-operator'};
  const action = {operationId: String(index + 1).padStart(64, '0'), action: kind, optionLabel: kind === 'choose' ? 'Yes' : null, comment: 'Synthetic native comment\non two lines'};
  const p = buildProposal({boundary, ask: r, freshItem: {graph: boundary.itemGraph, seed: r.seed, revision: r.itemRevision, status: boundary.openStatus}, signer: who.signer, action, now: Math.floor(Date.now() / 1000)});
  assert.equal(command(db, 'canonical', p).canonical, canonicalProposal(p));
  return {db, r, who, action, p, privateKey};
}
function assertion(state, issued, origin = state.who.origin, forge = false) {
  const client = Buffer.from(JSON.stringify({type: 'webauthn.get', challenge: issued.webauthn_challenge, origin, crossOrigin: false}));
  const auth = Buffer.alloc(37); createHash('sha256').update(state.who.rpId).digest().copy(auth); auth[32] = 5; auth.writeUInt32BE(1, 33);
  const signature = sign(null, Buffer.concat([auth, createHash('sha256').update(client).digest()]), state.privateKey);
  if (forge) signature[0] ^= 1;
  return {nonce: issued.challenge.nonce, client_data_json: client.toString('base64url'), authenticator_data: auth.toString('base64url'), signature: signature.toString('base64url')};
}
function footprint(state, nonce) {
  return {facts: command(state.db, 'facts', {graph: boundary.answerGraph}), receipt: command(state.db, 'receipt', {nonce}), counter: JSON.parse(cliRun(state.db, ['signer', 'status'])).signers[0].sign_count};
}
async function admit(state, p = state.p) {
  const issued = command(state.db, 'challenge', p);
  await admittedChallenge(issued, p, state.who, Math.floor(Date.now() / 1000));
  const body = assertion(state, issued);
  command(state.db, 'commit', body);
  const receipt = command(state.db, 'receipt', {nonce: body.nonce});
  const facts = command(state.db, 'facts', {graph: boundary.answerGraph}).datums;
  const manifests = facts.filter(d => d.s === receipt.receipt_iri && d.p.endsWith('attestProposal'));
  assert.equal(manifests.length, 1);
  const row = {graph: boundary.answerGraph, subject: operationIri(state.action.operationId), receiptIri: receipt.receipt_iri, manifest: manifests[0].o.value};
  return {issued, body, receipt, facts, row};
}
try {
  const compile = ['--edition=2024', join(source, 'tests/native/deck-fixture.rs'), '-L', 'dependency=' + dirname(libraries.get('quipu')), ...[...libraries].flatMap(([name, path]) => ['--extern', `${name}=${path}`]), '-o', native];
  const metadata = () => ({source_sha256: sha(readFileSync(join(source, 'tests/native/deck-fixture.rs'))), library_sha256: sha(readFileSync(libraries.get('quipu'))), executable_sha256: sha(readFileSync(native))});
  if (buildAt || !process.env.QUIPU_NATIVE_FIXTURE) execFileSync('rustc', compile, {stdio: ['ignore', 'pipe', 'pipe']});
  if (buildAt) {
    writeFileSync(native + '.json', JSON.stringify(metadata(), null, 2) + '\n', {mode: 0o600});
    console.log(JSON.stringify(metadata()));
  } else {
  if (process.env.QUIPU_NATIVE_FIXTURE) assert.deepEqual(JSON.parse(readFileSync(native + '.json', 'utf8')), metadata(), 'Stale native fixture artifact');
  const candidate = execFileSync(cli, ['--version'], {encoding: 'utf8'}).trim();
  for (const [index, kind] of ['choose', 'later', 'comment'].entries()) {
    const state = setup(index, kind), e = await admit(state);
    const answer = await readAnswer(e.row, e.receipt, state.r, boundary, state.who);
    assert.equal(disposition([answer], state.r, boundary).state, {choose: 'ANSWERED', later: 'LATER', comment: 'WAITING'}[kind]);
    const subjects = new Set(state.p.datums.map(d => d.s));
    readbackProof({graph: boundary.answerGraph, complete: true, datums: e.facts.filter(d => state.p.datums.some(p => p.s === d.s && p.p === d.p && p.o.kind === d.o.kind && p.o.value === d.o.value)), attestedBy: e.facts.filter(d => subjects.has(d.s) && d.p.endsWith('attestedBy')).map(d => ({s: d.s, receiptIri: d.o.value}))}, answer);
    const before = footprint(state, e.body.nonce);
    assert.throws(() => command(state.db, 'commit', e.body));
    assert.deepEqual(footprint(state, e.body.nonce), before);
    assert.throws(() => command(state.db, 'challenge', state.p)); // Decided or operation slot is spent.
    results.push({case: kind, state: disposition([answer], state.r, boundary).state, canonical_native_match: true, native_verified: e.receipt.verified, replay_no_mutation: true});
    const nativeNamespace = e.facts.find(d => d.p.endsWith('attestedBy')).p.slice(0, -'attestedBy'.length);
    const definitions = readerDefinitions(boundary, nativeNamespace);
    const queryHashes = Object.fromEntries(Object.entries(definitions).map(([role, def]) => [role, sha(Buffer.from(JSON.stringify(def)))]));
    for (const def of Object.values(definitions)) command(state.db, 'query-load', def);
    const registrations = [boundary.requestGraph, boundary.answerGraph, boundary.itemGraph].map(graph => {
      const metadata = command(state.db, 'graphs', {graph}).graphs[0];
      return {iri: graph, creation: metadata.creation};
    });
    // Real stored-query rendering/execution, native point receipts and registry;
    // synthetic transport dispatch only, with no HTTP or production endpoint.
    const reader = new DeckReader({endpoint: 'https://reader.example.test/', boundary, operator: state.who, provenanceNamespace: nativeNamespace, queryHashes, registrations, request: async (address, {body}) => {
      const url = new URL(address);
      return command(state.db, url.pathname === '/graphs' ? 'graphs' : url.pathname === '/ask' ? 'ask' : 'receipt', url.pathname === '/graphs' ? {graph: url.searchParams.get('graph')} : body);
    }});
    const observed = await reader.read(state.r.id);
    assert.equal(observed.rows.length, 1);
    assert.equal(observed.rows[0].receipt.receipt_iri, e.receipt.receipt_iri);
    results.push({case: `${kind}-stored-reader`, native_registered_queries: true, graph_creation_bound: true, typed_facts_and_provenance: true});
  }
  for (const [index, kind] of ['forged', 'wrong-origin', 'item-revision', 'closed-item', 'request-revision'].entries()) {
    const state = setup(index + 10), issued = command(state.db, 'challenge', state.p);
    let restore = () => {};
    if (kind === 'item-revision') {replace(state.db, boundary.itemGraph, state.r.seed, boundary.revisionPredicate, {kind: 'int', value: 7}, {kind: 'int', value: 8}); restore = () => replace(state.db, boundary.itemGraph, state.r.seed, boundary.revisionPredicate, {kind: 'int', value: 8}, {kind: 'int', value: 7});}
    if (kind === 'closed-item') {const closed = 'https://schema.org/CompletedActionStatus'; replace(state.db, boundary.itemGraph, state.r.seed, boundary.statusPredicate, {kind: 'iri', value: boundary.openStatus}, {kind: 'iri', value: closed}); restore = () => replace(state.db, boundary.itemGraph, state.r.seed, boundary.statusPredicate, {kind: 'iri', value: closed}, {kind: 'iri', value: boundary.openStatus});}
    if (kind === 'request-revision') {replace(state.db, boundary.requestGraph, state.r.id, NS + 'currentRevision', {kind: 'int', value: 3}, {kind: 'int', value: 4}); restore = () => replace(state.db, boundary.requestGraph, state.r.id, NS + 'currentRevision', {kind: 'int', value: 4}, {kind: 'int', value: 3});}
    const before = footprint(state, issued.challenge.nonce), body = assertion(state, issued, kind === 'wrong-origin' ? 'https://other.example.test' : state.who.origin, kind === 'forged');
    assert.throws(() => command(state.db, 'commit', body));
    assert.deepEqual(footprint(state, issued.challenge.nonce), before);
    restore(); command(state.db, 'commit', assertion(state, issued));
    assert.equal(command(state.db, 'receipt', {nonce: issued.challenge.nonce}).verified, true); // Refusal did not consume nonce/counter.
    results.push({case: kind, refused_no_mutation: true, nonce_and_counter_unspent: true});
  }
  for (const [index, slot] of [0, 1, 2, 3, 4].entries()) {
    const state = setup(index + 20), p = structuredClone(state.p); p.expect.splice(slot, 1);
    const e = await admit(state, p); assert.equal(e.receipt.verified, true); // Domain-free native primitive permits it.
    await assert.rejects(readAnswer(e.row, e.receipt, state.r, boundary, state.who));
    results.push({case: `missing-expectation-${slot}`, native_verified: true, deck_reader_refused: true});
  }
  {
    const state = setup(35, 'comment'), p = structuredClone(state.p);
    p.datums = p.datums.filter(d => d.p !== NS + 'comment');
    const e = await admit(state, p);
    await assert.rejects(readAnswer(e.row, e.receipt, state.r, boundary, state.who));
    results.push({case: 'missing-comment-floor', native_verified: true, deck_reader_refused: true, limitation: 'Native post-state admission excludes MinCount floors; full shape validation and client/reader constraints remain distinct'});
  }
  {
    const state = setup(36, 'comment'), p = structuredClone(state.p);
    p.datums.find(d => d.p === NS + 'action').o.value = 'undeclared';
    const issued = command(state.db, 'challenge', p), before = footprint(state, issued.challenge.nonce);
    assert.throws(() => command(state.db, 'commit', assertion(state, issued)));
    assert.deepEqual(footprint(state, issued.challenge.nonce), before);
    results.push({case: 'loaded-action-value-constraint', refused_no_mutation: true});
  }
  const state = setup(40), e = await admit(state), ordinary = 'https://example.test/ordinary';
  put(state.db, ordinary, state.p.datums);
  await assert.rejects(readAnswer({...e.row, graph: ordinary}, e.receipt, state.r, boundary, state.who));
  await assert.rejects(readAnswer(e.row, e.receipt, {...state.r, revision: 4}, boundary, state.who));
  results.push({case: 'ordinary-graph-and-other-request-revision', deck_reader_refused: true});
  console.log(JSON.stringify({candidate, native_library_sha256: sha(readFileSync(libraries.get('quipu'))), helper_source_sha256: sha(readFileSync(join(source, 'tests/native/deck-fixture.rs'))), fixture: 'Disposable stores; generated software keys kept only in memory; local native methods and actual operator CLI; no HTTP/service/real credential or production profile union', results}, null, 2));
  }
} finally {rmSync(root, {recursive: true, force: true});}
