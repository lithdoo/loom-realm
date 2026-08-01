# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：控制面、System 数据面、内容面、协议职责域、恢复和安全边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行时启动与连接建立系统](./runtime-bootstrap-system.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-02

## 1. 设计目标

通信系统使程序主系统、模块子系统和 Renderer 在独立进程或不同平台 Transport 中保持一致语义，同时避免 Main 成为高频 User Input 和 Render Update 的转发瓶颈。

核心通信原则：

> 物理 System Data Connection 按 Runtime Container / `systemId` 建立；Connection、Render Update、User Input 是三套职责独立的协议域。Frame 只属于 User Input / Main Control 语义，Render 使用独立身份。

## 2. 三类通信平面

```text
控制面
    Subsystem Runtime Container ⇄ Main
    Renderer ⇄ Main

System 数据面
    Runtime Container ⇄ Renderer
    每 System 一条物理连接
    ├── Connection Layer
    ├── Render Update Protocol
    └── User Input Protocol

内容面
    Runtime Container / Renderer ⇄ Readonly Content Service
```

三类平面的职责、顺序和背压语义不同，不应复用一个无边界的通用消息队列。

## 3. Main ⇄ Subsystem 控制面

桌面 Bootstrap 中，Main 先开放 Control WebSocket Endpoint，再通过 Subsystem 启动环境传入该 Endpoint。

连接方向：

```text
Subsystem Process
    ── connect ──▶ Main Control WebSocket Server
```

控制面负责：

- Subsystem 连接、身份确认、ready、关闭和失败；
- Frame initialize / activate / suspend / resume / close；
- 子系统调用与返回；
- heartbeat、超时、错误和诊断。

`connected` 与 `ready` 必须区分。Subsystem 只有在完成自身初始化并发送与 Descriptor 相同 `systemId` 的 ready 后才可被 Main 标记为 ready。

## 4. Main ⇄ Renderer 控制面

Renderer 与 Main 之间有一条会话级长期控制连接。

负责：

- Session 状态；
- 当前已声明 / starting / ready / failed System 状态；
- Frame Stack Snapshot 与增量通知；
- Activation；
- Input Target；
- Renderer System Data Connection 的授权、建立、替换和撤销；
- 会话错误和诊断；
- Renderer 重连。

Main Control Plane 不负责：

- 普通 User Input Payload；
- Render State / Render Event；
- 资源主体；
- Render visibility / ordering。

Renderer 不能通过 DOM、当前 Frame Stack 或已有 WebSocket 自行决定某个 System 是否允许连接。

## 5. System 数据面

每个有效 Runtime Container 与 Renderer 之间最多一条长期双向 System Data Connection。

该物理连接绑定 System 级身份，例如：

```text
sessionId
systemId
connectionId
```

具体身份 Schema 由 Connection Layer 契约冻结。

System Data Connection 不以 Frame 为物理或总业务路由粒度。它可以同时承载：

```text
0..N Render Context
0..N Frame Input Context
```

即使没有 Frame，Subsystem 也可以通过同一连接维护 Render。

## 6. Renderer–Subsystem 三个协议域

```text
Renderer ⇄ Runtime Container

Connection Layer
    System Connection 建立、认证、版本、存活、替换和关闭

Render Update Protocol
    Subsystem → Renderer 为主
    独立 Render identity / state / event / recovery

User Input Protocol
    Renderer → Subsystem 为主
    Frame + Activation 输入路由
```

三个协议域共享同一物理 WebSocket / MessagePort，但状态所有权和协议身份独立。

详见：[Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)。

## 7. Connection Layer

Connection Layer 只管理 System Data Connection。

概念职责：

- 根据 Main 授权建立连接；
- 确认 Session / System / Connection 身份；
- 协商协议版本和必要能力；
- 连接级 heartbeat 与故障检测；
- 连接替换和关闭。

Connection Layer 不拥有：

```text
Frame Stack
Activation
Input Target
Render Registry
Render State
业务状态
```

桌面 Renderer 只有在 Main 发布有效 Grant / Connection Information 后才能主动连接 Subsystem Data Endpoint。

## 8. User Input Protocol 身份

普通 User Input 使用 Main 发布的：

```text
systemId
frameId
activationId
```

路由：

```text
Browser input
→ Renderer Input Router
→ Main-declared Input Target
→ 对应 System Data Connection
→ User Input Protocol
→ frameId + activationId
→ Subsystem Input Handler
```

Frame / Activation 只约束输入上下文，不约束 Render。

User Input 的 Sequence、连续输入合并、离散事件顺序和 UI Interaction 定位由独立契约冻结。

## 9. Render Update Protocol 身份

Render Update 不使用 `frameId + activationId` 作为平台级身份。

概念路由：

```text
Subsystem Render Manager
→ renderId
→ Render Update Protocol
→ Renderer Render Store
```

完整 Render 身份概念上是：

```text
systemId + renderId
```

其中 `systemId` 已由 System Data Connection 绑定。

Render 的 Revision、Scope、Event、Sequence / Ordering 和 Resync 由 Render Update Protocol 独立冻结，不继承 Frame Activation epoch。

## 10. Frame 与 Render 不存在协议级绑定

以下关系不进入公共通信模型：

```text
frameId → renderId
renderId → frameId
```

Subsystem 可以内部保存该映射，也可以完全不保存。

因此：

- Frame suspend 不使 Render 消息失效；
- Frame Activation 改变不启动新的 Render epoch；
- Frame close 不删除 Render Store；
- Render destroy 不关闭 Frame；
- Render recovery 不要求 Frame resync。

## 11. 内容面

内容面提供逻辑只读 Content API：

```text
manifest
record(namespace, key)
group(namespace, key)
resource(namespace, key)
```

内容面不承载：

- User Input；
- Render State；
- Runtime Tick；
- Frame Stack / Activation；
- Subsystem Process Bootstrap 控制。

大型资源主体通过独立 HTTP / Fetch 获取，不能阻塞控制消息和 System 数据消息。

## 12. 通道粒度

```text
每个程序会话
    一个 Renderer ⇄ Main 控制连接
    一个 Main Control Endpoint 供 Subsystem 连接
    一个只读 Content API 入口

每个 systemId
    一个 Subsystem ⇄ Main 长期控制连接
    一个 Renderer ⇄ Subsystem 长期 System Data Connection

每个 Frame Activation
    一个 User Input Context

每个 Render
    一个独立 Render Context
```

物理连接粒度与 Runtime Container 对齐；Frame 与 Render 分别通过各自协议域实现逻辑隔离。

## 13. Transport Profile

JSON-RPC 2.0 可以用于控制和 System 数据消息 Envelope，但不规定传输层。

### 桌面 Profile

```text
Subsystem → Main
    每 System 一条 localhost WebSocket

Renderer ⇄ Main
    每会话一条 localhost WebSocket

Renderer ⇄ Runtime Container
    每 System 一条 localhost WebSocket

Content API
    localhost HTTP
```

### PWA Profile

```text
System Worker ⇄ Main Runtime Worker
    每 System 一条控制 MessagePort

Window ⇄ Main Runtime Worker
    一条控制 MessagePort

Window ⇄ System Worker
    每 System 一条数据 MessagePort

Content API
    same-origin Fetch，由 Service Worker 响应
```

WebSocket 与 MessagePort 是 Transport Profile，不改变 System、Frame/Input 和 Render 的所有权语义。

## 14. 桌面启动连接顺序

```text
Main Control Endpoint ready
→ Main 启动全部声明 Subsystem
→ Subsystem 主动连接 Main
→ Subsystem ready(systemId)
→ Main 通过 Renderer Control Plane 发布 System 状态 / Data Grant
→ Renderer 主动建立 System Data Connection
→ Connection Layer ready
→ User Input / Render Update 开始直接通信
```

详细 Bootstrap 见：[运行时启动与连接建立系统](./runtime-bootstrap-system.md)。

## 15. Renderer 重连恢复

Renderer 重载后的恢复不再按 Frame 推导 Render。

```text
Renderer → Main Control reconnect
→ 恢复 Session / ready System / Frame Stack / Input Target
→ 按 Main 发布信息重建需要的 System Data Connection

User Input domain
→ 恢复 Frame / Activation 输入上下文

Render domain
→ 各 Subsystem 独立恢复自己的 Render State
```

一个域的恢复失败不能自动重置另一域的业务状态。

## 16. 背压原则

不同协议域独立定义背压：

```text
Control RPC
    不静默丢弃；超时产生明确错误

User Input
    持续意图可以合并
    离散输入必须有界并保持所需顺序

Render State
    可恢复目标状态可以按 Render / Scope 合并

Render Event
    一次性行为必须有界并定义溢出策略

System Data Transport
    公平调度协议域和多个 Render / Frame Input Context

Content Body
    使用独立 HTTP / Fetch 流和缓存
```

Sequence / Revision 必须在各自协议域内定义，不能继续使用一套 Frame Sequence 统管全部 System 数据消息。

## 17. 桌面连接授权

桌面 localhost 连接也视为不可信。Main 签发短期 System Data Connection Grant，至少在概念上绑定：

```text
sessionId
systemId
connectionId
endpoint
一次性高熵 token
expiresAt
```

Grant 是 System 级，不绑定 Frame 或 Render。

Subsystem 只监听 loopback 地址。Renderer 建立 WebSocket 后先完成 Connection Layer 认证，再允许 User Input 或 Render Update。

精确认证字段和方法由 Connection Layer 契约冻结。

## 18. 安全原则

- 所有消息视为不可信输入；
- Subsystem Control Connection 必须校验其声明 `systemId` 与 Main 启动 Descriptor 一致；
- System Data Connection 必须绑定合法 Session / System / Connection；
- User Input 必须校验 Frame / Activation / 输入权限；
- Render Update 必须限制在当前 System 的 Render Namespace；
- Frame 输入错误不能伪造其他 Frame；
- Render 错误不能借机修改 Main Stack；
- Renderer 不能获得任意 IPC Channel；
- Render State 不允许可执行代码、任意 HTML 或物理路径；
- Content API 只接受逻辑资源身份。

## 19. 当前契约迁移状态

当前 `frame-data-channel-v1.md` 和 `client-state-tree-v1.md` 仍保存旧的 Frame-scoped Render 详细 Schema。这些文档将在下一阶段迁移为独立的：

```text
Connection Protocol
Render Update Protocol
User Input Protocol
Render State Tree / equivalent state contract
```

在迁移完成前，本架构文档是 Frame / Render 所有权关系的当前上层真相；旧契约中的 `Frame Client State`、Frame-scoped Render Sequence 和“Frame close 自动清 Render”不能继续作为新增设计依据。

## 20. 开放问题

需要在契约层进一步冻结：

- Main ⇄ Renderer Control Protocol；
- Main ⇄ Subsystem Bootstrap / ready Schema；
- Connection Layer 的认证、版本、heartbeat 和 reconnect；
- Render Identity、Revision、Scope、Event 和 Resync；
- User Input 的连续意图、离散输入、UI Interaction 与 Sequence；
- 跨 System Render Composition / z-order；
- System Data Transport 的协议域公平调度；
- 最大消息、树深和发送速率 Profile。

## 21. 相关文档

- [运行时启动与连接建立系统](./runtime-bootstrap-system.md)；
- [Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)；
- [渲染系统](./rendering-system.md)；
- [栈式运行系统](./stack-runtime-system.md)；
- [正式契约目录](../15-contracts/README.md)。
