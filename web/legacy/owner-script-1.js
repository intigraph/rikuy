
(function(){
  const $=id=>document.getElementById(id);
  window.briefExplorerPromise=import('./explorer.js').then(m=>m.attachExplorer($('quipu-explorer')));
  const deskLink=document.createElement('button');deskLink.className='quipu-node-link';deskLink.id='all-desk';deskLink.textContent='All Desk cards';deskLink.disabled=true;$('asks').after(deskLink);window.briefExplorerPromise.then(api=>{
    if($('quipu-explorer').dataset.ready!=='true'||!Number.isSafeInteger(api.deskCount)||api.deskCount<0){deskLink.textContent='Snapshot unavailable';return;}
    deskLink.textContent='All Desk cards ('+api.deskCount+')';deskLink.disabled=false;deskLink.onclick=()=>{window.briefShow&&window.briefShow('explore');api.openDesk();};
  }).catch(()=>{deskLink.textContent='Snapshot unavailable';});
  const recordButton=(id,title)=>{const b=document.createElement('button');b.type='button';b.className='quipu-node-link';b.textContent='Open record';b.setAttribute('aria-label','Open '+id);b.addEventListener('click',()=>{window.briefShow&&window.briefShow('explore');window.briefExplorerPromise.then(api=>api.openItem(id,title)).catch(e=>{$('quipu-explorer').textContent='Explorer unavailable: '+e.message;});});return b;};
  const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
  const fmt=iso=>{try{const d=new Date(iso);return d.toISOString().slice(0,16).replace('T',' ')+'Z';}catch(e){return iso||'';}};
  const pillFor=s=>{const v=(s||'').toLowerCase();
    if(/wait|stiwi|blocked|deferred|held/.test(v))return 'wait';
    if(/done|closed|landed|live/.test(v))return 'ok';
    return 'work';};

  function renderToday(d){
    const box=$('today');box.replaceChildren();
    if(!d){box.append(el('p','empty','The day\'s summary appears here once sattler posts it.'));return;}
    box.append(el('p','head',d.headline||''));
    const ul=el('ul','pts');(d.points||[]).forEach(p=>ul.append(el('li',null,p)));box.append(ul);
    $('asof').textContent='Updated '+fmt(d.updated);
    box.classList.add('fresh');
  }
  function renderAsks(rows){
    const box=$('asks');box.replaceChildren();
    const ac=document.getElementById('ask-count');if(ac){ac.hidden=!rows.length;ac.textContent=String(rows.length);}
    if(!rows.length){box.append(el('p','empty','Waiting for verified brief rows.'));return;}
    rows.forEach((r,i)=>{const a=el('div','ask');a.append(el('div','num',String(i+1)),el('div','q',r.ask));
      a.append(el('div','meta',[r.item,r.where].filter(Boolean).join(' · ')),recordButton(r.item,r.ask));box.append(a);});
  }
  function renderPrio(rows){
    const tb=$('prio');tb.replaceChildren();
    if(!rows.length){const tr=el('tr');const td=el('td','empty','Waiting for verified brief rows.');td.colSpan=4;tr.append(td);tb.append(tr);return;}
    rows.forEach(r=>{const tr=el('tr');tr.className='st-'+(r.priority===0&&pillFor(r.state)!=='ok'?'p0':pillFor(r.state));
      tr.append(el('td','rank',String(r.rank)));
      const t=el('td');const top=el('div');
      const pr=el('span','pill '+(r.priority===0?'p0':'p1'),'P'+r.priority);
      top.append(pr,document.createTextNode(' '),el('span','title',r.title));
      t.append(top);if(r.next)t.append(el('div','next',r.next));
      const idl=el('div','next');idl.style.fontFamily='var(--font-mono)';idl.textContent=r.item+' ';idl.append(recordButton(r.item,r.title));t.append(idl);
      const chip=el('span','chip');const av=el('span','av',(r.owner||'?').slice(0,2));chip.append(av,document.createTextNode(r.owner||'unassigned'));t.append(chip);
      tr.append(t);tr.append(el('td','who',r.owner||'—'));
      const st=el('td');st.append(el('span','pill '+pillFor(r.state),r.state||''));tr.append(st);
      tb.append(tr);});
  }
  function renderLog(rows){
    const box=$('log');box.replaceChildren();
    if(!rows.length){box.append(el('p','empty','Each status update is added here, newest first.'));return;}
    rows.forEach(r=>{const e=el('div','entry');e.append(el('div','when',fmt(r.at)));e.append(el('div','h',r.headline));
      const ul=el('ul','pts');(r.points||[]).forEach(p=>ul.append(el('li',null,p)));e.append(ul);box.append(e);});
  }

  window.briefRenderRows=rows=>{
    renderAsks(rows.filter(r=>r.collection==='asks').map(r=>r.payload).sort((a,b)=>a.order-b.order));
    renderPrio(rows.filter(r=>r.collection==='priorities').map(r=>r.payload).sort((a,b)=>a.rank-b.rank));
  };
  renderToday(null);renderLog([]);
  $('today').replaceChildren(el('p','empty','Today’s summary has not moved to the live brief yet. The original brief remains available below.'));
  $('log').replaceChildren(el('p','empty','The curated status log is still in the original brief.'));
  $('asof').textContent='Live connection pending';

})();
