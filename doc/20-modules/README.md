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
| 程序主系统 | [main-system](./main-system/README.md) | Runtime/Frame Registry、Supervisor、Frame Transaction/Error Coordinator、Activation、Control/Data Grant |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main committed Control mirror、System Connection、Render Store、Frame Input |
| Game Package | [game-package](./game-package/README.md) | Manifest/Entry/Descriptor Loader、Launcher Entry Validator、Catalog、Repository |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | Desktop/PWA 统一只读 Content API |
| `loom.map` | [loom-map](./loom-map/README.md) | Frame Adapter、Mutation Gate/Deadline Handler、Frame Input、Runtime、Render Manager |
| Desktop Host | [desktop-host](./desktop-host/README.md) | Hostra Window、WebSocket/HTTP、Node Launcher / Process Supervisor |
| PWA Host | [pwa-host](./pwa-host/README.md) | Main/Subsystem Worker、Control/Data MessagePort、Service Worker、OPFS |

## 已冻结模块前提

```text
Game Package v2 / Desktop Launcher v1   Frozen
Subsystem Control v1                    Frozen
Frame / Call Batch A                    Frozen
Frame / Call Batch B                    Frozen
Frame / Call Batch C                    Frozen
Frame / Call Batch D                    Frozen
Frame / Call Batch E/F                  Draft
```

Frame 模块统一使用 Main-owned identity/lifecycle/Stack/Activation/InputTarget，并保持 outcome 与 lifecycle 分离。

## Batch B Adapter

公共 Frame adapter只有 initialize/activate/suspend/resume/close/call/return。Caller不进入 Subsystem wire；close无 reason；resume=outcome+replacement Activation；call非 long-running result RPC；无 `system.call/system.return/frame.result/frame.cancel`。

## Batch C Module Responsibilities

Main有单一 Stack mutation coordinator；Subsystem SDK有 outbound mutation gate；Renderer只镜像 committed state。ordinary call no reverse-suspend；call/return Response precedes dependent reverse RPC；activate/resume ACK precedes publication；post-commit no rollback。

## Batch D Module Responsibilities

### Main

实现 finite Frame RPC deadline、Success/Explicit Error/Ambiguous classifier、recoverable semantic error、control divergence/protocol failure classifier。ambiguous timeout不 retry，相关 Runtime进入 failure path。

### Subsystem SDK

call/return pending gate在 recoverable Explicit Error时可释放；timeout/loss时不得释放回旧 Activation，必须停止正常 Frame处理并进入 Runtime failure。SDK不实现 operation replay/idempotency journal。

### Renderer

不参与 Frame timeout/retry；只接受 Main最终 committed Runtime/Frame failure状态，不通过 reload/Data resync恢复 Frame authority。

### Host adapters

Desktop WebSocket / PWA MessagePort选择 finite deadline policy，但不能改变 ambiguous-no-retry semantics。

## Runtime / Frame / Render

```text
Runtime Container
    Subsystem business state / Control/Data / Render Registry

Frame
    Main-owned call/input Context + transaction/error authority

Render
    Subsystem-owned independent presentation Context
```

## Cross-platform Hosting

Transport MUST NOT：改回 reverse-suspend chain；在 call/return Response前依赖反向 RPC；ACK前发布 Activation；post-commit恢复旧 Activation；timeout后 application retry/replay；用 Renderer reconnect修复 Frame Control divergence。

## 依赖规则

Main不依赖具体地图 DTO；Renderer不读物理 package path；Hostra不承载 Main；Subsystem SDK不强制 per-Frame Process/Transport；Frame protocol不拥有 Render；Caller不能成为 Subsystem-side authority；Legacy文档不能覆盖当前 Contract。

## 迁移说明

旧资料中 `system.call`、Frame ready、failed lifecycle、Activation reuse、Frame-owned Render、call→reverse-suspend、return-success=caller-resumed、timeout→retry、Frame state resync、caller remote cancel 等结论不得继续作为实现入口。
