// Explicit local extraction only: no timer, credentials, remote reads or ledger writes.
import {open,opendir,lstat,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {VERSION,windowSeconds,summarize} from '../web/economics/model.mjs';
const fields=['name','job','harness','model','state','item','head','request_id','attempt','retry_of','spawned_at','deadline','max_turns','max_context_k','turns','ended_at','torn_down_at'];
export async function extract(directory,start,end,{now=()=>Date.now()/1000,maxRows=2000,maxBytes=8*1024*1024,maxSeconds=3}={}){
  windowSeconds(start,end);directory=resolve(directory);
  const begun=performance.now(),before=await lstat(directory);
  if(!before.isDirectory()||before.isSymbolicLink())throw Error('Ledger must be a real directory.');
  const attempts=[],unknown=[],hash=createHash('sha256');let complete=true,bytes=0,scanned=0,entries=0;
  const dir=await opendir(directory);
  try{
    for await(const entry of dir){
      if(++entries>4000||performance.now()-begun>maxSeconds*1000){complete=false;unknown.push('directory enumeration bound reached');break;}
      if(!/^eph-(review|merge|triage|task)-[a-zA-Z0-9]+\.json$/.test(entry.name))continue;
      if(scanned>=maxRows||bytes>=maxBytes||performance.now()-begun>maxSeconds*1000){complete=false;unknown.push('read bound reached; population incomplete');break;}
      scanned++;
      let file;
      try{
        file=await open(join(directory,entry.name),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
        const a=await file.stat();
        if(!a.isFile()||a.size>65536||bytes+a.size>maxBytes)throw Error('bounded record required');
        const buffer=Buffer.alloc(a.size+1),{bytesRead}=await file.read(buffer,0,buffer.length,0),b=await file.stat();bytes+=bytesRead;
        if(bytesRead!==a.size||a.size!==b.size||a.mtimeNs!==b.mtimeNs||a.mtimeMs!==b.mtimeMs||a.ctimeMs!==b.ctimeMs)throw Error('record changed');
        const record=JSON.parse(buffer.subarray(0,bytesRead).toString());
        if(record.name+'.json'!==entry.name)throw Error('record identity mismatch');
        hash.update(entry.name).update(buffer.subarray(0,bytesRead));
        const row=Object.fromEntries(fields.filter(k=>record[k]!==undefined).map(k=>[k,record[k]]));
        row.cause=record.result?.cause;row.verdict=record.result?.verdict;attempts.push(row);
      }catch{unknown.push(entry.name+': unreadable, changed or invalid record');}
      finally{await file?.close();}
    }
  }finally{await dir.close().catch(()=>{});}
  const after=await lstat(directory);
  if(before.mtimeMs!==after.mtimeMs||before.ino!==after.ino){complete=false;unknown.push('directory changed during read');}
  const reader_sha256=createHash('sha256').update(await readFile(new URL(import.meta.url))).update(await readFile(new URL('../web/economics/model.mjs',import.meta.url))).digest('hex');
  const snapshot={version:VERSION,window:{start,end},observed_at:now(),complete,unknown,source:{reader:VERSION,reader_sha256,ledger_sha256:hash.digest('hex'),scanned,bytes,elapsed_ms:performance.now()-begun},attempts};
  summarize(snapshot);return snapshot;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [directory,start,end,...extra]=process.argv.slice(2);
  if(!directory||extra.length)throw Error('Usage: node scripts/ephemeral-economics.mjs LEDGER START_UTC END_UTC');
  console.log(JSON.stringify(await extract(directory,start,end),null,2));
}
