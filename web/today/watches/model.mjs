import {WATCHES,watchDefinition,watchParams} from '../knowledge/watches.mjs';
const canonical=watchDefinition(WATCHES[0]);
export const REGISTRATION_SHA='b47c636df47dad8a2896fd753f6d486a90ef651dc0ffe06dcea77c6ad6334084';
export function semwebReader({request,endpoint,definition,admission,now=()=>Date.now()}){
  return async(body,signal)=>{
    if(admission?.enabled!==true||admission.scope!=='default ROOT'||admission.windowDays!==30||admission.capBytes!==262144||admission.deadlineMs!==6000||admission.registrationSHA!==REGISTRATION_SHA||typeof admission.readCostReceipt!=='string'||!admission.readCostReceipt.trim())throw Error('Semweb registration / read-cost admission pending');
    if(JSON.stringify(definition)!==JSON.stringify(canonical)||body.name!==canonical.name||Object.keys(body).sort().join(',')!=='name,params')throw Error('Unadmitted watch query');
    const params=body.params,keys=Object.keys(params??{}).sort().join(',');
    if(keys!=='end,start'||typeof params.start!=='string'||typeof params.end!=='string'||!Number.isFinite(Date.parse(params.end))||JSON.stringify(params)!==JSON.stringify(watchParams(Date.parse(params.end)))||Math.abs(now()-Date.parse(params.end))>6000)throw Error('Watch window changed or expired');
    return request(endpoint+'/ask',{body,signal,cap:262144});
  };
}
