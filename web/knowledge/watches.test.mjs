import test from 'node:test';
import assert from 'node:assert/strict';
import {WATCHES,WATCH_GRAPH,watchDefinition,watchParams,expandedWatch,validateWatch,readWatches,sourceURL,renderWatches} from './watches.mjs';
const now=Date.parse('2026-10-20T04:30:00Z'),params=watchParams(now),def=watchDefinition(WATCHES[0]);
const ns='http://aegis.gastown.local/ontology/';
const row={run:ns+'fixture-run',episode:ns+'episode_fixture',checked:'2026-10-20T04:22:13Z',runDate:'2026-10-20',archive:'archive/notes.md',finding:ns+'fixture-finding',title:'Source finding',date:'2026-10-13',kind:'idea',url:'https://example.org/paper',angle:'A declared source angle'};
const response=rows=>({query:def.name,sparql:expandedWatch(def,params),truncated:false,count:rows.length,rows});
test('existing typed run/finding contract retains facts, missing status/confidence UNKNOWN',()=>{
 const [r]=validateWatch(response([row]),def,params,now);assert.equal(r.title,row.title);assert.equal(r.runStatus,'UNKNOWN');assert.equal(r.confidence,'UNKNOWN');assert.equal(r.archive,row.archive);assert.equal(r.sourceKind,'Observation');
 assert(def.template.includes('a:hasFinding'));assert(def.template.includes('a:Observation'));assert.equal(def.graph,WATCH_GRAPH);assert(!def.template.includes('GRAPH <'+WATCH_GRAPH+'>'));assert(def.template.includes('LIMIT 101'));assert(!def.template.includes('GRAPH ?'));
 assert.equal(watchDefinition(WATCHES[1]),null);assert.equal(watchDefinition(WATCHES[2]),null);
});
test('unknown coverage, changed query, bounds and mixed provenance refuse',()=>{
 for(const bad of [response([]),{...response([row]),query:'other'},{...response([row]),sparql:'SELECT * {}'},{...response([row]),truncated:true},{...response([row]),count:2},response(Array(101).fill(row)),response([row,row]),response([row,{...row,finding:ns+'other',episode:ns+'foreign'}])])assert.throws(()=>validateWatch(bad,def,params,now));
});
test('foreign identity, unsafe source, malformed and future facts refuse',()=>{
 for(const changed of [{run:'https://foreign.example/run'},{episode:'javascript:alert(1)'},{checked:'2027-01-01T00:00:00Z'},{title:''},{date:'2027-01-01'},{date:'2026-02-30'},{runDate:'2026-02-30'},{finding:ns+'../foreign'},{url:'javascript:alert(1)'},{url:'https://user:secret@example.org/'},{archive:''}])assert.throws(()=>validateWatch(response([{...row,...changed}]),def,params,now));
 assert.throws(()=>sourceURL('file:///private/archive'));assert.equal(sourceURL(undefined),null);
});
test('no linked finding never invents success or a healthy zero',()=>{
 const {finding,title,date,kind,url,angle,...run}=row;const [r]=validateWatch(response([run]),def,params,now);assert.equal(r.finding,undefined);assert.equal(r.runStatus,'UNKNOWN');
 assert.throws(()=>validateWatch(response([{...run,title:'orphan'}]),def,params,now));
});
test('independent default-OFF admission does ZERO requests; admitted source uses named ask only',async()=>{
 let count=0;const request=async(path,body)=>{count++;assert.equal(path,'/ask');assert.deepEqual(Object.keys(body).sort(),['name','params']);return response([row]);};
 const signal=new AbortController().signal;
 for(const watches of [undefined,{enabled:false},{enabled:true},{enabled:true,graph:WATCH_GRAPH,registrationReceipt:'fixture'}]){
  const r=await readWatches({config:{enabled:true,watches},request,signal,now});assert.equal(r.semweb.state,'UNKNOWN');assert.equal(count,0);
 }
 const config={watches:{enabled:true,graph:WATCH_GRAPH,registrationReceipt:'FIXTURE',readCostReceipt:'FIXTURE'}};
 const r=await readWatches({config,request,signal,now});assert.equal(count,1);assert.equal(r.semweb.rows[0].finding,row.finding);assert.equal(r.gas_city.state,'UNKNOWN');assert.equal(r.external.state,'UNKNOWN');
});
class Node{constructor(doc){this.ownerDocument=doc;this.children=[];this.textContent='';}append(...c){this.children.push(...c);}get text(){return this.textContent+this.children.map(x=>x.text??'').join(' ');}set innerHTML(_){throw Error('Unsafe HTML');}}
test('render source facts safely with provenance, grouped watches, unknown coverage and no invented pick',()=>{
 const doc={createElement:()=>new Node(doc)};
 const node=renderWatches(doc,{watches:{semweb:{state:'observed',rows:validateWatch(response([{...row,title:'<script>source text</script>'}]),def,params,now)}}});
 assert(node.text.includes('<script>source text</script>'));assert(node.text.includes('Gas City / Beads'));assert(node.text.includes('Quipu external references'));assert(node.text.includes('Watch coverage UNKNOWN'));assert(node.text.includes('no pick/approval is inferred'));assert(node.text.includes('status UNKNOWN'));
});

test('new-since-browser-view state is local, bounded, and never advances UNKNOWN coverage',async()=>{
 const {watchSeen,rememberWatches}=await import('./watches.mjs');const data=new Map();const storage={getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
 assert.deepEqual(watchSeen(storage,now),{});
 data.set('brief-watch-seen-v1:semweb',String(now+1));assert.deepEqual(watchSeen(storage,now),{});
 data.set('brief-watch-seen-v1:semweb','garbage');assert.deepEqual(watchSeen(storage,now),{});
 data.clear();rememberWatches(storage,{checkedAt:now,watches:{semweb:{state:'observed'},external:{state:'UNKNOWN'}}});assert.deepEqual(watchSeen(storage,now),{semweb:now});assert.equal(data.size,1);
 assert.deepEqual(watchSeen({getItem(){throw Error('denied');}},now),{});
});
