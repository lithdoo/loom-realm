# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：各系统的内部模块拆分和详细设计入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-03

模块层说明各系统当前准备如何拆解。模块可以重构、合并或替换，但不能改变上层系统职责和正式契约。

## 模块目录

| 系统 | 模块入口 | 说明 |
|---|---|---|
| 程序主系统 | [main-system](./main-system/README.md) | Descriptor/Runtime Registry、Supervisor、Frame Registry/Stack/Activation、Control 与 Data Grant |
| Web 渲染端 | [web-renderer](./web-renderer/README.md) | Main Control mirror、System Connection、Render Store、Frame Input、DOM/Canvas/WebGL |
| 游戏包与内容 | [game-package](./game-package/README.md) | Manifest/Entry/Descriptor Loader、Launcher Entry Validator、Catalog、Repository |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | Desktop HTTP 与 PWA Service Worker 的统一只读 Content API |
| 地图 Subsystem | [loom-map](./loom-map/README.md) | Subsystem/Frame Control Adapter、Frame Input、Runtime、Render Manager/Projector、兼容层 |
| Desktop Host | [desktop-host](./desktop-host/README.md) | Hostra Window Adapter、Desktop WebSocket/HTTP、Node Launcher / Process Supervisor |
| PWA Host | [pwa-host](./pwa-host/README.md) | Main/Subsystem Worker、Control/Data MessagePort、Service Worker、OPFS |

## 已冻结模块前提

模块实现现在可以直接依赖：

```text
Game Package v2 / Desktop Launcher v1
    Frozen

Subsystem Control v1
    Frozen

Frame / Call v1 Batch A
    Frozen identity / authority / lifecycle / Activation
```

Frame 模块必须统一使用：

```text
frameId
    Main-generated / Session unique / never reused

subsystemKey
    permanent Frame ownership reference to descriptor.key

callerFrameId
    immutable

Frame lifecycle
    starting / active / suspended / closing / closed

Frame outcome
    completed / cancelled / failed
    separate from lifecycle

currentActivationId
    active only
    unique / never reused / never rolls back
```

不得继续实现：

```text
Frame.status = failed
Frame ready / initialized / frame.status
Activation reuse
Frame migration
Frame close = Render/Data Connection close
```

## Runtime Container / Frame / Render

```text
Runtime Container
    Subsystem business state
    Control Connection
    System Data Connection
    Content/cache
    Render Manager / Registry

Frame
    Main-owned call/input Context
    lifecycle + caller + current Activation

Render
    Subsystem-owned independent presentation Context
```

平台不要求 per-Frame Runtime Core、business state、Execution Loop、Projector、Render Revision/Scope 或 Event Queue。

## Renderer 模块边界

Renderer：

```text
System Data Connection Registry
├── Render Registry / Store / Scheduler
└── Frame Input Registry / Input Router
```

Frame Input Registry 只能镜像 Main 的 Frame lifecycle / current Activation / Input Target。

Renderer MUST NOT：

- create frameId / activationId；
- revive stale Activation；
- use Frame Stack for Render visibility/order/lifecycle。

## Desktop Launcher 模块边界

```text
Game Package Bootstrap
→ Descriptor Registry
→ Launcher Target Resolver
→ Launch Attempt Registry
→ NodeJsSubsystemLauncher
→ Runtime Supervisor
```

约束仍保持：validated target only、Host-selected Node、no shell、Token-before-spawn、explicit environment、no automatic restart。

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

Transport 差异不得改变 Frozen Subsystem Control / Frame Batch A semantics。

## 模块文档规则

模块文档应说明：

1. 模块目标；
2. 输入/输出；
3. owned state；
4. explicitly non-owned state；
5. dependency/call direction；
6. concurrency/transaction boundary；
7. failure/cleanup；
8. implementation invariants；
9. formal contract dependencies；
10. minimum tests。

## 依赖规则

- Main 不依赖具体地图业务 DTO；
- Renderer 不读 package physical path；
- Game Package Loader 不产生 Runtime side effect；
- Hostra 不承载 Main/business Runtime；
- Subsystem SDK 不强制 per-Frame Process/Worker/Transport；
- Frame protocol 不拥有 Render；
- User Input / Render Update 不经过 Main/Hostra business forwarding；
- Legacy 文档不能覆盖当前 Contract。

## 迁移说明

仍存在的旧目录资料只作为迁移/历史参考。与当前模块设计冲突的旧结论必须降级为 Legacy，而不是继续作为实现入口。
