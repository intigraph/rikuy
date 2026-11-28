// Console look on the served Today page: it loads the copied console tokens,
// draws the cord frame and both panel kinds, nothing overflows a 390x844
// viewport on any tab, a failed panel wears the fail tone, reduced motion runs
// no animation, and the frame animation's fps under Chrome mobile emulation is
// reported. Synthetic in-page fixtures only; every nonlocal or reader request
// is aborted and counted as a failure.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(process.env.RIKUY_TODAY_DIST||'dist');
const shots=process.env.RIKUY_TODAY_SCREENSHOTS;
const mime={'.html':'text/html','.css':'text/css','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json'};
const server=createServer(async(req,res)=>{
  try{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(name.endsWith('/'))name+='index.html';
    const file=resolve(root,'.'+name);if(!file.startsWith(root+sep))throw Error('outside');
    res.setHeader('content-type',mime[extname(file)]||'application/octet-stream');res.end(await readFile(file));}
  catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.RIKUY_BROWSER_EXECUTABLE||undefined});
const MIN_FPS=Number(process.env.RIKUY_TODAY_MIN_FPS||0),THROTTLE=Number(process.env.RIKUY_CONSOLE_CPU_THROTTLE||4);
const phone={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true};
async function open(options={}){
  const context=await browser.newContext({...phone,...options}),page=await context.newPage(),failures=[];
  page.on('pageerror',e=>failures.push(e.message));
  page.on('console',m=>{if(m.type()==='error')failures.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)failures.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);});
  await page.route('**/*',route=>{const u=new URL(route.request().url());
    if(u.origin!==origin||/^\/(ask|query|changes|feed|projections)(\/|$)/.test(u.pathname)){failures.push('blocked '+u.pathname);return route.abort();}
    return route.continue();});
  return {context,page,failures};
}
const ready=page=>page.waitForFunction(()=>document.querySelector('#connection')?.textContent.includes('Live readers await deployment admission'),{},{timeout:5000});
// A synthetic Ask with a long unbroken title proves the ask card wraps.
const fixture=()=>import('./home-view.mjs').then(view=>view.renderAsks({rows:[{id:'synthetic-ask-1',title:'Which signing key should the phone use for decisions once enrollment opens: a security key or a synced passkey?',kind:'ask',priority:1,status:'open',created:'2026-11-01T00:00:00Z',gates:['ask-type'],options:'Security key | Synced passkey',rec:'Security key',unblocks:'https://example.invalid/item/synthetic-linked',default:'Security key applies',expires:'2026-12-01T12:00:00Z'}],incomplete:false},null,Date.now()));
try{
  // 1. Frame rate while the cord frame grows in (first 1.0 s after DOMContentLoaded).
  {
    const {context,page,failures}=await open();
    const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:THROTTLE});
    await page.addInitScript(()=>{const t=[];window.__frames=t;addEventListener('DOMContentLoaded',()=>{const tick=now=>{t.push(now);if(now-t[0]<1000)requestAnimationFrame(tick);};requestAnimationFrame(tick);});});
    await page.goto(origin+'/today/');
    await page.waitForFunction(()=>window.__frames.length>1&&window.__frames.at(-1)-window.__frames[0]>=1000);
    const {fps,frames,worst}=await page.evaluate(()=>{const t=window.__frames,gaps=t.slice(1).map((x,i)=>x-t[i]);return {fps:(t.length-1)/((t.at(-1)-t[0])/1000),frames:t.length,worst:Math.max(...gaps)};});
    console.log(`Today fps ${fps.toFixed(1)} over ${frames} frames (worst frame ${worst.toFixed(1)} ms) · Chrome mobile emulation (390x844, ${THROTTLE}x CPU throttle), not a phone`);
    if(MIN_FPS)assert.ok(fps>=MIN_FPS,`frame animation must hold >= ${MIN_FPS} fps, measured ${fps.toFixed(1)}`);
    await context.close();
    assert.deepEqual(failures,[]);
  }
  // 2. Look, failure tone and phone-width overflow on every tab.
  {
    const {context,page,failures}=await open();
    await page.goto(origin+'/today/');await ready(page);
    await page.evaluate(fixture);
    const look=await page.evaluate(()=>{const css=getComputedStyle(document.documentElement),body=getComputedStyle(document.body);
      
      return {field:css.getPropertyValue('--c-field').trim(),bodyBg:body.backgroundColor,fail:getComputedStyle(document.querySelector('.unavailable')).borderLeftColor,
        frame:['.cord-top .elbow','.cord-top .bar i','.cap'].map(s=>document.querySelectorAll(s).length),
        heldTone:getComputedStyle(document.querySelector('#h-held').closest('.card'),'::before').backgroundColor,
        askTone:getComputedStyle(document.querySelector('.needs-you'),'::before').backgroundColor,
        askCards:document.querySelectorAll('#ask-top .ask').length,enabled:document.querySelectorAll('.ask-decide button:not(:disabled)').length};});
    assert.equal(look.field,'#0e1822','Today reads the copied console tokens');
    assert.equal(look.bodyBg,'rgb(14, 24, 34)','Today page is the console field');
    assert.deepEqual(look.frame,[1,3,1],'cord frame: elbow, three bar segments, cap');
    assert.equal(look.fail,'rgb(233, 113, 95)','an Unavailable read wears the fail token');
    assert.equal(look.heldTone,'rgb(233, 113, 95)','a failed panel rail is coral, not blank');
    assert.equal(look.askTone,'rgb(240, 169, 74)','Needs-you rail is the ask tone');
    assert.equal(look.askCards,1,'ask card panel kind renders');
    assert.equal(look.enabled,0,'no decision control is enabled under the public config');
    if(shots){await page.waitForTimeout(1200);await mkdir(shots,{recursive:true});await page.screenshot({path:resolve(shots,'today-390x844.png')});await page.screenshot({path:resolve(shots,'today-390-full.png'),fullPage:true});}
    const widths={};
    const settled=failures.length;
    for(const tab of ['Today','Next','Pace','Board','Log','Explore']){
      await page.getByRole('tab',{name:tab}).click();
      widths[tab]=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
      if(shots&&tab==='Pace')await page.waitForTimeout(800),await page.screenshot({path:resolve(shots,'pace-390x844.png')});
    }
    console.log('horizontal overflow per tab at 390x844 (px):',JSON.stringify(widths));
    assert.ok(Object.values(widths).every(w=>w<=0),'nothing overflows horizontally at 390x844 on any tab');
    assert.equal(await page.locator('#pace-tiles .tile.unknown').count(),3,'unknown pace values are hatched tiles, never 0');
    assert.ok((await page.locator('#pace-tiles .tile .v').allTextContents()).every(v=>v!=='0'),'unknown is never shown as 0');
    // Explore reads the deployment-owned snapshot, absent from dist; only its 404 is expected.
    const late=failures.splice(settled).filter(f=>!/pendant\.json|Failed to load resource: the server responded with a status of 404/.test(f));
    assert.deepEqual([...failures,...late],[]);
    await context.close();
  }
  // 3. Phone first screen at 412x915: all six tabs reachable without clipping,
  // three asks with their choices and the P0 count above the fold, the page
  // status on one line, and no horizontal overflow. The same check runs again
  // with the root font at 112.5%, the way a phone with a larger system font
  // grows the text, and the Ask text must actually grow there.
  const phoneSizes={};
  for(const scale of ['100%','112.5%']){
    const {context,page,failures}=await open({viewport:{width:412,height:915},reducedMotion:'reduce'});
    await page.goto(origin+'/today/');await ready(page);
    await page.evaluate(scale=>{document.documentElement.style.fontSize=scale;return import('./home-view.mjs').then(view=>{
      const ask=(n,title,options,rec)=>({id:'synthetic-ask-'+n,title,kind:'ask',priority:1,status:'open',created:'2026-11-01T00:00:00Z',gates:['ask-type'],options,rec,unblocks:'https://example.invalid/item/synthetic-linked',default:'Keep waiting',expires:'2026-12-01T12:00:00Z'});
      view.renderAsks({rows:[ask(1,'ASK Stiwi: Which signing key should the phone use once enrollment opens?','Security key | Synced passkey','Security key'),ask(2,'ASK Stiwi: Retire the legacy brief (now / after review / never)','',''),ask(3,'ASK Stiwi: Choose the next bounded step','(1) Verify the source (2) Wait for a receipt (3) Stop here','(1) the evidence is readable'),ask(4,'ASK Stiwi: Keep the synthetic rollout paused?','','')],incomplete:false},null,Date.now());
      view.renderPriorities([1,2,3].map(n=>({id:'synthetic-p0-'+n,title:'Synthetic priority '+n,priority:0,revision:1,modified:'2026-11-27',status:'in_progress'})),null,Date.now());
    });},scale);
    await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
    const m=await page.evaluate(()=>{const H=innerHeight,nav=document.querySelector('.tabs').getBoundingClientRect(),conn=document.querySelector('#connection');
      return {scrollWidth:document.documentElement.scrollWidth,
        clipped:[...document.querySelectorAll('.tabs [role=tab]')].filter(t=>{const r=t.getBoundingClientRect(),c=getComputedStyle(t);return r.left<nav.left-0.5||r.right>nav.right+0.5||r.right>innerWidth||t.scrollWidth>t.clientWidth+1||c.visibility==='hidden';}).map(t=>t.textContent.trim()),
        tabs:document.querySelectorAll('.tabs [role=tab]').length,
        asks:[...document.querySelectorAll('#ask-top .ask')].filter(a=>{const g=a.querySelector('.decision-actions');return g&&g.children.length&&g.getBoundingClientRect().bottom<=H;}).length,
        p0:document.querySelector('#p0-count').textContent,p0Visible:document.querySelector('#p0-count').getBoundingClientRect().bottom<=H&&!document.querySelector('#p0-count').hidden,
        statusOneLine:conn.getBoundingClientRect().height<2.2*parseFloat(getComputedStyle(conn).lineHeight),
        qSize:parseFloat(getComputedStyle(document.querySelector('#ask-top .ask .q')).fontSize),
        layout:['.top','#connection','#asks-status',...[1,2,3].map(n=>`#ask-top .ask:nth-child(${n}) .decision-actions`)].map(q=>{const r=document.querySelector(q)?.getBoundingClientRect();return r?Math.round(r.top)+'-'+Math.round(r.bottom):'none';}).join(' ')+' fonts '+getComputedStyle(document.querySelector('.decision-choice')).fontFamily.slice(0,40)+' / '+getComputedStyle(document.body).fontFamily.slice(0,40)};});
    console.log(`Today phone first screen at 412x915, root font ${scale}:`,JSON.stringify(m));
    if(shots)await mkdir(shots,{recursive:true}),await page.screenshot({path:resolve(shots,`today-412x915-font-${scale.replace('%','pct')}.png`)});
    phoneSizes[scale]=m.qSize;
    assert.equal(m.tabs,6);
    assert.deepEqual(m.clipped,[],`all six tabs are reachable without clipping at 412 px (font ${scale})`);
    assert.ok(m.scrollWidth<=412,`no horizontal overflow at 412 px (font ${scale}, scrollWidth ${m.scrollWidth})`);
    assert.ok(m.asks>=3,`at least three asks with their choices on the first screen (font ${scale}, saw ${m.asks})`);
    assert.equal(m.p0,'3 P0');assert.ok(m.p0Visible,`the P0 count is on the first screen (font ${scale})`);
    assert.ok(m.statusOneLine,`the page status line is one line on a phone (font ${scale})`);
    assert.deepEqual(failures,[]);
    await context.close();
  }
  assert.ok(phoneSizes['112.5%']>phoneSizes['100%'],`the Ask question grows with the root font (${phoneSizes['100%']}px -> ${phoneSizes['112.5%']}px)`);
  // 4. prefers-reduced-motion: no animation or transition runs on Today.
  {
    const {context,page,failures}=await open({reducedMotion:'reduce'});
    await page.goto(origin+'/today/');await ready(page);
    const first=await page.evaluate(()=>({animations:document.getAnimations().length,names:[...document.querySelectorAll('.elbow,.bar i,.cap')].map(n=>getComputedStyle(n).animationName).concat([...document.querySelectorAll('.card,.brief-panel')].map(n=>getComputedStyle(n,'::before').animationName))}));
    await page.waitForTimeout(400);
    const later=await page.evaluate(()=>document.getAnimations().length);
    console.log(`Today reduced motion: ${first.animations} animations, ${first.names.length} animated parts resolve to none`);
    assert.equal(first.animations,0,'no CSS animation or transition runs');
    assert.equal(later,0,'none starts later');
    assert.ok(first.names.length>=8&&first.names.every(n=>n==='none'),'every animated part resolves to animation-name none');
    assert.deepEqual(failures,[]);
    await context.close();
  }
  console.log('Today console-look browser checks passed.');
}finally{await browser.close();server.close();}
