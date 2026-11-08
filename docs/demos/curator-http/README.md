# Explicit curator HTTP adapter demonstration

This is a synthetic library recording, not an installed service or production
access proof. Base `2a13d7ffddfb3fdb7e8851613b13edd97f4fda3e` has the durable
curator job but no HTTP adapter module; candidate `3204b6d42891d69bb4abf50be72d4d5a87d7c426` adds it.
Demonstrated adapter SHA-256: `2a44713f7e1794313477a82bbd01bfc4056de3f15b7a8065ff657af7827dd745`.

A synthetic transport commits once then loses its response. Watch UNKNOWN
become CONFIRMED through read-only recovery by a new job, with writes staying
at one. Changing store identity refuses; restoring it passes a positive control.
The mocked HTTP transport opens no socket and uses no real credential. These
client checks do not replace server writer policy or production admission.

Repeat from the repository root:

```sh
node docs/demos/curator-http/demo.mjs
```

Download [the terminal recording](demo.cast) for an asciinema-compatible player;
no inline playback is claimed. [The real transcript](transcript.txt) is the text
fallback. The cast preserves the actual output bytes and recorded timing from
util-linux script, with round-trip verification. The small recording is retained
in this existing demo directory with the source.
