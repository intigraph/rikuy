# Seeds-owned Ask settlement

A curated Ask request can include `settlement: {target, targetRevision}`.
Both items must use canonical Seeds IDs below the admitted item prefix. The
signed proposal adds the exact target IRI and revision as answer facts and a
sixth conditional slot for that target revision. Publication also guards that
revision. Legacy requests preserve their five-slot contract. A receipt for the
legacy contract cannot establish settlement authority.

The bounded reader uses the existing exact item query for the linked item and
brackets both item reads. This adds two bounded item calls; production read-cost
admission remains required. A changed item without an admitted choice refuses.
After a verified choice, historical answers remain readable even when native
settlement advances/closes the Ask. That history does not prove settlement.
The original request/boundary/proposal admission is retained privately: copying
an answer object or mutating nested proposal data cannot rebind it.

`applySettlement` accepts only an answer admitted by the full native receipt
reader for the exact request/boundary. Choose can settle; Later and Comment do
not close an Ask. The injected native port must independently verify the full
receipt, both revisions, identity, deadline, graph/store lineage and generation,
and own durable one-send custody. It invokes Seeds' `ask_settlement::settle`
(first attempt) or `ask_settlement::reconcile` (read-only recovery). The native
adapter maps the browser's camelCase DTO fields to the Rust request; the browser
DTO is not evidence of native admission. This source selects no such production
adapter, endpoint, credential, enrollment or writer scope.

The native result must prove the graph, both item IDs and advanced revisions,
exact receipt and one linked comment position. The native transition supplies
those facts only after its atomic batch and both-item read-back. The browser
keeps the signed pending intent until this proof succeeds. An uncertain write
leaves it pending; Recover receipt invokes read-only settlement reconciliation
and never resends the transition. A crash before the first native send can
therefore remain unproven for explicit operator handling. No absence is treated
as permission to retry. A separate Check linked ruling action is read-only.

The card distinguishes a signed choice from a closed Ask. It says the Ask is
closed only after native settlement read-back. The preview remains disabled by
default. Today can inject its deployment-owned Ask adapter only when explicitly
enabled; before showing controls, it checks the curated request against the
card's exact graph, item, revision, unblocks target and expiry. Public Today cards
remain read-only until a deployment supplies the admitted signing and settlement
adapters. Source browser fixtures use synthetic
receipt/writer/native ports, not a human ceremony or production acceptance.
