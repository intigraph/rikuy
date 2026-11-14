// Main Brief page from live stored queries (aegis-blh, Stiwi 2026-10-21 "a
// functional brief.svc"). Pure shaping only: every value comes from a validated
// panel read; an unread panel is null and renders as UNKNOWN, never as zero.

// Live Seeds human-gated items, in the shape owner-script-1's renderAsks expects.
export function askRows(view) {
  return (view?.rows ?? []).map((r, i) => ({collection: 'asks', payload: {
    order: i, ask: r.title, item: r.id,
    where: [`P${r.priority}`, r.status, r.owner?.split('/').at(-1) ?? 'unassigned', r.gates.join(', ')].join(' · ')}}));
}

// Live P0 work, in the shape owner-script-1's renderPrio expects.
export function priorityRows(rows) {
  return (rows ?? []).map((r, i) => ({collection: 'priorities', payload: {
    rank: i + 1, priority: r.priority, title: r.title, item: r.id,
    owner: r.owner?.split('/').at(-1) ?? null, state: r.status.replace('_', ' '),
    next: `rank ${r.rank ?? 'unranked'} · revision ${r.revision} · modified ${r.modified}`}}));
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// One line per panel, each read independently. undefined = not checked yet;
// null = the read failed (UNKNOWN). Neither is ever shown as zero.
const unread = (value, label, failed) => value === undefined ? `${label}: checking…` : `${label}: UNKNOWN (${failed}).`;
export function digest({asks, priorities, deploys, stats}, now) {
  const points = [];
  points.push(asks ? `${plural(asks.rows.length, 'item needs', 'items need')} you${asks.incomplete ? ' (coverage incomplete)' : ''}.`
    : unread(asks, 'Items needing you', 'the asks read failed'));
  points.push(priorities ? `${plural(priorities.length, 'P0 item is', 'P0 items are')} open or in progress.`
    : unread(priorities, 'P0 work', 'the priorities read failed'));
  if (deploys) {
    const c = deploys.counts;
    points.push(`${plural(deploys.rows.length, 'deploy', 'deploys')} in the last 24h: ${c.succeeded} succeeded, ${c.rolledback} rolled back, ${c.failed} failed.`);
  } else points.push(unread(deploys, 'Deploys in the last 24h', 'the deploy read failed'));
  points.push(stats ? (stats.active_total!==undefined ? `Board: ${stats.active_total} active items; ${stats.created_total} created and ${stats.closed_total} closed in the last 31 UTC days.` : `Board: ${Object.values(stats.active_work.P0).reduce((a, b) => a + b, 0)} active P0, ${Object.values(stats.active_work.P1).reduce((a, b) => a + b, 0)} active P1, ${stats.active_inbox} active inbox.`)
    : unread(stats, 'Board totals', 'fresh stats are not available'));
  const top = (asks?.rows ?? []).slice(0, 3).map(r => `Needs you: ${r.id} ${r.title}`)
    .concat((priorities ?? []).slice(0, 3).map(r => `P0: ${r.id} ${r.title}`));
  const known = [asks, priorities, deploys, stats].filter(Boolean).length;
  const checking = [asks, priorities, deploys, stats].some(v => v === undefined);
  const headline = known === 0 ? (checking ? 'Checking live data…' : 'Live data is unavailable right now.')
    : asks && asks.rows.length ? `${plural(asks.rows.length, 'item needs', 'items need')} you first.`
    : asks ? 'Nothing is waiting on you in the live board right now.'
    : 'Needs-you status is unavailable; check the source status above.';
  return {headline, points: points.concat(top), updated: new Date(now).toISOString(), known, total: 4};
}

// The governed activity log: deploy events, newest first. A curated status log
// has no Quipu source yet, so it is not invented here.
export function logEntries(deploys) {
  return (deploys?.rows ?? []).map(r => ({at: r.occurredAt,
    headline: `${r.service ?? 'unknown service'} deploy ${r.outcome}`,
    points: [r.environment ?? 'environment UNKNOWN', r.artifact ?? 'artifact UNKNOWN'], event: r.event}));
}

// Highlight explicit questions only; ALL other human-gated rows remain visible.
export function decisionView(view){
  const created=row=>Number.isFinite(Date.parse(row.created))?Date.parse(row.created):Infinity;
  const ranked=[...(view?.rows||[])].sort((a,b)=>a.priority-b.priority||created(a)-created(b)||a.id.localeCompare(b.id));
  const featured=ranked.filter(row=>/^ASK Stiwi\b/i.test(row.title)).slice(0,3);
  const ids=new Set(featured.map(row=>row.id));
  return {featured,remaining:ranked.filter(row=>!ids.has(row.id)),total:ranked.length};
}
export const questionLabel=title=>title.replace(/^ASK Stiwi(?:\s*\([^)]*\))?\s*:\s*/i,'');
export function serviceLabel(service){
  const labels={shacl_quipu_config:'Quipu settings change',shacl:'Validation settings change',quipu:'Quipu',shantytown:'Crew tooling','homelab-mcp':'Homelab tools'};
  return Object.hasOwn(labels,service)?labels[service]:(service?service.replaceAll('_',' ').replaceAll('-',' '):'Unnamed service');
}
export function deploymentGroups(view){
  const groups=new Map();
  for(const row of view?.rows||[]){
    const group=groups.get(row.service)||{service:row.service,label:serviceLabel(row.service),last:row.occurredAt,succeeded:0,rolledback:0,failed:0};
    if(Date.parse(row.occurredAt)>Date.parse(group.last))group.last=row.occurredAt;
    group[row.outcome]++;groups.set(row.service,group);
  }
  const severity=g=>g.failed?2:g.rolledback?1:0;
  return [...groups.values()].sort((a,b)=>severity(b)-severity(a)||Date.parse(b.last)-Date.parse(a.last)||a.label.localeCompare(b.label));
}
