// Bounded online attested-write values. This is not the offline wire protocol.
export class Unknown extends Error {}
export const NS = 'https://intigraph.github.io/rikuy/ns#';
export const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
export const utf8 = value => new TextEncoder().encode(value);
export function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== [...keys].sort().join('|')) throw new Unknown('Unknown or missing field');
}
export function text(value, max = 4096, multiline = false) {
  if (typeof value !== 'string' || !value.length || utf8(value).length > max || /\p{Surrogate}/u.test(value) || (multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u : /[\u0000-\u001f]/u).test(value)) throw new Unknown('Invalid bounded text');
  return value;
}
export function integer(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Unknown('Positive exact integer required');
  return value;
}
export function iri(value) {
  text(value);
  let url;
  try { url = new URL(value); } catch { throw new Unknown('Absolute IRI required'); }
  if (!['https:', 'http:', 'urn:'].includes(url.protocol) || url.username || url.password || /[<>"{}|^`\\\s]/u.test(value)) throw new Unknown('Unsupported IRI');
  return value;
}
export function typed(value) {
  exact(value, ['kind', 'value']);
  if (value.kind === 'int') {
    if (!Number.isSafeInteger(value.value)) throw new Unknown('Inexact integer');
  } else if (value.kind === 'str') text(value.value, 4096, true);
  else if (value.kind === 'iri') iri(value.value);
  else throw new Unknown('Unknown value kind');
  return {kind: value.kind, value: value.value};
}
export const str = value => typed({kind: 'str', value});
export const ref = value => typed({kind: 'iri', value});
export const int = value => typed({kind: 'int', value});
export function base64url(bytes) {
  return btoa(Array.from(new Uint8Array(bytes), n => String.fromCharCode(n)).join('')).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function unbase64url(value) {
  if (typeof value !== 'string' || !value.length || value.length > 65536 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Unknown('Invalid base64url');
  const bytes = Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), c => c.charCodeAt(0));
  if (base64url(bytes) !== value) throw new Unknown('Noncanonical base64url');
  return bytes;
}
export const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
export function hexId(value) {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Unknown('Exact operation identifier required');
  return value;
}
