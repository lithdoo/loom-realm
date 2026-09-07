# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving overall / M10 frozen  
> 主要定义：M0..M16 实现顺序、当前 closure、Desktop/PWA qualification 边界  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
> 当前 Input 决策：[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 最近复核：2026-09-07

核心顺序：

```text
Foundation/Wire
→ Game document
→ Runtime Control
→ Subsystem Runtime/Frame
→ Main authority
→ Hostra Runtime
→ Renderer Control
→ Data role seam
→ Desktop Data Broker
→ Input
→ Render
→ Content
→ loom.map
→ Desktop full E2E
→ PWA Runtime
→ PWA full E2E/equivalence
```

规则：

```text
Package Scope
!= Current Implementable Slice
!= Milestone Closure
```

首次实现只维护一个 current model；不制造 fake v2 / deprecated alias / generic framework。

---

## M0：文档与契约基线

Current docs统一 Game/Launcher/Main、Runtime/Frame、Renderer Control、Data/Input/Render contracts与 Platform composition boundary。

---

## M1：Foundation + Wire ✅

MessageCarrier/MemoryCarrier + JSON/JSON-RPC representation/limits primitives。

---

## M2：Game Package v1 ✅

Common Game Entry validation/snapshot capability。M6 Hostra first real consumer；M15 PWA second consumer。

---

## M3：Runtime Control Mechanics ✅

one reader / one writer、strict sender IDs、finite deadlines、terminal first-wins、no retry/replay/reconnect。

---

## M4：Subsystem Runtime/Frame Core ✅

Runtime/Frame author/host slice implemented；Input/Render/Content分别 M10/M11/M12。

---

## M5：Main Core + LogicalGameBootstrap ✅

Runtime/Frame authority、Stack/Activation/InputTarget、serialized mutation、failure unwind、Session terminal implemented。

---

## M6：Hostra Platform Vertical / Node Runner ✅

Qualified 2026-09-03：Hostra PREPARE → LaunchPlan/bootstrap → Node Runner → Runtime Control WS → real Main/Subsystem vertical。

---

## M7：Renderer Control ✅

Qualified 2026-09-03：

```text
@loomrealm/renderer-control peers
OpaqueMaterialGenerator
optional RendererControlBinding candidate slot
Main pure authority projection/revision/currentness
Renderer local holder
replacement/race/fail-closed qualification
```

Physical BrowserWindow Renderer Control remains M14；PWA M16。

---

## M8：Renderer Data Role/Core ✅

Qualified 2026-09-04：

```text
Main ready-derived DataAuthority
RendererDataBinding / SubsystemDataBinding
Subsystem optional Data peer lifecycle
Renderer per-subsystem Data reconciliation
real @loomrealm/data peers
```

No Broker/Input/Render business semantics in M8。

---

## M9：Desktop DataConnectionBroker / Late Provisioning ✅

Qualified 2026-09-04：

```text
Main → Platform full Data authority view
exact HostedRuntime target
Hostra Runtime-scoped provisioner + child IPC
Desktop paired Data WebSocket Broker
commit-time revalidation
install-before-role-delivery
post-install delivery failure never resurrects old current
```

Root gate：`npm run test:m9`。

M9只证明 physical Data lifecycle；fresh Input/Render business baseline属于 M10/M11。

---

## M10：User Input v1 + InputManager — **Implementation Frozen / Ready for Implementation**

Current facts：

```text
User Input protocolVersion = 1
fixtureSetRevision = 2
ADR 0023 + ADR 0029
no further design round expected before coding
```

Root implementation plans：

```text
M10_01_SUBSYSTEM_INPUT_MANAGER.md
M10_02_RENDERER_INPUT_GATE.md
M10_03_RENDERER_INPUT_PRODUCERS.md
M10_04_VERTICAL_INTEGRATION.md
M10_05_QUALIFICATION_CLOSURE.md
```

### Exact Subsystem author slice

```text
one InputManager / instance
SubsystemScope.createInputListener exact surface
InputChannel → canonical payload typed mapping
channels/setChannels solely own Interest contribution
on/unsubscribe solely own callback registration
setChannels preserves dormant registrations
unsubscribe + close idempotent
stable deterministic handler snapshot/order
async handler Promise does not block Data reader
immutable retained State/local state baseline
known-no-commit convergence before frame.call rejection observable
latest-only Interest publication
```

### Renderer slice

```text
Effective = Data × InputTarget × active F/A × Interest × Producer
one input gate per current Data slot
one bounded State/Event/Reset publisher
Event/Reset global State-coalescing barriers
exact createRendererControlHolder(data?, input?) additive API
one construction-time RendererInputSource object
0..1 active source subscription for current Control peer
fresh source facts after Control replacement/reconnect
```

### Qualification

Real M9 Desktop Data vertical必须证明：

```text
exact SDK contribution/handler semantics
handler registration order + stable snapshot
async handler isolation
Interest-first / Authority-first convergence
nested child call / fresh Activation
recoverable frame.call State-before-rejection convergence
committed call never leaks old suppressed State
same-generation Data reconnect fresh baseline/no Event replay
fresh-generation role fixture
Control replacement source restart + late callback isolation
producer loss/return
handler/local author error isolation
barrier/backpressure rules
```

fresh-generation语义用 role-level deterministic fixture证明，不为测试提前加入 Main generation allocator。

M10只声明 current platform-independent User Input role semantics + frozen SDK/source projection在 Hostra/Desktop Data lifecycle上 qualified；完整 Hostra/PWA transport equivalence留到 M16。

Implementation完成时新增：

```text
npm run test:m10
```

文档阶段不放空 gate。

### Freeze rule

从当前状态开始，M10实现阶段允许改变：

```text
private names/layout/data structure
finite local queue capacity
private detach/freeze/token representation
```

不得重新讨论：

```text
public InputListener semantics
handler payload shape/order/async behavior
mutation reopen/rejection ordering
Renderer source construction/lifetime
User Input authority/lifetime/wire/backpressure
```

若编码遇到困难，默认按实现问题处理；只有证明 Frozen docs自身存在 correctness contradiction 才重新打开设计。

---

## M11：Render Update v1 + RenderManager

Subsystem RenderDomain/RenderManager + Renderer authoritative replica/store；fresh Data建立 Domain Registry/Snapshot baseline。

```text
Frame close != Render Domain destroy
Data retire != authoritative Domain destroy
```

---

## M12：Content

Implement readonly Content capability + Desktop adapters + Subsystem ContentClient mapping。

保持：

```text
ordinary Content capability != executable/module resolution capability
```

---

## M13：`loom.map` Business Definition

```text
@loomrealm/map → @loomrealm/subsystem
```

No Game/Launcher/Runtime Control/Platform imports。用真实 Input/Render/Content/Frame call验证 author SDK。

---

## M14：Desktop Full E2E

```text
HostraPlatform.prepareGame
→ Main / Node Runner / Runtime Control
→ physical RendererControlBinding
→ BrowserWindow + Renderer Control WS
→ M9 Data Broker
→ M10 Input + M11 Render + M12 Content
→ nested Frames / Renderer reload / shutdown
```

M14加入真实 DOM/Gamepad `RendererInputSource`，必须复用 M10 exact source API、current-Control subscription lifetime与同一 authority/publisher semantics。

---

## M15：PWA Game Launcher / Runner

PWA manifest/join/resolver/LaunchPlan/LogicalGameBootstrap/RuntimeHosting/Worker Runner + MessagePort Runtime Control；成为 Game Package第二 real consumer。

---

## M16：PWA Full E2E + Cross-platform Equivalence

```text
PwaPlatform.prepareGame
→ Worker Runtime
→ PWA Renderer Control
→ PWA Data provisioning
→ User Input + Render + Content
→ full logical Session trace
```

在这里完成 User Input/Data Profile 的 Hostra/PWA transport-equivalence conformance claim。

---

## Phase 1 Acceptance

- Foundation/Wire单一用途；
- Game Package / Launcher / Main bootstrap boundary不倒退；
- protocol package拥有 mechanics，不拥有 role authority；
- Frame causal/commit/unwind semantics保持 Frozen；
- Renderer currentness/token/revision保持 M7 boundary；
- Data authority/lifecycle保持 M8/M9 boundary；
- M10 State/Event/Reset revision 2 + exact SDK/source semantics完整闭合；
- Data failure不升级 Runtime/Frame；
- M14才宣称 Desktop full product E2E；
- M16才宣称完整 PWA/cross-platform equivalence；
- no generic RPC/connection/authority/input/transaction/retry/currentness framework。

---

## Deferred

```text
Save
untrusted executable sandbox / Publisher Trust
automatic Runtime restart/checkpoint
Runtime Control reconnect/resume
lazy / optional Subsystem
multiple Runtime instances per key
remote Runtime
multiple current Renderer participants
runtime implementation negotiation
universal multi-platform launcher schema
generic RPC/connection framework
Render history replay
```
