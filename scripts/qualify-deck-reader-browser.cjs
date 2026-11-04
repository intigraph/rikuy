// # arming: agent-invoked synthetic browser qualification; no production traffic.
if (!process.env.PLAYWRIGHT_MODULE) throw Error('Explicit PLAYWRIGHT_MODULE required');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE);
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const results=[];
 try{for(const mode of ['answered','empty','changed-query','missing-receipt','oversized']){
  const context=await browser.newContext(),page=await context.newPage(),errors=[],blocked=[];let calls=0;
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
   const req=route.request(),url=new URL(req.url());
   if(url.origin==='https://sign.example.test'){
    if(url.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<main></main>'});return;}
    if(/^\/(web\/deck\/[a-z-]+|tests\/deck-fixture)\.mjs$/.test(url.pathname)){await route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,url.pathname))});return;}
   }
   if(url.origin==='https://reader.example.test'&&['/graphs','/ask','/attest/receipt'].includes(url.pathname)){
    const headers={'access-control-allow-origin':'https://sign.example.test','access-control-allow-headers':'content-type,x-quipu-client','access-control-allow-methods':'GET,POST,OPTIONS'};
    if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    calls++;
    const value=await page.evaluate(async ({path,graph,body,mode})=>{
     const f=await import('/tests/deck-fixture.mjs'),m=await import('/web/deck/model.mjs'),r=await import('/web/deck/reader.mjs');
     const definitions=r.readerDefinitions(f.boundary,r.NATIVE_PROVENANCE_NS),e=await f.evidence();
     if(path==='/graphs')return{count:1,graphs:[{iri:graph,g:1,class:'committed',creation:{actor:'fixture-curator',timestamp:'2026-10-25T00:00:00Z'}}]};
     if(path==='/attest/receipt')return mode==='missing-receipt'?{found:false}:e.response;
     const role=Object.keys(definitions).find(k=>definitions[k].name===body.name),def=definitions[role];
     const rows={request:[{revision:f.ask.revision,revisionIri:m.revisionIri(f.ask),manifest:m.requestPublication(f.ask,f.boundary).datums[1].o.value}],item:[{revision:f.ask.itemRevision,status:f.boundary.openStatus}],answers:mode==='empty'?[]:[{subject:e.row.subject,receiptIri:e.row.receiptIri,manifest:e.row.manifest}],facts:e.readback.datums.map(d=>({s:d.s,p:d.p,kind:d.o.kind,value:String(d.o.value)})),links:e.readback.attestedBy.map(({s})=>({s}))}[role];
     return{query:def.name,sparql:r.renderReaderQuery(def,body.params)+(mode==='changed-query'&&role==='answers'?' ':''),rows,count:rows.length,truncated:false};
    },{path:url.pathname,graph:url.searchParams.get('graph'),body:req.method()==='POST'?req.postDataJSON():null,mode});
    await route.fulfill({headers,contentType:'application/json',body:mode==='oversized'?' '.repeat(262145):JSON.stringify(value)});return;
   }
   blocked.push(url.href);await route.abort();
  });
  await page.goto('https://sign.example.test/');
  await page.evaluate(async()=>{
   const f=await import('/tests/deck-fixture.mjs'),r=await import('/web/deck/reader.mjs'),v=await import('/web/deck/value.mjs'),{mount}=await import('/web/deck/view.mjs');
   const definitions=r.readerDefinitions(f.boundary,r.NATIVE_PROVENANCE_NS),queryHashes=Object.fromEntries(await Promise.all(Object.entries(definitions).map(async([k,d])=>[k,await v.sha256(v.utf8(JSON.stringify(d)))])));
   const reader=new r.DeckReader({endpoint:'https://reader.example.test/',boundary:f.boundary,operator:f.who,provenanceNamespace:r.NATIVE_PROVENANCE_NS,queryHashes,registrations:[f.boundary.requestGraph,f.boundary.answerGraph,f.boundary.itemGraph].map(iri=>({iri,creation:{actor:'fixture-curator',timestamp:'2026-10-25T00:00:00Z'}})),request:r.readerTransport('https://reader.example.test/')});
   await mount(document.querySelector('main'),{enabled:true,boundary:f.boundary,identity:f.who,read:()=>reader.read(f.ask.id),writer:{identity:f.who,store:{get:async()=>null}},now:()=>1900000000});
  });
  const status=await page.locator('[role=status]').textContent();
  assert(mode==='answered'?status.startsWith('Answered'):mode==='empty'?status.startsWith('Current request'):status.startsWith('UNKNOWN'),status);
  if(!['answered','empty'].includes(mode))assert.equal(await page.locator('button').count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);assert(calls>0&&calls<=13);
  results.push({mode,status,synthetic_http_calls:calls,page_errors:errors,unhandled_routes:blocked});await context.close();
 }}finally{await browser.close();}
 console.log(JSON.stringify({scope:'Actual browser Fetch/CORS, streamed body limits and Deck DOM; all responses intercepted synthetic fixtures, no native or human proof',results},null,2));
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
