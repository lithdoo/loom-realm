# Battle v0 Simulation Implementation Spec

> 状态：**FROZEN + IMPLEMENTED + TESTED + CLOSED-LOOP QUALIFIED**。本文定义 Battle v0 Simulation 的实施结构、状态交接、调度、异步边界、Replay 与 Runtime lifecycle；gameplay 语义仍以 [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md) 的 Rule IDs 为唯一权威，cross-layer 数据以 [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md) 为准，Presentation ABI/行为不得在本文重新设计。
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

v0 canonical implementation module shape：

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

Canonical package export：

```ts
import {
  BattleSimulationBuilder,
  BattleReplayBuilder,
  type BattleRuntime,
  type BattleClock,
  type ResolvedBattleDefinition,
  type ReplayRecord,
} from "@loomrealm-game/battle/simulation"
```

Builder surface 冻结：

```ts
type BattleSimulationDependencies = {
  clock: BattleClock
  signal: AbortSignal
  decision: DecisionPort
  presentation: PresentationPort
}

class BattleSimulationBuilder {
  constructor(dependencies: BattleSimulationDependencies)
  build(definition: ResolvedBattleDefinition): BattleRuntime
}

type BattleReplayDependencies = {
  clock: BattleClock
  signal: AbortSignal
  presentation: PresentationPort
}

class BattleReplayBuilder {
  constructor(dependencies: BattleReplayDependencies)
  build(record: ReplayRecord): BattleRuntime
}
```

BattleSimulationBuilder / BattleReplayBuilder 都是 one-shot：同一 Builder 只能成功 `build()` 一次；重复 successful build 属 programmer error。validation失败不消耗 Builder。ReplayBuilder 不接受 DecisionPort，也不得在 replay run 中调用真实 Decision。构造/Build 阶段只做 dependency presence + resolved definition validation，不启动 clock、不调用 Decision/Presentation、不监听 gameplay Tick。

外部 `AbortSignal` 的 active authority 从 `run()` 开始：

- `run()` 进入初始化前先检查 `signal.aborted`；若已 aborted，直接提交 `cancelled`、调用幂等 `presentation.close()`、进入 CLOSED，不执行 initialize/Decision/clock；
- run active 后 signal abort 等价于 `cancel()`；
- SETTLED/CLOSED 后 signal abort 不改写结果；
- Runtime close 后移除 signal listener。

实现 Simulation 时 package `exports` MUST 新增 `"./simulation"` subpath；`src/simulation.ts` 是该 subpath entry。root `@loomrealm-game/battle` 可以继续导出共享 contracts，但不得要求业务通过 Presentation concrete module 才能构造 Simulation。Decision concrete adapters 未来可独立 subpath，不阻塞本实现。

## 3. Resolved Simulation input

Serialized Content 的 subject/version 仍可由 Contracts/Integration 单独演进；Simulation 不因此等待 ContentClient schema。Composition/loader 必须先把资源解析成纯数据 `ResolvedBattleDefinition`。

exact Simulation-facing shape：

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
  effect: string
}
```

约束：

- `battleId` 为非空 Unicode scalar string；`sceneEpoch` 为正 safe integer；
- `battleSeed` 为非空 string 或 safe integer；number/string identity 不混同；
- `tickDurationMs === 200`；
- `moveTicks >= 1`、`protectionTicks >= 0`、`maxPathSteps >= 0`，全部为 safe integer；
- map `width/height >= 1` 且为 safe integer；`passable.length === height`，每行长度严格等于 width，元素只能是 boolean；
- v0 actors 恰好两个、actorId唯一、team恰好1 ally + 1 enemy；
- 两个 Actor 初始 committed tile 不得相同，必须在 bounds 内且 `passable[y][x] === true`；
- Actor `maxHp >= 1` safe integer；direction必须为 2/4/6/8；character必须是合法 ResourceRef；
- 每 Actor skillId 唯一；`baseDamage >= 0` safe integer；`windupTicks/recoveryTicks >= 0` safe integer；range遵循 SKILL-001/DAMAGE-001；effect为非空 id；
- validator 成功后必须生成 detached immutable/deep-frozen Simulation-owned definition；Runtime/Replay不得持有调用方可变 actors/skills/range/passable 数组引用；
- Runtime 初始 HP = maxHp、reservations为空、action=idle、decision=none、Plan slots为空、generation/counters使用本文固定初值；
- `passable` 是纯数据，不把 RPGMap Runtime 注入 Simulation；
- Runtime 内 coefficient 使用 normalized integer units；
- Simulation 从 resolved facts 构造 `BattleSceneInit`：actors按 actorId稳定排序，`effectIds` 对所有 actor skills 的 effect 去重后按 ECMAScript ordinal string order排序；后续 `RenderProjection.actors` 同样使用稳定 actorId顺序。

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

Fatal/cancel/active close 可从 INITIALIZING/RUNNING/PAUSED 终止 active authority。normal gameplay result 进入 SETTLED 并保留 final visual；cancel 或 classified failure 在提交 result 后立即执行 Presentation cleanup 并进入 CLOSED。

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
- active `close()` 等价于 cancel authority + cleanup，并使 active run 以 `cancelled` settle；
- CREATED 上直接 `close()` 只进入 CLOSED，不制造未发生的 BattleResult；CREATED 上 `cancel()` 记录 `cancelled` 后进入 CLOSED；
- normal terminal 后保留 SETTLED final visual，直到 `close()`；
- cancel / Decision session fatal / Presentation fatal / classified Simulation fatal 提交结果后立即 cleanup Presentation并进入 CLOSED；
- `getSnapshot()/getReplay()` 在 CREATED 后均可调用；CLOSED 后仍返回最终 detached data；
- Runtime build/constructor 在进入 CREATED 前完成 resolved definition validation并构造 detached-able tick-0 initial state；因此 CREATED 时 snapshot/replay 可反映尚未 run 的初始 session facts。validation 失败时 Runtime 不应被创建。

## 5. Initialization order

`run()` 首先激活 external AbortSignal listener并检查 pre-aborted state。pre-aborted 直接走 cancelled terminal path；否则必须按以下唯一顺序启动：

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
- initialize/render/pause/resume 抛出的 `PRESENTATION_CONTENT_FAILED / PRESENTATION_COMMIT_FAILED` 由 Runtime捕获并归约为 Presentation failure；Presentation programmer/invariant codes 按 §24 直接 throw/reject；同一错误不得同时走两条通道；
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

wake callback 每轮重新读取 logical time，不能只在 callback入口缓存一次 target：

```ts
while (lifecycle === "RUNNING") {
  const targetTick = Math.floor(logicalElapsedMs() / 200)
  if (currentTick >= targetTick) break
  processOneTick(currentTick + 1)
}
scheduleNextWake()
```

下一 wake 按**下一个逻辑 Tick deadline**调度，而不是“callback结束后再固定等200ms”：

```ts
const elapsed = logicalElapsedMs()
const nextDeadline = (currentTick + 1) * 200
const delayMs = Math.max(0, nextDeadline - elapsed)
wakeCancel = clock.schedule(delayMs, wake)
```

进入 RUNNING/resume 后也使用同一个 `scheduleNextWake()`。

要求：

- late wake 必须逐 Tick catch-up；
- 不得把多个 dueTick压成一个批次；
- scheduler callback 不得重入正在执行的 `processOneTick`；
- JS callback/PROMISE 只会在同步 Tick stack 结束后执行；实现仍应有明确 `processingTick` invariant 防止手工重入；
- close/cancel/fatal 必须取消 pending wake；
- `BattleClock.nowMs()` 对单 session 必须 finite、non-negative、monotonic non-decreasing；回退/NaN/Infinity 属 Runtime invariant error；
- `currentTick`、logical elapsed换算结果、dueTick/protection arithmetic、damage intermediate arithmetic及所有 monotonic counters 必须保持 non-negative safe integer；
- counter本身下一次递增超界 → `BattleResult.failure { source: "simulation", code: "BATTLE_COUNTER_OVERFLOW" }`；
- 其他 checked gameplay arithmetic（例如 `currentTick + moveTicks`、`baseDamage * coefficientUnits`）超界 → `BattleResult.failure { source: "simulation", code: "BATTLE_NUMERIC_OVERFLOW" }`；
- 都必须在产生不精确值之前失败，不得 wrap/静默继续。

Pause：

~~~text
RUNNING
→ accumulatedRunningMs += now - runningAnchorMs
→ cancel wake
→ call presentation.pause() inside Runtime call boundary
→ if classified sync fatal: finish(presentation failure)
→ else status = PAUSED
~~~

Resume：

~~~text
PAUSED
→ if decision availability circuitOpen:
     consecutiveFailures = 0
     circuitOpen = false
→ call presentation.resume() inside Runtime call boundary
→ if classified sync fatal: finish(presentation failure)
→ else runningAnchorMs = now
→ status = RUNNING
→ schedule next wake
~~~

普通 external pause 不 abort Decision；Decision completion 可以在 pause期间进入 Inbox并等待后续 Tick消费。**Decision circuit trip 是唯一额外要求 abort all active Decision requests 的 pause source**，exact behavior 见 §10。

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
  nextEffectOccurrenceId: number
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

初始 authoritative values 固定：

```text
currentTick = 0
result = null
reservations = empty

per actor:
  hp = maxHp
  action = idle
  decision = none
  activePlan = null
  pendingPlan = null
  protectedUntilTickExclusive = 0
  actionGeneration = 0
  decisionGeneration = 0
  nextMotionId = 1

battle counters:
  nextPlanId = 1
  nextRequestId = 1
  nextEventId = 1
  nextEffectOccurrenceId = 1
```

Deterministic traversal invariant：

- 任何可能分配 session-global ID、产生 ordered public/replay output、或建立外部 Decision command 的 actor iteration，都必须先按 `compareActorId` / ECMAScript ordinal排序；
- initial Decision requests、phase 9 completion processing、phase 10 plan advancement、phase 13 movement winner application、phase 14 event emission均遵循该排序；
- 同一 dueTick、同一 event type 的 scheduled events按 actorId ordinal处理；event type 的 phase顺序由 TICK-001 本身决定，不依赖 queue insertion order；
- Map/Set insertion order从不作为 gameplay/replay identity source。

ID allocation固定使用 session-local monotonic counters，不使用随机 UUID：

```text
planId    = "plan:" + nextPlanId++
requestId = "request:" + nextRequestId++
eventId   = "event:" + nextEventId++
effectId  = "effect:" + nextEffectOccurrenceId++
```

counter 从 1 开始；不得以 Promise完成顺序或 wall-clock 时间生成 gameplay/replay identity。

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
      planningOrigin: GridPosition
    }
```

`requestId` 是异步 attempt correlation；`decisionGeneration` 是 authority generation，两者不得合并。

创建新 generation 的原因统一为：

```text
initial
prefetch_after_materialize
plan_exhausted
plan_failed
damaging_hit
hold_reobserve
decision_attempt_failed
```

reason 对 earliest eligible Tick 的映射固定：

- `initial`：tick 0；
- `prefetch_after_materialize`：当前 Plan 的最后一个 future intent 已成功 materialize，且 materialization 后仍存在正在执行的 `moving / windup / recovery` Action 时，当前 Tick即可创建 request command；纯 turn 同 Tick立即完成，不符合该 prefetch 条件；
- `damaging_hit`：受击 Tick 本身可标记 redecision；若随后 terminal gate 结束 Battle，则同 Tick request command 必须被抑制；
- `plan_exhausted / plan_failed / hold_reobserve / decision_attempt_failed`：没有 ongoing materialized Action 可用于预取时，最早下一逻辑 Tick；
- correction attempt 不创建新 generation，按同 Tick phase 9规则直接产生 attempt=1 request。

`ensureDecision(actor, reason, earliestTick)` 是唯一入口，必须满足：

1. Actor alive；
2. 当前没有 pending accepted plan；
3. 当前没有有效 thinking request；
4. active Plan 不再拥有未 materialize future intent；
5. 当前 Tick 已到达该 redecision 的 earliest eligible Tick。

创建时先捕获 request-scoped planning origin：

```text
if reason == prefetch_after_materialize && action.type == moving:
  planningOrigin = action.to
else:
  planningOrigin = actor.tile
```

然后：

```text
decisionGeneration++
requestId = nextRequestId++
decision = thinking(
  generation,
  requestId,
  attempt=0,
  requestTick=currentTick,
  planningOrigin,
)
emit RequestDecisionCommand(planningOrigin)
```

Plan path 的第一步 adjacency/static-terrain validation 从 `planningOrigin` 开始，而不是从 completion 消费时的 `actor.tile` 重新选择起点。

同 generation 的 correction：

- generation不变；
- requestId必须新建；
- attempt = 1；
- correction request 可以在 phase 9当前 Tick发出，并继承 attempt=0 的同一 `planningOrigin`；
- completion只入 Inbox，不能重入当前 Tick；
- attempt=1再次非法或 attempt failure 后，当前 generation结束，Actor保持无 active/pending Plan；最早下一 Tick才允许新 generation。

Decision completion被 reducer消费后，对应 `thinking` 被清除；callback本身不修改该字段。

## 10. Decision failure classification / live availability circuit

Simulation 仍只接受两个 Decision authority category：

~~~ts
type DecisionFailureCategory =
  | "attempt_failure"
  | "session_fatal"
~~~

- `session_fatal`：立即成为 Runtime terminal candidate = `BattleResult.failure { source: "decision" }`；不进入 circuit breaker；
- `attempt_failure`：结束当前 attempt/generation；是否计入 live Decision availability streak 取决于 concrete Decision code。

### 10.1 Counted consecutive LLM failures

Battle v0 live Runtime 固定：

~~~text
MAX_CONSECUTIVE_DECISION_FAILURES = 3
~~~

以下 DeepSeekDecision attempt failure code 计入连续失败：

~~~text
DECISION_PROVIDER_NETWORK
DECISION_PROVIDER_TIMEOUT
DECISION_PROVIDER_RATE_LIMITED
DECISION_PROVIDER_UNAVAILABLE
DECISION_PROVIDER_REFUSED
DECISION_PROVIDER_INCOMPLETE
DECISION_OUTPUT_INVALID
~~~

以下不计入：

- `DECISION_ABORTED`；
- stale/lifecycle-fenced completion；
- DecisionPort invariant reject/throw；
- Simulation `PlanRejectReason`；
- dynamic accepted-plan execution failure；
- `session_fatal`。

任意 authority-valid `DecisionCompletion.completed` 在进入 gameplay Plan validation前即表示 provider pipeline 成功，必须把 consecutive failure streak 重置为 0。即使该 Plan 随后被 Simulation reject 并产生 correction，也不计作 LLM failure。

同一个 Tick snapshot 内 completion 已按 actorId → requestId stable order处理；availability signal 使用相同顺序。因此“连续”的定义是：

~~~text
live authority-valid Decision completion consumption order
~~~

不得按 Promise wall-clock resolve order计数。

### 10.2 Operational guard，不属于 gameplay / Replay state

Live Runtime shell 维护：

~~~ts
type DecisionAvailabilityGuard = {
  consecutiveFailures: number
  circuitOpen: boolean
}
~~~

它是 operational control state：

- 不属于 `BattleState` gameplay facts；
- 不进入 `BattleSnapshot`；
- 不进入 `ReplayRecord`；
- 不参与 deterministic Replay；
- 不生成 gameplay Tick/dueTick；
- 不修改 Actor generation/HP/tile/action 规则。

phase 9 对 authority-valid Decision completion 产生 shell-only health signal：

~~~text
completed
→ success

counted attempt_failure
→ counted_failure

DECISION_ABORTED / stale
→ no signal

session_fatal
→ terminal candidate
~~~

ReplayDriver 即使重放 recorded DecisionCompletion，也**不得启用 live Decision availability circuit**；Replay 不因历史 provider availability 等待人工 resume。

### 10.3 Circuit trip → automatic Battle PAUSED

shell 按 stable health-signal 顺序更新 guard：

~~~text
success
→ if circuitOpen == false:
     consecutiveFailures = 0

counted_failure
→ if circuitOpen == false:
     consecutiveFailures += 1
     if consecutiveFailures >= 3:
       circuitOpen = true
       trip
~~~

一旦本 Tick已 trip，circuitOpen latch 到 explicit `resume()`；同一 Tick后续 success signal 不得自动关闭 circuit。

trip 的 exact behavior：

~~~text
current Tick synchronous transaction finishes
→ suppress all not-yet-issued DecisionPort request commands from this Tick
→ cancel/retain no next scheduler wake
→ call presentation.pause() through the normal Runtime pause boundary
→ if Presentation pause classified fatal: finish(presentation failure)
→ else status = PAUSED
→ best-effort abort all still-active request-scoped Decision AbortControllers
→ issue no new Decision request while PAUSED
~~~

trip 不回滚本 Tick已经提交的 gameplay facts。也就是说，第三个 counted failure 在 Tick N 被合法消费后，Tick N仍是完整 deterministic transaction；从 Tick N 结束后开始冻结 logical clock。

Circuit pause 与普通 pause 共享：

- Battle logical time冻结；
- wall time不进入 logicalElapsed；
- resume后不做 pause catch-up；
- HP/tile/action/protection/timers 在 pause 期间不推进。

区别是 circuit trip 额外 abort 所有 active Decision requests，防止 provider 不可用时继续消耗请求。

这些 circuit-triggered abort 的 `DECISION_ABORTED` completion 不计入 failure streak，也不能递归触发第二次 trip。

### 10.4 Explicit resume

Decision circuit **不自动恢复**，不使用 retry timer/cooldown 自动 `resume()`。

当 Runtime 当前 PAUSED 且 `circuitOpen === true` 时，外部显式调用：

~~~text
battle.resume()
~~~

执行：

~~~text
consecutiveFailures = 0
circuitOpen = false
→ normal presentation.resume() boundary
→ if success: status = RUNNING
→ restart scheduler from frozen logical time
~~~

后续最早合法 Tick由现有 `ensureDecision` 规则创建新的 Decision request。

如果 provider 仍然不可用，后续再次连续 3 个 counted failure 会再次 trip。

普通外部 pause/resume 在 `circuitOpen === false` 时不因 pause 本身修改 failure streak。

### 10.5 attempt_failure generation semantics unchanged

在未达到 threshold 时：

- counted `attempt_failure` 与其他 attempt failure 一样结束当前 attempt/generation；
- 最早下一逻辑 Tick可重新 Decision；
- DeepSeekDecision 本身不做 transport retry/backoff。

因此 v0 不需要再叠加 provider cooldown/exponential retry；连续失败由 Runtime circuit-pause 截断请求风暴。

## 11. AcceptedPlan

Decision返回的 `PlanSubmission` 通过 validation后必须复制/规范化成 Simulation-owned plan；不得直接持有 provider mutable object。

```ts
type AcceptedPlan = {
  readonly planId: string
  readonly decisionGeneration: number
  readonly planningOrigin: GridPosition

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
- 每次 materialization 后立即检查 Plan 是否仍有 future intent；若没有，`activePlan = null`。已 materialize Action 本身继续由 ActionState拥有，不需要 Plan 保持 authority；
- 因此“最后一个 move/skill 已启动且仍有 Action lifecycle 未完成”可以同时满足 `activePlan = null` 并以 `prefetch_after_materialize` 开始预取 next Decision；skill materialize 若发生在 phase 10，可在 phase 10产生 request command；final move 只有 phase 13 reservation成功后才可在 phase 13产生该 command；pure turn 若是最后 intent，则直接完成并按 `plan_exhausted` 最早下一 Tick重决策；
- Action后续若被 damaging hit打断，当前 Action与任何 prefetch/pending Plan按 generation/lifecycle失效；不回滚已消费的 Plan cursor；
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
- active Plan最后一个 intent已 materialize后立即清空 `activePlan`；该 Action仍可 moving/windup/recovery，同时预取下一 Decision；
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

对于 moving-prefetch pending Plan，promotion 前必须满足 `actor.tile === pendingPlan.planningOrigin`。正常路径中 move interruption/damaging hit 会提前 invalidate 该 pending Plan，因此出现 valid pending authority 但 committed tile 与 planningOrigin 不一致属于 Runtime invariant，不重新解释 path origin。

## 13. Plan exhaustion, hold and redecision

所有 Plan出口必须有明确后续：

- pure turn完成且无剩余 skill → plan exhausted；
- move-only path耗尽 → plan exhausted；
- path耗尽仍未达到 minCoefficient → plan exhausted；
- skill intent被 materialize → 原 Plan future intent exhausted；
- move execution 的 `blocked / occupied / reserved / contested / swap_forbidden` → plan failed；
- 尚未 materialize skill windup 前，target 不再满足“存在、非 self、敌对、alive” → `target_invalid` plan failed；
- 不存在额外的 `plan meaningless` catch-all；无法归入上述、plan exhausted、damaging interruption 或 authority stale 的状态属于 Runtime invariant。
- damaging hit → plan invalidated；
- hold/reobserve（空 path、无 turn、无 skill）→ 本 Tick立即 exhausted，但不启动 Action。

统一规则：

- plan exhausted/failed 后不得同 Tick零时间循环新 generation；
- 若没有已预取 pending Plan，最早下一逻辑 Tick `ensureDecision`；
- hold的语义是“本 Tick不行动、下一 Tick重新观察”，不是永久 idle。

## 14. Scheduled events

Core event union必须 exact，不使用 `payload?: unknown`。它是 Simulation internal type，不从 root `battle/contracts` export：

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
enqueue(entry)
snapshotAndDrain()
clear()
```

Promise callback唯一允许：

```text
if session still accepts intake:
  inbox.enqueue({ actorId, completion })
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
  decisionCompletions: DecisionInboxEntry[]

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

`SkillResolveIntent / SkillIntent / MoveIntent / TileKey / ReplayFact` 等只在 Simulation module内部流转，不属于跨层 Contract。Agent可以选择 readonly object/type alias/局部helper representation，但必须满足本文 stage ordering、stable ordering、single-authority 与测试 Expected；不得因此新增第二份持久 authority或改变 public ABI。

Runtime shell在 Tick同步结束后按唯一顺序提交 side effects：

```text
1. enqueue future events
2. append Replay facts
3. call presentation.render(projection)
   └─ classified sync fatal → finish(presentation failure), suppress Decision commands
4. if Tick produced terminal candidate
   └─ finish(candidate), suppress Decision commands
5. otherwise invoke DecisionPort for RequestDecisionCommand
6. schedule/retain next wake
```

因此 terminal Tick、render-fatal Tick都不会在结果已经确定后额外发起新的 Decision provider call。future events 即使在 terminal前已入 queue，也会随 `finish()` 停止/清空，不再获得提交机会。

## 17. TICK-001 implementation mapping

14-stage ordering仍完全遵守 SPEC，不拆成14个架构服务：

1. snapshot due events + Decision Inbox；
2. fence scheduled stale lifecycle/generation；
3. commit valid move_complete + recovery_complete；
4. collect previously-started due skill_resolve；
5. resolve ordinary skill outcome with post-move committed facts；
6. batch apply ordinary hit damage；
7. damaging-hit aftermath/interruption；只记录/缓冲 redecision need，不让随后可能成立的 terminal 仍发出外部 Decision call；
8. ordinary terminal gate；若 terminal成立，抑制本 Tick全部尚未发出的 gameplay Decision request commands；
9. consume Decision snapshot / validation / correction / active-pending acceptance；
10. promote pending as eligible；advance active Plan；每 Actor最多一个新 Action intent；skill若在这里消费最后 future intent且进入 windup/recovery lifecycle，可产生 `prefetch_after_materialize` request command；pure turn完成最后 intent时不做同 Tick prefetch；
11. collect newly-started windup=0 skills；
12. resolve instant batch + aftermath + terminal；若 terminal成立，同样抑制尚未发出的 Decision request commands；
13. surviving movement intents统一 reservation/contention；成功才 materialize move_start；若这是 active Plan 最后 future intent，清空 activePlan并可产生 `prefetch_after_materialize` request command；
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
- skill target eligibility exact predicate：target actor存在、`targetActorId !== actor.actorId`、`target.team !== actor.team`、`target.hp > 0` 且 `target.action.type !== "dead"`；
- 该 predicate 在 submission validation 与每次尚未 materialize skill windup 的 Plan advancement时都检查；失败时结束 Plan为 `target_invalid`，不启动 windup；
- windup已经 materialize 后不再把 target变化解释成 Plan failure；resolve 时由 HIT-001 得到 hit/immune/miss/invalid。若 target 当时 dead/不存在，则 outcome=invalid、0 damage，并按该 Skill 的 recovery rule结束此 Action（若 Battle terminal gate 已先结束 session，则不会继续启动 gameplay）；
- plan failure记录 exact reason并按 §13安排后续redecision。

## 19. Seeded contention function

MOVE-003 的 v0 winner 算法必须跨实现一致。因为 v0只有两个 combat Actor，同一目的格最多两个竞争者，不维护可消费的全局 RNG stream。

输入：

```text
battleSeed
currentTick
targetTile.x
targetTile.y
sorted competingActorIds
```

canonical bytes：

```ts
const seedTag =
  typeof battleSeed === "number"
    ? `n:${battleSeed}`
    : `s:${battleSeed}`

const key = JSON.stringify([
  seedTag,
  currentTick,
  targetTile.x,
  targetTile.y,
  ...sortedActorIds,
])

const bytes = new TextEncoder().encode(key)
```

使用 FNV-1a 32-bit：

```ts
let h = 0x811c9dc5
for (const byte of bytes) {
  h ^= byte
  h = Math.imul(h, 0x01000193) >>> 0
}
```

v0 两个竞争者时：

```ts
winner = sortedActorIds[h & 1]
```

要求：

- competing actorIds 先按 ECMAScript ordinal string order排序；
- 1个申请者无需随机，直接成功；
- 不使用 `Math.random()`、Promise顺序、遍历顺序或共享 RNG consumption count；
- Replay重新计算该winner并与recorded contention fact比较；
- 未来 N Actor版本若允许同格超过2个竞争者，必须单独版本化公平选取算法，不得静默扩展 `h & 1`。

## 20. Movement and reservation

Reservation authority：

```ts
type Reservation = {
  actorId: ActorId
  tile: GridPosition
  actionGeneration: number
}
```

`reservations` 是 tile-global authority index；moving action中的 `to` 是动作payload，不单独拥有tile reservation authority。

phase 13 movement failure taxonomy 与判定优先级固定。对已通过 lifecycle/generation fence 的 MoveIntent：

1. `blocked`：destination 越界或静态 `passable=false`；
2. `swap_forbidden`：两个 surviving intents 恰好互相以对方 committed origin 为 destination；在普通 occupied 检查前识别，因此 direct swap 记录该 reason；
3. `occupied`：destination 当前被另一个 Actor 的 committed tile 占用；即使该 Actor 本 Tick也想离开，move_complete 前 origin 仍占用；
4. `reserved`：destination 已存在由更早 active movement 持有的 reservation；
5. `contested`：通过以上检查后，本 phase 有多个新 intents 申请同一原本 free/unreserved destination；seeded winner成功，其余失败；
6. 其余单一申请成功。

同一 MoveIntent只记录第一个命中的 reason。stale/dead/terminal intent 在进入此 taxonomy 前被 fence，不产生 move_failed。

move_start成功：

```text
actionGeneration++
motionId = nextMotionId++
reserve destination
direction = movement direction
action = moving(...)
schedule move_complete(dueTick = currentTick + moveTicks)
```

多格path只materialize当前step。若成功 move_start 消费的是 active Plan 最后一个 future intent，则 phase 13立即 `activePlan = null` 并允许 `prefetch_after_materialize`；move_complete成功后commit destination、释放origin occupancy语义/目的reservation，后续 Tick phase10再决定 promoted/new Plan 是否可执行。

damaging hit中断：释放destination reservation、保持origin committed tile、action generation失效、active/pending Plan按规则失效；旧move_complete后续只能stale drop。

Protection assignment implementation follows HIT-002 exactly:

```ts
protectedUntilTickExclusive =
  currentTick + protectionTicks + 1
```

Use safe-integer checked addition. `protectionTicks = 0` still protects the remainder of the hit Tick, but adds no later full Tick.

## 21. Range lookup and rotation

`ResolvedRangeMatrix` 采用屏幕/Map坐标：x向右增加，y向下增加。canonical matrix按 caster朝上（Direction=8）解析，origin由 `originX/originY` 指定。

对 matrix cell：

```text
dx = cellX - originX
dy = cellY - originY
```

转成 world delta 的 exact mapping：

```ts
direction 8 (up):    { dx,       dy      }
direction 2 (down):  { dx: -dx,  dy: -dy }
direction 4 (left):  { dx: dy,   dy: -dx }
direction 6 (right): { dx: -dy,  dy: dx  }
```

目标 coefficient lookup等价于遍历 resolved matrix正 cell并比较：

```text
caster.tile + rotatedDelta == target.tile
```

匹配则返回该 cell的 `coefficientUnits`；无匹配返回0。origin cell固定0，因此 caster自身格不会因marker产生攻击系数。

实现可以预计算 direction-specific lookup Map，但结果必须与上述公式逐项相同；不得把 Presentation方向/屏幕插值带入计算。

## 22. Skill / recovery scheduling

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

## 23. Projection cadence and identities

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
- `SkillEffectProjection.effectId`：battle-local monotonic positive safe integer，由 `nextEffectOccurrenceId` 分配；每个 skill resolve outcome occurrence消费一个；即使 miss/invalid不产生可见 transient visual，也消费 occurrence identity以保持 deterministic facts；
- `sceneEpoch`：session-level cross-layer scene identity，来自 resolved definition；
- `visualEpoch`：Presentation-local，Simulation从不生成。

## 24. BattleResult and terminal arbitration

BattleResult exact public union见 Contracts。Runtime内部只有一个 one-shot terminal arbiter：

```text
finish(candidate)
→ if already committed: false
→ mark terminal committed
→ state.result = candidate
→ stop scheduler
→ clear ScheduledEventQueue + DecisionInbox intake authority
→ abort Decision work
→ if normal win/defeat: status = SETTLED, keep Presentation open
→ else: Presentation.close(), status = CLOSED
→ settle run() exactly once
```

Reducer产生 normal terminal **candidate** 时只提交 gameplay terminal facts（例如 HP/dead），不先写入 public `state.result`。只有 terminal arbiter `finish(candidate)` 成功后，`state.result` 才成为最终 committed BattleResult。

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

Presentation sync error classification固定：

- `PRESENTATION_CONTENT_FAILED / PRESENTATION_COMMIT_FAILED` → classified session failure，进入 `BattleResult.failure { source: "presentation", code }`；
- `PRESENTATION_INVALID_STATE / PRESENTATION_SCENE_MISMATCH / PRESENTATION_PROJECTION_CONFLICT / PRESENTATION_INVALID_DATA` → Runtime/contract invariant or programmer error，允许 throw/reject，不伪装成业务 BattleResult。

Active Runtime invariant/programmer failure 使用独立 one-shot rejection cleanup path：

```text
rejectInvariant(error)
→ if terminal/result already committed: do not rewrite result
→ otherwise stop scheduler
→ clear queues/intake
→ abort Decision work
→ presentation.close()
→ status = CLOSED
→ reject run() exactly once
```

它不写入 `state.result`，Replay可保留截至失败前的partial facts但没有业务result。同步 public method misuse可直接throw；async provider/Presentation invariant必须被捕获后走上述cleanup，不能成为unhandled rejection。

Programmer error/invariant violation不伪装成业务 `BattleResult.failure`，允许throw/reject。

## 25. Snapshot

`getSnapshot()` 返回 detached immutable value，不暴露Runtime mutable reference。

ActorSnapshot / ReservationSnapshot exact public fields及 ordinal-sorted readonly-array collection shape 见 Contracts。Public Snapshot只包含跨层/诊断有用facts：

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

## 26. ReplayRecord

Replay exact v0 schema：

```ts
type ReplayRecord = {
  version: 1
  initial: ResolvedBattleDefinition

  decisions: readonly ReplayDecisionRecord[]
  ticks: readonly ReplayTickRecord[]

  replayability:
    | { type: "in_progress" }
    | { type: "deterministic" }
    | {
        type: "audit_only"
        reason:
          | "cancelled"
          | "presentation_failure"
          | "invariant_rejection"
      }

  result?: BattleResult
}

type ReplayDecisionRecord = {
  actorId: ActorId
  generation: number
  attempt: 0 | 1
  requestId: string
  requestTick: number
  planningOrigin: GridPosition
  consumedTick: number

  completion:
    | { type: "completed"; plan: PlanSubmission }
    | {
        type: "failed"
        category: DecisionFailureCategory
        code: string
      }

  consumeOutcome:
    | { type: "accepted"; acceptedTick: number; planId: string }
    | { type: "rejected"; rejectedTick: number; reason: PlanRejectReason }
    | { type: "attempt_failed" }
    | { type: "session_fatal" }
    | { type: "stale" }
}

type ReplayTickRecord = {
  tick: number
  movements: readonly ReplayMovementFact[]
  skills: readonly ReplaySkillFact[]
  damage: readonly ReplayDamageFact[]
  protections: readonly ReplayProtectionFact[]
}

type ReplayMovementFact =
  | {
      type: "move_started"
      actorId: ActorId
      from: GridPosition
      to: GridPosition
      motionId: number
    }
  | {
      type: "contention"
      tile: GridPosition
      competitors: readonly ActorId[]
      winnerActorId: ActorId
    }
  | {
      type: "move_failed"
      actorId: ActorId
      tile: GridPosition
      reason: "blocked" | "occupied" | "reserved" | "contested" | "swap_forbidden"
    }
  | {
      type: "move_interrupted"
      actorId: ActorId
      reason: "damaging_hit"
    }

type ReplaySkillFact = {
  effectId: string
  casterActorId: ActorId
  targetActorId: ActorId
  skillId: string
  result: "hit" | "immune" | "miss" | "invalid"
  coefficientUnits: number
}

type ReplayDamageFact = {
  sourceActorId: ActorId
  targetActorId: ActorId
  skillId: string
  amount: number
  hpBefore: number
  hpAfter: number
}

type ReplayProtectionFact = {
  actorId: ActorId
  startTick: number
  protectedUntilTickExclusive: number
}
```

Replay terminal scope：

- active Runtime：`replayability = in_progress`；
- normal win/defeat/simultaneous defeat、recorded Decision `session_fatal`、deterministic Simulation failure：terminal 后为 `deterministic`；
- external `cancel()` / pre-aborted signal：`audit_only(cancelled)`；
- Presentation infrastructure failure：`audit_only(presentation_failure)`；
- programmer/invariant rejection：`audit_only(invariant_rejection)` 且没有业务 `result`。

ReplayDriver只接受 `replayability.type === "deterministic"`。对于 `in_progress/audit_only` record 必须明确拒绝 deterministic replay；这些 records 只用于 prefix/audit inspection，不伪造 external terminal 的发生 Tick/phase。

不记录真实 Decision completion timestamp。Replay arrays 按产生 Tick、再按 actorId / effectId 等稳定 identity 写入，不以 Map insertion order 或 Promise order作为序列化权威。

`initial` 是 Runtime build 时已验证的 `ResolvedBattleDefinition` 的 detached immutable deep copy；Replay 不重新访问 Decision/LLM 来恢复初始 gameplay facts，也不额外引入 definition fingerprint/hash algorithm。外部 Content serialization subject/version 如何生成该 resolved definition 仍属于 Integration，不影响 Replay。


## 27. Replay execution

Replay不得实现第二套Battle规则。

Replay public entrypoint 是 `BattleReplayBuilder.build(record)`。它先要求 `record.replayability.type === "deterministic"`，然后构造同一个 `BattleRuntime` core，只把 Decision input source换成 recorded input。

ReplayDriver：

```text
record.initial → same initial BattleState
same ScheduledEventQueue
same processTick()
same Plan validation/execution
same seeded contention
different Decision input source
```

Replay必须从 `record.initial` 重建 Runtime state。按 `ReplayDecisionRecord.consumedTick` 在对应 Tick snapshot注入recorded completion，不调用真实 DecisionPort；同时校验 reducer重新生成的 actorId/generation/requestId/requestTick/planningOrigin 与recorded request facts一致，不一致即 Replay invariant failure。

seeded contention在Replay中必须重新计算并与recorded fact比较；不直接把recorded winner当authority。若不一致，属于Replay invariant failure。

Replay成功标准：

- same final BattleResult；
- same final authoritative Snapshot；
- same gameplay Projection sequence/facts；
- recorded deterministic facts验证通过。

Presentation可替换为 Null/RecordingPresentation；Replay correctness不依赖Browser。

## 28. Runtime async races

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

### RACE-008 Initialize vs async Presentation failure / cancel

```text
arm failure observer
→ await presentation.initialize()
→ before initial render, re-check INITIALIZING + terminal not committed
```

如果 initialize 尚未返回时 `presentation.failure`、cancel 或 active close 已经先提交 terminal，则 initialize 返回后不得继续 initial render、initial Decision requests 或启动 scheduler。late initialize completion只允许被丢弃/cleanup，不得恢复 session authority。

### RACE-009 pause/resume vs sync Presentation fatal

`pause()/resume()` 的 Presentation调用位于 Runtime同步call boundary。classified Presentation throw 被 Runtime捕获并送入同一terminal arbiter；调用方不同时收到同义业务throw。programmer/state error仍可throw。

## 29. Shell / reducer command boundary

Reducer/plan helpers不得直接调用Ports。

允许的shell commands最小为：

```ts
type RuntimeCommand =
  | { type: "request_decision"; request: DecisionRequest }
```

future BattleEvent不是外部command，只由Tick output提交到ScheduledEventQueue。

Runtime处理 `request_decision` 时必须为**每一次 request**创建独立 AbortController；不得把整个 Battle external/session signal直接作为唯一 request signal：

```text
create request AbortController
link session abort → request.abort()
remember handle by actorId + requestId
decision.decide(request, request.signal)
→ Promise settle
→ remove request handle
→ if session still accepts intake:
     DecisionInbox.enqueue({ actorId, completion })
```

request AbortController/handle 属 Runtime shell async bookkeeping，不属于 BattleState/Snapshot/Replay gameplay authority。

必须 best-effort abort request：

- damaging hit / death 使该 actor current decision generation失效；
- correction/new generation 替换旧 active request；
- cancel/close/session fatal；
- invariant rejection cleanup。

Abort不是 correctness fence：provider可以忽略signal，late completion仍必须靠 lifecycle + requestId + generation fencing失去提交权。正常 Promise settle后abort handle立即移除。

Runtime处理 `request_decision` 的 settle path：

```text
decision.decide(request, requestScopedSignal)
→ Promise
→ completion callback
→ DecisionInbox.enqueue
```

Presentation render在完整Tick committed后由shell调用；同步throw立即进入terminal arbitration。

## 30. Testing architecture

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

## 31. Implementation invariants

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

## 32. Agent execution contract / Definition of Done

Implementation agent 按以下顺序落地，不重新设计边界：

```text
1. shared contracts.ts
   - Decision-facing frozen contracts
   - Snapshot/Result/Projection shared types + validators

2. simulation.ts public entry
   - BattleSimulationBuilder
   - BattleReplayBuilder
   - ./simulation package export

3. simulation/state.ts
   - ResolvedBattleDefinition validator/copy
   - Battle/Actor/Action/Decision/AcceptedPlan state

4. simulation/queues.ts
   - DecisionInbox
   - ScheduledEventQueue

5. simulation/plan.ts
   - Observation builder
   - PlanConstraints
   - Plan structural/semantic validation
   - planningOrigin/correction/prefetch
   - advancePlan

6. simulation/combat.ts
   - range rotation/coefficient
   - movement taxonomy/contention/reservations
   - skill/damage/protection

7. simulation/tick.ts
   - exact TICK-001 14-stage transaction
   - stable ordering + commands/facts/projection

8. simulation/replay.ts
   - recorder
   - recorded Decision source
   - deterministic-only ReplayBuilder path

9. simulation/runtime.ts
   - clock/scheduler/pause/resume
   - request-scoped abort
   - Presentation bridge
   - terminal arbiter/invariant rejection

10. qualification
   - reducer/scheduler/Decision race/lifecycle/Replay/Presentation integration tests
```

Definition of Done：

- `npm run build:battle` passes；
- `npm test -w @loomrealm-game/battle` passes；
- `npm run test:battle` passes from repo root；
- `npm pack -w @loomrealm-game/battle --dry-run` includes `dist/simulation.js` / `dist/simulation.d.ts` and package `./simulation` export resolves；
- all Simulation rows in `BATTLE_V0_TEST_MATRIX.md` that do not require real provider/Host wiring have executable automated coverage；
- FakeClock tests never depend on real sleep/timer drift；
- no gameplay path uses `Date.now()`, `Math.random()`, Browser animation ACK, Map Runtime state, or public `tick()`；
- Decision callback never mutates gameplay state；
- deterministic live→Replay qualification matches final result/snapshot/gameplay Projection sequence；
- external cancel/Presentation/invariant records are correctly marked audit-only；
- existing Presentation qualification remains green and its ABI is unchanged；
- no remaining implementation TODO may change public ABI, Tick ordering, authority owner, failure classification, replayability scope or deterministic ordering.

Agent may choose local helper names/data structures only where 本文明确标为 internal representation freedom；如果测试/实现发现 frozen documents互相冲突，应停止并报告冲突，而不是自行选择一套新语义。

## 33. Implementation qualification gate

Simulation 已完成 implementation 与 closed-loop qualification；冻结时的 blocking choice 均已有唯一答案并已由实现与自动化测试固化：

- initialization与initial Decision request Tick；
- RuntimeState/ActionState/DecisionState/AcceptedPlan；
- request-scoped planningOrigin、active/pending Plan bounded pipeline与promotion；
- hold/plan end/redecision出口；
- BattleClock/scheduler/pause/catch-up；
- Decision Inbox与ScheduledEventQueue；
- exact core scheduled event union；
- TICK-001 transaction与shell/reducer boundary；
- recovery=0与same-Tick Action quota；
- Projection cadence与motion/effect identity；
- BattleResult terminal arbiter与Presentation race；
- exact target eligibility 与 movement failure taxonomy；
- Snapshot ordinal-sorted public boundary；
- ReplayRecord replayability scope / BattleReplayBuilder；
- cancel/pause/late async races；
- headless test doubles、Agent execution order、build/test/pack Definition of Done。

仍可OPEN且不阻塞Simulation Core实现的内容：

- serialized BattleActor/BattleSkill external subject/version/key encoding；
- DeepSeek concrete Decision 的 provider/HTTP/failure semantics 已由 BATTLE_V0_DECISION.md 冻结且不属于 Simulation；这里只允许 Host credential/composition wiring 保持外部 OPEN；
- Guidance Host/InputTarget wiring；
- Host具体background/suspend事件来源。

这些不得改变本文已冻结的 Simulation authority、state transition、Tick timing、Plan pipeline或public Runtime semantics。
