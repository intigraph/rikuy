# Held-work titles: before and after (`just demo`, /today/demo-held/)

Synthetic data only: 98 invented owners, 9 holding 13 invented items. Both runs
open the collapsed holder group and dump the DOM.

| | placeholder strings in DOM | title reads while collapsed | title reads after opening |
|---|---|---|---|
| before (held-work collapse only) | 26 (13 rows × text + aria-label) | n/a | n/a |
| after | 0 | 0 | 13 |

After: 12 rows show their real title. The one item with no `schema:name` shows
`title unavailable: the source record has no title`. Past the per-page cap of 40
reads, a row shows `title not loaded (open to load)`.

- `before-held-open-1440.png`, `before-held-open-412.png`
- `after-held-open-1440.png`, `after-held-open-412.png`
