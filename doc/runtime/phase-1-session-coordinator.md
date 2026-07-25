# 第一阶段 Session Coordinator

## 1. 文档目的

本文档定义 LoomRealm 第一阶段 `Session Coordinator` 的职责、状态、Session Snapshot、地图切换流程和错误边界。

相关文档：

- [`phase-1-runtime-execution-loop.md`](./phase-1-runtime-execution-loop.md)：定义 Runtime Core 的唯一写入口、固定 Tick、队列和 Effect 屏障；
- [`phase-1-runtime-core.md`](./phase-1-runtime-core.md)：定义权威游戏状态和同步规则事务；
- [`../architecture/client-state-projector.md`](../architecture/client-state-projector.md)：定义 Runtime/Session 快照到 Client State 的投影；
- [`../game-package/phase-1-game-loading.md`](../game-package/phase-1-game-loading.md)：定义 Loader、Catalog 和 Repository。

核心原则：

> Session Coordinator 只负责协调异步内容准备和会话流程。它不直接调用 Runtime Core，不实现游戏规则，不承担持续 Tick 调度，也不生成 Client State。

第一阶段保持：

- 单会话；
- 单 Runtime Execution Loop；
- 单 Runtime Core；
- 单活动场景加载任务；
- 单 Pending Runtime Effect。

## 2. 模块位置

```text
Game Package Context
├── Game Catalog
├── Map Repository
├── Actor Repository
└── Resource Repository
        ↓
Session Coordinator
├── Session State
├── Session Revision
├── Session Snapshot
└── Async Map Preparation
        ↓ control operations
Runtime Execution Loop
        ↓ serialized calls
Runtime Core

Session Snapshot ─┐
Runtime Snapshot ─┴→ Projection Scheduler
                    → Client State Projector
```

各层职责：

```text
Repository
    异步读取、解析和缓存静态内容

Session Coordinator
    等待异步内容并组织会话流程

Runtime Execution Loop
    串行执行命令、Tick 和控制操作

Runtime Core
    同步执行权威游戏规则事务

Client State Projector
    读取 Runtime/Session Snapshot 并生成 Client State

Runtime Service
    验证外部请求并发布状态、事件和资源
```

## 3. 第一阶段职责

Session Coordinator 负责：

- 从 Game Catalog 读取入口配置；
- 并行准备入口地图和玩家人物；
- 建立 `RuntimeInitialization`；
- 通过 Execution Loop 初始化 Runtime Core；
- 同步接收 Execution Loop 发布的 Pending Effect；
- 在第一次异步等待前进入 `loading`；
- 维护 Session State 和 Session Revision；
- 提供不可变 Session Snapshot；
- Session 状态变化时请求客户端投影；
- 通过 Execution Loop 申请加载暂停；
- 异步加载目标地图和目标人物；
- 校验 `PreparedMapTransition`；
- 通过 Execution Loop 原子提交地图切换；
- 完成 Pending Effect 屏障；
- 恢复 Runtime；
- 处理可恢复和不可恢复的加载失败；
- 关闭会话和 Execution Loop。

Session Coordinator 不负责：

- 人物移动、转向、碰撞或 Portal 判定；
- Runtime Tick 调度；
- Runtime 操作队列；
- 直接调用 Runtime Core；
- 生成 Scope、Roots、Tag、Data 或 Client Revision；
- FSDB 解析细节；
- Repository 缓存策略；
- 图片、音频等资源主体读取；
- HTTP、WebSocket、DOM 或 Electron；
- 存档读写；
- 多会话和多玩家调度。

## 4. 依赖关系

```ts
class DefaultSessionCoordinator
  implements SessionCoordinator {
  constructor(
    private readonly game: GamePackageContext,

    private readonly executionLoop:
      RuntimeExecutionLoop,

    private readonly projectionScheduler:
      ProjectionScheduler,
  ) {}
}
```

Coordinator 不持有 Runtime Core：

```ts
// 禁止
private readonly runtime: RuntimeCore;
```

所有 Runtime 写操作必须通过 Execution Loop：

```ts
await executionLoop.pause();
await executionLoop.commitMapTransition(prepared);
await executionLoop.completeEffect(effectId);
await executionLoop.resume();
```

Projection Scheduler 只接收快照请求，不能修改 Session 或 Runtime。

## 5. Session State

```ts
type SessionState =
  | "starting"
  | "running"
  | "loading"
  | "failed"
  | "closed";
```

| 状态 | 含义 |
|---|---|
| `starting` | 正在准备入口地图和玩家人物 |
| `running` | 可以接收普通游戏命令 |
| `loading` | 正在处理地图切换 Effect |
| `failed` | 会话遇到不可恢复错误 |
| `closed` | 会话已经结束 |

`loading` 是会话控制状态，不是 Runtime Core 游戏业务状态。

## 6. Session Snapshot

Coordinator 暴露不可变快照：

```ts
interface SessionSnapshot {
  readonly revision: number;
  readonly state: SessionState;
  readonly error?: SessionError;
}
```

```ts
interface SessionError {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}
```

最小接口：

```ts
interface SessionCoordinator {
  readonly state: SessionState;
  readonly revision: number;

  start(): Promise<void>;

  acceptRuntimeEffect(
    pending: RuntimePendingEffect,
  ): void;

  getSnapshot(): SessionSnapshot;

  close(): Promise<void>;
}
```

Snapshot 规则：

- Snapshot 不暴露可修改内部引用；
- Snapshot 不包含 Repository、Promise 或加载任务；
- Snapshot 不包含 Client State；
- Session Snapshot 可以与最近 Runtime Snapshot 组合为 Projection Frame；
- 纯读取不增加 Session Revision。

## 7. Session Revision

Session Revision 从 `0` 开始，在客户端可观察的 Session 状态提交时递增。

```text
starting → running
running → loading
loading → running
running/loading → failed
任意非 closed 状态 → closed
```

错误内容发生客户端可见变化时也递增。

规则：

- 每个 Session 状态事务最多递增一次；
- 相同 State 和相同 Error 不递增；
- Session Revision 不等于 Runtime Revision；
- Session Revision 不等于 Client State Revision；
- Session Revision 不等于 Runtime RPC Sequence。

状态修改应集中在一个方法：

```ts
private commitSessionState(
  nextState: SessionState,
  error?: SessionError,
): void {
  if (
    this.state === nextState &&
    equalSessionError(this.error, error)
  ) {
    return;
  }

  this.state = nextState;
  this.error = error;
  this.revision += 1;

  this.requestProjection();
}
```

## 8. 投影请求

Session 状态变化时，Coordinator 请求 Projection Scheduler：

```ts
private requestProjection(): void {
  this.projectionScheduler.request({
    runtime: this.latestRuntimeSnapshot,
    session: this.getSnapshot(),
    runtimeTransactionId:
      this.latestRuntimeTransactionId,
    cause: {
      type: "session-change",
    },
  });
}
```

Coordinator 不调用 Scope Projector，也不决定：

- 哪个 Scope 变化；
- 是否发布 Snapshot；
- 是否发布 Scope Replace；
- Client State Revision；
- Scope Revision。

这些属于 Client State Projector。

## 9. 状态转换

```text
starting
├── start success → running
└── start fatal   → failed

running
├── map effect    → loading
├── fatal         → failed
└── close         → closed

loading
├── commit success        → running
├── recoverable failure   → running
├── fatal failure         → failed
└── close                 → closed

failed
└── close → closed
```

不允许：

- `loading → loading`；
- `failed → running`；
- `closed → 其他状态`；
- 同时处理两个地图切换。

## 10. Runtime Effect 接入

Execution Loop 产生 Effect 后已经建立屏障：

- 停止 Tick；
- 拒绝并清空普通命令；
- 不允许新的普通命令进入 Core；
- 只允许控制操作。

Coordinator 接收：

```ts
interface RuntimePendingEffect {
  readonly id: number;
  readonly effect: RuntimeEffect;
  readonly transactionId: number;
}
```

接收方法必须同步建立 Session 屏障：

```ts
acceptRuntimeEffect(
  pending: RuntimePendingEffect,
): void {
  if (this.state !== "running") {
    void this.failSession(
      new Error(
        `Cannot accept effect while ${this.state}`,
      ),
    );
    return;
  }

  this.activeEffect = pending;
  this.commitSessionState("loading");

  void this.handleRuntimeEffect(pending);
}
```

关键规则：

> Session 必须在第一次 `await` 前切换到 `loading` 并请求投影。

这样 Runtime Service 会立即停止接受普通命令，客户端也可以立即得到 Loading Scope。

## 11. 启动流程

```text
CLI
→ Game Package Loader
→ Game Package Context
→ 创建 Runtime Core
→ 创建 Runtime Execution Loop
→ 创建 Projection Scheduler / Client State Projector
→ 创建 Session Coordinator
→ coordinator.start()
```

`start()`：

```text
读取 Catalog Entry
→ 并行加载入口 Map 和 Player Actor
→ 加载入口 Map 需要的其他 Actor
→ 校验出生点和引用
→ 创建 RuntimeSceneContent
→ 创建 RuntimeInitialization
→ executionLoop.start(initialization)
→ 获取初始化后的 Runtime Snapshot
→ Session = running
→ 请求 initial Projection（forceSnapshot）
```

初始投影成功之前，Runtime Service 不应进入 ready。

启动期间 Runtime 尚未初始化，因此不申请加载暂停，也不存在 Pending Effect。

## 12. 普通命令边界

普通命令不经过 Session Coordinator：

```text
Web Client
→ Runtime Service
→ 检查 session.state == running
→ executionLoop.submitCommand(command)
```

Runtime Service 必须拒绝 `starting`、`loading`、`failed` 和 `closed` 期间的普通命令。

输入不缓存、不重放。

Coordinator 只处理 Runtime Effect，不成为普通命令转发层。

## 13. MapTransitionEffect

```ts
interface MapTransitionEffect {
  readonly type: "map-transition";
  readonly targetMapId: string;
  readonly targetPosition: GridPosition;
  readonly targetDirection?: Direction;
}
```

Effect 只描述目标，不包含 Repository、Promise、加载进度、图片主体、DOM 状态或 Runtime 内部对象引用。

## 14. 地图切换总体流程

```text
Runtime Core 完成人物移动
→ 检测 Portal
→ 返回 MapTransitionEffect
→ Execution Loop 建立 Effect Barrier
→ Coordinator 同步进入 loading
→ 请求 Session Change Projection
→ loop.pause()
→ 异步加载目标 Map 和 Actor
→ 校验 PreparedMapTransition
→ loop.commitMapTransition(prepared)
→ 请求 forceSnapshot Projection
→ loop.completeEffect(effectId)
→ Session = running
→ 请求 Session Change Projection
→ loop.resume()
```

第一阶段一次只允许一个 `activeEffect`。

## 15. 申请加载暂停

Coordinator 开始异步加载前必须：

```ts
await this.executionLoop.pause();
```

Effect Barrier 已经阻止 Tick 和普通命令；暂停进一步保证：

- Runtime Core 的统一暂停状态可见；
- 地图提交满足仅允许在暂停时提交的前置条件；
- 暂停可以与其他暂停嵌套；
- 暂停期间不累计逻辑时间债务。

Coordinator 不管理 `pauseDepth`，只保证自己申请的暂停最终只恢复一次。

## 16. 准备目标场景

```text
Map Repository.load(targetMapId)
→ 读取目标 Map Snapshot
→ Actor Repository.load(...) 加载目标场景人物
→ 校验目标位置和静态引用
→ 创建 RuntimeSceneContent
→ 创建 PreparedMapTransition
```

```ts
interface PreparedMapTransition {
  readonly content: RuntimeSceneContent;
  readonly playerPosition: GridPosition;
  readonly playerDirection?: Direction;
}
```

Coordinator 校验：

- Effect 目标 Map ID 与 Map Snapshot ID 一致；
- Map Snapshot 结构完整；
- 所有目标 Actor Definition 已加载；
- Actor ID 唯一；
- 玩家 Actor Definition 存在；
- 目标位置在地图范围内；
- 目标位置允许玩家站立；
- Portal 目标方向合法；
- 所有逻辑资源 Key 存在于 Resource Catalog。

图片资源主体不在地图切换阶段读取。

## 17. 原子提交与投影

准备完成后：

```ts
const transaction =
  await this.executionLoop
    .commitMapTransition(prepared);
```

Core 一次性替换当前 Map、Actor Definitions、Runtime Actor State、玩家位置/朝向、移动状态和 Runtime Revision。

提交成功后必须请求完整客户端投影：

```ts
this.projectionScheduler.request(
  this.createProjectionFrame(
    transaction,
    {
      type: "runtime-transaction",
      kind: "map-transition",
    },
  ),
  {
    forceSnapshot: true,
  },
);
```

Coordinator 不逐字段修改 Runtime，也不自行生成新地图 Scope。

## 18. 完成 Effect 与恢复

成功顺序固定为：

```text
commitMapTransition
→ forceSnapshot Projection Request
→ completeEffect
→ Session running
→ Session Change Projection Request
→ resume
```

```ts
await this.executionLoop
  .completeEffect(pending.id);

this.activeEffect = null;
this.commitSessionState("running");

await this.executionLoop.resume();
```

地图提交 Snapshot 可以包含新 World/HUD 和仍存在的 Loading Scope。Session 返回 `running` 后，后续单 Scope Replace 可以删除 Loading Scope。

Pending Effect 期间收到的输入已被拒绝，不会重放。

## 19. 可恢复加载失败

以下错误通常可恢复：

- 目标地图不存在；
- 目标 Actor Definition 缺失；
- 目标位置越界或不可站立；
- 目标静态引用不完整；
- Repository 临时读取失败；
- Core 尚未提交前的 Prepared Transition 校验失败。

处理：

```text
保留当前 Runtime Scene
→ 记录可恢复 Session Error
→ completeEffect(effectId)
→ activeEffect = null
→ Session = running
→ 请求 Session Change Projection
→ resume loading pause
```

可恢复失败不提交半个目标场景、不改写当前地图、不回放输入，也不因图片未下载而阻塞恢复。

## 20. 致命失败

以下情况视为不可恢复：

- Core 提交抛出不变量错误；
- Execution Loop 进入 `failed`；
- Game Package Context 已不可继续使用；
- Effect ID 或 Effect 生命周期不一致；
- 必需 RuntimeExecutionSink 故障；
- Client State 初始或运行期投影失败；
- Coordinator 与 Loop 屏障状态失配。

处理：

```text
Session = failed
→ 请求 failed Session Projection
→ executionLoop.fail(error)
→ Runtime 停止推进
→ 保留最后 Snapshot 用于诊断
```

致命失败时不恢复为 `running`，不要求完成 Pending Effect，不调用普通 `resume()`。

## 21. 加载期间行为

当 `state === "loading"`：

- Effect Barrier 保持有效；
- Runtime 保持加载暂停；
- Runtime Service 拒绝普通游戏命令；
- 当前 Scene 保持完整有效；
- Runtime Service 继续提供健康检查；
- Client State Projector 可以输出加载相关 Scope；
- 不接受第二个 Runtime Effect；
- 不缓存用户输入；
- 不等待客户端图片加载完成。

Runtime 恢复不依赖客户端资源下载速度。

## 22. Repository 与资源边界

Coordinator 只调用：

```text
mapRepository.load(id)
actorRepository.load(id)
```

Repository 自行负责并发去重、缓存、解析和局部校验。

地图切换只处理逻辑资源引用。图片资源链路独立：

```text
Web Client
→ Runtime Service
→ Resource Repository.open(resourceId)
```

Coordinator 不参与图片请求、MIME、浏览器解码、Client Resource Cache 或 DOM 准备通知。

## 23. Runtime Service 边界

Runtime Service 负责：

- 检查 `session.state`；
- 把外部输入转换成 Game Command；
- 调用 `executionLoop.submitCommand()`；
- 发布 Runtime Event；
- 消费 Projection Commit；
- 发布 `state.snapshot` 和 `scope.replace`；
- 提供资源接口。

Coordinator 负责：

- 接受 Pending Effect；
- 控制 Session State 和 Revision；
- 提供 Session Snapshot；
- 异步准备场景；
- 提交 Loop 控制操作；
- 请求 Session Change 和 Map Commit Projection。

Runtime Service 不等待地图加载完成才结束原始移动命令事务。

## 24. 关闭流程

```ts
async close(): Promise<void> {
  if (this.state === "closed") {
    return;
  }

  this.activeEffect = null;
  this.commitSessionState("closed");

  await this.executionLoop.close();
}
```

规则：

- Close 幂等；
- Close 后不接受新 Effect；
- Close 后不开始新 Repository 加载；
- 第一阶段不实现加载取消；
- 已返回的 Repository Promise 可以自然结束，但结果不得提交；
- Execution Loop 负责停止 Scheduler 和关闭 Core。

## 25. 第一阶段不实现

- 多 Session；
- 多 Runtime；
- 并行地图切换；
- 多个 Pending Effect；
- 后台预取；
- 加载取消；
- 加载进度事务；
- Repository 缓存策略；
- 图片资源预加载屏障；
- 客户端输入重放；
- Session 直接生成 Client State；
- NPC 通用事件调度；
- Save System；
- 通用工作流引擎。

## 26. 第一阶段冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| Session 数量 | 单 Session |
| Runtime 数量 | 单 Execution Loop + 单 Core |
| Core 调用 | 只通过 Execution Loop |
| Session 状态 | starting/running/loading/failed/closed |
| Session Snapshot | revision + state + optional error |
| Session Revision | 与 Runtime/Client Revision 分离 |
| Effect | 同时最多一个 Pending Effect |
| Loading 入口 | 第一次 await 前同步提交 |
| Session 投影 | 状态提交后请求 Projection Scheduler |
| 地图提交投影 | 强制完整 Snapshot |
| 普通命令 | Runtime Service 直接提交 Loop |
| 输入缓存 | 不缓存、不回放 |
| 图片资源 | 不进入地图准备屏障 |
| 加载失败 | 提交前可恢复，提交/不变量错误致命 |
| 存档 | 第一阶段不接入 |

## 27. 当前结论

```text
Repository
    ↓ async content
Session Coordinator
    ├── Session State / Revision / Snapshot
    └── map transition orchestration
            ↓ controls
Runtime Execution Loop
            ↓
Runtime Core

Runtime Snapshot + Session Snapshot
            ↓
Projection Scheduler
            ↓
Client State Projector
```

Session Coordinator 是异步会话协调层，不是 Runtime Core、Execution Loop、Runtime Service 或 Client State Projector。