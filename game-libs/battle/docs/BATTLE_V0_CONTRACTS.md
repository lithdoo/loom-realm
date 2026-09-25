# Battle v0 Contracts

> Status: **Design-only contract specification**. This file defines canonical logical data boundaries for Battle v0. It does not claim TypeScript/Zod/JSON Schema code already exists.
>
> Core gameplay semantics are defined only in [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md). This file must not redefine reducer behavior.

## 1. Contract boundary

The shared contract layer is intentionally thin:

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

Simulation, Decision, and Presentation may depend on these data contracts. The contract module owns no runtime state and is not a fourth Battle layer.

## 2. Serialization status

### CONTRACT-OPEN-001 — Content subject/version — OPEN

The following formal Content concerns are not yet frozen:

- exact subject/version names, e.g. whether they are `struct.BattleActor/v1`;
- global field naming convention;
- whether Content key must equal an object-internal `id`;
- exact reference encoding for `skills[]` and `effect`.

Schema version should represent structural compatibility, not balance changes such as damage 5 → 6.

The logical semantics below are canonical even while serialization details remain open.

## 3. Shared primitive concepts

### GridPosition

```ts
type GridPosition = {
  x: integer
  y: integer
}
```

Authoritative positions are integer tiles.

### Direction

```ts
type Direction = 2 | 4 | 6 | 8
```

Meaning is defined in `STATE-002`.

### ResourceRef

Battle reuses LoomRealm's existing resource identity concept:

```ts
type ResourceRef = {
  namespace: string
  key: string
  contentVersion?: string
}
```

Exact existing common type should be reused rather than redefined if available.

## 4. Battle Content

### 4.1 BattleActor

Current conceptual Content shape:

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

Logical fields:

- definition id;
- display name;
- Character Graphics reference;
- positive integer max HP;
- list of BattleSkill references.

The following are Runtime State and MUST NOT be stored as static BattleActor Content:

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

v0 starts at full HP; no separate `initial_hp` Content field is required.

### 4.2 BattleSkill

Current conceptual Content shape:

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

Logical fields:

```text
id
name
range
damage
timing.windup_ticks
timing.recovery_ticks
effect
```

v0 does not contain `tracking`, `active_ticks`, MP, accuracy, critical hit, element, armor penetration, universal cooldown, ammo, or target/effect type fields. Visual effect duration belongs to BattleEffect/Presentation, not BattleSkill rule timing.

Range validation follows `SKILL-001`:

- rectangular matrix;
- exactly one `"↑"`;
- other cells finite nonnegative values;
- positive coefficient has at most 3 decimal places.

### 4.3 BattleEffect

BattleEffect is Presentation-only Content. Current conceptual shape:

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

Its visual timing MUST NOT change Simulation windup/recovery/damage timing.

**CONTRACT-OPEN-002:** exact BattleEffect v1 image/timing/anchor schema and outcome-specific visuals are not frozen.

## 5. BattleConfig

Conceptual configuration:

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

Skill windup/recovery are BattleSkill Content values.

`tickDurationMs=200` and default `maxPathSteps=6` are frozen. Exact balance values such as `moveTicks`, `protectionTicks`, skill damage, skill range, windup/recovery values, and map size remain content/configuration tuning values.

## 6. PlanConstraints

`PlanConstraints` tells Decision what it may generate; it does not enumerate tactics.

Conceptual shape:

```ts
type PlanConstraints = {
  maxPathSteps: integer
  movement: {
    cardinalOnly: true
  }
  skills: Array<{
    skillId: string
    minCoefficients: number[]
  }>
}
```

`minCoefficients` is the distinct positive coefficient set actually present in the Skill range matrix. Implementations may additionally expose normalized integer units internally.

## 7. PlanSubmission

Logical shape is frozen by `PLAN-003`:

```ts
type PlanSubmission = {
  path: GridPosition[]
  skill?: {
    skillId: string
    targetActorId: string
    minCoefficient: number
  }
}
```

Semantics:

- path excludes the current Actor tile;
- path is cardinal;
- empty path + no skill = hold/reobserve;
- empty path + skill = direct cast;
- no free-form execution fields.

### Plan rejection reasons

The contract SHOULD provide stable machine-readable codes, at minimum:

```text
path_too_long
path_out_of_bounds
path_not_adjacent
terrain_blocked
unknown_skill
invalid_target
invalid_min_coefficient
stale_decision_generation
actor_not_ready
```

Exact enum naming may be finalized with the runtime type implementation without changing their semantic distinctions.

## 8. PlanAcceptance

Conceptual result:

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

Synchronous acceptance means only that the plan may enter execution. Future path steps or skill resolution may still fail because the battle changes.

## 9. BattleObservation

Decision sees Simulation facts, not render state.

Minimum useful observation fields:

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

Observed Actor data should include battle-relevant public facts such as:

- HP / max HP;
- committed tile;
- direction;
- action state;
- current protection remaining / boundary;
- current movement/windup/recovery facts needed for tactical reasoning;
- usable Skill definitions/range matrices.

Observation MUST NOT contain interpolated Sprite coordinates as authoritative positions.

Exact prompt-oriented serialization and event history budget are implementation concerns.

## 10. BattleSnapshot

BattleSnapshot is authoritative state for host/debug/replay consumers, conceptually:

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

ActorSnapshot should use the canonical field name `direction`, not `facing`.

A Snapshot is different from RenderProjection.

## 11. Actor runtime concepts

Conceptual internal/authoritative fields:

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

ActionState must be able to distinguish at least thinking/idle, moving, windup, recovery, dead, and terminated concepts. Exact discriminated-union structure can be finalized during implementation.

## 12. BattleEvent

Conceptual event envelope:

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

Core event concepts include:

```text
decision_ready
move_complete
skill_resolve
recovery_complete
```

Protection expiration is interval-derived and does not need a `protection_expire` business event.

## 13. Skill resolution result

The shared outcome enum is:

```ts
type SkillResolveResult =
  | "hit"
  | "immune"
  | "miss"
  | "invalid"
```

Semantics are defined only by `HIT-001` in the core spec.

A skill resolve/replay event should carry the actual resolve coefficient (preferably normalized units internally) when relevant.

## 14. RenderProjection

RenderProjection is non-authoritative visual data.

Conceptual content may include:

```ts
type RenderProjection = {
  tick: integer
  actors: ActorRenderProjection[]
  movements: MovementProjection[]
  effects: SkillEffectProjection[]
  focusHint?: CameraFocusHint
}
```

Presentation may interpolate movement and choose camera behavior. RenderProjection MUST NOT be reverse-synchronized into Simulation.

**CONTRACT-OPEN-003:** exact projection shape, node lifecycle, and whether Simulation emits optional non-authoritative camera focus hints are not frozen.

## 15. SkillEffectProjection

Conceptual projection:

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

Whether `miss` or `invalid` creates visible effects is Presentation policy and remains open.

## 16. Decision timing state

A Decision Adapter must eventually expose enough trusted timing metadata for the core rules:

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

The exact adapter API and error/cancellation metadata are integration concerns; see BATTLE_V0_INTEGRATION.md.

## 17. ReplayRecord

Replay must contain enough authoritative input/facts to execute without calling Decision/LLM again:

```text
initial config/content refs
battleSeed
accepted PlanSubmissions + acceptedPlanIds
Decision timing/generation facts
movement reservations/contention results
skill resolve results + coefficient
damage/protection facts
BattleResult
```

Exact file/serialization format remains an implementation choice.

## 18. Contract open items

- **CONTRACT-OPEN-001** Content subject/version, field naming, key/id alignment, reference encoding.
- **CONTRACT-OPEN-002** BattleEffect v1 schema.
- **CONTRACT-OPEN-003** RenderProjection/SkillEffectProjection exact schema and camera hint shape.
- Exact discriminated unions/enums for runtime implementation.
- Exact Observation history budget and prompt-facing representation.

These open contract details MUST NOT change the frozen gameplay semantics in BATTLE_V0_SPEC.md.
