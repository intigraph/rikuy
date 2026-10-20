
(function(){
  const tabs=[...document.querySelectorAll('.tabs [role=tab]')];
  const show=(v,focus)=>{if(!tabs.some(t=>t.dataset.v===v))v='today';
    tabs.forEach(t=>{const on=t.dataset.v===v;t.setAttribute('aria-selected',on);t.tabIndex=on?0:-1;document.getElementById('v-'+t.dataset.v).hidden=!on;if(on&&focus)t.focus();});
    try{localStorage.setItem('brief-tab',v);}catch(e){}
    if(window.paceRender)window.paceRender(v);scrollTo({top:0});};
  window.briefShow=show;
  tabs.forEach((t,i)=>{t.addEventListener('click',()=>{show(t.dataset.v);history.replaceState(null,'','#'+t.dataset.v);});
    t.addEventListener('keydown',e=>{const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(!d)return;e.preventDefault();show(tabs[(i+d+tabs.length)%tabs.length].dataset.v,true);});});
  let start=(location.hash||'').slice(1);if(!start){try{start=localStorage.getItem('brief-tab')||'';}catch(e){}}
  show(start||'today');
})();
