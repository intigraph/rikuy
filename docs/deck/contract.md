# Online request and attested answer source

The `/deck/` preview implements Rikuy's request card and answer interpretation
on the generic Quipu attested-write primitive. It ships disabled, selects no
production endpoint or credential, and makes no request on page load. Its CSP
also disallows network connections. Deployment adapters and policy changes are
separate reviewed work. The offline decision protocol is unchanged and has a
different domain, database and retry contract.

## Request and proposal

A curator publishes a canonical request manifest in an ordinary request graph,
with a current revision and an immutable revision subject. `requestPublication`
constructs those facts; it does not publish them. A real curator job must use
normal governed conditional writes: advance the current revision atomically,
expect the old revision, and expect the new manifest slot to be absent. This
source does not deploy that job or grant it a credential. The separate
[conditional curator source](curator.md) implements plan construction and
durable publication custody with explicit adapters; production adapters,
credential restrictions and served admission remain separate gates.

The admitted reader supplies the exact graph, request ID, current revision,
revision subject and complete manifest. Unknown fields, duplicate JSON keys,
foreign items, ambiguous revisions and incomplete results refuse. The card
renders text through DOM text nodes, including option labels and comments.

Each intent has a stable 256-bit operation ID. The proposal carries five
expectations in three named graphs:

| Graph | Required slot |
|---|---|
| Request | Request's current revision equals the displayed revision |
| Answer | That request revision's decided slot is empty |
| Item | Exact canonical item's revision equals the displayed item revision |
| Item | Exact canonical item's status equals the configured open status |
| Answer | This operation's type slot is absent |

Typed integers, strings and IRIs stay distinct. JavaScript refuses integers
outside its exact safe range, oversized UTF-8 values, unpaired surrogates,
unknown fields and duplicate slots. The fixed native field order is retained
when serializing proposals and server-issued challenge bytes.

Choose and Later fill the decided slot; comment does not. Comment text is
retained exactly, including newlines. A comment requires nonblank text.
The underlying item is neither closed nor revised by these answer facts.
The reader projects the answer and visible comment from the answer graph;
existing Brief/Seeds consumer integration is still owed.

The client requires the server's signed deadline to be no later than the
curated request deadline before asking the authenticator. A request with less
than the server's challenge lifetime remaining therefore refuses; it does not
silently extend the request. The reader checks the retained deadline and
server recording time too. It does not use a browser timestamp as evidence.

## Evidence and pending custody

The reader reconstructs the entire permitted proposal, including every
expectation and datum, from the current curated request. It compares the exact
canonical manifest with a native point receipt from the pinned reader route.
A verified receipt must bind the configured store lineage, signer, actor,
origin/RP, nonce, message hash and positive transaction. Ordinary-graph copies,
other request revisions, missing expectations, unknown fields, unverified or
foreign receipts and extra facts never become answered.

`readAnswer` admits an immutable answer object. `disposition` only folds those
admitted objects for the exact request: WAITING, ANSWERED or visible LATER.
Comment alone leaves WAITING. Competing decisions or incomplete evidence are
UNKNOWN, not an empty success result. A trusted adapter obtains receipt replies
from native `/attest/receipt`; a caller's own `verified: true` is not authority.

`PendingStore` uses IndexedDB transactions, scoped by the exact operator,
store lineage and graph configuration. One insertion wins across tabs. It
stores the proposal, nonce, content hash and request deadline before signing.
No memory fallback is selected when durable storage fails. The WebAuthn caller
requests the enrolled credential, RP and server-derived challenge with user
verification required; it has no software-key fallback.

Before the one commit call, custody changes to UNKNOWN. A timeout, refusal or
absent point receipt never authorizes a second commit or signature. Recovery
only reads the same nonce. ACCEPTED requires both the verified receipt and
complete matching facts/provenance read-back. The UI also re-reads its current
projection before acknowledging and clearing custody. A never-submitted
PENDING attempt can be cancelled with a state-and-nonce compare-and-delete;
an UNKNOWN attempt cannot be discarded that way.

## Shapes and limits

`shapes/deck.shapes.ttl` defines the Decision and Comment source vocabulary.
Its required-field and value constraints are not a claim that every native
transaction enforces a complete batch SHACL result. In the qualified candidate,
post-state admission deliberately excludes `MinCountConstraintComponent` from
its selected components. A missing-comment signed write can therefore remain
as a native attestation; Rikuy's full manifest reader rejects it. A native
invalid-action value does refuse with the loaded shape, providing an armed
positive control. Loading a shape does not authorize a writer or protect a graph.

An invalid signed write can still occupy a decided slot. The curator advances
the request revision through its normal conditional lane; it never edits or
erases the invalid attestation. No source here repairs history automatically.

## Qualification and remaining acceptance

`just ci` exercises the source units and disabled build. The explicit native
fixture uses generated software keys only in memory, disposable local stores,
the actual candidate operator CLI and linked native library. It checks Rust
serialization and queryable provenance, successful choose/Later/comment,
replay, forgery, wrong origin, changed/closed item, request revision, loaded
shape values, and native-valid manifests that the Deck reader must reject.
It is not a production profile-union, HTTP/CORS, hardware or human test.

Generate a fresh Cargo JSONL artifact inventory from the candidate Quipu
checkout using `cargo test --no-run --message-format=json`. Set `QUIPU_CLI` to
its clean candidate executable and `QUIPU_ARTIFACTS` to that inventory. Build
outside the test HOME, then run under the normal HOME guard:

```sh
node scripts/qualify-deck-native.mjs --build-helper /tmp/rikuy-native-fixture
QUIPU_NATIVE_FIXTURE=/tmp/rikuy-native-fixture node scripts/qualify-deck-native.mjs
```

The helper receipt pins its source, library and executable hashes; changed or
ambiguous artifacts refuse. All stores are created below a new owned temporary
directory and removed afterward. No default/installed store is opened.

Remaining acceptance: normal source CI/review/landing; admitted curator and
bounded stored-query adapters; production shape classification; generic signer
CLI adoption; dedicated trusted origin and live CORS/wrong-origin checks;
explicit human ceremony; served Brief safety and interleaved performance; then
separately reviewed old-domain removal. This preview is not activation,
production publication, a new enrollment route or completed migration.
