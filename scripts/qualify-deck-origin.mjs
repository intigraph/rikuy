// # arming: agent-invoked, SHA-pinned loopback listener with a disposable store.
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';

const binary = process.env.QUIPU_SERVER, digest = process.env.QUIPU_SERVER_SHA256;
const sourceSha = process.env.QUIPU_SOURCE_SHA;
assert(/^[a-f0-9]{40}$/.test(sourceSha ?? ''), 'Explicit source SHA required');
const trusted = new URL(process.env.DECK_TRUSTED_ORIGIN);
assert(trusted.protocol === 'https:' && trusted.href === trusted.origin + '/' && !trusted.username && !trusted.password, 'Explicit HTTPS origin required');
assert(binary && isAbsolute(binary) && /^[a-f0-9]{64}$/.test(digest ?? ''), 'Explicit native binary and digest required');
assert.equal(createHash('sha256').update(await readFile(binary)).digest('hex'), digest);
const root = await mkdtemp(join(tmpdir(), 'rikuy-origin-native-'));
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
await mkdir(join(root, '.bobbin')); await mkdir(join(root, 'home'));
await writeFile(join(root, '.bobbin/config.toml'), `[quipu.server]\nauth_token = "synthetic-loopback-only"\ncors_allowed_origins = [${JSON.stringify(trusted.origin)}]\nread_pool_size = 2\nread_processes = 0\nreserve_point_reads = false\nmemory_budget_mib = 256\n[quipu.embedding]\nauto_embed = false\n`, {mode: 0o600});
const child = spawn(binary, ['--db', join(root, 'fixture.db'), '--bind', `127.0.0.1:${port}`], {cwd: root, env: {HOME: join(root, 'home'), PATH: '/usr/bin:/bin', LANG: 'C.UTF-8'}, stdio: ['ignore', 'pipe', 'pipe']});
let logs = '', ended = false;
const exit = once(child, 'exit').then(() => {ended = true;});
child.stdout.on('data', value => {logs = (logs + value).slice(-16384);});
child.stderr.on('data', value => {logs = (logs + value).slice(-16384);});
const timer = setTimeout(() => child.kill('SIGKILL'), 60000); timer.unref();
const endpoint = `http://127.0.0.1:${port}`;
const request = (path, options = {}) => fetch(endpoint + path, {...options, redirect: 'error', signal: AbortSignal.timeout(2000)});
try {
  let ready = false;
  for (let n = 0; n < 100; n++) {
    assert(!ended, logs);
    try {if ((await request('/health')).ok) {ready = true; break;}} catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Native listener did not become ready');
  const version = await (await request('/version')).json();
  assert.equal(version.git_sha, sourceSha, 'Native build source stamp mismatch');
  assert.equal(version.git_dirty, false, 'Clean pinned native build required');
  const cases = [];
  for (const path of ['/ask', '/attest/challenge']) {
    for (const [name, origin, allowed] of [['trusted', trusted.origin, true], ['foreign', 'https://foreign.invalid', false], ['null-origin', 'null', false]]) {
      const response = await request(path, {method: 'OPTIONS', headers: {origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,x-quipu-client,x-quipu-task'}});
      assert.equal(response.headers.get('access-control-allow-origin'), allowed ? trusted.origin : null);
      assert.equal(response.headers.get('access-control-allow-credentials'), null);
      const headers = response.headers.get('access-control-allow-headers').split(',');
      assert(headers.includes('x-quipu-client') && headers.includes('x-quipu-task') && !headers.includes('*') && !headers.includes('x-unapproved-header'));
      cases.push({path, case: name, browser_origin_admitted: allowed});
      await response.arrayBuffer();
    }
  }
  for (const [name, origin, allowed] of [['trusted', trusted.origin, true], ['foreign', 'https://foreign.invalid', false]]) {
    const response = await request('/health', {headers: {origin}});
    assert(response.ok); // CORS controls browser exposure, not network access.
    assert.equal(response.headers.get('access-control-allow-origin'), allowed ? trusted.origin : null);
    cases.push({path: '/health', case: name, http_status: response.status, browser_origin_admitted: allowed});
    await response.arrayBuffer();
  }
  console.log(JSON.stringify({target: 'disposable native loopback listener', binary_sha256: digest, version, cases, production_mutations: 0, enrollment: false, runtimeAuthorized: false}, null, 2));
} finally {
  clearTimeout(timer); if (!ended) child.kill('SIGTERM');
  const kill = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exit; clearTimeout(kill); await rm(root, {recursive: true, force: true});
}
