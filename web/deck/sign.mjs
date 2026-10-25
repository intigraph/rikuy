import {Unknown, base64url, unbase64url} from './value.mjs';
import {identity} from './evidence.mjs';

export function webauthnSigner(who, environment) {
  const registered = identity(who);
  return async admitted => {
    if (environment.secure !== true || environment.origin !== registered.origin || typeof environment.credentials?.get !== 'function') throw new Unknown('Enrolled secure-origin authenticator unavailable');
    const credential = await environment.credentials.get({publicKey: {
      challenge: unbase64url(admitted.webauthnChallenge), rpId: registered.rpId,
      allowCredentials: [{id: unbase64url(registered.signer), type: 'public-key'}],
      userVerification: 'required', timeout: 60000
    }});
    if (!credential || credential.type !== 'public-key' || base64url(credential.rawId) !== registered.signer) throw new Unknown('Enrolled credential not returned');
    const response = credential.response;
    for (const [name, max] of [['authenticatorData', 16384], ['clientDataJSON', 16384], ['signature', 512]]) if (!(response?.[name] instanceof ArrayBuffer) || !response[name].byteLength || response[name].byteLength > max) throw new Unknown('Invalid authenticator export');
    return {client_data_json: base64url(response.clientDataJSON), authenticator_data: base64url(response.authenticatorData), signature: base64url(response.signature)};
  };
}
