// Synthetic "Work held by stopped agents" panel for `just demo` and the browser check.
// The real lifecycle and board decoders run over in-page synthetic replies:
// no reader, endpoint or network request. Names and items are invented.
const view = await import('/today/home-view.mjs');
const {decodeHead, decodeWork} = await import('/today/held/model.mjs');
const {renderStored} = await import('/today/stored-query.mjs');
const head = await (await fetch('/today/held/head.json')).json();
const work = await (await fetch('/today/held/work.json')).json();
const now = Date.now(), hex = n => n.toString(16).padStart(64, '0');
// A crew the size of a busy day: long-lived workers plus many finished one-shot jobs.
const names = ['ada', 'basil', 'cora', 'dmitri', 'elena', 'farid', 'greta', 'hugo', 'ines', 'jonas', 'kemal'];
for (let i = 0; i < 87; i++) names.push(`eph-${['merge', 'review', 'task'][i % 3]}-${(0x1000 + i * 37).toString(16)}`);
const agents = names.map((agent, i) => ({contract: 'shantytown-owned-work/v1', agent, revision: i + 1, generation: 'generation-1', state: i % 9 === 4 ? 'ceiling' : 'stopped', observed_at: now / 1000 - (i < 3 ? 2400 : 120), fact: head.onto + 'owned-work-' + hex(i + 1)}));
const payload = {contract: 'shantytown-owned-work-head/v1', source: head.producer, host: head.host, revision: 1, state_revision: agents.length, complete: true, source_agents: agents.length, agents};
const decoded = decodeHead({query: head.name, sparql: renderStored(head, {}), rows: [{payload: JSON.stringify(payload)}], count: 1, truncated: false}, head, now);
// Eight long-lived owners and one finished job still hold board work.
const holders = [...names.slice(0, 8), names[20]], owners = decoded.states.map(s => s.owner);
const rows = holders.flatMap((agent, i) => Array.from({length: 1 + (i % 2)}, (_, k) => ({entity: work.itemPrefix + `aegis-demo-h${i}${k}`, graph: work.graph, multi: false, key_plain: true, key: work.key_in[(i + k) % 4], columns: {assignee: {iri: head.principalPrefix + agent}, priority: (i + k) % 3, updated: new Date(now - (i + 1) * 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z')}})));
const board = decodeWork({rows, tx: 4242, truncated: false, multi_valued_rows: 0}, work, owners);
view.renderHeldPanel(document.getElementById('held-work'), document.getElementById('held-status'), {...decoded, rows: board.rows, more: board.more, tx: board.tx}, now, now);
window.demoHeldRendered = true;
