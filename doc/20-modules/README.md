# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：各系统的内部模块拆分和详细设计入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)  
> 实施分包：[独立分包与发布架构](../30-implementation/package-architecture.md)  
> 最近复核：2026-08-17

模块层描述**运行职责/拓扑**，不是 npm package 清单。一个模块可能由多个 capability/adapter package 组合；多个紧密相关协议也可能由同一个 package 实现。

```text
module boundary != npm package boundary != protocol boundary
```

## 模块目录

| 系统/模块 | 模块入口 | 说明 |
|---|---|---|
| 程序主系统 | [main-system](./main-system/README.md) | Runtime/Frame Registry、Transaction/Error/Failure-Unwind、Renderer Control/DataAuthority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main committed Control mirror、Data Connection、User Input、Render Store/presentation |
| Game Package | [game-package](./game-package/README.md) | Manifest/Entry/Descriptor Loader、Launcher Entry Validator、Catalog、Repository |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | Desktop/PWA 统一只读 Content API 语义与服务实现 |
| `loom.map` | [loom-map](./loom-map/README.md) | Control v1、Frame Adapter、Input、Runtime、Render Manager/Projector |
| Desktop Composition | [desktop-host](./desktop-host/README.md) | Hostra Window、Node Launcher、WebSocket/HTTP adapters 与 Desktop composition root |
| PWA Composition | [pwa-host](./pwa-host/README.md) | Main/Subsystem Worker、MessagePort、Service Worker/OPFS 与 PWA composition root |

`desktop-host` / `pwa-host` 是文档中的拓扑名称，不要求对应 `@loomrealm/host-desktop` / `@loomrealm/host-pwa` 公共包。

## 当前模块前提

```text
Game Package v1 / Desktop Launcher v1        current bootstrap baseline
Subsystem Control v1                         Stabilizing
Runtime Control Profile v1                   Control v1 + Frame v1
Frame / Call Protocol v1                     Active / Normative / Frozen
Renderer Control / Data Connection / Input   current stack
Render Update v1                             Closure Candidate
```

## Runtime Control 模块职责

```text
Subsystem Control v1
    Runtime identity / lifecycle / shutdown

Frame / Call v1
    Frame transaction / outcome / recovery
```

Runtime Control Application Profile v1 约束 shared Control carrier、Request ID namespace、no Batch 和 version binding。

实现层可以由单一 `@loomrealm/runtime-control` package 提供，但三个协议/version space 仍然独立。

`ready` 不携 Renderer Data endpoint；DataAuthority 与实际 Data carrier 通过 Renderer Control + technical adapter 独立建立。

## Frame 模块职责

Main 拥有 Frame identity/lifecycle/Stack/Activation/InputTarget；wire exactly seven RPC；Caller 不进 wire；outcome 与 lifecycle 分离。

Main 单一 Stack mutation coordinator；Subsystem SDK 有 outbound mutation gate；ordinary call 无 reverse-suspend；Response-before-dependent-RPC；ACK-before-publication；post-commit no rollback。

Runtime failure：failed set → lowest root → whole suffix Top→Bottom → failed logical retire / healthy close → fixed-point expansion → accepted outcome 或 `SUBSYSTEM_RUNTIME_FAILED` → fresh final Caller resume 或 empty Stack。

## Renderer / Data / Input / Render

```text
Renderer Control
    Main committed authority mirror

Data Connection
    Session/current Renderer/subsystem/generation carrier identity

User Input
    InputTarget/Activation ∩ Interest ∩ Producer availability

Render Update
    Subsystem → Renderer
    Registry + Snapshot + Patch + Event
```

这些 domain 可以在 package 层合并基础设施，例如 Data Connection/User Input/Render Update 由 `@loomrealm/data` 提供，但不得共享 authority/lifecycle/recovery 语义。

## Package / Adapter 映射

模块实现默认从以下能力组合：

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/content-service

@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/transport-messageport
@loomrealm/content-fs
@loomrealm/content-http
@loomrealm/content-service-worker
```

Desktop/PWA 差异通过 adapter + composition root 表达，而不是把所有平台能力收进一个 Host package。

## Conformance

正式兼容判断使用各协议自己的 conformance fixtures。Frame 入口为 [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)。

协议完成不等于实现 conformant；模块/包只有通过适用 executable fixture 后才能声明对应角色兼容。

## Runtime / Frame / Render

```text
Runtime Container
    lifecycle + Subsystem business state

Frame
    Main-owned call/input Context + transaction/error/recovery authority

Render Domain
    Subsystem-owned independent presentation state
```

## Cross-platform Hosting

Transport/Adapter MUST NOT：

```text
改变 Control v1 lifecycle
改回 reverse-suspend
在 Response 前依赖 dependent reverse RPC
ACK 前发布 Activation
Frame timeout 后 retry/replay
自行选择 unwind root
使用 Structured Clone 扩大协议类型
把 Runtime ready 解释成 Data endpoint discovery
用 Data/Renderer reconnect 修复 Frame failure
```

## 依赖规则

Main 不依赖具体地图 DTO；Renderer 不读物理 package path；Desktop/PWA composition 不拥有 Main authority；Subsystem SDK 不强制 per-Frame Process/Transport；Frame protocol 不拥有 Render；Core 不反向依赖 `loom.map`；平台 adapter 不成为 application authority。

公开 package 的具体依赖方向以 [独立分包与发布架构](../30-implementation/package-architecture.md) 为准。
