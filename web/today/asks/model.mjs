import {queryRows,validatePanel,Unknown,item as sourceItem} from '../knowledge/model.mjs';
// Needs-you (aegis-zmk, Stiwi bsf8 rule 2): EVERY open ASK seed, query-derived.
// An ASK is an explicit ask, a seed with a human-gate label, or an ASK title. No page cut:
// a seed past an arbitrary twentieth was a seed Stiwi never saw.
const TITLE='ASK Stiwi',MAX_UNLABELLED=25;
const text=v=>typeof v==='string'?v.trim():'';
function cards(facts){
  const seeds=new Map();
  for(const r of facts){
    let entry=seeds.get(r.item);
    if(!entry){entry={...r,gates:[],options:'',rec:''};seeds.set(r.item,entry);}
    for(const key of ['kind','unblocks','default','expires'])if(entry[key]!==r[key])throw new Unknown('Conflicting Ask metadata');
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
// OPTIONS/REC excerpts for one Ask, read on demand when its card is opened: the
// list query (daily_brief_asks_v6) no longer extracts them for every row.
export function askChoices(body,definition,seed){
  const rows=queryRows(body,expand(definition,seed));
  if(rows.length!==1||rows[0].item!==seed)throw new Unknown('Ask choices point read changed');
  return {options:text(rows[0].options),rec:text(rows[0].rec)};
}
// Title for one seed through the same bounded point read (daily_brief_ask_item_v2,
// LIMIT 2 by IRI). A missing or blank schema:name is an error, never a stand-in.
export function itemTitle(body,definition,seed){
  const rows=queryRows(body,expand(definition,seed));
  if(rows.length!==1||rows[0].item!==seed)throw new Unknown('item point read changed');
  const title=text(rows[0].title);
  if(!title)throw new Unknown('the source record has no title');
  if(title.length>500)throw new Unknown('the source title exceeds its bound');
  return title;
}
// Cached by item and revision, so an edited Ask is re-read and an unchanged one is not.
export function askChoicesReader({request,endpoint,definition,timeoutMs=6000}){
  const cache=new Map();
  return (seed,revision)=>{
    const key=seed+'@'+revision;
    if(!cache.has(key)){
      const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeoutMs);
      const pending=Promise.resolve().then(()=>request(new URL('/ask',endpoint).href,{body:{name:definition.name,params:{seed}},cap:16384,signal:ctl.signal}))
        .then(body=>askChoices(body,definition,seed))
        .finally(()=>clearTimeout(timer));
      pending.catch(()=>cache.delete(key));
      cache.set(key,pending);
    }
    return cache.get(key);
  };
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
