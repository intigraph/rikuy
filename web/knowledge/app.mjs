// Deployment overlays this folder into the EXISTING daily-brief tree. The
// reviewed f8a5b46a transport/explorer assets stay at their original paths.
import {readJSON,validateEndpoint} from '../feed.mjs';
import {config} from './config.mjs';
import {KnowledgeClient} from './client.mjs';
import {renderView} from './view.mjs';
import {watchSeen,rememberWatches} from './watches.mjs';
const root=document.getElementById('knowledge-panels'),status=document.getElementById('knowledge-status');
// Reuse the bounded transport while attributing this task explicitly. The
// legacy transport's default task remains unchanged for the fallback page.
const request=(url,options={})=>readJSON(url,{...options,fetcher:(target,init)=>{
  const headers=new Headers(init.headers);headers.set('X-Quipu-Task',options.body?.name?.startsWith('daily_brief_watch_')?'aegis-blh.4':'aegis-blh.1');
  return fetch(target,{...init,headers});
}});
try{
validateEndpoint(config.endpoint,location.origin);
const definitions=await request(new URL('./query-definitions.json',import.meta.url),{cap:32768});
let storage=null;try{storage=window.localStorage;}catch{}
const previousWatchView=watchSeen(storage,Date.now());
const client=new KnowledgeClient({config,definitions,request,
  render:view=>{renderView(root,{...view,watchSeen:previousWatchView},definitions);rememberWatches(storage,view);},status:text=>{status.textContent=text;}});
// Resolve the original worker/pendant relative paths from the original page
// base, rather than creating a second engine or interpreting RDF in JS.
const explorerLink=document.getElementById('snapshot-link');
explorerLink.href='../index.html#v-explore';
explorerLink.textContent='Open the existing dated snapshot explorer (not live coverage)';
// attachExplorer remains in its existing page: its worker uses ./worker.js.
// Do not mount it here under a different base URL or call it a live graph.
const start=()=>client.start().catch(error=>{status.textContent='UNKNOWN · '+error.message;});
if(!document.hidden)await start();
document.addEventListener('visibilitychange',()=>document.hidden?client.pause():start());
window.addEventListener('pagehide',()=>client.pause(),{once:true});
}catch(error){status.textContent='UNKNOWN · '+error.message;}
