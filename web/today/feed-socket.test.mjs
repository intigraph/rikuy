import test from 'node:test';
import assert from 'node:assert/strict';
import {FeedSocket} from './feed-socket.mjs';
const SEEDS='https://seeds.local/project/aegis',OTHER='https://example.test/graph';
class FakeSocket{
  constructor(url){this.url=url;this.readyState=0;this.sent=[];this.closed=false;}
  send(text){this.sent.push(JSON.parse(text));}
  close(){this.closed=true;}
  opened(){this.readyState=1;this.onopen?.();}
  emit(frame){this.onmessage?.({data:JSON.stringify(frame)});}
}
function harness({watermark=async()=>({tx:700,epoch:'urn:e1'})}={}){
  const sockets=[],timers=new Map(),states=[];let id=0;
  const feed=new FeedSocket({origin:'https://brief.svc',watermark,open:url=>{const s=new FakeSocket(url);sockets.push(s);return s;},
    schedule:(f,ms)=>{timers.set(++id,{f,ms});return id;},cancel:t=>timers.delete(t),random:()=>0,onState:s=>states.push(s)});
  return {feed,sockets,timers,states};
}
const settle=()=>new Promise(r=>setImmediate(r));
const changes=(sub,id,graph=SEEDS,epoch='urn:e1')=>({sub,event:'quipu.changes',id:String(id),
  data:JSON.stringify({capture:'old_and_new_values',since:id-1,next_tx:id,records:[{tx:id,graph}],source:{log_epoch:epoch,store_id:'urn:s'}})});
async function live(h,graphs=[SEEDS]){
  const seen=[];h.feed.watch('a',graphs,r=>seen.push(r));h.feed.start();h.sockets.at(-1).opened();await settle();return seen;
}
test('same-origin wss URL and every subscription carries the measured watermark',async()=>{
  const h=harness();const seen=await live(h);
  assert.equal(h.sockets[0].url,'wss://brief.svc/feed/ws');
  assert.deepEqual(h.sockets[0].sent,[{op:'subscribe',sub:'g1',feed:'changes',since:700,graph:SEEDS}]);
  assert.equal(h.feed.live(),true);assert.deepEqual(seen,['live']);
});
test('a string change frame notifies only that graph and advances the cursor',async()=>{
  const h=harness();const seen=await live(h);const other=[];h.feed.watch('b',[OTHER],r=>other.push(r));await settle();
  h.sockets[0].emit(changes('g1',701));
  assert.deepEqual(seen,['live','change']);assert.deepEqual(other,[]);assert.equal(h.feed.cursors.get(SEEDS),701);
});
test('heartbeats are quiet and unknown events fail open',async()=>{
  const h=harness();const seen=await live(h);
  h.sockets[0].emit({event:'quipu.heartbeat',ts:1});h.sockets[0].emit({sub:'g1',event:'quipu.future',id:'9'});
  assert.deepEqual(seen,['live','change']);assert.equal(h.feed.live(),true);
});
test('a refused subscription falls back and resumes from the delivered cursor, not a new watermark',async()=>{
  let reads=0;const h=harness({watermark:async()=>{reads++;return {tx:700,epoch:'urn:e1'};}});const seen=await live(h);
  h.sockets[0].emit(changes('g1',705));h.sockets[0].emit({sub:'g1',event:'quipu.error',data:'refused',last:705});
  assert.equal(h.feed.state,'reconnecting');assert.deepEqual(seen,['live','change','down']);assert.equal(h.sockets[0].closed,true);
  const retry=[...h.timers.values()].find(t=>t.ms<=2000);assert(retry,'bounded reconnect scheduled');retry.f();
  h.sockets[1].opened();await settle();
  assert.deepEqual(h.sockets[1].sent,[{op:'subscribe',sub:'g2',feed:'changes',since:705,graph:SEEDS}]);
  assert.equal(reads,1);assert.deepEqual(seen,['live','change','down','live']);
});
test('a failed watermark never subscribes without since',async()=>{
  const h=harness({watermark:async()=>{throw new Error('HTTP 400');}});const seen=await live(h);
  assert.deepEqual(h.sockets[0].sent,[]);assert.equal(h.feed.state,'reconnecting');assert.deepEqual(seen,[]);
});
test('a cursor that moves backwards or a foreign-graph record is refused',async()=>{
  for(const frame of [changes('g1',690),changes('g1',701,OTHER),{sub:'g1',event:'quipu.changes',id:'701',data:'{not json'}]){
    const h=harness();const seen=await live(h);h.sockets[0].emit(frame);
    assert.equal(h.feed.state,'reconnecting');assert.deepEqual(seen,['live','down']);
  }
});
test('silence past the heartbeat window is a dead socket',async()=>{
  const h=harness();const seen=await live(h);
  const silence=[...h.timers.values()].find(t=>t.ms===40000);silence.f();
  assert.equal(h.feed.state,'reconnecting');assert.deepEqual(seen,['live','down']);
});
test('stop closes the socket and schedules nothing',async()=>{
  const h=harness();await live(h);h.feed.stop();
  assert.equal(h.sockets[0].closed,true);assert.equal(h.feed.state,'off');assert.equal(h.timers.size,0);
});
test('reconnect backoff doubles and is bounded at one minute',async()=>{
  const h=harness({watermark:async()=>{throw new Error('down');}});h.feed.watch('a',[SEEDS],()=>{});h.feed.start();const delays=[];
  for(let i=0;i<9;i++){h.sockets.at(-1).opened();await settle();const t=[...h.timers.values()];assert.equal(t.length,1);delays.push(t[0].ms);h.timers.clear();t[0].f();}
  assert.deepEqual(delays,[1000,2000,4000,8000,16000,32000,60000,60000,60000]);
});
test('a new store log epoch drops every cursor and re-snapshots from a fresh watermark',async()=>{
  let reads=0;const h=harness({watermark:async()=>({tx:reads++?50:700,epoch:reads>1?'urn:e2':'urn:e1'})});const seen=await live(h);
  h.sockets[0].emit(changes('g1',705));h.sockets[0].emit(changes('g1',706,SEEDS,'urn:e2'));
  assert.deepEqual(seen,['live','change','down']);assert.equal(h.feed.cursors.size,0);
  [...h.timers.values()].find(t=>t.ms<=2000).f();h.sockets[1].opened();await settle();
  assert.deepEqual(h.sockets[1].sent,[{op:'subscribe',sub:'g2',feed:'changes',since:50,graph:SEEDS}]);
  assert.equal(h.feed.epoch,'urn:e2');assert.deepEqual(seen,['live','change','down','live']);
});
test('a watermark without a log epoch is refused',async()=>{
  const h=harness({watermark:async()=>({tx:700})});await live(h);
  assert.deepEqual(h.sockets[0].sent,[]);assert.equal(h.feed.state,'reconnecting');
});
test('native capture and records reach watchers, including partial marker',async()=>{
 const h=harness();await live(h);const pages=[];h.feed.watch('records',[SEEDS],(_r,p)=>pages.push(p));
 h.sockets[0].emit(changes('g1',701));
 assert.equal(pages[0].capture,'old_and_new_values');assert.equal(pages[0].records[0].tx,701);assert.equal(pages[0].partial,false);
 const part=changes('g1',702);part.event='quipu.changes.part';h.sockets[0].emit(part);assert.equal(pages[1].partial,true);
});
