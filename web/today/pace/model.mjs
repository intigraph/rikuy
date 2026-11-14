import {Unknown} from '../knowledge/model.mjs';
import {storedRows} from '../stored-query.mjs';
const OUTCOMES=['succeeded','rolledback','failed'],EVENT='http://aegis.gastown.local/ontology/deployment-event-',MAX_SKEW=300000;
const iso=t=>new Date(t).toISOString().replace(/\.\d{3}Z$/,'Z');
// Current and previous calendar month: always two distinct graphs, so a
// window crossing a month boundary is covered and no graph is read twice.
export function paceParams(now,definition){
  const d=new Date(now),prev=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),0));
  const month=x=>definition.graphPrefix+x.toISOString().slice(0,7);
  return {monthNow:month(d),monthPrev:month(prev),since:iso(now-definition.windowHours*3600000)};
}
export function deploys(body,definition,now=Date.now(),params=paceParams(now,definition)){
  const expected=paceParams(Date.parse(params.since)+definition.windowHours*3600000,definition);
  if(params.monthNow!==expected.monthNow||params.monthPrev!==expected.monthPrev)throw new Unknown('Deployment window graphs changed');
  const since=Date.parse(params.since),seen=new Set();
  const rows=storedRows(body,definition,params).map(r=>{
    if(typeof r.e!=='string'||!r.e.startsWith(EVENT))throw new Unknown('Foreign deployment record');
    if(seen.has(r.e))throw new Unknown('Duplicate deployment record');seen.add(r.e);
    const t=typeof r.t==='string'&&r.t.endsWith('Z')?Date.parse(r.t):NaN;
    if(!Number.isFinite(t)||t<since||t>now+MAX_SKEW)throw new Unknown('Deployment outside query window');
    if(!OUTCOMES.includes(r.outcome))throw new Unknown('Unknown deployment outcome');
    return {event:r.e,occurredAt:r.t,outcome:r.outcome,service:typeof r.service==='string'?r.service.split('/').at(-1):null,artifact:r.artifact??null,environment:r.env??null};
  });
  return {rows,since:params.since,counts:Object.fromEntries(OUTCOMES.map(o=>[o,rows.filter(r=>r.outcome===o).length]))};
}

export function activityParams(now,definition){
  const until=iso(now),since=iso(now-definition.windowHours*3600000);
  return definition.graphPrefix?{...paceParams(now,definition),until}:{since,until};
}

export function activities(body,definition,now=Date.now(),params=activityParams(now,definition)){
  const since=Date.parse(params.since),until=Date.parse(params.until);
  const expected=activityParams(until,definition);
  if(!Number.isFinite(since)||!Number.isFinite(until)||until-since!==86400000||
     Object.keys(expected).some(k=>params[k]!==expected[k]))throw new Unknown('Activity window changed');
  const rows=storedRows(body,definition,params),seen=new Set(),covered=new Set(),events=[];
  const graphs=definition.graphPrefix?[params.monthNow,params.monthPrev]:definition.graphs;
  for(const r of rows){
    if(!graphs.includes(r.g))throw new Unknown('Foreign activity graph');
    if(r.record==='coverage'){
      if(covered.has(r.g))throw new Unknown('Duplicate coverage');
      covered.add(r.g);continue;
    }
    if(r.record!=='event'||typeof r.e!=='string'||!r.e.startsWith(definition.eventPrefix)||seen.has(r.e))throw new Unknown('Foreign or duplicate activity');
    seen.add(r.e);
    const t=typeof r.t==='string'?Date.parse(r.t):NaN;
    if(!Number.isFinite(t)||t<since||t>=until||t>now+MAX_SKEW)throw new Unknown('Activity outside query window');
    if(definition.kind==='closes'){
      if(typeof r.title!=='string'||!r.title.trim()||typeof r.reason!=='string'||!r.reason.trim())throw new Unknown('Close has no reason');
    }else{
      if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.repo)||!/^[0-9a-f]{40}$/.test(r.sha))throw new Unknown('Missing repository or resolved commit');
      if(definition.kind==='releases'&&(typeof r.actor!=='string'||!r.actor.trim()||typeof r.artifact!=='string'||!r.artifact.startsWith('pkg:')))throw new Unknown('Incomplete publication');
    }
    events.push({event:r.e,occurredAt:r.t,title:r.title??r.repo,detail:r.reason??r.artifact??r.sha,actor:r.actor??null});
  }
  const required=definition.graphPrefix?[params.monthNow,...(params.since.slice(0,7)!==params.until.slice(0,7)?[params.monthPrev]:[])]:graphs;
  if(required.some(g=>!covered.has(g)))throw new Unknown('Source graph coverage unavailable');
  if(events.length>100)throw new Unknown('Activity window overflow');
  events.sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt)||a.event.localeCompare(b.event));
  return {rows:events,since:params.since};
}
