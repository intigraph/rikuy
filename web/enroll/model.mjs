import {coseKey} from './cose.mjs';

const equal = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
export const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
export async function fingerprint(bytes, crypto = globalThis.crypto) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(hash.slice(0, 8), b => b.toString(16).padStart(2, '0')).join('').match(/.{4}/g).join('-');
}
export function admitted(config, origin, secure) {
  if (config?.enabled !== true || !secure || typeof config.rpId !== 'string' || !config.rpId.includes('.')) throw new Error('Enrollment is not configured for this origin');
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(config.rpId) || config.origin !== `https://${config.rpId}` || origin !== config.origin) throw new Error('Enrollment is not configured for this origin');
}
export function creationOptions(config, crypto = globalThis.crypto) {
  return {publicKey: {
    challenge: crypto.getRandomValues(new Uint8Array(32)),
    rp: {id: config.rpId, name: 'Signing credential'},
    user: {id: crypto.getRandomValues(new Uint8Array(32)), name: 'signing-operator', displayName: 'Signing operator'},
    pubKeyCredParams: [{type: 'public-key', alg: -7}, {type: 'public-key', alg: -8}],
    authenticatorSelection: {userVerification: 'required', residentKey: 'preferred'},
    attestation: 'none', timeout: 60000
  }};
}
export async function publicPacket(credential, config, challenge, crypto = globalThis.crypto) {
  if (credential?.type !== 'public-key' || !(credential.rawId instanceof ArrayBuffer) || typeof credential.response?.getAuthenticatorData !== 'function') throw new Error('Authenticator export is unsupported');
  const id = new Uint8Array(credential.rawId);
  if (id.length < 1 || id.length > 1024 || credential.id !== base64url(id)) throw new Error('Invalid credential identifier');
  const raw = credential.response.getAuthenticatorData();
  if (!(raw instanceof ArrayBuffer)) throw new Error('Invalid authenticator data');
  const auth = new Uint8Array(raw);
  if (auth.length < 55 || auth.length > 4096) throw new Error('Invalid authenticator data size');
  const flags = auth[32];
  if ((flags & 0x45) !== 0x45 || (flags & 0x18) !== 0 || (flags & 0x80) !== 0) throw new Error('A verified single-device credential without extensions is required');
  const rpHash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(config.rpId)));
  if (!equal(auth.slice(0, 32), rpHash)) throw new Error('Relying party mismatch');
  const length = auth[53] * 256 + auth[54], end = 55 + length;
  if (length !== id.length || end >= auth.length || !equal(auth.slice(55, end), id)) throw new Error('Authenticator credential mismatch');
  const key = coseKey(auth, end);
  if (key.end !== auth.length) throw new Error('Trailing authenticator data');
  if (!(credential.response.clientDataJSON instanceof ArrayBuffer) || credential.response.clientDataJSON.byteLength > 4096) throw new Error('Invalid client data');
  const text = new TextDecoder('utf-8', {fatal: true}).decode(credential.response.clientDataJSON);
  const client = JSON.parse(text);
  if (JSON.stringify(client) !== text || client.type !== 'webauthn.create' || client.origin !== config.origin || client.challenge !== base64url(challenge) || client.crossOrigin !== false) throw new Error('Creation context mismatch');
  return Object.freeze({credential_id: base64url(id), cose_key: base64url(key.bytes), scheme: key.scheme, origin: config.origin, rp_id: config.rpId, fingerprint: await fingerprint(key.bytes, crypto), backup_eligible: false});
}
export async function createPublicCredential(config, environment) {
  admitted(config, environment.origin, environment.secure);
  if (typeof environment.credentials?.create !== 'function') throw new Error('WebAuthn is unavailable');
  const options = creationOptions(config, environment.crypto);
  const credential = await environment.credentials.create(options);
  if (!credential) throw new Error('Credential creation was cancelled');
  return publicPacket(credential, config, options.publicKey.challenge, environment.crypto);
}
