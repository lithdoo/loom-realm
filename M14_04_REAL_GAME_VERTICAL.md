# M14 / 04 — First Real Game Vertical

> 状态：Implementation Landing / M14 Pending

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
→ test-owned logical-key → Definition binding
→ existing Main initial Frame
→ @loomrealm-game/map
→ ContentClient.record("Map", "1")
→ ContentClient.record("Tileset", "1")
→ validate exact first-slice Map/Tileset/Table shapes
→ tableAt(Map.data,...), tableAt(passages,...), tableAt(priorities,...)
→ ContentClient.resource("Graphics", "Tilesets/m14_tileset")
→ ContentClient.resource("Graphics", "Characters/m14_player")
→ capture contentVersion for both
→ create Frame-bound keyboard.event InputListener
→ create exactly one business RenderDomain
→ publish viewport/player Render tree
→ keep gameplay Frame pending
→ read checked-in presentation.json
→ existing M13 Config validation/preparation
→ prepared Content resolves map CSS + example CSS + classic map browser JS
→ native Custom Element registration
→ window.onload
→ M13 Projector
→ body > lr-map-view > lr-map-sprite
→ PresentationResourceClient obtains real PNG bytes
→ private Canvas draws regular tiles
→ player resource crop becomes visible
→ two ArrowRight non-repeat input attempts through M10
→ first moves player
→ second is blocked by Tileset passage facts
→ same DOM element identities retained
```

The RenderDomain wire id is SDK-assigned and opaque. Qualification MUST NOT expect `map.main` or another spelling.

## 2. Gameplay Frame evidence

After initial load/render, the map Frame MUST still be active/pending before input is sent：

```text
initial Frame active
→ listener Interest current
→ initial Render visible
→ first input delivered to same live Frame
→ second input delivered to same live Frame
```

A Definition that returns `completed(...)` immediately after initial rendering fails M14. Test teardown may abort/close the Frame and Runtime after observations. RenderDomain lifetime remains independent per M11.

## 3. Exact projected Table evidence

The vertical MUST consume actual projected RGSS Table objects, not JS multidimensional arrays or fixture shortcuts.

`Map/1.data`：

```text
dimensions=3
xSize=24
ySize=18
zSize=3
values.length=1296
```

`Tileset/1.passages` and `priorities`：

```text
dimensions=1
ySize=1
zSize=1
xSize>=386
values.length=xSize
```

All lookups use the M14/02 convention：

```text
tableAt(table,x,y,z)
index=x+y*xSize+z*xSize*ySize
```

The test MUST include a non-zero coordinate assertion that proves `(12,8,0)` resolves the fixture tile `385` through the actual flattened `values` representation.

## 4. Frozen CI content facts

Repository-owned fixture：

```text
Map/1
    width=24
    height=18
    tileset_id=1

z=0
    tile 384 in tested/visible area
    tile 385 at (12,8)
z=1/z=2
    tile 0

Tileset/1
    id=1
    tileset_name="m14_tileset"
    tableAt(passages,384)=0x00
    tableAt(priorities,384)=0
    tableAt(passages,385)=0x02
    tableAt(priorities,385)=0
```

The test MUST NOT add `isBlocked`, `walkable`, a collision bitmap, nested fake tile arrays or a hard-coded `x==12` rule.

## 5. Exact input / movement observations

Only `keyboard.event` is used.

First attempt：

```text
action="down"
code="ArrowRight"
repeat=false

start=(10,8), facing=2
→ set facing=6
→ source right passable
→ target (11,8) reverse-entry left passable
→ authoritative position=(11,8)
```

Second attempt：

```text
action="down"
code="ArrowRight"
repeat=false

start=(11,8), facing=6
→ target (12,8)
→ tableAt(Map.data,12,8,0)=385
→ reverse-entry direction left=0x02
→ tableAt(passages,385) blocks
→ authoritative position remains (11,8), facing=6
```

`keyup`, `repeat=true`, timer movement and keyboard.state polling are not accepted substitutes.

## 6. Fixed viewport / canonical Chromium environment

Example CSS computes：

```text
lr-map-view width  = 640px
lr-map-view height = 480px
```

Runtime never reads DOM layout.

Canonical CI Chromium page uses deterministic presentation conditions：

```text
viewport width  = 800 CSS px
viewport height = 600 CSS px
deviceScaleFactor = 1
```

This gives the example-owned centered 640×480 map enough space and makes Canvas pixel assertions deterministic. These are qualification-harness facts, not a runtime viewport API.

Expected camera：

```text
player (10,8) → cameraX=16, cameraY=32
player (11,8) → cameraX=48, cameraY=32
blocked second right → camera remains 48,32
```

No resize/reflow path is exercised as business input.

## 7. Tile semantic evidence

At least two visible source cells are distinguishable in the author-owned tileset PNG：

```text
tile 384 → source x=0..31
 tile 385 → source x=32..63
```

Actual drawing chain：

```text
tableAt(Map.data,x,y,z)
→ tileId
→ Tileset resource ref/version
→ PresentationResourceClient bytes
→ decode PNG
→ sx=((tileId-384)%8)*32
→ sy=floor((tileId-384)/8)*32
→ destination x*32-cameraX, y*32-cameraY
→ private lr-map-view Canvas
→ observable expected pixels
```

The canonical visible slice uses tile `0` and regular tile ids `>=384`. Autotiles and priority-over-player visuals are not silently approximated.

## 8. Exact Render topology / data evidence

Exactly one current map Domain：

```text
zIndex=0
root key="viewport" tag="lr-map-view"
└── key="player" tag="lr-map-sprite"
```

Qualification locates it by subsystem + tree, never domainId spelling.

Node data must match M14/02 exact package-private shapes：

```text
view
    mapId/mapWidth/mapHeight
    cameraX/cameraY
    tileset {namespace,key,contentVersion}
    tiles[] {x,y,z,tileId}

player
    x/y
    screenX/screenY
    direction
    pattern=0
    sprite {namespace,key,contentVersion}
```

No path, URL, token, credential, raw resource bytes or importer wrapper appears in Render state.

## 9. DOM / Web Component evidence

Chromium observes：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

`lr-map-view` owns private Shadow DOM with tile Canvas + entity overlay/slot. Player remains M13-managed light DOM. No per-tile RenderNode/WC explosion.

Identity assertions：

```text
initial lr-map-view === post-movement lr-map-view
initial lr-map-sprite === post-movement lr-map-sprite
```

First movement changes the same sprite's received/visible placement. Blocked movement keeps x/y, camera and placement unchanged while facing remains right.

## 10. Player resource / crop evidence

Browser obtains `Graphics/Characters/m14_player` through PresentationResourceClient.

Canonical 128×128 fixture sheet：

```text
4 columns × 4 rows
frame size=32×32
pattern=0
row=(direction-2)/2
```

For general RMXP-compatible image dimensions the WC derives `frameWidth=imageWidth/4`, `frameHeight=imageHeight/4` and anchors the selected frame to the bottom-center of the received 32×32 map cell：

```text
visualLeft = screenX + (32-frameWidth)/2
visualTop  = screenY + 32-frameHeight
```

A CSS color box or alternate test image does not satisfy the resource vertical. Smooth walking animation is not required.

## 11. Presentation Config / bootstrap evidence

The test MUST read checked-in：

```text
examples/essentials-v21.1/presentation.json
```

and pass it through existing M13 Config validation/preparation.

Required refs/order：

```text
styles
    Presentation / map/map.css
    Presentation / essentials/page.css
scripts
    Presentation / map/map.browser.js
```

Map JS executes as classic script and registers both tags through native `customElements.define()` before Projector start.

Qualification may not direct-import browser source, define tags in test code, inject replacement CSS, build DOM manually instead of Projector, or use privileged resource shortcuts.

## 12. Physical composition boundary

M14 uses：

```text
existing Main
existing Subsystem runtime
existing Data/Renderer/Content
existing or synthetic RendererInputSource
real Chromium
```

M15 owns Hostra Node Runner child, Electron BrowserWindow, real DOM Keyboard/Pointer/Gamepad source and reload/reconnect/shutdown physical E2E. M14 does not create MiniDesktopHost/MapHost/GameRuntimeHost.

## 13. Local exact-v21.1 evidence

Local qualification may select source map/spawn/character, but after selection must use：

```text
existing importer
→ M14 consumer projection
→ actual projected Table objects
→ prepared FSDB
→ same @loomrealm-game/map Runtime
→ same fixed viewport/passability/regular-tile implementation
→ same browser artifacts
```

It may not pass decoder objects directly to Runtime. If a meaningful selected exact-corpus slice requires currently unsupported autotile/priority behavior, fail explicitly and implement the smallest real missing behavior before M14 Closed.

## 14. Async presentation/resource currentness

M13 may deliver Render data before a WC finishes decoding a resource. Map WC implementation therefore keeps only latest received data as presentation-local state and treats resource loading as cancellable/stale-able private work：

```text
receiveRenderContext(context)
→ retain only M13 presentation context

receiveRenderData(data)
→ validate/store latest data
→ request resource by namespace/key/contentVersion as needed
→ on async completion, paint only if the relevant resource ref/version is still current
→ otherwise ignore stale completion
```

This does not create business authority, an AssetManager or a new protocol. Resource failure has no fake fallback pixels; qualification fails the visible evidence.

## 15. Diagnostics / failure policy

Optional lightweight diagnostics may record update count, node count and representative input-to-visible latency. No profiler framework.

Fail closed on invalid Map/Tileset/Table shape, missing resource, unsupported required tile kind, browser tag failure or invalid Render state. Do not insert semantic defaults.

## Closure question

M14/04 passes only if the answer is yes：

> Can the checked-in concrete game keep one valid gameplay Frame alive, consume real projected `Map/1` + `Tileset/1` facts through `ContentClient`/`tableAt`, derive regular-tile pixels and RMXP-compatible passability, update authoritative player/camera state from M10 input, and project through one opaque SDK-owned RenderDomain into stable `lr-map-view → lr-map-sprite` elements loaded through the real M13 bootstrap in deterministic Chromium?
