# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：控制面、System 数据面、内容面、多路复用、顺序、恢复和安全边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-01

## 1. 设计目标

通信系统使程序主系统、模块子系统和渲染端在独立进程或不同传输环境中保持一致语义，同时避免程序主系统成为高频输入和视图状态更新的转发瓶颈。

核心通信原则：

> 物理数据连接按 Runtime Container / `systemId` 建立；Frame 通过该连接内的 Logical Stream 多路复用。

## 2. 三类通信平面

```text
控制面
    程序主系统 ⇄ Runtime Container
    程序主系统 ⇄ Web 渲染端

System 数据面
    Runtime Container ⇄ Web 渲染端
    每 System 一条物理连接
    连接内承载多个 Frame Logical Stream

内容面
    Runtime Container / Web 渲染端 ⇄ Readonly Content Service
```

三类平面的职责、顺序和背压语义不同，不应复用一个无边界的通用消息队列。

## 3. 控制面

控制面负责：

- Runtime Container 启动、握手、ready、关闭和失败；
- Frame 初始化、激活、暂停、恢复和关闭；
- 子系统调用与返回；
- 调用栈 Snapshot 和增量通知；
- 当前输入目标；
- Renderer System Data Connection 的授权、建立和撤销；
- heartbeat、超时、错误和诊断。

每个 Runtime Container 与程序主系统之间有一条长期控制连接。渲染端与程序主系统之间有一条会话控制连接。

控制面低频、不可静默丢弃，并需要明确超时、幂等和错误结果。

## 4. System 数据面

每个有效 Runtime Container 与 Renderer 之间最多有一条长期双向 System Data Connection。该物理连接绑定：

```text
sessionId
systemId
connectionId
```

连接内部按以下逻辑身份多路复用 Frame：

```text
frameId
activationId
sequence
```

其中 `frameId + activationId` 标识一个 Frame Logical Stream epoch，`sequence` 在该逻辑流的每个方向独立递增。

数据面上行负责：

- `input.dispatch`：归一化普通输入；
- `node.event`：带完整节点来源的交互事件；
- `state.resync`：请求指定 Frame 的完整 Client State。

数据面下行负责：

- `state.snapshot`：指定 Frame 的完整 Client State；
- `scope.replace`：指定 Frame 的单 Scope 创建、替换或删除；
- `event.emit`：指定 Frame 的一次性客户端表现事件；
- 协议错误和诊断。

普通数据面消息不由程序主系统解释或业务转发。

一个 Frame 的关闭、暂停、Sequence Gap 或 Resync 不关闭同 System 的物理数据连接，也不得影响其他 Frame 的逻辑流。

### 4.1 Renderer–Subsystem 协议职责分层

System Data Connection 在概念上进一步拆分为三个职责独立的协议域：

```text
Renderer ⇄ Runtime Container

Connection Layer
    建立和维护按 systemId 绑定的物理连接

Render Update Protocol
    主要负责 Subsystem → Renderer 的视图状态和表现更新

User Input Protocol
    主要负责 Renderer → Subsystem 的用户输入和界面交互
```

三个协议域共享同一条 System Data Connection，不代表三条 WebSocket 或三条 MessagePort。

Connection Layer 只处理连接级问题，不拥有 Frame 生命周期或业务状态。它的建立依赖 Main ⇄ Renderer 控制面提供 Frame/System 关系、当前 Activation、Input Target 和连接授权；Renderer 不自行决定应该连接哪个 Runtime Container。

Render Update 与 User Input 仍然直接在 Renderer 和 Runtime Container 之间传输，普通业务 Payload 不经过 Main 转发。

当前只冻结上述职责边界。具体 JSON-RPC 方法、版本协商、握手字段、Sequence、错误码、心跳和协议域故障隔离将在后续契约设计中分别冻结。

详见：[Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)。

## 5. 内容面

内容面提供逻辑只读 Content API：

```text
manifest
record(namespace, key)
group(namespace, key)
resource(namespace, key)
```

内容面不承载：

- 普通输入；
- Client State；
- Runtime Tick；
- 调用栈或 Activation；
- 任意物理路径访问。

大型资源内容通过内容面获取，不能阻塞控制消息和普通输入。

## 6. 通道粒度

```text
每个程序会话
    一个 Renderer ⇄ Main 控制连接
    一个只读 Content API 入口

每个 systemId
    一个 Main ⇄ Runtime Container 长期控制连接
    一个 Renderer ⇄ Runtime Container 长期数据连接

每个 Frame Activation
    一个位于 System Data Connection 内的 Logical Stream
```

物理连接粒度与 Runtime Container 一致；Frame 的隔离由 Logical Stream、Activation、Sequence、Revision 和状态所有权实现。

## 7. Transport Profile

JSON-RPC 2.0 用于控制和 System 数据消息的跨语言 Envelope，但不规定传输层。

### 桌面 Profile

```text
Renderer ⇄ Main
    每会话一条 localhost WebSocket

Main ⇄ Runtime Container
    每 System 一条 localhost WebSocket

Renderer ⇄ Runtime Container
    每 System 一条 localhost WebSocket
    内部多路复用 Frame Logical Stream

Content API
    localhost HTTP
```

### PWA Profile

```text
Window ⇄ Main Runtime Worker
    一条 MessagePort

Main Runtime Worker ⇄ System Worker
    每 System 一条控制 MessagePort

Window ⇄ System Worker
    每 System 一条数据 MessagePort
    内部多路复用 Frame Logical Stream

Content API
    same-origin Fetch，由 Service Worker 响应
```

WebSocket 与 MessagePort 只是 Transport Profile。它们不得改变方法、Frame 身份、Activation、Sequence、Revision、Resync 和错误语义。

## 8. 身份与顺序

通信系统必须区分：

```text
systemId
    业务子系统和物理数据连接路由身份

frameId
    一次子系统调用实例

activationId
    Frame 的一次活动周期

connectionId
    一次 Renderer ⇄ Runtime Container 物理或逻辑 Transport 实例

sequence
    一个 Frame Logical Stream 在单一方向上的消息顺序

stateRevision / scopeRevision
    客户端目标状态版本

stackRevision
    Renderer 调用栈镜像版本
```

这些编号不能互相替代。

Sequence 的作用域为：

```text
connectionId + frameId + activationId + direction
```

规则：

- 每个方向从 1 开始严格递增；
- 新 Activation 开启新的 Logical Stream epoch，可以从 1 重新开始；
- 物理连接重建产生新的 `connectionId`，各有效 Frame 在 Resync 后重新建立接收顺序；
- 一个 Frame 的 Sequence Gap 只影响该 Frame 的增量状态恢复，不阻塞同连接其他 Frame；
- Sequence 只表示逻辑消息顺序，不代替 State Revision 或输入业务编号。

## 9. 输入上行链路

```text
浏览器键盘 / 手柄 / 触摸 / 节点事件
→ Renderer Input Router
→ 归一化输入
→ 根据 Input Target 取得 systemId + frameId + activationId
→ 对应 System Data Connection
→ Frame Logical Stream
→ Frame Runtime 输入队列
→ 已提交权威状态
```

规则：

- 普通输入只发送给程序主系统声明的 Input Target；
- Renderer 必须把输入发送到该 Frame 所属 `systemId` 的数据连接；
- 持续方向意图可以合并为最新值；
- 确认、取消和其他离散输入保持顺序并有界；
- 页面失焦、Input Target 改变或 Frame 暂停时释放持续意图；
- 旧 Activation 的输入必须拒绝。

## 10. 视图状态下行链路

```text
Frame Runtime 已提交权威状态
→ Client State Projector
→ snapshot / scope.replace / event.emit
→ Runtime Container 的 System Data Connection
→ frameId + activationId 路由
→ Renderer Validator
→ Frame/Scope Store 原子提交
→ Render Scheduler
→ DOM / Canvas / WebGL
```

State 表示可恢复的当前目标，可以在发送前或呈现前合并为最新值。Event 表示一次性行为，通常需要有序、有界处理，不能替代可恢复 State。

## 11. 恢复原则

- 检测到 Stack Revision 缺口时请求完整 Stack Snapshot；
- 检测到某 Frame 下行 Sequence 缺口时停止应用该 Frame 的增量 State，并对该 Frame 请求完整 Snapshot；
- 同一 System Data Connection 中其他 Frame 继续正常处理；
- Renderer 重连后先恢复调用栈，再按当前有效 `systemId` 重建 System Data Connection；
- 每条 System Data Connection 恢复后，对其有效 Frame 分别请求完整 Client State；
- 旧 Activation 的输入、状态和事件必须被拒绝；
- DOM 不能作为恢复源；
- Service Worker 内存不能作为内容恢复源。

## 12. 背压原则

```text
Scope State
    同一 Frame/Scope 可合并为最新目标

Frame Snapshot
    可以替代该 Frame 尚未发送或尚未呈现的旧增量 State

Event
    按 Frame 有序、有界，溢出必须显式处理

Input
    按 Frame 有序、有界；持续意图可以合并

System Data Transport
    必须公平调度多个 Frame，避免单 Frame 无限占用发送队列

Control RPC
    不丢弃；超时产生明确错误

Content Body
    使用独立 HTTP / Fetch 流和缓存
```

State 合并应发生在 Revision 和 Sequence 分配之前，避免人为制造缺口。

## 13. 桌面连接授权

桌面 localhost 连接也视为不可信。程序主系统签发短期 System Data Channel Grant，至少绑定：

```text
sessionId
systemId
connectionId
endpoint
一次性高熵 token
expiresAt
```

Grant 不绑定单个 Frame，因为物理连接服务整个 Runtime Container。

子系统只监听 loopback 地址。Renderer 建立 WebSocket 后，首条 JSON-RPC 请求完成连接认证；token 成功使用后立即失效。

Frame 的合法性由双方结合 Main 发布的 Stack/Activation 信息和 Container 内的 Frame Registry 校验。Frame 出栈或 Activation 失效只使对应 Logical Stream 失效，不撤销整个 System Data Connection。

## 14. 安全原则

- 所有消息都视为不可信输入；
- 物理连接认证校验 Session、System、Connection 和 token；
- 每条 Frame 业务消息校验方法权限、Schema、大小、`frameId` 和 `activationId`；
- 子系统只能发布自身 Container 中存在的 Frame；
- 共享 Transport 不赋予 Frame 跨流访问权限；
- 渲染端不能获得任意 IPC Channel；
- Client State 不允许可执行代码、任意 HTML 或物理路径；
- 本机连接执行 Origin、token、速率和消息大小限制；
- Content API 只接受逻辑资源身份，不接受任意路径参数；
- PWA MessagePort 只向已创建的可信 Worker 转移。

## 15. 开放问题

需要在契约层进一步冻结：

- `system.returned` 与 `frame.resume(result)` 的最终关系；
- Container 和 Frame 协议版本握手；
- 请求超时、取消和重复请求幂等性；
- heartbeat 与 Container 失联判定；
- System Data Connection 授权与首个 Frame Snapshot 的时序；
- 多 Frame 共享 Transport 的公平发送策略；
- Event 溢出策略；
- 最大消息、树深和发送速率的具体 Profile；
- Connection Layer、Render Update Protocol 和 User Input Protocol 是否分别维护独立版本、顺序和故障上下文。

## 16. 相关下层文档

- [Renderer–Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)：概念级三层职责和 Main 控制面依赖；
- [正式契约目录](../15-contracts/README.md)；
- [生命周期协议草案](../15-contracts/system-lifecycle-protocol.md)；
- [Renderer–Subsystem 数据协议 v1](../15-contracts/frame-data-channel-v1.md)；
- [只读 Content API v1](../15-contracts/content-api-v1.md)；
- [现有详细设计：JSON-RPC 与状态同步](../architecture/runtime-rpc-and-state-sync.md)。
