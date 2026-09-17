# Map Viewport — Closeout Remediation Evidence

> 状态：**Qualification Pending**；2026-09-17。本文记录 cursor/main 上针对独立评审缺口的整改，不是新功能设计。PWA / M16 / M17 / npm consumer verification = OUT OF SCOPE。
> Hosted GitHub Actions：**NOT RUN**（不得写 PASS）。Secondary hardware：**NOT RUN** unless an actual second machine executes the harness.

## 1. Subject

```text
Branch: cursor/main
Remediation start HEAD: 0d694bc6c99289914ab6ef30e9f2e2e8fdfae0fe
Merge-base with local main: 75f5370 (origin/main 4cbf620)
Final executable SHA: (filled after qualification commits)
```

## 2. Gaps being closed

| Gap | Production change | Tests |
|---|---|---|
| Fresh Renderer must not wire-republish previous Renderer observation | existing `RendererViewportPublisher.clear()` retained; silent-B regression added | `@loomrealm/renderer` viewport tests |
| Viewport sender terminal / duplicate `{kind:"sent"}` | live-only duplicate suppression; `noteTerminal` / `peekTerminal` | `@loomrealm/data` viewport tests |
| Sample defense | `normalizeViewportSample` explicit finite/floor/safe-integer | renderer + subsystem unit tests |
| Detached candidate + atomic pair commit | prepare on detached canvases; hide/remove old then install candidate in one sync task | `test/map-layering-browser.test.mjs` |
| Bounded ImageBitmap ownership | owner sets `accepted` / `c:<seq>`; stale `bitmap.close()` | scene A→B→C + stale candidate tests |
| Exact Browser closed schema | `assertMapViewData` / `assertMapSpriteData` fail closed | negative schema test |
| Single-endpoint pair fence | sprite child present ⇒ wait for matching tokens | View-only / Sprite-only / one-newer-endpoint |
| Overlap refresh reuse | same-scene/same-tileset `drawImage` overlap; skip unchanged regular tiles; autotile dirty local redraw | implemented in `map.browser.js` (not a contract amendment) |
| Runtime resize vs movement | `commitViewportResize` still after successful `domain.update`; finishStep does not clear `activeMove` until resize/standing commit succeeds | map runtime tests |

## 3. Memory budget (do not relitigate numbers this round)

Implemented against the **revised** rule already written on this branch:

```text
accepted / visible canvases ≤ 128 MiB
accepted + detached candidate canvases + current scene decoded ImageBitmap ≤ 256 MiB
```

Cursor PR0 dense 720/1080 STOP against a single 128MiB cap (2× detached counted as visible) remains historical evidence. Independent GLM `178.13MiB > 128MiB` is **independent implementation/review branch evidence** on a different machine and then-current interpretation; it is not Cursor-host data and is not a test error.

## 4. Historical performance (not this SHA)

PR1/PR2/PR3 PASS tables stay in their ledgers. They do not close this remediation until the same gates are rerun on the final subject.

## 6. PR0 residual probe (this machine, this session)

`node --test test/map-viewport-pr0.test.mjs` — **8 pass / 1 fail** (re-run isolated and full file).

Failing test: `RenderDomain.update full-state validation and snapshot residual`.

This is the Core `RenderManager.update` Node microbenchmark (merged node validation + snapshot probe), **not** Map Browser paint and **not** Hostra ordinary P95. Frozen Render / M13 were **not** changed to pass it.

Isolated rerun (Node v24.19.0, AMD Ryzen AI 9 365):

| Viewport | Refresh gate | Full p95 | Camera-only p95 | vs gate |
|---|---:|---:|---:|---|
| 640×480 | 50 | 29.7 | 13.9 | PASS / PASS |
| 1280×720 | 75 | 56.0 | 35.4 | PASS / PASS |
| 1920×1080 | 100 | 86.8 | **53.2 > 50 ordinary** | PASS / **FAIL** |

Schema/bytes/memory/Chromium 640/720/1080 raster tests in the same file **PASS**. Byte guard max 61296. Accepted 1080 118.7MiB / live+decode 237.5MiB.

**STOP class (diagnostic, not a Map Browser defect):** Frozen Render `RenderDomain.update` camera-only path at dense 1920×1080 exceeded the 50ms ordinary diagnostic gate on this run. Historical PR0 ledger on the same class of machine recorded 24.3ms. No Map contract amendment. No Frozen Render change. Product Closeout remains Pending. Suggested design question: whether Core update residual at 1080 camera-only is an independent Frozen bottleneck or a noisy Node hrtime probe; do not lower dense fixture or skip validation.
