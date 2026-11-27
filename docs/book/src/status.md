# Implementation status

As of version 0.4.0, checked on 2026-11-27.

**In one sentence:** the whole client is written and tested, the demo and the
job-cost report work today, and everything that touches a live Quipu ships
switched off.

## How to read this page

Each part is in one of three states.

| State | Meaning |
|---|---|
| **Works** | You can use it from a clean checkout today. |
| **Built, off** | The code and its tests are in the repository. A flag in a config file keeps it off until a deployment admits it. |
| **Not built** | It does not exist yet. |

"Admit" has a specific meaning here. Before a deployment turns a part on, it
registers the exact queries that part runs, measures what they cost, and
records which graph and server the part may talk to. Merging source code does
none of that.

## Pages

| Page | Route | State | Turned on by |
|---|---|---|---|
| Demo brief | `just demo` | Works. Shows checked sample rows. | Nothing to turn on |
| Today brief | `/today/` (the site root redirects here) | Built, off. Panels say *Unavailable*. | `web/today/reader-config.mjs`, plus three per-panel files (see below) |
| Retained brief | `/legacy/` | Built, off | `web/legacy/config.mjs` |
| Knowledge, pull requests and watches | `/knowledge/` | Built, off | `web/knowledge/config.mjs` |
| Decision card | `/deck/` | Built, off | `web/deck/config.mjs` |
| Passkey enrollment | `/enroll/` | Built, off | `web/enroll/config.mjs` |
| Offline decisions | `/offline/` | Page built, off. Server side not built. | `web/offline/config.mjs` |
| Job economics | `/economics/` | Works. Reads a local file you choose. | Nothing to turn on |

## What the Today brief can show

All of these are built and off. Most panels read one named query. *Needs you*
and held work read several, and the Board reads a projection.

| Panel | What it shows | Query |
|---|---|---|
| Needs you | Every open Ask and human-gated item, with options, recommendation, default, deadline and what it unblocks | `daily_brief_asks_v5`, with `daily_brief_source_control_v3`, `daily_brief_ask_titles_v1` and `daily_brief_ask_item_v1` |
| Later | Items answered "later" that stay visible | `daily_brief_later_v1` |
| Next | Open top-priority work, up to 20 | `daily_brief_priorities_v3` |
| Pace and deploy log | Deploys in the last 24 hours: succeeded, rolled back and failed | `daily_brief_deploys_v1` |
| Board | 31 days of items created and closed per day, and open counts by status | the `board_items` projection |
| Recently closed work | Up to 20 items closed in the last 24 hours | `daily_brief_changes_v1` |
| Work held by stopped agents | Items owned by agents that are no longer running | `daily_brief_held_head_v1`, `daily_brief_held_work_v1` |
| Recently deferred | The latest deferrals | `daily_brief_recently_deferred_v1` |
| Watches | Findings from scheduled watch reports | `daily_brief_watch_semweb_v1` |
| Explore | A clickable graph over a dated snapshot | a snapshot the deployment bundles |

## Deciding

| Step | State | Notes |
|---|---|---|
| Show an Ask as a card | Built, off | Read-only until signing is admitted |
| Publish a signable request (the curator) | Built, off | Tested against a local Quipu server with a throwaway store |
| Sign an answer with a passkey | Built, off | Needs Quipu's attested writes switched on |
| Verify and read back the answer | Built, off | Tested against local stores |
| Close the Ask in Seeds | Built, off | Needs the Seeds settlement port admitted |
| Enroll a real passkey | Built, off | No real device or person has been enrolled |
| Decide offline and send later | Page built | The server side that would accept the queued answers is not built |

[Signed decisions](signed-decisions.md) explains the steps.

## Not built

- **Delivery measures.** Deploy frequency, lead time, change failure rate and
  time to restore are not computed. The Pace tab shows deploy counts for 24
  hours and nothing more.
- **Merges, releases and closes in Pace.** The three queries are written
  (`web/today/pace/merges.json`, `releases.json` and `closes.json`) but the
  page does not use them.
- **Trends.** There is no burn-down or open-against-closed trend line. The
  Board tab holds the daily numbers such a chart would need.
- **Notifying anyone.** When the operator answers a card, nothing tells an
  agent or an administrator. The answer is a fact in Quipu and that is all.
- **A prebuilt package.** Releases carry a repository pendant, not a built site
  with a checksum. The installer builds from source.

## Known problems

- Seven curator custody tests fail on macOS. Its temporary directory is
  reached through a symbolic link, and the custody check refuses symlinked
  paths. They pass on Linux, which is what CI runs.

## What turning it on takes

In order, for a deployment that wants live reads and then signed decisions:

1. Serve the built files over HTTPS from an origin used for nothing else.
2. Register each query from the table above in Quipu, exactly as written.
3. Measure and accept the read cost of each query.
4. Set the reader flags in `web/today/reader-config.mjs`. Three panels have a
   gate of their own as well. Recently closed work and watches each need
   their `admission.json` enabled, with its receipts filled in. Recently
   deferred needs `since` and `installationReceipt` in its `coverage.json`.
5. For signing: switch on Quipu's attested writes, allow the brief's origin,
   run the curator with its own narrow credential, and enroll a passkey through
   the [ceremony](https://github.com/intigraph/rikuy/blob/main/docs/enrollment/ceremony.md).
6. Complete the [admission checklist](https://github.com/intigraph/rikuy/blob/main/docs/deck/admission/README.md)
   and keep it private.
