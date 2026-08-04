# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Archived Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Subsystem 之间的数据面职责分层及其对 Main committed control state 的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

本文只描述 Renderer ⇄ Subsystem 数据面的概念边界，不冻结 Data Connection / Render / User Input wire Schema，也不能覆盖正式契约。

Frame / Call v1 Batch A/B/C 已 Frozen，但全部 Frame RPC 与 Batch C transaction 都属于 **Main ⇄ Subsystem Control Plane**。Renderer 不是 Frame / Call RPC participant。

## 1. 基本拓扑

每个 Subsystem Runtime 与 Renderer 之间最多一条长期 Data Transport：Desktop WebSocket / PWA MessagePort。物理连接粒度是 Subsystem，不是 Frame，也不是 Render。

## 2. 三个数据协议域

```text
Renderer ⇄ Subsystem Runtime

Connection Layer
    connection identity / auth / lifecycle

Render Update Protocol
    Subsystem → Renderer presentation state/events

User Input Protocol
    Renderer → Subsystem ordinary input for Main-authorized Frame/Activation
```

三个域共享物理 Transport，但 identity、lifecycle、Sequence、recovery/backpressure 独立。

## 3. Control Plane 与 Data Plane 分离

```text
Main ⇄ Subsystem Control
    Subsystem Control v1
    Frame / Call v1
        initialize / activate / suspend / resume / close
        call / return
        Batch C transaction / acceptance barriers

Main ⇄ Renderer Control
    committed Runtime / Stack / lifecycle / Activation / InputTarget mirror

Renderer ⇄ Subsystem Data
    User Input(frameId + current activationId)
    Render Update(independent Render identity)
```

禁止把 Batch B/C Frame control 复制到 Data Plane，例如 Renderer→Subsystem `frame.activate/frame.resume/frame.call` 或 Data Connection carrying `frame.return`。

## 4. Connection Layer

负责 Main Grant、Session/Subsystem/Connection identity、version/capability、liveness、replace/close。

不拥有 Frame lifecycle/Stack/Activation/InputTarget、Render Registry 或 business state。

## 5. Render Update

Render Update 使用独立 Render identity：

```text
Subsystem Render Manager
→ Render Update
→ Renderer Render Store
→ Scheduler / DOM / Canvas / WebGL
```

```text
Activation replacement ≠ Render epoch replacement
Frame suspended ≠ Render hidden
Frame closed ≠ Render destroyed
```

## 6. User Input

```text
raw input
→ Renderer Input Router
→ Main-declared InputTarget
→ User Input Protocol
→ Subsystem Frame Input Handler
```

ordinary input 合法至少要求：

```text
Frame exists
AND lifecycle == active
AND activationId == currentActivationId
AND Frame == Main-authorized InputTarget
```

旧/revoked Activation 永久无效。

Renderer 不生成 Activation，不恢复缓存旧 Activation，不根据 Render focus/z-order 自行改变公共 InputTarget。

## 7. Batch C Causal Dependency

Batch C 已冻结：

```text
frame.activate ACK
    happens-before Child Activation/InputTarget publication

frame.resume ACK
    happens-before Caller replacement Activation/InputTarget publication
```

因此 Main-generated activationId 本身不是 Renderer authority；Renderer 只能使用 Main 在上述 ACK 之后发布的 committed value。

Call/Return transaction 中合法存在：

```text
InputTarget = null
```

Renderer MUST 在该 gap 停止 ordinary input routing，不得沿用旧 target。

old Activation 一旦在 Main transaction 中 commit revoked，后续 Renderer revision MUST NOT 再把它发布为 current。

Main MAY coalesce intermediate Stack revisions，但不得越过上述 causal safety barrier，也不得发布两个 ordinary InputTargets。

## 8. Batch C Response Ordering 不进入 Data Plane

Batch C 还冻结：

```text
frame.call Response
    before dependent Child initialize / activate

frame.return Response
    before dependent close / resume
```

这是 Main⇄Subsystem Control Connection 的 ordering rule，用于避免 same-Subsystem recursive call 依赖 nested bidirectional Request handler reentrancy。

Renderer/Data Connection 不参与这个 RPC ordering，也不应通过 Data messages 尝试补充、确认或重放 Frame transaction。

## 9. 一条连接，多组 Context

Data Connection 可以同时服务：

```text
0..N Render Context
0..N Frame Input Context
```

不存在平台级 `Frame owns Render`。

## 10. Main Dependency

Main 是 Session、Runtime readiness、Frame identity/lifecycle/Stack、Caller relationship、transaction commit、Activation、InputTarget 和 Data Grant 的权威。

稳定状态：Stack Top active + current Activation；其他 live Frames suspended。事务状态可以 Top starting/closing + null InputTarget。

## 11. Runtime Bootstrap / Connection

Data Connection 只能在 Runtime `ready` 后按 Main Grant 建立。Frame creation 不承担 Runtime startup，也不决定 Data Connection lifecycle。

## 12. Frame / Render Independence

Frame initialize/activate/suspend/resume/close 不隐式 create/show/hide/resync/destroy Render；Render create/destroy 不创建/关闭 Frame；Render recovery 不恢复旧 Activation。

## 13. 当前协议拆分方向

```text
Renderer ⇄ Subsystem
├── Connection Protocol
├── Render Update Protocol
└── User Input Protocol

另有：Render State Contract
```

旧 Frame-scoped Data Protocol 只作为迁移历史保留，不得把 Frame RPC、transaction commit 或 Activation authority 再引入 Data Plane。
