# Viewport / revised Data Profile v1 — 最终冻结整改与语义保全

> 状态：**Review remediation applied in part / npm consumer gate owner-confirmed NON-BLOCKING / Core Docs Freeze HOLD / Map Docs Freeze HOLD**；2026-09-16。本文记录整改delta，不是第二份 wire SSOT、Map实施主合同或测试PASS。唯一Core live status：[Profile v1 qualification ledger](./viewport-profile-v1-qualification.md)；决策：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)。

## 1. Core 冻结前项（不与 Map 混淆）

| Issue | 已修改内容与证据 | 仍须证据 |
|---|---|---|
| F-01 同 identity `/1` 兼容 | [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)定义cohort/STOP；**2026-09-16 项目负责人明确确认没有 npm 消费者，禁止额外 npm 验证，npm consumer 项已解除冻结阻塞**；ledger §2记录owner attestation | **仅非 npm 独立义务仍 OPEN**：已知其他协议承诺/独立对接、persisted identity、运行中旧 peer或rolling/mixed cohort；由相应负责人记录结论。不得换名重新引入 npm 验证 |
| F-02 Frozen Connection三child旧投影 | [纯编辑差异 `9fb2c72`](https://github.com/lithdoo/loom-realm/commit/9fb2c72a6dff03001ab13978ab38dea0a4454e02)：§1图添Viewport、§9 candidate泛child、§22 baseline委托Profile `/1`§8；zero-message/S/G/P/current-retired/terminal原文保全 | 最终cross-reviewer/date未签署 |
| F-03 旧 Phase plan | [`3fb882e`](https://github.com/lithdoo/loom-realm/commit/3fb882e6b94360a41ef27a7a6fde76ca82396f6a)加入Core C0/C1、Map PR0–PR3；后续[`eb518d6`](https://github.com/lithdoo/loom-realm/commit/eb518d60542040ee6dfd42ce540098f37b7ed225)保留原milestone细节并修复PR0/后置性能顺序 | 当前路线已纠正，最终cross-review仍待签署 |
| F-04 大规模精简 | [范围修复](./viewport-scope-repair-2026-09-16.md)恢复受影响治理/架构/模块/Data原文，归档旧Profile/Conformance全文并作逐节crosswalk；Map原设计全文也归档 | 当前四child canonical规范、旧原文继承、index/link的独立reviewer/date仍OPEN；恢复不等于签署 |

**Core freeze** = §2限定的非 npm compatibility决策 + full contract/conformance/cross-doc/protected-semantic audit + docs-only SHA signed；**不含 npm consumer 再验证**，不要求先有新executable PASS、不借Map PR0/性能证明替代。旧三child executable、Superseded `/2`、历史M11/M14/M15 PASS不得冒充新四child `/1`资格。若其他已知事实发现跨版本义务立即STOP direct-v1 reset、新ADR，不能私加协商/feature flag。

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
| Data identity、Role peer exact API、terminal/unions | [`packages/data/DESIGN.md`](../../packages/data/DESIGN.md)、[Data增量](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md)、[Profile v1](../15-contracts/renderer-data-profile-v1.md)；仅新增Viewport，不改FrozenInput/Render grammar |
| Frozen Connection authority/current/paired install/cutover | [Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md)；仅投影性修改见F-02 |
| Subsystem Frame gate/Input/Render/Content | [Subsystem model](../10-architecture/subsystem-model.md)，ordinary mutation与RenderDomain独立生命周期、≤256 Domains/one-shot keys保留 |
| M13 callback/equality/DOM | [Web Presentation API](../15-contracts/web-presentation-api-v1.md)和[renderer module](../20-modules/web-renderer/README.md)；只有Control/Store触发reevaluation，View/Sprite callback未必同时，host attrs只读 |
| Map movement/transfer/autotile/layering | Frozen walking/transfer与当前Map源；新主合同不得要求所有coalesced steps逐帧重放，也不能让decode增加250ms，map-private shadow z-index须通过pixel oracle |
| Remaining docs | [scope repair crosswalk](./viewport-scope-repair-2026-09-16.md)追踪原文恢复及当前候选继承；**独立交叉审核签署仍未完成**，不以本表冒充签署 |

## 4. 正确交付依赖与签署状态

```text
Core C0  non-npm compatibility + cross-review → Core Docs Freeze
Core C1  coordinated corrected /1 executable+conformance/regression
Map PR0 production-zero feasibility+真实source/CPU/M13/stacking/bytes/memory
→ Map Docs Freeze (不等PR1/2 P95)
PR1 fixed640 chunk/raster/stage → PR2 dynamic viewport+motion → PR3 product gates
→ new executable SHA/各资格ledger签署 → Closed

npm consumer attestation: PROJECT OWNER / NO CONSUMERS / NON-BLOCKING / NO npm verification
Other compatibility owner/evidence/conclusion: NOT VERIFIED
Core final protected-diff/cross-review/docs SHA: PENDING
Map PR0 synthetic+local+Hostra evidence: NOT RUN
Map reviewer/date/docs SHA: PENDING
Core/Map executable/target performance: NOT RUN
```

当前文档治理纠错是**设计任务已提交**，不是其余非 npm 兼容结论、PR0真实数据、Core/Map Freeze批准或代码已完成。若某Current实施计划仍要求PR0在PR1前通过优化后真实1080 latency，即为过时冲突，必须同步清理，不能交低判断力Agent猜优先级。
