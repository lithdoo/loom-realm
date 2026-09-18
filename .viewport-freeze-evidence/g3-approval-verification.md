# G3 Owner Docs Freeze approval — verification record

- Approved exact docs subject SHA: `5d74590fcde6d79d815f774cc1c6cffe33fd2952`
- Verification performed: 2026-09-18, on branch `glm/resize-viewport` (BASE
  `72de3efbb6ffffafdecefd6224273edb12ee02ed`).

## Traceable approval record (pre-existing, owner-authored, pushed)

`origin/cursor/resize-viewport` contains ledger commit `28fec87ac286b76df575985e78b09337dd6d5d94`
(author: lithdoo <130959182+lithdoo@users.noreply.github.com>, date 2026-09-18, pushed to
origin), whose ledger text records:

```
| G3 Owner Docs Freeze | APPROVED / 2026-09-18 | 项目负责人在实施会话中明确批准 exact SHA
5d74590fcde6d79d815f774cc1c6cffe33fd2952（原文「批准，继续完成所有任务」）；本账本登记可追溯。 |

Owner formal freeze approval / exact SHA / date: APPROVED / 5d74590… / 2026-09-18
Approved Docs Freeze subject: 5d74590fcde6d79d815f774cc1c6cffe33fd2952
```

Commands to reproduce:
```
git fetch origin
git show origin/cursor/resize-viewport:doc/30-implementation/viewport-core-freeze-ledger.md
git log --format="%H %an %ad %s" -4 origin/cursor/resize-viewport
```

## Consistency of the approved SHA with this branch's reviewed subject

- `git diff --stat 5d74590 72de3ef` → only the freeze ledger (metadata re-pin); all
  formal contract bodies byte-identical.
- The BASE ledger pins candidate `5d74590...`; the primary G2 review reviewed exactly
  that tree and found no semantic defect in the formal contracts.
- Therefore the owner-approved SHA == the reviewed SHA == the pinned candidate.

Note: the approval record lives on `origin/cursor/resize-viewport` (another agent's
branch). This branch does not merge or reuse that implementation; the record is cited
solely as the Git-traceable owner approval fact required by Gate G3.
