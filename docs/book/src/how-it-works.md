# How it works

Rikuy is a set of static pages. Each page asks a Quipu server a small number
of fixed questions and draws the answers. This page explains the parts, how a
panel reads, and why a fresh build shows nothing.

## Two halves: a static site and a trusted server

The browser cannot be trusted with secrets, and a static site cannot keep a
clock or check a signature. So the work is split.

| Rikuy, in the browser | Quipu, on the server |
|---|---|
| Draws panels and cards | Stores every fact and its history |
| Sends named, bounded read requests | Runs the registered queries |
| Asks a passkey to sign | Issues the bytes to sign, checks the signature and writes the answer in one step |
| Remembers an answer that is in flight | Keeps the receipt that proves what was written |

Rikuy never holds a bearer token, a private key or a copy of operator data.

## Routes

`just build` writes these into `dist/`:

| Route | Page |
|---|---|
| `/` | Redirects to `/today/` |
| `/today/` | The Today brief: Today, Next, Pace, Board, Log and Explore |
| `/legacy/` | The earlier brief, kept as a fallback |
| `/knowledge/` | Next, Asks, pull requests and watches |
| `/deck/` | The decision card |
| `/enroll/` | Passkey enrollment |
| `/offline/` | Offline decisions |
| `/economics/` | The job-cost report |
| `/source.json` | The source revision this build came from |

## How a panel reads

1. Each query a panel uses is kept as a JSON file beside its code. The file
   holds the query's name, its exact text and the most rows it may return.
   Most panels have one query. A few have several.
2. The page sends the query's **name** to Quipu, not its text. Quipu runs the
   copy it has registered under that name.
3. The page checks that the server ran the same text it expected. A changed
   query is refused.
4. Each query has a row cap set one above what the panel will show. A result
   that reaches the cap was cut short, so the panel says *UNKNOWN* instead of
   showing a partial list.
5. Each request has a deadline of a few seconds and a size limit.

There are two exceptions to step 2. Opening a single record, to see its
fields and comments, sends two small fixed queries directly. They are limited
to that one record. The Board reads a server-side projection instead of a
named query.

A live feed is optional. When it is on, Quipu tells the page that something
changed, and the affected panels read again. The feed carries no data itself.

## Missing evidence is UNKNOWN

A panel can fail in many ways: a timeout, a cut-off result, a changed query, a
graph that was replaced. All of them end the same way. The panel says what it
could not verify, and never shows zero or an old value as if it were current.

The footer of the Today brief says it plainly: "Unknown never means zero."

## Why a fresh build shows nothing

Every part that talks to a server ships with its flag set to off. This is
deliberate. Three things must be true before a flag is turned on, and only the
person running the deployment can make them true:

1. **The queries are registered.** Quipu holds the exact text under the exact
   name.
2. **The cost is known.** Someone measured what each query costs on the real
   graph and accepted it.
3. **The scope is fixed.** The config names one server and one graph. Nothing
   in a URL or in browser storage can change it.

Flags live in config files, listed in the [reference](reference.md#configuration).
A deployment keeps its own copies of those files and its own snapshots. They
are never committed to this repository.

## What never ships in a build

- Credentials of any kind
- Private keys
- Operator data, graph snapshots or inventories
- Test fixtures and the demo's sample rows

The build test checks the last item on every run.
