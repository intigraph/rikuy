// One /feed/ws socket per page (aegis-lq0). A change frame only INVALIDATES:
// each panel re-reads its own stored query, so a frame never becomes data.
// Every subscription starts from a measured watermark, because quipu resumes a
// subscription without `since` from offset 0: a replay of the whole graph log.
// A cursor is meaningful only within its store log epoch; a new epoch re-snapshots.
const SILENCE_MS=40000; // the server beats every 15 s; silence past this is a dead socket
const OPEN=1;
export class FeedSocket{
  constructor({origin,watermark,open=url=>new WebSocket(url),schedule=(f,ms)=>setTimeout(f,ms),cancel=t=>clearTimeout(t),random=Math.random,onState=()=>{}}){
    Object.assign(this,{origin,watermark,open,schedule,cancel,random,onState});
    this.watchers=new Map();this.subs=new Map();this.cursors=new Map();this.epoch=null;this.pending=new Set();
    this.state='off';this.socket=null;this.stopped=true;this.failures=0;this.timer=null;this.silence=null;this.seq=0;this.generation=0;
  }
  url(){const url=new URL('/feed/ws',this.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';return url.href;}
  live(){return this.state==='live';}
  graphs(){const all=new Set();for(const w of this.watchers.values())for(const g of w.graphs)all.add(g);return all;}
  // Idempotent: a family re-declares its graphs on every read (deploys move with the month).
  watch(owner,graphs,fn){
    const next=new Set(graphs),prev=this.watchers.get(owner);this.watchers.set(owner,{graphs:next,fn});
    if(!prev||next.size!==prev.graphs.size||[...next].some(g=>!prev.graphs.has(g)))this.reconcile();
    return ()=>{if(this.watchers.get(owner)?.fn===fn){this.watchers.delete(owner);this.reconcile();}};
  }
  notify(graph,reason,page){for(const w of [...this.watchers.values()])if(graph===null||w.graphs.has(graph))w.fn(reason,page);}
  setState(state){if(this.state!==state){this.state=state;this.onState(state);}}
  start(){if(!this.stopped)return;this.stopped=false;this.connect();}
  stop(){this.stopped=true;this.close();this.cancel(this.timer);this.timer=null;this.setState('off');}
  close(){this.generation++;this.cancel(this.silence);this.silence=null;const socket=this.socket;this.socket=null;this.subs.clear();try{socket?.close();}catch{/* already closed */}}
  connect(){
    if(this.stopped)return;
    this.close();const generation=this.generation;let socket;
    try{socket=this.open(this.url());}catch{return this.down();}
    this.socket=socket;this.setState('connecting');
    socket.onopen=()=>{if(generation===this.generation){this.arm();this.reconcile();}};
    socket.onmessage=message=>{if(generation===this.generation)this.frame(message.data);};
    socket.onclose=event=>{if(generation===this.generation){console.info('Brief feed closed',event?.code??'UNKNOWN',event?.wasClean??'UNKNOWN');this.fail();}};
  }
  async reconcile(){
    const socket=this.socket;if(!socket||socket.readyState!==OPEN)return;
    const generation=this.generation,want=this.graphs();
    for(const [sub,graph] of [...this.subs])if(!want.has(graph)){this.subs.delete(sub);socket.send(JSON.stringify({op:'unsubscribe',sub}));}
    const have=new Set(this.subs.values());
    for(const graph of want){
      if(have.has(graph)||this.pending.has(graph))continue;
      this.pending.add(graph);
      try{
        // After a reconnect the last delivered cursor resumes without loss.
        let since=this.cursors.get(graph);
        if(since===undefined){
          const mark=await this.watermark(graph);since=mark?.tx;
          if(typeof mark?.epoch!=='string'||!mark.epoch||this.epoch!==null&&mark.epoch!==this.epoch)throw new Error('Feed epoch changed');
          this.epoch=mark.epoch;
        }
        if(generation!==this.generation||!this.graphs().has(graph))continue;
        if(!Number.isSafeInteger(since)||since<0)throw new Error('Feed watermark UNKNOWN');
        const sub='g'+(++this.seq);this.subs.set(sub,graph);this.cursors.set(graph,since);
        socket.send(JSON.stringify({op:'subscribe',sub,feed:'changes',since,graph}));
      }catch(error){if(generation===this.generation){if(error.message==='Feed epoch changed')this.reset();this.fail();}return;}
      finally{this.pending.delete(graph);}
    }
    if(generation!==this.generation||!want.size||this.subs.size!==want.size)return;
    const was=this.state;this.setState('live');this.failures=0;
    // One catch-up read per family: covers commits between its first read and the watermark.
    if(was!=='live')this.notify(null,'live');
  }
  frame(text){
    this.arm();
    let frame;try{frame=JSON.parse(text);}catch{return this.fail();}
    if(frame.event==='quipu.heartbeat')return;
    // A refused or ended subscription: fall back to the timers rather than trust a silent gap.
    if(frame.event==='quipu.error')return this.fail();
    if(frame.event!=='quipu.changes'&&frame.event!=='quipu.changes.part'){this.notify(null,'change');return;} // future events fail open
    const graph=this.subs.get(frame.sub);if(graph===undefined)return; // late frame of a dropped subscription
    let page=frame.data;
    if(typeof page==='string'){try{page=JSON.parse(page);}catch{return this.fail();}}
    // A replaced store keeps no meaning for old cursors: drop them all and re-snapshot.
    if(page&&typeof page==='object'&&page.source&&page.source.log_epoch!==this.epoch){this.reset();return this.fail();}
    const next=Number(frame.id),since=this.cursors.get(graph);
    if(!page||typeof page!=='object'||!Number.isSafeInteger(next)||next<since)return this.fail();
    if(frame.event==='quipu.changes'&&(next===since||!Array.isArray(page.records)||page.records.some(r=>r?.graph!==graph)))return this.fail();
    this.cursors.set(graph,next);this.notify(graph,'change',{...page,partial:frame.event==='quipu.changes.part'});
  }
  reset(){this.cursors.clear();this.epoch=null;}
  arm(){this.cancel(this.silence);this.silence=this.schedule(()=>{this.silence=null;this.fail();},SILENCE_MS);}
  fail(){const was=this.state;this.close();this.down();if(was==='live')this.notify(null,'down');}
  down(){
    if(this.stopped)return;
    this.setState('reconnecting');
    const delay=Math.min(60000,1000*2**Math.min(this.failures++,6))+Math.floor(this.random()*1000);
    this.cancel(this.timer);this.timer=this.schedule(()=>{this.timer=null;this.connect();},delay);
  }
}
