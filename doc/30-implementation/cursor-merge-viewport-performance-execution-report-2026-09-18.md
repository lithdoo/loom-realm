# Viewport + Map 性能集成：执行报告

> 状态：**IMPLEMENTED on `cursor-merge/main` / PARTIALLY QUALIFIED / NOT Product Closed / NOT merged to `main`**。  
> 日期：2026-09-18。仓库：`lithdoo/loom-realm`。  
> 权威：冻结契约优先；范围以 [`cursor-merge-viewport-performance-execution-plan.md`](./cursor-merge-viewport-performance-execution-plan.md) 为准。本文件是 Q 收口记录，不把执行计划改写成 PASS。

## 1. Identity

```text
Branch:              cursor-merge/main
Plan commit:         1f1023a692468360bca23a3efd6fd1b608fb2f98
Pre-integration HEAD: 1f1023a (plan already on branch; cursor/main baseline 89fd6f0)
Final executable:    69f017c56d7873722f1c65c33eaff5a99d385fff
Node:                v24.19.0
OS:                  win32 10.0.26200
CPU:                 AMD Ryzen AI 9 365 w/ Radeon 880M
Hostra:              .qualification/hostra @ d863beab (1.0.1-beta.1)
Clock (P95):         same Browser Window performance.now();
                     input-captured.at → browser-first-motion-paint.at
P95 size method:     CDP Emulation.setDeviceMetricsOverride (official harness)
```

Agent 未 merge `main`、未 force-push、未宣布 Product Closed。

## 2. Patch chain

| Stage | SHA | Why |
|---|---|---|
| Plan | `1f1023a` | 授权在 `cursor-merge/main` 上按阶段提交；不等于合入 `main` |
| C1 | `6059482` | 未知 `viewport.*` type → `profile`；已识别非法 `viewport.state` → `viewport` |
| C2 | `6106dac` | GLM STOP-A：已验证 JSON 用 `depthOfValidatedJson` + `JSON.stringify` 探深度/字节 |
| M1a | `70625e0` | A→B→A 取消过期 pending；commit 成功后才推进 `acceptedViewport`；transfer 用 pending/clamp |
| M1b | `5ea3759` | overlap-copy / autotile 按整格 `(depth,x,y)` z-stack 重合成 |
| M2 | `abc390c` | 静止 animated autotile 用 slot timer；运动仍 rAF；camera-only 0 extra draws |
| Q fixture | `69f017c` | M14 delayed-decode fixture 改为 exact +1 chunk window（未放宽 Browser schema） |

回滚：`git revert` 上述 SHA（从新到旧）即可退回 `1f1023a`。未改 Main 尺寸镜像、第二套 Viewport 协议、Map 专用 Core 快路径、通用场景框架、ACK 队列，也未合并 `glm/main`。

## 3. Per-phase files

| SHA | Files |
|---|---|
| `6059482` | `packages/data/src/profile-codec.ts`；viewport unit + qualification；Desktop viewport-source tests |
| `6106dac` | `packages/subsystem/src/internal/render-manager.ts`；`packages/subsystem/test/render-probe-equivalence.test.mjs` |
| `70625e0` | `game-libs/map/src/runtime.ts`；`game-libs/map/test/runtime.test.mjs` |
| `5ea3759` | `game-libs/map/browser/map.browser.js`；`test/map-layering-browser.test.mjs` |
| `abc390c` | `game-libs/map/browser/map.browser.js`；`test/map-layering-browser.test.mjs` |
| `69f017c` | `test/m14-vertical.test.mjs` |

## 4. Qualification matrix on `69f017c`

命令前缀（Hostra 相关）：`$env:HOSTRA_SOURCE_DIR = (Resolve-Path '.qualification/hostra').Path`

| Gate | Command / evidence | Result |
|---|---|---|
| Viewport / Profile | `npm run test:viewport:qualification` | PASS 11/11（本 SHA 先前批次） |
| Data | `npm test -w @loomrealm/data`（及 `test:data` 依赖包） | PASS |
| Subsystem | `npm test -w @loomrealm/subsystem` | PASS 68/68 |
| Renderer | `npm test -w @loomrealm/renderer` | PASS 53/53 |
| M11 qualification | `npm run test:m11:qualification:run` | PASS 10/10 |
| M13 Chromium qualification | `npm run test:m13:qualification:run` | PASS 5/5 |
| m11/m13/m14 boundary | `node --test test/m11-boundary.test.mjs test/m13-boundary.test.mjs test/m14-boundary.test.mjs` | PASS 9/9 |
| M14 projection | `npm run test:m14:projection` | PASS 7/7 |
| Essentials example | `npm test -w @loomrealm-example/essentials-v21.1` | PASS 3/3 |
| Map unit | `npm test -w @loomrealm-game/map` | PASS 70/70 |
| Layering | `node --test test/map-layering-browser.test.mjs` | PASS 49/49 |
| M14 vertical | `npm run test:m14:vertical` | PASS 3/3（fixture `69f017c`） |
| M15 desktop | `npm run test:m15:desktop` | PASS 15/15 |
| PR0 bytes / canvas | `node --test test/map-viewport-pr0.test.mjs` | **PASS 9/9** this run |
| Hostra product (non-P95) | `test/m15-hostra-product.test.mjs` name pattern excluding 640/720/1080 | **PASS 9/9** this run |
| Official Hostra P95 | name-pattern `640/720/1080` | **PASS 1/1 this run**, 2078527 ms |
| Full `npm run test:m13` / `test:m14` umbrellas | includes `test:m12` / `test:regression` | **PASS this run**, `test:m14` exit 0 in 86627 ms |
| `npm run test:m15` as one process | would re-run 34 min P95 | **NOT RUN as a single command**; constituents `test:m14` + `test:m15:desktop` + Hostra product tests **PASS** |
| `play.bat` native window drag | 真实鼠标拖动、恢复、&lt;320×240、奇数尺寸、行走中缩放 | **NOT RUN** |
| Official Essentials zip | `npm run test:m14:essentials-local` | **NOT RUN**（工作树无官方 zip） |
| Real-building pixel parity | 官方 FSDB 建筑 / 多 z / 真 autotile vs 合成 512×8 | **NOT RUN** / 待人工验收 |
| resize-end-to-paint | 最后一次合法 raw resize → 成对首次正确呈现 | **NOT RUN**（官方 harness 只用 CDP 设尺寸后测走路） |
| Hosted CI | GitHub Actions `test:m15` | **NOT RUN** |
| Second hardware | i5-11500 等 | **NOT RUN** |
| PWA / M16 / M17 | — | **OUT OF SCOPE** |

## 5. Official Hostra P95 (`69f017c` + `d863beab`)

Raw JSON: [`artifacts/map-viewport-pr3-hostra.json`](../../artifacts/map-viewport-pr3-hostra.json)。Harness 在未设 `GITHUB_SHA` 时把 `subject` 写成 `local-worktree`；本报告把该文件绑定到 executable `69f017c`。不得把 `59fba24` / `66d4ea3` 的历史数字改写成本 SHA。

循环产品图 Map 900001（512×8 纯地面）。每尺寸 3 轮 × 100 ordinary + 30 refresh。

| Viewport | Ordinary P50 | Ordinary P95 | Gate | Refresh P50 | Refresh P95 | Gate | Camera-only / zero extra tile draws |
|---|---:|---:|---|---:|---:|---|---|
| 640×480 | 12.5 | **14.8** | ≤50 | 24.4 | **30.4** | ≤50 | 300/300 |
| 1280×720 | 12.4 | **15.1** | ≤50 | 30.2 | **35.6** | ≤75 | 300/300 |
| 1920×1080 | 11.7 | **14.2** | ≤50 | 24.2 | **26.9** | ≤100 | 300/300 |

n ordinary=300，n refresh=90。收集期 invalid（未进入 P95 集合）：640=1，720=1，1080=2。

## 6. Bytes / memory / Core probe (this SHA)

PR0 dense fixture：

- MapView UTF-8 max **61296 &lt; 196608**
- accepted canvas max **124502016 B (118.7 MiB) ≤ 128 MiB**
- accepted + detached + decode peak **249167872 B (237.5 MiB) ≤ 256 MiB**
- Chromium 720/1080 host box + opaque pixel + camera-only +1 draw：**PASS**
- `RenderDomain.update` 1080 camera-only p95 **8.97 ms ≤ 50 ms**；full update p95 **17.72 ms**（未构成独立 Core STOP）

C2 `C2_PROBE_BENCH` dense 1080（80 chunks, encoded **142518** bytes, depth 7）：

| Probe | P50 | P95 | Max |
|---|---:|---:|---:|
| Legacy `jsonDepth` + `stringifyJson` | 27.69 ms | 31.48 ms | 46.96 ms |
| Optimized `depthOfValidatedJson` + `JSON.stringify` | **8.89 ms** | 10.68 ms | 14.88 ms |
| Motion-only `RenderDomain.update` | 26.86 ms | 30.68 ms | 38.01 ms |

优化未改变接受集合、编码长度或错误分类；保留 C2。

## 7. Original symptoms vs this executable

| Symptom | Code on this SHA | Product evidence |
|---|---|---|
| 窗口缩放尺寸链 | Desktop CSS logical size → Renderer publish → Data latest-wins → `scope.viewport` → Map commit at safe boundary → RenderDomain → Browser 成对提交。M1a 取消 A→B→A pending | 单元 + Desktop composition **PASS**。原生 `play.bat` 拖动 **NOT RUN**，不能声称用户窗口已闭环 |
| 建筑/叠层消失 | M1b 整格 z-stack 重合成；layering 49/49 | 合成/DOM oracle **PASS**。真实 Essentials 建筑 FSDB **NOT RUN** |
| 走路卡顿 | C2 probe；M2 autotile slot timer；camera-only 0 extra draws | 官方 Hostra 合成循环图 ordinary/refresh P95 **PASS**。真实建筑图 + 原生拖动中走路 **NOT RUN** |

## 8. Remaining risk

1. 官方 P95 地图是 512×8 纯地面，不能覆盖建筑、多 z、真 autotile。
2. CDP 逻辑尺寸 ≠ 原生窗口拖动；resize-end-to-paint 无官方样本。
3. `browser-first-motion-paint` 是 JS 标记，不是 GPU compositor 呈现。
4. Hosted CI 与第二硬件未跑。
5. 失败 resize pending 不自动重试：符合“失败保持旧世界”；持久失败恢复仍无新合同。

## 9. STOP / GO

**GO for maintainer review of `cursor-merge/main` @ `69f017c`：** C1–M2 已按计划落地；本机 `test:m14` umbrella、`test:m15:desktop`、官方 Hostra 640/720/1080 ordinary/refresh P95、PR0 字节/画布、Hostra 产品非 P95 套件通过。

**NO-GO for merge to `main` and NO Product Closed：** 计划允许 GO 的条件要求同一 SHA 上官方 Hostra **和** 用户真实 Essentials 解决三个原始现象。原生窗口拖动、真实建筑像素、官方 zip、hosted CI、第二硬件、resize-end-to-paint 仍为 **NOT RUN**。Agent 不得合并。

建议维护者：人工 `play.bat` 拖动验收 + 真实 FSDB 建筑往返截图后，再决定是否开 PR 到 `main`。
