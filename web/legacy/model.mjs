import {contract} from './config.mjs';
export const GRAPH = contract.graph;
export const ROW_QUERY = 'daily_brief_rows_v1';
export const STATS_QUERY = 'daily_brief_stats_v1';
const XSD = 'http://www.w3.org/2001/XMLSchema#';
const SOURCE_SHA = contract.statsSourceHash;
const encoder = new TextEncoder();
const fail = message => { throw new Error(message); };
export const integer = value => {
  if (value && typeof value === 'object') {
    if (![XSD+'integer', XSD+'int', XSD+'long'].includes(value.datatype)) fail('Unknown integer datatype');
    value = value.value;
  }
  if (typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) value = Number(value);
  if (!Number.isSafeInteger(value) || value < 0) fail('Unsafe integer');
  return value;
};
const positive = value => { const n = integer(value); if (!n) fail('Positive revision required'); return n; };
const count = value => {
  if (typeof value !== 'number' || integer(value) > 10000000) fail('Invalid bounded count');
  return value;
};
const string = (value, max = 8192) => {
  if (typeof value !== 'string' || value.length > max) fail('Invalid text');
  return value;
};
export function validateRows(body) {
  if (body?.query !== ROW_QUERY || (body.truncated ?? false) !== false || !Array.isArray(body.rows)
      || body.count !== body.rows.length || body.count >= 200 || body.count < 1) fail('Brief row coverage UNKNOWN');
  const seen = new Set();
  const rows = body.rows.map(row => {
    const spec = {collection:row.collection, document:row.document};
    if (!['priorities','asks'].includes(row.collection) || typeof row.document!=='string'
        || !/^[a-zA-Z0-9_.-]{1,128}$/.test(row.document)
        || row.row!==contract.rowPrefix+
          sha256(JSON.stringify([contract.source,row.collection,row.document])+'\n')
        || seen.has(row.row) || row.curator !== contract.curator) fail('Brief identity UNKNOWN');
    seen.add(row.row);
    const raw = string(row.payload, 16384);
    if (encoder.encode(raw).length > 16384) fail('Payload exceeds byte cap');
    const payload = JSON.parse(raw);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('Invalid row payload');
    string(payload.item, 256);
    if (payload.item && (!payload.item.startsWith(contract.itemPrefix) || !/^[a-zA-Z0-9.-]+$/.test(payload.item))) fail('Invalid item binding');
    if (spec.collection === 'priorities') {
      string(payload.title, 1024); string(payload.next); string(payload.owner, 128); string(payload.state, 512);
      if(typeof payload.rank!=='number') fail('Invalid rank');
      positive(payload.rank);
      if (typeof payload.priority !== 'number' || integer(payload.priority) > 4) fail('Invalid priority');
    } else if (spec.collection === 'asks') {
      string(payload.ask); string(payload.where, 2048); count(payload.order);
    } else fail('Unsupported collection');
    return { iri: row.row, collection: row.collection, document: row.document,
      revision: positive(row.revision), sourceVersion: positive(row.sourceVersion), payload };
  });
  return rows;
}

// SHA-256 over UTF-8 bytes; usable on the explicitly HTTP-only LAN origin.
// This is an integrity checksum, not a writer signature or origin/human proof.
export function sha256(text) {
  const bytes = encoder.encode(text), size = Math.ceil((bytes.length + 9) / 64) * 64;
  const data = new Uint8Array(size); data.set(bytes); data[bytes.length] = 128;
  const view = new DataView(data.buffer); view.setUint32(size - 4, bytes.length * 8, false);
  const h = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const k = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const r = (n,s) => (n >>> s) | (n << (32-s));
  for (let block=0; block<size; block+=64) {
    const w = new Uint32Array(64);
    for (let i=0;i<16;i++) w[i]=view.getUint32(block+i*4,false);
    for (let i=16;i<64;i++) {
      const a=w[i-15], b=w[i-2];
      w[i]=w[i-16]+(r(a,7)^r(a,18)^(a>>>3))+w[i-7]+(r(b,17)^r(b,19)^(b>>>10));
    }
    let [a,b,c,d,e,f,g,z]=h;
    for (let i=0;i<64;i++) {
      const t=(z+(r(e,6)^r(e,11)^r(e,25))+((e&f)^((~e)&g))+k[i]+w[i])>>>0;
      const u=((r(a,2)^r(a,13)^r(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
      z=g;g=f;f=e;e=(d+t)>>>0;d=c;c=b;b=a;a=(t+u)>>>0;
    }
    [a,b,c,d,e,f,g,z].forEach((v,i)=>{h[i]=(h[i]+v)>>>0;});
  }
  return [...h].map(v=>v.toString(16).padStart(8,'0')).join('');
}

export function validateStats(body, now = Date.now()) {
  if (body?.query !== STATS_QUERY || (body.truncated ?? false) !== false || body.count !== 1 || body.rows?.length !== 1)
    fail('Stats UNKNOWN');
  const row=body.rows[0], raw=string(row.payload,12288);
  if (encoder.encode(raw).length>12288 || row.source!=='seeds-board-metrics' || sha256(raw)!==row.hash)
    fail('Stats integrity UNKNOWN');
  let observed=row.observed;
  if (observed && typeof observed==='object') {
    if (observed.datatype!==XSD+'dateTime') fail('Stats time UNKNOWN');
    observed=observed.value;
  }
  const p=JSON.parse(raw), at=Date.parse(observed);
  if (!Number.isFinite(at) || at>now || now-at>900000 || Date.parse(p.observed_at)!==at
      || p.contract!=='daily-brief-board-stats/v1' || p.source_query!=='seeds_board_metrics_v1'
      || p.source_definition_sha256!==SOURCE_SHA
      || JSON.stringify(p.coverage)!==JSON.stringify(contract.statsCoverage)
      || p.semantics!=='retained timestamps; current kind and priority') fail('Stats freshness/coverage UNKNOWN');
  const date=new Date(at), last=date.toISOString().slice(0,10), first=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()-30)).toISOString().slice(0,10);
  const tomorrow=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()+1)).toISOString().slice(0,10);
  if(p.window?.from!==first+'T00:00:00Z' || p.window?.to!==tomorrow+'T00:00:00Z'
      || p.daily_work?.length!==31) fail('Stats cohort UNKNOWN');
  for(const group of ['P0','P1','other']) for(const status of ['open','in_progress','blocked','deferred','hooked']) count(p.active_work?.[group]?.[status]);
  count(p.active_inbox);
  for(let i=0;i<31;i++) {
    const day=new Date(Date.parse(first+'T00:00:00Z')+i*86400000).toISOString().slice(0,10), r=p.daily_work[i];
    if(r.day!==day || r.day>last) fail('Stats day coverage UNKNOWN');
    for(const key of ['created','closed','closed_p0','closed_p1']) count(r[key]);
    if(r.closed_p0+r.closed_p1>r.closed) fail('Stats count control UNKNOWN');
  }
  return {...p, observedMs:at};
}

export function validatePage(page, since, eventId) {
  if (!page || page.capture!=='new_values' || !Array.isArray(page.records)) fail('Feed protocol UNKNOWN');
  since=integer(since);const next=integer(page.next_tx), watermark=integer(page.watermark_tx);
  if(next<since || watermark<since || (eventId!==undefined && String(next)!==eventId)) fail('Feed cursor UNKNOWN');
  let tx=since, sequence=-1;
  for(const record of page.records) {
    const id=integer(record.tx), n=integer(record.sequence);
    if(record.graph!==GRAPH || id<=since || id<tx || id>next || !['assert','retract','tombstone'].includes(record.op)
        || typeof record.entity!=='string' || typeof record.attribute!=='string') fail('Feed scope/order UNKNOWN');
    if(id!==tx) {tx=id;sequence=-1;}
    if(n!==sequence+1) fail('Feed sequence UNKNOWN');
    sequence=n;
  }
  if(page.records.length ? tx!==next : next!==since) fail('Incomplete feed page');
  return {next, watermark, changed:page.records.length>0};
}
