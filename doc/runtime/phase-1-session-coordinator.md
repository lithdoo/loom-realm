# 第一阶段 Session Coordinator

## 1. 文档目的

本文档定义 LoomRealm 第一阶段 `Session Coordinator` 的职责、状态、接口和错误边界。

核心原则：

> Session Coordinator 只负责协调异步内容加载和同步 Runtime Core，不实现游戏规则，不读取资源主体，也不演化为通用工作流引擎。

第一阶段保持单会话、单 Runtime、单活动加载任务。

## 2. 模块位置

```text
Game Package Context
├── Game Catalog
├── Map Repository
├── Actor Repository
└── Resource Repository
        ↓
Session Coordinator
        ↓
Runtime Core
```

各层职责：

```text
Repository
    读取、解析和缓存静态内容

Session Coordinator
    等待异步结果并组织会话流程

Runtime Core
    同步执行权威状态事务

Runtime Service
    接收客户端命令并发布状态
```

## 3. 第一阶段职责

Session Coordinator 负责：

- 准备入口地图和玩家人物；
- 初始化 Runtime Core；
- 接收 Runtime Core 产生的异步 Effect；
- 异步加载目标地图和目标地图需要的人物；
- 加载期间暂停 Runtime；
- 校验已准备场景；
- 请求 Runtime Core 原子提交地图切换；
- 处理可恢复和不可恢复的加载失败；
- 关闭运行会话。

Session Coordinator 不负责：

- 人物移动、碰撞和 Portal 判定；
- FSDB 文件格式解析细节；
- 地图和人物缓存策略；
- 图片、音频等资源主体读取；
- HTTP、WebSocket、DOM 或 Electron；
- 存档读写；
- 多会话和多玩家调度。

## 4. 单会话模型

第一阶段一个 Coordinator 对应一个 Runtime Core：

```ts
class SessionCoordinator {
  constructor(
    private readonly game: GamePackageContext,
    private readonly runtime: RuntimeCore,
  ) {}
}
```

第一阶段冻结：

- 一个游戏进程只运行一个活动会话；
- 一个会话只持有一个 Runtime Core；
- 同一时间最多一个场景加载任务；
- 不支持后台预取；
- 不支持并行地图切换；
- 不支持加载取消；
- 不接入存档系统。

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
| `running` | Runtime 可接收普通游戏命令 |
| `loading` | 正在准备新的地图场景 |
| `failed` | 会话遇到不可恢复错误 |
| `closed` | 会话已经结束 |

`loading` 是 Session Coordinator 的流程状态，不是新的游戏业务状态。

## 6. 统一暂停

Runtime 对外只暴露统一暂停行为：

```ts
interface RuntimeCore {
  pause(): void;
  resume(): void;
  readonly paused: boolean;
}
```

用户手动暂停、过场暂停和内容加载暂停使用同一机制，其共同语义是：

- 冻结游戏逻辑时间；
- 停止人物和世界状态推进；
- 拒绝普通游戏命令；
- 保留当前权威状态；
- 允许恢复、关闭、错误处理和场景提交等控制操作。

暂停原因不进入 Runtime 状态枚举，也不改变暂停语义。

第一阶段可在 Runtime 内部使用简单计数支持嵌套暂停：

```ts
pause(): void {
  this.pauseDepth += 1;
}

resume(): void {
  if (this.pauseDepth === 0) {
    throw new Error("Runtime is not paused");
  }

  this.pauseDepth -= 1;
}

get paused(): boolean {
  return this.pauseDepth > 0;
}
```

业务层仍只观察一个 `paused` 状态，不需要暂停原因、令牌或业务专用暂停枚举。

## 7. Runtime Effect

Runtime Core 不直接调用 Repository，也不执行 `await`。

需要异步处理的结果通过 Effect 返回：

```ts
type RuntimeEffect = MapTransitionEffect;

interface MapTransitionEffect {
  readonly type: "map-transition";
  readonly targetMapId: string;
  readonly targetPosition: GridPosition;
  readonly targetDirection?: Direction;
}
```

普通移动通常不产生 Effect。触发 Portal 时，Runtime Core 完成当前同步事务并返回一个地图切换 Effect。

第一阶段规定一次 Runtime 命令最多产生一个需要异步处理的 Effect。

## 8. 最小接口

```ts
interface SessionCoordinator {
  readonly state: SessionState;

  start(): Promise<void>;

  handleRuntimeEffect(
    effect: RuntimeEffect,
  ): Promise<void>;

  close(): Promise<void>;
}
```

Runtime Core 至少提供：

```ts
interface RuntimeCore {
  initialize(input: RuntimeInitialization): void;

  dispatch(command: GameCommand): RuntimeDispatchResult;

  pause(): void;
  resume(): void;

  commitMapTransition(
    transition: PreparedMapTransition,
  ): void;

  reportControlError(error: RuntimeControlError): void;
}
```

`initialize`、`dispatch` 和 `commitMapTransition` 必须是同步、确定性的状态事务。

## 9. 启动流程

```text
CLI
→ Game Package Loader
→ Game Package Context
→ 创建 Runtime Core
→ 创建 Session Coordinator
→ coordinator.start()
```

`start()` 执行：

```text
读取 Game Catalog 入口
→ 并行加载入口地图和玩家人物
→ 校验出生点和人物定义
→ Runtime Core.initialize(...)
→ Session 进入 running
```

示意代码：

```ts
async start(): Promise<void> {
  this.assertState("starting");

  try {
    const entry = this.game.catalog.entry;

    const [map, playerActor] = await Promise.all([
      this.game.maps.load(entry.initialMapId),
      this.game.actors.load(entry.playerActorId),
    ]);

    this.validateSpawn(map, map.defaultSpawn);
    this.validateActor(playerActor);

    this.runtime.initialize({
      map,
      playerActor,
      playerPosition: map.defaultSpawn.position,
      playerDirection: map.defaultSpawn.direction,
    });

    this.state = "running";
  } catch (error) {
    this.state = "failed";
    throw error;
  }
}
```

启动期间 Runtime 尚未初始化，因此不需要额外申请加载暂停。

## 10. 普通命令处理

Runtime Service 先检查 Session 状态：

```ts
if (session.state !== "running") {
  return {
    accepted: false,
    reason: "session-not-running",
  };
}
```

然后同步调用 Runtime Core：

```ts
const result = runtime.dispatch(command);
```

结果示意：

```ts
interface RuntimeDispatchResult {
  readonly stateChanged: boolean;
  readonly effects: readonly RuntimeEffect[];
}
```

Runtime Service 或会话入口层将 Effect 交给 Coordinator：

```ts
for (const effect of result.effects) {
  await coordinator.handleRuntimeEffect(effect);
}
```

暂停和加载期间收到的普通游戏输入不缓存、不回放。

## 11. 地图切换

地图切换使用“准备—提交”流程。

### 11.1 开始加载

```text
Runtime Core 检测 Portal
→ 返回 MapTransitionEffect
→ Session Coordinator 进入 loading
→ Runtime Core.pause()
```

当前地图和玩家状态保持有效。

### 11.2 准备目标场景

Coordinator 执行：

```text
Map Repository.load(targetMapId)
→ Actor Repository.load(...) 加载必需人物
→ 校验目标位置和引用
→ 创建 PreparedMapTransition
```

```ts
interface PreparedMapTransition {
  readonly map: MapSnapshot;
  readonly actors: readonly ActorDefinition[];
  readonly playerPosition: GridPosition;
  readonly playerDirection?: Direction;
}
```

图片资源主体不在此阶段加载。Coordinator 只确认地图和人物引用的资源 Key 存在。

### 11.3 原子提交

全部内容准备成功后：

```text
Runtime Core.commitMapTransition(prepared)
→ Runtime Core.resume()
→ Session Coordinator 进入 running
```

`commitMapTransition` 必须一次性完成：

- 当前地图替换；
- 玩家位置和朝向更新；
- 旧移动状态清理；
- 场景人物状态重建；
- 权威状态版本递增。

Coordinator 不得直接修改 Runtime 内部字段。

## 12. 地图切换实现示意

```ts
private async loadAndCommitMapTransition(
  effect: MapTransitionEffect,
): Promise<void> {
  if (this.state !== "running") {
    throw new Error(
      `Cannot transition while session is ${this.state}`,
    );
  }

  this.state = "loading";
  this.runtime.pause();

  try {
    const targetMap = await this.game.maps.load(
      effect.targetMapId,
    );

    const actors = await Promise.all(
      targetMap.actorIds.map((actorId) =>
        this.game.actors.load(actorId),
      ),
    );

    this.validateTransition({
      effect,
      targetMap,
      actors,
    });

    this.runtime.commitMapTransition({
      map: targetMap,
      actors,
      playerPosition: effect.targetPosition,
      playerDirection: effect.targetDirection,
    });

    this.state = "running";
  } catch (error) {
    this.handleTransitionFailure(error);
  } finally {
    if (this.state !== "failed") {
      this.runtime.resume();
    }
  }
}
```

实际实现必须保证 `resume()` 只与本次加载调用的 `pause()` 配对。

## 13. 加载期间的行为

当 `state === "loading"` 时：

- Runtime 保持暂停；
- 拒绝移动和交互命令；
- 当前地图保持有效；
- Runtime Service 继续响应状态和健康检查；
- Runtime Service 可以通知客户端显示加载界面；
- 不接受第二个地图切换；
- 不缓存用户输入；
- 不等待客户端图片加载完成。

客户端收到新场景状态后，再通过 Runtime Service 按资源 Key 请求图片并更新 DOM。

Runtime 的恢复不依赖客户端图片加载速度。

## 14. 缓存边界

Repository 负责缓存：

```text
Session Coordinator
→ mapRepository.load(id)

Map Repository
├── 已缓存：直接返回
└── 未缓存：异步读取、解析、校验并缓存
```

Coordinator 不管理 LRU、内容摘要、缓存容量或文件读取去重。

这保证 Coordinator 不依赖内容来自普通目录、未来单文件包或其他只读来源。

## 15. 错误处理

### 15.1 可恢复错误

例如：

- 目标地图缺失或损坏；
- 必需人物定义缺失；
- 目标坐标越界或不可站立；
- 目标地图引用无效。

处理：

```text
保留当前地图和人物状态
→ 取消切换
→ 恢复 Runtime
→ Session 返回 running
→ 向客户端报告 MAP_TRANSITION_FAILED
```

### 15.2 不可恢复错误

例如：

- Runtime 提交事务失败；
- Game Package Context 无法继续访问；
- 会话内部不变量被破坏。

处理：

```text
Session 进入 failed
→ Runtime 保持暂停
→ 拒绝普通游戏命令
→ 客户端显示致命错误
```

第一阶段只需要区分可恢复内容错误和不可恢复会话错误，不设计复杂错误继承树。

## 16. Resource Repository 边界

资源主体读取不经过 Session Coordinator：

```text
Web Client
→ Runtime Service
→ Resource Repository.open(resourceId)
→ 返回图片字节
```

Coordinator 只处理地图和人物的结构化定义，不处理：

- PNG/WebP 解码；
- 资源流传输；
- 浏览器缓存；
- 客户端资源加载进度；
- DOM 场景是否已经显示。

## 17. 关闭会话

```ts
async close(): Promise<void> {
  if (this.state === "closed") {
    return;
  }

  this.state = "closed";
  this.runtime.close();
}
```

第一阶段不支持取消正在执行的底层文件读取。关闭后即使异步加载完成，也不得提交到 Runtime Core。

实现时可在提交前再次检查：

```ts
if (this.state === "closed") {
  return;
}
```

## 18. 第一阶段验收

正常路径：

- 入口地图和玩家人物并行加载；
- Runtime 初始化后进入 `running`；
- 普通移动不产生异步 Effect；
- Portal 产生一个地图切换 Effect；
- 加载期间 Runtime 处于统一暂停状态；
- 目标地图和人物准备完成后原子提交；
- 提交后恢复 Runtime；
- 图片资源由客户端另行请求。

错误路径：

- 入口地图加载失败时 Session 进入 `failed`；
- 入口人物加载失败时 Session 进入 `failed`；
- 地图切换目标不存在时保留当前地图；
- 目标位置非法时保留当前地图；
- 加载期间拒绝第二个地图切换；
- 加载期间拒绝并丢弃普通游戏输入；
- Runtime 提交失败时 Session 进入 `failed`。

确定性要求：

- 相同的 PreparedMapTransition 产生相同的 Runtime 权威状态；
- Repository 缓存命中与否不改变结果；
- 异步完成顺序不改变提交语义；
- 图片加载速度不影响 Runtime 状态。

## 19. 已冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| Coordinator 数量 | 每个会话一个 |
| Runtime 数量 | 每个会话一个 |
| 会话状态 | `starting/running/loading/failed/closed` |
| 暂停语义 | 统一 `paused` 状态 |
| 暂停原因 | 不进入 Runtime 状态模型 |
| 嵌套暂停 | Runtime 内部简单计数 |
| 异步任务 | 一次最多一个场景加载 |
| 地图加载 | `MapRepository.load()` |
| 人物加载 | `ActorRepository.load()` |
| 缓存 | Repository 负责 |
| 资源主体 | 不由 Coordinator 加载 |
| 地图提交 | Runtime 同步原子事务 |
| 加载失败 | 可恢复时保留当前地图 |
| 输入缓存 | 不缓存、不回放 |
| 客户端资源就绪 | Runtime 不等待 |
| 加载取消 | 暂不支持 |
| 后台预取 | 暂不支持 |
| 多会话 | 暂不支持 |
| 存档 | 暂不接入 |

## 20. 当前结论

```text
Session Coordinator
    负责等待和协调

Repository
    负责读取和缓存

Runtime Core
    负责暂停、规则和权威状态事务

Runtime Service
    负责客户端通信和资源接口
```

第一阶段 Session Coordinator 必须保持薄、单向和可替换。它只把异步内容准备结果交给同步 Runtime Core，不成为游戏规则层、缓存层或通信层。