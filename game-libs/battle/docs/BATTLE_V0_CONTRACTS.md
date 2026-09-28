# Battle v0 数据契约

> 状态：**Presentation contract FROZEN FOR IMPLEMENTATION；其余 Contract 仍可含明确标注的 OPEN**。本文定义 Battle v0 canonical 数据边界；冻结表示 v0 实现不得自行改变字段语义或 ownership，不代表 TypeScript/Zod/JSON Schema 已经落地。
>
> 核心 gameplay 语义只以 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) 为准；本文不重新定义 reducer 行为。

## 1. Contract 边界

建议提供很薄的共享模块：

```text
battle/contracts
  BattleConfig
  BattleSceneInit
  BattleSnapshot
  BattleObservation
  PlanConstraints
  PlanSubmission
  PlanAcceptance
  BattleEvent
  RenderProjection
  SkillEffectProjection
  ReplayRecord
```

Simulation / Decision / Presentation 可以依赖这些数据类型。

Contracts 自己不拥有运行状态，不是第四个 Runtime Layer。

按 `ARCH-005`，三层共享的是稳定 Contract/Port，而不是彼此的 concrete implementation。Application/Subsystem 可以选择并注入 Decision、Simulation、Presentation 的具体实现，但 Battle clock、scheduler、Tick reducer 与 accepted-plan execution 仍由 Simulation 自己拥有。

## 2. Serialization 状态

### CONTRACT-OPEN-001 — Content subject/version 与命名 — OPEN

尚未冻结：

- 正式 subject/version，例如是否使用 `struct.BattleActor/v1`；
- 全局字段命名风格；
- Content key 是否必须等于对象内 `id`；
- `skills[]`、`effect` 的正式引用编码。

Schema version 应代表**结构兼容性**，不应因为 Fireball damage 从 5 调成 6 就升级。

下面定义的是逻辑语义；正式序列化细节仍可调整。

## 3. Shared primitives

### ActorId

```ts
type ActorId = string
```

所有 Actor collection 都以 `actorId` 作为语义 identity。数组/迭代顺序不代表 ally/enemy、先后手或裁决优先级；需要 deterministic 顺序时必须显式按稳定 key 排序。

v0 仍由 `BATTLE-001` 限制为恰好两个 combat Actor。Contract 使用 collection shape 是为了避免把 cardinality 编码进跨层 ABI，不表示 v0 支持多人。

### Team

```ts
type Team = "ally" | "enemy"
```

这是 v0 的两方 team identity，与 collection 顺序无关。未来组队可以在同一 Team 下拥有多个 Actor；FFA/多阵营若需要超过两种 Team，属于新版本 gameplay contract，不在 v0 暗中扩展。

### GridPosition

```ts
type GridPosition = {
  x: integer
  y: integer
}
```

权威位置只能是整数格。

### Direction

```ts
type Direction = 2 | 4 | 6 | 8
```

语义见 `STATE-002`。

### ResourceRef

Battle 直接复用 LoomRealm 已有资源身份概念：

```ts
type ResourceRef = {
  namespace: string
  key: string
  contentVersion?: string
}
```

实现时应优先复用仓库已有公共类型，而不是再定义一套平行结构。

### MapRef — FROZEN

```ts
type MapRef = {
  mapId: integer
}
```

`mapId` 必须是正 safe integer，并对应 `struct.Map` 的 record key。Presentation 不接受 Map Runtime instance。

## 4. Battle Content

### 4.1 BattleActor

当前概念结构：

```json
{
  "id": "mage",
  "name": "Mage",
  "character": {
    "namespace": "resource.Graphics",
    "key": "Characters/Mage"
  },
  "max_hp": 10,
  "skills": ["firebolt", "grab"]
}
```

逻辑字段：

- definition id；
- display name；
- Character Graphics reference；
- 正整数 max HP；
- BattleSkill reference 列表。

以下属于 Runtime State，**不得**写进静态 BattleActor Content：

```text
currentHp
tile
direction
actionState
activePlan
activeStep
protectedUntilTickExclusive
actionGeneration
decisionGeneration
```

v0 默认满血开战，不需要独立 `initial_hp`。

### 4.2 BattleSkill

当前概念结构：

```json
{
  "id": "firebolt",
  "name": "Firebolt",
  "range": [
    [0, 0.5, 0],
    [0, 1.0, 0],
    [0, "↑", 0]
  ],
  "damage": 7,
  "timing": {
    "windup_ticks": 3,
    "recovery_ticks": 2
  },
  "effect": "firebolt"
}
```

逻辑字段：

```text
id
name
range
damage
timing.windup_ticks
timing.recovery_ticks
effect
```

v0 不包含：

```text
tracking
active_ticks
MP
accuracy
critical
element
armor penetration
universal cooldown
ammo
target/effect type
```

视觉持续时间属于 BattleEffect/Presentation，不属于 BattleSkill Rule timing。

Range Schema 校验遵循 `SKILL-001`。

### 4.3 BattleEffect — Presentation v0 FROZEN

BattleEffect 只属于 Presentation Content。v0 record subject 固定为 `struct.BattleEffect`，record key 必须等于 `id`。

exact v0 shape：

```ts
type BattleEffectContent = {
  id: string
  image: {
    namespace: "resource.Graphics"
    key: string
  }
  anchor: "tile-center"
  timing: {
    fade_in_ticks: integer
    hold_ticks: integer
    fade_out_ticks: integer
  }
}
```

约束：

- `id` 非空且等于 record key；
- `image.key` 必须以 `BattleEffects/` 开头；
- 三个 timing 字段均为非负 safe integer；
- 三个 timing 之和必须大于 0；
- v0 只有 `"tile-center"` anchor；
- visual duration = 对应 ticks × 本场 `tickDurationMs`；
- BattleEffect timing 只控制视觉，不得改变 Skill windup/recovery/damage timing；
- v0 不支持 outcome-specific image、projectile、particle、shader 或 animation editor。

hit/immune/miss/invalid 是否创建 transient visual 的固定 policy 在 Presentation/Integration FROZEN 规范中定义。

## 5. BattleConfig## 5. BattleConfig

概念：

```ts
type BattleConfig = {
  tickDurationMs: 200
  maxPathSteps?: integer   // default 6
  battleSeed: string | integer

  moveTicks: integer
  protectionTicks: integer

  map: MapRef
  actors: readonly InitialActorPlacement[]
}
```

`actors` 是 actorId-addressed collection；`InitialActorPlacement` 必须携带唯一 `actorId` 与显式 v0 side/team identity，数组顺序不承载 side 语义。

v0 serialization/schema 可以直接约束 `actors.length === 2`，validator 也必须按 `BATTLE-001` 拒绝其他 cardinality。这里使用 collection 而不是 TypeScript tuple，是为了不把“2”扩散到 Runtime/Presentation 的数据结构。

`tickDurationMs=200` 和默认 `maxPathSteps=6` 已冻结。

以下属于可调平衡参数，不属于 Contract 版本变化：

- `moveTicks`；
- `protectionTicks`；
- Skill damage/range/windup/recovery；
- map size。

## 6. PlanConstraints

`PlanConstraints` 告诉 Decision“允许生成什么”，不是给它列战术菜单。

概念：

```ts
type PlanConstraints = {
  maxPathSteps: integer
  movement: {
    cardinalOnly: true
  }
  turn: {
    allowed: true
  }
  skills: Array<{
    skillId: string
    minCoefficients: number[]
  }>
}
```

`minCoefficients` 来自 Skill range matrix 实际存在的去重正 coefficient。

Runtime 内部可以同时暴露/缓存规范化后的整数 units。

## 7. PlanSubmission

逻辑结构由 `PLAN-003` 冻结：

```ts
type PlanSubmission = {
  turn?: Direction
  path: GridPosition[]
  skill?: {
    skillId: string
    targetActorId: string
    minCoefficient: number
  }
}
```

Contract 语义：

- `turn` 表示原地转向；
- 出现 `turn` 时 path 必须为空；
- path 不含当前 Actor tile；
- path 只允许 cardinal step；
- empty path + no turn + no skill = hold/reobserve；
- empty path + no turn + skill = direct cast；
- empty path + turn + no skill = pure turn；
- empty path + turn + skill = turn-first plan；turn 消耗本 Tick Action，skill intent 留到后续 Tick；
- 不包含自由执行字段。

### PlanRejectReason

至少应保留以下机器可读语义：

```text
path_too_long
path_out_of_bounds
path_not_adjacent
terrain_blocked
invalid_turn
turn_with_path
unknown_skill
invalid_target
invalid_min_coefficient
stale_decision_generation
actor_not_ready
```

正式 enum 命名可以在实现类型时最终冻结，但不得合并掉这些不同失败原因。

## 8. PlanAcceptance

概念：

```ts
type PlanAcceptance =
  | {
      accepted: true
      acceptedPlanId: string
    }
  | {
      accepted: false
      reason: PlanRejectReason
      correctionAllowed: boolean
    }
```

同步 acceptance 只表示当前可以进入执行，不保证未来 path/skill 一定成功。

## 9. BattleObservation

Decision 看到的是 Simulation 事实，不是 Render State。

概念：

```ts
type BattleObservation = {
  tick: integer
  selfActorId: ActorId
  actors: readonly ObservedActor[]
  map: ObservationMap
  recentEvents: ObservedEvent[]
  guidance?: Guidance
}
```

v0 中 `actors` 恰好包含两个 Actor，`selfActorId` 指向其中一个；唯一另一个 Actor 就是当前 v0 的 opponent。Decision Adapter 可以为 prompt 派生 `self/opponent` 便利视图，但 canonical Contract 不把“opponent 是单个字段”编码进底层结构。

未来 N Actor 版本可以继续使用同一个 container shape，再单独定义 team/hostility/visibility 规则；这不会反向改变 v0 的 1v1 gameplay。

Observed Actor 至少应包含有战术意义的公开事实：

- HP / max HP；
- committed tile；
- direction；
- action state；
- protection 边界/剩余；
- 当前 moving/windup/recovery 事实；
- 可用 Skill 定义/range matrix。

不得把插值后的 Sprite 坐标作为权威 position。

Prompt 面向的具体序列化与 RecentEvents budget 属于实现细节。

## 10. BattleSnapshot

BattleSnapshot 是权威状态快照，概念：

```ts
type BattleSnapshot = {
  battleId: string
  battleEpoch: integer
  sceneEpoch: integer
  stateVersion: integer

  currentTick: integer
  tickDurationMs: 200
  status: BattleStatus

  actors: Record<ActorId, ActorSnapshot>
  reservations: ReservationSnapshot[]
  result?: BattleResult
}
```

ActorSnapshot 的 canonical 字段必须叫 `direction`，不得再并行使用 `facing`。

BattleSnapshot 与 RenderProjection 是两类不同数据。

## 11. ActorRuntimeState

概念内部结构：

```ts
type ActorRuntimeState = {
  actorId: string
  team: Team
  hp: integer
  tile: GridPosition
  direction: Direction

  actionState: ActionState
  decisionState: DecisionState

  acceptedPlanId?: string
  activeStep?: ActiveStep

  protectedUntilTickExclusive: integer

  actionGeneration: integer
  decisionGeneration: integer
}
```

两条状态轴必须分开：

```ts
type ActionState =
  | { type: "idle" }
  | { type: "moving"; /* active step ref */ }
  | { type: "windup"; /* action ref */ }
  | { type: "recovery"; /* action ref */ }
  | { type: "dead" }
  | { type: "terminated" }

type DecisionState =
  | { type: "none" }
  | { type: "thinking"; requestId: string; generation: integer }
  | { type: "ready"; requestId: string; generation: integer }
```

exact payload 仍可在实现时正式化，但 `thinking` 不得进入 ActionState。这样才能表达 `moving + thinking`、`recovery + thinking` 等 `STATE-005` 已冻结组合。

`turn` 是同 Tick 即时 Action，不需要持久化 `turning` ActionState 或 `turn_complete` 事件；accepted plan 内部只需能记录 pending/completed turn intent。

## 12. BattleEvent

概念 envelope：

```ts
type BattleEvent = {
  eventId: string
  dueTick: integer
  type: BattleEventType
  actorId?: string
  actionGeneration?: integer
  decisionGeneration?: integer
  payload?: unknown
}
```

核心事件概念：

```text
decision_ready
move_complete
skill_resolve
recovery_complete
```

原地 `turn` 即时完成，不需要 `turn_complete` 事件。

Protection 过期由 `protectedUntilTickExclusive` 推导，不需要 `protection_expire` 业务事件。

## 13. SkillResolveResult

共享 outcome：

```ts
type SkillResolveResult =
  | "hit"
  | "immune"
  | "miss"
  | "invalid"
```

语义只由 `HIT-001` 定义。

相关 Event/Replay 应携带实际 resolve coefficient（Runtime 内优先使用 normalized units）。

## 14. Presentation 数据边界

### 14.1 BattleSceneInit

Presentation 初始化必须能够只依赖纯数据描述，而不要求知道 Simulation 或 Decision 的 concrete implementation。

概念：

```ts
type BattleSceneInit = {
  battleId: string
  sceneEpoch: integer
  tickDurationMs: 200
  map: MapRef
  actors: readonly Array<{
    actorId: ActorId
    team: Team
    character: ResourceRef
  }>
  effectIds: readonly string[]
}
```

这里描述的是**本 Battle Scene 的稳定视觉资源/identity**，不重复携带会随 Runtime 改变的 tile、direction、HP 或 movement。Actor identity 只由 `actorId` 决定，collection 顺序不承载 team/side 语义。v0 Simulation 只会产生两个 Actor，但 Presentation 的 collection/reconciliation 不应硬编码固定两个 slot。

Presentation 可以据此加载 Map/Character/BattleEffect 等静态视觉资源；第一次权威动态视觉状态统一由随后的一次 `RenderProjection` 提供。`effectIds` 必须是本 Battle 可能由 Skill 引用的 BattleEffect id 的去重、按字典序稳定排列集合；Presentation 在 initialize 阶段解析 `struct.BattleEffect` 与其 Graphics。

Runtime 必须在 Battle clock 启动前先完成 `initialize(scene)`，再发布 initial Projection（通常为 tick 0），从而避免 SceneInit 与 RenderProjection 同时维护两份 tile/direction/HP 初值。

### 14.2 RenderProjection — FROZEN

RenderProjection 是非权威视觉数据。下面 shape 是 v0 exact cross-layer ABI：

```ts
type RenderProjection = {
  sceneEpoch: integer
  tick: integer
  actors: readonly ActorRenderProjection[]
  effectStarts: readonly SkillEffectProjection[]
}

type ActorRenderProjection = {
  actorId: ActorId
  tile: GridPosition
  direction: Direction
  hp: integer
  maxHp: integer
  life: "alive" | "dead"
  movement: MovementProjection | null
}

type MovementProjection = {
  motionId: integer
  from: GridPosition
  to: GridPosition
  startTick: integer
  completeTick: integer
}
```

Presentation 可以自行插值和控制 camera，但不得 reverse-sync 回 Simulation。

Movement identity 是 actor-local：不同 Actor 可以同时拥有不同 `motionId`。不再维护独立 `movements[]` 表让 Presentation 二次 join Actor；每个 Actor 的当前 movement 直接附着在对应 Actor projection 上。

`visualEpoch` 不属于跨层 Contract。Presentation 每次把 Simulation Projection、viewport resize 或 camera/layout 变化归约成 Browser visual commit 时，自行推进 Presentation-local `visualEpoch`。

`effectStarts` 只表示**本次 Simulation Projection 新产生的一次性 effect start facts**，不是“当前仍在播放的所有 effect”。Presentation 以 `effectId` 去重并自行维护 fade/hold/cleanup；后续 Projection 不需要重复携带仍在播放的 effect。

v0 不从 Simulation 向 Presentation 发送 camera `focusHint`。Camera framing 只消费 Presentation 已经拥有的 Actor collection / Map / viewport 事实，由 Presentation 自己决定。

Simulation 可以通过 PresentationPort 发布已经由 reducer 决定的 Projection/表现事实；这不赋予 Presentation Rule authority，也不得把动画完成当作 Simulation commit 条件。

### CONTRACT-PRES-003 — Projection / Presentation serialization — FROZEN

v0 固定：

- Actor 以 `actorId` collection 表示，顺序不承载 identity；
- Actor movement 是 actor-local projection，不存在独立 `movements[]` join；
- `BattleSceneInit` 只携带稳定 Scene/Actor/effect identity/resource facts；初始及后续动态状态都走 `RenderProjection`；
- Simulation Projection 携带 `sceneEpoch + tick`；`visualEpoch` 是 Presentation-local，不跨层；
- `effectStarts[]` 是 one-shot effect start facts，不是 active-effect snapshot；
- v0 不输出 camera `focusHint`；
- Presentation lifecycle verbs 固定为 `initialize / render / pause / resume / close`；
- 所有字段均为 required；需要“无值”的字段使用显式 `null`，不得通过字段缺失表达状态。

`ARCH-005` 的边界同时冻结：Presentation module 可独立实现/测试；Simulation 只依赖共享 Port，不依赖 Browser concrete implementation；业务 Subsystem 不承担逐 Tick Projection 转发职责。

## 15. SkillEffectProjection — FROZEN

```ts
type SkillEffectProjection = {
  effectId: string
  result: "hit" | "immune" | "miss" | "invalid"
  effect: string
  tile: GridPosition | null
  startTick: integer
}
```

约束：

- `effectId` 在一个 Battle session 内唯一；
- `effect` 必须存在于 `BattleSceneInit.effectIds`；
- `startTick` 是产生该 outcome 的 Simulation tick；
- 有逻辑 anchor 时 `tile` 为对应格；不存在合法逻辑 anchor 时显式为 `null`；
- Presentation 不从该结构反推 damage、interrupt、death 或其他 gameplay transition；
- hit/immune/miss/invalid 的 v0 可见性 policy 在 Presentation FROZEN spec 中固定。

## 16. DecisionPort / DecisionTiming## 16. DecisionPort / DecisionTiming

DecisionPort 的职责是“一次调用完成一次 attempt”，不拥有 Battle deadline / retry policy。

概念：

```ts
type DecisionRequest = {
  requestId: string
  actorId: ActorId
  generation: integer
  observation: BattleObservation
  constraints: PlanConstraints
  correction?: {
    rejectedPlan: PlanSubmission
    reason: PlanRejectReason
  }
}

type DecisionCompletion =
  | {
      type: "completed"
      requestId: string
      generation: integer
      completedAtMonotonicMs: number
      plan: PlanSubmission
    }
  | {
      type: "failed"
      requestId: string
      generation: integer
      completedAtMonotonicMs: number
      error: DecisionFailure
    }

interface DecisionPort {
  decide(
    request: DecisionRequest,
    signal: AbortSignal,
  ): Promise<DecisionCompletion>
}
```

`generation` / `requestId` 是 Simulation 生成的 correlation identity；Decision implementation 只能原样返回，不拥有其生命周期。

`completedAtMonotonicMs` 是 Adapter 必须提供的受信完成时间事实。Simulation 自己维护 Runtime timing record，例如：

```ts
type DecisionTiming = {
  requestId: string
  generation: integer
  startedAtBattleTimeMs: number
  deadlineBattleTimeMs: number
  completedAtMonotonicMs?: number
  dueTick?: integer
  status: DecisionStatus
}
```

其中 `deadlineBattleTimeMs / dueTick / stale / correction retry` 都由 Simulation 根据 Battle clock、pause history 与 Core Rule 计算。Decision implementation 不返回 `dueTick`，也不自行发起 `PLAN-006` correction retry。

Provider/network timeout 属于 Decision implementation 的 infrastructure policy，可以产生 `DecisionFailure`；它不是 Battle gameplay deadline。exact failure enum / provider wiring 在 Integration 文档维护。

## 17. ReplayRecord

Replay 必须足以在**不重新调用 Decision/LLM**的情况下复现：

```text
initial config/content refs
battleSeed
accepted PlanSubmissions + acceptedPlanIds
Decision timing/generation facts
movement reservation/contention
skill outcomes + coefficient
damage/protection
BattleResult
```

具体持久化格式可以在实现时选择。

## 18. Contracts OPEN

- **CONTRACT-OPEN-001**：BattleActor/BattleSkill 等非 Presentation Content 的统一 subject/version、全局 key/id 与引用编码；Presentation v0 所需 `struct.BattleEffect` subject/key 已冻结。
- Decision failure enum / provider-specific metadata exact shape；Decision attempt/timing ownership 已确定。
- Runtime 的其余 exact discriminated-union payload / enum names。
- Observation history budget 与 prompt-facing representation。

这些 OPEN 不得改变 SPEC 中已冻结的 gameplay 语义。
