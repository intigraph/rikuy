import {scope} from '../deck/model.mjs';
import {identity as enrolledIdentity} from '../deck/evidence.mjs';
import {webauthnSigner} from '../deck/sign.mjs';
import {PendingWrite} from '../deck/pending.mjs';
import {PendingStore} from '../deck/storage.mjs';

// A factory a deployment may call to build readerConfig.askDecisionAdapter.
// Nothing in this repository calls it outside tests: home.mjs does not import
// or install it. home.mjs only accepts an adapter function that the deployment's
// reader config already supplies, and only when askDecisionsEnabled === true.
// The public build supplies none, so every card stays disabled with its reason.
// It composes the existing Deck signer, durable intent store, signed-write
// transport and native Seeds settlement for mountAskDecision. It owns no
// store, endpoint or writer of its own, and has no unsigned fallback: a
// decision is the enrolled operator's signature or it is not offered.
//
// deployment = {
//   identity,          enrolled signer {signer, audience, origin, rpId, actor}
//   environment,       {secure, origin, credentials} for the WebAuthn signer
//   boundary,          Deck graph/item boundary
//   readRequest,       admitted curator read: async row => request/answer bundle
//   transport,         attested-write {challenge, commit, receipt, readback}
//   nativeSettlement,  trusted Seeds port {settle, reconcile}
//   openStore,         optional; defaults to the Deck PendingStore
// }
export const NOT_ADMITTED = Object.freeze({
  signer: 'Signing not admitted on this deployment · no enrolled signer',
  origin: 'Signing not admitted on this deployment · this page is not the enrolled secure origin',
  curator: 'Signing not admitted on this deployment · no admitted curator read',
  transport: 'Signing not admitted on this deployment · no admitted signed-write transport',
  settlement: 'Signing not admitted on this deployment · no native Seeds settlement',
  boundary: 'Signing not admitted on this deployment · decision boundary not admitted',
  store: 'Signing not admitted on this deployment · durable intent storage unavailable',
  ask: 'Not a typed Ask · no curated decision request exists'
});
const refuse = key => Object.freeze({enabled: false, reason: NOT_ADMITTED[key]});
const fn = (value, ...names) => !!value && names.every(name => typeof value[name] === 'function');

export function makeAskDecisionAdapter(deployment = {}) {
  const {identity, environment, boundary, readRequest, transport, nativeSettlement, openStore = PendingStore.open} = deployment ?? {};
  // Checked once per factory: a missing piece refuses every card the same way.
  let who, b, problem = null;
  try {who = enrolledIdentity(identity);} catch {problem = 'signer';}
  if (!problem && (environment?.secure !== true || environment.origin !== who.origin || !fn(environment.credentials, 'get'))) problem = 'origin';
  if (!problem && typeof readRequest !== 'function') problem = 'curator';
  if (!problem && !fn(transport, 'challenge', 'commit', 'receipt', 'readback')) problem = 'transport';
  if (!problem && !fn(nativeSettlement, 'settle', 'reconcile')) problem = 'settlement';
  if (!problem) {try {b = scope(boundary);} catch {problem = 'boundary';}}
  let writer;
  return async row => {
    if (problem) return refuse(problem);
    if (row?.kind !== 'ask') return refuse('ask');
    if (!writer) {
      let store;
      try {store = await openStore(who, b);} catch {return refuse('store');}
      writer = new PendingWrite({identity: who, store, transport, sign: webauthnSigner(who, environment)});
    }
    const card = Object.freeze({...row});
    return Object.freeze({enabled: true, boundary: b, identity: who, writer, nativeSettlement, read: () => readRequest(card)});
  };
}
