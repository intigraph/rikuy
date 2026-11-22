# Admission preparation demonstration

[Terminal recording](output.typescript) and [timing](timing.txt) show the source
validator accepting a complete UNKNOWN inventory, retaining runtime authority
as false, rejecting a guessed pin and rejecting a GO mode. Download both and
replay with `scriptreplay --log-out output.typescript --log-timing timing.txt`,
or read the recording as a transcript. No inline video playback is claimed.

Repeat with `node docs/probes/ask-admission/demo.mjs`. Base
`6c4765c2e8063f7a7ac64e97b553e48df30df413` has no preparation validator;
there is no equivalent old call. This PR's source head supplies the new
format/validator/reproducer. The target is a source fixture, not deployment.

The [offline native results](../../deck/admission/native-results.json) separately
record actual signatures, native forgery/replay/stale-target refusal and bounded
reader controls against a pinned Quipu build. Keys stayed in memory; all stores
were disposable local fixtures. The [preparation guide](../../deck/admission/README.md)
explains limits and the explicit artifact-pin path. The small recording and
results are retained in source for review. No production access is inferred.
