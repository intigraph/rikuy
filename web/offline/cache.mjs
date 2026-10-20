import {Refused,Unsupported} from './protocol.mjs';
import {boundedJSON} from './transport.mjs';
export async function installCache(config,{serviceWorker=navigator.serviceWorker,location=globalThis.location}={}){
  if(!config.enabled||!config.installCache)throw new Unsupported('Offline installation is not admitted');
  if(!serviceWorker||!globalThis.isSecureContext)throw new Unsupported('A trusted secure browser context is required');
  // The worker controls only this candidate directory, never the fallback.
  const url=new URL('./sw.js',import.meta.url),scope=new URL('./',import.meta.url);
  if(location.origin!==url.origin)throw new Refused('Service worker origin mismatch');
  const manifest=await boundedJSON(await fetch(new URL('./asset-manifest.json',import.meta.url),{cache:'no-store',credentials:'omit'}),65536);
  if(! /^[0-9a-f]{64}$/.test(manifest.bundle))throw new Refused('Missing exact cache bundle identity');
  url.searchParams.set('bundle',manifest.bundle);
  const registration=await serviceWorker.register(url,{scope:scope.pathname,type:'module',updateViaCache:'none'});
  if(registration.waiting&&registration.active?.scriptURL!==url.href)throw new Unsupported('Updated cache staged; close this app in other tabs and reopen. Existing cache retained.');
  return registration;
}
