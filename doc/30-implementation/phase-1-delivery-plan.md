# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M10–M14 **Implemented / Qualified / Closed**
> 主要定义：M1–M17 实现顺序、current closure、M14 consumer proof、Desktop/PWA qualification boundary  
> 依赖：[渲染系统](../10-architecture/rendering-system.md)、[独立分包与发布架构](./package-architecture.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-10

## Delivery order

```text
Foundation / Wire
→ Game document
→ Runtime Control
→ Subsystem Runtime / Frame
→ Main authority
→ Hostra Runtime
→ Renderer Control
→ Data role seam
→ Desktop Data Broker
→ Input
→ Render Replication
→ Content
→ Web Presentation
→ Map Game Library + First Real Game
→ Desktop Full E2E
→ PWA Runtime
→ PWA Full E2E / Equivalence
```

Rules：

```text
Package Scope != Implementable Slice != Milestone Closure
Framework Package != Game Library != Concrete Game
```

Do not prebuild fake v2、deprecated aliases or generic frameworks for hypothetical later consumers。

---

## M1–M9 — Foundation / Hostra / Data ✅

```text
M1 Foundation + Wire
M2 Game Package
M3 Runtime Control
M4 Subsystem Runtime / Frame
M5 Main Core
M6 Hostra Runtime
M7 Renderer Control
M8 Renderer Data
M9 Desktop Data Broker
```

Closed on the existing mainline implementation/qualification path。

---

## M10 — User Input ✅ Closed

Canonical gate：

```text
npm run test:m10
```

Frozen result：Subsystem `InputListener`、Main InputTarget/Activation authority、Renderer producer/gate seam。

Physical producer placement：

```text
M14
→ existing/synthetic RendererInputSource for consumer qualification

M15 Desktop
→ real BrowserWindow DOM Keyboard/Pointer/Gamepad RendererInputSource

M17 PWA
→ equivalent physical Window producer semantics
```

Older wording assigning real Desktop DOM input to M14 is superseded；M10 API is unchanged。

---

## M11 — Render Replication ✅ Closed

Canonical gate：

```text
npm run test:m11
```

Closed：Subsystem authoritative RenderDomain、Render Update v1、Renderer Store、one-shot node identity、reconnect baseline semantics and Event transient behavior。

M14 constraint：

```text
createRenderDomain(initialState)
→ SDK assigns opaque domainId
```

Business authors do not choose `domainId`；M14 does not reopen this surface。

---

## M12 — Content ✅ Closed

Canonical gate：

```text
npm run test:m12
```

Closed：readonly Content Service/FSDB path、Subsystem `ContentClient`、Renderer trusted/private resource path、version/credential boundary。

M14 reuses：

```text
ContentClient.record()
ContentClient.resource()
PresentationResourceClient
```

No new metadata/HEAD author API is added merely for the first game consumer。

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

Core flow：

```text
prepared M12 Content
→ ordered <link> / classic <script>
→ business customElements registration
→ window.onload
→ thin Web Projector
→ business WC
```

Frozen identity/currentness：

```text
identity = (Session, subsystemKey, generation, domainId, key)
same identity → same HTMLElement
fresh Session/generation → fresh element universe
```

M14 consumes this surface；it does not introduce a second presentation store、loader、component registry or map SDK in Renderer。

---

## M14 — Map Game Library + First Real Game ✅ Implemented / Qualified / Closed

M14 proves that M10–M13 can support a real independent business consumer without new core machinery：

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

Normative landing order：

```text
M14_01_WORKSPACE_BOUNDARY.md
→ M14_02_MAP_GAME_LIBRARY.md
→ M14_03_ESSENTIALS_EXAMPLE.md
→ M14_04_REAL_GAME_VERTICAL.md
→ M14_05_QUALIFICATION_CLOSURE.md
```

Consumer projection authority：

```text
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

### M14/01 — workspace ownership

M14 adds：

```text
game-libs/*
examples/*
```

Ownership：

```text
packages/*   → @loomrealm/* framework
game-libs/*  → @loomrealm-game/* reusable game-domain libraries
examples/*   → private concrete games
```

No framework reverse dependency on game libraries/examples。

### M14/02 — exact map first slice

Logical topology：

```text
one business subsystemKey = "map"
→ @loomrealm-game/map Definition

one business RenderDomain
→ SDK-assigned opaque wire domainId
```

Initial map Frame remains long-lived while gameplay input is expected。Player/tile/camera are business/presentation state, not extra Subsystems。

Selective Content path：

```text
RMXP/Essentials source semantics
→ existing importer/lossless representation
→ selective consumer projection
→ Map/{id}: tileset_id,width,height,data
→ Tileset/{id}: id,tileset_name,passages,priorities
→ prepared Content
→ ContentClient
→ map Runtime
```

Unused MapInfo/Event/MapMetadata/Color/Tone/AudioFile facts remain outside M14 consumer records until a real behavior consumes them。

Input first slice：

```text
keyboard.event
non-repeat Arrow key down
→ synchronous one-tile movement attempt
```

RMXP passability uses frozen directional passage bits、top-down source layers/priorities and source-direction + target reverse-direction checks。

Fixed presentation constants：

```text
tileSize = 32
CSS viewport = 640×480
nominal grid = 20×15
```

Runtime owns logical camera；no DOM→Runtime resize/layout feedback。

Exact managed tree：

```text
lr-map-view
└── lr-map-sprite
```

`lr-map-view` owns private tile drawing/clipping/overlay mechanics。Its exact private Shadow wrapper/class topology is not normative。Every current full view repaint clears the logical Canvas before drawing current ordered `tiles[]`。

Map browser JS/CSS are standalone package artifacts loaded through prepared Content + M13 classic bootstrap。

### M14/03 — concrete example / fixture

`examples/essentials-v21.1/game.json` initial input：

```text
{ mapId:1, x:10, y:8, characterName:"m14_player" }
```

Example page CSS fixes `lr-map-view` to 640×480 and owns page placement only。

Canonical CI uses repository-author-owned semantic fixture + PNGs。Exact external Essentials v21.1 corpus remains separate local compatibility evidence；third-party bytes are never committed。

### M14/04 — real consumer vertical

Required chain：

```text
game.json validation
→ long-lived map Frame
→ selective Map/Tileset Content reads
→ resource version confirmation
→ initial full Render state
→ M13 bootstrap
→ real Chromium
→ real regular-tile Canvas pixels + player sprite
→ first ArrowRight: (10,8) → (11,8)
→ second ArrowRight: blocked at target (12,8)
→ same lr-map-view / lr-map-sprite live identities retained
```

M14 uses existing/synthetic RendererInputSource and test-owned physical composition。Real Node child/BrowserWindow/DOM physical input/reload-shutdown belong to M15。

### M14/05 — closure

Canonical CI target：

```text
npm run test:m14
```

M14 `Closed` additionally requires same-revision local compatibility evidence：

```text
npm run test:m14:essentials-local -- \
  --source <path> \
  --map-id <id> \
  --x <x> \
  --y <y> \
  --character-name <name>
```

Closure record captures commit SHA、Node 20/24 result、source fingerprint/selected local slice、projection result and semantic/browser evidence。

M14 Closed proves one real RMXP/Essentials-compatible consumer slice only。It does not claim autotile/event-interpreter completeness、responsive viewport or Desktop/PWA physical E2E。

---

## M15 — Desktop Full E2E — pending

Replace M14 test-owned physical composition with real Desktop composition：

```text
PREPARE
→ Main
→ Hostra RuntimeHosting
→ real Node Runner child for "map"
→ Data Broker + Desktop Content
→ Electron BrowserWindow
→ M13 presentation
→ real DOM RendererInputSource
→ same M14 game/map Runtime/WC
→ reload / reconnect / shutdown
```

M15 must not redesign M10–M14 logical/business semantics because the physical host becomes real。

---

## M16 — PWA Runtime — pending

Close only PWA Runtime hosting mechanics：

```text
PWA PREPARE
→ Dedicated Worker Runner
→ RuntimeHosting
→ Runtime Control MessagePort
→ Main ↔ Worker ↔ Subsystem lifecycle
→ termination/failure
```

PWA Renderer/Data/Content/Web presentation are not required for M16 closure。Existing Subsystem host can expose the normal unavailable Content capability until M17 supplies a physical ContentClient。

---

## M17 — PWA Full E2E / Equivalence — pending

Complete：

```text
Window Renderer Control
→ PWA Data broker / provisioning
→ PWA Content
→ physical Window input
→ Render
→ M13 presentation
→ same concrete M14 game/business WC
→ Hostra/PWA logical-outcome equivalence
```

Equivalence compares shared logical semantics/business outcomes, not identical PID/Worker、WebSocket/MessagePort or physical storage implementation。

---

## Current status

```text
M1–M9                                      ✅
M10 User Input                             ✅ Closed
M11 Render Replication                     ✅ Closed
M12 Content                                ✅ Closed 2026-09-08
M13 Web Presentation                       ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game     ✅ Closed 2026-09-10
M15 Desktop Full E2E                       pending
M16 PWA Runtime                            pending
M17 PWA Full E2E / Equivalence             pending
```

Current canonical executable closure remains：

```text
npm run test:m14
```

Next work is M15 Desktop physical composition against the closed M10–M14 boundaries。Do not reopen core seams for prettier domain ids、responsive-layout speculation、ESM-loader preference or hypothetical generic map abstractions。
