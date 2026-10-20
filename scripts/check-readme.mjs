import {readFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const text=await readFile(new URL('../README.md',import.meta.url),'utf8');
const headings=['## Why you would want it','## Install','## First success in three commands','## On your own data','## Before you start',"## What's next",'## 🧺 The stack','## Contributing','## 📜 License'];let at=-1;
for(const h of headings){const n=text.indexOf(h);assert(n>at,`missing/out-of-order ${h}`);at=n;}
assert(text.split('\n').length<250);assert(text.slice(0,text.indexOf('git clone')).split('\n').length<=60);
const first=text.split('## First success in three commands')[1].split('## On your own data')[0];assert.equal(first.match(/```sh\n([\s\S]*?)```/)[1].trim().split('\n').length,3);
assert.equal((text.match(/<!-- stack-table:start -->/g)||[]).length,1);assert.equal((text.match(/<!-- stack-table:end -->/g)||[]).length,1);assert(text.includes('https://github.com/scbrown/rikuy'));
console.log('README standard: PASS');
