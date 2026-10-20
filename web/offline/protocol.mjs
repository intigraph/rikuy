// Proposed offline decision wire v1. It is NOT a session attestation, native
// online Deck challenge, current grant, or installed Quipu settlement API.
export const DOMAIN='quipu-brief-offline-decision-v1';
export class Refused extends Error {}
export class Unsupported extends Refused {}
export const utf8=s=>new TextEncoder().encode(s);
export const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
export const digest=async bytes=>hex(await crypto.subtle.digest('SHA-256',bytes));
const text=(s,max=4096,multiline=false)=>{if(typeof s!=='string'||!s.length||s.length>max||(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u:/[\u0000-\u001f]/u).test(s)||/\p{Surrogate}/u.test(s))throw new Refused('Invalid bounded text');return s;};
const integer=n=>{if(!Number.isSafeInteger(n)||n<1)throw new Refused('Positive exact integer required');return n;};
export const utc=s=>{text(s,32);if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s)||new Date(s).toISOString()!==s)throw new Refused('Canonical UTC milliseconds required');return s;};
const hash=s=>{if(typeof s!=='string'||! /^[0-9a-f]{64}$/.test(s))throw new Refused('SHA-256 hex required');return s;};
const iri=s=>{text(s,2048);const u=new URL(s);if(!['https:','urn:'].includes(u.protocol)||u.username||u.password)throw new Refused('Invalid absolute identifier');return s;};
export function scope(value){
  const origin=text(value.origin,2048),u=new URL(origin);
  if(u.protocol!=='https:'||u.origin!==origin||u.hostname!==value.rpId||u.username||u.password)throw new Refused('Exact dedicated HTTPS origin/RP required');
  return {audience:text(value.audience,256),origin,rpId:text(value.rpId,253),actor:text(value.actor,256),deviceId:text(value.deviceId,256),credentialId:text(value.credentialId,1024)};
}
export function request(value){
  const choices=value.choices;
  if(!Array.isArray(choices)||choices.length<1||choices.length>3||new Set(choices).size!==choices.length||choices.some(c=>!['approve','reject','changes'].includes(c)))throw new Refused('Unsupported choices');
  const result={id:iri(value.id),revision:integer(value.revision),policy:iri(value.policy),target:iri(value.target),summary:text(value.summary,4096,true),expiresAt:utc(value.expiresAt),choices:[...choices],curator:text(value.curator,256)};
  if(Object.keys(value).sort().join()!==Object.keys(result).sort().join())throw new Refused('Unsupported curated request field');return result;
}
export const requestHash=async ask=>digest(utf8(JSON.stringify(request(ask))));
export function envelope(value){
  if(value.domain!==DOMAIN)throw new Refused('Offline domain mismatch');
  const result={domain:DOMAIN,...scope(value),askId:iri(value.askId),askRevision:integer(value.askRevision),snapshotTx:integer(value.snapshotTx),requestHash:hash(value.requestHash),choice:text(value.choice,16),noteHash:hash(value.noteHash),clientNonce:hash(value.clientNonce),deviceTime:utc(value.deviceTime)};
  if(!['approve','reject','changes'].includes(result.choice))throw new Refused('Unsupported decision');
  if(Object.keys(value).sort().join()!==Object.keys(result).sort().join())throw new Refused('Unknown or missing envelope field');
  return result;
}
export const canonical=value=>utf8(JSON.stringify(envelope(value)));
export const sameScope=(a,b)=>JSON.stringify(scope(a))===JSON.stringify(scope(b));
export function nonce(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return hex(bytes);}
export async function snapshot(value,identity){
  if(!sameScope(value,identity))throw new Refused('Snapshot device/scope mismatch');
  integer(value.tx);utc(value.createdAt);utc(value.expiresAt);
  if(Date.parse(value.expiresAt)<=Date.parse(value.createdAt)||!Array.isArray(value.asks)||value.asks.length>100)throw new Refused('Snapshot bounds invalid');
  const asks=value.asks.map(request);if(new Set(asks.map(a=>a.id)).size!==asks.length)throw new Refused('Duplicate ask');
  return {...scope(value),tx:value.tx,createdAt:value.createdAt,expiresAt:value.expiresAt,asks};
}
export async function makeEnvelope({identity,cached,ask,choice,note,now}){
  if(typeof note!=='string'||utf8(note).length>8192||/\p{Surrogate}/u.test(note))throw new Refused('Note exceeds supported bounds');
  if(!ask.choices.includes(choice))throw new Refused('Choice absent from cached request');
  return envelope({domain:DOMAIN,...scope(identity),askId:ask.id,askRevision:ask.revision,snapshotTx:cached.tx,requestHash:await requestHash(ask),choice,noteHash:await digest(utf8(note)),clientNonce:nonce(),deviceTime:new Date(now).toISOString()});
}
