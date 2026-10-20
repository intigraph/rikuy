// Deterministic read-only presentation. No curated rows, hidden writes or LLMs.
export const GRAPH='https://example.test/project/demo';
export class Unknown extends Error {}
export const scalar=value=>value && typeof value==='object' && 'value' in value ? value.value : value;
const number=value=>{value=scalar(value);if(value==='' || value==null || !Number.isFinite(Number(value)))throw new Unknown('Missing numeric source field');return Number(value);};
const timestamp=value=>{const s=scalar(value);if(typeof s!=='string'||!s.endsWith('Z')||!Number.isFinite(Date.parse(s)))throw new Unknown('Invalid source time');return s;};
export function windowParams(now){
  const end=new Date(now).toISOString(),start=new Date(now-7*86400000).toISOString();
  return {start,end};
}
export function renderQuery(def,params){
  if(Object.keys(params).sort().join(',')!==def.params.map(p=>p.name).sort().join(','))throw new Unknown('Query parameters changed');
  let text=def.template;
  for(const [key,value] of Object.entries(params)){timestamp(value);text=text.replaceAll('{'+key+'}',value.replaceAll('\\','\\\\').replaceAll("'","\\'"));}
  return text;
}
export function registryProof(registry,expected){
  if(!expected || expected.iri!==GRAPH || !expected.creation)throw new Unknown('Graph registration receipt missing');
  const found=registry?.graphs?.filter(g=>g.iri===GRAPH);
  if(found?.length!==1 || found[0].class!=='committed' || number(found[0].g)<=0 || JSON.stringify(found[0].creation)!==JSON.stringify(expected.creation))throw new Unknown('Graph registration changed');
  return Object.freeze({graph:GRAPH,creation:expected.creation});
}
export function queryRows(body,def,params={}){
  if(body?.query!==def.name || body.sparql!==renderQuery(def,params))throw new Unknown('Stored query identity changed');
  if(!Array.isArray(body.rows)||body.count!==body.rows.length||body.truncated!==false && body.truncated!==undefined||body.rows.length>=def.rowCap)throw new Unknown('Incomplete or overflowing query');
  return body.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,scalar(v)])));
}
export function item(row,now){
  if(typeof row.id!=='string'||!/^demo-[a-z0-9]+(?:\.[0-9]+)*$/.test(row.id)||row.item!=='https://example.test/item/'+row.id||typeof row.title!=='string'||!row.title.trim())throw new Unknown('Foreign or missing item identity');
  const revision=number(row.revision),modified=timestamp(row.modified);
  if(!Number.isSafeInteger(revision)||revision<1||Date.parse(modified)>now+1000)throw new Unknown('Unverified source revision/time');
  return {...row,revision,modified,graph:GRAPH,sourceKind:row.sourceKind||'UNKNOWN',confidence:row.confidence||'UNKNOWN (no source confidence recorded)'};
}
export function validatePanel(panel,rows,now,params={}){
  if(panel==='coverage'){
    if(rows.length!==1||!String(rows[0].item).startsWith('https://example.test/item/')||!Number.isSafeInteger(number(rows[0].revision)))throw new Unknown('Positive graph data control missing');
    return rows;
  }
  const result=rows.map(r=>item(r,now));
  const versions=new Map(),identities=new Set();
  for(const r of result){
    if(versions.has(r.item)&&versions.get(r.item)!==r.revision)throw new Unknown('Conflicting source revisions');versions.set(r.item,r.revision);
    const identity=JSON.stringify([r.item,r.gate??null,r.relation??null,r.target??null,r.child??null]);
    if(identities.has(identity))throw new Unknown('Duplicate source fact');identities.add(identity);
  }
  if(panel==='next'||panel==='asks'){
    const ids=new Set();
    for(const r of result){
      r.priority=number(r.priority);if(!Number.isInteger(r.priority)||r.priority<0||r.priority>4||!['open','in_progress','hooked','blocked','deferred'].includes(r.status))throw new Unknown('Invalid active item');
      r.rank=r.rank==null?null:number(r.rank);if(r.rank!=null&&r.rank<0)throw new Unknown('Invalid rank');
      if(r.due!=null)timestamp(r.due.length===10?r.due+'T00:00:00Z':r.due);
      // One row per gate is legitimate; no duplicate row may silently replace
      // a different version of the same item.
      const key=r.item+(panel==='asks'?'|'+r.gate:'');if(ids.has(key))throw new Unknown('Duplicate item/gate');ids.add(key);
      if(panel==='asks'&&!['blocked:human','needs-stiwi','decision-stiwi','desk'].includes(r.gate))throw new Unknown('Foreign human gate');
    }
    result.sort((a,b)=>a.priority-b.priority||(a.rank??Infinity)-(b.rank??Infinity)||a.id.localeCompare(b.id));
  }
  if(panel==='closes')for(const r of result){timestamp(r.closed);if(Date.parse(r.closed)<Date.parse(params.start)||Date.parse(r.closed)>=Date.parse(params.end))throw new Unknown('Close outside query window');}
  if(panel==='dependencies'||panel==='epics')for(const r of result){
    const target=r.target??r.child;
    if(typeof target!=='string'||!target.startsWith('https://example.test/item/'))throw new Unknown('Foreign graph edge');
    if(panel==='dependencies'&&!['https://scbrown.github.io/quechua/ns#blockedOn','https://schema.org/isPartOf'].includes(r.relation))throw new Unknown('Unknown edge relation');
    // Unobserved linked nodes stay visibly UNKNOWN, never treated as closed.
    r.targetStatus=r.targetStatus??r.childStatus??'UNKNOWN';
  }
  return result;
}
export function summarize(closes,epics){
  const days={};for(const r of closes)days[r.closed.slice(0,10)]=(days[r.closed.slice(0,10)]||0)+1;
  const parents=new Map();for(const r of epics){let p=parents.get(r.item);if(!p){p={item:r.item,title:r.title,children:0,closed:0,unknown:0};parents.set(r.item,p);}p.children++;if(r.childStatus==='closed')p.closed++;else if(!r.childStatus)p.unknown++;}
  return {days,reasonedCloses:closes.filter(r=>typeof r.reason==='string'&&r.reason.trim()).length,unreasonedCloses:closes.filter(r=>!r.reason?.trim()).length,epics:[...parents.values()]};
}
