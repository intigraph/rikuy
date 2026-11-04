# Build a brief from checked rows

This 22-second recording builds the real static client and validates public synthetic rows: two priorities and one decision. A foreign-curator control is rejected as Brief identity UNKNOWN. No live reader, signing or production data is enabled.

Use Node 22+ and Python 3.11+. The optional npm run demo serves validated synthetic rows locally. Open Next to view both priorities. The live reader remains disabled until deployment configuration is supplied.

From the repository root, prepare a new workspace:

```sh
git clone https://github.com/intigraph/rikuy.git /tmp/rikuy-demo
cd /tmp/rikuy-demo
# Check out the source revision whose recording you are reproducing.
touch .terminal-demo-sandbox
python3 docs/demos/terminal/render.py docs/demos/terminal/demo.tape.json \
  --workspace /tmp/rikuy-demo --tool node="$(command -v node)" \
  --output /tmp/rikuy-render
```

The manifest pins the executable and every source input. Deliberate reading holds differ from execution times. The unchanged canonical stack-terminal-24 recorder supplies a private HOME/XDG environment and refuses private paths, hosts and credentials. Read [the complete transcript](terminal/transcript.txt) for a static alternative. Recorder source: Tambo b0765b5d8f16a6a26acb3595552f17826d965b44, SHA-256 bebbe000565314f18a58731f2a1a4690577db127b3673fa10a45ce74eef0f23c.
