# Map projection correctness / performance evidence

This directory records the P1-A / P1-B validation for Map Presentation v1.1 incremental raster.

## Contents

- `pre-fix-regression-failures.txt` — failing delete / depth-migrate / counter tests on the old clear gate
- `COMPARISON.md` — before/after overlap copy cost comparison
- `before-fix-*.summary.json` / `after-fix-*.summary.json` — machine, browser, aggregates
- `map-layering-browser.test.log` — full browser layering suite (72 pass)
- `map-package-test.log` — `@loomrealm-game/map` package tests
- `test-rpgmap-v1.log` — `npm run test:rpgmap:v1` (blocked by missing `/hostra` baseline in this environment)
- `rpgmap-tail.log` — Map/RPGMap tests that follow the m15 stage
- `docs-check-links.log` — documentation link check

## Harness

```bash
node game-libs/map/scripts/copy-browser.mjs
node scripts/map-projection-benchmark.mjs --label after-fix --warmup 10 --samples 100
```
