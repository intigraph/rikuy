// Synthetic Today held-work panel for `just demo` and the browser check.
// Public configuration only: the real readers run over an in-page request, so
// nothing leaves the page. Owners, items and titles are invented.
const view = await import('/today/home-view.mjs');
const {heldReader, heldTitleReader} = await import('/today/held/model.mjs');
const {renderStored} = await import('/today/stored-query.mjs');
const load = async path => (await fetch(path)).json();
const [head, work, control, item] = await Promise.all(['/today/held/head.json', '/today/held/work.json', '/today/asks/control.json', '/today/asks/item.json'].map(load));
const now = Date.now(), observed = Math.floor(now / 1000) - 120;
const reply = (def, rows, params = {}) => ({query: def.name, sparql: renderStored(def, params), rows, count: rows.length, truncated: false});
const agent = (name, revision, state) => ({agent: name, revision, state, contract: 'shantytown-owned-work/v1', generation: 'demo-generation', observed_at: observed, fact: head.onto + 'owned-work-' + revision.toString(16).padStart(64, '0')});
const agents = [agent('demo-worker', 1, 'stopped'), agent('demo-builder', 2, 'ceiling')];
const headBody = {contract: 'shantytown-owned-work-head/v1', source: head.producer, host: head.host, revision: 1, state_revision: 2, complete: true, source_agents: agents.length, agents};
const owner = name => head.principalPrefix + name;
const rows = [
  ['aegis-demo4', 'demo-worker', 1, 'in_progress'],
  ['aegis-demo5', 'demo-worker', 2, 'open'],
  ['aegis-demo6', 'demo-builder', 2, 'blocked'],
  ['aegis-demo7', 'demo-builder', 3, 'in_progress']
].map(([id, who, priority, key]) => ({entity: work.itemPrefix + id, graph: work.graph, key, key_plain: true, multi: false, columns: {assignee: {iri: owner(who)}, priority, updated: '2026-11-27T18:00:00Z'}}));
// Synthetic schema:name values for the per-item title point read. aegis-demo7 has
// none, so the panel shows its title as unavailable with the reason.
const titles = {
  [work.itemPrefix + 'aegis-demo4']: 'Rotate the synthetic signing key',
  [work.itemPrefix + 'aegis-demo5']: 'Document the bounded title read',
  [work.itemPrefix + 'aegis-demo6']: 'Wait for the review receipt'
};
window.demoHeldReads = 0;
window.demoTitleReads = 0;
const request = async (url, {body}) => {
  window.demoHeldReads++;
  if (url.endsWith('/projections')) return {rows: rows.filter(r => body.where.assignee.some(a => a.iri === r.columns.assignee.iri)), truncated: false, multi_valued_rows: 0, tx: 4242};
  if (body.name === item.name) {
    window.demoTitleReads++;
    const seed = body.params.seed, row = {item: seed, id: seed.split('/').at(-1), priority: 1, status: 'open', revision: 1};
    if (titles[seed]) row.title = titles[seed];
    return {query: item.name, sparql: item.template.replaceAll('{seed}', seed), rows: [row], count: 1, truncated: false};
  }
  if (body.name === head.name) return reply(head, [{payload: JSON.stringify(headBody)}]);
  if (body.name === control.name) return reply(control, [{item: 'https://seeds.local/item/aegis-blh.1', revision: 1}]);
  throw Error('Unexpected demo read');
};
const read = heldReader({request, endpoint: location.origin, head, work, control, now: () => now});
const held = await read(null, new AbortController().signal);
view.setHeldTitleReader(heldTitleReader({request, endpoint: location.origin, definition: item}));
const render = () => view.renderHeldView(held, null, now, now, now);
render();
// Re-render as a live refresh would; cached titles must not re-read.
setTimeout(render, 50);
window.demoHeldRendered = true;
