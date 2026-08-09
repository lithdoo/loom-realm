# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、依赖、测试和第一阶段交付入口  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-09

实施层描述当前仓库准备如何落地。包名、目录和交付顺序可以调整，但必须遵守上层架构和正式契约。

## 当前 Tracking 文档

- [仓库与分包方案](./repository-layout.md)；
- [测试策略](./testing-strategy.md)；
- [第一阶段交付计划](./phase-1-delivery-plan.md)。

旧 [第一阶段设计待办](../roadmap/phase-1-design-todos.md) 已 Legacy / Superseded。

## 当前实施前提

第一阶段当前实现入口：

```text
Game Package v2
Desktop Node.js Launcher Profile v1
Subsystem Control Protocol v2
Runtime Control Application Profile v2
Frame / Call Protocol v1
Renderer Control v1
Data Connection v1
User Input v1 Core
Render Update v1 incremental closure candidate
Content API v1
```

明确不实现：

```text
Subsystem Control v1
Runtime Control Application Profile v1
```

两者均已 `Abandoned Before Implementation`，不存在 fallback/dual-stack要求。

## Runtime Control

```text
Runtime Control Application Profile v2
    = Subsystem Control v2 + Frame / Call v1
```

Profile v2约束：

```text
Control hello selects version 2
Frame version statically bound to 1
hello before Frame operation
shared sender/Connection Request-ID namespace
one JSON-RPC message per transport unit
no JSON-RPC Batch
ready has no Data endpoint
```

Launcher Profile v1的版本与 Bootstrap Context `version:1`不等于 Control protocol version。

## Frame v1 可直接实现

### Authority / Transaction

```text
Main-owned identity/lifecycle/Stack/Activation/InputTarget
exact seven RPC
Response-before-dependent-RPC
ACK-before-publication
post-commit no rollback
```

### Error / Recovery

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure

failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix Top→Bottom
→ fixed-point expansion
→ accepted outcome or SUBSYSTEM_RUNTIME_FAILED
→ fresh final Caller resume or empty Stack
```

### Completion

```text
plain JSON application model
no JSON-RPC Batch
Request ID positive safe integer / sender Connection lifetime no reuse
message <=1 MiB / depth <=64 / business JsonValue <=512 KiB
Desktop actual WebSocket text bytes also <=1 MiB
frameId/activationId <=128 UTF-8 bytes
targetSubsystemKey <=256 UTF-8 bytes
Frame deadlines 1000..300000ms monotonic
Desktop WebSocket / PWA MessagePort same Frame application semantics
no Frame hello/version downgrade
```

## Renderer / Data / Input / Render

### Renderer Control

Main发布 full committed Authority Snapshot：Runtime、Frame Stack、Activation、InputTarget、logical DataAuthority。Snapshot不携 endpoint/ticket/MessagePort。

### Data Connection

```text
Renderer Control DataAuthority
→ Host/Platform carrier establishment
→ Data Connection current/retired
```

Data loss不得自动升级为 Runtime failure/Frame unwind。

### User Input

Core实现 `InputTarget/Activation ∩ Interest ∩ Producer availability`，State fresh-baseline、Event transient、Reset/implicit teardown。

### Render Update

当前实现目标按 incremental closure candidate：

```text
Registry
Snapshot(revision)
Patch(R→R+1, insert/remove/move/update)
Event
```

不是旧 Snapshot-only假设。

## Conformance 实施状态

[测试策略](./testing-strategy.md) 当前覆盖 Control v2、Runtime Profile v2、Frame v1、Renderer Control、Data Connection、User Input、Render Update与Content。

Frame正式兼容判断仍使用 [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)。

在 executable fixtures实际通过之前，只能说协议/Profile已经完成相应设计状态，不能声称具体实现 conformant。

## 实施原则

1. Current Contract先写 conformance fixture，再写/接入两端实现；
2. 不为未实现的 Control v1保留 fallback/compat代码；
3. Launcher / Control / Frame / Renderer Control / Data / Input / Render / Content能力边界不得因代码便利重新合并；
4. Runtime `ready`不得成为 Data endpoint discovery；
5. Runtime Control Profile只组合 Control v2 + Frame v1，不引入 Data methods；
6. Main RuntimeFailureUnwindCoordinator是唯一 Stack recovery authority；
7. Renderer/Transport不得计算 unwind root或修改 Frame recovery；
8. Desktop/PWA共享应用层协议语义；平台差异只留在 Host/Bootstrap binding；
9. 实施发现协议问题时先更新正式 Contract/ADR，不通过私有 wire扩展绕过；
10. 路线图只追踪工作，不定义正式行为。

## 当前实施顺序

```text
Game Package v2 / Desktop Launcher v1
    ↓
Subsystem Control v2
    ↓
Runtime Control Application Profile v2
    ↓
Frame / Call v1 + executable conformance
    ↓
Main ⇄ Renderer Control closure
    ↓
Renderer ⇄ Subsystem Data Connection + Host bindings
    ↓
User Input Core + Standard Input Mapping
    ↓
Render Update limits/conformance + official merge
    ↓
Renderer Component Profile
    ↓
Content Access Profile
```

当前最重要的治理原则：**只实现当前主线，不为从未实现的历史协议制造兼容成本。**
