import {scope,digest,utf8,Unsupported} from './protocol.mjs';
import {webauthnSigner} from './crypto.mjs';
import {IndexedStore} from './storage.mjs';
import {OfflineOutbox} from './outbox.mjs';
import {requireTransport} from './transport.mjs';
// Called only by a future reviewed adapter. Identity metadata is NOT enrollment
// authority: the protected native server must verify its existing binding again
// under the writer lock. This factory creates no credential or permission.
export async function createSession({identity,adapter,admitSnapshot,verifyReceipt,indexedDB=globalThis.indexedDB,getCredential}){
  const binding=scope(identity),transport=requireTransport(adapter);
  if(typeof admitSnapshot!=='function'||typeof verifyReceipt!=='function')throw new Unsupported('Admitted snapshot and protected receipt verification seams required');
  if(!getCredential&&!globalThis.navigator?.credentials?.get)throw new Unsupported('WebAuthn assertion capability unavailable; no signing fallback');
  const sign=webauthnSigner(identity,getCredential?{get:getCredential}:{});
  const name='brief-offline-v1:'+await digest(utf8(JSON.stringify(binding)));
  const store=await IndexedStore.open(name,indexedDB);
  const outbox=new OfflineOutbox({identity:binding,store,sign,transport,admitSnapshot,verifyReceipt});
  return {identity:binding,store,outbox};
}
