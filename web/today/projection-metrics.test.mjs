import test from 'node:test';
import assert from 'node:assert/strict';
import {metricRequests,snapshotTx,readMetrics,StatsClient} from './projection-metrics.mjs';
const window={start:'2026-10-01T00:00:00Z',end:'2026-11-01T00:00:00Z'};
test('month bounds are explicit half-open instants and day dimensions use UTC API buckets',()=>{
 const m=metricRequests(window);
 assert.equal(m.created.since.at,'2026-10-01T00:00:00.000Z');assert.equal(m.created.until.at,'2026-11-01T00:00:00.000Z');
 assert.deepEqual(m.closed.group_by,[{column:'closed',bucket:'day'},'priority']);
 const shifted=metricRequests({start:'2026-10-01T02:00:00+02:00',end:window.end});assert.deepEqual(shifted,m);
});
test('inbox exclusion uses the dedicated presence column, preserving unrelated labels',()=>{
 const r=metricRequests(window).created;
 assert.deepEqual(r.where,{inbox:[null]});assert.equal(Object.hasOwn(r.where,'keywords'),false);
 // Contract presence values: unlabeled and ordinary-labelled work both have
 // absent inbox; a row carrying inbox plus other labels has inbox present.
 const rows=[{title:'plain',inbox:null},{title:'labelled',inbox:null},{title:'mail',inbox:'inbox'}];
 assert.deepEqual(rows.filter(row=>r.where.inbox.includes(row.inbox)).map(row=>row.title),['plain','labelled']);
 assert.deepEqual(metricRequests(window).closed.where,{inbox:[null]});
});

const graph='https://seeds.local/project/aegis',at=Date.parse('2026-10-24T12:00:00Z');
const sourceRow=id=>({graph,entity:'https://seeds.local/item/'+id,key:'open',key_plain:true,multi:false,
 columns:{identifier:id,title:id,priority:1,created:'2026-10-24T01:00:00.123456789Z',closed:null},
 plain:{identifier:true,title:true,priority:false,created:false}});
function protocol(change=()=>{}){
 const calls=[];
 const request=async body=>{
  calls.push(structuredClone(body));let answer;
  if(body.action==='rows')answer=body.after?{rows:[sourceRow('aegis-b')],truncated:false}:{rows:[sourceRow('aegis-a')],truncated:true,next_after:{graph,entity:'https://seeds.local/item/aegis-a'}};
  else if(body.group_by==='key')answer={groups:[{graph,value:'open',plain:true,n:2}],total:2,truncated:false};
  else if(Array.isArray(body.group_by))answer={groups:[{graph,values:['2026-10-24',1],plain:[true,false],n:1}],total:1,truncated:false};
  else answer={groups:[{graph,value:'2026-10-24',plain:true,n:2}],total:2,truncated:false};
  answer={tx:7,multi_valued_rows:0,...answer};change(answer,body,calls.length);return answer;
 };
 return {request,calls};
}
test('complete projection protocol combines both pages and zero-fills the 31 UTC days',async()=>{
 const {request,calls}=protocol(),view=await readMetrics(request,{now:at});
 assert.equal(view.tx,7);assert.equal(view.validity_rows,2);assert.equal(view.validity_pages,2);
 assert.equal(view.daily_work.length,31);assert.equal(view.daily_work[0].created,0);
 assert.deepEqual(view.daily_work.at(-1),{day:'2026-10-24',created:2,closed:1,closed_p0:0,closed_p1:1});
 assert.deepEqual(calls.at(-1).after,{graph,entity:'https://seeds.local/item/aegis-a'});
 assert.deepEqual(calls[1].where,{inbox:[null]});assert.deepEqual(calls[2].where,{inbox:[null]});
});
test('changed snapshot, truncated aggregates, ambiguous rows and wrong graph never produce totals',async()=>{
 for(const change of [
  (a,b,n)=>{if(n===5)a.tx=8;},
  (a,b)=>{if(b.action==='aggregate')a.truncated=true;},
  a=>{a.multi_valued_rows=1;},
  a=>{if(a.groups)a.groups[0].graph='urn:foreign';},
  a=>{if(a.total)a.total++;},
  a=>{if(a.rows)a.rows[0].columns.priority='1';},
  a=>{if(a.rows)a.rows[0].plain.created=true;},
  (a,b)=>{if(b.after)a.rows=[sourceRow('aegis-a')];},
  a=>{if(a.next_after)delete a.next_after;},
 ]){const {request}=protocol(change);await assert.rejects(readMetrics(request,{now:at}));}
});
test('an empty aggregate is valid only with populated complete validity evidence',async()=>{
 const {request}=protocol(a=>{if(a.groups){a.groups=[];a.total=0;}}),view=await readMetrics(request,{now:at});
 assert.equal(view.created_total,0);assert.equal(view.active_total,0);
 const empty=protocol(a=>{if(a.rows){a.rows=[];a.truncated=false;}});
 await assert.rejects(readMetrics(empty.request,{now:at}),/coverage/);
});
test('pagination follows the opaque cursor, not IRI lexical order',async()=>{
 const {request}=protocol((a,b)=>{if(a.rows){a.rows=[sourceRow(b.after?'aegis-a':'aegis-z')];if(a.truncated)a.next_after={graph,entity:'https://seeds.local/item/aegis-z'};}});
 assert.equal((await readMetrics(request,{now:at})).validity_rows,2);
});
test('deadline abort stops paging and does not start another cycle',async()=>{
 const ctl=new AbortController(),{request,calls}=protocol((a,b,n)=>{if(n===4)ctl.abort();});
 await assert.rejects(readMetrics(request,{now:at,signal:ctl.signal}),/budget/);assert.equal(calls.length,4);
});
test('hidden-tab pause discards a late result and cancels its deadline',async()=>{
 let release;const first=new Promise(resolve=>{release=resolve;}),{request}=protocol(),rendered=[],timers=new Map();let next=0;
 const client=new StatsClient({request:async body=>{await first;return request(body);},render:x=>rendered.push(x),status:()=>{},now:()=>at,schedule:(fn,ms)=>{timers.set(++next,{fn,ms});return next;},cancel:id=>timers.delete(id)});
 const pending=client.start();client.pause();release();await pending;
 assert.deepEqual(rendered,[]);assert.equal(timers.size,0);assert.equal(client.busy,false);
});
test('scope and validity columns stay explicit; builder performs no I/O',()=>{
 const m=metricRequests(window);for(const r of Object.values(m)){assert.equal(r.name,'board_items');assert.equal(r.graphs.length,2);}
 assert.deepEqual(m.validity.columns,['identifier','title','priority','created','closed']);assert.equal(m.validity.limit,1000);
 m.created.graphs.length=0;assert.equal(m.closed.graphs.length,2);assert.equal(metricRequests(window).created.graphs.length,2);
});
test('invalid windows refuse rather than widen to all history',()=>{
 for(const values of [{start:'2026-10-01',end:window.end},{start:window.end,end:window.start},{start:window.start,end:'2026-12-01T00:00:00Z'}])assert.throws(()=>metricRequests(values));
});
test('mixed snapshot, truncation and absent evidence cannot become totals',()=>{
 assert.equal(snapshotTx([{tx:7,truncated:false},{tx:7,truncated:false}]),7);
 for(const answers of [[],[{tx:7,truncated:true}],[{tx:7}],[{tx:7,truncated:false},{tx:8,truncated:false}]])assert.throws(()=>snapshotTx(answers));
});
