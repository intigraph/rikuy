# Native origin qualification

[Terminal recording](output.log) and [timing](timing) show the actual pinned
native server on a disposable loopback store. Replay with
`scriptreplay -t timing output.log` in this directory. Reproduce with the
command in [admission preparation](../../deck/admission/README.md#native-loopback-origin-controls).

Watch trusted preflights succeed while foreign and `null` origins lack browser
CORS admission on the reader and challenge routes. The health positive control
returns HTTP 200 for both origins, exposing the response only to trusted browser
code. This is CORS behavior, not a network ACL or a native signature proof.
No credential, enrollment, grant, publication or production request occurs.
The fixture bearer exists only in a private temporary configuration that is
removed when the bounded listener exits.

Base e0e36684 has no native HTTP origin qualification command; this candidate
adds an explicit source/digest-pinned control rather than changing production
behavior. Native build: Quipu97d1a973, clean, server SHA256
e915437962231bca15c237ab40e16da8cbd3f29bd83f1a21ac4b1c432e59e02c.
The origin in this public recording is a synthetic example. Production TLS,
allowlist application and device trust remain separate acceptance evidence.
