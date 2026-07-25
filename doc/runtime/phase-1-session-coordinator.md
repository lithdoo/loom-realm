# 第一阶段 Session Coordinator

## 1. 文档目的

本文档定义 LoomRealm 第一阶段 `Session Coordinator` 的职责、状态、接口、地图切换流程和错误边界。

相关文档：

- [`phase-1-runtime-execution-loop.md`](./phase-1-runtime-execution-loop.md)：定义 Runtime Core 的唯一写入口、固定 Tick、队列和 Effect 屏障；
- [`phase-1-runtime-core.md`](./phase-1-runtime-core.md)：定义权威游戏状态和同步规则事务；
- [`../game-package/phase-1-game-loading.md`](../game-package/phase-1-game-loading.md)：定义 Loader、Catalog 和 Repository。

核心原则：

> Session Coordinator 只负责协调异步内容准备和会话流程。它不直接调用 Runtime Core，不实现游戏规则，也不承担持续 Tick 调度。

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
        ↓ control operations
Runtime Execution Loop
        ↓ serialized synchronous calls
Runtime Core
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

Runtime Service
    验证外部请求、检查 Session 状态并提交 Loop 操作
```

## 3. 第一阶段职责

Session Coordinator 负责：

- 从 Game Catalog 读取入口配置；
- 并行准备入口地图和玩家人物；
- 建立 `RuntimeInitialization`；
- 通过 Execution Loop 初始化 Runtime Core；
- 同步接收 Execution Loop 发布的 Pending Effect；
- 在第一次异步等待前进入 `loading`；
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
- FSDB 解析细节；
- Repository 缓存策略；
- 图片、音频等资源主体读取；
- HTTP、WebSocket、DOM 或 Electron；
- Client State Projector；
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

## 5. 会话状态

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

## 6. 第一阶段状态转换

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

## 7. 最小公开接口

```ts
interface SessionCoordinator {
  readonly state: SessionState;

  start(): Promise<void>;

  /**
   * 由 RuntimeExecutionSink 同步调用。
   * 必须在返回前把 Session 切换到 loading。
   */
  acceptRuntimeEffect(
    pending: RuntimePendingEffect,
  ): void;

  close(): Promise<void>;
}
```

第一阶段 Coordinator 只接受：

```ts
type RuntimeEffect = MapTransitionEffect;
```

未知 Effect 属于不可恢复的宿主集成错误。

## 8. Runtime Effect 接入

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
    this.enterFatalFailure(
      new Error(
        `Cannot accept effect while ${this.state}`,
      ),
    );
    return;
  }

  this.state = "loading";
  this.activeEffect = pending;

  void this.handleRuntimeEffect(pending);
}
```

关键规则：

> `state = "loading"` 必须发生在第一次 `await` 之前。

这样 Runtime Service 会立即停止接受普通游戏命令。

## 9. 启动流程

```text
CLI
→ Game Package Loader
→ Game Package Context
→ 创建 Runtime Core
→ 创建 Runtime Execution Loop
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
→ Session = running
```

示意：

```ts
async start(): Promise<void> {
  this.assertState("starting");

  try {
    const entry = this.game.catalog.entry;

    const [map, playerDefinition] =
      await Promise.all([
        this.game.maps.load(
          entry.initialMapId,
        ),
        this.game.actors.load(
          entry.playerActorId,
        ),
      ]);

    const actorDefinitions =
      await this.loadSceneActorDefinitions(
        map,
        playerDefinition,
      );

    const initialization =
      this.prepareInitialization({
        map,
        actorDefinitions,
        playerActorId:
          entry.playerActorId,
        playerPosition:
          entry.initialPosition ??
          map.defaultSpawn.position,
        playerDirection:
          entry.initialDirection ??
          map.defaultSpawn.direction,
      });

    await this.executionLoop.start(
      initialization,
    );

    this.state = "running";
  } catch (error) {
    await this.failSession(error);
    throw error;
  }
}
```

启动期间 Runtime 尚未初始化，因此不申请加载暂停，也不存在 Pending Effect。

## 10. 普通命令处理边界

普通命令不经过 Session Coordinator：

```text
Web Client
→ Runtime Service
→ 检查 session.state == running
→ executionLoop.submitCommand(command)
```

Runtime Service 必须拒绝：

```text
starting
loading
failed
closed
```

期间的普通游戏命令。

输入不缓存、不重放。

Coordinator 只处理 Runtime Effect，不成为普通命令转发层。

## 11. MapTransitionEffect

```ts
interface MapTransitionEffect {
  readonly type: "map-transition";
  readonly targetMapId: string;
  readonly targetPosition: GridPosition;
  readonly targetDirection?: Direction;
}
```

Effect 只描述目标，不包含：

- Repository；
- Promise；
- 加载进度；
- 图片主体；
- DOM 状态；
- Runtime 内部对象引用。

## 12. 地图切换总体流程

```text
Runtime Core 完成人物移动
→ 检测 Portal
→ 返回 MapTransitionEffect
→ Execution Loop 建立 Effect Barrier
→ Coordinator 同步进入 loading
→ loop.pause()
→ 异步加载目标 Map 和 Actor
→ 校验 PreparedMapTransition
→ loop.commitMapTransition(prepared)
→ loop.completeEffect(effectId)
→ Session = running
→ loop.resume()
```

第一阶段一次只允许一个 `activeEffect`。

## 13. 申请加载暂停

Coordinator 开始异步加载前必须：

```ts
await this.executionLoop.pause();
```

Execution Loop 的 Effect 屏障已经阻止 Tick 和普通命令；暂停进一步保证：

- Runtime Core 的统一暂停状态可见；
- 地图提交满足“仅允许在暂停时提交”的前置条件；
- 暂停可以与其他暂停嵌套；
- 暂停期间不累计逻辑时间债务。

Coordinator 不管理 `pauseDepth`，只保证自己申请的暂停最终只恢复一次。

## 14. 准备目标场景

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

## 15. 原子提交

准备完成后：

```ts
await this.executionLoop
  .commitMapTransition(prepared);
```

Execution Loop 串行调用：

```ts
core.commitMapTransition(prepared);
```

Core 一次性替换：

- 当前 Map 内容；
- Map ID；
- Actor Definition 集合；
- Runtime Actor State；
- 玩家位置和朝向；
- 玩家移动状态；
- 旧场景临时状态；
- Runtime Revision。

Coordinator 不得逐字段修改 Runtime。

## 16. 完成 Effect 屏障

提交成功后：

```ts
await this.executionLoop.completeEffect(
  pending.id,
);
```

规则：

- Effect ID 必须匹配当前 Pending Effect；
- 完成后 Loop 才允许恢复普通 Tick；
- 完成 Effect 不直接修改 Core 游戏状态；
- Coordinator 在恢复 Session 前仍然保持输入门控；
- Pending Effect 期间收到的输入已经被拒绝，不会重放。

## 17. 恢复顺序

成功流程：

```ts
await this.executionLoop
  .commitMapTransition(prepared);

await this.executionLoop
  .completeEffect(pending.id);

this.state = "running";

await this.executionLoop.resume();
```

`resume()` 在同步调用时立即进入 Control Queue。即使 Session 已经切换为 `running`，Control Queue 仍优先于随后到达的普通 Command，因此 Runtime 会先恢复，再处理普通命令。

Coordinator 必须确保本次 `resume()` 只对应本次地图加载申请的 `pause()`。

## 18. 地图切换实现示意

```ts
private async handleRuntimeEffect(
  pending: RuntimePendingEffect,
): Promise<void> {
  let loadingPauseAcquired = false;

  try {
    if (
      pending.effect.type !==
      "map-transition"
    ) {
      throw new Error(
        `Unsupported Runtime Effect: ${
          pending.effect.type
        }`,
      );
    }

    await this.executionLoop.pause();
    loadingPauseAcquired = true;

    const prepared =
      await this.prepareMapTransition(
        pending.effect,
      );

    await this.executionLoop
      .commitMapTransition(prepared);

    await this.executionLoop
      .completeEffect(pending.id);

    this.activeEffect = null;
    this.state = "running";

    await this.executionLoop.resume();
    loadingPauseAcquired = false;
  } catch (error) {
    await this.handleTransitionFailure({
      pending,
      error,
      loadingPauseAcquired,
    });
  }
}
```

## 19. 可恢复加载失败

以下错误通常可恢复：

- 目标地图不存在；
- 目标 Actor Definition 缺失；
- 目标位置越界；
- 目标位置不可站立；
- 目标静态引用不完整；
- Repository 临时读取失败；
- Prepared Transition 校验失败且 Core 尚未提交。

处理：

```text
保留当前 Runtime Scene
→ 记录 Session Control Error
→ completeEffect(effectId)
→ activeEffect = null
→ Session = running
→ resume loading pause
```

示意：

```ts
await this.executionLoop
  .completeEffect(pending.id);

this.activeEffect = null;
this.lastRecoverableError =
  toSessionControlError(error);
this.state = "running";

if (loadingPauseAcquired) {
  await this.executionLoop.resume();
}
```

可恢复失败不会：

- 提交半个目标场景；
- 改写当前地图；
- 回放加载期间输入；
- 因图片未下载而阻塞恢复。

## 20. 致命失败

以下情况视为不可恢复：

- Core 提交抛出不变量错误；
- Execution Loop 进入 `failed`；
- 当前 Game Package Context 已不可继续使用；
- Effect ID 或 Effect 生命周期不一致；
- 必需 RuntimeExecutionSink 故障；
- Coordinator 内部状态与 Loop 屏障状态失配。

处理：

```text
Session = failed
→ executionLoop.fail(error)
→ Runtime 停止推进
→ 保留最后 Snapshot 用于诊断
```

致命失败时：

- 不恢复为 `running`；
- 不要求完成 Pending Effect；
- 不调用普通 `resume()`；
- 只允许状态读取、诊断和关闭。

## 21. 加载期间行为

当 `state === "loading"`：

- Execution Loop Effect Barrier 保持有效；
- Runtime 保持加载暂停；
- Runtime Service 拒绝普通游戏命令；
- 当前 Scene 保持完整有效；
- Runtime Service 继续提供健康检查；
- Runtime Service 可以发布加载相关 Client State；
- 不接受第二个 Runtime Effect；
- 不缓存用户输入；
- 不等待客户端图片加载完成。

Runtime 恢复不依赖客户端资源下载速度。

## 22. Repository 缓存边界

Coordinator 只调用：

```text
mapRepository.load(id)
actorRepository.load(id)
```

Repository 自行负责：

- 同一 ID 并发加载去重；
- 进程内缓存；
- 缓存失效策略；
- 数据解析；
- 局部内容校验。

Coordinator 不读取缓存内部状态，也不决定缓存命中行为。

缓存命中与否不得改变 Runtime 语义。

## 23. 资源边界

地图切换只处理逻辑资源引用：

```text
Map Snapshot
Actor Definition
Resource Key
```

图片资源链路独立：

```text
Web Client
→ Runtime Service
→ Resource Repository.open(resourceId)
```

Coordinator 不参与：

- 图片请求；
- 图片字节读取；
- MIME 返回；
- 浏览器解码；
- Client Resource Cache；
- DOM 准备完成通知。

## 24. 与 Runtime Service 的边界

Runtime Service 负责：

- 检查 `session.state`；
- 把外部输入转换成 Game Command；
- 调用 `executionLoop.submitCommand()`；
- 返回命令接受或拒绝结果；
- 发布 Runtime Transaction；
- 调用 Client State Projector；
- 提供资源接口。

Coordinator 负责：

- 接受 Pending Effect；
- 控制 Session 状态；
- 异步准备场景；
- 提交 Loop 控制操作。

Runtime Service 不等待地图加载完成才结束原始移动命令事务。

## 25. 关闭流程

```ts
async close(): Promise<void> {
  if (this.state === "closed") {
    return;
  }

  this.state = "closed";
  this.activeEffect = null;

  await this.executionLoop.close();
}
```

规则：

- Close 幂等；
- Close 后不接受新 Effect；
- Close 后不开始新 Repository 加载；
- 第一阶段不实现加载取消；
- 已经返回的 Repository Promise 可以自然结束，但结果不得提交；
- Execution Loop 负责停止 Scheduler 和关闭 Core。

异步加载完成前必须再次检查：

```ts
if (this.state === "closed") {
  return;
}
```

## 26. 第一阶段不实现

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
- NPC 通用事件调度；
- Save System；
- 通用工作流引擎。

## 27. 测试要求

第一阶段至少覆盖：

1. 启动时并行加载入口 Map 和 Player；
2. RuntimeInitialization 校验失败时 Session failed；
3. Coordinator 只持有 Execution Loop，不持有 Runtime Core；
4. 接收 Effect 时在第一次 await 前进入 loading；
5. Effect 开始后申请统一暂停；
6. 目标 Map 和 Actor 按需异步加载；
7. Prepared Transition 在提交前完整校验；
8. 成功时按 pause、commit、complete、resume 执行；
9. 可恢复失败保留旧 Scene；
10. 可恢复失败完成 Effect 并恢复 Runtime；
11. 加载期间输入不缓存、不重放；
12. 第二个 Effect 被拒绝并导致明确诊断；
13. Effect ID 不匹配进入 fatal；
14. Core 提交不变量错误进入 fatal；
15. 图片加载不阻塞 Runtime 恢复；
16. Close 幂等；
17. Close 后加载结果不再提交；
18. Repository 缓存命中不改变流程语义。

## 28. 第一阶段已冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| Coordinator 依赖 | GamePackageContext + RuntimeExecutionLoop |
| Core 直接引用 | 禁止 |
| Tick 调度 | Execution Loop 负责 |
| 普通命令 | Runtime Service 直接提交 Loop |
| 异步入口 | RuntimePendingEffect |
| Effect 数量 | 同时最多一个 |
| Effect 接收 | 同步进入 loading，再启动异步处理 |
| 加载暂停 | 通过 Loop 申请统一暂停 |
| 地图加载 | Repository 异步按需加载 |
| 地图提交 | 通过 Loop 原子提交 |
| Effect 完成 | `completeEffect(effectId)` |
| 加载输入 | 拒绝、不缓存、不重放 |
| 可恢复失败 | 保留旧 Scene，完成 Effect 并恢复 |
| 致命失败 | Session/Loop failed，不恢复 |
| 图片资源 | 不经过 Coordinator |
| Close | Coordinator 关闭 Loop |
| 加载取消 | 第一阶段不实现 |

## 29. 当前结论

```text
Repository
    负责异步读取和缓存

Session Coordinator
    负责异步内容准备和会话流程

Runtime Execution Loop
    负责串行执行、固定 Tick 和 Effect 屏障

Runtime Core
    负责同步权威游戏规则
```

Session Coordinator 不能直接调用 Runtime Core。地图切换必须经过 Execution Loop 的统一暂停、原子提交和 Effect 完成屏障。