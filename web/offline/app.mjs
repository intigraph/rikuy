import {config} from './config.mjs';
import {connect} from './adapters.mjs';
import {requireTransport} from './transport.mjs';
import {mount} from './view.mjs';
import {installCache} from './cache.mjs';
import {attachSnapshot} from './explorer.mjs';
const root=document.getElementById('offline-content'),status=document.getElementById('offline-status'),install=document.getElementById('install-cache');
try{
  if(!config.enabled){status.textContent='Source preview · offline decision admission is not enabled';}
  else{
    const session=await connect();requireTransport(session.outbox.transport);
    await mount({...session,root,status});
    const dispose=attachSnapshot(document.getElementById('cached-graph'));window.addEventListener('pagehide',dispose,{once:true});
    status.textContent='Ready · enrolled identity and admitted source adapter supplied';
    install.disabled=!config.installCache;
    install.onclick=async()=>{install.disabled=true;try{await installCache(config);status.textContent='Offline cache installation requested; wait for browser activation before disconnecting';}catch(error){status.textContent=error.message;install.disabled=false;}};
  }
}catch(error){status.textContent='Unavailable · '+error.message;}
