import {createServer} from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {verifiedDemo} from './demo-data.mjs';
const rows=verifiedDemo();
const root=resolve(import.meta.dirname,'../dist'),port=Number(process.env.PORT||4173);
const demoScript=await readFile(resolve(import.meta.dirname,'../web/legacy/demo.mjs'));
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.html':'text/html'};
const server=createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/demo.mjs'){res.setHeader('content-type','text/javascript');return res.end(demoScript);}
  if(name==='/demo-rows.json'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(rows));}
  const file=resolve(root,'.'+name+(name.endsWith('/')?'index.html':''));
  const actual=await realpath(file);if(!actual.startsWith(root+sep))throw Error('path');
  res.setHeader('content-type',mime[extname(actual)]||'application/octet-stream');const body=await readFile(actual);
  res.end(name==='/'?body.toString().replace('</body>','<script type="module" src="./demo.mjs"></script></body>'):body);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>{console.log('Validated demo: 2 priorities and 1 decision.');console.log(`Rikuy demo: http://127.0.0.1:${server.address().port}`);});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
