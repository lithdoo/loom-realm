# M14 / 04 — First Real Game Vertical

> 状态：Frozen for Implementation / M14 Pending

## Objective

证明一个 concrete game 能完整消费已经冻结的 LoomRealm seams，而不是重新设计 M10–M13：

```text
examples/essentials-v21.1/game.json
→ Game Package validation
→ one logical "map" Subsystem
→ @loomrealm-game/map long-lived gameplay Frame
→ Content + Input + one opaque RenderDomain
→ M13 Web Presentation
→ lr-map-view + lr-map-sprite
→ real Chromium playable first slice
```

M14/04 必须证明真实 map semantics，不允许“Content API读了一遍 + Renderer画了另一个假地图”。

## 1. Canonical end-to-end trace

Canonical CI vertical MUST cover：

```text
checked-in game.json
→ parse/validate existing GameEntryV1
→ initial target subsystemKey="map"
→ input { mapId:1, x:10, y:8, characterName:"m14_player" }
→ map initializes direction=2/down and pattern=0
→ test-owned logical-key → Definition binding
→ existing Main initial Frame
→ @loomrealm-game/map
→ ContentClient.record("Map", "1")
→ ContentClient.record("Tileset", "1")
→ validate exact Map/Tileset/Table shapes
→ tableAt(Map.data,...), tableAt(passages,...), tableAt(priorities,...)
→ ContentClient.resource("Graphics", "Tilesets/m14_tileset")
→ ContentClient.resource("Graphics", "Characters/m14_player")
→ capture contentVersion
→ create Frame-bound keyboard.event InputListener
→ create exactly one business RenderDomain
→ compute camera + canonical visible tiles[]
→ publish viewport/player tree
→ keep gameplay Frame pending
→ read checked-in presentation.json
→ existing M13 Config validation/preparation behavior
→ resolve package browser artifacts into prepared Content
→ classic map JS registers Custom Elements
→ window.onload
→ M13 Projector
→ body > lr-map-view > lr-map-sprite
→ PresentationResourceClient obtains real PNG bytes
→ private Canvas draws canonical tiles[]
→ player crop is visible
→ two ArrowRight non-repeat attempts through M10
→ first moves world/camera/map pixels; second blocked
→ same DOM element identities retained
```

RenderDomain wire id is SDK-assigned/opaque; no `map.main` expectation.

## 2. Gameplay Frame evidence

After initial render the map Frame MUST still be active/pending：

```text
Frame active
→ listener Interest current
→ initial Render visible
→ first input delivered to same Frame
→ second input delivered to same Frame
```

Returning `completed(...)` before movement fails M14. Test teardown may abort/close Frame/Runtime afterwards. RenderDomain lifetime stays independent per M11.

## 3. Exact projected Table evidence

Runtime consumes real projected Table objects：

```text
Map.data
    dimensions=3
    xSize=24
    ySize=18
    zSize=3
    values.length=1296

Tileset.passages/priorities
    dimensions=1
    ySize=1
    zSize=1
    xSize>=386
    values.length=xSize
```

All lookups use：

```text
tableAt(table,x,y,z)
index=x+y*xSize+z*xSize*ySize
```

Qualification MUST prove a non-zero coordinate, including：

```text
tableAt(Map.data,12,8,0)==385
```

No nested `[z][y][x]` fixture/runtime alternative.

## 4. Frozen CI content facts

```text
Map/1
    width=24
    height=18
    tileset_id=1
    z0 tile 384 throughout canonical tested area except (12,8)=385
    z1/z2 tile 0

Tileset/1
    id=1
    tileset_name="m14_tileset"
    tableAt(passages,384)=0x00
    tableAt(priorities,384)=0
    tableAt(passages,385)=0x02
    tableAt(priorities,385)=0
```

No `isBlocked`, `walkable`, collision bitmap, hard-coded coordinate rule or fake nested tile representation.

## 5. Exact input / movement observations

Only `keyboard.event`：

```text
first:  down ArrowRight repeat=false
(10,8), facing 2
→ facing 6
→ source/target passable
→ (11,8)

second: down ArrowRight repeat=false
(11,8), facing 6
→ tableAt(Map.data,12,8,0)=385
→ target reverse-entry left bit=0x02 blocked
→ remains (11,8), facing 6
```

`keyup`, repeat events, timers and keyboard.state polling are not substitutes.

After initialization the movement handler is synchronous：

```text
one accepted event
→ facing
→ passability
→ x/y
→ camera
→ full RenderDomain.replace(...)
→ handler returns
```

It MUST NOT await Content/resource/decode work or yield before the authoritative movement commit. M14 adds no queue/scheduler to serialize this path.

## 6. Fixed viewport / canonical Chromium environment

Example CSS computes `lr-map-view=640×480` CSS px. Runtime never reads DOM layout.

Canonical CI browser context：

```text
viewport=800×600 CSS px
deviceScaleFactor=1
```

Qualification-harness fact only; not a Runtime API.

Camera：

```text
(10,8) → camera=(16,32)
(11,8) → camera=(48,32)
blocked second right → camera remains (48,32)
```

Player screen-cell origin：

```text
initial (10,8), camera (16,32) → (304,224)
after move (11,8), camera (48,32) → (304,224)
```

The player remains centered for this interior movement. Qualification MUST NOT require `lr-map-sprite` screen placement to change. Visible movement is instead proved by world `x` changing, facing changing `2→6`, camera moving `16→48`, and map/Canvas content shifting 32 CSS px relative to the viewport. Canonical tile `(12,8)` moves from screen x `368` to `336`.

Because camera may be non-tile-aligned, nominal `20×15` is not a fixed visible coordinate count.

Initial intersecting bounds：

```text
camera=(16,32)
x=0..20   # 21 intersecting columns
y=1..15   # 15 rows
```

After first right move：

```text
camera=(48,32)
x=1..21   # 21 intersecting columns
y=1..15
```

The extra edge column is required because partial 32px cells intersect the 640px viewport.

## 7. Canonical visible-tile projection evidence

For each intersecting coordinate/layer Runtime calls `tableAt(Map.data,x,y,z)`.

Projection rules：

```text
tileId=0      → omitted from tiles[]
tileId>=384   → included
tileId 48..383 or another unsupported nonzero required value
              → canonical first slice fails closed
```

`tiles[]` order MUST be：

```text
z ascending
then y ascending
then x ascending
```

Thus browser drawing order is already authoritative and deterministic; `lr-map-view` does not sort/reinterpret RMXP layers.

At initial canonical state, with z1/z2 zero, `tiles[]` contains the non-zero z0 entries for `x=0..20,y=1..15` in y/x order. It is **not** required to contain exactly `20*15` entries.

## 8. Tile pixel evidence

Author-owned tileset PNG distinguishes：

```text
tile 384 → source x=0..31
tile 385 → source x=32..63
```

Drawing chain：

```text
tableAt(Map.data,...)
→ canonical tiles[]
→ Tileset resource/version
→ PresentationResourceClient bytes
→ decoded PNG
→ source rect sx/sy
→ destination x*32-cameraX, y*32-cameraY
→ private Canvas
→ expected pixels
```

Regular mapping：

```text
sx=((tileId-384)%8)*32
sy=floor((tileId-384)/8)*32
sw=sh=32
```

Canonical CI uses no required autotile or priority-over-player visual.

## 9. Exact Render topology / data

Exactly one map Domain：

```text
zIndex=0
root key="viewport" tag="lr-map-view"
└── key="player" tag="lr-map-sprite"
```

Node data exactly follows M14/02：

```text
view:
  mapId,mapWidth,mapHeight,cameraX,cameraY
  tileset {namespace,key,contentVersion}
  canonical ordered tiles[] {x,y,z,tileId}

player:
  x,y,screenX,screenY,direction,pattern=0
  sprite {namespace,key,contentVersion}
```

Runtime publishes current full domain state with `replace(...)`; no map-private delta protocol is introduced. No path/URL/token/credential/bytes/importer wrapper.

## 10. DOM / Web Component evidence

Chromium observes：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

`lr-map-view` owns private Shadow DOM tile Canvas + entity overlay/slot; player remains M13-managed light DOM. No tile-per-WC tree.

Same element identities survive both movement attempts.

Canonical first movement evidence is：

```text
world player x: 10 → 11
facing: 2 → 6
cameraX: 16 → 48
player screen origin: stays (304,224)
map/Canvas pixels: shift left by 32 CSS px relative to viewport
```

Blocked second movement leaves world x/y, camera, player screen origin and map placement unchanged while facing remains right.

## 11. Player resource / crop

Browser gets `Graphics/Characters/m14_player` through PresentationResourceClient.

Canonical sheet：128×128, 4×4, frame 32×32. General RMXP-compatible crop：

```text
frameWidth=imageWidth/4
frameHeight=imageHeight/4
column=pattern=0
row=(direction-2)/2
visualLeft=screenX+(32-frameWidth)/2
visualTop=screenY+32-frameHeight
```

No CSS color-box substitute; no walking Tick/Scheduler required.

## 12. Presentation Config / package artifact bootstrap

The test reads checked-in `examples/essentials-v21.1/presentation.json` and uses existing M13 validation/preparation behavior.

Prepared source artifacts are resolved through：

```text
@loomrealm-game/map/browser/map.css
@loomrealm-game/map/browser/map.browser.js
```

then materialized under Config logical refs：

```text
Presentation / map/map.css
Presentation / essentials/page.css
Presentation / map/map.browser.js
```

Map JS executes as classic script and registers both tags before Projector startup.

No direct browser-source import, manual tag registration, replacement CSS, manual DOM or package-private map path reach-through.

## 13. M13 qualification-composition boundary

M13's Web Projector/bootstrap/config-preparation implementation is intentionally not a public Renderer root API. M14 does not reopen that package surface.

Frozen rule：

```text
game-libs/map code
examples/essentials-v21.1 business/runtime/browser code
    MUST NOT import Renderer internal paths

repository-owned M14 qualification harness
    MAY reuse packages/renderer/dist/internal/* M13 composition mechanics
    solely to assemble/drive the test Window
```

This mirrors M13's own repository qualification mechanics and is not an author/product integration API. No wrapper package or public presentation service is created for M14. M15 owns the production Desktop Window integration seam.

## 14. Physical composition boundary

M14 uses existing Main/Subsystem/Data/Renderer/Content + existing/synthetic RendererInputSource + real Chromium.

M15 owns Hostra Node Runner child, Electron BrowserWindow, real DOM Keyboard/Pointer/Gamepad source and reload/reconnect/shutdown physical E2E. No M14 MiniDesktopHost/MapHost/GameRuntimeHost.

## 15. Local exact-v21.1 evidence

Local selected slice must use existing importer → M14 consumer projection → actual Table objects → prepared FSDB → same map Runtime/fixed viewport/passability/visible-tile/browser code.

A local PASS requires：

```text
exact source fingerprint/version accepted
→ selected Map/Tileset successfully projected
→ actual projected Table consumed by same runtime code
→ selected tileset raw resource resolves
→ selected character raw resource resolves
→ same @loomrealm-game/map Runtime starts
→ same M13 Chromium presentation starts
→ at least one real regular source tile is visibly derived from source bytes
→ real player sprite is visible
→ one non-repeat directional input traverses M10
→ resulting world state agrees with persisted passability facts
```

The local path need not prove both passable and blocked branches; canonical CI deterministically proves both. Decoded Ruby/RPG objects may not cross into Runtime.

If meaningful exact-corpus evidence necessarily needs unsupported autotile/priority behavior, fail explicitly and implement the smallest real missing behavior before M14 Closed, or select another meaningful supported slice.

## 16. Async presentation/resource currentness

WC keeps latest received full data and treats resource loading/decoding as stale-able private work.

```text
receiveRenderContext
→ retain M13 context

receiveRenderData(data)
→ validate/store latest full data
→ advance private data generation if used
→ request/decode missing resource

async resource/decode completion
→ may populate matching resource/version cache
→ repaint from latest retained data
  OR paint only when captured data generation is still current
```

A matching image resource/version alone is NOT enough to authorize an old paint. Qualification must cover at least one delayed-resource case where a newer render data value arrives while the same tileset/sprite resource version remains unchanged; when decode completes, visible pixels/state MUST represent the newer data, not captured old camera/tiles/direction.

No fake fallback pixels or AssetManager abstraction.

## 17. Failure / diagnostics

Optional lightweight update/node/input-to-visible timings are allowed; no profiler framework.

Fail closed on invalid Map/Tileset/Table shape, missing resource, unsupported required tile kind, tag/bootstrap failure or invalid Render state. Do not insert semantic defaults.

## Closure question

M14/04 passes only if a checked-in concrete game can keep one gameplay Frame alive, consume real projected Map/Tileset facts through ContentClient/`tableAt`, derive canonical intersecting regular-tile pixels and RMXP-compatible passability, synchronously update authoritative player/camera state from M10 input, and project current full state through one opaque SDK-owned RenderDomain into stable `lr-map-view → lr-map-sprite` elements through real M13 bootstrap in deterministic Chromium, with centered-player camera behavior and async presentation currentness both proven.
