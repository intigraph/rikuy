import {validateRows,sha256,ROW_QUERY,GRAPH} from '../web/legacy/model.mjs';
import {contract} from '../web/legacy/config.mjs';
export function demoRows(){
 const rows=[['priorities','one',{item:'demo-one',title:'Verify the source',next:'Read the evidence',owner:'demo',state:'open',priority:1,rank:1}],['priorities','two',{item:'demo-two',title:'Keep unknowns visible',next:'Wait for a receipt',owner:'demo',state:'blocked',priority:1,rank:2}],['asks','one',{item:'demo-two',ask:'Choose the next bounded step',where:'Synthetic example',order:1}]].map(([collection,document,payload])=>({row:contract.rowPrefix+sha256(JSON.stringify([contract.source,collection,document])+'\n'),collection,document,payload:JSON.stringify(payload),revision:1,sourceVersion:1,curator:contract.curator}));
 return {query:ROW_QUERY,count:rows.length,truncated:false,rows};
}
export const verifiedDemo=()=>validateRows(demoRows());
