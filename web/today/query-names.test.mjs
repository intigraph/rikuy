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
