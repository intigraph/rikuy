// Console look on the demo (aegis-xwm C): frame rate under Chrome mobile
// emulation, and no animation at all with prefers-reduced-motion. Synthetic
// page only; every nonlocal request is aborted and counted as a failure.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {chromium,devices} from 'playwright';
const root=resolve(import.meta.dirname,'../web/console');
const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript'};
const server=createServer(async(req,res)=>{
  try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/console/,'');if(name===''||name.endsWith('/'))name+='index.html';
    const file=resolve(root,'.'+name);if(!file.startsWith(root+sep))throw Error('outside');
    res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const executablePath=process.env.RIKUY_BROWSER_EXECUTABLE||undefined;
const browser=await chromium.launch({executablePath});
const MIN_FPS=Number(process.env.RIKUY_CONSOLE_MIN_FPS||55),THROTTLE=Number(process.env.RIKUY_CONSOLE_CPU_THROTTLE||4);
async function open(options){
  const context=await browser.newContext({...devices['Pixel 7'],...options}),page=await context.newPage(),failures=[];
  page.on('pageerror',e=>failures.push(e.message));
  page.on('console',m=>{if(m.type()==='error')failures.push(m.text());});
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){failures.push('nonlocal '+u.href);return route.abort();}return route.continue();});
  return {context,page,failures};
}
try{
  // 1. Frame rate during the cord-frame animation (0 to 1.1 s after load).
  {
    const {context,page,failures}=await open({});
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:THROTTLE});
    // Sample every frame for the 1.0 s the cord fills and numbers roll up,
    // starting at the first frame after the console module has run.
    await page.addInitScript(()=>{const t=[];window.__frames=t;addEventListener('DOMContentLoaded',()=>{const tick=now=>{t.push(now);if(now-t[0]<1000)requestAnimationFrame(tick);};requestAnimationFrame(tick);});});
    await page.goto(origin+'/console/');
    await page.waitForFunction(()=>window.__frames.length>1&&window.__frames.at(-1)-window.__frames[0]>=1000);
    await page.waitForTimeout(400);
    const {fps,frames,worst,running}=await page.evaluate(()=>{
      const t=window.__frames,span=(t.at(-1)-t[0])/1000,gaps=t.slice(1).map((x,i)=>x-t[i]);
      return {fps:(t.length-1)/span,frames:t.length,worst:Math.max(...gaps),running:document.getAnimations().filter(a=>a.playState==='running').length};
    });
    console.log(`console fps ${fps.toFixed(1)} over ${frames} frames (worst frame ${worst.toFixed(1)} ms) · Chrome mobile emulation (Pixel 7, ${THROTTLE}x CPU throttle) · ${running} animation(s) running at rest`);
    assert.ok(fps>=MIN_FPS,`frame animation must hold >= ${MIN_FPS} fps, measured ${fps.toFixed(1)}`);
    assert.equal(running,1,'at rest only the feed knot pulses');
    assert.equal(await page.locator('.slot[data-kind=tiles]').count(),1,'metric tiles panel kind');
    assert.equal(await page.locator('.slot[data-kind=ask]').count(),1,'ask card panel kind');
    assert.equal(await page.locator('.ask .pill:enabled').count(),0,'signing stays off: no enabled choice');
    const clipped=await page.evaluate(()=>{const box=document.querySelector('.console').getBoundingClientRect();
      return [...document.querySelectorAll('.console *')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&(r.right>box.right+0.5||n.scrollWidth>n.clientWidth+1&&getComputedStyle(n).overflow==='visible'&&n.matches('.pill,.tile,h2,h3'));}).map(n=>n.className||n.tagName);});
    assert.deepEqual(clipped,[],'nothing overflows the console at phone width');
    assert.deepEqual(failures,[]);
    await context.close();
  }
  // 2. prefers-reduced-motion: nothing animates, every value is final at once.
  {
    const {context,page,failures}=await open({reducedMotion:'reduce'});
    await page.addInitScript(()=>{window.__raf=0;const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>{window.__raf++;return raf(cb);};});
    await page.goto(origin+'/console/');
    await page.waitForFunction(()=>document.documentElement.dataset.consoleReady==='true');
    const first=await page.evaluate(()=>({animations:document.getAnimations().length,raf:window.__raf,
      names:[...document.querySelectorAll('.elbow,.bar i,.rail,.knot')].map(n=>getComputedStyle(n).animationName),
      counts:[...document.querySelectorAll('[data-count]')].map(n=>n.textContent===Number(n.dataset.count).toFixed(Number(n.dataset.dp||0)))}));
    await page.waitForTimeout(400);
    const later=await page.evaluate(()=>({animations:document.getAnimations().length,raf:window.__raf}));
    console.log(`reduced motion: ${first.animations} animations, ${first.raf} frame callbacks, ${first.names.length} animated parts checked`);
    assert.equal(first.animations,0,'no CSS animation or transition runs');
    assert.equal(later.animations,0,'none starts later');
    assert.equal(later.raf,0,'no frame loop is scheduled');
    assert.ok(first.names.length>=6&&first.names.every(n=>n==='none'),'every animated part resolves to animation-name none');
    assert.ok(first.counts.length===3&&first.counts.every(Boolean),'values are final without motion');
    assert.deepEqual(failures,[]);
    await context.close();
  }
  console.log('Console demo browser checks passed.');
}finally{await browser.close();server.close();}
