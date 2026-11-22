// Exercise the published module graph: HTML/watchdog success alone is insufficient.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('dist');
const server=createServer(async(req,res)=>{
  try {
    let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(name==='/favicon.ico'){res.writeHead(204);res.end();return;}
    if(name.endsWith('/'))name+='index.html';
    const file=resolve(root,'.'+name);
    if(!file.startsWith(root+sep))throw new Error('outside static root');
    const body=await readFile(file);
    res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html');
    res.end(body);
  } catch {res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
async function loadToday({breakDependency=false}={}){
  const context=await browser.newContext(),page=await context.newPage();
  const failures=[],live=[];
  page.on('pageerror',e=>failures.push(e.message));
  page.on('console',m=>{if(m.type()==='error')failures.push(m.text());});
  page.on('response',r=>{if(r.status()>=400)failures.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`);});
  page.on('requestfailed',r=>failures.push(`request failed ${new URL(r.url()).pathname}`));
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(u.origin!==origin||/^\/(ask|query|changes|feed|projections)(\/|$)/.test(u.pathname)){
      live.push(u.pathname);return route.abort();
    }
    if(breakDependency&&u.pathname==='/legacy/model.mjs')return route.fulfill({status:404,body:'missing dependency'});
    return route.continue();
  });
  try {
    await page.goto(origin);
    await page.waitForURL('**/today/');
    // Only home.mjs can render this reason. The independent watchdog cannot.
    await page.waitForFunction(()=>document.querySelector('#connection')?.textContent.includes('Live readers await deployment admission'),{},{timeout:5000});
    await page.getByRole('tab',{name:'Next',exact:true}).click();
    assert.equal(await page.locator('#v-next').isVisible(),true,'module-installed tab handler must change the panel');
    assert.equal(await page.locator('#v-today').isVisible(),false);
    assert.deepEqual(failures,[],'all built module imports must load without browser errors');
    assert.deepEqual(live,[],'default readers must remain off');
  } finally {await context.close();}
}
async function explicitAskRecord(){
  const context=await browser.newContext(),page=await context.newPage(),remote=[];
  await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){remote.push(route.request().url());return route.abort();}return route.continue();});
  try{
    await page.goto(origin+'/today/');
    await page.waitForFunction(()=>document.querySelector('#connection')?.textContent.includes('Live readers await deployment admission'));
    await page.evaluate(async()=>{
      const view=await import('./home-view.mjs');
      const ask={id:'aegis-synthetic',title:'Choose a color',kind:'ask',priority:1,status:'open',created:'2026-11-01T00:00:00Z',gates:['ask-type'],options:'Blue | Green',rec:'Blue',unblocks:'https://seeds.local/item/aegis-linked',default:'Keep <script>current</script>',expires:'2026-12-01T12:00:00Z'};
      view.setRecordReader(async iri=>({iri,title:iri.endsWith('aegis-linked')?'Work awaiting the decision':'Choose a color',status:'open',kind:'ask',default:ask.default,expires:ask.expires,description:'A readable synthetic record.',comments:[{text:'Synthetic source evidence',author:'demo'}],links:iri.endsWith('aegis-linked')?[]:[{iri:ask.unblocks,label:'Linked work'}],asOf:{at:'2026-11-22T00:00:00Z'},raw:{fixture:true}}));
      view.renderAsks({rows:[ask],incomplete:false},null,Date.now());
    });
    assert.equal(await page.locator('#ask-top .ask').count(),1,'explicit Ask is featured without a legacy title');
    assert.match(await page.locator('#ask-top .ask-metadata').textContent(),/Keep <script>current<\/script>/);
    assert.equal(await page.locator('#ask-top script').count(),0);
    await page.getByRole('button',{name:'Open record: Choose a color',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('#readable-record h2')?.textContent==='Choose a color');
    assert.match(await page.locator('.record-description').textContent(),/readable synthetic/);
    assert.match(await page.locator('.record-meta').textContent(),/Reply by/);
    assert.equal(await page.locator('#readable-record details').getAttribute('open'),null,'technical JSON is collapsed');
    await page.getByRole('button',{name:'Open Linked work',exact:true}).press('Enter');
    await page.waitForFunction(()=>document.querySelector('#readable-record h2')?.textContent==='Work awaiting the decision');
    assert.deepEqual(remote,[]);
  }finally{await context.close();}
}
try {
  browser=await chromium.launch({headless:process.env.RIKUY_BROWSER_HEADED!=='1',...(process.env.RIKUY_BROWSER_EXECUTABLE?{executablePath:process.env.RIKUY_BROWSER_EXECUTABLE}:{})});
  await loadToday();
  await explicitAskRecord();
  console.log('PASS explicit Ask metadata, readable record and keyboard graph navigation; zero nonlocal requests');
  console.log('PASS built Today module graph, disabled-reader startup and tab transition');
  await assert.rejects(loadToday({breakDependency:true}),/Timeout|built module imports/);
  console.log('PASS missing model dependency is detected despite fallback HTML');
} finally {
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
}
