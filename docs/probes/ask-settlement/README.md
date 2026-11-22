# Signed Ask settlement source demonstration

[Watch the candidate browser recording](after.webm) or view the
[after screenshot](after.png). The recording is a synthetic Deck source page,
with injected admitted-answer, durable-writer and native-settlement fixtures.
It clicks Yes, observes the linked ruling/Ask-closed confirmation and performs
a read-only Check linked ruling. It does not show a human ceremony, a real
WebAuthn signature, production transport or an installed service.

Base `e0f6f173685c4abc5f9a6a745d05a5a8e54122e5` rejects the same request's
new settlement binding; [the actual base/candidate probe output](before.txt)
records that difference. Base has no equivalent native settlement call. This
PR's source head includes the matching fixture and browser reproducer:

```sh
npm ci --ignore-scripts
node scripts/test-deck-settlement-browser.mjs
```

Set `RIKUY_BROWSER_EXECUTABLE` to an existing Chromium executable if needed.
The test intercepts every request and aborts unhandled routes. It covers the
accepted choice, a lost native response recovered without another send, absent
native admission before signing, a matching Today card and a mismatched card
that refuses before controls. The matching Today case uses the same source
hook as Today rendering; the recording shows the smaller Deck surface.

The tiny video and screenshot are retained in source for review. Playback was
checked through the produced browser frames; no automatic GitHub embed is
claimed. Public configuration keeps this capability disabled. Deployment must
supply exact graph/store/generation admission, scoped writers, custody, device
pins, human ceremony and read-cost receipts before runtime acceptance.
