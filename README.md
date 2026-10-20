<h1 align="center">rikuy</h1>
<p align="center"><em>👁 Keep status, graphs, watches and decisions in view</em></p>
<p align="center"><a href="LICENSE">Apache-2.0</a> · <a href="https://github.com/scbrown/rikuy/actions/workflows/ci.yml">CI</a> · <a href="https://github.com/scbrown/tambo">Quipu stack</a></p>

**Rikuy is a browser brief for people using Quipu: source-bound status, graphs,
watches and signed-decision client surfaces. It is a static site, not a new
knowledge store. Missing evidence stays UNKNOWN.** Rikuy means “to see” in Quechua.

## Why you would want it

- See work and its evidence together instead of copying headlines.
- Inspect a dated graph snapshot without treating it as live coverage.
- Keep experimental readers and signing enrollment off until your deployment admits them.

Read [how it works](docs/book/src/how-it-works.md) for the client boundaries.

## Install

Use Node 22 or newer and [just](https://github.com/casey/just).
The first source release has no published installable package or server daemon.

```sh
git clone https://github.com/scbrown/rikuy.git
cd rikuy
just build
```

The static output is `dist/`. Deploy it through your normal static-site lane;
configure only your admitted graph, exact query definitions and read budget.
Never put a bearer, private key or operator snapshot in a public bundle.

## First success in three commands

```sh
git clone https://github.com/scbrown/rikuy.git
cd rikuy
just demo
```

```text
Validated demo: 2 priorities and 1 decision.
Rikuy demo: http://127.0.0.1:4173
```

Open that address. These are validated synthetic rows, with no Quipu requests
or real decisions. Stop the local demo with Ctrl-C.

## On your own data

| Question | Entry point |
|---|---|
| Which status can I trust? | [Source configuration](docs/book/src/reference.md) |
| Is this graph live? | The explorer labels its dated snapshot separately |
| Can I enable Watches or offline signing? | Only after the separate admission and enrollment checks |

## Before you start

| Surface | Requirement |
|---|---|
| Build and tests | Node 22+, just |
| Browser | Modern ES modules, WebAssembly and workers |
| Live reads | Admitted graph and exact named queries; credentials stay server-side |

## What's next

- [Book home](docs/book/src/introduction.md)
- [Docs map](docs/book/src/docs-map.md)
- [Getting started](docs/book/src/getting-started.md)

## 🧺 The stack

<!-- stack-table:start -->

The Quipu stack is built around a governed, bitemporal knowledge store: shared
facts, decisions and work history your agents can query. Quipu can check writes
against your rules, records where each fact came from, and answers what was true
when.

| tool | what it gives your agents |
|---|---|
| [caboodle](https://github.com/scbrown/caboodle) | 🧰 Agent Platform Toolkit - installs and configures the quipu stack |
| [quipu](https://github.com/scbrown/quipu) | stores shared facts with provenance and history; can check writes against your rules |
| [camayoc](https://github.com/scbrown/camayoc) | prepares knowledge and vocabulary for Quipu, with checks before it is admitted |
| [bobbin](https://github.com/scbrown/bobbin) | searches your code and can include related knowledge from Quipu |
| [yupana](https://github.com/scbrown/yupana) | shows code impact and can read policies from Quipu to check changes |
| [desire-path](https://github.com/scbrown/desire-path) | turns agent mistakes into feature requests; works on its own without Quipu |
| [seeds](https://github.com/scbrown/seeds) | a work item tracker backed by the Quipu knowledge base |
| [shantytown](https://github.com/scbrown/shantytown) | runs crews of AI agents on work items, triggered by hand, on a schedule or by events; can share work and memory through Quipu |
| [rikuy](https://github.com/scbrown/rikuy) | live brief: status, graphs, watches and signed decisions over Quipu |
| [shuttle](https://github.com/scbrown/shuttle) | runs signed agent workflows and keeps their records in Quipu |

<!-- stack-table:end -->

## Contributing

```sh
just build
just test
just ci
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## 📜 License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
