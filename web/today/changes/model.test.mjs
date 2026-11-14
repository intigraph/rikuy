import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto} from 'node:crypto';
import {changes,changesParams,changesReader,TEMPLATE_SHA} from './model.mjs';
import {renderStored} from '../stored-query.mjs';
import {PriorityClient} from '../priorities/model.mjs';
globalThis.crypto??=webcrypto;
const definition=JSON.parse(fs.readFileSync(new URL('./query.json',import.meta.url)));
const shipped=JSON.parse(fs.readFileSync(new URL('./admission.json',import.meta.url)));
const now=Date.parse('2026-11-05T12:00:00Z'),params=changesParams(now);
const admission={...shipped,enabled:true,registrationReceipt:'FIXTURE: exact private registry readback',readCostReceipt:'FIXTURE: admitted read cost'};
const row=(id='aegis-a',extra={})=>({item:'https://seeds.local/item/'+id,id,title:'Completed work '+id,closed:'2026-11-05T11:00:00Z',revision:'3',reason:'Observed result',...extra});
const body=(rows,p=params)=>({query:definition.name,sparql:renderStored(definition,p),rows,count:rows.length,truncated:false});
const make=(extra={})=>changesReader({request:async()=>{throw Error('unexpected request');},endpoint:'https://reader.example',definition,admission,now:()=>now,...extra});
test('public source defaults OFF without deployment receipts; synthetic admission is explicit',async()=>{
 assert.equal(shipped.enabled,false);
 assert.equal(shipped.registrationReceipt,null);
 assert.equal(shipped.readCostReceipt,null);
 await assert.rejects(make({admission:shipped}),/await activation/);
 await make({admission});
});
test('requires exact definition, scope, caps and both receipt bindings before IO',async()=>{
 for(const changed of [{...admission,registrationReceipt:null},{...admission,readCostReceipt:''},{...admission,scope:'urn:foreign'},{...admission,maxRows:21},{...admission,deadlineMs:6001},{...admission,refreshMs:14999},{...admission,registrationSHA:'0'.repeat(64)}])await assert.rejects(make({admission:changed}));
 for(const changed of [{...definition,template:definition.template+'\n'},{...definition,name:'daily_brief_other_v1'},{...definition,graph:'urn:foreign'},{...definition,rowCap:22},{...definition,params:[{name:'start',type:'iri',required:true}]}])await assert.rejects(make({definition:changed}));
 assert.equal(shipped.registrationSHA,TEMPLATE_SHA);
});
test('one admitted request uses only the named query and bounded response',async()=>{
 const calls=[],signal=new AbortController().signal;
 const read=await make({request:async(...args)=>{calls.push(args);return body([]);}});
 await read({name:definition.name,params},signal);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'https://reader.example/ask');
 assert.deepEqual(calls[0][1],{body:{name:definition.name,params},signal,cap:262144});
 for(const bad of [{name:definition.name,params,query:'SELECT * {}'},{name:'foreign',params},{name:definition.name,params:{...params,extra:'x'}},{name:definition.name,params:changesParams(now-6001)},{name:definition.name,params:{...params,start:'2026-01-01T00:00:00.000Z'}}])await assert.rejects(read(bad,signal));
 assert.equal(calls.length,1,'invalid requests must not reach Quipu');
});
test('24-hour windows cross year boundaries and keep strict exclusive end',()=>{
 assert.deepEqual(changesParams(Date.parse('2027-01-01T00:00:00Z')),{start:'2026-12-31T00:00:00.000Z',end:'2027-01-01T00:00:00.000Z'});
 const rows=[row('aegis-a',{closed:'2026-11-05T11:59:59.999999999Z'}),row('aegis-b',{closed:params.start})];
 assert.equal(changes(body(rows),definition,now,params).rows.length,2);
 for(const closed of [params.end,'2026-11-04T11:59:59.999999999Z','2026-02-30T12:00:00Z','not-a-time'])assert.throws(()=>changes(body([row('aegis-a',{closed})]),definition,now,params));
});
test('keeps sub-millisecond ordering and the ID tie-break without guessing',()=>{
 const rows=[row('aegis-z',{closed:'2026-11-05T11:00:00.000000002Z'}),row('aegis-a',{closed:'2026-11-05T11:00:00.000000001Z'})];
 assert.deepEqual(changes(body(rows),definition,now,params).rows.map(r=>r.id),['aegis-z','aegis-a']);
 assert.throws(()=>changes(body([...rows].reverse()),definition,now,params));
 assert.throws(()=>changes(body([row('aegis-b'),row('aegis-a')]),definition,now,params));
});
test('incomplete, foreign, duplicate and malformed results are UNKNOWN',()=>{
 for(const input of [{...body([]),truncated:undefined},{...body([]),truncated:true},{...body([]),count:1},{...body([]),query:'foreign'},{...body([]),sparql:'SELECT * {}'}])assert.throws(()=>changes(input,definition,now,params));
 for(const rows of [[row(),row()],[row('aegis-a',{item:'urn:foreign'})],[row('aegis-a',{title:'MAIL: private'})],[row('aegis-a',{revision:true})],[row('aegis-a',{revision:'1.5'})],[row('aegis-a',{reason:'x'.repeat(241)})]])assert.throws(()=>changes(body(rows),definition,now,params));
});
test('twenty is a bounded selection, never an asserted total; Unicode reason uses characters',()=>{
 const rows=Array.from({length:20},(_,i)=>row('aegis-x'+String(i).padStart(2,'0'),{reason:'🙂'.repeat(240)}));
 assert.equal(changes(body(rows),definition,now,params).atLimit,true);
 assert.throws(()=>changes(body([...rows,row('aegis-z')]),definition,now,params));
 assert.equal(changes(body([]),definition,now,params).rows.length,0);
 assert.equal(changes(body([row('aegis-a',{reason:undefined})]),definition,now,params).rows[0].reason,null);
});
test('normal client retains the 6s deadline and 15s refresh and cancels while hidden',async()=>{
 const timers=new Map(),views=[];let id=0,calls=0;
 const client=new PriorityClient({definition,read:async()=>{calls++;return body([row()]);},decode:changes,getParams:()=>params,now:()=>now,render:v=>views.push(v),status:()=>{},schedule:(fn,ms)=>{timers.set(++id,{fn,ms});return id;},cancel:id=>timers.delete(id)});
 await client.start();assert.equal(calls,1);assert.equal(views[0].rows.length,1);assert.equal([...timers.values()][0].ms,15000);
 client.pause();assert.equal(timers.size,0);await client.tick();assert.equal(calls,1);
});
