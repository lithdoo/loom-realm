# Battle v0 Integration Guide

> Status: **Design-only integration guide**. This document describes how the Battle core integrates with LoomRealm resources, Presentation, Decision adapters, Host/Frame lifecycle, and workspace tooling.
>
> Gameplay semantics live only in [BATTLE_V0_SPEC.md](./BATTLE_V0_SPEC.md). Data shapes live in [BATTLE_V0_CONTRACTS.md](./BATTLE_V0_CONTRACTS.md).

## 1. Responsibility boundary

Battle has three runtime layers:

```text
Decision
  ↓ PlanSubmission
Simulation
  ↓ Snapshot / Events / RenderProjection
Presentation
```

The integration layer must preserve the following authority rules:

- Decision proposes intent; it does not mutate battle facts.
- Simulation validates, schedules, resolves, and owns BattleResult.
- Presentation renders projections only.
- Host/Frame owns lifecycle/authorization around the Battle subsystem.
- Shared Contracts carry data but own no state.

## 2. RPGMap resource compatibility

Battle deliberately reuses **resource/content form**, not RPGMap Runtime behavior.

### 2.1 Reused content/resource concepts

Battle may consume existing:

```text
struct.Map
struct.Tileset

resource.Graphics/Tilesets/...
resource.Graphics/Autotiles/...
resource.Graphics/Characters/...
```

Known existing conventions:

- map content carries a Tileset id, width, height, tile table data, and behavior data;
- tile size is 32×32;
- direction values are `2 / 4 / 6 / 8`;
- Character walk pattern values are `0 / 1 / 2 / 3`;
- Graphics resource identity follows `namespace + key + contentVersion`;
- standard namespace is `resource.Graphics`;
- Tileset key convention: `Tilesets/<tilesetName>`;
- Autotile key convention: `Autotiles/<name>`;
- Character key convention: `Characters/<characterName>`.

Battle should reuse the repository's actual shared types/readers rather than duplicate these contracts when implementation begins.

### 2.2 Character atlas compatibility

Existing Character images are treated as a 4×4 atlas:

```text
frameWidth  = image.width  / 4
frameHeight = image.height / 4

sourceX = pattern * frameWidth
sourceY = ((direction - 2) / 2) * frameHeight
```

Character frames may be larger than one 32×32 tile; Presentation should bottom-center the visible character on its authoritative tile.

### 2.3 Tileset/autotile compatibility

Ordinary Tileset tiles use the existing 32×32 layout (8 tiles per row in the current format). Existing Autotile block/cell layouts should be consumed as-is.

These layout facts are Presentation/resource concerns. They MUST NOT define Battle movement or timing semantics.

### 2.4 Runtime behavior explicitly not reused

Battle MUST NOT call or delegate battle authority to:

- `RPGMapBuilder`;
- `RPGMapHandler`;
- RPGMap movement/timer state;
- RPGMap Transfer/Bridge/exploration runtime behavior;
- RPGMap Browser movement completion as a rules ACK.

Existing `lr-map-view` / `lr-map-sprite` concepts are RPGMap Browser/runtime details and are not Battle authority.

If future Battle gameplay needs exploration semantics, they must be introduced explicitly into Simulation rather than inherited accidentally.

## 3. Presentation integration

Presentation is display-only.

Its responsibilities include:

- Map/Tileset/Autotile rendering;
- Character Sprite selection and animation;
- interpolation for authoritative A→B steps;
- skill/effect rendering;
- camera follow/focus/zoom;
- viewport/layout;
- resource load/dispose lifecycle.

### 3.1 Position projection

During an active move step:

```text
Simulation committed tile = origin
Presentation screen position = interpolated origin→destination
```

Presentation MUST NOT reverse-sync the interpolated position into Simulation.

### 3.2 Presentation diagnostics

Presentation may emit diagnostics such as:

```text
animationFinished
assetFailed
viewportChanged
```

These are not battle-rule acknowledgements.

Simulation MUST NOT wait for animation completion before committing movement, damage, death, or BattleResult.

### 3.3 Camera

Camera state is Presentation-owned.

Simulation does not own `cameraX / cameraY / zoom`.

**INTEGRATION-OPEN-001:** whether RenderProjection may include a non-authoritative `focusHint` is not frozen.

## 4. BattleEffect presentation

BattleEffect is a Presentation-only Content concept.

Current minimal direction:

- one Graphics reference;
- one anchor concept;
- simple fade-in / hold / fade-out timeline;
- no particle/shader/projectile/animation-editor system in v0.

Current Graphics convention:

```text
resource.Graphics/BattleEffects/<EffectName>
```

Simulation emits only authoritative effect identity/result/anchor facts; Presentation owns visual lifetime.

Conceptual projection:

```json
{
  "effectId": "effect-00012",
  "sceneEpoch": 1,
  "result": "hit",
  "effect": "firebolt",
  "tile": { "x": 4, "y": 3 },
  "startTick": 120
}
```

**INTEGRATION-OPEN-002:** exact BattleEffect v1 anchor/timing schema, whether `immune` adds a separate immunity visual, and what `miss` displays are not frozen.

## 5. Decision implementations

Decision is replaceable. Expected implementations include:

```text
MockDecision
ScriptDecision
ManualDecision
RandomDecision
LLMDecision
```

Simulation must be testable and able to complete a battle without Browser or a real LLM.

## 6. LLM Decision Adapter

The repository's public subsystem surface does not currently establish the final Battle LLM service contract. The adapter must eventually solve:

- host location for LLM calls;
- authorization/credentials;
- cancellation/AbortSignal;
- trusted completion timestamp;
- deadline;
- service/network error metadata;
- structured output validation and one allowed correction retry.

Browser code should not hold secret model credentials.

### 6.1 Completion time

The adapter must provide a trustworthy actual completion time so Simulation can obey `DEC-001`.

Example:

```text
model completed at 480 ms
host callback handled at 700 ms
→ Battle timing should use the trusted 480 ms completion fact
```

Do not measure “thinking time” only from when the JavaScript callback happens to run.

### 6.2 Model/service differences

Different model/network latencies may need product-level limits or deadlines. Those are integration/product decisions; they must not alter the deterministic mapping rule in the core spec.

**INTEGRATION-OPEN-003:** final Decision Adapter interface, error enum, cancellation guarantees, model limits, and deadline defaults are not frozen.

## 7. Player Guidance

Future player input acts like a trainer hint for the **next own-side Decision Observation**.

Guidance:

- enters through an authorized Host/InputTarget path;
- becomes temporary Decision context;
- does not directly mutate HP, position, protection, or damage;
- does not pause the opponent timeline;
- does not guarantee that the model follows it.

The current product direction is a four-choice set of preconfigured guidance cards. v0 may use fixed guidance or omit guidance while the core loop is implemented.

**INTEGRATION-OPEN-004:** exact InputTarget/Host wiring and Guidance contract are not frozen.

## 8. Frame, abort, and subsystem lifecycle

A Battle runs inside the LoomRealm subsystem/frame lifecycle.

Frame abort / Battle cancel follows `CTRL-001`:

```text
abort/cancel
→ immediately invalidate battle authority/epoch
→ stop scheduler
→ best-effort cancel LLM/resource work
→ clear Presentation
→ finish Frame cleanup
```

It is not delayed to the next 200 ms Tick.

All late decisions/events must fail generation/epoch validation.

## 9. Pause/background behavior

The sequential catch-up rule is frozen, but product pause behavior is not.

**INTEGRATION-OPEN-005 / OPEN-CLOCK-001:** when the host is backgrounded or explicitly paused, choose one policy:

- freeze the Battle monotonic clock; or
- let Battle time continue and process every overdue Tick sequentially on resume.

If time continues, different dueTicks MUST NOT be collapsed.

Current product preference may favor freezing on explicit pause, but this is not normative yet.

## 10. LOS and map behavior

Map passability currently controls movement only.

**OPEN-LOS-001:** whether walls block skills is not frozen. The current recommendation is **no LOS in v0**:

- do not infer `unwalkable = blocks skill`;
- range matrix alone decides positional skill reach;
- add explicit LOS later only if a concrete mechanic needs it.

Until frozen, implementation must not silently add path/terrain LOS.

## 11. Stalemate diagnostics

v0 does not currently enforce a maximum Battle duration.

Use non-authoritative diagnostics:

```text
ticksSinceLastDamage
ticksSinceLastPositionChange
decisionCountWithoutProgress
collisionRetryCount
```

**OPEN-STALEMATE-001:** only add a formal `stalemate` result after simulations show a real need.

## 12. Workspace/build status

Battle remains design-only.

Current known engineering item:

- root `package.json` recognizes `game-libs/*`;
- Battle was introduced without a corresponding verified root `package-lock.json` synchronization;
- `npm ci`, build, unit tests, and Browser E2E still require verification once Runtime code is added.

Documentation changes must not be described as build/test success.

## 13. Recommended implementation sequence

Use this order to keep rule authority testable:

```text
1. Finalize BattleActor / BattleSkill / BattleEffect v1 serialization schemas
2. Finalize BattleObservation / PlanConstraints / PlanSubmission / PlanAcceptance contracts
3. Implement Content validation
4. Implement headless Simulation reducer + scheduler + event queue
5. Drive it with Mock/Script Decision
6. Cover deterministic rule matrix (coefficient, instant batch, rejection/retry, collision, protection, simultaneous defeat)
7. Implement RenderProjection + Presentation
8. Add real LLM Decision Adapter
9. Add Guidance / Host integration
10. Run package-lock, npm ci, unit, and Browser E2E verification
```

Do not make real LLM integration a prerequisite for validating Simulation.

## 14. Integration open items

- **INTEGRATION-OPEN-001** camera focus hint contract.
- **INTEGRATION-OPEN-002** BattleEffect visual schema/outcome presentation.
- **INTEGRATION-OPEN-003** Decision Adapter API/timing/error/cancel defaults.
- **INTEGRATION-OPEN-004** player Guidance Host/InputTarget wiring.
- **INTEGRATION-OPEN-005** pause/background policy.
- **OPEN-LOS-001** LOS policy.
- **OPEN-STALEMATE-001** formal stalemate policy.
- package-lock/build verification when implementation begins.
