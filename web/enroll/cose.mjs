// A bounded flat COSE public-key reader, not a general CBOR interpreter.
export function coseKey(bytes, offset) {
  let at = offset;
  const head = () => {
    if (at >= bytes.length) throw new Error('Truncated public key');
    const tag = bytes[at++], major = tag >> 5, info = tag & 31;
    let length = info;
    if (info >= 24) {
      const count = {24: 1, 25: 2, 26: 4}[info];
      if (!count || at + count > bytes.length) throw new Error('Unsupported public key encoding');
      length = 0;
      for (let i = 0; i < count; i++) length = length * 256 + bytes[at++];
    }
    return {major, length};
  };
  const integer = item => {
    if (item.major !== 0 && item.major !== 1) throw new Error('Invalid public key integer');
    return item.major === 0 ? item.length : -1 - item.length;
  };
  const map = head();
  if (map.major !== 5 || map.length < 4 || map.length > 5) throw new Error('Unsupported public key map');
  const fields = new Map();
  for (let i = 0; i < map.length; i++) {
    const key = integer(head()), item = head();
    if (fields.has(key)) throw new Error('Duplicate public key field');
    let value;
    if (item.major === 2) {
      if (item.length !== 32 || at + item.length > bytes.length) throw new Error('Invalid key coordinate');
      value = bytes.slice(at, at + item.length); at += item.length;
    } else value = integer(item);
    fields.set(key, value);
  }
  const coordinate = key => fields.get(key) instanceof Uint8Array && fields.get(key).length === 32;
  let scheme;
  if (fields.size === 4 && fields.get(1) === 1 && fields.get(3) === -8 && fields.get(-1) === 6 && coordinate(-2)) scheme = 'webauthn-eddsa';
  else if (fields.size === 5 && fields.get(1) === 2 && fields.get(3) === -7 && fields.get(-1) === 1 && coordinate(-2) && coordinate(-3)) scheme = 'webauthn-es256';
  else throw new Error('Unsupported public key scheme');
  return {bytes: bytes.slice(offset, at), end: at, scheme};
}
