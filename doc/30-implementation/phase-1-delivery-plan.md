# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M10、M12–M13 Closed 历史资格；ADR0035 subject `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea` 的 M11/M14/M15 **Requalification Pending**；新增 ADR0037 revised `/1`/Viewport **Docs Freeze HOLD / Not Implemented**；M15 physical design remains ADR0034 + recomposition SSOT  
> 主要定义：M1–M17 实现顺序、current closure、M14 consumer proof、Desktop/PWA qualification boundary及 viewport/direct-v1 当前实施插入顺序  
> 依赖：[渲染系统](../10-architecture/rendering-system.md)、[独立分包与发布架构](./package-architecture.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)、[ADR 0035](../decisions/0035-render-domain-existing-node-update.md)、[ADR 0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> 最近复核：2026-09-16

实施状态与正式 closure 必须分开记录。M14 的 current qualification subject/live evidence 只以 [`m14-qualification.md`](./m14-qualification.md) 为准；M15 current physical composition 只以根目录 [`M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md`](https://github.com/lithdoo/loom-realm/blob/main/M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md) + ADR0034 为准。**新的 revised Renderer Data Profile `/1` + Viewport v1 maturity 只看 [v1 qualification ledger](./viewport-profile-v1-qualification.md)，本计划不复制其签署状态。**

ADR0035 是历史 current executable subject 的 accepted cross-milestone capability evolution：`c642cda9cee2b318b3aa8f6285de05d6b6ed6bea` 上 M11→M14→M15 的资格未全部通过，M15 refresh latency gate失败。原 [`RENDER_MOVEMENT_LATENCY_CORE_REFACTOR.md`](https://github.com/lithdoo/loom-realm/blob/main/RENDER_MOVEMENT_LATENCY_CORE_REFACTOR.md) 仍拥有其原 subject/performance证据，但**不能覆盖新增 ADR0037 four-child `/1` 的当期实施依赖、替新的 executable SHA 背书或令原 P95失败变为 PASS**。当前插入路线以本文“ADR0037 current route”、[freeze remediation](./viewport-v1-final-freeze-closure-2026-09-16.md)和各自资格 ledger 为准。

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

## ADR0037 current route — revised first-release `/1` / Viewport / Map performance

这是一项跨既有 M8/M10/M11/M14/M15 的**新候选改造**，不是重新定义原 milestone 的历史 Closed，也不是恢复 Profile v2。直接修正的唯一目标为 `renderer-data/1 = Connection1 + Input1 + Render1 + Viewport1`；旧 executable三 child `/1`及其 PASS 只作历史。当前所有新阶段均未 Freeze/实施/运行。外部兼容义务不能仅凭产品未发布推断为零；如果有混版/独立 consumer，STOP direct reset并新ADR。

```text
Core C0  外部兼容义务调查并由发布负责人签署
         → Frozen Connection v1 §1/§22仅编辑性同步 current composition
         → package exact API/旧 Frozen行为保全审查
         → revised Profile v1/Viewport v1/两份 conformance + 架构/索引 cross-review
         → 记录 docs-only SHA；Core Docs Freeze（不要求预先 executable PASS）
Core C1  协调同一 coherent build cohort：
         @loomrealm/data 唯一 /1 codec/demux/terminal/bounded publisher
         → Renderer current physical single-surface source
         → Subsystem Runtime-scoped readonly scope.viewport
         → Main/product DataAuthority/Platform coordinated deployment
         → new executable SHA：Profile fixture revision3 + Viewport conformance
         + original Connection/Input/Render regression + M13/Desktop/Hostra affected proof
         → PWA source在其自身平台里程碑测试
Map PR0 dense1080 exact UTF-8 payload + RenderDomain.update full-state residual
         + Browser receive/raster/memory + one-clock stimulus→paint P95
         → 未证明通过前 Map Docs Freeze HOLD
Map PR1 固定640 chunk/raster/sprite优化（不偷改Core或简化既有语义）
Map PR2 dynamic viewport + map-private View/Sprite one-paint/motion coordination
PR3      同一受治理 current executable SHA 完成受影响 M11/M13/M14/M15 regression
         → 每个 milestone 各自 ledger签署后才继续 M16
```

精确 Freeze blocking checklist 与 protected-semantic审查见 [final remediation](./viewport-v1-final-freeze-closure-2026-09-16.md)；Profile/Viewport事实由正式 contracts独占；[Map draft](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)拥有 map窗口/camera/chunks/payload/性能，Map-private [motion-stage closure](../../examples/essentials-v21.1-local/MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)补足ordinary movement不增长visualEpoch时的两 WC同步候选。**Core Docs Freeze不要求 Map PR0 PASS；Map Freeze不能从 Core conformance推导性能 PASS。** 历史 `c642...`与新 four-child executable SHA不得混作同一受治理 subject。

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

Closed on the existing mainline implementation/qualification path。ADR0033 records the historical direct-Electron run-as-node compatibility decision；ADR0034 supersedes that embedding assumption for canonical M15 without reopening M6 application/protocol semantics or ordinary Node-hosted launch-profile behavior。**这里的 M8 Closed仅为历史三-child `/1`代码，不是修正后 `/1`的完成声明。**

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

Older wording assigning real Desktop DOM input to M14 is superseded；M10 API is unchanged。新增 Viewport不能 gate 于 InputTarget、改 Input wire或继承 M10 旧 PASS作为 revised `/1`全套 PASS。

---

## M11 — Render Replication ⏳ Requalification Pending

Canonical gate：

```text
npm run test:m11
```

Implemented and contract-frozen：Subsystem authoritative RenderDomain、Render Update v1、Renderer Store、one-shot node identity、reconnect baseline semantics and Event transient behavior。Current-subject qualification remains pending。

M14 constraint：

```text
createRenderDomain(initialState)
→ SDK assigns opaque domainId
RenderDomain.replace(state)
RenderDomain.update(update)
RenderDomain.emit(event)
RenderDomain.close()
```

Business authors do not choose `domainId`；M14 does not reopen this surface。

ADR0035 的 `RenderDomain.update()` historical executable subject 是 `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea`；本地 `npm run test:m11`曾通过，hosted Node20/24 尚待复验。旧 [M11 run 34998417265](https://github.com/lithdoo/loom-realm/actions/runs/34998417265)只证明历史 subject；修正版 `/1`再实施后还需在新subject上重新取得受影响证据。

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

M14 consumes this surface；it does not introduce a second presentation store、loader、component registry or map SDK in Renderer。Viewport source不是第三个 Projector re-evaluation authority；新 four-child subject仍须跑 M13 affected regression。

---

## M14 — Map Game Library + First Real Game ⏳ Requalification Pending

旧 M14 subject证明了 M10–M13 可以支持真实独立 business consumer且没有吸收 Map业务语义。后续实测同时暴露完整 retained Snapshot 的可测性能缺口；ADR0035 因而增加一个通用 existing-node author capability，但不改变下述 repository ownership、consumer direction 或 Map-private vocabulary：

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

The architecture/consumer contract remains frozen. Previous subjects remain historically Closed, but historical current subject `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea` is Requalification Pending in [`m14-qualification.md`](./m14-qualification.md)。本次 dynamic map extension另受 Core `/1`与 Map PR0 gating；历史 M14 first-slice PASS不证明新动态视口或1080p。

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

RMXP passability uses frozen directional passage bits、top-down source layers/priorities and source-direction + target reverse passability checks。

Fixed presentation constants：

```text
tileSize = 32
CSS viewport = 640×480
nominal grid = 20×15
```

Runtime owns logical camera；no DOM→Runtime resize/layout feedback **属于旧 first-slice fixed-640事实，不限制新已治理的 `scope.viewport`候选**。

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
npm run test:m14:essentials-local -- --source <path-to-exact-v21.1-root> --map-id 66 --x 8 --y 7 --character-name trainer_POKEMONTRAINER_Red
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

## M15 — Hostra-owned Desktop Full E2E ⏳ Requalification Pending

Historical subject `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea` 的 ordinary movement P95 `42.9ms` 通过，但 refresh P95 `96.3ms` 未达到 `<=50ms`。ADR0034、Hostra baseline 和 physical design继续冻结；旧 [M15 run 34998417264](https://github.com/lithdoo/loom-realm/actions/runs/34998417264)只证明历史 subject。新 Core `/1`及 Map extension需自己的 current executable+PR0性能证据，历史 P95不能挪用。

ADR0034 corrects only the outer physical owner：

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

It must run current `test:m14` first and then real frozen-Hostra boundary/build/E2E/input/reload/Data-only reconnect/lifecycle evidence。Formal M15 status is Requalification Pending in [`m15-qualification.md`](./m15-qualification.md)。

M15 implementation is retained, but qualification is incomplete because the frozen refresh performance gate fails. This does not reopen physical design；follow-up optimization requires a separate frozen design。

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
M1–M9                                      ✅ historical baseline
M10 User Input                             ✅ Closed historical baseline
M11 Render Replication                     ⏳ Requalification Pending
M12 Content                                ✅ Closed 2026-09-08
M13 Web Presentation                       ✅ Closed 2026-09-09; new subject regression pending
M14 Map Game Library + First Real Game     ⏳ Requalification Pending
M15 Desktop Full E2E                       ⏳ Requalification Pending
Viewport + corrected /1                  ⏳ Docs Freeze HOLD / Not Implemented
Map dynamic viewport/performance          ⏳ Map Freeze HOLD / PR0 NOT RUN
M16 PWA Runtime                            blocked by current requalification
M17 PWA Full E2E / Equivalence             pending
```

Last unaffected formally closed milestone gate：

```text
npm run test:m13
```

Live evidence remains in the designated ledgers. The refresh latency failure requires stop/report plus a separately frozen follow-up；it does not authorize reopening M14 ownership or M15 physical design。

**Current route**：ADR0037 external compatibility/Docs Freeze → coherent revised `/1` executable subject + revised conformance/old regression → Map PR0 measurement → Map PR1/PR2 → affected M11/M13/M14/M15 qualification → only after formal closure resume M16。ADR0035 的旧 `c642...`及历史 M11/M14/M15证据仅作为基线，不再覆盖本次新subject；唯一 live status 分别看 [viewport v1 ledger](./viewport-profile-v1-qualification.md)、[M11](./m11-qualification.md)、[M14](./m14-qualification.md)、[M15](./m15-qualification.md)。