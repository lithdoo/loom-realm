# Viewport / revised Data Profile v1 — 冻结整改沿革及最新处置

> **历史整改记录，最新状态以[唯一 Core ledger](./viewport-profile-v1-qualification.md)及[独立 Freeze 签署](./viewport-core-docs-freeze-independent-review-2026-09-16.md)为准；Core Formal Docs Freeze APPROVED on `4cbf620` / Map Docs Freeze HOLD。** 日期：2026-09-16。  
> 本页不是第二份 wire SSOT、测试 PASS 或独立审查签署。项目负责人已确认无 npm 消费者；不验证 npm，也不以 npm consumer 兼容核查阻塞冻结。

## 1. Core 冻结前项（已整改文本与仍缺外部批准分开）

| Issue | 已提交的范围内修复 | 最新未完成证据 |
|---|---|---|
| F-01 `/1` compatibility | ADR0037 规定同 identity coherent rollout；项目负责人 2026-09-16 确认 npm 无消费者，该项 **CLOSED/NON-BLOCKING**；已查 GitHub Releases API 返回 `[]`，仅证明该渠道无 Release。 | **非 npm 无混配/统一 cohort：owner attestation 2026-09-16 CLOSED。** |
| F-02 Frozen Connection 三-child 投影 | [编辑性 diff `9fb2c72`](https://github.com/lithdoo/loom-realm/commit/9fb2c72a6dff03001ab13978ab38dea0a4454e02)只修正 §1/9/22 的组合和 baseline 委托；zero-message/S/G/P/current/retired/terminal 仍原样。 | **技术文本核对完成**；独立签署见 [independent review](./viewport-core-docs-freeze-independent-review-2026-09-16.md)。 |
| F-03 Phase plan / PR0 循环 | [`eb518d6`](https://github.com/lithdoo/loom-realm/commit/eb518d60542040ee6dfd42ce540098f37b7ed225) 保留原里程碑细节，并明确 PR0 只做可行性、PR1/2 后才性能验收。 | Core freeze 无 Map PR0/P95 gate。 |
| F-04 误压缩及交叉文件冲突 | [scope repair](./viewport-scope-repair-2026-09-16.md)先恢复原文，后按 [technical final review](./viewport-core-final-review-2026-09-16.md)的 CR-01/02/04/05 定点修正 protocol layers、Subsystem、Renderer、Data status/seam、terminal-after-subscribe 和旧 Frozen wrapper；原 Profile/fixture 以 exact blob 全文保留。 | 技术修复 **TEXT VERIFIED**；独立签署见 [independent review](./viewport-core-docs-freeze-independent-review-2026-09-16.md)。 |

Core Docs Freeze 只需要**真实非 npm 独立兼容条件及独立文档批准**，不需要先有 executable PASS、Map PR0 或 npm 查询。修订后唯一目标 `/1 = Connection1+Input1+Render1+Viewport1`；旧 executable 历史 PASS 不继承，`/2` Superseded。

## 2. Map 独立设计整改（仍不代表实现或 PR0）

唯一当前地图实施候选为[Map 机械合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)；[private motion](../../examples/essentials-v21.1-local/MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)只作为主合同子规范。

| Issue | 已定文本处理 | 留存验证 |
|---|---|---|
| M-01 `visualEpoch` 与 ordinary movement | `motionId` 双 WC 配对、parent single stage、最早 receipt time 同一 clock、decode 不增加 250ms，standing/camera still 例外、mid-resize old visible pose/remainder。 | PR0 stacking feasibility + PR1/2 pixel, latency, late-async。 |
| M-02 历史 P95 fail | PR0 只做 synthetic/local exact 1080 payload、Core validation、M13 structural equality、Browser raster/memory/stacking 可行性。 | **PR0 NOT RUN**；PR1/2/3 后的实际 P95/zero tile draw 另行验收。 |
| M-03 冻结前 PR0 与 PR1 循环 | 固定 `PR0 feasibility → Map Docs Freeze → PR1 fixed640 → PR2 dynamic → PR3 qualification`。 | Map owner/reviewer/docs SHA 和真实 PR0 证据仍 PENDING。 |
| M-04 未呈现 step 的保留矛盾 | Frozen walking 允许发送前 coalesce/suppress；禁止 mixed/stale，必须 eventual latest convergence，记录 suppressed counters，不造 replay/ACK。 | 真实 Browser trace 未执行。 |
| M-05 完整 schema/DOM/rebase | 主合同已描述 View/Sprite data、TileVisual、private stacking、time/rebase、fixtures。 | Chromium stacking/pixels、FSDB/CPU/bytes/memory 仍须实测，不能直接冻结。 |

**Map Docs Freeze 与 Core Docs Freeze 独立。** Map 后续是否能达成 1080p 和 P95 无法靠 Core 文档或原 baseline 推定。Map PR0 数据缺失时不能写 PASS。

## 3. 原有语义仍受保护

| Topic | 现行唯一 owner 与保护边界 |
|---|---|
| Data/typed peers/terminal | [Data M8 full design](../../packages/data/DESIGN.md)保留历史 exact API；[Viewport-only addendum](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md)唯一新增类型/handler/sender/family；[current Profile](../15-contracts/renderer-data-profile-v1.md)拥有四-child wire。 |
| Frozen Connection | [Connection](../15-contracts/renderer-subsystem-data-connection-v1.md)只有组合投影编辑，authority/paired install/cutover 不变。 |
| Subsystem | [Subsystem model](../10-architecture/subsystem-model.md)仅增加 readonly Runtime Viewport；Frame gate、Input/Render/Content、≤256 Domain/one-shot 保留。 |
| Web Renderer | [Renderer module](../20-modules/web-renderer/README.md)投影 typed sender与物理源；M13 [Web API](../15-contracts/web-presentation-api-v1.md)依然只有 Control/Store reevaluation、host attrs managed、callback semantics不变。 |
| Historical | [old Profile wrapper](../15-contracts/renderer-data-profile-v1-previewport-baseline.md)/[old fixture wrapper](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)显式非当前，链接未修改原始 blob 全文。 |
| Map | Frozen walking/transfer/autotile/layering 属 Map consumer；Core 不吸收 camera/settle/chunks/Canvas/menu。 |

## 4. 真实签署状态

```text
Core technical corrective review: COMPLETE / TEXT VERIFIED (see final review)
npm consumer: PROJECT OWNER / NO CONSUMERS / NON-BLOCKING / no npm verification
GitHub Releases: [] in that channel only
Non-npm compatibility / no-mixed rollout owner conclusion: APPROVED 2026-09-16 / owner attestation
Independent reviewer/date/final docs-only SHA: Cursor Grok 4.6 / 2026-09-16 / 4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9
Core Formal Docs Freeze: APPROVED for that subject; Not Implemented / Not Qualified
Map PR0 / Map Docs Freeze: NOT RUN / HOLD
Core/Map executable/performance tests: NOT RUN
```

C0 owner fact + independent approval → Core Docs Freeze subject `4cbf620`；C1 coherent four-child implementation+new SHA conformance；Map PR0 → Map Docs Freeze → PR1/2/3。本文只收口整改沿革。 Frozen ≠ Implemented ≠ Qualified。
