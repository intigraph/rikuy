# Ephemeral job economics

The Today Board tab links to `/economics/`. It opens an explicit local snapshot;
it sends no network requests and activates no reader or refresh schedule.

Read an operator-selected ledger directory into a private output file:

```sh
node scripts/ephemeral-economics.mjs "$JOB_LEDGER" 2026-01-01T00:00:00Z 2026-01-02T00:00:00Z > snapshot.json
node scripts/render-ephemeral-economics.mjs snapshot.json > report.html
```

Open the standalone report, or import the snapshot into the static page. These
files contain operator data: keep them private and outside the repository and
public build. Only synthetic fixtures belong in source. The renderer escapes
embedded data; all displayed fields use text nodes.

The versioned extraction scans at most 4,000 directory entries and 2,000 matching
attempt records, within a three-second budget. It reads at most 64 KiB per file
and 8 MiB total. Symlinks, nonregular files, corrupt JSON, concurrent replacements
and exhausted bounds produce explicit coverage loss. The directory and each
record are checked around reads. This is a bounded observation, not a ledger-wide
atomic transaction or a promise of an immutable history. The snapshot records its
reader version, source digest, scanned count, bytes and observed-through time.
Neither command writes to the ledger. Prompts, summaries, environments and paths
are excluded from the extracted fields. No credentials are read.

Jobs count attempts spawned in `[start,end)`, UTC, with a maximum 31-day window.
Retries are separately counted; they are not extra delivered work. Ended wall
duration includes launch and waiting. Live attempts are censored and excluded
from percentiles. Negative, missing or future end timestamps reduce coverage.
Median and p90 use nearest rank; fewer than 20 duration samples is labelled low n.
Teardown lag has its own covered denominator. Job, harness, model and the stored
lifetime/turn/context budgets define separate cohorts. Missing models remain
UNKNOWN; never infer them from today's deployment configuration.

Exhaustion is the number of ended attempts whose first stored primary cause is
`timeout`, `turn budget` or `context budget`, divided by all ended attempts in
that cohort. The upper bound includes unknown causes. A verdict or report does
not establish delivery, merge or installed acceptance. Failed imports preserve
the previous successful page with a stale warning.

Tokens remain UNKNOWN until the existing usage reader can supply an exact,
qualified job-to-session binding. Turns, context limits and governor percentages
are not tokens. Crew-minutes and token savings remain UNKNOWN without a measured
comparable crew active-time baseline and intervention coverage. Missing telemetry
is not zero savings or an estimate. No historical records are backfilled.

The finite arithmetic fixture in `tests/economics.test.mjs` covers UTC boundaries,
retries, separate 10/2 and 10/10 cohorts, live jobs, invalid durations, unknown
causes, duplicates and reader limits. The browser check imports synthetic data,
checks arithmetic, safe text, mobile layout and stale retention, and blocks every
nonlocal request. Deployment of static assets remains a separate normal lane.
