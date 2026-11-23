# Bounded item reader qualification

[Terminal recording](output.log), [timing](timing). Replay with
`scriptreplay -t timing output.log` from this directory. Reproduce with the
explicit native qualification command in [the contract](../../deck/contract.md#qualification-and-remaining-acceptance).

The new `bounded-item-query-v2` case uses actual stored-query execution. It shows
one full status IRI, preserves an extra malformed status as an invalid value,
and returns the three-row overflow sentinel for excess revisions. The reader
refuses ambiguity and overflow. The other 23 native signing, binding, forgery,
replay and reader controls remain passing. These are disposable stores and
in-memory software keys, with no production requests or enrollment.

Base e0e36684 has the v1 two-pattern item join. The candidate bounds each
subject/predicate subquery before the join and projects the status string without
namespace compaction. Live operator cost qualification measured the previous
stored definition timing out twice at three seconds, versus v2 positive reads
at about 14 and 21 ms against the stated one-second budget. Those private
deployment measurements are separate from this public fixture recording;
this recording does not claim to reproduce production scale or timing.

Native source97d1a973; complete Cargo inventory and explicit serde variant were
verified before compiling the fixture. The recording pins the actual library,
helper source and executable. Source delivery changes neither production
reader selection nor runtime authorization. An operator must separately admit
the new exact definition and hash. Keep the earlier registry name distinct.
