# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、Runner/Platform ports、Data Profile/provisioning、测试和第一阶段交付入口  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-19

实施层只落地当前 architecture/contracts，不反向创造 authority/lifecycle/recovery 语义。

---

## Tracking 文档

- [独立分包与发布架构](./package-architecture.md) — package/publish boundary 主要事实源；
- [仓库与目录方案](./repository-layout.md) — monorepo、author/host surface、Runner/provisioning placement；
- [测试策略](./testing-strategy.md) — protocol、SDK control-flow、Runner/provisioning、跨平台 equivalence；
- [第一阶段交付计划](./phase-1-delivery-plan.md) — vertical slice 实施顺序。

---

## 当前实施前提

```text
Game Package v1
    {key,module}

Desktop Node Runner Profile v1
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

当前不建立第二套 Desktop/PWA application protocol；Platform provisioning保持 implementation boundary。

---

## Platform / Runner Baseline

```text
Main / Renderer / Subsystem / Content
    = platform-neutral roles

Platform Composition
    = complete physical Session realization

Subsystem Definition Module
    = platform-neutral business artifact

Host-owned Runner
    = physical Runtime entry + role-port adapter
```

```text
Hostra
    Node Runner + WebSocket + provisioning IPC

PWA
    Worker Runner + MessagePort + provisioning path
```

同一 Definition Module跨平台运行。

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

technical adapters
    launcher-node
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
    launch integration
```

Business package不得依赖 `/host`。

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
```

---

## Unified Message Unit

Current message-oriented profiles统一：

```text
MessageCarrier<string>
one carrier unit = one UTF-8 JSON text string
```

Foundation把 string当 opaque；Profile/wire负责 JSON semantics。

---

## User Input / Render

Input：

```text
Effective(F,A,C)
= Data × Main InputTarget × current Activation × Interest[F] × Producer
```

Render：

```text
Domain Registry / Snapshot / Patch / Event
```

Frame/Input Interest/Render/Data carrier各自保持独立 lifecycle。

---

## Phase 1 验收方向

必须证明两条闭环：

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

最终 Hostra/PWA使用完全相同 Game Package + Definition Module + logical scenario，并得到等价 Runtime/Frame/Input/Render/Content结果。
