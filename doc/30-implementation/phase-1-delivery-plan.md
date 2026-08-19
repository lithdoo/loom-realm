# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实现顺序、Definition Module/Runner、SDK outcome/control-flow、Renderer Data Profile、Platform provisioning、Desktop/PWA composition 与关闭条件  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[仓库与目录方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-19

核心原则：

```text
lowest stable primitives
→ formal protocol mechanics
→ role SDK/ports
→ Platform Runner/adapters
→ Desktop vertical slice
→ PWA vertical slice
→ same Definition Module equivalence
```

不做 v2 逃逸；当前 v1在冻结前允许 breaking 收口。

---

## M0：文档与契约基线

当前必须一致：

```text
Game Package v1
    Descriptor = {key,module}

Runtime Control Profile v1
    Control1 + Frame1

Frame / Call v1
    Frozen

Renderer Control v1
    DataAuthority = {S,G,dataProfile}

Renderer Data Profile v1
    Connection1 + Input1 + Render1

Content API v1
```

跨平台：

```text
Definition Module shared
Runner/physical provisioning platform-specific
application semantics shared
```

关闭：当前文档无旧 `launcher.entry/env`、`connectionProfile`、Runtime-global Interest、structured-object MessagePort application model。

---

## M1：Foundation + Wire

实现：

```text
@loomrealm/foundation
    MessageCarrier<string>
    CarrierClosed
    deterministic MemoryCarrierPair

@loomrealm/wire
    JsonValue/JsonObject
    JSON text parse/stringify
    JSON-RPC envelope
    exact keys/safe integer/UTF-8/depth primitives
```

关闭：

```text
foundation treats string opaque
wire has no domain authority
MemoryCarrier supports deterministic close/order tests
```

---

## M2：Game Package v1 / Definition Module ABI

实现：

```text
@loomrealm/game-package
Descriptor {key,module}
complete Descriptor-set validation
module logical path validation
```

与 `@loomrealm/subsystem` 协作冻结：

```text
.mjs default export = SubsystemDefinitionFactory
```

关闭：

```text
no launcher/env legacy fields
.mjs only
same descriptor/module usable by Desktop/PWA fixtures
zero Runtime side effect on validation failure
```

---

## M3：Runtime Control Mechanics

实现：

```text
@loomrealm/runtime-control
Control schema/state
Frame schema/mechanics
Runtime Control session/dispatcher
shared sender Request ID namespace
finite deadlines
conformance harness
```

关闭：

```text
one carrier reader
one UTF-8 JSON text per JSON-RPC message
hello-first
no Batch
no retry
ambiguous Frame mutation classified Runtime-fatal
```

---

## M4：Subsystem Host Surface + Frame SDK Semantics

实现：

```text
@loomrealm/subsystem
@loomrealm/subsystem/host
```

Host surface：

```text
runSubsystem
RuntimeControlBinding
SubsystemDataBinding
SubsystemLaunchContext
```

Author surface：

```text
defineSubsystem
SubsystemScope
Frame / FrameOutcome
completed / cancelled / failed
AbortSignal
```

必须先闭合：

```text
initialize creates Context only
activate starts handler exactly once
child completed/cancelled/failed resolve frame.call FrameOutcome
pre-commit recoverable rejection may reject and preserve Activation
Runtime-fatal/ambiguous never re-enters business continuation
uncaught business exception → Frame failed outcome
administrative suspend aborts frame task and discards late completion
```

没有这些测试通过，不进入真实平台实现。

---

## M5：Main Core + Frozen Frame Vertical Slice

实现：

```text
@loomrealm/main
Runtime Registry / Launch Attempt
Frame/Activation Registry
Stack mutation coordinator
InputTarget
Frame deadline/failure classifier
fixed-point unwind
```

用 fake RuntimeHosting/Control ports先跑：

```text
initial frame
nested same/different subsystem call
return completed/cancelled/failed
recoverable call rejection
ambiguous failure unwind
fresh final Caller resume
```

---

## M6：Desktop Node Runner / Runtime Control

在 `apps/desktop` 优先实现 app-local：

```text
Host-owned Node Runner
module resolver
process Supervisor
Runtime Control WebSocket adapter
Platform Provisioning IPC capability
```

流程：

```text
{key,module}
→ spawn Runner
→ import exact Definition Module
→ construct RuntimeControlBinding
→ runSubsystem
→ hello/ready
→ shutdown
→ actual exit/stopped
```

此阶段 provisioning channel可先建立但不需要已有 Data offer。

关闭：

```text
business module not argv entry
ready without Data offer
Control WS JSON text
unexpected exit fails Runtime
```

---

## M7：Renderer Control

实现：

```text
@loomrealm/renderer-control
@loomrealm/renderer Control Store
RendererControlBinding port
```

Snapshot：

```text
Runtime/Stack/Activation/InputTarget
DataAuthority {S,G,dataProfile}
```

关闭：

```text
full atomic snapshot
revision rules
InputTarget one-shot
no physical Data material
Control loss revokes Data use
MessagePort/WS JSON-text equivalence
```

---

## M8：Renderer Data Profile + Data Connection Core

实现 `@loomrealm/data` 基础：

```text
Renderer Data Profile v1
Data Connection v1
one Data dispatcher
RendererDataBinding / SubsystemDataBinding integration helpers as justified
```

关闭：

```text
P = loomrealm.renderer-data/1
Connection1 + Input1 + Render1 binding
S/G/P current gate
profile change requires fresh generation
same S/G/P sequential reconnect
one Data reader/demux
```

---

## M9：Desktop DataConnectionBroker / Late Provisioning

实现：

```text
Main DataAuthority(S,G,P)
→ Desktop Broker
→ Renderer physical endpoint/material
→ Runner provisioning IPC
→ Subsystem physical endpoint/ticket
→ Data WS carriers
```

Runner：

```text
validate own S/G/P
→ establish WS
→ SubsystemDataBinding yields {G,P,carrier}
```

关闭：

```text
provisioning distinct from Control/stdout/Data application
stale/duplicate ticket rejected
same S/G/P fresh offer reconnect
profile replacement invalidates old material
provision/connect failure does not fail Runtime/unwind Frame
```

---

## M10：User Input v1 + InputManager

实现：

```text
full Frame Interest Registry
State/Event/Reset
InputManager listener contributions/union
receive gate
```

关闭：

```text
fresh Data registry/state empty
Interest-first/Authority-first
new child waits own Interest
fresh resume reuses config not State/Event
Frame close removes Interest before local success
interest shrink local-first
state fresh baseline / event future-only
```

标准 channel payload/hard limits在 User Input Frozen前同步关闭。

---

## M11：Render Update v1 + RenderManager

实现：

```text
render.domains/snapshot/patch/event
RenderDomain desired-state API
SDK-minted domainId
```

关闭：

```text
fresh carrier Registry + Snapshots
strict revision chain/atomic Patch
Frame close not auto-destroy Domain
Data reconnect hidden from business
one Data dispatcher shared with Input
```

---

## M12：Content

实现：

```text
@loomrealm/content
@loomrealm/content-service
Desktop fs/http adapters
```

业务只见 logical `ContentClient`。

保持：

```text
Definition Module executable capability != Content capability
Runtime token != Content bearer != Data ticket
```

---

## M13：`loom.map` Business Definition Module

交付同一：

```text
subsystems/loom-map/subsystem.mjs
```

只依赖 `@loomrealm/subsystem`。

必须实际使用：

```text
explicit FrameOutcome
Frame-bound InputListener
RenderDomain desired state
ContentClient
```

并证明 Runtime-fatal不会重新进入 map continuation。

---

## M14：Desktop Full E2E

```text
Game Package {key,module}
→ Node Runner/ready
→ Renderer Control
→ DataAuthority S/G/P
→ Broker late provisioning
→ Input/Render/Content
→ nested Frame outcomes
→ same-generation Data reconnect
→ Renderer reload
→ shutdown
```

另跑 ambiguous Frame failure E2E。

---

## M15：PWA Runner / Adapters / Provisioning

实现：

```text
Worker Runner
Runtime/Renderer Control MessagePort string adapters
Worker provisioning path
Data MessageChannel Broker
Content Service Worker
```

同一个 descriptor.module/Definition Module。

关闭：

```text
postMessage(string) application model
Data Port binds S/G/P
provision failure != Runtime failure
fresh Port reconnect same S/G/P
```

---

## M16：PWA E2E + Cross-platform Equivalence

完全相同：

```text
Game Package
Definition Module
business inputs
failure/reconnect scenario
```

比较：

```text
Runtime lifecycle
Frame/Activation/Outcome/unwind
Renderer S/G/P authority
Data current/retired lifecycle
Input delivered semantics
Render authoritative replica
Content logical response
business observable state
```

不比较物理 Runner/IPC/Port/WS/HTTP trace。

---

## Phase 1 Acceptance

- Foundation/Wire职责单一；
- Game Package v1只有 `{key,module}`；
- same Definition Module跨 Node/Worker Runner；
- author/host Subsystem surfaces分离；
- FrameOutcome与 Frame v1一一对应；
- Runtime-fatal没有 catch-and-continue逃逸；
- Main Frame/Stack authority与 unwind闭合；
- Renderer Control使用 S/G/dataProfile；
- Renderer Data Profile v1绑定 Connection/Input/Render v1；
- Desktop/PWA都有 late Data provisioning闭环；
- provisioning失败不污染 Runtime/Frame failure domain；
- Input Frame Interest/Activation/reconnect闭合；
- Render independent lifecycle/reconnect闭合；
- `loom.map`无平台分支；
- Desktop/PWA same Definition Module abstract trace等价。

---

## Deferred

Save、untrusted executable sandbox、automatic Runtime restart、lazy/optional Subsystem、multiple Runtime per key、remote Runtime、多 Renderer、Frame migration/replay、Render history replay、跨 Domain transaction，以及没有真实消费者的预测性 platform/runner helper package。