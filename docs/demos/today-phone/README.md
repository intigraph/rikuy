# Today on a 412x915 phone

Captured from `just demo` (`/today/`, live readers off) in Chrome mobile
emulation at 412x915, device scale 2, reduced motion. Four synthetic Asks and
three synthetic P0 rows are rendered in the page through `home-view.mjs`, the
same way `scripts/test-today-look-browser.mjs` does; no request leaves the page.

| Measure at 412x915 | Before | After |
| --- | --- | --- |
| Tabs clipped | Log, Explore (behind a hidden horizontal scroll) | none: six tabs in a 3x2 grid |
| Page status line | 7 lines (2 with live readers) | 1 line, full text on focus or tap |
| Asks with choices on the first screen | 1 | 3 |
| P0 count on the first screen | no (at y=1766) | yes: `3 P0` badge on the Next tab |
| `document.scrollWidth` | 412 | 412 |

![Before](before-412x915.png) ![After](after-412x915.png)

Desktop layout is unchanged: the compact rules apply at 600 px and below.
`askDecisionsEnabled` stays false; every choice still renders disabled with its reason.
