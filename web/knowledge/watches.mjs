// Existing producer vocabulary only. This is a read-only candidate, not a
// registration or a declaration that every watch has migrated to Quipu.
export const WATCH_GRAPH='urn:quipu:graph:root';
export const WATCHES=Object.freeze([
  {key:'semweb',title:'Semantic web',group:'semweb-watch'},
  {key:'gas_city',title:'Gas City / Beads',group:null},
  {key:'external',title:'Quipu external references',group:null},
]);
const NS='http://aegis.gastown.local/ontology/';
const scalar=x=>x&&typeof x==='object'?x.value:x;
const text=(x,max=4096)=>{x=scalar(x);if(typeof x!=='string'||!x.trim()||x.length>max)throw Error('Malformed watch fact');return x;};
const iri=x=>{x=text(x);if(!x.startsWith(NS)||!/^https?:\/\/[^\s<>"{}]+$/.test(x)||new URL(x).href!==x)throw Error('Foreign or noncanonical watch identity');return x;};
const day=x=>/^\d{4}-\d\d-\d\d$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
export function sourceURL(x){
  if(x===undefined||x===null)return null;
  try{const u=new URL(text(x));if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error();return u.href;}catch{throw Error('Unsafe source link');}
}
export function watchDefinition(watch){
  if(!watch.group)return null;
  if(!/^[a-z][a-z0-9-]{0,63}$/.test(watch.group))throw Error('Unadmitted producer group');
  const template=`PREFIX a: <${NS}> PREFIX prov: <http://www.w3.org/ns/prov#> SELECT ?run ?episode ?checked ?runDate ?archive ?finding ?title ?date ?kind ?url ?angle WHERE { ?episode a:groupId "${watch.group}" ; prov:generatedAtTime ?checked . FILTER(?checked >= "{start}"^^<http://www.w3.org/2001/XMLSchema#dateTime> && ?checked <= "{end}"^^<http://www.w3.org/2001/XMLSchema#dateTime>) ?run a a:Observation ; a:kind "run" ; prov:wasGeneratedBy ?episode ; a:date ?runDate . OPTIONAL { ?run a:notesFile ?archive } OPTIONAL { ?run a:hasFinding ?finding . ?finding a a:Observation ; prov:wasGeneratedBy ?episode ; a:title ?title ; a:date ?date ; a:kind ?kind . OPTIONAL { ?finding a:url ?url } OPTIONAL { ?finding a:quipuAngle ?angle } } } ORDER BY DESC(?checked) ?run ?finding LIMIT 101`;
  return {name:`daily_brief_watch_${watch.key}_v1`,description:'Bounded typed watch runs and linked findings; missing coverage is UNKNOWN',template,graph:WATCH_GRAPH,rowCap:101,params:[{name:'start',type:'text',required:true},{name:'end',type:'text',required:true}]};
}
export function watchParams(now){return {start:new Date(now-30*86400000).toISOString(),end:new Date(now).toISOString()};}
export function expandedWatch(def,params){let q=def.template;for(const k of ['start','end']){if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(params[k]??'')||!Number.isFinite(Date.parse(params[k])))throw Error('Invalid watch window');q=q.replaceAll('{'+k+'}',params[k]);}return q;}
export function validateWatch(response,def,params,now){
  if(!response||response.query!==def.name||response.sparql!==expandedWatch(def,params)||response.truncated!==false||!Array.isArray(response.rows)||response.count!==response.rows.length||response.rows.length>=def.rowCap)throw Error('Watch query identity, bound or truncation failed');
  if(!response.rows.length)throw Error('Watch coverage UNKNOWN: no typed run in the admitted window');
  const seen=new Set(),runs=new Map(),rows=[];
  for(const raw of response.rows){
    const run=iri(raw.run),episode=iri(raw.episode),checked=text(raw.checked),runDate=text(raw.runDate,10);
    const timestamp=Date.parse(checked);
    if(!Number.isFinite(timestamp)||timestamp>now||timestamp<Date.parse(params.start)||timestamp>Date.parse(params.end)||!day(runDate))throw Error('Invalid watch run time');
    const prior=runs.get(run);if(prior&&prior!==episode+'|'+checked)throw Error('Mixed watch run provenance');runs.set(run,episode+'|'+checked);
    const archive=raw.archive===undefined?null:text(raw.archive);
    const base={run,episode,checked,runDate,archive,sourceKind:'Observation',confidence:'UNKNOWN',runStatus:'UNKNOWN'};
    if(raw.finding===undefined){if(['title','date','kind','url','angle'].some(k=>raw[k]!==undefined))throw Error('Orphan finding facts');rows.push(base);continue;}
    const finding=iri(raw.finding);if(seen.has(finding))throw Error('Duplicate or conflicting finding');seen.add(finding);
    const date=text(raw.date,10);if(!day(date)||Date.parse(date)>now)throw Error('Invalid finding date');
    rows.push({...base,finding,title:text(raw.title),date,kind:text(raw.kind,80),url:sourceURL(raw.url),angle:raw.angle===undefined?null:text(raw.angle)});
  }
  return rows;
}
export async function readWatches({config,request,signal,now}){
  const result={};
  // Separate admission from the Seeds panel admission. No new read is made by
  // default or merely because the existing Brief has been enabled.
  for(const watch of WATCHES){
    const def=watchDefinition(watch),admission=config.watches;
    if(!admission?.enabled||!def||!admission.registrationReceipt||!admission.readCostReceipt||admission.graph!==WATCH_GRAPH){result[watch.key]={state:'UNKNOWN',reason:'Watch coverage UNKNOWN · producer mapping / registration / read-cost admission pending',rows:[]};continue;}
    try{const params=watchParams(now);const response=await request('/ask',{name:def.name,params},signal);result[watch.key]={state:'observed',rows:validateWatch(response,def,params,now),query:def.name};}
    catch(error){result[watch.key]={state:'UNKNOWN',reason:error.message,rows:[]};}
  }
  return result;
}
export function renderWatches(doc,view){
  const make=(tag,text)=>{const e=doc.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const section=make('section');section.append(make('h2','Watches'));
  section.append(make('p','Query-derived findings; separate run reads, no atomic snapshot. No agent-written headlines or automatic picks.'));
  for(const watch of WATCHES){
    const group=make('section'),panel=view.watches?.[watch.key];group.append(make('h3',watch.title));
    if(panel?.state!=='observed'){group.append(make('p',panel?.reason??'Watch coverage UNKNOWN · producer/query coverage not admitted'));section.append(group);continue;}
    group.append(make('p','Query '+(panel.query??'UNKNOWN')+' · default ROOT · 30-day selection, not complete watch history'));
    const runs=new Map();for(const row of panel.rows){if(!runs.has(row.run))runs.set(row.run,[]);runs.get(row.run).push(row);}
    const seen=view.watchSeen?.[watch.key];
    group.append(make('p',Number.isFinite(seen)?'New since previous successful view in this browser: '+new Date(seen).toISOString():'Previous browser view UNKNOWN; no new-count claim'));
    for(const rows of runs.values()){
      const run=rows[0];group.append(make('p',`Run ${run.runDate} · checked ${run.checked} · status ${run.runStatus} · confidence ${run.confidence}`));
      if(Number.isFinite(seen))group.append(make('p',Date.parse(run.checked)>seen?'New since previous browser view':'Previously covered by browser view'));
      const provenance=make('a','Quipu run / findings');provenance.href=run.run;provenance.rel='noopener noreferrer';group.append(provenance);
      group.append(make('p',`Episode ${run.episode} · source ${run.sourceKind}`));
      if(run.archive)group.append(make('p','Archive pointer (not a live source): '+run.archive));
      const list=make('ul');for(const row of rows.filter(r=>r.finding)){
        const li=make('li');li.append(make('strong',row.title),make('p',`${row.date} · ${row.kind} · confidence ${row.confidence}`));
        const finding=make('a','Finding in Quipu');finding.href=row.finding;finding.rel='noopener noreferrer';li.append(finding);
        if(row.url){const a=make('a','Original source');a.href=row.url;a.rel='noopener noreferrer';li.append(a);}else li.append(make('p','Original source link UNKNOWN'));
        if(row.angle)li.append(make('p','Quipu angle: '+row.angle));
        if(row.kind==='idea')li.append(make('p','Needs you: idea for consideration; no pick/approval is inferred.'));
        list.append(li);
      }group.append(list);
      if(!rows.some(r=>r.finding))group.append(make('p','No linked typed finding returned for this run. Completeness and run outcome UNKNOWN.'));
    }section.append(group);
  }
  return section;
}

// Browser-local convenience, never a graph receipt or cross-device read state.
export function watchSeen(storage,now){
  const result={};for(const watch of WATCHES){try{const raw=storage?.getItem('brief-watch-seen-v1:'+watch.key);if(raw!==null&&raw!==undefined&&/^\d+$/.test(raw)){const n=Number(raw);if(Number.isSafeInteger(n)&&n>0&&n<=now)result[watch.key]=n;}}catch{ /* unavailable storage means UNKNOWN */ }}return result;
}
export function rememberWatches(storage,view){
  if(!Number.isSafeInteger(view.checkedAt)||view.checkedAt<=0)return;
  for(const watch of WATCHES)if(view.watches?.[watch.key]?.state==='observed')try{storage?.setItem('brief-watch-seen-v1:'+watch.key,String(view.checkedAt));}catch{ /* no write receipt claimed */ }
}
