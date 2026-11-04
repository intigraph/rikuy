# Curator publication custody demo

Trigger: a first publication changes a synthetic fixture, but its reply is
lost. Watch UNKNOWN become CONFIRMED after a new job instance reads the same
durable custody. The send count stays one; a changed payload in that revision
refuses. The adapters in this recording are synthetic, with no native server,
credential or production request. The separate native qualifier exercises the
generated HTTP update and real native commit/recovery.

Base `b290c515bfb3cda35eba38af3533c6c9200a0003` has the request fact builder but
no publication job. The demo checks that exact tree with a positive module
control. Demonstrated source is
`5727afd66297160c64006558fe82433247c2bac9`; subsequent recording/result files
do not change its implementation. This demonstrates the new library, rather
than an installed effect or a before/after server benchmark.

Reproduce from a checkout containing that base object:

```sh
node scripts/demo-deck-curator.mjs
```

The small raw [output recording](curator-demo.output) also serves as the readable
transcript. Download it together with its [timing file](curator-demo.timing).
Playback was verified with the installed util-linux `scriptreplay`; the
recording retains real output and timing. This command deliberately slows its
brief output for reading:

```sh
scriptreplay --log-out curator-demo.output --log-timing curator-demo.timing --divisor 0.05
```

This is a terminal recording, with no inline video-player claim. Both small
files are retained in this repository's existing Deck evidence directory.
Neither the recording nor the synthetic native controls establish production
least-privilege credential enforcement, graph policy, served read cost or
human acceptance.
