// Presentation over the same reader/projection used by the panels. This owns
// no store, HTTP endpoint, synchronization, persistence or transaction applier.
const safeIRI=value=>typeof value==='string'&&/^(https?:\/\/|urn:)/.test(value)&&!/[\x00-\x20<>"{}|^`\\]/.test(value);
const age=(at,now)=>{
  const elapsed=Math.max(0,now-Date.parse(at));
  if(!Number.isFinite(elapsed))return 'age unknown';
  const minutes=Math.floor(elapsed/60000);return minutes<1?'less than a minute ago':minutes<60?minutes+' min ago':Math.floor(minutes/60)+' h ago';
};
export function mountRecord(root,{read,now=()=>Date.now()}={}){
  if(typeof read!=='function')throw new Error('A record reader is required');
  const doc=root.ownerDocument,node=(tag,text,cls)=>{const n=doc.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const heading=node('h2','Record'),status=node('p','Select an item to read its record.','record-source'),body=node('div'),graph=node('section');
  status.setAttribute('role','status');graph.className='record-graph';body.className='record-body';root.replaceChildren(heading,status,body,graph);
  let generation=0,selected=null;
  const open=async(entity,fallback='Record')=>{
    if(!safeIRI(entity))throw new Error('Invalid record identifier');
    const sequence=++generation,same=selected===entity;selected=entity;if(!same)heading.textContent=fallback;
    if(!same){body.replaceChildren();graph.replaceChildren();}
    status.textContent='Reading this record…';
    try{
      const record=await read(entity);
      if(sequence!==generation)return;
      if(!record||record.iri!==entity||typeof record.title!=='string'||!record.title.trim()||!Array.isArray(record.comments)||!Array.isArray(record.links)||record.comments.length>50||record.links.length>100)throw new Error('The record is incomplete or invalid.');
      heading.textContent=record.title;
      const at=record.asOf?.at,source=at?'Last updated '+age(at,now()):'Update time unknown';
      status.textContent=(record.asOf?.stale?'STALE · ':'')+source+(record.asOf?.tx!=null?' · transaction '+record.asOf.tx:'')+(record.asOf?.reason?' · '+record.asOf.reason:'');
      status.dataset.stale=String(record.asOf?.stale===true);
      status.dataset.updated=at||'';
      const metadata=node('dl',undefined,'record-meta');
      for(const [label,value]of [['Status',record.status],['Owner',record.owner],['Created',record.created],['Updated',record.modified]])metadata.append(node('dt',label),node('dd',value||'Not recorded'));
      const description=node('p',record.description||'No description has been recorded.','record-description');
      const comments=node('section');comments.append(node('h3','Recent comments'));
      if(!record.comments.length)comments.append(node('p','No comments in this record.'));
      for(const comment of record.comments){const entry=node('article');entry.append(node('p',comment.text),node('small',[comment.author||'Author not recorded',comment.created].filter(Boolean).join(' · ')));comments.append(entry);}
      if(record.commentsMore)comments.append(node('p','Showing the latest '+record.comments.length+' comments.'));
      const links=node('section');links.append(node('h3','Linked items'));
      for(const link of record.links){if(!safeIRI(link.iri))continue;const button=node('button',link.label||'Linked record');button.type='button';button.addEventListener('click',()=>open(link.iri,link.label));links.append(button);}
      if(!links.querySelector('button'))links.append(node('p','No linked items in this record.'));
      const details=node('details'),summary=node('summary','Technical details');details.append(summary,node('pre',JSON.stringify(record.raw??record,null,2)));
      body.replaceChildren(metadata,description,comments,links,details);
      renderGraph(record);
    }catch(error){
      if(sequence!==generation)return;
      status.dataset.stale=String(same&&body.childNodes.length>0);
      status.textContent=same&&body.childNodes.length?'STALE · last updated '+age(status.dataset.updated,now())+' · live record read failed.':'Record unavailable: '+(error?.message||'read failed');
    }
  };
  const renderGraph=record=>{
    graph.replaceChildren(node('h3','Connected records'),node('p','Choose a node to open it and explore its connections.'));
    const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 640 360');svg.setAttribute('role','group');svg.setAttribute('aria-label','Connected record graph');
    const draw=(tag,attrs,text)=>{const n=doc.createElementNS(svg.namespaceURI,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;};
    const neighbours=record.links.filter(link=>safeIRI(link.iri)).slice(0,12).map(link=>({...link,label:link.label||'Linked record'})),all=[{iri:record.iri,label:record.title},...neighbours];
    const point=i=>i===0?[320,180]:[320+235*Math.cos(2*Math.PI*(i-1)/Math.max(1,neighbours.length)),180+125*Math.sin(2*Math.PI*(i-1)/Math.max(1,neighbours.length))];
    for(let i=1;i<all.length;i++){const[x,y]=point(i);svg.append(draw('line',{x1:320,y1:180,x2:x,y2:y,class:'record-edge'}));}
    for(const[i,item]of all.entries()){
      const[x,y]=point(i),group=draw('g',{role:'button',tabindex:0,'aria-label':'Open '+item.label,class:i===0?'record-node selected':'record-node'});
      group.append(draw('circle',{cx:x,cy:y,r:i===0?32:22}),draw('text',{x,y:y+43,'text-anchor':'middle'},item.label.length>28?item.label.slice(0,26)+'…':item.label));
      const activate=()=>open(item.iri,item.label);group.addEventListener('click',activate);group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}});svg.append(group);
    }
    graph.append(svg);
    if(neighbours.length<record.links.length)graph.append(node('p','The graph shows the first '+neighbours.length+' connections; all links are listed above.'));
  };
  return {open};
}
