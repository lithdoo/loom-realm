# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：current 分包、Game/Launcher/Main bootstrap planning、Runtime Control mechanics、Runner/Platform ports、Data Profile/provisioning、测试和第一阶段交付入口  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)  
> 最近复核：2026-08-21

实施层只落地 current architecture/contracts，不反向创造 authority/lifecycle/recovery 语义。

---

## Tracking 文档

- [独立分包与发布架构](./package-architecture.md) — package/publish boundary 主要事实源；
- [仓库与目录方案](./repository-layout.md) — monorepo、Runtime Control、Game/Launcher/Main bootstrap、Runner/provisioning placement；
- [测试策略](./testing-strategy.md) — Game snapshot、Runtime Control、consumer boundary、preflight、Role/SDK、跨平台 equivalence；
- [第一阶段交付计划](./phase-1-delivery-plan.md) — M0..M16 vertical slice 实施顺序。

---

## 当前实施前提

```text
Foundation / Wire              Implemented Baseline
Game Package v1                Implemented Baseline / M2 closed
Runtime Control                Implemented Baseline / M3 closed
@loomrealm/data                Package-local Core Baseline Implemented
                               != M8 milestone closed

ADR 0020
    matching Platform Launcher consumes Game Entry
    Main consumes LogicalGameBootstrap only

ADR 0021
    Runtime Control first-implementation mechanics closure

Runtime Control Profile v1
    Control1 + Frame1
    one reader/dispatcher
    one serialized writer
    strict-monotonic same-sender Request IDs
    finite deadline / terminal settlement
    Wire duplicate-source alignment

Frame / Call v1
    semantic authority/transaction/unwind Frozen
```

Current next implementation gate：

```text
M6 Hostra Platform vertical
    HostraPlatform + Launcher PREPARE + Node Runner + RuntimeHosting
```

---

## Runtime Control Baseline

Target package：

```text
@loomrealm/runtime-control
```

Dependencies exactly：

```text
@loomrealm/foundation
@loomrealm/wire
```

First public package surface is root-only；no `/control` `/frame` `/profile` `/testing`。

Pipeline：

```text
already-established MessageCarrier<string>
        ↓
actual UTF-8 1 MiB gate
        ↓
Wire parseJsonText
        ↓
depth/profile limits
        ↓
Wire JSON-RPC decode
        ↓
strict-monotonic Request ID / method direction / exact schema
        ↓
Control state + Frame mechanics
        ↓
role-specific Main / Subsystem peers
```

Connection mechanics：

```text
exactly one inbound reader
Response correlation not blocked by role handler
Control + Frame share dispatcher/pending table
all outbound messages use one serialized writer
```

Response barrier：

```text
handler reply
→ Response carrier.send accepted
→ afterResponse dependent action
```

Deadline/terminal：

```text
finite relative scheduler
Frame 1000..300000 ms stable per connection
hello/shutdown own finite policy
deadline covers send + response
pending settlement first-wins
terminal first-wins
late Response diagnostics only
no retry/replay/reconnect
```

JSON source duplicate members follow frozen Wire / ECMAScript `JSON.parse` observable semantics；Runtime Control does not create a second parser。

Authority split：

```text
Runtime Control
    protocol mechanics / connection-local state

Main
    Launch Attempt/token + Runtime/Frame/Stack authority

Subsystem Host
    local Frame/Input/business control-flow mapping

Platform
    carrier establishment / Process/Worker lifecycle
```

---

## Game / Platform Launch Baseline

```text
Game source / installation
        ↓
session-scoped concrete Platform.prepareGame()
    → matching Launcher component
    → @loomrealm/game-package + current Platform manifest
    → exact join / executable-security preflight
    → immutable PlatformLaunchPlan
        ↓
Platform installs LaunchPlan privately
+ returns LogicalGameBootstrap
────────────────────────────────────────
first business Runtime side effect allowed
        ↓
runMain({bootstrap, platform, policy})
        ↓
RuntimeHosting.launch({subsystemKey,bootstrapToken})
        ↓
Host-owned Runner
```

Game common document has no module；Main sees no executable/document material。

---

## Game Package Baseline

```text
untrusted JSON text/value
→ Wire representation
→ closed GameEntryV1 validation
→ key-set/initial validation
→ detached deeply immutable ValidatedGameEntryV1
```

Runtime dependency：Wire only。Primary Runtime-product consumers：Hostra/PWA Launchers。Not Main/business。

---

## Main Bootstrap Baseline

```text
LogicalGameBootstrap
    subsystemKeys
    initial {subsystemKey,input}
```

Main MUST NOT receive GameEntry/formatVersion/PlatformLaunchPlan/module/path/URL。

M5 Main is now a qualified real Main-side Runtime Control consumer：`MainPlatform = {scheduler, bootstrapTokens, runtimeHosting}`；authentication callback owns Launch Attempt/token decision，Runtime Control typed terminal/outcome feeds Main first-wins failure authority。

---

## Platform / Runner Baseline

```text
Main / Renderer / Subsystem / Content
    = platform-neutral application roles

Game Package
    = platform-neutral document validation capability

Runtime Control
    = platform-neutral protocol mechanics capability

Platform Launcher
    = Runtime-product Game PREPARE + RuntimeHosting/Runner integration

Platform Composition
    = complete physical Session realization

Host-owned Runner
    = physical Runtime entry + role-port adapter

Business Definition Module
    = selected author-level implementation
```

Hostra carrier binding：WebSocket MessageCarrier。  
PWA carrier binding：MessagePort MessageCarrier。

Adapters only establish/translate string carrier units；they do not parse Runtime Control methods or retry application mutations。

---

## Role-facing Ports

Subsystem-facing：

```text
RuntimeControlBinding
SubsystemDataBinding
ContentClient
```

Renderer-facing：

```text
RendererControlBinding
RendererDataBinding
ContentClient
```

Main-facing current M5：

```text
DeadlineScheduler
BootstrapTokenGenerator
RuntimeHosting → HostedRuntime
    ├── MainRuntimeControlBinding
    ├── terminated
    └── requestTermination
```

M7+ Renderer/Data ports grow only with real consumers；Content does not automatically pass through Main.

Runtime Control scheduler is a narrow protocol-mechanics constructor port，not Game/Platform manifest configuration。

---

## Low-level / Packages

```text
low-level
    @loomrealm/foundation
    @loomrealm/wire

contract capabilities
    @loomrealm/game-package
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/data
    @loomrealm/content

roles
    @loomrealm/main
    @loomrealm/subsystem
    @loomrealm/renderer
    @loomrealm/content-service

runtime launch integration
    @loomrealm/game-launcher-hostra
    @loomrealm/game-launcher-pwa

technical adapters
    @loomrealm/launcher-node
    transport-websocket
    transport-messageport
    content-fs/http/service-worker

business
    @loomrealm/map

composition roots
    apps/desktop / apps/pwa / apps/cli
```

---

## Dependency Baseline

```text
foundation ──┐
             ↓
wire ─────→ runtime-control → main / subsystem-host
 │
 └→ game-package → game-launcher-* → apps/*

map → subsystem author root
```

Forbidden：

```text
runtime-control → main/subsystem implementation
runtime-control → WebSocket/MessagePort/Worker
runtime-control → game-package/launcher
main → game-package / concrete launcher
business → game-package / launcher / runtime-control
```

---

## Platform-specific Config

```text
Game common       game.json
Hostra            launch.hostra.json
PWA               launch.pwa.json
```

Runtime Control protocol limits/Request IDs/deadline fields are not business Game config and are not placed in universal launcher options。

---

## Subsystem Author / Host Split

```text
@loomrealm/subsystem
    business author API

@loomrealm/subsystem/host
    trusted Runner/integration API
    consumes SubsystemRuntimeControlPeer
```

Business author does not import Runtime Control directly。

M4 maps protocol pending call/return into ordinary-input gating and typed FrameOutcome/business continuation semantics。

---

## Frame SDK Closure

Frozen：

```text
exact seven Requests
Response send barrier before dependent reverse RPC
ACK-before-publication
post-commit no rollback
timeout/loss ambiguous
whole-suffix fixed-point unwind
```

Runtime Control implements mechanics/barrier/deadline/correlation；Main/Subsystem Host implement authority/control-flow。

---

## Renderer Data Closure

```text
DataAuthority {S,G,dataProfile}
loomrealm.renderer-data/1 = Connection1 + Input1 + Render1
```

Profile change requires fresh generation。Desktop/PWA late provisioning remains outside Runtime Control。

---

## Unified Message Unit

```text
MessageCarrier
one carrier unit = one UTF-8 JSON text string
```

Foundation treats string opaque；Wire owns generic JSON；profile packages own domain limits/semantics。

Structured Clone only for Platform bootstrap/Port transfer。

---

## Current Implementation Order

```text
Foundation ✅
Wire ✅
Game Package ✅
M3 Runtime Control ✅
M4 Subsystem Runtime/Frame author+host ✅
M5 Main Runtime/Frame authority ✅
↓
M6 Hostra Platform vertical
↓
M7 Renderer Control
↓
M8+ Data/Input/Render/Content slices
...
M15 PWA Platform vertical
M16 cross-platform equivalence
```

---

## Phase 1 Acceptance Direction

Must prove all three loops：

```text
Game source
→ concrete Platform.prepareGame() / matching Launcher PREPARE
→ LogicalGameBootstrap + prepared Platform instance
→ runMain({bootstrap, platform}) / Runner
```

```text
MessageCarrier
→ Runtime Control mechanics
→ role-specific peer
→ Main/Subsystem Host authority/control-flow
```

```text
Formal protocol outcome/failure
→ SDK control-flow
→ business-observable behavior
```

Hostra/PWA use same logical Game/scenario/contracts，allow platform-specific artifacts/carriers，and produce equivalent logical/protocol/business outcome。
