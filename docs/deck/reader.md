# The reader: reading requests and answers within limits

**Status: built, switched off.** The shipped page has signing disabled and
selects no production endpoint, registration receipt or query. Importing the
reader makes no request.

**In short.** `web/deck/reader.mjs` is the function the decision card uses to
read. It runs five named queries, checks the three graphs it reads from, and
refuses the whole view if anything is cut short, changed or missing. It can
read and nothing else: it has no way to commit or register.

Background: [Signed decisions](../book/src/signed-decisions.md) and the
[request and answer contract](contract.md).

## The five queries

`readerDefinitions(boundary, provenanceNamespace)` builds five stored-query
definitions:

| Query | Reads |
|---|---|
| request | The curated request |
| item | The work item the request is about |
| answers | Answers to the request |
| facts | The facts of each answer |
| links | Which receipt each written subject points to |

They use explicit graph IRIs and validated IRI and integer parameters.

The adapter sends named `/ask` requests, never raw `/query` text. The exact
rendered text that `/ask` returns must match the source definition.

The native provenance namespace must equal the attested-write feature's fixed
vocabulary identifier. If it were configurable, a lookalike namespace could
hide real answers and make the result look empty. This namespace is not the
Rikuy vocabulary.

## Before a deployment can use it

The deployment's owner must:

1. Register those exact definitions through the normal governed path.
2. Admit their served plans and their read cost.

Each configured query hash is the SHA-256 of the UTF-8 JSON encoding of the
source definition. It binds the name, the template, the parameter kinds and
the output bound. A hash supplied by a caller is not a registration or a
read-cost receipt.

This source registers no queries and grants no permission to run them.

## Checking the graphs

The reader requires retained creation provenance for all three committed
graphs, and checks each through `GET /graphs?graph=<iri>`. A graph that is
absent, replaced, an overlay, or ambiguous is UNKNOWN.

This check reads metadata. It does not prove graph protection, origin
admission or that an operator enabled anything. Every answer still needs a
native verified receipt and an exact, typed read-back of its facts and
provenance.

## Row limits

Each query's limit is set above what the reader will accept, so a cut-off
result is visible.

| Query | Stops at | Accepts |
|---|---|---|
| request, item | 3 rows | exactly 1 |
| answers | 21 rows | at most 20 |
| facts, links | 65 rows | at most 64 |

Any of these refuses the entire view:

- reaching the limit, or a truncated result;
- duplicate rows or a count mismatch;
- a changed query;
- a missing receipt;
- an incomplete read-back.

An empty answer list is trusted only together with positive request and item
reads and all graph bindings. Missing evidence is never turned into a settled
answer.

## Time and transport limits

- One read cycle has a deadline of at most six seconds.
- Cycles never overlap.
- At most two requests are in flight at once.

An injected transport must honor abort and streamed byte limits.
`readerTransport` is a browser Fetch implementation that does so. It also:

- refuses redirects;
- omits credentials;
- bypasses the cache;
- sends the `daily-brief` client attribution;
- permits only the pinned HTTPS origin's graph, named-query and point-receipt
  routes.

It has no commit or registration method. It neither signs nor retries a write.

## Reading before and after

The request and the item are read before and after the answers. A changed
revision or a closed item refuses the result.

These are separate reads. They do not make an atomic snapshot, and they cannot
rule out every change in between. The signed proposal's conditions, checked by
Quipu at commit, remain the authority.

## The item query, version 2

The item definition is `rikuy_deck_item_v2`.

- It limits each subject-and-predicate lookup to three rows before joining,
  then keeps the three-row outer limit.
- Several revisions or statuses stay visible and cause a refusal. The query
  does not aggregate or pick a preferred value.
- The status is returned as a full IRI string, so a server's namespace
  shortening cannot change the comparison.
- A status that is not an IRI becomes an invalid marker rather than
  disappearing. An extra malformed value therefore still makes the item
  ambiguous.

The previous version stays in the registry under its own name. A deployment
must admit the new definition, its hash and its measured cost. Delivering
source does not replace an existing protected definition or enable the reader.

## Qualification

### `just ci`

Covers complete positive reads, positive controls for empty answers, graph and
query identity, overflow, missing and foreign receipts, wrong fact types,
changed and closed items, the before-and-after reads, deadlines, overlapping
cycles, streamed byte limits and the restricted HTTP routes.

### Native

The native qualification command in
[contract.md](contract.md#qualification-and-remaining-acceptance) loads all
five definitions into disposable stores. It uses real stored-query execution,
graph metadata, point receipts and typed read-back for Choose, Later and
Comment. It also checks full status identity, a visible malformed extra
status, and revision overflow.

The transport in that run is synthetic and local. It proves nothing about
served HTTP or CORS, production query cost, profile-union shape admission,
graph protection, or human and device enrollment.
[reader-native-results.json](reader-native-results.json) records the candidate
and fixture hashes.

### Browser

`scripts/qualify-deck-reader-browser.cjs` mounts the real view with this
reader, and uses real browser Fetch, CORS and body streaming. Every HTTP reply
is intercepted synthetic data. Its five controls show:

1. Answered;
2. Waiting, empty but controlled;
3. a changed query, UNKNOWN;
4. a missing receipt, UNKNOWN;
5. an oversized reply, UNKNOWN.

Results are in [reader-browser-results.json](reader-browser-results.json). Run
it with an explicit local Playwright installation and Chrome:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/qualify-deck-reader-browser.cjs
```

No production adapter is selected by any of this, and the disabled page
behaves exactly as before.
