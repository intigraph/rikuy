// Client mirror of Quipu stored-query rendering for iri/text parameters
// (quipu src/mcp/named_query.rs ParamKind::render). The server stays the
// authority: a response whose SPARQL differs from this rendering is UNKNOWN.
import {Unknown,scalar} from './knowledge/model.mjs';
const UNSAFE_IRI=/[\s<>"{}|\\^`\p{Cc}]/u;
export function renderStored(def,params){
  if(Object.keys(params).sort().join(',')!==def.params.map(p=>p.name).sort().join(','))throw new Unknown('Query parameters changed');
  let text=def.template;
  for(const p of def.params){
    // Quipu's int kind takes a number or a decimal string; iri/text take strings.
    const raw=p.type==='int'&&typeof params[p.name]==='number'?String(params[p.name]):params[p.name];
    if(typeof raw!=='string')throw new Unknown('Invalid query parameter');
    let value;
    if(p.type==='iri'){if(!raw||UNSAFE_IRI.test(raw))throw new Unknown('Invalid IRI parameter');value=raw;}
    else if(p.type==='text')value=raw.replaceAll('\\','\\\\').replaceAll("'","\\'");
    else if(p.type==='int'){if(!/^-?[0-9]{1,18}$/.test(raw)||!Number.isSafeInteger(Number(raw)))throw new Unknown('Invalid integer parameter');value=String(Number(raw));}
    else throw new Unknown('Unsupported parameter kind');
    text=text.replaceAll('{'+p.name+'}',value);
  }
  return text;
}
export function storedRows(body,def,params){
  if(body?.query!==def.name||body.sparql!==renderStored(def,params))throw new Unknown('Stored query identity changed');
  if(!Array.isArray(body.rows)||body.count!==body.rows.length||body.truncated!==false&&body.truncated!==undefined||body.rows.length>=def.rowCap)throw new Unknown('Incomplete or overflowing query');
  return body.rows.map(row=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,scalar(v)])));
}
