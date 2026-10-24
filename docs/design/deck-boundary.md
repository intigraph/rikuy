# Decision Deck boundary: Rikuy owns the Deck, Quipu keeps generic primitives

Status: design, review rulings recorded below. Nothing is implemented or
enabled by this document.

## Decision

Quipu is a bitemporal, governed knowledge store. It must not know what a
question, card, choice, Later, comment or disposition is. The Decision Deck
moves into Rikuy, and Quipu keeps only generic, domain-free primitives that
the Deck needs for **safety** or **performance**.

Rikuy is a static site. It cannot issue a server nonce, read a trusted
clock, verify a passkey assertion, or commit a decision atomically. Those
four things must stay in a trusted server. The design question is therefore
not "server or client", but "which server primitive, named without any Deck
word".

## What Quipu keeps: one generic primitive, the attested write

An **attested write** is an ordinary governed write that is admitted only if
an enrolled human signer approved its exact content on their device.

1. **Signer registry.** An operator enrolls a signer: a public key, its
   scheme, the exact origin and relying party, the human identity it stands
   for, an explicit list of the graphs it may write, an expiry and a
   revocation flag. Quipu also
   stores the authenticator counter. Enrollment is operator-only, over the
   store file, with no HTTP route. This is a rename of today's Deck
   enrollment, with no Deck word left in it.
2. **Challenge.** `POST /attest/challenge {signer, graph, datums, expect}`
   returns a server nonce, a server expiry (at most five minutes) and the
   exact bytes to sign. The bytes are a canonical encoding of the signer,
   graph, datums, expectations, nonce, audience, origin and expiry. Quipu
   stores the challenge. The datums are ordinary triples; Quipu does not
   interpret them.
3. **Commit.** `POST /attest/commit {nonce, assertion}` runs one savepoint.
   It carries nothing else: the signed content is the stored challenge.
   - the challenge exists, is unexpired and is unconsumed;
   - the graph is still on the signer's list;
   - the assertion verifies over the stored bytes, for the stored signer and
     origin, with an advancing counter (the existing `verdict_schemes`
     verifiers);
   - every expectation holds (the existing conditional-write comparison);
   - the graph's normal write gates pass: authority, SHACL and events;
   - then it consumes the challenge, writes the datums, and records a receipt
     (nonce, signer, content hash, server time, transaction).

   Any failure records nothing.
4. **Receipt.** `POST /attest/receipt {nonce}` is a read-only lookup for a
   lost response. A commit is never retried; a second commit is refused.

Every part already exists in Quipu in some form:

| Need | Existing Quipu mechanism | Change |
|---|---|---|
| Verify a passkey assertion | `verdict_schemes` (WebAuthn, SSHSIG, COSE) | none |
| Compare-and-set | conditional writes (`ExpectedValue`, `check_expected`) | graph-qualified, see below |
| Single-use nonce with atomic facts | the governance decision-nonce spend | generalise naming |
| Protected writer and graph gates | graph authority, SHACL, write events | none |
| Reads | stored queries and projections | none |
| Signer registry, challenge, receipt tables | the Deck's own tables today | rename and generalise |
| Attested-only graphs | a hardcoded Deck-graph check today | an operator-set list |

### Why this is justified

- **Atomicity (safety).** Nonce consumption, counter advance, the
  compare-and-set and the facts must commit together. Otherwise a stale card
  or a replay can record a partial decision. A client cannot get this from
  separate calls without a time-of-check gap.
- **Trust.** The nonce, the server time and the verification must be server
  side; a static client cannot be trusted with them.
- **Performance.** One round trip per step, one savepoint, no extra reads.
  This is the same work as today's Deck present and attest, so latency should
  be equal. It is measured before and after (below).

Anything that is not one of these stays in Rikuy.

### Graph-qualified preconditions

Quipu's conditional write compares slots in one graph. A Deck answer needs
two: the answer's own slot (in the Rikuy graph it writes) and the item's
revision and status (in the item's own graph). Each expectation therefore
names its graph. The commit checks every graph's expectations with the same
conditional-write comparison, inside the one commit savepoint, after it holds
the writer. Nothing can change between the check and the write, in any graph.
An expectation names exactly one graph: the same subject and value in another
graph never satisfies it. An unregistered graph is refused, never read as
empty, so an attested-only graph is registered when the operator protects it.

### The three scopes a Deck answer checks

Rikuy uses two graphs of its own:

- a **request graph**, written by the curator through ordinary governed
  writes: requests, their current revision, labels and allowed actions;
- an **answer graph**, marked attested-only: every answer and its provenance.

One answer's commit carries expectations on three scopes, all checked in the
same savepoint:

1. the request's current revision in the request graph (a re-curated or
   withdrawn request refuses the stale card);
2. the revision's "decided" slot in the answer graph, which must be empty;
3. the item's revision and status in the item's own graph.

### Attested-only graphs

The operator marks the graphs that accept attested writes only. An ordinary
write to such a graph is refused, so its facts all come from verified
commits.

### Queryable provenance

The commit writes, in the same savepoint and into the same graph, a receipt
node `urn:quipu:attest:<nonce>` of type `AttestedWrite`. The node carries the
signer, the human identity, the server time, the content hash of the signed
message, the graph, and the exact proposal (datums and graph-qualified
expectations) as canonical JSON. Every subject the write touched links to the
node with `attestedBy`. A proposal may not use the receipt namespace or this
vocabulary, and the graph accepts no ordinary writes, so no client or curator
triple can look like a server-authored attestation. Rikuy's disposition
query reads only attested-only graphs and checks the recorded expectations.

Rikuy's acceptance for this (owed with the Rikuy Deck, not this primitive):

- the disposition query parses each answer's recorded `attestProposal` JSON
  and counts the answer only if it carries all three expectations above,
  for the request revision it answers;
- negative controls against the served reader: a look-alike answer written to
  an ordinary graph, an answer whose recorded proposal lacks one of the
  three expectations, and one for another request revision are each shown as
  not answered.

### What "records nothing" means

A refused commit makes **zero accepted mutation**: no written facts, no
receipt, no consumed challenge and no counter change. Two things are not part
of that promise:

- an already-issued challenge stays unconsumed until it expires, so the same
  challenge can still commit once its preconditions hold again;
- the normal refusal audit of the write gates (refusal events and denial
  verdicts) is still recorded after the rollback, exactly as for any other
  refused write.

### Recovering from a signed write that is invalid for the Deck

If a signed write fills a request revision's "decided" slot but fails Rikuy's
own checks (for example, an undeclared label), the disposition query shows it
as invalid and does not count it. The curator then re-projects the request as
the next revision, which has an empty "decided" slot, so the operator can
answer again. Quipu keeps the invalid write and its provenance unchanged.

## What moves to Rikuy

| Deck concept | Where it lives after the move |
|---|---|
| Request, revision, labels, allowed actions | ordinary facts in a Rikuy-owned graph, written by the curator through normal governed writes |
| Choose, Later, comment | the datums of one attested write, signed by the operator |
| One decision per request revision | an expectation in that attested write: the request revision's "decided" slot must be empty, and the write fills it |
| Stale card or closed item | expectations on the item's revision and status, carried in the same attested write |
| Disposition (answered, Later, waiting) and visible comments | a Rikuy stored query over the request and decision facts |
| Curator | a Rikuy job with a least-privilege named credential that writes only the request graph |
| Enrollment ceremony page | Rikuy, on the dedicated origin |
| The Deck vocabulary | a Rikuy ontology and SHACL shapes, loaded into Quipu as data |

### Integrity that Quipu no longer enforces

Quipu's native Deck refuses an undeclared label at present. Quipu SHACL cannot
express "the chosen label is one of this request's labels", because that
needs a SPARQL-based constraint. Rikuy enforces it in two places:

- the client refuses to build such a write;
- the disposition query **fails closed**: a decision whose label is not
  declared, or whose receipt lacks the request-revision and item
  expectations, never counts as answered and is shown as invalid.

A malformed decision is still the operator's signed statement and is kept;
it simply never changes a disposition.

## Safety properties, kept from the earlier design

Each of these must record nothing, and Rikuy's end-to-end tests check it by
counting receipts, challenges and facts before and after:

| Case | Mechanism |
|---|---|
| Stale card (the item changed) | an expectation fails at commit |
| Closed item | an expectation on its status fails |
| Second answer to the same revision | the "decided" expectation fails |
| Signer revoked, expired or removed after the challenge | the commit re-checks the signer |
| Graph removed from the signer's list after the challenge | the commit re-checks the list |
| Replay | the challenge is already consumed |
| Forged or wrong-origin assertion | verification fails |
| Expired challenge | the server clock refuses |

## Performance acceptance

Measured before the move, on the current Deck (Quipu main, release build, a
file-backed store, 300 sequential answers): present plus attest takes about
10 ms at p50 and 23 ms at p95 on a busy shared host. After the move, the same
harness runs challenge plus commit, on the same host, interleaved with a rerun
of the old one. The new path must be equal or faster at p50 and p95.

## Migration, in order

1. Quipu: add the attested-write primitive behind a default-off switch, as a
   rename and generalisation of the Deck internals, with the Deck's existing
   tests ported to generic fixtures.
2. Rikuy: build the Deck on it (vocabulary, curator, card, disposition
   query) with end-to-end tests for every row of the safety table.
3. Switch the Brief to the Rikuy Deck. The old path stays available until the
   new one passes.
4. Quipu: remove the Deck routes, CLI, MCP tools, types and design documents
   through a reviewed deprecation, keeping only the generic primitive.
   Existing Deck facts stay as ordinary governed facts. The old tables are
   kept read-only until a separate data ruling.

Acceptance for step 4: `git grep -i deck` in Quipu's source finds no domain
hits.

## Review rulings

1. **Signed content is held by the server.** The challenge request carries
   the proposed signer, graph, datums and expectations once. Quipu stores the
   exact canonical bytes with the challenge. The commit carries only the nonce
   and the assertion, so nothing signed can be swapped between challenge and
   commit. Rikuy's curator, not the card, is the author of the request facts
   the card shows.
2. **Graph scope is enforced twice.** Each signer has an explicit list of
   graphs it may write, checked at challenge and at commit, and the graph's
   normal authority and SHACL gates still apply.
3. **The governance decision-nonce table stays separate** for now. Merging it
   with the attested-write receipt is a later, separate decision.

The primitive ships default-off.
