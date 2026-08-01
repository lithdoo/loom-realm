# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Archived Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与模块子系统之间的协议职责分层及其对 Main 控制面的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-01

本文档归档 Renderer 与模块子系统之间通信协议的概念级分层。本文只冻结职责边界和依赖关系，不冻结具体 JSON-RPC 方法、握手字段、Sequence、错误码、心跳参数或背压参数。

## 1. 基本拓扑

桌面环境中，Renderer 与每个 `systemId` 对应的模块子系统 Runtime Container 之间保持一条长期双向 WebSocket 连接，消息使用 JSON-RPC 2.0 Envelope。

```text
Renderer
├── WebSocket ⇄ loom.map Runtime Container
├── WebSocket ⇄ loom.menu Runtime Container
└── WebSocket ⇄ loom.battle Runtime Container
```

物理连接粒度是 `systemId`，不是 Frame。

同一 Runtime Container 内的多个 Frame 共用这条物理连接，并在连接内部按 Frame 逻辑身份进行多路复用。

```text
物理连接隔离粒度
    systemId

业务实例隔离粒度
    Frame
```

PWA 可以使用 MessagePort 替代 WebSocket，但不改变本文的协议职责分层。

## 2. 三层协议模型

Renderer–Subsystem 通信概念上拆分为三个职责独立的协议域：

```text
Renderer ⇄ Subsystem Runtime Container

┌──────────────────────────────┐
│ Connection Layer             │
│ 连接建立与连接级管理           │
├──────────────────────────────┤
│ Render Update Protocol       │
│ Subsystem → Renderer         │
│ 视图状态与表现更新             │
├──────────────────────────────┤
│ User Input Protocol          │
│ Renderer → Subsystem         │
│ 用户输入与界面交互             │
└──────────────────────────────┘
```

三个协议域共享同一条按 `systemId` 建立的物理 Transport，但职责、状态和未来版本演进相互独立。

## 3. Connection Layer

Connection Layer 负责 Renderer 与一个 Runtime Container 之间物理通信连接的建立和连接级管理。

概念职责包括：

- 建立连接；
- 确认连接双方的身份；
- 协商协议版本和必要能力；
- 维护连接存活状态；
- 关闭连接；
- 在连接失效后建立新的连接实例。

Connection Layer 只处理 System Connection，不拥有 Frame 业务状态。

它不负责：

- Frame 创建、暂停、恢复和返回；
- 用户输入语义；
- Client State、Scope 和 Render Event；
- 游戏业务状态和业务规则。

Connection Layer 的建立依赖程序主系统与 Renderer 之间的控制通信。Renderer 不自行决定应连接哪个 Runtime Container，也不自行生成对目标子系统的访问授权。

## 4. Render Update Protocol

Render Update Protocol 负责模块子系统向 Renderer 发布视图输出。

主方向为：

```text
Subsystem Frame Runtime
→ Client State Projector
→ Render Update Protocol
→ Renderer Store
→ Render Scheduler
→ DOM / Canvas / WebGL
```

它表达两类概念信息：

```text
Recoverable State
    当前应该显示什么，可以通过完整状态恢复

Presentation Event
    一次性的表现行为，不作为恢复源
```

Renderer 负责接收、校验、保存 Client State 并将其呈现为实际视图，不通过 Render Update Protocol 修改子系统权威业务状态。

为支持 Renderer 重载、连接重建和状态缺口恢复，该协议允许 Renderer 向子系统发起状态重新同步请求，但其主要数据方向仍然是 Subsystem → Renderer。

本文不冻结具体 Snapshot、Scope 更新、Event 或 Resync 方法名及消息结构。

## 5. User Input Protocol

User Input Protocol 负责 Renderer 向子系统提交用户输入和界面交互。

主方向为：

```text
Keyboard / Gamepad / Touch / UI Interaction
→ Renderer Input Router
→ User Input Protocol
→ Frame Runtime
→ 权威业务状态
```

Renderer 的职责是：

- 采集原始输入；
- 将输入归一化为协议语义；
- 根据程序主系统声明的 Input Target 选择目标 Frame；
- 将输入发送给该 Frame 所属的 Runtime Container。

Renderer 不决定输入产生的业务结果，例如移动是否合法、攻击是否命中、菜单是否可以选择或是否触发子系统调用。

概念上，该协议可以覆盖：

- 持续输入意图；
- 离散操作；
- Client Node 交互；
- 持续输入状态释放或重置。

具体方法和顺序语义以后单独冻结。

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

同一 System Connection 可以承载该 Runtime Container 中多个 Frame：

```text
loom.map System Connection
├── Frame A
│   ├── Render Update Context
│   └── User Input Context
│
└── Frame B
    ├── Render Update Context
    └── User Input Context
```

因此当前概念隔离层级为：

```text
物理连接粒度
    System / systemId

业务实例粒度
    Frame

协议职责粒度
    Connection / Render Update / User Input
```

后续是否为 Render Update 与 User Input 定义独立的顺序、恢复和故障上下文，由契约设计阶段决定，本文不提前冻结。

## 7. 与 Main Control Plane 的依赖

Renderer–Subsystem 通信并不是完全自治的点对点关系。

程序主系统仍然是 Frame 生命周期、调用栈、Activation、Input Target 和 System Connection 授权的权威来源。

```text
Main ⇄ Renderer Control Protocol
            │
            │ 提供：
            │ Frame / systemId 映射
            │ Activation
            │ Input Target
            │ System Connection 建立与撤销信息
            ▼
Renderer ⇄ Subsystem Connection Layer
            │
            ├── Render Update Protocol
            └── User Input Protocol
```

因此 Renderer 不应通过 DOM、已有 WebSocket 或子系统消息自行推断：

- 哪些 Frame 当前存在；
- Frame 属于哪个 `systemId`；
- 当前哪个 Frame 可以接收普通输入；
- 是否允许建立或继续使用某个 System Connection。

这些信息必须由 Main Control Plane 提供。

## 8. 设计依赖顺序

由于 Connection Layer 需要 Main 向 Renderer 提供目标 System 和连接授权，后续协议设计建议按以下顺序推进：

```text
1. Main ⇄ Renderer Control Protocol

2. Renderer ⇄ Subsystem Connection Layer

3. Render Update Protocol

4. User Input Protocol
```

这里的顺序是设计依赖顺序，不代表运行时所有消息都必须经过 Main。

普通 Render Update 和 User Input 仍然在 Renderer 与 Runtime Container 之间直接传输。

## 9. 当前归档结论

当前只冻结以下概念级结论：

1. Renderer 与每个 `systemId` 对应的 Runtime Container 使用一条长期物理连接；
2. 多个 Frame 在该 System Connection 内逻辑复用；
3. Renderer–Subsystem 通信拆为 Connection Layer、Render Update Protocol 和 User Input Protocol 三个独立职责域；
4. Connection Layer 只管理 System Connection，不管理 Frame 业务状态；
5. Render Update Protocol 主要负责 Subsystem → Renderer 的视图状态和表现更新；
6. User Input Protocol 主要负责 Renderer → Subsystem 的用户输入和界面交互；
7. 三个协议域共享 Transport，但应允许独立演进；
8. Connection Layer 的建立依赖 Main ⇄ Renderer Control Protocol 提供 Frame/System 关系和连接授权；
9. Frame 生命周期仍属于 Main 控制面，不属于 Renderer–Subsystem 数据协议；
10. 具体方法、Schema、Sequence、Revision、错误码、握手和心跳细节暂不在本文冻结。

## 10. 后续设计入口

下一步优先设计 Main ⇄ Renderer Control Protocol，以明确：

- Renderer 如何获得完整调用栈；
- Frame 与 `systemId` 的映射如何发布；
- Activation 和 Input Target 如何发布；
- System Connection 如何授权、建立、替换和撤销；
- Renderer 重载后的控制状态如何恢复。

在这些控制语义稳定后，再分别细化 Connection Layer、Render Update Protocol 和 User Input Protocol。

现有正式契约 [Renderer–Subsystem 数据协议 v1](../15-contracts/frame-data-channel-v1.md) 仍记录当前可执行的详细语义；后续细化时应按本文的三个协议域重新整理，而不是把所有数据方法继续视为单一职责协议。
