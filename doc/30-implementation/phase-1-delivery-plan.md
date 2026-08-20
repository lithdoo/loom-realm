# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实现顺序、Game/Platform launch boundary、Definition Module/Runner、SDK outcome/control-flow、Renderer Data Profile、Platform provisioning、Desktop/PWA composition 与关闭条件  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[仓库与目录方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-20

核心原则：

```text
lowest stable primitives
→ common logical Game topology
→ formal protocol mechanics
→ role SDK/ports
→ Hostra launch planner/Runner
→ Desktop vertical slice
→ Renderer/Data/Input/Render/Content
→ PWA launch planner/Runner
→ PWA vertical slice
→ abstract-trace equivalence
```

本次直接修改 current v1；不做 v2、不保留 `{key,module}` legacy parser。

---

## M0：文档与契约基线

当前必须一致：

```text
Game Package v1
    GameEntry {formatVersion, initial, subsystems[]}
    Descriptor = {key}

Hostra Launcher Profile v1
    launch.hostra.json
    → exact key join
    → HostraLaunchPlan

PWA Launcher Profile v1
    launch.pwa.json
    → exact key join
    → PwaLaunchPlan

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
Game logical topology shared
SubsystemDefinitionFactory ABI shared
logical scenario/application semantics shared
Platform Launch Manifest/artifact/Runner/provisioning platform-specific
```

关闭：当前文档无 current Game `{key,module}`、无 old launcher.entry/env、无 `connectionProfile`、无 Runtime-global Interest、无 structured-object MessagePort application model、无 same-artifact强约束。

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
MemoryCarrier supports deterministic close/order/fault tests
```

---

## M2：Game Package v1 Logical Topology

实现：

```text
@loomrealm/game-package
GameEntryV1
Descriptor {key}
initial {subsystem,input}
complete key-set validation
closed schema
```

关闭：

```text
formatVersion exact
key unique/case-sensitive
initial target declared
initial input JsonValue
module/launcher/env/platform fields rejected
pure deterministic validation
no filesystem/Fetch/module import
zero Runtime side effect on failure
same ValidatedGameEntry usable by Hostra/PWA planners
```

Definition Module ABI不由 Game Package定义；它在 `@loomrealm/subsystem` author/host contract中统一。

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
InputListener / RenderDomain / ContentClient
AbortSignal
```

必须先闭合：

```text
Definition Module default-export ABI
initialize creates Context only
activate starts handler exactly once
child completed/cancelled/failed resolve frame.call FrameOutcome
pre-commit recoverable rejection may reject and preserve Activation
Runtime-fatal/ambiguous never re-enters business continuation
uncaught business exception → Frame failed outcome
administrative suspend aborts frame task and discards late completion
Game/Platform launch material hidden from author surface
```

没有这些测试通过，不进入真实平台实现。

---

## M5：Main Core + Frozen Frame Vertical Slice

实现：

```text
@loomrealm/main
Logical Subsystem Registry {key}
Runtime Registry / Launch Attempt
Frame/Activation Registry
Stack mutation coordinator
InputTarget
Frame deadline/failure classifier
fixed-point unwind
```

Main-facing fake RuntimeHosting：

```text
launch(subsystemKey, launchAttemptMaterial)
terminate(...)
Supervisor facts
```

禁止 Main传 module/path/URL。

Fake ports先跑：

```text
initial frame
nested same/different subsystem call
return completed/cancelled/failed
recoverable call rejection
ambiguous failure unwind
fresh final Caller resume
```

---

## M6：Hostra Game Launcher / Node Runner / Runtime Control

实现：

```text
@loomrealm/game-launcher-hostra
HostraLaunchManifestV1 parser/validator
exact Game↔Hostra key-set join
safe installation module resolver
HostraLaunchPlan
plan-bound RuntimeHosting
Host-owned Node Runner
process Supervisor
Runtime Control WebSocket adapter
Platform Provisioning IPC capability
```

Preflight hard gate：

```text
validate Game
→ validate launch.hostra.json
→ exact join
→ resolve ALL modules / containment
→ validate Node/Runner capability
→ freeze plan
```

任一 failure：process/import/Runtime Control count = 0。

Runtime流程：

```text
Main launch(key)
→ plan lookup
→ fresh Launch Attempt/token
→ spawn Host-owned Runner
→ Runner imports exact selected Definition Module
→ construct RuntimeControlBinding
→ runSubsystem
→ hello/identified/ready
→ shutdown
→ actual exit/stopped
```

关闭：

```text
business module not argv entry
manifest cannot choose Node/Runner/unsafe argv-env/token
Main launch no module
ready without Data offer
Control WS JSON text
unexpected exit fails Runtime
no auto restart
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
no physical Data/executable material
Control loss revokes Data use
MessagePort/WS JSON-text equivalence
```

---

## M8：Renderer Data Profile + Data Connection Core

实现 `@loomrealm/data`：

```text
Renderer Data Profile v1
Data Connection v1
one Data dispatcher
RendererDataBinding / SubsystemDataBinding helpers as justified
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
→ Subsystem endpoint/ticket
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
Interest-first/Authority-first convergence
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
Platform executable capability != Content capability
Runtime token != Content bearer != Data ticket
physical module path/URL not exposed by Content API
```

---

## M13：`loom.map` Business Definition

业务 source只依赖：

```text
@loomrealm/map → @loomrealm/subsystem
```

必须实际使用：

```text
explicit FrameOutcome
Frame-bound InputListener
RenderDomain desired state
ContentClient
```

Build可产生：

```text
subsystems/hostra/loom-map/subsystem.mjs
subsystems/pwa/loom-map/subsystem.mjs
```

也可两个 manifest指向同一 portable artifact。

关闭：business source不读取 launch manifest、不 import launcher、无 `if platform` 业务分支；Runtime-fatal不会重新进入 map continuation。

---

## M14：Desktop Full E2E

```text
Game Entry {key...} + initial
+ launch.hostra.json
→ Hostra exact join/full preflight
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

关闭：所有 preflight negative case证明 zero Runtime side effect；Desktop完整 logical trace稳定。

---

## M15：PWA Game Launcher / Runner / Adapters / Provisioning

实现：

```text
@loomrealm/game-launcher-pwa
PwaLaunchManifestV1 parser/validator
exact Game↔PWA key-set join
installation/same-origin module resolver
PwaLaunchPlan
plan-bound RuntimeHosting
Host-owned Worker Runner
Runtime/Renderer Control MessagePort string adapters
Worker provisioning path
Data MessageChannel Broker integration
Content Service Worker
```

Preflight hard gate：全部 binding resolution/security/capability验证在 first Worker creation前完成。

关闭：

```text
Main launch no module
Host-owned Worker Runner is constructor entry
business module imported by Runner
postMessage(string) application model
Data Port binds S/G/P
provision failure != Runtime failure
fresh Port reconnect same S/G/P
no auto restart
```

---

## M16：PWA E2E + Cross-platform Equivalence

共享：

```text
same Game Entry logical topology
same subsystem keys
same business inputs/logical scenario
same protocol/profile semantics
same Content fixture/expected business result
same failure/reconnect scenario
```

允许：

```text
Hostra launch manifest != PWA launch manifest
Hostra Definition artifact != PWA Definition artifact
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

不比较：module path/bytes、Runner/IPC/Port/WS/HTTP physical trace。

---

## Phase 1 Acceptance

- Foundation/Wire职责单一；
- Game Package v1 Descriptor只有 `{key}`；
- Game common manifest有完整 initial target/input与 closed validation；
- Hostra/PWA各自拥有 launch config/schema/planner/resolver；
- 两个平台不共享万能 launcher option schema；
- Game↔current Platform exact key-set join；
- full executable/capability preflight先于任何 Runtime side effect；
- Main launch intent无 module/path/URL；
- Host-owned Runner是 Process/Worker entry；
- platform manifest不能覆盖 Host security/runtime policy；
- Definition Module ABI统一，artifact不要求跨平台相同；
- Subsystem author/host surfaces分离；
- FrameOutcome与 Frozen Frame一一对应；
- Runtime-fatal无 catch-and-continue；
- Main Frame/Stack/unwind闭合；
- Renderer/Data/Input/Render/Content既有边界闭合；
- Desktop/PWA late Data provisioning完整；
- `loom.map`业务 source无 Platform launch分支；
- Hostra/PWA abstract application trace等价。

---

## Deferred

```text
Save
untrusted executable sandbox / Publisher Trust
automatic Runtime restart/checkpoint
lazy / optional Subsystem
multiple Runtime instances per key
remote Runtime
multiple Renderer
runtime implementation negotiation
universal multi-platform launcher schema
predictive platform mega-package
Render history replay
```
