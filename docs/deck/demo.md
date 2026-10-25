# Source demonstration and repeatable browser fixture

Before, this repository had no online request card or interpretation of generic
attested-write receipts. The source preview now renders a synthetic current
request and exercises choose, Later, comment and pending receipt recovery.
It still ships disabled and selects no production adapter.

[Download the real recovery WebM](recovery.webm) or inspect the
[final recovered screenshot](recovered.png). In the recording, the synthetic
commit response is unknown, the original intent stays pending, and a point
receipt later reconciles it. Exactly one commit and one signing callback occur.
The browser fixture uses synthetic trusted-reader and signer adapters; it is
not a real device, native receipt, human decision or service demonstration.
The separate [native fixture results](native-results.json) record 16 controls
against the clean candidate CLI/native library, with a different trust scope.

The recording is from the working source over base de8c7fd. The exact browser
module/fixture hashes are retained in [source-assets.json](source-assets.json),
with nine controls in [browser-results.json](browser-results.json). Those
hashes were equal before and after the browser run. The default page is inert;
all synthetic HTTPS assets are intercepted and nonlocal requests are blocked.
A WebM-capable player is required; inline playback is not assumed.

The browser controls include actual IndexedDB reload, competing insertions and
state/nonce deletion checks; they do not substitute a memory store. Comment
leaves the request waiting, Later stays visible, ordinary-graph evidence is
UNKNOWN, stale items never sign, and a markup-like title stays plain text.

Use Node22, Playwright1.58.2, Chrome, an isolated display and its installed
video-recorder dependency. Copy this block to /tmp/playwright-test-deck.cjs
and run from the repository root under a private HOME and the normal HOME
guard. PLAYWRIGHT_MODULE and DECK_EVIDENCE select installed dependencies and
an owned output directory. No production endpoint is contacted.

```javascript
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=process.env.DECK_SOURCE||process.cwd(),OUT=process.env.DECK_EVIDENCE||fs.mkdtempSync(path.join(require('os').tmpdir(),'rikuy-deck-')),ORIGIN='https://sign.example.test';
const crypto=require('crypto');const sourceFiles=fs.readdirSync(path.join(ROOT,'web/deck')).sort().map(n=>'web/deck/'+n).concat(['tests/deck-fixture.mjs']);const sourceHash=()=>Object.fromEntries(sourceFiles.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT,n))).digest('hex')]));const beforeSource=sourceHash();
(async()=>{const browser=await chromium.launch({headless:false,executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
try{for(const scenario of (process.env.DECK_SCENARIOS?.split(',')||['disabled','choose','later','comment','unknown-recover','ordinary-graph','stale-item','xss-title','storage-reload-cas'])){
 const context=await browser.newContext({viewport:{width:980,height:900},...(scenario==='unknown-recover'?{recordVideo:{dir:path.join(OUT,'video'),size:{width:980,height:900}}}:{})}),blocked=[],errors=[];
 try{const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await context.route('**/*',async route=>{const u=new URL(route.request().url());const p=u.pathname.replace(/^\//,'');if(u.origin!==ORIGIN||!((/^web\/deck\/[a-z-]+\.(mjs|css|html)$/).test(p)||p==='tests/deck-fixture.mjs')){blocked.push(u.href);await route.abort();return;}await route.fulfill({body:fs.readFileSync(path.join(ROOT,p)),contentType:p.endsWith('.mjs')?'text/javascript':p.endsWith('.css')?'text/css':'text/html'});});
 await page.goto(ORIGIN+'/web/deck/index.html');await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('Preview'));
 if(scenario==='disabled'){assert.equal(await page.locator('button').count(),0);}
 else if(scenario==='storage-reload-cas'){
  const proof=await page.evaluate(async()=>{const f=await import('/tests/deck-fixture.mjs');const {PendingStore}=await import('/web/deck/storage.mjs');const {admittedChallenge}=await import('/web/deck/evidence.mjs');let a=await PendingStore.open(f.who,f.boundary),b=await PendingStore.open(f.who,f.boundary);const p=f.make(),issued=await f.issued(p),c=await admittedChallenge(issued,p,f.who,1900000000);const record={proposal:p,nonce:c.challenge.nonce,contentHash:c.contentHash,notAfter:f.ask.expiresAt,state:'PENDING'};const initial=await Promise.allSettled([a.insert(record),b.insert(record)]);if(initial.filter(x=>x.status==='fulfilled').length!==1)throw Error('two-tab insertion was not atomic');a.close();b.close();a=await PendingStore.open(f.who,f.boundary);const retained=await a.get();if(JSON.stringify(retained.proposal)!==JSON.stringify(p))throw Error('reload changed proposal');await a.change(record.nonce,{state:'UNKNOWN'});const refused=[];for(const operation of [()=>a.remove(record.nonce,'PENDING'),()=>a.change(record.nonce,{state:'UNKNOWN',proposal:f.make()}),()=>a.remove('c'.repeat(64),'ACCEPTED')]){try{await operation();refused.push(false);}catch{refused.push(true);}}if(refused.some(x=>!x))throw Error('unknown custody was altered');const other=await PendingStore.open({...f.who,audience:'other-store'},f.boundary);if(await other.get())throw Error('foreign store shares custody');other.close();a.close();return{one_insert:true,reload_exact:true,unknown_preserved:true,scope_isolated:true};});results.push({scenario,...proof,pass:true});
 }else{
  await page.evaluate(async scenario=>{const f=await import('/tests/deck-fixture.mjs');const {mount}=await import('/web/deck/view.mjs');const {PendingWrite}=await import('/web/deck/pending.mjs');const {PendingStore}=await import('/web/deck/storage.mjs');const {requestPublication,revisionIri}=await import('/web/deck/model.mjs');const r=structuredClone(f.ask);if(scenario==='xss-title')r.title='<img src="https://invalid.example/secret" onerror="window.injection=true">';const publication=requestPublication(r,f.boundary);const requestRow={graph:publication.graph,requestId:r.id,currentRevision:r.revision,revisionIri:revisionIri(r),manifest:publication.datums[1].o.value,complete:true};let proposed,e=null,commits=0,signs=0;const store=await PendingStore.open(f.who,f.boundary);window.fixtureStore=store;const transport={challenge:async p=>{proposed=p;return f.issued(p);},commit:async()=>{commits++;if(scenario!=='unknown-recover')e=await f.evidence(proposed);if(scenario==='unknown-recover')throw Error('indeterminate');},receipt:async()=>e?.response||{found:false,verified:false,receipt:null,tx:null},readback:async()=>e.readback};if(scenario==='ordinary-graph'){e=await f.evidence();e.row.graph=f.boundary.requestGraph;}const writer=new PendingWrite({identity:f.who,store,transport,sign:async()=>{signs++;return{client_data_json:'a',authenticator_data:'b',signature:'c'};},now:()=>1900000000});window.completeFixture=async()=>{e=await f.evidence(proposed);};window.fixtureCounts=()=>({commits,signs});await mount(document.querySelector('main'),{enabled:true,boundary:f.boundary,identity:f.who,read:async()=>({complete:true,requestRow,freshItem:{...f.freshItem,...(scenario==='stale-item'?{revision:8}:{})},rows:e?[{row:e.row,receipt:e.response}]:[]}),writer,now:()=>1900000000});},scenario);
  if(scenario==='ordinary-graph'){await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('UNKNOWN'));assert.equal(await page.locator('button').count(),0);}
  else if(scenario==='xss-title'){assert.equal(await page.locator('img').count(),0);assert.equal(await page.locator('h1').innerText(),'<img src="https://invalid.example/secret" onerror="window.injection=true">');assert.equal(await page.evaluate(()=>window.injection||false),false);}
  else{
   await page.getByRole('textbox',{name:'Comment'}).fill('Synthetic browser comment');const label=scenario==='later'?'Later':scenario==='comment'?'Add comment':'Yes';if(scenario==='unknown-recover')await page.waitForTimeout(1000);await page.getByRole('button',{name:label,exact:true}).click();
   if(scenario==='stale-item'){await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('UNKNOWN'));assert.deepEqual(await page.evaluate(()=>window.fixtureCounts()),{commits:0,signs:0});}
   else if(scenario==='unknown-recover'){await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('Pending')&&document.querySelector('main').getAttribute('aria-busy')==='false');assert.equal(await page.getByRole('button',{name:'Yes',exact:true}).isDisabled(),true);assert.deepEqual(await page.evaluate(()=>window.fixtureCounts()),{commits:1,signs:1});await page.waitForTimeout(1500);await page.evaluate(()=>window.completeFixture());await page.getByRole('button',{name:'Recover receipt'}).click();await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.startsWith('Answered')&&document.querySelector('main').getAttribute('aria-busy')==='false');assert.deepEqual(await page.evaluate(()=>window.fixtureCounts()),{commits:1,signs:1});await page.screenshot({path:path.join(OUT,'recovered.png'),fullPage:true});await page.waitForTimeout(2000);}
   else{await page.waitForFunction(kind=>kind==='comment'?document.querySelector('section').textContent.includes('fixture-operator')&&document.querySelector('[role=status]').textContent.startsWith('Current'):kind==='later'?document.querySelector('[role=status]').textContent.startsWith('Later'):document.querySelector('[role=status]').textContent.startsWith('Answered'),scenario);await page.waitForFunction(()=>document.querySelector('main').getAttribute('aria-busy')==='false');if(scenario==='comment')assert.equal(await page.getByRole('button',{name:'Yes',exact:true}).isDisabled(),false);else assert.equal(await page.getByRole('button',{name:'Yes',exact:true}).isDisabled(),true);assert.deepEqual(await page.evaluate(()=>window.fixtureCounts()),{commits:1,signs:1});}
  }
  await page.evaluate(()=>window.fixtureStore.close());
 }
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);if(scenario!=='storage-reload-cas')results.push({scenario,pass:true,nonlocal_requests:blocked.length,page_errors:errors});
 }finally{await context.close();}
}assert.deepEqual(sourceHash(),beforeSource,'Source changed during browser fixture');fs.writeFileSync(path.join(OUT,'browser-source-hashes.json'),JSON.stringify(beforeSource,null,2));fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({scope:'Synthetic trusted-reader and signer adapters; actual DOM and IndexedDB; no service/authenticator/native receipt claim',results},null,2));console.log(JSON.stringify(results));}finally{await browser.close();}})().catch(e=>{console.error(e.stack);process.exitCode=1;});

```
