# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：M0..M16 实现顺序、Game/Launcher/Main bootstrap boundary、Definition Module/Runner、SDK outcome/control-flow、Renderer Data、Platform provisioning、Desktop/PWA composition 与关闭条件  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[仓库与目录方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-20

核心顺序：

```text
lowest stable primitives
→ common Game document validation
→ formal protocol mechanics
→ role SDK/ports
→ Main logical bootstrap
→ Hostra Launcher as first real Game Package consumer
→ Desktop vertical slice
→ Renderer/Data/Input/Render/Content
→ PWA Launcher as second consumer
→ PWA vertical slice
→ abstract-trace equivalence
```

Current v1直接收口；不做 fake v2、不保留 `{key,module}` legacy parser。

---

## M0：文档与契约基线

Current必须一致：

```text
Game Package v1
    GameEntry {formatVersion, initial, subsystems[]}
    Descriptor = {key}
    document contract, not Main state

ADR 0020
    matching Launcher consumes Game Entry
    Main consumes LogicalGameBootstrap only

Hostra Launcher Profile v1
    launch.hostra.json
    → full PREPARE

PWA Launcher Profile v1
    launch.pwa.json
    → full PREPARE

Runtime Control Profile v1
    Control1 + Frame1

Frame / Call v1
    Frozen

Renderer/Data/Content contracts
```

关闭：

```text
no Main → game-package dependency
no application-required manual Game Package step
no Game Descriptor.module
no universal launcher options/prepared schema
no same-artifact cross-platform requirement
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

关闭：Foundation treats string opaque；Wire has no domain authority；core CI baseline exists。

---

## M2：Game Package v1 Document Validation ✅

实现：

```text
@loomrealm/game-package
GameEntryV1
Descriptor {key}
initial {subsystem,input}
closed schema / key-set validation
GamePackageError
ValidatedGameEntryV1 detached immutable snapshot
```

依赖：

```text
@loomrealm/wire only
```

关闭：

```text
exact public API
formatVersion exact
key non-empty / unique / case-sensitive
no trim/case-fold/Unicode normalization
initial target declared
initial input opaque JsonValue
schema-level module/launcher/env/platform rejected
same names inside initial.input accepted
stable error class/code/path
source mutation cannot alter validated result
validated result deeply immutable
deep-input-safe snapshot
no filesystem/Fetch/module import
zero Runtime side effect
no Main dependency
package dry-run/boundary tests
```

M2 local close已完成；不伪造 Hostra/PWA consumer，真实 consumer qualification留给 M6/M15。

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
ambiguous Frame mutation Runtime-fatal
```

---

## M4：Subsystem Host Surface + Frame SDK Semantics

实现：

```text
@loomrealm/subsystem
@loomrealm/subsystem/host
```

Author：

```text
defineSubsystem
SubsystemScope
Frame / FrameOutcome
InputListener
RenderDomain
ContentClient
AbortSignal
```

Host：

```text
runSubsystem
RuntimeControlBinding
SubsystemDataBinding
SubsystemLaunchContext
```

关闭：

```text
Definition Module default-export ABI
initialize creates Context only
activate starts handler exactly once
child terminal outcome → FrameOutcome
pre-commit recoverable rejection preserves Activation
Runtime-fatal/ambiguous never re-enters business continuation
uncaught business exception → failed outcome
administrative suspend aborts/discards late completion
business author surface has no Game Package/Launcher/host dependency
```

---

## M5：Main Core + LogicalGameBootstrap + Frozen Frame Slice

实现：

```text
@loomrealm/main
LogicalGameBootstrap input surface
Subsystem Registry {key}
Runtime Registry / Launch Attempt
Frame/Activation Registry
Stack mutation coordinator
InputTarget
Frame deadline/failure classifier
fixed-point unwind
```

Main-facing fake Platform ports：

```text
RuntimeHosting.launch(subsystemKey, LaunchAttemptMaterial)
terminate(...)
Supervisor facts
```

关键 dependency closure：

```text
Main MUST NOT depend on @loomrealm/game-package
Main MUST NOT depend on concrete game-launcher-*
Main tests use LogicalGameBootstrap fixtures directly
```

Fake RuntimeHosting is assumed already plan-bound；M5 不实现 Game/Platform manifest/preflight。

关闭 vertical slice：

```text
initial frame from LogicalGameBootstrap.initial
nested same/different subsystem call
completed/cancelled/failed outcomes
recoverable call rejection
ambiguous failure unwind
fresh final Caller resume
Main launch has no module/path/URL
```

---

## M6：Hostra Game Launcher / Node Runner / First Game Package Consumer

实现：

```text
@loomrealm/game-launcher-hostra
Hostra Game source/installation integration boundary
internal @loomrealm/game-package consumption
HostraLaunchManifestV1 parser/validator
exact Game↔Hostra key-set join
safe installation module resolver
HostraLaunchPlan
LogicalGameBootstrap projection
plan-bound RuntimeHosting
Host-owned Node Runner
process Supervisor
Runtime Control WebSocket adapter
Runner provisioning integration
```

PREPARE hard gate：

```text
obtain Game Entry
→ @loomrealm/game-package validate
→ validate launch.hostra.json
→ exact join
→ resolve ALL modules / containment
→ validate Node/Runner capability
→ freeze HostraLaunchPlan
→ freeze LogicalGameBootstrap
→ return PreparedHostraGame
```

任一 PREPARE failure：

```text
process/import/Runtime Control count = 0
```

Consumer qualification：

```text
M6 = @loomrealm/game-package first real Runtime-product consumer
product caller does not manually call Game Package
Main receives logical projection only
```

Runtime关闭：

```text
business module not argv entry
manifest cannot choose Node/Runner/unsafe argv-env/token
Main launch no module
ready independent from Data offer
unexpected exit fails Runtime
no auto restart
```

---

## M7：Renderer Control

实现：

```text
@loomrealm/renderer-control
@loomrealm/renderer Control Store
RendererControlBinding
```

关闭：full atomic snapshot/revision/InputTarget one-shot/no physical Data/executable material/Control loss revokes Data use/WS-MessagePort JSON-text equivalence。

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

```text
Main DataAuthority(S,G,P)
→ Desktop Broker
→ Renderer material
→ Runner provisioning IPC
→ Subsystem endpoint/ticket
→ Data WS carriers
```

关闭：provisioning distinct from Control/stdout/Data application；stale/duplicate ticket rejected；same S/G/P reconnect；provision failure != Runtime/Frame failure。

---

## M10：User Input v1 + InputManager

实现 full Frame Interest Registry + State/Event/Reset + receive gate。

关闭：fresh Data registry/state empty；Interest-first/Authority-first convergence；fresh Activation reuses config not State/Event；Frame close local-first interest removal；state baseline/event future-only。

---

## M11：Render Update v1 + RenderManager

实现：

```text
render.domains/snapshot/patch/event
RenderDomain desired-state API
SDK-minted domainId
```

关闭：fresh carrier Registry + Snapshots；strict revision chain；Frame close not auto-destroy Domain；one Data dispatcher shared with Input。

---

## M12：Content

实现：

```text
@loomrealm/content
@loomrealm/content-service
Desktop fs/http adapters
```

保持：

```text
Platform executable capability != Content capability
Runtime token != Content bearer != Data ticket
physical module path/URL not exposed by Content API
```

---

## M13：`loom.map` Business Definition

Business source only：

```text
@loomrealm/map → @loomrealm/subsystem
```

MUST use FrameOutcome / Frame-bound InputListener / RenderDomain / ContentClient。

MUST NOT import Game Package/Launcher or inspect platform。

Build MAY produce Hostra/PWA-specific artifacts from same business source。

---

## M14：Desktop Full E2E

```text
Hostra game source
→ Hostra Launcher PREPARE
→ LogicalGameBootstrap + plan-bound RuntimeHosting
→ Main / Node Runner ready
→ Renderer Control
→ DataAuthority / Broker
→ Input/Render/Content
→ nested Frame outcomes
→ Data reconnect
→ Renderer reload
→ shutdown
```

Negative PREPARE cases prove zero Runtime side effect。

---

## M15：PWA Game Launcher / Runner / Second Game Package Consumer

实现：

```text
@loomrealm/game-launcher-pwa
PWA Game source/installation integration boundary
internal @loomrealm/game-package consumption
PwaLaunchManifestV1 parser/validator
exact Game↔PWA key-set join
installation/same-origin resolver
PwaLaunchPlan
LogicalGameBootstrap projection
plan-bound RuntimeHosting
Host-owned Worker Runner
Runtime/Renderer Control MessagePort adapters
Worker provisioning path
```

PREPARE hard gate：full binding/security/capability validation before first Worker creation。

Consumer qualification：

```text
M15 = @loomrealm/game-package second real Runtime-product consumer
same common Game Entry source
→ Hostra/PWA prepared LogicalGameBootstrap semantically equivalent
```

关闭：Main launch no module；Host-owned Worker Runner entry；postMessage(string)；Data Port binds S/G/P；provision failure != Runtime failure；no auto restart。

---

## M16：PWA E2E + Cross-platform Equivalence

Shared：

```text
same Game Entry logical topology/source fixture
same resulting LogicalGameBootstrap semantics
same subsystem keys
same business inputs/scenario
same protocol/profile semantics
same Content fixture/expected business result
```

Allowed：

```text
Hostra manifest != PWA manifest
Hostra artifact != PWA artifact
```

Compare logical Runtime/Frame/Renderer/Data/Input/Render/Content/business trace；do not compare module path/bytes、Runner/IPC/Port/WS/HTTP physical trace。

---

## Phase 1 Acceptance

- Foundation/Wire职责单一；
- Game Package是 document validation capability，Descriptor只有 `{key}`；
- validated Game snapshot detached/immutable；
- matching Launchers internally consume Game Package；
- Product application不需要手动 Game Package step；
- Main不依赖 Game Package/concrete Launcher；
- Main consumes `LogicalGameBootstrap` only；
- Hostra/PWA各自拥有 launch config/schema/planner/resolver；
- Game↔current Platform exact key-set join；
- full PREPARE + logical projection先于 Runtime side effect；
- Host-owned Runner是 Process/Worker entry；
- Definition Module ABI统一，artifact不要求跨平台相同；
- Subsystem author/host surface分离；
- Frame Frozen transaction/recovery闭合；
- Renderer/Data/Input/Render/Content边界闭合；
- Desktop/PWA late Data provisioning完整；
- `loom.map` business source无 Game/Platform launch dependency；
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
universal PreparedPlatformGame/GameSource abstraction
Render history replay
```
