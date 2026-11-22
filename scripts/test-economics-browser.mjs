import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('dist');
const server=createServer(async(req,res)=>{
 try{let name=new URL(req.url,'http://localhost').pathname;if(name==='/favicon.ico'){res.writeHead(204);return res.end();}if(name.endsWith('/'))name+='index.html';const file=resolve(root,'.'+name);if(!file.startsWith(root+sep))throw Error('outside root');res.setHeader('Content-Type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
try{
 browser=await chromium.launch({headless:process.env.RIKUY_BROWSER_HEADED!=='1',...(process.env.RIKUY_BROWSER_EXECUTABLE?{executablePath:process.env.RIKUY_BROWSER_EXECUTABLE}:{})});
 const context=await browser.newContext(),page=await context.newPage(),errors=[],remote=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){remote.push(route.request().url());return route.abort();}return route.continue();});
 await page.goto(origin+'/economics/');assert.match(await page.locator('#status').textContent(),/UNKNOWN/);
 const at=Date.parse('2026-01-01T00:00:00Z')/1000;
 const snapshot={version:'ephemeral-economics/v1',window:{start:'2026-01-01T00:00:00Z',end:'2026-01-02T00:00:00Z'},observed_at:at+300,complete:true,unknown:[],source:{reader:'synthetic browser fixture'},attempts:[{name:'eph-task-demo',job:'task',harness:'codex',state:'done',item:'<img src=x onerror=alert(1)>',spawned_at:at,ended_at:at+20,deadline:at+600,max_turns:10,cause:'timeout',verdict:'blocked'}]};
 await page.locator('#file').setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('OBSERVED'));
 assert.equal(await page.locator('#daily tr').count(),1);assert.match(await page.locator('#cohorts').textContent(),/100%/);assert.match(await page.locator('#unknown').textContent(),/coverage 0\/1/);assert.equal(await page.locator('#attempts img').count(),0);
 for(const width of [1280,390]){await page.setViewportSize({width,height:800});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'tables scroll inside the page');}
 await page.locator('#file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{}')});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('stale'));assert.equal(await page.locator('#daily tr').count(),1,'failed read retains previous result');
 assert.deepEqual(errors,[]);assert.deepEqual(remote,[]);
 console.log('PASS economics import, arithmetic, UNKNOWN usage/savings, text safety, mobile layout and last-good stale retention; zero nonlocal requests');
}finally{await browser?.close();await new Promise(r=>server.close(r));}
