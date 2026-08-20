# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、Game/Platform launch planning、Runner/Platform ports、Data Profile/provisioning、测试和第一阶段交付入口  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-20

实施层只落地当前 architecture/contracts，不反向创造 authority/lifecycle/recovery 语义。

---

## Tracking 文档

- [独立分包与发布架构](./package-architecture.md) — package/publish boundary 主要事实源；
- [仓库与目录方案](./repository-layout.md) — monorepo、Game/Platform launch packages、author/host surface、Runner/provisioning placement；
- [测试策略](./testing-strategy.md) — protocol、SDK control-flow、preflight、Runner/provisioning、跨平台 equivalence；
- [第一阶段交付计划](./phase-1-delivery-plan.md) — vertical slice 实施顺序。

---

## 当前实施前提

```text
Game Package v1
    Game Entry {key...} + initial

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

当前 first implementation只有一套 Game/launch model：

```text
no Game Descriptor.module
no v2
no legacy parser
no universal launcher options bag
```

Platform provisioning保持 implementation boundary，不制造新的 application protocol。

---

## Game / Platform Launch Baseline

```text
Validated Game Entry
    logical topology only
        +
Validated current Platform Launch Manifest
        ↓
exact key-set join
all required executable resolution
installation/security containment
hosting capability preflight
        ↓
immutable PlatformLaunchPlan
────────────────────────────────────────
first business Runtime side effect allowed
        ↓
Main launch(subsystemKey)
        ↓
plan-bound RuntimeHosting
        ↓
Host-owned Runner
        ↓
platform-selected Definition Module
```

Game common manifest不包含 module；Main不携 executable material。

Hostra/PWA可选择不同 build artifact，但必须满足相同 SubsystemDefinitionFactory ABI/formal semantics/logical behavior。

---

## Platform / Runner Baseline

```text
Main / Renderer / Subsystem / Content
    = platform-neutral roles

Platform Composition
    = complete physical Session realization

Platform Launcher
    = current-platform executable binding + preflight + Runtime launch integration

Host-owned Runner
    = physical Runtime entry + role-port adapter

Business Definition Module
    = selected author-level business implementation
```

```text
Hostra
    launch.hostra.json
    Node Runner + WebSocket + provisioning IPC

PWA
    launch.pwa.json
    Worker Runner + MessagePort + provisioning path
```

Launcher package只解决 Subsystem Runtime launch，不等价完整 Platform mega-package。

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

这些是 implementation boundaries，不要求一 port 一 package。

`RuntimeHosting.launch`只接受 logical key/Launch Attempt material；它内部 lookup frozen PlatformLaunchPlan。

---

## Low-level / Packages

```text
low-level
    @loomrealm/foundation
    @loomrealm/wire

contract/capability
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

Platform Architecture不自动生成 `platform-*` mega-package。

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

两个 Platform Launch Manifest各自拥有 schema/version/validation/security policy；不要建立共享：

```text
launcher.type
PlatformLaunchOptions
options:any
```

当前唯一跨平台 join identity是 `subsystemKey`。

Phase 1要求 current Platform bindings严格覆盖 Game key set。

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

Business package不得依赖 `/host`。

Author不见 carrier/bootstrap/generation/profile/launch manifest/module path/Runner type。

---

## Frame SDK Closure

Author-facing：

```text
FrameOutcome
    completed / cancelled / failed
```

`frame.call()`：

```text
child Outcome → resolve
pre-commit recoverable rejection → typed reject
Runtime-fatal/ambiguous → no business continuation re-entry
```

必须独立测试：

```text
initialize does not start handler
activate starts once
administrative suspend aborts/discards late handler result
uncaught business exception → Frame failed when authority healthy
mutation gate closes across commit-sensitive operations
```

这条是 implementation hard invariant，不是 ergonomics choice。

---

## Renderer Data Closure

```text
DataAuthority {S,G,dataProfile}

loomrealm.renderer-data/1
= Connection1 + Input1 + Render1
```

Profile改变必须 fresh generation。

```text
Main authority
→ DataConnectionBroker
→ RendererDataBinding + SubsystemDataBinding
```

Desktop late provisioning走 Runner IPC；PWA走 Worker provisioning/Port transfer。

```text
provisioning failure != Runtime failure / Frame unwind
Data loss != RuntimeHosting failure
```

---

## Unified Message Unit

Current message-oriented profiles统一：

```text
MessageCarrier
one carrier unit = one UTF-8 JSON text string
```

Foundation把 string当 opaque；Profile/wire负责 JSON semantics。

```text
WebSocket   text message
MessagePort postMessage(string)
Memory      string
```

Structured Clone只用于 Platform bootstrap/Port transfer。

---

## User Input / Render

Input：

```text
Effective(F,A,C)
= Data × Main InputTarget × current Activation × Interest[F] × Producer
```

fresh Activation可复用 Interest config但不复用 old State/Event；fresh Data remote registry/state empty。

Render：

```text
Domain Registry / Snapshot / Patch / Event
```

fresh carrier重新 Registry + Snapshot baseline；Frame/Input Interest/Render/Data carrier各自保持独立 lifecycle。

---

## Phase 1 验收方向

必须证明三条闭环：

```text
Game logical topology
→ Platform manifest
→ exact join / zero-side-effect preflight
→ PlatformLaunchPlan
→ RuntimeHosting
→ Runner
```

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

最终 Hostra/PWA使用：

```text
same Game logical topology
same logical scenario/input
same formal contracts
platform-specific executable bindings/artifacts as needed
```

并得到等价 Runtime/Frame/Input/Render/Content/business结果。
