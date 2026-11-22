// # arming: agent-invoked offline preparation; no endpoint or key generation.
import {readFileSync} from 'node:fs';
import {resolve, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {assessPacket} from './admission/ask-packet.mjs';
import {readAnswer, disposition} from '../web/deck/evidence.mjs';
import {settlementBinding, applySettlement} from '../web/deck/settlement.mjs';
import {boundary, who, ask, make, evidence, action} from '../tests/deck-fixture.mjs';
const args = process.argv.slice(2);
if (args.length !== 3 || !isAbsolute(args[1]) || !/^[0-9a-f]{64}$/.test(args[2])) throw Error('Usage: node scripts/rehearse-ask-admission.mjs PACKET ABSOLUTE_SEEDS_DEMO SHA256');
const packet = assessPacket(JSON.parse(readFileSync(args[0], 'utf8')));
const binary = resolve(args[1]);
if (createHash('sha256').update(readFileSync(binary)).digest('hex') !== args[2]) throw Error('Seeds fixture binary changed');
const run = spawnSync(binary, [], {encoding: 'utf8', timeout: 15000, maxBuffer: 65536, env: {}});
if (run.error || run.status !== 0) throw Error('Pinned Seeds in-memory fixture failed');
assert.match(run.stdout, /Ask=closed revision=2, linked work=open revision=2, linked comments=1/);
assert.match(run.stdout, /Read-only recovery: same receipt, still one ruling, transaction unchanged/);
const request = {...ask, settlement: {target: boundary.itemPrefix + 'linked', targetRevision: 12}};
const freshTarget = {graph: boundary.itemGraph, seed: request.settlement.target, revision: 12};
const p = make({ask: request, freshTarget}), e = await evidence(p);
const accepted = await readAnswer(e.row, e.response, request, boundary, who);
const binding = settlementBinding(accepted, request, boundary);
assert.equal(disposition([accepted], request, boundary).state, 'ANSWERED');
assert.throws(() => disposition([accepted, accepted], request, boundary));
assert.throws(() => settlementBinding({...accepted}, request, boundary));
assert.throws(() => settlementBinding(accepted, {...request, settlement: {...request.settlement, targetRevision: 13}}, boundary));
await assert.rejects(() => readAnswer(e.row, {...e.response, verified: false}, request, boundary, who));
// Mutate a real target datum, not merely a renderer label.
const changed = JSON.parse(e.row.manifest); changed.datums.find(d => d.p.endsWith('settlementTarget')).o.value += '-foreign';
await assert.rejects(() => readAnswer({...e.row, manifest: JSON.stringify(changed)}, e.response, request, boundary, who));
let sends = 0, reads = 0;
const result = {...binding, askRevision: 8, targetRevision: 13, commentIndex: 1, complete: true};
const native = {settle: async () => {sends++; throw Error('lost response');}, reconcile: async () => {reads++; return result;}};
const input = {enabled: true, native, answer: accepted, ask: request, boundary};
await assert.rejects(() => applySettlement(input));
await applySettlement({...input, recover: true});
assert.deepEqual([sends, reads], [1, 1]);
const later = await evidence(make({ask: request, freshTarget, action: {...action, action: 'later', optionLabel: null}}));
const laterAnswer = await readAnswer(later.row, later.response, request, boundary, who);
assert.throws(() => settlementBinding(laterAnswer, request, boundary));
console.log(JSON.stringify({...packet, fixture: {seedsBinarySha256: args[2],
  atomicSmoke: 'PASS_REAL_IN_MEMORY_SEEDS_TRANSACTION',
  alteredManifest: 'PASS_SOURCE_REJECTION', duplicateOperation: 'PASS_SOURCE_REJECTION',
  lostReply: 'PASS_ONE_SEND_READ_ONLY_RECOVERY', laterDoesNotClose: 'PASS',
  nativeCryptographicForgery: 'UNKNOWN_NOT_EXERCISED', nativeReplay: 'UNKNOWN_NOT_EXERCISED',
  productionSmoke: 'UNKNOWN_NOT_AUTHORIZED', humanCeremony: 'UNKNOWN_NOT_AUTHORIZED'},
  limits: 'Receipt/writer/native admission fixtures are synthetic. No network, key generation, enrollment or production credential is used.'}, null, 2));
