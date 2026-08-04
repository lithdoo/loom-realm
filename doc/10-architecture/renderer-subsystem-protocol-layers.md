# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Archived Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Subsystem 之间的协议职责分层及其对 Main 控制面的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

本文只描述 Renderer ⇄ Subsystem 数据面的职责边界，不冻结 Data Connection / Render / User Input wire Schema，也不能覆盖正式契约。

Frame / Call v1 Batch A/B 已 Frozen，但它运行在 **Main ⇄ Subsystem Control Plane**。Batch B 的 `frame.initialize / activate / suspend / resume / close / call / return` **不得复制到 Renderer ⇄ Subsystem Data Plane**。

## 1. 基本拓扑

每个 Subsystem Runtime 与 Renderer 之间最多一条长期 Data Transport：Desktop WebSocket / PWA MessagePort。

物理连接粒度是 Subsystem，不是 Frame，也不是 Render。

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

## 3. Connection Layer

负责 Main Grant、Session/Subsystem/Connection identity、version/capability、liveness、replace/close。

不拥有 Frame lifecycle/Stack/Activation/Input Target、Render Registry 或 business state。

## 4. Render Update

```text
Subsystem Render Manager
→ independent Render identity
→ Render Update
→ Renderer Render Store
→ Scheduler / DOM / Canvas / WebGL
```

Render Update 不使用 `frameId + activationId` 作为 Render identity。

```text
Activation replacement ≠ Render epoch replacement
Frame suspended ≠ Render hidden
Frame closed ≠ Render destroyed
```

## 5. User Input

```text
raw input
→ Renderer Input Router
→ Main-declared Input Target
→ User Input Protocol
→ Subsystem Frame Input Handler
```

Input Target 概念上包含 Subsystem reference + `frameId + activationId`。

根据 Frame Batch A：

```text
Frame exists
AND lifecycle == active
AND activationId == currentActivationId
AND Frame == Main-authorized Input Target
```

旧/revoked Activation 永久无效。

Renderer 不生成 Activation，不恢复缓存旧 Activation，不根据 Render focus/z-order 自行改变公共 Input Target。

Batch B 与 User Input 的接口边界只有：`frame.activate / frame.resume` 在 Subsystem Control 侧安装 current Activation；**何时把新 Activation 发布给 Renderer** 由 Batch C + Main ⇄ Renderer Control 冻结。

## 6. Control Plane 与 Data Plane 不重复方法

正确关系：

```text
Main ⇄ Subsystem Control
    Frame / Call Batch B RPC
        frame.initialize / activate / suspend / resume / close
        frame.call / frame.return

Main ⇄ Renderer Control
    Frame Stack / lifecycle / current Activation / Input Target mirror

Renderer ⇄ Subsystem Data
    User Input(frameId + current activationId)
    Render Update(independent Render identity)
```

禁止：

```text
Renderer → Subsystem frame.activate
Renderer → Subsystem frame.resume
Renderer → Subsystem frame.call
Data Connection carrying frame.return
```

Renderer 不是 Frame / Call RPC participant。

## 7. 一条连接，多组 Context

Data Connection 可以同时服务：

```text
0..N Render Context
0..N Frame Input Context
```

不存在平台级 `Frame owns Render`。

## 8. Main Dependency

Main 是 Session、Runtime readiness、Frame identity/lifecycle/Stack、Caller relationship、Activation、Input Target 和 Data Grant 的权威。

稳定状态：Stack Top active + current Activation；其他 live Frames suspended。Main/Renderer 不得暴露两个 ordinary Input Target。

Batch C 将冻结 `frame.activate / frame.resume` success 与 Main→Renderer Input Target publish 的 causal barrier。

## 9. Runtime Bootstrap / Connection

Data Connection 只能在 Runtime `ready` 后按 Main Grant 建立。Frame creation 不承担 Runtime startup，也不决定 Data Connection lifecycle。

## 10. Frame / Render Independence

Frame initialize/activate/suspend/resume/close 不隐式 create/show/hide/resync/destroy Render；Render create/destroy 不创建/关闭 Frame；Render recovery 不恢复旧 Activation。

## 11. 当前协议拆分方向

```text
Renderer ⇄ Subsystem
├── Connection Protocol
├── Render Update Protocol
└── User Input Protocol

另有：Render State Contract
```

旧 Frame-scoped Data Protocol 只作为迁移历史保留，不得把 Batch B Control RPC 再引入 Data Plane。
