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
