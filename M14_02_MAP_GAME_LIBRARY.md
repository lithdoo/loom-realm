# M14 / 02 — Map Game Library

> 状态：Implementation Landing / M14 Pending  
> 规范优先级：本文是 M14 map consumer 的 implementation freeze；若更早的 milestone 文档仅以 future-looking wording 把 Desktop physical input、author-chosen RenderDomain id 等留给 M14，以本文和 M14/04–05 为准。

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

## 2. Content authority / Runtime representation

RMXP/Essentials 是 map field semantics 与 first-slice movement/passability 的 semantic authority；Runtime persisted representation 是 ordinary JSON-compatible FSDB records。

```text
Essentials / RMXP source
→ importer Marshal/RMXP decode
→ importer internal representation
→ M14 consumer semantic JSON materialization
→ prepared FSDB records/resources
→ ContentClient.record()/resource()
→ @loomrealm-game/map Runtime
```

Consumer projection 的唯一机械规则由：

```text
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

拥有。Map Runtime 不再创建 normalized adapter/schema。

First-slice required records只有：

```text
Map/{mapId}
Tileset/{tilesetId}
```

`MapInfo/{mapId}` MAY materialize/qualify，但 first playable slice不依赖它。`MapMetadata/{mapId}` 只有真实 first-slice consumer需要时才加入 exact extraction/use rule；M14 不为结构对称提前读取。

Map Runtime MUST NOT理解：

```text
Ruby Marshal / .rxdata
RmxpObject / RubyString wrapper
rubyObjectId / className / kind
$id / $ref / $typed
Buffer / Int16Array importer object
tool filesystem / Hostra/PWA storage identity
```

`Map.events` 保持嵌入 `Map/{id}`；不拆 `MapEvent` Group，也不增加 `ContentClient.group()`。

## 3. Exact initial business input

Concrete M14 Game Entry 的 initial Frame input 固定为：

```ts
interface MapInitialInput {
  mapId: number;
  x: number;
  y: number;
  characterName: string;
}
```

M14 CI example 使用：

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
mapId       positive safe integer
x/y         non-negative safe integers and inside loaded map
characterName non-empty semantic resource name
```

Player resource identity：

```text
characterName
→ Graphics / Characters/{characterName}
```

不为 first slice 实现完整 RPG::System / Trainer startup。未来真实 startup需要这些 authority时再由 consumer evidence加入。

## 4. Gameplay Frame lifetime

M14 initial map Frame 是 **long-lived gameplay Frame**，不是“加载地图后立即 completed”的 setup call。

Exact lifecycle：

```text
frame activated
→ validate MapInitialInput
→ load Map + Tileset records
→ validate spawn
→ confirm required tileset/player resources + capture contentVersion
→ create exactly one InputListener bound to this Frame
→ create/reuse exactly one business RenderDomain for this map Runtime
→ publish initial viewport/player state
→ remain pending while frame.signal is live
```

The frame handler MUST NOT return an ordinary completed outcome while gameplay input is expected. Otherwise M10 Frame-bound Input Interest would disappear and the vertical would be invalid.

On `frame.signal` abort / Frame close / Runtime teardown：

```text
listener.close() best-effort/idempotent
pending gameplay wait ends
```

RenderDomain lifetime remains independent from Frame lifetime as frozen by M11：

```text
Frame close/suspend != RenderDomain destroy
Data loss            != RenderDomain destroy
```

M14 one-frame vertical does not require multi-map/multi-frame session management. A second concurrent map gameplay Frame is outside first-slice scope and MUST NOT cause creation of a second RenderDomain just to make the implementation convenient.

## 5. Resource identity / version

Runtime uses only current M12 author API：

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

Empty required resource name is invalid for this first slice.

Runtime calls `resource()` once for each required visible resource to prove existence and obtain `contentVersion`; bytes are not retained when Runtime does not need them. Render data carries only：

```text
namespace
key
contentVersion
```

Browser later uses M13 `PresentationResourceClient` to obtain bytes. Runtime + Renderer duplicate reads are accepted in M14; do not add metadata/HEAD API, AssetManager, shared cache service or URL/token escape hatch.

## 6. Directional input semantics

M14 first slice uses exactly：

```text
channel = "keyboard.event"
```

Accepted movement attempt：

```text
action = "down"
repeat = false
code ∈ { ArrowDown, ArrowLeft, ArrowRight, ArrowUp }
```

Mapping preserves RMXP direction numbers：

```text
ArrowDown  → d=2 → (0,+1)
ArrowLeft  → d=4 → (-1,0)
ArrowRight → d=6 → (+1,0)
ArrowUp    → d=8 → (0,-1)
```

`action="up"` and `repeat=true` do not move in M14. No keyboard.state timer loop, key-repeat game loop, Scheduler or Tick abstraction is introduced.

One accepted non-repeat key-down means exactly one tile movement attempt：

```text
set authoritative facing direction = d
→ evaluate first-slice passability
→ if passable: update x/y by one tile
→ if blocked: keep x/y unchanged
→ recompute camera/render state
→ RenderDomain.replace(...)
```

Blocked movement still changes/retains facing to the attempted direction; position stays unchanged.

WC/DOM code MUST NOT listen to keydown and mutate map authority directly. M14 qualification uses an existing/synthetic `RendererInputSource`; real BrowserWindow DOM Keyboard/Pointer/Gamepad producer realization belongs to M15.

## 7. First-slice RMXP passability

M14 implements a narrow but real RMXP-compatible tile passability subset. It does not implement event collision, through/debug movement, terrain effects or map transitions.

Direction passage bits：

```text
down  d=2 → 0x01
left  d=4 → 0x02
right d=6 → 0x04
up    d=8 → 0x08
```

For one map coordinate `(x,y)` and direction `d`, `mapTilePassable(x,y,d)` is frozen as：

```text
if (x,y) outside map
    false

bit = passage bit for d

for z in [2, 1, 0]:
    tileId = Map.data[x,y,z]
    missing/invalid tileId → false

    passage = Tileset.passages[tileId]
    priority = Tileset.priorities[tileId]

    if (passage & bit) != 0
        false

    if (passage & 0x0f) == 0x0f
        false

    if priority == 0
        true

return true
```

One player movement from `(x,y)` in `d` computes target `(nx,ny)` and requires both：

```text
mapTilePassable(x,  y,  d)
AND
mapTilePassable(nx, ny, 10 - d)
```

Target outside map is blocked. This preserves the RMXP source-side “leave source / enter target from reverse direction” semantics while deliberately excluding Event collision from M14 first slice.

`passages` / `priorities` are ordinary projected RGSS Table values; no `CollisionMap`, `PassabilityService`, `TileRepository` or derived blocked-grid cache is part of the public design.

## 8. Tile rendering subset

M14 first presentation slice intentionally supports a small regular-tile subset sufficient to prove real `Map.data + Tileset resource → pixels` semantics：

```text
tileId = 0         → transparent / no draw
tileId >= 384      → regular Tileset tile
tileId 48..383     → RMXP autotile; NOT required by M14 first slice
other unsupported  → fail first-slice qualification rather than guess
```

Regular tile source rectangle is frozen：

```text
sx = ((tileId - 384) % 8) * 32
sy = floor((tileId - 384) / 8) * 32
sw = 32
sh = 32
```

Visible regular tiles draw in `z=0 → 1 → 2` order onto the private map Canvas.

M14 CI fixture visible window MUST use only transparent tile `0` and regular tiles `>=384`, and MUST avoid priority-over-player visuals. Autotile composition and priority-over-entity rendering are explicit nonclaims; if exact v21.1 compatibility cannot produce a meaningful first slice without them, that is real consumer evidence to add the smallest missing map behavior rather than a reason to build a generic TileRenderer framework upfront.

## 9. Fixed logical viewport / camera

M14 first slice has no DOM/layout feedback channel and no responsive runtime semantics.

Frozen constants：

```text
tileSize          = 32 logical CSS px
viewportWidth     = 640 CSS px
viewportHeight    = 480 CSS px
nominal grid      = 20 × 15 tiles
```

The concrete example fixes the physical host size in CSS. Runtime does not read DOM size and browser does not send resize/layout facts back to Runtime.

Camera is authoritative map Runtime state in logical pixels. First-slice center/clamp rule：

```text
cameraX = clamp(playerX * 32 - 304, 0, max(mapWidth  * 32 - 640, 0))
cameraY = clamp(playerY * 32 - 224, 0, max(mapHeight * 32 - 480, 0))
```

This places the player tile center at the classic 640×480 center `(320,240)` when not clamped.

Visible tile bounds are derived from the fixed viewport：

```text
minTileX = floor(cameraX / 32)
maxTileX = min(mapWidth  - 1, floor((cameraX + 639) / 32))
minTileY = floor(cameraY / 32)
maxTileY = min(mapHeight - 1, floor((cameraY + 479) / 32))
```

Tile screen position：

```text
screenX = tileX * 32 - cameraX
screenY = tileY * 32 - cameraY
```

Responsive viewport, Window resize, dynamic logical resolution and DOM→Runtime layout feedback are not M14 requirements. `devicePixelRatio` MAY affect private Canvas backing-store resolution but MUST NOT change these logical coordinates or business camera state.

## 10. RenderDomain identity / lifetime

M14 owns **exactly one business RenderDomain**, but it does **not** own or choose its wire `domainId` spelling.

Current M11 author API is：

```ts
scope.createRenderDomain(initialState)
```

The SDK assigns an opaque never-reused domain identity. Therefore：

```text
M14 runtime/browser/test MUST NOT require domainId == "map.main"
M14 MUST NOT reopen createRenderDomain() to accept an author domain id
qualification asserts exactly one current map Domain by topology/content, not by id spelling
```

The single domain is sufficient for viewport + player. Do not create tile/entity/layer Domains solely for visual structure.

## 11. Exact first-slice Render tree

The one map Domain has exactly：

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

Same live M13 identity means ordinary movement reuses the same `<lr-map-sprite>` HTMLElement. Browser code does not build a second authoritative entity tree.

## 12. Exact package-private Render data agreement

M14 does not create a public/versioned framework Map Render protocol, but Runtime and browser entries MUST share one exact package-owned JSON shape.

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

Player screen position is computed by Runtime from authoritative world/camera state：

```text
screenX = playerX * 32 - cameraX
screenY = playerY * 32 - cameraY
```

`pattern=0` is frozen for M14 because there is no gameplay clock/animation scheduler. Later real movement animation MAY extend map-private vocabulary based on consumer evidence; M14 does not invent a Tick API.

Render data MUST NOT contain source wrapper, filesystem path, URL, token, credential or raw resource bytes.

## 13. Map-owned Web Components

Exactly two business Custom Elements are required：

```text
<lr-map-view>
<lr-map-sprite>
```

`lr-map-view` owns：

```text
private Shadow DOM
fixed logical viewport realization
private <canvas class="tiles">
tileset decode/cache
regular tile source-rect drawing
entity overlay + <slot>
```

Private structure is semantically equivalent to：

```html
#shadow-root
  <div class="viewport">
    <canvas class="tiles"></canvas>
    <div class="entities"><slot></slot></div>
  </div>
```

`lr-map-sprite` owns player visual and character-sheet crop. For a normal RMXP 4×4 character sheet：

```text
frameWidth  = image width  / 4
frameHeight = image height / 4
column      = pattern (M14 = 0)
row         = (direction - 2) / 2
```

The sprite is visually bottom-center anchored to its 32×32 map cell using received `screenX/screenY`; the WC may realize this with a private `div`/background crop or Canvas. It MUST NOT alter authoritative world/camera coordinates.

Do not create first-slice：

```text
lr-map-tile
lr-map-layer
lr-map-camera
lr-map-input
lr-map-resource
lr-map-collision
lr-game-root
SceneGraph / component registry / layer manager
```

## 14. CSS ownership

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

Map component CSS MUST NOT make page/window composition decisions. Example CSS MUST NOT select Shadow DOM private classes.

M14 logical viewport size is fixed by the first-slice contract and realized by example CSS; there is no runtime viewport config object, ResizeObserver protocol or LayoutService.

## 15. Browser artifact

M13 bootstrap loads ordered classic `<script>` resources. Therefore the M14 browser artifact MUST be directly classic-script executable：

```text
no import/export syntax at browser execution time
no runtime ESM import graph
registers lr-map-view + lr-map-sprite through native customElements.define()
```

First-slice implementation freezes a deliberately simple artifact shape：

```text
game-libs/map/browser/map.browser.js
    one standalone browser source; no ESM imports

game-libs/map/browser/map.css
    component/default host CSS

package build
→ dist/browser/map.browser.js   classic JS, copied/materialized without module graph
→ dist/browser/map.css
```

Runtime TypeScript may continue normal ESM/tsc build separately. Do not reopen M13 loader to support modules merely for M14, and do not introduce a browser framework/bundler architecture. A later private build-tool change is allowed only if the produced artifact preserves the same classic-script boundary.

These artifacts MUST be included in `npm pack --dry-run` and enter prepared Content normally; tests may not direct-import browser source or call `customElements.define()` themselves.

## 16. First-slice non-goals / abstraction budget

M14 does not establish：

```text
MapNormalizedV1 / universal map schema
GameLibrary base framework
MapRepository / MapBundle / AssetManager
SceneGraph / LayerManager / component registry
runtime service locator
Content metadata API
responsive viewport protocol
DOM→Runtime layout feedback
game Tick/Scheduler/EventQueue
autotile framework
full priority-over-entity renderer
Event collision/interpreter
complete Pokémon Essentials gameplay
```

Allowed implementation nouns should remain concrete：

```text
map Definition
Map/Tileset JSON validators needed by first slice
small Table lookup helper
passability function
camera/visible-tile projection functions
lr-map-view / lr-map-sprite
standalone browser artifact
```

If implementation requires a new Manager/Registry/Repository/Provider/Resolver/Adapter/Pipeline/Builder/Factory/Service/Host/Platform/Scheduler solely to satisfy M14 elegance, stop and re-check whether the behavior can remain ordinary map-domain code.
