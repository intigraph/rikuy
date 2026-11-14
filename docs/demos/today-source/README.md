# Consolidated Today source

The same `node scripts/build.mjs` build on base `6773a2a5164bdb3ca0ffecb11184d84a31761f7f` and this candidate changes the root entry from the older client to Today, ships the Today module/style/fallback, and retains the older client under `legacy/`. `source.json` remains present. The [actual build-inventory transcript](transcript.txt) compares isolated source checkouts; it is a text transcript, not a browser recording or installed-service claim.

Reproduce by building base and candidate in separate worktrees and checking `dist/index.html`, `dist/today/home.mjs`, `dist/today/home.css`, `dist/today/home-fallback.js`, `dist/legacy/index.html` and `dist/source.json`. Run `just ci` for the build and reader controls.

A separate local Chromium smoke followed the root entry, opened all six tabs, checked `source.json` and the legacy route (HTTP 200), and reported zero page errors and zero live reader requests. The public source disables live readers and contains no deployment receipts. No browser recording is published with this source packet; the screenshot and harness remain private execution evidence. Trusted production HTTPS and cutover are separate: the local environment did not trust the served certificate chain, and no TLS bypass or serving change was made.
