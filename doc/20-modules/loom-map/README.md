# Map Game Library 设计

> 层级：Game Library 设计  
> 状态：Frozen for Implementation / M14 Pending  
> 稳定程度：M10–M13 consumed boundaries closed；M14 first-slice implementation shape frozen  
> 主要定义：`game-libs/map` reusable map business library + map-owned Web presentation  
> 精确 landing：根目录 `M14_02_MAP_GAME_LIBRARY.md`–`M14_05_QUALIFICATION_CLOSURE.md`  
> 决策：[ADR 0032](../../decisions/0032-game-library-example-boundary.md)

## Core principle

Map 是 independent game-domain consumer，不是 LoomRealm framework module：

```text
RMXP/Essentials source semantics
→ importer consumer JSON projection
→ prepared FSDB
→ M12 ContentClient
→ @loomrealm-game/map Runtime
→ M10 Input + M11 Render
→ M13 map-owned Web Components
```

Framework owns transport/authority contracts. Map library owns map business semantics and concrete map presentation vocabulary.

## Physical/package identity

```text
game-libs/map
@loomrealm-game/map
```

Forbidden：

```text
packages/map
@loomrealm/map
```

M14 concrete first slice uses one logical Subsystem key `map`. M14 harness binds it to the map Definition; M15 proves the same logical Subsystem inside a real Hostra Node Runner child.

Package consumer seams：

```text
@loomrealm-game/map
    → Runtime root/default SubsystemDefinitionFactory

@loomrealm-game/map/browser/map.browser.js
    → classic browser artifact

@loomrealm-game/map/browser/map.css
    → map component CSS artifact
```

Prepared Content tooling resolves these package subpaths and does not reach through private `dist/`/source paths.

## Runtime / browser split

```text
Runtime side
→ imports @loomrealm/subsystem
→ Content / Input / Render / map business state

Browser side
→ lr-map-view
→ lr-map-sprite
→ Shadow DOM / Canvas / CSS
→ M13 PresentationResourceClient through receiveRenderContext
```

Runtime may not import DOM/Renderer/Main/Platform/tooling. Browser side may not obtain business-authority objects or physical Content credentials.

Repository-owned M14 qualification code may reuse the already-qualified M13 internal Window-composition mechanics solely as test harness infrastructure. That exception is not a game-library/example author seam and is not exported; real Desktop Window composition remains M15 scope.

## Content boundary

M14 does not define `MapNormalizedV1` or a universal map schema.

First playable Runtime records：

```text
Map/{id}
Tileset/{id}
```

`MapInfo/{id}` is optional supporting evidence; `MapMetadata` is deferred until a real behavior needs it.

Exact source extraction/projection rules live in `tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md`.

Important invariants：

```text
known @ivar → strip one leading @
Table index=x+y*xSize+z*xSize*ySize
Map.events stays embedded
MapNNN.rxdata → Map/{N}
Tilesets.rxdata[i] → Tileset/{i}, id must equal i
```

Projected Table is an object, not a nested JS array. Runtime uses a small equivalent `tableAt(table,x,y=0,z=0)` lookup for Map.data/passages/priorities and validates first-slice Table dimensions before use.

Runtime never consumes Ruby/Marshal/RMXP decoder wrappers.

## First-slice gameplay

Initial input：

```text
{ mapId, x, y, characterName }
```

Initial package-owned state：

```text
direction=2/down
pattern=0
```

Initial map Frame is long-lived：

```text
activate
→ load Map/Tileset/resources
→ create Frame-bound keyboard.event listener
→ publish initial Render state
→ remain pending while gameplay Frame is live
```

It must not return immediately after initial rendering.

Direction input：

```text
ArrowDown  → d=2
ArrowLeft  → d=4
ArrowRight → d=6
ArrowUp    → d=8
```

Only non-repeat key-down causes one tile movement attempt. Blocked movement sets facing but keeps x/y. After initialization the movement handler is synchronous through facing → passability → x/y → camera → full RenderDomain.replace before returning; it does not await Content/resource/decode work.

Real Desktop DOM input belongs to M15; M14 uses existing/synthetic RendererInputSource.

## RMXP passability subset

Passage bits：

```text
down  0x01
left  0x02
right 0x04
up    0x08
```

Map coordinate evaluation scans `z=2 → 1 → 0`, looks up tile/passages/priorities through projected Table semantics, and movement requires source-direction + target reverse-direction passability.

M14 excludes event collision, through/debug behavior, terrain effects and map transitions.

## Fixed viewport / camera

First slice：

```text
tile size         32
CSS viewport      640×480
nominal full grid 20×15
```

Example CSS fixes host size. There is no DOM→Runtime layout feedback.

Runtime camera：

```text
cameraX=clamp(playerX*32-304,0,max(mapWidth*32-640,0))
cameraY=clamp(playerY*32-224,0,max(mapHeight*32-480,0))
```

Visible bounds include every tile cell intersecting the pixel viewport. A non-tile-aligned camera may therefore intersect one extra edge column/row; `20×15` is not a fixed `tiles.length`. Canonical initial `cameraX=16` intersects 21 columns.

For the canonical move `(10,8)→(11,8)` the camera moves `(16,32)→(48,32)` while player screen origin stays `(304,224)`. Visible movement is map/Canvas content shifting left 32 CSS px plus world/facing change; qualification does not require the centered sprite screen position to move.

## Render ownership

M14 owns exactly one business RenderDomain, but SDK assigns its opaque wire id：

```text
no author-chosen "map.main"
no d1/d2 spelling requirement
no reopen of createRenderDomain(initialState)
```

Exact tree：

```text
zIndex=0
key="viewport" tag="lr-map-view"
└── key="player" tag="lr-map-sprite"
```

Managed DOM：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

Movement reuses same live HTMLElements.

## Render data agreement

View data：

```text
mapId / mapWidth / mapHeight
cameraX / cameraY
tileset {namespace,key,contentVersion}
tiles[] {x,y,z,tileId}
```

`tiles[]` contains only non-zero supported visible regular tiles and is ordered `z ascending → y ascending → x ascending`. Browser draws that order and does not reconstruct RMXP layer semantics.

Sprite data：

```text
x / y
screenX / screenY
direction
pattern=0
sprite {namespace,key,contentVersion}
```

Runtime publishes current full RenderDomain state through `replace(...)`; M14 adds no map delta protocol. M13 may optimize replication internally and WC receives current full node data.

No path/URL/token/bytes/source wrapper enters Render state.

## Presentation

`lr-map-view` owns private Shadow DOM：

```text
viewport
├── tile Canvas
└── entity overlay + slot
```

`lr-map-sprite` owns player character-sheet crop/placement.

Regular-tile subset：

```text
0       → transparent/omitted
>=384   → regular 32×32 tileset tile
48..383 → autotile not required by canonical CI
```

Source rect：

```text
sx=((tileId-384)%8)*32
sy=floor((tileId-384)/8)*32
```

No per-tile WC, SceneGraph, LayerManager or component registry.

## CSS / browser artifact

Ownership：

```text
@loomrealm-game/map
→ component/default CSS + Shadow DOM styles

examples/essentials-v21.1
→ page/window CSS + fixed 640×480 host
```

M13 loads classic scripts. Package-internal output remains：

```text
dist/browser/map.browser.js
→ no import/export at execution time
→ native customElements.define(lr-map-view/lr-map-sprite)

dist/browser/map.css
```

External consumers resolve these through the package subpaths above. Runtime ESM build remains separate; M14 does not reopen M13 into an ESM loader.

## Resource flow / currentness

```text
Runtime ContentClient.resource()
→ contentVersion
→ Render {namespace,key,contentVersion}
→ PresentationResourceClient
→ browser bytes
→ actual Canvas/sprite pixels
```

Async resource/decode completion may populate a cache, but it must repaint from the latest retained node data or pass an equivalent private data-generation check. Matching resource ref/version alone is insufficient because camera/tiles/direction can change while the same image remains current. Old captured render data must never repaint over newer state.

Runtime/Renderer may read the same resource independently. No metadata/HEAD API or AssetManager.

## Exact local evidence

Local exact-v21.1 qualification uses the same importer projection, prepared Content, map Runtime and browser code. PASS requires projected Map/Tileset/Table consumption, real selected tileset/player resources, real Chromium visibility of at least one regular source tile and the player, and one non-repeat M10 directional attempt whose resulting world state agrees with persisted passability facts. Canonical CI, not local corpus selection, owns the deterministic proof of both passable and blocked branches.

## Abstraction budget

Allowed concrete implementation：

```text
small Map/Tileset validators
tableAt helper
passability function
camera/visible-tile projection
map Definition
lr-map-view / lr-map-sprite
standalone browser artifact
```

Not justified：

```text
MapRepository / MapBundle
GameLibrary framework
AssetManager
SceneGraph / LayerManager
Scheduler / Tick framework
responsive viewport service
DOM→Runtime layout channel
universal map schema
```

Implementation details and closure evidence are normative in M14/02–05; this module document intentionally does not duplicate their full qualification checklist.
