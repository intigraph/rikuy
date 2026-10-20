const node=(doc,tag,text)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=String(text);return n;};
export async function mount({root,status,outbox,store,identity,online=()=>navigator.onLine,events=window}){
  const doc=root.ownerDocument;let busy=false;
  const message=s=>{status.textContent=s;};
  const act=fn=>async()=>{if(busy)return;busy=true;try{await fn();}catch(error){message(error.message);}finally{busy=false;await render();}};
  async function render(){
    const fragment=doc.createDocumentFragment(),cached=await store.getSnapshot(),records=await store.list();
    fragment.append(node(doc,'p',`${online()?'Connected':'Offline'} · enrolled device ${identity.deviceId} · source snapshot ${cached?.tx??'UNAVAILABLE'}`));
    const refresh=node(doc,'button','Refresh asks');refresh.disabled=!online()||busy;refresh.onclick=act(async()=>{await outbox.refresh();message('Admitted ask snapshot refreshed');});fragment.append(refresh);
    const merge=node(doc,'button','Merge pending decisions');merge.disabled=!online()||busy;merge.onclick=act(async()=>{await outbox.flush();message('Reconnect results checked; unresolved intent is retained');});fragment.append(merge);
    const asks=node(doc,'section');asks.append(node(doc,'h2','Cached asks'));
    if(!cached)asks.append(node(doc,'p','No admitted ask snapshot. Reconnect before making decisions.'));
    for(const ask of cached?.asks??[]){
      const article=node(doc,'article');article.dataset.ask=ask.id;article.append(node(doc,'h3',ask.summary),node(doc,'p',`${ask.id} · revision ${ask.revision} · snapshot tx ${cached.tx} · expires ${ask.expiresAt}`));
      const label=node(doc,'label','Note (included by hash in your signed decision)'),note=node(doc,'textarea');note.maxLength=8192;label.append(note);article.append(label);
      for(const choice of ask.choices){const button=node(doc,'button',choice);button.dataset.choice=choice;button.disabled=busy;button.onclick=act(async()=>{await outbox.decide(ask.id,choice,note.value);message('PENDING · signed intent saved locally; it is not merged or execution permission');});article.append(button);}
      asks.append(article);
    }fragment.append(asks);
    const queue=node(doc,'section');queue.append(node(doc,'h2','Decision outbox'));
    if(!records.length)queue.append(node(doc,'p','No queued decisions.'));
    for(const record of records.sort((a,b)=>a.sequence-b.sequence)){
      const article=node(doc,'article');article.dataset.state=record.state;article.append(node(doc,'h3',`${record.state} · ${record.envelope.choice}`),node(doc,'p',record.cachedAsk.summary),node(doc,'p',`Revision ${record.envelope.askRevision} · snapshot tx ${record.envelope.snapshotTx} · device time ${record.envelope.deviceTime} (untrusted clock)`));
      if(record.reason)article.append(node(doc,'p',record.reason));
      if(record.state==='CONFLICT'){
        article.append(node(doc,'h4','Signed cached version'),node(doc,'pre',JSON.stringify(record.cachedAsk,null,2)),node(doc,'h4','Current server version'),node(doc,'pre',record.current?JSON.stringify(record.current,null,2):'Withdrawn or unavailable. No current version was invented.'),node(doc,'p','Refresh and make a new explicit decision if allowed. This intent will not be overwritten.'));
      }
      if(record.receipt)article.append(node(doc,'p',`Verified merge · server transaction ${record.receipt.transactionTx} · merged at ${record.receipt.mergedAt} · valid time ${record.receipt.validTime} (device clock untrusted)`));
      queue.append(article);
    }fragment.append(queue);root.replaceChildren(fragment);
  }
  const reconnect=act(async()=>{if(online()){await outbox.flush();message('Automatic reconnect merge completed or retained as uncertain');}}),offline=()=>{message('Offline · cached asks and pending decisions remain available');render();};
  events.addEventListener('online',reconnect);events.addEventListener('offline',offline);await render();
  if(online()){await outbox.flush();await render();}
  return {render,dispose(){events.removeEventListener('online',reconnect);events.removeEventListener('offline',offline);}};
}
