import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,access} from 'node:fs/promises';

test('deployment assets omit the synthetic demo entry point and fixture payload',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs']);
 const index=await readFile('dist/index.html','utf8');
 assert.equal(index.includes('./demo.mjs'),false);
 await assert.rejects(access('dist/demo.mjs'));
 await assert.rejects(access('dist/demo-rows.json'));
});

test('online Deck modules publish together with disabled configuration and no test fixtures',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs']);
 for(const name of ['index.html','style.css','app.mjs','config.mjs','value.mjs','model.mjs','evidence.mjs','pending.mjs','sign.mjs','storage.mjs','view.mjs']) assert.equal(await readFile('dist/deck/'+name,'utf8'),await readFile('web/deck/'+name,'utf8'));
 assert.match(await readFile('dist/deck/config.mjs','utf8'),/enabled: false/);
 await assert.rejects(access('dist/deck/fixtures'));
 await assert.rejects(access('dist/deck/deck-fixture.mjs'));
});

test('enrollment assets are published together and retain the disabled configuration',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs']);
 for(const name of ['index.html','app.mjs','model.mjs','cose.mjs','config.mjs','style.css'])assert.equal(await readFile('dist/enroll/'+name,'utf8'),await readFile('web/enroll/'+name,'utf8'));
 assert.match(await readFile('dist/enroll/config.mjs','utf8'),/enabled:\s*false/);
});

test('Today publishes beside the retained legacy and experimental surfaces with live readers off',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs']);
 assert.match(await readFile('dist/index.html','utf8'),/url=\.\/today\//);
 const today=await readFile('dist/today/index.html','utf8');
 for(const panel of ['Needs you','Recently deferred','Work held by stopped agents','Explore'])assert.ok(today.includes(panel),panel);
 for(const name of ['home.mjs','home.css','home-fallback.js','feed.mjs','reader-config.mjs'])assert.equal(await readFile('dist/today/'+name,'utf8'),await readFile('web/today/'+name,'utf8'));
 assert.match(await readFile('dist/today/reader-config.mjs','utf8'),/enabled=false/);
 assert.match(await readFile('dist/today/home.mjs','utf8'),/readerConfig.enabled===true\?main\(\)/);
 await access('dist/legacy/index.html');
 assert.equal(JSON.parse(await readFile('dist/today/changes/admission.json','utf8')).enabled,false);
 await assert.rejects(access('dist/today/home-model.test.mjs'));
 assert.equal(JSON.parse(await readFile('dist/source.json','utf8')).project,'rikuy');
});

test('the demo root serves the brief with the synthetic rows entry point, not the Today redirect',async()=>{
 execFileSync(process.execPath,['scripts/build.mjs']);
 const {spawn}=await import('node:child_process');
 const port=41000+process.pid%2000;
 const child=spawn(process.execPath,['scripts/demo.mjs'],{env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','inherit']});
 try{
  await new Promise((done,fail)=>{child.stdout.once('data',done);child.once('error',fail);child.once('exit',()=>fail(Error('demo exited early')));});
  const page=await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert.ok(page.includes('id="demo"'),'brief page with the demo status line');
  assert.ok(page.includes('<script type="module" src="./demo.mjs"></script>'),'demo entry point injected');
  assert.equal(page.includes('http-equiv="refresh"'),false);
  assert.equal((await (await fetch(`http://127.0.0.1:${port}/demo-rows.json`)).json()).length,3);
  assert.match(await (await fetch(`http://127.0.0.1:${port}/today/`)).text(),/Needs you/);
 }finally{child.kill();}
});
