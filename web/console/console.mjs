// Numbers roll up once on load; the markup already holds the final values, so
// reduced motion (and no-JS) shows them without any frame loop.
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!reduced){
  for(const node of document.querySelectorAll('[data-count]')){
    const end=Number(node.dataset.count),dp=Number(node.dataset.dp||0),t0=performance.now();
    const step=now=>{const k=Math.min(1,(now-t0)/900);node.textContent=(end*(1-(1-k)**3)).toFixed(dp);if(k<1)requestAnimationFrame(step);};
    requestAnimationFrame(step);
  }
}
document.documentElement.dataset.consoleReady='true';
