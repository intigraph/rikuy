# Source configuration

`web/legacy/config.mjs` owns the immutable reader contract and disabled activation. A deployment supplies its exact graph, source/curator/row binding, creation receipt and registered query definitions. No URL or local-storage switch enables a reader. `web/knowledge/config.mjs` and `web/offline/config.mjs` remain disabled independently.

Production endpoints, graph registration, read-cost acceptance, snapshot provenance and signing enrollment must be provided by the deployment owner. The public demo is not their acceptance proof. Do not distribute operator data with this repository.

## Installing and removing

Rikuy currently distributes a source build, not a versioned release package.
The [one-line installer](https://github.com/intigraph/rikuy/blob/main/install.sh) requires Node 22+, npm, Python 3
and Git. It clones the public main branch, runs `npm run build` and copies only
`dist` into `PREFIX/share/rikuy/SOURCE_REVISION`. The default `PREFIX` is
`~/.local`. Its `.source.json` records the source revision and package version;
this is not a release checksum or a claim that a service has been deployed.

Download and review `install.sh` before running it. Set `STACK_INSTALL_ROOT`
on the receiving shell to choose a private prefix; no positional arguments or
version-pin flag are supported. Re-running for an existing revision verifies
the full static tree, file modes and source record and refuses drift instead
of overwriting it.

For a manually selected source revision, use a clean checkout of the public
repository, select the revision you intend to build, then run `npm run build`.
Deploy `dist` through your normal site lane. The installer does not configure
a web server, credentials, Quipu endpoints or live-reader activation.

To remove an installed build, first stop referring to its static files in your
site deployment, then remove only its `PREFIX/share/rikuy/SOURCE_REVISION`
directory. Keep other revisions you still use. Removing static output does not
remove Quipu data or change a separately managed site deployment.

A checksummed release installer remains unavailable until the project publishes
its release package and checksum manifest.
