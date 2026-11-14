import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activities,activityParams} from './model.mjs';
import {renderStored} from '../stored-query.mjs';
const definitions=Object.fromEntries(['merges','releases','closes'].map(k=>[k,JSON.parse(readFileSync(new URL('./'+k+'.json',import.meta.url)))]));
const now=Date.parse('2026-11-01T01:00:00Z');
const body=(d,p,rows)=>({query:d.name,sparql:renderStored(d,p),rows,count:rows.length,truncated:false});
function fixture(kind){
  const d=definitions[kind],p=activityParams(now,d),g=d.graphPrefix?p.monthNow:d.graphs[0];
  const coverage=(d.graphPrefix?[p.monthNow,p.monthPrev]:d.graphs).map(g=>({record:'coverage',g}));
  const row={record:'event',g,e:d.eventPrefix+'one',t:'2026-11-01T00:30:00Z',repo:'example/tool',sha:'a'.repeat(40),actor:'merger',artifact:'pkg:generic/example/tool@v1',title:'Done',reason:'proof'};
  return {d,p,row,coverage};
}
test('three bounded sources expose records and admitted empty windows',()=>{
  for(const kind of Object.keys(definitions)){
    const {d,p,row,coverage}=fixture(kind);
    assert.equal(activities(body(d,p,[row,...coverage]),d,now,p).rows.length,1);
    assert.equal(activities(body(d,p,coverage),d,now,p).rows.length,0);
    assert.equal(p.until,'2026-11-01T01:00:00Z');
  }
});
test('absent graph coverage is UNKNOWN, including previous month at rollover',()=>{
  for(const kind of Object.keys(definitions)){
    const {d,p,row,coverage}=fixture(kind);
    assert.throws(()=>activities(body(d,p,[row]),d,now,p),/coverage/);
    assert.throws(()=>activities(body(d,p,[row,...coverage.slice(0,1)]),d,now,p),/coverage/);
  }
});
test('partial, duplicate, foreign, stale and overflowing windows refuse',()=>{
  const {d,p,row,coverage}=fixture('merges');
  const rows=[row,...coverage];
  assert.throws(()=>activities({...body(d,p,rows),truncated:true},d,now,p));
  for(const invalid of [[row,row,...coverage],[{...row,g:'urn:foreign'},...coverage],[{...row,t:p.until},...coverage],[{...row,sha:'branch'},...coverage],...['e','repo'].map(k=>[{...row,[k]:'foreign'},...coverage]),[...Array.from({length:101},(_,i)=>({...row,e:d.eventPrefix+i})),...coverage]]){
    assert.throws(()=>activities(body(d,p,invalid),d,now,p));
  }
  assert.throws(()=>activities(body(d,p,rows),d,now,{...p,monthPrev:p.monthNow}));
});
test('a close must carry its reason and a publication must name the acting principal',()=>{
  for(const [kind,field] of [['closes','reason'],['releases','actor']]){
    const {d,p,row,coverage}=fixture(kind);delete row[field];
    assert.throws(()=>activities(body(d,p,[row,...coverage]),d,now,p));
  }
});
