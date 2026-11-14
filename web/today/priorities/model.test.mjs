import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {priorities,PriorityClient} from './model.mjs';
const definition=JSON.parse(fs.readFileSync(new URL('./query.json',import.meta.url)));
const now=Date.parse('2026-10-21T02:00:00Z');
const row=(id='aegis-one',extra={})=>({kind:'item',item:'https://seeds.local/item/'+id,id,title:'Source title <script>literal</script>',priority:0,status:'open',revision:1,modified:'2026-10-21T01:00:00Z',...extra});
const body=rows=>({query:definition.name,sparql:definition.template,count:rows.length,rows,truncated:false});
test('numeric rank and explicit unranked order preserve source revision',()=>{
 const rows=priorities(body([row('aegis-unranked'),row('aegis-ten',{rank:'10'}),row('aegis-two',{rank:'2'})]),definition,now);
 assert.deepEqual(rows.map(r=>r.id),['aegis-two','aegis-ten','aegis-unranked']);assert.equal(rows[0].revision,1);
 assert.match(rows[0].title,/<script>/);
});
test('empty source refuses rather than reporting healthy zero',()=>{assert.throws(()=>priorities(body([]),definition,now),/control/);});
test('wrong query, excess response, truncation, foreign identity and priority refuse',()=>{
 const good=body([row()]);
 for(const bad of [{...good,query:'foreign'},{...good,sparql:'SELECT * {}'},{...good,truncated:true},{...good,count:99},body([...Array.from({length:22},(_,i)=>row('aegis-'+i))]),body([row('foreign')]),body([row('aegis-one',{priority:1})]),body([row(),row()])])assert.throws(()=>priorities(bad,definition,now));
});
test('max+1 validates the sentinel and marks the bounded first twenty',()=>{
 const input=Array.from({length:21},(_,i)=>row('aegis-'+i,{rank:21-i}));
 const selected=priorities(body(input),definition,now);
 assert.equal(selected.length,20);assert.equal(selected.moreThan20,true);assert.equal(selected.feedItems.length,21);assert(selected.feedItems.includes('https://seeds.local/item/aegis-20'));
 assert(!selected.some(r=>r.id==='aegis-20'),'sentinel became a displayed source row');
 assert.equal(priorities(body(input.slice(0,20)),definition,now).moreThan20,false);
 for(const invalid of [row('foreign'),row('aegis-20',{priority:1}),input[0]])assert.throws(()=>priorities(body([...input.slice(0,20),invalid]),definition,now));
 assert.throws(()=>priorities(body(input),{...definition,rowCap:22},now),/limit/);
});
function client(read){const timers=new Map(),views=[],statuses=[];let id=0;const c=new PriorityClient({definition,read,now:()=>now,render:r=>views.push(r),status:s=>statuses.push(s),schedule:(f,ms)=>{timers.set(++id,{f,ms});return id;},cancel:id=>timers.delete(id)});return {c,timers,views,statuses};}
test('one flight and paused clients do not schedule a poll',async()=>{
 let resolve,calls=0;const h=client(()=>{calls++;return new Promise(r=>resolve=r);});
 const running=h.c.start();await h.c.tick();assert.equal(calls,1);h.c.pause();resolve(body([row()]));await running;
 assert.equal(h.timers.size,0);assert.equal(h.views.length,0);
});
test('query error clears old data to UNKNOWN and backs off',async()=>{
 const h=client(async()=>{throw new Error('source unavailable');});await h.c.start();
 assert.deepEqual(h.views,[null]);assert.match(h.statuses[0],/UNKNOWN/);assert.equal([...h.timers.values()][0].ms,30000);
});
test('a subsequent poll observes changed status and revision',async()=>{
 let revision=1;const h=client(async()=>body([row('aegis-one',{revision,status:revision===1?'open':'in_progress'})]));
 await h.c.start();const next=[...h.timers.values()][0];h.timers.clear();revision=2;await next.f();
 assert.equal(h.views[0][0].status,'open');assert.equal(h.views[1][0].status,'in_progress');assert.equal(h.views[1][0].revision,2);h.c.pause();
});
test('browser timer cancellation is called without a client receiver',async()=>{
 const original=globalThis.clearTimeout,cancelled=[],statuses=[];
 globalThis.clearTimeout=function(timer){assert.equal(this,undefined,'browser timer method received a foreign receiver');cancelled.push(timer);};
 try{
  const c=new PriorityClient({definition,read:async()=>body([row()]),now:()=>now,render:()=>{},status:s=>statuses.push(s),schedule:(_f,ms)=>ms});
  await c.start();assert.match(statuses[0],/^Live/);assert(cancelled.includes(6000));c.pause();assert(cancelled.includes(15000));
 }finally{globalThis.clearTimeout=original;}
});
function fed({live=true}={}){
  let clock=now,calls=0,resolve=null;const timers=new Map(),watches=[];let id=0;
  const feed={live:()=>live,watch:(owner,graphs,fn)=>{watches.push({graphs,fn});return ()=>{};}};
  const c=new PriorityClient({definition,read:()=>{calls++;return resolve?new Promise(r=>{const done=resolve;resolve=null;done(r);}):Promise.resolve(body([row()]));},
    now:()=>clock,render:()=>{},status:()=>{},schedule:(f,ms)=>{timers.set(++id,{f,ms});return id;},cancel:t=>timers.delete(t),feed,graphs:()=>['https://seeds.local/project/aegis']});
  return {c,timers,watches,get calls(){return calls;},advance:ms=>{clock+=ms;},hold:fn=>{resolve=fn;},only:()=>{const t=[...timers.values()];assert.equal(t.length,1);return t[0];}};
}
test('a live feed stretches the fixed re-read to the safety interval',async()=>{
  const h=fed();await h.c.start();assert.deepEqual(h.watches[0].graphs,['https://seeds.local/project/aegis']);assert.equal(h.only().ms,300000);
});
test('without a live feed the 15 s poll is unchanged',async()=>{const h=fed({live:false});await h.c.start();assert.equal(h.only().ms,15000);});
test('a change reads on its leading edge, then at most once per refresh interval',async()=>{
  const h=fed();await h.c.start();h.advance(20000);h.watches[0].fn('change');await new Promise(r=>setImmediate(r));
  assert.equal(h.calls,2,'leading edge reads at once');
  h.advance(3000);h.watches[0].fn('change');assert.equal(h.calls,2,'burst coalesced');assert.equal(h.only().ms,12000);
  h.watches[0].fn('change');assert.equal(h.only().ms,12000,'one timer, not one per frame');
});
test('a change during a read queues exactly one follow-up after the gap',async()=>{
  const h=fed();let finish;h.hold(r=>finish=r);const first=h.c.start();
  h.watches.length||await new Promise(r=>setImmediate(r));h.watches[0].fn('change');h.watches[0].fn('change');assert.equal(h.calls,1);
  h.advance(4000);finish(body([row()]));await first;assert.equal(h.only().ms,11000);
});
test('losing the feed falls back to the 15 s poll at once',async()=>{
  const h=fed();await h.c.start();assert.equal(h.only().ms,300000);h.watches[0].fn('down');assert.equal(h.only().ms,15000);
});
test('a new connection reads at once, even inside the coalescing gap',async()=>{
  const h=fed();await h.c.start();h.advance(3000);h.watches[0].fn('live');await new Promise(r=>setImmediate(r));assert.equal(h.calls,2);
  let finish;h.hold(r=>finish=r);h.advance(1000);h.watches[0].fn('change');await new Promise(r=>setImmediate(r));
  h.advance(14000);h.watches[0].fn('change');await new Promise(r=>setImmediate(r));
  assert.equal(h.calls,3);h.watches[0].fn('live');finish(body([row()]));await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
  assert.equal(h.only().ms,0,'live during a read follows up immediately');
});
test('native unrelated revisions schedule no read; displayed owner changes still read',async()=>{
 const h=fed();await h.c.start();h.advance(20000);
 const p=entity=>({capture:'old_and_new_values',records:[{entity,attribute:'https://schema.org/version',op:'retract',old_value:1},{entity,attribute:'https://schema.org/version',op:'assert',value:2}]});
 h.watches[0].fn('change',p('https://seeds.local/item/aegis-other'));
 assert.equal(h.calls,1);assert.equal(h.only().ms,300000,'irrelevant frame keeps safety timer');
 h.watches[0].fn('change',p('https://seeds.local/item/aegis-one'));
 await new Promise(r=>setImmediate(r));assert.equal(h.calls,2);h.c.pause();
});
