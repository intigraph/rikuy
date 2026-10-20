import {readWatches} from './watches.mjs';
import {GRAPH,Unknown,registryProof,queryRows,validatePanel,windowParams,summarize} from './model.mjs';

// Uses the existing Brief transport, injected by app.mjs. This class only
// calls /graphs and registered /ask names; no /query, writer or agent polling.
export class KnowledgeClient {
  constructor({config,definitions,request,render,status,now=()=>Date.now(),
    schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}){
    Object.assign(this,{config,definitions,request,render,status,now,schedule,cancel});
    this.active=false;this.generation=0;this.timer=null;this.controller=null;
    this.last=null;this.failures=0;this.busy=false;
  }
  async read(path,body,signal){
    if(signal.aborted)throw new Unknown('Query cycle deadline exceeded');
    return this.request(new URL(path,this.config.endpoint).href,
      {body,signal,cap:262144});
  }
  async tick(){
    if(!this.active||this.busy)return;
    const generation=this.generation;
    this.busy=true;const ctl=new AbortController();this.controller=ctl;
    const timeout=this.schedule(()=>ctl.abort(),6000);
    let failed=false,retryAfter=0;
    try{
      const registry=await this.read('/graphs',undefined,ctl.signal);
      const coverage=registryProof(registry,this.config.registration);
      const ask=async(panel,params={})=>{
        const def=this.definitions[panel];
        if(!def||def.graph!==GRAPH||def.name!=='daily_brief_'+panel+'_v2')throw new Unknown('Query manifest changed');
        return validatePanel(panel,queryRows(await this.read('/ask',{name:def.name,params},ctl.signal),def,params),this.now(),params);
      };
      await ask('coverage'); // Empty board/wrong scope is UNKNOWN, never all zeros.
      const panels={};const names=['next','asks','dependencies','epics','closes'];
      // At most two concurrent requests; one cycle and one timer. Every
      // response has a byte cap; all requests share an overall deadline.
      for(let i=0;i<names.length;i+=2){
        await Promise.all(names.slice(i,i+2).map(async panel=>{
          const params=panel==='closes'?windowParams(this.now()):{};
          try{panels[panel]={state:'observed',rows:await ask(panel,params),params};}
          catch(error){failed=true;retryAfter=Math.max(retryAfter,Number(error.retryAfter)||0);panels[panel]={state:'UNKNOWN',reason:error.message,rows:[],params};}
        }));
      }
      if(!this.active||generation!==this.generation)return;
      // Distinct queries are not an atomic store snapshot. Never invent a
      // snapshot tx for the future offline-decision contract.
      const watches=await readWatches({config:this.config,request:(...args)=>this.read(...args),signal:ctl.signal,now:this.now()});
      if(!this.active||generation!==this.generation)return;
      const view={coverage,panels,watches,checkedAt:this.now(),snapshotTx:null,
        sourceVersion:this.config.sourceVersion,
        summary:panels.closes.state==='observed'&&panels.epics.state==='observed'
          ?summarize(panels.closes.rows,panels.epics.rows):null};
      this.render(view);this.last=view;
      this.status(failed?'Partial · one or more source views are UNKNOWN':'Live · query views checked '+new Date(view.checkedAt).toISOString());
      if(!failed)this.failures=0;
    }catch(error){
      failed=true;
      retryAfter=Math.max(retryAfter,Number(error.retryAfter)||0);
      if(this.active&&generation===this.generation){
        this.render({checkedAt:this.now(),sourceVersion:this.config.sourceVersion,
          snapshotTx:null,panels:{},unavailable:error.message,lastCheckedAt:this.last?.checkedAt??null});
        this.status('Unavailable · '+error.message);
      }
    }finally{
      this.cancel(timeout);this.busy=false;
      if(this.controller===ctl)this.controller=null;
      if(this.active&&generation===this.generation){
        const delay=failed?Math.max(retryAfter,Math.min(60000,15000*2**Math.min(++this.failures,2))):15000;
        if(failed)this.status('Partial or unavailable · source views UNKNOWN; retry in '+Math.ceil(delay/1000)+'s');
        this.timer=this.schedule(()=>{this.timer=null;this.tick();},delay);
      }else if(this.active){
        // A hidden->visible transition can occur while the cancelled request
        // unwinds. Resume exactly once after that old flight, not in parallel.
        this.timer=this.schedule(()=>{this.timer=null;this.tick();},0);
      }
    }
  }
  start(){
    if(this.active)return;
    if(!this.config.enabled){this.status('Preview · production query registration and read-cost admission pending');return;}
    const endpoint=new URL(this.config.endpoint);
    if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)throw new Unknown('HTTPS reader origin required');
    if(!this.config.sourceVersion||!this.config.registration||!this.config.readCostReceipt)throw new Unknown('Production source/coverage/read-cost receipts required');
    this.active=true;this.generation++;return this.tick();
  }
  pause(){
    this.active=false;this.generation++;this.cancel(this.timer);this.timer=null;
    this.controller?.abort();this.status('Paused · hidden tab; no polling');
  }
}
