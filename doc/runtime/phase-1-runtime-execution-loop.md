# 第一阶段地图子系统 Runtime Execution Loop

> 状态：**Active Design**  
> 适用范围：内置 `loom.map` 模块子系统  
> 最近复核：2026-07-28  
> 主要定义：地图 Core 串行执行、固定 Tick、队列、Effect Barrier 和事务发布

相关文档：

- [`../architecture/main-system-and-subsystems.md`](../architecture/main-system-and-subsystems.md)：程序主系统和 Frame 生命周期；
- [`phase-1-runtime-core.md`](./phase-1-runtime-core.md)：地图子系统同步 Core；
- [`phase-1-session-coordinator.md`](./phase-1-session-coordinator.md)：地图异步内容准备；
- [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md)：地图 Frame 的 Client State 投影。

核心原则：

> 本 Execution Loop 只调度 `loom.map` 子系统内部 Runtime Core。程序主系统调用栈不经过该 Loop，其他子系统也不要求实现固定 Tick。

## 1. 职责

Execution Loop 负责：

- 作为 Map Runtime Core 的唯一写入口；
- 串行执行 Command、Tick 和 Control Operation；
- 防止并发和重入；
- 使用单调时钟驱动固定 Tick；
- 维护控制队列和普通命令队列；
- 限制追赶 Tick 和队列容量；
- 建立和完成 Effect Barrier；
- 产生 Runtime Transaction；
- 在事务边界读取不可变 Snapshot；
- 向地图子系统 Projection Scheduler 发布状态 Frame；
- 管理地图 Runtime 启动、失败和关闭。

不负责：

- 程序主系统 `system.call` 和 `system.return`；
- 启动其他子系统进程；
- Renderer 连接；
- 加载地图和人物；
- 生成 Scope Tree；
- 执行 DOM 或资源 I/O。

## 2. 串行模型

```text
外部请求
→ 入队
→ 单一 Drain Loop
→ 一次只调用一个 Core 方法
→ 产生 Transaction 和 Snapshot
→ 事务结束后安排投影
```

任何代码不得绕过 Loop 持有可写 Core 引用。

## 3. 操作类型

```ts
type LoopOperation =
  | MapCommandOperation
  | TickOperation
  | ControlOperation;
```

### 3.1 普通命令

来源：Renderer 直接发送到地图子系统的数据通道。

```text
input.dispatch
→ 地图输入适配器
→ MapCommand
→ executionLoop.submitCommand(command)
```

### 3.2 Tick

由 Loop 内部固定步长调度器产生，外部不能任意提交 Tick。

### 3.3 Control Operation

包括：

```text
initialize
pause
resume
commitMapTransition
fail
close
beginEffect
completeEffect
```

地图子系统收到程序主系统 `system.suspend/resume/close` 后，可以把对应生命周期动作转换为 Control Operation。

## 4. 队列

使用两个逻辑队列：

```text
Control Queue
    生命周期和 Effect 操作

Command Queue
    用户输入转换后的普通地图命令
```

处理优先级：

```text
Control Queue
→ Command Queue
→ 到期 Tick
```

控制操作不能被普通输入洪峰长期阻塞。

## 5. 第一阶段默认参数

```text
fixedTickMs              20ms / 50Hz
maxCatchUpTicksPerTurn   5
maxCatchUpTimeMs         100ms
commandQueueCapacity     256
maxCommandsPerTurn       64
```

这些是默认设计参数，实现可以配置，但测试必须覆盖默认值。

## 6. 单调时钟和固定 Tick

```text
now = monotonicClock.now()
elapsed = now - previous
accumulator += elapsed

while accumulator >= fixedTickMs
  and catchUpTicks < maxCatchUpTicksPerTurn:
    core.tick(fixedTickMs)
    accumulator -= fixedTickMs
```

规则：

- 不使用系统墙钟推进逻辑时间；
- 单次 Tick 的 `deltaMs` 固定；
- 不把过长真实时间一次性传给 Core；
- 超出追赶上限时记录过载诊断并保留有限剩余；
- 暂停时不推进逻辑 Tick。

## 7. 命令背压

普通命令队列有界。

队列满时：

- 离散确认、交互等命令返回明确过载错误；
- 连续方向意图可以按玩家和输入类型合并为最新值；
- 不允许无界积累浏览器帧级输入；
- 程序主系统控制消息不进入该命令队列。

## 8. Runtime Transaction

每次 Core 操作产生：

```ts
interface RuntimeTransaction {
  readonly id: number;
  readonly operation: string;
  readonly beforeRevision: number;
  readonly afterRevision: number;
  readonly changed: boolean;
  readonly events: readonly MapRuntimeEvent[];
  readonly effects: readonly MapRuntimeEffect[];
  readonly snapshot: MapRuntimeSnapshot;
}
```

Transaction ID 表示地图 Core 操作顺序，不等于 Frame ID、Runtime Revision 或 JSON-RPC Sequence。

## 9. 投影发布

事务结束后：

```text
RuntimeTransaction
+ MapRuntimeSnapshot
+ Map Session Snapshot
+ Projection Cause
→ Projection Scheduler
```

Loop 不直接生成 Scope，也不在 Core 调用栈内执行深结构投影。

普通 Tick 的状态 Frame可以合并；Runtime Event 不得通过 Projection Scheduler 丢弃。

## 10. Effect Barrier

地图切换需要异步加载，但 Core 不能 await。

```text
Core 产生 MapTransitionEffect
→ Loop 建立 Effect Barrier
→ 停止普通命令和 Tick
→ Coordinator 异步准备目标地图
→ Control Queue 提交 Prepared Transition
→ Core 同步原子提交
→ 完成 Effect
→ 恢复命令和 Tick
```

Barrier 状态至少包含：

```ts
interface EffectBarrier {
  readonly effectId: string;
  readonly type: "map.transition";
}
```

Barrier 期间：

- 控制操作仍可执行；
- 普通命令不得进入 Core；
- Tick 不推进；
- 新输入可以拒绝或按策略丢弃；
- 程序主系统仍然可以关闭整个地图子系统。

## 11. 暂停与程序主系统

程序主系统暂停地图 Frame 时：

```text
system.suspend
→ 地图子系统停止接收 Renderer 输入
→ executionLoop.pause()
→ 停止 Tick
→ 已发布 world/hud Scope 保留
```

恢复时：

```text
system.resume(new activationId, child result)
→ 地图子系统处理返回结果
→ executionLoop.resume()
→ 必要时重新投影
→ 恢复 Renderer 输入
```

调用栈暂停和地图 Core pause 语义必须由地图子系统适配器明确对应，但调用栈本身不进入 Core State。

## 12. 启动

```text
system.initialize(map params)
→ Coordinator 异步准备入口内容
→ executionLoop.start(prepared initialization)
→ Core 初始化成功
→ 首次 Snapshot
→ 地图 Projector 首次投影
→ 子系统 system.ready
```

首次有效 Scope Snapshot 可生成前，不应报告地图子系统完全 ready。

## 13. 关闭

```text
system.close
→ 停止接收输入
→ 停止调度新 Tick
→ 排入 close Control Operation
→ Core close
→ 拒绝后续操作
→ 释放定时器和队列
→ Coordinator/Repository 清理
```

关闭必须有超时。超时后程序主系统可以终止子系统进程。

## 14. 故障

Loop 进入 failed 的情况：

- Core 抛出未处理错误；
- 事务不变量被破坏；
- 时钟返回非法值；
- 队列内部状态损坏；
- Effect ID 不匹配；
- 已关闭后仍发生内部写入。

进入 failed 后：

- 停止 Tick；
- 拒绝普通命令；
- 允许读取最终 Snapshot 和诊断；
- 地图子系统向程序主系统发送 `system.failed`；
- 程序主系统决定将其转为 failed SystemResult 或使会话失败。

## 15. 非目标

本 Loop 不提供：

- 通用模块子系统调度框架；
- 多子系统共享 Tick；
- 跨进程分布式事务；
- Renderer 输入路由；
- 任意并行 Core 写入；
- 后台或 Sidecar 系统执行图。

## 16. 测试

至少覆盖：

- Core 不并发和不重入；
- 控制队列优先；
- 50Hz 固定 Tick；
- 有限追赶；
- 命令队列容量；
- 方向意图合并；
- Barrier 期间无 Tick 和普通命令；
- Prepared Map Transition 原子提交；
- suspend/resume/close 适配；
- Transaction、Revision 和 Sequence 不混用；
- 故障后停止写入。

## 17. 当前结论

```text
Renderer 输入
→ 地图子系统数据通道
→ Map Command Queue
→ Runtime Execution Loop
→ Runtime Core
→ Transaction / Snapshot
→ 地图 Projector
→ Renderer Scope
```

Execution Loop 是地图子系统内部 Core 的唯一写入口，不是 LoomRealm 程序主系统的调用栈。