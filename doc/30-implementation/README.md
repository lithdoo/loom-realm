# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：current 分包、测试、delivery milestone 与 implementation fact-source 入口  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 最近复核：2026-09-03

实施层只落地 current architecture/contracts，不反向创造 authority/lifecycle/recovery 语义。本文只做导航与当前实施状态摘要；精确 milestone closure 由 `phase-1-delivery-plan.md` 与对应 Frozen M/ADR 文档定义。

---

## Tracking 文档

- [独立分包与发布架构](./package-architecture.md) — package/publish/dependency boundary 主要事实源；
- [仓库与目录方案](./repository-layout.md) — monorepo、Runner、provisioning 与 artifact placement；
- [测试策略](./testing-strategy.md) — package、role、vertical、cross-platform qualification；
- [第一阶段交付计划](./phase-1-delivery-plan.md) — M0..M16 唯一 milestone 顺序/closure 摘要。

M7 具体实施顺序位于仓库根目录：

```text
M7_01_RENDERER_CONTROL_PACKAGE.md
→ M7_02_MAIN_AUTHORITY_PROJECTION.md
→ M7_03_RENDERER_CONTROL_HOLDER.md
→ M7_04_VERTICAL_INTEGRATION.md
→ M7_05_QUALIFICATION_CLOSURE.md
```

---

## 当前 Implemented Baseline

```text
M1
    @loomrealm/foundation
    @loomrealm/wire

M2
    @loomrealm/game-package

M3
    @loomrealm/runtime-control concrete mechanics

M4
    @loomrealm/subsystem Runtime/Frame core + /host consumer

M5
    @loomrealm/main Runtime/Frame authority
    LogicalGameBootstrap
    RuntimeHosting/HostedRuntime integration

M6
    @loomrealm/game-launcher-hostra
    Hostra PREPARE + HostraLaunchPlan
    Node Runner
    Runtime Control WebSocket MessageCarrier
    real Main ↔ Runner ↔ Subsystem vertical
    Qualified Baseline 2026-09-03

M7
    @loomrealm/renderer-control concrete peers
    @loomrealm/main Renderer authority projection/currentness
    @loomrealm/renderer Control holder

M8
    Main ready-derived DataAuthority S/1/P
    role-facing Data Bindings
    Subsystem/Renderer real Data peer lifecycle
    deterministic paired vertical
    Qualified 2026-09-04
```

`@loomrealm/data` package-local Core 与 M8 real role consumers 均已关闭；Input/Render business semantics 仍分别属于 M10/M11。

---

## 当前下一实现门：M9 Desktop DataConnectionBroker

M8 qualification evidence见 [`m8-qualification.md`](./m8-qualification.md)。M9 从已经关闭的 role-facing current carrier seam 开始实现 physical provisioning；不回退修改 M8 authority/currentness 语义。

---

## 已关闭门：M7 Renderer Control

M7 已完成实现与资格关闭；下列内容保留为实现边界记录。

事实源：

```text
ADR 0027
Main ⇄ Renderer Control Protocol v1 — Active / Normative / Frozen
M7_01 ... M7_05 — Implementation Frozen / Preimplementation Closed
```

### M7 package / role changes

```text
@loomrealm/renderer-control
    scaffold exists
    implement concrete asymmetric peers
    renderer.hello id=1
    renderer.state full Snapshot
    exact hello preflight
    0..1 inFlight + 0..1 pendingLatest

@loomrealm/platform-ports
    BootstrapTokenGenerator → OpaqueMaterialGenerator
    add RendererControlBinding candidate-slot capability

@loomrealm/main
    pure Renderer authority projection
    sessionId / AuthorityRevision
    optional RendererControlBinding accept loop
    one current + one candidate
    atomic hello/currentness/replacement

@loomrealm/renderer
    create minimal package
    local {peer,snapshot}|null holder only
```

### Existing-provider migration is part of M7

所有现有 M5/M6 `MainPlatform` providers/fixtures 必须机械迁移：

```text
bootstrapTokens / BootstrapTokenGenerator
→ opaqueMaterial / OpaqueMaterialGenerator
```

现有 Hostra Runtime-only provider继续**不提供** `rendererControl`；不得用 fake/no-op Binding满足新类型。

`OpaqueMaterialGenerator` Frozen output：ASCII `1..128` bytes、fresh、安全用途至少 `128-bit` unpredictability。现有 CSPRNG实现若满足 contract可直接复用，不新增 `generate(kind)`/identity service/crypto facade。

---

## Current Main-facing Platform View Through M7

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
}
```

`rendererControl` 是 optional physical capability：

```text
absent
→ no Renderer attempt
→ Runtime/Frame Session fully valid

present
→ one armed/pending/bound candidate slot maximum
→ protocol hello grants currentness
```

`RendererControlBinding` 不是 Renderer hosting API，不认证 token、不协商 protocol version、不决定 currentness。

---

## Current Package Dependency Baseline

```text
@loomrealm/platform-ports depends on:
    @loomrealm/foundation

@loomrealm/runtime-control depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/renderer-control depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/main depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/wire

@loomrealm/renderer depends on:
    @loomrealm/renderer-control
```

禁止 generic RPC/schema DSL、universal Platform/service locator、Renderer Store framework、shadow Main authority 或 cross-plane currentness lease。

---

## Authority / Protocol Split Through M7

```text
Runtime Control
    protocol mechanics / connection-local state

Renderer Control
    hello/version/wire/snapshot publication mechanics

Main
    Session / Runtime / Frame / Activation / InputTarget
    Runtime credential authority
    Renderer token/currentness/revision authority

Renderer
    local read-only accepted Main mirror

Platform
    carrier establishment / physical hosting / provisioning
```

Renderer Control representation failure不能改变 Frozen Frame/Runtime business authority。

---

## M8+ Placement

```text
M8
    Main DataAuthority allocation/generation/profile
    Subsystem DataPlane / SubsystemDataBinding
    Renderer Data binding/current authority integration

M9
    Desktop DataConnectionBroker / late provisioning core
    != full BrowserWindow composition

M10
    User Input / Interest / Producer gate

M11
    Render Update / Render Store / RenderDomain

M12
    Content role/adapters

M13
    loom.map business definition

M14
    Desktop Full E2E
    Hostra BrowserWindow
    physical RendererControlBinding + Renderer WS
    Desktop Data Broker/Data WS
    Input/Render/Content

M15
    PWA PREPARE + Worker Runner + Runtime Control MessagePort

M16
    PWA Full E2E
    physical RendererControlBinding
    PWA DataConnectionBroker / MessageChannel / role bindings
    PWA Content Fetch/SW/OPFS
    cross-platform logical equivalence
```

M14/M16 concrete Renderer Binding必须遵守 M7 Frozen candidate-slot settlement；如果真实 physical consumer证明 Frozen capability无法表达必要语义，只能按 ADR 0027 reopen，不能创建平台私有第二套 currentness/retry protocol。

---

## Qualification Ownership

```text
renderer-control tests
    wire/version/ordering/revision/bounded publication/terminal

platform-ports tests
    OpaqueMaterialGenerator contract
    RendererControlBinding candidate-slot lifecycle

main tests
    projection/revision/token/currentness/optional Binding
    capability-absent + Binding-terminal paths

renderer tests
    local peer+Snapshot holder / replacement identity safety

M7 vertical
    production-shaped Binding path via MemoryCarrier

M6 regression
    Hostra Runtime-only provider after opaqueMaterial migration

M14/M16
    concrete physical Renderer/Data/Content realization
```

不允许用单个 giant E2E 代替 package/role evidence。

---

## Current Implementation Order

```text
M1 Foundation / Wire ✅
M2 Game Package ✅
M3 Runtime Control ✅
M4 Subsystem Runtime/Frame ✅
M5 Main Runtime/Frame ✅
M6 Hostra Runtime physical vertical ✅
↓
M7 Renderer Control — Frozen, implement next
↓
M8 Data role integration
M9 Desktop Data Broker
M10 Input
M11 Render
M12 Content
M13 business map
M14 Desktop Full E2E
M15 PWA Runtime vertical
M16 PWA Full E2E / equivalence
```

---

## Phase 1 Acceptance Direction

Phase 1最终必须证明：

```text
Game source
→ matching Platform PREPARE
→ LogicalGameBootstrap + Session-scoped Platform
→ Main/Runner Runtime authority
```

```text
Main committed Renderer authority
→ Frozen Renderer Control
→ current Renderer mirror
→ Data/Input/Render/Content consumers
```

```text
Hostra physical realization
≈ same logical application trace ≈
PWA physical realization
```

物理 PID/Worker、WebSocket/MessagePort、IPC/Port transfer、HTTP/Fetch 可以不同；authority、protocol observable behavior 与 business result必须等价。
