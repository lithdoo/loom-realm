# Battle v0 Core Specification

> Status: **Design-only normative specification**. This file is the single source of truth for frozen Battle v0 gameplay/runtime semantics. It does not mean Runtime code, schemas, build, or tests already exist.
>
> Normative vocabulary:
> - **FROZEN / MUST**: v0 implementation must follow this rule.
> - **SHOULD**: recommended implementation/integration behavior; not a gameplay invariant.
> - **OPEN**: not decided; implementation must not silently invent a rule.
> - **NON-GOAL**: explicitly outside v0.

## 1. Scope and authority

Battle v0 is an independent **two-Actor simultaneous-action battle system**. It uses a fixed 200 ms logical Tick, a deterministic reducer/event queue, short-term Decision plans, atomic grid movement, single-target skills, hit protection, deterministic replay, and a presentation-only renderer.

The runtime is split into three replaceable layers:

- **Simulation**: sole authority for battle rules and state.
- **Decision**: produces structured short-term plans.
- **Presentation**: renders Simulation facts and projections.

The shared `battle/contracts` types are a data boundary, not a fourth runtime layer.

### ARCH-001 — Simulation is authoritative — FROZEN

Only Simulation may mutate authoritative battle facts: logical time, Actor committed tiles/direction, occupancy/reservations, HP, action state, accepted plans, protection, generations, skill resolution, BattleResult, and replay facts.

Async callbacks, LLM responses, Browser animation completion, DOM state, Sprite coordinates, and camera state MUST NOT directly mutate Simulation state.

### ARCH-002 — Decision owns tactical intent — FROZEN

Decision decides **what it wants to do**. It directly generates a structured `PlanSubmission`, including the explicit path and optional skill intent.

Simulation MUST NOT pre-enumerate tactical routes and ask Decision to choose a `planId`.

### ARCH-003 — Presentation is projection-only — FROZEN

Presentation decides **how authoritative facts are displayed**. Interpolated screen coordinates, dropped frames, effect completion, camera movement, or viewport changes MUST NOT feed authoritative position/damage/timing back into Simulation.

### ARCH-004 — RPGMap Runtime is not reused — FROZEN

Battle MAY consume existing LoomRealm Map/Tileset/Autotile/Character content/resource formats, but MUST NOT call RPGMap Runtime movement, timers, transfer/bridge behavior, or runtime state as Battle authority.

## 2. Canonical terminology

These terms are canonical throughout the Battle docs:

- **tile**: an integer grid coordinate.
- **committed tile**: the Actor's authoritative Simulation position.
- **path**: ordered future tiles in a `PlanSubmission`; it does **not** include the Actor's current tile.
- **step**: one already-started atomic move from one tile to one adjacent tile.
- **PlanSubmission**: Decision output not yet accepted by Simulation.
- **accepted plan**: a validated plan owned by Simulation; Simulation may assign an internal `acceptedPlanId`.
- **Decision Request**: one asynchronous request/policy evaluation bound to an Actor `decisionGeneration`.
- **Action**: a newly started authoritative move step, skill windup, or future explicit turn action.
- **windup**: skill pre-resolution delay.
- **resolve**: the authoritative instant when a skill determines `hit / immune / miss / invalid`.
- **recovery**: post-resolve action lock.
- **coefficient**: deterministic effect multiplier from the skill range matrix.
- **coefficientUnits**: coefficient normalized to thousandths for Runtime computation.
- **protection**: bounded interval during which valid attacks on the Actor resolve as `immune`.

Do not use `facing` as a second Runtime field name for direction; the canonical concept is **direction**.

## 3. Battle configuration and initialization

### TIME-001 — Tick duration — FROZEN

`tickDurationMs = 200`. All gameplay durations are integer Tick counts.

Real-world asynchronous work may complete at arbitrary times, but it becomes authoritative only at a deterministic logical Tick.

### BATTLE-001 — v0 combatants — FROZEN

v0 contains exactly two combat Actors: one on each side. Each Actor occupies one tile.

### BATTLE-002 — initial HP — FROZEN

Actors begin at full `max_hp` in v0. A separate `initial_hp` Content field is not required.

### PLAN-001 — short-plan length — FROZEN

`PlanConstraints.maxPathSteps` exists. Its v0 default is **6**, and the value may be changed by Battle configuration without changing the contract shape.

### RNG-001 — battle seed — FROZEN

Because movement contention uses pseudorandom arbitration, each Battle MUST own a `battleSeed` from initialization and include it in replay facts.

Gameplay randomness MUST be reproducible from stable inputs; do not use uncontrolled `Math.random()`.

## 4. Authoritative Actor state and invariants

A conceptual Actor Runtime state includes:

```text
actorId
team
hp
tile
direction
actionState
acceptedPlanId?
activeStep?
protectedUntilTickExclusive
actionGeneration
decisionGeneration
```

### STATE-001 — committed integer position — FROZEN

Simulation has no authoritative half-tile position. During interpolation, the Actor remains committed to an integer tile until `move_complete`.

### STATE-002 — direction is a rule input — FROZEN

Direction uses the existing LoomRealm/RPGMap values:

```text
2 = down
4 = left
6 = right
8 = up
```

Skill range rotation reads Simulation direction, not Presentation Sprite orientation.

**OPEN-DIR-001:** whether movement updates direction at step start or `move_complete`, and whether v0 contains an explicit `turn` Action, are not yet frozen.

### STATE-003 — one valid Decision Request — FROZEN

Each Actor has at most one valid pending Decision Request for its current `decisionGeneration`.

`ensureDecision(actorId, reason)` is idempotent within a generation. Multiple same-Tick reasons to replan MUST NOT create duplicate requests.

### STATE-004 — one newly started Action per Tick — FROZEN

One Actor may start at most one new active Action in one logical Tick. This bound applies even when windup or recovery duration is zero.

## 5. Time, event queue, and asynchronous completion

### TIME-002 — event queue — FROZEN

Simulation owns a due-Tick ordered event queue. Conceptual events include:

```text
decision_ready
move_complete
skill_resolve
recovery_complete
```

Async callbacks may record completion facts and timestamps, but MUST NOT directly mutate battle state.

### TIME-003 — overdue ticks are processed sequentially — FROZEN

If the scheduler wakes after multiple logical ticks have elapsed:

```text
while lastProcessedTick < targetTick:
  lastProcessedTick += 1
  processTick(lastProcessedTick)
```

Different `dueTick` values MUST NOT be collapsed into one simultaneous batch.

### DEC-001 — Decision latency is battle time — FROZEN

Decision/LLM latency counts as game time.

A real duration is rounded upward to the earliest usable Tick boundary. Example: 500 ms becomes 3 ticks / 600 ms.

Decision State records trusted completion facts such as:

```text
startedAtMonotonicMs
completedAtMonotonicMs?
deadlineMonotonicMs
dueTick?
```

If `completedAt <= deadline`, the result is successful even if the host callback is processed later. Callback ordering MUST NOT decide timeout vs ready.

### DEC-002 — stale generations cannot submit — FROZEN

A Decision Request is bound to `decisionGeneration`. Once that generation is invalidated, a late response has no submit authority.

## 6. Decision protocol and PlanSubmission

### PLAN-002 — Decision receives facts and constraints — FROZEN

Decision consumes Simulation-provided:

```text
BattleObservation
PlanConstraints
RecentEvents
Optional Guidance
```

Decision MUST NOT read Presentation DOM/Sprite/camera/animation state as battle facts.

### PLAN-003 — minimal PlanSubmission — FROZEN

Logical shape:

```text
PlanSubmission
├── path: GridPosition[]
└── skill?: {
      skillId
      targetActorId
      minCoefficient
    }
```

Rules:

- `path` contains only future destination tiles; it does not repeat the current tile.
- Movement is cardinal only; each consecutive tile is Manhattan distance 1.
- `path.length <= PlanConstraints.maxPathSteps`.
- `path: []` + no skill means hold/reobserve.
- `path: []` + skill means direct cast.
- v0 has no free-form `strategy`, `reason`, `priority`, `fallback`, or `moveGoal` execution fields.

### PLAN-004 — minCoefficient values — FROZEN

`minCoefficient` MUST equal one of the distinct positive coefficients that actually exists in that Skill's range matrix after normalization.

If the matrix contains only `0.5` and `1.0`, `0.73` is invalid.

### PLAN-005 — submission validation — FROZEN

At submission time Simulation validates structure and current static/lifecycle conditions, including:

- path length;
- integer in-bounds coordinates;
- cardinal adjacency;
- static terrain passability;
- skill ownership;
- target validity;
- allowed `minCoefficient`;
- current `decisionGeneration`;
- whether the Actor is currently eligible to accept a plan.

Submission-time validation MUST NOT require all future path tiles to remain dynamically unoccupied. Occupancy/reservation/contention are revalidated when each step actually starts.

Acceptance means only “this plan may begin”; it does not guarantee future success.

### PLAN-006 — rejection and correction — FROZEN

A rejection returns a machine-readable reason such as:

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

Within one `decisionGeneration`, Decision gets at most **one correction retry**.

If the second submission is still invalid:

- the current generation fails;
- the Actor remains idle;
- a new Decision generation may start no earlier than the next logical Tick.

Any corrective LLM call consumes normal battle time.

### PLAN-007 — dynamic plan execution — FROZEN

An accepted plan is revalidated against the live battle as it executes:

- accepting a plan uses the latest battlefield; ordinary enemy movement during Decision latency does not automatically invalidate the whole strategic intent;
- before each move step, revalidate passability, occupancy, reservation, Actor lifecycle, and plan generation;
- for a skill plan, check the current range coefficient at plan start, after each `move_complete`, and after protection ends when attack eligibility returns;
- if coefficient is 0/outside or below `minCoefficient`, do not cast; continue the remaining legal path when possible;
- once coefficient reaches `minCoefficient` and the Actor may attack, stop unused path steps and start windup;
- if the path is exhausted while the start threshold is still unmet, the plan MUST NOT silently downgrade to a lower-coefficient attack; end/hold and continue the Decision flow;
- if the path becomes blocked, the target disappears, or the plan becomes meaningless, stop the plan and replan on a later eligible Tick; do not zero-time retry.

### PLAN-008 — move-only never auto-attacks — FROZEN

A submission with no skill intent is move/hold-only. Simulation MUST NOT opportunistically start an available skill merely because the Actor passes through a legal skill cell.

## 7. Movement

### MOVE-001 — atomic single-tile step — FROZEN

A step from A to B is:

```text
occupy A
→ reserve B
→ start step A→B
→ A remains committed/occupied while moving
→ move_complete
→ release A
→ occupy B
→ release B reservation
```

Presentation may interpolate between A and B, but Simulation position remains A until completion.

### MOVE-002 — sequential path execution — FROZEN

An Actor may have only one active step. A later path step cannot start until the previous `move_complete` has committed.

Every new step revalidates dynamic occupancy and reservations.

### MOVE-003 — same-tile contention — FROZEN

If multiple Actors claim the same destination tile in the same Tick:

- collect all claims first;
- choose at most one winner;
- every contender has equal pseudorandom chance;
- derive the result from stable inputs such as:
  `battleSeed + currentTick + targetTile + sorted competingActorIds`.

Do not depend on iteration order, Promise order, `Math.random()`, or the number of previous RNG calls.

### MOVE-004 — direct swap is forbidden — FROZEN

Two adjacent Actors may not directly swap tiles through each other in the same Tick in v0.

### MOVE-005 — contention loser — FROZEN

The loser remains on its origin tile, ends its current plan, records a reason such as `contested`, and replans on a later Tick. No zero-time same-Tick retry.

### MOVE-006 — nonlethal hit during an active step — FROZEN

A damaging hit invalidates the old multi-step plan but does not roll back an already-started atomic step. A surviving Actor completes that step using its step token; future old-plan steps are cancelled.

A new Decision may run during protection and continues from the actual committed destination after the current step completes.

**OPEN-MOVE-001:** whether a lethally hit Actor still commits an already-started `move_complete` is not yet frozen. Implementation MUST NOT infer this from the nonlethal rule.

## 8. Skill Content semantics

### SKILL-001 — single range matrix — FROZEN

A Skill uses one arbitrary rectangular m×n matrix authored in canonical **up-facing** orientation.

Cell meaning:

```text
"↑" = caster origin and canonical facing
0   = invalid target area
>0  = valid target cell and deterministic effect coefficient
outside matrix = invalid target area
```

Validation:

- all rows same length;
- exactly one `"↑"`;
- every other cell is a finite nonnegative number;
- coefficient Content has at most 3 decimal places.

The matrix rotates with Simulation direction. v0 does not use separate `origin`, `shape`, `front_only`, `rotate_with_facing`, target matrix, or effect matrix fields.

### DAMAGE-001 — coefficient normalization and damage — FROZEN

Content coefficient is normalized to thousandths:

```text
1.0  → 1000
0.5  → 500
1.25 → 1250
```

Runtime comparisons and replay facts use `coefficientUnits`.

For base damage:

```text
finalDamage = floor(baseDamage × coefficientUnits / 1000)
```

Zero final damage is allowed. v0 does not silently impose minimum 1 damage.

### SKILL-002 — minCoefficient is start-only — FROZEN

`PlanSubmission.skill.minCoefficient` means the minimum coefficient at which this plan is willing to **start the skill**.

Before windup:

- coefficient < minCoefficient: do not cast; continue the legal path if possible.
- coefficient >= minCoefficient and Actor may attack: stop remaining path and start windup.

Once windup has started, `minCoefficient` no longer constrains resolution.

### SKILL-003 — no tracking; resolve current position — FROZEN

v0 has no `tracking` field and no implicit “locked hit”.

At resolve, Simulation re-reads the caster's current committed tile/direction and the target's current committed tile:

- coefficient > 0: resolve using that **current** coefficient;
- coefficient <= 0 or outside matrix: `miss`.

Example:

```text
start at 1.0
target moves to 0.5 during windup
→ hit at 0.5

target moves outside matrix
→ miss
```

### SKILL-004 — windup and recovery — FROZEN

Normal skill lifecycle:

```text
windup
→ resolve
→ recovery
→ next eligible Action
```

A damaging hit before resolve cancels an unfinished windup.

Recovery is an **action lock, not a thinking lock**:

- Decision Thinking may start/continue;
- a ready next plan may be buffered;
- Actor cannot start move/turn/windup Actions while recovering;
- damaging `hit` interrupts recovery and follows normal hit aftermath;
- `immune` does not interrupt recovery.

### SKILL-005 — zero windup instant batch — FROZEN

`windup_ticks = 0` resolves in the **same Tick in which the skill starts**, inside one bounded instant-resolve batch.

All same-Tick instant skills are collected before the batch is applied, preserving simultaneous outcomes.

`recovery_ticks = 0` means no additional recovery Tick, but it does not grant another same-Tick Action because of STATE-004.

## 9. Skill resolution, damage, protection, and interruption

### HIT-001 — four resolution outcomes — FROZEN

```text
hit
immune
miss
invalid
```

- `hit`: action/target valid, target is in current effect area, target not protected.
- `immune`: action/target valid, target is in current effect area, target protected.
- `miss`: skill resolved normally but target is now in coefficient 0/outside the matrix.
- `invalid`: Battle/action/target lifecycle makes normal resolution no longer valid, e.g. dead/missing target, cancelled action, ended Battle.

`miss` MUST NOT be collapsed into `invalid`.

### HIT-002 — protection interval — FROZEN

Protection is represented by `protectedUntilTickExclusive`.

```text
protected = currentTick < protectedUntilTickExclusive
```

If a hit at Tick 10 grants 3 full protection ticks:

```text
Tick 11,12,13 protected
protectedUntilTickExclusive = 14
Tick 14 normal
```

Protection expiration is derived from the interval; it does not require a business `protection_expire` event.

### HIT-003 — damaging-hit aftermath — FROZEN

After batch damage is applied, a surviving Actor that took actual damage:

- invalidates old multi-step plan;
- invalidates unfinished windup;
- interrupts recovery;
- invalidates old Decision generation;
- receives protection;
- gets exactly one new Decision Request.

The active atomic movement exception is governed by MOVE-006.

### HIT-004 — immune — FROZEN

`immune` causes:

- 0 damage;
- no interruption;
- no Decision invalidation;
- no protection refresh/extension.

### HIT-005 — protected Actor permissions — FROZEN

While protected:

- Decision Thinking may continue;
- movement from the accepted plan may continue when otherwise legal;
- a new skill windup MUST NOT start;
- an accepted attack intent may remain attached to the plan;
- when protection ends, Simulation rechecks the latest caster tile/direction, target tile, plan generation, and the same `minCoefficient` before allowing windup;
- having satisfied the threshold earlier does not create a future right to cast.

Protection therefore blocks skill start, not tactical thinking or movement.

### HIT-006 — protection state for simultaneous hits — FROZEN

For all attacks in one hit batch, protection eligibility is evaluated from the protection state at the start of that batch.

Protection newly granted by one hit in the batch does not retroactively make another same-batch hit immune. Simultaneous defeat is therefore possible.

**OPEN-HIT-001:** a `hit` whose coefficient calculation produces `finalDamage = 0` is allowed, but whether it triggers the same interruption/protection aftermath as positive damage must be explicitly frozen before implementation. Existing interruption text is intentionally limited to “actual damage”.

## 10. Tick reducer

### TICK-001 — processing order — FROZEN

For each `currentTick`:

1. Snapshot valid events with `dueTick === currentTick`.
2. Filter ended Battle, dead/invalid actors, stale action/decision generations; keep the active-step exception where applicable.
3. Commit due `move_complete` events and valid `recovery_complete` events.
4. Collect previously started skills whose `skill_resolve` is due now.
5. Resolve those skills from post-move committed position/direction and batch-start protection into `hit / immune / miss / invalid`.
6. Apply ordinary-batch hit damage simultaneously.
7. Run ordinary-batch terminal gate; if Battle continues, apply hit aftermath to surviving damaged Actors.
8. Accept Decision results usable this Tick using completion/deadline facts, not callback order.
9. Advance existing/new plans and produce at most one new Action intent per Actor.
10. Collect newly started `windup_ticks = 0` skills into one bounded instant-resolve batch.
11. Resolve/apply that instant batch using the same outcome, simultaneous-damage, terminal, and aftermath rules.
12. Arbitrate new movement reservations only for surviving/valid movement intents that remain valid after the instant batch.
13. Enqueue future `move_complete / skill_resolve / recovery_complete` events and publish authoritative snapshot/projection.

### TICK-002 — bounded current Tick — FROZEN

Facts created during the current reducer MUST NOT recursively re-enter earlier phases of the same Tick.

In particular, instant resolve, zero recovery, a new Decision, or hit interruption cannot loop back and start a second Action in the same Tick.

## 11. Result, termination, and control plane

### RESULT-001 — Battle results — FROZEN

Conceptual BattleResult includes:

```text
ally win
enemy win
simultaneous defeat
cancelled
failure
```

Death/terminal checks occur at the terminal gates in TICK-001.

### CTRL-001 — abort/cancel is immediate control plane — FROZEN

Frame abort, Battle cancel, or Subsystem exit is not an ordinary Tick event.

It immediately:

- invalidates Battle authority/epoch;
- prevents later rule submissions;
- stops scheduler progression;
- best-effort aborts LLM/resource work;
- allows Presentation cleanup/Frame completion.

Late promises/events cannot mutate an ended Battle.

## 12. Determinism and replay

### REPLAY-001 — required replay facts — FROZEN

Replay records at least:

- initial Battle/map/Actor configuration identifiers;
- `battleSeed`;
- accepted structured `PlanSubmission` and internal `acceptedPlanId`;
- Decision generation/start/completion/dueTick/timeout facts;
- movement reservation and contention outcomes;
- skill `hit / immune / miss / invalid` and resolve coefficient;
- damaging hits and protection intervals;
- BattleResult.

Replay does not call the LLM again.

### REPLAY-002 — diagnostics are non-authoritative — FROZEN

Development/simulation may record diagnostics such as:

```text
ticksSinceLastDamage
ticksSinceLastPositionChange
decisionCountWithoutProgress
collisionRetryCount
```

Diagnostics MUST NOT change gameplay unless a future rule explicitly promotes them.

## 13. Non-goals for v0

The following are explicitly outside v0:

- traditional alternating turns;
- RPGMap Runtime reuse;
- per-tile LLM calls;
- MP or a universal skill-resource system;
- classes/equipment/leveling;
- more than two combat Actors;
- complex status systems;
- ground targeting;
- AOE / second effect matrix;
- projectiles/ballistics;
- particle/shader/animation editor systems;
- exploration/transfer behavior;
- prompt optimization/evaluation as battle rules;
- cross-battle training memory/model fine-tuning.

## 14. Open decisions

The following are intentionally **OPEN** and must not be silently inferred:

- **OPEN-DIR-001**: direction update timing and whether explicit `turn` exists in v0.
- **OPEN-MOVE-001**: whether a lethally hit Actor completes an already-started atomic move.
- **OPEN-HIT-001**: whether a zero-damage `hit` triggers interruption/protection aftermath.
- **OPEN-LOS-001**: whether skill line-of-sight exists in v0. Current recommendation is no LOS, but it is not frozen.
- **OPEN-CLOCK-001**: freeze Battle clock vs continue/catch-up when host is paused/backgrounded.
- **OPEN-STALEMATE-001**: whether long no-progress battles eventually become a formal stalemate result.

Schema subject/version, Presentation effect details, Decision Adapter API, and Host integration questions are tracked in the Contracts/Integration docs rather than treated as core gameplay rules.
