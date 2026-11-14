import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {semwebReader,REGISTRATION_SHA} from './model.mjs';
import {WATCHES,watchDefinition,watchParams,expandedWatch,validateWatch} from '../knowledge/watches.mjs';
import {PriorityClient} from '../priorities/model.mjs';
const now=Date.parse('2026-10-25T03:00:00Z'),definition=watchDefinition(WATCHES[0]),params=watchParams(now);
const admission={enabled:true,scope:'default ROOT',windowDays:30,capBytes:262144,deadlineMs:6000,registrationSHA:REGISTRATION_SHA,readCostReceipt:'FIXTURE read-cost receipt'};
const requestBody={name:definition.name,params};
function harness(overrides={}){const calls=[];const read=semwebReader({request:async(...args)=>{calls.push(args);return 'fixture response';},endpoint:'https://brief.example',definition,admission,now:()=>now,...overrides});return {calls,read};}
test('shipped default OFF and all incomplete admissions make zero source requests',async()=>{
 const shipped=JSON.parse(fs.readFileSync(new URL('./admission.json',import.meta.url)));
 for(const changed of [shipped,undefined,{...admission,enabled:false},{...admission,scope:'other'},{...admission,windowDays:31},{...admission,capBytes:262145},{...admission,deadlineMs:6001},{...admission,registrationSHA:'other'},{...admission,readCostReceipt:null}]){
  const h=harness({admission:changed});await assert.rejects(h.read(requestBody));assert.equal(h.calls.length,0);
 }
});
test('only exact semweb definition and fresh 30 day parameters reach one named ask',async()=>{
 for(const body of [{...requestBody,name:'daily_brief_next_v1'},{...requestBody,query:'SELECT * {}'},{...requestBody,params:{...params,start:'2026-01-01T00:00:00.000Z'}},{...requestBody,params:{...params,extra:'x'}},{...requestBody,params:watchParams(now-6001)}]){
  const h=harness();await assert.rejects(h.read(body));assert.equal(h.calls.length,0);
 }
 const bad=harness({definition:{...definition,template:'SELECT * {}'}});await assert.rejects(bad.read(requestBody));assert.equal(bad.calls.length,0);
 const h=harness(),signal=new AbortController().signal;assert.equal(await h.read(requestBody,signal),'fixture response');assert.deepEqual(h.calls,[['https://brief.example/ask',{body:requestBody,signal,cap:262144}]]);
});
test('real polling codec refuses missing boolean and empty coverage, with 60s polling and cancellation',async()=>{
 const row={run:'http://aegis.gastown.local/ontology/fixture-run',episode:'http://aegis.gastown.local/ontology/episode_fixture',checked:new Date(now).toISOString(),runDate:'2026-10-25'};
 const good={query:definition.name,sparql:expandedWatch(definition,params),rows:[row],count:1,truncated:false};
 for(const body of [good,{...good,truncated:undefined},{...good,rows:[],count:0}]){
  const timers=new Map(),views=[],statuses=[];let id=0,calls=0;
  const read=semwebReader({request:async()=>{calls++;return body;},endpoint:'https://brief.example',definition,admission,now:()=>now});
  const client=new PriorityClient({definition,read,decode:(body,def,time,params)=>validateWatch(body,def,params,time),getParams:()=>params,now:()=>now,refreshMs:60000,render:v=>views.push(v),status:s=>statuses.push(s),schedule:(f,ms)=>{timers.set(++id,{f,ms});return id;},cancel:id=>timers.delete(id)});
  await client.start();assert.equal(calls,1);assert.equal([...timers.values()][0].ms,60000);
  if(body===good){assert.equal(views[0][0].run,row.run);assert.match(statuses[0],/^Live/);}else{assert.equal(views[0],null);assert.match(statuses[0],/^UNKNOWN/);}
  client.pause();assert.equal(timers.size,0);await client.tick();assert.equal(calls,1);
 }
});
