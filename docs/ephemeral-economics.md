# Ephemeral job economics

**Status: works today.** The page reads a snapshot file you choose. It sends
no network requests and turns on no reader or refresh schedule.

**In short.** This report answers "how many short agent jobs ran, how long did
they take, and how often did they run out of budget?" You extract a snapshot
from a job ledger on your own machine, then open it in the `/economics/` page
or as a standalone report. The Board tab of the Today brief links to it.

## Make a report

Read a ledger directory you select into a private file, then render it:

```sh
node scripts/ephemeral-economics.mjs "$JOB_LEDGER" 2026-01-01T00:00:00Z 2026-01-02T00:00:00Z > snapshot.json
node scripts/render-ephemeral-economics.mjs snapshot.json > report.html
```

Open `report.html`, or import `snapshot.json` into the static page.

**These files contain operator data.** Keep them private, outside the
repository and outside the public build. Only synthetic fixtures belong in
source. The renderer escapes embedded data, and every displayed field is drawn
as a text node.

Neither command writes to the ledger. Prompts, summaries, environments and
paths are left out of the extracted fields. No credentials are read.

## What is counted

| Measure | Definition |
|---|---|
| Jobs | Attempts spawned in `[start, end)`, in UTC. The window is 31 days at most. |
| Retries | Counted separately. A retry is not extra delivered work. |
| Duration | Wall time until the attempt ended, including launch and waiting |
| Median and p90 | Nearest rank. Fewer than 20 samples is labelled *low n*. |
| Teardown lag | Reported with its own covered denominator |
| Exhaustion | Ended attempts whose first stored primary cause is `timeout`, `turn budget` or `context budget`, divided by all ended attempts in the cohort |

Details that affect the numbers:

- Attempts that are still running are left out of the percentiles.
- A negative, missing or future end time reduces coverage.
- The upper bound on exhaustion includes attempts whose cause is unknown.
- Cohorts are split by job, harness, model, and the stored lifetime, turn and
  context budgets.
- A missing model stays UNKNOWN. It is never inferred from today's deployment
  configuration.

A verdict or a report from a job does not show that anything was delivered,
merged or installed.

## What is not measured

| Measure | Why it is UNKNOWN |
|---|---|
| Tokens | The usage reader cannot yet bind a job to a session exactly. Turns, context limits and governor percentages are not tokens. |
| Crew-minutes and token savings | There is no measured, comparable baseline of crew active time, and no coverage of interventions |

Missing telemetry is not zero savings, and it is not estimated. No historical
records are backfilled.

## Limits on the extraction

The extraction is versioned and bounded.

| Limit | Value |
|---|---|
| Directory entries scanned | 4,000 |
| Matching attempt records | 2,000 |
| Time budget | 3 seconds |
| Bytes per file | 64 KiB |
| Bytes in total | 8 MiB |

Symbolic links, non-regular files, corrupt JSON, files replaced during the
read and exhausted limits are all reported as lost coverage. The directory and
each record are checked before and after reading.

This is a bounded observation. It is not an atomic transaction over the whole
ledger, and it does not promise the history is immutable.

The snapshot records the reader version, the source digest, the scanned count,
the bytes read and the time it observed through.

If an import fails, the page keeps the last successful report and shows a
stale warning.

## How it is tested

`tests/economics.test.mjs` uses a fixed arithmetic fixture. It covers UTC
boundaries, retries, separate 10/2 and 10/10 cohorts, live jobs, invalid
durations, unknown causes, duplicates and the reader limits.

The browser check imports synthetic data, then checks the arithmetic, safe
text, the mobile layout and stale retention. It blocks every non-local
request.

Deploying the static files is a separate, normal step.
