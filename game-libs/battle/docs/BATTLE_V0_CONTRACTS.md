# Battle v0 数据契约

> 状态：**Design only / Contract 草案**。本文定义 Battle v0 的 canonical 数据边界，不代表 TypeScript/Zod/JSON Schema 已实现。
>
> 核心 gameplay 语义只以 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) 为准；本文不重新定义 reducer 行为。

## 1. Contract 边界

建议提供很薄的共享模块：

```text
battle/contracts
  BattleConfig
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
  actors: InitialActorPlacement[2]
}
```

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
  self: ObservedActor
  opponent: ObservedActor
  map: ObservationMap
  recentEvents: ObservedEvent[]
  guidance?: Guidance
}
```

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

## 14. RenderProjection

RenderProjection 是非权威视觉数据。

概念：

```ts
type RenderProjection = {
  tick: integer
  actors: ActorRenderProjection[]
  movements: MovementProjection[]
  effects: SkillEffectProjection[]
  focusHint?: CameraFocusHint
}
```

Presentation 可以自行插值和控制 camera，但不得 reverse-sync 回 Simulation。

### CONTRACT-OPEN-003 — Projection Schema — OPEN

尚未冻结：

- exact RenderProjection shape；
- Browser node/effect lifecycle；
- Simulation 是否输出非权威 camera focus hint。

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
- **CONTRACT-OPEN-003**：RenderProjection / SkillEffectProjection exact Schema 与 camera hint。
- Runtime 的 exact discriminated unions / enum names。
- Observation history budget 与 prompt-facing representation。

这些 OPEN 不得改变 SPEC 中已冻结的 gameplay 语义。
