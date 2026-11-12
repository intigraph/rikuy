// Presentation of the existing Chaski adapter's read-time judgment. This
// reader never queries GitHub, interprets reviews, writes facts or routes work.
const STATES=['needs-review','approved','conflicting','red','changes-requested','draft','pending','UNKNOWN'];
const repo=x=>typeof x==='string'&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(x);
const time=x=>typeof x==='string'&&x.endsWith('Z')&&Number.isFinite(Date.parse(x));
const integer=(x,min,max)=>Number.isSafeInteger(x)&&x>=min&&x<=max;
export function validatePRFlow(body,admission,now){
  if(!Number.isFinite(now)||body?.schema!=='chaski.github.pr-flow/v1'||body.state!=='observed'||body.graph!==admission.graph
    ||!time(body.checked_at)||!integer(admission.maxAgeSeconds,30,3600)
    ||now-Date.parse(body.checked_at)<0||now-Date.parse(body.checked_at)>admission.maxAgeSeconds*1000)
    throw Error('PR source identity, coverage or freshness UNKNOWN');
  const scope=body.scope,records=body.records,counts=body.counts;
  if(!scope||!Array.isArray(scope.repos)||!scope.repos.length||scope.repos.length>64
    ||scope.repos.some(x=>!repo(x))||new Set(scope.repos).size!==scope.repos.length
    ||!integer(scope.window_days,1,365)||typeof scope.basis!=='string'||!scope.basis
    ||!Array.isArray(records)||records.length>200||!counts||typeof counts!=='object'||Array.isArray(counts)
    ||!Array.isArray(body.unknown_repos)||body.unknown_repos.length)
    throw Error('PR source selection incomplete');
  const actual={},seen=new Set();let oldest=null;
  for(const r of records){
    if(!r||!scope.repos.includes(r.repo)||!integer(r.pr,1,Number.MAX_SAFE_INTEGER)
      ||typeof r.head!=='string'||!(/^[0-9a-f]{40}$/).test(r.head)||!STATES.includes(r.state)
      ||!Number.isFinite(r.age_seconds)||r.age_seconds<0||!time(r.since)||Date.parse(r.since)>Date.parse(body.checked_at)
      ||!time(r.source_observed_at)||Date.parse(r.source_observed_at)>Date.parse(body.checked_at)
      ||Math.abs(r.age_seconds-(Date.parse(body.checked_at)-Date.parse(r.since))/1000)>1)
      throw Error('Malformed PR state observation');
    const key=r.repo+'#'+r.pr;if(seen.has(key))throw Error('Ambiguous PR identity');seen.add(key);
    actual[r.state]=(actual[r.state]??0)+1;oldest=Math.max(oldest??0,r.age_seconds);
  }
  if(Object.keys(counts).some(s=>!STATES.includes(s)||!integer(counts[s],1,200))
    ||STATES.some(s=>(counts[s]??0)!==(actual[s]??0))||body.oldest_age_seconds!==oldest)
    throw Error('PR summary disagrees with source rows');
  // Missing proof for these measures is not zero. The source's explicit
  // nulls stay visible until its historical/proposal coverage is admitted.
  return {state:'observed',counts,oldestAge:oldest,windowDays:scope.window_days,
    checkedAt:body.checked_at,graph:body.graph};
}
export async function readPRFlow({config,request,signal,now}){
  const admission=config.prFlow;
  if(!admission?.enabled||!admission.sourceVersion||!admission.registrationReceipt||!admission.readCostReceipt)
    return {state:'UNKNOWN',reason:'PR producer/reader admission pending'};
  try{
    const url=new URL(admission.url);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash
      ||url.pathname!=='/pr-flow.json')throw Error('Unadmitted PR reader URL');
    const body=await request(url.href,{signal,cap:262144,task:'aegis-xxoa.5'});
    return validatePRFlow(body,admission,now);
  }catch(error){return {state:'UNKNOWN',reason:error.message};}
}
export function prFlowLine(view){
  if(view?.state!=='observed')return 'PR state UNKNOWN · '+(view?.reason??'Producer evidence unavailable');
  const counts=STATES.filter(s=>view.counts[s]).map(s=>`${s} ${view.counts[s]}`).join(' · ')||'0 in this observed window';
  const age=view.oldestAge===null?'UNKNOWN':Math.floor(view.oldestAge/60)+'m';
  return `Observed PRs (${view.windowDays}d activity scope): ${counts} · oldest ${age} · main-only refreshes UNKNOWN · first-review time UNKNOWN`;
}
