# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：控制面、Frame 数据面、内容面、顺序、恢复和安全边界  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-01

## 1. 设计目标

通信系统使程序主系统、模块子系统和渲染端在独立进程或不同传输环境中保持一致语义，同时避免程序主系统成为高频输入和视图状态更新的转发瓶颈。

## 2. 三类通信平面

```text
控制面
    程序主系统 ⇄ Runtime Container
    程序主系统 ⇄ Web 渲染端

Frame 数据面
    Frame Runtime ⇄ Web 渲染端

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
- Frame 数据通道的授权、建立和撤销；
- heartbeat、超时、错误和诊断。

每个 Runtime Container 与程序主系统之间有一条长期控制连接。渲染端与程序主系统之间有一条会话控制连接。

控制面低频、不可静默丢弃，并需要明确超时、幂等和错误结果。

## 4. Frame 数据面

每个有效 Frame 有一条独立双向数据连接。该连接绑定：

```text
sessionId
frameId
activationId
拥有该 Frame 的 systemId
```

数据面上行负责：

- `input.dispatch`：归一化普通输入；
- `node.event`：带完整节点来源的交互事件；
- `state.resync`：请求完整 Frame Client State。

数据面下行负责：

- `state.snapshot`：完整 Frame Client State；
- `scope.replace`：单 Scope 创建、替换或删除；
- `event.emit`：一次性客户端表现事件；
- Frame 数据通道错误和诊断。

普通数据面消息不由程序主系统解释或业务转发。

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

每个 Frame
    一个 Renderer ⇄ Frame Runtime 双向数据连接
```

进程或 Worker 的承载粒度与 Frame 数据连接粒度不同。一个 Container 可以同时持有多个 Frame 数据连接。

## 7. Transport Profile

JSON-RPC 2.0 用于控制和 Frame 数据消息的跨语言 Envelope，但不规定传输层。

### 桌面 Profile

```text
Renderer ⇄ Main
    localhost WebSocket

Main ⇄ Runtime Container
    localhost WebSocket

Renderer ⇄ Frame Runtime
    localhost WebSocket

Content API
    localhost HTTP
```

### PWA Profile

```text
Window ⇄ Main Runtime Worker
    MessagePort

Main Runtime Worker ⇄ System Worker
    MessagePort

Window ⇄ Frame Runtime
    每 Frame 一个 MessagePort

Content API
    same-origin Fetch，由 Service Worker 响应
```

WebSocket 与 MessagePort 只是 Transport Profile。它们不得改变方法、身份、顺序、Revision、Resync 和错误语义。

## 8. 身份与顺序

通信系统必须区分：

```text
systemId
    业务子系统身份

frameId
    一次子系统调用实例

activationId
    Frame 的一次活动周期

connectionId
    一次物理或逻辑连接实例

sequence
    一条 Frame 数据连接上的消息顺序

stateRevision / scopeRevision
    客户端目标状态版本

stackRevision
    Renderer 调用栈镜像版本
```

这些编号不能互相替代。

新 Frame 数据连接可以重新从初始 Sequence 开始，但必须先通过身份和 Activation 握手。逻辑 State Revision 可以在重连后保持。

## 9. 输入上行链路

```text
浏览器键盘 / 手柄 / 触摸 / 节点事件
→ Renderer Input Router
→ 归一化输入
→ 当前 Input Target 的 Frame 数据连接
→ Frame Runtime 输入队列
→ 已提交权威状态
```

规则：

- 普通输入只发送给程序主系统声明的 Input Target；
- 持续方向意图可以合并为最新值；
- 确认、取消和其他离散输入保持顺序并有界；
- 页面失焦、Input Target 改变或 Frame 暂停时释放持续意图；
- 旧 Activation 的输入必须拒绝。

## 10. 视图状态下行链路

```text
Frame Runtime 已提交权威状态
→ Client State Projector
→ snapshot / scope.replace / event.emit
→ Frame 数据连接
→ Renderer Validator
→ Frame/Scope Store 原子提交
→ Render Scheduler
→ DOM / Canvas / WebGL
```

State 表示可恢复的当前目标，可以在发送前或呈现前合并为最新值。Event 表示一次性行为，通常需要有序、有界处理，不能替代可恢复 State。

## 11. 恢复原则

- 检测到 Stack Revision 缺口时请求完整 Stack Snapshot；
- 检测到 Frame 数据 Sequence 缺口时停止应用该 Frame 的增量 State，并请求完整 Snapshot；
- 重连后先恢复调用栈，再恢复各有效 Frame 的 Client State；
- 新连接重新开始 Sequence，但逻辑 State Revision 可以保持；
- 旧 Activation 的输入、状态和事件必须被拒绝；
- DOM 不能作为恢复源；
- Service Worker 内存不能作为内容恢复源。

## 12. 背压原则

```text
Scope State
    同一 Frame/Scope 可合并为最新目标

Frame Snapshot
    可以替代尚未发送或尚未呈现的旧增量 State

Event
    有序、有界，溢出必须显式处理

Input
    有序、有界；持续意图可以合并

Control RPC
    不丢弃；超时产生明确错误

Content Body
    使用独立 HTTP / Fetch 流和缓存
```

合并应发生在 Revision 和 Sequence 分配之前，避免人为制造缺口。

## 13. 桌面连接授权

桌面 localhost 连接也视为不可信。程序主系统签发短期 Frame Channel Grant，至少绑定：

```text
sessionId
frameId
activationId
endpoint
一次性高熵 token
expiresAt
```

子系统只监听 loopback 地址。首条消息完成身份认证后，token 立即失效。Frame 出栈或 Activation 失效后撤销连接。

## 14. 安全原则

- 所有消息都视为不可信输入；
- 校验方法权限、Schema、大小、Frame 和 Activation；
- 子系统只能发布自己 Frame 的 Scope；
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
- Frame 数据连接授权与首次 Snapshot 的原子时序；
- Event 溢出策略；
- 最大消息、树深和发送速率的具体 Profile。

## 16. 相关下层文档

- [正式契约目录](../15-contracts/README.md)；
- [生命周期协议草案](../15-contracts/system-lifecycle-protocol.md)；
- [Frame 数据通道 v1](../15-contracts/frame-data-channel-v1.md)；
- [只读 Content API v1](../15-contracts/content-api-v1.md)；
- [现有详细设计：JSON-RPC 与状态同步](../architecture/runtime-rpc-and-state-sync.md)。
