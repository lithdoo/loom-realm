# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M10–M13 **Implemented / Qualified / Closed**；M14 **Implemented / requalification pending**；M15 **Implementation Frozen / Preimplementation Closed**
> 主要定义：M1–M17 实现顺序、current closure、M14 consumer proof、Desktop/PWA qualification boundary  
> 依赖：[渲染系统](../10-architecture/rendering-system.md)、[独立分包与发布架构](./package-architecture.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 最近复核：2026-09-11

实施状态与正式 closure 必须分开记录。M14 的当前 qualification subject / live evidence 只以 [`m14-qualification.md`](./m14-qualification.md) 为准；M15 current physical composition 只以根目录 [`M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md`](../../M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md) + ADR 0034 为准。

## Delivery order

```text
Foundation / Wire
→ Game document
→ Runtime Control
→ Subsystem Runtime / Frame
→ Main authority
→ Hostra Runtime profile
→ Renderer Control
→ Data role seam
→ Desktop Data Broker
→ Input
→ Render Replication
→ Content
→ Web Presentation
→ Map Game Library + First Real Game
→ Hostra-owned Desktop Full E2E
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

## M1–M9 — Foundation / Runtime Profile / Data ✅

```text
M1 Foundation + Wire
M2 Game Package
M3 Runtime Control
M4 Subsystem Runtime / Frame
M5 Main Core
M6 Hostra launch-profile Runtime
M7 Renderer Control
M8 Renderer Data
M9 Desktop Data Broker
```

Closed on the existing mainline implementation/qualification path。ADR 0033 records the historical direct-Electron run-as-node compatibility decision；ADR 0034 supersedes that embedding assumption for canonical M15 without reopening M6 application/protocol semantics or ordinary Node-hosted launch-profile behavior。

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
→ real Hostra-owned BrowserWindow DOM Keyboard/Pointer/Gamepad RendererInputSource

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

M15 trusted browser composition still requires private Content/Data clients to capture/bind authority-bearing browser primitives before business JS；this is physical hardening of the same M12/M9 capability boundaries, not a new logical protocol。

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

At the public M12 seam these records/resources are read through `struct.Map`、`struct.Tileset` and `resource.Graphics`。Unused MapInfo/Event/MapMetadata/Color/Tone/AudioFile facts remain outside the first consumer view until real behavior consumes them。

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

Map browser JS/CSS are standalone package artifacts loaded through prepared Content + M13 classic bootstrap。

### M14/03 — concrete example / fixture

`examples/essentials-v21.1/game.json` initial input：

```text
{ mapId:1, x:10, y:8, characterName:"m14_player" }
```

Canonical CI uses repository-author-owned semantic fixture + PNGs。Exact external Essentials v21.1 corpus remains separate local compatibility evidence；third-party bytes are never committed。

### M14/04 — real consumer vertical

Required chain：

```text
game.json validation
→ long-lived map Frame
→ selective Map/Tileset Content reads
→ initial full Render state
→ M13 bootstrap
→ real Chromium
→ tile pixels + player sprite
→ first ArrowRight: (10,8) → (11,8)
→ second ArrowRight: blocked at target (12,8)
```

M14 uses existing/synthetic RendererInputSource and test-owned physical composition。Real Hostra shell/BrowserWindow/DOM physical input/reload-shutdown belong to M15。

### M14/05 — closure

Canonical hosted gate：

```text
npm run test:m14
```

Exact-local gate：

```text
npm run test:m14:essentials-local -- --source <path-to-exact-v21.1-root>
```

Formal closure：

```text
one behavior-affecting subject SHA
+ exact-local PASS
+ hosted Node 20 PASS
+ hosted Node 24 PASS
→ M14 Closed
```

Current subject and live PASS/PENDING state are recorded only in `m14-qualification.md`。

---

## M15 — Hostra-owned Desktop Full E2E 🔒 Implementation Frozen / Preimplementation Closed

ADR 0034 corrects only the outer physical owner：

```text
Hostra shell
├─ Electron / BrowserWindow / RPC
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop plain Node process
├─ Main
├─ RuntimeHosting → Runner
├─ Desktop Data Broker
├─ Content + trusted shell
├─ Renderer Control loopback carrier
└─ Data settlement loopback carrier

Hostra-owned BrowserWindow
→ trusted Renderer
→ real DOM input
→ existing M13 presentation
→ same M14 game
```

Canonical M15 does **not** use LoomRealm-owned Electron app/BrowserWindow、LoomRealm preload、`MessageChannelMain` or ADR0033 run-as-node embedding。

Frozen physical SSOT：

```text
M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md
ADR 0034
```

Frozen Hostra baseline：

```text
hostra@1.0.1-beta.1
source d863beab3c59c3bd4f271514a228fa8fee0bf5b6
bundled Electron 44.1.1
shutdown grace 1000 ms
```

Old `M15_01`–`M15_05` retain logical/input intent only where explicitly preserved by the supersession matrix。

### Required physical invariants

```text
Hostra shell is sole Electron/BrowserWindow owner
LoomRealm Desktop is actual HOSTRA_SUBCMD Node child
Runner is LoomRealm RuntimeHosting child
Hostra RPC is host-control only
Control/Data settlement/Data application/Content remain separated
M9 Broker remains sole Data candidate/current owner
reload replaces Renderer identity
same-generation Data-only reconnect preserves Renderer identity
M10/M13/M14 logical paths remain unchanged
```

### Document/reload invariant

Single-window bootstrap uses only bounded state：

```text
pendingAcquire   0..1
pendingDocument  0..1
currentDocument  0..1
```

Main acquire and top-level document navigation rendezvous whichever arrives first。Only valid top-level main-document navigation may create a fresh Renderer document；ordinary `fetch(location.href)`、XHR、subframe or resource requests cannot retire/mint Renderer lifetime。

Reload：

```text
same Hostra windowId
→ old Renderer/document retires
→ fresh document/acquire rendezvous
→ fresh Renderer identity/material
→ Main/Runner/Subsystem/game truth unchanged
```

Data-only reconnect：

```text
same Renderer Control participant
→ Data physical pair replacement only
→ fresh RendererDataBinding.acquire()
→ same Renderer identity resumes current truth
```

### Termination invariant

All terminal triggers use one idempotent owner path：

```text
window.closed
SIGTERM/SIGINT
host.shuttingDown
RPC terminal
programmatic close
Main/Runner fatal
startup partial failure
    ↓
beginTermination
    ↓
abort runMain
    ↓
Main/RuntimeHosting convergence
    ↓
finally close Control/Data/Content/document resources
    ↓
LoomRealm process exit
```

This is required because frozen Hostra may signal the `HOSTRA_SUBCMD` during final-window shutdown；M15 must prove no orphan Runner remains under its 1000 ms grace。Desktop不得补第二份 direct Runner kill authority。

### Migration staging

```text
Slices 1–6
    canonical Hostra path does not depend on Electron ownership
    legacy direct-Electron path may remain isolated as regression oracle

Final replacement
    Hostra vertical qualified
    → delete legacy direct-Electron production ownership
    → repository-wide canonical apps/desktop Electron ownership/import = FAIL
```

Do not require repository-wide Electron deletion before the replacement vertical exists。

### Closure

Canonical M15 gate remains：

```text
npm run test:m15
```

It must run current `test:m14` first and then real frozen-Hostra boundary/build/E2E/input/reload/Data-only reconnect/lifecycle evidence。Formal M15 closure additionally requires M14 formal status = Closed。

**No further M15 architecture/design pass is required before implementation.** Slices 1–7 may proceed directly；only a real contradiction with the frozen Hostra baseline or frozen LoomRealm contracts may reopen physical design。

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

M15 Hostra-shell / HOSTRA_SUBCMD / loopback mechanics are Desktop-only and do not become PWA requirements。

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

M15 may proceed directly to full implementation according to ADR 0034 + the frozen recomposition SSOT, but documentation and qualification must not call M15 formally `Closed` before the Hostra-owned qualification subject satisfies its evidence ledger。
