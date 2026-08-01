# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Archived Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与模块子系统之间的协议职责分层及其对 Main 控制面的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)  
> 最近复核：2026-08-02

本文档归档 Renderer 与模块子系统之间通信协议的概念级分层。本文只冻结职责边界和依赖关系，不冻结具体 JSON-RPC 方法、握手字段、Sequence、错误码、心跳参数或背压参数。

## 1. 基本拓扑

桌面环境中，Renderer 与每个 `systemId` 对应的模块子系统 Runtime Container 之间最多保持一条长期双向 WebSocket 连接，消息可使用 JSON-RPC 2.0 Envelope。

```text
Renderer
├── WebSocket ⇄ loom.map Runtime Container
├── WebSocket ⇄ loom.menu Runtime Container
└── WebSocket ⇄ loom.battle Runtime Container
```

物理连接粒度是 `systemId`，不是 Frame，也不是 Render。

PWA 可以使用 MessagePort 替代 WebSocket，但不改变本文的协议职责分层。

## 2. 三层协议模型

Renderer–Subsystem 通信概念上拆分为三个职责独立的协议域：

```text
Renderer ⇄ Subsystem Runtime Container

┌──────────────────────────────┐
│ Connection Layer             │
│ System 连接建立与连接级管理    │
├──────────────────────────────┤
│ Render Update Protocol       │
│ Subsystem → Renderer         │
│ Render State 与表现更新       │
├──────────────────────────────┤
│ User Input Protocol          │
│ Renderer → Subsystem         │
│ Frame/Input 用户输入与交互     │
└──────────────────────────────┘
```

三个协议域共享同一条按 `systemId` 建立的物理 Transport，但协议身份、状态和未来版本演进相互独立。

## 3. Connection Layer

Connection Layer 负责 Renderer 与一个 Runtime Container 之间物理 System Data Connection 的建立和连接级管理。

概念职责包括：

- 根据 Main 授权建立连接；
- 确认连接双方的 Session / System / Connection 身份；
- 协商协议版本和必要能力；
- 维护连接存活状态；
- 关闭连接；
- 在连接失效后建立新的连接实例。

Connection Layer 不拥有：

- Frame 生命周期；
- Activation 或 Input Target；
- Render Registry；
- User Input 业务语义；
- Render State、Scope 或 Render Event；
- 游戏业务状态。

Connection Layer 的建立依赖 Main ⇄ Renderer Control Protocol。Renderer 不自行决定应该连接哪个 Runtime Container，也不自行生成目标 System 的访问授权。

## 4. Render Update Protocol

Render Update Protocol 负责 Subsystem 向 Renderer 发布和恢复自己拥有的 Render。

主方向：

```text
Subsystem business state / Render Manager
→ Render Update Protocol
→ Renderer Render Store
→ Render Scheduler
→ DOM / Canvas / WebGL
```

它表达两类概念信息：

```text
Recoverable Render State
    当前应该显示什么，可以通过完整状态恢复

Presentation Event
    一次性的表现行为，不作为权威恢复源
```

Render Update 使用独立的 Render identity，例如概念上的：

```text
systemId + renderId
```

其中 `systemId` 由物理连接绑定。

Render Update Protocol 不要求也不允许把 `frameId + activationId` 当作 Render 生命周期身份。

Renderer 负责接收、校验、保存 Render State 并将其呈现为实际视图，不通过 Render Update Protocol 修改 Subsystem 权威业务状态。

为支持 Renderer 重载、连接重建和状态缺口恢复，该协议允许 Renderer 请求 Render 状态恢复，但具体方法和 Revision / Sequence 语义以后单独冻结。

## 5. User Input Protocol

User Input Protocol 负责 Renderer 向 Subsystem 提交用户输入和界面交互。

主方向：

```text
Keyboard / Gamepad / Touch / UI Interaction
→ Renderer Input Router
→ Main-declared Input Target
→ User Input Protocol
→ Subsystem Frame Input Handler
```

普通 Input Target 使用：

```text
systemId
frameId
activationId
```

Renderer 的职责是：

- 采集原始输入；
- 将输入归一化为协议语义；
- 根据 Main 声明的 Input Target 选择目标 Frame；
- 将输入发送给该 Frame 所属 `systemId` 的 Runtime Container。

Renderer 不决定输入产生的业务结果。

概念上，该协议可以覆盖：

- 持续输入意图；
- 离散操作；
- UI / Client Node 交互；
- 持续输入状态释放或重置。

UI Interaction 如何从某个 Render Context 映射到 Frame/Input Context 由后续协议明确，不能假设 `renderId == frameId`。

## 6. 三层共享同一物理连接

三层协议不是三条 WebSocket。

```text
Renderer
    │
    │ one persistent transport / systemId
    ▼
Runtime Container
    │
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol
```

连接内的业务对象是两组相互独立的集合：

```text
loom.map System Connection
│
├── Render Contexts
│   ├── render world
│   ├── render hud
│   └── render loading
│
└── Frame Input Contexts
    ├── frame F1 / activation A1
    └── frame F2 / activation A7
```

不存在平台级结构：

```text
Frame F1
├── Render Context
└── Input Context
```

Frame 与 Render 如果有关联，只存在于 Subsystem 内部。

## 7. 隔离粒度

当前概念隔离层级为：

```text
物理连接粒度
    System / systemId

连接管理粒度
    Connection Layer

Render 业务粒度
    renderId / Render Context

Input 业务粒度
    frameId + activationId / Frame Input Context
```

Render Update 与 User Input 应分别定义自己的顺序、恢复、背压和故障上下文，不能继续由一套 Frame Logical Stream Sequence 统管全部数据消息。

具体字段由契约设计阶段冻结。

## 8. 与 Main Control Plane 的依赖

Renderer–Subsystem 通信不是完全自治的点对点关系。

Main 仍然是 Session、Subsystem readiness、Frame Stack、Activation、Input Target 和 System Connection 授权的权威来源。

```text
Main ⇄ Renderer Control Protocol
            │
            │ 提供：
            │ Session / ready System
            │ Frame / systemId 映射
            │ Activation
            │ Input Target
            │ System Connection Grant / revoke
            ▼
Renderer ⇄ Subsystem Connection Layer
            │
            ├── Render Update Protocol
            └── User Input Protocol
```

Main 不提供：

```text
Render Registry
Render visibility
Render z-order
Frame → Render mapping
```

这些全部属于 Subsystem / Render Protocol。

## 9. 与 Subsystem Bootstrap 的关系

System Data Connection 只能在目标 Subsystem 已经通过 Main Control Connection 完成 ready 后建立。

桌面概念顺序：

```text
Main 启动 Subsystem
→ Subsystem 主动连接 Main
→ ready(systemId)
→ Main 发布 Renderer Data Grant
→ Renderer 连接 Subsystem Data Endpoint
→ Connection Layer ready
```

详见：[运行时启动与连接建立系统](./runtime-bootstrap-system.md)。

## 10. Frame 与 Render 生命周期独立

以下规则作为当前概念结论冻结：

- Frame initialize 不创建 Render；
- Frame activate 不显示 Render；
- Frame suspend 不隐藏或冻结 Render；
- Frame resume 不恢复 Render；
- Frame close 不销毁 Render；
- Render create 不创建 Frame；
- Render destroy 不关闭 Frame；
- Render recovery 不要求 Frame Activation 变化。

Subsystem 可以手动实现任意业务关联，但必须由自身显式控制。

## 11. 设计依赖顺序

后续协议设计建议按以下顺序推进：

```text
1. Main ⇄ Renderer Control Protocol
2. Renderer ⇄ Subsystem Connection Layer
3. Render Update Protocol
4. User Input Protocol
```

同时 Main ⇄ Subsystem Bootstrap / ready Protocol 需要与 Main Control Plane 并行冻结。

这里的顺序是设计依赖顺序，不代表运行时普通消息必须经过 Main。

## 12. 当前归档结论

当前冻结以下概念级结论：

1. Renderer 与每个 `systemId` 对应的 Runtime Container 最多使用一条长期物理连接；
2. Renderer–Subsystem 通信拆为 Connection Layer、Render Update Protocol、User Input Protocol 三个独立职责域；
3. Connection Layer 只管理 System Connection；
4. Render Update Protocol 使用独立 Render identity，生命周期完全由 Subsystem 控制；
5. User Input Protocol 使用 Frame / Activation 输入上下文；
6. Render 与 Frame 不存在公共协议所有权关系；
7. 三个协议域共享 Transport，但必须允许独立版本、顺序、恢复和故障隔离；
8. Connection Layer 的建立依赖 Main Control Plane 提供 System readiness 和连接授权；
9. Frame 生命周期仍属于 Main 控制面，不属于 Render Protocol；
10. 具体方法、Schema、Sequence、Revision、错误码、握手和心跳细节暂不在本文冻结。

## 13. 迁移说明

现有 [Renderer–Subsystem 数据协议 v1](../15-contracts/frame-data-channel-v1.md) 仍采用 Frame-scoped State / Event 和统一 Frame Logical Stream。该模型已被本架构层修正，后续必须拆分迁移，而不能继续向旧 Frame-scoped Render 模型新增设计。
