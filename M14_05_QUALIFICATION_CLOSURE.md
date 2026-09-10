# M14 / 05 — Qualification Closure

> 状态：**Implemented / Qualified / Closed**

## Closure target

Canonical CI：

```text
npm run test:m14
```

M14 `Closed` additionally requires one same-revision exact Essentials v21.1 local qualification：

```text
npm run test:m14:essentials-local -- \
  --source <path> \
  --map-id <id> \
  --x <x> \
  --y <y> \
  --character-name <name>
```

The exact-local gate MUST read the imported FSDB through the production Desktop Content HTTP service and bound Subsystem `ContentClient`。It MUST derive resource MIME/contentVersion from that seam, not from filename assumptions or hard-coded MIME。Its non-repeat directional input MUST enter through a synthetic `RendererInputSource` and traverse the complete M10/Data/InputListener path；direct invocation of the map handler is not qualification evidence。

M14/02 is the authority for map Runtime/presentation semantics。M14/03 is the authority for checked-in example/fixture/config/resources。M14/04 is the authority for end-to-end observables。This file is the executable checklist and MUST NOT redefine those algorithms independently。

## 1. Required scripts

Implementation adds：

```text
test:m14
test:m14:pack
test:m14:essentials-local
```

`test:m14` includes：

```text
npm run test:m13
workspace/dependency boundary checks
selective consumer-projection tests
map game-lib semantic tests
checked-in game.json + presentation.json validation
prepared Content assembly test
real Chromium M14 vertical
npm run test:m14:pack
```

Milestone scripts use explicit workspace/package targets where meaning matters；do not rely on accidental `--workspaces` expansion。

## 2. Workspace / package gate

Prove M14/01：

```text
root workspaces include game-libs/* + examples/*
packages/* never depend on game-libs/* or examples/*
@loomrealm-game/map Runtime root resolves
browser JS/CSS package subpaths resolve
map Runtime imports only public @loomrealm/subsystem author surface
example package private=true
browser source is not a Runtime dependency
prepared assembly does not reach through package-private dist/source paths
existing M13 gate meaning remains unchanged
```

`test:m14:pack` verifies Runtime output and both browser artifacts survive `npm pack --dry-run`。Browser artifact is executed only through Chromium/M13 bootstrap, not imported as Node business code。

No workspace orchestration/package registry abstraction。

## 3. Selective consumer-projection gate

Prove `M14_CONSUMER_PROJECTION.md` exactly：

```text
MapNNN.rxdata → Map/{decimal N}
Tilesets.rxdata[i] → Tileset/{i}
Tileset projected id == source array index
mismatch fails closed
unreferenced exact-v21.1 empty-name editor placeholders are omitted;
referenced empty-name entries fail closed

Map value keys exactly:
    tileset_id,width,height,data

Tileset value keys exactly:
    id,tileset_name,passages,priorities
```

Prove exact Table semantics：

```text
index=x+y*xSize+z*xSize*ySize
values.length=xSize*ySize*zSize
Map.data dimensions=3 and zSize=3
passages/priorities dimensions=1
non-zero coordinate ordering sample
```

Consumer records contain no decoder metadata/wrappers and do not materialize unused Map events、MapInfo、Color/Tone、AudioFile or other nested RPG graph merely because the importer knows those classes。

Production FSDB must persist/read the projected values as ordinary JsonValue。

## 4. Checked-in example gate

CI MUST read the actual checked-in：

```text
examples/essentials-v21.1/game.json
examples/essentials-v21.1/presentation.json
examples/essentials-v21.1/presentation.css
```

`game.json` validates to the M14/03 frozen topology/input；map initializes `direction=2/down` and `pattern=0` internally。

`presentation.json` enters existing M13 validation/preparation behavior；qualification does not substitute an inline config。

CI semantic fixture and author-owned PNG resources must exactly satisfy M14/03。No third-party Essentials bytes in repo、logs or CI artifacts。

## 5. Gameplay / Frame gate

Prove：

```text
initial map Frame remains active after initial render
Frame-bound keyboard.event listener remains current
two canonical non-repeat ArrowRight events reach same gameplay Frame
movement handler commits synchronously before returning
```

Canonical result from M14/03：

```text
start (10,8), facing2
first ArrowRight  → (11,8), facing6
second ArrowRight → blocked, remains (11,8), facing6
```

Passability result MUST derive from projected Map/Tileset Table facts using M14/02 semantics；no `isBlocked`、walkable flag、collision bitmap or coordinate hard-code。

No EventQueue、Scheduler、PlayerController or MovementManager is required。

## 6. Render / viewport gate

Exactly one map business RenderDomain；SDK wire id is opaque。

Exact managed tree follows M14/02：

```text
lr-map-view
└── lr-map-sprite
```

Prove canonical viewport/camera outcomes from M14/03：

```text
computed lr-map-view = 640×480 CSS px
browser context = 800×600, deviceScaleFactor=1

start:
    world=(10,8)
    camera=(16,32)
    player screen=(304,224)

first move:
    world=(11,8)
    camera=(48,32)
    player screen=(304,224)
    map content shifts left 32 CSS px

blocked second move:
    world/camera/player-screen/map placement unchanged
```

Qualification MUST NOT require centered player screen position to move。

## 7. Current full-state / Canvas gate

Runtime publishes current full `RenderDomainState` with `replace(...)`。No map delta protocol。

`lr-map-view` full-state repaint MUST be proven：

```text
clear full logical 640×480 tile Canvas
→ draw current retained tiles[] in canonical order
```

Qualification includes a deterministic stale-pixel case showing that a tile drawn by an earlier full state disappears when omitted/transparent in the newer full state。

Do not implement or qualify dirty rectangles、tile invalidation maps or incremental Canvas patch state for M14。

## 8. Real pixel / sprite gate

Chromium proves real resource flow：

```text
Runtime ContentClient.resource()
→ contentVersion in Render data
→ M13 PresentationResourceClient
→ actual PNG bytes
→ visible Canvas/sprite pixels
```

At least two distinct regular tile source cells are selected correctly from the author-owned tileset fixture。

Player proves real 4×4 character-sheet crop、direction row、`pattern=0` column and bottom-center placement。

No CSS-color-box substitute or fake resource fallback。

## 9. DOM / private presentation gate

Required light DOM：

```html
<body>
  <lr-map-view>
    <lr-map-sprite></lr-map-sprite>
  </lr-map-view>
</body>
```

Same view/sprite HTMLElement identities survive both movement attempts。

Qualification proves behaviorally that map-owned private presentation supplies tile drawing、clipping and correct player overlay/slot behavior。Pixel/screenshot evidence is sufficient。Tests MUST NOT require an open Shadow root、specific private wrapper elements、class names or unnecessary nesting。

No per-tile Custom Elements。

## 10. Async currentness gate

Include a delayed resource/decode case：

```text
receiveRenderData A
→ decode pending
receiveRenderData B with same image resource/version but newer camera/tiles/direction
→ decode completes
→ visible result represents B
```

Matching resource identity/version alone is insufficient。Completion may cache the resource, but stale captured render data cannot repaint over current state。

No AssetManager/public currentness protocol。

## 11. M13 composition boundary gate

Automated boundary checks prove：

```text
game-libs/map business/runtime/browser code
examples/essentials-v21.1 business/runtime/browser code
    do not import Renderer internal paths

repository-owned M14 qualification harness
    may reuse existing M13 internal Window-composition mechanics
    only as test infrastructure
```

Do not add a public Renderer presentation host/service merely to make M14 tests prettier。Production Desktop Window composition belongs to M15。

## 12. Physical process/input boundary

M14 uses existing/synthetic RendererInputSource and test-owned physical composition through existing Main/Subsystem/Data/Renderer/Content seams。

M14 MUST NOT introduce production-like：

```text
MiniDesktopHost
MapHost
GameRuntimeHost
InProcessRuntimeHost package
DefinitionRegistry
DOM physical input producer
```

M15 owns real Hostra Node child、Electron BrowserWindow、physical DOM input、reload/reconnect/shutdown。

## 13. Exact local-v21.1 PASS gate

Local command work root：

```text
.local/m14-essentials/
```

Run：

```text
existing importer/acquisition
→ selective M14 Map/Tileset consumer projection
→ prepared FSDB/content
→ same @loomrealm-game/map Runtime/browser implementation
→ same M13 Chromium path
```

Local PASS requires all：

```text
exact source fingerprint/version recorded
selected Map/Tileset projected successfully
same Runtime consumes projected Table shape/index
selected tileset resource resolves from real source
selected character resource resolves from real source
same map Runtime starts
same fixed 640×480 M13 Chromium presentation starts
at least one real regular source tile is visible
real selected player sprite is visible
one non-repeat directional input traverses M10
resulting world state agrees with persisted passability facts for that attempt
```

Local does not need both canonical passable and blocked branches；CI owns those deterministic proofs。If selected real source requires unsupported behavior, fail explicitly and add only the smallest real missing behavior or choose another meaningful supported slice。

## 14. Closure record

At actual closure create/update：

```text
doc/30-implementation/m14-qualification.md
```

Record：

```text
closure commit SHA
Node20/24 canonical CI result
exact local source fingerprint + selected map/spawn/character
selective projection summary
Map/Tileset/resource result
movement/passability result
Canvas/sprite/DOM identity/currentness result
final pass/fail
```

Never record third-party bytes。

## 15. Reopen / nonclaims

Reopen M10–M13 only for demonstrated contradiction、genuinely absent capability、impossible exact-consumer behavior or measurable workload failure。

M14 Closed does NOT claim：

```text
full RMXP/Essentials object projection
autotile completeness
priority-over-player completeness
event collision/interpreter
map transitions
responsive viewport
Tick API
Desktop physical E2E
PWA equivalence
universal map schema
public map presentation SDK
```

## Freeze declaration

M14/01–05 plus `M14_CONSUMER_PROJECTION.md` remain the frozen design baseline。Closure does not reopen ownership、consumer data scope、business semantics、topology、Render data、presentation structure or qualification criteria。

M14 could not become `Closed` until canonical CI、one same-revision exact-v21.1 local qualification and the closure record all passed；those conditions were satisfied on 2026-09-10。
