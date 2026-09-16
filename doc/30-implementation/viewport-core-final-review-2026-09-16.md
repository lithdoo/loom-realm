# Viewport / revised Renderer Data Profile v1 — Core 文档终审

> 审查类型：**Technical final cross-review completed; Docs Freeze NOT APPROVED / HOLD**。日期：2026-09-16。  
> 固定受审基线：`8cd6c78f593df61112883c277aec8280f5604c04`；本文件是审查证据而非修改了受审基线的合格声明。  
> 审查者：ChatGPT（技术审查；不是项目发布/部署负责人的声明或独立人工冻结签署）。  
> 唯一 live status：[revised-v1 qualification ledger](./viewport-profile-v1-qualification.md)。修订：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；[scope repair/crosswalk](./viewport-scope-repair-2026-09-16.md)。本文件不维护第二套 PASS。  
> **用户已确认无 npm 消费者；npm 查询、npm 消费者复核均不执行且不属于 Freeze gate。** 其他互不相关的、非 npm 的旧二进制共存/显式协议承诺仍遵 ADR0037 和唯一 ledger 的限定范围。

## 1. 审查范围和方法

对照当前 [Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Profile revision-3 conformance](../15-contracts/renderer-data-profile-conformance-v1.md)、[Viewport child](../15-contracts/viewport-state-v1.md)、[Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)、Frozen [Connection](../15-contracts/renderer-subsystem-data-connection-v1.md)、[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)、[治理](../00-overview/document-governance.md)、[契约索引](../15-contracts/README.md)、[协议分层架构](../10-architecture/renderer-subsystem-protocol-layers.md)、[Subsystem 模型](../10-architecture/subsystem-model.md)、[Web Renderer 模块](../20-modules/web-renderer/README.md)、[Data package baseline](../../packages/data/DESIGN.md)及[精确增量](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md)、[phase plan](./phase-1-delivery-plan.md)、[旧 Profile 全文](../15-contracts/renderer-data-profile-v1-previewport-baseline.md)、[旧 conformance 全文](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)和[逐节 crosswalk](./viewport-scope-repair-2026-09-16.md)。

Git compare `a71be9c...8cd6c78` 显示本轮剩余实际文件差异仅文档，治理/平台/系统/模块/Data 旧长文已复原；这**不**等于所有 Current 架构投影已同步。已核实 `/2` 文档是 Superseded、Connection 不拥有 child wire、Map PR0 独立，不把 Map 性能/P95当 Core Docs Freeze 条件。逐节旧 Profile §1–14 / conformance §1–11 的受保护映射已存在；未运行自动化链接检查、fixture、代码测试或外部分发调查，不能表述为它们已 PASS。

## 2. 已闭合的设计审查判断（仅文档设计，不是执行结果）

- **协议边界：** 唯一目标 `loomrealm.renderer-data/1 = Connection1 + Input1 + Render1 + Viewport1`；`viewport.state` exact own `{type,width,height}`，Renderer→Subsystem；没有 `/2`、协商、ACK、Main geometry mirror、InputTarget bypass 或 Map-specific Core route。既有 Input/Render/Control/Connection wire 保持原合同。
- **安全/可恢复性：** common JSON text/实际 UTF-8 1MiB/depth64/Wire preflight；one inbound reader、one serialized writer、精确 child direction/diagnostic；Viewport per-carrier ≤1 admitted/in-flight + ≤1 pending latest；fresh independent baseline、old-source/current-authority fencing、Data-local terminal。
- **Author 观测：** Runtime-scoped readonly last successfully accepted `current`，起始 null、loss retain、equal suppress、subscribe 同步首发、listener fault local-containment；non-null 不证明当前 carrier/paintability。几何消息不授予业务 Frame mutation authority。
- **职责：** Core 只承诺单一指定 CSS logical surface，Web `innerWidth/innerHeight` 和 cohort 为产品组合，camera/chunks/Canvas/PR0 属 Map；M13 reevaluation 仍仅由 Control/Store 驱动。
- **保全：** 旧 Profile/Conformance 全文归档，当前规范精确列出覆盖范围；原 §3/§5–11 的关键 preflight、handler、writer、fresh、terminal、bounded 和 revision-2 fixture 不能因当前正文短而废弃。`scope repair` 已列逐节归属。本项是技术内容对照，不构成独立正式审查签署。

## 3. 终审发现：未关闭项及最低修复（按优先级）

### CR-01 / P1 / Current 架构仍声明错误的三 child Frozen

[renderer-subsystem-protocol-layers.md §1、§4](../10-architecture/renderer-subsystem-protocol-layers.md) 仍在标为 Active Design 的 Current 架构正文中写 `Profile v1 Frozen`、`Connection + Input + Render` 和 `input/render only`，§4 又明言「均已 Frozen」。这与 current Profile `/1` 四 child/Not Frozen 直接矛盾。仅在契约索引解释「旧 Frozen 只属历史」不足以让低判断力实现者安全执行。

**修复：** 仅局部改图、§4 组合/namespace 和 maturity 为「原三-child executable historical; 修正四-child `/1` Docs Freeze HOLD / not implemented」，加 [Viewport capability](../10-architecture/viewport-capability.md) 和当前 Profile 链接；§2/§3、Input/Render/Control/Connection 其余旧正文必须逐字保持。不整篇重写。

**关闭证据：** 精确 diff 证明除上述投影之外无其他受保护段落变化；复核者对照 Formal Profile 与 architecture 确认一致。

### CR-02 / P1 / 恢复的模块入口缺少候选能力状态及归属链接

[packages/data/DESIGN.md](../../packages/data/DESIGN.md) 原文恢复后仍在首页把 Profile v1 描述成 Frozen/Implemented/Qualified，当作当前包设计；并未直接链接 [Viewport-only Data delta](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md)。[Subsystem model](../10-architecture/subsystem-model.md) 的 role/author API 主体只列 Input/Render/Content，未投影 `scope.viewport`；[Web Renderer module](../20-modules/web-renderer/README.md) 的 role slot 只有 Input/Render，未投影可信 geometry source/sender。原始基线与未来目标均有价值，但不能让其「current」状态无条件代表修正版已实现。

**修复：** 各文件只在开头添加短的 subject-status / current SSOT 注记，并在对应 role/seam 段落用一小段或一行新增 Viewport link/ownership；明确历史 M8/M10/M11/M13 PASS 不复用，完整旧 API/权威与 M13 reevaluation 原文不删除。Data 的新字段和 exact peer API 只由 delta 负责；Subsystem author API 由 Viewport child 正式契约负责；不新增 M13 的 presentation trigger。

**关闭证据：** 每份原 blob→修正后逐行 diff、确认只增加导航/role 投影及状态注记，核对链接可达。

### CR-03 / P1 / 首版更正的非 npm 准入与实际部署证据仍待负责人确认

[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) 和唯一 [ledger §2/§4](./viewport-profile-v1-qualification.md) 仍把明确非 npm 旧 `/1` 对外承诺、独立互操作、persisted identity、当前旧 peer、rolling/rollback/mixed cohort 列为尚未签署。两个二进制都叫 `/1`，`(S,G,P)` 不能检测版本。**npm 消费者已由 owner 确认并关闭，不得要求 npm 验证；此 finding 不包含 npm。**

**修复：** 相应项目发布/部署负责人只对 ledger 已列的非 npm 事实做一份范围明确、结论及日期完整的确认；在 Docs Freeze 时只证明 coherent single-build rollout **方案可行且无需混版**，真正的 artifact inventory、新 executable SHA、同 cohort 测试应在 C1 实施后归档，禁止要求在实现前伪造这些运行证据。如存在真实旧 peer 共存义务，STOP direct reset，提交新的版本/迁移 ADR。

**关闭证据：** owner/date/范围/结论和可执行 rollout 决定；无需 npm 查询或额外 npm 消费者证明。

### CR-04 / P2 / held Viewport 引用在 Runtime terminal 后新 subscribe 的精确行为需固定

[Viewport child §6](../15-contracts/viewport-state-v1.md) 同时说 `subscribe` 调用时同步首发一次（含 null）和 Runtime terminal 后 late delivery inert；[Viewport conformance §2/§4](../15-contracts/viewport-state-conformance-v1.md) 没有明确「外部先保存 `scope.viewport` 引用，Runtime 已 terminal 后再调用 `subscribe`」的结果。低判断力 Agent 可能选择立即回调旧值，也可能选择 no-op。

**修复：** 明定 terminal/abort 后 `subscribe` 返回 inert 幂等 unsubscriber、**不调用 listener**，保留 `current` 历史只读值亦不表示可用；在 conformance 加一条同步 no-callback 断言。此为生命周期边界澄清，不增加 wire/manager。

### CR-05 / P2 / 历史长文必须避免被当成同一 identity 的第二份活规范

原始 Profile/Conformance 以 `-previe wport-baseline`（实际文件名 `-previewport-baseline`）单独归档，保留原 Frozen 标头、三-child closed set；其内部旧相对链接指向当前候选并非一套独立的历史实现配对。当前 Profile 已列精确覆盖例外和 STOP，索引及 scope repair 已明确历史地位，因此现阶段不是新增协议冲突，但属于低判断力实现者的导航风险。

**修复：** 在归档文件开头各加简短 `Historical baseline only / NOT current contract / superseded on composition by ADR0037` 标识，并保持余下原文/原始 SHA provenance 以便字节差异可复查；或由审查者在最终 canonical packaging 审核中证明现有入口提示已足够。不得把原 `Frozen` 误写成当前修正后 `/1` 已 Frozen。

## 4. 终审可执行关闭顺序

1. 修改 CR-01/02：只作 Current architecture/module 导航与组合投影，禁止再次压缩完整原文。处理 CR-04、CR-05 的最小文案与 fixture；必要时更新受保护 crosswalk。
2. 用修订后的 docs-only SHA 逐份核对：ADR0025/0036→0037、唯一 `/1`与`/2` superseded、Connection §1/§9/§22、Profile v1 旧→新 §1–14、fixture revision2→3 §1–11、Viewport Conformance §1–7、Data exact peer API、Subsystem/Renderer seam、产品物理 source、索引链接和 Phase C0→C1。
3. 项目负责人单独关闭 **仅非 npm** 兼容/同版部署设计证据（CR-03）。当且仅当所有 CR-01–05 关闭且没有新冲突，由适格 reviewer 记录身份、日期、精确最终 docs SHA，将唯一 ledger 标为 Core Docs Frozen。不能把本审查作者写成独立人工批准人。
4. **Freeze 不依赖 Map PR0、PR1/2 性能、尚未实现的 Core executable PASS 或 npm 验证。** Core C1 在冻结之后生成新 executable subject/cohort manifest/测试；Map PR0 和 Map Docs Freeze 另外执行。

## 5. 明确结论

**Technical review completed / Freeze HOLD.** 当前跨角色设计主方向及 formal contracts 基本闭合；CR-01 是真实的 Current 语义冲突，CR-02 是模块入口传播缺口，CR-03 是被明确保留的项目负责人事实确认；CR-04/05 是低判断力 Agent 生命周期和历史正文导航的歧义。任何人不得把本文、旧 M8/M11 PASS、仓库无 release、用户 npm 决策或作者自身整理结果宣称为 Final Freeze signoff。修复后在**新的 docs-only SHA** 上复核，并只在唯一 ledger 记录最终裁定。