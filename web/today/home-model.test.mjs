import test from 'node:test';
import assert from 'node:assert/strict';
import {askRows, priorityRows, digest, logEntries,decisionView,deploymentGroups,serviceLabel,questionLabel} from './home-model.mjs';

const now = Date.parse('2026-10-21T15:00:00Z');
const ask = (id, extra = {}) => ({id, title: 'Decide ' + id, priority: 1, status: 'open', owner: 'https://seeds.local/principal/stiwi', gates: ['desk'], ...extra});
const p0 = (id, extra = {}) => ({id, title: 'Land ' + id, priority: 0, status: 'in_progress', owner: 'https://seeds.local/principal/tim', rank: 2, revision: 3, modified: '2026-10-21T14:00:00Z', ...extra});
const deploys = {rows: [{event: 'e1', occurredAt: '2026-10-21T10:03:40Z', outcome: 'succeeded', service: 'homelab-mcp', artifact: 'pkg:x@1', environment: 'automation'},
  {event: 'e2', occurredAt: '2026-10-21T09:00:00Z', outcome: 'rolledback', service: null, artifact: null, environment: null}],
  counts: {succeeded: 1, rolledback: 1, failed: 0}};
const stats = {active_work: {P0: {open: 2, in_progress: 1}, P1: {open: 5}}, active_inbox: 7};

test('asks and priorities map into the existing renderer shapes with live provenance', () => {
  const a = askRows({rows: [ask('aegis-a'), ask('aegis-b', {owner: undefined, gates: ['desk', 'needs-stiwi']})]});
  assert.deepEqual(a.map(r => [r.collection, r.payload.order, r.payload.item]), [['asks', 0, 'aegis-a'], ['asks', 1, 'aegis-b']]);
  assert.equal(a[0].payload.where, 'P1 · open · stiwi · desk');
  assert.equal(a[1].payload.where, 'P1 · open · unassigned · desk, needs-stiwi');
  const p = priorityRows([p0('aegis-x'), p0('aegis-y', {rank: null, owner: undefined, status: 'open'})]);
  assert.deepEqual(p.map(r => [r.payload.rank, r.payload.item, r.payload.owner, r.payload.state]), [[1, 'aegis-x', 'tim', 'in progress'], [2, 'aegis-y', null, 'open']]);
  assert.match(p[1].payload.next, /rank unranked · revision 3/);
  assert.deepEqual(askRows(null), []);
  assert.deepEqual(priorityRows(null), []);
});

test('the digest reports each live panel and says UNKNOWN for an unread one, never zero', () => {
  const full = digest({asks: {rows: [ask('aegis-a')], hasMore: false}, priorities: [p0('aegis-x')], deploys, stats}, now);
  assert.equal(full.headline, '1 item needs you first.');
  assert.equal(full.known, 4);
  assert.deepEqual(full.points.slice(0, 4), ['1 item needs you.', '1 P0 item is open or in progress.',
    '2 deploys in the last 24h: 1 succeeded, 1 rolled back, 0 failed.', 'Board: 3 active P0, 5 active P1, 7 active inbox.']);
  assert.ok(full.points.includes('Needs you: aegis-a Decide aegis-a') && full.points.includes('P0: aegis-x Land aegis-x'));
  const partial = digest({asks: null, priorities: [], deploys: null, stats: null}, now);
  assert.equal(partial.known, 1);
  assert.match(partial.points[0], /UNKNOWN/); assert.match(partial.points[2], /UNKNOWN/); assert.match(partial.points[3], /UNKNOWN/);
  assert.equal(partial.points[1], '0 P0 items are open or in progress.');
  // Not read yet (undefined) is 'checking', distinct from a failed read (null).
  const pending = digest({}, now);
  assert.equal(pending.headline, 'Checking live data…');
  assert.ok(pending.points.slice(0, 4).every(x => x.endsWith('checking…')), pending.points);
  assert.ok(!pending.points.some(x => /UNKNOWN|failed/.test(x)));
  assert.equal(digest({asks: null, priorities: null, deploys: null, stats: null}, now).headline, 'Live data is unavailable right now.');
  assert.equal(digest({asks: {rows: [], hasMore: false}}, now).headline, 'Nothing is waiting on you in the live board right now.');
});

test('the log is deploy events newest first with explicit UNKNOWN fields', () => {
  const log = logEntries(deploys);
  assert.deepEqual(log.map(e => e.headline), ['homelab-mcp deploy succeeded', 'unknown service deploy rolledback']);
  assert.deepEqual(log[1].points, ['environment UNKNOWN', 'artifact UNKNOWN']);
  assert.deepEqual(logEntries(null), []);
});

// aegis-amcw: the measured false-clear headline occurred with priorities and
// deploys ready while the asks source was still pending (or had failed).
test('an unavailable asks source can never claim nothing needs the operator',()=>{
  for(const asks of [undefined,null]){
    const view=digest({asks,priorities:[p0('aegis-positive')],deploys,stats:null},now);
    assert.match(view.headline,/Needs-you status is unavailable/);
    assert.doesNotMatch(view.headline,/Nothing is waiting/);
  }
});

test('decision lead ranks explicit questions by priority then oldest; preserves every other row once',()=>{
  const rows=[ask('policy',{title:'Every question must stay visible',priority:0,created:'2026-01-01T00:00:00Z'}),
    ask('new',{title:'ASK Stiwi: New question?',priority:0,created:'2026-10-22T00:00:00Z'}),
    ask('old',{title:'ASK Stiwi: Old question?',priority:0,created:'2026-10-01T00:00:00Z'}),
    ask('normal',{title:'ASK Stiwi: Normal question?',priority:2,created:'2026-01-01T00:00:00Z'}),
    ask('high',{title:'ASK Stiwi: High question?',priority:1,created:'2026-10-01T00:00:00Z'}),
    ask('unknown',{title:'ASK Stiwi: Date unknown?',priority:1,created:undefined})];
  const before=JSON.stringify(rows),d=decisionView({rows});
  assert.deepEqual(d.featured.map(r=>r.id),['old','new','high']);
  assert.deepEqual(d.remaining.map(r=>r.id),['policy','unknown','normal']);
  assert.equal(new Set([...d.featured,...d.remaining].map(r=>r.id)).size,rows.length);
  assert.equal(JSON.stringify(rows),before,'ranking mutated the validated source');
  assert.deepEqual(decisionView(null),{featured:[],remaining:[],total:0});
  assert.equal(questionLabel('ASK Stiwi: Export logs?'),'Export logs?');
});
test('deployment groups retain each outcome and use plain service names without counting rollbacks as applied',()=>{
  const d={rows:[{service:'shacl_quipu_config',outcome:'succeeded',occurredAt:'2026-10-22T10:00:00Z'},
    {service:'shacl_quipu_config',outcome:'rolledback',occurredAt:'2026-10-22T11:00:00Z'},
    {service:'quipu',outcome:'succeeded',occurredAt:'2026-10-22T12:00:00Z'}]};
  const groups=deploymentGroups(d);assert.equal(groups.length,2);
  assert.equal(groups[0].label,'Quipu settings change');assert.equal(groups[0].succeeded,1);assert.equal(groups[0].rolledback,1);assert.equal(groups[0].failed,0);
  assert.equal(groups[1].label,'Quipu');assert.equal(serviceLabel('constructor'),'constructor');assert.equal(serviceLabel(null),'Unnamed service');
  assert.deepEqual(deploymentGroups(null),[]);
});
