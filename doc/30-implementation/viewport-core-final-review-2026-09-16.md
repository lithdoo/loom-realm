# Viewport / revised Renderer Data Profile v1 — Core 文档终审及整改验收

> **技术终审与 CR-01/02/04/05 文档整改复核完成；正式 Core Docs Freeze 已由独立审查在 subject `4cbf620ebe8aec0e7fb33743813c5d1f2885e6a9` 批准，见 [independent review](./viewport-core-docs-freeze-independent-review-2026-09-16.md)。本页仍不是 executable PASS。** 日期：2026-09-16。  
> 原始受审 SHA：`8cd6c78f593df61112883c277aec8280f5604c04`；本轮整改正文对照 SHA：`7db45f29e1bf30261468ef03ec7acd80ae3b8b8d`。终审报告及 ledger 等后续状态编辑本身不构成新实现/独立签署。  
> 审查者：ChatGPT（技术交叉核对，同一修复执行者，**不能冒充独立人工审查者、发布/部署负责人或他们的签字**）。唯一 live status：[Core qualification ledger](./viewport-profile-v1-qualification.md)；[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；[protected crosswalk](./viewport-scope-repair-2026-09-16.md)。  
> 项目负责人已确认无 npm 消费者；**不查询 npm、不以 npm 阻塞 Freeze**。其他旧二进制共存与外部身份承诺独立判断。

## 1. 范围和基线

审阅修正前后的 [Profile v1](../15-contracts/renderer-data-profile-v1.md)、[fixture revision3](../15-contracts/renderer-data-profile-conformance-v1.md)、[Viewport child](../15-contracts/viewport-state-v1.md)、[Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)、Frozen [Connection](../15-contracts/renderer-subsystem-data-connection-v1.md)、[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)、[governance](../00-overview/document-governance.md)、[index](../15-contracts/README.md)、[protocol-layer architecture](../10-architecture/renderer-subsystem-protocol-layers.md)、[Subsystem model](../10-architecture/subsystem-model.md)、[Renderer module](../20-modules/web-renderer/README.md)、[Data exact baseline](../../packages/data/DESIGN.md)和[Viewport-only Data API delta](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md)、[phase plan](./phase-1-delivery-plan.md)、历史 [Profile wrapper](../15-contracts/renderer-data-profile-v1-previewport-baseline.md)/[verbatim original](../15-contracts/renderer-data-profile-v1-previewport-verbatim-original.md)、[Conformance wrapper](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)/[verbatim original](../15-contracts/renderer-data-profile-conformance-v1-previewport-verbatim-original.md)、[section crosswalk](./viewport-scope-repair-2026-09-16.md)。

Git compare `a71be9c...7db45f2` 对源码中的受保护正文显示：协议分层净 +36/-20、Subsystem +27/-3、Renderer +10/-3、Data +14/-7；原治理、平台和其他未受影响正文恢复为历史 blob。原 Profile 528 行与 Conformance 206 行现由 exact same original blob SHA 在独立 verbatim 文件保留，原入口为警示 wrapper。对照是**受影响正文/文档规则核查**，非自动化全库 URL 校验、代码 PASS、发布渠道审计或独立人工签署。

## 2. 技术合同交叉复核

| 维度 | 修订后四-child `/1` 的唯一 Current 规则及原约束保全 |
|---|---|
| Composition/diagnostic | `Connection1 + Input1 + Render1 + Viewport1`；新增且仅新增 Renderer→Subsystem exact `{type:"viewport.state",width,height}` / `protocol:"viewport"`。`/2`不 implement/advertise/negotiate。 |
| Authority | Main唯一 `(S,G,P)`；Broker paired install/currentness；旧新 binary同 `/1`不能靠 tuple 检测，产品必须 coherent cohort。Viewport绝不 mint Frame/Input/Render authority。 |
| Shared Data | 一 JSON text application unit、actual bytes≤1MiB、depth≤64、Wire parser、single reader/serialized writer、per-child ordered handler、first-wins Data-local terminal、old queue不迁移。原 Input/Render/Control/Connection wire不变。 |
| Viewport state | 一个 stable CSS logical surface；fractional raw floor→positive safe integer wire；每 carrier≤1 admitted/in-flight+≤1 latest pending；fresh baseline/source fence；Runtime retained observation不等于paintable。 |
| Author | `current=null`初始、存活期 synchronous subscribe initial、getter先更新、throw/reject隔离、终止后所有交付 inert（包括终止后新 subscribe）。 |
| Business boundary | Product负责 Window/rollout，Map负责 camera/size policy/chunks/raster/P95；M13仍只由 current Control topology 和 successful Store commit 触发 reevaluation。Core Docs Freeze 不依赖 Map PR0。 |
| 原基线完整性 | [Profile §1–14 / conformance §1–11 crosswalk](./viewport-scope-repair-2026-09-16.md)保留未显式覆盖的不变量与全部原 fixture；旧 executable PASS 不继承 revision3。 |

没有在上述受审设计文本中发现需要重做 Core 选型的反证。**不以此宣称全量链接检查、正式 independent signoff 或实现资格通过。**

## 3. CR 逐项关闭证据

| ID | 修复动作及证据 | 结果 |
|---|---|---|
| CR-01 Current architecture 冲突 | [`ce57cf1`](https://github.com/lithdoo/loom-realm/commit/ce57cf1d95bf0713a4f9675a53676a899c18c8cf)：原 §1/§4/§10/§14 仅投影四-child候选、fresh viewport baseline、status 与 authority；其他 Input/Render/Control/Connection 章节保留。 | **TEXT FIX VERIFIED**，不等于 Freeze。 |
| CR-02 已恢复模块入口遗漏 | [`feb1054`](https://github.com/lithdoo/loom-realm/commit/feb10549acb384a33a2fedd2ab24361d4ab07bda) 在 Subsystem 加 Runtime readonly API/retention；[`ccb5304`](https://github.com/lithdoo/loom-realm/commit/ccb53047a0cb29b1ee8ac52ca5ea2d19e511ab19) 在 Renderer 添加 typed sender/source、强调无 M13 新 trigger；[`2556dfc`](https://github.com/lithdoo/loom-realm/commit/2556dfc8d4b1db645970f113e8927dd84d30e66f) 的 Data 原 700+行 API 只改头部/closure并链接 additive delta，完整 old API仍在。 | **TEXT FIX VERIFIED**；历史 M8/M13 PASS 不转移。 |
| CR-03 非 npm 的实际兼容/部署准入 | [ledger §2/§4](./viewport-profile-v1-qualification.md)仍未有 owner 结论；2026-09-16 查 GitHub Releases API 得 `[]`，仅证明该渠道未发布，不证明其他渠道或无 mixed-deployment 需求。npm consumer 项已经 owner-confirmed non-blocking。 | **OWNER FACTS / SIGNOFF OPEN — Freeze blocking**。 |
| CR-04 terminal 后 subscribe | [`b896173`](https://github.com/lithdoo/loom-realm/commit/b896173949819ea9da612b8ba31ec6bf12b3a7ad) 规定 Runtime terminal/abort 后新 subscribe 不首发、返回 inert 幂等 unsubscribe；[`a8ff94e`](https://github.com/lithdoo/loom-realm/commit/a8ff94e1d62e10dbdff58848f39f094b76947b5b) 加 matching fixture。 | **TEXT + CONFORMANCE FIX VERIFIED**；尚未执行。 |
| CR-05 历史 Frozen 误用 | [`047e4ba`](https://github.com/lithdoo/loom-realm/commit/047e4ba5934c6ad45a154dbc19a51a4a8c9c507d) 基于原 blob SHA复制完整原 Profile/fixture；[`eb2e488`](https://github.com/lithdoo/loom-realm/commit/eb2e488a4c31346e3897e4b1191a84c3076fb5cf)、[`66b2009`](https://github.com/lithdoo/loom-realm/commit/66b20091859946c8a47feb6cd58a27cf161154d0) 将旧入口改为 NOT CURRENT wrapper；旧 Frozen 原文逐字保留且交叉链接到唯一四-child目标。 | **NAVIGATION FIX VERIFIED**。 |

## 4. Formal Freeze disposition

- 技术整改 CR-01/02/04/05 已在 `7db45f29...` subject 对照完成；任何后续 normative schema/currentness/diagnostic 修改须重新核对其新 SHA。
- 唯一仍需外部事实的 CR-03：仅**非 npm** 旧 `/1` 对外协议身份承诺、已知独立对接者/持久化身份、是否需要旧新二进制混用或 rolling/rollback；发布/部署负责人给出具体结论/日期。Releases `[]`只是该渠道事实。不要把 npm 作为隐含调查复活。
- 独立 reviewer须针对**最终 docs-only SHA**记录姓名/日期/复核范围及签署；本修复作者不能冒充独立 reviewer。该流程属于正式冻结本身，技术报告仅提供证据。
- 本技术终审和上述关闭项均**不要求**尚未实现的 C1 executable PASS、Map PR0/性能。实现后 new executable SHA 才运行 fixture3、Viewport、Input/Render/Connection 回归和产品 cohort proof。

**当前处理：技术文本整改完成；正式 Docs Freeze 由独立审查在 `4cbf620` 批准。** Implemented/Qualified 仍须 C1 新 executable SHA。不能把 Frozen 写成已实现或把未运行测试写成 PASS。
