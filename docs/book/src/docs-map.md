# Docs map

Every document in the repository, grouped by what you are trying to do.

## Start here

| Document | What it covers |
|---|---|
| [README](https://github.com/intigraph/rikuy/blob/main/README.md) | What Rikuy does today, what is planned, install and first run |
| [Introduction](introduction.md) | What Rikuy is and is not |
| [Getting started](getting-started.md) | Demo, build and checks |
| [Implementation status](status.md) | Every part and whether it works, is switched off or is missing |

## Understand it

| Document | What it covers |
|---|---|
| [How it works](how-it-works.md) | Routes, how panels read, why everything starts off |
| [Signed decisions](signed-decisions.md) | A decision from card to record, in plain words |
| [Reference](reference.md) | Config flags, commands, installer |

## Signed decisions in detail

These live in `docs/` outside the book. Each opens with a short summary.

| Document | What it covers |
|---|---|
| [Deck boundary](https://github.com/intigraph/rikuy/blob/main/docs/design/deck-boundary.md) | The design: what Rikuy owns and the one primitive Quipu keeps |
| [Request and answer contract](https://github.com/intigraph/rikuy/blob/main/docs/deck/contract.md) | What is signed, what is checked, how a lost reply is recovered |
| [Curator](https://github.com/intigraph/rikuy/blob/main/docs/deck/curator.md) | The job that publishes requests |
| [Reader](https://github.com/intigraph/rikuy/blob/main/docs/deck/reader.md) | How the page reads requests and answers within fixed limits |
| [Settlement](https://github.com/intigraph/rikuy/blob/main/docs/deck/settlement.md) | How a choice closes the Ask in Seeds |
| [Admission](https://github.com/intigraph/rikuy/blob/main/docs/deck/admission/README.md) | The checklist a deployment completes before turning signing on |
| [Enrollment ceremony](https://github.com/intigraph/rikuy/blob/main/docs/enrollment/ceremony.md) | Creating and registering a passkey |

## Other pages

| Document | What it covers |
|---|---|
| [Ephemeral job economics](https://github.com/intigraph/rikuy/blob/main/docs/ephemeral-economics.md) | The job-cost report and how its numbers are counted |
| [Repository pendant](https://github.com/intigraph/rikuy/blob/main/docs/knowledge/README.md) | The Quipu share published with each release |

## Evidence

`docs/demos/` and `docs/probes/` hold recorded runs, transcripts and result
files. They are evidence for specific changes, not guides. Read them when you
need to check a claim.

## Working on the source

[AGENTS.md](https://github.com/intigraph/rikuy/blob/main/AGENTS.md) and
[CONTRIBUTING.md](https://github.com/intigraph/rikuy/blob/main/CONTRIBUTING.md)
describe source work. LICENSE and NOTICE cover licensing and attribution.
