# Admission: the checklist before signing is turned on

**Status: preparation only.** Nothing in this directory selects or activates a
runtime adapter, credential, graph, grant, device, service, timer or
production profile.

**In short.** Before a deployment turns on signed Asks, it fills in a packet
that pins every moving part: which source, which store and graphs, which key, which
grant, which operator, and what the reads cost. This page describes the
packet, the rehearsals that go with it, and the controls a future real test
must show.

Background: [Signed decisions](../../book/src/signed-decisions.md).

## The packet

The packet records pins for source, instance, key, grant, operator and cost.

- Every required pin is either `SELECTED`, with evidence, or `UNKNOWN`, with a
  reason and no guessed value.
- `assessPacket` validates the complete inventory, the named rollback and the
  acceptance controls.
- Its report leaves out pin values and always says `runtimeAuthorized:false`,
  even when every pin has evidence.

**A complete checklist is not an access grant.**

Keep deployment packets private. They may name internal principals, stores,
managed credential locations and custody owners. They must never contain
credential values or private keys.

The public example is `example.json`. Replace it only in a private copy, with
evidence that was actually reviewed.

Three pairs that are easy to confuse, and that the packet keeps apart:

| This | Is not |
|---|---|
| The source revision | The installed artifact |
| The selected graph name | The native pin for that graph instance |
| Where a credential is stored | A grant covering this principal and operation |

## Rehearsing settlement from source

Build `ask_settlement_demo` from the admitted Seeds source first. Then run the
rehearsal with an explicitly selected and hashed Seeds example:

```sh
node scripts/rehearse-ask-admission.mjs PRIVATE_PACKET ABSOLUTE_SEEDS_DEMO SHA256
```

It uses a real in-memory Seeds transaction with a synthetic admission port.
The driver checks that:

- one batch closes the Ask, adds one linked ruling and leaves the linked
  work's status alone;
- read-only recovery adds no transaction;
- the signed manifest carries the linked revision;
- an altered, copied or duplicate answer is refused;
- a Later does not close the Ask;
- a lost response is recovered without a second send.

These are source controls. The driver marks native cryptography and
production acceptance as UNKNOWN. It never contacts an endpoint, generates a
key or performs an enrollment.

## Signing, forgery and replay with real cryptography

For real signing, forgery and replay controls on an **offline fixture**, use
the [native qualification](../contract.md#qualification-and-remaining-acceptance).

That fixture also covers:

- the condition on the linked item;
- refusal when the linked item is stale;
- a manifest that verifies natively but that the application reader must
  reject because it leaves out that condition.

Keys are generated in memory for disposable fixture stores. They are never
saved and never promoted into a production identity. The helper uses an
explicit test vocabulary namespace, and no deployment default is inferred.
Store enrollment and grants in the fixture are throwaway test data.

### Supplying the build inventory

- Supply the complete, fresh Cargo JSONL inventory. Do not trim it to resolve
  an ambiguity.
- If the producer builds several `serde_json` variants, default qualification
  refuses.
- To choose one, set both `QUIPU_SERDE_JSON_ARTIFACT` and
  `QUIPU_SERDE_JSON_SHA256`. They must match a member of the inventory and its
  actual bytes.
- The Rust compile that follows must prove the libraries link with identical
  types. A wrong variant that is still in the inventory is expected to fail
  that compile.

The helper's receipt pins both libraries, its source and its executable. The
evidence is the native JSON report together with the retained producer, source
and artifact receipts. A version string alone is not enough.

## What a real test must show

A future admitted test with a real person and device must show:

- the actual human and device choice;
- a native verified receipt;
- both items' revisions advanced and read back;
- a readable record and graph;
- the audit trail.

It must also show refusals, with no unauthorized change:

- a forged signature, a wrong-origin signature and a replayed signature;
- either item being stale.

And these behaviors:

- A lost reply keeps durable one-send custody and is recovered by reading.
- Revocation refuses the exact scoped credentials and binding.

### Rolling back

Keep the accepted receipt, every uncertain intent and the audit history.
Disable only the admitted consumers, and revoke the exact grants through the
qualified owner path.

## Native loopback origin controls

The origin qualification starts a native server, pinned by SHA, with a
disposable store, a private temporary HOME, a synthetic local bearer and an
explicit HTTPS origin allowlist. It binds only to loopback, makes no
production requests, and performs no enrollment, grant or publication. The
native source stamp it reports must match the supplied source revision and
report a clean build.

```sh
QUIPU_SERVER=/absolute/pinned/quipu-server \
QUIPU_SERVER_SHA256=ACTUAL_64_HEX_DIGEST \
QUIPU_SOURCE_SHA=ACTUAL_40_HEX_SOURCE_REVISION \
DECK_TRUSTED_ORIGIN=https://brief.example \
node scripts/qualify-deck-origin.mjs
```

The HTTP preflight controls cover a trusted origin, a foreign origin and a
`null` origin, on both the reader and challenge routes.

What the results mean:

- A positive health response admits only the trusted origin to browser code.
- A foreign origin still gets an ordinary HTTP health response, without CORS
  admission. CORS governs what a browser exposes to a page. It does not govern
  server access or the authority to write.
- No wildcard headers and no credentialed browser requests are enabled.

Checking the origin inside the signature is a separate control, in the offline
signing qualification. These preflight checks do not prove enrollment,
production TLS or device trust, or that a production allowlist was applied.

Keep the real origin and the deployment's admission evidence in the private
packet. The origin in the example above only identifies an isolated rehearsal.
The listener has a 60-second kill deadline and removes its fixture on exit.

## Staged Seeds verifier process

`scripts/verify-seeds-answer.mjs` is a bounded, read-only process that Seeds'
separately admitted executable port can start.

**Input.** Standard input holds only a revision-bound intent and the reader
profile and public CA the operator selected.

**What it does.**

1. Fetches the native point receipt itself.
2. Pins three graph registration IDs and their retained creation records.
3. Runs the complete signed-answer reader.

**What it refuses.** Verification flags supplied by the caller, foreign
bindings, replaced graphs, incomplete native evidence and untrusted TLS.

**What it lacks, on purpose.** A credential, a writer, a default endpoint, a
signing key and an enrollment command.

The producer's data carries authority only inside the private pipe from the
root-owned, hash-pinned program that Seeds selected. Running this script
directly, or copying its JSON, does not admit a Seeds write. The seven-module
bundle and the Node executable must be admitted separately. This source
installs neither.

### How it is qualified

Native qualification starts the real entry point against a temporary HTTPS
listener that passes read requests to the real native store helper.

- A temporary TLS key stays in memory. Python passes it over a pipe to OpenSSL
  to make a public certificate.
- This transport fixture does not use the production HTTP server and does not
  qualify its scoped writer.
- An unknown CA and forged input must both be refused.

Setting `SEEDS_NATIVE_PORT_TEST` to the matching built Seeds library-test
executable adds a run of the real native process receipt, the durable one-send
reservation and the atomic Seeds transition, on a disposable in-memory
backend. It includes a wrong-binding refusal and read-only reconciliation.

That test bypasses only the root deployment selection, inside a test function
that is explicitly ignored by default. There is no production override. Keep
both repositories' exact source and executable hashes with the result.

### An open storage question

The native Seeds port stages its audit record in the item's project graph, in
the same compare-and-set as both item changes and the ruling. The ordinary
Seeds CLI puts audit records in the sibling provenance graph.

Production admission must settle that choice explicitly. It must also qualify
the exact remote writer scope, revocation, custody of the root bundle and
profile, and lost-response recovery.
