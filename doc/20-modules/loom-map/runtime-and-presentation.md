# RPGMap runtime / data / presentation reference

> Current realization reference for `game-libs/map`. Formal Terrain semantics remain owned by [`TERRAIN_BEHAVIOR_CONTRACT_V1.md`](../../../game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_V1.md); framework Render/Input/Content semantics remain owned by `doc/15-contracts`. This page preserves map-local durable invariants that would otherwise be lost with retired implementation drafts.

## Data model

Current Runtime consumes prepared logical records, not RMXP/RGSS objects directly.

```text
struct.Map/<mapId>
  tileset_id
  width / height
  three-layer projected Table
  behaviors[]        # narrow map-local behaviors such as Bridge on/off

struct.Tileset/<tilesetId>
  id
  tileset_name
  autotile_names[7]
  passages
  priorities
  terrain_tags

struct.MapTransfer/<mapId>
  id
  steps[]
  contacts[]
  edges[]

struct.NPC/<npcId>   # when static NPCs are used
  name
  sprite
```

The importer owns source-specific RMXP/PBS interpretation. Runtime consumes these already projected facts and never executes original Ruby.

## Authority and transaction boundary

The map Runtime owns current map identity, Player tile coordinates/direction, motion, scene/visual epochs, Bridge level, static NPC placements and map-local event scheduling. Browser presentation is not an authority.

Scene entry follows prepare-before-commit semantics:

```text
validate target entry
→ read/validate Map + MapTransfer + Tileset
→ validate projectability and logical resources
→ obtain business NPC candidate
→ validate/load NPC definitions/resources
→ build complete authoritative render candidate
→ deterministic pre-commit checks
→ one authoritative RenderDomain commit
→ publish committed map/snapshot
→ notify mapEntered
```

A preparation failure before the authoritative Domain commit does not partially install the candidate scene. Once a synchronous Domain mutation fails and no rollback guarantee exists, the Runtime is fail-stop and converges through `MAP_COMMIT_FAILED` rather than continuing with uncertain authority.

Frame cancellation, scene replacement and terminal state invalidate late async work. A stale completion cannot commit into a newer scene or a closed Domain.

## Movement and transfer ordering

One direction attempt has one map-local outcome: blocked, ordinary walk, Ledge jump, or transfer according to the current projected rules.

Important ordering invariants:

1. If the Runtime/scene is not in a state that accepts movement, the attempt does not create a parallel mutation path.
2. A current-cell + attempted-direction **Contact Transfer** has precedence over walking into the forward cell.
3. Otherwise Runtime plans terrain movement (`blocked | walk | jump`).
4. For a legal movement, static NPC collision is checked at the actual final destination. A two-cell Ledge jump does not treat the skipped middle cell as an ordinary arrival.
5. After successful ordinary/jump arrival, **Step Transfer** is considered before Bridge arrival behavior.
6. An attempted move beyond the map boundary may use a projected **Edge Transfer**; absence of such a rule remains blocked.
7. A target map is prepared before current-map authority is swapped. Transfer does not recreate the enclosing Frame or create a second Runtime.

Ordinary walk duration is 250ms. The formal v1 Ledge slice is one two-cell jump / one motion identity; current original-Essentials qualification established 500ms and a 24px presentation peak for the supported Map47 case.

## Terrain / Bridge

`terrain_tags` retain the projected source values. The formal v1 supported Terrain slice is Neutral(13), Bridge(15), Ledge(1); other tags are not silently interpreted as one of these semantics.

`resolveEffectiveTerrainTag` and passability are separate operations. Bridge level is Runtime authority with legal current values `0` or `2`. Bridge state changes converge the relevant terrain depth, Player/NPC presentation and camera projection through the same authoritative RenderDomain stream; Browser z-index is not a substitute for Bridge business state.

Exact supported original behavior and intentional scope differences are frozen in the Terrain Behavior Contract v1.

## Autotile and regular-tile presentation

The importer/runtime preserves the seven RMXP autotile slots. Current presentation supports the established RMXP 48-variant structural projection and the source bitmap layouts required by the supported Essentials corpus:

- standard block layout: 96×128 per animation frame, composed from 16×16 quarters;
- single-cell layout: 32px-high horizontal 32×32 frames, used by assets such as the qualified Flowers-style cell autotiles;
- browser presentation selects animation frames; the map Runtime does not turn presentation animation phase into business state.

Current autotile presentation cadence is 250ms. Animation reuses the Browser paint loop rather than introducing a second gameplay timer/authority. A new RenderData value does not redefine the logical map just because presentation time advances.

Malformed or unsupported presentation resources fail/clear presentation according to the Browser boundary; they do not retroactively rewrite a committed Runtime scene.

## Layering / depth

Tile depth derives from map row + Tileset priority; Player/NPC visual depth derives from character foot position and the current character frame geometry. The durable observable rule is:

```text
tile depth < character depth  → tile behind character
tile depth > character depth  → tile in front of character
tile depth = character depth  → character in front of tile
```

This ordering is part of the Map presentation behavior and must not depend accidentally on DOM creation order. Terrain/Bridge depth and character depth remain consistent with the current Renderer payload and Browser compositor.

## RenderDomain topology / node identity

The map RenderDomain uses one `viewport` View root, one `player` child and zero or more static NPC sprite children.

Business `NPCPlacement.instanceId` is not a RenderNode key. Internal NPC render keys are private, short-lived implementation identities constrained by RenderDomain node lifetime. A removed node key must not be resurrected in the same Domain. Surviving NPC instances may retain their current render key across a same-scene replacement; removed/re-added or new-scene instances receive fresh internal keys.

Topology changes such as map replacement or NPC-set membership changes use a complete authoritative candidate/`replace` path. Fixed-topology movement, Bridge, camera and resize changes can use existing-node `update`. This distinction preserves the framework rule that `update` mutates existing nodes rather than creating/removing topology.

Candidate state must satisfy current RenderDomain/Data hard limits before a predictable failing authoritative commit is attempted. Numeric framework limits are owned by the framework implementation/contracts; the game library must not bypass them by truncating NPCs/tiles or splitting one logical commit into hidden partial truth.

## Browser currentness and resource lifetime

`lr-map-view` and `lr-map-sprite` are presentation consumers only. Their key currentness properties are:

- requested resources for one paint candidate are prepared before that candidate is painted;
- async decode/completion re-checks current scene/visual identity before touching the current presentation;
- stale success cannot overwrite a newer map/scene;
- stale failure cannot clear a newer successful presentation;
- Player motion and camera interpolation are presentation of current Runtime motion facts, not an independent gameplay position;
- resize and late animation/motion callbacks cannot write business authority back into Runtime;
- resources no longer owned by current presentation are released according to the current Browser resource-owner implementation.

`mapEntered` and Browser-visible-pixel success are deliberately separate evidence. Product/browser tests are required for actual visible compositing.

## Provenance retained outside Current docs

The large historical layering/autotile/transfer/walking implementation drafts contained useful source investigation and rollout instructions, but their file whitelists, Agent STOP rules, milestone gates and temporary baseline exceptions are not Current product semantics. Git preserves those drafts.

Two separate real-corpus investigations contain irreplaceable source identity and corpus facts and are intentionally retained under [`doc/history/evidence/map`](../../history/evidence/map/README.md).