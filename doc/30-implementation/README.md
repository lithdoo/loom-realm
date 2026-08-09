# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、依赖、测试和第一阶段交付入口  
> 依赖：[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-09

实施层描述如何落地当前协议；内部机制可以调整，但不得改变上层 authority/lifecycle/recovery 语义。

## 当前 Tracking 文档

- [仓库与分包方案](./repository-layout.md)
- [测试策略](./testing-strategy.md)
- [第一阶段交付计划](./phase-1-delivery-plan.md)

## 当前实施前提

```text
Game Package v1
Desktop Node.js Launcher Profile v1
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1
Renderer Control v1
Data Connection v1
User Input v1
Render Update v1
Content API v1
```

没有 Renderer Component Profile、Standard Input Mapping Profile、Content Access Profile、Range Profile、Event FIFO Profile 或 Desktop/PWA Data Bootstrap application protocol。

## Runtime / Frame

```text
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1
```

关键约束：

```text
Control hello selects v1
Frame v1 statically bound
hello before Frame operation
shared sender-side Request ID namespace
one JSON-RPC message per transport unit
no JSON-RPC Batch
ready has no Data endpoint
```

Frame v1 已直接包含 suspend provenance：child-call suspension可通过对应 Child outcome + fresh `frame.resume` 恢复；administrative `frame.suspend` 没有 generic resume。

## Renderer / Data / Input / Render

Renderer Control：Main 发布 full committed Authority Snapshot，不携 endpoint/ticket/MessagePort。

Data Connection：

```text
Renderer Control DataAuthority
→ Host implementation establishes carrier
→ Data Connection current/retired
```

Host 可以自由选择 Desktop localhost WebSocket/ticket、PWA MessagePort 等建立机制，只需满足 Data Connection 的 identity/generation/current-carrier invariants。

User Input：

```text
InputTarget/Activation
∩ Interest
∩ Producer availability
```

标准 keyboard/pointer/gamepad canonical payload 最终直接补进 User Input v1；DOM/OS/device adapter 不进入协议。

Render Update唯一正式入口：

```text
Registry
Snapshot(revision)
Patch(R→R+1, insert/remove/move/update)
Event
```

`tag` 是 opaque string；Renderer 如何映射/呈现属于实现。

## Content

Content API 只定义 logical readonly HTTP/Fetch semantics。

Desktop Host 自行创建/注入/轮换 scoped bearer；PWA 使用 same-origin Service Worker authority。credential distribution 不再形成独立 Content Access Profile。

Range 若支持直接使用标准 HTTP Range；resource/concurrency/rate/timeouts 是 bounded deployment configuration。

## Conformance

[测试策略](./testing-strategy.md) 覆盖 Control、Runtime Profile、Frame、Renderer Control、Data Connection、User Input、Render Update、Content。

正式兼容判断只检查跨实现必须一致的行为，不检查：

```text
Component Factory/Registry
DOM/OS mapping implementation
Host token/ticket/Port delivery mechanism
queue concrete capacity/drop preference
Patch-vs-Snapshot heuristic
cache/index implementation
```

## 实施原则

1. Current Contract先写/补 conformance fixture，再接入两端实现；
2. 不为未实现历史设计保留 fallback/dual-stack；
3. Launcher/Control/Frame/Renderer Control/Data/Input/Render/Content边界不得因代码便利合并；
4. Runtime `ready`不得成为 Data endpoint discovery；
5. Main RuntimeFailureUnwindCoordinator是唯一 Stack recovery authority；
6. Renderer/Transport不得计算 unwind root或恢复旧 Activation；
7. Host platform binding只负责实际 carrier/credential establishment，不成为 application protocol authority；
8. bounded implementation policy 不应为了统一数值被错误升级成协议；
9. 实施发现真正跨实现语义缺口时先更新 Contract/ADR；纯实现差异留在模块文档；
10. Tracking文档不定义正式行为。

## 当前实施顺序

```text
Game Package / Desktop Launcher
    ↓
Subsystem Control / Runtime Control Profile
    ↓
Frame / Call + executable conformance
    ↓
Main ⇄ Renderer Control closure
    ↓
Data Connection + Desktop/PWA Host binding implementation
    ↓
User Input canonical payload + limits
    ↓
Render Update hard limits/conformance
    ↓
Content API implementation/conformance
    ↓
loom.map + Hostra/PWA vertical slice
```

治理原则：**只协议化必须互操作的事实，其余交给实现。**
