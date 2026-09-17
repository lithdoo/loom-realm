# Map Viewport — Product Closeout Reopened / Qualification Pending

> 状态：**Product Closeout Reopened / Qualification Pending**；2026-09-17 remediation。PWA / M16 / M17 = OUT OF SCOPE (not PASS, not FAIL).
> 前一版 2026-09-17 “Product Closed”结论对本 SHA **不再无条件成立**。PR1/PR2/PR3 历史 PASS 数字保留为当时 subject 的 evidence，不得改写成从未发生，也不得直接转给本轮 remediation executable。

This is **not** a redesign. Closeout is reopened until the mechanical contract gaps below are remediating **and** the final executable subject is requalified.

## Why closeout is reopened

- detached complete candidate stage + one synchronous atomic pair commit (no live Shadow DOM canvas mutation during prepare)
- bounded ImageBitmap ownership / stale decode eviction (`bitmap.close()`)
- exact Browser closed-schema validation (ResourceRef / TileVisual / chunks / camera)
- pair single-endpoint fencing (View-only / Sprite-only must stay OLD/EMPTY)
- refresh overlap-copy alignment with the frozen Map contract
- requalification on the remediation SHA (hosted CI and secondary hardware remain NOT RUN until actually executed)

Historical delivery that started from `origin/main` `4cbf620` through Core Viewport C1, Map Docs Freeze, PR1 640, PR2 dynamic 720/1080 Chromium, and PR3 same-tree M11/M13/M14/M15/Hostra P95 remains the provenance chain. Remediation evidence: [MAP_VIEWPORT_REMEDIATION_EVIDENCE.md](./MAP_VIEWPORT_REMEDIATION_EVIDENCE.md).

## Subject chain

| Stage | SHA / branch | Claim |
|---|---|---|
| Baseline | `4cbf620` origin/main | production start |
| Core C1 | `6147944` on `feat/core-viewport-v1` | Desktop Viewport State `/1` |
| Map Docs Freeze | `b75caf1` / `fc0f05c` | design/test contract only |
| PR1 | `164d88b` | fixed 640 chunk schema + 640 Hostra P95 |
| PR2 | `947e9b3` | dynamic viewport + Chromium 720/1080 |
| PR3 | `26fc25a` on `feat/map-viewport-pr2` | harness + official Hostra 640/720/1080 table |

Contract: [MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md). Evidence: [PR0](./MAP_VIEWPORT_PR0_EVIDENCE.md), [PR1](./MAP_VIEWPORT_PR1_EVIDENCE.md), [PR2](./MAP_VIEWPORT_PR2_EVIDENCE.md), [PR3](./MAP_VIEWPORT_PR3_EVIDENCE.md).

## Product gates (historical PR3 subject — not current closeout)

Official Hostra table from the prior Product Closed write-up (same Browser Window `performance.now()`, input-captured → first-motion-paint). **These numbers are historical evidence for `26fc25a` / then-current Cursor machine. They are not a requalification of the remediation SHA.**

| Viewport | Ordinary P95 | Refresh P95 | Camera-only ordinary | Status |
|---|---:|---:|---:|---|
| 640×480 | 15.0 ≤ 50 | 23.2 ≤ 50 | 300/300 zero extra draws | PASS |
| 1280×720 | 14.8 ≤ 50 | 28.3 ≤ 75 | 300/300 zero extra draws | PASS |
| 1920×1080 | 15.2 ≤ 50 | 30.7 ≤ 100 | 300/300 zero extra draws | PASS |

Dense Chromium 720/1080 host box, opaque pixels, backing ≤128MiB, camera-only +1: PR2 PASS. Byte guard max 61296 < 196608. Accepted canvas ≤128MiB / live+decode ≤256MiB: held from PR0 dense fixture.

Same-tree Node 24: `test:m11`, `test:m13`, M14 boundary/projection/vertical/pack/map/example, `test:m15:desktop`, Hostra product file (lifecycle + P95), `docs:check-links`. Node 20.19.5 portable: Viewport/Profile r3, M11 qualification, M15 desktop, data, subsystem, Map unit tests.

## Out of scope / not claimed

- PWA, M16, M17
- Hosted GitHub Actions umbrellas on this SHA
- Exact Essentials v21.1 zip `test:m14:essentials-local` (archive not in the worktree)
- Changing Frozen `/1`, Main size mirror, Input/Frame bypass, Environment framework, or Map-specific Core fast path
