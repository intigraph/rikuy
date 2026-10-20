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
