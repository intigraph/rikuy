# Changelog

## [0.5.0](https://github.com/intigraph/rikuy/compare/rikuy-v0.4.0...rikuy-v0.5.0) (2026-11-28)


### Features

* **console:** console look on the demo with contrast and motion checks (aegis-xwm C) ([#42](https://github.com/intigraph/rikuy/issues/42)) ([e22d188](https://github.com/intigraph/rikuy/commit/e22d188cbf963038de706596cd45ef60a4492c39))
* **today:** console look on the served Today page (stage 1 part D) ([#45](https://github.com/intigraph/rikuy/issues/45)) ([8eeb825](https://github.com/intigraph/rikuy/commit/8eeb825185565b00e7e44b5da7b97f9214acf346))
* **today:** decision buttons on every Needs-you card, signed or disabled ([#41](https://github.com/intigraph/rikuy/issues/41)) ([713f795](https://github.com/intigraph/rikuy/commit/713f795d4a8ed7f0d7298a15ccebed930b2a306f))


### Bug Fixes

* **demo:** serve the brief with its sample rows at the demo root ([bd16498](https://github.com/intigraph/rikuy/commit/bd16498703a766b00197735925c4070a0068153f))
* **share:** surface the failing tool's stderr when a publish command fails ([80024e4](https://github.com/intigraph/rikuy/commit/80024e443907eea74eee6096d2f99c37d5f4c57d))
* **share:** surface the failing tool's stderr when a publish command fails ([e2b693d](https://github.com/intigraph/rikuy/commit/e2b693dae25342369d147b95c71c131dd63bc871))
* **today:** collapse the held-work wall to owners that hold work ([#49](https://github.com/intigraph/rikuy/issues/49)) ([8a7e834](https://github.com/intigraph/rikuy/commit/8a7e8342a95275d840a0104886162c9082971513))
* **today:** font-robust phone layout keeps all tabs, the P0 count and three asks on the first screen ([#55](https://github.com/intigraph/rikuy/issues/55)) ([c1eda5c](https://github.com/intigraph/rikuy/commit/c1eda5cd06e76fbe20aa0d8039644c5b1526951c))
* **today:** Needs-you cards show priority, age and owner inline and state the order ([#47](https://github.com/intigraph/rikuy/issues/47)) ([f8537ee](https://github.com/intigraph/rikuy/commit/f8537eec691a15c0ad493388737ffa782b47fd52))
* **today:** pin the Asks panel to daily_brief_asks_v5 ([7f629a6](https://github.com/intigraph/rikuy/commit/7f629a6c0780c20204ca026dd7b0c05f14b112c1))
* **today:** pin the Asks panel to daily_brief_asks_v5 ([cb5da83](https://github.com/intigraph/rikuy/commit/cb5da83595ceae930441532af2936ef9af2b4e90))
* **today:** Priority work and Deployments counts match the rows shown ([#48](https://github.com/intigraph/rikuy/issues/48)) ([e11eb03](https://github.com/intigraph/rikuy/commit/e11eb0319eba4891e266450bab3ff9e13c9678c3))
* **today:** read Ask options through daily_brief_ask_item_v2 (status OPTIONAL+BOUND) ([#44](https://github.com/intigraph/rikuy/issues/44)) ([79f7627](https://github.com/intigraph/rikuy/commit/79f7627fdef26cbd95e33754204f732f0313f3ed))
* **today:** read held-work titles, only for rows on screen (supersedes [#52](https://github.com/intigraph/rikuy/issues/52)) ([#54](https://github.com/intigraph/rikuy/issues/54)) ([3d744bf](https://github.com/intigraph/rikuy/commit/3d744bfa7dc2cb356fb701a055ae67adc5f2504c))
* **today:** slim Asks to daily_brief_asks_v6 and titles to v2 (aegis-edu.3) ([#40](https://github.com/intigraph/rikuy/issues/40)) ([b5da144](https://github.com/intigraph/rikuy/commit/b5da144a023905c0f0efb4da0ace53c8965043e7))
* **today:** spaced-only title choices, no auto re-read of failed cards, adapter docs (aegis-d3rd) ([#43](https://github.com/intigraph/rikuy/issues/43)) ([57fc601](https://github.com/intigraph/rikuy/commit/57fc601b93fe4051759f8e42ec40c7aa6a2c36fa))

## [0.4.0](https://github.com/intigraph/rikuy/compare/rikuy-v0.3.0...rikuy-v0.4.0) (2026-11-23)


### Features

* bind Ask decisions to atomic Seeds settlement ([#30](https://github.com/intigraph/rikuy/issues/30)) ([6c4765c](https://github.com/intigraph/rikuy/commit/6c4765c2e8063f7a7ac64e97b553e48df30df413))
* **brief:** consolidate Today source with a retained legacy route ([#27](https://github.com/intigraph/rikuy/issues/27)) ([3ee94bc](https://github.com/intigraph/rikuy/commit/3ee94bc2409eab4c9cdbe435768c9381721819b6))
* **brief:** show admitted observed PR flow summary ([#25](https://github.com/intigraph/rikuy/issues/25)) ([6773a2a](https://github.com/intigraph/rikuy/commit/6773a2a5164bdb3ca0ffecb11184d84a31761f7f))
* **economics:** show measured ephemeral job counts and budget endings ([#28](https://github.com/intigraph/rikuy/issues/28)) ([8b93084](https://github.com/intigraph/rikuy/commit/8b9308468085adffd0c7b4d55a80f271cf4b91ba))
* prepare Ask admission with explicit pins and offline controls ([#31](https://github.com/intigraph/rikuy/issues/31)) ([e0e3668](https://github.com/intigraph/rikuy/commit/e0e36684c9822d6572767f3876f082c595849b02))
* surface typed overseer Asks in Today ([#29](https://github.com/intigraph/rikuy/issues/29)) ([e0f6f17](https://github.com/intigraph/rikuy/commit/e0f6f173685c4abc5f9a6a745d05a5a8e54122e5))
* verify native Ask receipts through a read-only process ([#34](https://github.com/intigraph/rikuy/issues/34)) ([37f723d](https://github.com/intigraph/rikuy/commit/37f723df93513bddf400f41005e0f77487b00deb))


### Bug Fixes

* **deck:** bound item joins and preserve full status identity ([#33](https://github.com/intigraph/rikuy/issues/33)) ([1ad4a39](https://github.com/intigraph/rikuy/commit/1ad4a395e8a7085549b52295b9d9d2f6f38ece1d))
* keep browser dependency provisioning out of test runs ([#35](https://github.com/intigraph/rikuy/issues/35)) ([349f10d](https://github.com/intigraph/rikuy/commit/349f10d145825295d63be9940645347adb73c42e))

## [0.3.0](https://github.com/intigraph/rikuy/compare/rikuy-v0.2.2...rikuy-v0.3.0) (2026-11-08)


### Features

* **deck:** add explicitly configured curator HTTP adapters ([#23](https://github.com/intigraph/rikuy/issues/23)) ([8c92f8d](https://github.com/intigraph/rikuy/commit/8c92f8d311ec955208de489a7fcd2daa92bbb6de))

## [0.2.2](https://github.com/intigraph/rikuy/compare/rikuy-v0.2.1...rikuy-v0.2.2) (2026-11-05)


### Bug Fixes

* **pendant:** preserve public policy and stable entity names ([#22](https://github.com/intigraph/rikuy/issues/22)) ([bdd1a49](https://github.com/intigraph/rikuy/commit/bdd1a49d7ea8cadd1dfc6fa3bbad0b3bb594bf4f))
* **share:** pin a private embedding provider for repository builds ([#20](https://github.com/intigraph/rikuy/issues/20)) ([047dc9c](https://github.com/intigraph/rikuy/commit/047dc9ca7c55a4a0b3f983d0e8d78c30e3bea81f))

## [0.2.1](https://github.com/intigraph/rikuy/compare/rikuy-v0.2.0...rikuy-v0.2.1) (2026-11-05)


### Bug Fixes

* accept Rikuy component tags in pendant publication ([#17](https://github.com/intigraph/rikuy/issues/17)) ([489cefb](https://github.com/intigraph/rikuy/commit/489cefb34841efaeb870e1cac67e9dcf11646dc1))

## [0.2.0](https://github.com/intigraph/rikuy/compare/rikuy-v0.1.0...rikuy-v0.2.0) (2026-11-04)


### Features

* add repository-owned pointer pendant source ([#3](https://github.com/intigraph/rikuy/issues/3)) ([67b6c95](https://github.com/intigraph/rikuy/commit/67b6c95837d60f88aa5217c16b7ebdc6f4c1de07))

## 0.1.0

- Static Brief client, bounded transports, snapshot explorer and disabled experimental readers.
