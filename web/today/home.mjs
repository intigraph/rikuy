// Read-only Today view. Independent bounded readers and admitted projection
// stats; no producer activation. Missing data never masquerades as empty.
import {readJSON,validateEndpoint} from './feed.mjs';
import * as readerConfig from './reader-config.mjs';
import {FeedSocket} from './feed-socket.mjs';
import {GRAPH} from './knowledge/model.mjs';
import {makeRecordReader} from './record-reader.mjs';
import {semwebReader} from './watches/model.mjs';
import {WATCHES,watchDefinition,watchParams,validateWatch,renderWatches,watchSeen,rememberWatches} from './knowledge/watches.mjs';
import {PriorityClient} from './priorities/model.mjs';
import {asks as decodeAsks,asksReader,later as decodeLater} from './asks/model.mjs';
import {deploys as decodeDeploys,paceParams} from './pace/model.mjs';
import {changes as decodeChanges,changesParams,changesReader} from './changes/model.mjs';
import {digest,logEntries} from './home-model.mjs';
import {StatsClient} from './projection-metrics.mjs';
import {heldReader} from './held/model.mjs';
import {coverageParams,recentlyDeferred,deferredReader} from './recently-deferred/model.mjs';
import {$,el,stamp,mark,unavailable,renderAsks,renderLater,renderPriorities,deployRows,tabs,renderOverview,setRecordReader,recordButton,cite} from './home-view.mjs';
const state={asks:undefined,later:undefined,priorities:undefined,deploys:undefined,stats:undefined,held:undefined,deferred:undefined,watches:undefined,changes:undefined},checked={},reasons={};
const now=()=>Date.now();
const request=async(url,options={})=>{
  let status;
  try{return await readJSON(url,{...options,fetcher:async(input,init)=>{
    const headers=new Headers(init.headers);headers.set('X-Quipu-Task',options.body?.name==='daily_brief_watch_semweb_v1'?'aegis-blh.4':'aegis-gah3');
    const response=await fetch(input,{...init,headers});status=response.status;return response;
  }});}
  catch(error){throw new Error(status>=400?`Reader returned HTTP ${status}`:error.message);}
};
const reason=key=>reasons[key]||(state[key]===undefined?'no verified response received yet':'source read or validation failed');
let clients=[],ended=false,feed=null,feedState='off';
let watchStorage;try{watchStorage=window.localStorage;}catch{/* browser-local state is optional */}
const previousWatchSeen=watchSeen(watchStorage,now());
function renderRows(){
  renderAsks(state.asks,reason('asks'),checked.asks||now());
  renderLater(state.later,reason('later'),checked.later||now());
  renderPriorities(state.priorities,reason('priorities'),checked.priorities||now());
}
function renderToday(){
  const d=digest(state,now()),box=$('today');mark(box).replaceChildren(el('p',d.headline,'head'));
  const ul=el('ul',undefined,'pts');for(const point of d.points.slice(0,3))ul.append(el('li',point));box.append(ul);
  box.append(el('time','Checked '+stamp(Math.max(...Object.values(checked),now())),'source-time'));
  const glance=$('glance');glance.replaceChildren();
  const tile=(value,label)=>{const card=el('div',undefined,'tile');card.append(el('div',value,'v'),el('div',label,'k'));glance.append(card);};
  tile(state.asks?String(state.asks.rows.length)+(state.asks.hasMore?'+':''):'—','Asks on the current page');tile(state.priorities?String(state.priorities.length):'—','Active P0 work');tile(state.deploys?String(state.deploys.rows.length):'—','Deploys · last 24 hours');
}
function renderPace(){
  const d=state.deploys,root=$('today-pace'),detail=$('pace-detail');
  if(!d){unavailable(root,reason('deploys'),checked.deploys||now());unavailable(detail,reason('deploys'),checked.deploys||now());}
  else{
    mark(root).replaceChildren(el('p',`${d.rows.length} deploys · ${d.counts.succeeded} succeeded, ${d.counts.rolledback} rolled back, ${d.counts.failed} failed`,'deploy-summary'));
    const recent=el('div');deployRows(recent,d.rows.slice(0,3));root.append(recent,el('time','Checked '+stamp(checked.deploys),'source-time'));
    if(!d.rows.length)root.append(el('p','No governed deploys in this verified 24-hour window.','note'));
    deployRows(detail,d.rows);
  }
  const tiles=$('pace-tiles');tiles.replaceChildren();
  for(const [kind,value] of [['Succeeded',d?.counts.succeeded],['Rolled back',d?.counts.rolledback],['Failed',d?.counts.failed]]){const card=el('div',undefined,'tile');card.append(el('div',value===undefined?'—':String(value),'v'),el('div',kind,'k'));tiles.append(card);}
  mark($('pace-src')).textContent=d?'Governed deploys · daily_brief_deploys_v1 · checked '+stamp(checked.deploys):'Unavailable: '+reason('deploys')+' · checked '+stamp(checked.deploys||now());
  if(d)cite($('pace-src'),'./pace/query.json');
}
function renderLog(){
  const box=$('log');mark(box).replaceChildren();
  if(!state.deploys){unavailable(box,reason('deploys'),checked.deploys||now());return;}
  const entries=logEntries(state.deploys);
  if(!entries.length)box.append(el('p','No governed deploys in the verified last 24 hours.','empty'));
  for(const row of entries){const entry=el('article',undefined,'entry');entry.dataset.event=row.event;entry.append(el('time',row.at,'when'),el('div',row.headline,'h'));const ul=el('ul',undefined,'pts');for(const point of row.points)ul.append(el('li',point));entry.append(ul);box.append(entry);}
}
function connection(){
  const keys=['asks','priorities','deploys','stats'],known=keys.filter(key=>state[key]!=null&&!reasons[key]),down=keys.filter(key=>state[key]==null||reasons[key]);
  mark($('connection')).textContent=`${known.length}/4 live sources available · checked ${stamp(now())}`+(down.length?' · '+down.map(key=>key+(state[key]!=null?': STALE · last successful read '+Math.max(0,Math.floor((now()-checked[key])/60000))+' min ago (':': unavailable (')+reason(key)+')').join(' · ')+(feed?' · '+feedText():''):' · '+feedText());
  $('connection').dataset.stale=String(down.length>0);$('asof').textContent='Checked '+stamp(now());
}
function renderStats(){
  const view=state.stats,summary=$('board-summary'),rows=$('board-daily'),source=$('board-src');rows.replaceChildren();
  if(!view){unavailable(summary,reason('stats'),checked.stats||now());mark(source).textContent='Board stats · no verified snapshot';return;}
  mark(summary).replaceChildren(el('p',`${view.active_total} active items · ${view.created_total} created · ${view.closed_total} closed in the last 31 UTC days`));
  summary.append(el('p','Active items by status (including inbox): '+Object.entries(view.active).map(([key,n])=>key.replaceAll('_',' ')+': '+n).join(' · '),'note'));
  for(const day of [...view.daily_work].reverse()){
    const row=el('tr');for(const value of [day.day,day.created,day.closed,day.closed_p0,day.closed_p1])row.append(el('td',String(value)));rows.append(row);
  }
  mark(source).textContent=`Quipu board_items · inbox excluded from created/closed counts · ${view.validity_rows} source rows checked · tx ${view.tx} · checked ${stamp(checked.stats)}`;
  cite(source,'./projection-metrics.mjs','Projection read definitions');
}
function renderHeld(){
  const root=$('held-work'),status=$('held-status'),view=state.held;
  if(!view){unavailable(root,reason('held'),checked.held||now());mark(status).textContent='Owner liveness · no verified lifecycle evidence';return;}
  mark(root).replaceChildren();
  const expired=s=>s.state==='expired'||now()>=s.observed_at*1000+1800000;
  const unknown=view.pending+view.states.filter(expired).length;
  const owners=view.states.filter(s=>s.state==='stopped'||s.state==='ceiling'||s.state==='expired');
  mark(status).textContent=`${owners.length} owners with stopped or UNKNOWN evidence${unknown?' · UNKNOWN coverage: '+unknown+' owners have missing or expired evidence':!view.complete?' · UNKNOWN: writer coverage is incomplete':''} · board tx ${view.tx??'not read'} · checked ${stamp(checked.held)}`;
  cite(status,'./held/head.json','Owner query');cite(status,'./held/work.json','Work query');
  if(!owners.length)root.append(el('p',view.complete&&!unknown?'No stopped owners in the verified writer scope.':'Stopped-owner coverage is UNKNOWN; an empty result cannot establish that every owner is live.','note'));
  for(const owner of owners){
    const card=el('article',undefined,'ask'),uncertain=expired(owner),label=uncertain?'UNKNOWN · last recorded '+owner.state:owner.state==='ceiling'?'ceiling-stopped':'stopped';
    card.append(el('h3',owner.agent+' · '+label));
    const rows=view.rows.filter(row=>row.owner===owner.owner);
    for(const row of rows){const line=el('p');line.append(el('span',`${row.id} · P${row.priority} · ${row.status} · ${row.title}${row.modified?' · updated '+row.modified:''} `));
      line.append(recordButton(row.id,row.title));card.append(line);}
    if(!rows.length)card.append(el('p',view.more?'No owned work within this bounded selection.':'No active owned work in the verified board read.','note'));
    const proof=el('details');proof.append(el('summary','Owner evidence'),el('p',`Observed ${stamp(owner.observed_at*1000)} · lifecycle revision ${owner.revision} · ${owner.fact}`,'meta'));card.append(proof);root.append(card);
  }
  if(view.more)root.append(el('p','More owned work exists beyond this bounded selection.','note'));
  root.append(el('p','Reassignment stays with the lead. Owner evidence expires after 30 minutes.','note'));
}
function renderDeferred(){
  const root=$('recently-deferred'),status=$('deferred-status'),view=state.deferred;
  if(!view){unavailable(root,reason('deferred'),checked.deferred||now());mark(status).textContent='Recently deferred · coverage UNKNOWN';return;}
  mark(root).replaceChildren();mark(status).textContent=`Since ${view.since} · latest recorded deferral per seed · checked ${stamp(checked.deferred)}`;
  cite(status,'./recently-deferred/query.json');
  for(const row of view.rows){const card=el('article',undefined,'ask deferred-receipt');card.append(el('h3',row.title),el('p',`${row.id} · ${row.status} · deferred ${row.deferredAt} by ${row.deferredBy.split('/').at(-1)}`,'meta'),recordButton(row.id,row.title));root.append(card);}
  if(!view.rows.length)root.append(el('p','No recorded deferrals since coverage began in this verified read.','note'));
  if(view.hasMore)root.append(el('p','Showing the latest 20; more recorded deferrals exist.','note'));
  root.append(el('p','Earlier missing receipts remain UNKNOWN. Re-deferral replaces the previous receipt; this is not a complete event history.','note'));
}
function renderWatchPanel(){
  const view={watches:{semweb:state.watches?{state:'observed',rows:state.watches,query:'daily_brief_watch_semweb_v1'}:{state:'UNKNOWN',reason:reason('watches')}} ,watchSeen:previousWatchSeen};
  mark($('watches')).replaceChildren(renderWatches(document,view));
  mark($('watches-status')).textContent=state.watches?'Last successful semweb check '+stamp(checked.watches):'Semweb coverage UNKNOWN · '+reason('watches');
}
function renderChanges(){
  const root=$('recent-closes'),source=$('changes-status'),view=state.changes;
  if(!view){unavailable(root,reason('changes'),checked.changes||now());mark(source).textContent='Recent closes · unavailable';return;}
  mark(root).replaceChildren();
  mark(source).textContent=`${view.rows.length} recent closes returned · last 24 hours · checked ${stamp(checked.changes)}`;
  cite(source,'./changes/query.json');
  const list=rows=>{const ul=el('ul',undefined,'pts');for(const row of rows){const li=el('li'),title=el('strong',row.title);li.dataset.item=row.id;li.append(title,el('time',' · '+stamp(Date.parse(row.closed))));if(row.reason)li.append(el('p',row.reason));li.append(recordButton(row.id,row.title));ul.append(li);}return ul;};
  if(!view.rows.length)root.append(el('p','No recent closes returned for this 24-hour window.','note'));
  else root.append(list(view.rows.slice(0,3)));
  if(view.rows.length>3){const more=el('details');more.append(el('summary',`${view.rows.length-3} more recent closes`),list(view.rows.slice(3)));root.append(more);}
  if(view.atLimit)root.append(el('p','Showing the latest 20; more may exist.','note'));
  root.append(el('p','A recorded close is not proof that a change was deployed or accepted.','note'));
}
function render(){
  renderRows();renderToday();renderPace();renderLog();renderStats();renderHeld();renderDeferred();renderWatchPanel();renderChanges();renderOverview(state,reasons,checked);connection();
  const targets={asks:['asks-status','ask-top','asks'],later:['later-status','later'],priorities:['priorities-status','prio'],deploys:['pace-src','today-pace','pace-detail','log'],stats:['board-summary','board-src'],held:['held-status','held-work'],deferred:['deferred-status','recently-deferred'],watches:['watches-status','watches'],changes:['changes-status','recent-closes']};
  for(const [key,ids] of Object.entries(targets)){
    const stale=state[key]!=null&&Boolean(reasons[key]);
    for(const id of ids){
      const node=$(id);node.dataset.stale=String(stale);
      if(stale&&node.tagName!=='TBODY'){const text='STALE · last successful read '+Math.max(0,Math.floor((now()-checked[key])/60000))+' min ago · live read failed';
        const label=el('span',text,'stale-badge');node.prepend(label);}
    }
  }
}
function feedText(){
  if(!feed)return 'auto-refresh while visible; board stats every minute';
  return {live:'live updates on',connecting:'connecting live updates',reconnecting:'live updates reconnecting; refreshing every 15 s',off:'live updates paused'}[feedState]+'; board stats every minute';
}
// The change watermark and log epoch, read without data: a cursor past the head returns no records.
async function watermark(endpoint,graph){
  const url=new URL(endpoint+'/changes');for(const [k,v] of Object.entries({graph,since:Number.MAX_SAFE_INTEGER,limit:1}))url.searchParams.set(k,String(v));
  const page=await request(url.href,{cap:16384});
  if(!Array.isArray(page?.records)||page.records.length||!Number.isSafeInteger(page.watermark_tx))throw new Error('Feed watermark UNKNOWN');
  return {tx:page.watermark_tx,epoch:page.source?.log_epoch};
}
function update(key){return value=>{
  // Retain the already-rendered result, not a second cache or sync store.
  // Persisted reload recovery comes from the shared WASM replica.
  if(value!==null||state[key]==null){state[key]=value;checked[key]=now();}
  if(key==='watches'&&value!==null)rememberWatches(watchStorage,{checkedAt:checked.watches,watches:{semweb:{state:'observed'}}});
  if(value!==null)delete reasons[key];else reasons[key]||='source read or validation failed';
  render();
};}
function status(key){return text=>{if(text.startsWith('UNKNOWN · ')){reasons[key]=text.replace(/^UNKNOWN · /,'').replace(/ · retrying$/,'');render();}};}
async function main(){
  tabs();render();
  const endpoint=validateEndpoint(readerConfig.readerOrigin,location.origin),def=path=>request(new URL(path,import.meta.url),{cap:16384});
  setRecordReader(makeRecordReader({query:query=>request(endpoint+'/query',{body:{query},cap:262144})}));
  // Each panel boots on its own: one missing manifest never cancels its peers.
  const boot=async(key,paths,build)=>{
    try{const definitions=await Promise.all(paths.map(def));const client=await build(definitions,endpoint);if(ended)return;clients.push(client);await client.start();if(document.hidden)client.pause();}
    catch(error){reasons[key]='Source setup failed: '+error.message;update(key)(null);}
  };
  const plain=(body,signal)=>request(endpoint+'/ask',{body,signal,cap:262144});
  // A stager that writes only readerOrigin leaves the feed off.
  if(readerConfig.liveFeed===true&&!ended){feed=new FeedSocket({origin:endpoint,watermark:graph=>watermark(endpoint,graph),onState:state=>{feedState=state;render();}});if(!document.hidden)feed.start();}
  // Seeds-graph panels only. Deploys keep their timer: a month window graph does not
  // exist until its first deploy, and quipu refuses an unknown graph (HTTP 400).
  // Held reads its lifecycle head from the default graph, which this feed does not carry.
  const seeds={feed,graphs:()=>[GRAPH]};
  const expect=(definition,name)=>{if(definition.name!==name)throw new Error('Query manifest identity changed');return definition;};
  await Promise.all([
    boot('changes',['./changes/query.json','./changes/admission.json'],async([definition,admission])=>new PriorityClient({definition,decode:decodeChanges,getParams:()=>changesParams(now()),deadlineMs:6000,refreshMs:15000,status:status('changes'),render:update('changes'),read:await changesReader({request,endpoint,definition,admission})})),
    boot('watches',['./watches/admission.json'],([admission])=>{const definition=watchDefinition(WATCHES[0]);return new PriorityClient({definition,decode:(body,def,time,params)=>validateWatch(body,def,params,time),getParams:()=>watchParams(now()),deadlineMs:6000,refreshMs:60000,status:status('watches'),render:update('watches'),read:semwebReader({request,endpoint,definition,admission})});}),
    boot('asks',['./asks/query.json','./asks/titles.json','./asks/item.json','./asks/control.json'],([ask,titles,item,control])=>{
      const definitions={asks:expect(ask,'daily_brief_asks_v4'),titles:expect(titles,'daily_brief_ask_titles_v1'),item:expect(item,'daily_brief_ask_item_v1')};
      return new PriorityClient({definition:definitions.asks,decode:body=>decodeAsks(body,definitions,now()),deadlineMs:15000,status:status('asks'),render:update('asks'),read:asksReader({request,endpoint,control:expect(control,'daily_brief_source_control_v3'),definitions}),...seeds});}),
    boot('later',['./later/query.json'],([definition])=>new PriorityClient({definition:expect(definition,'daily_brief_later_v1'),decode:decodeLater,status:status('later'),render:update('later'),read:plain,...seeds})),
    boot('priorities',['./priorities/query.json'],([definition])=>new PriorityClient({definition:expect(definition,'daily_brief_priorities_v3'),status:status('priorities'),render:update('priorities'),read:plain,...seeds})),
    boot('deploys',['./pace/query.json'],([definition])=>new PriorityClient({definition:expect(definition,'daily_brief_deploys_v1'),decode:decodeDeploys,getParams:()=>paceParams(now(),definition),status:status('deploys'),render:update('deploys'),read:plain})),
    boot('stats',[],()=>new StatsClient({request:(body,signal)=>request(endpoint+'/projections',{body,signal,cap:1048576}),status:status('stats'),render:update('stats')})),
    boot('deferred',['./recently-deferred/query.json','./recently-deferred/coverage.json','./asks/control.json'],([definition,coverage,control])=>new PriorityClient({definition:expect(definition,'daily_brief_recently_deferred_v1'),decode:recentlyDeferred,getParams:()=>coverageParams(coverage,now()),status:status('deferred'),render:update('deferred'),read:deferredReader({request,endpoint,definition,coverage,control:expect(control,'daily_brief_source_control_v3')}),...seeds})),
    boot('held',['./held/head.json','./held/work.json','./asks/control.json'],([head,work,control])=>new PriorityClient({definition:expect(head,'daily_brief_held_head_v1'),decode:body=>body,deadlineMs:10000,status:status('held'),render:update('held'),read:heldReader({request,endpoint,head,work:expect(work,'daily_brief_held_work_v1'),control:expect(control,'daily_brief_source_control_v3')})})),
  ]);
}
// Keep normal read budgets and late valid responses, but settle the interface
// within four seconds. Unavailable is honest, even while a read is in flight.
const deadline=setTimeout(()=>{for(const key of ['asks','priorities','deploys','stats'])if(state[key]===undefined){reasons[key]='no verified response within 4 seconds; reader may still finish';state[key]=null;checked[key]=now();}render();},4000);
document.addEventListener('visibilitychange',()=>{if(feed)document.hidden?feed.stop():feed.start();for(const client of clients)document.hidden?client.pause():client.start();});
window.addEventListener('pagehide',()=>{ended=true;clearTimeout(deadline);feed?.stop();clients.forEach(client=>client.pause());},{once:true});
(readerConfig.enabled===true?main():Promise.reject(new Error('Live readers await deployment admission'))).catch(error=>{for(const key of ['asks','priorities','deploys','stats']){reasons[key]='Source setup failed: '+error.message;state[key]=null;checked[key]=now();}render();});
// Cost-gated sections are explicit even if every live source fails.
for(const node of document.querySelectorAll('[data-cost-gate]')){node.append(el('time','Status checked '+stamp(now()),'source-time'));}
