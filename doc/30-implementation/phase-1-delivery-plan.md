# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：M0..M16 实现顺序、Game/Launcher/Main bootstrap boundary、Runtime Control mechanics、Definition Module/Runner、Renderer/Data/Input/Render/Content capability 与 Desktop/PWA qualification  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[仓库与目录方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-09-03

核心顺序：

```text
lowest stable primitives
→ common Game document validation
→ Runtime Control protocol mechanics
→ Subsystem Runtime/Frame role slice
→ Main logical bootstrap + authority
→ Hostra Runtime physical vertical
→ Renderer Control logical mirror vertical
→ Data/Input/Render/Content capability slices
→ Desktop full physical E2E
→ PWA physical vertical/equivalence
```

Current first implementation直接收口；不做 fake v2 / compatibility parser。

### Milestone interpretation rule

```text
Package Scope
!= Current Implementable Slice
!= Milestone Closure
```

优先级：

```text
system architecture
→ package/publish boundary
→ accepted/frozen ADR + formal contract
→ milestone implementation slice
```

一个 package MAY跨多个 milestone渐进实现；milestone不重新定义 package ownership。

---

## M0：文档与契约基线

Current must agree on：

```text
Game Package v1
Runtime Control Profile v1
Frame / Call v1 Frozen
Hostra/PWA Launcher Profiles
Renderer Control v1 Frozen by ADR 0027
Renderer Data / Input / Render contracts
```

Closed：

```text
no Main → game-package dependency
no Game Descriptor.module
no universal launcher options
no generic RPC public framework
no second JSON parser
```

---

## M1：Foundation + Wire ✅

Implemented Baseline：

```text
@loomrealm/foundation
    MessageCarrier / CarrierClosed / deterministic MemoryCarrierPair

@loomrealm/wire
    JsonValue/JsonObject
    JSON text parse/stringify
    JSON-RPC envelope
    exact keys/safe integer/UTF-8/depth primitives
```

---

## M2：Game Package v1 Document Validation ✅

Implemented：

```text
@loomrealm/game-package
GameEntryV1
Descriptor {key}
initial {subsystem,input}
closed schema/key-set validation
ValidatedGameEntryV1 detached immutable snapshot
```

Runtime dependency：`@loomrealm/wire` only。

---

## M3：Runtime Control Mechanics

Implement/maintain：

```text
@loomrealm/runtime-control
Control v1 + Frame v1 protocol mechanics
one connection-wide reader/dispatcher
one serialized writer
shared strict-monotonic sender Request IDs
pending correlation
Response causal barrier
finite deadlines
terminal first-wins
closed schema / limits
root-only package
```

Dependencies exactly：Foundation + Wire。

No generic RPC/schema DSL、Node/WebSocket/MessagePort/Worker dependency、retry/replay/reconnect。

Real consumer qualification：M4 Subsystem Host + M5 Main。

---

## M4：Subsystem Runtime/Frame Core + Host Runtime Control Qualification

M4 closes only `@loomrealm/subsystem` Runtime/Frame slice：

```text
defineSubsystem / SubsystemDefinitionFactory
SubsystemScope lifecycle/signal
Frame / FrameOutcome
@loomrealm/subsystem/host Runtime Control integration
```

Platform Ports M4 frozen slice：

```text
DeadlineScheduler
RuntimeControlBinding
```

Not M4 closure：InputListener(M10)、RenderDomain(M11)、ContentClient(M12)、DataPlane(M8)。

---

## M5：Main Core + LogicalGameBootstrap + Frozen Frame Slice ✅

Implemented Baseline：

```text
@loomrealm/main
    LogicalGameBootstrap
    MainPlatform M5 capability view
    Runtime Registry / current Launch Attempt
    bootstrap credential authority
    Frame / Activation / Stack
    derived InputTarget
    serialized mutation lane
    first-wins Runtime failure
    fixed-point unwind
    graceful Session terminal + physical termination escalation
```

M5 Platform Ports semantics：

```text
historical implementation name: BootstrapTokenGenerator
RuntimeLaunchRequest
MainRuntimeControlBinding
HostedRuntime
RuntimeHosting
```

ADR 0027 在 M7 将 material source current-v1 直接收敛/重命名为 `OpaqueMaterialGenerator`，不改变 M5 credential authority semantics。

---

## M6：Hostra Platform Vertical / Launcher / Node Runner ✅

Qualified Baseline（2026-09-03）：

```text
session-scoped HostraPlatform
Hostra Launcher PREPARE
HostraLaunchPlan + LogicalGameBootstrap
Host-owned Node Runner
process supervision
Runtime Control WebSocket MessageCarrier
real Main ↔ Runner ↔ subsystem vertical
```

M6 不实现 Renderer Control physical hosting、Data Broker、Input/Render/Content。

---

## M7：Renderer Control — **Implementation Frozen / Pending Implementation**

事实源：

```text
ADR 0027
Main ⇄ Renderer Control Protocol v1 (Frozen)
M7_01_RENDERER_CONTROL_PACKAGE.md
M7_02_MAIN_AUTHORITY_PROJECTION.md
M7_03_RENDERER_CONTROL_STORE.md
M7_04_VERTICAL_INTEGRATION.md
M7_05_QUALIFICATION_CLOSURE.md
```

### M7/01 `@loomrealm/renderer-control`

Implement concrete asymmetric protocol mechanics：

```text
renderer.hello id=1
renderer.state
exact closed wire types
whole current-Snapshot validation
connection-local revision state
side-effect-free exact hello outbound preparation/preflight
hello Result-before-state ordering
Renderer initial-Snapshot-before-later-state handoff
0..1 inFlight + 0..1 pendingLatest
peer retirement / terminal first-wins
no generic RPC/request/publisher framework
```

Dependencies exactly Foundation + Wire。

### M7/02 Platform Ports + Main

Platform Ports frozen M7 target：

```text
OpaqueMaterialGenerator
RendererControlBinding.acquire(rendererControlToken, signal)
```

MainPlatform target：

```text
scheduler
opaqueMaterial
runtimeHosting
rendererControl
```

Main implements：

```text
fresh sessionId
initial rendererRevision=1
pure Runtime/Frame/Activation/InputTarget projection
M7 dataAuthorities=[]
one-current + one-candidate bounded Renderer model
background RendererControlBinding accept loop
hello exact preflight before current switch
atomic token consume + current install + old retirement
identity-safe current/stale terminal handling
Session terminal aborts attempts + retires current Renderer
```

Renderer Control representation failure MUST NOT alter Frozen Frame / Runtime business authority。

### M7/03 `@loomrealm/renderer`

Minimal Control holder only：

```text
current = {peer, RendererAuthoritySnapshotV1} | null
atomic whole-Snapshot replacement
initial peer+Snapshot installed before later-state consumption
old peer late state/terminal ignored after replacement
current terminal → null
```

No duplicate `RendererControlState`、second revision validator、subscription/EventBus/Store framework、Data/Input/Render implementation。

### M7/04 Deterministic vertical

Real production path with deterministic physical realization：

```text
RendererControlBinding test implementation
→ Main bounded accept loop
→ Main pure projection/revision/hello acceptance
→ renderer-control Main peer
→ MemoryCarrier<string>
→ renderer-control Renderer peer
→ Renderer current holder
```

Must prove：

```text
Renderer absence does not block Session
one candidate bound
hello concurrent revision cannot be lost
unrepresentable candidate cannot evict healthy current
replacement blocks new old-peer sends and requests close
already-started old inFlight late delivery has no authority effect
Session terminal retires Renderer authority
call/return/failure projection traces
structural boundedness
representation isolation
```

### M7 closure boundary

M7 **does close**：

```text
logical RendererControlBinding contract
MemoryCarrier semantic implementation/evidence
Renderer Control protocol/core boundedness
Main/Renderer authority/currentness semantics
```

M7 **does not require**：

```text
Hostra BrowserWindow + Renderer Control WebSocket physical realization
PWA Renderer Control MessagePort physical realization
concrete stalled-write timeout policy
Main DataAuthority policy
Data/Input/Render/Content
```

Hostra physical Renderer Control must close by M14 Desktop Full E2E；PWA physical Renderer Control by M16。

---

## M8：Renderer Data Profile + Data Connection Core

Existing `@loomrealm/data` package-local baseline is not milestone closure。

M8 real consumers：

```text
@loomrealm/main
    DataAuthority allocation/generation/profile policy

@loomrealm/subsystem / host
    DataPlane + SubsystemDataBinding

@loomrealm/renderer
    Renderer Data binding/current authority integration
```

M8 starts from Frozen M7 current Renderer participant + `RendererDataAuthorityV1` wire shape。

---

## M9：Desktop DataConnectionBroker / Late Provisioning

```text
Main DataAuthority(S,G,P)
→ Desktop Broker
→ Renderer material
→ Runner provisioning IPC
→ Subsystem endpoint/ticket
→ Data WS carriers
```

Provisioning failure remains distinct from Runtime/Frame failure。

---

## M10：User Input v1 + InputManager

```text
Frame Interest Registry
State/Event/Reset
Renderer sender gate
Subsystem InputListener/InputManager
fresh Activation/Data semantics
```

---

## M11：Render Update v1 + RenderManager

```text
render domains/snapshot/patch/event
Renderer Render Store
Subsystem RenderDomain/RenderManager
fresh carrier baseline
Frame close != Render destroy
```

---

## M12：Content

Implement `@loomrealm/content` / content-service / Desktop fs/http adapters + Subsystem `ContentClient` author mapping。

---

## M13：`loom.map` Business Definition

```text
@loomrealm/map → @loomrealm/subsystem
```

Business uses FrameOutcome/InputListener/RenderDomain/ContentClient；no Game/Launcher/Runtime Control/Platform import。

---

## M14：Desktop Full E2E

```text
HostraPlatform.prepareGame
→ Main / Node Runner / Runtime Control
→ Hostra physical RendererControlBinding realization
→ BrowserWindow + Renderer Control WebSocket
→ Data/Input/Render/Content
→ nested Frame outcomes
→ Renderer reload/replacement
→ shutdown
```

M14 must add physical evidence missing from M7 core：

```text
Hostra Renderer Control WS token delivery/carrier establishment
finite stalled-write close policy
old physical Renderer retirement
```

---

## M15：PWA Game Launcher / Runner / Second Game Package Consumer

Implement PWA manifest/join/resolver/LaunchPlan/LogicalGameBootstrap/RuntimeHosting/Worker Runner + MessagePort Runtime Control carrier。

---

## M16：PWA E2E + Cross-platform Equivalence

Add PWA physical Renderer Control Binding realization：

```text
RendererControlBinding
→ Renderer bootstrap/token delivery
→ MessagePort string carrier
→ Frozen Renderer Control semantics
```

Compare same logical Runtime/Frame/Renderer/Data/Input/Render/Content/business trace；physical PID/Worker/WS/Port/IPC details may differ。

---

## Phase 1 Acceptance

- Foundation/Wire single-purpose；
- Game Package validation boundary intact；
- Runtime Control owns protocol mechanics, not role authority；
- Frozen Frame ordering/causal barriers preserved；
- Subsystem Host/Main real Runtime Control consumers qualified；
- matching Launchers consume Game Package and PREPARE before Runtime side effects；
- Host-owned Runner separated from business Definition；
- M7 Frozen Renderer Control Binding/currentness/atomicity implemented without generic framework；
- Renderer Control representation failure cannot mutate Frame/Runtime authority；
- M8/M10/M11/M12 complete Data/Input/Render/Content role slices；
- Hostra/PWA physical Renderer Control realizations conform to same Frozen Binding/protocol semantics；
- Desktop/PWA abstract application traces equivalent。

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
generic RPC framework
Foundation-wide Clock abstraction without second consumer
Render history replay
```