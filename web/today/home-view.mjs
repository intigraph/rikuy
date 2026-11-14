import {decisionView,questionLabel,deploymentGroups} from './home-model.mjs';
// Presentation only. Decoded source data stays textContent, including titles.
export const $=id=>document.getElementById(id);
export const el=(tag,text,cls)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
export const stamp=ms=>new Date(ms).toISOString().replace(/\.\d{3}Z$/,'Z');
export function mark(node){node.dataset.checked='true';return node;}
// Citations open the shipped read definition; they never execute a query.
export function cite(node,href,label='Query definition'){
  const link=el('a',label,'query-citation');link.href=href;node.append(document.createTextNode(' · '),link);
}
export function unavailable(node,reason,at=Date.now()){
  mark(node).replaceChildren(el('p','Unavailable: '+reason,'unavailable'),el('time','Checked '+stamp(at),'source-time'));
}
let explorerPromise,recordReader,recordPanel,recordRoot;
export function setRecordReader(read){recordReader=read;}
export async function openRecord(id,title){
  if(!/^aegis-[a-z0-9]+(?:\.[0-9]+)*$/.test(id))throw Error('Invalid record selection');
  if(!recordReader)return openExplorer(id,title);
  show('explore',false,false);
  const legacy=$('quipu-explorer');legacy.hidden=true;
  if(!recordRoot){recordRoot=el('section');recordRoot.id='readable-record';legacy.before(recordRoot);}
  recordRoot.hidden=false;
  if(!recordPanel){const {mountRecord}=await import('./record-view.mjs');recordPanel=mountRecord(recordRoot,{read:recordReader});}
  return recordPanel.open('https://seeds.local/item/'+id,title);
}
export function openExplorer(id,title){
  show('explore',false,false);
  if(recordRoot)recordRoot.hidden=true;$('quipu-explorer').hidden=false;
  if(!explorerPromise){
    const root=$('quipu-explorer');
    const deadline=setTimeout(()=>{const status=root.querySelector('[role=status]');if(root.dataset.ready!=='true'){
      if(status)status.textContent='Unavailable: snapshot verification exceeded 4 seconds · '+stamp(Date.now());
      else unavailable(root,'snapshot module did not respond within 4 seconds');
    }},4000);
    explorerPromise=import('./explorer.js').then(m=>m.attachExplorer(root)).finally(()=>clearTimeout(deadline));
    explorerPromise.catch(()=>{unavailable(root,'bundled snapshot could not be verified');explorerPromise=undefined;});
  }
  return explorerPromise.then(api=>id?api.openItem(id,title):api).catch(()=>{});
}
export function recordButton(id,title){const button=el('button','Open record','record-link');button.type='button';button.setAttribute('aria-label','Open record: '+title);button.addEventListener('click',()=>openRecord(id,title).catch(()=>unavailable($('readable-record')||$('quipu-explorer'),'record view could not be loaded')));return button;}
export function show(view,focus=false,load=true){
  const tabs=[...document.querySelectorAll('.tabs [role=tab]')];
  if(!tabs.some(tab=>tab.dataset.v===view))view='today';
  for(const tab of tabs){const selected=tab.dataset.v===view;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;$('v-'+tab.dataset.v).hidden=!selected;if(selected&&focus)tab.focus();}
  if(load&&view==='explore'&&!explorerPromise)openExplorer();
}
export function tabs(){
  const list=[...document.querySelectorAll('.tabs [role=tab]')];
  for(const [index,tab] of list.entries()){
    tab.addEventListener('click',()=>{show(tab.dataset.v);history.replaceState(null,'','#'+tab.dataset.v);});
    tab.addEventListener('keydown',event=>{const step=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;if(step){event.preventDefault();show(list[(index+step+list.length)%list.length].dataset.v,true);}});
  }
  // Today is the landing view. An explicit deep link can select another view.
  show(location.hash.slice(1)||'today');
  window.briefShow=show;
}
const age=(at,now=Date.now())=>{const ms=now-Date.parse(at);if(!Number.isFinite(ms))return 'age unknown';const d=Math.floor(ms/86400000);return d>=1?d+(d===1?' day':' days'):Math.max(0,Math.floor(ms/3600000))+' h';};
export function renderAsks(view,reason,at){
  const root=$('asks'),top=$('ask-top'),opened=new Set(root.dataset.openIds?JSON.parse(root.dataset.openIds):[]);
  mark(root).replaceChildren();mark(top).replaceChildren();
  $('ask-count').hidden=!view;$('ask-count').textContent=view?String(view.rows.length):'';
  $('h-asks').textContent='Needs you';
  if(!view){unavailable(top,reason,at);unavailable(root,reason,at);mark($('asks-status')).textContent='Live asks · count unavailable';$('ask-rest-count').textContent='';$('h-remaining').textContent='Other decisions';return;}
  const decisions=decisionView(view);
  mark($('asks-status')).textContent=`${decisions.total} asks · every open human-gated or “ASK Stiwi” seed${view.incomplete?' · coverage incomplete':''} · checked ${stamp(at)}`;
  cite($('asks-status'),'./asks/query.json');
  cite($('asks-status'),'./asks/titles.json','Title query');
  const cardFor=(row,index)=>{
    const card=el('article',undefined,'ask');card.dataset.item=row.id;
    card.append(el('div',(index===undefined?'':(index+1)+'. ')+questionLabel(row.title),'q'));
    const details=el('details',undefined,'ask-details');details.open=opened.has(row.id);
    details.append(el('summary','Choices and record'));
    if(row.options)details.append(el('p','OPTIONS: '+row.options.split(/\bREC:/i)[0].trim(),'options'));
    if(row.rec)details.append(el('p','REC: '+row.rec,'rec'));
    if(!row.options&&!row.rec)details.append(el('p','Choices have not been recorded.','note'));
    details.append(el('div',[row.id,'P'+row.priority,row.status,'age '+(row.created?age(row.created):'unknown'),row.owner?.split('/').at(-1)||'unassigned'].join(' · '),'meta'));
    details.addEventListener('toggle',()=>{details.open?opened.add(row.id):opened.delete(row.id);root.dataset.openIds=JSON.stringify([...opened]);});
    card.append(details,recordButton(row.id,row.title));return card;
  };
  for(const [index,row] of decisions.featured.entries())top.append(cardFor(row,index));
  for(const row of decisions.remaining)root.append(cardFor(row));
  $('h-remaining').textContent=decisions.remaining.length+' other decisions';
  const count=$('ask-rest-count');count.replaceChildren();
  if(decisions.remaining.length){const link=el('a',decisions.remaining.length+' more decisions below ↓');link.href='#remaining-decisions';count.append(link);}
  if(!decisions.total)top.append(el('p','Nothing is waiting on you in the verified board.','empty'));
  else if(!decisions.featured.length)top.append(el('p','No titled questions; human-gated work is listed below.','note'));
}

export function renderLater(rows,reason,at){
  const root=$('later');root.replaceChildren();
  if(!rows){unavailable(root,reason,at);mark($('later-status')).textContent='Later · unavailable';return;}
  mark($('later-status')).textContent=`${rows.length} ${rows.length===1?'item':'items'} Stiwi answered later · checked ${stamp(at)}`;
  cite($('later-status'),'./later/query.json');
  if(!rows.length){root.append(el('p','Nothing marked later (label stiwi-later).','empty'));return;}
  for(const row of rows){const card=el('article',undefined,'ask later');card.append(el('div',row.title,'q'),el('div',[row.id,'P'+row.priority,row.status,'age '+(row.created?age(row.created):'unknown')].join(' · '),'meta'),recordButton(row.id,row.title));root.append(card);}
}
export function renderPriorities(rows,reason,at){
  const root=$('prio');root.replaceChildren();
  mark($('priorities-status')).textContent=rows?`${rows.moreThan20?'Showing 20; more than 20 active P0 items. Bounded selection, ranked within this view.':rows.length+' active P0 items'} · checked ${stamp(at)}`:'Live priorities · count unavailable';
  if(rows)cite($('priorities-status'),'./priorities/query.json');
  if(!rows||!rows.length){const tr=el('tr'),td=el('td',rows?'No active P0 items in the verified query.':'Unavailable: '+reason+' · checked '+stamp(at),'empty');td.colSpan=4;tr.append(td);root.append(tr);return;}
  for(const [i,row] of rows.entries()){
    const tr=el('tr'),title=el('td');title.append(el('span','P'+row.priority,'pill p0'),el('div',row.title,'title'),el('div',row.id+' · revision '+row.revision+' · '+row.modified,'next'),recordButton(row.id,row.title));
    tr.append(el('td',String(i+1),'rank'),title,el('td',row.owner?.split('/').at(-1)||'unassigned','who'),el('td',row.status.replaceAll('_',' ')));root.append(tr);
  }
}
export function deployRows(root,rows){
  root.replaceChildren();
  for(const row of rows){const line=el('div',undefined,'deploy-row');line.append(el('span',undefined,'dot '+row.outcome),el('span',(row.service||'Service not recorded')+' · '+row.outcome,'service'),el('time',stamp(Date.parse(row.occurredAt)).slice(11,16)+' UTC','when'));root.append(line);}
}

// A short deterministic overview of the SAME validated panel reads. No new
// request, headline curator, inferred incident or yesterday baseline.
export function renderOverview(state,reasons,checked){
  const root=$('overview-panels');mark(root).replaceChildren();
  const panel=heading=>{const box=el('section',undefined,'brief-panel');box.append(el('h2',heading));root.append(box);return box;};
  const work=panel('Priority work');
  if(state.priorities){
    work.append(el('p',state.priorities.moreThan20?'20 shown · more than 20 active P0 items':state.priorities.length+' active P0 items','brief-count'));
    const list=el('ul');for(const row of state.priorities.slice(0,2))list.append(el('li',row.title.replace(/^EPIC(?:\s*\([^)]*\))?\s*:\s*/i,'')));work.append(list);
    if(!state.priorities.length)work.append(el('p','No active P0 work in this read.','note'));
  }else work.append(el('p','Unavailable: '+(reasons.priorities||'no verified priority read yet'),'note'));
  const deploys=panel('Deployments · last 24 hours');
  if(!state.deploys)deploys.append(el('p','Unavailable: '+(reasons.deploys||'no verified deployment read yet'),'note'));
  else{
    const counts=state.deploys.counts,summary=el('div',undefined,'outcome-counts');
    summary.append(el('span',counts.succeeded+' applied','applied'),el('span',counts.rolledback+' rolled back','rollback'),el('span',counts.failed+' failed',counts.failed?'failed':'note'));deploys.append(summary);
    const list=el('ul');for(const group of deploymentGroups(state.deploys).slice(0,3)){
      const outcomes=[];if(group.succeeded)outcomes.push(group.succeeded+' applied');if(group.rolledback)outcomes.push(group.rolledback+' rolled back');if(group.failed)outcomes.push(group.failed+' failed');
      const item=el('li',group.label+' — '+outcomes.join(', '));if(group.rolledback||group.failed)item.className='deployment-problem';list.append(item);
    }deploys.append(list);
  }
  for(const box of root.children){
    const source=el('p','Source: '+(box===work?'daily_brief_priorities_v3':'daily_brief_deploys_v1'),'provenance');
    cite(source,box===work?'./priorities/query.json':'./pace/query.json');box.append(source);
  }
}
