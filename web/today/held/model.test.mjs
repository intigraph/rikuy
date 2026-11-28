import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderStored} from '../stored-query.mjs';
import {decodeHead,ownerBatches,decodeWork,heldReader,heldSummary,ephemeralAgent,HELD_COLLAPSE_OWNERS,heldTitleReader,HELD_TITLE_READS} from './model.mjs';
const headDef=JSON.parse(fs.readFileSync(new URL('./head.json',import.meta.url))),workDef=JSON.parse(fs.readFileSync(new URL('./work.json',import.meta.url))),now=Date.parse('2026-10-24T15:00:00Z');
const reply=(def,rows,params={})=>({query:def.name,sparql:renderStored(def,params),rows,count:rows.length,truncated:false});
const entry=(agent='worker',revision=1,state='stopped')=>({agent,revision,state,contract:'shantytown-owned-work/v1',generation:'generation-1',observed_at:now/1000-60,fact:headDef.onto+'owned-work-'+revision.toString(16).padStart(64,'0')});
const head=(agents=[entry()],revision=1)=>({contract:'shantytown-owned-work-head/v1',source:headDef.producer,host:headDef.host,revision,state_revision:Math.max(...agents.map(x=>x.revision)),complete:true,source_agents:agents.length,agents});
const body=value=>reply(headDef,[{payload:JSON.stringify(value)}]);
const item=(id='aegis-fixture',owner=headDef.principalPrefix+'worker')=>({id,item:'https://seeds.local/item/'+id,title:'A real item',priority:0,status:'open',owner,revision:1,modified:'2026-10-24T14:59:00Z'});
test('fresh stop and ceiling observations expose owner-scoped work batches',()=>{
  const view=decodeHead(body(head([entry(),entry('second',2,'ceiling'),entry('live',3,'live')])),headDef,now);
  assert.equal(view.complete,true);assert.equal(ownerBatches(view)[0].owners.length,2);
});
test('expired evidence is UNKNOWN, not a healthy empty crew',()=>{
  const value=head();value.agents[0].observed_at=now/1000-1800;
  const view=decodeHead(body(value),headDef,now);assert.equal(view.states[0].status,'UNKNOWN');assert.equal(view.complete,false);assert.equal(view.unknown,1);
});
test('empty and truncated head reads refuse',()=>{
  assert.throws(()=>decodeHead(reply(headDef,[]),headDef,now),/No bounded/);
  const r=body(head());r.truncated=true;assert.throws(()=>decodeHead(r,headDef,now),/Incomplete/);
});
test('another host or producer is not the same owner scope',()=>{
  for(const key of ['host','source']){const value=head();value[key]='other';assert.throws(()=>decodeHead(body(value),headDef,now),/scope/);}
});
test('a newer head cannot carry an older per-agent revision',()=>{
  const cache={};decodeHead(body(head([entry('worker',5)],5)),headDef,now,cache);
  assert.throws(()=>decodeHead(body(head([entry('worker',4)],6)),headDef,now,cache),/Older agent/);
  assert.throws(()=>decodeHead(body(head([entry('worker',6)],4)),headDef,now,cache),/replay/);
});
test('same head revision with changed content refuses, while a restart advances',()=>{
  const cache={};decodeHead(body(head()),headDef,now,cache);
  assert.throws(()=>decodeHead(body(head([entry('worker',2,'live')],1)),headDef,now,cache),/conflicting/);
  assert.equal(decodeHead(body(head([entry('worker',2,'live')],2)),headDef,now,cache).states[0].status,'live');
});
test('duplicate owners, impossible times, and revision overflow refuse',()=>{
  for(const value of [head([entry(),entry()]),head([{...entry(),observed_at:now/1000+10000}]),{...head(),revision:2**54}])assert.throws(()=>decodeHead(body(value),headDef,now));
});
test('partial coverage stays explicit and no more than five owner batches are built',()=>{
  const value=head(Array.from({length:100},(_,i)=>entry('worker'+i,i+1)));value.complete=false;
  assert.equal(decodeHead(body(value),headDef,now).complete,false);
  assert.equal(ownerBatches(decodeHead(body(value),headDef,now)).length,5);
});
const projectionRow=(i=0)=>({entity:workDef.itemPrefix+'aegis-f'+i,graph:workDef.graph,key:'open',key_plain:true,multi:false,columns:{assignee:{iri:headDef.principalPrefix+'worker'},priority:0,updated:'2026-10-24T14:59:00Z'}});
const projection=rows=>({rows,truncated:false,multi_valued_rows:0,tx:123});
test('projection validates a bounded page and exact continuation cursor',()=>{
 const owners=[headDef.principalPrefix+'worker'],rows=Array.from({length:50},(_,i)=>projectionRow(i));
 const out=decodeWork({...projection(rows),truncated:true,next_after:{entity:rows.at(-1).entity,graph:workDef.graph}},workDef,owners);assert.equal(out.rows.length,50);assert.equal(out.more,true);assert.equal(out.tx,123);
 rows[49].columns.assignee={iri:'urn:foreign'};assert.throws(()=>decodeWork(projection(rows),workDef,owners),/Foreign/);
});
test('projection refuses multi values, foreign graph, invalid priority and oversized replies',()=>{
 const owners=[headDef.principalPrefix+'worker'];
 for(const mutate of [r=>r.multi=true,r=>r.graph='urn:foreign',r=>r.key='closed',r=>r.columns.priority=9]){const row=projectionRow();mutate(row);assert.throws(()=>decodeWork(projection([row]),workDef,owners));}
 assert.throws(()=>decodeWork(projection(Array.from({length:51},(_,i)=>projectionRow(i))),workDef,owners));
 assert.throws(()=>decodeWork({...projection([]),multi_valued_rows:1},workDef,owners));
 assert.throws(()=>decodeWork({...projection([]),truncated:true},workDef,owners));
});
test('explicit local expiry is UNKNOWN even with a recent timestamp and retains owned-work reads',()=>{
  const view=decodeHead(body(head([entry('worker',2,'expired')],2)),headDef,now);
  assert.equal(view.states[0].status,'UNKNOWN');assert.equal(view.complete,false);
  assert.equal(view.unknown,1);assert.deepEqual(ownerBatches(view)[0].owners,[headDef.principalPrefix+'worker']);
});

for(const changeTx of [false,true])test('bounded projection cursor paging '+(changeTx?'refuses changed transaction':'keeps one transaction'),async()=>{
 const control=JSON.parse(fs.readFileSync(new URL('../asks/control.json',import.meta.url))),calls=[];
 const request=async(url,{body:b})=>{
  if(url.endsWith('/ask'))return b.name===headDef.name?body(head()):reply(control,[{item:'https://seeds.local/item/aegis-blh.1',revision:1}]);
  calls.push(b);
  if(!b.after){const rows=Array.from({length:50},(_,i)=>projectionRow(i));return {...projection(rows),truncated:true,next_after:{entity:rows.at(-1).entity,graph:workDef.graph}};}
  return {...projection([projectionRow(50)]),tx:changeTx?124:123};
 };
 const read=heldReader({request,endpoint:'https://example.test',head:headDef,work:workDef,control,now:()=>now});
 if(changeTx)await assert.rejects(read(null,new AbortController().signal),/restart required/);
 else{const view=await read(null,new AbortController().signal);assert.equal(view.rows.length,51);assert.equal(view.tx,123);assert.equal(view.more,false);}
 assert.equal(calls.length,2);assert.deepEqual(calls[1].after,{entity:workDef.itemPrefix+'aegis-f49',graph:workDef.graph});
});
test('held summary renders only owners holding work and counts the rest, ephemeral jobs included',()=>{
  const agents=[entry('lead',1),entry('eph-merge-1a',2),entry('eph-review-2b',3),entry('quiet',4,'ceiling'),entry('eph-task-3c',5),entry('up',6,'live')];
  const view={...decodeHead(body(head(agents)),headDef,now),rows:[item('aegis-a',headDef.principalPrefix+'lead'),item('aegis-b',headDef.principalPrefix+'eph-task-3c')],more:false};
  const sum=heldSummary(view,now);
  assert.equal(sum.owners,5);assert.deepEqual(sum.holders.map(h=>h.agent),['lead','eph-task-3c']);
  assert.equal(sum.quiet,3);assert.equal(sum.quietEphemeral,2);assert.equal(sum.collapsed,false);
  assert.equal(ephemeralAgent('eph-merge-1a'),true);assert.equal(ephemeralAgent('ephraim'),false);
});
test('more than five owners holding work collapse; expired holders stay UNKNOWN',()=>{
  const agents=Array.from({length:HELD_COLLAPSE_OWNERS+1},(_,i)=>entry('w'+i,i+1));agents[0].observed_at=now/1000-1800;
  const view={...decodeHead(body(head(agents)),headDef,now),rows:agents.map((a,i)=>item('aegis-r'+i,headDef.principalPrefix+a.agent)),more:false};
  const sum=heldSummary(view,now);
  assert.equal(sum.collapsed,true);assert.equal(sum.holders.length,6);assert.equal(sum.holders[0].uncertain,true);assert.equal(sum.unknown,1);
  view.rows.pop();assert.equal(heldSummary(view,now).collapsed,false);
});

const itemDef=JSON.parse(fs.readFileSync(new URL('../asks/item.json',import.meta.url)));
const titleReply=(seed,extra={})=>({query:itemDef.name,sparql:itemDef.template.replaceAll('{seed}',seed),rows:[{item:seed,id:seed.split('/').at(-1),priority:1,status:'open',...extra}],count:1,truncated:false});
test('decoded held rows carry no stand-in title',()=>{
 const out=decodeWork(projection([projectionRow()]),workDef,[headDef.principalPrefix+'worker']);
 assert.equal(out.rows[0].title,undefined);assert.doesNotMatch(JSON.stringify(out),/Open source record/);
});
test('held titles come from the item point read, cached by item@modified',async()=>{
 const calls=[];
 const read=heldTitleReader({request:async(url,{body})=>{calls.push([url,body]);return titleReply(body.params.seed,{title:'Real title '+calls.length});},endpoint:'https://example.test',definition:itemDef});
 const row={item:workDef.itemPrefix+'aegis-f1',modified:'2026-10-24T14:59:00Z'};
 assert.equal(await read(row),'Real title 1');assert.equal(await read(row),'Real title 1');
 assert.equal(calls.length,1);assert.equal(calls[0][0],'https://example.test/ask');assert.deepEqual(calls[0][1],{name:'daily_brief_ask_item_v2',params:{seed:row.item}});
 assert.equal(await read({...row,modified:'2026-10-25T00:00:00Z'}),'Real title 2');
});
test('a missing title, foreign reply or failed read is an error with its reason, retried only after its hold',async()=>{
 let mode='missing',calls=0,clock=0;
 const read=heldTitleReader({failureTtlMs:1000,now:()=>clock,request:async(url,{body})=>{calls++;if(mode==='http')throw Error('Reader returned HTTP 503');return mode==='foreign'?{...titleReply(body.params.seed),rows:[{item:workDef.itemPrefix+'aegis-other',title:'Other'}]}:titleReply(body.params.seed,mode==='blank'?{title:'  '}:{});},endpoint:'https://example.test',definition:itemDef});
 const row={item:workDef.itemPrefix+'aegis-f1',modified:'x'};
 const again=async(re)=>{await assert.rejects(read(row),re);clock+=1000;};
 await assert.rejects(read(row),/no title/);mode='blank';await assert.rejects(read(row),/no title/);
 assert.equal(calls,1,'a re-render inside the hold does not re-read a failed item');
 clock+=1000;await again(/no title/);mode='foreign';await again(/point read changed/);mode='http';await again(/HTTP 503/);
 assert.equal(calls,4,'after the hold the failed item is read again');
 mode='missing';await assert.rejects(read({item:workDef.itemPrefix+'aegis-Bad_id',modified:'x'}),/Invalid seed/);
});
test('held title reads are bounded in flight and time out with a reason',async()=>{
 let active=0,peak=0;const release=[];
 const read=heldTitleReader({limit:2,request:async(url,{body})=>{active++;peak=Math.max(peak,active);await new Promise(r=>release.push(r));active--;return titleReply(body.params.seed,{title:'T'});},endpoint:'https://example.test',definition:itemDef});
 const all=Promise.all(Array.from({length:5},(_,i)=>read({item:workDef.itemPrefix+'aegis-f'+i,modified:'x'})));
 await new Promise(r=>setTimeout(r,1));
 while(release.length||active){await new Promise(r=>setTimeout(r,1));release.splice(0).forEach(r=>r());}
 assert.deepEqual(await all,['T','T','T','T','T']);assert.equal(peak,2);
 const slow=heldTitleReader({timeoutMs:5,request:(url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted')))),endpoint:'https://example.test',definition:itemDef});
 await assert.rejects(slow({item:workDef.itemPrefix+'aegis-f1',modified:'x'}),/timed out/);
});
test('held title reads stop at the per-page cap; cached titles stay free',async()=>{
 let calls=0;
 const read=heldTitleReader({maxReads:2,request:async(url,{body})=>{calls++;return titleReply(body.params.seed,{title:'T'+calls});},endpoint:'https://example.test',definition:itemDef});
 const row=i=>({item:workDef.itemPrefix+'aegis-c'+i,modified:'x'});
 assert.equal(await read(row(1)),'T1');assert.equal(await read(row(2)),'T2');
 await assert.rejects(read(row(3)),e=>e.notLoaded===true&&/cap/.test(e.message));
 assert.equal(await read(row(1)),'T1','a cached title is not a new read');
 assert.equal(calls,2);assert.equal(HELD_TITLE_READS,40);
});
