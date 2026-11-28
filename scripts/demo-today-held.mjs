// Synthetic "Work held by stopped agents" panel for `just demo` and the browser check.
// The real lifecycle and board decoders run over in-page synthetic replies:
// no reader, endpoint or network request. Names, items and titles are invented.
// Titles come through the real heldTitleReader over an in-page request; ?cap=N
// lowers its per-page read cap so the browser check can show the cap.
const view = await import('/today/home-view.mjs');
const {decodeHead, decodeWork, heldTitleReader, HELD_TITLE_READS} = await import('/today/held/model.mjs');
const {renderStored} = await import('/today/stored-query.mjs');
const head = await (await fetch('/today/held/head.json')).json();
const work = await (await fetch('/today/held/work.json')).json();
const item = await (await fetch('/today/asks/item.json')).json();
const now = Date.now(), hex = n => n.toString(16).padStart(64, '0');
// A crew the size of a busy day: long-lived workers plus many finished one-shot jobs.
const names = ['ada', 'basil', 'cora', 'dmitri', 'elena', 'farid', 'greta', 'hugo', 'ines', 'jonas', 'kemal'];
for (let i = 0; i < 87; i++) names.push(`eph-${['merge', 'review', 'task'][i % 3]}-${(0x1000 + i * 37).toString(16)}`);
const agents = names.map((agent, i) => ({contract: 'shantytown-owned-work/v1', agent, revision: i + 1, generation: 'generation-1', state: i % 9 === 4 ? 'ceiling' : 'stopped', observed_at: now / 1000 - (i < 3 ? 2400 : 120), fact: head.onto + 'owned-work-' + hex(i + 1)}));
const payload = {contract: 'shantytown-owned-work-head/v1', source: head.producer, host: head.host, revision: 1, state_revision: agents.length, complete: true, source_agents: agents.length, agents};
const decoded = decodeHead({query: head.name, sparql: renderStored(head, {}), rows: [{payload: JSON.stringify(payload)}], count: 1, truncated: false}, head, now);
// Eight long-lived owners and one finished job still hold board work.
const holders = [...names.slice(0, 8), names[20]], owners = decoded.states.map(s => s.owner);
const rows = holders.flatMap((agent, i) => Array.from({length: 1 + (i % 2)}, (_, k) => ({entity: work.itemPrefix + `aegis-demoh${i}${k}`, graph: work.graph, multi: false, key_plain: true, key: work.key_in[(i + k) % 4], columns: {assignee: {iri: head.principalPrefix + agent}, priority: (i + k) % 3, updated: new Date(now - (i + 1) * 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z')}})));
const board = decodeWork({rows, tx: 4242, truncated: false, multi_valued_rows: 0}, work, owners);
// Synthetic schema:name per item; the last one has none, so its row says why.
const verbs = ['Rotate', 'Document', 'Review', 'Rebuild', 'Retire', 'Measure', 'Pin', 'Trace', 'Drain'];
const nouns = ['the synthetic signing key', 'the bounded title read', 'the demo receipt', 'the cache warmer', 'the old fixture', 'the fold height'];
const titles = Object.fromEntries(rows.slice(0, -1).map((r, i) => [r.entity, `${verbs[i % verbs.length]} ${nouns[i % nouns.length]}`]));
window.demoTitleReads = 0;
const request = async (url, {body}) => {
  if (!url.endsWith('/ask') || body.name !== item.name) throw Error('Unexpected demo read');
  window.demoTitleReads++;
  const seed = body.params.seed, row = {item: seed, id: seed.split('/').at(-1), priority: 1, status: 'open', revision: 1};
  if (titles[seed]) row.title = titles[seed];
  return {query: item.name, sparql: item.template.replaceAll('{seed}', seed), rows: [row], count: 1, truncated: false};
};
const cap = Number(new URLSearchParams(location.search).get('cap')) || HELD_TITLE_READS;
view.setHeldTitleReader(heldTitleReader({request, endpoint: location.origin, definition: item, maxReads: cap}));
// window.demoHeldRender() re-renders as a live refresh would.
const render = () => view.renderHeldPanel(document.getElementById('held-work'), document.getElementById('held-status'), {...decoded, rows: board.rows, more: board.more, tx: board.tx}, now, now);
render();
window.demoHeldRender = render;
window.demoHeldRendered = true;
