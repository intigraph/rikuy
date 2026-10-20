import {renderWatches} from './watches.mjs';
import {GRAPH} from './model.mjs';
const make=(doc,tag,text)=>{const el=doc.createElement(tag);if(text!==undefined)el.textContent=String(text);return el;};
const link=(doc,iri,label)=>{const a=make(doc,'a',label);a.href=iri;a.rel='noopener noreferrer';return a;};
function dependencyDiagram(doc,rows){
  const ns='http://www.w3.org/2000/svg',height=Math.max(70,rows.length*55);
  const svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 600 ${height}`);svg.setAttribute('width','100%');svg.setAttribute('role','img');svg.setAttribute('aria-label','One-hop dependency and gate graph for selected priorities');
  const add=(tag,attrs,text)=>{const n=doc.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text)n.textContent=text;svg.append(n);return n;};
  rows.forEach((r,i)=>{const y=i*55+30;
    add('line',{x1:220,y1:y,x2:370,y2:y,stroke:'currentColor'});
    add('text',{x:12,y:y-3,fill:'currentColor','font-size':13},r.id);
    add('text',{x:240,y:y-7,fill:'currentColor','font-size':11},r.relation.endsWith('blockedOn')?'blocked on →':'part of →');
    add('text',{x:380,y:y-3,fill:'currentColor','font-size':13},(r.targetTitle??r.target.split('/').at(-1)).slice(0,28));
    add('text',{x:380,y:y+14,fill:'currentColor','font-size':10},r.targetStatus);
  });return svg;
}
export function renderView(root,view,definitions){
  const doc=root.ownerDocument,m=(tag,text)=>make(doc,tag,text),fragment=doc.createDocumentFragment();
  fragment.append(m('p','Checked '+new Date(view.checkedAt).toISOString()+' · source '+(view.sourceVersion??'UNKNOWN')+' · snapshot tx UNKNOWN (separate queries)'));
  if(view.unavailable){fragment.append(m('p','UNKNOWN · '+view.unavailable));if(view.lastCheckedAt)fragment.append(m('p','Last successful view '+new Date(view.lastCheckedAt).toISOString()+'; it is not current evidence'));}
  const panels=[['next','Next'],['asks','Needs you'],['closes','Pace and done-with-reason'],['dependencies','Dependencies and gates'],['epics','Epic progress']];
  for(const [key,title]of panels){
    const section=m('section'),def=definitions[key],panel=view.panels[key];section.append(m('h2',title));
    section.append(m('p','Query '+def.name+' · graph '+GRAPH+' · '+def.scope));
    if(!panel||panel.state!=='observed'){section.append(m('p','UNKNOWN · '+(panel?.reason??'Source query unavailable')));fragment.append(section);continue;}
    if(!panel.rows.length)section.append(m('p','No matching facts in this selection/window. This is not a whole-board absence claim.'));
    if(key==='dependencies'&&panel.rows.length)section.append(dependencyDiagram(doc,panel.rows));
    const list=m('ul');
    for(const r of panel.rows){
      const row=m('li');row.append(link(doc,r.item,r.title));
      if(key==='next'||key==='asks')row.append(m('p',`P${r.priority} · rank ${r.rank??'UNRANKED'} · ${r.status} · owner ${r.owner??'unassigned'} · due ${r.due??'not set'}${r.gate?' · gate '+r.gate:''}`));
      if(key==='closes')row.append(m('p',`${r.closed} · ${r.reason?.trim()||'Close reason UNKNOWN'}`));
      if(key==='dependencies')row.append(m('p',`${r.relation.endsWith('blockedOn')?'blocked on':'part of'} ${r.targetTitle??r.target} · linked status ${r.targetStatus}`));
      if(key==='epics')row.append(m('p',`child ${r.childTitle??r.child} · ${r.childStatus??'UNKNOWN'}`));
      row.append(m('small',`revision ${r.revision} · modified ${r.modified} · source ${r.sourceKind} · ${r.confidence}`));list.append(row);
    }
    section.append(list);
    if(key==='closes'&&view.summary){
      section.append(m('p',`${view.summary.reasonedCloses} reasoned closes; ${view.summary.unreasonedCloses} missing reason · exact returned seven-day window, not lifetime totals`));
      const chart=m('dl');for(const [day,n]of Object.entries(view.summary.days).sort()){chart.append(m('dt',day),m('dd',`${'▇'.repeat(Math.min(n,40))} ${n}`));}section.append(chart);
    }
    if(key==='epics'&&view.summary)for(const e of view.summary.epics)section.append(m('p',`${e.title}: ${e.closed}/${e.children} closed in selected-parent child scope; ${e.unknown} unknown status`));
    fragment.append(section);
  }
  const activity=m('section');activity.append(m('h2','PR / CD / stop evidence'),m('p','UNKNOWN · authoritative typed event/query/producer coverage not yet attributed. No status or throughput is inferred from episode prose.'));
  fragment.append(activity,renderWatches(doc,view));root.replaceChildren(fragment);
}
