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
    if(name==='/today/demo-held/'||name==='/demo-today-held.mjs'){res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':'text/html');res.end(await readFile(resolve('scripts',name.endsWith('.mjs')?'demo-today-held.mjs':'demo-today-held.html')));return;}
    if(name==='/today/demo-asks/'||name==='/demo-today-asks.mjs'){res.setHeader('Content-Type',name.endsWith('.mjs')?'text/javascript':'text/html');res.end(await readFile(resolve('scripts',name.endsWith('.mjs')?'demo-today-asks.mjs':'demo-today-asks.html')));return;}
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
async function demoDecisionCards(){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),failures=[],live=[];
  page.on('pageerror',e=>failures.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){live.push(u.href);return route.abort();}return route.continue();});
  try{
    await page.goto(origin+'/today/demo-asks/');
    await page.waitForFunction(()=>window.demoAsksRendered&&document.querySelectorAll('.ask-decide .recommended').length===3);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>window.demoChoiceReads),3,'one point read per card; a re-render reuses the seed@revision cache');
    const cards=await page.locator('.ask').evaluateAll(nodes=>nodes.map(card=>({
      id:card.dataset.item,choose:card.querySelectorAll('.ask-decide [data-action=choose]').length,
      controls:card.querySelectorAll('.ask-decide button').length,enabled:card.querySelectorAll('.ask-decide button:not(:disabled)').length,
      rec:[...card.querySelectorAll('.ask-decide .recommended')].map(b=>b.dataset.choice),reason:card.querySelector('.ask-decide .decision-status')?.textContent,
      fields:Object.fromEntries([...card.querySelectorAll(':scope > .ask-meta [data-field]')].map(n=>[n.dataset.field,n.checkVisibility()?n.textContent:''])),
      record:card.querySelector(':scope > .ask-meta .record-link')?.checkVisibility(),hiddenMeta:card.querySelectorAll('details .meta').length,
      decideBeforeDetails:!!card.querySelector(':scope > .ask-decide ~ details')})));
    assert.equal(cards.length,3);
    for(const card of cards){
      assert.ok(card.choose>=2,card.id+' has at least two choices');assert.equal(card.rec.length,1,card.id+' marks exactly one REC');
      assert.equal(card.enabled,0,card.id+' choices are disabled under the public config');
      assert.match(card.reason,/^Signing not admitted on this deployment/);
      assert.match(card.fields.priority,/^P[0-4]$/,card.id+' shows priority on the card');assert.match(card.fields.age,/^age \d+ (days?|h)$/,card.id+' shows age');
      assert.ok(card.fields.owner,card.id+' shows owner');assert.equal(card.record,true,card.id+' Open record sits on the metadata line');
      assert.equal(card.hiddenMeta,0,card.id+' metadata is not behind the disclosure');assert.ok(card.decideBeforeDetails,card.id+' choices render inline before the disclosure');
    }
    assert.equal(cards[0].fields.owner,'demo-owner');assert.equal(cards[0].fields.priority,'P0');
    assert.match(await page.locator('#ask-order').textContent(),/^Order: priority first \(P0 highest\), then oldest first\./,'ordering rule stated in the panel header');
    assert.deepEqual(cards.map(c=>c.rec[0]),['choose-1-verify-the-source','choose-2-after-review','choose-1-yes']);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll at phone width');
    // Runner and phone fonts are wider than ours; widen every glyph without depending on which fonts are installed.
    const wide=await page.addStyleTag({content:'html{font-size:125%!important}*{letter-spacing:.08em!important}'});await page.waitForTimeout(60);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll at phone width with wider text');
    await wide.evaluate(n=>n.remove());
    const overview=await page.evaluate(()=>{const [work,deploys]=document.querySelectorAll('#overview-panels>.brief-panel');return {count:work.querySelector('.brief-count').textContent,rows:[...work.querySelectorAll('.brief-priorities li')].map(li=>({meta:li.querySelector('.meta').textContent,open:li.querySelectorAll('.record-link').length})),rest:work.querySelector('.brief-rest')?.textContent,applied:Number(deploys.querySelector('.applied').textContent.split(' ')[0]),lines:[...deploys.querySelectorAll('li')].map(li=>li.textContent)};});
    assert.equal(overview.count,`Showing ${overview.rows.length} of 7 active P0 items`,'the count states what the panel shows');
    assert.equal(overview.rest,'All 7 in Next →');
    for(const row of overview.rows){assert.match(row.meta,/^\S+ · \S+ · /,'each P0 row names its id and owner');assert.equal(row.open,1,'each P0 row opens its record');}
    assert.equal(overview.lines.reduce((n,l)=>n+Number(/(\d+) applied/.exec(l)?.[1]||0),0),overview.applied,'the deploy breakdown sums to the headline');
    assert.match(overview.lines.at(-1),/^\d+ other services? — /);
    assert.deepEqual(failures,[]);assert.deepEqual(live,[]);
    console.log(`PASS demo decision cards: ${cards.length} cards, ${cards.reduce((n,c)=>n+c.controls,0)} decision controls (${cards.map(c=>c.choose).join('/')} choices + Later + Comment), REC marked once each, all disabled with the stated reason`);
  }finally{await context.close();}
}
async function demoHeldTitles(){
  const context=await browser.newContext({viewport:{width:412,height:915}}),page=await context.newPage(),failures=[],live=[];
  page.on('pageerror',e=>failures.push(e.message));
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){live.push(u.href);return route.abort();}return route.continue();});
  // Settled once no row is still unstarted ("title not loaded") or in flight.
  const settled=()=>page.waitForFunction(()=>![...document.querySelectorAll('.held-title')].some(n=>n.textContent==='title loading…'||n.textContent==='title not loaded'));
  const titles=()=>page.locator('.held-title').allTextContents();
  try{
    await page.goto(origin+'/today/demo-held/');
    await page.waitForFunction(()=>window.demoHeldRendered);
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>document.querySelector('#held-work details.held-owners').open),false);
    assert.equal(await page.evaluate(()=>window.demoTitleReads),0,'a collapsed holder group makes no title reads');
    await page.locator('#held-work details.held-owners > summary').click();
    await settled();
    let shown=await titles();
    assert.equal(shown.length,13);assert.equal(await page.evaluate(()=>window.demoTitleReads),13,'opening the group reads each visible row once');
    assert.equal(shown.filter(t=>t.startsWith('title unavailable')).length,1,shown.join(' / '));assert.equal(shown.at(-1),'title unavailable: the source record has no title');
    assert.ok(shown.slice(0,-1).every(t=>/^[A-Z][a-z]+ the /.test(t)),'every other row shows its real title');
    await page.evaluate(()=>window.demoHeldRender());await settled();
    assert.equal(await page.evaluate(()=>document.querySelector('#held-work details.held-owners').open),true,'a refresh keeps the group open');
    assert.deepEqual(await titles(),shown);assert.equal(await page.evaluate(()=>window.demoTitleReads),13,'a refresh reuses the item@modified cache');
    assert.equal((await page.content()).includes('Open source record for title'),false,'no placeholder title');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no horizontal scroll at phone width');
    await page.goto(origin+'/today/demo-held/?cap=8');
    await page.waitForFunction(()=>window.demoHeldRendered);
    await page.locator('#held-work details.held-owners > summary').click();await settled();
    shown=await titles();
    assert.equal(await page.evaluate(()=>window.demoTitleReads),8,'the per-page cap bounds title reads');
    assert.equal(shown.filter(t=>t==='title not loaded (open to load)').length,5,'rows past the cap say the title is not loaded');
    assert.deepEqual(failures,[]);assert.deepEqual(live,[]);
    console.log('PASS demo held titles: collapsed group 0 reads; opened 13 reads, 12 real titles, 1 unavailable with its reason; refresh 0 new reads; cap 8 leaves 5 not loaded; no placeholder');
  }finally{await context.close();}
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
async function demoHeldWork(){
  for(const viewport of [{width:1440,height:900},{width:412,height:915}]){
    const context=await browser.newContext({viewport}),page=await context.newPage(),failures=[],live=[];
    page.on('pageerror',e=>failures.push(e.message));
    await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==origin){live.push(u.href);return route.abort();}return route.continue();});
    try{
      await page.goto(origin+'/today/demo-held/');
      await page.waitForFunction(()=>window.demoHeldRendered);
      const held=await page.evaluate(()=>({cards:document.querySelectorAll('#held-work article').length,outside:document.querySelectorAll('#held-work > article').length,open:document.querySelector('#held-work details.held-owners')?.open,quiet:[...document.querySelectorAll('#held-work .held-quiet')].map(n=>n.textContent),empty:document.body.textContent.includes('No owned work within this bounded selection'),height:document.documentElement.scrollHeight}));
      assert.equal(held.cards,9,'only the nine owners holding work get a card');
      assert.equal(held.outside,0,'more than five holders render inside a collapsed group');
      assert.equal(held.open,false,'the holder group is collapsed by default');
      assert.deepEqual(held.quiet,['89 other owners show no owned work in the verified board read (86 ephemeral job identities).']);
      assert.equal(held.empty,false,'no per-owner empty cards');
      assert.ok(held.height<=viewport.height+200,`collapsed panel stays short (${held.height}px)`);
      await page.goto(origin+'/today/');
      await page.waitForFunction(()=>document.querySelector('#connection')?.textContent.includes('Live readers await deployment admission'));
      const top=await page.evaluate(()=>document.getElementById('h-held').closest('section').getBoundingClientRect().top);
      assert.ok(top>viewport.height,`held work sits below the fold (${top}px)`);
      assert.deepEqual(failures,[]);assert.deepEqual(live,[]);
    }finally{await context.close();}
  }
}
try {
  browser=await chromium.launch({headless:process.env.RIKUY_BROWSER_HEADED!=='1',...(process.env.RIKUY_BROWSER_EXECUTABLE?{executablePath:process.env.RIKUY_BROWSER_EXECUTABLE}:{})});
  await loadToday();
  await explicitAskRecord();
  await demoDecisionCards();
  await demoHeldWork();
  console.log('PASS synthetic held work: only holders render, collapsed past five, below the fold at 1440 and 412');
  await demoHeldTitles();
  console.log('PASS explicit Ask metadata, readable record and keyboard graph navigation; zero nonlocal requests');
  console.log('PASS built Today module graph, disabled-reader startup and tab transition');
  await assert.rejects(loadToday({breakDependency:true}),/Timeout|built module imports/);
  console.log('PASS missing model dependency is detected despite fallback HTML');
} finally {
  if(browser)await browser.close();
  await new Promise(r=>server.close(r));
}
