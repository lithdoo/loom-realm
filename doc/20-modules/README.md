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
| 程序主系统 | [main-system](./main-system/README.md) | Runtime/Frame Registry、Supervisor、Activation、Frame/Call Coordinator、Control/Data Grant |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main Control mirror、System Connection、Render Store、Frame Input、DOM/Canvas/WebGL |
| Game Package | [game-package](./game-package/README.md) | Manifest/Entry/Descriptor Loader、Launcher Entry Validator、Catalog、Repository |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | Desktop HTTP 与 PWA Service Worker 的统一只读 Content API |
| `loom.map` | [loom-map](./loom-map/README.md) | Subsystem/Frame Control Adapter、Frame Input、Runtime、Render Manager/Projector |
| Desktop Host | [desktop-host](./desktop-host/README.md) | Hostra Window、WebSocket/HTTP、Node Launcher / Process Supervisor |
| PWA Host | [pwa-host](./pwa-host/README.md) | Main/Subsystem Worker、Control/Data MessagePort、Service Worker、OPFS |

## 已冻结模块前提

```text
Game Package v2 / Desktop Launcher v1
    Frozen

Subsystem Control v1
    Frozen

Frame / Call v1
    Batch A Frozen
    Batch B Frozen
    Batch C-F Draft
```

Frame 模块必须统一使用：

```text
frameId
    Main-generated / Session unique / never reused

subsystemKey
    permanent Frame assignment to descriptor.key

callerFrameId
    Main-owned / immutable

Frame lifecycle
    starting / active / suspended / closing / closed

Frame outcome
    completed / cancelled / failed
    separate from lifecycle

currentActivationId
    active only
    unique / never reused / never rolls back
```

## Batch B 模块接口

Main 与 Subsystem SDK 的公共 Frame adapter 只围绕七个方法实现：

```text
frame.initialize
frame.activate
frame.suspend
frame.resume
frame.close
frame.call
frame.return
```

必须保持：

- initialize = `frameId + input`，无 callerFrameId；
- resume = `frameId + new activationId + returnedFrameId + outcome`；
- close = `frameId` only；
- call = current frame/activation + `targetSubsystemKey + input`，result=`childFrameId`；
- return = current frame/activation + outcome，无 Caller/receiver；
- `completed.value` 必填，无返回值=`null`；
- no `system.call / system.return / frame.result / frame.ready / frame.status`。

模块不得创建“更方便的兼容接口”绕过 Frozen Schema。

## Runtime Container / Frame / Render

```text
Runtime Container
    Subsystem business state
    Control/Data Connection
    Content/cache
    Render Manager / Registry

Frame
    Main-owned call/input Context
    lifecycle / caller / current Activation

Render
    Subsystem-owned independent presentation Context
```

平台不要求 per-Frame Runtime Core、business state、Execution Loop、Projector 或 Render ownership。

## Renderer 模块边界

```text
System Data Connection Registry
├── Render Registry / Store / Scheduler
└── Frame Input Registry / Input Router
```

Renderer 只镜像 Main current Frame/Activation/Input Target，不参与 Frame RPC 调用链，不创建或恢复 Activation，也不从 Stack 推导 Render lifecycle。

## Cross-platform Hosting

```text
Desktop
    Main Process
    per-Subsystem Process
    WebSocket Control/Data
    HTTP Content

PWA
    Main Worker
    per-Subsystem Worker
    MessagePort Control/Data
    Service Worker Content
```

Transport 差异不得改变 Frozen Subsystem Control 或 Frame Batch A/B 的 method/field/application semantics。

## 依赖规则

- Main 不依赖具体地图业务 DTO；
- Renderer 不读 package physical path；
- Game Package Loader 不产生 Runtime side effect；
- Hostra 不承载 Main/business Runtime；
- Subsystem SDK 不强制 per-Frame Process/Worker/Transport；
- Frame protocol 不拥有 Render；
- Caller relationship 不能在 Subsystem 侧成为第二份 authority；
- Batch B RPC 不能被 Transport adapter 私自扩字段；
- User Input / Render Update 不经过 Main/Hostra business forwarding；
- Legacy 文档不能覆盖当前 Contract。

## 迁移说明

旧目录资料只作为迁移/历史参考。与当前 Contract 冲突的 `system.call`、Frame ready、failed lifecycle、Activation reuse、Frame-owned Render 等结论必须降级为 Legacy，而不是继续作为实现入口。
