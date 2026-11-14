import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {asks,later,sourceControl,asksReader,titleItems} from './model.mjs';
const load=name=>JSON.parse(fs.readFileSync(new URL(name,import.meta.url)));
const definitions={asks:load('./query.json'),titles:load('./titles.json'),item:load('./item.json')},control=load('./control.json');
const laterDef=JSON.parse(fs.readFileSync(new URL('../later/query.json',import.meta.url)));
const now=Date.parse('2026-10-22T17:00:00Z');
const IRI=id=>'https://seeds.local/item/'+id;
const row=(id='aegis-one',extra={})=>({item:IRI(id),id,title:'Choose <script>literal</script>',priority:1,rank:'2',status:'open',revision:1,modified:'2026-10-21T01:00:00Z',created:'2026-10-20T01:00:00Z',gate:'desk',options:'',rec:'',...extra});
const body=(def,rows,sparql=def.template)=>({query:def.name,sparql,rows,count:rows.length,truncated:false});
const itemBody=(seed,rows)=>body(definitions.item,rows,definitions.item.template.replaceAll('{seed}',seed));
const composite=(rows,titled=[],items=[])=>({asks:body(definitions.asks,rows),unlabelled:titled,items});
const positive={query:control.name,sparql:control.template,rows:[{item:IRI('aegis-blh.1'),revision:1}],count:1,truncated:false};

test('every labelled seed is a card: no page cut, gates folded, OPTIONS and REC kept',()=>{
  const rows=Array.from({length:49},(_,i)=>row('aegis-'+String(i).padStart(2,'0'),{rank:String(i)}));
  rows.push(row('aegis-00',{gate:'decision-needed',options:'A | B',rec:'A'}));
  const view=asks(composite(rows),definitions,now);
  assert.equal(view.rows.length,49);assert.equal(view.incomplete,false);
  const first=view.rows.find(r=>r.id==='aegis-00');assert.deepEqual(first.gates,['desk','decision-needed']);assert.equal(first.options,'A | B');assert.equal(first.rec,'A');
});

test('a titled ASK with no gate label is read by point and shown',()=>{
  const seed=IRI('aegis-hwd'),one=row('aegis-hwd',{gate:undefined,title:'ASK Stiwi: brief stays HTTP-only'});delete one.gate;
  const view=asks(composite([row()],[seed],[{seed,body:itemBody(seed,[one])}]),definitions,now);
  assert.deepEqual(view.rows.map(r=>r.id).sort(),['aegis-hwd','aegis-one']);
  assert.deepEqual(view.rows.find(r=>r.id==='aegis-hwd').gates,['ask-title']);
});

test('a titled ASK the reads did not cover is UNKNOWN, never silently absent',()=>{
  assert.throws(()=>asks(composite([row()],[IRI('aegis-missing')],[]),definitions,now),/Titled ask missing/);
});

test('changed queries, partial input and foreign gates refuse',()=>{
  for(const input of [{...composite([row()]),asks:{...body(definitions.asks,[row()]),query:'daily_brief_asks_v3'}},
    {...composite([row()]),asks:{...body(definitions.asks,[row()]),truncated:true}},
    composite([row('aegis-one',{gate:'guessed-approval'})]),composite([row(),row()])])assert.throws(()=>asks(input,definitions,now));
});

test('titles arm accepts only ASK Stiwi titles on aegis items',()=>{
  const t=rows=>body(definitions.titles,rows);
  assert.deepEqual(titleItems(t([{item:IRI('aegis-hwd'),title:'ASK Stiwi: x',status:'open'}]),definitions.titles),[IRI('aegis-hwd')]);
  for(const bad of [[{item:IRI('aegis-hwd'),title:'Not an ask',status:'open'}],[{item:'https://evil.example/x',title:'ASK Stiwi',status:'open'}]])assert.throws(()=>titleItems(t(bad),definitions.titles));
});

test('reader: control first, then asks and titles, point-reads only unlabelled titled asks',async()=>{
  const calls=[],seed=IRI('aegis-hwd');
  const read=asksReader({endpoint:'https://reader.example',control,definitions,request:async(url,options)=>{
    const name=options.body.name;calls.push(name);
    if(name===control.name)return positive;
    if(name===definitions.asks.name)return body(definitions.asks,[row()]);
    if(name===definitions.titles.name)return body(definitions.titles,[{item:IRI('aegis-one'),title:'ASK Stiwi: labelled too',status:'open'},{item:seed,title:'ASK Stiwi: unlabelled',status:'open'}]);
    return itemBody(seed,[row('aegis-hwd',{title:'ASK Stiwi: unlabelled'})]);
  }});
  const result=await read({name:definitions.asks.name,params:{}},new AbortController().signal);
  assert.deepEqual(calls,[control.name,definitions.asks.name,definitions.titles.name,definitions.item.name]);
  assert.deepEqual(result.unlabelled,[seed]);assert.equal(result.items.length,1);
});

test('missing population control prevents every asks read',async()=>{
  let calls=0;const read=asksReader({endpoint:'https://reader.example',control,definitions,request:async()=>{calls++;return {...positive,rows:[],count:0};}});
  await assert.rejects(()=>read({name:definitions.asks.name,params:{}},new AbortController().signal));assert.equal(calls,1);
  sourceControl(positive,control);
});

test('later lists stiwi-later seeds and refuses an invalid priority',()=>{
  const l=rows=>body(laterDef,rows);
  assert.equal(later(l([row('aegis-two',{priority:2})]),laterDef,now)[0].priority,2);
  assert.throws(()=>later(l([row('aegis-two',{priority:9})]),laterDef,now));
});
