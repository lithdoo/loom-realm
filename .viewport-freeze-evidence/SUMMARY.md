# Viewport Core implementation + qualification evidence

Date: 2026-09-18
Branch: cursor/resize-viewport
BASE_SHA: 72de3efbb6ffffafdecefd6224273edb12ee02ed
DOCS_FREEZE_SHA: 5d74590fcde6d79d815f774cc1c6cffe33fd2952

## Freeze gates
- G1 docs:check-links PASS exit 0 → g1-docs-check-links.log
- G2 Independent Agent 8bd3570b-ed89-4059-9b84-7aa576d03a3b APPROVE → g2-independent-review.md
- G3 Owner approval 2026-09-18: 「批准，继续完成所有任务」 for exact SHA 5d74590…

## Commands (logs under logs/)
| Command | Exit |
|---|---|
| npm run docs:check-links | 0 |
| npm run test:data | 0 |
| npm test -w @loomrealm/subsystem | 0 |
| npm test -w @loomrealm/renderer | 0 |
| npm run test:viewport | 0 |
| npm run test:m10:qualification | 0 |
| npm run test:m11:qualification | 0 |
| npm run test:m13:qualification | 0 |
| npm run build:desktop-stack | 0 |
| npm run test:regression | 0 |

## Explicit new runners
- npm run test:viewport
- node --test test/viewport-core-vertical.test.mjs
- test/viewport-state-v1/qualification.test.mjs
- test/renderer-data-profile-v1/revision3.test.mjs

## Out of scope / NOT RUN as product
- Map / Desktop real window source / play.bat dynamic resize / walking performance
