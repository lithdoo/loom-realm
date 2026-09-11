# M14 / 04 — First Real Game Vertical

> 状态：**Implemented / contract frozen; formal Closed**
> Closure authority：formal M14 status and current qualification evidence live only in `doc/30-implementation/m14-qualification.md`. This file freezes the implemented canonical vertical/evidence shape; it does not independently claim milestone closure.

## Objective

证明 concrete game 能完整消费 M10–M13 已冻结 seams，而不重新定义 map semantics：

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

本文只定义 vertical 需要观察到的证据。Map business/runtime/presentation semantics 由 M14/02 唯一定义；concrete fixture/config/resource facts 由 M14/03 唯一定义。Qualification 不得在本文件旁路重造另一套规则。

## 1. Canonical end-to-end trace

Canonical CI MUST run the real chain：

```text
checked-in game.json
→ existing GameEntryV1 parse/validation
→ initial subsystemKey="map"
→ test-owned logical key → @loomrealm-game/map Definition binding
→ existing Main initial Frame
→ map Runtime reads Map/1 + Tileset/1 through ContentClient
→ validates selective consumer shapes from M14 consumer projection
→ confirms tileset/player resources and captures contentVersion
→ creates one Frame-bound keyboard.event InputListener
→ creates one opaque SDK-owned RenderDomain
→ publishes initial full Render state
→ keeps gameplay Frame pending
→ checked-in presentation.json enters existing M13 preparation/bootstrap behavior
→ packaged classic map browser JS defines lr-map-view/lr-map-sprite
→ M13 Projector creates managed DOM
→ PresentationResourceClient supplies real fixture PNG bytes
→ private map drawing paints current map and player becomes visible
→ two non-repeat ArrowRight events traverse M10
→ first move succeeds; second is blocked by persisted Tileset facts
→ same managed HTMLElements survive both attempts
```

No direct decoder object injection, direct DOM mutation, inline replacement Config, manual Custom Element registration or fake collision truth.

## 2. Gameplay / input evidence

After initial visible render：

```text
Frame still active/pending
InputListener Interest still current
```

Then canonical M14/03 fixture produces：

```text
start: (10,8), facing 2/down

ArrowRight down repeat=false
→ (11,8), facing 6/right

ArrowRight down repeat=false
→ persisted tile/passages facts block target reverse-entry
→ remains (11,8), facing 6/right
```

The movement handler follows M14/02 synchronous ordering and finishes authoritative `RenderDomain.replace(...)` before returning。`keyup`、repeat、timer或 keyboard.state polling are not substitutes。

## 3. Content / Table evidence

Qualification proves Runtime consumed the selective consumer records, not importer wrappers：

```text
Map/1 value keys exactly:
    tileset_id,width,height,data

Tileset/1 value keys exactly:
    id,tileset_name,passages,priorities
```

`Map.data` satisfies M14/02 exact 3D shape with `zSize=3`；passages/priorities satisfy exact 1D shape。

At least one non-zero coordinate proves the frozen Table index convention, including canonical：

```text
tableAt(Map.data,12,8,0)==385
```

No MapInfo/Event projection is required for M14 first slice。

## 4. Render / camera evidence

Exact tree and node data are those frozen by M14/02。Qualification observes one map Domain only and never depends on its wire-id spelling。

Canonical camera observations from M14/03 fixture：

```text
start world=(10,8)
camera=(16,32)
player screen=(304,224)
visible x=0..20, y=1..15

first move world=(11,8)
camera=(48,32)
player screen=(304,224)
visible x=1..21, y=1..15
```

The centered player's screen position does not need to change。Visible movement is proved by：

```text
world x 10→11
facing 2→6
cameraX 16→48
map/Canvas content shifts left 32 CSS px
canonical tile (12,8) screen x 368→336
```

Blocked second move leaves world position、camera、player screen origin and map placement unchanged。

## 5. Full-state Canvas evidence

`lr-map-view` consumes current full view data。For every paint it must behave as frozen by M14/02：

```text
clear full logical 640×480 tile Canvas
→ draw current retained tiles[] in canonical order
```

Qualification MUST prove stale pixels cannot survive a full-state change。A minimal deterministic case may replace one previously drawn current tile with an omitted/transparent current state and assert the old pixel disappears after repaint。

Do not qualify dirty rectangles、tile patches or incremental Canvas state；they are not M14 behavior。

## 6. Pixel / player evidence

Using the author-owned PNGs from M14/03, Chromium proves：

```text
Map.data tileId
→ current ordered tiles[]
→ Tileset resource/version
→ PresentationResourceClient bytes
→ regular-tile source rectangle
→ Canvas destination from current camera
→ expected fixture pixel
```

At least tile 384 and tile 385 source cells are distinguishable and correctly selected。

Player evidence proves：

```text
real 4×4 character sheet
correct direction row
pattern=0 column
bottom-center placement from current screenX/screenY
```

CSS color boxes are not substitutes。

## 7. DOM / private presentation evidence

Required managed light DOM：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

Same `lr-map-view` and `lr-map-sprite` HTMLElement identities survive both movement attempts。

Qualification proves behaviorally that map-owned private presentation provides tile drawing、clipping and correct player overlay/slot behavior。Pixel/screenshot evidence is sufficient。If an implementation happens to use an open Shadow root, tests MAY inspect it, but MUST NOT require an open Shadow root、specific wrapper hierarchy、private class names or unnecessary nesting。

No per-tile Custom Elements。

## 8. Async resource currentness evidence

At least one delayed resource/decode case proves：

```text
receive data A
→ decode pending
receive newer data B using same image resource/version
→ decode completes
→ visible output represents latest B
```

Matching image resource/version alone cannot authorize painting captured old camera/tiles/direction。A completion may populate cache, but repaint uses latest retained data or an equivalent current data-generation check。

No fake fallback pixels or AssetManager abstraction。

## 9. M13 qualification-composition boundary

M14 does not publish a new Renderer presentation host API merely for tests。

```text
game-libs/map code
examples/essentials-v21.1 business/runtime/browser code
    MUST NOT import Renderer internal paths

repository-owned M14 qualification harness
    MAY reuse existing M13 internal Window-composition mechanics
    only to construct/drive the qualification Window
```

That repository-test exception is not an author/product seam。Production Desktop Window composition belongs to M15。

## 10. Physical composition boundary

M14 uses existing Main/Subsystem/Data/Renderer/Content roles、existing/synthetic RendererInputSource and real Chromium。

M14 does not introduce：

```text
MiniDesktopHost
MapHost
InProcessRuntimeHost package
DefinitionRegistry
GameRuntimeHost
```

A small test-local platform/composition function may connect existing public/trusted host seams, similar to existing repository tests。Real Hostra child process、Electron BrowserWindow、DOM physical input、reload/reconnect/shutdown belong to M15。

## 11. Exact local-v21.1 evidence

Local qualification uses：

```text
real source
→ existing importer/lossless decode
→ selective M14 Map/Tileset consumer projection
→ prepared FSDB
→ same @loomrealm-game/map Runtime/browser code
→ same M13 Chromium path
```

PASS minimum is owned by M14/05。The local selected slice does not need to prove both deterministic canonical movement branches；CI owns those。If meaningful selected source necessarily requires unsupported behavior, fail explicitly and add only the smallest real missing behavior or select another meaningful supported slice。

## Closure question

The canonical vertical is implemented. Formal M14 closure additionally requires the current qualification subject/evidence recorded in `doc/30-implementation/m14-qualification.md`.

M14/04's behavioral gate passes only if the checked-in game can keep one gameplay Frame alive, consume the exact selective Map/Tileset facts through ContentClient, derive passability/camera/current full Render state, repaint a real Canvas from current full data, display a real player sprite, accept M10 directional input and preserve M13 element identity/currentness through real Chromium — without adding a second game framework or test-only business path.
