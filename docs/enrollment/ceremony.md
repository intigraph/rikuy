# Public credential ceremony

The `/enroll/` source page creates a WebAuthn credential and exports only its
credential ID, COSE public key, scheme, origin/RP and fingerprint. It has no
registration transport, bearer, actor authority, graph allowlist or enable
operation. The fingerprint is the first eight SHA-256 bytes of the exact COSE
encoding, rendered as four groups of four hex digits. Compare it with the
operator's native signer status after registration.

Source configuration ships disabled. An approved deployment must provide one
exact dedicated HTTPS origin and its identical RP hostname. URL parameters,
local storage and browser-entered values cannot enable or change that scope.
The default button is disabled and no credential is created on page load. A
configured supported browser asks only after an explicit click. Cancellation,
unsupported exports, mismatched context and malformed data produce no packet;
creation may still have left a credential on the authenticator.

The page checks the returned RP hash, credential identifier, creation challenge,
origin, user presence/verification and COSE structure. It declines credentials
reporting backup eligibility or backup state, as required by the single-device
scope, and declines unrequested authenticator extensions. These checks interpret
returned authenticator metadata; they are not hardware attestation or proof of
the person's identity. WebAuthn binds credentials to an RP/origin, not a URL path.
The dedicated origin must remain isolated from unrelated applications.
See the [W3C authenticator-data definition](https://www.w3.org/TR/webauthn-3/#sctn-authenticator-data).

The operator still establishes the human identity, chooses the approved graph
scope and expiry, enrolls through the generic local signer CLI, and compares the
fingerprint with the device. Enrollment does not enable writes or protect a
graph. Rotation enrolls a new ID; the native CLI revokes the old ID. The page
never performs those operations and does not claim a credential is enrolled.

Before a real human ceremony, the generic signer CLI must be installed and
qualified, the dedicated TLS origin trusted on the device, and the existing
origin/CORS gate must show its live wrong-origin refusal. The decision path,
served-reader checks and signed-action activation remain separate acceptance.
Do not prompt the human or flip a production configuration on source delivery.

Local source qualification uses unit negatives and Chromium's virtual
authenticator on intercepted synthetic HTTPS assets. Its public packet is
accepted by the candidate native signer CLI in a disposable store, with the
same fingerprint and the switch still off. This is not a real enrollment,
production-origin smoke, hardware test or proof of installed acceptance.
