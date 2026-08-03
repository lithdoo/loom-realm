# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Archived Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Subsystem 之间的协议职责分层及其对 Main 控制面的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-03

本文归档 Renderer 与 Subsystem 之间通信协议的概念级分层，只描述职责边界和依赖关系，不冻结具体 Data Connection / Render / User Input wire Schema。

当前 Frame / Call v1 Batch A 已经冻结 Frame identity / lifecycle / Activation，因此本文涉及 User Input 的概念描述 MUST 遵守这些已冻结语义；本文不能以 Archived/Conceptual 身份覆盖正式契约。

## 1. 基本拓扑

Desktop 中 Renderer 与每个 Subsystem Runtime Container 之间最多一条长期双向 WebSocket：

```text
Renderer
├── WebSocket ⇄ loom.map Runtime
├── WebSocket ⇄ loom.menu Runtime
└── WebSocket ⇄ loom.battle Runtime
```

物理连接粒度是 Subsystem，不是 Frame，也不是 Render。PWA 可以使用 MessagePort 替代 WebSocket，但不改变职责分层。

## 2. 三个协议域

```text
Renderer ⇄ Subsystem Runtime Container

Connection Layer
    connection identity / auth / lifecycle

Render Update Protocol
    Subsystem → Renderer presentation state/events

User Input Protocol
    Renderer → Subsystem ordinary input for Main-authorized Frame/Activation
```

三个协议域共享同一物理 Transport，但协议身份、生命周期、Sequence、恢复和未来版本演进相互独立。

## 3. Connection Layer

负责：

- 根据 Main Grant 建立连接；
- 确认 Session / Subsystem / Connection identity；
- 协商版本/能力；
- liveness；
- replace / close。

不拥有：

```text
Frame identity / lifecycle
Activation authority
Input Target authority
Render Registry / Render State
business state
```

Renderer 不自行发现或决定应该连接哪个 Runtime Container。

## 4. Render Update Protocol

主方向：

```text
Subsystem business state / Render Manager
→ Render Update Protocol
→ Renderer Render Store
→ Render Scheduler
→ DOM / Canvas / WebGL
```

Render Update 使用独立 Render identity，不使用 `frameId + activationId` 作为 Render lifecycle identity。

因此：

```text
Activation replacement ≠ Render epoch replacement
Frame suspended ≠ Render hidden
Frame closed ≠ Render destroyed
```

Renderer 负责校验、保存和呈现 Render State，不修改 Subsystem 权威业务状态。

## 5. User Input Protocol

主方向：

```text
Keyboard / Gamepad / Touch / UI Interaction
→ Renderer Input Router
→ Main-declared Input Target
→ User Input Protocol
→ Subsystem Frame Input Handler
```

Input Target 概念上包含：

```text
subsystem reference
frameId
activationId
```

根据 Frame Batch A，ordinary input 合法至少要求：

```text
Frame exists
AND Frame lifecycle == active
AND activationId == currentActivationId
AND Frame == current Main-authorized Input Target
```

`activationId` 由 Main 生成、Session 内不复用；一旦 revoked，MUST 永久不能重新合法。

Renderer MUST NOT：

- 为 Frame 创建 `activationId`；
- 恢复缓存中的旧 Activation；
- 向 suspended / closing / closed Frame 发送 ordinary input；
- 根据 Render identity / focus / z-order 自行改变公共 Input Target。

UI Interaction 如何从 Render Context 映射到 Frame/Input Context 由 User Input Protocol 明确，不能假设 Render identity = `frameId`。

## 6. 一条物理连接，多组逻辑上下文

```text
Renderer
    │ one persistent transport / Subsystem
    ▼
Runtime Container
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol
```

连接内可以同时存在：

```text
Render Contexts
    world / hud / loading / ...

Frame Input Contexts
    active Frame with current Activation
    suspended Frames without current Activation
```

不存在平台级：

```text
Frame F1
└── owns Render R1
```

Frame 与 Render 的任何关联只属于 Subsystem 内部业务规则。

## 7. 隔离粒度

```text
physical connection
    Subsystem

connection management
    Connection Layer

Render business scope
    Render identity / Context

ordinary input scope
    Main-authorized frameId + current activationId
```

Render Update 与 User Input 分别定义顺序、恢复、背压和故障上下文，不能用统一 Frame Stream Sequence 统管全部数据消息。

## 8. Main Control Dependency

Main 是：

```text
Session authority
Subsystem readiness authority
Frame identity/lifecycle/Stack authority
Activation authority
Input Target authority
System Data Grant authority
```

```text
Main ⇄ Renderer Control
            │
            │ Runtime State
            │ Frame → Subsystem mapping
            │ lifecycle / current Activation / Input Target
            │ Data Grant
            ▼
Renderer ⇄ Subsystem Connection
            ├── Render Update
            └── User Input
```

Frame Batch A 稳定状态：

```text
Stack Top = active + current Activation
lower live Frames = suspended + no current Activation
```

Main/Renderer MUST NOT 同时暴露两个 ordinary Input Target。

精确 Input Target publish commit barrier 由 Frame / Call Batch C + Main ⇄ Renderer Control Protocol 冻结。

## 9. 与 Runtime Bootstrap 的关系

System Data Connection 只能在目标 Subsystem Runtime `ready` 后按 Main Grant 建立。

```text
Runtime Bootstrap
→ subsystem.hello
→ identified
→ ready
→ Main Data Grant
→ Renderer Data Connection
```

Frame 创建不承担 Runtime startup，也不决定 Data Connection lifecycle。

## 10. Frame / Render Lifecycle Independence

- Frame initialize 不创建 Render；
- Frame active 不表示 Render visible；
- Frame suspend 不隐藏/冻结 Render；
- Frame resume 不触发 Render resync；
- Frame close 不销毁 Render；
- Render create 不创建 Frame；
- Render destroy 不关闭 Frame；
- Render recovery 不恢复旧 Activation。

## 11. 当前协议拆分方向

```text
Renderer ⇄ Subsystem
├── Connection Protocol
├── Render Update Protocol
└── User Input Protocol

另有：
Render State Contract
```

旧 Frame-scoped Data Protocol 只作为迁移历史保留，不应继续新增 Render ownership 语义。
