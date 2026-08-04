# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：各系统的内部模块拆分和详细设计入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-04

模块层可以重构，但不能改变上层系统职责和正式契约。

## 模块目录

| 系统 | 模块入口 | 说明 |
|---|---|---|
| 程序主系统 | [main-system](./main-system/README.md) | Runtime/Frame Registry、Transaction/Error/Failure-Unwind Coordinator、Activation、Control/Data Authority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Main committed Control/recovery mirror、System Connection、Render Store、Frame Input |
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
Frame / Call Batch E                    Frozen
Frame / Call Batch F                    Next
```

## Frame 模块职责

Batch A/B：Main-owned identity/lifecycle/Stack/Activation/InputTarget；exact seven RPC；Caller不进 wire；outcome与 lifecycle分离。

Batch C：Main有单一 Stack mutation coordinator；Subsystem SDK有 outbound mutation gate；ordinary call无 reverse-suspend；Response-before-dependent-RPC；ACK-before-publication；post-commit no rollback。

Batch D：finite deadline；Success/Explicit Error/Ambiguous classifier；no retry/replay；recoverable rejection与 Runtime-fatal divergence/protocol error分离；no caller-driven cancel。

Batch E：Main增加 RuntimeFailureUnwindCoordinator：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame root
→ whole suffix Top→Bottom
→ failed Runtime Frame logical retire
→ healthy descendant best-effort close
→ cleanup failure expands failed set/root
→ accepted outcome preserved
→ SUBSYSTEM_RUNTIME_FAILED when root has no outcome
→ final healthy Caller fresh-resume or Stack empty
```

Subsystem SDK/业务 Subsystem 不拥有 Stack unwind authority；Renderer只镜像 Main最终 committed recovery state；Desktop/PWA Transport不得私自实现 root选择或 recovery retry。

## Runtime / Frame / Render

```text
Runtime Container
    Subsystem business state / Control/Data / Render Registry

Frame
    Main-owned call/input Context + transaction/error/recovery authority

Render
    Subsystem-owned independent presentation Context
```

## Cross-platform Hosting

Transport MUST NOT：改回 reverse-suspend；在 call/return Response前依赖反向 RPC；ACK前发布 Activation；timeout后 application retry/replay；只清 failed Runtime最近 Frame；在 Transport层选择 unwind root；用 Renderer reconnect修复 Frame failure。

## 依赖规则

Main不依赖具体地图 DTO；Renderer不读物理 package path；Hostra不承载 Main；Subsystem SDK不强制 per-Frame Process/Transport；Frame protocol不拥有 Render；Legacy文档不能覆盖当前 Contract。

## 迁移说明

旧 `system.call`、Frame ready/failed lifecycle、Activation reuse、Frame-owned Render、call→reverse-suspend、return-success=caller-resumed、timeout→retry、Frame state resync、caller remote cancel、partial failed-runtime Frame deletion、Runtime crash覆盖 accepted outcome 等模型都不得作为实现入口。
