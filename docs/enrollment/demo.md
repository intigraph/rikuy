# Ceremony source demonstration

The shipped page is disabled and creates no credential. In this synthetic
configured fixture, an explicit click creates one virtual WebAuthn credential
and displays its public packet and fingerprint, with **Not enrolled** visible.
The exported packet also passes the clean candidate Quipu signer CLI at commit
`2ad619f2df76b51753011583f0d4c2c7fb59d84c` in a disposable store; its fingerprint
matches and its switch remains off.

[Download the real WebM recording](ceremony.webm), or view the
[static final-state screenshot](ceremony.png). Playback requires a WebM-capable
player; inline playback is not assumed. The small recording is retained in
this source folder, without an external artifact host. It shows the candidate
working tree over Rikuy base `de8c7fdc6fe65a91e9cbdf78f29891aaa025b578`;
no production configuration or real device was involved. Neither the video nor
the public packet proves human identity or installed acceptance.

Six actual browser controls pass: source-disabled, wrong-origin, configured
success, backup-eligible refusal, cancellation and unsupported WebAuthn. The
first two and last two create zero credentials. The successful authenticator
reports flags 69; the backup-eligible control reports 77 and exports nothing.
All asset requests are intercepted locally, with zero nonlocal traffic.
Three source mutations (ignore enabled, ignore backup flag, shift fingerprint)
fail their unit controls; restored source passes the full suite.

## Repeat the browser fixture

Use Node22, Playwright1.58.2 with its video recorder dependency, Chrome and an
isolated display. Set `PLAYWRIGHT_MODULE` to the installed module if it is not
on Node's search path. Point `JJY_FIXTURE_CLI` at the candidate signer executable.
Copy the following block to `/tmp/playwright-test-ceremony.cjs`, then run it
from the repository root under a private HOME. `JJY_EVIDENCE` selects an owned
temporary output directory. The script never requests or exports private keys.

```javascript
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{execFileSync}=require('child_process');
const ROOT=process.env.JJY_SOURCE||process.cwd();
const ORIGIN=process.env.JJY_FIXTURE_ORIGIN||'https://enroll.example.test';
const OUT=process.env.JJY_EVIDENCE||fs.mkdtempSync(path.join(require('os').tmpdir(),'rikuy-ceremony-'));
const CLI=process.env.JJY_FIXTURE_CLI;
(async()=>{
 fs.mkdirSync(OUT,{recursive:true,mode:0o700});
 const browser=await chromium.launch({headless:false,executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox','--disable-dev-shm-usage']});
 const results=[];
 try{
  for(const scenario of ['disabled','wrong-origin','enabled','backup-eligible','cancelled','unsupported']){
   const context=await browser.newContext({viewport:{width:980,height:900},...(scenario==='enabled'?{recordVideo:{dir:path.join(OUT,'video'),size:{width:980,height:900}}}:{})}),blocked=[],errors=[];
   try{
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await context.route('**/*',async route=>{
     const url=new URL(route.request().url());
     if(url.origin!==ORIGIN){blocked.push(url.origin);await route.abort();return;}
     let file=decodeURIComponent(url.pathname).replace(/^\/enroll\//,'');if(file===''||file==='index.html')file='index.html';
     if(!['index.html','app.mjs','model.mjs','cose.mjs','config.mjs','style.css'].includes(file)){blocked.push(url.pathname);await route.abort();return;}
     let body=fs.readFileSync(path.join(ROOT,'web/enroll',file),'utf8');
     if(file==='config.mjs'&&scenario!=='disabled')body=`export const config=Object.freeze({enabled:true,origin:${JSON.stringify(scenario==='wrong-origin'?'https://other.example.test':ORIGIN)},rpId:'enroll.example.test'});`;
     await route.fulfill({status:200,body,contentType:file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
    });
    const cdp=await context.newCDPSession(page);let creations=0;cdp.on('WebAuthn.credentialAdded',()=>{creations++;});await cdp.send('WebAuthn.enable');
    const {authenticatorId}=await cdp.send('WebAuthn.addVirtualAuthenticator',{options:{protocol:'ctap2',transport:'internal',hasResidentKey:true,hasUserVerification:true,isUserVerified:true,automaticPresenceSimulation:true,defaultBackupEligibility:scenario==='backup-eligible',defaultBackupState:false}});
    await page.addInitScript(()=>{if(navigator.credentials?.create){const original=navigator.credentials.create.bind(navigator.credentials);Object.defineProperty(navigator.credentials,'create',{value:async options=>{const credential=await original(options);globalThis.__fixtureAuthFlags=new Uint8Array(credential.response.getAuthenticatorData())[32];return credential;}});}});
    if(scenario==='unsupported')await page.addInitScript(()=>Object.defineProperty(navigator,'credentials',{value:{}}));
    if(scenario==='cancelled')await page.addInitScript(()=>Object.defineProperty(navigator,'credentials',{value:{create:async()=>{throw new DOMException('cancelled','NotAllowedError');}}}));
    await page.goto(ORIGIN+'/enroll/index.html');await page.waitForFunction(()=>document.querySelector('[role=status]').textContent.includes('origin')||document.querySelector('[role=status]').textContent.includes('unavailable')||!document.querySelector('button').disabled);
    const button=page.getByRole('button',{name:'Create signing credential'});
    if(['disabled','wrong-origin','unsupported'].includes(scenario)){
     assert.equal(await button.isDisabled(),true);assert.equal(await page.locator('textarea').inputValue(),'');
    }else{
     if(scenario==='enabled')await page.waitForTimeout(1000);
     await button.click();await page.waitForFunction(()=>!document.querySelector('button').disabled,{timeout:10000});
     if(scenario==='enabled'){
      const packet=JSON.parse(await page.locator('textarea').inputValue());assert.equal(packet.backup_eligible,false);assert.equal(packet.scheme,'webauthn-es256');assert.match(await page.locator('[role=status]').innerText(),/Not enrolled/);
      const fixture=fs.mkdtempSync(path.join(OUT,'native-'));const db=path.join(fixture,'fixture.db');const env={...process.env,HOME:fixture};
      const response=execFileSync(CLI,['signer','enroll','--credential-id',packet.credential_id,'--cose-key',packet.cose_key,'--scheme',packet.scheme,'--origin',packet.origin,'--rp-id',packet.rp_id,'--actor','fixture-operator','--graph','https://example.test/answers','--expires-at',String(Math.floor(Date.now()/1000)+86400),'--db',db],{encoding:'utf8',env});
      assert.ok(response.includes(packet.fingerprint));const status=JSON.parse(execFileSync(CLI,['signer','status','--db',db],{encoding:'utf8',env}));assert.equal(status.enabled,false);assert.equal(status.signers.length,1);assert.equal(status.signers[0].fingerprint,packet.fingerprint);assert.equal(status.signers[0].id,packet.credential_id);
      fs.writeFileSync(path.join(OUT,'browser-public-fixture.json'),JSON.stringify(packet,null,2));await page.bringToFront();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(OUT,'enabled.png'),fullPage:true});fs.rmSync(fixture,{recursive:true});await page.waitForTimeout(3000);
     }else{
      assert.equal(await page.locator('textarea').inputValue(),'');assert.match(await page.locator('[role=status]').innerText(),/not registered/);
     }
    }
    const flags=await page.evaluate(()=>globalThis.__fixtureAuthFlags??null);if(scenario==='enabled')assert.equal(flags&0x18,0);if(scenario==='backup-eligible')assert.equal(flags&0x08,0x08);assert.equal(creations,['enabled','backup-eligible'].includes(scenario)?1:0);assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);results.push({scenario,pass:true,credential_creations:creations,authenticator_flags:flags,nonlocal_network_requests:blocked.length,page_errors:errors});
    await cdp.send('WebAuthn.removeVirtualAuthenticator',{authenticatorId});
   }finally{await context.close();}
  }
  fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({source_kind:'uncommitted local source over de8c7fd; synthetic secure-origin routes; virtual authenticator, no human/private key export or production request',results},null,2));console.log(JSON.stringify(results));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
```
