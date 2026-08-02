# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Archived Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与模块子系统之间的协议职责分层及其对 Main 控制面的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)  
> 最近复核：2026-08-02

本文归档 Renderer 与模块子系统之间通信协议的概念级分层，只冻结职责边界和依赖关系，不冻结具体 JSON-RPC 方法、Render identity 字段名、Sequence、错误码、心跳参数或背压参数。

## 1. 基本拓扑

Desktop 中，Renderer 与每个 Subsystem Runtime Container 之间最多保持一条长期双向 WebSocket：

```text
Renderer
├── WebSocket ⇄ loom.map Runtime Container
├── WebSocket ⇄ loom.menu Runtime Container
└── WebSocket ⇄ loom.battle Runtime Container
```

物理连接粒度是 Subsystem/System，不是 Frame，也不是 Render。

PWA 可以使用 MessagePort 替代 WebSocket，但不改变本文的职责分层。

## 2. 三个协议域

```text
Renderer ⇄ Subsystem Runtime Container

Connection Layer
    System 连接建立与连接级管理

Render Update Protocol
    Subsystem → Renderer
    Render State 与表现更新

User Input Protocol
    Renderer → Subsystem
    Frame/Input 用户输入与交互
```

三个协议域共享同一物理 Transport，但协议身份、生命周期、Sequence、恢复和未来版本演进相互独立。

## 3. Connection Layer

负责：

- 根据 Main 授权建立连接；
- 确认 Session / Subsystem / Connection 身份；
- 协商协议版本和必要能力；
- 维护连接存活状态；
- 替换和关闭连接。

不拥有：

- Frame 生命周期；
- Activation / Input Target；
- Render Registry / Render State；
- User Input 业务语义；
- 游戏业务状态。

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

协议表达：

```text
Recoverable Render State
Presentation Event
```

Render Update 使用独立 Render identity。本文可能用 `renderId` 表示“连接内 Render identity”的概念占位名，但**不冻结该 wire 字段名**。

Render Update Protocol 不使用 `frameId + activationId` 作为 Render 生命周期身份。

Renderer 负责接收、校验、保存和呈现 Render State，不修改 Subsystem 权威业务状态。

## 5. User Input Protocol

主方向：

```text
Keyboard / Gamepad / Touch / UI Interaction
→ Renderer Input Router
→ Main-declared Input Target
→ User Input Protocol
→ Subsystem Frame Input Handler
```

普通 Input Target 概念上包含：

```text
Subsystem/System reference
frameId
activationId
```

Renderer 根据 Main 声明的 Input Target 选择目标 Frame 和对应 System Data Connection。Renderer 不决定输入产生的业务结果。

UI Interaction 如何从某个 Render Context 映射到 Frame/Input Context 由后续协议明确，不能假设 Render identity 等于 `frameId`。

## 6. 一条物理连接，多组逻辑上下文

```text
Renderer
    │ one persistent transport / subsystem
    ▼
Runtime Container
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol
```

连接内存在两组相互独立的业务对象：

```text
Subsystem Connection
├── Render Contexts
│   ├── world
│   ├── hud
│   └── loading
│
└── Frame Input Contexts
    ├── F1 / Activation A1
    └── F2 / Activation A7
```

不存在平台级结构：

```text
Frame F1
└── owns Render R1
```

Frame 与 Render 如果有关联，只存在于 Subsystem 内部。

## 7. 隔离粒度

```text
物理连接粒度
    Subsystem / System

连接管理粒度
    Connection Layer

Render 业务粒度
    Render identity / Render Context

Input 业务粒度
    frameId + activationId / Frame Input Context
```

Render Update 与 User Input 分别定义自己的顺序、恢复、背压和故障上下文，不能继续由一套 Frame Logical Stream Sequence 统管全部数据消息。

## 8. 与 Main Control Plane 的依赖

Main 是 Session、Subsystem readiness、Frame Stack、Activation、Input Target 和 System Connection Grant 的权威来源。

```text
Main ⇄ Renderer Control Protocol
            │
            │ Session / ready Subsystem
            │ Frame → Subsystem mapping
            │ Activation / Input Target
            │ System Connection Grant / revoke
            ▼
Renderer ⇄ Subsystem Connection Layer
            ├── Render Update Protocol
            └── User Input Protocol
```

Main 不提供 Render Registry、Render visibility、Render z-order 或 Frame→Render mapping。

## 9. 与 Subsystem Bootstrap 的关系

System Data Connection 只能在目标 Subsystem 已通过 Main Control Connection 进入 ready 后建立。

Desktop 概念顺序：

```text
Main 启动 Subsystem
→ Subsystem 主动连接 Main
→ subsystem.hello 成功，Connection identified
→ subsystem.status(state="ready")
→ Main 发布 Renderer Data Grant
→ Renderer 连接 Subsystem Data Endpoint
→ Connection Layer ready
```

`ready` 不承担 identity 声明；身份已经由 `subsystem.hello` 绑定。

## 10. Frame 与 Render 生命周期独立

- Frame initialize 不创建 Render；
- Frame activate 不显示 Render；
- Frame suspend 不隐藏或冻结 Render；
- Frame resume 不恢复 Render；
- Frame close 不销毁 Render；
- Render create 不创建 Frame；
- Render destroy 不关闭 Frame；
- Render recovery 不要求 Frame Activation 变化。

Subsystem 可以手动实现业务关联，但必须由自身显式控制。

## 11. 契约拆分方向

```text
Renderer ⇄ Subsystem
├── Connection Protocol
├── Render Update Protocol
└── User Input Protocol

另有：
Render State Tree / equivalent
```

旧 Frame-scoped Data Protocol 只作为迁移历史保留，不应继续向其中新增 Render 所有权语义。