// Synthetic Today Needs-you cards for `just demo` and the browser check.
// Public configuration only: no reader, adapter, signer or network request.
const view = await import('/today/home-view.mjs');
const {askChoicesReader} = await import('/today/asks/model.mjs');
const definition = await (await fetch('/today/asks/item.json')).json();
const item = id => 'https://seeds.local/item/' + id;
const base = {status: 'open', priority: 1, revision: 3, created: '2026-11-20T00:00:00Z', owner: null, gates: ['ask-type'], options: '', rec: ''};
const rows = [
  {...base, id: 'aegis-demo1', item: item('aegis-demo1'), kind: 'ask', priority: 0, created: '2026-11-10T00:00:00Z', owner: 'https://seeds.local/agent/demo-owner', title: 'ASK Stiwi: Choose the next bounded step', unblocks: item('aegis-demo9'), default: 'Keep waiting for the receipt', expires: '2026-12-31T12:00:00Z'},
  {...base, id: 'aegis-demo2', item: item('aegis-demo2'), kind: 'ask', title: 'ASK Stiwi: Retire the legacy brief (now / after review / never)', unblocks: item('aegis-demo9'), default: 'Keep both pages', expires: '2026-12-31T12:00:00Z'},
  {...base, id: 'aegis-demo3', item: item('aegis-demo3'), kind: 'gate', gates: ['human-gate'], priority: 2, title: 'Approve the synthetic rollout?'}
];
// Synthetic answers for the per-seed OPTIONS/REC point read (daily_brief_ask_item_v2).
const recorded = {
  [item('aegis-demo1')]: {options: '(1) Verify the source (2) Wait for a receipt (3) Stop here', rec: '(1) the evidence is already readable'},
  [item('aegis-demo2')]: {options: '', rec: 'after review, once the record view is accepted'},
  [item('aegis-demo3')]: {options: '', rec: 'Yes, it is reversible'}
};
// The real reader (seed@revision cache, timeout, failure eviction) over an
// in-page request: nothing leaves the page. Reads are counted for the check.
window.demoChoiceReads = 0;
const request = async (url, {body}) => {
  window.demoChoiceReads++;
  const seed = body.params.seed, found = recorded[seed];
  const row = {item: seed, id: seed.split('/').at(-1), title: 'synthetic', priority: 1, status: 'open', revision: 3, ...found};
  return {query: definition.name, sparql: definition.template.replaceAll('{seed}', seed), rows: [row], count: 1, truncated: false};
};
view.setAskChoicesReader(askChoicesReader({request, endpoint: location.origin, definition}));
const render = () => view.renderAsks({rows, incomplete: false}, null, Date.now());
render();
// Re-render as a live refresh would; cached choices must not re-read.
setTimeout(render, 50);
window.demoAsksRendered = true;
