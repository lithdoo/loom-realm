# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：current 分包、Game/Launcher/Main bootstrap planning、Runner/Platform ports、Data Profile/provisioning、测试和第一阶段交付入口  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)  
> 最近复核：2026-08-20

实施层只落地 current architecture/contracts，不反向创造 authority/lifecycle/recovery 语义。

---

## Tracking 文档

- [独立分包与发布架构](./package-architecture.md) — package/publish boundary 主要事实源；
- [仓库与目录方案](./repository-layout.md) — monorepo、Game/Launcher/Main bootstrap、Runner/provisioning placement；
- [测试策略](./testing-strategy.md) — Game snapshot、consumer boundary、protocol、preflight、Runner/provisioning、跨平台 equivalence；
- [第一阶段交付计划](./phase-1-delivery-plan.md) — M0..M16 vertical slice 实施顺序。

---

## 当前实施前提

```text
Game Package v1
    Game Entry document {key...} + initial
    document validation capability

ADR 0020
    matching Platform Launcher consumes Game Entry
    Main consumes LogicalGameBootstrap only

Hostra Game Launcher / Node Runner Profile v1
PWA Game Launcher / Worker Runner Profile v1
Subsystem Control v1
Runtime Control Profile v1
Frame / Call v1 Frozen
Renderer Control v1
Renderer Data Profile v1
Data Connection v1
User Input v1
Render Update v1
Content API v1
```

Current first implementation：

```text
no Game Descriptor.module
no Main → game-package dependency
no application-required manual Game Package step
no v2 / legacy parser
no universal launcher/prepared options bag
```

---

## Game / Platform Launch Baseline

```text
Game source / installation
        ↓
matching Platform Launcher PREPARE
    ├── @loomrealm/game-package
    │       common Game Entry validation
    ├── current Platform Launch Manifest
    ├── exact key-set join
    ├── all executable resolution
    ├── installation/security containment
    └── hosting capability preflight
        ↓
immutable PlatformLaunchPlan
+
immutable LogicalGameBootstrap
────────────────────────────────────────
first business Runtime side effect allowed
        ↓
apps/* installs Main
        ↓
Main launch(subsystemKey)
        ↓
plan-bound RuntimeHosting
        ↓
Host-owned Runner
        ↓
platform-selected Definition Module
```

Game common document不包含 module；Main不携 executable/document material。

---

## Game Package Baseline

`@loomrealm/game-package`：

```text
untrusted JSON text/value
→ Wire representation
→ closed GameEntryV1 validation
→ exact key-set / initial target validation
→ detached deeply immutable ValidatedGameEntryV1
```

Runtime dependency：

```text
@loomrealm/wire only
```

Primary Runtime-product consumers：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

Not Main/business。

---

## Main Bootstrap Baseline

Main-facing logical input：

```text
LogicalGameBootstrap
    subsystemKeys
    initial {subsystemKey,input}
```

Main MUST NOT receive：

```text
GameEntryV1 / ValidatedGameEntryV1
formatVersion
PlatformLaunchPlan
module/path/URL
```

Main local tests use logical fixtures directly；Game Package document validation不在 Main重复实现。

---

## Platform / Runner Baseline

```text
Main / Renderer / Subsystem / Content
    = platform-neutral application roles

Game Package
    = platform-neutral document validation capability

Platform Launcher
    = Runtime-product Game consumer
      + current-platform executable PREPARE
      + LogicalGameBootstrap projection
      + RuntimeHosting/Runner integration

Platform Composition
    = complete physical Session realization

Host-owned Runner
    = physical Runtime entry + role-port adapter

Business Definition Module
    = selected author-level business implementation
```

Hostra：`launch.hostra.json` + Node Runner + WebSocket + provisioning IPC。  
PWA：`launch.pwa.json` + Worker Runner + MessagePort + provisioning path。

Launcher package仍是 narrow Runtime launch capability，不是 Platform mega-package。

---

## Role-facing Ports

```text
Subsystem-facing
    RuntimeControlBinding
    SubsystemDataBinding
    ContentClient

Renderer-facing
    RendererControlBinding
    RendererDataBinding
    ContentClient

Main-facing
    RuntimeHosting/Supervisor
    RuntimeControlHost
    RendererHosting/ControlHost
    DataConnectionBroker
    Content integration
```

`RuntimeHosting.launch` only accepts logical key/Launch Attempt material；内部 lookup frozen plan。

---

## Low-level / Packages

```text
low-level
    @loomrealm/foundation
    @loomrealm/wire

document/contract capability
    @loomrealm/game-package
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/data
    @loomrealm/content

role
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
    apps/desktop
    apps/pwa
    apps/cli
```

---

## Dependency Baseline

```text
wire
  ↓
game-package
  ↓
game-launcher-hostra / game-launcher-pwa
  ↓
apps/*

main
  → runtime-control / renderer-control / wire as required

map
  → subsystem
```

Forbidden：

```text
main → game-package
main → concrete launcher
business → game-package
business → launcher
game-package → Main/launcher
```

---

## Platform-specific Config

```text
Game common
    game.json

Hostra
    launch.hostra.json

PWA
    launch.pwa.json
```

两个 Platform manifests各自拥有 schema/version/security policy；不要建立 shared：

```text
launcher.type
PlatformLaunchOptions
options:any
universal PreparedPlatformGame
```

Current unique join identity：`subsystemKey`。

---

## Subsystem Author / Host Split

```text
@loomrealm/subsystem
    defineSubsystem
    Frame / FrameOutcome
    InputListener
    RenderDomain
    ContentClient

@loomrealm/subsystem/host
    runSubsystem
    RuntimeControlBinding
    SubsystemDataBinding
    launch integration context
```

Business package不得依赖 `/host`、Game Package 或 Launcher。

---

## Frame SDK Closure

Author-facing `FrameOutcome`：completed / cancelled / failed。

`frame.call()`：

```text
child Outcome → resolve
pre-commit recoverable rejection → typed reject
Runtime-fatal/ambiguous → no business continuation re-entry
```

Implementation hard invariants：initialize does not start handler；activate starts once；administrative suspend aborts/discards late completion；uncaught business exception maps to failed outcome when authority healthy。

---

## Renderer Data Closure

```text
DataAuthority {S,G,dataProfile}
loomrealm.renderer-data/1
= Connection1 + Input1 + Render1
```

Profile change requires fresh generation。

```text
Main authority
→ DataConnectionBroker
→ RendererDataBinding + SubsystemDataBinding
```

Desktop late provisioning via Runner IPC；PWA via Worker provisioning/Port transfer。

```text
provisioning failure != Runtime failure / Frame unwind
Data loss != RuntimeHosting failure
```

---

## Unified Message Unit

```text
MessageCarrier
one carrier unit = one UTF-8 JSON text string
```

Foundation treats string opaque；profile/wire负责 JSON semantics。

Structured Clone只用于 Platform bootstrap/Port transfer。

---

## Phase 1 Acceptance Direction

必须证明：

```text
Game source
→ matching Launcher internal Game validation
→ current Platform manifest
→ exact join / zero-side-effect PREPARE
→ PlatformLaunchPlan + LogicalGameBootstrap
→ Main + RuntimeHosting
→ Runner
```

以及：

```text
Business Definition
→ Author SDK
→ Role Core
→ Role Ports
→ Runner/Broker
→ physical platform
```

以及：

```text
Formal protocol outcome/failure
→ SDK control-flow
→ business-observable behavior
```

最终 Hostra/PWA 使用 same Game logical topology/scenario/contracts，允许 platform-specific executable artifacts，并得到等价 logical outcome。
