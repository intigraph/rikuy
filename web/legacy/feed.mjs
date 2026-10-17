import { GRAPH, ROW_QUERY, STATS_QUERY, validateRows, validateStats, validatePage, integer } from './model.mjs';

export class ProtocolError extends Error {}
export class TransportError extends Error {
  constructor(message, retryAfter = 0) { super(message); this.retryAfter=retryAfter; }
}
export async function readJSON(url, {body, cap, signal, fetcher=fetch}={}) {
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),8000);
  const abort=()=>controller.abort(); signal?.addEventListener('abort',abort,{once:true});
  try {
    const response=await fetcher(url,{method:body===undefined?'GET':'POST', credentials:'omit',
      signal:controller.signal, headers:{'Content-Type':'application/json','X-Quipu-Client':'daily-brief',
        'X-Quipu-Task':'aegis-imi'}, ...(body===undefined?{}:{body:JSON.stringify(body)})});
    if(!response.ok) {
      if([408,429,500,502,503,504].includes(response.status)) {
        const raw=response.headers.get('retry-after');
        const after=raw && /^\d+$/.test(raw)?Number(raw)*1000:raw?Math.max(0,Date.parse(raw)-Date.now()):0;
        throw new TransportError('Brief connection interrupted',Number.isFinite(after)?after:0);
      }
      throw new ProtocolError('Brief reader unavailable (HTTP '+response.status+')');
    }
    const reader=response.body.getReader(), chunks=[];let bytes=0;
    try {
      for(;;) {const {done,value}=await reader.read();if(done)break;bytes+=value.length;
        if(bytes>cap) throw new ProtocolError('Brief response exceeds its budget');chunks.push(value);}
    } finally {await reader.cancel().catch(()=>{});}
    const all=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}
    try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(all));}
    catch {throw new ProtocolError('Brief response is malformed');}
  } catch(error) {
    if(error instanceof ProtocolError || error instanceof TransportError)throw error;
    throw new TransportError('Brief connection interrupted');
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

export class BriefClient {
  constructor({config,inventory,definitions,render,status,request=readJSON,
    eventSource=globalThis.EventSource,now=()=>Date.now(),
    schedule=(fn,ms)=>globalThis.setTimeout(fn,ms),cancel=timer=>globalThis.clearTimeout(timer),random=Math.random}) {
    Object.assign(this,{config,inventory,definitions,render,status,request,eventSource,now,schedule,cancel,random});
    this.state=null;this.timer=null;this.stream=null;this.alive=false;this.busy=false;
    this.failures=0;this.lastRefresh=-Infinity;this.lastPoll=-Infinity;this.generation=0;
  }
  url(path,params={}) {
    const url=new URL(path,this.config.endpoint);
    for(const [k,v]of Object.entries(params))url.searchParams.set(k,String(v));
    return url.href;
  }
  read(path,options={}) {return this.request(this.url(path),{cap:this.config.bodyBytes,...options});}
  changes(since) {
    const wait=this.config.pollMs-(this.now()-this.lastPoll);
    if(wait>0)throw new TransportError('Brief reader is cooling down',wait);
    this.lastPoll=this.now();
    return this.request(this.url('/changes',{since,limit:1,capture:'new_values',graph:GRAPH}),{cap:this.config.feedBytes});
  }
  async snapshot() {
    const ask=async name=>{
      const body=await this.read('/ask',{body:{name,params:{}}});
      if(body.query!==name || body.sparql!==this.definitions[name].template)
        throw new ProtocolError('Brief query definition changed');
      return body;
    };
    const rows=validateRows(await ask(ROW_QUERY),this.inventory);
    let stats=null;
    try {stats=validateStats(await ask(STATS_QUERY),this.now());} catch { /* Rows-first: explicit UNKNOWN stats is a valid view. */ }
    return {rows,stats};
  }
  start() {
    this.desired=true;
    if(this.starting)return this.starting.then(()=>this.desired?this.start():undefined);
    if(this.alive)return Promise.resolve();
    this.starting=this.bootstrap().finally(()=>{this.starting=null;});
    return this.starting;
  }
  async bootstrap() {
    if(this.alive || !this.config.enabled)return this.status('Live connection pending');
    if(this.config.graph!==GRAPH || !this.config.registration || !this.config.boundedSeed)
      return this.status('Live brief not yet verified');
    this.alive=true;const generation=++this.generation;
    try {
      if(!this.state) {
        const registry=await this.read('/graphs');
        const matches=registry.graphs?.filter(g=>g.iri===GRAPH) || [];
        if(matches.length!==1 || matches[0].class!=='committed' || integer(matches[0].g)===0
            || JSON.stringify(matches[0].creation)!==JSON.stringify(this.config.registration))
          throw new ProtocolError('Brief graph coverage changed');
        // Only the explicitly registered tiny seed is allowed this genesis read.
        const page=await this.changes(0);validatePage(page,0);
        const view=await this.snapshot();
        if(!this.alive || generation!==this.generation)return;
        // A watermark is used ONLY after the separate source/served proof is accepted.
        const cursor=this.config.watermarkBootstrap ? integer(page.watermark_tx) : integer(page.next_tx);
        this.commit(view,cursor);
      }
      this.connect();
    } catch(error) {this.handle(error);}
  }
  commit(view,cursor) {
    const next=Object.freeze({graph:GRAPH,registration:this.config.registration,cursor,
      view,appliedAt:this.now()});
    try {this.render(next);} // A failed render must replay from the old applied cursor.
    catch {throw new TransportError('Brief could not render');}
    this.state=next;this.lastRefresh=this.now();this.failures=0;
    this.status('Live · refreshed '+new Date(next.appliedAt).toLocaleTimeString());
  }
  closeStream(){if(this.stream){this.stream.close();this.stream=null;}}
  later(delay,callback){this.cancel(this.timer);this.timer=this.schedule(()=>{this.timer=null;if(this.alive)callback();},delay);}
  connect() {
    if(!this.alive || this.busy)return;
    if(this.config.transport!=='sse' || !this.eventSource)return this.poll();
    this.closeStream();
    // Every reconnect is a NEW object: never let native Last-Event-ID outrun applied state.
    const stream=new this.eventSource(this.url('/changes/stream',{since:this.state.cursor,graph:GRAPH}),{withCredentials:false});
    this.stream=stream;
    stream.addEventListener('quipu.changes',event=>{
      if(this.stream!==stream || !this.alive)return;
      this.closeStream(); // Coalesce further commits into the next bounded snapshot.
      if(new TextEncoder().encode(event.data).length>this.config.feedBytes)return this.handle(new ProtocolError('Brief frame exceeds its budget'));
      let page;try{page=JSON.parse(event.data);validatePage(page,this.state.cursor,event.lastEventId);}
      catch{return this.handle(new ProtocolError('Brief stream scope/cursor changed'));}
      const wait=Math.max(0,this.config.refreshMs-(this.now()-this.lastRefresh));
      this.later(wait,()=>this.apply(page,event.lastEventId));
    });
    stream.onerror=()=>{if(this.stream!==stream)return;this.closeStream();this.handle(new TransportError('Live connection interrupted'));};
  }
  async apply(page,eventId) {
    if(!this.alive || this.busy)return;
    this.busy=true;const generation=this.generation;
    try {
      const checked=validatePage(page,this.state.cursor,eventId);
      if(checked.changed) {
        const view=await this.snapshot();
        if(!this.alive || generation!==this.generation)return;
        this.commit(view,checked.next);
      }
      this.busy=false;this.connect();
    } catch(error) {this.busy=false;this.handle(error);}
    finally{this.busy=false;}
  }
  async poll() {
    if(!this.alive || this.busy)return;
    const wait=this.config.pollMs-(this.now()-this.lastPoll);
    if(wait>0)return this.later(wait,()=>this.poll());
    this.busy=true;const generation=this.generation;
    try {
      const page=await this.changes(this.state.cursor), checked=validatePage(page,this.state.cursor);
      if(checked.changed) {
        const view=await this.snapshot();
        if(!this.alive || generation!==this.generation)return;
        this.commit(view,checked.next);
      }
      this.busy=false;this.later(this.config.pollMs,()=>this.poll());
    } catch(error) {this.busy=false;this.handle(error);}
    finally{this.busy=false;}
  }
  handle(error) {
    this.closeStream();
    if(!this.alive)return;
    this.status((this.state?'Stale · ':'Unavailable · ')+error.message);
    if(!(error instanceof TransportError)) {this.alive=false;this.cancel(this.timer);return;}
    const base=Math.min(60000,15000*2**Math.min(this.failures++,2));
    const delay=Math.max(Math.min(60000,base+Math.floor(this.random()*1000)),error.retryAfter);
    this.later(delay,()=>this.state?this.connect():this.restart());
  }
  restart(){this.alive=false;return this.start();}
  pause(){this.desired=false;this.alive=false;this.generation++;this.closeStream();this.cancel(this.timer);this.status('Paused while this tab is hidden');}
}
