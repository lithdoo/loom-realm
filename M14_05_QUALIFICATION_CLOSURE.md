# M14 / 05 — Qualification Closure

> 状态：Implementation Landing / M14 Pending

## Closure target

M14 canonical CI gate：

```text
npm run test:m14
```

M14 `Closed` requires both：

```text
1. npm run test:m14
   → Node 20 / 24 CI green

2. npm run test:m14:essentials-local -- --source <path> --map-id <id> --x <x> --y <y> --character-name <name>
   → one recorded exact Essentials v21.1 compatibility qualification
   → performed against the same closure revision
```

The local command is not a GitHub Actions dependency. Third-party corpus stays local/ignored and is never committed or uploaded as an artifact.

Closure record binds：

```text
repository commit SHA
canonical CI result
exact-v21.1 source identity/fingerprint
selected local map/spawn/character
consumer projection result
semantic/runtime/browser result
```

## 1. Required root scripts

M14 implementation must add at least：

```text
test:m14
test:m14:pack
test:m14:essentials-local
```

`test:m14` MUST include：

```text
npm run test:m13
workspace/package boundary checks
M14 consumer-projection tests
game-lib unit/semantic tests
concrete game.json parse/validation/startup test
prepared Content assembly test
real Chromium M14 vertical
npm run test:m14:pack
```

`test:m14:pack` MUST prove `@loomrealm-game/map` package contents include both runtime output and：

```text
dist/browser/map.browser.js
dist/browser/map.css
```

`examples/essentials-v21.1` remains private and is not a publishable package.

## 2. Workspace / dependency boundary

Automated checks must prove：

```text
root workspaces include game-libs/* + examples/*
packages/* do not depend on game-libs/* or examples/*
@loomrealm-game/map runtime imports only public author-facing LoomRealm APIs
map Runtime does not import renderer/main/platform/tooling/DOM
example Runtime does not import tools/fixtures
example package is private
```

Do not build a generic workspace orchestrator for this gate.

## 3. Consumer projection gate

Tests under the Essentials fixture must prove the exact mechanical rules in `M14_CONSUMER_PROJECTION.md`：

```text
known @ivar spelling projection
primitive safe/fail-closed rules
string/symbol/array/hash projection
RGSS Table shape
Table index(x,y,z)=x+y*xSize+z*xSize*ySize
Table values.length invariant
Color/Tone finite-number projection when required
Map.events embedded decimal keys
no kind/className/rubyObjectId/$id/$ref/$typed consumer metadata
```

At least one non-zero `(x,y,z)` Table case must prove axis/serialized ordering.

Source-container extraction tests MUST additionally prove：

```text
MapNNN.rxdata RPG::Map root
→ Map/{decimal N}

Tilesets.rxdata array entry i
→ Tileset/{i}
→ projected object id must equal i for materialized non-null entries

MapInfos.rxdata integer-key Hash entry k
→ MapInfo/{k} when MapInfo is materialized
```

Required ambiguity/mismatch fails closed; it must not be repaired by a Runtime adapter.

## 4. Exact Game Entry gate

Canonical CI reads checked-in：

```text
examples/essentials-v21.1/game.json
```

and proves through existing Game Package APIs：

```text
formatVersion=1
exact subsystem list contains "map"
initial target="map"
initial input = {
  mapId:1,
  x:10,
  y:8,
  characterName:"m14_player"
}
```

Only after validation may the M14 harness bind logical `map` to the concrete Definition.

No Hostra/PWA launch manifest is fabricated for M14.

## 5. Gameplay Frame lifetime gate

The map Definition must prove a real long-lived gameplay Frame：

```text
Frame becomes active
→ Map/Tileset/resource load completes
→ InputListener created for that Frame
→ initial Render visible
→ Frame handler remains pending
→ first input delivered
→ second input delivered
```

A Frame that returns/completes before movement input fails M14.

Teardown after observations must cleanly close listener/Runtime. Qualification must not invent implicit Frame-owned RenderDomain teardown because M11 explicitly keeps those lifetimes independent.

## 6. RenderDomain topology gate

M14 owns exactly one current business RenderDomain for the map first slice.

The SDK-assigned wire domain id is **opaque**：

```text
MUST NOT assert "map.main"
MUST NOT require a particular d1/d2/... spelling
MUST NOT reopen createRenderDomain(initialState) to accept an author id
```

Qualification identifies the Domain by：

```text
current subsystemKey="map"
+
exact viewport/player Render tree
```

No visual-only tile/layer/entity Domain may be added.

## 7. Frozen CI fixture gate

The repository-owned semantic fixture from M14/03 is normative for canonical movement evidence：

```text
Map/1 width=24 height=18 tileset_id=1
spawn=(10,8)
z0 regular tile 384 except (12,8)=385
z1/z2 tile 0

Tileset/1
passages[384]=0x00, priorities[384]=0
passages[385]=0x02, priorities[385]=0
```

Tests must inspect these persisted facts. Forbidden fixture shortcuts：

```text
isBlocked
walkable
collision bitmap generated only for the test
hard-coded "x==12 means blocked"
```

## 8. Exact RMXP passability gate

Unit + vertical tests must prove M14/02 first-slice algorithm：

```text
d=2 → 0x01
d=4 → 0x02
d=6 → 0x04
d=8 → 0x08

map coordinate evaluation scans z=2,1,0
passage direction bit blocks
0x0f blocks all directions
priority==0 establishes passability
movement checks source direction and target reverse direction
out-of-bounds target blocks
```

Canonical movement sequence is exact：

```text
start (10,8), facing down

ArrowRight down repeat=false
→ (11,8), facing right

ArrowRight down repeat=false
→ blocked by tile 385 left-entry bit 0x02
→ remains (11,8), facing right
```

`keyup`, `repeat=true`, timer-driven movement and keyboard.state polling are not accepted substitutes.

Event collision, through/debug semantics, terrain tags and map transitions are explicit M14 nonclaims.

## 9. Fixed viewport / camera gate

Chromium computed style MUST show：

```text
lr-map-view = 640px × 480px
```

Logical invariants：

```text
tileSize=32
viewport=640×480
nominal grid=20×15
```

Runtime must not read DOM dimensions and there must be no DOM→Runtime resize/layout feedback path.

Expected camera facts：

```text
player (10,8) → cameraX=16, cameraY=32
player (11,8) → cameraX=48, cameraY=32
blocked second right → camera remains 48,32
```

A different `devicePixelRatio` may change private Canvas backing-store size only; logical coordinates remain unchanged.

## 10. Tile rendering gate

Canonical browser vertical must prove persisted tile identity controls actual pixels：

```text
Map.data
→ frozen Table lookup
→ regular tileId
→ Tileset resource
→ source rectangle
→ private Canvas
```

Regular tile mapping is exact：

```text
tileId=0 → transparent
for tileId>=384:
    sx=((tileId-384)%8)*32
    sy=floor((tileId-384)/8)*32
    sw=32
    sh=32
```

The author-owned tileset image must make tile 384 and 385 visually distinguishable and the test must prove the expected source cell is used.

Canonical CI visible area uses no required autotile (`48..383`) and no priority-over-player visual. Encountering an unsupported required tile kind fails instead of being silently approximated.

## 11. Resource gate

At least both first-slice visible resources are qualified：

```text
Graphics / Tilesets/m14_tileset
Graphics / Characters/m14_player
```

For each：

```text
Runtime ContentClient.resource()
→ bytes + mime + contentVersion
→ Render carries namespace/key/contentVersion only
→ PresentationResourceClient reads browser bytes
→ actual qualified pixels use those bytes
```

Render state MUST NOT contain raw bytes, URL, path, bearer or privileged physical identity.

No resource metadata/HEAD API is added for M14.

## 12. Exact Render data gate

Runtime/browser must use the package-private shapes frozen in M14/02, not an open-ended “at least these fields” agreement.

`lr-map-view` data exact members：

```text
mapId
mapWidth
mapHeight
cameraX
cameraY
tileset { namespace,key,contentVersion }
tiles[] { x,y,z,tileId }
```

`lr-map-sprite` data exact members：

```text
x
y
screenX
screenY
direction
pattern=0
sprite { namespace,key,contentVersion }
```

No raw RMXP/importer object is allowed in either data object.

## 13. Web Component / DOM identity gate

M14 required tags are exactly：

```text
lr-map-view
lr-map-sprite
```

Real Chromium must observe M13-managed light DOM：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

Required observations：

```text
lr-map-view has private Shadow DOM tile Canvas + entity slot/overlay
player remains light-DOM child
no lr-map-tile/lr-map-layer/lr-map-camera dependency
same lr-map-view HTMLElement survives movement updates
same lr-map-sprite HTMLElement survives movement updates
first right move visibly moves the player
blocked second right does not move/recreate the player
```

The player resource crop must come from the real 4×4 fixture sheet with `pattern=0` and row selected from direction.

## 14. CSS / presentation bootstrap gate

Prepared Content identities/order：

```text
styles:
    Presentation / map/map.css
    Presentation / essentials/page.css
scripts:
    Presentation / map/map.browser.js
```

The page CSS fixes `lr-map-view` to 640×480 and owns page centering/margin/scroll policy. Map CSS owns component/private presentation.

The JS resource must execute as a classic script：

```text
no import/export at execution time
no browser runtime ESM graph
native customElements.define("lr-map-view", ...)
native customElements.define("lr-map-sprite", ...)
```

Qualification may not direct-import browser source, define the tags in test code, or inject replacement CSS.

## 15. Physical-input milestone boundary

M14 canonical vertical uses existing/synthetic `RendererInputSource` to prove M10 semantics.

Real Desktop DOM Keyboard/Pointer/Gamepad mapping is **M15**, not M14：

```text
M14
→ logical Input vertical with existing/synthetic source

M15
→ BrowserWindow physical events
→ real RendererInputSource realization
→ same M10 gate
→ same M14 map gameplay logic
```

Any earlier future-looking milestone note that said “M14 Desktop DOM mapping” is superseded by this implemented milestone partition; no core M10 API changes are implied.

## 16. Exact local-v21.1 command

Required invocation：

```text
npm run test:m14:essentials-local -- \
  --source <local-source-or-archive> \
  --map-id <positive-int> \
  --x <non-negative-int> \
  --y <non-negative-int> \
  --character-name <semantic-name>
```

The command may create only ignored local working data under：

```text
.local/m14-essentials/
```

It must：

```text
run existing importer/acquisition path
materialize M14 consumer Map/Tileset records
assemble same map browser/page artifacts
run same map Runtime/browser implementation
record source fingerprint + selected slice + semantic/presentation outcome
```

It does not need to re-prove repository `game.json` parsing; canonical CI owns that evidence.

If the selected exact-corpus slice requires autotiles/priority-over-player semantics absent from M14, qualification fails with an explicit unsupported-first-slice reason. Closure then requires the smallest real implementation addition or another semantically meaningful supported slice; it may not substitute a fake local map.

## 17. Closure record

At actual closure create/update：

```text
doc/30-implementation/m14-qualification.md
```

Record only：

```text
closure commit SHA
Node 20/24 canonical run/result
exact-v21.1 source version + fingerprint
local selection mapId/x/y/characterName
consumer projection summary
record/resource counts relevant to selected slice
passable/blocked movement results
visible tile/resource result
WC/DOM result
final pass/fail
```

Never record third-party asset bytes.

## 18. Reopen policy

M14 may reopen M10–M13 only for：

```text
demonstrated correctness/security contradiction
required author capability genuinely absent
real exact-consumer behavior impossible through frozen seam
measurable workload failure
```

Do not reopen for API symmetry, prettier domain ids, resource-read duplication, responsive-layout speculation, ESM loader preference or hypothetical future game engines.

## Explicit nonclaims

M14 Closed does not claim：

```text
full Pokémon Essentials gameplay
all RMXP maps render
RMXP autotile completeness
priority-over-player rendering completeness
event collision/interpreter completeness
map transitions
responsive viewport
animation/game Tick API
Desktop Node child / BrowserWindow physical E2E
PWA Runtime/equivalence
universal map schema
public map presentation SDK
```

Those require later real consumer evidence or M15–M17.
