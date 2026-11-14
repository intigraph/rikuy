import {Unknown} from '../knowledge/model.mjs';
import {storedRows} from '../stored-query.mjs';
import {sourceControl} from '../asks/model.mjs';
const safeInt=(x,min=0)=>Number.isSafeInteger(x)&&x>=min;
const agentName=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(x);
export function decodeHead(body,definition,now=Date.now(),watermark={}){
  if(definition.rowCap!==2||definition.maxAgeSeconds!==1800)throw new Unknown('Lifecycle evidence bound changed');
  const rows=storedRows(body,definition,{});
  if(rows.length!==1||typeof rows[0].payload!=='string'||new TextEncoder().encode(rows[0].payload).length>65536)throw new Unknown('No bounded lifecycle head observed');
  const raw=rows[0].payload;
  let head;try{head=JSON.parse(raw);}catch{throw new Unknown('Malformed lifecycle head');}
  if(head?.contract!=='shantytown-owned-work-head/v1'||head.source!==definition.producer||head.host!==definition.host||!safeInt(head.revision,1)||!safeInt(head.state_revision)||typeof head.complete!=='boolean'||!safeInt(head.source_agents,1)||head.source_agents>100||!Array.isArray(head.agents)||head.agents.length>head.source_agents||head.complete&&head.agents.length!==head.source_agents)throw new Unknown('Lifecycle scope or coverage changed');
  if(watermark.revision>head.revision||watermark.revision===head.revision&&watermark.raw!==raw)throw new Unknown('Older or conflicting lifecycle head replay');
  const seen=new Set(),facts=new Set(),versions=new Map(),states=[];
  for(const entry of head.agents){
    if(entry?.contract!=='shantytown-owned-work/v1'||!agentName(entry.agent)||!safeInt(entry.revision,1)||entry.revision>head.state_revision||typeof entry.generation!=='string'||!entry.generation||entry.generation.length>128||!['live','stopped','ceiling','expired'].includes(entry.state)||typeof entry.observed_at!=='number'||!Number.isFinite(entry.observed_at)||entry.observed_at<0||entry.observed_at*1000>now+300000||typeof entry.fact!=='string'||!entry.fact.startsWith(definition.onto+'owned-work-')||!/^[0-9a-f]{64}$/.test(entry.fact.slice((definition.onto+'owned-work-').length))||seen.has(entry.agent)||facts.has(entry.fact))throw new Unknown('Invalid lifecycle observation');
    if((watermark.versions?.get(entry.agent)??-1)>entry.revision)throw new Unknown('Older agent revision replay');
    seen.add(entry.agent);facts.add(entry.fact);versions.set(entry.agent,entry.revision);
    const expired=entry.state==='expired'||now>=entry.observed_at*1000+definition.maxAgeSeconds*1000;
    states.push({...entry,status:expired?'UNKNOWN':entry.state,expired,owner:definition.principalPrefix+entry.agent});
  }
  if(watermark.versions&&[...watermark.versions.keys()].some(agent=>!seen.has(agent))&&head.complete)throw new Unknown('Lifecycle owner coverage disappeared');
  Object.assign(watermark,{revision:head.revision,raw,versions:new Map([...(watermark.versions||[]),...versions])});
  return {headRevision:head.revision,states,complete:head.complete&&states.every(s=>!s.expired),pending:head.source_agents-head.agents.length,unknown:states.filter(s=>s.expired).length};
}
export function ownerBatches(view){
  // Expired stop observations remain visible as UNKNOWN, never confirmed stopped.
  const owners=view.states.filter(s=>s.state==='stopped'||s.state==='ceiling'||s.state==='expired').map(s=>s.owner).sort();
  const result=[];
  for(let start=0;start<owners.length;start+=20){const selected=owners.slice(start,start+20),params={};for(let i=0;i<20;i++)params['owner'+i]=selected[i]||'urn:shantytown:no-owner:'+i;result.push({owners:selected,params});}
  return result;
}
export function decodeWork(body,definition,owners){
  if(definition.projection!=='board'||definition.rowCap!==50||definition.maxPages!==2||!Array.isArray(body?.rows)||body.rows.length>50||!safeInt(body.tx)||typeof body.truncated!=='boolean'||body.multi_valued_rows!==0)throw new Unknown('Invalid held-work projection');
  if(body.truncated&&(!body.next_after||body.rows.length!==50||body.next_after.graph!==definition.graph||body.next_after.entity!==body.rows.at(-1).entity))throw new Unknown('Incomplete held-work projection');
  const allowed=new Set(owners),seen=new Set();
  const rows=body.rows.map(row=>{
    const c=row.columns,owner=c?.assignee?.iri,id=typeof row.entity==='string'&&row.entity.startsWith(definition.itemPrefix)?row.entity.slice(definition.itemPrefix.length):'';
    if(!/^aegis-[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(id)||row.graph!==definition.graph||!allowed.has(owner)||row.multi!==false||row.key_plain!==true||!definition.key_in.includes(row.key)||!safeInt(c?.priority)||c.priority>4||typeof c.updated!=='string'||!Number.isFinite(Date.parse(c.updated))||seen.has(id))throw new Unknown('Foreign or malformed held-work projection row');
    seen.add(id);return {id,item:row.entity,owner,priority:c.priority,status:row.key,modified:c.updated,title:'Open source record for title and due date'};
  });
  return {rows,more:body.truncated,nextAfter:body.next_after,tx:body.tx};
}
export function heldReader({request,endpoint,head,work,control,now=()=>Date.now()}){
  const watermark={};
  return async(_body,signal)=>{
    const ask=(definition,params={},cap=262144)=>request(endpoint+'/ask',{body:{name:definition.name,params},signal,cap});
    const view=decodeHead(await ask(head,{},131072),head,now(),watermark);
    sourceControl(await ask(control,{},16384),control);
    const rows=[],seen=new Set();let more=false,tx;
    for(const batch of ownerBatches(view)){
      let after;
      for(let page=0;page<work.maxPages;page++){
        const payload={action:'rows',name:work.projection,graph:work.graph,key_in:work.key_in,where:{assignee:batch.owners.map(iri=>({iri}))},columns:work.columns,limit:work.rowCap};
        if(after)payload.after=after;
        const part=decodeWork(await request(endpoint+'/projections',{body:payload,signal,cap:262144}),work,batch.owners);
        if(tx!==undefined&&tx!==part.tx)throw new Unknown('Held-work projection changed between pages; restart required');tx=part.tx;
        for(const row of part.rows){if(seen.has(row.id))throw new Unknown('Conflicting owner work across pages');seen.add(row.id);rows.push(row);}
        if(!part.more)break;
        after=part.nextAfter;if(page===work.maxPages-1)more=true;
      }
    }
    return {...view,rows,more,tx};
  };
}
