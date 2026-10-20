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

Requires Node 22+, Python 3, Git and npm. Rikuy has **no published release
package or checksum manifest**. This installer builds the current public source
snapshot, records its Git revision and package version, and copies only the
static output into `~/.local/share/rikuy/REVISION`:

```sh
curl -fsSL https://raw.githubusercontent.com/scbrown/rikuy/main/install.sh | sh
```

Set `STACK_INSTALL_ROOT` on the receiving shell to choose another prefix. No
server, credentials or live connection are configured. Deploy the resulting
static files through your normal site lane. Never include a bearer, private key
or operator snapshot in the bundle. A versioned, checksummed release installer
remains unavailable until the project publishes its first release.

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
| [tambo](https://github.com/scbrown/tambo) | 🧰 Agent Platform Toolkit - installs and configures the quipu stack |
| [quipu](https://github.com/scbrown/quipu) | stores shared facts with provenance and history; can check writes against your rules |
| [camayoc](https://github.com/scbrown/camayoc) | prepares knowledge and vocabulary for Quipu, with checks before it is admitted |
| [quechua](https://github.com/scbrown/quechua) | shared vocabulary and shapes for interoperable knowledge |
| [chaski](https://github.com/scbrown/chaski) | reacts to graph changes and delivers governed notifications |
| [bobbin](https://github.com/scbrown/bobbin) | searches your code and can include related knowledge from Quipu |
| [yupana](https://github.com/scbrown/yupana) | shows code impact and can read policies from Quipu to check changes |
| [desire-path](https://github.com/scbrown/desire-path) | turns agent mistakes into feature requests; works on its own without Quipu |
| [seeds](https://github.com/scbrown/seeds) | a work item tracker backed by the Quipu knowledge base |
| [shantytown](https://github.com/scbrown/shantytown) | runs crews of AI agents on work items, triggered by hand, on a schedule or by events; can share work and memory through Quipu |
| [rikuy](https://github.com/scbrown/rikuy) | live brief: status, graphs, watches and signed decisions over Quipu |
| [shuttle](https://github.com/scbrown/shuttle) | runs signed agent workflows and keeps their records in Quipu |

<!-- stack-table:end -->

**Load this repository’s graph:** public repository-pendant publication is pending.
When an archive, checksum and provenance are published, use the
[verified import workflow](https://scbrown.github.io/quipu/sharing/index.html).
Extract the share directory before `quipu import SHARE_DIR --db repository.db`;
import stages knowledge and leaves ROOT unchanged.

## Contributing

```sh
just build
just test
just ci
```

See [CONTRIBUTING.md](CONTRIBUTING.md) and [AGENTS.md](AGENTS.md).

## 📜 License

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
