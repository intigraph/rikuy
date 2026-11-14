import {queryRows,validatePanel,Unknown} from '../knowledge/model.mjs';
import {feedRelevant} from '../feed-relevance.mjs';
export function priorities(body,definition,now=Date.now()){
  if(definition.rowCap!==21)throw new Unknown('Priority selection limit changed');
  // LIMIT 21 is a max+1 sentinel for this panel only. Validate all 21
  // rows, including the sentinel; other query decoders keep their strict cap.
  const rows=queryRows(body,{...definition,rowCap:22});
  if(!rows.length)throw new Unknown('Populated Seeds source control missing');
  const validated=validatePanel('next',rows,now);
  if(validated.some(r=>r.priority!==0||!['open','in_progress'].includes(r.status)))throw new Unknown('Priority selection changed');
  const selected=new Set(rows.slice(0,20).map(row=>row.id));
  const result=validated.filter(row=>selected.has(row.id));
  Object.defineProperty(result,'moreThan20',{value:rows.length===21});
  Object.defineProperty(result,'feedItems',{value:validated.map(row=>row.item)});
  return result;
}
export class PriorityClient{
  constructor({read,definition,render,status,schedule=(f,ms)=>setTimeout(f,ms),cancel=timer=>clearTimeout(timer),decode=priorities,getParams=()=>({}),deadlineMs=6000,refreshMs=15000,now=()=>Date.now(),feed=null,graphs=null,liveRefreshMs=300000}){Object.assign(this,{read,definition,render,status,schedule,cancel,decode,getParams,deadlineMs,refreshMs,now,feed,graphs,liveRefreshMs});if(!Number.isSafeInteger(refreshMs)||refreshMs<15000)throw Error("Invalid refresh interval");this.active=false;this.busy=false;this.dirty=false;this.urgent=false;this.generation=0;this.failures=0;this.lastRead=-Infinity;}
  async tick(){
    if(!this.active||this.busy)return;
    this.busy=true;this.dirty=false;this.urgent=false;this.lastRead=this.now();const generation=this.generation,controller=new AbortController();this.controller=controller;
    const deadline=this.schedule(()=>controller.abort(),this.deadlineMs);let delay=this.refreshMs,failed=false;
    try{
      const params=this.getParams();this.watchFeed(params);
      const body=await this.read({name:this.definition.name,params},controller.signal);
      const rows=this.decode(body,this.definition,this.now(),params);
      if(this.active&&generation===this.generation){this.view=rows;this.render(rows);this.failures=0;this.status('Live · '+(rows.moreThan20?'showing 20; more than 20 active P0 items · ':'')+'checked '+new Date(this.now()).toISOString());}
    }catch(error){this.view=null;failed=true;delay=Math.max(this.refreshMs,Number(error.retryAfter)||0,Math.min(60000,15000*2**Math.min(++this.failures,2)));if(this.active&&generation===this.generation){this.render(null);this.status('UNKNOWN · '+error.message+' · retrying');}}
    finally{
      this.cancel(deadline);this.busy=false;if(this.controller===controller)this.controller=null;
      // While the feed is live a change re-reads this panel; the timer is only a safety net.
      if(generation===this.generation&&!failed&&this.feed?.live())delay=Math.max(delay,this.liveRefreshMs);
      if(generation===this.generation&&this.dirty)delay=this.urgent?0:Math.max(0,this.refreshMs-(this.now()-this.lastRead));
      if(this.active)this.timer=this.schedule(()=>this.tick(),generation===this.generation?delay:0);
    }
  }
  watchFeed(params){if(this.feed&&this.graphs)this.unwatch=this.feed.watch(this,this.graphs(params),(reason,page)=>{if(reason!=='change'||feedRelevant(this.definition.name,this.view,page))this.kick(reason);});}
  // A change reads on its leading edge, then at most once per refreshMs: never more often than the poll it replaces.
  // 'live' (a new connection) reads at once: it closes the gap between this panel's last read and the watermark.
  kick(reason){
    if(!this.active)return;
    if(this.busy){this.dirty=true;this.urgent||=reason==='live';return;}
    this.cancel(this.timer);
    const wait=reason==='down'?this.refreshMs:reason==='live'?0:this.refreshMs-(this.now()-this.lastRead);
    this.timer=wait>0?this.schedule(()=>this.tick(),wait):null;
    if(wait<=0)this.tick();
  }
  start(){if(this.active)return;this.active=true;this.generation++;return this.tick();}
  pause(){this.active=false;this.generation++;this.cancel(this.timer);this.controller?.abort();this.unwatch?.();this.unwatch=null;}
}
