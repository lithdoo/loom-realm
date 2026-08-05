# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：各系统的内部模块拆分和详细设计入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-05

模块层可以重构，但不能改变上层系统职责和正式契约。

## 模块目录

| 系统 | 模块入口 | 说明 |
|---|---|---|
| 程序主系统 | [main-system](./main-system/README.md) | Runtime/Frame Registry、Transaction/Error/Failure-Unwind、Protocol Validator、Activation、Control/Data Authority |
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
Frame / Call Protocol v1                Active / Normative / Frozen
```

Frame / Call设计历史 A-F 已全部冻结，但 Batch 不再是独立 compatibility level。

## Frame 模块职责

### Identity / Wire

Main-owned identity/lifecycle/Stack/Activation/InputTarget；exact seven RPC；Caller不进 wire；outcome/lifecycle分离。

### Transaction

Main单一 Stack mutation coordinator；Subsystem SDK outbound mutation gate；ordinary call无 reverse-suspend；Response-before-dependent-RPC；ACK-before-publication；post-commit no rollback。

### Error / Runtime Failure

finite deadline；Success/Explicit Error/Ambiguous classifier；no retry/replay；recoverable rejection vs Runtime-fatal divergence/protocol error。

Main RuntimeFailureUnwindCoordinator：failed set → lowest root → whole suffix Top→Bottom → failed logical retire / healthy close → fixed-point expansion → accepted outcome或 `SUBSYSTEM_RUNTIME_FAILED` → fresh final Caller resume或 empty Stack。

### Completion Profile

模块实现还必须遵守：

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

Subsystem SDK/业务 Subsystem不拥有 Stack unwind authority；Renderer只镜像 Main committed recovery state；Transport不得实现 root选择或 Frame retry。

## Conformance

正式兼容判断使用 [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)。

设计层已经冻结 fixture catalog，但 `packages/frame-call-protocol` 的 executable fixture实现仍属于实施工作。模块只有通过适用 fixture后才能声明对应 v1角色 conformant。

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

Transport MUST NOT：改回 reverse-suspend；在 call/return Response前依赖反向 RPC；ACK前发布 Activation；timeout后 application retry/replay；只清 failed Runtime最近 Frame；自行选择 unwind root；使用 Structured Clone扩展 Frame数据类型；放宽/改变 Frame v1 limits；用 Renderer reconnect修复 Frame failure。

## 依赖规则

Main不依赖具体地图 DTO；Renderer不读物理 package path；Hostra不承载 Main；Subsystem SDK不强制 per-Frame Process/Transport；Frame protocol不拥有 Render；Legacy文档不能覆盖当前 Contract。

## 迁移说明

旧 `system.call`、Frame ready/failed lifecycle、Activation reuse、Frame-owned Render、call→reverse-suspend、return-success=caller-resumed、timeout→retry、Frame state resync、caller remote cancel、partial failed-runtime deletion、Runtime crash覆盖 accepted outcome、Frame partial-v1 compatibility、PWA non-JSON Frame values 等模型不得作为实现入口。
