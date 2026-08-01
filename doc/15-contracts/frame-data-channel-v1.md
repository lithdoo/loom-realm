# Renderer–Subsystem 数据协议 v1

> 文件路径兼容说明：本文件保留 `frame-data-channel-v1.md` 路径，避免现有链接失效；其权威语义已修正为 **每 System 一个物理数据连接、连接内多路复用 Frame Logical Stream**。  
> 层级：正式契约  
> 状态：Active / Normative  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Runtime Container 之间的数据连接、Frame 多路复用、输入上行、视图状态下行、顺序、背压和 Resync 语义  
> 依赖：[通信系统](../10-architecture/communication-system.md)、[Client State Tree v1](./client-state-tree-v1.md)  
> 最近复核：2026-08-01

## 1. 适用范围

本契约定义 Web Renderer 与一个模块子系统 Runtime Container 之间的双向数据协议。

参与方：

- Web Renderer；
- 一个以 `systemId` 标识的 Runtime Container；
- 该 Container 内零个、一个或多个 Frame Runtime；
- 程序主系统仅作为连接授权者和 Frame 生命周期权威，不转发普通 Payload。

核心规则：

```text
每个 systemId
    一个 Renderer ⇄ Runtime Container 物理数据连接

每个 Frame Activation
    一个在该连接内按 frameId + activationId 路由的 Logical Stream
```

一个 Runtime Container 的多个 Frame 共享物理 Transport，但 Frame 的身份、Activation、Sequence、Revision、输入队列和 Client State 相互隔离。

## 2. 非适用范围

本契约不定义：

- Frame 创建、入栈、暂停、恢复和返回的控制事务；
- Runtime Container 启动和关闭；
- Client Node 的完整 Schema；
- FSDB 和资源主体访问；
- DOM、Canvas 或 WebGL 的实现算法。

相关语义分别由生命周期契约、Client State Tree 和 Content API 定义。

## 3. 两层身份模型

协议严格区分物理连接身份和 Frame Logical Stream 身份。

### 3.1 System Data Connection Identity

每条物理数据连接绑定：

```ts
interface SystemDataConnectionIdentity {
  readonly protocol: "loom-renderer-system-data";
  readonly protocolVersion: 1;
  readonly sessionId: string;
  readonly systemId: string;
  readonly connectionId: string;
}
```

规则：

- `sessionId` 标识 LoomRealm 程序会话；
- `systemId` 标识该连接唯一服务的 Runtime Container；
- `connectionId` 标识本次物理或逻辑 Transport 实例；
- 一个 `connectionId` 不得在不同 `systemId` 之间复用；
- Renderer 重连必须使用新的 `connectionId`；
- Frame 创建、暂停、恢复和关闭不会自动创建或关闭物理连接；
- 进程 ID、Worker 名称、端口号和 `frameId` 不能代替连接身份。

### 3.2 Frame Logical Stream Identity

每条 Frame 业务消息的 `params` 必须包含：

```ts
interface FrameMessageBase {
  readonly frameId: string;
  readonly activationId: string;
  readonly sequence: number;
}
```

规则：

- `frameId` 标识该 System Container 内的一次调用实例；
- `activationId` 标识该 Frame 的当前活动周期；
- `sequence` 标识该 Frame Logical Stream 单方向的消息顺序；
- 一个物理连接可以交错承载多个 Frame 的消息；
- 接收方必须先按 `frameId` 路由，再校验 `activationId` 和 Sequence；
- 一个 Frame 的协议故障不得直接污染同连接其他 Frame 的逻辑状态。

## 4. JSON-RPC Envelope

控制性请求和业务通知使用 JSON-RPC 2.0 Envelope。

Frame 业务消息通过 `FrameMessageBase` 完成逻辑流路由。例如：

```json
{
  "jsonrpc": "2.0",
  "method": "input.dispatch",
  "params": {
    "frameId": "frame-map-1",
    "activationId": "activation-8",
    "sequence": 12,
    "input": {}
  }
}
```

同一物理连接上的下一条消息可以属于另一个 Frame：

```json
{
  "jsonrpc": "2.0",
  "method": "state.snapshot",
  "params": {
    "frameId": "frame-map-2",
    "activationId": "activation-3",
    "sequence": 1,
    "stateRevision": 20,
    "scopes": {}
  }
}
```

业务方法不能通过 Payload 声称属于另一个 `systemId`；`systemId` 由已认证的 System Data Connection Identity 决定。

## 5. Sequence

Sequence 不属于整个物理 WebSocket 或 MessagePort，而属于 Frame Logical Stream。

作用域为：

```text
connectionId + frameId + activationId + direction
```

两个方向分别维护独立 Sequence：

```text
Renderer → Frame Runtime
    rendererSequence

Frame Runtime → Renderer
    subsystemSequence
```

规则：

- 每个作用域从 1 开始严格递增；
- 重复或更旧 Sequence 忽略并记录诊断；
- `sequence == lastSequence + 1` 时正常处理；
- 新 Activation 开启新的 Logical Stream epoch，可以从 1 开始；
- 新物理连接产生新的 `connectionId`，恢复后的 Frame Stream 可以从 1 开始；
- Sequence 只表示协议消息顺序，不代替 State Revision 或输入业务编号；
- Frame A 的 Sequence 与 Frame B 完全独立。

### 5.1 下行 Sequence Gap

Renderer 检测到某 Frame 的下行缺口时：

```text
停止应用该 Frame 的后续增量 State
→ 保留该 Frame 已提交 Store
→ state.resync(frameId)
→ 等待完整 state.snapshot
```

同一 System Data Connection 上其他 Frame 继续正常处理。

### 5.2 上行 Sequence Gap

Runtime Container 检测到某 Frame 的上行缺口时，不得猜测丢失的离散输入。第一阶段应：

- 停止接受该 Frame 当前 Logical Stream 的后续普通输入；
- 记录 `SEQUENCE_GAP`；
- 通过诊断/控制面通知程序主系统；
- 等待新的 Activation 或连接恢复流程。

不得因为单 Frame 的上行 Sequence Gap 自动关闭整个 System Data Connection，除非实现检测到连接级协议破坏。

## 6. 连接建立

### 6.1 桌面 WebSocket Profile

程序主系统为 Renderer 与一个 Runtime Container 签发：

```ts
interface SystemDataChannelGrant {
  readonly endpoint: string;
  readonly sessionId: string;
  readonly systemId: string;
  readonly connectionId: string;
  readonly token: string;
  readonly expiresAt: number;
}
```

Grant 不绑定单个 Frame。

WebSocket 建立后，Renderer 的第一条请求必须是：

```text
channel.authenticate
```

认证参数包含 Grant 的连接身份和一次性 token。认证成功前不得发送 Frame 业务消息。token 成功使用后立即失效。

认证成功后，这条 WebSocket 服务该 `systemId` 当前和后续创建的全部 Frame，直到连接关闭、Renderer 重连、Container 退出或会话结束。

### 6.2 PWA MessagePort Profile

Main Runtime Worker 为每个 System Worker 创建一条 Renderer Data MessageChannel：

```text
port A → Window Renderer
port B → 对应 System Worker
```

端口转移本身构成宿主授权，但双方仍必须先交换：

```text
channel.hello
```

并验证 `protocolVersion`、`sessionId`、`systemId` 和 `connectionId` 一致后才处理 Frame 业务消息。

该 Port 服务该 System Worker 中的全部 Frame，不为每个 Frame 再创建 MessagePort。

## 7. Frame Stream 生命周期

Frame Logical Stream 生命周期与物理连接生命周期分离。

### Frame 创建

```text
Main 控制面创建 Frame
→ Renderer Stack Store 获得 frameId / systemId
→ Container 建立 Frame Runtime
→ 使用已有 System Data Connection
→ 首次 state.snapshot / state.resync 建立 Frame Store
```

若该 System Data Connection 尚不存在，Main 先授权建立 System 连接。

### Frame 暂停

- Renderer 停止向该 Frame 发送普通输入并释放持续意图；
- 旧 Activation 失效；
- 已提交 Store 和画面可以保留；
- System Data Connection 保持；
- 旧 Activation 的迟到 State 和 Event 拒绝。

### Frame 恢复

- 程序主系统签发新的 `activationId`；
- 在同一个 System Data Connection 上形成新的 Logical Stream epoch；
- 双向 Sequence 从 1 开始；
- Renderer 对恢复后的 Frame 请求或等待完整 Snapshot；
- 不因为 Activation 更新重建物理连接。

### Frame 关闭

```text
Renderer 停止该 Frame 输入
→ 删除该 Frame Stream 状态
→ 删除 Frame Store
→ 销毁全部 Scope 呈现对象
→ 清理事件、动画和资源引用
```

关闭一个 Frame 不关闭共享的 System Data Connection。

## 8. 上行方法

### 8.1 `input.dispatch`

Renderer 向当前 Input Target 发送归一化普通输入。

```ts
interface InputDispatchParams extends FrameMessageBase {
  readonly input: NormalizedInput;
}
```

规则：

- Renderer 不能发送原始 Browser Event；
- Renderer 必须选择该 Frame 所属 `systemId` 的 System Data Connection；
- 只有程序主系统当前声明的 Input Target 可以发送普通输入；
- Frame 暂停、关闭或 Activation 失效后拒绝；
- 持续方向意图可以在发送前合并为最新值；
- 确认、取消、攻击、跳跃等离散输入保持顺序并有界；
- Runtime Container 按 `frameId` 找到 Frame Runtime，并将合法输入加入该 Frame 的输入队列。

### 8.2 `node.event`

可信 Node Renderer 产生交互事件时发送：

```ts
interface NodeEventParams extends FrameMessageBase {
  readonly scopeId: string;
  readonly key: string;
  readonly eventType: string;
  readonly data: JsonValue;
}
```

规则：

- 完整节点身份是 `frameId + scopeId + key`；
- `eventType` 和 `data` 必须满足该 Tag 在 Renderer Registry 中声明的事件 Schema；
- Renderer 不允许一个 Frame 的节点事件路由到另一个 Frame；
- 子系统必须验证节点在当前 Client State 中可解释，或按其业务规则拒绝迟到事件。

### 8.3 `state.resync`

Renderer 在以下情况对指定 Frame 请求完整状态：

- 该 Frame 下行 Sequence 缺口；
- Snapshot 或 Scope 校验失败；
- Renderer 重载或 Store 丢失；
- System Data Connection 重建；
- Frame 恢复后的新 Activation；
- 诊断操作主动请求。

```ts
interface StateResyncParams extends FrameMessageBase {
  readonly reason:
    | "initial-connect"
    | "renderer-reload"
    | "connection-rebuild"
    | "activation-resume"
    | "sequence-gap"
    | "validation-failed"
    | "manual";
  readonly knownStateRevision?: number;
}
```

Frame Runtime 必须从当前已提交的 Projector State 生成或重发完整 `state.snapshot`，不能从 DOM 反向恢复。

`state.resync` 只作用于目标 Frame，不重置同连接其他 Frame。

## 9. 下行方法

### 9.1 `state.snapshot`

发送完整 Frame Client State：

```ts
interface StateSnapshotParams extends FrameMessageBase {
  readonly stateRevision: number;
  readonly scopes: Readonly<Record<string, ClientScope>>;
  readonly cause?: string;
}
```

规则：

- Snapshot 内全部 Scope 必须先在子系统内原子投影和校验；
- Renderer 必须验证全部 Scope 后原子替换该 Frame Store；
- 验证失败时保留旧 Store并仅请求该 Frame Resync；
- Resync 重发可以保持相同 `stateRevision`；
- 较旧 State Revision 不能覆盖较新 Store。

### 9.2 `scope.replace`

创建、替换或删除单个 Scope：

```ts
interface ScopeReplaceParams extends FrameMessageBase {
  readonly stateRevision: number;
  readonly scopeId: string;
  readonly scopeRevision: number;
  readonly value: ClientScope | null;
}
```

`value: null` 表示删除 Scope。

规则：

- 仅在一次投影事务只有一个 Scope 变化时使用；
- Renderer 原子替换或删除该 Scope；
- 较旧 Scope Revision 不能覆盖较新 Scope；
- 该 Frame 发生 Sequence 缺口后不得继续盲目应用增量 Scope；
- 删除后重新创建同名 Scope 的 Revision 必须保持单调，或先发送完整 Snapshot。

### 9.3 `event.emit`

发送一次性客户端表现事件：

```ts
interface ClientEventParams extends FrameMessageBase {
  readonly eventId: string;
  readonly eventType: string;
  readonly data: JsonValue;
  readonly relatedStateRevision?: number;
}
```

规则：

- Event 适合音效、伤害数字、屏幕震动和临时粒子；
- Event 不能替代角色位置、HP、菜单内容或对话文本等可恢复 State；
- Event 保持所属 Frame Logical Stream 的下行 Sequence 顺序；
- Event 队列必须按 Frame 隔离并有界；
- 队列溢出不得静默破坏关键语义，具体 Profile 应声明丢弃、降级或流级故障策略；
- Frame 出栈或 Activation 失效后迟到 Event 必须丢弃。

## 10. State Revision

必须区分：

```text
subsystemRevision
    Frame Runtime 内部权威状态版本，不直接作为通道字段要求

stateRevision
    Frame Client State 版本

scopeRevision
    单 Scope 版本

sequence
    Frame Logical Stream 单方向的消息顺序

connectionId
    System Data Transport 实例
```

规则：

- 客户端可见状态无变化时不增加 State Revision；
- 任一 Scope 创建、改变或删除时增加 State Revision；
- 改变的 Scope 增加自身 Scope Revision；
- Projection Failure 不消耗 Revision；
- State 合并必须发生在 Revision 和 Sequence 分配之前；
- 物理连接重建不要求改变 State Revision。

## 11. 投影发布选择

第一阶段规范保持：

```text
0 个 Scope 改变
→ 不发送 State

1 个 Scope 改变
→ scope.replace

2 个或更多 Scope 改变
→ state.snapshot

初始化、连接重建、Activation 恢复、Resync 或 forceSnapshot
→ state.snapshot
```

本次连接粒度修订不改变 Client State 更新单位；第一阶段仍不定义节点级远程 Patch 或多 Scope Batch Patch。

## 12. Renderer 应用顺序

Renderer 收到下行 State 时：

```text
根据 systemId 连接接收消息
→ 根据 frameId 找到 Frame
→ 验证 Activation
→ 验证该 Frame Logical Stream 下行 Sequence
→ 验证 Revision
→ 验证完整 Scope Tree
→ 原子提交 Frame/Scope Store
→ 标记 dirty Scope
→ requestAnimationFrame 呈现
```

消息回调不得在 Store 提交前直接修改 DOM、Canvas Scene 或 WebGL Scene。

同一显示帧内同一 Frame/Scope 的多个未呈现 State 可以只呈现最新 Store。Event 按 Frame 队列单独处理。

## 13. 背压与多 Frame 公平性

### State

子系统 Projection Scheduler 可以按 Frame 合并连续状态提交，只保留最新不可变 Snapshot。合并后再分配 Revision 和 Sequence。

Renderer 可以合并尚未呈现的同一 Frame/Scope State，但必须先按该 Frame 的 Sequence 和 Revision 正确提交 Store。

### Input

持续输入可以合并。离散输入不得静默丢弃。输入队列达到上限时必须返回诊断、拒绝新输入或使该 Frame Stream 失败，不能无限增长。

### Event

Event 不采用 latest-wins。实现必须按 Frame 设置最大队列、最大消息大小和溢出策略。

### Shared Transport

Runtime Container 和 Renderer 的发送调度器必须避免单个 Frame 无限占用共享 Transport：

- State 合并按 Frame 独立执行；
- 离散 Input/Event 保持所属 Frame 内顺序；
- 不要求不同 Frame 之间存在全局业务顺序；
- 大型资源主体禁止进入该数据连接。

## 14. System Data Connection 关闭

System Data Connection 通常只在以下情况关闭：

- Renderer 退出或重载；
- Runtime Container 退出；
- 程序会话结束；
- 连接认证失败；
- Transport 故障或连接级协议破坏。

以下情况不会自动关闭物理连接：

- 单个 Frame 暂停；
- 单个 Frame 恢复；
- 单个 Frame 出栈；
- 单个 Frame Resync；
- 单个 Frame Sequence Gap。

Renderer 重建 System Data Connection 后，应根据 Main 的当前 Stack/Frame 信息，对该 `systemId` 下仍有效的 Frame 分别执行 Resync。

## 15. 错误

建议稳定错误码：

```text
CHANNEL_AUTH_FAILED
PROTOCOL_VERSION_UNSUPPORTED
SYSTEM_MISMATCH
FRAME_MISMATCH
ACTIVATION_STALE
SEQUENCE_GAP
MESSAGE_TOO_LARGE
SCHEMA_INVALID
STATE_REVISION_STALE
SCOPE_REVISION_STALE
EVENT_QUEUE_OVERFLOW
FRAME_CLOSED
CONNECTION_CLOSED
```

错误必须区分：

```text
Connection-level
    认证、协议版本、System 身份、Transport 破坏
    可以关闭整个 System Data Connection

Frame-stream-level
    Frame 不存在、旧 Activation、Sequence Gap、State 校验失败
    默认只影响目标 Frame Logical Stream
```

协议错误不得包含本机路径、token 或内部堆栈等敏感信息。

## 16. 安全限制

- 所有消息执行 Schema 和大小校验；
- 物理连接认证绑定 `sessionId + systemId + connectionId`；
- Client State 不允许任意 HTML、JavaScript、DOM 命令或物理路径；
- Tag 必须来自可信 Renderer Registry；
- Runtime Container 只能发布自己拥有的 Frame；
- Renderer 只能向当前授权 Frame 发送普通输入；
- 桌面 WebSocket 只监听 loopback 并验证 Origin 和一次性 token；
- PWA 数据 MessagePort 只向对应 System Worker 转移；
- Frame 关闭后不得复用旧 Logical Stream；
- 连接关闭后不得复用旧 Grant。

## 17. 最小互操作测试

- System Data Connection 初始认证 / hello；
- 同一 System Container 中两个 Frame 共用一条物理 Transport；
- 两个 Frame 的输入、State、Event 和 Sequence 完全隔离；
- 关闭 Frame A 不关闭 Transport，也不影响 Frame B；
- Frame A 下行 Sequence Gap 只触发 A 的 Resync；
- Frame A 旧 Activation 消息不影响 Frame B；
- 初始 Frame Snapshot；
- Scope Replace 创建、更新和删除；
- 多 Scope Snapshot 原子提交；
- State 合并不产生 Sequence 缺口；
- Event 保序和溢出；
- Renderer 重载后每 System 重建一条 Transport，并逐 Frame Resync；
- Container 退出关闭其 System Data Connection 并影响全部 Frame；
- WebSocket 与 MessagePort Profile 使用同一 Fixture 得到相同 Frame Store 结果。

## 18. 相关文档

- [Client State Tree v1](./client-state-tree-v1.md)；
- [生命周期协议草案](./system-lifecycle-protocol.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [渲染系统](../10-architecture/rendering-system.md)；
- [Web 渲染端模块](../20-modules/web-renderer/README.md)。
