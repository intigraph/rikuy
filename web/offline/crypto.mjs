import {canonical,digest,utf8,Refused,Unsupported,sameScope} from './protocol.mjs';
export function b64(bytes){let s='';for(const n of new Uint8Array(bytes))s+=String.fromCharCode(n);return btoa(s).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
export function unb64(s){if(typeof s!=='string'||!s.length||s.length>16384||! /^[A-Za-z0-9_-]+$/.test(s))throw new Refused('Invalid base64url');const bytes=Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));if(b64(bytes)!==s)throw new Refused('Noncanonical base64url');return bytes;}
// WebAuthn ES256 transports ASN.1 DER; WebCrypto verification expects P1363.
// The native verifier continues to consume the original retained DER bytes.
export function derToP1363(bytes){
  if(bytes[0]!==48||bytes[1]!==bytes.length-2||bytes.length>72)throw new Refused('Invalid ES256 DER');
  let offset=2;const result=new Uint8Array(64);
  for(let i=0;i<2;i++){
    if(bytes[offset++]!==2)throw new Refused('Invalid DER integer');const size=bytes[offset++],part=bytes.slice(offset,offset+size);offset+=size;
    if(!size||size>33||part.length!==size||(part[0]&128)||(size>1&&part[0]===0&&!(part[1]&128)))throw new Refused('Noncanonical DER integer');
    const raw=part[0]===0?part.slice(1):part;if(raw.length>32)throw new Refused('Oversized DER integer');result.set(raw,i*32+32-raw.length);
  }
  if(offset!==bytes.length)throw new Refused('Trailing DER bytes');return result;
}
// Same challenge derivation as verdict_schemes::webauthn_challenge(message).
// The inner message has a DISTINCT offline domain; online protocols unchanged.
export async function challenge(value){const message=canonical(value),prefix=utf8('quipu-verdict-webauthn-v1\0'),all=new Uint8Array(prefix.length+message.length);all.set(prefix);all.set(message,prefix.length);return new Uint8Array(await crypto.subtle.digest('SHA-256',all));}
export function webauthnSigner(identity,{get=options=>navigator.credentials.get(options)}={}){
  if(!['webauthn-es256','webauthn-eddsa'].includes(identity.scheme))throw new Unsupported('Enrolled WebAuthn scheme required; no software-key fallback');
  return async value=>{
    if(!sameScope(value,identity))throw new Refused('Signing scope changed');
    const credential=await get({publicKey:{challenge:await challenge(value),rpId:identity.rpId,allowCredentials:[{id:unb64(identity.credentialId),type:'public-key'}],userVerification:'required',timeout:60000}});
    if(!credential||credential.type!=='public-key'||b64(credential.rawId)!==identity.credentialId)throw new Refused('Enrolled credential was not returned');
    const r=credential.response;
    return {scheme:identity.scheme,credentialId:identity.credentialId,authenticatorData:b64(r.authenticatorData),clientDataJSON:b64(r.clientDataJSON),signature:b64(r.signature)};
  };
}
// Executable source-conformance verifier for SYNTHETIC fixtures. Production
// Quipu must use its protected registry and existing native verifier, not a key
// or identity supplied in this browser envelope.
export async function verifyFixtureAssertion(value,assertion,registered){
  if(assertion.scheme!==registered.scheme||assertion.credentialId!==registered.credentialId||!sameScope(value,registered))throw new Refused('Unenrolled credential or changed scope');
  const ad=unb64(assertion.authenticatorData),clientBytes=unb64(assertion.clientDataJSON);
  const clientText=new TextDecoder('utf-8',{fatal:true}).decode(clientBytes),client=JSON.parse(clientText);
  // Synthetic producer uses this exact serialization. Refuse duplicate JSON
  // fields and ambiguous variants rather than silently accepting last-wins.
  if(clientText!==JSON.stringify({type:client.type,challenge:client.challenge,origin:client.origin,crossOrigin:false})||client.type!=='webauthn.get'||client.origin!==registered.origin||client.crossOrigin!==false||client.challenge!==b64(await challenge(value)))throw new Refused('Wrong origin/challenge/client data');
  if(ad.length!==37||!(ad[32]&1)||!(ad[32]&4)||await digest(utf8(registered.rpId))!==Array.from(ad.slice(0,32),x=>x.toString(16).padStart(2,'0')).join(''))throw new Refused('RP/UP/UV refused');
  const count=new DataView(ad.buffer,ad.byteOffset,ad.byteLength).getUint32(33);
  if((count||registered.counter)&&count<=registered.counter)throw new Refused('Signature counter did not advance');
  const clientHash=new Uint8Array(await crypto.subtle.digest('SHA-256',clientBytes)),signed=new Uint8Array(ad.length+32);signed.set(ad);signed.set(clientHash,ad.length);
  const algorithm=registered.scheme==='webauthn-es256'?{name:'ECDSA',hash:'SHA-256'}:{name:'Ed25519'};
  const raw=unb64(assertion.signature),signature=registered.scheme==='webauthn-es256'?derToP1363(raw):raw;
  if(!await crypto.subtle.verify(algorithm,registered.publicKey,signature,signed))throw new Refused('Forged signature');
  return {counter:count};
}
