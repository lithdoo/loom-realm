# 模块子系统 Client State Projector

> 状态：**Active Design**  
> 适用范围：所有需要向渲染端发布 Scope 的模块子系统  
> 最近复核：2026-07-28  
> 主要定义：子系统内部状态到 Frame Client State 的投影、Revision、发布选择和错误边界

相关文档：

- [`main-system-and-subsystems.md`](./main-system-and-subsystems.md)：子系统和 Frame；
- [`client-state-tree-protocol.md`](./client-state-tree-protocol.md)：Scope Tree 结构；
- [`runtime-rpc-and-state-sync.md`](./runtime-rpc-and-state-sync.md)：状态消息；
- [`../design/web-client-reconciliation.md`](../design/web-client-reconciliation.md)：客户端协调。

核心原则：

> 每个模块子系统自行决定如何把自身权威状态投影为自己 Frame 拥有的 Scope。程序主系统不生成、合并或解释业务 Scope。

## 1. 模块位置

```text
子系统命令 / Tick / 内部状态机
        ↓ 已提交的不可变状态
Projection Scheduler（可选）
        ↓ latest Projection Frame
Client State Projector
        ↓ snapshot / scope-replace / unchanged
子系统数据通道
        ↓
Web 渲染端
```

子系统可以使用不同的内部实现。只有最终 Scope Tree 和发布语义是公共协议。

## 2. 职责

Projector 负责：

- 读取子系统已提交的不可变状态；
- 按功能生成一个或多个 Scope；
- 校验 Scope、Key、Tag、Data 和 Children；
- 比较新旧 Scope；
- 分配 Frame Client State Revision 和 Scope Revision；
- 原子产生发布结果；
- 为渲染端 Resync 生成完整 Frame Snapshot。

Projector 不负责：

- 修改子系统权威状态；
- 参与程序主系统调用栈；
- 处理 `system.call` 或 `system.return`；
- 执行文件或网络 I/O；
- 直接操作 DOM；
- 生成其他 Frame 的 Scope。

## 3. 投影输入

公共层不规定具体 Snapshot 类型。一个子系统可以定义：

```ts
interface SubsystemProjectionInput<TSnapshot> {
  readonly frameId: string;
  readonly activationId: string;
  readonly cause: string;
  readonly subsystemRevision: number;
  readonly snapshot: TSnapshot;
  readonly forceSnapshot: boolean;
}
```

投影输入必须来自已提交状态，不能指向正在被修改的对象。

## 4. Scope Projector

子系统可以按功能注册 Scope Projector：

```ts
interface ScopeProjector<TSnapshot> {
  readonly scopeId: string;

  project(snapshot: TSnapshot): readonly ClientNode[] | null;
}
```

返回语义：

```text
ClientNode[]
    Scope 存在，roots 可以为空

null
    Scope 不存在，应删除
```

Scope Projector 应同步、确定性且无 I/O。资源主体不应在投影时读取，节点 Data 只携带逻辑资源 Key。

## 5. Frame Client State

Projector 持有当前 Frame 的最后一次已提交客户端状态：

```ts
interface ProjectionState {
  readonly frameId: string;
  readonly stateRevision: number;
  readonly scopes: Readonly<Record<string, ClientScope>>;
}
```

不同 Frame 的 Projector 状态完全独立。

Frame 暂停不要求删除 Projector 状态。Frame 恢复后可以继续投影，也可以强制完整 Snapshot。

## 6. 原子投影

一次投影流程：

```text
读取全部目标 Scope
→ 校验全部 Scope Tree
→ 与旧状态比较
→ 计算全部新 Revision
→ 构造完整候选 Frame Client State
→ 一次性提交 Projector 内部状态
→ 返回发布结果
```

任何 Scope 生成或校验失败：

- 不提交部分新状态；
- 不增加 State Revision；
- 不增加 Scope Revision；
- 不回滚已经提交的子系统业务状态；
- 向子系统报告 Projection Failure。

子系统可以选择进入失败状态或使用一个经过验证的错误 Scope，但不得发布半棵树。

## 7. Revision

```text
Subsystem Revision
    子系统内部权威状态版本

Frame Client State Revision
    当前 Frame 客户端目标状态版本

Scope Revision
    单 Scope 目标树版本

JSON-RPC Sequence
    数据通道消息顺序
```

规则：

- 客户端可见状态无变化时不增加 Client State Revision；
- Scope 内容变化、创建或删除时增加该 Scope Revision；
- 任一 Scope 变化时增加 Frame Client State Revision；
- 删除后重新创建同名 Scope，Revision 必须大于之前值，或重新建立完整 Frame Snapshot；
- Projection Failure 不消耗 Revision。

## 8. 结构比较

第一阶段使用确定性深结构比较：

```text
Scope A 与 Scope B 相等
⇔ roots 顺序、key、tag、data、children 全部相等
```

不比较：

- DOM Element；
- 对象引用；
- 属性插入顺序；
- 本地动画；
- 资源缓存状态。

实现可以后续引入确定性 Fingerprint，但不得改变协议可见语义。

## 9. 发布结果

```ts
type ProjectionCommit =
  | { readonly type: "unchanged" }
  | {
      readonly type: "scope-replace";
      readonly stateRevision: number;
      readonly scopeId: string;
      readonly value: ClientScope | null;
    }
  | {
      readonly type: "snapshot";
      readonly state: FrameClientState;
    };
```

发布选择：

```text
0 个 Scope 变化
→ unchanged

1 个 Scope 变化
→ scope-replace

2 个或更多 Scope 变化
→ state.snapshot

forceSnapshot
→ state.snapshot
```

Projector 不分配 JSON-RPC Sequence；Sequence 由子系统数据通道分配。

## 10. Projection Scheduler

高频子系统可以使用 Scheduler：

- 将投影移出业务状态提交回调栈；
- 合并连续普通 Tick 的状态投影请求；
- 只保留最新不可变 Snapshot；
- 合并 `forceSnapshot`；
- 不合并或丢弃一次性 Event。

菜单、对话等低频子系统可以在每次已提交状态变化后直接投影，不强制实现 Scheduler。

## 11. Frame 生命周期

### 11.1 初始化

子系统初始化并验证调用参数后，生成首次完整 Frame Snapshot。完成首次投影前不应报告完全 ready。

### 11.2 激活

主系统签发 `activationId`。子系统状态消息必须使用该 Activation。

### 11.3 暂停

- 停止普通输入；
- 可以停止 Tick；
- 已发布 Scope 保留在客户端；
- 不自动删除 Projector 状态。

### 11.4 恢复

- 接收新的 `activationId`；
- 处理子调用返回结果；
- 必要时重新投影；
- 迟到的旧 Activation 消息不得发布。

### 11.5 出栈

Projector 不需要逐个发布 Scope 删除。程序主系统通知渲染端移除整个 Frame，客户端一次性清理该 Frame 的所有 Scope。

## 12. 地图子系统实例

第一阶段 `loom.map` 子系统的投影输入可以包含：

```text
Runtime Snapshot
+ Map Session Snapshot
+ Runtime Transaction ID
+ Projection Cause
```

地图子系统可以发布：

```text
world
hud
loading
error
debug
```

地图切换提交通常同时改变多个 Scope，因此强制发布该 Frame 的完整 Snapshot。

这些 Scope 和 Snapshot 类型属于地图子系统，不属于通用 Projector 协议。

## 13. 其他子系统实例

菜单子系统可以只维护：

```text
Menu State
→ menu Scope
```

对话子系统可以只维护：

```text
Dialog State
→ dialog Scope
```

它们不需要实现地图 Runtime Core、固定 Tick 或 Session Coordinator。

## 14. Resync

收到渲染端 `state.resync` 后，子系统：

1. 验证 Frame 和 Activation；
2. 读取当前已提交 Projector State；
3. 发送完整 `state.snapshot`；
4. 不必增加 State Revision；
5. 在新连接上分配新的 Sequence。

Projector State 不存在或损坏时，子系统必须重新从权威状态投影，不能从 DOM 反向恢复。

## 15. 当前结论

```text
每个子系统
    拥有自己的权威状态
        ↓
    拥有自己的 Client State Projector
        ↓
    发布自己的 Frame Scopes
        ↓
Web 渲染端按 Frame 合并和呈现
```

Client State Projector 是模块子系统内部的呈现投影边界，不再是所有业务必须经过的单一全局 Runtime 模块。