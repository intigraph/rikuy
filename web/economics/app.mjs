import {summarize} from './model.mjs';
const $=id=>document.getElementById(id),show=n=>n===null||n===undefined?'UNKNOWN':Number.isFinite(n)?Math.round(n*100)/100:String(n);
function rows(id,data){$(id).replaceChildren(...data.map(cells=>{const row=document.createElement('tr');for(const value of cells){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}return row;}));}
export function render(snapshot){
  const s=summarize(snapshot);$('report').hidden=false;
  $('status').textContent=s.state+' · Snapshot loaded';
  $('scope').textContent=`UTC [${s.window.start}, ${s.window.end}) · observed through ${new Date(s.observed_at*1000).toISOString()}`;
  $('tiles').replaceChildren(...[[s.spawned,'spawned attempts'],[s.terminal,'ended'],[s.live,'live / censored'],[s.retries,'retries'],[s.work_requests.covered_attempts?s.work_requests.known:'UNKNOWN','bound work requests']].map(([n,label])=>{const div=document.createElement('div');div.className='tile';const strong=document.createElement('strong');strong.textContent=n;div.append(strong,document.createTextNode(label));return div;}));
  rows('daily',s.daily.map(d=>[d.day,d.job,d.n]));
  rows('cohorts',s.cohorts.map(c=>[`${c.job} / ${c.harness} / ${c.model}`,`${show(c.lifetime_seconds)} / ${show(c.max_turns)} / ${show(c.max_context_k)}`,`${c.terminal} / ${c.live}`,`${c.duration_n}${c.low_n?' · low n':''}`,show(c.p50),show(c.p90),`${c.exhausted} / ${c.terminal} (${c.exhaustion_ratio===null?'UNKNOWN':show(100*c.exhaustion_ratio)+'%'})`,c.exhaustion_upper===null?'UNKNOWN':show(100*c.exhaustion_upper)+'%',JSON.stringify(c.causes),`${show(c.teardown_p50)} (${c.teardown_n})`]));
  $('unknown').textContent=`Tokens/job: ${s.tokens.state}, coverage ${s.tokens.covered}/${s.tokens.total}. ${s.tokens.reason} Crew-minutes and token savings: ${s.savings.state}. ${s.savings.reason}`;
  rows('attempts',s.attempts.map(r=>[`${r.name} / ${r.item||'UNKNOWN'}`,r.retry_of||'—',`${r.verdict||'UNKNOWN'} / ${r.cause||'UNKNOWN'}`,r.age!==null?`live age ${show(r.age)}`:show(r.duration)]));
  $('coverage').textContent=JSON.stringify({state:s.state,source:s.source,unreadable_or_capped:s.unknown,invalid:s.invalid,work_requests:s.work_requests,method:'UTC spawned cohort; nearest-rank percentiles; first stored terminal cause; missing usage/baseline is UNKNOWN'},null,2);
}
$('file').addEventListener('change',async event=>{
  try{const file=event.target.files[0];if(!file)return;if(file.size>8*1024*1024)throw Error('Snapshot exceeds 8 MiB.');render(JSON.parse(await file.text()));}
  catch(error){$('status').textContent='UNKNOWN · '+error.message+' · Any displayed snapshot is the previous successful read, now stale.';}
});
