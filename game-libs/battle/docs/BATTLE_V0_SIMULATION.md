# Battle v0 Simulation Implementation Spec

> 状态：**FROZEN FOR IMPLEMENTATION**。本文只定义 Battle v0 Simulation 的实施结构、状态交接、调度、异步边界、Replay 与 Runtime lifecycle；gameplay 语义仍以 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) 的 Rule IDs 为唯一权威，cross-layer 数据以 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) 为准，Presentation ABI/行为不得在本文重新设计。
>
> 目标：implementation agent 应能直接实现 headless/self-driven Simulation，而不需要自行选择 Clock、queue、Decision lifecycle、Plan handoff、Tick transaction、Projection cadence、terminal race 或 Replay 架构。

## 1. Implementation boundary

Simulation 是完整、自驱动、one-shot 的 Battle Runtime：

```text
Decision = Plan
Simulation = Execute
Presentation = Present
Application = Compose
```

Simulation Core 只依赖：

```text
BattleClock
AbortSignal
DecisionPort
PresentationPort
ResolvedBattleDefinition
```

不得依赖整个 `SubsystemScope`、`Frame`、RenderDomain、Viewport、DOM 或 concrete Decision/Presentation implementation。

Runtime 的最小心智模型固定为：

```text
DecisionPort
    │ async completion
    ▼
DecisionInbox
    │ snapshot
    ▼
processTick()  ←  ScheduledEventQueue
    │
    ├─ authoritative BattleState
    ├─ future BattleEvents
    ├─ Decision request commands
    ├─ Replay facts
    └─ RenderProjection
              │
              ▼
       PresentationPort
```

只有以下位置可以改变 authoritative gameplay state：

1. session initialization；
2. 同步、不可重入的 `processTick()`；
3. cancel/fatal terminal control path。

Promise callback、scheduler wake callback、Presentation async failure callback、AbortSignal callback 都不得直接执行 gameplay rule mutation。

## 2. Module shape

v0 推荐且足够的实现结构：

```text
src/
├── contracts.ts
├── simulation.ts
├── simulation/
│   ├── runtime.ts
│   ├── state.ts
│   ├── tick.ts
│   ├── plan.ts
│   ├── combat.ts
│   ├── queues.ts
│   └── replay.ts
├── presentation.ts
└── presentation-semantics.ts
```

职责：

- `runtime.ts`：Clock/scheduler、one-shot lifecycle、Ports、terminal arbiter；
- `state.ts`：Runtime/Actor/Action exact internal state；
- `tick.ts`：TICK-001 的单 Tick transaction orchestration；
- `plan.ts`：Plan validation、AcceptedPlan cursor、Decision lifecycle、advancePlan；
- `combat.ts`：movement contention、range、skill resolve、damage/protection；
- `queues.ts`：ScheduledEventQueue + DecisionInbox；
- `replay.ts`：ReplayRecorder + ReplayDriver/validation。

不要预先建立通用 Task framework、Command Bus、Event Store、Aggregate 或多层 scheduler abstraction。

## 3. Resolved Simulation input

Serialized Content 的 subject/version 仍可由 Contracts/Integration 单独演进；Simulation 不因此等待 ContentClient schema。Composition/loader 必须先把资源解析成纯数据 `ResolvedBattleDefinition`。

概念 exact Simulation-facing shape：

```ts
type ResolvedBattleDefinition = {
  battleId: string
  sceneEpoch: number
  battleSeed: string | number

  tickDurationMs: 200
  moveTicks: number
  protectionTicks: number
  maxPathSteps: number

  map: {
    ref: MapRef
    width: number
    height: number
    // rows[y][x]；true = movement passable
    passable: readonly (readonly boolean[])[]
  }

  actors: readonly ResolvedBattleActor[]
}

type ResolvedBattleActor = {
  actorId: ActorId
  team: Team
  tile: GridPosition
  direction: Direction
  maxHp: number

  // SceneInit 所需稳定视觉 facts；不参与 gameplay 判定。
  character: ResourceRef

  skills: readonly ResolvedBattleSkill[]
}

type ResolvedBattleSkill = {
  skillId: string
  baseDamage: number
  windupTicks: number
  recoveryTicks: number
  range: ResolvedRangeMatrix
  effectId: string
}
```

约束：

- validator 必须先验证 v0 恰好 1 ally + 1 enemy、唯一 actorId、tile/direction/map bounds/passability、skill/range/timing 等；
- `passable` 是纯数据，不把 RPGMap Runtime 注入 Simulation；
- Runtime 内 coefficient 使用 normalized integer units；
- Simulation 负责从 resolved facts 构造 `BattleSceneInit` 与后续 `RenderProjection`。

## 4. Runtime public surface and lifecycle

Public surface 固定：

```ts
interface BattleRuntime {
  run(): Promise<BattleResult>
  pause(): void
  resume(): void
  cancel(): void
  close(): void
  getSnapshot(): BattleSnapshot
  getReplay(): ReplayRecord
}
```

Runtime lifecycle：

```text
CREATED
  │ run()
  ▼
INITIALIZING
  │ initialize + initial render + initial Decision requests
  ▼
RUNNING ⇄ PAUSED
  │ normal terminal
  ▼
SETTLED
  │ close()
  ▼
CLOSED
```

Fatal/cancel/active close 可从 INITIALIZING/RUNNING/PAUSED 终止 active authority。

Method semantics：

| lifecycle | run | pause | resume | cancel | close |
| --- | --- | --- | --- | --- | --- |
| CREATED | start | programmer error | programmer error | commit cancelled + close | close |
| INITIALIZING | programmer error | no-op | no-op | cancel | cancel + close |
| RUNNING | programmer error | enter PAUSED | no-op | cancel | cancel + close |
| PAUSED | programmer error | no-op | enter RUNNING | cancel | cancel + close |
| SETTLED | programmer error | no-op | no-op | no-op | CLOSED |
| CLOSED | programmer error | no-op | no-op | no-op | no-op |

补充：

- `run()` one-shot；重复 run 属 programmer error；
- `close()` 幂等；
- active `close()` 等价于 cancel authority + cleanup；
- normal terminal 后保留 SETTLED final visual，直到 `close()`；
- `getSnapshot()/getReplay()` 在 CREATED 后均可调用；CLOSED 后仍返回最终 detached data；
- Runtime build/constructor 在进入 CREATED 前完成 resolved definition validation并构造 detached-able tick-0 initial state；因此 CREATED 时 snapshot/replay 可反映尚未 run 的初始 session facts。validation 失败时 Runtime 不应被创建。

## 5. Initialization order

`run()` 必须按以下唯一顺序启动：

```text
CREATED
→ INITIALIZING
→ arm presentation.failure observer
→ use prevalidated authoritative state at tick 0
→ presentation.initialize(scene)
→ presentation.render(initial projection tick 0)
→ create initial Decision generation/request for each alive actor
   requestTick = 0
→ RUNNING
→ start Battle clock/scheduler
```

规则：

- Battle clock 在 Presentation initialize + initial Projection 成功前不得启动；
- initial Decision Request 的 `requestTick = 0`；
- initial Decision 调用可以在 clock 启动前被 shell 发出，但 completion 仍只能 enqueue；最早由第一个真实 reducer Tick消费；
- initialize/render 的 classified fatal 走 `BattleResult.failure`；
- async Presentation failure observer 必须在 initialize 前挂上，避免观察窗口；
- tick 0 只发布 initial Projection，不执行 TICK-001 gameplay reducer。

## 6. BattleClock and scheduler

BattleClock 最小接口固定：

```ts
interface BattleClock {
  nowMs(): number
  schedule(delayMs: number, callback: () => void): () => void
}
```

`schedule` 返回 cancel function。Production 使用 monotonic time source；不得以 wall-clock calendar time作为 gameplay authority。测试使用 `FakeBattleClock`。

Runtime scheduler 自己拥有：

```text
currentTick
accumulatedRunningMs
runningAnchorMs
wakeCancel?
```

逻辑时间：

```text
logicalElapsedMs =
  accumulatedRunningMs
  + (RUNNING ? clock.nowMs() - runningAnchorMs : 0)

targetTick = floor(logicalElapsedMs / 200)
```

wake callback：

```ts
while (lifecycle === "RUNNING" && currentTick < targetTick) {
  processOneTick(currentTick + 1)
}
```

要求：

- late wake 必须逐 Tick catch-up；
- 不得把多个 dueTick压成一个批次；
- scheduler callback 不得重入正在执行的 `processOneTick`；
- JS callback/PROMISE 只会在同步 Tick stack 结束后执行；实现仍应有明确 `processingTick` invariant 防止手工重入；
- close/cancel/fatal 必须取消 pending wake。

Pause：

```text
RUNNING
→ accumulatedRunningMs += now - runningAnchorMs
→ cancel wake
→ PAUSED
→ presentation.pause()
```

Resume：

```text
PAUSED
→ runningAnchorMs = now
→ RUNNING
→ presentation.resume()
→ schedule next wake
```

pause期间 wall time 不进入 logicalElapsed，不产生 pause catch-up。

## 7. Authoritative Runtime state

```ts
type BattleState = {
  battleId: string
  sceneEpoch: number
  currentTick: number
  status: BattleStatus

  actors: Map<ActorId, ActorRuntimeState>
  reservations: Map<TileKey, Reservation>

  result: BattleResult | null

  nextPlanId: number
  nextRequestId: number
  nextEventId: number
  nextEffectId: number
}

type ActorRuntimeState = {
  actorId: ActorId
  team: Team
  hp: number
  maxHp: number
  tile: GridPosition
  direction: Direction

  action: ActionState
  decision: DecisionState

  activePlan: AcceptedPlan | null
  pendingPlan: AcceptedPlan | null

  protectedUntilTickExclusive: number

  actionGeneration: number
  decisionGeneration: number
  nextMotionId: number
}
```

原则：

- 不维护与 `ActionState.moving` 重复的 `activeStep`；
- 不维护 Actor `DecisionState.ready`；未消费 completion 只在 Inbox；
- 不建立 global plansById lookup；Plan identity 直接保存在 `AcceptedPlan.planId`；
- v0 不需要 Actor `terminated` action branch；Battle terminal 由 Runtime lifecycle/result表达，Actor死亡用 `dead`；
- numeric public `battleEpoch` 不是 v0 implementation requirement；late work 由 lifecycle + AbortSignal + action/decision generation fencing。

## 8. ActionState

```ts
type ActionState =
  | { type: "idle" }
  | {
      type: "moving"
      generation: number
      motionId: number
      from: GridPosition
      to: GridPosition
      startTick: number
      completeTick: number
    }
  | {
      type: "windup"
      generation: number
      skillId: string
      targetActorId: ActorId
      startTick: number
      resolveTick: number
    }
  | {
      type: "recovery"
      generation: number
      skillId: string
      completeTick: number
    }
  | { type: "dead" }
```

`turn` 同 Tick即时完成，不持久化 `turning`。

统一 `actionGeneration` fencing move/windup/recovery；不得再引入 movementGeneration/skillGeneration/recoveryGeneration。

## 9. DecisionState and request lifecycle

```ts
type DecisionState =
  | { type: "none" }
  | {
      type: "thinking"
      generation: number
      requestId: string
      attempt: 0 | 1
      requestTick: number
    }
```

`requestId` 是异步 attempt correlation；`decisionGeneration` 是 authority generation，两者不得合并。

创建新 generation 的原因统一为：

```text
initial
plan_exhausted
plan_failed
damaging_hit
hold_reobserve
decision_attempt_failed
```

`ensureDecision(actor, reason, earliestTick)` 是唯一入口，必须满足：

1. Actor alive；
2. 当前没有 pending accepted plan；
3. 当前没有有效 thinking request；
4. active Plan 不再拥有未 materialize future intent；
5. 当前 Tick 已到达该 redecision 的 earliest eligible Tick。

创建时：

```text
decisionGeneration++
requestId = nextRequestId++
decision = thinking(generation, requestId, attempt=0, requestTick=currentTick)
emit RequestDecisionCommand
```

同 generation 的 correction：

- generation不变；
- requestId必须新建；
- attempt = 1；
- correction request 可以在 phase 9当前 Tick发出；
- completion只入 Inbox，不能重入当前 Tick；
- attempt=1再次非法或 attempt failure 后，当前 generation结束，Actor保持无 active/pending Plan；最早下一 Tick才允许新 generation。

Decision completion被 reducer消费后，对应 `thinking` 被清除；callback本身不修改该字段。

## 10. Decision failure classification

Provider-specific code/metadata 可以继续由 Integration定义，但 Simulation 必须只看到两个 authority category：

```ts
type DecisionFailureCategory =
  | "attempt_failure"
  | "session_fatal"
```

- `attempt_failure`：结束当前 attempt/generation，不终止 Battle；最早下一逻辑 Tick重新 Decision；
- `session_fatal`：Runtime terminal candidate = `BattleResult.failure { source: "decision" }`。

Provider timeout默认属于 attempt_failure，除非 concrete adapter明确配置为 session fatal；该基础设施配置不得改变 gameplay Tick timing。

## 11. AcceptedPlan

Decision返回的 `PlanSubmission` 通过 validation后必须复制/规范化成 Simulation-owned plan；不得直接持有 provider mutable object。

```ts
type AcceptedPlan = {
  readonly planId: string
  readonly decisionGeneration: number

  readonly turn?: Direction
  readonly path: readonly GridPosition[]
  readonly skill?: {
    skillId: string
    targetActorId: ActorId
    minCoefficientUnits: number
  }

  turnConsumed: boolean
  pathCursor: number
  skillConsumed: boolean
}
```

`pathCursor` 指向下一个尚未 materialize 的 path target。

materialization rule：

- turn执行时 `turnConsumed = true`；
- movement reservation成功并真正 `move_start` 时消费该 path intent：`pathCursor++`；
- skill windup真正开始时 `skillConsumed = true`，剩余 path立即放弃；
- Action后续若被 damaging hit打断，整个 active Plan失效，不回滚 cursor；
- 未 materialize 的后续 path永远没有 scheduled event authority。

## 12. Bounded active/pending Plan pipeline

每 Actor最多：

```text
1 active accepted plan
+
1 pending accepted plan
+
1 active Decision request
```

规则：

- active Plan还有 future intent时，不预取下一 Decision；
- active Plan最后一个 intent已 materialize成当前 Action后，可以在该 Action仍 moving/windup/recovery 时预取下一 Decision；
- next completion被接受但 action lock未解除时，放唯一 `pendingPlan`；
- 不接受第三份 Plan，不建立无界 FIFO；
- damaging hit/death/cancel/session fatal 必须 fence 掉不再合法的 active/pending Plan；
- pending Plan promotion只在 TICK-001 phase 10发生。

promotion：

```text
if activePlan == null
and pendingPlan != null
and actor is eligible to progress a plan:
  activePlan = pendingPlan
  pendingPlan = null
```

promotion **不等于立即 Action start**；promoted Plan仍按最新 state重新检查 protection、target、range、occupancy/reservation/lifecycle。

## 13. Plan exhaustion, hold and redecision

所有 Plan出口必须有明确后续：

- pure turn完成且无剩余 skill → plan exhausted；
- move-only path耗尽 → plan exhausted；
- path耗尽仍未达到 minCoefficient → plan exhausted；
- skill intent被 materialize → 原 Plan future intent exhausted；
- contested / blocked / target invalid / plan meaningless → plan failed；
- damaging hit → plan invalidated；
- hold/reobserve（空 path、无 turn、无 skill）→ 本 Tick立即 exhausted，但不启动 Action。

统一规则：

- plan exhausted/failed 后不得同 Tick零时间循环新 generation；
- 若没有已预取 pending Plan，最早下一逻辑 Tick `ensureDecision`；
- hold的语义是“本 Tick不行动、下一 Tick重新观察”，不是永久 idle。

## 14. Scheduled events

Core event union必须 exact，不使用 `payload?: unknown`：

```ts
type BattleEvent =
  | {
      type: "move_complete"
      eventId: string
      dueTick: number
      actorId: ActorId
      actionGeneration: number
    }
  | {
      type: "skill_resolve"
      eventId: string
      dueTick: number
      actorId: ActorId
      actionGeneration: number
    }
  | {
      type: "recovery_complete"
      eventId: string
      dueTick: number
      actorId: ActorId
      actionGeneration: number
    }
```

Event只说明“如果当前 generation/action仍匹配，现在提交该阶段”；skill/target/from/to 等 authoritative payload从当前 `ActionState`读取，避免 Event 与 ActionState双 authority。

ScheduledEventQueue 实现足够为：

```ts
Map<number, BattleEvent[]>
```

最小操作：

```text
schedule(event)
takeDue(tick)
clear()
```

不需要通用 priority queue。旧 generation event无需物理删除，consume时 fence。

## 15. Decision Inbox

DecisionInbox 最小操作：

```text
enqueue(completion)
snapshotAndDrain()
clear()
```

Promise callback唯一允许：

```text
if session still accepts intake:
  inbox.enqueue(completion)
```

它不得校验、接受Plan、推进generation或启动Action。

每 Tick开始 snapshot后新到 completion只能下一 Tick消费。

同一 snapshot 内的 completion以稳定顺序处理：

```text
actorId ECMAScript ordinal
→ requestId ordinal
```

不得让 Promise insertion order成为 gameplay authority。

## 16. Tick transaction boundary

`processOneTick(tick)` 必须：

- synchronous；
- no `await`；
- no direct DecisionPort call；
- no Presentation callback into gameplay；
- no recursive Tick；
- no scheduler reentry。

Tick-local transient使用 `TickContext`，不得污染跨 Tick authority：

```ts
type TickContext = {
  tick: number
  startedActionActors: Set<ActorId>

  dueEvents: BattleEvent[]
  decisionCompletions: DecisionCompletion[]

  ordinarySkillResolves: SkillResolveIntent[]
  instantSkillIntents: SkillIntent[]
  movementIntents: MoveIntent[]

  decisionCommands: RequestDecisionCommand[]
  scheduledEvents: BattleEvent[]
  replayFacts: ReplayFact[]
  effectStarts: SkillEffectProjection[]
}
```

`startedActionActors` 实施 STATE-004；0 recovery不需要跨 Tick flag。

Runtime shell在 Tick同步结束后执行 command side effects：

```text
enqueue future events
invoke DecisionPort for RequestDecisionCommand
append Replay facts
render Projection
possibly commit terminal result
```

## 17. TICK-001 implementation mapping

14-stage ordering仍完全遵守 SPEC，不拆成14个架构服务：

1. snapshot due events + Decision Inbox；
2. fence scheduled stale lifecycle/generation；
3. commit valid move_complete + recovery_complete；
4. collect previously-started due skill_resolve；
5. resolve ordinary skill outcome with post-move committed facts；
6. batch apply ordinary hit damage；
7. damaging-hit aftermath/interruption；
8. ordinary terminal gate；
9. consume Decision snapshot / validation / correction / active-pending acceptance；
10. promote pending as eligible；advance active Plan；每 Actor最多一个新 Action intent；turn即时执行；
11. collect newly-started windup=0 skills；
12. resolve instant batch + aftermath + terminal；
13. surviving movement intents统一 reservation/contention；成功才 materialize move_start；
14. schedule future events + produce Snapshot/Projection/Replay facts。

补充：

- phase 3 `recovery_complete` 后，phase 10允许同 Tick promotion并启动下一 Action；recovery completion本身不是“新 Action”；
- `recoveryTicks = 0`：resolve后直接 `action = idle`，不 schedule currentTick recovery event；STATE-004仍由 `startedActionActors` 阻止同 Tick第二 Action；
- ordinary terminal gate后不启动新 gameplay Action；仍允许完成本 Tick必须产出的 final facts/Projection；
- phase 12 instant terminal同样阻止phase 13 movement start。

## 18. Plan advancement

`advancePlan(actor, state, ctx)` 只产生至多一个当前 Tick的 Action intent，不直接 schedule future events。

顺序：

```text
pending turn?
  → TurnIntent

else skill exists + not consumed + current coefficient >= min + actor may windup?
  → SkillIntent

else remaining path?
  → MoveIntent

else
  → plan exhausted
```

注意：

- protection阻止SkillIntent，但不阻止合法 move/turn；
- move-only plan不自动生成 skill；
- path future dynamic occupancy不在 Plan acceptance时保证；
- MovementIntent在phase 13争格成功后才变成 `ActionState.moving`；
- SkillIntent开始后剩余path放弃；
- plan failure记录reason并按 §13安排后续redecision。

## 19. Movement and reservation

Reservation authority：

```ts
type Reservation = {
  actorId: ActorId
  tile: GridPosition
  actionGeneration: number
}
```

`reservations` 是 tile-global authority index；moving action中的 `to` 是动作payload，不单独拥有tile reservation authority。

move_start成功：

```text
actionGeneration++
motionId = nextMotionId++
reserve destination
direction = movement direction
action = moving(...)
schedule move_complete(dueTick = currentTick + moveTicks)
```

多格path只materialize当前step。move_complete成功后commit destination、释放origin occupancy语义/目的reservation，随后phase10重新advance Plan。

damaging hit中断：释放destination reservation、保持origin committed tile、action generation失效、active/pending Plan按规则失效；旧move_complete后续只能stale drop。

## 20. Skill / recovery scheduling

Skill start：

```text
actionGeneration++
action = windup(...)
```

- `windupTicks > 0` → schedule `skill_resolve(currentTick + windupTicks)`；
- `windupTicks = 0` → 不schedule future resolve，进入phase 11/12 instant batch。

resolve后：

- `recoveryTicks > 0` → `action = recovery` + schedule `recovery_complete(currentTick + recoveryTicks)`；
- `recoveryTicks = 0` → `action = idle`；本Tick不允许第二Action。

resolve时range/coefficient重新读取当前 committed facts；不tracking。

## 21. Projection cadence and identities

Publication cadence固定：

```text
one initial Projection at tick 0
+
exactly one RenderProjection for every processed Tick
```

catch-up Tick 11/12/13/14 各产生一份 Projection，不做dirty coalescing。这样 effectStarts、motion start/stop和Replay Tick具有一一对应边界。

terminal Tick的该份 Projection就是 final Projection。

Identity：

- `motionId`：actor-local monotonic positive safe integer，每次成功 move_start消费一个；
- `effectId`：battle-local monotonic positive safe integer，每个 skill resolve outcome occurrence消费一个；即使 miss/invalid不产生可见 transient visual，也消费 occurrence identity以保持 deterministic facts；
- `sceneEpoch`：session-level cross-layer scene identity，来自 resolved definition；
- `visualEpoch`：Presentation-local，Simulation从不生成。

## 22. BattleResult and terminal arbitration

BattleResult exact public union见 Contracts。Runtime内部只有一个 one-shot terminal arbiter：

```text
finish(candidate)
→ if already committed: false
→ mark terminal committed
→ stop scheduler
→ abort Decision work
→ settle run() exactly once
```

Normal gameplay terminal commit cut：

```text
reducer determines terminal facts
→ produce final state/result candidate
→ presentation.render(final Projection)
→ render succeeds
→ finish(normal result)
```

因此 final render同步fatal发生在 normal result commit前时，最终结果为 `failure(source="presentation")`。

Async `presentation.failure`：

- terminal尚未commit → `finish(presentation failure)`；
- normal/cancel/failure已经commit → 不得改写BattleResult。

cancel、Presentation async fatal、Decision session fatal与normal terminal均竞争同一个 terminal arbiter；**第一个成功commit的 terminal candidate拥有最终结果**。由于单 Tick reducer同步不可重入，外部异步callback不能插入 reducer中间。

Programmer error/invariant violation不伪装成业务 `BattleResult.failure`，允许throw/reject。

## 23. Snapshot

`getSnapshot()` 返回 detached immutable value，不暴露Runtime mutable reference。

Public Snapshot只包含跨层/诊断有用facts：

```text
battleId
sceneEpoch
currentTick
tickDurationMs
status
actors
reservations
result?
```

不得暴露：

```text
DecisionInbox
ScheduledEventQueue
actionGeneration
decisionGeneration
Plan cursor
AbortController
scheduler handles
```

Snapshot在每个 processed Tick结束后与该 Tick Projection基于同一 committed state产生。

## 24. ReplayRecord

Replay exact v0 schema：

```ts
type ReplayRecord = {
  version: 1
  initial: {
    battleId: string
    definitionFingerprint: string
    battleSeed: string | number
  }

  decisions: readonly ReplayDecisionRecord[]
  ticks: readonly ReplayTickRecord[]

  result?: BattleResult
}

type ReplayDecisionRecord = {
  actorId: ActorId
  generation: number
  attempt: 0 | 1
  requestId: string
  requestTick: number
  consumedTick: number

  completion:
    | { type: "completed"; plan: PlanSubmission }
    | { type: "failed"; category: DecisionFailureCategory; code: string }

  acceptance:
    | { type: "accepted"; acceptedTick: number; planId: string }
    | { type: "rejected"; rejectedTick: number; reason: PlanRejectReason }
    | { type: "stale" }
}

type ReplayTickRecord = {
  tick: number
  movementContentions: readonly MovementContentionFact[]
  skillOutcomes: readonly SkillOutcomeFact[]
  damage: readonly DamageFact[]
  protection: readonly ProtectionFact[]
}
```

不记录真实 Decision completion timestamp。

`definitionFingerprint` 验证Replay使用相同resolved gameplay definition；fingerprint算法可作为内部deterministic canonical serialization实现，但必须版本化。

## 25. Replay execution

Replay不得实现第二套Battle规则。

ReplayDriver：

```text
same BattleState
same ScheduledEventQueue
same processTick()
same Plan validation/execution
same seeded contention
different Decision input source
```

按 `ReplayDecisionRecord.consumedTick` 在对应 Tick snapshot注入recorded completion，不调用真实 DecisionPort。

seeded contention在Replay中必须重新计算并与recorded fact比较；不直接把recorded winner当authority。若不一致，属于Replay invariant failure。

Replay成功标准：

- same final BattleResult；
- same final authoritative Snapshot；
- same gameplay Projection sequence/facts；
- recorded deterministic facts验证通过。

Presentation可替换为 Null/RecordingPresentation；Replay correctness不依赖Browser。

## 26. Runtime async races

以下 race semantics冻结：

### RACE-001 Tick vs Decision completion

```text
processTick synchronous stack
→ completion callback cannot interleave
→ callback enqueues after stack
→ next eligible Tick
```

### RACE-002 Pause vs Decision completion

先pause：completion可enqueue但不消费；先completion：只enqueue，pause后仍等resume的真实Tick。

### RACE-003 Cancel vs late Decision

cancel先commit terminal/abort/clear authority；late callback无提交权，即使provider忽略AbortSignal。

### RACE-004 Normal terminal vs Presentation failure

final Projection render前/中classified fatal → presentation failure；normal result只有final render成功后才commit。normal已commit后的late async failure不得改写。

### RACE-005 Cancel vs Presentation failure

统一terminal arbiter，第一个成功commit者为最终result；cleanup幂等。

### RACE-006 Decision abort vs provider late completion

AbortSignal是best effort；consume时仍必须requestId + decisionGeneration fence，session非active时不提交。

### RACE-007 Scheduler wake vs pause

若同步 `processTick` 已进入，则该Tick完整完成后pause生效；若pause callback先执行，则取消wake且不进入新Tick。control-plane不会中断reducer半途。

## 27. Shell / reducer command boundary

Reducer/plan helpers不得直接调用Ports。

允许的shell commands最小为：

```ts
type RuntimeCommand =
  | { type: "request_decision"; request: DecisionRequest }
```

future BattleEvent不是外部command，只由Tick output提交到ScheduledEventQueue。

Runtime处理 `request_decision`：

```text
decision.decide(request, signal)
→ Promise
→ completion callback
→ DecisionInbox.enqueue
```

Presentation render在完整Tick committed后由shell调用；同步throw立即进入terminal arbitration。

## 28. Testing architecture

Simulation qualification必须提供：

- `FakeBattleClock`：精确advance、不依赖真实timer；
- `ScriptDecision`：按request返回固定Plan/failure；
- `DeferredDecision`：测试snapshot前/后、pause/cancel/late completion；
- `RecordingPresentation`：记录initialize/render/pause/resume/close并可注入sync/async failure；
- seed fixtures：固定contention结果；
- NullPresentation：纯headless。

测试层：

1. reducer/state unit：不使用Clock/Promise；
2. scheduler：200ms、catch-up、pause/resume、wake race；
3. Decision races：Inbox snapshot、stale generation、correction、pending Plan；
4. lifecycle：initialization、terminal、cancel/close、Presentation failure；
5. Replay qualification：live→record→replay结果/snapshot/projection一致；
6. existing Presentation integration：Simulation只消费已冻结Port，不重测Browser内部语义。

## 29. Implementation invariants

实现必须持续满足：

1. gameplay state mutation不发生在Promise callback；
2. Tick reducer同步且不可重入；
3. 每Actor每Tick最多一个新Action；
4. 每Actor最多一个active Plan + 一个pending Plan + 一个thinking request；
5. 未materialize path step无future event；
6. scheduled event提交前必须actionGeneration fence；
7. Decision completion提交前必须requestId + decisionGeneration fence；
8. reservation只有一个tile-global authority；
9. Presentation不参与规则commit；
10. Replay不重新调用LLM；
11. cancel/fatal后late work无提交权；
12. terminal result最多commit一次。

## 30. FROZEN FOR IMPLEMENTATION gate

Simulation可以标为 FROZEN FOR IMPLEMENTATION，因为以下 blocking choice已有唯一答案：

- initialization与initial Decision request Tick；
- RuntimeState/ActionState/DecisionState/AcceptedPlan；
- active/pending Plan bounded pipeline与promotion；
- hold/plan end/redecision出口；
- BattleClock/scheduler/pause/catch-up；
- Decision Inbox与ScheduledEventQueue；
- exact core scheduled event union；
- TICK-001 transaction与shell/reducer boundary；
- recovery=0与same-Tick Action quota；
- Projection cadence与motion/effect identity；
- BattleResult terminal arbiter与Presentation race；
- Snapshot public boundary；
- ReplayRecord/ReplayDriver；
- cancel/pause/late async races；
- headless test doubles与qualification path。

仍可OPEN且不阻塞Simulation Core实现的内容：

- serialized BattleActor/BattleSkill external subject/version/key encoding；
- provider-specific Decision metadata/HTTP/network fields；
- Guidance Host/InputTarget wiring；
- Host具体background/suspend事件来源。

这些不得改变本文已冻结的 Simulation authority、state transition、Tick timing、Plan pipeline或public Runtime semantics。
