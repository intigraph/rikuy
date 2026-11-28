# Today: work held by stopped agents

Synthetic `just demo` screenshots at 1440x900 and 412x915. Both runs use the same
synthetic crew: 98 owners with stopped, ceiling or expired evidence. Eleven are
long-lived workers and 87 are finished one-shot jobs (`eph-merge-*`, `eph-review-*`,
`eph-task-*`). Nine owners hold 13 board items. Every name and item is made up.

The "before" panel is this branch's demo page rendered with the earlier renderer,
which was moved into `home-view.mjs` unchanged before the fix.

| | Before | After |
|---|---|---|
| `/today/demo-held/` page height, 1440 | 13334 px (crop: `before-held-1440-top.png`) | 900 px (`after-held-1440.png`) |
| `/today/demo-held/` page height, 412 | 14040 px (crop: `before-held-412-top.png`) | 915 px (`after-held-412.png`) |
| Held section top on `/today/`, 1440 (fold at 900) | 655 px, above the fold | 1542 px, below the fold |
| Held section top on `/today/`, 412 (fold at 915) | 928 px | 2013 px |

After the fix:

- Only the nine owners holding work get a card.
- Because more than five owners hold work, the cards sit inside a collapsed `Show 9 owners holding 13 items` group.
- The other 89 owners become one line: `89 other owners show no owned work in the verified board read (86 ephemeral job identities).`
