import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePRFlow,readPRFlow,prFlowLine} from './pr-flow.mjs';
const NOW=Date.parse('2026-11-12T20:00:00Z');
const admission={enabled:true,url:'https://reader.example.test/pr-flow.json',graph:'urn:example:github',
  sourceVersion:'reviewed-source',registrationReceipt:'registration',readCostReceipt:'cost',maxAgeSeconds:900};
function body(){return {schema:'chaski.github.pr-flow/v1',state:'observed',graph:admission.graph,
  checked_at:new Date(NOW).toISOString(),scope:{repos:['example/project'],window_days:30,basis:'observed activity window'},
  unknown_repos:[],counts:{'needs-review':1},oldest_age_seconds:7200,records:[{
    repo:'example/project',pr:1,head:'a'.repeat(40),state:'needs-review',age_seconds:7200,
    since:'2026-11-12T18:00:00Z',source_observed_at:'2026-11-12T19:59:00Z'}]};}
test('source summary renders one qualified line without inventing missing measures',()=>{
  const line=prFlowLine(validatePRFlow(body(),admission,NOW));
  assert.match(line,/needs-review 1/);assert.match(line,/oldest 120m/);
  assert.match(line,/main-only refreshes UNKNOWN/);assert.match(line,/first-review time UNKNOWN/);
  assert.equal(line.includes('\n'),false);
});
test('disabled or unadmitted reader makes no requests',async()=>{
  for(const config of [{},{prFlow:{...admission,enabled:false}},{prFlow:{...admission,readCostReceipt:null}}]){
    let calls=0;const view=await readPRFlow({config,request:()=>{calls++;},now:NOW});
    assert.equal(calls,0);assert.equal(view.state,'UNKNOWN');
  }
});
test('admitted reader uses exactly one bounded GET and the caller signal',async()=>{
  const ctl=new AbortController();let calls=0;
  const view=await readPRFlow({config:{prFlow:admission},signal:ctl.signal,now:NOW,
    request:async(url,options)=>{calls++;assert.equal(url,admission.url);assert.equal(options.signal,ctl.signal);
      assert.equal(options.cap,262144);assert.equal(options.body,undefined);return body();}});
  assert.equal(calls,1);assert.equal(view.state,'observed');
});
test('foreign, partial, stale and inconsistent data stay UNKNOWN',()=>{
  const changes=[x=>x.state='UNKNOWN',x=>x.graph='urn:foreign',x=>x.checked_at='2026-11-12T19:00:00Z',
    x=>x.checked_at='2026-11-12T20:00:01Z',x=>x.unknown_repos.push('example/project'),
    x=>x.records.push(x.records[0]),x=>x.counts.red=1,x=>x.oldest_age_seconds=0,
    x=>x.records[0].head='bad',x=>x.records[0].repo='foreign/repo',x=>x.records[0].age_seconds=-1];
  for(const change of changes){const x=body();change(x);assert.throws(()=>validatePRFlow(x,admission,NOW));}
});
test('unsafe reader addresses and transport errors do not create zeros',async()=>{
  for(const url of ['http://reader.example.test/pr-flow.json','https://user:secret@reader.example.test/pr-flow.json',
    'https://reader.example.test/writer','https://reader.example.test/pr-flow.json?token=example']){
    let calls=0;const view=await readPRFlow({config:{prFlow:{...admission,url}},now:NOW,
      request:()=>{calls++;throw Error('unexpected request');}});
    assert.equal(calls,0);assert.equal(view.state,'UNKNOWN');
  }
  const view=await readPRFlow({config:{prFlow:admission},now:NOW,request:()=>{throw Error('timeout');}});
  assert.match(prFlowLine(view),/UNKNOWN/);assert.equal('counts' in view,false);
});
