# Request and answer contract

**Status: built, switched off.** The `/deck/` page ships disabled. It selects
no server and no credential, makes no request when it loads, and its content
security policy blocks all network connections. Turning it on is separate,
reviewed work for each deployment.

**In short.** A curator publishes a question. The page shows it as a card. The
person answers, a passkey signs the answer, and Quipu writes it only if the
signature is valid and nothing changed since the card was drawn. This page
says exactly what is published, signed, checked and recovered.

For a plain-language overview, read
[Signed decisions](../book/src/signed-decisions.md). The design reasoning is
in [Deck boundary](../design/deck-boundary.md).

The offline decision protocol is a different thing. It has its own domain,
database and retry rules, and is not described here.

## The request

A curator publishes a request into an ordinary graph, the *request graph*. A
request has:

- a canonical manifest: the question, its options and the allowed actions;
- a current revision number;
- a revision subject that never changes once written.

`requestPublication` builds those facts. It does not publish them. A real
curator job publishes through normal governed conditional writes:

- it advances the current revision in one atomic step;
- it expects the old revision to be the one it read;
- it expects the new manifest slot to be empty.

The [curator](curator.md) document covers the job that does this. This source
does not deploy that job or grant it a credential. Its production adapters,
credential limits and admission are separate gates.

## What the page accepts before showing a card

The reader hands the page the exact graph, request ID, current revision,
revision subject and complete manifest. The page refuses the request if it
finds any of these:

- an unknown field;
- a duplicate JSON key;
- an item outside the admitted item prefix;
- an ambiguous revision;
- an incomplete result.

All text on the card, including option labels and comments, is drawn as plain
text nodes. Nothing from a request is interpreted as HTML.

## What is signed

Each answer has a stable 256-bit operation ID. The signed proposal carries the
answer and five conditions, spread over three graphs. Quipu writes the answer
only if all five hold at the moment of commit.

| Graph | Condition |
|---|---|
| Request | The request's current revision equals the revision the card showed |
| Answer | The "decided" slot for that request revision is empty |
| Item | The work item's revision equals the revision the card showed |
| Item | The work item's status equals the configured open status |
| Answer | The type slot for this operation ID is absent |

Value rules:

- Integers, strings and IRIs are kept distinct.
- The page refuses integers outside JavaScript's exact safe range, oversized
  UTF-8 values, unpaired surrogates, unknown fields and duplicate slots.
- Proposals and the server's challenge bytes are serialized in the fixed
  field order the native code uses.

## The three actions

| Action | Fills the "decided" slot | Notes |
|---|---|---|
| Choose | Yes | Records the chosen option |
| Later | Yes | Records that the person deferred |
| Comment | No | Needs non-blank text. The text is kept exactly, newlines included. |

These answer facts do not close or revise the underlying work item. Closing
it is the job of the optional [Seeds settlement](settlement.md), which adds
the linked item's revision to the signed intent and calls a separately
admitted Seeds transition.

The reader shows the answer and any visible comment from the answer graph.
Wiring this into the existing Brief and Seeds consumers is still owed.

## Deadlines

Before it asks the passkey to sign, the page requires the server's signed
deadline to be no later than the request's own deadline. A request with less
time left than the server's challenge lifetime is refused. It is never
silently extended.

The reader checks the retained deadline and the server's recording time as
well. A browser timestamp is never used as evidence.

## Verifying an answer

To decide whether a request is answered, the reader:

1. Rebuilds the entire permitted proposal, every condition and every fact,
   from the current curated request.
2. Compares that exact manifest with a native receipt fetched from the pinned
   reader route.
3. Requires the receipt to bind the configured store lineage, signer, actor,
   origin and relying party, nonce, message hash and a positive transaction.

None of the following ever counts as answered:

- a copy of an answer in an ordinary graph;
- an answer for another request revision;
- an answer missing a condition;
- an answer with unknown fields or extra facts;
- a receipt that is unverified or foreign: from another store, signer, actor,
  origin or intent.

`readAnswer` admits one immutable answer object. `disposition` folds the
admitted answers for one exact request into a state:

| State | When |
|---|---|
| WAITING | No decision yet. A comment alone leaves the request waiting. |
| ANSWERED | One verified Choose |
| LATER | One verified Later, shown as visible |
| UNKNOWN | Competing decisions, or incomplete evidence. Never treated as an empty success. |

A trusted adapter gets receipt replies from Quipu's `/attest/receipt` route. A
caller that passes its own `verified: true` gains no authority.

## Keeping an answer safe in flight

`PendingStore` holds an answer while it is being signed and sent.

- It uses IndexedDB transactions, scoped to the exact operator, store lineage
  and graph configuration.
- Across tabs, one insertion wins.
- It stores the proposal, nonce, content hash and request deadline *before*
  signing.
- If durable storage fails, it does not fall back to memory.

The WebAuthn call asks for the enrolled credential, the relying party and the
challenge derived from the server's bytes, with user verification required.
There is no software-key fallback.

### One commit, never two

1. Before the single commit call, the stored state changes to UNKNOWN.
2. A timeout, a refusal or a missing receipt never allows a second commit or a
   second signature.
3. Recovery only reads, using the same nonce.
4. ACCEPTED requires both a verified receipt and a complete matching read-back
   of the facts and their provenance.
5. The page re-reads its current view before it acknowledges and clears the
   stored answer.

An answer that was never submitted (state PENDING) can be cancelled with a
compare-and-delete on its state and nonce. An UNKNOWN answer cannot be
discarded that way.

## Shapes and their limits

`shapes/deck.shapes.ttl` defines the Decision and Comment vocabulary.

Loading the shapes does not mean every native transaction is fully validated
against them. In the qualified candidate, post-write admission deliberately
leaves out the minimum-count check (`MinCountConstraintComponent`). Two
consequences:

- A signed write that is missing its comment can remain as a native
  attestation. Rikuy's full manifest reader rejects it.
- A signed write with an invalid action value *is* refused by the loaded
  shape. That gives one armed positive control.

Loading a shape does not authorize a writer or protect a graph.

An invalid signed write can still occupy a "decided" slot. When that happens,
the curator advances the request to its next revision through its normal
conditional write. It never edits or erases the invalid attestation, and
nothing in this source repairs history automatically.

## Qualification and remaining acceptance

### What `just ci` covers

The source units and the disabled build.

### What the native fixture covers

The explicit native fixture uses software keys generated only in memory,
disposable local stores, the actual candidate operator CLI and the linked
native library. It checks:

- Rust serialization and queryable provenance;
- a successful Choose, Later and Comment;
- replay, forgery and wrong origin;
- a changed item and a closed item;
- a changed request revision;
- values the loaded shape refuses;
- manifests that are valid natively but that the Deck reader must reject.

It is not a test of production profile union, HTTP or CORS, real hardware, or
a real person.

### Running it

Generate a fresh Cargo JSONL artifact inventory from the candidate Quipu
checkout with `cargo test --no-run --message-format=json`. Set `QUIPU_CLI` to
the clean candidate executable and `QUIPU_ARTIFACTS` to that inventory. Build
outside the test HOME, then run under the normal HOME guard:

```sh
node scripts/qualify-deck-native.mjs --build-helper /tmp/rikuy-native-fixture
QUIPU_NATIVE_FIXTURE=/tmp/rikuy-native-fixture node scripts/qualify-deck-native.mjs
```

The helper's receipt pins the hashes of its source, library and executable. A
changed or ambiguous artifact is refused. Every store is created under a new
temporary directory owned by the run and removed afterward. No default or
installed store is opened.

### Still owed before this can be turned on

1. Normal source CI, review and landing.
2. Admitted curator and bounded stored-query adapters.
3. Production classification of the shapes.
4. Adoption of the generic signer CLI.
5. A dedicated trusted origin, with live CORS and wrong-origin checks.
6. An explicit human ceremony.
7. Safety checks and interleaved performance checks on the served Brief.
8. Reviewed removal of the old domain.

This preview is not activation, production publication, a new enrollment
route or a completed migration.
