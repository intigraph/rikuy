# The repository pendant

**Status: published.** Release v0.4.0 carries the pendant, its checksum and
its provenance as release assets.

**In short.** Each release publishes a small Quipu share that describes this
repository: pointers to its code and documents, plus reviewed summaries. Load
it into a Quipu store to ask questions about Rikuy. This page explains what is
in it and how it is kept honest.

To use a published pendant, follow the
[verified import workflow](https://intigraph.github.io/quipu/sharing/index.html).

## What is in it

- **Pointers** to code and documents. The source text and line ranges are not
  exported.
- **Reviewed summaries** of ideas, interfaces, decisions, freshness and
  starting points. They are listed in `repository-knowledge.json`.
- **Stored queries and validating shapes**, which travel with the share.

Each summary is tied to the tracked file that defines it by that file's
SHA-256 hash. If the file changes, the build refuses until someone reviews the
summary and updates the hash. The native index must also resolve every curated
pointer before the build can proceed.

## Keeping the summaries current

When you change a file that `repository-knowledge.json` lists as a source:

1. Re-read the summary and correct it if the file now says something else.
2. Update `source_sha256` for every record that names that file.
3. Update `reviewed_at`.
4. If you renamed a heading that a record's `subject` points at, update the
   subject's fragment.
5. Run `python3 scripts/test-repository-knowledge.py`.

## Alignments: an empty carrier, on purpose

`alignments.ttl` is a valid SSSOM/RDF file with no mappings in it. Its status
file, `alignment-status.json`, records zero approved mappings and seals those
bytes.

- This is not evidence that no mappings exist anywhere.
- A missing, changed or malformed file is refused. The explicit empty file is
  accepted.
- Dependencies and glossary references are not identity alignments.
- Deduplicating code or commits, and unrelated `exactMatch` records, are not
  approval of a cross-repository mapping.

### Adding a mapping later

Candidate mappings go through Quipu's existing `align propose` and
`align decide` curation path.

- Keep their source graphs and source witnesses.
- Do not fill in an approval author from a lexical similarity score.
- Only the reviewed mapping record may produce a derived identity, through the
  engine's existing apply path.

The current source profile deliberately imports no non-empty mapping data
until a real curated artifact and its transport have been reviewed.

## How it is published

- The copied release workflow verifies the three public assets only after the
  ordinary release has finished.
- The managed trusted host runs this repository's own publisher. It keeps its
  publication policy private, pins both native engine executables and the
  indexer, and refuses when an earlier upload's outcome is uncertain.
- The publisher requires the engine's model, digest and dimension manifest.
  Loading and vector rebuilding belong to the native engine.
- No hosted job gets the private publication policy or a new credential route.

By default the configuration publishes only the existing Quipu corpus.
Enabling another repository requires that host's actual configuration and a
clean release containing this job. Committing this source publishes nothing.

These source controls do not by themselves establish that an asset is public,
that it loads, or that a service accepted it. Check the release page for that.
