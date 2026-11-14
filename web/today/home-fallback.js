// Independent of the module graph: an import/boot failure must not strand the
// first screen. No data or success is fabricated by this watchdog.
(() => {
  const stamp=()=>new Date().toISOString().replace(/\.\d{3}Z$/,'Z');
  const dated=(reason)=>'Unavailable: '+reason+' · '+stamp();
  const settle=reason=>{
    for(const node of document.querySelectorAll('[data-panel-fallback]')){
      if(!node.dataset.checked)node.textContent=dated(reason);
    }
    if(!document.getElementById('connection').dataset.checked){
      document.getElementById('connection').textContent=dated(reason);
      document.getElementById('connection').dataset.stale='true';
      document.getElementById('asof').textContent='Checked '+stamp();
    }
    for(const node of document.querySelectorAll('[data-cost-gate]')){
      if(!node.querySelector('time')){const time=document.createElement('time');time.className='source-time';time.textContent='Status checked '+stamp();node.append(time);}
    }
  };
  const timer=setTimeout(()=>settle('no verified response within 4 seconds; reader may still finish'),4000);
  window.addEventListener('pagehide',()=>clearTimeout(timer),{once:true});
  document.getElementById('brief-home-module').addEventListener('error',()=>settle('brief module failed to load'));
})();
