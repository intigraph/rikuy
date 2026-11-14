import {Unknown,item} from '../knowledge/model.mjs';
import {storedRows} from '../stored-query.mjs';
import {sourceControl} from '../asks/model.mjs';
const time=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)&&Number.isFinite(Date.parse(value));
export function coverageParams(coverage,now=Date.now()){
  if(coverage?.contract!=='seeds-deferral-coverage/v1'||!time(coverage.since)||Date.parse(coverage.since)>now||typeof coverage.installationReceipt!=='string'||!coverage.installationReceipt.trim())throw new Unknown('Provenance installation date is not verified');
  return {since:coverage.since};
}
export function recentlyDeferred(body,definition,now=Date.now(),params){
  if(definition.name!=='daily_brief_recently_deferred_v1'||definition.rowCap!==21||!time(params?.since))throw new Unknown('Deferral query contract changed');
  const rows=storedRows(body,{...definition,rowCap:22},params),seen=new Set();
  const result=rows.map(raw=>{
    const row=item(raw,now);
    if(seen.has(row.item))throw new Unknown('Duplicate or ambiguous deferral receipt');seen.add(row.item);
    if(!time(row.deferredAt)||Date.parse(row.deferredAt)<Date.parse(params.since)||Date.parse(row.deferredAt)>now||typeof row.deferredBy!=='string'||!/^https:\/\/seeds\.local\/principal\/[^\s<>"{}|\\^`]+$/.test(row.deferredBy)||!['open','in_progress','hooked','blocked','deferred','closed','tombstone'].includes(row.status))throw new Unknown('Invalid deferral provenance');
    return row;
  });
  for(let i=1;i<result.length;i++)if(Date.parse(result[i].deferredAt)>Date.parse(result[i-1].deferredAt))throw new Unknown('Deferral ordering changed');
  return {rows:result.slice(0,20),hasMore:result.length===21,since:params.since,feedItems:result.map(row=>row.item)};
}
export function deferredReader({request,endpoint,control,definition,coverage,now=()=>Date.now()}){
  return async(body,signal)=>{
    const expected=coverageParams(coverage,now());
    if(body.name!==definition.name||JSON.stringify(body.params)!==JSON.stringify(expected))throw new Unknown('Coverage parameters changed');
    sourceControl(await request(endpoint+'/ask',{body:{name:control.name,params:{}},signal,cap:16384}),control);
    return request(endpoint+'/ask',{body,signal,cap:262144});
  };
}
