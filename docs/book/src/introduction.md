# Rikuy

Rikuy is a browser brief for people who run agents on
[Quipu](https://github.com/intigraph/quipu). It puts three things on one page:
what is being worked on, what shipped, and what is waiting on you. It also lets
you answer a waiting question with a signed decision.

Rikuy means "to see" in Quechua.

## What it is

- **A static site.** The build produces plain files. Any static web server can
  host them.
- **A reader, not a store.** Rikuy keeps no data of its own. Everything it shows
  comes from a Quipu graph through named, bounded queries.
- **Honest about gaps.** A panel that has no verified data says *Unavailable* or
  *UNKNOWN*. It never shows zero in place of a missing answer.
- **Off until admitted.** Live reads, signing and enrollment each ship switched
  off. Whoever runs a deployment turns each one on after checking it.

## What it is not

- It is not an agent, an MCP server or a chat window.
- It is not a work tracker. Work items live in
  [Seeds](https://github.com/intigraph/seeds).
- It is not where knowledge is written. Agents write to Quipu through
  [Camayoc](https://github.com/intigraph/camayoc).

## Where it stands

Version 0.4.0 is a complete client with nothing switched on. The demo, the
build and the job-cost report work from a clean checkout. Live reads and signed
decisions are written and tested, and wait for a deployment to admit them.
[Implementation status](status.md) lists every part.

## Where to go next

| You want to | Read |
|---|---|
| See it running in two minutes | [Getting started](getting-started.md) |
| Know exactly what works today | [Implementation status](status.md) |
| Understand the design | [How it works](how-it-works.md) |
| Follow a decision from card to record | [Signed decisions](signed-decisions.md) |
| Look up a config flag or a command | [Reference](reference.md) |
