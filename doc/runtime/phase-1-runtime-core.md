# 第一阶段 Runtime Core

## 1. 文档目的

本文档定义 LoomRealm 第一阶段 `Runtime Core` 的职责边界、权威状态模型、同步执行接口、命令结果、逻辑时间、移动事务、统一暂停和地图切换提交规则。

核心原则：

> Runtime Core 只负责游戏现在是什么状态以及游戏规则如何改变该状态。它不负责寻找内容、等待内容、传输内容或决定客户端如何渲染。

第一阶段 Runtime Core 必须满足：

- 同步；
- 确定性；
- 无文件 I/O；
- 无网络 I/O；
- 无 Promise；
- 不依赖客户端状态树；
- 每个公开写操作都是完整状态事务。

## 2. 模块位置

```text
已加载并校验的静态场景内容
        ↓
Session Coordinator
        ↓
Runtime Core
├── Runtime State
├── Movement Rules
├── Collision Rules
├── Portal Rules
└── Runtime Effect
        ↓
后续 Client State Projector / Runtime Service
```

职责边界：

```text
Repository
    读取、解析和缓存静态内容

Session Coordinator
    异步准备 Runtime 所需内容

Runtime Core
    同步维护权威游戏状态并执行规则

Client State Projector
    后续将游戏状态投影成客户端状态树

Runtime Service
    后续负责通信、资源和命令入口
```

Runtime Core 不知道：

```text
scope
roots
key
client node tag
data schema
DOM
Web Component
JSON-RPC
WebSocket
```

## 3. 第一阶段职责

Runtime Core 负责：

- 初始化当前场景和玩家状态；
- 维护当前地图和人物的权威游戏状态；
- 接收明确的游戏命令；
- 处理人物转向和格子移动；
- 执行地图边界、静态通行和人物占用碰撞；
- 推进逻辑时间和移动过程；
- 在人物完成移动后检测 Portal；
- 产生需要外部异步处理的 Runtime Effect；
- 统一暂停和恢复游戏推进；
- 原子提交已经准备好的地图切换；
- 维护权威状态 Revision；
- 提供只读游戏快照；
- 进入 failed 或 closed 生命周期。

Runtime Core 不负责：

- 打开游戏包；
- 读取或解析 FSDB；
- 调用 Map、Actor 或 Resource Repository；
- 异步加载地图和人物；
- 管理内容缓存；
- 读取图片、音频或其他资源主体；
- Session 加载流程；
- Server、RPC 或网络连接；
- Client Scoped State Tree；
- DOM、CSS、动画帧或资源缓存；
- 存档读写；
- 多会话和多玩家调度。

## 4. 执行模型

Runtime Core 的所有公开操作都在当前调用栈内完成：

```text
读取当前状态
→ 校验输入和前置条件
→ 计算完整 Next State
→ 校验 Next State 不变量
→ 一次性替换当前状态
→ 返回 Result
```

禁止：

```ts
await repository.load(...);
fs.readFile(...);
fetch(...);
webSocket.send(...);
```

相同初始内容、相同初始状态、相同命令序列和相同 Tick 序列必须产生相同的最终状态、Event 和 Effect。

## 5. 静态内容与可变状态

Runtime Core 必须区分静态场景内容和可变会话状态。

### 5.1 Runtime Scene Content

`RuntimeSceneContent` 是当前场景运行规则所需的只读内容：

```ts
interface RuntimeSceneContent {
  readonly map: MapSnapshot;

  readonly actorDefinitions:
    ReadonlyMap<string, ActorDefinition>;
}
```

它由 Session Coordinator 准备并校验后交给 Runtime Core。

第一阶段至少包含：

- 当前 Map Snapshot；
- 当前场景所需 Actor Definition；
- 通行规则；
- Portal 定义；
- 人物静态移动参数。

Runtime Core 不修改这些静态定义。

### 5.2 Runtime State

```ts
type RuntimeLifecycle =
  | "uninitialized"
  | "active"
  | "failed"
  | "closed";
```

```ts
interface RuntimeState {
  readonly lifecycle: RuntimeLifecycle;

  readonly revision: number;

  readonly simulationTimeMs: number;

  readonly pauseDepth: number;

  readonly scene: RuntimeScene | null;

  readonly failure?: RuntimeFailure;
}
```

其中暂停是 active 生命周期上的正交属性：

```text
active + running
active + paused
failed
closed
```

### 5.3 Runtime Scene

为了保证地图内容和场景状态能够原子替换，二者由同一个 Scene 对象持有：

```ts
interface RuntimeScene {
  readonly content: RuntimeSceneContent;
  readonly state: RuntimeSceneState;
}
```

```ts
interface RuntimeSceneState {
  readonly mapId: string;

  readonly playerActorId: string;

  readonly actors:
    ReadonlyMap<string, RuntimeActorState>;
}
```

`mapId` 必须始终等于 `content.map.id`。

## 6. 人物权威状态

```ts
interface RuntimeActorState {
  readonly id: string;

  readonly definitionId: string;

  /**
   * 最近一个已经完成的稳定格子位置。
   */
  readonly position: GridPosition;

  readonly direction: Direction;

  readonly movement: RuntimeMovementState;
}
```

第一阶段移动状态：

```ts
type RuntimeMovementState =
  | {
      readonly type: "idle";
    }
  | {
      readonly type: "walking";

      readonly from: GridPosition;
      readonly to: GridPosition;

      readonly direction: Direction;

      readonly elapsedMs: number;
      readonly durationMs: number;
    };
```

规则：

- `position` 表示最后一个已经完成的稳定位置；
- 人物移动期间，目标位置保存在 `movement.to`；
- 移动完成前不得提前把 `position` 改成目标格；
- 移动完成时一次性更新 `position` 并把 `movement` 改为 `idle`；
- Sprite、资源 Key 和移动速度等静态信息属于 Actor Definition，不复制为权威可变字段。

## 7. 最小公开接口

```ts
interface RuntimeCore {
  readonly lifecycle: RuntimeLifecycle;
  readonly revision: number;
  readonly paused: boolean;

  initialize(
    input: RuntimeInitialization,
  ): RuntimeResult;

  dispatch(
    command: GameCommand,
  ): RuntimeResult;

  tick(
    deltaMs: number,
  ): RuntimeResult;

  pause(): RuntimeResult;

  resume(): RuntimeResult;

  commitMapTransition(
    transition: PreparedMapTransition,
  ): RuntimeResult;

  getSnapshot(): RuntimeSnapshot;

  fail(error: RuntimeFailure): RuntimeResult;

  close(): RuntimeResult;
}
```

所有方法同步返回，不返回 Promise。

## 8. 初始化事务

```ts
interface RuntimeInitialization {
  readonly content: RuntimeSceneContent;

  readonly player: {
    readonly actorId: string;
    readonly position: GridPosition;
    readonly direction: Direction;
  };
}
```

`initialize()` 必须校验：

- 当前 lifecycle 为 `uninitialized`；
- Map Snapshot 有效；
- 玩家 Actor Definition 存在；
- 玩家 ID 在新场景中唯一；
- 出生坐标位于地图范围内；
- 出生坐标允许人物站立；
- 初始人物状态满足 Runtime 不变量。

执行顺序：

```text
验证全部输入
→ 创建完整 RuntimeScene
→ 创建完整 Active RuntimeState
→ 一次性安装
→ revision 递增
```

任何校验失败都不得留下半初始化状态。

## 9. 游戏命令

第一阶段只定义明确的命令联合类型：

```ts
type GameCommand = MoveCommand;
```

```ts
interface MoveCommand {
  readonly type: "move";
  readonly direction: Direction;
}
```

后续可以通过联合类型增加新命令：

```ts
type GameCommand =
  | MoveCommand
  | InteractCommand
  | ConfirmCommand;
```

第一阶段禁止使用缺少类型约束的通用消息：

```ts
interface GenericCommand {
  type: string;
  payload: unknown;
}
```

客户端输入格式、RPC 方法和 DOM Event 不属于 Game Command 定义。Runtime Service 后续负责把外部输入归一化为 Game Command。

## 10. Runtime Result

所有状态事务统一返回：

```ts
interface RuntimeResult {
  readonly accepted: boolean;

  readonly stateChanged: boolean;

  readonly revision: number;

  readonly rejection?: RuntimeRejection;

  readonly events: readonly RuntimeEvent[];

  readonly effects: readonly RuntimeEffect[];
}
```

含义：

- `accepted`：命令或控制操作是否被 Runtime 正常处理；
- `stateChanged`：权威状态是否发生变化；
- `revision`：事务结束后的当前 Revision；
- `rejection`：正常业务拒绝原因；
- `events`：已经发生的同步游戏事实；
- `effects`：需要 Core 外部继续处理的异步请求。

第一阶段规定：

- 每个公开调用最多提交一次权威状态；
- 每个公开调用 Revision 最多递增一次；
- 一次事务最多产生一个需要异步处理的 Effect；
- 被拒绝且无状态变化的命令不递增 Revision。

## 11. Runtime Event

Event 表示 Core 内已经发生的事实：

```ts
type RuntimeEvent =
  | ActorTurnedEvent
  | ActorWalkStartedEvent
  | ActorWalkCompletedEvent
  | MovementBlockedEvent;
```

```ts
interface ActorTurnedEvent {
  readonly type: "actor-turned";
  readonly actorId: string;
  readonly direction: Direction;
}

interface ActorWalkStartedEvent {
  readonly type: "actor-walk-started";
  readonly actorId: string;
  readonly from: GridPosition;
  readonly to: GridPosition;
  readonly direction: Direction;
}

interface ActorWalkCompletedEvent {
  readonly type: "actor-walk-completed";
  readonly actorId: string;
  readonly position: GridPosition;
}

interface MovementBlockedEvent {
  readonly type: "movement-blocked";
  readonly actorId: string;
  readonly target: GridPosition;
}
```

Event 是一次事务的同步输出，不承担可恢复状态存储，也不是客户端协议对象。

## 12. Runtime Effect

Effect 表示 Runtime Core 无法在同步事务中自行完成的外部工作请求。

第一阶段只有地图切换 Effect：

```ts
type RuntimeEffect = MapTransitionEffect;
```

```ts
interface MapTransitionEffect {
  readonly type: "map-transition";

  readonly targetMapId: string;

  readonly targetPosition: GridPosition;

  readonly targetDirection?: Direction;
}
```

处理链路：

```text
Runtime Core 产生 MapTransitionEffect
→ Session Coordinator 暂停 Runtime
→ Repository 异步准备目标内容
→ Session Coordinator 建立 PreparedMapTransition
→ Runtime Core 原子提交
→ Session Coordinator 恢复 Runtime
```

Runtime Core 不保存加载 Promise，不轮询加载进度，也不读取目标地图。

## 13. 移动命令事务

人物移动命令按照以下顺序处理：

```text
检查 Runtime active
→ 检查 Runtime 未暂停
→ 获取玩家人物
→ 检查人物处于 idle
→ 更新人物朝向
→ 计算目标格
→ 检查地图边界
→ 检查 Tile 通行
→ 检查人物占用
→ 阻挡或开始 walking
→ 一次性提交状态
```

目标位置计算应为纯函数：

```ts
function calculateTargetPosition(
  position: GridPosition,
  direction: Direction,
): GridPosition;
```

碰撞判断应为纯函数或无副作用规则函数：

```ts
function canEnterTile(
  content: RuntimeSceneContent,
  scene: RuntimeSceneState,
  actorId: string,
  target: GridPosition,
): MovementDecision;
```

### 13.1 被阻挡

被阻挡通常不是系统错误。

Runtime 可以：

- 接受该命令；
- 更新人物朝向；
- 保持位置不变；
- 返回 `movement-blocked` Event。

若朝向已经相同且没有其他状态变化，则可以返回 `stateChanged: false`，但仍返回阻挡 Event。

### 13.2 开始移动

允许进入目标格时：

```text
position 保持起点
movement = walking(from, to, elapsed=0, duration)
```

Core 返回 `actor-walk-started` Event。

## 14. Tick 与逻辑时间

```ts
tick(deltaMs: number): RuntimeResult;
```

Tick 负责：

- 推进 `simulationTimeMs`；
- 推进正在进行的移动；
- 完成到期移动；
- 在移动完成后检测 Portal；
- 产生移动完成 Event 和可选地图切换 Effect。

输入规则：

```ts
const safeDeltaMs = Math.min(
  Math.max(deltaMs, 0),
  MAX_TICK_DELTA_MS,
);
```

第一阶段规定：

- 负数 Delta 作为调用错误处理；
- 过大的 Delta 被限制到配置上限；
- 一个 Tick 不自动开始新的用户移动；
- 暂停期间不推进逻辑时间；
- 暂停期间的真实时间不在恢复后补算。

```text
暂停 5 秒
→ simulationTimeMs 不变
→ 恢复后从原逻辑时间继续
```

## 15. 移动完成与 Portal

当：

```text
movement.elapsedMs + deltaMs >= movement.durationMs
```

Core 执行：

```text
position = movement.to
→ movement = idle
→ 产生 actor-walk-completed
→ 检查新位置上的 Portal
```

Portal 只在“人物完成进入该格”这一状态变化上检测，不在每个空闲 Tick 上按当前位置重复触发。

这样地图切换加载失败并恢复后，不会因为人物仍站在 Portal 格而在每个 Tick 重复产生 Effect。人物需要再次完成一次进入 Portal 格的移动才能重新触发。

## 16. 统一暂停

Runtime Core 只暴露统一暂停语义：

```ts
pause(): RuntimeResult;
resume(): RuntimeResult;
readonly paused: boolean;
```

内部第一阶段使用简单深度计数：

```ts
private pauseDepth = 0;

get paused(): boolean {
  return this.pauseDepth > 0;
}
```

行为：

```text
0 → 1
    paused 从 false 变为 true
    revision + 1

1 → 2
    paused 仍为 true
    revision 不变

2 → 1
    paused 仍为 true
    revision 不变

1 → 0
    paused 从 true 变为 false
    revision + 1
```

暂停期间冻结：

- 游戏逻辑时间；
- 人物移动推进；
- 普通游戏命令；
- NPC 和其他自动规则推进。

暂停期间允许：

- `resume()`；
- `commitMapTransition()`；
- `getSnapshot()`；
- `fail()`；
- `close()`。

手动暂停、过场暂停和加载暂停共享相同 Runtime 行为。暂停原因不进入 Runtime State。

## 17. Prepared Map Transition

Session Coordinator 向 Core 提交已经加载和校验的目标场景：

```ts
interface PreparedMapTransition {
  readonly content: RuntimeSceneContent;

  readonly playerPosition: GridPosition;

  readonly playerDirection?: Direction;
}
```

第一阶段地图切换不保存目标加载任务、进度或客户端资源状态。

## 18. 地图切换原子事务

`commitMapTransition()` 必须验证：

- lifecycle 为 `active`；
- Runtime 当前处于暂停；
- 目标 Map Snapshot 有效；
- 玩家 Actor Definition 在目标内容中存在；
- 目标坐标位于地图范围内；
- 目标坐标允许站立；
- 新场景 Actor ID 唯一；
- 新 Scene 满足全部 Runtime 不变量。

提交过程：

```text
读取当前玩家身份和朝向
→ 构建完整目标 RuntimeScene
→ 验证完整目标 Scene
→ 一次性替换 state.scene
→ revision + 1
```

必须一次性更新：

- 当前地图内容；
- 当前地图 ID；
- 场景人物定义和人物状态；
- 玩家位置；
- 玩家朝向；
- 玩家移动状态；
- 旧场景临时状态。

禁止由 Session Coordinator 逐字段修改 Core：

```ts
runtime.currentMap = targetMap;
runtime.player.position = targetPosition;
runtime.actors.clear();
```

任何提交异常都必须保留提交前的完整 Scene。

## 19. Revision

`RuntimeState.revision` 是权威游戏状态版本。

规则：

- 初始化成功时递增；
- 人物朝向、移动或位置变化时递增；
- 逻辑时间或移动进度发生权威变化时递增；
- `paused` 可观察值变化时递增；
- 地图切换成功时递增一次；
- lifecycle 或 failure 变化时递增；
- 单个事务最多递增一次；
- 纯读取不递增；
- 无状态变化的拒绝不递增。

Runtime Revision 不是 RPC Message Sequence，也不是 Client State Revision。后续投影层可以根据 Runtime Revision 判断是否需要重新计算客户端状态，但三者不能混用。

## 20. Runtime Snapshot

Core 只暴露游戏领域快照：

```ts
interface RuntimeSnapshot {
  readonly lifecycle: RuntimeLifecycle;

  readonly revision: number;

  readonly simulationTimeMs: number;

  readonly paused: boolean;

  readonly scene: RuntimeScene | null;

  readonly failure?: RuntimeFailure;
}
```

规则：

- Snapshot 是只读游戏数据；
- Snapshot 不包含 Scope、Roots、Tag 或 DOM 信息；
- Snapshot 不能暴露可由外部修改的内部 Map 或对象引用；
- 外部不能通过 Snapshot 修改权威状态；
- Snapshot 不是直接发送给客户端的协议对象。

未来关系：

```text
RuntimeSnapshot
→ Client State Projector
→ Client Scoped State Tree
```

Client State Projector 是独立模块，不进入第一阶段 Core 实现。

## 21. 拒绝、调用错误与 Runtime 故障

### 21.1 正常拒绝

正常业务拒绝作为 Result 返回，不抛异常：

```ts
type RuntimeRejection =
  | "runtime-paused"
  | "runtime-not-active"
  | "actor-busy"
  | "unknown-actor";
```

碰撞阻挡通常返回 Event，不属于 Runtime 故障。

### 21.2 调用错误

调用方违反接口前置条件时可以抛出明确错误：

- 重复初始化；
- `resume()` 时没有活动暂停；
- 非法 Tick Delta；
- Runtime closed 后继续提交；
- 非法 PreparedMapTransition；
- 缺失必要 Actor Definition。

### 21.3 Runtime 故障

```ts
interface RuntimeFailure {
  readonly code: string;
  readonly message: string;
}
```

进入 `failed` 后：

- 停止 Tick；
- 拒绝普通游戏命令；
- 保留最后一个完整状态用于诊断；
- 允许读取 Snapshot；
- 允许关闭；
- 不允许恢复为 active。

## 22. Close

`close()`：

- 可重复调用；
- 第一次调用把 lifecycle 改为 `closed`；
- 停止全部游戏推进；
- 拒绝后续命令、Tick、暂停和场景提交；
- 允许读取最终 Snapshot；
- 不执行文件、网络或资源清理。

外部资源和进程清理由 Session、Runtime Service 和 Bootstrap 层负责。

## 23. 内部事务辅助

建议使用统一提交方法：

```ts
private commit(
  nextState: RuntimeState,
  events: readonly RuntimeEvent[] = [],
  effects: readonly RuntimeEffect[] = [],
): RuntimeResult {
  this.assertStateValid(nextState);

  this.state = {
    ...nextState,
    revision: this.state.revision + 1,
  };

  return {
    accepted: true,
    stateChanged: true,
    revision: this.state.revision,
    events,
    effects,
  };
}
```

无状态变化：

```ts
private noChange(
  events: readonly RuntimeEvent[] = [],
  effects: readonly RuntimeEffect[] = [],
): RuntimeResult;
```

正常拒绝：

```ts
private reject(
  rejection: RuntimeRejection,
): RuntimeResult;
```

公开方法不得绕过统一事务入口直接修改内部状态。

## 24. 规则函数

第一阶段规则尽量实现为纯函数：

```ts
function calculateTargetPosition(
  position: GridPosition,
  direction: Direction,
): GridPosition;
```

```ts
function canEnterTile(
  content: RuntimeSceneContent,
  scene: RuntimeSceneState,
  actorId: string,
  target: GridPosition,
): MovementDecision;
```

```ts
function advanceWalking(
  actor: RuntimeActorState,
  deltaMs: number,
): RuntimeActorState;
```

```ts
function findPortalEnteredAt(
  map: MapSnapshot,
  position: GridPosition,
): PortalDefinition | undefined;
```

规则函数不得访问全局时钟、随机数、文件系统或网络。

未来确实需要随机性时，必须通过显式、可测试的随机源输入，不直接调用全局随机函数。

## 25. 推荐代码结构

```text
src/runtime/
├── runtime-core.ts
├── runtime-state.ts
├── runtime-command.ts
├── runtime-result.ts
├── runtime-event.ts
├── runtime-effect.ts
├── runtime-snapshot.ts
├── runtime-errors.ts
├── movement/
│   ├── movement-state.ts
│   └── movement-rules.ts
├── collision/
│   └── collision-rules.ts
└── portal/
    └── portal-rules.ts
```

第一阶段不需要 ECS、插件容器、通用事件总线或复杂领域框架。

## 26. 测试要求

Runtime Core 测试必须使用内存中的 Map Snapshot 和 Actor Definition，不依赖真实文件系统或 Repository。

### 26.1 初始化

- 合法入口场景初始化成功；
- 重复初始化失败；
- 玩家定义缺失失败；
- 出生位置越界失败；
- 出生位置不可站立失败；
- 初始化失败不留下部分状态。

### 26.2 移动

- 合法移动进入 walking；
- 被阻挡时位置不变；
- 被阻挡时人物仍可转向；
- walking 中拒绝新移动；
- Tick 推进移动；
- 移动完成后 position 原子更新；
- 相同输入序列产生相同状态。

### 26.3 Portal

- 只有移动完成进入 Portal 格时产生 Effect；
- 空闲 Tick 不重复产生 Effect；
- 非 Portal 格不产生 Effect；
- Effect 内容与 Portal 定义一致。

### 26.4 暂停

- 0 → 1 进入 paused；
- 嵌套暂停保持单一 paused 语义；
- 暂停期间 Tick 不推进；
- 暂停期间拒绝游戏命令；
- 只释放一层暂停不会错误恢复；
- 1 → 0 恢复运行。

### 26.5 地图切换

- 只有暂停状态允许提交；
- 合法 PreparedMapTransition 原子替换 Scene；
- 玩家位置和朝向正确；
- 旧移动状态被清理；
- 非法目标位置不改变旧 Scene；
- 缺失 Actor Definition 不改变旧 Scene；
- 提交成功 Revision 只递增一次。

### 26.6 生命周期

- failed 后拒绝命令和 Tick；
- closed 后拒绝所有写操作；
- close 可重复调用；
- 最终 Snapshot 可读取。

## 27. 第一阶段冻结决策

| 问题 | 第一阶段结论 |
|---|---|
| Core 定位 | 权威游戏状态机 |
| 执行方式 | 同步、确定性 |
| 文件和网络 I/O | 禁止 |
| Promise | 禁止 |
| 当前场景 | 一个 RuntimeScene |
| 静态内容 | RuntimeSceneContent，只读 |
| 可变状态 | RuntimeState / RuntimeActorState |
| 玩家数量 | 一个玩家人物 |
| 普通输入 | 明确 GameCommand 联合类型 |
| 第一阶段命令 | `move` |
| 时间推进 | `tick(deltaMs)` |
| 移动模型 | idle / walking |
| 碰撞 | 地图边界、静态通行、人物占用 |
| Portal | 移动完成时检测 |
| 外部异步工作 | Runtime Effect |
| 第一阶段 Effect | MapTransitionEffect |
| 暂停 | 统一 paused，内部简单深度计数 |
| 地图切换 | PreparedMapTransition 同步原子提交 |
| 状态版本 | Runtime Revision |
| 状态读取 | 只读 RuntimeSnapshot |
| Client State Tree | 不进入 Core |
| Runtime Service | 不进入 Core |
| 存档 | 暂不接入 |
| 多玩家 | 暂不接入 |
| ECS / 插件 / 脚本 | 暂不接入 |

## 28. 当前结论

```text
Runtime Core
    输入
    ├── RuntimeInitialization
    ├── GameCommand
    ├── Tick Delta
    ├── Pause / Resume
    └── PreparedMapTransition

    持有
    ├── 当前 RuntimeSceneContent
    └── 当前 RuntimeState

    输出
    ├── Runtime Result
    ├── Runtime Event
    ├── Runtime Effect
    └── Runtime Snapshot
```

Runtime Core 只回答两个问题：

```text
游戏当前是什么状态？
给定一个明确输入后，游戏状态应如何确定性变化？
```

客户端应该看到什么，由后续 Client State Projector 决定；客户端如何呈现，由 Web Client 决定。