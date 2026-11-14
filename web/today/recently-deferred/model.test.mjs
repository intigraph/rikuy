import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {coverageParams,recentlyDeferred,deferredReader} from './model.mjs';
import {renderStored} from '../stored-query.mjs';
const def=JSON.parse(fs.readFileSync(new URL('./query.json',import.meta.url))),since='2026-10-24T17:00:00Z',now=Date.parse('2026-10-24T18:00:00Z'),params={since};
const row=(n=0)=>({item:'https://seeds.local/item/aegis-test'+n,id:'aegis-test'+n,title:'<script>hostile</script>',status:'deferred',revision:'2',modified:'2026-10-24T17:30:00Z',deferredAt:'2026-10-24T17:20:00Z',deferredBy:'https://seeds.local/principal/arnold'});
const body=rows=>({query:def.name,sparql:renderStored(def,params),rows,count:rows.length,truncated:false});
test('coverage requires actual installation receipt and date; missing coverage makes no request',async()=>{
 const coverage={contract:'seeds-deferral-coverage/v1',since:null,installationReceipt:null};let calls=0;
 assert.throws(()=>coverageParams(coverage,now),/not verified/);
 const read=deferredReader({request:async()=>{calls++;},endpoint:'http://127.0.0.1',control:{},definition:def,coverage,now:()=>now});
 await assert.rejects(()=>read({name:def.name,params},new AbortController().signal),/not verified/);assert.equal(calls,0);
 assert.deepEqual(coverageParams({contract:'seeds-deferral-coverage/v1',since,installationReceipt:'verified-install'},now),params);
});
test('valid receipts preserve literal source text and current status; empty bounded read is representable',()=>{
 const value=recentlyDeferred(body([row()]),def,now,params);assert.equal(value.rows[0].title,'<script>hostile</script>');assert.equal(value.since,since);
 const reopened={...row(),status:'open'};assert.equal(recentlyDeferred(body([reopened]),def,now,params).rows[0].status,'open');
 assert.deepEqual(recentlyDeferred(body([]),def,now,params).rows,[]);
});
test('all sentinel rows are validated; overflow, duplicate, missing and foreign receipts refuse',()=>{
 const rows=Array.from({length:21},(_,n)=>row(n));const value=recentlyDeferred(body(rows),def,now,params);assert.equal(value.rows.length,20);assert.equal(value.hasMore,true);
 for(const bad of [{...row(20),deferredBy:undefined},{...row(20),deferredAt:'2026-10-24T16:59:59Z'},{...row(20),deferredAt:'2026-10-25T00:00:00Z'},{...row(20),deferredBy:'_:actor'},{...row(20),status:'invented'},{...row(20),item:'https://foreign/item'}])assert.throws(()=>recentlyDeferred(body([...rows.slice(0,20),bad]),def,now,params));
 assert.throws(()=>recentlyDeferred(body([row(),row()]),def,now,params),/Duplicate/);
 assert.throws(()=>recentlyDeferred(body([...rows,row(21)]),def,now,params),/overflow/);
 assert.throws(()=>recentlyDeferred({...body([]),truncated:true},def,now,params));
 assert.throws(()=>recentlyDeferred({...body([]),sparql:'different'},def,now,params));
});
test('positive source control precedes the sparse read and its failure never becomes empty',async()=>{
 let calls=0;const coverage={contract:'seeds-deferral-coverage/v1',since,installationReceipt:'receipt'};
 const control={name:'control',template:'control',params:[],rowCap:2};
 const read=deferredReader({request:async()=>{calls++;return {query:'control',sparql:'control',rows:[],count:0};},endpoint:'http://127.0.0.1',control,definition:def,coverage,now:()=>now});
 await assert.rejects(()=>read({name:def.name,params},new AbortController().signal),/control missing/);assert.equal(calls,1);
});
