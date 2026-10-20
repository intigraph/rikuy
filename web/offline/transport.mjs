import {Unsupported,Refused} from './protocol.mjs';
// No invented HTTP route and no generic episode/GraphStore write fallback.
// A future reviewed Quipu adapter must supply this exact interface explicitly.
export function requireTransport(adapter){
  if(adapter?.protocol!=='quipu-brief-offline-v1'||['snapshot','submit','receipt'].some(k=>typeof adapter[k]!=='function'))throw new Unsupported('Quipu offline settlement adapter has not been delivered/admitted');
  return adapter;
}
export async function boundedJSON(response,cap=262144){
  if(!response.ok)throw new Refused('Offline transport response unavailable');
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>cap)throw new Refused('Offline response exceeds admitted bounds');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
}
