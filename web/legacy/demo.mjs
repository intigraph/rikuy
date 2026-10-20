const box=document.getElementById('demo');
if(box){const r=await fetch('./demo-rows.json');if(r.ok){const rows=await r.json();window.briefRenderRows(rows.map(row=>({collection:row.collection,payload:row.payload})));box.textContent='Synthetic demo — no Quipu connection, signing or production data.';}}
