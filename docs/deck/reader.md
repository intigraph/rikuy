# Bounded online reader source

`web/deck/reader.mjs` supplies the read function accepted by the online Deck
view. Importing it performs no request. The shipped app still has signing
disabled and selects no production endpoint, registration receipt or query.

`readerDefinitions(boundary, provenanceNamespace)` constructs five stored-query
definitions: request, item, answers, facts and subject-to-receipt links. They
use explicit graph IRIs and validated IRI/integer parameters. The native
provenance namespace must equal the primitive's fixed vocabulary identifier;
a configurable lookalike could otherwise hide real answers as an empty set.
It is not the Rikuy vocabulary. The adapter sends named `/ask` requests, never raw `/query` text.
The exact rendered text returned by `/ask` must match the source definition.

Before a deployment can use the adapter, its owner must register those exact
definitions through the normal governed path and admit their served plans and
read cost. Each configured query hash is SHA-256 of the UTF-8 JSON encoding of
the source definition. It binds name, template, parameter kinds and output
bound. A hash supplied by a caller is not a registration or read-cost receipt.
This source neither registers queries nor grants permission to run them.

The reader also requires retained creation provenance for all three committed
graphs. It checks each through the bounded `GET /graphs?graph=<iri>` route.
An absent, replaced, overlay or ambiguous graph is UNKNOWN. This metadata
check does not prove graph protection, origin admission or operator enablement.
Native verified point receipts and exact typed fact/provenance read-back are
still required for every answer.

Output limits deliberately include an overflow sentinel. Request and item
queries stop at three rows and require exactly one; answer queries stop at 21
and admit at most 20; fact and link queries stop at 65 and admit at most 64.
Reaching the limit, truncation, duplicate rows, count mismatch, changed query,
missing receipt or incomplete read-back refuses the entire view. An empty
answer list needs the positive request/item reads and all graph bindings.
No missing evidence is converted to a settled answer.

One cycle has a maximum six-second deadline, no overlapping cycle and at most
two requests in flight. An injected transport must honor abort and streaming
byte limits. `readerTransport` provides a browser Fetch implementation with
those byte limits, redirect refusal, omitted credentials, no cache and the
`daily-brief` client attribution. It permits only the pinned HTTPS origin's
graph, named-query and point-receipt routes; it has no commit or registration
method. It neither signs nor retries a write.

Request and item reads bracket answer retrieval. A changed revision or closed
item refuses the result. These separate reads do not establish an atomic
snapshot or rule out every intervening change. The signed proposal's native
CAS remains authoritative at commit time.

`just ci` covers complete positive reads, positive controls for empty answers,
graph and query identity, overflow, missing/foreign receipts, wrong fact types,
changed/closed items, request/item bookends, deadlines, overlapping cycles,
streamed byte limits and restricted HTTP routes. The native qualification
command in [contract.md](contract.md) now loads all five definitions into
disposable stores and uses actual stored-query execution, graph metadata,
point receipts and typed read-back for Choose, Later and comment.

The native transport dispatch in that qualification is synthetic and local.
It proves neither served HTTP/CORS nor production query cost, profile-union
shape admission, graph protection or human/device enrollment. The result
archive in [reader-native-results.json](reader-native-results.json) records
the candidate and fixture hashes. No production adapter is selected by this
change, and there is no newly observable behavior in the disabled page.

The browser qualification in `scripts/qualify-deck-reader-browser.cjs` mounts
the actual view with this reader and uses actual browser Fetch/CORS and body
streaming. Every HTTP reply is intercepted synthetic data. Its five controls
show Answered, empty-but-controlled Waiting, changed query UNKNOWN, missing
receipt UNKNOWN and oversized reply UNKNOWN. The archive is
[reader-browser-results.json](reader-browser-results.json). Run it with an
explicit local Playwright installation and Chrome:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/qualify-deck-reader-browser.cjs
```
