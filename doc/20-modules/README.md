# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：各系统的内部模块拆分和详细设计入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-09

模块层可以重构，但不能改变上层系统职责和正式契约。

## 模块目录

| 系统 | 模块入口 | 说明 |
|---|---|---|
| 程序主系统 | [main-system](./main-system/README.md) | Runtime/Frame Registry、Transaction/Error/Failure-Unwind、Renderer Control/DataAuthority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main committed Control mirror、Data Connection、User Input、Render Store/Component |
| Game Package | [game-package](./game-package/README.md) | Manifest/Entry/Descriptor Loader、Launcher Entry Validator、Catalog、Repository |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | Desktop/PWA统一只读 Content API |
| `loom.map` | [loom-map](./loom-map/README.md) | Control v1、Frame Adapter、Input、Runtime、Render Manager/Projector |
| Desktop Host | [desktop-host](./desktop-host/README.md) | Hostra Window、Node Launcher、Control WebSocket、Renderer/Data platform binding |
| PWA Host | [pwa-host](./pwa-host/README.md) | Main/Subsystem Worker、Control/Data MessagePort binding、Service Worker、OPFS |

## 当前模块前提

```text
Game Package v1 / Desktop Launcher v1        current bootstrap baseline
Subsystem Control v1                         Stabilizing
Runtime Control Profile v1                   Control v1 + Frame v1
Frame / Call Protocol v1                     Active / Normative / Frozen
Renderer Control / Data Connection / Input   current Draft stack
Render Update incremental design             Closure Candidate
```

## Runtime Control 模块职责

```text
Subsystem Control v1
    Runtime identity / lifecycle / shutdown

Frame / Call v1
    Frame transaction / outcome / recovery
```

Runtime Control Application Profile v1约束 shared Control carrier、Request ID namespace、no Batch和 version binding。

`ready`不携 Renderer Data endpoint；DataAuthority与实际 Data carrier通过 Renderer Control + Host/Platform Binding独立建立。

## Frame 模块职责

Main拥有 Frame identity/lifecycle/Stack/Activation/InputTarget；wire exactly seven RPC；Caller不进 wire；outcome与 lifecycle分离。

Main单一 Stack mutation coordinator；Subsystem SDK有 outbound mutation gate；ordinary call无 reverse-suspend；Response-before-dependent-RPC；ACK-before-publication；post-commit no rollback。

Runtime failure：failed set → lowest root → whole suffix Top→Bottom → failed logical retire / healthy close → fixed-point expansion → accepted outcome或 `SUBSYSTEM_RUNTIME_FAILED` → fresh final Caller resume或 empty Stack。

Completion：

```text
plain JSON-only Frame values
no JSON-RPC Batch
Request ID positive safe integer / sender-side lifetime no reuse
1 MiB message / depth 64 / 512 KiB business value
identity/failure field limits
1s..5min sender-local monotonic deadlines
Desktop WebSocket / PWA MessagePort same application semantics
no Frame handshake/downgrade
```

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

这些域可以共享物理 carrier，但不共享 authority/lifecycle/recovery。

## Conformance

正式兼容判断使用各协议自己的 conformance fixtures。Frame入口为 [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)。

协议完成不等于实现 conformant；模块只有通过适用 executable fixture后才能声明对应角色兼容。

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

Transport MUST NOT：

```text
改变 Control v1 lifecycle
改回 reverse-suspend
在 Response前依赖 dependent reverse RPC
ACK前发布 Activation
Frame timeout后 retry/replay
自行选择 unwind root
使用 Structured Clone扩大协议类型
把 Runtime ready解释成 Data endpoint discovery
用 Data/Renderer reconnect修复 Frame failure
```

## 依赖规则

Main不依赖具体地图 DTO；Renderer不读物理 package path；Hostra/PWA Host不承载 Main authority；Subsystem SDK不强制 per-Frame Process/Transport；Frame protocol不拥有 Render；Git历史/旧 ADR不能覆盖当前 Contract。
