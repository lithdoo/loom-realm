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

IMPLEMENTATION_SHA (code): d42bc6e7755330e74263d1ec55a14998e3718d43
LEDGER_SHA (docs-only follow-up): 28fec87ac286b76df575985e78b09337dd6d5d94
Branch tip: 28fec87ac286b76df575985e78b09337dd6d5d94
Pushed: origin/cursor/resize-viewport
Architecture Qualified: YES (on d42bc6e code + listed regressions)
Desktop/Map product: OUT OF SCOPE / NOT RUN
