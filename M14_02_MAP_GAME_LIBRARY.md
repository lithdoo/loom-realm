# M14 / 02 — Map Game Library

> 状态：Implementation Landing / M14 Pending  
> 规范优先级：本文是 M14 map consumer 的 implementation freeze；若更早 milestone 文档仅以 future-looking wording 把 Desktop physical input、author-chosen RenderDomain id 等留给 M14，以本文和 M14/04–05 为准。

## Objective

实现第一个 reusable game-domain library：

```text
game-libs/map
@loomrealm-game/map
```

它是 LoomRealm framework 的 consumer，不是 framework module。M14 的价值是证明 M10–M13 已冻结的 author/runtime/presentation seams 足够支撑一个真实地图 consumer；不得为了地图方便 reopen core API 或建立第二套 map framework。

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

Player、tile、camera、visual event representation不是独立 Subsystem。M14 harness只做 validated logical key → Definition 的 test-owned physical binding；真实 Hostra Node Runner child process属于 M15 Desktop full E2E。

### Runtime package entry

`@loomrealm-game/map` root export is the Runtime author-facing package entry. It MUST resolve to the ESM/TypeScript-built Runtime Definition/helpers and MUST NOT execute browser/DOM code on import.

The browser artifacts are packaged files for prepared Content, not a second runtime API surface. M14 does not require a public browser SDK or component registry.

## 2. Content authority / Runtime representation

RMXP/Essentials is the semantic authority for map fields and first-slice movement/passability. Runtime persisted representation is ordinary JSON-compatible FSDB records：

```text
Essentials / RMXP source
→ importer Marshal/RMXP decode
→ importer internal representation
→ M14 consumer semantic JSON materialization
→ prepared FSDB records/resources
→ ContentClient.record()/resource()
→ @loomrealm-game/map Runtime
```

Consumer projection mechanical rules are owned only by：

```text
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

First-slice required records：

```text
Map/{mapId}
Tileset/{tilesetId}
```

`MapInfo/{mapId}` MAY be materialized/qualified but is not required by the playable CI slice. `MapMetadata/{mapId}` is deferred until a real selected behavior needs it.

Map Runtime MUST NOT understand Ruby Marshal, `.rxdata`, `RmxpObject`, Ruby wrappers, object identity, `$id/$ref/$typed`, importer typed arrays, tool filesystem layout or Hostra/PWA storage identity.

`Map.events` remains embedded in `Map/{id}`. M14 does not add `ContentClient.group()`.

## 3. Exact first-slice Content shapes used by Runtime

M14 does not create a normalized map schema, but the Runtime must validate the RMXP-compatible subset it actually consumes.

Required `Map/{id}` facts：

```text
width       positive safe integer
height      positive safe integer
tileset_id  positive safe integer
data        projected RGSS Table
```

For first slice, `Map.data` MUST satisfy：

```text
dimensions = 3
xSize = width
ySize = height
zSize = 3
values.length = width * height * 3
```

Required `Tileset/{id}` facts：

```text
id            positive safe integer and equal to Content key
tileset_name  non-empty semantic resource name
passages      projected 1D RGSS Table
priorities    projected 1D RGSS Table
```

For first slice, both `passages` and `priorities` MUST satisfy：

```text
dimensions = 1
ySize = 1
zSize = 1
values.length = xSize
xSize > every tileId that the selected slice must inspect
```

Missing/malformed required facts fail closed. The Runtime does not accept an alternate fixture-only array shape.

## 4. Exact RGSS Table access

Projected RGSS Table is never indexed as a JavaScript multidimensional array. Its only first-slice lookup convention is the projection invariant：

```text
index(x,y,z) = x + y*xSize + z*xSize*ySize
```

Use one small package-local helper with equivalent behavior：

```ts
tableAt(table, x, y = 0, z = 0)
```

It MUST：

```text
validate integer coordinates
validate 0 <= x < xSize, 0 <= y < ySize, 0 <= z < zSize
compute the frozen index formula
return table.values[index]
fail closed on malformed/out-of-range data
```

Therefore all later pseudocode means literally：

```text
Map.data[x,y,z]
    = tableAt(Map.data, x, y, z)

Tileset.passages[tileId]
    = tableAt(Tileset.passages, tileId)

Tileset.priorities[tileId]
    = tableAt(Tileset.priorities, tileId)
```

Do not create a runtime `Table` class/framework or a second flattening convention.

## 5. Exact initial business input

Concrete M14 Game Entry initial input：

```ts
interface MapInitialInput {
  mapId: number;
  x: number;
  y: number;
  characterName: string;
}
```

Canonical CI input：

```json
{
  "mapId": 1,
  "x": 10,
  "y": 8,
  "characterName": "m14_player"
}
```

Rules：

```text
mapId         positive safe integer
x/y           non-negative safe integers inside loaded Map
characterName non-empty semantic resource name
```

Player resource identity：

```text
characterName
→ Graphics / Characters/{characterName}
```

No complete RPG::System / Trainer startup is required in M14.

## 6. Gameplay Frame lifetime

M14 initial map Frame is a **long-lived gameplay Frame**.

```text
frame activated
→ validate input
→ load/validate Map + Tileset
→ validate spawn
→ confirm tileset/player resources and capture contentVersion
→ create exactly one InputListener bound to this Frame
→ create/reuse exactly one business RenderDomain for this Runtime
→ publish initial viewport/player state
→ remain pending while frame.signal is live
```

The frame handler MUST NOT return `completed(...)` while gameplay input is expected. Otherwise its M10 Frame-bound Input Interest disappears.

On `frame.signal` abort / Frame close / Runtime teardown：

```text
listener.close() best-effort/idempotent
pending gameplay wait ends
```

The eventual handler result after externally initiated close/suspend is not a new gameplay authority; existing FrameRuntime owns whether that result is ignored during teardown.

RenderDomain lifetime remains independent：

```text
Frame close/suspend != RenderDomain destroy
Data loss            != RenderDomain destroy
```

M14 qualifies one initial gameplay Frame only. Do not create a second Domain merely to handle another Frame.

## 7. Resource identity / version

Runtime uses only：

```text
ContentClient.record(namespace, key)
ContentClient.resource(namespace, key)
```

Tileset resource：

```text
RPG::Tileset.tileset_name
→ Graphics / Tilesets/{tileset_name}
```

Player resource：

```text
MapInitialInput.characterName
→ Graphics / Characters/{characterName}
```

Runtime calls `resource()` for both required visible resources to prove existence and capture `contentVersion`. Runtime need not retain bytes. Render state carries only：

```text
namespace
key
contentVersion
```

Browser obtains bytes later through M13 `PresentationResourceClient`. Runtime/Renderer duplicate reads are accepted; no metadata/HEAD API, AssetManager or privileged URL escape hatch is added.

## 8. Directional input semantics

M14 uses exactly：

```text
channel = "keyboard.event"
```

One movement attempt requires：

```text
action = "down"
repeat = false
code ∈ { ArrowDown, ArrowLeft, ArrowRight, ArrowUp }
```

Mapping：

```text
ArrowDown  → d=2 → (0,+1)
ArrowLeft  → d=4 → (-1,0)
ArrowRight → d=6 → (+1,0)
ArrowUp    → d=8 → (0,-1)
```

`action="up"` and `repeat=true` do not move. There is no timer, keyboard.state polling loop, Tick or Scheduler.

Per accepted event：

```text
set authoritative facing = d
→ evaluate passability
→ passable: update x/y one tile
→ blocked: keep x/y
→ recompute camera/render state
→ RenderDomain.replace(...)
```

Blocked movement still leaves facing at the attempted direction.

M14 qualification uses existing/synthetic `RendererInputSource`. Real BrowserWindow DOM input belongs to M15. WC code never mutates player authority from DOM events.

## 9. First-slice RMXP passability

Direction passage bits：

```text
down  d=2 → 0x01
left  d=4 → 0x02
right d=6 → 0x04
up    d=8 → 0x08
```

`mapTilePassable(x,y,d)` is frozen as：

```text
if (x,y) outside map
    false

bit = passage bit for d

for z in [2,1,0]:
    tileId = tableAt(Map.data, x, y, z)
    invalid tileId → false

    passage  = tableAt(Tileset.passages, tileId)
    priority = tableAt(Tileset.priorities, tileId)

    if (passage & bit) != 0
        false

    if (passage & 0x0f) == 0x0f
        false

    if priority == 0
        true

return true
```

Movement from `(x,y)` to `(nx,ny)` in direction `d` requires：

```text
mapTilePassable(x,  y,  d)
AND
mapTilePassable(nx, ny, 10-d)
```

Out-of-bounds target blocks. M14 excludes event collision, through/debug movement, terrain effects and map transitions.

No `CollisionMap`, PassabilityService, TileRepository or derived blocked-grid truth is introduced.

## 10. Tile rendering subset

M14 canonical first slice supports：

```text
tileId = 0      → transparent / no draw
tileId >= 384   → regular Tileset tile
tileId 48..383  → RMXP autotile, not required by canonical CI slice
other unsupported required tile kind → fail closed
```

Regular source rectangle：

```text
sx = ((tileId - 384) % 8) * 32
sy = floor((tileId - 384) / 8) * 32
sw = 32
sh = 32
```

Visible regular tiles draw `z=0 → 1 → 2` onto the private map Canvas. Canonical fixture avoids priority-over-player visuals.

If exact v21.1 local evidence cannot find a meaningful supported slice without autotile/priority behavior, implement the smallest real missing behavior before M14 Closed rather than inventing a generic TileRenderer framework.

## 11. Fixed CSS viewport / camera

M14 has no DOM/layout feedback channel.

Frozen constants：

```text
tileSize       = 32 logical CSS px
viewportWidth  = 640 CSS px
viewportHeight = 480 CSS px
nominal grid   = 20 × 15 tiles
```

The example fixes host size via CSS. Runtime never reads computed DOM size; browser never reports resize/layout state to Runtime.

Camera is authoritative Runtime logical-pixel state：

```text
cameraX = clamp(playerX*32 - 304, 0, max(mapWidth*32  - 640, 0))
cameraY = clamp(playerY*32 - 224, 0, max(mapHeight*32 - 480, 0))
```

Visible bounds：

```text
minTileX = floor(cameraX / 32)
maxTileX = min(mapWidth-1,  floor((cameraX+639)/32))
minTileY = floor(cameraY / 32)
maxTileY = min(mapHeight-1, floor((cameraY+479)/32))
```

Tile screen position is presentation mechanics：

```text
screenX = tileX*32 - cameraX
screenY = tileY*32 - cameraY
```

Responsive viewport, Window resize, dynamic logical resolution and DOM→Runtime layout feedback are not M14. `devicePixelRatio` may affect private Canvas backing-store resolution only.

## 12. RenderDomain identity / lifetime

M14 owns **exactly one business RenderDomain**, but does not choose its wire `domainId`.

Current M11 author API remains：

```ts
scope.createRenderDomain(initialState)
```

The SDK assigns opaque never-reused identity. Therefore：

```text
MUST NOT require domainId == "map.main"
MUST NOT require d1/d2 spelling
MUST NOT reopen createRenderDomain()
qualification locates the single Domain by subsystem topology + node contents
```

No tile/entity/layer visual-only Domains.

## 13. Exact first-slice Render tree

```text
zIndex = 0
roots = [viewport]

viewport
    key      = "viewport"
    tag      = "lr-map-view"
    attrs    = {}
    children = [player]

player
    key      = "player"
    tag      = "lr-map-sprite"
    attrs    = {}
    children = []
```

M13-managed DOM：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

Ordinary movement reuses the same live HTMLElements.

## 14. Exact package-private Render data agreement

No public/versioned Map Render protocol is created, but Runtime/browser entries use one exact package-owned JSON shape：

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

Player screen cell origin：

```text
screenX = playerX*32 - cameraX
screenY = playerY*32 - cameraY
```

`pattern=0` because M14 has no gameplay animation clock. No paths/URLs/tokens/bytes/source wrappers enter Render data.

## 15. Map-owned Web Components

Exactly two required elements：

```text
<lr-map-view>
<lr-map-sprite>
```

`lr-map-view` owns private Shadow DOM, fixed logical viewport realization, private tile Canvas, tileset decode/cache, regular-tile drawing and entity overlay/slot. Private structure is semantically equivalent to：

```html
#shadow-root
  <div class="viewport">
    <canvas class="tiles"></canvas>
    <div class="entities"><slot></slot></div>
  </div>
```

`lr-map-sprite` owns player visual and RMXP 4×4 character-sheet crop：

```text
frameWidth  = image width / 4
frameHeight = image height / 4
column      = pattern = 0
row         = (direction - 2) / 2
```

It is bottom-center anchored to the received 32×32 map cell origin. WC may use private `div`/background crop or Canvas but cannot alter authoritative world/camera state.

Do not create `lr-map-tile`, `lr-map-layer`, `lr-map-camera`, `lr-map-input`, `lr-map-resource`, `lr-map-collision`, `lr-game-root`, SceneGraph, component registry or layer manager.

## 16. CSS ownership

```text
@loomrealm-game/map
→ component host/default CSS
→ Shadow DOM private CSS
→ clipping / Canvas / sprite visual mechanics

examples/essentials-v21.1
→ concrete page/window CSS
→ fixed 640×480 host size
→ centering / margin / scroll policy
```

Map CSS does not own page composition. Example CSS does not select Shadow DOM private classes. No viewport config object, ResizeObserver protocol or LayoutService is introduced.

For deterministic first-slice rendering, the tile Canvas logical drawing surface is 640×480. At devicePixelRatio=1 its backing store is 640×480; a WC may privately scale backing-store pixels for HiDPI as long as the logical coordinate system remains 640×480 and image smoothing remains disabled for pixel art.

## 17. Browser artifact

M13 loads classic `<script>`, so M14 browser code MUST execute without `import`/`export` or a runtime ESM graph.

Frozen source/output：

```text
game-libs/map/browser/map.browser.js
    standalone classic browser source

game-libs/map/browser/map.css
    component/default host CSS

package build
→ dist/browser/map.browser.js
→ dist/browser/map.css
```

Runtime TypeScript continues normal ESM/tsc build separately. A private future bundler may replace the copy/materialization mechanics only if the resulting artifact preserves the same classic-script boundary.

Both browser files MUST be present in `npm pack --dry-run`. Tests do not direct-import browser source or call `customElements.define()` themselves.

## 18. Abstraction budget / non-goals

Not established by M14：

```text
MapNormalizedV1 / universal map schema
GameLibrary framework
MapRepository / MapBundle / AssetManager
SceneGraph / LayerManager / component registry
runtime service locator
Content metadata API
responsive viewport protocol / DOM→Runtime layout feedback
Tick/Scheduler/EventQueue
autotile framework
full priority-over-entity renderer
Event collision/interpreter
complete Pokémon Essentials gameplay
```

Allowed concrete nouns：

```text
map Definition
small Map/Tileset validators
small tableAt helper
passability function
camera/visible-tile projection functions
lr-map-view / lr-map-sprite
standalone browser artifact
```

If implementation needs a new Manager/Registry/Repository/Provider/Resolver/Adapter/Pipeline/Builder/Factory/Service/Host/Platform/Scheduler solely for M14 elegance, re-check the design before adding it.
