import {Unknown,GRAPH} from '../knowledge/model.mjs';
import {storedRows} from '../stored-query.mjs';
export const TEMPLATE_SHA='ccbcc8239d60e4386272e65961cb8a0efb50c986bcdf47e3a2b3b125a334702b';
const NAME='daily_brief_changes_v1',DAY=86400000;
export function changesParams(now){
  if(!Number.isFinite(now))throw new Unknown('Invalid close window');
  return {start:new Date(now-DAY).toISOString(),end:new Date(now).toISOString()};
}
// Preserve declared timestamp precision when checking boundaries and ordering.
function timeKey(value){
  const match=typeof value==='string'&&value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/);
  if(!match||!Number.isFinite(Date.parse(value))||new Date(Date.parse(value)).toISOString().slice(0,19)!==match[1])throw new Unknown('Invalid close timestamp');
  return match[1]+'.'+(match[2]||'').padEnd(9,'0')+'Z';
}
function windowCheck(params,now){
  if(Object.keys(params??{}).sort().join(',')!=='end,start'||JSON.stringify(params)!==JSON.stringify(changesParams(Date.parse(params.end)))||Math.abs(now-Date.parse(params.end))>6000)throw new Unknown('Close window changed or expired');
  return [timeKey(params.start),timeKey(params.end)];
}
export async function changesReader({request,endpoint,definition,admission,now=()=>Date.now()}){
  if(admission?.enabled!==true)throw new Unknown('Recent closes await activation');
  if(admission.scope!==GRAPH||admission.windowHours!==24||admission.maxRows!==20||admission.deadlineMs!==6000||admission.refreshMs!==15000||admission.capBytes!==262144||admission.registrationSHA!==TEMPLATE_SHA||typeof admission.registrationReceipt!=='string'||!admission.registrationReceipt.trim()||typeof admission.readCostReceipt!=='string'||!admission.readCostReceipt.trim())throw new Unknown('Close reader admission incomplete');
  if(definition.name!==NAME||definition.graph!==GRAPH||definition.rowCap!==21||definition.maxRows!==20||definition.windowHours!==24||JSON.stringify(definition.params.map(p=>[p.name,p.type,p.required]))!==JSON.stringify([['start','text',true],['end','text',true]]))throw new Unknown('Close query definition changed');
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(definition.template)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==TEMPLATE_SHA)throw new Unknown('Close query template changed');
  return async(body,signal)=>{
    if(body.name!==NAME||Object.keys(body).sort().join(',')!=='name,params')throw new Unknown('Unadmitted close request');
    windowCheck(body.params,now());
    return request(endpoint+'/ask',{body,signal,cap:262144});
  };
}
export function changes(body,definition,now,params){
  const [start,end]=windowCheck(params,now),seen=new Set();
  if(body?.truncated!==false)throw new Unknown('Close response completeness unknown');
  const rows=storedRows(body,definition,params).map(row=>{
    if(typeof row.id!=='string'||!/^aegis-[a-z0-9]+(?:\.[0-9]+)*$/.test(row.id)||row.item!=='https://seeds.local/item/'+row.id||typeof row.title!=='string'||!row.title.trim()||/^\s*(inbox:|mail:)/i.test(row.title)||seen.has(row.id))throw new Unknown('Foreign, duplicate or missing close identity');
    seen.add(row.id);
    const key=timeKey(row.closed);
    if(key<start||key>=end)throw new Unknown('Close outside query window');
    if(!['string','number'].includes(typeof row.revision)||!/^\d+$/.test(String(row.revision))||!Number.isSafeInteger(Number(row.revision))||Number(row.revision)<1)throw new Unknown('Invalid close revision');
    if(row.reason!=null&&(typeof row.reason!=='string'||[...row.reason].length>240))throw new Unknown('Close reason cap changed');
    return {...row,revision:Number(row.revision),reason:row.reason?.trim()||null,key};
  });
  for(let i=1;i<rows.length;i++)if(rows[i-1].key<rows[i].key||rows[i-1].key===rows[i].key&&rows[i-1].id>rows[i].id)throw new Unknown('Close ordering changed');
  return {rows,since:params.start,until:params.end,atLimit:rows.length===20};
}
