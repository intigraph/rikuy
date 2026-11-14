// RDF-to-view projection only. query is a read seam: current remote point reads,
// then the shared in-page Quipu. No replication or transaction application.
const S='https://schema.org/',SEEDS='https://seeds.local/ontology/',RDFS='http://www.w3.org/2000/01/rdf-schema#';
export const RECORD_GRAPH='https://seeds.local/project/aegis';
const scalar=v=>v&&typeof v==='object'&&'value'in v?v.value:v;
function iri(value){
  if(typeof value!=='string'||! /^(https?:\/\/|urn:)/.test(value)||/[\x00-\x20<>"{}|^`\\]/.test(value))throw Error('Invalid record identifier');
  return '<'+value+'>';
}
function rows(body,cap){
  if(!Array.isArray(body?.rows)||body.count!==body.rows.length||body.truncated===true||body.rows.length>=cap)throw Error('Record read is incomplete or exceeds its limit');
  return body.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,scalar(value)])));
}
const label=value=>{try{return decodeURIComponent(String(value).split('/').at(-1))||'Linked record';}catch{return 'Linked record';}};
export function makeRecordReader({query,now=()=>Date.now()}={}){
  if(typeof query!=='function')throw Error('A Quipu query reader is required');
  return async entity=>{
    const selected=iri(entity),graph=iri(RECORD_GRAPH);
    const factsQuery=`SELECT ?predicate ?value (isIRI(?value) AS ?resource) ?label WHERE { GRAPH ${graph} { ${selected} ?predicate ?value . OPTIONAL { ?value <${S}name> ?label } } } LIMIT 101`;
    const commentsQuery=`SELECT ?comment ?text ?author ?created WHERE { GRAPH ${graph} { ?comment <${S}parentItem> ${selected} ; <${S}text> ?text . OPTIONAL { ?comment <${S}author> ?author } OPTIONAL { ?comment <${S}dateCreated> ?created } } } ORDER BY DESC(?created) LIMIT 26`;
    const [factsBody,commentsBody]=await Promise.all([query(factsQuery),query(commentsQuery)]);
    const facts=rows(factsBody,101),comments=rows(commentsBody,27);
    if(!facts.length)throw Error('This record has no facts in the selected board');
    const one=predicate=>{
      const values=[...new Set(facts.filter(row=>row.predicate===predicate).map(row=>row.value))];
      if(values.length>1)throw Error('Conflicting record field');
      return values[0];
    };
    const title=one(S+'name')||one(RDFS+'label')||'Untitled record';
    if(typeof title!=='string')throw Error('Invalid record title');
    const links=new Map();
    for(const row of facts){
      if(!['true',true].includes(row.resource)||typeof row.value!=='string'||!row.value.startsWith('https://seeds.local/item/')||row.value===entity)continue;
      links.set(row.value,{iri:row.value,label:row.label||label(row.value),relation:label(row.predicate)});
    }
    return {iri:entity,title,status:one(SEEDS+'status'),owner:one(S+'agent')?label(one(S+'agent')):null,
      created:one(S+'dateCreated'),modified:one(S+'dateModified'),description:one(S+'description'),
      comments:comments.slice(0,25).map(row=>({id:row.comment,text:row.text,author:row.author?label(row.author):null,created:row.created})),commentsMore:comments.length>25,
      links:[...links.values()],asOf:{at:new Date(now()).toISOString(),stale:false},
      raw:{facts,comments,scope:RECORD_GRAPH,readKind:'independent point reads; no atomic watermark claim'}};
  };
}
