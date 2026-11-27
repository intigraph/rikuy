# Passkey enrollment ceremony

**Status: built, switched off.** Delivering this source enrolls nobody.
Do not prompt anyone to enroll, and do not change a production configuration,
just because this source was delivered.

**In short.** The `/enroll/` page creates a passkey and shows its public key
and fingerprint. It registers nothing. An operator registers the key by hand
with a command-line tool, then compares fingerprints with the person holding
the device.

Background: [Signed decisions](../book/src/signed-decisions.md).

## What the page does

It creates a WebAuthn credential and exports only:

- the credential ID;
- the public key, in COSE form;
- the signing scheme;
- the origin and relying party;
- a fingerprint.

The fingerprint is the first eight bytes of the SHA-256 hash of the exact COSE
encoding, shown as four groups of four hex digits.

The page has no registration transport, no bearer, no actor authority, no
graph allowlist and no way to enable anything.

## What turns it on

An approved deployment provides one exact, dedicated HTTPS origin and the
matching relying-party hostname in `web/enroll/config.mjs`. URL parameters,
local storage and values typed into the browser cannot enable the page or
change that scope.

With the default configuration the button is disabled, and no credential is
created when the page loads. On a configured, supported browser, the page asks
only after an explicit click.

Cancelling, an unsupported export, a mismatched context or malformed data all
produce no packet. Creation may still have left a credential on the device.

## What the page checks

- the relying-party hash;
- the credential identifier;
- the creation challenge;
- the origin;
- user presence and user verification;
- the structure of the COSE key.

It declines two kinds of credential:

- **Synced passkeys.** A credential that reports backup eligibility or backup
  state is declined, because the scope is one device.
- **Credentials with unrequested authenticator extensions.**

These checks read what the authenticator reports about itself. They are not
hardware attestation, and they do not prove who the person is.

WebAuthn ties a credential to an origin and relying party, not to a URL path.
The dedicated origin must therefore be isolated from unrelated applications. See the
[W3C authenticator-data definition](https://www.w3.org/TR/webauthn-3/#sctn-authenticator-data).

## What the operator does

The page never does any of this, and never claims a credential is enrolled.

1. Establish who the person is.
2. Choose the approved graphs the credential may write and when it expires.
3. Enroll the public key with the generic local signer CLI.
4. Compare the fingerprint from the CLI's status with the one on the device.

Enrollment alone does not enable writes or protect a graph.

To rotate, enroll a new credential ID, then revoke the old one with the CLI.

## Before a real ceremony

All three must be true first:

1. The generic signer CLI is installed and qualified.
2. The device trusts the dedicated origin's TLS certificate.
3. The existing origin and CORS gate shows a live refusal for a wrong origin.

The decision path, the served-reader checks and turning on signed actions are
each accepted separately.

## How the source is qualified

Local qualification uses unit tests for the refusals and Chromium's virtual
authenticator against intercepted, synthetic HTTPS assets. The packet the page
exports is accepted by the candidate native signer CLI in a disposable store,
with the same fingerprint and the switch still off.

This is not a real enrollment, a smoke test on the production origin, a
hardware test or proof of installed acceptance.
