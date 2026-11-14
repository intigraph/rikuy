import {queryRows,validatePanel,Unknown,item as sourceItem} from '../knowledge/model.mjs';
// Needs-you (aegis-zmk, Stiwi bsf8 rule 2): EVERY open ASK seed, query-derived.
// An ASK is a seed with a human-gate label, or one titled "ASK Stiwi". No page cut:
// a seed past an arbitrary twentieth was a seed Stiwi never saw.
const TITLE='ASK Stiwi',MAX_UNLABELLED=25;
const text=v=>typeof v==='string'?v.trim():'';
function cards(facts){
  const seeds=new Map();
  for(const r of facts){
    let entry=seeds.get(r.item);
    if(!entry){entry={...r,gates:[],options:'',rec:''};seeds.set(r.item,entry);}
    entry.gates.push(r.gate);entry.options||=text(r.options);entry.rec||=text(r.rec);
  }
  return [...seeds.values()].sort((a,b)=>a.priority-b.priority||(a.rank??Infinity)-(b.rank??Infinity)||a.id.localeCompare(b.id));
}
export function titleItems(body,definition){
  return queryRows(body,definition).map(r=>{
    if(typeof r.item!=='string'||!/^https:\/\/seeds\.local\/item\/aegis-[a-z0-9]+(?:\.[0-9]+)*$/.test(r.item)||!String(r.title).startsWith(TITLE))throw new Unknown('Foreign titled ask');
    return r.item;
  });
}
const expand=(definition,seed)=>{
  if(!/^https:\/\/seeds\.local\/item\/aegis-[a-z0-9]+(?:\.[0-9]+)*$/.test(seed))throw new Unknown('Invalid seed');
  return {...definition,params:[],template:definition.template.replaceAll('{seed}',seed)};
};
// body: {asks, titles, items:[{seed, body}], unlabelled} from asksReader.
export function asks(body,definition,now=Date.now()){
  const labelled=validatePanel('asks',queryRows(body.asks,definition.asks),now);
  const have=new Set(labelled.map(r=>r.item)),extra=[];
  for(const {seed,body:one} of body.items){
    const rows=queryRows(one,expand(definition.item,seed)).map(r=>({...r,gate:'ask-title'}));
    if(rows.length!==1||rows[0].item!==seed)throw new Unknown('Titled ask point read changed');
    extra.push(...validatePanel('asks',rows,now));
  }
  const rows=cards([...labelled,...extra]);
  for(const seed of body.unlabelled.slice(0,MAX_UNLABELLED))if(!have.has(seed)&&!rows.some(r=>r.item===seed))throw new Unknown('Titled ask missing from Needs-you');
  return {rows,incomplete:body.unlabelled.length>MAX_UNLABELLED,facts:labelled.length+extra.length};
}
export function later(body,definition,now=Date.now()){
  return queryRows(body,definition).map(r=>{
    const row=sourceItem(r,now);row.priority=Number(row.priority);
    if(!Number.isInteger(row.priority)||row.priority<0||row.priority>4)throw new Unknown('Invalid later item');
    return row;
  });
}
export function sourceControl(body,definition){
  const rows=queryRows(body,definition);
  if(rows.length!==1||rows[0].item!=='https://seeds.local/item/aegis-blh.1'||!Number.isSafeInteger(Number(rows[0].revision))||Number(rows[0].revision)<1)throw new Unknown('Populated Seeds control missing');
}
export function asksReader({request,endpoint,control,definitions}){
  return async(_body,signal)=>{
    const read=async(path,options,cap)=>{
      if(signal.aborted)throw new Unknown('Read cycle cancelled');
      const ctl=new AbortController(),abort=()=>ctl.abort();signal.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(abort,6000);
      try{return await request(new URL(path,endpoint).href,{...options,cap,signal:ctl.signal});}
      finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
    };
    sourceControl(await read('/ask',{body:{name:control.name,params:{}}},16384),control);
    const asksBody=await read('/ask',{body:{name:definitions.asks.name,params:{}}},262144);
    const titlesBody=await read('/ask',{body:{name:definitions.titles.name,params:{}}},65536);
    const labelled=new Set((asksBody.rows||[]).map(r=>r.item));
    const unlabelled=titleItems(titlesBody,definitions.titles).filter(seed=>!labelled.has(seed));
    const items=[];
    for(const seed of unlabelled.slice(0,MAX_UNLABELLED))items.push({seed,body:await read('/ask',{body:{name:definitions.item.name,params:{seed}}},16384)});
    return {asks:asksBody,items,unlabelled};
  };
}
