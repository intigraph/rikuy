// Consumer of quipu #798 Database bridge (1f99ba5), not another applier.
// One existing WASM Database owns facts and progress. Every replica method
// returns native JSON text; data frames are passed through untouched.
const outcomes=new Set(['applied','buffered','duplicate','idle','resume','rebootstrap','refused','ignored']);
const stopped=new Set(['rebootstrap','resume','refused','unsupported']);
export class SyncSession{
  constructor({db,query,onState=()=>{}}){
    if(!db||['replicaApplyFrame','replicaProgress','replicaFreshness'].some(key=>typeof db[key]!=='function')||typeof query!=='function')throw Error('Shared Database bridge and local query adapter required.');
    Object.assign(this,{db,query,onState});this.state='disconnected';this.readable=false;this.serial=Promise.resolve();
  }
  publish(state,extra={}){this.state=state;this.onState({state,...extra});}
  decode(text){
    try{
      if(typeof text!=='string'||text.length>262144||new TextEncoder().encode(text).length>262144)throw Error('Native replica metadata exceeds its text budget.');
      // S1 metadata carries only integer numbers. Reject out-of-range values
      // rather than rounding i64/u64 source identity into JavaScript Numbers.
      return JSON.parse(text,(_key,value)=>{
        if(typeof value==='number'&&!Number.isSafeInteger(value))throw Error('Native replica integer is outside the exact JavaScript range.');
        return value;
      });
    }catch(error){this.readable=false;this.publish('unsupported');throw error;}
  }
  async progress(){
    const value=this.decode(await this.db.replicaProgress());
    if(value!==null&&(!value||Array.isArray(value)||typeof value.store_id!=='string'||!value.store_id||typeof value.log_epoch!=='string'||!value.log_epoch||!Number.isSafeInteger(value.source_tx)||value.source_tx<0)){
      this.readable=false;this.publish('unsupported');throw Error('Invalid native replica progress.');
    }
    return value;
  }
  async open(){
    this.readable=false;this.opened=false;
    const progress=await this.progress();
    this.opened=true;this.readable=progress!==null;
    this.publish('disconnected',{progress});return progress;
  }
  // Exact raw pair goes to ONE shared component. No Frame reinterpretation,
  // chunk assembly, RDF writes or separately maintained cursor in this client.
  feed(event,data,nowMs){
    const work=this.serial.then(()=>this.consume(event,data,nowMs));this.serial=work.catch(()=>{});return work;
  }
  async consume(event,data,nowMs){
    if(!this.opened)throw Error('Open the shared Database replica first.');
    if(stopped.has(this.state))throw Error('Reconnect or bootstrap before more frames.');
    if(typeof event!=='string'||typeof data!=='string'||!Number.isSafeInteger(nowMs)||nowMs<0)throw Error('A raw event/data pair and monotonic timestamp are required.');
    try{
      const outcome=this.decode(await this.db.replicaApplyFrame(event,data,nowMs));
      if(!outcomes.has(outcome?.kind)){this.readable=false;this.publish('unsupported');throw Error('Unknown shared-applier outcome.');}
      switch(outcome.kind){
        case 'rebootstrap':this.readable=false;this.publish('rebootstrap',{reason:outcome.reason});break;
        case 'resume':this.publish('resume',{from:outcome.from});break;
        case 'refused':this.publish('refused',{reason:outcome.reason});break;
        // S1 ignores unsupported events, including future controls. Do not
        // silently serve a scope after a control we cannot interpret.
        case 'ignored':this.readable=false;this.publish('unsupported');break;
        case 'buffered':break; // no partial facts and no new freshness claim
        default:{
          const progress=await this.progress();this.readable=progress!==null;
          this.publish('connected');break;
        }
      }
      return outcome;
    }catch(error){if(!stopped.has(this.state))this.publish('disconnected',{error:error.message});throw error;}
  }
  disconnect(){if(!stopped.has(this.state))this.publish('disconnected');}
  async read(sparql){if(!this.readable)throw Error('Local replica is unavailable for this scope.');return this.query(this.db,sparql);}
  async freshness(nowMs){
    if(!this.opened)throw Error('Open the shared Database replica first.');
    const value=this.decode(await this.db.replicaFreshness(nowMs));
    if(!value||Array.isArray(value)||![value.source_tx,value.last_frame_age_ms].every(v=>v===null||Number.isSafeInteger(v)&&v>=0)||typeof value.bounded!=='boolean'){
      this.readable=false;this.publish('unsupported');throw Error('Invalid native replica freshness.');
    }
    // S1 last_frame_age_ms is liveness, including ignored frames, not verified
    // coverage. No challenge exists here; connected never implies a bound.
    return {...value,bounded:false,stale:this.state!=='connected',state:this.state};
  }
}
