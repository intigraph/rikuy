import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deploys,paceParams} from './model.mjs';
import {renderStored} from '../stored-query.mjs';
const definition=JSON.parse(fs.readFileSync(new URL('./query.json',import.meta.url)));
const now=Date.parse('2026-10-21T03:00:00Z'),params=paceParams(now,definition);
const row=(id='0001',extra={})=>({e:'http://aegis.gastown.local/ontology/deployment-event-'+id,t:'2026-10-21T01:31:09Z',outcome:'succeeded',service:'http://aegis.gastown.local/ontology/quipu',artifact:'pkg:github/scbrown/quipu@545cfa23',env:'kota.lan',...extra});
const body=(rows,p=params)=>({query:definition.name,sparql:renderStored(definition,p),rows,count:rows.length,truncated:false});
test('window covers current and previous month, never the same graph twice',()=>{
 assert.deepEqual(params,{monthNow:'https://camayoc.local/window/deployment/2026-10',monthPrev:'https://camayoc.local/window/deployment/2026-09',since:'2026-10-20T03:00:00Z'});
 const jan=paceParams(Date.parse('2027-01-01T05:00:00Z'),definition);assert.equal(jan.monthNow.slice(-7),'2027-01');assert.equal(jan.monthPrev.slice(-7),'2026-12');assert.equal(jan.since,'2026-12-31T05:00:00Z');
});
test('rendered SPARQL binds both explicit graphs and quotes the since literal',()=>{
 const sparql=renderStored(definition,params);
 assert(sparql.includes('VALUES ?g { <https://camayoc.local/window/deployment/2026-10> <https://camayoc.local/window/deployment/2026-09> }'));assert(sparql.includes(">= '2026-10-20T03:00:00Z'"));assert(!sparql.includes('{since}'));
 assert.throws(()=>renderStored(definition,{...params,monthNow:'https://x/a b'}));assert.throws(()=>renderStored(definition,{...params,monthNow:'https://x/<y>'}));
 assert.equal(renderStored({...definition,template:"'{since}'"},{...params,since:"x'y\\z"}),"'x\\'y\\\\z'");
});
test('deploys count by outcome and keep each record linked to its node',()=>{
 const view=deploys(body([row(),row('0002',{outcome:'rolledback',service:undefined,env:undefined}),row('0003',{outcome:'failed'})]),definition,now,params);
 assert.deepEqual(view.counts,{succeeded:1,rolledback:1,failed:1});assert.equal(view.rows[0].service,'quipu');assert.equal(view.rows[0].event,row().e);assert.equal(view.rows[1].service,null);assert.equal(view.rows[1].environment,null);
});
test('an empty window is a real zero only for a well-formed response',()=>{
 assert.equal(deploys(body([]),definition,now,params).rows.length,0);
 for(const input of [{...body([]),query:'other'},{...body([]),truncated:true},{...body([]),count:1},{...body([]),sparql:'SELECT * WHERE {}'}])assert.throws(()=>deploys(input,definition,now,params));
});
test('foreign, duplicate, out-of-window, unknown-outcome and overflowing rows refuse',()=>{
 for(const rows of [[row('0001',{e:'http://evil.example/deployment-event-1'})],[row(),row()],[row('0001',{t:'2026-10-20T02:59:59Z'})],[row('0001',{t:'2026-10-21T04:00:00Z'})],[row('0001',{t:'2026-10-21 01:31:09'})],[row('0001',{outcome:'guessed'})],Array.from({length:101},(_,i)=>row(String(i)))])assert.throws(()=>deploys(body(rows),definition,now,params));
 assert.throws(()=>deploys(body([],{...params,monthPrev:params.monthNow}),definition,now,{...params,monthPrev:params.monthNow}));
});
test('int parameters mirror Quipu: a number or decimal string, never text',()=>{
 const def={template:'OFFSET {offset}',params:[{name:'offset',type:'int'}]};
 assert.equal(renderStored(def,{offset:20}),'OFFSET 20');assert.equal(renderStored(def,{offset:'-3'}),'OFFSET -3');
 for(const bad of ['1.5','abc','',"0; DROP",'99999999999999999999',1.5])assert.throws(()=>renderStored(def,{offset:bad}),String(bad));
});
