# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：控制面、数据面、顺序、恢复和安全边界  
> 依赖：[系统架构总览](./system-overview.md)  
> 最近复核：2026-07-29

## 1. 设计目标

通信系统使程序主系统、模块子系统和渲染端在独立进程或不同传输环境中保持一致语义，同时避免主系统成为高频输入和状态更新的转发瓶颈。

## 2. 通信拓扑

```text
控制面
    程序主系统 ⇄ 模块子系统
    程序主系统 ⇄ Web 渲染端

数据面
    模块子系统 ⇄ Web 渲染端
```

## 3. 控制面

控制面负责：

- 子系统初始化、激活、暂停、恢复和关闭；
- 子系统调用与返回；
- 调用栈 Snapshot 和增量通知；
- 当前输入目标；
- Frame 数据通道的建立和撤销；
- ready、failure、heartbeat 和诊断。

控制面低频、不可静默丢弃，并需要明确超时和错误。

## 4. 数据面

数据面负责：

- 归一化用户输入；
- 节点事件；
- Frame Client State Snapshot；
- 单 Scope 替换或删除；
- 一次性客户端事件；
- Resync 请求。

普通数据面消息不由程序主系统解释或业务转发。

## 5. JSON-RPC 的位置

JSON-RPC 2.0 用于提供：

- 请求与响应关联；
- 通知语义；
- 方法命名空间；
- 协议错误；
- 跨语言一致的消息 Envelope。

JSON-RPC 不规定传输层。桌面模式可以使用 MessagePort，浏览器开发模式可以使用 WebSocket，其他环境也可以使用 stdio、Pipe 或 Socket。

## 6. 身份与顺序

通信系统必须区分：

```text
frameId
    一次子系统调用实例

activationId
    Frame 的一次活动周期

sequence
    一条连接或数据流上的消息顺序

stateRevision / scopeRevision
    客户端目标状态版本
```

这些编号不能互相替代。

## 7. 恢复原则

- 检测到控制栈 Revision 缺口时，请求完整栈 Snapshot；
- 检测到 Frame 数据 Sequence 缺口时，请求该 Frame 的完整状态；
- 重连后先恢复调用栈，再恢复各有效 Frame 的 Client State；
- 新连接重新开始 Sequence，但逻辑状态 Revision 可以保持；
- 旧 Activation 的输入、状态和事件必须被拒绝；
- DOM 不能作为恢复源。

## 8. 背压原则

```text
Scope State
    可以合并为同一 Frame/Scope 的最新目标状态

Event
    有序、有界，关键事件不能静默丢弃

Input
    有序、有界；持续方向意图可以合并

Control RPC
    不丢弃；超时产生明确错误
```

大型资源内容使用独立资源通道，不能阻塞控制消息和普通输入。

## 9. 安全原则

- 所有消息都视为不可信输入；
- 校验方法权限、Schema、大小、Frame 和 Activation；
- 子系统只能发布自己 Frame 的 Scope；
- 渲染端不能获得任意 IPC Channel；
- Client State 不允许可执行代码、任意 HTML 或物理路径；
- 本机连接也必须执行权限和速率限制。

## 10. 开放问题

需要在契约层进一步冻结：

- `system.returned` 与 `system.resume(result)` 的最终关系；
- 协议版本握手；
- 请求超时和取消；
- 速率和消息大小上限；
- 心跳与进程失联判定；
- 数据端口建立的原子时序。

## 11. 相关下层文档

- [正式契约目录](../15-contracts/README.md)；
- [生命周期协议草案](../15-contracts/system-lifecycle-protocol.md)；
- [现有详细设计：JSON-RPC 与状态同步](../architecture/runtime-rpc-and-state-sync.md)。
