// Private standalone artifact. Never publish a real snapshot in repository assets.
import {readFile,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {summarize} from '../web/economics/model.mjs';
export async function artifact(snapshot){
 summarize(snapshot);
 const base=new URL('../web/economics/',import.meta.url);
 const [html,css,model,app]=await Promise.all(['index.html','style.css','model.mjs','app.mjs'].map(name=>readFile(new URL(name,base),'utf8')));
 const code=model.replaceAll('export ','')+'\n'+app.replace("import {summarize} from './model.mjs';",'').replace('export function render','function render');
 const payload=JSON.stringify(snapshot).replaceAll('<','\\u003c');
 return html.replace('<link rel="stylesheet" href="style.css">',`<style>${css}</style>`).replace('<script type="module" src="app.mjs"></script>',`<script type="module">${code}\nrender(${payload});</script>`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [file,...extra]=process.argv.slice(2);if(!file||extra.length)throw Error('Usage: node scripts/render-ephemeral-economics.mjs SNAPSHOT_JSON');
 const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
 try{
  const before=await handle.stat();if(!before.isFile()||before.size>8*1024*1024)throw Error('Regular snapshot of at most 8 MiB required.');
  const raw=Buffer.alloc(before.size+1),{bytesRead}=await handle.read(raw,0,raw.length,0),after=await handle.stat();
  if(bytesRead!==before.size||before.size!==after.size||before.mtimeMs!==after.mtimeMs)throw Error('Snapshot changed during read.');
  console.log(await artifact(JSON.parse(raw.subarray(0,bytesRead).toString())));
 }finally{await handle.close();}
}
