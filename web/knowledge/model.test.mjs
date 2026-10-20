import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GRAPH,queryRows,validatePanel,registryProof,windowParams} from './model.mjs';
import {KnowledgeClient} from './client.mjs';
import {renderView} from './view.mjs';
const definitions=JSON.parse(readFileSync(new URL('./query-definitions.json',import.meta.url)));
const now=Date.parse('2026-10-20T04:00:00.000Z');
const creation={actor:'fixture',timestamp:'2026-10-19T00:00:00Z'};
const registry={graphs:[{iri:GRAPH,g:7,class:'committed',creation}]};
const config={enabled:true,endpoint:'https://quipu.example',sourceVersion:'fixture-source',registration:{iri:GRAPH,creation},readCostReceipt:'FIXTURE ONLY'};
const row=(id='demo-one',extra={})=>({item:'https://example.test/item/'+id,id,title:'Source title',priority:1,rank:0.6,status:'open',revision:3,modified:'2026-10-19T00:00:00Z',sourceKind:'declared',...extra});
function response(panel,rows,params={}){let sparql=definitions[panel].template;for(const [k,v]of Object.entries(params))sparql=sparql.replaceAll('{'+k+'}',v);return {query:definitions[panel].name,sparql,rows,count:rows.length,truncated:false};}
test('registry exact named graph, generation and committed class',()=>{
  assert.equal(registryProof(registry,config.registration).graph,GRAPH);
  for(const bad of [{graphs:[]},{graphs:[{...registry.graphs[0],g:0}]},{graphs:[{...registry.graphs[0],creation:{actor:'other'}}]},{graphs:[...registry.graphs,...registry.graphs]}])assert.throws(()=>registryProof(bad,config.registration));
});
test('definition, truncation, count, sentinel and graph negatives',()=>{
  assert.equal(queryRows(response('next',[row()]),definitions.next).length,1);
  for(const bad of [{...response('next',[]),query:'foreign'},{...response('next',[]),sparql:'SELECT * {}'},{...response('next',[]),truncated:true},{...response('next',[]),count:2},response('next',Array(41).fill(row()))])assert.throws(()=>queryRows(bad,definitions.next));
  assert.throws(()=>validatePanel('next',[row('demo-one',{item:'https://foreign/item/demo-one'})],now));
});
test('priority then fractional rank, unranked last; real revisions retained',()=>{
  const result=validatePanel('next',[row('demo-unranked',{rank:undefined}),row('demo-b',{rank:.8}),row('demo-a',{rank:.6}),row('demo-p0',{priority:0,rank:20})],now);
  assert.deepEqual(result.map(r=>r.id),['demo-p0','demo-a','demo-b','demo-unranked']);assert.equal(result[1].revision,3);
});
test('missing required fields, future time, invalid status, duplicate and mixed revisions refuse',()=>{
  for(const r of [row('demo-one',{revision:undefined}),row('demo-one',{modified:'2027-01-01T00:00:00Z'}),row('demo-one',{priority:9}),row('demo-one',{status:'closed'}),row('demo-one',{title:''})])assert.throws(()=>validatePanel('next',[r],now));
  assert.throws(()=>validatePanel('closes',[row(),row()],now));
  assert.throws(()=>validatePanel('asks',[row('demo-one',{gate:'desk'}),row('demo-one',{gate:'needs-stiwi',revision:4})],now));
});
test('positive graph control required even when visible selection empty',()=>{
  assert.throws(()=>validatePanel('coverage',[],now));
  assert.equal(validatePanel('coverage',[{item:row().item,revision:3}],now).length,1);
  assert.deepEqual(validatePanel('next',[],now),[]);
});
test('human gate facts never synthesize decisions; semantic confidence retained',()=>{
  const r=validatePanel('asks',[row('demo-one',{gate:'desk',confidence:'INFERRED'})],now)[0];assert.equal(r.confidence,'INFERRED');assert.equal(r.gate,'desk');assert.equal(r.decision,undefined);
  assert.throws(()=>validatePanel('asks',[row('demo-one',{gate:'approved'})],now));
});
function harness({badPanel=null,emptyControl=false}={}){
  let current=row();const calls=[],views=[],statuses=[],timers=[];let inflight=0,peak=0;
  const request=async(url,{body,signal}={})=>{
    calls.push({url,body});assert(!signal.aborted);inflight++;peak=Math.max(peak,inflight);await Promise.resolve();inflight--;
    if(new URL(url).pathname==='/graphs')return structuredClone(registry);
    assert.equal(new URL(url).pathname,'/ask');assert.equal(Object.keys(body).sort().join(','),'name,params');
    const panel=Object.keys(definitions).find(k=>definitions[k].name===body.name);assert(panel);
    if(panel===badPanel)throw Error('source unavailable');
    const rows=panel==='coverage'?(emptyControl?[]:[{item:row().item,revision:3}]):panel==='next'?[current]:[];
    return response(panel,rows,body.params);
  };
  const c=new KnowledgeClient({config,definitions,request,render:v=>views.push(v),status:s=>statuses.push(s),now:()=>now,schedule:(fn,ms)=>{const t={fn,ms,cancelled:false};timers.push(t);return t;},cancel:t=>{if(t)t.cancelled=true;}});
  return {c,calls,views,statuses,timers,change:r=>{current=r;},peak:()=>peak};
}
test('priority/rank/status change appears in one normal poll, with zero agent action',async()=>{
  const h=harness();await h.c.start();assert.equal(h.views[0].panels.next.rows[0].status,'open');assert(h.peak()<=2);
  h.change(row('demo-one',{priority:0,rank:.2,status:'in_progress',revision:4}));
  const timer=h.timers.findLast(t=>!t.cancelled);assert.equal(timer.ms,15000);await timer.fn();
  // Timer callbacks start an async tick; flush that one flight.
  for(let i=0;i<30&&h.c.busy;i++)await Promise.resolve();
  const r=h.views.at(-1).panels.next.rows[0];assert.equal(r.revision,4);assert.equal(r.priority,0);assert.equal(r.status,'in_progress');
  assert.equal(h.views.at(-1).snapshotTx,null);assert(h.calls.every(c=>!c.url.includes('daily-brief/aegis')));
  h.c.pause();
});
test('missing/stale/partial evidence never produces healthy zero statistics',async()=>{
  const h=harness({badPanel:'closes'});await h.c.start();assert.equal(h.views[0].summary,null);assert.equal(h.views[0].panels.closes.state,'UNKNOWN');assert.match(h.statuses.at(-1),/Partial/);assert.equal(h.timers.findLast(t=>!t.cancelled).ms,30000);h.c.pause();
  const z=harness({emptyControl:true});await z.c.start();assert(z.views[0].unavailable);assert.equal(z.calls.length,2);z.c.pause();
});
test('hidden tab cancels future polls; disabled preview and missing admission do no network',async()=>{
  const h=harness();await h.c.start();h.c.pause();const n=h.calls.length;assert(h.timers.every(t=>t.cancelled));assert.equal(h.calls.length,n);assert.match(h.statuses.at(-1),/hidden/);
  const off=harness();off.c.config={...config,enabled:false};await off.c.start();assert.equal(off.calls.length,0);
  const denied=harness();denied.c.config={...config,readCostReceipt:null};assert.throws(()=>denied.c.start());assert.equal(denied.calls.length,0);
});
test('close windows reject out-of-range observations and absent reason remains unknown',()=>{
  const p=windowParams(now);assert.throws(()=>validatePanel('closes',[row('demo-one',{closed:'2025-01-01T00:00:00Z'})],now,p));
  const r=validatePanel('closes',[row('demo-one',{closed:'2026-10-19T00:00:00Z'})],now,p);assert.equal(r[0].reason,undefined);
  const boundary={start:'2026-10-19T00:00:00.000Z',end:'2026-10-20T00:00:00.000Z'};
  assert.equal(validatePanel('closes',[row('demo-one',{closed:'2026-10-19T00:00:00Z'})],now,boundary).length,1);
  assert.throws(()=>validatePanel('closes',[row('demo-one',{closed:'2026-10-20T00:00:00Z'})],now,boundary));
});
test('server Retry-After survives client failure backoff',async()=>{
  const h=harness();h.c.request=async()=>{throw Object.assign(Error('busy'),{retryAfter:120000});};
  await h.c.start();assert.equal(h.timers.findLast(t=>!t.cancelled).ms,120000);assert.match(h.statuses.at(-1),/120s/);h.c.pause();
});
test('a cancelled flight cannot commit or strand a visible-tab resume',async()=>{
  const h=harness();const first=h.c.start();h.c.pause();const second=h.c.start();await first;await second;
  assert.equal(h.views.length,0);const timer=h.timers.findLast(t=>!t.cancelled);assert.equal(timer.ms,0);timer.fn();for(let i=0;i<35&&h.c.busy;i++)await Promise.resolve();assert.equal(h.views.length,1);h.c.pause();
});
test('render source text literally and name every panel query plus explicit unknowns',()=>{
  class Node{constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.textContent='';}append(...n){this.children.push(...n);}replaceChildren(...n){this.children=n;}set innerHTML(_){throw Error('Unsafe markup');}}
  const doc={createElement:t=>new Node(t,doc),createDocumentFragment:()=>new Node('fragment',doc)},root=new Node('root',doc);
  renderView(root,{checkedAt:now,panels:{next:{state:'observed',rows:validatePanel('next',[row('demo-one',{title:'<script>hostile</script>'})],now)}},sourceVersion:'fixture',snapshotTx:null},definitions);
  const text=n=>[n.textContent,...n.children.map(text)].join(' ');assert.match(text(root),/<script>hostile<\/script>/);for(const k of ['next','asks','closes','dependencies','epics'])assert(text(root).includes(definitions[k].name));assert.match(text(root),/snapshot tx UNKNOWN/);assert.match(text(root),/typed event\/query\/producer coverage not yet attributed/);
});
