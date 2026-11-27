# Reference

## Configuration

Each page has a config file. Every flag ships set to off. A deployment
edits its own copy; nothing in a URL or in browser storage can change these
values.

| File | Flags | What it controls |
|---|---|---|
| `web/today/reader-config.mjs` | `enabled`, `liveFeed`, `askDecisionsEnabled`, `readerOrigin` | Today's live reads, its change feed and its answer buttons. `readerOrigin` is the page's own origin. |
| `web/legacy/config.mjs` | `enabled`, `endpoint`, `graph`, `transport`, `registration` | The retained brief: the server, the graph and how it polls |
| `web/knowledge/config.mjs` | `enabled`, `prFlow.enabled`, `watches.enabled`, plus a receipt for each | Knowledge, pull requests and watches |
| `web/deck/config.mjs` | `enabled` | The decision card |
| `web/enroll/config.mjs` | `enabled`, `origin`, `rpId` | Passkey enrollment. `origin` must be one exact HTTPS origin, and `rpId` its hostname. |
| `web/offline/config.mjs` | `enabled`, `installCache` | Offline decisions and the installable app |

Three Today panels have a further gate beside their code:
`web/today/changes/admission.json` and `web/today/watches/admission.json`
(`enabled`, plus registration and read-cost receipts), and
`web/today/recently-deferred/coverage.json` (`since` and
`installationReceipt`). Each ships off or empty.

Query definitions sit beside the code that uses them, for example
`web/today/asks/query.json`. Each holds the query's name, its text and its row
cap. Register them in Quipu exactly as written.

The deployment owner supplies everything specific to an installation: the
server address, the graph, the registered queries, the accepted read cost, any
snapshot and the signing enrollment. None of it belongs in this repository.

## Commands

| Command | What it does |
|---|---|
| `just demo` | Builds the site and serves the sample brief on `http://127.0.0.1:4173` |
| `just build` | Writes the static site to `dist/` |
| `just test` | Runs the unit tests |
| `just ci` | Runs tests, the build, the README check and the browser checks |
| `just book` | Builds this book with mdBook |
| `just installer-check` | Checks the installer against private release fixtures |

Scripts that test against a real local Quipu server are run by hand. They are
described in the document for the part they qualify:
[contract](https://github.com/intigraph/rikuy/blob/main/docs/deck/contract.md#qualification-and-remaining-acceptance),
[curator](https://github.com/intigraph/rikuy/blob/main/docs/deck/curator.md#repeatable-qualification),
[reader](https://github.com/intigraph/rikuy/blob/main/docs/deck/reader.md) and
[admission](https://github.com/intigraph/rikuy/blob/main/docs/deck/admission/README.md).

## Installing and removing

Rikuy is distributed as source. There is no prebuilt package with a checksum
yet.

### Install

```sh
curl -fsSL https://raw.githubusercontent.com/intigraph/rikuy/main/install.sh | sh
```

You need Node 22+, npm, Python 3 and Git. Download and read `install.sh`
before you run it.

The installer does four things:

1. Clones the public `main` branch.
2. Runs `npm run build`.
3. Copies only `dist` into `PREFIX/share/rikuy/SOURCE_REVISION`. The default
   `PREFIX` is `~/.local`.
4. Writes `.source.json` there, recording the source revision and the package
   version.

It does not start a web server, and it sets up no credentials, no Quipu
address and no live reader.

| Option | How |
|---|---|
| Choose another prefix | Set `STACK_INSTALL_ROOT` in the shell that runs the installer |
| Pin a version | Not supported by the installer. Build by hand instead. |

Running the installer again for a revision that is already installed checks
every file, its mode and the source record. If anything differs, it stops
instead of overwriting.

`.source.json` says which source was built. It is not a release checksum, and
it does not show that anything is being served.

### Build a chosen revision by hand

Clone the repository, check out the revision you want, and run
`npm run build`. Deploy `dist` the way you deploy any static site.

### Remove

1. Stop pointing your web server at the installed files.
2. Delete that revision's folder, `PREFIX/share/rikuy/SOURCE_REVISION`.

Keep any other revisions you still use. Removing the files does not touch
Quipu data or your web server's configuration.
