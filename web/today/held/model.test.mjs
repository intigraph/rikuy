import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderStored} from '../stored-query.mjs';
import {decodeHead,ownerBatches,decodeWork,heldReader} from './model.mjs';
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
