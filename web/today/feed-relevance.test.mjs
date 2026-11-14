import test from 'node:test';
import assert from 'node:assert/strict';
import {feedRelevant} from './feed-relevance.mjs';
const S='https://schema.org/',D='https://seeds.local/ontology/';
const item='https://seeds.local/item/aegis-one',other='https://seeds.local/item/aegis-other';
const names=['daily_brief_priorities_v3','daily_brief_later_v1','daily_brief_asks_v4','daily_brief_recently_deferred_v1'];
const page=(attribute,entity=other,op='assert')=>({capture:'old_and_new_values',records:[{entity,attribute,op,[op==='assert'?'value':'old_value']:'value'},...(op==='assert'?[{entity,attribute,op:'retract',old_value:'old'}]:[])]});
for(const name of names){
 test(name+': displayed revision refreshes; unrelated revision and comment do not',()=>{
  assert.equal(feedRelevant(name,[{item}],page(S+'version',item)),true);
  assert.equal(feedRelevant(name,[{item}],page(S+'version')),false);
  assert.equal(feedRelevant(name,[{item}],page(S+'text',other+'/comment/c1')),false);
 });
 test(name+': membership assertions and retractions refresh outside current rows',()=>{
  const attrs=name.includes('deferred')?[D+'deferredAt']:name.includes('priorities')?[D+'priority',D+'status',S+'keywords']:name.includes('later')?[S+'keywords',D+'status']:[S+'keywords',D+'status','http://www.w3.org/2000/01/rdf-schema#label'];
  for(const a of attrs)for(const op of ['assert','retract'])assert.equal(feedRelevant(name,[{item}],page(a,other,op)),true,a+' '+op);
 });
 test(name+': unclassifiable input fails open',()=>{
  for(const p of [null,{}, {capture:'old_and_new_values',records:[]}, {capture:'old_and_new_values',records:[null]},page('https://unknown.test/attribute'),{...page(S+'version'),partial:true},{...page(S+'version'),capture:'keys_only'}])assert.equal(feedRelevant(name,[{item}],p),true);
  assert.equal(feedRelevant(name,null,page(S+'version')),true);
 });
}
test('displayed owner changes refresh only queries that display owner',()=>{
 assert.equal(feedRelevant(names[0],[{item}],page(S+'agent',item)),true);
 assert.equal(feedRelevant(names[2],{rows:[{item}]},page(S+'agent',item)),true);
 assert.equal(feedRelevant(names[0],[{item}],page(S+'agent')),false);
});

test('a newly added required priority field refreshes even outside displayed rows',()=>{
 for(const attribute of ['identifier','name','version','dateModified'])for(const op of ['assert','retract'])assert.equal(feedRelevant(names[0],[{item}],{capture:'old_and_new_values',records:[{entity:other,attribute:S+attribute,op,[op==='assert'?'value':'old_value']:'new'}]}),true);
});

test('validated overflow sentinel changes still invalidate',()=>{
 const view=[{item}];Object.defineProperty(view,'feedItems',{value:[item,other]});
 assert.equal(feedRelevant(names[0],view,page(S+'version')),true);
 assert.equal(feedRelevant(names[3],{rows:[{item}],feedItems:[item,other]},page(D+'status')),true);
});
