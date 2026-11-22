// Versioned, read-only accounting over a finite ledger snapshot.
export const VERSION='ephemeral-economics/v1';
const jobs=new Set(['review','merge','triage','task']);
const exhausted=new Set(['timeout','turn budget','context budget']);
const known=new Set([...exhausted,'report','launch failed','stopped','dead pane','approval prompt unanswered']);
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
export function windowSeconds(start,end){
  const parse=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(x)?Date.parse(x)/1000:NaN;
  start=parse(start);end=parse(end);
  if(!finite(start)||!finite(end)||end<=start||end-start>31*86400)throw Error('Explicit UTC window of at most 31 days required.');
  return {start,end};
}
export function percentile(values,q){
  if(!values.length)return null;
  return [...values].sort((a,b)=>a-b)[Math.ceil(q*values.length)-1];
}
export function summarize(snapshot){
  if(snapshot?.version!==VERSION||!Array.isArray(snapshot.attempts)||snapshot.attempts.length>2000)throw Error('Unsupported or oversized economics snapshot.');
  const {start,end}=windowSeconds(snapshot.window?.start,snapshot.window?.end);
  if(!finite(snapshot.observed_at)||typeof snapshot.complete!=='boolean'||!Array.isArray(snapshot.unknown)||snapshot.unknown.length>2000)throw Error('Missing coverage evidence.');
  const ids=new Set(),daily=new Map(),groups=new Map(),attempts=[];
  let invalid=0;
  for(const r of snapshot.attempts){
    if(typeof r?.name!=='string'||!/^eph-(review|merge|triage|task)-[a-zA-Z0-9]+$/.test(r.name)||ids.has(r.name))throw Error('Missing or duplicate attempt identity.');
    ids.add(r.name);
    if(!finite(r.spawned_at)||!jobs.has(r.job)||!['done','live','launching'].includes(r.state)){invalid++;continue;}
    if(r.spawned_at<start||r.spawned_at>=end)continue;
    const day=new Date(r.spawned_at*1000).toISOString().slice(0,10),key=JSON.stringify([r.job,r.harness||'UNKNOWN',r.model||'UNKNOWN',r.max_turns??null,finite(r.deadline)?r.deadline-r.spawned_at:null,r.max_context_k??null]);
    const group=groups.get(key)||{job:r.job,harness:r.harness||'UNKNOWN',model:r.model||'UNKNOWN',max_turns:r.max_turns??null,lifetime_seconds:finite(r.deadline)?r.deadline-r.spawned_at:null,max_context_k:r.max_context_k??null,spawned:0,terminal:0,live:0,invalid_duration:0,exhausted:0,unknown_cause:0,causes:{},durations:[],teardown_lags:[]};
    groups.set(key,group);group.spawned++;
    const dailyKey=day+' '+r.job;daily.set(dailyKey,(daily.get(dailyKey)||0)+1);
    const terminal=r.state==='done';
    const duration=terminal&&finite(r.ended_at)&&r.ended_at>=r.spawned_at&&r.ended_at<=snapshot.observed_at?r.ended_at-r.spawned_at:null;
    if(terminal){
      group.terminal++;
      const cause=known.has(r.cause)?r.cause:'UNKNOWN';group.causes[cause]=(group.causes[cause]||0)+1;
      if(exhausted.has(cause))group.exhausted++;if(cause==='UNKNOWN')group.unknown_cause++;
      if(duration!==null)group.durations.push(duration);else group.invalid_duration++;
      if(finite(r.torn_down_at)&&finite(r.ended_at)&&r.torn_down_at>=r.ended_at&&r.torn_down_at<=snapshot.observed_at)group.teardown_lags.push(r.torn_down_at-r.ended_at);
    }else group.live++;
    attempts.push({...r,duration,age:!terminal?Math.max(0,snapshot.observed_at-r.spawned_at):null});
  }
  const bound=attempts.filter(r=>typeof r.request_id==='string'&&r.request_id.length>0);
  const work_requests={known:new Set(bound.map(r=>r.request_id)).size,covered_attempts:bound.length,unbound_attempts:attempts.length-bound.length};
  const cohorts=[...groups.values()].map(({durations,teardown_lags,...g})=>({...g,duration_n:durations.length,p50:percentile(durations,.5),p90:percentile(durations,.9),low_n:durations.length<20,teardown_n:teardown_lags.length,teardown_p50:percentile(teardown_lags,.5),exhaustion_ratio:g.terminal?g.exhausted/g.terminal:null,exhaustion_upper:g.terminal?(g.exhausted+g.unknown_cause)/g.terminal:null}));
  return {version:VERSION,window:snapshot.window,observed_at:snapshot.observed_at,source:snapshot.source,work_requests,state:snapshot.complete&&!snapshot.unknown.length&&!invalid&&!cohorts.some(c=>c.invalid_duration)?'OBSERVED':'PARTIAL',unknown:snapshot.unknown.length,invalid,spawned:attempts.length,terminal:cohorts.reduce((n,c)=>n+c.terminal,0),live:cohorts.reduce((n,c)=>n+c.live,0),retries:attempts.filter(r=>r.retry_of).length,daily:[...daily].sort().map(([key,n])=>({day:key.slice(0,10),job:key.slice(11),n})),cohorts,attempts,tokens:{state:'UNKNOWN',covered:0,total:attempts.length,reason:'No qualified exact job-to-session usage binding supplied.'},savings:{state:'UNKNOWN',reason:'No measured comparable crew active-time baseline or intervention coverage supplied.'}};
}
