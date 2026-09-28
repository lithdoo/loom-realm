# Battle v0 数据契约

> 状态：**Design only / Contract 草案**。本文定义 Battle v0 的 canonical 数据边界，不代表 TypeScript/Zod/JSON Schema 已实现。
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

### 4.3 BattleEffect

BattleEffect 只属于 Presentation Content。

当前概念结构：

```json
{
  "id": "firebolt",
  "image": {
    "namespace": "resource.Graphics",
    "key": "BattleEffects/Firebolt"
  },
  "anchor": "tile-center",
  "timing": {
    "fade_in_ticks": 1,
    "hold_ticks": 2,
    "fade_out_ticks": 1
  }
}
```

BattleEffect 的视觉 timing 不得改变 Skill windup/recovery/damage timing。

### CONTRACT-OPEN-002 — BattleEffect v1 Schema — OPEN

尚未冻结 exact image/timing/anchor 字段，以及 outcome-specific visuals。

## 5. BattleConfig

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

  acceptedPlanId?: string
  activeStep?: ActiveStep

  protectedUntilTickExclusive: integer

  actionGeneration: integer
  decisionGeneration: integer
}
```

ActionState 至少要能区分：

```text
thinking/idle
moving
windup
recovery
dead
terminated
```

`turn` 是同 Tick 即时 Action，不需要持久化 `turning` ActionState 或 `turn_complete` 事件；accepted plan 内部只需能记录 pending/completed turn intent。

最终 discriminated union 可在实现时正式化。

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
    tile: GridPosition
    direction: Direction
    hp: integer
    maxHp: integer
  }>
}
```

这里描述的是“地图与 Actor 初始应该如何显示”。Actor identity 只由 `actorId` 决定，collection 顺序不承载 team/side 语义。v0 Simulation 只会产生两个 Actor，但 Presentation 的 collection/reconciliation 不应硬编码固定两个 slot。

Presentation 可以自行加载资源、创建 Sprite/Canvas node，并维护非权威视觉状态。

### 14.2 RenderProjection

RenderProjection 是非权威视觉数据。

概念：

```ts
type RenderProjection = {
  sceneEpoch: integer
  visualEpoch: integer
  tick: integer
  actors: readonly ActorRenderProjection[]
  effects: readonly SkillEffectProjection[]
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

Movement identity 是 actor-local：不同 Actor 可以在同一 `visualEpoch` 拥有不同 `motionId`。不再维护独立 `movements[]` 表让 Presentation 二次 join Actor；每个 Actor 的当前 movement 直接附着在对应 Actor projection 上。

v0 不从 Simulation 向 Presentation 发送 camera `focusHint`。Camera framing 只消费 Presentation 已经拥有的 Actor collection / Map / viewport 事实，由 Presentation 自己决定。

Simulation 可以通过 PresentationPort 发布已经由 reducer 决定的 Projection/表现事实；这不赋予 Presentation Rule authority，也不得把动画完成当作 Simulation commit 条件。

### CONTRACT-OPEN-003 — Projection / Presentation exact serialization — OPEN

已经确定的 v0 结构不变量：

- Actor 以 `actorId` collection 表示，顺序不承载 identity；
- Actor movement 是 actor-local projection，不存在独立 `movements[]` join；
- Scene/Projection 携带 `sceneEpoch / visualEpoch` 所需 fencing；
- v0 不输出 camera `focusHint`；
- Presentation lifecycle verbs 统一为 `initialize / render / pause / resume / close`。

仍未冻结的是 exact serialization 字段 optionality/命名、Browser RenderNode data ABI 与 effect lifecycle 细节。

无论最终 API shape 如何，`ARCH-005` 的边界已经冻结：Presentation module 可独立实现/测试；Simulation 只依赖共享 Port，不依赖 Browser concrete implementation；业务 Subsystem 不承担逐 Tick Projection 转发职责。

## 15. SkillEffectProjection

概念：

```ts
type SkillEffectProjection = {
  effectId: string
  sceneEpoch: integer
  result: "hit" | "immune" | "miss" | "invalid"
  effect: string
  tile?: GridPosition
  startTick: integer
}
```

`miss / invalid` 是否产生可见效果属于 Presentation policy。

## 16. DecisionTiming

Decision Adapter 最终需要提供足够的受信时间事实：

```ts
type DecisionTiming = {
  requestId: string
  generation: integer
  startedAtMonotonicMs: number
  completedAtMonotonicMs?: number
  deadlineMonotonicMs: number
  dueTick?: integer
  status: DecisionStatus
}
```

exact Adapter API、error/cancel metadata 在 Integration 文档维护。

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

- **CONTRACT-OPEN-001**：Content subject/version、字段命名、key/id 对齐、引用编码。
- **CONTRACT-OPEN-002**：BattleEffect v1 Schema。
- **CONTRACT-OPEN-003**：BattleSceneInit / RenderProjection / SkillEffectProjection exact serialization、Browser RenderNode data ABI 与 effect lifecycle 细节；actor collection、actor-local movement、无 camera hint、Presentation lifecycle verbs 已确定。
- Runtime 的 exact discriminated unions / enum names。
- Observation history budget 与 prompt-facing representation。

这些 OPEN 不得改变 SPEC 中已冻结的 gameplay 语义。
