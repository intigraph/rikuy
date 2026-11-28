import {decisionView,questionLabel,deploymentGroups} from './home-model.mjs';
import {mountAskDecision} from './ask-decisions.mjs';
import {askChoices} from './ask-choices.mjs';
import {choiceReads} from './ask-choice-reads.mjs';
import {NOT_ADMITTED} from './ask-decision-adapter.mjs';
import {heldSummary} from './held/model.mjs';
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
let explorerPromise,recordReader,recordPanel,recordRoot,askDecisionAdapter,askChoicesReader,cardReads;
export function setAskDecisionAdapter(adapter){askDecisionAdapter=adapter;}
export function setAskChoicesReader(read){askChoicesReader=read;cardReads=read?choiceReads(read):undefined;}
// Decision cards read OPTIONS/REC through the same per-seed point reader as the
// details panel (cached by seed@revision, timed out, failures evicted), at most
// two in flight. A failed read keeps the title/fallback choices, says so, and
// offers a retry. A re-render does not re-read a failed seed@revision; only
// Retry does.
const decisionReason=()=>askDecisionAdapter?'Checking signing admission…':NOT_ADMITTED.signer;
// Every Needs-you card is a decision card. Choices render disabled with the
// visible reason until an admitted adapter mounts the signed Deck controls.
function decisionCard(card,row){
  const section=el('section',undefined,'ask-decide');section.dataset.item=row.id;
  let choices=row.options||row.rec?{state:'read',options:row.options||'',rec:row.rec||''}:{state:'none'};
  const draw=reason=>{
    const parsed=askChoices({title:questionLabel(row.title),default:row.default,...(choices.state==='read'?{options:choices.options,rec:choices.rec}:{})});
    const why=el('div',undefined,'decision-why');for(const line of parsed.why)why.append(el('p',line,'decision-context'));
    const group=el('div',undefined,'decision-actions');group.setAttribute('role','group');group.setAttribute('aria-label','Choices: '+questionLabel(row.title));
    const note=el('p',reason,'decision-status');note.id='decision-reason-'+row.id;note.setAttribute('role','status');
    for(const choice of parsed.choices){
      const button=el('button',choice.label,'decision-choice'+(choice.recommended?' recommended':''));button.type='button';button.disabled=true;button.dataset.choice=choice.id;button.dataset.action=choice.action;
      button.setAttribute('aria-describedby',note.id);
      if(choice.recommended){button.append(el('span',' · Recommended','rec-badge'));}
      group.append(button);
    }
    section.replaceChildren(why,group,note);
    if(choices.state==='loading')section.append(el('p','Reading recorded options…','note'));
    if(choices.state==='failed'){
      const retry=el('button','Retry','retry-choices');retry.type='button';retry.addEventListener('click',load);
      const failed=el('p','Recorded options could not be read; showing '+(parsed.source==='title'?'the title choices':'Yes / No')+'. ','note');failed.append(retry);section.append(failed);
    }
    section.dataset.reason=reason;
  };
  const redraw=()=>{if(!section.dataset.mounted)draw(section.dataset.reason);};
  const done=found=>{choices=found;if(section.isConnected)redraw();};
  function load(){if(cardReads){choices=cardReads.retry(row,done);redraw();}}
  if(choices.state==='none'&&cardReads)choices=cardReads.request(row,done);
  draw(decisionReason());
  card.append(section);
  if(askDecisionAdapter){
    if(row.kind!=='ask'){draw(NOT_ADMITTED.ask);return;}
    const actions=el('section',undefined,'ask-signing');actions.hidden=true;card.append(actions);
    mountAskDecision(actions,row,askDecisionAdapter).then(()=>{section.dataset.mounted='true';section.hidden=true;actions.hidden=false;})
      .catch(error=>{actions.remove();draw(typeof error?.reason==='string'?error.reason:'Decision unavailable · admitted request or settlement evidence is missing.');});
  }
}
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
  mark($('asks-status')).textContent=`${decisions.total} asks · every active Ask, human-gated or “ASK Stiwi” seed${view.incomplete?' · coverage incomplete':''} · checked ${stamp(at)}`;
  cite($('asks-status'),'./asks/query.json');
  cite($('asks-status'),'./asks/titles.json','Title query');
  const cardFor=(row,index)=>{
    const card=el('article',undefined,'ask');card.dataset.item=row.id;
    card.append(el('div',(index===undefined?'':(index+1)+'. ')+questionLabel(row.title),'q'));
    const details=el('details',undefined,'ask-details');details.open=opened.has(row.id);
    details.append(el('summary','Choices and record'));
    const choices=el('div',undefined,'ask-choices');details.append(choices);
    const showChoices=({options,rec})=>{
      choices.replaceChildren();
      if(options)choices.append(el('p','OPTIONS: '+options.split(/\bREC:/i)[0].trim(),'options'));
      if(rec)choices.append(el('p','REC: '+rec,'rec'));
      if(!options&&!rec)choices.append(el('p','Choices have not been recorded.','note'));
    };
    // The list query carries no OPTIONS/REC; they are read per Ask when its card opens.
    let loading=false;
    const loadChoices=()=>{
      if(loading||!askChoicesReader||row.options||row.rec)return;
      loading=true;choices.replaceChildren(el('p','Reading choices…','note'));
      askChoicesReader(row.item,row.revision).then(showChoices,()=>{loading=false;choices.replaceChildren(el('p','Choices unavailable · the item read did not verify. Close and reopen to retry.','unavailable'));});
    };
    if(row.options||row.rec||!askChoicesReader)showChoices(row);
    if(row.kind==='ask'){
      const metadata=el('dl',undefined,'ask-metadata');
      for(const[label,value]of [['If unanswered',row.default],['Reply by',row.expires]])metadata.append(el('dt',label),el('dd',value));
      details.append(metadata);
      const linked=row.unblocks.split('/').at(-1);
      const linkedButton=recordButton(linked,'Work awaiting this decision');linkedButton.textContent='Open linked work';
      details.append(el('p','Unblocks '+linked),linkedButton);
    }
    details.append(el('div',[row.id,'P'+row.priority,row.status,'age '+(row.created?age(row.created):'unknown'),row.owner?.split('/').at(-1)||'unassigned'].join(' · '),'meta'));
    details.addEventListener('toggle',()=>{details.open?opened.add(row.id):opened.delete(row.id);root.dataset.openIds=JSON.stringify([...opened]);if(details.open)loadChoices();});
    if(details.open)loadChoices();
    decisionCard(card,row);
    card.append(details,recordButton(row.id,row.title));
    return card;
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
// Held work for owners with stopped, ceiling or expired lifecycle evidence.
// Only owners holding work get a card; the rest collapse into one count line.
export function renderHeldPanel(root,status,view,checkedAt,at=Date.now()){
  mark(root).replaceChildren();
  const sum=heldSummary(view,at),items=sum.holders.reduce((n,h)=>n+h.rows.length,0);
  mark(status).textContent=`${sum.holders.length} of ${sum.owners} owners with stopped or UNKNOWN evidence hold work${sum.unknown?' · UNKNOWN coverage: '+sum.unknown+' owners have missing or expired evidence':!view.complete?' · UNKNOWN: writer coverage is incomplete':''} · board tx ${view.tx??'not read'} · checked ${stamp(checkedAt)}`;
  cite(status,'./held/head.json','Owner query');cite(status,'./held/work.json','Work query');
  if(!sum.owners)root.append(el('p',view.complete&&!sum.unknown?'No stopped owners in the verified writer scope.':'Stopped-owner coverage is UNKNOWN; an empty result cannot establish that every owner is live.','note'));
  const cards=sum.collapsed?el('details',undefined,'held-owners'):root;
  if(sum.collapsed){cards.append(el('summary',`Show ${sum.holders.length} owners holding ${items} items`));root.append(cards);}
  for(const owner of sum.holders){
    const card=el('article',undefined,'ask'),label=owner.uncertain?'UNKNOWN · last recorded '+owner.state:owner.state==='ceiling'?'ceiling-stopped':'stopped';
    card.append(el('h3',owner.agent+' · '+label));
    for(const row of owner.rows){const line=el('p');line.append(el('span',`${row.id} · P${row.priority} · ${row.status} · ${row.title}${row.modified?' · updated '+row.modified:''} `));
      line.append(recordButton(row.id,row.title));card.append(line);}
    const proof=el('details');proof.append(el('summary','Owner evidence'),el('p',`Observed ${stamp(owner.observed_at*1000)} · lifecycle revision ${owner.revision} · ${owner.fact}`,'meta'));card.append(proof);cards.append(card);
  }
  if(sum.quiet)root.append(el('p',`${sum.quiet} other ${sum.quiet===1?'owner shows':'owners show'} no owned work ${view.more?'within this bounded selection':'in the verified board read'}${sum.quietEphemeral?` (${sum.quietEphemeral} ephemeral job ${sum.quietEphemeral===1?'identity':'identities'})`:''}.`,'note held-quiet'));
  if(view.more)root.append(el('p','More owned work exists beyond this bounded selection.','note'));
  root.append(el('p','Reassignment stays with the lead. Owner evidence expires after 30 minutes.','note'));
}
