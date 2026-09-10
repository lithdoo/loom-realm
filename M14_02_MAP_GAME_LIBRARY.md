# M14 / 02 — Map Game Library

> 状态：**Implemented / contract frozen; formal requalification pending**
> Closure authority：formal M14 status and current qualification evidence live only in `doc/30-implementation/m14-qualification.md`. This file freezes the implemented map consumer contract; it does not independently claim milestone closure.
> 规范优先级：本文是 M14 map consumer 的 implementation freeze；更早 milestone 中 future-looking 的 Desktop input、author-chosen RenderDomain id 等表述，以本文和 M14/04–05 为准。

## Objective

实现第一个 reusable game-domain library：

```text
game-libs/map
@loomrealm-game/map
```

它消费 M10–M13 已冻结能力，不把地图业务吸收到 LoomRealm core，也不为 first slice 建第二套 map framework。

## 1. Package / execution boundary

同一 package 有两个隔离 execution side：

```text
Runtime side
    → imports only @loomrealm/subsystem public author API
    → owns map/world business state
    → uses Content / Input / Render

Browser side
    → standalone classic browser artifact
    → owns lr-map-view / lr-map-sprite
    → uses M13 structural receiver ABI + PresentationResourceClient
```

Runtime side不得 import Renderer、Main、Platform、DOM、Data/Wire internals、FSDB physical API 或 importer/tooling。Browser side不得获得 Subsystem business object、RenderDomain writer、Main/Data authority或 physical Content credential。

M14 first slice exactly one logical business Subsystem：

```text
subsystemKey = "map"
```

Player、tile、camera不是额外 Subsystem。真实 Hostra Node Runner child 属于 M15。

`@loomrealm-game/map` root default export = map `SubsystemDefinitionFactory`。Import root MUST NOT execute browser/DOM code。Browser artifact subpaths由 M14/01 冻结。

## 2. Content authority / exact Runtime records

RMXP/Essentials 提供 source semantics；Runtime只读取 M14 selective consumer records：

```text
Map/{mapId}
Tileset/{tilesetId}
```

精确 consumer projection由：

```text
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

拥有。

M14 first-slice `Map/{id}` 只需要：

```text
tileset_id
width
height
data
```

`Tileset/{id}` 只需要：

```text
id
tileset_name
passages
priorities
```

Unused RMXP facts（events、BGM/BGS、encounters、autotile names、terrain tags、MapInfo/MapMetadata 等）不进入 first-slice consumer view；既有 importer/lossless path继续保存 source fidelity。

Runtime MUST NOT理解 Ruby Marshal、`.rxdata`、RmxpObject、Ruby wrapper、`$id/$ref/$typed`、tool filesystem layout或 Host storage identity。

`Map/{id}`、`Tileset/{id}` 与 `Graphics/...` 是下文的 semantic shorthand。通过现有 M12 FSDB Content seam 读取时，exact public namespaces 是：

```text
ContentClient.record("struct.Map", id)
ContentClient.record("struct.Tileset", id)
ContentClient.resource("resource.Graphics", key)
```

Map Runtime直接使用这些 production namespaces；qualification 不得在 ContentClient 外再造去前缀 adapter。

## 3. Exact required shapes

`Map/{id}`：

```text
width       positive safe integer
height      positive safe integer
tileset_id  positive safe integer
data        projected RGSS Table
```

`Map.data`：

```text
dimensions=3
xSize=width
ySize=height
zSize=3
values.length=width*height*3
```

`Tileset/{id}`：

```text
id            positive safe integer equal to Content key
tileset_name  non-empty semantic resource name
passages      projected 1D RGSS Table
priorities    projected 1D RGSS Table
```

Both 1D tables：

```text
dimensions=1
ySize=1
zSize=1
values.length=xSize
xSize > every tileId inspected by the selected slice
```

Missing/malformed required facts fail closed。Runtime不接受 fixture-only alternate shape。

## 4. RGSS Table access

Projected Table是普通对象，不是 nested JS array。

```text
index(x,y,z)=x+y*xSize+z*xSize*ySize
```

允许一个 package-local helper：

```ts
tableAt(table, x, y = 0, z = 0)
```

它只做范围校验、冻结索引计算和取值。不要建立 Runtime Table class/framework 或第二种 flattening convention。

## 5. Initial input / initial state

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

Rules：`mapId` positive safe integer；`x/y` non-negative safe integers inside loaded Map；`characterName` non-empty semantic resource name。

Package-owned initial state：

```text
direction=2/down
pattern=0
```

Player resource logical identity：

```text
resource.Graphics / Characters/{characterName}
```

M14 不引入 RPG::System/Trainer startup compatibility。

## 6. Gameplay Frame lifetime

Initial map Frame is long-lived：

```text
activate
→ validate input
→ load/validate Map + Tileset
→ validate spawn
→ confirm tileset/player resources + capture contentVersion
→ create one Frame-bound keyboard.event InputListener
→ create one business RenderDomain
→ publish initial full Render state
→ remain pending while frame.signal is live
```

Gameplay input仍需要时，frame handler MUST NOT return `completed(...)`。Teardown 结束 pending wait；RenderDomain lifetime 仍按 M11 独立语义处理。

不要为 Frame 再建第二个 Domain、game loop或 Scheduler。

## 7. Resource identity / version

Tileset：

```text
tileset_name
→ resource.Graphics / Tilesets/{tileset_name}
```

Player：

```text
characterName
→ resource.Graphics / Characters/{characterName}
```

Runtime 使用现有 `ContentClient.resource()` 证明资源存在并取得 `contentVersion`；无需长期保存 bytes。Render 只携带：

```text
{namespace,key,contentVersion}
```

Browser 再通过 M13 PresentationResourceClient 取 bytes。

Runtime/Renderer 重复读取同一资源可接受；M14 不新增 metadata/HEAD API、AssetManager 或 URL escape hatch。

## 8. Directional input / ordering

Only channel：

```text
keyboard.event
```

Only movement event：

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

`up` / `repeat=true` do not move。

After initialization the movement handler is synchronous：

```text
accepted event
→ set facing
→ evaluate passability
→ update x/y when passable
→ recompute camera + visible tiles
→ RenderDomain.replace(current full state)
→ return
```

Blocked movement keeps attempted facing and original position。Handler MUST NOT await Content/resource/decode work or yield before authoritative commit。M14 不新增 EventQueue/Scheduler。

M14 uses existing/synthetic RendererInputSource。Real Desktop DOM input belongs to M15。WC code never mutates business coordinates from DOM events。

## 9. RMXP passability first slice

Directional bits：

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

Move in `d` requires：

```text
source passable in d
AND
target passable in 10-d
```

Out-of-bounds target blocks。

M14 excludes event collision、through/debug movement、terrain effects、map transitions。不要建立 CollisionMap、PassabilityService、TileRepository 或 derived blocked grid。

## 10. Tile rendering subset

Canonical first slice：

```text
tileId=0       → transparent / omitted
tileId>=384    → regular Tileset tile
tileId 48..383 → autotile not required by canonical CI
other required unsupported kind → fail closed
```

Regular source rectangle：

```text
sx=((tileId-384)%8)*32
sy=floor((tileId-384)/8)*32
sw=32
sh=32
```

Runtime visible projection orders layers `z=0 → 1 → 2`。Canonical fixture avoids priority-over-player visuals。

If exact local v21.1 evidence genuinely requires autotile/priority behavior, implement only the smallest required behavior before formal M14 closure；不要先建 generic TileRenderer framework。

## 11. Fixed viewport / camera

Frozen first-slice constants：

```text
tileSize=32 logical CSS px
viewportWidth=640 CSS px
viewportHeight=480 CSS px
nominal fully-visible grid=20×15 tiles
```

Example CSS fixes host size。Runtime never reads DOM size；browser never feeds layout/resize back。

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

A non-tile-aligned camera may intersect an extra edge column/row；`20×15` is not a fixed `tiles.length`。

Tile destination：

```text
screenX=tileX*32-cameraX
screenY=tileY*32-cameraY
```

Canonical interior move keeps player screen-cell origin centered while camera/map moves：

```text
player (10,8), camera (16,32) → screen (304,224)
player (11,8), camera (48,32) → screen (304,224)
```

Responsive layout、ResizeObserver protocol、DOM→Runtime feedback are non-goals。

## 12. Visible-tile projection

Runtime owns exact current `tiles[]` sent to `lr-map-view`。

For every intersecting `(x,y,z)` with `z∈{0,1,2}`：

```text
tileId=tableAt(Map.data,x,y,z)
0       → omit
>=384   → include {x,y,z,tileId}
48..383 or another required unsupported nonzero value → fail closed
```

Canonical order：

```text
z ascending
then y ascending
then x ascending
```

Browser draws received order；it does not query Map/Tileset or reconstruct/sort RMXP semantics。

## 13. RenderDomain / exact tree

Exactly one business RenderDomain。SDK assigns opaque wire id：

```text
no "map.main"
no d1/d2 spelling contract
no createRenderDomain API reopen
```

Exact Render tree：

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

Ordinary movement retains same live HTMLElements。

## 14. Exact package-private Render data

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

Player cell origin：

```text
screenX=playerX*32-cameraX
screenY=playerY*32-cameraY
```

Runtime publishes current full `RenderDomainState` through `replace(...)`；M14 defines no map delta protocol。M11/M13 may optimize transport internally；WC receives current full node data per M13 ABI。

## 15. Map-owned Web Components

Exactly two business tags：

```text
lr-map-view
lr-map-sprite
```

`lr-map-view` MUST privately provide：

```text
640×480 logical tile drawing surface
clipping
tileset decode/cache
entity overlay
slot for M13-managed light-DOM children
```

The exact private Shadow DOM wrapper/class topology is **not normative**。A simple implementation may use a Shadow root with Canvas + slot/overlay, but qualification must not depend on private wrapper names or unnecessary nesting。

Every map paint represents the latest full `MapViewRenderData` and therefore MUST：

```text
1. clear the full logical 640×480 tile Canvas
2. draw current retained tiles[] in received canonical order
```

Do not retain stale tile pixels and do not add dirty-rectangle/tile-patch state for M14。

`lr-map-sprite` owns player visual and RMXP 4×4 character-sheet crop：

```text
frameWidth=imageWidth/4
frameHeight=imageHeight/4
column=pattern=0
row=(direction-2)/2

visualLeft=screenX+(32-frameWidth)/2
visualTop=screenY+32-frameHeight
```

WC may use private div/background crop or Canvas。It cannot alter authoritative world/camera state。

No per-tile WC、SceneGraph、LayerManager、component registry、camera/input/resource/collision components。

## 16. CSS / Canvas / browser artifact

Ownership：

```text
@loomrealm-game/map
    → component/default host CSS
    → private Shadow styles/mechanics

examples/essentials-v21.1
    → page/window CSS
    → fixed 640×480 host placement
```

Canonical logical Canvas = 640×480。At DPR=1 backing store = 640×480。Private HiDPI backing-store scaling is allowed only if logical coordinates remain fixed。Pixel-art drawing disables image smoothing。

M13 loads classic `<script>`。Package output：

```text
dist/browser/map.browser.js
    → no import/export at execution time
    → native customElements.define for both tags

dist/browser/map.css
```

External artifact discovery uses M14/01 package subpaths。M14 does not reopen M13 into an ESM loader。

## 17. Async browser resource currentness

Each WC retains latest full data。Async resource/decode work is stale-able private work：

```text
receiveRenderData(data)
→ validate/store latest data
→ request/decode missing resource as needed

async completion
→ may populate matching resource/version cache
→ repaint from latest retained data
  OR paint only when an equivalent private data-generation check is still current
```

Matching `{namespace,key,contentVersion}` alone is insufficient because camera/tiles/direction may have changed while image identity stayed the same。

Old captured camera/tiles/screen position/direction MUST NOT repaint over newer state。Resource failure produces no fake fallback pixels。

Do not create AssetManager or new protocol for this private bookkeeping。

## 18. Implementation budget / non-goals

A good M14 implementation should remain close to：

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
```

Not established：

```text
MapNormalizedV1 / universal map schema
MapRepository / MapBundle
GameLibrary framework
AssetManager / ResourceProvider
SceneGraph / LayerManager / registry
PlayerController / MovementManager
service locator / Context service
Content metadata API
responsive layout service
Tick / Scheduler / EventQueue
autotile framework
Event interpreter/collision framework
full Essentials gameplay
```

Private helper names/files are implementation choices unless a behavior above makes them observable.
