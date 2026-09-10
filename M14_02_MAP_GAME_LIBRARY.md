# M14 / 02 — Map Game Library

> 状态：Frozen for Implementation / M14 Pending  
> 规范优先级：本文是 M14 map consumer 的 implementation freeze；若更早 milestone 文档仅以 future-looking wording 把 Desktop physical input、author-chosen RenderDomain id 等留给 M14，以本文和 M14/04–05 为准。

## Objective

实现第一个 reusable game-domain library：

```text
game-libs/map
@loomrealm-game/map
```

它是 LoomRealm framework 的 consumer，不是 framework module。M14 的价值是证明 M10–M13 已冻结 seams 足够支撑一个真实地图 consumer；不得为了地图方便 reopen core API 或建立第二套 map framework。

## 1. Package / execution boundary

同一个 package owner 提供物理隔离的两侧：

```text
Runtime side
    @loomrealm/subsystem only
    map/world state
    Content/Input/Render business logic

Browser side
    Custom Elements
    CSS / Shadow DOM / Canvas
    PresentationResourceClient through M13 context
```

Runtime side不得 import Renderer、Main、Platform、DOM、wire/Data internals、FSDB physical API 或 importer/tooling。Browser side不得获得 Subsystem business object、RenderDomain writer、Main/Data authority或 physical Content credential。

M14 first slice 只有一个 logical business Subsystem：

```text
subsystemKey = "map"
```

Player、tile、camera、visual event representation不是独立 Subsystem。M14 harness只做 validated logical key → Definition 的 test-owned physical binding；真实 Hostra Node Runner child process属于 M15。

`@loomrealm-game/map` root export is the Runtime module and default-exports the map `SubsystemDefinitionFactory`. Importing it MUST NOT execute browser/DOM code. Browser artifact discovery uses M14/01 package subpaths.

## 2. Content authority / Runtime representation

RMXP/Essentials is the semantic authority for map fields and first-slice movement/passability. Runtime representation is ordinary JSON-compatible FSDB records：

```text
Essentials / RMXP source
→ importer Marshal/RMXP decode
→ importer internal representation
→ M14 consumer semantic JSON materialization
→ prepared FSDB records/resources
→ ContentClient.record()/resource()
→ @loomrealm-game/map Runtime
```

Mechanical projection is owned only by `tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md`.

First-slice required records：

```text
Map/{mapId}
Tileset/{tilesetId}
```

`MapInfo/{mapId}` MAY be materialized/qualified but is not required by canonical playable CI. `MapMetadata/{mapId}` is deferred until a real behavior consumes it.

Runtime MUST NOT understand Ruby Marshal, `.rxdata`, importer objects/wrappers/typed arrays, `$id/$ref/$typed`, tool filesystem layout or Hostra/PWA storage identity. `Map.events` remains embedded; M14 does not add `ContentClient.group()`.

## 3. Exact first-slice Content shapes

Required `Map/{id}` facts：

```text
width       positive safe integer
height      positive safe integer
tileset_id  positive safe integer
data        projected RGSS Table
```

`Map.data` MUST satisfy：

```text
dimensions=3
xSize=width
ySize=height
zSize=3
values.length=width*height*3
```

Required `Tileset/{id}` facts：

```text
id            positive safe integer equal to Content key
tileset_name  non-empty semantic resource name
passages      projected 1D RGSS Table
priorities    projected 1D RGSS Table
```

Both 1D tables MUST satisfy：

```text
dimensions=1
ySize=1
zSize=1
values.length=xSize
xSize > every tileId inspected by the selected slice
```

Missing/malformed required facts fail closed. Runtime does not accept fixture-only alternate shapes.

## 4. Exact RGSS Table access

Projected Table is an object, not a multidimensional JS array.

Frozen index：

```text
index(x,y,z)=x+y*xSize+z*xSize*ySize
```

One small package-local helper may express this：

```ts
tableAt(table, x, y = 0, z = 0)
```

It validates integer/in-range coordinates, computes the frozen index and returns `table.values[index]`; malformed/out-of-range data fails closed.

Therefore shorthand means literally：

```text
Map.data[x,y,z]          = tableAt(Map.data,x,y,z)
Tileset.passages[id]     = tableAt(Tileset.passages,id)
Tileset.priorities[id]   = tableAt(Tileset.priorities,id)
```

No Runtime Table class/framework or second flattening convention.

## 5. Exact initial business input / initial state

```ts
interface MapInitialInput {
  mapId: number;
  x: number;
  y: number;
  characterName: string;
}
```

Canonical CI：

```json
{ "mapId": 1, "x": 10, "y": 8, "characterName": "m14_player" }
```

Rules：`mapId` positive safe integer; `x/y` non-negative safe integers inside loaded Map; `characterName` non-empty semantic resource name.

Initial direction is package-owned first-slice state, not GameEntry input：

```text
direction = 2 / down
pattern = 0
```

Player resource：

```text
characterName
→ Graphics / Characters/{characterName}
```

No full RPG::System/Trainer startup in first slice.

## 6. Gameplay Frame lifetime

Initial map Frame is a **long-lived gameplay Frame**：

```text
frame activated
→ validate input
→ load/validate Map + Tileset
→ validate spawn
→ confirm tileset/player resources + capture contentVersion
→ create exactly one Frame-bound InputListener
→ create/reuse exactly one business RenderDomain for this Runtime
→ publish initial viewport/player state
→ remain pending while frame.signal is live
```

The handler MUST NOT return `completed(...)` while gameplay input is expected. On signal abort/Frame close/Runtime teardown, listener cleanup is best-effort/idempotent and the pending gameplay wait ends. Existing FrameRuntime decides whether an eventual result is ignored during external teardown.

RenderDomain lifetime remains independent from Frame/Data lifetime. M14 qualifies one initial gameplay Frame; do not create a second Domain merely to model another Frame.

## 7. Resource identity / version

Tileset：

```text
tileset_name → Graphics / Tilesets/{tileset_name}
```

Player：

```text
characterName → Graphics / Characters/{characterName}
```

Runtime uses existing `ContentClient.resource()` for both required visible resources to prove existence and capture `contentVersion`; it need not retain bytes. Render carries only `{namespace,key,contentVersion}`. Browser obtains bytes through M13 PresentationResourceClient.

Runtime/Renderer duplicate reads are accepted. No metadata/HEAD API, AssetManager or privileged URL escape hatch.

## 8. Directional input semantics / ordering

Exactly `keyboard.event` is used.

Movement attempt：

```text
action="down"
repeat=false
code ∈ {ArrowDown,ArrowLeft,ArrowRight,ArrowUp}
```

Mapping：

```text
ArrowDown  → d=2 → (0,+1)
ArrowLeft  → d=4 → (-1,0)
ArrowRight → d=6 → (+1,0)
ArrowUp    → d=8 → (0,-1)
```

`up` and `repeat=true` do not move. One accepted event sets facing, evaluates passability, updates x/y by exactly one tile only when passable, recomputes camera/render state and calls `RenderDomain.replace(...)`. Blocked movement keeps attempted facing but not position.

After gameplay initialization the `keyboard.event` movement handler is synchronous. It MUST NOT await Content, fetch resources, decode assets or otherwise yield before the authoritative movement commit. One accepted event completes facing → passability → x/y → camera → full RenderDomain `replace(...)` before the handler returns. M14 adds no EventQueue/Scheduler merely to serialize movement.

M14 uses existing/synthetic RendererInputSource. Real BrowserWindow DOM input belongs to M15. WC code never mutates business coordinates from DOM events.

## 9. First-slice RMXP passability

Passage bits：

```text
d=2 → 0x01
d=4 → 0x02
d=6 → 0x04
d=8 → 0x08
```

`mapTilePassable(x,y,d)`：

```text
if coordinate outside map → false
bit = passage bit(d)

for z in [2,1,0]:
    tileId = tableAt(Map.data,x,y,z)
    invalid tileId → false
    passage = tableAt(Tileset.passages,tileId)
    priority = tableAt(Tileset.priorities,tileId)
    if (passage & bit) != 0 → false
    if (passage & 0x0f) == 0x0f → false
    if priority == 0 → true

return true
```

Movement in `d` requires source passability in `d` AND target passability in `10-d`. Out-of-bounds target blocks.

M14 excludes event collision, through/debug movement, terrain effects and map transitions. No CollisionMap/PassabilityService/TileRepository/derived blocked grid.

## 10. Tile rendering subset

Canonical first slice supports：

```text
tileId=0       → transparent / no draw
tileId>=384    → regular Tileset tile
tileId 48..383 → autotile, not required by canonical CI
other unsupported required kind → fail closed
```

Regular source rectangle：

```text
sx=((tileId-384)%8)*32
sy=floor((tileId-384)/8)*32
sw=32
sh=32
```

Layer drawing order is `z=0 → 1 → 2`. Canonical fixture avoids priority-over-player visuals.

If exact local v21.1 cannot provide a meaningful supported slice without autotile/priority behavior, implement the smallest real missing behavior before M14 Closed rather than introduce a generic TileRenderer framework.

## 11. Fixed CSS viewport / camera

Frozen：

```text
tileSize=32 logical CSS px
viewportWidth=640 CSS px
viewportHeight=480 CSS px
nominal fully-visible grid=20×15 tiles
```

Example CSS fixes host size. Runtime never reads DOM size; browser never feeds layout/resize back to Runtime.

Camera logical pixels：

```text
cameraX=clamp(playerX*32-304,0,max(mapWidth*32-640,0))
cameraY=clamp(playerY*32-224,0,max(mapHeight*32-480,0))
```

Visible intersecting bounds：

```text
minTileX=floor(cameraX/32)
maxTileX=min(mapWidth-1,floor((cameraX+639)/32))
minTileY=floor(cameraY/32)
maxTileY=min(mapHeight-1,floor((cameraY+479)/32))
```

A non-tile-aligned camera can intersect one extra edge column/row. Therefore `20×15` is a nominal count of full tiles, **not** an invariant on visible coordinate count or `tiles.length`. At canonical `cameraX=16`, the viewport intersects 21 tile columns.

Tile destination：

```text
screenX=tileX*32-cameraX
screenY=tileY*32-cameraY
```

For the canonical interior movement, camera follows the player and the player remains at the same screen-cell origin while world position changes：

```text
player (10,8), camera (16,32) → player screen (304,224)
player (11,8), camera (48,32) → player screen (304,224)
```

The visible movement evidence is therefore the map/Canvas shifting relative to the viewport plus world-state/facing change; qualification MUST NOT require the centered player's `screenX/screenY` to change.

Responsive layout, resize protocol and DOM→Runtime feedback are non-goals. DPR may affect private backing-store pixels only.

## 12. Canonical visible-tile projection

Runtime owns the exact `tiles[]` projection sent to `lr-map-view`.

For every `(x,y,z)` within the intersecting bounds and `z∈{0,1,2}`：

```text
tileId=tableAt(Map.data,x,y,z)
0          → omit from tiles[]
>=384      → include {x,y,z,tileId}
48..383    → unsupported in canonical CI; fail selected first slice if required
other nonzero unsupported value → fail closed
```

Included entries MUST be ordered canonically：

```text
z ascending (0,1,2)
then y ascending
then x ascending
```

The browser draws `tiles[]` in received order and does not reconstruct/sort RMXP map semantics itself. This makes layer order deterministic and keeps `Map.data` interpretation in Runtime authority.

## 13. RenderDomain identity / lifetime

M14 owns exactly one business RenderDomain but does not choose its wire ID. Current M11 API remains `scope.createRenderDomain(initialState)` and SDK identity is opaque/never-reused.

```text
no requirement domainId=="map.main"
no d1/d2 spelling requirement
no reopen of createRenderDomain()
qualification locates Domain by map subsystem + exact node tree
```

No visual-only Domains.

## 14. Exact first-slice Render tree

```text
zIndex=0
roots=[viewport]

viewport
    key="viewport"
    tag="lr-map-view"
    attrs={}
    children=[player]

player
    key="player"
    tag="lr-map-sprite"
    attrs={}
    children=[]
```

Managed DOM：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

Ordinary movement reuses same live HTMLElements.

## 15. Exact package-private Render data agreement

```ts
type ResourceRef = {
  namespace: string;
  key: string;
  contentVersion: string;
};

type VisibleTile = {
  x: number;
  y: number;
  z: 0 | 1 | 2;
  tileId: number;
};

type MapViewRenderData = {
  mapId: number;
  mapWidth: number;
  mapHeight: number;
  cameraX: number;
  cameraY: number;
  tileset: ResourceRef;
  tiles: VisibleTile[];
};

type MapSpriteRenderData = {
  x: number;
  y: number;
  screenX: number;
  screenY: number;
  direction: 2 | 4 | 6 | 8;
  pattern: 0;
  sprite: ResourceRef;
};
```

`tiles[]` inclusion/order is exactly §12. Player cell origin：

```text
screenX=playerX*32-cameraX
screenY=playerY*32-cameraY
```

`pattern=0` because M14 has no gameplay animation clock. No physical paths/URLs/tokens/bytes/source wrappers.

Runtime authors publish current full `RenderDomainState` through `replace(...)`; M14 defines no map-private wire delta protocol. M11/M13 may optimize transport internally, while each WC receives the current full node `data` according to the frozen M13 ABI.

## 16. Map-owned Web Components

Exactly：

```text
<lr-map-view>
<lr-map-sprite>
```

`lr-map-view` owns private Shadow DOM, fixed logical viewport, private tile Canvas, tileset decode/cache, regular-tile drawing, entity overlay and slot：

```html
#shadow-root
  <div class="viewport">
    <canvas class="tiles"></canvas>
    <div class="entities"><slot></slot></div>
  </div>
```

It draws canonical `tiles[]` in received order; it does not query Map/Tileset records or re-run passability/tile selection semantics.

`lr-map-sprite` owns player visual and RMXP 4×4 character-sheet crop：

```text
frameWidth=imageWidth/4
frameHeight=imageHeight/4
column=pattern=0
row=(direction-2)/2
```

Bottom-center anchoring for received cell origin：

```text
visualLeft=screenX+(32-frameWidth)/2
visualTop=screenY+32-frameHeight
```

WC may use private div/background crop or Canvas but cannot alter authoritative world/camera state.

No `lr-map-tile`, `lr-map-layer`, `lr-map-camera`, `lr-map-input`, `lr-map-resource`, `lr-map-collision`, `lr-game-root`, SceneGraph, component registry or layer manager.

## 17. CSS ownership / Canvas

```text
@loomrealm-game/map
→ component/default host CSS
→ Shadow DOM private CSS
→ clipping/Canvas/sprite mechanics

examples/essentials-v21.1
→ page/window CSS
→ fixed 640×480 host
→ centering/margin/scroll policy
```

Canonical logical Canvas drawing surface is 640×480. At DPR=1 backing store is 640×480. Private HiDPI scaling is allowed only if logical coordinates stay fixed and Canvas `imageSmoothingEnabled` is disabled for pixel-art drawing.

No viewport config object, ResizeObserver protocol or LayoutService.

## 18. Browser artifact

M13 loads classic `<script>`. M14 browser code executes with no `import`/`export` or runtime ESM graph.

Package internal source/output：

```text
game-libs/map/browser/map.browser.js
→ dist/browser/map.browser.js

game-libs/map/browser/map.css
→ dist/browser/map.css
```

External artifact resolution uses M14/01 subpaths：

```text
@loomrealm-game/map/browser/map.browser.js
@loomrealm-game/map/browser/map.css
```

A later private bundler may change copy mechanics only if these artifact seams and classic-script behavior remain. Both files must survive `npm pack`; tests do not direct-import/execute browser source in Node.

## 19. Async browser resource currentness

WC receivers may fetch/decode asynchronously, but latest M13 data remains the presentation-local truth.

Each receiver keeps the latest full data and may use a private monotonically increasing data-generation token per `receiveRenderData` call. Resource decode/cache completion and painting are separate concerns：

```text
receiveRenderContext(context)
→ retain only M13 context

receiveRenderData(data)
→ validate/store latest full data
→ advance private data generation
→ request/decode missing resource as needed

async resource/decode completion
→ may populate cache only for the resolved resource identity/version
→ repaint using the receiver's latest retained data
  OR paint only if captured data-generation is still current

stale completion
→ MUST NOT paint captured old camera/tiles[]/screen position/direction
```

Checking only `{namespace,key,contentVersion}` is insufficient because camera/tiles/direction can change while the same image resource/version remains current. A delayed initial tileset or sprite decode after a movement must render the latest movement state, not the old call's captured state.

Resource failure produces no fake fallback pixels. This is private presentation mechanics, not AssetManager/business authority/new protocol.

## 20. Abstraction budget / non-goals

Not established：MapNormalizedV1/universal map schema, GameLibrary framework, MapRepository/MapBundle/AssetManager, SceneGraph/LayerManager/registry, service locator, Content metadata API, responsive layout feedback, Tick/Scheduler/EventQueue, autotile framework, full priority-over-entity renderer, Event collision/interpreter or complete Essentials gameplay.

Allowed concrete nouns remain small Map/Tileset validators, `tableAt`, passability/camera/visible-tile functions, map Definition, two WC and standalone browser artifacts.
