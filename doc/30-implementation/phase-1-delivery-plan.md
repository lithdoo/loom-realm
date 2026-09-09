# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M10–M13 **Implemented / Qualified / Closed**；M14 implementation landing frozen  
> 主要定义：M1..M17 实现顺序、current closure、Desktop/PWA qualification boundary  
> 依赖：[渲染系统](../10-architecture/rendering-system.md)、[独立分包与发布架构](./package-architecture.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)

## Delivery order

```text
Foundation/Wire
→ Game document
→ Runtime Control
→ Subsystem Runtime/Frame
→ Main authority
→ Hostra Runtime
→ Renderer Control
→ Data role seam
→ Desktop Data Broker
→ Input
→ Render Replication
→ Content
→ Web Presentation
→ Map Game Library + first concrete game
→ Desktop full E2E
→ PWA Runtime
→ PWA full E2E/equivalence
```

Rules：

```text
Package Scope != Implementable Slice != Milestone Closure
Framework Package != Game Library != Concrete Game
```

Do not prebuild fake v2, deprecated aliases or generic frameworks for hypothetical later consumers.

---

## M1–M9 — Foundation / Hostra / Data ✅

```text
M1 Foundation + Wire
M2 Game Package
M3 Runtime Control
M4 Subsystem Runtime/Frame
M5 Main Core
M6 Hostra Runtime
M7 Renderer Control
M8 Renderer Data
M9 Desktop Data Broker
```

Closed on the existing mainline implementation/qualification path.

---

## M10 — User Input ✅ Closed

Canonical gate：

```text
npm run test:m10
```

Frozen result：Subsystem `InputListener`, Main InputTarget/Activation authority, Renderer producer/gate seam.

Physical producer ownership for future milestones：

```text
M14
→ existing/synthetic RendererInputSource for consumer qualification

M15 Desktop
→ real BrowserWindow DOM Keyboard/Pointer/Gamepad RendererInputSource

M17 PWA
→ equivalent physical Window producer semantics
```

Any older future-looking M10 note assigning real Desktop DOM input to M14 is superseded by this milestone partition; the M10 API itself is unchanged.

---

## M11 — Render Replication ✅ Closed

Canonical gate：

```text
npm run test:m11
```

Closed：Subsystem authoritative RenderDomain, Render Update v1, Renderer Store, one-shot node identity, reconnect baseline semantics and Event transient behavior.

Important M14 consumer constraint：

```text
createRenderDomain(initialState)
→ SDK assigns opaque domainId
```

Business authors do not choose `domainId`; M14 must not reopen this surface.

---

## M12 — Content ✅ Closed

Canonical gate：

```text
npm run test:m12
```

Closed：readonly Content Service/FSDB path, Subsystem `ContentClient`, Renderer trusted/private resource path and version/credential boundary.

M14 reuses：

```text
ContentClient.record()
ContentClient.resource()
PresentationResourceClient
```

No metadata/HEAD API is added merely for the first game consumer.

---

## M13 — Web Presentation ✅ Closed

Canonical gate：

```text
npm run test:m13
```

Formal frozen surface：

```text
Web Presentation Config v1
Web Presentation API v1
ADR 0031
M13_01..05 landing docs
```

Core implementation flow：

```text
prepared M12 Content
→ ordered <link> / classic <script>
→ business customElements registration
→ window.onload
→ thin Web Projector
→ document.body / business WC
```

Frozen identity/currentness remains：

```text
identity = (Session, subsystemKey, generation, domainId, key)
same identity → same HTMLElement
fresh Session/generation → fresh element universe
```

M14 uses this surface as a consumer; it does not introduce a second presentation store, map SDK, loader or component framework.

---

## M14 — Map Game Library + First Real Game — pending

M14 first proves framework consumer layering：

```text
examples/essentials-v21.1
    ↓
game-libs/map
@loomrealm-game/map
    ↓
@loomrealm/subsystem public author APIs
    ↓
M10 Input + M11 Render + M12 Content + M13 Presentation
    ↓
observable playable RMXP-compatible map slice
```

Landing docs are normative in this order：

```text
M14_01_WORKSPACE_BOUNDARY.md
→ M14_02_MAP_GAME_LIBRARY.md
→ M14_03_ESSENTIALS_EXAMPLE.md
→ M14_04_REAL_GAME_VERTICAL.md
→ M14_05_QUALIFICATION_CLOSURE.md
```

### M14/01 — workspace ownership

Add：

```text
game-libs/*
examples/*
```

Package ownership：

```text
packages/*   → @loomrealm/* framework
 game-libs/* → @loomrealm-game/* reusable game-domain libraries
examples/*   → private concrete games
```

No framework reverse dependency on game libraries/examples.

### M14/02 — exact map first slice

Logical topology：

```text
one business subsystemKey = "map"
→ @loomrealm-game/map Definition

one business RenderDomain
→ SDK-assigned opaque wire domainId
→ M14 never depends on id spelling
```

The initial map Frame is long-lived through gameplay input. Player/tile/camera are state/presentation vocabulary, not extra Subsystems.

Content representation：

```text
RMXP/Essentials semantic authority
→ importer consumer JsonValue projection
→ Map/{id} + Tileset/{id}
→ prepared FSDB
→ ContentClient
→ map Runtime
```

First-slice input：

```text
keyboard.event
non-repeat Arrow key down
→ one tile movement attempt
```

RMXP passability subset uses frozen passage bits, top-down map layers, priorities, source-direction and target reverse-direction checks.

Fixed presentation constants：

```text
tileSize = 32
CSS viewport = 640×480
nominal grid = 20×15
```

Runtime owns logical-pixel camera; no DOM→Runtime layout/resize feedback.

Exact Render tree：

```text
key="viewport" tag="lr-map-view"
└── key="player" tag="lr-map-sprite"
```

Exact package-private data includes camera/resource/visible-tile facts for the view and world/screen/direction/resource facts for the player.

Tile rendering subset：

```text
0       → transparent
>=384   → regular 32×32 tileset tile
48..383 → autotile not required by canonical M14 CI slice
```

`lr-map-view` owns private Shadow DOM + tile Canvas + entity slot. `lr-map-sprite` owns character-sheet crop/placement.

M13 loads classic scripts, so map browser output is a standalone classic artifact with no execution-time ESM graph.

### M14/03 — concrete example / fixture

`examples/essentials-v21.1/game.json` uses：

```text
subsystem = "map"
input = { mapId:1, x:10, y:8, characterName:"m14_player" }
```

Example page CSS fixes `lr-map-view` to 640×480 and owns centering/margin/scroll policy.

Prepared Content composes：

```text
semantic FSDB
+ map browser classic JS
+ map component CSS
+ example page CSS
+ WebPresentationConfig refs
```

Canonical CI uses an author-owned fixture with predetermined Map/Tileset/passability facts and author-owned PNG resources. It must not use third-party Essentials assets.

Exact local Essentials v21.1 source remains separate compatibility evidence but enters the same consumer implementation.

### M14/04 — real consumer vertical

Required observable chain：

```text
game.json validation
→ long-lived map Frame
→ Map/Tileset Content reads
→ resource version confirmation
→ initial Render
→ real M13 bootstrap
→ 640×480 lr-map-view + player
→ real regular-tile Canvas pixels
→ first ArrowRight moves from (10,8) to (11,8)
→ second ArrowRight is blocked at (12,8)
→ same lr-map-view / lr-map-sprite HTMLElements retained
```

M14 uses existing/synthetic RendererInputSource. Real Desktop DOM physical producer/Node child/BrowserWindow/reload-shutdown belongs to M15.

### M14/05 — closure

Canonical CI target：

```text
npm run test:m14
```

M14 `Closed` additionally requires one exact-v21.1 local qualification against the same closure revision：

```text
npm run test:m14:essentials-local -- \
  --source <path> \
  --map-id <id> \
  --x <x> \
  --y <y> \
  --character-name <name>
```

Closure evidence records commit SHA, Node 20/24 CI result, source fingerprint, selected local slice, consumer-projection result and semantic/browser result. Third-party bytes never enter the repository.

M14 Closed proves one real RMXP/Essentials-compatible consumer slice only. It does not claim autotile completeness, event interpreter/collision completeness, responsive viewport, full Essentials gameplay or Desktop/PWA physical E2E.

---

## M15 — Desktop Full E2E — pending

Replace M14 test-owned physical composition with real Desktop composition：

```text
PREPARE
→ Main
→ Hostra RuntimeHosting
→ real Node Runner child for logical "map"
→ Data Broker
→ Electron BrowserWindow
→ M13 presentation
→ real DOM Keyboard/Pointer/Gamepad RendererInputSource
→ same M14 game/map Runtime/WC
→ reload/reconnect/shutdown
```

M15 must not redesign Input/Render/Content/Web Presentation or map consumer semantics merely because the physical host is now real.

---

## M16 — PWA Runtime — pending

Close only PWA runtime hosting mechanics：

```text
PWA PREPARE
Worker Runner
RuntimeHosting
Runtime Control MessagePort
Main ↔ Worker ↔ Subsystem lifecycle
```

Do not duplicate M14 game semantics.

---

## M17 — PWA Full E2E / Equivalence — pending

Complete Window Renderer Control, PWA Data broker, physical input, Content, M13 presentation and the same concrete M14 game/business WC.

Equivalence compares logical semantics/outcome, not identical PID/Worker, WebSocket/MessagePort or physical storage implementation.

---

## Current status

```text
M1–M9                                      ✅
M10 User Input                             ✅ Closed
M11 Render Replication                     ✅ Closed
M12 Content                                ✅ Closed 2026-09-08
M13 Web Presentation                       ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game     pending
M15 Desktop full E2E                       pending
M16 PWA Runtime                            pending
M17 PWA full E2E/equivalence               pending
```

Current canonical executable closure remains：

```text
npm run test:m13
```

Next work is implementation of M14/01–05 exactly as frozen; do not reopen core seams for prettier domain ids, responsive layout speculation, ESM loader preference or hypothetical generic map abstractions.
