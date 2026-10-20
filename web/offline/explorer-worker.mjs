// Released native engine, read-only commands only. Its original history APIs
// remain in the untouched WASM artifact; no JS history substitute is created.
import init,{Explorer,explorerVersion} from '../pkg/quipu_wasm_explorer.js';
const ready=init();let explorer;
self.onmessage=async({data})=>{
  try{
    await ready;let result;
    if(data.cmd==='version')result=JSON.parse(explorerVersion());
    else if(data.cmd==='load'){
      const load=Explorer.loadPendant??Explorer.loadQpack;
      // Preserve its existing import source label; this is not authority.
      explorer=load.call(Explorer,new Uint8Array(data.bytes),'embedded-brief',new Date().toISOString());
      result=JSON.parse(explorer.loadReport());
      if(result.promotion?.outcome!=='promoted'||result.import.triples.quarantined!==0){explorer=null;throw Error('Snapshot failed native verification/promotion');}
    }else if(data.cmd==='query'&&explorer){
      if(typeof data.sparql!=='string'||data.sparql.length>8192)throw Error('Bounded read query required');result=JSON.parse(explorer.query(data.sparql));
    }else throw Error('Only native version/verified-load/read-query commands are available');
    self.postMessage({id:data.id,ok:true,result});
  }catch(error){self.postMessage({id:data.id,ok:false,error:error?.message??String(error)});}
};
