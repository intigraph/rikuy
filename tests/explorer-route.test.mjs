import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const html=readFileSync('web/legacy/index.html','utf8');
const router=readFileSync('web/legacy/owner-script-2.js','utf8');
function selected(fragment){
 const names=[...html.matchAll(/<button\b[^>]*role="tab"[^>]*data-v="([^"]+)"/g)].map(x=>x[1]);
 assert.ok(names.includes('today')&&names.includes('explore'),'actual legacy tab inventory');
 const panels=new Map(names.map(x=>['v-'+x,{hidden:false}]));
 const tabs=names.map(v=>({dataset:{v},setAttribute(){},addEventListener(){},focus(){}}));
 runInNewContext(router,{document:{querySelectorAll:()=>tabs,getElementById:id=>{assert.ok(panels.has(id));return panels.get(id);}},location:{hash:fragment},window:{},localStorage:{getItem:()=>null,setItem(){}},history:{replaceState(){}},scrollTo(){}});
 return [...panels].filter(([,p])=>!p.hidden).map(([id])=>id);
}
test('actual legacy router distinguishes Explore from an invalid fragment',()=>{
 assert.deepEqual(selected('#explore'),['v-explore']);
 assert.deepEqual(selected('#v-explore'),['v-today']);
});
test('both knowledge snapshot link variants open the actual Explore panel',()=>{
 const page=readFileSync('web/knowledge/index.html','utf8');
 const app=readFileSync('web/knowledge/app.mjs','utf8');
 const fallback=page.match(/id="snapshot-link"\s+href="([^"]+)"/);
 const assigned=app.match(/explorerLink\.href\s*=\s*'([^']+)'/);
 assert.ok(fallback&&assigned,'fallback and assigned link present');
 for(const href of [fallback[1],assigned[1]]){
  const url=new URL(href,'https://example.test/knowledge/index.html');
  assert.equal(url.pathname,'/index.html');
  assert.deepEqual(selected(url.hash),['v-explore'],href);
 }
});
