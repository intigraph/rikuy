# Ask admission preparation

This packet format records source, instance, key, grant, operator and cost pins.
Every required pin is either `SELECTED` with evidence or `UNKNOWN` with a reason
and no guessed value. Keep deployment packets private: they may name internal
principals, stores, managed credential locations and custody owners. They must
never contain credential values or private keys.

`assessPacket` validates the complete inventory, named rollback and acceptance
controls. Its report omits pin values and always says `runtimeAuthorized:false`,
even when every pin has evidence. A complete checklist is not an access grant.
The maintained public example is `example.json`; replace it only in a private
copy, with actual reviewed evidence. Source revision is distinct from installed
artifact, selected graph name from native graph-instance pin, and a credential
location from a grant covering this principal and operation.

Run the source rehearsal with an explicitly selected and hashed Seeds example:

```sh
node scripts/rehearse-ask-admission.mjs PRIVATE_PACKET ABSOLUTE_SEEDS_DEMO SHA256
```

Build `ask_settlement_demo` from the admitted Seeds source first. It uses a real
in-memory Seeds transaction with a synthetic admission port. The driver checks
that one batch closes the Ask, adds one linked ruling and preserves linked-work
status, and that read-only recovery does not add a transaction. It separately
checks the signed manifest's linked revision, altered/copy/duplicate answer
refusals, Later without closure and one-send lost-response recovery. These are
source controls; this driver marks native cryptography and production acceptance
UNKNOWN. It never contacts an endpoint, generates a key or performs enrollment.

For actual **offline fixture** signing, forgery and replay controls, use the
existing [native qualification](../contract.md#qualification-and-remaining-acceptance).
The fixture now also covers the linked-item conditional slot, stale-target
refusal and a natively verified manifest that the application reader must reject
because it omits that slot. Keys are generated only in memory for disposable
fixture stores and are never persisted or promoted into a production identity.
The helper uses an explicit test vocabulary namespace; no deployment default is
inferred. Store enrollment and grants in this fixture are disposable test data.

Supply the complete fresh Cargo JSONL inventory; do not trim it to resolve
ambiguity. If the producer builds multiple `serde_json` variants, default
qualification refuses. An explicit `QUIPU_SERDE_JSON_ARTIFACT` plus
`QUIPU_SERDE_JSON_SHA256` must match a member of that inventory and its actual
bytes. The subsequent Rust compile must prove cross-library type/link identity.
An incorrect but inventory-backed variant is expected to fail that compile.
The helper receipt pins both libraries, its source and its executable. The
native JSON report and retained producer/source/artifact receipts are the
qualification evidence; a version string alone is insufficient.

A future admitted real smoke must show the actual human/device choice, native
verified receipt, both-item revision/read-back, readable record/graph and audit.
Forged/wrong-origin/replayed signatures and either stale item must refuse with
no unauthorized changes. Lost replies retain durable one-send custody and
recover read-only. Revocation must refuse the exact scoped credentials/binding.
Retain the accepted receipt, every uncertain intent and the audit history during
rollback; disable only the admitted consumers and revoke exact grants through
the qualified owner lane. No runtime adapter, credential, graph, grant, device,
service, timer or production profile is selected or activated by this source.

## Native loopback origin controls

The origin qualification starts a SHA-pinned native server with a disposable
store, private temporary HOME, synthetic local bearer and an explicit HTTPS
origin allowlist. It binds only loopback, makes no production requests and
performs no enrollment, grant or publication. The reported native source stamp
must match the supplied source revision and report a clean build.

```sh
QUIPU_SERVER=/absolute/pinned/quipu-server \
QUIPU_SERVER_SHA256=ACTUAL_64_HEX_DIGEST \
QUIPU_SOURCE_SHA=ACTUAL_40_HEX_SOURCE_REVISION \
DECK_TRUSTED_ORIGIN=https://brief.example \
node scripts/qualify-deck-origin.mjs
```

The actual HTTP preflight controls cover trusted, foreign and `null` origins
on the reader and challenge routes. A positive health response admits only the
trusted origin to browser code. Foreign-origin health remains an ordinary HTTP
response without CORS admission: CORS governs browser exposure, not server
access or mutation authority. No wildcard headers or credentialed browser
requests are enabled. Native signature origin verification remains a separate
control in the offline signing qualification; these preflight checks do not
prove enrollment, production TLS/device trust or a production allowlist apply.

Keep the real origin and deployment admission evidence in the private packet.
The public example above is an identifier for an isolated rehearsal. The
listener has a 60-second kill deadline and removes its fixture after exit.
