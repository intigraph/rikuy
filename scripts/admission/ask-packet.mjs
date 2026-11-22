// Pure preparation validator. This module never authorizes or performs a write.
const exact = (v, keys) => {
  if (!v || typeof v !== 'object' || Array.isArray(v) || Object.keys(v).sort().join('|') !== [...keys].sort().join('|')) throw Error('Unknown or missing preparation field');
};
const text = v => {if (typeof v !== 'string' || !v.trim() || v.length > 4096 || /[\u0000-\u001f]/.test(v)) throw Error('Invalid bounded metadata'); return v;};
export const requiredPins = Object.freeze([
  'source.rikuy', 'source.seeds', 'artifact.nativeAdapter',
  'instance.storeLineage', 'instance.requestGraph', 'instance.answerGraph', 'instance.itemGraph',
  'key.curatorCredentialLocation', 'key.settlerCredentialLocation', 'key.humanSigner', 'key.humanFingerprint',
  'grant.curator', 'grant.settler', 'grant.humanSigner',
  'operator.enrollmentLane', 'operator.custodyCurator', 'operator.custodySettler',
  'operator.trustedOrigin', 'operator.wrongOriginCors', 'operator.humanCeremony',
  'cost.requestReader', 'cost.itemReader', 'cost.answerReaders', 'cost.boundAskProfile'
]);
export function assessPacket(value) {
  exact(value, ['schema', 'mode', 'pins', 'rollback', 'acceptance']);
  if (value.schema !== 'rikuy-ask-preparation/v1' || value.mode !== 'PREPARATION_ONLY') throw Error('Preparation-only schema required');
  if (!Array.isArray(value.pins) || value.pins.length !== requiredPins.length) throw Error('Complete explicit pin inventory required');
  const pins = new Map();
  for (const pin of value.pins) {
    exact(pin, ['id', 'state', 'value', 'evidence']); text(pin.id);
    if (!requiredPins.includes(pin.id) || pins.has(pin.id) || !['SELECTED', 'UNKNOWN'].includes(pin.state)) throw Error('Unknown, duplicate or invalid pin');
    if (pin.state === 'SELECTED') {text(pin.value); text(pin.evidence);}
    else if (pin.value !== null) throw Error('UNKNOWN has no guessed value');
    else text(pin.evidence);
    pins.set(pin.id, pin);
  }
  exact(value.rollback, ['disable', 'revoke', 'retain', 'verify']);
  for (const v of Object.values(value.rollback)) text(v);
  exact(value.acceptance, ['smoke', 'forgery', 'replay', 'staleAsk', 'staleTarget', 'lostReply', 'revocation']);
  for (const v of Object.values(value.acceptance)) text(v);
  // Do not echo pin values: even a mistakenly supplied secret stays out of logs.
  return Object.freeze({schema: value.schema, mode: value.mode,
    selected: value.pins.filter(p => p.state === 'SELECTED').map(p => p.id),
    unknown: value.pins.filter(p => p.state === 'UNKNOWN').map(p => p.id),
    runtimeAuthorized: false});
}
