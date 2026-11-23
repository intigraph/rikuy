# Browser checks do not provision the host

The same missing-browser input against base
`1ad4a395e8a7085549b52295b9d9d2f6f38ece1d` and the candidate shell script:
base invokes `playwright install --with-deps`; candidate refuses before browser
checks, with no installer invocation. Package commands are inert private
fixtures; this demonstration does not change system packages or prove a sandbox
for arbitrary descendant processes.

[Terminal recording](output.log), [timing](timing.log), and
[readable transcript](transcript.txt) are retained with this small source probe.
Playback was checked with util-linux `scriptreplay`:

```sh
scriptreplay --log-out docs/probes/browser-check-no-install/output.log \
  --log-timing docs/probes/browser-check-no-install/timing.log
```

Reproduce after installing the pinned Node dependencies:

```sh
python3 docs/probes/browser-check-no-install/demo.py
python3 scripts/test-browser-check.py
```

Four process controls cover missing, explicit, cached and non-executable browser
paths. Full CI passed with an explicitly selected existing browser: 251 tests,
build, README and browser controls; the HOME guard reported 166 watched paths
and five UID resources untouched. Hosted CI provisions Chromium explicitly on
its disposable runner before the test entrypoint. No installed-service claim.
