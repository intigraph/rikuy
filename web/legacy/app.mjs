import {config} from './config.mjs';
import {BriefClient,readJSON} from './feed.mjs';
import {STATS_QUERY} from './model.mjs';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
let latest=null,expiryTimer;
const source=()=>el('p','Source: '+STATS_QUERY+' · retained UTC cohorts; current kind and priority.','note');
function statsView(stats) {
  const tiles=el('div',undefined,'tiles'), board=el('div',undefined,'shape'), closes=el('div');
  const tile=(value,label)=>{const t=el('div',undefined,'tile');t.append(el('div',value,'v'),el('div',label,'k'));tiles.append(t);};
  if(!stats || Date.now()-stats.observedMs>900000) {
    tile('UNKNOWN','Board totals');tile('UNKNOWN','Closes per day');
    closes.append(el('p','Fresh stats are not available yet.','empty'));
    board.append(el('p','Board counts are UNKNOWN until the producer recovers.','empty'));
  } else {
    const total=group=>Object.values(stats.active_work[group]).reduce((a,b)=>a+b,0);
    tile(String(total('P0')),'Active P0 work');tile(String(total('P1')),'Active P1 work');
    tile(String(total('other')),'Other active work');tile(String(stats.active_inbox),'Active inbox');
    const table=el('table');table.className='prio';const head=el('tr');
    for(const name of ['UTC day','Created','Closed','P0 closed','P1 closed'])head.append(el('th',name));
    const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody');
    for(const day of [...stats.daily_work].reverse()) {
      const tr=el('tr');for(const value of [day.day,day.created,day.closed,day.closed_p0,day.closed_p1])tr.append(el('td',String(value)));
      tbody.append(tr);
    }
    table.append(tbody);const scroll=el('div',undefined,'scroll');scroll.append(table);closes.append(scroll);
    const grid=el('table');grid.className='prio';const title=el('tr');
    for(const value of ['Work','Open','In progress','Blocked','Deferred','Hooked'])title.append(el('th',value));
    grid.append(title);
    for(const group of ['P0','P1','other']) {
      const row=el('tr');row.append(el('th',group==='other'?'Other':group));
      for(const status of ['open','in_progress','blocked','deferred','hooked'])row.append(el('td',String(stats.active_work[group][status])));
      grid.append(row);
    }
    const wrap=el('div',undefined,'scroll');wrap.append(grid);board.append(wrap);
  }
  tile('UNKNOWN','Weekly quota — no verified Quipu observation');
  return {tiles,board,closes};
}
function renderStats(stats) {
  const view=statsView(stats);
  $('glance').replaceChildren(); // No old baked quotas or counts survive this path.
  $('pace-tiles').replaceChildren(...view.tiles.childNodes);
  const pace=$('pace');
  for(const child of [...pace.children])if(child.classList.contains('chart'))child.remove();
  const detail=el('div',undefined,'chart');detail.append(el('h3','Created and closed per day'),view.closes,source());
  pace.insertBefore(detail,$('pace-src'));
  $('pace-src').textContent=stats?'As of '+new Date(stats.observedMs).toLocaleString()+' · '+STATS_QUERY:'Stats UNKNOWN · '+STATS_QUERY;
  const board=$('v-board').querySelector('section');
  const heading=el('h2','The board');heading.id='h-board';
  board.replaceChildren(heading,view.board,source());
}
function render(next) {
  const surfaces=[$('asks'),$('prio'),$('glance'),$('pace-tiles'),$('pace'),$('v-board').querySelector('section')];
  const previous=surfaces.map(n=>[n,[...n.childNodes]]),oldSource=$('pace-src').textContent;
  const oldCount=$('ask-count').textContent,oldCountHidden=$('ask-count').hidden;
  try {window.briefRenderRows(next.view.rows);renderStats(next.view.stats);}
  catch(error){for(const [node,children]of previous)node.replaceChildren(...children);$('pace-src').textContent=oldSource;$('ask-count').textContent=oldCount;$('ask-count').hidden=oldCountHidden;throw error;}
  latest=next;
  clearTimeout(expiryTimer);
  if(next.view.stats)expiryTimer=setTimeout(()=>renderStats(null),Math.max(0,next.view.stats.observedMs+900001-Date.now()));
  $('asof').textContent='Rows checked '+new Date(next.appliedAt).toLocaleString();
}
function status(text){$('connection').textContent=text;$('connection').dataset.stale=/Stale|Unavailable|Paused/.test(text)?'true':'false';}
renderStats(null);
const provenance=el('p','Rows: daily_brief_rows_v1 · source-bound rows. Provenance is checked before rendering.','note');
$('v-next').append(provenance);$('v-today').append(provenance.cloneNode(true));
let client;
try {
  const definitions=await readJSON(new URL('./query-definitions.json',import.meta.url),{cap:32768});
  client=new BriefClient({config,definitions,render,status});
  // No durable cursor/cache: /version identifies a binary, not a storage epoch.
  if(!document.hidden)await client.start();
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)client.pause();
    else{if(latest?.view.stats && Date.now()-latest.view.stats.observedMs>900000)renderStats(null);client.start();}
  });
  window.addEventListener('pagehide',()=>client.pause(),{once:true});
} catch {status('Unavailable · brief assets could not be verified');}
