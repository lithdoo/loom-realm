# Viewport / revised Data Profile v1 — 最终冻结整改与语义保全

> 状态：**Review remediation applied in part / Core Docs Freeze HOLD / Map Docs Freeze HOLD**；2026-09-16。本文记录整改delta，不是第二份 wire SSOT、Map实施主合同或测试PASS。唯一Core live status：[Profile v1 qualification ledger](./viewport-profile-v1-qualification.md)；决策：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)。

## 1. Core 冻结前项（不与 Map 混淆）

| Issue | 已修改内容与证据 | 仍须证据 |
|---|---|---|
| F-01 同 identity `/1` 外部兼容 | [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)定义cohort/STOP；ledger §2列Releases、npm alpha、私有分发、外部consumer、persisted identity、rolling/rollback | **OPEN**：发布负责人实际核查、owner/date/raw evidence/结论；产品未发布不等于无外部义务 |
| F-02 Frozen Connection三child旧投影 | [纯编辑差异 `9fb2c72`](https://github.com/lithdoo/loom-realm/commit/9fb2c72a6dff03001ab13978ab38dea0a4454e02)：§1图添Viewport、§9 candidate泛child、§22 baseline委托Profile `/1`§8；zero-message/S/G/P/current-retired/terminal原文保全 | 最终cross-reviewer/date未签署 |
| F-03 旧 Phase plan | [`3fb882e`](https://github.com/lithdoo/loom-realm/commit/3fb882e6b94360a41ef27a7a6fde76ca82396f6a)加入Core C0/C1、Map PR0–PR3；见本文件§2的最新Map PR0细分 | Phase plan中的早期“PR0 latency P95通过才Freeze”口径必须以新版Map合同同步修订/再次复核 |
| F-04 大规模精简 | [Data API restored `5b1eb1d`](https://github.com/lithdoo/loom-realm/commit/5b1eb1d47612ec1f0c9efc7eea63ee9eb388917c)、[Subsystem protected projection `488fa34`](https://github.com/lithdoo/loom-realm/commit/488fa34ca71509c0db69b0daba70f3b99492c75b)，M13 original/current参照Frozen正式API | 其他受影响governance/platform/overview/index/module全文保全终审、reviewer/date仍OPEN |

**Core freeze** = external compatibility signed + full contract/conformance/cross-doc/protected-semantic audit + docs-only SHA signed；不要求先有新executable PASS、不借Map PR0/性能证明替代。旧三child executable、Superseded `/2`、历史M11/M14/M15 PASS不得冒充新四child `/1`资格。若F-01发现跨版本义务立即STOP direct-v1 reset、新ADR，不能私加协商/feature flag。

## 2. Map 回合：设计冲突修正（不宣称通过）

唯一主合同现为[机械实施候选](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)，[Map-private motion](../../examples/essentials-v21.1-local/MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)只是其§8子规范。上一轮状态“主草案尚需吸收motionId”**已过时：已经吸收**，但两份依然是Not Frozen/Not Implemented。

| Issue | 设计修正 | 留存 gate |
|---|---|---|
| M-01 visualEpoch不随普通movement变 | Map `motionId`配对、Scene/Visual/Motion双WC exact tokens、parent单stage commit、最早数据receipt time同clock/解码不延长250ms、standing/camera静止例外、mid-resize旧可见pose与remainingMs、retry 100/200/400 | PR0 private-only CSS stacking feasibility、PR1/PR2真实像素/latency/late-async验证 |
| M-02 历史性能FAIL | PR0仅冻结前可行性：固定dense synthetic+本地Map002/066 true records的1080 data bytes、Core full-state/M13 equality residual、现有Browser baseline、128/256MiB、private CSS stacking | **PR0 NOT RUN**；优化后P95、camera-only zero draw和真实1080产品PASS归PR1/PR2/PR3，不作PR0冻结前循环前置 |
| M-03 PR0→PR1性能顺序循环 | 区分`PR0 feasibility → Map Docs Freeze → PR1 fixed640 → PR2 dynamic → PR3 executable/product qualification` | Map Docs Freeze必须有PR0 evidence和owner/reviewer/date/SHA，不能拿设计文本自签 |
| M-04 logical step保留/合并冲突 | 遵Frozen walking §3允许Data backpressure跳过未emitted中间transition；统计`suppressed-before-paint`，硬验收zero mixed/stale+latest convergence，不新增replay/ACK | 新Browser trace必须同时报superseded counters与正确性，不伪称每步完整显示 |
| M-05 不完整 schema/DOM/rebase | Map主合同§4 exact View/Sprite shape及used TileVisual表、§6 Shadow-only slotted stacking、§8最早receipt计时+initial missing stage/失败、§10固定PR0 fixtures和同Browser时钟 | PR0 real Chromium proof、真实FSDB/CPU/bytes/内存证据；不符合设计STOP |

**Map Docs Freeze所需**不是“PR1已经满足终局P95”，而是：最终无冲突合同与全部类型/算法/文件范围/可运行fixture定义、PR0 exact source和原型反证、可行性与Core/M13 residual解决方案、owner/date/docs SHA。**Map Product Closed**仍需PR1/PR2/PR3全部功能/像素/性能/受影响里程碑在新executable/cohort SHA真正PASS。

## 3. 受保护语义审核范围

| 原约束 | Current owner / 保全检查 |
|---|---|
| Data identity、Role peer exact API、terminal/unions | [`packages/data/DESIGN.md`](../../packages/data/DESIGN.md)、[Profile v1](../15-contracts/renderer-data-profile-v1.md)；仅新增Viewport，不改FrozenInput/Render grammar |
| Frozen Connection authority/current/paired install/cutover | [Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md)；仅投影性修改见F-02 |
| Subsystem Frame gate/Input/Render/Content | [Subsystem model](../10-architecture/subsystem-model.md)，ordinary mutation与RenderDomain独立生命周期、≤256 Domains/one-shot keys保留 |
| M13 callback/equality/DOM | [Web Presentation API](../15-contracts/web-presentation-api-v1.md)和[renderer module](../20-modules/web-renderer/README.md)；只有Control/Store触发reevaluation，View/Sprite callback未必同时，host attrs只读 |
| Map movement/transfer/autotile/layering | Frozen walking/transfer与当前Map源；新主合同不得要求所有coalesced steps逐帧重放，也不能让decode增加250ms，map-private shadow z-index须通过pixel oracle |
| Remaining docs | 对 `508d08ab...3fd84d7`受影响 governance/platform/overview/index/module按diff形成“旧normative义务→现行SSOT/恢复”逐项证据，**尚未完成，不以本表冒充签署** |

## 4. 正确交付依赖与签署状态

```text
Core C0  external compat+cross-review → Core Docs Freeze
Core C1  coordinated corrected /1 executable+conformance/regression
Map PR0 production-zero feasibility+真实source/CPU/M13/stacking/bytes/memory
→ Map Docs Freeze (不等PR1/2 P95)
PR1 fixed640 chunk/raster/stage → PR2 dynamic viewport+motion → PR3 product gates
→ new executable SHA/各资格ledger签署 → Closed

Compatibility owner/evidence/conclusion: NOT VERIFIED
Core final protected-diff/cross-review/docs SHA: PENDING
Map PR0 synthetic+local+Hostra evidence: NOT RUN
Map reviewer/date/docs SHA: PENDING
Core/Map executable/target performance: NOT RUN
```

当前文档治理纠错是**设计任务已提交**，不是有效外部兼容调查、PR0真实数据、Core/Map Freeze批准或代码已完成。若某Current实施计划仍要求PR0在PR1前通过优化后真实1080 latency，即为过时冲突，必须同步清理，不能交低判断力Agent猜优先级。
