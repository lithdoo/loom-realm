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
   → same closure revision
```

The local command is not a GitHub Actions dependency. Third-party corpus stays local/ignored and is never committed or uploaded as an artifact.

Closure record binds repository commit SHA, canonical CI result, exact-v21.1 source identity/fingerprint, selected local slice, consumer projection result and semantic/runtime/browser result.

## 1. Required root scripts

M14 implementation must add：

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
game-lib semantic/unit tests
concrete game.json + presentation.json validation tests
prepared Content assembly test
real Chromium M14 vertical
npm run test:m14:pack
```

`test:m14:pack` proves both package resolution and tarball contents：

```text
import("@loomrealm-game/map")
    → Runtime root, default map SubsystemDefinitionFactory

resolve @loomrealm-game/map/browser/map.browser.js
    → packaged dist/browser/map.browser.js

resolve @loomrealm-game/map/browser/map.css
    → packaged dist/browser/map.css

npm pack --dry-run
    → includes Runtime output + both browser artifact files
```

The pack test MUST NOT execute the browser JS in Node; actual execution belongs to Chromium/M13 classic-script bootstrap.

The concrete example remains private and is not a publishable product package.

## 2. Workspace / dependency boundary

Automated checks prove：

```text
root workspaces include game-libs/* + examples/*
packages/* do not depend on game-libs/* or examples/*
@loomrealm-game/map Runtime imports only public author-facing LoomRealm APIs
map Runtime does not import renderer/main/platform/tooling/DOM
browser source does not become a Runtime dependency
example Runtime does not import tools/fixtures
example package is private
prepared Content assembly resolves browser files through package subpaths, not node_modules/dist/source reach-through
```

No generic workspace orchestrator is required.

## 3. Consumer projection / extraction gate

Tests under Essentials fixture prove exact `M14_CONSUMER_PROJECTION.md` mechanics：

```text
known @ivar spelling projection
primitive safe/fail-closed rules
string/symbol/array/hash projection
RGSS Table object shape
Table index(x,y,z)=x+y*xSize+z*xSize*ySize
Table values.length invariant
Color/Tone finite-number projection when required
Map.events embedded decimal keys
no kind/className/rubyObjectId/$id/$ref/$typed metadata
```

At least one non-zero `(x,y,z)` case proves flattened ordering.

Source extraction proves：

```text
MapNNN.rxdata RPG::Map root → Map/{decimal N}
Tilesets.rxdata[i] → Tileset/{i}, projected id == i
MapInfos.rxdata[k] → MapInfo/{k} when materialized
```

Ambiguity/mismatch fails closed; Runtime adapters may not repair it.

## 4. Exact Game Entry / presentation files gate

Canonical CI reads checked-in：

```text
examples/essentials-v21.1/game.json
examples/essentials-v21.1/presentation.json
examples/essentials-v21.1/presentation.css
```

`game.json` must validate to：

```text
formatVersion=1
subsystems=[{key:"map"}]
initial.subsystem="map"
initial.input={mapId:1,x:10,y:8,characterName:"m14_player"}
```

Only after validation may the harness bind logical `map` to the map Definition.

`presentation.json` must validate through existing M13 APIs with exactly：

```text
styles
    Presentation / map/map.css
    Presentation / essentials/page.css
scripts
    Presentation / map/map.browser.js
```

The test may not replace either checked-in JSON document with an inline alternate candidate.

## 5. Gameplay Frame lifetime gate

The map Definition proves：

```text
Frame active
→ Map/Tileset/resource load
→ Frame-bound InputListener current
→ initial Render visible
→ frame handler still pending
→ first input delivered
→ second input delivered
```

Returning/completing before movement input fails M14. Teardown closes listener/Runtime through existing lifecycle; no implicit Frame-owned RenderDomain destruction is introduced.

## 6. RenderDomain topology gate

Exactly one current map business RenderDomain is allowed. Its SDK-assigned wire ID is opaque：

```text
MUST NOT assert "map.main"
MUST NOT assert d1/d2/... spelling
MUST NOT reopen createRenderDomain(initialState)
```

Locate it by `subsystemKey="map"` plus exact tree：

```text
zIndex=0
root key="viewport" tag="lr-map-view"
└── key="player" tag="lr-map-sprite"
```

No visual-only tile/layer/entity Domain.

## 7. Exact projected Table gate

Runtime tests prove the first-slice record validators：

```text
Map.data
    dimensions=3
    xSize=Map.width
    ySize=Map.height
    zSize=3
    values.length=width*height*3

Tileset.passages / priorities
    dimensions=1
    ySize=1
    zSize=1
    values.length=xSize
    xSize covers every inspected tileId
```

Runtime lookup MUST use the frozen object representation through equivalent `tableAt(table,x,y=0,z=0)` behavior. Direct assumptions such as `Map.data[z][y][x]` or treating projected Table objects as arrays fail qualification.

Canonical proof includes：

```text
tableAt(Map.data,12,8,0) == 385
```

using the real flattened `values` array.

## 8. Frozen CI fixture gate

Canonical repository-owned facts：

```text
Map/1 width=24 height=18 tileset_id=1
z0 tile 384 in tested/visible area except (12,8)=385
z1/z2 tile 0

Tileset/1 id=1 tileset_name="m14_tileset"
tableAt(passages,384)=0x00
tableAt(priorities,384)=0
tableAt(passages,385)=0x02
tableAt(priorities,385)=0
```

Forbidden fixture shortcuts：

```text
isBlocked / walkable
precomputed test-only collision bitmap
hard-coded coordinate blocking
nested fake tile arrays that bypass projected Table
```

Author-owned resources are exact：

```text
Graphics / Tilesets/m14_tileset
    image/png, 256×32
    tile 384 and 385 source cells distinguishable

Graphics / Characters/m14_player
    image/png, 128×128
    4×4, 32×32 frames
    direction rows distinguishable
```

No third-party Essentials bytes in CI/repository artifacts.

## 9. Exact RMXP passability / input gate

Unit + vertical tests prove：

```text
d=2 → 0x01
d=4 → 0x02
d=6 → 0x04
d=8 → 0x08
coordinate evaluation scans z=2,1,0
direction bit blocks
0x0f blocks all directions
priority==0 establishes passability
movement checks source direction + target reverse direction
out-of-bounds target blocks
```

Canonical input sequence：

```text
start (10,8), facing down
ArrowRight down repeat=false
→ (11,8), facing right

ArrowRight down repeat=false
→ target tile 385 left-entry bit 0x02 blocks
→ remains (11,8), facing right
```

`keyup`, `repeat=true`, timer-driven movement and keyboard.state polling are not accepted substitutes.

Event collision, through/debug semantics, terrain tags and map transitions are explicit nonclaims.

## 10. Fixed viewport / camera / Chromium gate

Logical/presentation invariants：

```text
tileSize=32
lr-map-view=640×480 CSS px
nominal grid=20×15
no DOM→Runtime layout feedback
```

Canonical CI page is created with：

```text
viewport = 800×600 CSS px
deviceScaleFactor = 1
```

This is a qualification-harness condition only, not a runtime API.

Computed style must show `lr-map-view` exactly 640×480. Expected Runtime camera：

```text
(10,8) → cameraX=16,cameraY=32
(11,8) → cameraX=48,cameraY=32
blocked second right → remains 48,32
```

Runtime must not query DOM dimensions. HiDPI support outside canonical CI may change private Canvas backing-store pixels only.

## 11. Tile rendering gate

Canonical browser vertical proves：

```text
tableAt(Map.data,...)
→ regular tileId
→ Tileset resource/version
→ PresentationResourceClient bytes
→ decoded PNG source rectangle
→ private Canvas destination from camera
→ expected pixels
```

Exact regular mapping：

```text
tileId=0 → transparent
for tileId>=384:
    sx=((tileId-384)%8)*32
    sy=floor((tileId-384)/8)*32
    sw=32
    sh=32
```

Tile 384 and 385 must visibly resolve to their distinct author-owned source cells. Canonical CI requires no autotile and no priority-over-player visual. Unsupported required tile kinds fail instead of being approximated.

## 12. Resource gate

Both visible resources are qualified：

```text
Graphics / Tilesets/m14_tileset
Graphics / Characters/m14_player
```

For each：

```text
Runtime ContentClient.resource()
→ bytes + mime + contentVersion
→ Render carries namespace/key/contentVersion only
→ PresentationResourceClient(namespace,key,expectedContentVersion)
→ browser bytes
→ actual visible pixels use those bytes
```

No bytes/path/URL/bearer enters Render data. No metadata/HEAD API is added.

Async WC resource work must ignore stale completion if its resource ref/version is no longer current; no fallback fake pixels are allowed.

## 13. Exact Render-data gate

`lr-map-view.data` exact members：

```text
mapId
mapWidth
mapHeight
cameraX
cameraY
tileset {namespace,key,contentVersion}
tiles[] {x,y,z,tileId}
```

`lr-map-sprite.data` exact members：

```text
x
y
screenX
screenY
direction
pattern=0
sprite {namespace,key,contentVersion}
```

No raw RMXP/importer object or extra physical resource fact is allowed.

## 14. Web Component / DOM identity gate

Required tags：

```text
lr-map-view
lr-map-sprite
```

Chromium observes M13-managed light DOM：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

Required observations：

```text
lr-map-view owns private Shadow DOM tile Canvas + entity slot/overlay
player remains light-DOM child
no lr-map-tile/lr-map-layer/lr-map-camera dependency
same lr-map-view HTMLElement survives movement
same lr-map-sprite HTMLElement survives movement
first right move visibly moves player
blocked second right does not move/recreate player
```

Player crop uses real 4×4 PNG. General frame placement follows bottom-center anchoring from M14/04.

## 15. CSS / classic browser artifact gate

Prepared Content assembly resolves source artifacts only through：

```text
@loomrealm-game/map/browser/map.css
@loomrealm-game/map/browser/map.browser.js
```

and materializes them under the logical Config refs from checked-in `presentation.json`：

```text
Presentation / map/map.css
Presentation / map/map.browser.js
```

Page CSS comes from the concrete example as `Presentation / essentials/page.css`.

The map JS must execute as classic script, contain no execution-time import/export graph, and register `lr-map-view` + `lr-map-sprite` through native `customElements.define()`.

Qualification may not direct-import browser source, manually define tags, inject replacement CSS, or reach through package-private `dist/`/source paths.

## 16. Physical-input / process milestone boundary

M14 uses existing/synthetic `RendererInputSource` through the exact M10 gate.

```text
M14
→ logical first-game Input vertical
→ no claim of physical BrowserWindow producer

M15
→ Hostra Node Runner child
→ Electron BrowserWindow physical events
→ real RendererInputSource
→ same M10 gate
→ same M14 map logic
```

PWA Window physical producer belongs to M17. Older future-looking M10 wording assigning Desktop DOM mapping to M14 is superseded; M10 API is unchanged.

## 17. Exact local-v21.1 command

Required invocation：

```text
npm run test:m14:essentials-local -- \
  --source <local-source-or-archive> \
  --map-id <positive-int> \
  --x <non-negative-int> \
  --y <non-negative-int> \
  --character-name <semantic-name>
```

Ignored work root：

```text
.local/m14-essentials/
```

The command must run existing importer/acquisition, materialize M14 Map/Tileset records, assemble the same browser/page artifacts, run the same Runtime/browser implementation and record source fingerprint + selected slice + semantic/presentation outcome.

If a meaningful exact-corpus slice necessarily requires unsupported autotile/priority-over-player semantics, qualification fails explicitly. Closure requires the smallest real addition or another meaningful supported slice, never a fake local map.

## 18. Closure record

At closure create/update：

```text
doc/30-implementation/m14-qualification.md
```

Record：

```text
closure commit SHA
Node 20/24 canonical run/result
exact-v21.1 source version + fingerprint
local selection mapId/x/y/characterName
consumer projection summary
record/resource counts
passable/blocked movement results
visible tile/resource result
WC/DOM result
final pass/fail
```

Never record third-party asset bytes.

## 19. Reopen policy / nonclaims

Reopen M10–M13 only for demonstrated correctness/security contradiction, genuinely absent required author capability, impossible exact-consumer behavior through frozen seam or measurable workload failure.

Do not reopen for prettier domain IDs, resource-read duplication, responsive-layout speculation, ESM-loader preference or generic map abstraction aesthetics.

M14 Closed does not claim full Pokémon Essentials gameplay, all maps, autotile completeness, priority-over-player rendering, event collision/interpreter, map transitions, responsive viewport, animation Tick API, Desktop physical E2E, PWA equivalence, universal map schema or public map presentation SDK.
