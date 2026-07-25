# 第一阶段 Runtime Execution Loop

## 1. 文档目的

本文档定义 LoomRealm 第一阶段 `Runtime Execution Loop` 的职责边界、串行执行模型、固定 Tick、单调时钟、操作队列、Effect 屏障、关闭和故障行为。

相关文档：

- [`phase-1-runtime-core.md`](./phase-1-runtime-core.md)：定义同步、确定性的权威游戏状态机；
- [`phase-1-session-coordinator.md`](./phase-1-session-coordinator.md)：定义异步内容准备和地图切换协调；
- [`../architecture/runtime-rpc-and-state-sync.md`](../architecture/runtime-rpc-and-state-sync.md)：定义 Runtime Service 与 Web Client 的通信边界。

核心原则：

> Runtime Execution Loop 决定 Runtime Core 何时执行；Runtime Core 决定执行什么游戏规则。

第一阶段必须满足：

- Runtime Core 只有一个写入口；
- 所有 Core 操作严格串行；
- Core 调用期间不执行 `await`；
- Tick 使用单调时钟和固定逻辑步长；
- 暂停期间不累计逻辑时间债务；
- 异步 Effect 产生后立即建立执行屏障；
- Runtime Service 和 Session Coordinator 不直接调用 Core；
- Client State Projector 不进入游戏状态事务。

## 2. 模块位置

```text
Runtime Service
    └── submitCommand()
              ↓

Session Coordinator
    ├── pause()
    ├── commitMapTransition()
    ├── completeEffect()
    └── resume()
              ↓

Runtime Execution Loop
    ├── Control Queue
    ├── Command Queue
    ├── Monotonic Clock
    ├── Tick Accumulator
    ├── Scheduler
    ├── Effect Barrier
    └── Transaction Publisher
              ↓

Runtime Core
    ├── initialize()
    ├── dispatch()
    ├── tick()
    ├── pause()
    ├── resume()
    ├── commitMapTransition()
    ├── fail()
    └── close()
```

第一阶段冻结：

```text
Runtime Service ─┐
                 ├──> Runtime Execution Loop ───> Runtime Core
Coordinator ─────┘
```

其他模块不得持有可写 Runtime Core 引用。

## 3. 职责边界

Runtime Execution Loop 负责：

- 私有持有 Runtime Core；
- 串行执行所有 Core 写操作；
- 防止 Core 重入；
- 使用单调时钟计算经过时间；
- 使用固定步长调用 `core.tick()`；
- 管理 Tick 时间累积和追赶上限；
- 管理控制操作和普通命令队列；
- 对普通命令队列实施容量限制；
- 为每次 Core 调用生成 Runtime Transaction；
- 发布 Runtime Event 和 Runtime Effect；
- Effect 产生后冻结普通命令和 Tick；
- 管理启动、停止和故障生命周期；
- 在明确事务边界读取 Runtime Snapshot。

Runtime Execution Loop 不负责：

- 人物移动、碰撞和 Portal 规则；
- Repository 和游戏包读取；
- 异步加载地图或人物；
- Session 状态机；
- JSON-RPC、WebSocket 或 HTTP；
- Client State、Scope Tree 或 DOM；
- 图片等资源主体读取；
- 存档；
- 多会话调度。

## 4. 所有权规则

Runtime Core 实例是 Execution Loop 的私有依赖：

```ts
class DefaultRuntimeExecutionLoop {
  constructor(
    private readonly core: RuntimeCore,
    private readonly clock: MonotonicClock,
    private readonly scheduler: RuntimeScheduler,
    private readonly sink: RuntimeExecutionSink,
    private readonly options: RuntimeExecutionOptions,
  ) {}
}
```

禁止：

```ts
runtimeService.runtime.dispatch(command);
coordinator.runtime.pause();
projector.runtime.getSnapshot();
```

必须改为：

```ts
await executionLoop.submitCommand(command);
await executionLoop.pause();
await executionLoop.readSnapshot();
```

Core 保持同步。Execution Loop 的 Promise 只表示操作需要等待队列轮次，不表示 Core 内部变为异步。

## 5. Execution Loop 生命周期

```ts
type RuntimeExecutionState =
  | "created"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";
```

| 状态 | 含义 |
|---|---|
| `created` | 尚未初始化 Core，Scheduler 未启动 |
| `running` | 接受操作并驱动 Tick |
| `stopping` | 已进入关闭屏障，不再接受普通命令 |
| `stopped` | Scheduler 已停止，Core 已关闭 |
| `failed` | Core、Loop 或必需 Sink 遇到不可恢复错误 |

Execution Loop 生命周期与 Runtime Core 生命周期不同：

```text
Execution Loop Lifecycle
    调度器、队列和操作入口生命周期

Runtime Core Lifecycle
    权威游戏状态生命周期
```

Effect 等待状态不是新的 Loop Lifecycle，而是 `running` 上的正交屏障状态：

```ts
interface RuntimeExecutionStatus {
  readonly state: RuntimeExecutionState;
  readonly pendingEffect: RuntimePendingEffect | null;
}
```

## 6. 最小公开接口

```ts
interface RuntimeExecutionLoop {
  readonly state: RuntimeExecutionState;
  readonly pendingEffect: RuntimePendingEffect | null;

  start(
    input: RuntimeInitialization,
  ): Promise<RuntimeTransaction>;

  submitCommand(
    command: GameCommand,
  ): Promise<RuntimeTransaction>;

  pause(): Promise<RuntimeTransaction>;

  resume(): Promise<RuntimeTransaction>;

  commitMapTransition(
    transition: PreparedMapTransition,
  ): Promise<RuntimeTransaction>;

  completeEffect(
    effectId: number,
  ): Promise<void>;

  fail(
    error: RuntimeFailure,
  ): Promise<RuntimeTransaction>;

  readSnapshot(): Promise<RuntimeSnapshot>;

  close(): Promise<void>;
}
```

所有公开操作进入 Execution Loop，而不是直接调用 Core。

## 7. 操作类型

```ts
type RuntimeExecutionOperation =
  | InitializeOperation
  | CommandOperation
  | PauseOperation
  | ResumeOperation
  | CommitMapTransitionOperation
  | CompleteEffectOperation
  | FailOperation
  | ReadSnapshotOperation
  | CloseOperation;
```

第一阶段将操作分为两个队列。

### 7.1 Control Queue

控制操作包括：

```text
initialize
pause
resume
commit-map-transition
complete-effect
fail
read-snapshot
close
```

控制操作：

- 按入队顺序 FIFO；
- 优先于普通 Command；
- 可以在 Runtime 暂停或 Effect Pending 时执行；
- 不受普通命令容量限制；
- 仍必须串行调用 Core。

### 7.2 Command Queue

普通命令包括：

```text
GameCommand
```

普通命令：

- 按入队顺序 FIFO；
- 只在 Loop `running` 且没有 Pending Effect 时执行；
- 队列容量有上限；
- Session `loading` 期间不应由 Runtime Service 提交；
- Effect 屏障建立时，尚未执行的普通命令被拒绝，不进行地图切换后重放。

### 7.3 Tick

Tick 不进入操作队列。

Tick 由：

```text
Monotonic Clock
+ Tick Accumulator
+ Fixed Tick Step
```

驱动。

这样进程卡顿时不会产生大量积压的 Tick Queue Item。

## 8. 调度顺序

每次 Pump 按以下顺序执行：

```text
1. 处理 Control Queue
2. 检查关闭、故障和 Effect 屏障
3. 处理有限数量的 Command
4. 执行到期的固定 Tick
5. 发布事务
6. 安排下一次 Scheduler 唤醒
```

规则：

- Control Queue 必须先于普通命令；
- Effect Pending 时不处理普通命令和 Tick；
- Runtime Core `paused === true` 时不执行 Tick；
- 单轮处理的普通命令数量有上限；
- 单轮执行的追赶 Tick 数量有上限；
- 不允许在同一个调用栈中无限排空。

## 9. 防止 Core 重入

```ts
private executingCore = false;

private executeCoreOperation<T>(
  operation: () => T,
): T {
  if (this.executingCore) {
    throw new RuntimeExecutionInvariantError(
      "Runtime Core execution is reentrant",
    );
  }

  this.executingCore = true;

  try {
    return operation();
  } finally {
    this.executingCore = false;
  }
}
```

即使 Transaction Sink 在回调中调用：

```ts
void loop.pause();
```

该操作也只能进入 Control Queue，不能在当前 Core 调用栈中立即重入。

## 10. Runtime Transaction

每次 Core 调用生成一个事务记录：

```ts
type RuntimeOperationKind =
  | "initialize"
  | "command"
  | "tick"
  | "pause"
  | "resume"
  | "map-transition"
  | "fail"
  | "close";
```

```ts
interface RuntimeTransaction {
  /**
   * Execution Loop 内单调递增的事务编号。
   */
  readonly id: number;

  readonly kind: RuntimeOperationKind;

  readonly result: RuntimeResult;

  /**
   * 状态发生变化时可附带事务后的只读快照。
   */
  readonly snapshot?: RuntimeSnapshot;
}
```

必须区分：

```text
RuntimeTransaction.id
    Core 操作的执行顺序

RuntimeState.revision
    权威游戏状态版本

Runtime RPC sequence
    Server 消息顺序

ClientState.revision
    客户端目标状态版本
```

四者不得混用。

第一阶段建议：

```text
RuntimeResult.stateChanged == true
→ Transaction 附带 RuntimeSnapshot

RuntimeResult.stateChanged == false
→ Snapshot 可以省略
```

## 11. Transaction Sink

```ts
interface RuntimeExecutionSink {
  onTransaction(
    transaction: RuntimeTransaction,
  ): void;

  onEffect(
    pending: RuntimePendingEffect,
    transaction: RuntimeTransaction,
  ): void;

  onFatalError(
    error: RuntimeExecutionError,
  ): void;
}
```

Sink 规则：

- 回调是同步通知，不能在 Loop 内被 `await`；
- Sink 不得直接调用 Core；
- Sink 需要操作 Core 时必须重新提交 Loop 操作；
- 普通日志 Sink 故障可以隔离；
- 必需 Transaction/Effect Sink 故障视为宿主致命错误；
- Core 事务已经提交后，Sink 故障不能回滚 Core 状态。

后续 Projector 或 Runtime Service 可以订阅 Transaction，但不进入 Core 游戏事务。

## 12. 启动流程

```text
Session Coordinator
→ 异步加载入口地图和玩家人物
→ 建立 RuntimeInitialization
→ executionLoop.start(initialization)
→ Loop 串行调用 core.initialize()
→ 发布 initialize Transaction
→ 初始化 Clock 和 Accumulator
→ 启动 Scheduler
→ Loop state = running
→ Session state = running
```

`start()` 规则：

- 只允许从 `created` 调用；
- 初始化成功前 Scheduler 不启动；
- 初始化失败时 Loop 进入 `failed`；
- 初始化失败时不保留半启动 Scheduler；
- 重复调用 `start()` 是调用错误。

## 13. 单调时钟

禁止用墙钟驱动游戏时间：

```ts
Date.now();
```

系统墙钟可能因为用户设置或时间同步发生跳变。

第一阶段注入：

```ts
interface MonotonicClock {
  now(): number;
}
```

Node.js、浏览器和 Worker 可以使用：

```ts
performance.now();
```

测试使用 Fake Monotonic Clock，不依赖真实等待。

## 14. Scheduler 抽象

```ts
interface RuntimeScheduler {
  schedule(
    callback: () => void,
    delayMs: number,
  ): RuntimeScheduleHandle;

  cancel(
    handle: RuntimeScheduleHandle,
  ): void;
}
```

第一阶段推荐 Scheduler 底层使用一次性 `setTimeout`，每次 Pump 结束后重新安排下一次唤醒。

不推荐直接使用长期 `setInterval`，因为：

- 回调执行时间会造成漂移；
- 卡顿时行为不易控制；
- 关闭和重排不够明确；
- 测试难以精确驱动。

## 15. Tick 配置

```ts
interface RuntimeExecutionOptions {
  /** 第一阶段默认 20ms，即 50Hz。 */
  readonly tickStepMs: number;

  /** 一轮最多追赶的 Tick 数。 */
  readonly maxCatchUpTicks: number;

  /** 普通命令最大排队数量。 */
  readonly maxQueuedCommands: number;

  /** 一轮最多处理的普通命令数。 */
  readonly maxCommandsPerTurn: number;
}
```

第一阶段默认值：

```ts
const phase1RuntimeExecutionOptions = {
  tickStepMs: 20,
  maxCatchUpTicks: 5,
  maxQueuedCommands: 256,
  maxCommandsPerTurn: 64,
} satisfies RuntimeExecutionOptions;
```

默认 Tick 为实现配置，不进入 Runtime Core 游戏状态。

## 16. 固定 Tick 与 Accumulator

内部维护：

```ts
private lastClockMs = 0;
private accumulatedMs = 0;
```

Scheduler 唤醒时：

```ts
const now = clock.now();
const elapsedMs = now - lastClockMs;

lastClockMs = now;
accumulatedMs += elapsedMs;
```

然后按固定步长调用 Core：

```ts
let count = 0;

while (
  accumulatedMs >= options.tickStepMs &&
  count < options.maxCatchUpTicks
) {
  executeTick(options.tickStepMs);

  accumulatedMs -= options.tickStepMs;
  count += 1;
}
```

Core 收到稳定整数步长：

```text
core.tick(20)
core.tick(20)
core.tick(20)
```

而不是不稳定的真实间隔：

```text
core.tick(17.281)
core.tick(83.462)
core.tick(4.127)
```

## 17. 卡顿和追赶策略

进程停顿较长时间后，Loop 不得无上限追赶。

```ts
const maxAccumulatedMs =
  options.tickStepMs *
  options.maxCatchUpTicks;

accumulatedMs = Math.min(
  accumulatedMs,
  maxAccumulatedMs,
);
```

使用默认值时：

```text
20ms × 5 Tick = 100ms 最大追赶逻辑时间
```

超出部分丢弃。

含义：

- 严重卡顿时游戏逻辑暂时变慢；
- 不在恢复后瞬间推进大量游戏状态；
- 不长时间阻塞事件循环；
- 不让积压 Tick 延迟用户命令和控制操作。

第一阶段单机 RPG 优先选择稳定和可控，而不是追赶全部真实时间。

## 18. 暂停语义

Runtime Core 维护统一 `pauseDepth`。Execution Loop 负责清理时间债务。

当可观察暂停状态发生：

```text
paused false → true
→ accumulatedMs = 0
→ lastClockMs = clock.now()

paused true → false
→ accumulatedMs = 0
→ lastClockMs = clock.now()
```

暂停期间：

- Scheduler 可以继续唤醒；
- 不调用 `core.tick()`；
- 不累计需要恢复后补算的时间；
- 继续处理 Control Queue；
- 普通命令由 Core 拒绝，Runtime Service 也应提前门控；
- 允许地图提交、恢复、故障、快照读取和关闭。

嵌套暂停时，仅在 `paused` 可观察值变化时重置 Accumulator：

```text
pauseDepth 1 → 2
    paused 仍为 true，不重复改变游戏语义

pauseDepth 2 → 1
    paused 仍为 true，不恢复 Tick
```

## 19. 普通命令流程

```text
Web Client
→ Runtime Service 归一化输入
→ 检查 Session == running
→ executionLoop.submitCommand(command)
→ Command Queue
→ core.dispatch(command)
→ RuntimeTransaction
→ Transaction Sink
```

规则：

- Runtime Service 负责外部协议验证和 Session 门控；
- Execution Loop 负责串行和容量限制；
- Runtime Core 仍进行最终业务前置条件验证；
- 命令 Promise 在对应 Core 事务完成后返回；
- 命令 Promise 不等待后续异步 Effect 完成。

## 20. Effect 屏障

Runtime Core 一次事务最多产生一个异步 Effect。

Loop 为 Effect 分配唯一 ID：

```ts
interface RuntimePendingEffect {
  readonly id: number;
  readonly effect: RuntimeEffect;
  readonly transactionId: number;
}
```

当 Transaction 返回 Effect 时，Loop 必须原子执行：

```text
1. 提交当前 Runtime Transaction
2. 创建 RuntimePendingEffect
3. 设置 pendingEffect
4. 停止本轮后续 Tick
5. 拒绝并清空尚未执行的普通命令
6. 禁止执行新的普通命令和 Tick
7. 同步调用 sink.onEffect(...)
```

Effect Pending 期间只允许：

```text
pause
commit-map-transition
complete-effect
resume
fail
read-snapshot
close
```

新普通命令返回明确拒绝：

```text
RUNTIME_EFFECT_PENDING
```

不会在地图切换后自动重放。

### 20.1 为什么必须有屏障

没有屏障时可能出现：

```text
Tick 完成移动并产生 Portal Effect
→ Coordinator 尚未执行 pause
→ Loop 又处理下一条移动命令或 Tick
→ 当前场景继续变化
```

Effect 屏障确保异步边界建立后，权威状态停止继续推进。

### 20.2 完成 Effect

Session Coordinator 处理完 Effect 后调用：

```ts
await executionLoop.completeEffect(effectId);
```

规则：

- Effect ID 必须等于当前 Pending Effect；
- 没有 Pending Effect 时调用属于调用错误；
- 完成后清除 `pendingEffect`；
- 完成操作本身不修改 Runtime Core 状态；
- Scheduler 只有在 Runtime 未暂停时才恢复 Tick；
- Coordinator 必须通过 Session 状态继续门控客户端命令。

第一阶段同一时间最多一个 Pending Effect。

## 21. 地图切换流程

```text
Core Tick
→ 人物完成进入 Portal 格
→ MapTransitionEffect
→ Loop 建立 Effect Barrier
→ Coordinator 同步设置 Session = loading
→ Coordinator 提交 loop.pause()
→ Repository 异步加载目标地图和人物
→ 建立 PreparedMapTransition
→ loop.commitMapTransition(...)
→ loop.completeEffect(effectId)
→ Session = running
→ loop.resume()
```

控制操作优先于普通命令，且 Effect Pending 时普通命令已被冻结，因此不会在 `pause()` 前继续执行新的游戏命令。

### 21.1 切换成功

顺序固定为：

```text
pause
→ async prepare
→ commitMapTransition
→ completeEffect
→ Session running
→ resume
```

### 21.2 可恢复加载失败

```text
pause
→ async prepare failed
→ 保留当前 Runtime Scene
→ 记录 Session / Control Error
→ completeEffect
→ Session running
→ resume
```

加载失败不重放 Effect Pending 期间的输入。

### 21.3 致命失败

目标内容或提交过程导致不可恢复错误时：

```text
loop.fail(error)
→ Loop failed
→ Runtime 保持停止推进
→ Session failed
```

此时不需要完成 Pending Effect。

## 22. 命令队列过载

```ts
if (
  queuedCommandCount >=
  options.maxQueuedCommands
) {
  throw new RuntimeExecutionError(
    "RUNTIME_COMMAND_QUEUE_FULL",
  );
}
```

规则：

- 只限制普通命令数量；
- 控制操作不被普通命令挤出；
- 不允许无限缓冲客户端输入；
- 不做普通命令持久化或重放；
- Runtime Service 仍应实施输入频率限制。

## 23. 调度公平性

一轮最多处理：

```text
maxCommandsPerTurn
```

条普通命令。

达到上限后：

- 若存在到期 Tick，则执行允许数量的 Tick；
- 通过 Scheduler 或新的 Microtask 继续下一轮；
- 不在同一调用栈无限处理命令；
- Control Queue 始终优先。

## 24. Snapshot 读取

外部不得直接调用：

```ts
core.getSnapshot();
```

必须使用：

```ts
await executionLoop.readSnapshot();
```

读取进入 Control Queue，确保：

```text
此前已排队的控制操作完成
→ 在明确事务边界读取 Snapshot
→ 返回不可变快照
```

允许读取 Snapshot 的状态：

- `running`；
- Effect Pending；
- `stopping`；
- `stopped`；
- `failed`。

Snapshot 仍然是游戏领域状态，不是 Client Scoped State Tree。

## 25. Client State Projector 边界

Execution Loop 只发布：

```text
RuntimeTransaction
RuntimeResult
RuntimeSnapshot
RuntimeEvent
RuntimeEffect
```

后续关系：

```text
RuntimeTransaction
→ Projection Scheduler
→ Client State Projector
→ Client Scoped State Tree
→ Runtime Service
```

规则：

- Projector 不在 Core 调用期间运行；
- Projector 不能修改 Core；
- Projector 失败不能回滚已提交的 Core 事务；
- Projector 故障属于 Projection 或 Runtime Service 故障；
- Client State Revision 与 Runtime Transaction ID 分离。

## 26. 关闭流程

```ts
close(): Promise<void>;
```

第一次调用：

```text
state running/failed → stopping
→ 不再接受普通命令
→ 取消 Scheduler
→ accumulatedMs = 0
→ 拒绝未执行普通命令
→ 处理必要的关闭控制操作
→ 调用 core.close()
→ 发布 close Transaction
→ state = stopped
```

规则：

- `close()` 是终止屏障；
- 重复关闭幂等；
- `stopping` 和 `stopped` 返回同一个关闭 Promise；
- Close 后不恢复 Scheduler；
- Close 后拒绝命令、暂停、恢复和地图提交；
- Close 后可以保留最后 Snapshot 供诊断。

## 27. 错误处理

### 27.1 正常 Runtime 拒绝

Core 返回：

```ts
{
  accepted: false,
  rejection: "runtime-paused",
}
```

Loop 正常返回 Transaction，不进入 `failed`。

### 27.2 调用错误

例如：

- 重复 `start()`；
- 没有活动暂停时 `resume()`；
- 非法 PreparedMapTransition；
- 错误 Effect ID；
- Close 后继续提交操作。

调用错误只拒绝当前操作，除非暴露了内部不变量破坏。

### 27.3 Core 不变量错误

Core 抛出 `RuntimeInvariantError` 或未知异常时：

```text
取消 Scheduler
→ 停止 Tick
→ Loop state = failed
→ 拒绝普通命令
→ 尝试 core.fail(error)
→ 拒绝未执行普通操作
→ sink.onFatalError(error)
```

### 27.4 必需 Sink 错误

事务已提交后，必需 Sink 如果抛出异常：

- 不能回滚 Core 状态；
- Loop 进入 `failed`；
- Scheduler 停止；
- Session 进入 `failed`；
- 保留最后 Snapshot 用于诊断。

## 28. Pump 伪代码

```ts
private pump(): void {
  if (this.draining) {
    return;
  }

  this.draining = true;

  try {
    this.updateClockAccumulator();

    this.processControlQueue();

    if (
      this.state !== "running" ||
      this.pendingEffect !== null
    ) {
      return;
    }

    this.processCommands(
      this.options.maxCommandsPerTurn,
    );

    if (
      this.pendingEffect === null &&
      !this.core.paused
    ) {
      this.processDueTicks();
    }
  } catch (error) {
    this.enterFailed(error);
  } finally {
    this.draining = false;
    this.scheduleNextWake();
  }
}
```

Tick：

```ts
private processDueTicks(): void {
  let count = 0;

  while (
    this.accumulatedMs >=
      this.options.tickStepMs &&
    count <
      this.options.maxCatchUpTicks &&
    this.pendingEffect === null &&
    !this.core.paused
  ) {
    const transaction =
      this.executeTransaction(
        "tick",
        () =>
          this.core.tick(
            this.options.tickStepMs,
          ),
      );

    this.accumulatedMs -=
      this.options.tickStepMs;

    count += 1;

    if (
      transaction.result.effects.length > 0
    ) {
      this.establishEffectBarrier(
        transaction,
      );
    }
  }
}
```

## 29. 推荐代码结构

```text
src/runtime/
├── runtime-core.ts
├── runtime-state.ts
├── runtime-result.ts
└── execution/
    ├── runtime-execution-loop.ts
    ├── runtime-execution-state.ts
    ├── runtime-execution-operation.ts
    ├── runtime-transaction.ts
    ├── runtime-pending-effect.ts
    ├── runtime-execution-sink.ts
    ├── runtime-execution-options.ts
    ├── monotonic-clock.ts
    ├── runtime-scheduler.ts
    └── runtime-execution-error.ts
```

测试辅助：

```text
src/runtime/execution/testing/
├── fake-monotonic-clock.ts
├── manual-runtime-scheduler.ts
├── fake-runtime-core.ts
└── recording-runtime-execution-sink.ts
```

## 30. 测试要求

Execution Loop 测试不得依赖真实等待，必须使用 Fake Clock 和 Manual Scheduler。

第一阶段至少覆盖：

1. Core 同一时间只执行一个操作；
2. Core 不会发生重入；
3. Control Queue FIFO；
4. Command Queue FIFO；
5. Control 操作优先于普通命令；
6. Tick 使用固定步长；
7. Scheduler 卡顿时最多追赶配置数量的 Tick；
8. 超额时间债务被丢弃；
9. 暂停期间不 Tick；
10. 恢复后不补算暂停时间；
11. 嵌套暂停不会提前恢复 Tick；
12. Effect 产生后停止本轮后续 Tick；
13. Effect Pending 时拒绝和清空普通命令；
14. Effect Pending 时允许 pause、commit 和 close；
15. 错误 Effect ID 被拒绝；
16. 地图切换按照 pause、commit、complete、resume 执行；
17. 可恢复加载失败后不重放输入；
18. Command Queue 满时拒绝新命令；
19. Runtime 普通拒绝不会使 Loop failed；
20. Core 不变量异常使 Loop failed；
21. 必需 Sink 异常使 Loop failed；
22. Snapshot 读取位于明确队列边界；
23. Close 后拒绝新命令；
24. 重复 Close 幂等；
25. 初始化失败时 Scheduler 不启动。

## 31. 第一阶段不实现

- 多 Runtime Core 并行调度；
- 多会话共享同一个 Loop；
- 多线程 Core 写入；
- Worker Pool 游戏规则执行；
- Tick 持久化；
- 命令持久化或重放；
- 客户端预测和 Server 校正；
- 网络时间同步；
- 分布式锁；
- 后台地图预取；
- 多个并行 Pending Effect；
- Projector 在 Core 事务内同步渲染；
- 根据客户端动画回调推进游戏时间。

## 32. 第一阶段已冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| Core 写入口 | 仅 Runtime Execution Loop |
| 并发模型 | 单线程串行执行 |
| 操作队列 | Control Queue + Command Queue |
| 控制优先级 | Control 优先于 Command |
| Command 顺序 | FIFO |
| Tick | 固定步长 |
| 默认 Tick | 20ms / 50Hz |
| 时钟 | 单调时钟 |
| Scheduler | 可注入的一次性调度器 |
| 时间推进 | Accumulator |
| 最大追赶 | 5 Tick / 100ms |
| 暂停时间 | 不累计、不补算 |
| Tick 入队 | 不入队 |
| Effect | 唯一 Pending Effect + 执行屏障 |
| Effect 期间输入 | 拒绝并不重放 |
| 地图加载 | Coordinator 在 Loop 外异步执行 |
| 地图提交 | 通过 Loop 串行提交 |
| Snapshot | 通过 Loop 读取 |
| 普通命令队列 | 有界，默认 256 |
| Close | 终止屏障且幂等 |
| Projector | Core 事务外运行 |
| Core 可见性 | Loop 私有依赖 |

## 33. 当前结论

```text
Runtime Service
    决定外部命令如何进入系统

Session Coordinator
    决定异步内容如何准备

Runtime Execution Loop
    决定 Core 操作何时、以何种顺序执行

Runtime Core
    决定游戏规则如何改变权威状态

Client State Projector
    决定客户端应看到什么
```

Runtime Execution Loop 是 Runtime Core 的唯一写入口。它通过双队列、固定 Tick、单调时钟、Effect 屏障和明确生命周期，将外部异步世界与同步、确定性的 Core 隔离。