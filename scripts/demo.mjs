import {createServer} from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {verifiedDemo} from './demo-data.mjs';
const rows=verifiedDemo();
const root=resolve(import.meta.dirname,'../dist'),port=Number(process.env.PORT||4173);
const demoScript=await readFile(resolve(import.meta.dirname,'../web/legacy/demo.mjs'));
const asksPage=await readFile(resolve(import.meta.dirname,'demo-today-asks.html')),asksScript=await readFile(resolve(import.meta.dirname,'demo-today-asks.mjs'));
// The console look is demo-only (aegis-xwm C): it is served from source here and
// is not copied into dist, so the served brief_static pin does not carry it.
const consoleRoot=resolve(import.meta.dirname,'../web/console');
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.html':'text/html'};
const server=createServer(async(req,res)=>{
 try{
  const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(name==='/demo.mjs'){res.setHeader('content-type','text/javascript');return res.end(demoScript);}
  if(name==='/today/demo-asks/'){res.setHeader('content-type','text/html');return res.end(asksPage);}
  if(name==='/demo-today-asks.mjs'){res.setHeader('content-type','text/javascript');return res.end(asksScript);}
  if(name==='/demo-rows.json'){res.setHeader('content-type','application/json');return res.end(JSON.stringify(rows));}
  if(name==='/console'){res.writeHead(301,{location:'/console/'});return res.end();}
  if(name.startsWith('/console/')){
   const file=resolve(consoleRoot,'.'+(name.slice(8)||'/')+(name.endsWith('/')?'index.html':''));
   const actual=await realpath(file);if(!actual.startsWith(consoleRoot+sep))throw Error('path');
   res.setHeader('content-type',mime[extname(actual)]||'application/octet-stream');return res.end(await readFile(actual));
  }
  // The built root redirects to Today, whose live readers are off. The demo
  // serves the retained brief at the root so the checked sample rows are shown.
  const file=resolve(root,'.'+(name==='/'?'/legacy/index.html':name+(name.endsWith('/')?'index.html':'')));
  const actual=await realpath(file);if(!actual.startsWith(root+sep))throw Error('path');
  res.setHeader('content-type',mime[extname(actual)]||'application/octet-stream');const body=await readFile(actual);
  res.end(name==='/'?body.toString().replace('</body>','<script type="module" src="./demo.mjs"></script></body>'):body);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>{console.log('Validated demo: 2 priorities and 1 decision.');console.log(`Rikuy demo: http://127.0.0.1:${server.address().port}`);console.log(`Console look (synthetic, demo only): http://127.0.0.1:${server.address().port}/console/`);console.log(`Today decision cards (synthetic, signing not admitted): http://127.0.0.1:${server.address().port}/today/demo-asks/`);});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>server.close());
