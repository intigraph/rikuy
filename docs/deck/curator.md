# Conditional curator source

`publicationPlan` builds one existing SPARQL `/update` operation. A first
publication requires no current revision and revision 1. A later publication
requires the exact previous head and manifest and advances by exactly one.
The new immutable revision subject must have no facts. Both forms check the
canonical item's exact revision and open status, rejecting additional values
in either slot. The only DELETE/INSERT target is the request graph. Previous
manifests, answers and item facts are retained.

`scripts/deck-curator-job.mjs` supplies `CuratorJob` with explicit injected
inspection, send and read-back adapters. It selects no endpoint, credential,
timer or production store. Before proceeding it checks the configured native
store lineage and retained graph-creation identity against inspection of a
registered committed graph. This separate inspection is not an atomic graph
replacement guard or proof of server-side credential restrictions.

The job requires an existing owned directory with mode 0700 and no symlinked
path. It creates a mode-0600 custody file exclusively, containing the complete
plan, store lineage, graph pin and their digest. The file and directory are
synced before the one send. The custody slot is keyed by store, request graph,
request ID and revision; a different payload or graph pin conflicts. Partial,
corrupt, foreign-owned or symlinked records refuse. The directory must remain
on the job's durable volume across restarts; using a fresh directory defeats
that local custody guarantee.

Every retained file stays UNKNOWN, including after successful confirmation.
Subsequent instances may only read it and reconcile; they never resend. A
lost response or read timeout therefore retains the exact publication intent.
`reconcile` can read an expired request's retained intent, while `publish`
refuses to initiate an expired publication. No automatic cleanup or retry is
provided. This is local job custody, not a cross-host exactly-once protocol.
Concurrent distinct publications are additionally controlled by the native
conditional update.

A response must describe the exact request graph, one positive transaction,
two assertions and zero or one retraction. A zero-change report cannot be
mistaken for a changed transaction. CONFIRMED also requires complete exact
manifest/current-revision read-back from the pinned store. Read-only recovery
may confirm matching state without a transaction ID; it does not attribute
that state to this job or mint a signed receipt. Missing, foreign or changed
evidence remains UNKNOWN. No accepted decision or answered disposition is
created by publishing a request.

Production adapters are still owed. They must pin the actual server/store,
native graph registration, bounded admitted reader definitions and cost, and
use the sanctioned authenticated write path. A dedicated named credential
must be restricted by the server's admitted policy to the request graph.
The generated query's narrow mutation target is not a security boundary for
a broad bearer. Declared actor/source fields are attribution, not verified
authentication. This source grants no credential, graph creation, protection,
registration, served enablement or enrollment authority. Production profile
union and external-writer/graph-replacement assumptions need admission too.

## Repeatable qualification

`just ci` covers query construction, strict transaction/read-back validation,
durable-before-send ordering, changed-payload refusal, restart/lost-response
reconciliation, concurrent job instances and unsafe custody. Negative target
controls reject missing/replaced/overlay graphs and wrong store lineage.

The explicit qualifier starts one loopback native server with a new disposable
store, private HOME/configuration and a synthetic test bearer. It opens no
installed store and inherits no production credential or provider setting.
Its positive item facts control the graph-mutation checks. It runs the actual
generated update through HTTP, checks native reports and retained manifests,
races two distinct publications, and loses a reply after a real native commit
before read-only recovery by a new job instance. It reaps its child and removes
the fixture in `finally`, with a 90-second server bound.

```sh
QUIPU_SERVER=/absolute/path/to/pinned/quipu-server \
QUIPU_SERVER_SHA256=<exact-sha256> node scripts/qualify-deck-curator.mjs
```

[curator-native-results.json](curator-native-results.json) records the clean
release/full candidate and synthetic controls. That candidate is an explicit
source qualification artifact, not a claim about an installed or officially
released server. The fixture's broad synthetic bearer does not demonstrate
least-privilege credential enforcement, real enrollment or production cost.
