# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M10–M13 **Implemented / Qualified / Closed**；M14 **Implemented / requalification pending**；M15 **Implementation Frozen / Preimplementation Closed**
> 主要定义：M1–M17 实现顺序、current closure、M14 consumer proof、Desktop/PWA qualification boundary  
> 依赖：[渲染系统](../10-architecture/rendering-system.md)、[独立分包与发布架构](./package-architecture.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0033](../decisions/0033-electron-hostra-run-as-node.md)  
> 最近复核：2026-09-11

实施状态与正式 closure 必须分开记录。M14 的当前 qualification subject / live evidence 只以 [`m14-qualification.md`](./m14-qualification.md) 为准；本计划只汇总 milestone 状态，不复制 run-level evidence。

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
Implementation complete != Qualification closed
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

Closed on the existing mainline implementation/qualification path。ADR 0033 later corrects only the first Electron embedding of the existing M6 process model；it does not reopen M6 application/protocol semantics or Node-hosted behavior。

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

For M15 Main-World browser composition，the existing credential-hiding invariant additionally requires the trusted Renderer ResourceClient to bind its native request primitive before business JS；this is implementation hardening of the same M12 capability boundary, not a new Content API。

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

## M14 — Map Game Library + First Real Game ⚠️ Implemented / requalification pending

M14 implementation proves that M10–M13 can support a real independent business consumer without new core machinery：

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

The architecture/consumer contract and hardened implementation are frozen. Formal M14 closure remains pending until the current qualification subject has exact-local + hosted Node 20 + hosted Node 24 evidence recorded together in `m14-qualification.md`.

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

At the public M12 seam these records/resources are read through the frozen production namespaces `struct.Map`、`struct.Tileset` and `resource.Graphics`；qualification does not install a namespace-stripping adapter。

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

M14 uses existing/synthetic RendererInputSource and test-owned physical composition。Real Hostra child/BrowserWindow/DOM physical input/reload-shutdown belong to M15。

### M14/05 — closure

Canonical hosted gate：

```text
npm run test:m14
```

Exact-local gate：

```text
npm run test:m14:essentials-local -- --source <path-to-exact-v21.1-root>
```

Formal closure is keyed to one **qualification subject** rather than the commit that happens to write the evidence record：

```text
one behavior-affecting subject SHA
+
exact-local PASS
+
hosted Node 20 PASS
+
hosted Node 24 PASS
→ M14 Closed
```

A later docs-only commit that only records run IDs/results does not invalidate the subject. Any later Runtime/importer/browser/fixture/harness/workflow behavior change creates a new subject and requires requalification.

Current subject and live PASS/PENDING state are recorded only in `m14-qualification.md`.

M14 closure proves one real RMXP/Essentials-compatible consumer slice only。It does not claim autotile/event-interpreter completeness、responsive viewport or Desktop/PWA physical E2E。

---

## M15 — Desktop Full E2E 🔒 Implementation Frozen / Preimplementation Closed

Replace M14 test-owned physical composition with the frozen real Desktop composition：

```text
checked-in Hostra-ready M14 installation
→ Hostra PREPARE in Electron main
→ Main
→ process.execPath + host-synthesized ELECTRON_RUN_AS_NODE real Hostra Runner child
→ existing Runtime Control WebSocket
→ Desktop Data Broker
→ exact same-origin 127.0.0.1 Desktop shell + existing Content API
→ secure Electron BrowserWindow
→ isolated preload one-shot handoff
→ Main-World trusted Renderer
→ capture authority-bearing native browser primitives
→ Renderer Control MessagePort
→ browser-native Data WebSocket
→ real DOM Keyboard/Pointer/Gamepad RendererInputSource
→ existing M13 presentation
→ same M14 game/map Runtime/WC
→ reload / reconnect / shutdown
```

Frozen Hostra Electron realization：

```text
Runner executable = canonical process.execPath
Electron RuntimeHosting child env += ELECTRON_RUN_AS_NODE=1
supported Desktop Electron build keeps runAsNode fuse enabled
same existing ChildProcess / Runtime Control / provisioning path
```

No configurable Node executable、UtilityProcess Runtime path or Electron-specific RuntimeHosting is introduced。

Frozen BrowserWindow settings：

```text
nodeIntegration=false
contextIsolation=true
sandbox=true
webSecurity=true
```

Frozen browser origin：

```text
app-owned shell
+
existing /_lr/v1 Content API
=
exact same http://127.0.0.1:<port> origin
```

This keeps existing Content GET/HEAD + bearer semantics without `file://`、CORS/OPTIONS expansion、`webSecurity=false` or preload Content proxy。App shell routes remain exact product-private routes outside the Content API contract。

Frozen physical ownership：

```text
preload isolated world
    exact one-shot bootstrap/port handoff only

page Main World before business scripts
    trusted Renderer holder/input/M13 Projector
    private bootstrap consumed
    native fetch/WebSocket/ports/input primitives captured/bound

page Main World afterward
    business Custom Elements

Renderer Control
    MessageChannelMain → native DOM MessagePort → existing Renderer Control

Data
    existing M9 Broker keeps candidate/currentness
    Electron port carries physical prepare/commit/revoke settlement only
    Data application messages use captured native browser WebSocket
```

Physical input mapping is frozen by `M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md`；the authoritative details live there rather than being copied into this plan。At the plan level the required facts are trusted physical DOM provenance、canonical Keyboard/Pointer/Gamepad mapping、focus/visibility fresh baseline and no synthetic-input shortcut。

Normal shutdown is fixed to Window retirement → abort `runMain` signal → await Main/RuntimeHosting child convergence → close remaining Broker/Content/shell services → Electron exit。

Normative implementation order：

```text
M15_01_DESKTOP_PRODUCT_COMPOSITION.md
→ M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md
→ M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md
→ M15_04_DESKTOP_FULL_E2E_VERTICAL.md
→ M15_05_QUALIFICATION_CLOSURE.md
```

M15 can now proceed directly to implementation without another design pass. Private helper/file names and exact app-shell route spelling remain implementation details；authority ownership、Hostra Electron mode、same-origin boundary、execution-world placement、Control/Data/Content separation、DOM input mapping与 lifecycle owner chain不得因代码便利性重新选择。

Formal M14 requalification continues independently through the M14 evidence ledger。The current corrections are documentation/first-M15 physical decisions and do not themselves claim new M14 executable evidence。M15 implementation may proceed before M14 evidence completes, but M15 formal closure requires M14 formal status = Closed and the frozen `npm run test:m15` gate to pass。

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

The M15 Electron run-as-node and Desktop same-loopback-origin decisions are concrete Hostra/Desktop mechanics，not PWA requirements。

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
M14 Map Game Library + First Real Game     ⚠️ Implementation complete / requalification pending
M15 Desktop Full E2E                       🔒 Implementation Frozen / Preimplementation Closed
M16 PWA Runtime                            pending
M17 PWA Full E2E / Equivalence             pending
```

Last formally closed milestone gate：

```text
npm run test:m13
```

Current M14 hosted requalification gate：

```text
npm run test:m14
```

M14 immediate closure work is limited to obtaining/recording the current qualification subject's hosted Node 20/24 evidence. No M10–M14 application architecture reopen is justified unless that evidence exposes a concrete behavioral failure. M15 no longer requires design work and may proceed directly to full implementation；documentation must still not call M14 or M15 formally `Closed` before their respective evidence ledgers satisfy the frozen closure rules。
