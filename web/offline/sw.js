// Only an explicit admitted UI action installs this scoped worker. Installation
// never enrolls a device, signs, settles, or caches a network decision response.
const prefix='brief-offline-source-v1:';
let activeCache=null;
const validPath=p=>typeof p==='string'&&(/^\.\/[a-z][a-z0-9._-]*$/.test(p)||['../worker.js','../pkg/quipu_wasm_explorer.js','../pkg/quipu_wasm_explorer_bg.wasm','../pendant.json','../snapshot-assets.json'].includes(p));
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
async function readManifest(){
  const r=await fetch(new URL('./asset-manifest.json',import.meta.url),{cache:'no-store',credentials:'omit'});
  if(!r.ok)throw Error('Offline asset manifest unavailable');const m=await r.json();
  if(m.version!==1||! /^[0-9a-f]{64}$/.test(m.bundle)||!Array.isArray(m.assets)||m.assets.length>40||new Set(m.assets.map(a=>a.path)).size!==m.assets.length)throw Error('Invalid cache manifest');
  if(await hash(new TextEncoder().encode(JSON.stringify(m.assets)))!==m.bundle||new URL(self.location.href).searchParams.get('bundle')!==m.bundle)throw Error('Cache bundle identity mismatch');
  for(const a of m.assets){const url=new URL(a.path,import.meta.url);if(!validPath(a.path)||url.origin!==self.location.origin||! /^[0-9a-f]{64}$/.test(a.sha256)||!Number.isSafeInteger(a.bytes)||a.bytes<0||a.bytes>64*1024*1024)throw Error('Invalid bounded asset');}
  return m;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const m=await readManifest(),name=prefix+m.bundle,cache=await caches.open(name);
  // Preserve previous versions. An interrupted or failed new cache does not
  // become active and cannot delete the prior offline app or its outbox.
  for(const asset of m.assets){
    const url=new URL(asset.path,import.meta.url),response=await fetch(url,{cache:'no-store',credentials:'omit'});
    if(!response.ok||response.type==='opaque')throw Error('Cache asset unavailable');
    const reader=response.body.getReader(),chunks=[];let size=0;
    try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>asset.bytes)throw Error('Cache asset overflow');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    if(size!==asset.bytes||await hash(bytes)!==asset.sha256)throw Error('Cache integrity mismatch');
    await cache.put(url,new Response(bytes,{status:200,headers:response.headers}));
  }
  await cache.put(new URL('./cache-ready',import.meta.url),new Response(JSON.stringify({name,bundle:m.bundle})));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  // This worker's own manifest selects the generation. Never choose a random
  // last cache or promote an incompletely downloaded generation.
  const bundle=new URL(self.location.href).searchParams.get('bundle');if(!bundle||! /^[0-9a-f]{64}$/.test(bundle))throw Error('Missing installed cache identity');
  const name=prefix+bundle,cache=await caches.open(name);
  if(!await cache.match(new URL('./cache-ready',import.meta.url)))throw Error('Cache generation incomplete');activeCache=name;
  // The user explicitly requested installation. Claim only this candidate
  // scope after integrity verification, so readiness includes the open page.
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  event.respondWith((async()=>{
    if(!activeCache){
      // Worker process may be evicted between fetches; its installed manifest
      // is retained in the completed cache marker, not fetched over a missing
      // network on offline restart. The script URL is versioned by staging.
      const url=new URL(self.location.href);const bundle=url.searchParams.get('bundle');
      if(bundle&&/^[0-9a-f]{64}$/.test(bundle)){const name=prefix+bundle,cache=await caches.open(name);if(await cache.match(new URL('./cache-ready',import.meta.url)))activeCache=name;}
    }
    if(activeCache){const cache=await caches.open(activeCache),target=event.request.mode==='navigate'?new URL('./index.html',import.meta.url):event.request;const cached=await cache.match(target);if(cached)return cached;}
    return fetch(event.request);
  })());
});
