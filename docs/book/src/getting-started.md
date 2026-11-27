# Getting started

You need Node 22 or newer and [just](https://github.com/casey/just).

## Run the demo

```sh
git clone https://github.com/intigraph/rikuy.git
cd rikuy
just demo
```

```text
Validated demo: 2 priorities and 1 decision.
Rikuy demo: http://127.0.0.1:4173
```

Open the address. The brief shows sample rows that were checked before they
were drawn: one decision under *Needs you* and two priorities under *Next*.
The demo never contacts Quipu and signs nothing. Stop it with Ctrl-C.

The newer Today page is at `/today/`. With no live source connected, each of
its panels says *Unavailable*. That is the intended behavior, not an error.

## Build the site

```sh
just build
```

The static files land in `dist/`. Serve that folder with any static web
server. The build also writes `dist/source.json`, which records the source
revision so you can tell which build a server is hosting.

## Run the checks

```sh
just test   # unit tests
just ci     # tests, build, README check and browser checks
```

The browser checks need a browser that is already installed. Set
`RIKUY_BROWSER_EXECUTABLE` to its path, or install Playwright Chromium
yourself. The test commands never install a browser or system packages.

## Install without cloning

The [installer](reference.md#installing-and-removing) builds the current
source and copies the static files into `~/.local/share/rikuy/`. It starts no
server and configures no connection.

## Use your own data

A fresh build reads nothing. To point it at your own Quipu graph, read
[How it works](how-it-works.md) first, then the
[configuration reference](reference.md#configuration).
