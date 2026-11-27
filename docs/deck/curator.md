# The curator: publishing requests

**Status: built, switched off.** The curator job and its HTTP adapters are
written and tested against a local Quipu server with a throwaway store.
Nothing here selects a server, a credential, a timer or a production store.

**In short.** The curator is a small server-side job that publishes a question
into the request graph so the page can show it as a card. It writes with one
conditional update, records its intent on disk before sending, sends at most
once, and never resends. If a reply is lost, it recovers by reading.

Background: [Signed decisions](../book/src/signed-decisions.md) and the
[request and answer contract](contract.md).

## The write

`publicationPlan` builds one SPARQL `/update` operation.

| Publication | Requires |
|---|---|
| First | No current revision exists. The new revision is 1. |
| Later | The exact previous head and manifest. The revision advances by exactly one. |

Both forms also require:

- the new revision subject, which never changes afterward, has no facts yet;
- the work item is at the exact expected revision;
- the work item's status is the open status;
- neither of those two slots holds any extra value.

The update writes only to the request graph. Earlier manifests, answers and
item facts are kept.

## The job

`scripts/deck-curator-job.mjs` provides `CuratorJob`. It takes three adapters
that the caller supplies: inspect, send and read back.

Before it proceeds, the job checks the configured store lineage and the
retained graph-creation identity against an inspection of a registered,
committed graph. This is a separate check. It is not an atomic guard against
the graph being replaced, and it does not prove the server restricts the
credential.

## Custody: writing down the intent first

The job keeps a record of each publication on local disk.

**The directory** must already exist, be owned by the job, have mode `0700`,
and have no symbolic link anywhere in its path. It must stay on the job's
durable volume across restarts. A fresh directory defeats the guarantee.

**The file** is created exclusively with mode `0600`. It holds the complete
plan, the store lineage, the graph pin and their digest. The file and the
directory are synced to disk before the one send.

**The slot** is keyed by store, request graph, request ID and revision. A
different payload or graph pin for the same slot is a conflict. Partial,
corrupt, foreign-owned or symlinked records are refused.

### Rules that never bend

- Every retained file stays UNKNOWN, even after a successful confirmation.
- A later run may read the file and reconcile. It never resends.
- A lost response or a read timeout therefore keeps the exact intent.
- `reconcile` can read the retained intent of a request that has expired.
  `publish` refuses to start a publication for an expired request.
- There is no automatic cleanup and no automatic retry.

This is custody local to one job. It is not an exactly-once protocol across
hosts. Two different publications racing each other are also controlled by
Quipu's conditional update.

## What counts as confirmed

A response must describe:

- the exact request graph;
- one positive transaction;
- two assertions;
- zero or one retraction.

A report of zero changes can never be mistaken for a changed transaction.

CONFIRMED also needs a complete, exact read-back of the manifest and current
revision from the pinned store.

Read-only recovery may confirm that the state matches without a transaction
ID. It does not credit that state to this job, and it does not create a signed
receipt. Missing, foreign or changed evidence stays UNKNOWN.

Publishing a request never creates an accepted decision or an answered state.

## The HTTP adapters

`scripts/deck-curator-http.mjs` supplies server-side HTTP adapters for the
three operations. Importing the module makes no request and loads no
credential.

You construct it with all of these, and it chooses none of them for you:

- an explicit HTTPS origin;
- the store lineage;
- a positive graph generation;
- the retained graph-creation registration;
- the boundary;
- the exact hash of the request-query definition;
- a bearer you already hold.

Pass its methods to `CuratorJob`. The job stays responsible for authorizing
the one send and for keeping UNKNOWN custody. Calling the transport directly
is not an exactly-once path.

How each operation behaves:

| Operation | Route | Notes |
|---|---|---|
| Inspect | `/watermark` and the exact `/graphs` entry | |
| Read back | A named `/ask` request, with the same two target checks before and after | Raw `/query` is never used |
| Update | `/update` | The only route that receives the bearer |

Limits on every operation:

- one deadline: three seconds by default, six at most;
- a streamed response limit of 262,144 bytes;
- redirects refused;
- no automatic retry.

A partial, ambiguous, changed or oversized reply stays UNKNOWN. Errors leave
out credentials and response bodies.

These separate checks are not an atomic fence against graph replacement. The
server's binding of the writer to a graph generation is still required when
the write happens.

## Still owed for production

- The real server, store and graph pins.
- Registered reader definitions and their cost receipts.
- The sanctioned authenticated write path.
- A dedicated, named credential that the server's admitted policy restricts to
  the request graph.
- Admission of production profile union, and of the assumptions about
  external writers and graph replacement.

Three cautions:

- The generated query targets only one graph, but that is not a security
  boundary for a broad bearer.
- Declared actor and source fields are attribution. They are not verified
  authentication.
- This source grants no credential, graph creation, protection, registration,
  served enablement or enrollment authority.

## Repeatable qualification

### What `just ci` covers

- query construction;
- strict validation of transactions and read-back;
- durable-before-send ordering;
- refusal of a changed payload;
- reconciliation after a restart or a lost response;
- concurrent job instances;
- unsafe custody.

Negative controls reject missing, replaced and overlay graphs, and a wrong
store lineage. The HTTP adapter controls also cover credential confinement, a
changed query identity, overflow, deadlines and lost-reply reconciliation
through the actual custody job. Those HTTP replies are synthetic. They prove
nothing about a production profile or access.

### The native qualifier

The explicit qualifier starts one loopback native server with a new disposable
store, a private HOME and configuration, and a synthetic test bearer. It opens
no installed store and inherits no production credential or provider setting.

It then:

1. runs the actual generated update over HTTP;
2. checks the native reports and retained manifests;
3. races two distinct publications;
4. loses a reply after a real native commit, then recovers read-only with a
   new job instance.

Its positive item facts control the graph-mutation checks. It reaps its child
process and removes the fixture in `finally`, with a 90-second bound on the
server.

```sh
QUIPU_SERVER=/absolute/path/to/pinned/quipu-server \
QUIPU_SERVER_SHA256=<exact-sha256> node scripts/qualify-deck-curator.mjs
```

[curator-native-results.json](curator-native-results.json) records the clean
release/full candidate (a release build with the `full` feature) and the
synthetic controls. That candidate is a source
qualification artifact. It is not a claim about an installed or officially
released server. The fixture's broad synthetic bearer does not demonstrate
least-privilege credential enforcement, real enrollment or production cost.
