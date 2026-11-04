import {config} from './config.mjs';
import {admitted, createPublicCredential} from './model.mjs';
const button = document.querySelector('button');
const status = document.querySelector('[role="status"]');
const output = document.querySelector('textarea');
const fingerprint = document.querySelector('#fingerprint');
const environment = {origin: location.origin, secure: isSecureContext, credentials: navigator.credentials, crypto};
let enabled = false;
try {
  admitted(config, environment.origin, environment.secure);
  if (typeof environment.credentials?.create === 'function' && typeof PublicKeyCredential !== 'undefined') enabled = true;
  else status.textContent = 'WebAuthn is unavailable in this browser.';
}
catch { status.textContent = 'Enrollment is not enabled for this origin.'; }
button.disabled = !enabled;
button.addEventListener('click', async () => {
  if (!enabled) return;
  button.disabled = true; output.value = ''; fingerprint.textContent = '';
  status.textContent = 'Waiting for your authenticator…';
  try {
    const packet = await createPublicCredential(config, environment);
    output.value = JSON.stringify(packet, null, 2);
    fingerprint.textContent = packet.fingerprint;
    status.textContent = 'Public credential ready for operator registration. Not enrolled. Compare this fingerprint after registration.';
  } catch {
    status.textContent = 'No public export prepared. This page has not registered a signer. Your device may retain a credential from the creation attempt.';
  } finally { button.disabled = !enabled; }
});
