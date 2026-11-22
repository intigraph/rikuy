import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {VERSION,summarize,windowSeconds} from '../web/economics/model.mjs';
import {extract} from '../scripts/ephemeral-economics.mjs';
import {artifact} from '../scripts/render-ephemeral-economics.mjs';
const start='2026-01-01T00:00:00Z',end='2026-01-02T00:00:00Z',at=Date.parse(start)/1000;
const row=(n,extra={})=>({name:'eph-task-'+n,job:'task',harness:'codex',spawned_at:at+n,deadline:at+n+600,max_turns:10,max_context_k:100,state:'done',ended_at:at+n+n,cause:'report',verdict:'done',...extra});
const data=attempts=>({version:VERSION,window:{start,end},observed_at:at+90000,complete:true,unknown:[],attempts});
test('exact UTC spawn window, retries, nearest rank, censored jobs and separate budget cohorts',()=>{
 const s=summarize(data([row(10,{request_id:'one'}),row(20,{request_id:'one',cause:'timeout',retry_of:'eph-task-10'}),row(30,{state:'live',ended_at:undefined}),row(40,{max_turns:2,cause:'turn budget'}),row(50,{spawned_at:at+86400})]));
 assert.equal(s.spawned,4);assert.equal(s.terminal,3);assert.equal(s.live,1);assert.equal(s.retries,1);assert.deepEqual(s.work_requests,{known:1,covered_attempts:2,unbound_attempts:2});
 assert.deepEqual(s.daily,[{day:'2026-01-01',job:'task',n:4}]);
 const c=s.cohorts[0];assert.equal(c.p50,10);assert.equal(c.p90,20);assert.equal(c.exhaustion_ratio,.5);assert.equal(c.duration_n,2);
 assert.equal(s.cohorts.length,2);assert.equal(s.tokens.state,'UNKNOWN');assert.equal(s.savings.state,'UNKNOWN');
});
test('unknown cause raises uncertainty upper bound; invalid duration cannot become zero',()=>{
 const s=summarize(data([row(1,{cause:'new reason',ended_at:at-1}),row(2,{cause:'context budget'})]));
 const c=s.cohorts[0];assert.equal(c.invalid_duration,1);assert.equal(c.exhaustion_ratio,.5);assert.equal(c.exhaustion_upper,1);assert.equal(c.p50,2);assert.equal(s.state,'PARTIAL');
 assert.equal(s.attempts[0].duration,null);
});
test('duplicates refuse rather than double count; empty and capped coverage stay distinct',()=>{
 assert.throws(()=>summarize(data([row(1),row(1)])),/duplicate/);
 const s=summarize(data([]));assert.equal(s.spawned,0);assert.equal(s.state,'OBSERVED');assert.equal(s.tokens.state,'UNKNOWN');
 assert.equal(summarize({...data([]),complete:false,unknown:['cap']}).state,'PARTIAL');
 assert.throws(()=>windowSeconds(start,'2026-03-01T00:00:00Z'));
});
test('bounded local reader excludes prompt/summary, refuses symlinks, preserves unknown and never rewrites source',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'economics-'));
 try{
  const record={...row(1),item_context:'SECRET',workspace:'SECRET',result:{cause:'report',verdict:'done',summary:'SECRET'}};
  const body=JSON.stringify(record);await writeFile(join(dir,record.name+'.json'),body);
  await symlink(join(dir,record.name+'.json'),join(dir,'eph-task-2.json'));
  const snapshot=await extract(dir,start,end,{now:()=>at+90000});
  assert.equal(snapshot.attempts.length,1);assert.equal(snapshot.unknown.length,1);assert.equal(JSON.stringify(snapshot).includes('SECRET'),false);
  assert.equal(summarize(snapshot).state,'PARTIAL');
  assert.equal((await extract(dir,start,end,{maxRows:0})).complete,false);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('invalid state is coverage loss, never a live job',()=>{
 const s=summarize(data([row(1,{state:'corrupt'})]));assert.equal(s.state,'PARTIAL');assert.equal(s.invalid,1);assert.equal(s.live,0);
});
test('standalone report escapes inline data and embeds its module graph',async()=>{
 const html=await artifact(data([row(1,{item:'</script><script>BAD()</script>'})]));
 assert.equal(html.includes('src="app.mjs"'),false);assert.equal(html.includes('href="style.css"'),false);
 assert.equal(html.includes('</script><script>BAD'),false);assert.match(html,/\\u003c\/script>/);
});
