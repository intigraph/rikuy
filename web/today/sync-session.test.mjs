import test from 'node:test';
import assert from 'node:assert/strict';
import {SyncSession} from './sync-session.mjs';
// Exact Database methods from #798 1f99ba5; native JSON text, snake_case tags.
// These are consumer controls, not a native WASM integration claim.
function fixture(results,{empty=false}={}){
 const calls=[];let progress=empty?null:{store_id:'source',log_epoch:'epoch',source_tx:4};
 const db={replicaProgress:async()=>JSON.stringify(progress),replicaApplyFrame:async(event,data,now)=>{
  calls.push({event,data,now});const result=results.shift();
  if(result.kind==='applied')progress={store_id:'source',log_epoch:'epoch',source_tx:result.source_txs.at(-1)};
  return JSON.stringify(result);
 },replicaFreshness:async now=>{calls.push({freshness:now});return JSON.stringify({source_tx:progress?.source_tx??null,last_frame_age_ms:17,bounded:false});}};
 return {calls,db,session:new SyncSession({db,query:async same=>{assert.equal(same,db);return ['last good'];}})};

}
test('raw event and exact JSON bytes reach one instance without reserialization',async()=>{
 const f=fixture([{kind:'buffered',source_tx:5},{kind:'applied',source_txs:[5,8]}]);await f.session.open();
 await f.session.feed('quipu.changes.part',' { "part": 0 } ',11);
 assert.equal(f.session.state,'disconnected');
 await f.session.feed('quipu.changes.commit','{"done":true}',12);
 assert.deepEqual(f.calls,[{event:'quipu.changes.part',data:' { "part": 0 } ',now:11},{event:'quipu.changes.commit',data:'{"done":true}',now:12}]);
 assert.deepEqual(await f.session.freshness(29),{source_tx:8,last_frame_age_ms:17,bounded:false,stale:false,state:'connected'});
});
test('disconnect retains last-good local reads with unbounded stale freshness',async()=>{
 const f=fixture([{kind:'duplicate'}]);await f.session.open();await f.session.feed('quipu.changes','{}',1);f.session.disconnect();
 assert.deepEqual(await f.session.read('SELECT'),['last good']);assert.equal((await f.session.freshness(2)).stale,true);
});
test('an empty opened store and Idle frame cannot masquerade as cached data',async()=>{
 const f=fixture([{kind:'idle'},{kind:'applied',source_txs:[1]}],{empty:true});assert.equal(await f.session.open(),null);
 await f.session.feed('quipu.changes','{}',1);await assert.rejects(()=>f.session.read('SELECT'),/unavailable/);
 await f.session.feed('quipu.changes','{}',2);assert.deepEqual(await f.session.read('SELECT'),['last good']);
});
for(const outcome of [{kind:'resume',from:4},{kind:'rebootstrap',reason:'epoch changed'},{kind:'refused',reason:'lossy byte record'},{kind:'ignored'}])test(outcome.kind+' stops intake and follows the S1 recovery outcome',async()=>{
 const f=fixture([outcome]);await f.session.open();assert.deepEqual(await f.session.feed('control','{}',1),outcome);
 await assert.rejects(()=>f.session.feed('quipu.changes','{}',2),/Reconnect/);assert.equal(f.calls.length,1);
 if(['rebootstrap','ignored'].includes(outcome.kind))await assert.rejects(()=>f.session.read('SELECT'),/unavailable/);
 else assert.deepEqual(await f.session.read('SELECT'),['last good']);
});
test('design-era factory object refuses instead of pretending to be the Database bridge',()=>{
 assert.throws(()=>new SyncSession({applier:{open:async()=>({apply_frame(){}})},store:{},query:async()=>[]}),/Database bridge/);
});
test('a failed reopen cannot leave the previous instance silently readable',async()=>{
 const f=fixture([]);await f.session.open();assert.deepEqual(await f.session.read('SELECT'),['last good']);
 f.db.replicaProgress=async()=>{throw Error('progress unavailable');};
 await assert.rejects(()=>f.session.open(),/progress unavailable/);
 await assert.rejects(()=>f.session.read('SELECT'),/unavailable/);
});

test('an unknown future outcome withholds the scope instead of looking disconnected-but-readable',async()=>{
 const f=fixture([{kind:'future_revocation'}]);await f.session.open();
 await assert.rejects(()=>f.session.feed('control','{}',1),/Unknown shared-applier outcome/);
 assert.equal(f.session.state,'unsupported');await assert.rejects(()=>f.session.read('SELECT'),/unavailable/);
 await assert.rejects(()=>f.session.feed('quipu.changes','{}',2),/Reconnect/);
});
test('native nullable freshness and oversized integers are never rounded into a cursor',async()=>{
 const f=fixture([]);await f.session.open();
 f.db.replicaFreshness=async()=>'{"source_tx":null,"last_frame_age_ms":null,"bounded":false}';
 assert.equal((await f.session.freshness(0)).source_tx,null);
 f.db.replicaProgress=async()=>'{"store_id":"source","log_epoch":"epoch","source_tx":9007199254740993}';
 await assert.rejects(()=>f.session.open(),/outside the exact/);
 await assert.rejects(()=>f.session.read('SELECT'),/unavailable/);
});
test('an object response is rejected: the binding contract returns JSON text',async()=>{
 const f=fixture([]);f.db.replicaProgress=async()=>({source_tx:4});
 await assert.rejects(()=>f.session.open(),/text budget/);
 await assert.rejects(()=>f.session.read('SELECT'),/unavailable/);
});

test('malformed progress or freshness never turns an unverified store into a readable cache',async()=>{
 const f=fixture([]);f.db.replicaProgress=async()=>'{}';
 await assert.rejects(()=>f.session.open(),/Invalid native replica progress/);
 await assert.rejects(()=>f.session.read('SELECT'),/unavailable/);
 const g=fixture([]);await g.session.open();g.db.replicaFreshness=async()=>'{"source_tx":4}';
 await assert.rejects(()=>g.session.freshness(1),/Invalid native replica freshness/);
 await assert.rejects(()=>g.session.read('SELECT'),/unavailable/);
});
