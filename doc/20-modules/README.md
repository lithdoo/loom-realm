# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：各系统的内部模块拆分和详细设计入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-04

模块层说明各系统当前准备如何拆解。模块可以重构、合并或替换，但不能改变上层系统职责和正式契约。

## 模块目录

| 系统 | 模块入口 | 说明 |
|---|---|---|
| 程序主系统 | [main-system](./main-system/README.md) | Runtime/Frame Registry、Supervisor、Activation、Frame Transaction Coordinator、Control/Data Grant |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main committed Control mirror、System Connection、Render Store、Frame Input |
| Game Package | [game-package](./game-package/README.md) | Manifest/Entry/Descriptor Loader、Launcher Entry Validator、Catalog、Repository |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | Desktop/PWA 统一只读 Content API |
| `loom.map` | [loom-map](./loom-map/README.md) | Subsystem/Frame Adapter、Mutation Gate、Frame Input、Runtime、Render Manager/Projector |
| Desktop Host | [desktop-host](./desktop-host/README.md) | Hostra Window、WebSocket/HTTP、Node Launcher / Process Supervisor |
| PWA Host | [pwa-host](./pwa-host/README.md) | Main/Subsystem Worker、Control/Data MessagePort、Service Worker、OPFS |

## 已冻结模块前提

```text
Game Package v2 / Desktop Launcher v1   Frozen
Subsystem Control v1                    Frozen
Frame / Call Batch A                    Frozen
Frame / Call Batch B                    Frozen
Frame / Call Batch C                    Frozen
Frame / Call Batch D-F                  Draft
```

Frame 模块必须统一使用 Main-owned `frameId / subsystemKey / callerFrameId / lifecycle / Stack / Activation / InputTarget`，并保持 outcome 与 lifecycle 分离。

## Batch B Adapter

公共 Frame adapter 只有：

```text
frame.initialize
frame.activate
frame.suspend
frame.resume
frame.close
frame.call
frame.return
```

Caller 不进入 Subsystem wire；close 无 reason；resume 同时 outcome + replacement Activation；call 非 long-running result RPC；无 `system.call/system.return/frame.result`。

## Batch C Module Responsibilities

### Main

必须有单一 Stack mutation coordinator：

- Call Acceptance Commit；
- Return Acceptance Commit；
- close ACK → pop barrier；
- activate/resume ACK → InputTarget publish barrier；
- pre-commit abort / post-commit forward recovery；
- Response-before-dependent-reverse-RPC ordering。

### Subsystem SDK

outbound call/return pending 必须建立 mutation gate，停止新的 ordinary input dispatch；call success 本地 commit Caller suspended/revoked；return success 本地 commit Child closing/revoked。

ordinary call 不等待 `frame.suspend`；SDK 不应要求 nested request-handler reentrancy。

### Renderer

只镜像 Main 已 commit control state。必须接受 `InputTarget=null` transaction gap；不得在 activate/resume ACK 前获得新 Activation，也不得 revive revoked Activation。

## Runtime / Frame / Render

```text
Runtime Container
    Subsystem business state / Control/Data / Render Registry

Frame
    Main-owned call/input Context + transaction state

Render
    Subsystem-owned independent presentation Context
```

平台不要求 per-Frame Runtime Core、business state、Execution Loop、Projector 或 Render ownership。

## Cross-platform Hosting

Desktop WebSocket 与 PWA MessagePort 都只能映射 Frozen application semantics。Transport MUST NOT：

- 把 ordinary call 改回 reverse `frame.suspend` chain；
- 在 call/return Response 前依赖反向 Frame RPC；
- 在 activate/resume ACK 前发布新 Activation；
- post-commit 恢复旧 Activation；
- 要求 same-Subsystem recursion 的 nested handler reentrancy。

## 依赖规则

- Main 不依赖具体地图 DTO；
- Renderer 不读 package physical path；
- Game Package Loader 不产生 Runtime side effect；
- Hostra 不承载 Main/business Runtime；
- Subsystem SDK 不强制 per-Frame Process/Worker/Transport；
- Frame protocol 不拥有 Render；
- Caller relationship 不能在 Subsystem 侧成为第二份 authority；
- User Input / Render Update 不经过 Main/Hostra business forwarding；
- Legacy 文档不能覆盖当前 Contract。

## 迁移说明

旧资料中 `system.call`、Frame ready、failed lifecycle、Activation reuse、Frame-owned Render、call→reverse-suspend dependency、return-success=caller-resumed 等结论不得继续作为实现入口。
