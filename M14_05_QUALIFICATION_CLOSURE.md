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

Local corpus stays ignored/local and is never uploaded as CI/repository artifact. Closure record binds repository SHA, CI result, exact-source fingerprint/selection, consumer projection and semantic/browser outcome.

## 1. Required root scripts / package gate

Implementation adds：

```text
test:m14
test:m14:pack
test:m14:essentials-local
```

`test:m14` includes：

```text
npm run test:m13
workspace/package boundary checks
consumer-projection tests
game-lib semantic/unit tests
game.json + presentation.json validation
prepared Content assembly test
real Chromium M14 vertical
npm run test:m14:pack
```

`test:m14:pack` proves：

```text
import("@loomrealm-game/map")
→ Runtime root/default map SubsystemDefinitionFactory

resolve @loomrealm-game/map/browser/map.browser.js
→ packaged dist/browser/map.browser.js

resolve @loomrealm-game/map/browser/map.css
→ packaged dist/browser/map.css

npm pack --dry-run
→ Runtime output + both browser artifacts included
```

Pack test does not execute browser JS in Node. The example remains private/non-publishable.

## 2. Workspace / dependency gate

Automated checks prove：

```text
root workspaces include game-libs/* + examples/*
packages/* do not depend on game-libs/* or examples/*
map Runtime imports only public author-facing LoomRealm API
map Runtime does not import Renderer/Main/Platform/Data/Wire/FSDB/tooling/DOM
browser code is not a Runtime dependency
example Runtime does not import tools/fixtures
example package private=true
prepared assembly resolves browser files by package subpath, not dist/source reach-through
existing M13 gate semantics unchanged after workspace expansion
```

No workspace orchestration framework.

## 3. Consumer projection / extraction gate

Tests prove `M14_CONSUMER_PROJECTION.md`：

```text
known @ivar spelling projection
primitive safe/fail-closed rules
string/symbol/array/hash projection
RGSS Table object shape
index=x+y*xSize+z*xSize*ySize
values.length invariant
Map.events embedded decimal keys
no importer metadata/wrappers in consumer records
```

At least one non-zero coordinate proves flattened ordering.

Source extraction：

```text
MapNNN.rxdata RPG::Map → Map/{decimal N}
Tilesets.rxdata[i] → Tileset/{i}, projected id==i
MapInfos.rxdata[k] → MapInfo/{k} when materialized
```

Ambiguity/mismatch fails closed; Runtime adapter repair is forbidden.

## 4. Checked-in concrete documents gate

CI reads：

```text
examples/essentials-v21.1/game.json
examples/essentials-v21.1/presentation.json
examples/essentials-v21.1/presentation.css
```

`game.json` validates exactly to：

```text
formatVersion=1
subsystems=[{key:"map"}]
initial.subsystem="map"
initial.input={mapId:1,x:10,y:8,characterName:"m14_player"}
```

Only then may harness bind `map` to the Definition.

`presentation.json` validates through existing M13 API with：

```text
styles
    Presentation / map/map.css
    Presentation / essentials/page.css
scripts
    Presentation / map/map.browser.js
```

No inline replacement document in qualification.

## 5. Gameplay Frame lifetime gate

Prove：

```text
Frame active
→ Content/resources loaded
→ Frame-bound InputListener current
→ initial Render visible
→ frame handler remains pending
→ first input delivered
→ second input delivered
```

Early `completed(...)` fails. Teardown uses existing Frame/Runtime lifecycle; no implicit Frame-owned RenderDomain teardown.

## 6. RenderDomain topology gate

Exactly one map business RenderDomain. SDK wire ID opaque：

```text
no "map.main" assertion
no d1/d2 spelling assertion
no createRenderDomain API reopen
```

Locate by `subsystemKey="map"` + exact tree：

```text
zIndex=0
root key="viewport" tag="lr-map-view"
└── key="player" tag="lr-map-sprite"
```

No visual-only Domains.

## 7. Exact Table/runtime shape gate

`Map.data`：

```text
dimensions=3
xSize=Map.width
ySize=Map.height
zSize=3
values.length=width*height*3
```

`Tileset.passages/priorities`：

```text
dimensions=1
ySize=1
zSize=1
values.length=xSize
xSize covers every inspected tileId
```

Runtime lookup uses equivalent `tableAt(table,x,y=0,z=0)` behavior. Treating projected Table as `Map.data[z][y][x]` or a JS array fails.

Canonical proof：

```text
tableAt(Map.data,12,8,0)==385
```

## 8. Frozen CI fixture/resources gate

```text
Map/1 width=24 height=18 tileset_id=1
z0 tile384 throughout tested area except (12,8)=385
z1/z2 tile0

Tileset/1 id=1 tileset_name="m14_tileset"
tableAt(passages,384)=0x00
tableAt(priorities,384)=0
tableAt(passages,385)=0x02
tableAt(priorities,385)=0
```

Forbidden：`isBlocked`, `walkable`, test collision bitmap, coordinate hard-code, nested fake tile arrays.

Author-owned PNGs：

```text
Graphics/Tilesets/m14_tileset
    image/png 256×32
    tile384/385 cells distinguishable

Graphics/Characters/m14_player
    image/png 128×128
    4×4, 32×32 frames
    direction rows distinguishable
```

No third-party Essentials bytes.

## 9. Input / RMXP passability gate

Prove passage bits and first-slice algorithm：

```text
d2=0x01, d4=0x02, d6=0x04, d8=0x08
scan coordinate layers z=2,1,0
directional passage bit blocks
0x0f blocks
priority==0 establishes passability
movement checks source d + target 10-d
OOB target blocks
```

Canonical sequence：

```text
start (10,8), facing2
ArrowRight down repeat=false → (11,8), facing6
ArrowRight down repeat=false → tile385 blocks left-entry 0x02
                              → remains (11,8), facing6
```

No keyup/repeat/timer/keyboard.state substitute. Event collision, through/debug, terrain and transitions are nonclaims.

## 10. Fixed viewport / intersecting visible-window gate

Logical/presentation invariants：

```text
tileSize=32
lr-map-view=640×480 CSS px
nominal full-tile grid=20×15
no DOM→Runtime layout feedback
```

Canonical CI browser：

```text
viewport=800×600 CSS px
deviceScaleFactor=1
```

Computed map view must be 640×480.

Expected camera/bounds：

```text
player (10,8)
camera=(16,32)
intersecting x=0..20, y=1..15

player (11,8)
camera=(48,32)
intersecting x=1..21, y=1..15

blocked second right
camera/bounds unchanged
```

The 21 intersecting columns are intentional when cameraX is not tile-aligned. Qualification MUST NOT assert `tiles.length==20*15` merely from the nominal grid.

## 11. Canonical visible-tile projection gate

For every intersecting `(x,y,z)` Runtime uses `tableAt(Map.data,x,y,z)` and applies：

```text
0          → omit
>=384      → include {x,y,z,tileId}
unsupported required nonzero kind → fail closed
```

`tiles[]` canonical order：

```text
z ascending
then y ascending
then x ascending
```

With canonical fixture z1/z2 are zero, so initial `tiles[]` consists of non-zero z0 entries for `x=0..20,y=1..15` in y/x order. Browser must draw received order and MUST NOT re-sort/reconstruct RMXP layer semantics.

## 12. Tile pixel gate

Prove：

```text
tableAt(Map.data,...)
→ canonical ordered tiles[]
→ Tileset resource/version
→ PresentationResourceClient bytes
→ PNG source rectangle
→ private Canvas destination from camera
→ expected pixels
```

Regular mapping：

```text
tile0 transparent
id>=384:
  sx=((id-384)%8)*32
  sy=floor((id-384)/8)*32
  sw=sh=32
```

Tile384/385 must resolve to distinct fixture cells. No required autotile or priority-over-player visual in canonical CI. Canvas pixel-art drawing has smoothing disabled.

## 13. Resource / async currentness gate

Both resources go through Runtime `ContentClient.resource()` for version, Render `{namespace,key,contentVersion}`, then PresentationResourceClient for browser bytes and actual visible pixels.

No raw bytes/path/URL/bearer in Render state; no metadata/HEAD API.

If WC resource/decode work is async, stale completion must not paint after a newer resource ref/version. No fake fallback pixels.

## 14. Exact Render-data gate

`lr-map-view.data` exact：

```text
mapId,mapWidth,mapHeight,cameraX,cameraY
tileset {namespace,key,contentVersion}
tiles[] {x,y,z,tileId} with §11 inclusion/order
```

`lr-map-sprite.data` exact：

```text
x,y,screenX,screenY,direction,pattern=0
sprite {namespace,key,contentVersion}
```

No source/physical extras.

## 15. Web Component / DOM identity gate

Required tags exactly：

```text
lr-map-view
lr-map-sprite
```

Chromium observes：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

Prove private tile Canvas + entity slot/overlay, player light-DOM ownership, no per-tile WC, same view/sprite HTMLElement through both attempts, visible first move and no visible blocked move.

Player uses real 4×4 sheet and bottom-center crop/placement frozen by M14/02–04.

## 16. CSS / package artifact / bootstrap gate

Prepared assembly resolves only：

```text
@loomrealm-game/map/browser/map.css
@loomrealm-game/map/browser/map.browser.js
```

and materializes those under checked-in Config logical refs. Page CSS is `Presentation/essentials/page.css`.

Map JS executes as classic script, has no runtime ESM graph and natively defines both tags before Projector startup.

No direct browser-source import, manual tag definition, replacement CSS or package-private `dist/`/source reach-through.

## 17. Physical-input/process boundary

M14 uses existing/synthetic RendererInputSource through M10. M15 owns real Hostra Node child + Electron BrowserWindow + physical DOM input + reload/reconnect/shutdown. PWA Window physical input belongs to M17. Historical future-looking M10 text has been corrected; no M10 API change.

## 18. Exact local-v21.1 command

```text
npm run test:m14:essentials-local -- \
  --source <local-source-or-archive> \
  --map-id <positive-int> \
  --x <non-negative-int> \
  --y <non-negative-int> \
  --character-name <semantic-name>
```

Work root：`.local/m14-essentials/`.

Run existing importer/acquisition → M14 consumer projection → same prepared Content/package artifacts → same map Runtime/browser implementation. Record source fingerprint, selection and semantic/presentation result.

A meaningful exact-corpus slice that requires unsupported behavior fails explicitly until the smallest real addition is made or another meaningful supported slice is selected.

## 19. Closure record / reopen policy

At actual closure create/update `doc/30-implementation/m14-qualification.md` with closure SHA, Node20/24 run, exact source fingerprint/selection, projection summary, relevant record/resource counts, movement result, visible resource/tile result, WC/DOM result and final pass/fail. Never record third-party bytes.

Reopen M10–M13 only for demonstrated contradiction, genuinely absent capability, impossible exact-consumer behavior or measurable workload failure—not for prettier IDs, resource-read duplication, responsive speculation, ESM preference or generic-map aesthetics.

M14 Closed does not claim complete Essentials gameplay/maps, autotiles, priority-over-player rendering, event collision/interpreter, transitions, responsive viewport, Tick API, Desktop physical E2E, PWA equivalence, universal map schema or public map presentation SDK.
