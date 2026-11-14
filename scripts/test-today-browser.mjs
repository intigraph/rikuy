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
try {
  browser=await chromium.launch({headless:process.env.RIKUY_BROWSER_HEADED!=='1',...(process.env.RIKUY_BROWSER_EXECUTABLE?{executablePath:process.env.RIKUY_BROWSER_EXECUTABLE}:{})});
  await loadToday();
  console.log('PASS built Today module graph, disabled-reader startup and tab transition');
  await assert.rejects(loadToday({breakDependency:true}),/Timeout|built module imports/);
  console.log('PASS missing model dependency is detected despite fallback HTML');
} finally {
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
}
