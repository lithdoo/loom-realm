# Map Game Library 设计

> 层级：Game Library 设计  
> 状态：Active Design / M14 Pending  
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

## Physical identity

```text
game-libs/map
@loomrealm-game/map
```

Forbidden：

```text
packages/map
@loomrealm/map
```

M14 concrete first slice uses one logical Subsystem key：

```text
map
```

M14 harness binds this key to the map Definition for qualification. M15 proves the same logical Subsystem inside a real Hostra Node Runner child.

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

## Content boundary

M14 does not define `MapNormalizedV1` or a universal map schema.

First playable Runtime records：

```text
Map/{id}
Tileset/{id}
```

`MapInfo/{id}` is optional supporting evidence; `MapMetadata` is deferred until a real first-slice behavior needs it.

Consumer records retain RMXP-compatible field meaning but are ordinary JsonValue values. Exact source extraction and projection rules live in：

```text
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

Important invariants：

```text
known @ivar → strip one leading @
Table index(x,y,z) = x + y*xSize + z*xSize*ySize
Map.events stays embedded
MapNNN.rxdata → Map/{N}
Tilesets.rxdata[i] → Tileset/{i}, id must equal i
```

Runtime never consumes Ruby/Marshal/RMXP decoder wrappers.

## First-slice gameplay

Initial business input：

```text
{ mapId, x, y, characterName }
```

The initial map Frame is long-lived：

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

Only non-repeat key-down causes one tile movement attempt in M14. Blocked movement still sets facing but keeps x/y unchanged.

Real Desktop DOM input production belongs to M15; M14 uses an existing/synthetic `RendererInputSource` to prove the frozen M10 path.

## RMXP passability subset

Passage bits：

```text
down  0x01
left  0x02
right 0x04
up    0x08
```

Map coordinate evaluation scans layers `2 → 1 → 0`, uses `passages` + `priorities`, and movement requires both source-direction passability and target reverse-direction passability.

M14 excludes event collision, through/debug behavior, terrain effects and map transitions.

## Fixed viewport / camera

First slice freezes：

```text
tile size        32
CSS viewport     640 × 480
nominal grid     20 × 15
```

Example CSS fixes the physical host. There is no DOM→Runtime layout feedback or responsive protocol.

Runtime camera is logical pixels：

```text
cameraX = clamp(playerX*32 - 304, 0, max(mapWidth*32  - 640, 0))
cameraY = clamp(playerY*32 - 224, 0, max(mapHeight*32 - 480, 0))
```

## Render ownership

M14 owns exactly one business RenderDomain, but the SDK assigns its wire id. Domain identity is opaque：

```text
no author-chosen "map.main"
no requirement on d1/d2 spelling
no reopen of createRenderDomain(initialState)
```

Exact first-slice tree：

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

Movement reuses the same live HTMLElements.

## Render data agreement

Package-private exact data is frozen by M14/02.

View data：

```text
mapId / mapWidth / mapHeight
cameraX / cameraY
tileset { namespace,key,contentVersion }
tiles[] { x,y,z,tileId }
```

Sprite data：

```text
x / y
screenX / screenY
direction
pattern=0
sprite { namespace,key,contentVersion }
```

No path/URL/token/bytes/source wrapper enters Render state.

## Presentation

`lr-map-view` owns private Shadow DOM：

```text
viewport
├── tile Canvas
└── entity overlay + slot
```

`lr-map-sprite` owns player character-sheet crop/placement.

M14 regular-tile subset：

```text
0        → transparent
>= 384   → regular 32×32 tileset tile
48..383  → autotile, not required by first CI slice
```

Regular tile source rect：

```text
sx=((tileId-384)%8)*32
sy=floor((tileId-384)/8)*32
```

Do not create per-tile Web Components, SceneGraph, LayerManager or component registry.

## CSS / browser artifact

Ownership：

```text
@loomrealm-game/map
→ component/default CSS + Shadow DOM styles

examples/essentials-v21.1
→ page/window CSS + fixed 640×480 host
```

M13 loads classic scripts, so the first browser artifact is standalone classic JS：

```text
dist/browser/map.browser.js
→ no import/export at execution time
→ native customElements.define(lr-map-view/lr-map-sprite)

dist/browser/map.css
```

Runtime ESM build remains separate. Do not reopen M13 into an ESM loader for M14.

## Resource flow

```text
Runtime ContentClient.resource()
→ contentVersion
→ Render { namespace,key,contentVersion }
→ PresentationResourceClient
→ browser bytes
→ actual Canvas/sprite pixels
```

Runtime/Renderer may read the same resource independently. M14 adds no metadata/HEAD API or AssetManager.

## Abstraction budget

Allowed concrete implementation：

```text
small Map/Tileset validators
Table lookup helper
passability function
camera/visible-tile projection
map Definition
lr-map-view / lr-map-sprite
standalone browser artifact
```

Not justified by M14：

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
