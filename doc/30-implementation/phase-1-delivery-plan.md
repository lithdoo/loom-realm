# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：M0..M16 实现顺序、Game/Launcher/Main bootstrap boundary、Runtime Control mechanics、Definition Module/Runner、SDK outcome/control-flow、Renderer Data、Platform provisioning、Desktop/PWA composition 与关闭条件  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[仓库与目录方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-21

核心顺序：

```text
lowest stable primitives
→ common Game document validation
→ Runtime Control protocol mechanics
→ Subsystem Runtime/Frame role slice
→ Main logical bootstrap + authority
→ Hostra Launcher / Desktop Runtime vertical slice
→ Renderer/Data/Input/Render/Content capability slices
→ PWA Launcher / PWA vertical slice
→ abstract-trace equivalence
```

Current first implementation直接收口；不做 fake v2 / compatibility parser。

### Milestone interpretation rule

本文件描述的是 **implementation order / capability closure**，不是完整 package responsibility 的重新定义。

```text
Package Scope
!= Current Implementable Slice
!= Milestone Closure
```

必须按以下优先级解释：

```text
system architecture
→ package/publish boundary
→ milestone implementation slice
```

因此：

- 一个 package MAY 跨多个 milestone 渐进实现；
- 某 milestone 写到 package 名称，不代表该 milestone关闭该 package 的完整 public surface；
- package ownership 以系统架构与 `package-architecture.md` 为事实源；
- milestone 只说明当前哪些 capability 已具备实现前提并需要被验证。

`@loomrealm/subsystem` 是典型 multi-milestone role package：M4关闭 Runtime/Frame core slice；M8/M10/M11/M12继续在同一 role package 内完成 Data/Input/Render/Content capability integration。M4 closure MUST NOT被解释为完整 `@loomrealm/subsystem` package closure。

---

## M0：文档与契约基线

Current must agree on：

```text
Game Package v1
    Descriptor {key}
    document contract, not Main state

ADR 0020
    matching Launcher consumes Game Entry
    Main consumes LogicalGameBootstrap only

Runtime Control Profile v1
    Control1 + Frame1
    one reader/dispatcher
    one serialized writer
    same-sender strict-monotonic Request IDs
    finite deadline / terminal first-wins
    duplicate JSON source follows Wire

ADR 0021
    current-v1 M3 mechanics closure
    no second JSON parser

Frame / Call v1
    seven-method authority/transaction/unwind semantics remain Frozen

Hostra/PWA Launcher Profiles
Renderer/Data/Content contracts
```

Closed：

```text
no Main → game-package dependency
no Game Descriptor.module
no universal launcher options
no Runtime Control generic-RPC public framework
no Runtime Control second JSON parser
no dynamic role session API
```

---

## M1：Foundation + Wire ✅

Implemented Baseline：

```text
@loomrealm/foundation
    MessageCarrier
    CarrierClosed
    deterministic MemoryCarrierPair

@loomrealm/wire
    JsonValue/JsonObject
    JSON text parse/stringify
    JSON-RPC envelope
    exact keys/safe integer/UTF-8/depth primitives
```

Closed：Foundation treats string opaque；Wire has no domain authority；core CI baseline exists。

---

## M2：Game Package v1 Document Validation ✅

Implemented：

```text
@loomrealm/game-package
GameEntryV1
Descriptor {key}
initial {subsystem,input}
closed schema/key-set validation
GamePackageError
ValidatedGameEntryV1 detached immutable snapshot
```

Runtime dependency：`@loomrealm/wire` only。

M2 local closure complete；real launcher consumer qualification remains M6/M15。

---

## M3：Runtime Control Mechanics

### Scope

Implement：

```text
@loomrealm/runtime-control
Control v1 schema/state mechanics
Frame v1 protocol-facing schema/mechanics
Runtime Control Profile limits
role-specific Main/Subsystem peers
one connection-wide reader/dispatcher
one serialized writer
shared strict-monotonic sender Request IDs
pending correlation
Response causal barrier
finite deadline scheduler
terminal/late-response classification
conformance/package boundary
```

Runtime dependencies exactly：

```text
@loomrealm/foundation
@loomrealm/wire
```

Public package：root export only。

### Inbound closure

```text
carrier string
→ actual UTF-8 <= 1 MiB
→ Wire parseJsonText
→ depth <= 64
→ profile/domain limits
→ Wire decodeJsonRpcMessage
→ strict-monotonic remote Request ID
→ direction/method
→ exact schema
→ protocol state
→ typed handler
```

Source duplicate JSON members follow frozen Wire/JSON.parse；M3 MUST NOT add a second parser。

### Dispatcher / writer closure

```text
exactly one carrier.messages() reader
Response correlation not blocked by role handler
Control + Frame share dispatcher/pending table
all outbound messages share one serialized writer
```

### Request ID closure

```text
same sender / same Control Connection
positive safe integer
strictly monotonically increasing
Control + Frame shared namespace
never reuse / never wrap
```

Receiver can validate with O(1) last-remote-ID state。

### Hello / Control state closure

```text
hello first / one-shot
version list 1..16/no duplicate
Control1 selected
Runtime Control owns mechanics
Main owns Launch Attempt/token authority
status/frame before hello fatal
repeated/retrograde status fatal
stopping requires Main shutdown intent
stopped only from Supervisor actual termination
```

### Frame mechanics closure

```text
exact seven Requests
closed params/results/error data
Response send barrier before dependent afterResponse action
call/return protocol-side mutation gate
unknown semantic code fatal
protocol corruption never business FrameFailure
```

### Deadline / terminal closure

Frame：

```text
1000..300000 integer ms
stable per connection
finite relative scheduler
covers local send + remote response wait
```

Control hello/shutdown deadlines finite and separate from Frame policy。

```text
pending settlement first-wins
timeout → ID consumed + late Response diagnostics only
terminal first-wins
pending settles exactly once
no retry/replay/reconnect
```

### Package closure

```text
root export only
foundation + wire only
no Node/WebSocket/MessagePort/Worker
no generic RPC/schema DSL
bounded outbound size preflight before stringify
npm pack dry-run
M3 conformance CI
```

### Real consumer qualification

M3 MUST NOT fake Main/Subsystem authority to claim full integration。

```text
M4 @loomrealm/subsystem/host
    first real Subsystem-side consumer

M5 @loomrealm/main
    first real Main-side consumer
```

When package-local stages complete：

```text
@loomrealm/runtime-control
    Implemented Baseline / Core Contract Frozen
```

---

## M4：Subsystem Runtime/Frame Core + Host Runtime Control Qualification

M4实现的是 `@loomrealm/subsystem` / `@loomrealm/subsystem/host` 的 **Runtime/Frame implementation slice**，不是完整 Subsystem role package closure。

### Author Runtime/Frame slice

Implement current-ready author semantics：

```text
defineSubsystem
SubsystemDefinitionFactory
SubsystemScope lifecycle/signal baseline
Frame / FrameOutcome
completed / cancelled / failed
AbortSignal integration
business-safe Runtime/Frame local errors
```

M4 不以实现以下 author capability 为 closure 条件：

```text
InputListener       → M10
RenderDomain        → M11
ContentClient       → M12
```

这些名称属于完整 `@loomrealm/subsystem` package responsibility，但其真正 behavior/API closure由对应 capability contract 与后续 milestone完成。

### Host Runtime slice

Implement：

```text
runSubsystem
RuntimeControlBinding using SubsystemRuntimeControlPeer
SubsystemLaunchContext
Runtime Control role mapping
```

`SubsystemDataBinding` 可作为完整 host boundary 的 port shape 被定义/保留，但 M4 MUST NOT通过 fake DataPlane/Input/Render behavior宣称其 application semantics 已关闭；真正 Data application integration从 M8开始。

### Runtime Control consumer qualification

```text
connectSubsystemRuntimeControl hidden behind host surface
business author never imports runtime-control
pending frame.call/frame.return gates ordinary mutation/input surface
recoverable semantic rejection may resume current Activation
fatal/timeout/terminal never re-enter old business continuation
```

Other closure：initialize creates Context only；activate starts handler once；Outcome mapping；administrative suspend abort/discard late completion；business exception handling。

### M4 closure statement

M4完成后允许表述：

```text
Subsystem Runtime/Frame Core Implemented
Subsystem Host Runtime Control consumer qualified
```

M4完成后不得表述：

```text
@loomrealm/subsystem full package implemented
Subsystem Input implemented
Subsystem Render implemented
Subsystem Content implemented
Subsystem DataPlane complete
```

---

## M5：Main Core + LogicalGameBootstrap + Frozen Frame Slice

Implement：

```text
@loomrealm/main
LogicalGameBootstrap input surface
Subsystem Registry {key}
Runtime Registry / Launch Attempt
bootstrap credential authority
Frame/Activation Registry
Stack mutation coordinator
InputTarget
failure classifier / fixed-point unwind
```

M5 Runtime Control consumer qualification：

```text
Main uses MainRuntimeControlPeer
Main authentication callback owns key/attempt/token decision
Response afterResponse barrier triggers dependent child/close/resume operations
Runtime Control terminal facts are inputs to Main authority mapping, not self-mutating authority
```

Main MUST NOT depend on Game Package/concrete Launcher。

Fake RuntimeHosting is already plan-bound；M5 does not implement Game/Platform PREPARE。

Vertical slice：initial frame、nested calls、Outcome、recoverable reject、ambiguous failure unwind、fresh final Caller resume。

---

## M6：Hostra Game Launcher / Node Runner / First Game Package Consumer

Implement：

```text
@loomrealm/game-launcher-hostra
Hostra Game source integration
internal Game Package consumption
Hostra manifest/join/resolver/preflight
HostraLaunchPlan
LogicalGameBootstrap projection
plan-bound RuntimeHosting
Host-owned Node Runner
process Supervisor
Runtime Control WebSocket MessageCarrier adapter
Runner provisioning integration
```

PREPARE hard gate completes before first process/import/Runtime Control side effect。

Runtime Control adapter only establishes/delivers string MessageCarrier；it MUST NOT reimplement JSON-RPC/parser/retry/deadline semantics。

M6 remains Game Package first real Runtime-product consumer。

---

## M7：Renderer Control

Implement `@loomrealm/renderer-control` + Renderer Control Store/Binding。

Close atomic snapshot/revision/InputTarget/no physical Data/executable material/Control loss behavior/WS-MessagePort JSON text equivalence。

---

## M8：Renderer Data Profile + Data Connection Core

Implement：

```text
@loomrealm/data
    Connection1
    Input1 + Render1 profile composition
    one Data dispatcher
    S-G-P current gate

@loomrealm/subsystem
    DataPlane integration slice

@loomrealm/subsystem/host
    SubsystemDataBinding behavior qualification
```

M8 establishes the shared Data application plane needed by later Input/Render managers；它继续实现同一个 Subsystem role package，不创建第二个 Subsystem runtime package。

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

Provision failure remains distinct from Runtime/Frame failure。

---

## M10：User Input v1 + InputManager

Implement Frame Interest Registry + State/Event/Reset + receive gate；fresh Data/Activation semantics as formal contracts。

Subsystem-side closure includes：

```text
@loomrealm/subsystem InputListener
InputManager
Frame-scoped Interest aggregation
fresh carrier republish
stale input receive gate
```

这属于 `@loomrealm/subsystem` 后续 capability slice，不改变 M4 Runtime/Frame closure。

---

## M11：Render Update v1 + RenderManager

Implement render domains/snapshot/patch/event；fresh carrier baseline；Frame close not auto-destroy Domain；one Data dispatcher shared with Input。

Subsystem-side closure includes：

```text
@loomrealm/subsystem RenderDomain
RenderManager
Domain desired authoritative state
fresh carrier registry/snapshot baseline
```

---

## M12：Content

Implement `@loomrealm/content` / content-service / Desktop fs/http adapters；keep executable/Data/Content capability separation。

Subsystem-side closure includes platform-neutral `ContentClient` author mapping/injection。完成 M12 后，Phase 1 所需的 Subsystem author capability surface 才具备 Runtime/Frame + Input + Render + Content 的完整实现基础。

---

## M13：`loom.map` Business Definition

```text
@loomrealm/map → @loomrealm/subsystem
```

Business uses FrameOutcome/InputListener/RenderDomain/ContentClient；no Game/Launcher/Runtime Control/platform import。

M13 是完整 author SDK 的第一个业务侧组合验证，不反向定义 `@loomrealm/subsystem` package boundary。

---

## M14：Desktop Full E2E

```text
Hostra Launcher PREPARE
→ LogicalGameBootstrap + RuntimeHosting
→ Main / Node Runner / Runtime Control
→ Renderer Control/Data/Input/Render/Content
→ nested Frame outcomes
→ reconnect/reload/shutdown
```

Includes Runtime Control protocol negative traces and PREPARE zero-side-effect cases。

---

## M15：PWA Game Launcher / Runner / Second Game Package Consumer

Implement PWA manifest/join/resolver/LaunchPlan/LogicalGameBootstrap/RuntimeHosting/Worker Runner + MessagePort Runtime Control carrier adapter。

Adapter only hands string MessageCarrier to Runtime Control；no structured application object model。

M15 = Game Package second real Runtime-product consumer。

---

## M16：PWA E2E + Cross-platform Equivalence

Shared：

```text
same Game logical source/topology
same LogicalGameBootstrap semantics
same Runtime Control abstract trace
same formal protocol/profile semantics
same business scenario/content expectation
```

Allowed physical differences：Platform manifest/artifact/PID-Worker/WS-Port/IPC-HTTP internals。

Compare logical Runtime/Frame/Renderer/Data/Input/Render/Content/business trace。

---

## Phase 1 Acceptance

- Foundation/Wire responsibilities remain single-purpose；
- Game Package document validation closure remains intact；
- Runtime Control root-only package owns protocol mechanics, not role authority；
- Runtime Control uses one reader/dispatcher + one writer；
- same-sender Control+Frame Request IDs strict monotonic；
- source duplicate JSON semantics match Wire，no second parser；
- finite deadline/terminal/late-response mechanics deterministic；
- Response causal barrier implements Frozen Frame ordering without moving Main authority；
- Subsystem Host and Main provide real Runtime Control consumer qualification；
- M4 is interpreted as Subsystem Runtime/Frame slice closure, not full `@loomrealm/subsystem` package closure；
- M8/M10/M11/M12 complete Subsystem Data/Input/Render/Content capability slices in the same role package；
- matching Launchers internally consume Game Package；
- full Game/Platform PREPARE precedes Runtime side effect；
- Host-owned Runner / Definition Module separated；
- Subsystem author/host surface separated；
- Renderer/Data/Input/Render/Content boundaries closed；
- Desktop/PWA abstract application traces equivalent。

---

## Deferred

```text
Save
untrusted executable sandbox / Publisher Trust
automatic Runtime restart/checkpoint
Control reconnect/resume
lazy / optional Subsystem
multiple Runtime instances per key
remote Runtime
multiple Renderer
runtime implementation negotiation
universal multi-platform launcher schema
generic RPC framework
Foundation-wide Clock abstraction without second consumer
Render history replay
```
