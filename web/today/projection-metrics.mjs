// board_items read contract admitted by aegis-2fa. No producer or second store.
const graphs=['https://seeds.local/project/aegis','https://seeds.local/project/aegis#seeds-ephemeral'];
export function metricRequests({start,end,name='board_items'}){
  const instant=value=>{
    if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))throw Error('RFC3339 window required.');
    return new Date(value).toISOString();
  };
  start=instant(start);end=instant(end);
  if(Date.parse(start)>=Date.parse(end)||Date.parse(end)-Date.parse(start)>31*86400000)throw Error('A nonempty window of at most31 days is required.');
  if(typeof name!=='string'||! /^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name))throw Error('Declared projection name required.');
  const scope=()=>({name,graphs:[...graphs]});
  const window=column=>({since:{column,at:start},until:{column,at:end}});
  return {
    active:{...scope(),action:'aggregate',key_in:['open','hooked','in_progress','blocked','deferred'],group_by:'key',max_groups:32},
    created:{...scope(),action:'aggregate',...window('created'),where:{inbox:[null]},group_by:{column:'created',bucket:'day'},max_groups:64},
    closed:{...scope(),action:'aggregate',...window('closed'),where:{inbox:[null]},group_by:[{column:'closed',bucket:'day'},'priority'],max_groups:512},
    validity:{...scope(),action:'rows',columns:['identifier','title','priority','created','closed'],limit:1000}
  };
}

export function statsWindow(now=Date.now()){
  const d=new Date(now),end=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+1);
  return {start:new Date(end-31*86400000).toISOString(),end:new Date(end).toISOString()};
}

const integer=n=>{if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid projection count.');return n;};
const scoped=row=>{if(!graphs.includes(row.graph))throw Error('Projection graph changed.');};
const instant=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value)&&Number.isFinite(Date.parse(value));

// Three aggregates plus at most 100 sequential pages share the caller's 5 s
// deadline. A changed tx discards the bundle; there is no in-cycle restart.
export async function readMetrics(request,{signal,now=Date.now()}={}){
  const window=statsWindow(now),bodies=metricRequests(window),answers=[];
  let tx;
  const read=async body=>{
    if(signal?.aborted)throw Error('Stats exceeded the five-second budget.');
    const answer=await request(body,signal);
    integer(answer?.tx);
    if(tx!==undefined&&answer.tx!==tx)throw Error('Projection snapshot changed; retry on the next refresh.');
    tx=answer.tx;
    if(answer.multi_valued_rows!==0)throw Error('Ambiguous projection rows.');
    return answer;
  };
  const aggregates={};
  for(const key of ['active','created','closed']){
    const answer=await read(bodies[key]);snapshotTx([answer]);answers.push(answer);
    if(!Array.isArray(answer.groups))throw Error('Missing projection groups.');
    const total=integer(answer.total);let sum=0;
    for(const group of answer.groups){scoped(group);sum+=integer(group.n);}
    if(sum!==total)throw Error('Projection totals disagree with their groups.');
    aggregates[key]=answer;
  }
  const days=[];
  for(let at=Date.parse(window.start);at<Date.parse(window.end);at+=86400000)days.push({day:new Date(at).toISOString().slice(0,10),created:0,closed:0,closed_p0:0,closed_p1:0});
  const byDay=new Map(days.map(d=>[d.day,d])),active={};
  for(const group of aggregates.active.groups){
    if(group.plain!==true||!bodies.active.key_in.includes(group.value))throw Error('Invalid active status.');
    active[group.value]=(active[group.value]||0)+group.n;
  }
  for(const group of aggregates.created.groups){
    const day=byDay.get(group.value);
    if(group.plain!==true||!day)throw Error('Invalid created-day bucket.');
    day.created+=group.n;
  }
  for(const group of aggregates.closed.groups){
    const [date,priority]=group.values||[],day=byDay.get(date);
    if(!day||!Number.isInteger(priority)||priority<0||priority>4||JSON.stringify(group.plain)!=='[true,false]')throw Error('Invalid closed-day/priority bucket.');
    day.closed+=group.n;if(priority===0)day.closed_p0+=group.n;if(priority===1)day.closed_p1+=group.n;
  }
  let after,previous,pages=0,rows=0;const seen=new Set();
  for(;pages<100;){
    const page=await read({...bodies.validity,...(after?{after}:{})});pages++;
    if(!Array.isArray(page.rows)||page.rows.length>1000||typeof page.truncated!=='boolean')throw Error('Invalid validity page.');
    for(const row of page.rows){
      scoped(row);const key=[row.graph,row.entity],c=row.columns;
      const identity=JSON.stringify(key);if(seen.has(identity))throw Error('Validity pagination repeated a row.');seen.add(identity);
      if(row.multi!==false||row.key_plain!==true||!c||typeof c.identifier!=='string'||row.entity!=='https://seeds.local/item/'+encodeURIComponent(c.identifier)||typeof c.title!=='string'||!Number.isInteger(c.priority)||c.priority<0||c.priority>4||!instant(c.created)||(c.closed!==null&&c.closed!==undefined&&!instant(c.closed)))throw Error('Board source fields are invalid.');
      if(row.plain?.identifier!==true||row.plain?.title!==true||row.plain?.priority!==false||row.plain?.created!==false||(c.closed!=null&&row.plain?.closed!==false))throw Error('Board source datatypes are invalid.');
      previous=key;rows++;
    }
    if(!page.truncated){answers.push(page);break;}
    after=page.next_after;
    if(!page.rows.length||!after||after.graph!==previous[0]||after.entity!==previous[1])throw Error('Missing validity continuation.');
  }
  if(!answers.at(-1)?.rows||!rows)throw Error('Validity coverage is missing or exceeds 100 pages.');
  snapshotTx(answers);
  return {tx,window,active,active_total:aggregates.active.total,created_total:aggregates.created.total,closed_total:aggregates.closed.total,daily_work:days,validity_rows:rows,validity_pages:pages,checkedAt:now};
}

export class StatsClient{
  constructor({request,render,status,now=()=>Date.now(),schedule=(f,ms)=>setTimeout(f,ms),cancel=id=>clearTimeout(id)}){Object.assign(this,{request,render,status,now,schedule,cancel});this.active=false;this.busy=false;this.generation=0;}
  async tick(){
    if(!this.active||this.busy)return;
    this.busy=true;const generation=this.generation,controller=new AbortController();this.controller=controller;
    const deadline=this.schedule(()=>controller.abort(),5000);let delay=60000;
    try{const value=await readMetrics(this.request,{signal:controller.signal,now:this.now()});if(controller.signal.aborted)throw Error('Stats exceeded the five-second budget.');if(this.active&&generation===this.generation){this.render(value);this.status('Live · projection checked');}}
    catch(error){delay=120000;if(this.active&&generation===this.generation){this.render(null);this.status('UNKNOWN · '+error.message+' · retrying');}}
    finally{this.cancel(deadline);this.busy=false;if(this.controller===controller)this.controller=null;if(this.active)this.timer=this.schedule(()=>this.tick(),generation===this.generation?delay:0);}
  }
  start(){if(this.active)return;this.active=true;this.generation++;return this.tick();}
  pause(){this.active=false;this.generation++;this.cancel(this.timer);this.controller?.abort();}
}
// Every independently read answer must name the same snapshot. A changed tx
// invalidates the bundle; callers retain last-good data and schedule normally,
// never splice counts from different snapshots or silently retry in a loop.
export function snapshotTx(answers){
  if(!Array.isArray(answers)||!answers.length)throw Error('No projection evidence.');
  let tx;
  for(const answer of answers){
    if(!answer||!Number.isSafeInteger(answer.tx)||answer.tx<0||answer.truncated!==false)throw Error('Incomplete projection evidence.');
    if(tx!==undefined&&tx!==answer.tx)throw Error('Projection snapshot changed; discard the incomplete bundle.');
    tx=answer.tx;
  }
  return tx;
}
