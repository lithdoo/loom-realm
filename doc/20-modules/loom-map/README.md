# Map Game Library 设计

> 层级：Game Library 设计  
> 状态：**Implemented / contract frozen; formal Closed**
> 稳定程度：M10–M13 consumed boundaries closed；M14 map design/implementation frozen  
> 精确 landing：根目录 `M14_01_WORKSPACE_BOUNDARY.md`–`M14_05_QUALIFICATION_CLOSURE.md`  
> Formal qualification source：[`m14-qualification.md`](../../30-implementation/m14-qualification.md)  
> 决策：[ADR 0032](../../decisions/0032-game-library-example-boundary.md)

## Core principle

Map 是 LoomRealm 的真实 game-domain consumer，不是 framework module：

```text
RMXP/Essentials source semantics
→ selective importer consumer projection
→ prepared FSDB
→ M12 ContentClient
→ @loomrealm-game/map Runtime
→ M10 Input + M11 Render
→ M13 map-owned Web Components
```

Framework owns transport/authority contracts。Map library owns concrete tile-RPG business semantics and presentation vocabulary。

## Package identity

```text
game-libs/map
@loomrealm-game/map
```

Consumer seams：

```text
@loomrealm-game/map
    → Runtime root/default SubsystemDefinitionFactory

@loomrealm-game/map/browser/map.browser.js
    → classic browser artifact

@loomrealm-game/map/browser/map.css
    → component CSS artifact
```

Prepared Content tooling resolves package subpaths and does not reach through private source/`dist/` paths。

## Runtime / browser split

```text
Runtime side
→ imports public @loomrealm/subsystem only
→ owns map/world state, Content, Input, Render

Browser side
→ lr-map-view
→ lr-map-sprite
→ private Canvas / slot / sprite mechanics
→ M13 PresentationResourceClient
```

Runtime does not import DOM/Renderer/Main/Platform/tooling。Browser side does not obtain business-authority objects or physical Content credentials。

Repository-owned M14 qualification may reuse already-qualified M13 internal Window-composition mechanics only as test infrastructure。That is not an author/product seam；real Desktop Window composition belongs to M15。

## Selective content boundary

M14 does not define `MapNormalizedV1` or recursively project the RMXP object graph。

First-slice consumer records exactly：

```text
Map/{id}
    tileset_id
    width
    height
    data

Tileset/{id}
    id
    tileset_name
    passages
    priorities
```

`Map.data` is a projected RGSS Table：

```text
dimensions=3
xSize=Map.width
ySize=Map.height
zSize=3
index=x+y*xSize+z*xSize*ySize
```

Unused events、BGM/BGS、encounters、autotile names、terrain tags、MapInfo/MapMetadata and other known RMXP objects remain in existing importer/lossless evidence until a real behavior consumes them。

Runtime never receives Ruby/Marshal/RMXP decoder wrappers。

## First-slice gameplay

Initial input：

```text
{ mapId, x, y, characterName }
```

Initial state：

```text
direction=2/down
pattern=0
```

Initial Frame remains alive through gameplay input：

```text
activate
→ load/validate Map + Tileset + resource versions
→ create one Frame-bound keyboard.event listener
→ create one business RenderDomain
→ publish initial full state
→ remain pending while Frame is live
```

Directional input：

```text
non-repeat Arrow key down
→ one synchronous tile movement attempt
→ facing
→ passability
→ x/y
→ camera
→ full RenderDomain.replace(...)
```

Blocked movement changes facing but not position。No EventQueue、game-loop Scheduler、PlayerController or MovementManager is introduced。

## Passability subset

Directional passage bits：

```text
down  0x01
left  0x02
right 0x04
up    0x08
```

Coordinate evaluation scans map layers `z=2 → 1 → 0` and uses `passages/priorities`。Movement requires source-direction + target reverse-direction passability。

M14 excludes event collision、through/debug behavior、terrain effects and map transitions。

## Fixed viewport / camera

```text
tile size         32 CSS px
viewport          640×480 CSS px
nominal full grid 20×15
```

Example CSS fixes host size。Runtime receives no DOM layout/resize facts。

Camera：

```text
cameraX=clamp(playerX*32-304,0,max(mapWidth*32-640,0))
cameraY=clamp(playerY*32-224,0,max(mapHeight*32-480,0))
```

Visible projection includes every tile cell intersecting the viewport；a non-tile-aligned camera can therefore intersect an extra edge column/row。

Canonical `(10,8)→(11,8)` movement keeps player screen origin `(304,224)` while camera shifts `16→48` and map pixels move left 32px。

## Render ownership

Exactly one business RenderDomain；SDK owns opaque wire id。

Exact managed tree：

```text
lr-map-view
└── lr-map-sprite
```

View data carries current map/camera/resource/visible-tile facts。Sprite data carries current world/screen/direction/resource facts。

Runtime uses full-state `RenderDomain.replace(...)`。M14 defines no map delta protocol。

## Presentation

`lr-map-view` owns private：

```text
640×480 tile Canvas
clipping
tileset decode/cache
entity overlay + slot
```

Exact private Shadow wrapper/class topology is not normative。

Every current full-state map paint：

```text
clear full logical 640×480 Canvas
→ draw current retained tiles[] in canonical order
```

No dirty rectangles、tile patch state or per-tile Custom Elements。

Regular tile subset：

```text
0       → omitted/transparent
>=384   → regular 32×32 tileset tile
48..383 → autotile not required by canonical M14 CI
```

`lr-map-sprite` owns the player character-sheet crop/placement。

Async decode completion may cache a matching resource, but repaint must use latest retained render data or an equivalent current generation check。Resource-version equality alone cannot authorize old camera/tiles/direction paint。

## Implementation budget

A good M14 implementation should stay close to：

```text
small Map/Tileset validators
tableAt(...)
mapTilePassable(...)
computeCamera(...)
projectVisibleTiles(...)
renderState(...)
one map Definition
two Custom Elements
standalone browser JS/CSS
one small repository qualification composition
```

Not justified without new evidence：

```text
MapRepository / MapBundle
GameLibrary framework
AssetManager / ResourceProvider
SceneGraph / LayerManager / component registry
PlayerController / MovementManager
Context/Service layer
responsive viewport service
Tick/Scheduler/EventQueue
universal map schema
generic recursive RMXP consumer model
```

## Qualification

The map design and implementation are frozen；formal milestone status is intentionally not duplicated here.

Canonical CI uses checked-in selective Map/Tileset facts + author-owned graphics and proves one passable + one blocked movement through real Chromium。

Exact local Essentials v21.1 evidence uses the same importer projection、prepared Content、Runtime and browser implementation against real source。

Precise executable criteria live in M14/03–05；the current qualification subject and PASS/PENDING evidence live only in `doc/30-implementation/m14-qualification.md`。
