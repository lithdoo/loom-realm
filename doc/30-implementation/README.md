# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、Game/Platform launch planning、Runner/Platform ports、Data provisioning、测试和第一阶段交付入口  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-20

实施层只落地当前 architecture/contracts，不反向创造 authority/lifecycle/recovery 语义。

---

## Tracking 文档

- [独立分包与发布架构](./package-architecture.md)
- [仓库与目录方案](./repository-layout.md)
- [测试策略](./testing-strategy.md)
- [第一阶段交付计划](./phase-1-delivery-plan.md)

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

---

## Launch Baseline

```text
Game Entry
    logical topology only
        +
current Platform Launch Manifest
        ↓
exact key-set join
all executable resolution
hosting capability preflight
        ↓
immutable PlatformLaunchPlan
        ↓
Main launch(subsystemKey)
        ↓
plan-bound RuntimeHosting
        ↓
Host-owned Runner
```

Game common manifest不包含 module；Main不携 executable material。

---

## Packages

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
    transport-websocket/messageport
    content-fs/http/service-worker

business
    @loomrealm/map

composition roots
    apps/desktop
    apps/pwa
    apps/cli
```

Launcher packages是窄 Runtime launch capability，不是 platform mega-package。

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

两个 platform manifest各自拥有 schema/version/policy；不要建立共享 `launcher.options:any`。

Phase 1要求 current Platform bindings严格覆盖 Game key set。

---

## Role-facing Ports / SDK

Subsystem author/host split、FrameOutcome control-flow、RendererDataBinding/SubsystemDataBinding、DataConnectionBroker authority边界保持原设计。

Runtime-fatal/ambiguous仍不得重新进入 business continuation。

---

## Phase 1 验收方向

必须证明：

```text
Game logical topology
→ Platform manifest
→ preflight plan
→ RuntimeHosting
→ Runner
→ Role Ports
→ Role Core
→ Business Definition
```

以及：

```text
Formal protocol outcome/failure
→ SDK control-flow
→ business-observable behavior
```

最终 Hostra/PWA使用相同 Game logical topology和 logical scenario，可以使用不同 platform Definition artifact，并得到等价 Runtime/Frame/Input/Render/Content/business结果。
