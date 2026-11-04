# Repository witness refresh

Source-only recording: compare registry `2b12b6f0e1205ad5c2bd642d19ab24e48b66d738` with candidate registry SHA256 `ec1f487dbb8cef77e457d7578d697e9988eca0e1547aa6ece3a048f9e8f25548` against current main content `d0fe0bd6bbe9982e6fdce8290f575a23db361737`. The control counts byte-witness mismatches and Markdown fragments whose headings are absent. No index, graph, receiver or deployment is activated.

[Transcript](transcript.txt) and [timing](timing.txt) are small retained source artifacts. Replay from the repository root:

```sh
scriptreplay --log-out docs/demos/pendant-witness-refresh/transcript.txt --log-timing docs/demos/pendant-witness-refresh/timing.txt
```

Repeat the measurement (a full Git checkout with the base commit is required):

```sh
python3 - <<'PY'
import json,hashlib,re,subprocess
from pathlib import Path
base='2b12b6f0e1205ad5c2bd642d19ab24e48b66d738'
old=json.loads(subprocess.check_output(['git','show',base+':docs/knowledge/repository-knowledge.json']))
new=json.loads(Path('docs/knowledge/repository-knowledge.json').read_text())
for label,data in [('BEFORE registry at '+base,old),('AFTER candidate registry',new)]:
 stale=missing=fragments=0
 for r in data['records']:
  raw=Path(r['source']).read_bytes()
  stale+=hashlib.sha256(raw).hexdigest()!=r['source_sha256']
  if '#' in r['subject'] and r['source'].endswith('.md'):
   fragments+=1
   anchors={re.sub(r'[^\w\- ]','',h.lower()).replace(' ','-') for h in re.findall(r'^#{1,6} (.+)$',raw.decode(),re.M)}
   missing+=r['subject'].split('#',1)[1] not in anchors
 print(label)
 print('records:',len(data['records']),'stale hashes:',stale,'fragment records:',fragments,'missing anchors:',missing)
PY
```

The before registry is evaluated against the current source tree, reproducing the witness drift. The candidate must show zero stale hashes and zero missing anchors. Heading existence and hashes do not replace native index identity, full-corpus search or public asset acceptance.
