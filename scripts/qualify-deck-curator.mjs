// Synthetic loopback qualification only. Requires an explicitly pinned binary;
// never opens an installed/default store or reads a real credential.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {publicationPlan, publicationReport} from '../web/deck/curator.mjs';
import {CuratorJob} from './deck-curator-job.mjs';
import {NS} from '../web/deck/value.mjs';
import {revisionIri, requestPublication} from '../web/deck/model.mjs';

const binary = process.env.QUIPU_SERVER, expectedHash = process.env.QUIPU_SERVER_SHA256;
assert(binary && isAbsolute(binary) && /^[0-9a-f]{64}$/.test(expectedHash || ''), 'Explicit candidate binary and SHA-256 required');
const hash = createHash('sha256').update(await readFile(binary)).digest('hex'); assert.equal(hash, expectedHash);
const root = await mkdtemp(join(tmpdir(), 'rikuy-curator-native-'));
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening'); const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const endpoint = `http://127.0.0.1:${port}`, credential = 'synthetic-local-fixture-only';
const boundary = {requestGraph: 'https://example.test/requests', answerGraph: 'https://example.test/answers', itemGraph: 'https://example.test/items', itemPrefix: 'https://example.test/item/', revisionPredicate: 'https://example.test/revision', statusPredicate: 'https://schema.org/actionStatus', openStatus: 'https://schema.org/ActiveActionStatus'};
await mkdir(join(root, '.bobbin')); await mkdir(join(root, 'home'));
await writeFile(join(root, '.bobbin/config.toml'), `[quipu.server]\nbind = "127.0.0.1:${port}"\nauth_token = "${credential}"\nread_pool_size = 2\nread_processes = 0\nreserve_point_reads = false\nmemory_budget_mib = 256\n[quipu.embedding]\nauto_embed = false\n`, {mode: 0o600});
let logs = '', ended = false;
const child = spawn(binary, ['--db', join(root, 'fixture.db'), '--bind', `127.0.0.1:${port}`], {cwd: root, env: {HOME: join(root, 'home'), PATH: '/usr/bin:/bin', LANG: 'C.UTF-8'}, stdio: ['ignore', 'pipe', 'pipe']});
const exit = once(child, 'exit').then(([code, signal]) => {ended = true; return {code, signal};});
child.stdout.on('data', data => {logs = (logs + data).slice(-16384);}); child.stderr.on('data', data => {logs = (logs + data).slice(-16384);});
const budget = setTimeout(() => child.kill('SIGKILL'), 90000); budget.unref();
const results = [];
async function http(path, body, type = 'application/json', authorized = true) {
  const response = await fetch(endpoint + path, {method: body === undefined ? 'GET' : 'POST', headers: {'content-type': type, ...(authorized ? {authorization: `Bearer ${credential}`} : {}), 'X-Quipu-Client': 'agent-adhoc'}, body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body, signal: AbortSignal.timeout(3000), redirect: 'error'});
  const text = await response.text(); let value; try {value = JSON.parse(text);} catch {value = text;}
  assert(response.ok, `HTTP ${response.status}: ${JSON.stringify(value)}`); return value;
}
const update = query => http('/update', query, 'application/sparql-update');
const query = async sparql => {const value = await http('/query', {query: sparql}); assert.equal(value.truncated, false); assert.equal(value.rows.length, value.count); return value.rows;};
const facts = graph => query(`SELECT ?s ?p ?o WHERE { GRAPH <${graph}> { ?s ?p ?o } } ORDER BY ?s ?p ?o LIMIT 100`);
const ask = id => ({id: 'https://example.test/request/' + id, revision: 1, seed: boundary.itemPrefix + 'one', itemRevision: 7, title: 'Synthetic curator request', options: ['Yes', 'No'], actions: ['choose', 'later', 'comment'], expiresAt: 2000000000});
const plan = (next, previous = null) => publicationPlan({boundary, next, previous, now: 1});
async function noChange(p, label) {const before = await facts(boundary.requestGraph); assert.equal(publicationReport(await update(p.query), p), 'NO_CHANGE'); assert.deepEqual(await facts(boundary.requestGraph), before); results.push({case: label, no_partial_request_mutation: true});}
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {assert(!ended, logs); try {await http('/health'); ready = true; break;} catch {await new Promise(resolve => setTimeout(resolve, 100));}}
  assert(ready, 'Candidate did not become ready');
  const version = await http('/version'); assert.equal(version.git_dirty, false);
  for (const graph of Object.values(boundary).slice(0, 3)) await http('/graph/create', {graph});
  await update(`INSERT DATA { GRAPH <${boundary.itemGraph}> { <${boundary.itemPrefix}one> <${boundary.revisionPredicate}> 7 ; <${boundary.statusPredicate}> <${boundary.openStatus}> . } }`);
  const itemBefore = await facts(boundary.itemGraph), answersBefore = await facts(boundary.answerGraph);
  assert.equal(itemBefore.length, 2); assert.equal(answersBefore.length, 0);
  const first = ask('normal'), initial = plan(first);
  assert.equal(publicationReport(await update(initial.query), initial), 'CHANGED');
  await noChange(initial, 'identical-first-replay');
  const next = {...first, revision: 2, title: 'Quotes " and newline\nwith Unicode λ; } INSERT DATA { nope'};
  const advanced = plan(next, first); assert.equal(publicationReport(await update(advanced.query), advanced), 'CHANGED');
  const retained = await facts(boundary.requestGraph);
  assert.equal(retained.filter(r => r.s === revisionIri(first)).length, 1);
  assert.equal(retained.find(r => r.s === revisionIri(first)).o, requestPublication(first, boundary).datums[1].o.value);
  results.push({case: 'initial-and-next', exact_old_manifest_retained: true, escaped_text_is_data: true});
  await noChange(plan({...next, title: 'Competing payload'}, first), 'stale-revision');
  for (const [name, delta] of [['changed-item', {itemRevision: 8}], ['foreign-item', {seed: boundary.itemPrefix + 'absent'}]]) await noChange(plan({...ask(name), ...delta}), name);
  await update(`INSERT DATA { GRAPH <${boundary.itemGraph}> { <${first.seed}> <${boundary.revisionPredicate}> 8 . } }`);
  await noChange(plan(ask('ambiguous-item')), 'ambiguous-item-revision');
  await update(`DELETE DATA { GRAPH <${boundary.itemGraph}> { <${first.seed}> <${boundary.revisionPredicate}> 8 . } }`);
  await update(`INSERT DATA { GRAPH <${boundary.itemGraph}> { <${first.seed}> <${boundary.statusPredicate}> <urn:closed> . } }`);
  await noChange(plan(ask('ambiguous-status')), 'ambiguous-item-status');
  await update(`DELETE DATA { GRAPH <${boundary.itemGraph}> { <${first.seed}> <${boundary.statusPredicate}> <${boundary.openStatus}> . } }`);
  await noChange(plan(ask('closed')), 'closed-item');
  await update(`DELETE { GRAPH <${boundary.itemGraph}> { <${first.seed}> <${boundary.statusPredicate}> <urn:closed> . } } INSERT { GRAPH <${boundary.itemGraph}> { <${first.seed}> <${boundary.statusPredicate}> <${boundary.openStatus}> . } } WHERE {}`);
  await update(`INSERT DATA { GRAPH <${boundary.requestGraph}> { <${first.id}> <${NS}currentRevision> 999 . } }`);
  await noChange(plan({...next, revision: 3}, next), 'ambiguous-current-head');
  const occupied = ask('occupied'); await update(`INSERT DATA { GRAPH <${boundary.requestGraph}> { <${revisionIri(occupied)}> <urn:unexpected> "occupied" . } }`);
  await noChange(plan(occupied), 'occupied-immutable-revision');
  const race = ask('race'), race2 = {...race, title: 'Other curator'};
  const outcomes = await Promise.all([plan(race), plan(race2)].map(async p => publicationReport(await update(p.query), p)));
  assert.deepEqual(outcomes.sort(), ['CHANGED', 'NO_CHANGE']); results.push({case: 'concurrent-different-payload', exactly_one_atomic_publication: true});
  const custody = join(root, 'custody'); await mkdir(custody, {mode: 0o700});
  const jobRequest = ask('lost-reply'), jobInput = {boundary, next: jobRequest, previous: null, now: 1};
  const storeId = (await http('/watermark')).store_id; let sends = 0;
  const registered = (await http('/graphs?graph=' + encodeURIComponent(boundary.requestGraph))).graphs[0];
  const options = {directory: custody, storeId, registration: {iri: registered.iri, creation: registered.creation}, inspect: async graph => {
    const [identity, metadata] = await Promise.all([http('/watermark'), http('/graphs?graph=' + encodeURIComponent(graph))]);
    assert.equal(metadata.count, 1); assert.equal(metadata.graphs.length, 1);
    return {storeId: identity.store_id, graph: metadata.graphs[0]};
  }, send: async text => {sends++; await update(text); throw Error('Synthetic dropped response after native commit');}, readBack: async id => {
    const identity = (await http('/watermark')).store_id;
    const rows = await query(`SELECT ?revision ?manifest WHERE { GRAPH <${boundary.requestGraph}> { <${id}> <${NS}currentRevision> ?revision . <${revisionIri(jobRequest)}> <${NS}requestManifest> ?manifest . } } LIMIT 3`);
    assert.equal(rows.length, 1);
    return {storeId: identity, requestRow: {graph: boundary.requestGraph, requestId: id, currentRevision: rows[0].revision, revisionIri: revisionIri(jobRequest), manifest: rows[0].manifest, complete: true}};
  }};
  assert.equal((await new CuratorJob(options).publish(jobInput)).state, 'UNKNOWN');
  const recovered = await new CuratorJob(options).reconcile({...jobInput, now: jobRequest.expiresAt + 1});
  assert.equal(recovered.state, 'CONFIRMED'); assert.equal(recovered.sent, false); assert.equal(sends, 1);
  results.push({case: 'native-commit-lost-response-restart', read_only_recovery: true, sends});
  assert.deepEqual(await facts(boundary.itemGraph), itemBefore); assert.deepEqual(await facts(boundary.answerGraph), answersBefore);
  results.push({case: 'graph-mutation-boundary', positive_item_control_unchanged: true, answer_graph_unchanged: true});
  console.log(JSON.stringify({candidate: version, candidate_sha256: hash, synthetic_loopback_only: true, real_credential_used: false, production_authority_proven: false, results}, null, 2));
} catch (error) {console.error(logs); throw error;}
finally {
  clearTimeout(budget); if (!ended) child.kill('SIGTERM');
  const escalation = setTimeout(() => {if (!ended) child.kill('SIGKILL');}, 3000);
  await exit; clearTimeout(escalation); await rm(root, {recursive: true, force: true});
}
