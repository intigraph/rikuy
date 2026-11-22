// # arming: ci synthetic Deck settlement integration; every request intercepted.
import {chromium} from 'playwright';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../', import.meta.url));
const browser = await chromium.launch({executablePath: process.env.RIKUY_BROWSER_EXECUTABLE || undefined,
  headless: process.env.RIKUY_BROWSER_HEADED !== '1', args: ['--no-sandbox', '--disable-dev-shm-usage']});
try {
  for (const mode of ['accepted', 'lost-response', 'disabled', 'today-card', 'mismatched-card']) {
    const context = await browser.newContext(process.env.RIKUY_SETTLEMENT_DEMO_DIR && mode === 'accepted' ? {viewport: {width: 1280, height: 720}, recordVideo: {dir: process.env.RIKUY_SETTLEMENT_DEMO_DIR, size: {width: 1280, height: 720}}} : {}), page = await context.newPage(), errors = [], blocked = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/*', async route => {
      const u = new URL(route.request().url());
      if (u.origin === 'https://sign.example.test') {
        if (u.pathname === '/') return route.fulfill({contentType: 'text/html', body: '<main></main>'});
        if (/^\/(web\/deck\/[a-z-]+|tests\/deck-fixture|web\/today\/ask-decisions|web\/today\/knowledge\/model)\.mjs$/.test(u.pathname)) return route.fulfill({contentType: 'text/javascript', body: await readFile(root + u.pathname)});
      }
      blocked.push(u.href); await route.abort();
    });
    await page.goto('https://sign.example.test/');
    await page.evaluate(async mode => {
      const f = await import('/tests/deck-fixture.mjs'), m = await import('/web/deck/model.mjs'), {mount} = await import('/web/deck/view.mjs');
      const today = mode === 'today-card' || mode === 'mismatched-card';
      const boundary = today ? {...f.boundary, itemPrefix: 'https://seeds.local/item/', itemGraph: 'https://seeds.local/project/aegis'} : f.boundary;
      const ask = {...f.ask, ...(today ? {seed: boundary.itemPrefix + 'aegis-fixture'} : {}), settlement: {target: boundary.itemPrefix + 'aegis-linked', targetRevision: 12}};
      let evidence, pending = null, result, closed = false;
      window.calls = {send: 0, read: 0, sign: 0};
      const native = {
        settle: async b => {window.calls.send++; closed = true; result = {...b, askRevision: 8, targetRevision: 13, commentIndex: 1, complete: true}; if (mode === 'lost-response') throw Error('lost response'); return result;},
        reconcile: async () => {window.calls.read++; if (!result) throw Error('unproven'); return result;}
      };
      const writer = {identity: f.who, store: {get: async () => pending},
        submit: async p => {window.calls.sign++; pending = {state: 'SENT'}; evidence = await f.evidence(p); return {state: 'ACCEPTED', proposal: p, proof: {receiptIri: evidence.row.receiptIri}};},
        reconcile: async () => ({state: 'ACCEPTED', proposal: JSON.parse(evidence.row.manifest), proof: {receiptIri: evidence.row.receiptIri}}),
        acknowledge: async () => {pending = null;}
      };
      const deps = {enabled: true, boundary, identity: f.who, writer,
        nativeSettlement: mode === 'disabled' ? undefined : native, now: () => 1900000000,
        read: async () => ({complete: true, requestRow: {graph: boundary.requestGraph, requestId: ask.id, currentRevision: ask.revision, revisionIri: m.revisionIri(ask), manifest: m.requestPublication(ask, boundary).datums[1].o.value, complete: true},
          freshItem: {...f.freshItem, graph: boundary.itemGraph, seed: ask.seed, ...(closed ? {revision: 8, status: 'urn:closed'} : {})},
          freshTarget: {graph: boundary.itemGraph, seed: ask.settlement.target, revision: closed ? 13 : 12},
          rows: evidence ? [{row: evidence.row, receipt: evidence.response}] : []})};
      if (today) {
        const {mountAskDecision} = await import('/web/today/ask-decisions.mjs');
        const row = {kind: 'ask', item: ask.seed, revision: ask.itemRevision, unblocks: ask.settlement.target, expires: new Date(ask.expiresAt * 1000).toISOString()};
        if (mode === 'mismatched-card') row.unblocks = boundary.itemPrefix + 'aegis-other';
        try {await mountAskDecision(document.querySelector('main'), row, async () => deps);}
        catch (e) {if (mode !== 'mismatched-card') throw e; document.querySelector('main').textContent = 'Mismatched card refused';}
      } else await mount(document.querySelector('main'), deps);
    }, mode);
    if (mode === 'mismatched-card') {
      assert.equal(await page.locator('button').count(), 0);
      assert.deepEqual(await page.evaluate(() => window.calls), {send: 0, read: 0, sign: 0});
      assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
      console.log('PASS mismatched Today card: no signing controls or writes');
      await context.close(); continue;
    }
    if (process.env.RIKUY_SETTLEMENT_DEMO_DIR && mode === 'accepted') await page.waitForTimeout(1000);
    await page.getByRole('button', {name: 'Yes', exact: true}).click();
    if (mode === 'lost-response') {
      await page.getByRole('status').filter({hasText: 'UNKNOWN'}).waitFor();
      await page.getByRole('button', {name: 'Recover receipt'}).click();
    }
    if (mode === 'disabled') {
      await page.getByRole('status').filter({hasText: 'UNKNOWN'}).waitFor();
      assert.deepEqual(await page.evaluate(() => window.calls), {send: 0, read: 0, sign: 0});
    } else {
      await page.getByRole('status').filter({hasText: 'Ask closed'}).waitFor();
      assert.equal((await page.evaluate(() => window.calls)).send, 1);
      assert.equal((await page.evaluate(() => window.calls)).sign, 1);
      if (mode === 'lost-response') assert.equal((await page.evaluate(() => window.calls)).read, 1);
      await page.getByRole('button', {name: 'Check linked ruling'}).click();
      await page.getByRole('status').filter({hasText: 'Ask closed'}).waitFor();
      assert.equal((await page.evaluate(() => window.calls)).send, 1);
      await page.waitForFunction(() => document.querySelector('main').getAttribute('aria-busy') === 'false');
      assert.equal(await page.getByRole('button', {name: 'Check linked ruling'}).isEnabled(), true);
    }
    if (process.env.RIKUY_SETTLEMENT_DEMO_DIR && mode === 'accepted') {await page.screenshot({path: process.env.RIKUY_SETTLEMENT_DEMO_DIR + '/after.png'}); await page.waitForTimeout(1200);}
    assert.deepEqual(errors, []); assert.deepEqual(blocked, []);
    console.log(`PASS ${mode}: synthetic admitted answer + native port; no external requests, no automatic resend`);
    await context.close();
  }
} finally {await browser.close();}
