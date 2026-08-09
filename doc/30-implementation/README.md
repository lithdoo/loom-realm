# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、依赖、测试和第一阶段交付入口  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-09

实施层描述当前仓库准备如何落地。包名、目录和交付顺序可以调整，但必须遵守上层架构和正式契约。

## 当前 Tracking 文档

- [仓库与分包方案](./repository-layout.md)
- [测试策略](./testing-strategy.md)
- [第一阶段交付计划](./phase-1-delivery-plan.md)

## 当前实施前提

```text
Game Package v1
Desktop Node.js Launcher Profile v1
Subsystem Control Protocol v1
Runtime Control Application Profile v1
Frame / Call Protocol v1
Renderer Control v1
Data Connection v1
User Input v1 Core
Render Update v1 incremental closure candidate
Content API v1
```

历史 pre-implementation 协议正文已从当前文档树移除；实现不需要 fallback/dual-stack。

## Runtime Control

```text
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1
```

Profile约束：

```text
Control hello selects version 1
Frame version statically bound to 1
hello before Frame operation
shared sender/Connection Request-ID namespace
one JSON-RPC message per transport unit
no JSON-RPC Batch
ready has no Data endpoint
```

Launcher Profile v1、Bootstrap Context v1、Control v1、Frame v1是独立版本空间，当前恰好均为1。

## Frame v1 可直接实现

```text
Main-owned identity/lifecycle/Stack/Activation/InputTarget
exact seven RPC
Response-before-dependent-RPC
ACK-before-publication
post-commit no rollback
```

Error/recovery：

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

Completion：

```text
plain JSON application model
no JSON-RPC Batch
Request ID positive safe integer / sender Connection lifetime no reuse
message <=1 MiB / depth <=64 / business JsonValue <=512 KiB
Desktop actual WebSocket text bytes <=1 MiB
frameId/activationId <=128 UTF-8 bytes
targetSubsystemKey <=256 UTF-8 bytes
Frame deadlines 1000..300000ms monotonic
Desktop WebSocket / PWA MessagePort same Frame application semantics
no Frame hello/version downgrade
```

## Renderer / Data / Input / Render

Renderer Control：Main发布 full committed Authority Snapshot，不携 endpoint/ticket/MessagePort。

Data Connection：

```text
Renderer Control DataAuthority
→ Host/Platform carrier establishment
→ Data Connection current/retired
```

Data loss不自动升级为 Runtime failure/Frame unwind。

User Input：`InputTarget/Activation ∩ Interest ∩ Producer availability`，State fresh-baseline、Event transient、Reset/implicit teardown。

Render Update当前实现目标：

```text
Registry
Snapshot(revision)
Patch(R→R+1, insert/remove/move/update)
Event
```

## Conformance 实施状态

[测试策略](./testing-strategy.md) 覆盖 Control v1、Runtime Profile v1、Frame v1、Renderer Control、Data Connection、User Input、Render Update与Content。

Frame正式兼容判断使用 [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)。

在 executable fixtures实际通过之前，只能说协议/Profile达到相应设计状态，不能声称具体实现 conformant。

## 实施原则

1. Current Contract先写 conformance fixture，再写/接入两端实现；
2. 不为从未实现的历史协议保留 fallback/compat code；
3. Launcher / Control / Frame / Renderer Control / Data / Input / Render / Content边界不得因代码便利重新合并；
4. Runtime `ready`不得成为 Data endpoint discovery；
5. Runtime Control Profile只组合 Control v1 + Frame v1，不引入 Data methods；
6. Main RuntimeFailureUnwindCoordinator是唯一 Stack recovery authority；
7. Renderer/Transport不得计算 unwind root或修改 Frame recovery；
8. Desktop/PWA共享 application semantics；平台差异只留 Host/Bootstrap binding；
9. 实施发现协议问题时先更新 Contract/ADR，不用私有 wire扩展绕过；
10. Tracking文档不定义正式行为。

## 当前实施顺序

```text
Game Package v1 / Desktop Launcher v1
    ↓
Subsystem Control v1
    ↓
Runtime Control Application Profile v1
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

当前治理原则：**只实现当前 first-version contracts，不为从未实现的历史设计制造兼容成本。**
