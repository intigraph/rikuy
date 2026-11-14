// Query invalidation only: records never supply displayed data. Unknown input
// re-reads; skipping requires a known attribute and a known query dependency.
const S='https://schema.org/',D='https://seeds.local/ontology/';
const R='http://www.w3.org/2000/01/rdf-schema#label';
const known=new Set([
  ...['identifier','name','description','keywords','agent','creator','version','dateModified','dateCreated','actionStatus','parentItem','author','position','text','endTime'].map(x=>S+x),
  ...['priority','rank','status','notes','deferredAt','deferredBy','workflowRun','issueType'].map(x=>D+x),
  R,'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  'https://scbrown.github.io/quechua/ns#sourceKind','https://scbrown.github.io/quechua/ns#outcome',
  'http://www.w3.org/2002/12/cal/ical#due',
]);
const families={
  daily_brief_priorities_v3:{membership:[D+'priority',D+'status',S+'keywords',S+'identifier',S+'name'],fields:[S+'identifier',S+'name',D+'priority',D+'rank',D+'status',S+'agent',S+'version',S+'dateModified']},
  daily_brief_later_v1:{membership:[S+'keywords',D+'status',D+'priority'],fields:[S+'identifier',S+'name',D+'priority',D+'status',S+'version',S+'dateModified',S+'dateCreated']},
  daily_brief_asks_v4:{membership:[S+'keywords',D+'status',D+'priority',R],fields:[S+'identifier',S+'name',D+'priority',D+'rank',D+'status',S+'agent',S+'version',S+'dateModified',S+'dateCreated',S+'description',D+'notes','http://www.w3.org/2002/12/cal/ical#due',R,S+'keywords']},
  daily_brief_recently_deferred_v1:{membership:[D+'deferredAt'],fields:[S+'identifier',S+'name',D+'status',S+'version',S+'dateModified',D+'deferredAt',D+'deferredBy']},
};
export function feedRelevant(name,view,page){
  const family=families[name],rows=Array.isArray(view)?view:view?.rows;
  if(!family||!Array.isArray(rows)||!page||page.capture!=='old_and_new_values'||!Array.isArray(page.records)||!page.records.length||page.partial)return true;
  // The max+1 sentinel is validated even though it is not displayed.
  const shown=new Set(view.feedItems??rows.map(r=>r.item));
  const key=(entity,attribute)=>JSON.stringify([entity,attribute]),asserted=new Set(),retracted=new Set();
  for(const r of page.records)if(r&&typeof r==='object'){
    if(r.op==='assert'&&Object.hasOwn(r,'value'))asserted.add(key(r.entity,r.attribute));
    if(r.op==='retract'&&Object.hasOwn(r,'old_value'))retracted.add(key(r.entity,r.attribute));
  }
  const replaced=(entity,attribute)=>asserted.has(key(entity,attribute))&&retracted.has(key(entity,attribute));
  const required=name==='daily_brief_priorities_v3'?[S+'identifier',S+'name',S+'version',S+'dateModified']:[];
  for(const r of page.records){
    if(!r||typeof r!=='object'||!['assert','retract'].includes(r.op)||typeof r.entity!=='string'||!known.has(r.attribute)||!Object.hasOwn(r,r.op==='assert'?'value':'old_value'))return true;
    if(!/^https:\/\/seeds\.local\/item\/aegis-[a-z0-9]+(?:\.[0-9]+)*(?:\/comment\/[^/]+)?$/.test(r.entity))return true;
    // Comments are not a dependency of these stored queries.
    if(r.entity.includes('/comment/'))continue;
    if(shown.has(r.entity)&&family.fields.includes(r.attribute))return true;
    if(required.includes(r.attribute)){
      // A previously absent required field can make an unseen item enter.
      // Only a same-frame replacement proves that this requirement was met before.
      if(!replaced(r.entity,r.attribute))return true;
      if(r.attribute===S+'version'||r.attribute===S+'dateModified')continue;
    }
    if(family.membership.includes(r.attribute))return true;
  }
  return false;
}
