# Using it with agents

There is nothing to connect. Rikuy is a page for people. It is not an MCP
server, and no agent step is needed to draw it.

Agents shape what the brief shows by writing to Quipu:

| Agents write | Through | The brief shows |
|---|---|---|
| Work items, their status and priority | [Seeds](https://github.com/intigraph/seeds) | Next, Board, recently closed work |
| A question for a person (an Ask), with options, a default and an expiry | Seeds | A card under *Needs you* |
| Deploy records | [Camayoc](https://github.com/intigraph/camayoc) shapes | Pace and the deploy log. Merges and releases are not shown yet. |
| Watch reports | Quipu | Watches |

Two rules for agents working on this repository are in
[AGENTS.md](https://github.com/intigraph/rikuy/blob/main/AGENTS.md): keep
experimental readers off by default, and never commit credentials or operator
data.
