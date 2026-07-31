# Frame 数据通道 v1

> 层级：正式契约  
> 状态：Active / Normative  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Frame Runtime 之间输入上行、视图状态下行、顺序、背压和 Resync 语义  
> 依赖：[通信系统](../10-architecture/communication-system.md)、[Client State Tree v1](./client-state-tree-v1.md)  
> 最近复核：2026-08-01

## 1. 适用范围

本契约定义一个有效 Frame 的双向数据连接。参与方：

- Web Renderer；
- 拥有该 Frame 的模块子系统 Runtime Container 内的 Frame Runtime；
- 程序主系统仅作为通道授权者，不转发普通 Payload。

每个 Frame 有独立数据连接。一个 Runtime Container 可以同时持有多个 Frame 数据连接。

## 2. 非适用范围

本契约不定义：

- Frame 创建、入栈、暂停、恢复和返回；
- Runtime Container 启动和关闭；
- Client Node 的完整 Schema；
- FSDB 和资源主体访问；
- DOM、Canvas 或 WebGL 的实现算法。

相关语义分别由生命周期契约、Client State Tree 和 Content API 定义。

## 3. 连接身份

每条连接绑定：

```ts
interface FrameChannelIdentity {
  readonly protocol: "loom-frame-data";
  readonly protocolVersion: 1;
  readonly sessionId: string;
  readonly systemId: string;
  readonly frameId: string;
  readonly activationId: string;
  readonly connectionId: string;
}
```

规则：

- `frameId` 标识调用实例；
- `activationId` 标识该 Frame 当前活动周期；
- `connectionId` 标识本次物理或逻辑连接；
- 重连必须使用新的 `connectionId`；
- 新 Activation 必须重新授权或显式更新连接身份；
- 进程 ID、Worker 名称和端口号不能代替上述身份。

## 4. JSON-RPC Envelope

控制性请求和业务通知使用 JSON-RPC 2.0 Envelope。

每个数据消息的 `params` 必须包含：

```ts
interface FrameMessageBase {
  readonly frameId: string;
  readonly activationId: string;
  readonly sequence: number;
}
```

`sequence` 是大于零的安全整数。

## 5. 双向 Sequence

连接的两个方向分别维护独立 Sequence：

```text
Renderer → Frame Runtime
    rendererSequence

Frame Runtime → Renderer
    subsystemSequence
```

协议字段都名为 `sequence`，但接收方按消息方向维护独立 `lastSequence`。

规则：

- 每个方向从 1 开始严格递增；
- 重复或更旧 Sequence 忽略并记录诊断；
- `sequence == lastSequence + 1` 时正常处理；
- 出现缺口时停止应用该方向依赖连续性的增量消息；
- 新连接重新从 1 开始；
- Sequence 只表示传输顺序，不代替 State Revision 或输入业务编号。

## 6. 连接建立

### 6.1 桌面 WebSocket Profile

程序主系统签发：

```ts
interface FrameChannelGrant {
  readonly endpoint: string;
  readonly sessionId: string;
  readonly systemId: string;
  readonly frameId: string;
  readonly activationId: string;
  readonly connectionId: string;
  readonly token: string;
  readonly expiresAt: number;
}
```

WebSocket 建立后，Renderer 的第一条请求必须是：

```text
channel.authenticate
```

认证参数包含 Grant 的全部身份和一次性 token。认证成功前不得发送业务消息。token 成功使用后立即失效。

### 6.2 PWA MessagePort Profile

Main Runtime Worker 创建 MessageChannel，将一端转移给 Window，另一端转移给对应 System Worker 的 Frame Runtime。

端口转移本身构成宿主授权，但双方仍必须先交换：

```text
channel.hello
```

并验证 `protocolVersion`、`frameId`、`activationId` 和 `connectionId` 一致后才处理业务消息。

## 7. 上行方法

### 7.1 `input.dispatch`

Renderer 向当前 Input Target 发送归一化普通输入。

```ts
interface InputDispatchParams extends FrameMessageBase {
  readonly input: NormalizedInput;
}
```

规则：

- Renderer 不能发送原始 Browser Event；
- 只有程序主系统当前声明的 Input Target 可以发送普通输入；
- Frame 暂停、关闭或 Activation 失效后拒绝；
- 持续方向意图可以在发送前合并为最新值；
- 确认、取消、攻击、跳跃等离散输入保持顺序并有界；
- Frame Runtime 将合法输入加入该 Frame 的输入队列，不直接修改其他 Frame。

### 7.2 `node.event`

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

### 7.3 `state.resync`

Renderer 在以下情况请求完整状态：

- 下行 Sequence 缺口；
- Snapshot 或 Scope 校验失败；
- Renderer 重载或 Store 丢失；
- 数据连接重建；
- 诊断操作主动请求。

```ts
interface StateResyncParams extends FrameMessageBase {
  readonly reason:
    | "initial-connect"
    | "renderer-reload"
    | "sequence-gap"
    | "validation-failed"
    | "manual";
  readonly knownStateRevision?: number;
}
```

Frame Runtime 必须从当前已提交的 Projector State 生成或重发完整 `state.snapshot`，不能从 DOM 反向恢复。

## 8. 下行方法

### 8.1 `state.snapshot`

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
- 验证失败时保留旧 Store 并请求 Resync；
- Resync 重发可以保持相同 `stateRevision`；
- 较旧 State Revision 不能覆盖较新 Store。

### 8.2 `scope.replace`

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
- 发生 Sequence 缺口后不得继续盲目应用增量 Scope；
- 删除后重新创建同名 Scope 的 Revision 必须保持单调，或先发送完整 Snapshot。

### 8.3 `event.emit`

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
- Event 保持下行 Sequence 顺序；
- Event 队列必须有界；
- 队列溢出不得静默破坏关键语义，具体 Profile 应声明丢弃、降级或断开策略；
- Frame 出栈或 Activation 失效后迟到 Event 必须丢弃。

## 9. State Revision

必须区分：

```text
subsystemRevision
    Frame Runtime 内部权威状态版本，不直接作为通道字段要求

stateRevision
    Frame Client State 版本

scopeRevision
    单 Scope 版本

sequence
    当前连接方向的消息顺序
```

规则：

- 客户端可见状态无变化时不增加 State Revision；
- 任一 Scope 创建、改变或删除时增加 State Revision；
- 改变的 Scope 增加自身 Scope Revision；
- Projection Failure 不消耗 Revision；
- State 合并必须发生在 Revision 和 Sequence 分配之前。

## 10. 投影发布选择

第一阶段规范：

```text
0 个 Scope 改变
→ 不发送 State

1 个 Scope 改变
→ scope.replace

2 个或更多 Scope 改变
→ state.snapshot

初始化、重连、Resync 或 forceSnapshot
→ state.snapshot
```

本契约不定义节点级远程 Patch 或多 Scope Batch Patch。

## 11. Renderer 应用顺序

Renderer 收到下行 State 时：

```text
验证 Frame / Activation
→ 验证下行 Sequence
→ 验证 Revision
→ 验证完整 Scope Tree
→ 原子提交 Frame/Scope Store
→ 标记 dirty Scope
→ requestAnimationFrame 呈现
```

消息回调不得在 Store 提交前直接修改 DOM、Canvas Scene 或 WebGL Scene。

同一显示帧内同一 Frame/Scope 的多个未呈现 State 可以只呈现最新 Store。Event 按队列单独处理。

## 12. 背压

### State

子系统 Projection Scheduler 可以合并连续状态提交，只保留最新不可变 Snapshot。合并后再分配 Revision 和 Sequence。

Renderer 可以合并尚未呈现的同一 Frame/Scope State，但必须先按 Sequence 和 Revision 正确提交 Store。

### Input

持续输入可以合并。离散输入不得静默丢弃。输入队列达到上限时必须返回诊断、拒绝新输入或关闭连接，不能无限增长。

### Event

Event 不采用 latest-wins。实现必须设置最大队列、最大消息大小和溢出策略。

## 13. Activation 切换

Frame 暂停时：

- Renderer 停止发送普通输入并释放持续意图；
- 旧 Activation 失效；
- 已提交 Store 和画面可以保留；
- 旧 Activation 的迟到 State 和 Event 拒绝。

Frame 恢复时程序主系统签发新的 Activation。实现可以：

- 建立新的数据连接；或
- 在受认证控制消息后更新现有连接身份。

第一阶段推荐建立新的 `connectionId`，并请求完整 Snapshot，减少旧消息混入风险。

## 14. Frame 关闭

程序主系统宣布 Frame 出栈后：

```text
Renderer 停止输入
→ 关闭 Frame 数据连接
→ 删除 Frame Store
→ 销毁全部 Scope 呈现对象
→ 清理事件、动画和资源引用
```

子系统不需要逐个发送 Scope 删除。Frame 关闭后的所有迟到消息丢弃并记录诊断。

## 15. 错误

建议稳定错误码：

```text
CHANNEL_AUTH_FAILED
PROTOCOL_VERSION_UNSUPPORTED
FRAME_MISMATCH
ACTIVATION_STALE
SEQUENCE_GAP
MESSAGE_TOO_LARGE
SCHEMA_INVALID
STATE_REVISION_STALE
SCOPE_REVISION_STALE
EVENT_QUEUE_OVERFLOW
FRAME_CLOSED
```

协议错误不得包含本机路径、token 或内部堆栈等敏感信息。

## 16. 安全限制

- 所有消息执行 Schema 和大小校验；
- Client State 不允许任意 HTML、JavaScript、DOM 命令或物理路径；
- Tag 必须来自可信 Renderer Registry；
- Frame Runtime 只能发布自己的 Frame；
- Renderer 只能向当前授权 Frame 发送输入；
- 桌面 WebSocket 只监听 loopback 并验证 Origin 和一次性 token；
- PWA MessagePort 只向同源可信 Worker 转移；
- 连接关闭后不得复用旧 Grant。

## 17. 最小互操作测试

- 初始连接和首次 Snapshot；
- 输入上行与 State 下行；
- 同一 System Container 中两个 Frame 的独立通道；
- Scope Replace 创建、更新和删除；
- 多 Scope Snapshot 原子提交；
- 双向 Sequence 重复、迟到和缺口；
- 旧 Activation 输入、State 和 Event 拒绝；
- State 合并不产生 Sequence 缺口；
- Event 保序和溢出；
- Renderer 重载 Resync；
- Frame 出栈整体清理；
- WebSocket 与 MessagePort Profile 使用同一 Fixture 得到相同 Store 结果。

## 18. 相关文档

- [Client State Tree v1](./client-state-tree-v1.md)；
- [生命周期协议草案](./system-lifecycle-protocol.md)；
- [渲染系统](../10-architecture/rendering-system.md)；
- [Web 渲染端模块](../20-modules/web-renderer/README.md)。
