import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Every Today panel boots with boot('<panel>',[<json paths>],([<names>])=>...)
// and pins each loaded manifest with expect(<name>,'<stored query name>').
// A pinned name that differs from the file's "name" makes the panel refuse to
// start once readers are on, so the pins must track the files exactly.
const dir = new URL('./', import.meta.url);
const source = readFileSync(new URL('home.mjs', dir), 'utf8');

function pins() {
  const out = [];
  const boots = [...source.matchAll(/boot\('([^']+)',\[([^\]]*)\],(?:async)?\s*\(\[([^\]]*)\]\)=>/g)];
  assert.ok(boots.length > 0, 'no boot() calls found in home.mjs');
  boots.forEach((m, i) => {
    const [, panel, pathList, paramList] = m;
    const paths = [...pathList.matchAll(/'([^']+)'/g)].map(p => p[1]);
    const params = paramList.split(',').map(s => s.trim()).filter(Boolean);
    const end = i + 1 < boots.length ? boots[i + 1].index : source.length;
    const body = source.slice(m.index + m[0].length, end);
    for (const [, param, name] of body.matchAll(/expect\((\w+),'([^']+)'\)/g)) {
      const at = params.indexOf(param);
      assert.ok(at >= 0 && paths[at], `${panel}: expect(${param}) has no loaded manifest`);
      out.push({panel, path: paths[at], name});
    }
  });
  return out;
}

test('every expect() name in home.mjs matches the manifest file it pins', () => {
  const found = pins();
  for (const panel of ['asks', 'later', 'priorities', 'deploys', 'deferred', 'held'])
    assert.ok(found.some(p => p.panel === panel), `no pinned manifest found for ${panel}`);
  for (const file of ['./asks/query.json', './asks/titles.json', './asks/item.json'])
    assert.ok(found.some(p => p.path === file), `${file} is not pinned`);
  const mismatches = found.filter(({path, name}) => JSON.parse(readFileSync(new URL(path, dir), 'utf8')).name !== name)
    .map(({panel, path, name}) => `${panel}: ${path} expected ${name}, file declares ${JSON.parse(readFileSync(new URL(path, dir), 'utf8')).name}`);
  assert.deepEqual(mismatches, []);
});

// The per-seed OPTIONS/REC point read moved to item_v2 (status OPTIONAL+BOUND).
// item_v1 stays registered for rollback, so a stale pin would still boot against
// the slow template; this pins the bump on both sides.
test('the Asks item read is pinned to daily_brief_ask_item_v2 and the file agrees', () => {
  const item = pins().filter(p => p.path === './asks/item.json');
  // Needs-you reads OPTIONS/REC and held work reads titles through the same pin.
  assert.deepEqual(item.map(p => [p.panel, p.name]), [['asks', 'daily_brief_ask_item_v2'], ['held', 'daily_brief_ask_item_v2']]);
  assert.equal(JSON.parse(readFileSync(new URL('./asks/item.json', dir), 'utf8')).name, 'daily_brief_ask_item_v2');
});
