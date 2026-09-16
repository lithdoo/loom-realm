# Viewport / revised Renderer Data Profile v1 — Core 文档终审

> **技术终审已完成；Docs Freeze HOLD（未批准）**。日期：2026-09-16。  
> 受审原始基线：`8cd6c78f593df61112883c277aec8280f5604c04`；审查中直接修正的 Viewport contract/conformance commits：[`b896173`](https://github.com/lithdoo/loom-realm/commit/b896173949819ea9da612b8ba31ec6bf12b3a7ad)、[`a8ff94e`](https://github.com/lithdoo/loom-realm/commit/a8ff94e1d62e10dbdff58848f39f094b76947b5b)。  
> 审查者：ChatGPT，技术交叉审查；**不是**项目发布/部署负责人证明、独立人工签署或最终 Freeze SHA。  
> 唯一 live status：[revised-v1 qualification ledger](./viewport-profile-v1-qualification.md)；[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；[protected baseline/crosswalk](./viewport-scope-repair-2026-09-16.md)。本报告不发布第二套 PASS。  
> 项目负责人已确认没有 npm 消费者；**不查询 npm、不重开 npm consumer 核查、不以其阻塞 Freeze**。下述非 npm 同身份二进制共存等事项与 npm 无关。

## 1. 已实际审阅的范围及限定

核对 [Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Profile fixture revision3](../15-contracts/renderer-data-profile-conformance-v1.md)、[Viewport child](../15-contracts/viewport-state-v1.md)、[Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)、[Frozen Connection](../15-contracts/renderer-subsystem-data-connection-v1.md)、[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)、[governance](../00-overview/document-governance.md)、[contract index](../15-contracts/README.md)、[protocol-layer architecture](../10-architecture/renderer-subsystem-protocol-layers.md)、[Subsystem model](../10-architecture/subsystem-model.md)、[Web Renderer](../20-modules/web-renderer/README.md)、[Data design](../../packages/data/DESIGN.md)及[Viewport-only Data delta](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md)、[phase plan](./phase-1-delivery-plan.md)、[旧 Profile 完整原文](../15-contracts/renderer-data-profile-v1-previewport-baseline.md)、[旧 conformance 完整原文](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)与[逐节保全 crosswalk](./viewport-scope-repair-2026-09-16.md)。

Git compare `a71be9c...8cd6c78`显示该范围内剩余变更全为文档；旧治理、系统架构、模块和Data原文已经恢复，**恢复原文不等于传播了 Viewport**。已检查 Superseded `/2` 导航、Connection 本身 zero-message/authority 不应承载 child 规则、Map PR0 必须独立。未运行自动化全量链接检查、代码或 conformance、外部非 npm 渠道调查；本文不把这些写成 PASS。

## 2. 设计层交叉对照：未发现需要重新选型的 Core 缺陷

| 核查范围 | 当前正式候选与保全要求 |
|---|---|
| 唯一身份与方向 | `/1 = Connection1 + Input1 + Render1 + Viewport1`；唯一新增 Renderer→Subsystem `viewport.state`，exact own `{type,width,height}`。`/2` 历史、不发行、不实施、不双模。 |
| Authority | Main 独占 `(S,G,P)`；Platform Broker paired install；不将几何传给 Main，不借 geometry 授予 Frame/Input mutation。旧三个 child 与 Control/Connection wire 不变。 |
| Shared mechanics | 单 UTF-8 JSON text unit、actual 1MiB/depth64/Wire preflight、one reader/one serialized writer、正确 namespace/child diagnostic、first-wins Data-only terminal。 |
| Viewport publisher/currentness | 每 carrier 至多一份 admitted/in-flight + 一份 pending latest；fresh baseline 独立；retire/fresh G/source fence；Runtime-scoped retained size，不当作 paintability。 |
| Author API | `current`初值 null，subscribe 存活期同步首发，getter 先更新，业务 listener exception 隔离；Frame/InputTarget 不 gate observation。 |
| 职责和里程碑 | 单一 CSS logical surface 是 Core；`innerWidth/innerHeight`和同版部署是产品；camera/chunks/raster/P95、PR0属Map；Docs Freeze不要求尚未存在的可执行 PASS。 |
| 受保护原文 | 原 Profile §1–14、旧 Conformance §1–11 在 scope crosswalk 逐节指明继承与唯一覆盖；旧 Writer/Input/Render/Hostra-PWA/terminal/fixture revision2不可因新版文字短而省略。 |

**这些是对文本设计的复核，不是可执行资格或正式独立签署。**

## 3. 尚未关闭的冻结问题

### CR-01 · P1 · Current architecture 和正式 Profile 直接冲突

[协议分层架构 §1/§4](../10-architecture/renderer-subsystem-protocol-layers.md)仍标 `Profile v1 Frozen`、仅 Connection+Input+Render、`input/render only`，并宣称三者及 Profile 当前都 Frozen；正式[四 child Profile v1](../15-contracts/renderer-data-profile-v1.md)明确 Not Frozen、Not Implemented。索引中写了历史限定**不能替代**修订该 Current 架构。

**最小修复：** 仅在架构§1图/§4组合、namespace、成熟度和相关正式化链接中增加 Viewport，并区分「旧三 child executable historical」与「当前四 child `/1` Docs Freeze HOLD」；保留旧§2/§3及所有 Input/Render/Control/Connection 行为。精确 diff 与正式契约交叉对照作为关闭证据。

### CR-02 · P1 · 被恢复的模块文档未同步候选能力

[Data DESIGN](../../packages/data/DESIGN.md)首页仍把三-child Profile `/1`作为 Implemented/Qualified 的当前目标，且未直接链接[只增量的 Viewport 实现合同](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md)；[Subsystem model](../10-architecture/subsystem-model.md)角色/API 列表没有 `scope.viewport`；[Web Renderer](../20-modules/web-renderer/README.md)Data slot只有 Input/Render，未投影 trusted physical geometry source/sender。旧正文正确保全但不应该把历史 PASS 暗示为新四 child 已实现。

**最小修复：** 每份文件只加 subject-status/current SSOT 导航并在拥有该 seam 的段落投影一个 Viewport；不重写原正文、不删旧 exact API，不新增 M13 Projector reevaluation trigger。按原 blob→修正后 diff 验证。

### CR-03 · P1 · 非 npm 的同身份更正准入仍未有 owner conclusion

[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)及[唯一 ledger §2/§4](./viewport-profile-v1-qualification.md)把非 npm 对外协议承诺、已知独立 peer、持久化身份及 mixed/rolling/rollback 升级需求列为未签署。旧新二进制共享 `/1`，`(S,G,P)` 无法区分。**npm consumer 单项已关闭，绝不要求 npm 查询或换名重开。**

**最小修复：** 发布/部署 owner 在已列范围内给出非 npm 结论/日期及不需要 mixed peer 的 rollout 设计确认。Docs Freeze 前只要求设计上能够协调同一套实现；真正 release artifacts/SHA 清单、新代码 PASS 属 C1 实施后，不可提前伪造。如确有旧 peer 互操作义务须 STOP、重开版本迁移 ADR。

### CR-04 · 已修正正文/测试候选 · terminal 后 subscribe

原 [Viewport §6](../15-contracts/viewport-state-v1.md)的同步首次调用与 terminal inert 对「已终止后持有旧引用再 subscribe」未给唯一结果。已在 [`b896173`](https://github.com/lithdoo/loom-realm/commit/b896173949819ea9da612b8ba31ec6bf12b3a7ad)规定 terminal 后返回幂等 inert unsubscriber，绝不调用 listener；[`a8ff94e`](https://github.com/lithdoo/loom-realm/commit/a8ff94e1d62e10dbdff58848f39f094b76947b5b)增 exact conformance fixture。两提交 diff 均仅变更目标段落。**文档歧义已修正；测试执行仍属 C1，不是当前 PASS。** 最终 Docs Freeze 须以包含这两提交的新 SHA 受审。

### CR-05 · P2 · 旧长文 Frozen header/旧相对链接有导航歧义

[旧 Profile](../15-contracts/renderer-data-profile-v1-previewport-baseline.md)及[旧 conformance](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)是逐字归档，保留当时 Frozen 标头、三 child closed set，其相对链接又指向当前候选文件。虽然 current Profile、index 和 scope repair 已明确历史地位，低判断力 Agent 仍可能把这些全文当作第二份同 `/1` 活规范。

**最小修复：** 历史文件头部各增加醒目的 `Historical only / NOT current implementation contract / superseded composition by ADR0037` 包装注记并记录原 blob SHA，不改余下原始正文；或终审人在 canonical packaging 验收中证明现有入口已完全避免误用。不得宣称旧 Frozen 等于新 `/1` Frozen。

## 4. 准入、签署与执行顺序

1. CR-01/02 以**局部增补、原文逐行保护**修复；CR-05 封闭历史入口的导航歧义；CR-04 以修订后 contract/conformance 再核对。新受审 docs-only SHA 不能复用原 `8cd6c78`。
2. 对修订后的正式契约、Conformance、Connection §§1/9/22、ADR0025/0036→0037、Core 架构/模块/Data exact API、历史 crosswalk、索引及 Phase C0→C1 做最终 Current 一致性审查；若 fixture 或链接缺失，补齐后更新 subject SHA。
3. 由项目发布/部署负责人**仅对非 npm** 义务/单套构建 rollout 设计归档结论；由适格独立 reviewer 记录身份、日期、最终 SHA，在**唯一资格 ledger**中签署 Core Docs Freeze。作者的本报告不是独立人工 signoff。
4. Core Freeze 不依赖 npm 查询、Map PR0/性能、或尚未实现的 Core executable 测试。C1 之后才取得 artifact provenance、新 subject 和回归；Map 有自己的 PR0/Freeze。

**结论：技术终审完成、发现并修正一项生命周期歧义；Core Docs Freeze 仍 HOLD。** CR-01/02 是真实的 Current 文档传播问题，CR-03 需要负责人事实确认，CR-05 需要规范历史入口。不得以本报告或旧历史 PASS 宣称已 Frozen。