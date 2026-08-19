# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：各系统内部模块拆分、role-facing platform ports 与 Desktop/PWA realization 入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)  
> 实施分包：[独立分包与发布架构](../30-implementation/package-architecture.md)  
> 最近复核：2026-08-19

模块层描述**运行职责/拓扑**，不是 npm package 清单。

```text
module boundary != npm package boundary != protocol boundary != platform boundary
```

## 模块目录

| 系统/模块 | 模块入口 | 说明 |
|---|---|---|
| 程序主系统 | [main-system](./main-system/README.md) | Runtime/Frame Registry、Transaction/Error/Failure-Unwind、Renderer/Data authority；消费 Main-facing Platform ports |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Renderer Control mirror、Data Connection、Frame-scoped User Input、Render Store/presentation；消费 Renderer-facing Platform ports |
| Game Package | [game-package](./game-package/README.md) | Manifest/Entry/Descriptor Loader、Launcher Entry Validator、Catalog、Repository |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | Desktop/PWA 统一只读 Content API 语义与服务实现 |
| `loom.map` | [loom-map](./loom-map/README.md) | 普通 Subsystem business consumer；通过 `@loomrealm/subsystem` 使用 Runtime/Frame/Input/Render/Content capability |
| Hostra Desktop Composition | [desktop-host](./desktop-host/README.md) | 实现系统级 Platform Composition：Process、Hostra Window、WebSocket、HTTP/filesystem 与 Data broker |
| PWA Composition | [pwa-host](./pwa-host/README.md) | 实现系统级 Platform Composition：Worker、MessagePort/MessageChannel、Service Worker/OPFS |

`desktop-host` / `pwa-host` 是**同一个 Platform Composition Architecture 的两个 realization**，不是两套 application model，也不要求对应两个大而全 npm package。

---

## Role 与 Platform 的关系

```text
Platform Composition
├── Main-facing ports
├── Renderer-facing ports
├── Subsystem-facing ports
└── Content-facing ports
        ↓
platform-neutral role implementations
        ↓
business modules
```

Main/Renderer/Subsystem 模块不得直接把 `WebSocket`、`MessagePort`、`child_process`、`Worker` 当作核心架构依赖。

role module 可以定义自己消费的 local binding interface，但该 interface 只是系统 Platform 的投影。

---

## Runtime / Frame / Data / Render

```text
Runtime Container
    Subsystem business state + Runtime role

Frame
    Main-owned call/input Context + transaction/recovery authority

User Input Interest
    Subsystem-owned Frame-scoped configuration

Render Domain
    Subsystem-owned independent presentation state

Data Connection
    Session/current Renderer/subsystem/generation physical carrier authority
```

必须保持：

```text
Frame lifecycle != Runtime lifecycle
Frame lifecycle != Data lifecycle
Frame lifecycle != Render lifecycle
Activation lifetime != Input Interest lifetime
carrier lifetime != capability lifetime
```

---

## Runtime Control

```text
Subsystem Control v1
    Runtime identity / lifecycle / shutdown

Frame / Call v1
    Frame transaction / outcome / recovery

Runtime Control Application Profile v1
    shared Control carrier / Request ID namespace / no Batch / version binding
```

实现层可以由单一 `@loomrealm/runtime-control` package 提供，但三个协议/version space 独立。

`ready` 不携 Renderer Data endpoint；actual carrier establishment 属于 Platform Composition。

---

## Renderer / Data / Input / Render

```text
Renderer Control
    Main committed authority mirror

Data Connection
    Session/current Renderer/subsystem/generation

User Input
    Main InputTarget/Activation
    ∩ Frame Interest Registry
    ∩ Producer availability

Render Update
    Subsystem → Renderer
    Registry + Snapshot + Patch + Event
```

User Input Interest 是 `Interest[F]`，不是 Runtime-global Interest。Renderer 不解释 push/pop/call/return，只组合 current committed authority、Interest Registry、Producer availability。

这些 domains 可以在 package 层共享基础设施，但不得共享 authority/lifecycle/recovery 语义。

---

## Business Portability

业务 Subsystem 应只依赖 platform-neutral author SDK：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

Hostra Desktop 与 PWA composition 可以运行同一份 business definition；平台差异只存在于 composition/adapter/bootstrap。

业务模块不得出现：

```text
if desktop → WebSocket
if pwa     → MessagePort
```

---

## Package / Adapter 映射

模块实现默认从以下能力组合：

```text
role packages
    @loomrealm/main
    @loomrealm/subsystem
    @loomrealm/renderer
    @loomrealm/content-service

technical adapters
    @loomrealm/launcher-node
    @loomrealm/transport-websocket
    @loomrealm/transport-messageport
    @loomrealm/content-fs
    @loomrealm/content-http
    @loomrealm/content-service-worker

composition roots
    apps/desktop
    apps/pwa
```

是否未来抽取 `platform-*` helper package 按真实复用需求决定；Platform Architecture 本身不等于 package boundary。

---

## Cross-platform Hosting Rules

Platform/Adapter MUST NOT：

```text
改变 Control v1 lifecycle
改变 Frame transaction/commit ordering
在 Frame timeout 后 retry/replay
自行选择 unwind root
使用 Structured Clone 扩大协议类型
把 Runtime ready 解释成 Data endpoint discovery
从 endpoint/Port 推导 DataAuthority
用 Data reconnect修复 Frame failure
从 Render Domain推导 InputTarget
```

Hostra/PWA 对相同 abstract application trace 必须保持 Runtime/Frame/Input/Render/Content 逻辑结果等价。

---

## Conformance

正式兼容判断使用各协议自己的 conformance fixtures；模块/包只有通过适用 executable fixtures 后才能声明对应角色兼容。

系统级还应验证 Platform Composition semantic equivalence：Process/Worker、WebSocket/MessagePort、HTTP/Service Worker 可以不同，但 application outcome 必须相同。
