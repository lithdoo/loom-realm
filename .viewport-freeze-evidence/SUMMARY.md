# Viewport Core qualification evidence — branch `glm/resize-viewport`

- BASE_SHA: `72de3efbb6ffffafdecefd6224273edb12ee02ed` (dev/resize-viewport HEAD at task start; working tree clean)
- Docs Freeze subject (G1/G2/G3): `5d74590fcde6d79d815f774cc1c6cffe33fd2952`
- G2 D2 alignment commit: `dd3856908ab129a6a4f6e0791434ddd05ab10375`
- IMPLEMENTATION_SHA (all qualification logs below ran on exactly this commit): `ba1135d130d29a9b1bb3b3d7daceaad3ad0ac02c`
- Environment: Windows (win32), Node v22.12.0, npm 10.9.2, Python 3.13.0

## Freeze gates

| Gate | Result | Evidence |
|---|---|---|
| G1 link check on exact subject | PASS, exit 0 — "Documentation links OK: 523 relative link(s) across 102 Markdown file(s)." | Run in a clean worktree checked out at `5d74590`; log: `g1-docs-check-links.log`, subject: `g1-subject-sha.txt` |
| G2 independent technical review | Formal contracts: no semantic defect (checklist (a)–(e), (g) PASS). Verdict REQUEST CHANGES on two process defects: D1 ledger candidate pin (already fixed at BASE by the metadata-only re-pin `72de3ef`), D2 architecture doc three-child current assertion (fixed by `dd38569`, narrow caveat+ledger-pointer alignment, no contract drift). Delta re-verification by a second independent agent: APPROVE. | `g2-primary-review.md` (reviewer session `ses_f4cd29ebfffe78EO4fjbYgqACQ`, delta reviewer `ses_f4cbc8abfffecRw3TAazW4uspn`) |
| G3 owner freeze approval of exact SHA | Verified traceable record: owner account `lithdoo` commit `28fec87ac286b76df575985e78b09337dd6d5d94` on pushed `origin/cursor/resize-viewport` records approval of exact SHA `5d74590…` (2026-09-18, quote 「批准，继续完成所有任务」). Docs body byte-identical between subject and this branch's pin (diff touches only the ledger). | `g3-approval-verification.md` |

## Qualification commands (all on IMPLEMENTATION_SHA `ba1135d`)

| Command | Exit | Log |
|---|---|---|
| `npm run docs:check-links` | 0 | `logs/docs-check-links.log` (528 links / 102 files) |
| `npm run test:data` | 0 | `logs/test-data.log` — 35 pass / 0 fail (incl. viewport P3-02..07, V-04..07) |
| `npm test -w @loomrealm/subsystem` | 0 | `logs/pkg-subsystem.log` — 63 pass / 0 fail (incl. V-09..13) |
| `npm test -w @loomrealm/renderer` | 0 | `logs/pkg-renderer.log` — 56 pass / 0 fail (incl. V-01..03, V-08) |
| `npm run test:m10:qualification` | 0 | `logs/test-m10-qualification.log` — 16 pass / 0 fail |
| `npm run test:m11:qualification` | 0 | `logs/test-m11-qualification.log` — 10 pass / 0 fail |
| `npm run test:m13:qualification` | 0 | `logs/test-m13-qualification.log` — 5 pass / 0 fail |
| `npm run build:desktop-stack` | 0 | `logs/build-desktop-stack.log` |
| `npm run test:regression` | 0 | `logs/test-regression.log` — 14 workspaces, all `# fail 0` |
| `npm run test:viewport` (new explicit entry) | 0 | `logs/test-viewport.log` — 15 tests / 15 pass / 0 fail |

`logs/EXIT-CODES.txt` holds the consolidated exit-code record.

## Real vertical (P3-09 / V-14)

`test/viewport-state-v1/qualification.test.mjs` — fake viewport source → real
`createRendererControlHolder` → real `RendererDataPeer` → real memory
`MessageCarrier` pair → real `SubsystemDataPeer` → real `runSubsystem` host →
`scope.viewport` inside a real definition. Covered and passing: synchronous
first sample with floor normalization and exact wire bytes; change/equal/
invalid samples; backpressured 10,000-sample burst with concurrent real Input
(frame + listener + interest + input.state) and Render traffic; same-generation
reconnect (wire baseline resent, no duplicate business callback); generation
replacement (fresh peers, fresh cursors); Control participant replacement
(source restart, no sample inheritance, old callback inert, one stable Runtime
Viewport object); Runtime terminal (inert subscribe, zero late delivery).

`test/renderer-data-profile-v1/qualification-revision3.test.mjs` — P3-01..P3-07
and P3-09 cross-check with real peers; P3-08 discharged by the unchanged
revision2/Connection/Input/Render suites above on the same SHA.

## Explicitly NOT done / out of scope

- No physical window sampling: Desktop/PWA real `RendererViewportSource`,
  `play.bat` dynamic map resize coverage, and walking performance remain
  separate product acceptance work.
- No changes to game-libs/map, apps/desktop, PWA adapter, examples, play.bat,
  Main, PlatformPorts, Foundation, Wire, RuntimeControl, RendererControl, M13
  Store/Projector, or the Input/Render wire schemas.
- The implementation on `origin/cursor/resize-viewport` (another agent's work)
  was neither merged nor reused; only its G3 approval record was cited as the
  Git-traceable owner approval fact.
