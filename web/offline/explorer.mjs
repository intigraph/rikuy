import {boundedJSON} from './transport.mjs';
import {digest,Refused} from './protocol.mjs';
export async function decodePendant(encoded){
  if(encoded?.encoding!=='base64'||typeof encoded.data!=='string'||encoded.data.length>64*1024*1024||! /^[A-Za-z0-9+/]*={0,2}$/.test(encoded.data)||! /^[0-9a-f]{64}$/.test(encoded.sha256))throw new Refused('Unknown bounded pendant transport');
  const raw=atob(encoded.data);if(btoa(raw)!==encoded.data)throw new Refused('Noncanonical pendant encoding');
  const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));if(await digest(bytes)!==encoded.sha256)throw new Refused('Pendant transport hash mismatch');return bytes;
}
export function attachSnapshot(root){
  const doc=root.ownerDocument,make=(tag,text)=>{const n=doc.createElement(tag);n.textContent=text;return n;};
  const status=make('p','Read-only cached graph; separate from the admitted decision ask snapshot.'),load=make('button','Open retained graph snapshot'),input=make('textarea',''),run=make('button','Query cached graph'),output=make('pre','');input.value='SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10';run.disabled=true;root.append(status,load,input,run,output);
  let worker,sequence=0;const pending=new Map();
  const call=data=>new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error('Native explorer deadline'));},30000);pending.set(id,{resolve,reject,timer});worker.postMessage({id,...data});});
  load.onclick=async()=>{load.disabled=true;try{
    worker=new Worker(new URL('./explorer-worker.mjs',import.meta.url),{type:'module'});
    worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;clearTimeout(p.timer);pending.delete(data.id);data.ok?p.resolve(data.result):p.reject(Error(data.error));};
    worker.onerror=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Native explorer capability unavailable'));}pending.clear();};
    const response=await fetch(new URL('../pendant.json',import.meta.url),{credentials:'omit'}),bytes=await decodePendant(await boundedJSON(response,64*1024*1024));
    const version=await call({cmd:'version'}),report=await call({cmd:'load',bytes});status.textContent='Native cached graph verified; dated snapshot is not current ask coverage or transaction authority.';output.textContent=JSON.stringify({version,report},null,2);run.disabled=false;
  }catch(error){status.textContent=error?.message??String(error);worker?.terminate();worker=null;load.disabled=false;}};
  run.onclick=async()=>{run.disabled=true;try{output.textContent=JSON.stringify(await call({cmd:'query',sparql:input.value}),null,2);}catch(error){output.textContent=error.message;}finally{run.disabled=false;}};
  return ()=>{worker?.terminate();for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Explorer closed'));}pending.clear();};
}
