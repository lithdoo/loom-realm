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

## 1. Required end-to-end trace

Canonical CI vertical MUST cover exactly this path：

```text
example game.json
→ parse/validate existing GameEntryV1
→ initial target subsystemKey="map"
→ input { mapId:1, x:10, y:8, characterName:"m14_player" }
→ test-owned logical-key → Definition binding
→ existing Main initial Frame
→ @loomrealm-game/map
→ ContentClient.record("Map", "1")
→ ContentClient.record("Tileset", "1")
→ validate frozen Table/record semantics
→ ContentClient.resource("Graphics", "Tilesets/m14_tileset")
→ ContentClient.resource("Graphics", "Characters/m14_player")
→ capture contentVersion for both resources
→ create Frame-bound keyboard.event InputListener
→ create exactly one business RenderDomain
→ publish viewport/player Render tree
→ keep gameplay Frame pending
→ prepared Content loads map CSS, example CSS, classic map browser JS
→ native customElements registration
→ window.onload
→ M13 Projector
→ body > lr-map-view > lr-map-sprite
→ PresentationResourceClient obtains real image bytes
→ map private Canvas draws real regular tiles
→ player sprite is visibly rendered
→ two ArrowRight non-repeat input attempts through M10
→ first attempt moves player
→ second attempt is blocked by Tileset passage facts
→ same DOM element identities retained
```

The RenderDomain wire id is SDK-assigned and opaque. Qualification MUST NOT expect `map.main` or any other spelling.

## 2. Gameplay Frame evidence

After initial load/render the map Frame MUST still be active/pending before test input is sent.

Qualification must prove ordering：

```text
initial Frame active
→ listener Interest current
→ initial Render visible
→ first input delivered to same live Frame
→ second input delivered to same live Frame
```

A Definition that returns `completed(...)` immediately after initial rendering fails M14 even if the first DOM appeared, because the later movement path would not be a valid Frame-bound M10 input path.

Test teardown may abort/close the Frame and Runtime after observations complete. RenderDomain lifetime remains independent per M11; M14 must not introduce Frame→Domain implicit ownership.

## 3. Frozen CI content facts

The vertical uses the repository-owned fixture from M14/03：

```text
Map/1
    width=24
    height=18
    tileset_id=1
    spawn=(10,8)

z0
    tile 384 in tested area
    tile 385 at (12,8)
z1/z2
    tile 0

Tileset/1
    tileset_name="m14_tileset"
    passages[384]=0x00
    priorities[384]=0
    passages[385]=0x02
    priorities[385]=0
```

The test MUST NOT add an `isBlocked`, `walkable`, collision bitmap or other derived truth that bypasses M14/02 passability.

## 4. Exact input / movement observations

Only `keyboard.event` is used.

### First attempt

```text
action="down"
code="ArrowRight"
repeat=false

start position = (10,8)
set facing = 6
source passability for right = true
target (11,8) reverse-entry passability for left = true
→ authoritative position = (11,8)
```

### Second attempt

```text
action="down"
code="ArrowRight"
repeat=false

start position = (11,8)
set facing = 6
target (12,8) uses tile 385
reverse-entry direction = left = 0x02
passages[385] blocks it
→ authoritative position remains (11,8)
```

`keyup` and `repeat=true` are not movement evidence. No timer/repeat loop may be substituted.

## 5. Camera / fixed viewport observations

Example CSS must compute to：

```text
lr-map-view width  = 640px
lr-map-view height = 480px
```

Runtime must not inspect DOM layout.

Expected camera facts from M14/02：

```text
initial player (10,8)
→ cameraX=16
→ cameraY=32

position (11,8)
→ cameraX=48
→ cameraY=32
```

The blocked second movement leaves camera and player screen position unchanged because x/y do not change.

The vertical does not resize the browser viewport as a business input and does not require responsive/reflow behavior.

## 6. Tile semantic evidence

At least one actually visible Canvas tile MUST be derived from persisted facts：

```text
Map.data[x,y,z]
→ frozen RGSS Table index
→ tileId >= 384
→ Tileset logical image resource
→ source rect
    sx=((tileId-384)%8)*32
    sy=floor((tileId-384)/8)*32
→ screen coordinate from camera
→ private lr-map-view Canvas
→ observable pixels
```

Qualification should choose tile 384 and tile 385 with visually distinct author-owned source cells so it can prove that the tile identity, not a fixed painted rectangle, determines the result.

The CI visible slice uses only tile `0` and regular tiles `>=384`. Autotile composition and priority-over-player drawing are not silently approximated.

## 7. Exact Render topology / data evidence

There is exactly one current map business Domain with：

```text
zIndex=0

root key="viewport" tag="lr-map-view"
└── key="player" tag="lr-map-sprite"
```

Qualification locates it by current subsystem topology + node contents, not by domainId spelling.

Initial and updated node `data` must match the exact M14/02 package-private shapes. In particular：

```text
view data
    mapId/mapWidth/mapHeight
    cameraX/cameraY
    tileset namespace/key/contentVersion
    exact visible regular tile projection

player data
    x/y
    screenX/screenY
    direction
    pattern=0
    sprite namespace/key/contentVersion
```

No path, URL, token, credential or raw bytes may appear anywhere in Render state.

## 8. DOM / Web Component evidence

Real Chromium must observe：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

`lr-map-view` must own a private Shadow DOM containing a private tile Canvas and an entity slot/overlay. The player remains M13-managed light DOM projected through the slot.

No per-tile RenderNode or `<lr-map-tile>` explosion is allowed.

Same live identity requirements：

```text
initial lr-map-view element === element after both movement attempts
initial lr-map-sprite element === element after both movement attempts
```

First movement changes received player position and visible placement on that same element. Blocked movement keeps x/y and visible placement unchanged while facing remains right.

## 9. Player resource/crop evidence

The browser obtains `Graphics/Characters/m14_player` through `PresentationResourceClient`.

For the author-owned 4×4 character sheet, M14 uses：

```text
pattern=0
row=(direction-2)/2
```

The player must be visibly drawn from those resource bytes. A CSS color box or fixture-local replacement image does not satisfy the resource vertical.

Smooth walking animation is not required; M14 has no game Tick/Scheduler.

## 10. CSS / bootstrap evidence

Prepared Content must provide in this order：

```text
Presentation/map/map.css
→ Presentation/essentials/page.css
→ Presentation/map/map.browser.js
```

The JS artifact executes as a classic script and registers both tags through native `customElements.define()` before Projector startup.

Qualification may not：

```text
direct-import map browser source
manually define the tags in the test
inject replacement CSS
construct DOM manually instead of Projector
use privileged filesystem/URL shortcuts for resources
```

## 11. Physical composition boundary

M14 composition is intentionally test-owned：

```text
existing Main
existing Subsystem runtime
existing Data/Renderer/Content
existing or synthetic RendererInputSource
real Chromium
```

It proves the logical consumer chain, not final Desktop physical process topology.

M15 owns：

```text
Hostra Node Runner child
Electron BrowserWindow
real DOM Keyboard/Pointer/Gamepad RendererInputSource
reload/reconnect/shutdown physical E2E
```

A `MiniDesktopHost`, `MapHost`, `GameRuntimeHost` or similar M14 product role is forbidden.

## 12. Local exact-v21.1 evidence

Local qualification may select a source map/spawn/character from the exact external corpus, but after source selection it must enter：

```text
existing importer
→ M14 consumer projection
→ prepared FSDB
→ same @loomrealm-game/map code
→ same fixed viewport / passability / regular-tile subset where selected
→ same map browser artifacts
```

It may not pass decoded RPG/Ruby objects directly to the Runtime.

If the exact corpus demonstrates that the selected meaningful slice necessarily requires unsupported autotile/priority behavior, record that as consumer evidence and implement the smallest missing behavior before declaring M14 Closed; do not hide it with a fake local fixture.

## 13. Diagnostics / failure policy

Optional lightweight diagnostics may record update count, node count and representative input-to-visible latency. No profiler/metrics framework is required.

Fail closed when：

```text
required Map/Tileset field invalid
Table shape/index invalid
resource missing/invalid
unsupported required tile kind encountered
browser tag registration missing
Render state violates M11 bounds
```

Do not recover by inserting defaults that change map semantics.

## Closure question

M14/04 passes only if the answer is yes：

> Can the checked-in concrete `game.json` keep one valid map gameplay Frame alive, consume real prepared `Map/1` + `Tileset/1` facts through `ContentClient`, derive regular-tile pixels and RMXP-compatible passability, update authoritative player/camera state from M10 input, and project that state through one opaque SDK-owned RenderDomain into stable `lr-map-view → lr-map-sprite` elements loaded through the real M13 bootstrap in Chromium?
