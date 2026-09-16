# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking；M10、M12–M13 历史 Closed，M11/M14/M15 current subject Requalification Pending；ADR0037 corrected `/1` **Core Docs Freeze HOLD / Not Implemented**；Map dynamic **Map Docs Freeze HOLD / PR0 NOT RUN**。  
> 定义：M1–M17顺序、当期 `/1`/Map插入路线与已存在milestone的owner/证据边界。  
> 依赖：[渲染系统](../10-architecture/rendering-system.md) · [Package architecture](./package-architecture.md) · [Contracts](../15-contracts/README.md) · [ADR0032](../decisions/0032-game-library-example-boundary.md) · [ADR0034](../decisions/0034-hostra-owned-desktop-composition.md) · [ADR0035](../decisions/0035-render-domain-existing-node-update.md) · [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)。最近复核2026-09-16。

**Live status没有第二份：** corrected `/1`与Viewport只看 [v1 ledger](./viewport-profile-v1-qualification.md)；M11/M14/M15分别看各自`m11-qualification.md`、`m14-qualification.md`、`m15-qualification.md`。旧 `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea` 的ADR0035 M11→M14→M15历史qualification尚未全部通过，M15 refresh P95=96.3ms仍FAIL；旧 [RENDER_MOVEMENT_LATENCY_CORE_REFACTOR](https://github.com/lithdoo/loom-realm/blob/main/RENDER_MOVEMENT_LATENCY_CORE_REFACTOR.md)继续记录当时subject，不是新 `/1`/Map的资格SSOT。M15 physical owner仍是[Hostra recomposition](https://github.com/lithdoo/loom-realm/blob/main/M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)+ADR0034，不因Map改动重新选择。

## Delivery order

```text
Foundation/Wire → Game document → Runtime Control → Subsystem Runtime/Frame
→ Main authority → Hostra Runtime profile → Renderer Control → Data role seam
→ Desktop Data Broker → Input → Render Replication → Content → Web Presentation
→ Map Game Library/First Real Game → Hostra-owned Desktop E2E
→ PWA Runtime → PWA E2E/Equivalence
```

`Package Scope != Implementable Slice != Milestone Closure`；`Framework Package != Game Library != Concrete Game`；`Implementation complete != Qualification closed`。不得为假想后续消费者预制Profile v2/deprecated alias/通用框架。

---

## ADR0037 current route — corrected first-release `/1` + Map dynamic/performance

此路线上下游均为**新候选**，不重新定义旧milestone历史Closed。唯一目标`renderer-data/1 = Connection1+Input1+Render1+Viewport1`；旧三child可执行代码与PASS只是历史，不建`/2`/dual parser。外部兼容义务未核查，产品未发布不能代替签署；若需要mixed version/rolling rollback/独立consumer，STOP direct reset新ADR。

```text
Core C0  release owner外部兼容核查/owner+date+raw evidence+signoff
         → Connection旧三child组合投影仅编辑更正（已提交）
         → 原完整API/受保护行为diff终审
         → ADR/Profile v1/Viewport v1/conformance/architecture/index cross-review
         → Core Docs Freeze subject SHA（不要求先有新executable PASS）
Core C1  coherent single `/1` build cohort：data codec/peers/bounded sender
         + Renderer physical single-surface source + Subsystem scope.viewport
         + Main/Platform/product deployment一致
         → 新executable SHA revised Profile fixture revision3 + Viewport conformance
         + original Connection/Input/Render regressions + M13/Desktop/Hostra受影响证明
         → PWA物理source在其后续平台milestone验证
Map PR0 production-zero **feasibility**, not optimized-product PASS：
         fixed dense hosted + real local Map002/066 1080p exact data/JSON bytes
         + RenderDomain.update full-state residual + M13 structural equality cost
         + existing Browser baseline/Canvas memory + Chromium private-only CSS stacking oracle
         + current same-Browser-clock historical latency baseline（真实720/1080未实施仅prototype-only）
         → evidence complete + no unresolved schema/Core/M13/stacking blocker
         → Map design reviewer/date/docs SHA **Docs Freeze**；
           不要求尚未实施的camera-rAF zero-draw或优化后P95 PASS
Map PR1 fixed640 exact chunks/raster/paired stage → 640pixel parity +640目标P95
Map PR2 dynamic viewport + mid-motion rebase → 720/1080 real product/visual/memory/P95
Map PR3 same governed latest executable/cohort SHA + M11/M13/M14/M15 regression
         + final product latency/functional/memory gates → each designated ledger sign
         → only then continue M16
```

Map各刀的精确schema、真实测试命令/fixture、受控文件范围、PR0合格与PR1/PR2后P95门槛，**唯一以[Map机械实施合同](../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md) §0–§14为准**；[Map motion子规范](../../examples/essentials-v21.1-local/MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)仅属于Map-private细节。此前“PR0要已达到未来PR1/PR2真实性能才能Freeze”口径**已废止**，但PR0仍要对payload/Core/M13/Browser/stacking做真实反证，失败STOP。Core Docs Freeze不等于Map PR0 PASS；Map Docs Freeze不等于Map Implementation/Product Closed。细节状态与受保护语义见[freeze remediation](./viewport-v1-final-freeze-closure-2026-09-16.md)；旧历史subject不可转给新cohort。

---

## M1–M9 — Foundation / Runtime Profile / Data ✅ historical

```text
M1 Foundation+Wire
M2 Game Package
M3 Runtime Control
M4 Subsystem Runtime/Frame
M5 Main Core
M6 Hostra launch-profile Runtime
M7 Renderer Control
M8 Renderer Data
M9 Desktop Data Broker
```

Closed on historical mainline implementation/qualification path；M8 Closed专指原三child `/1`，**不代表当前修正后四child已完成**。ADR0033记录conditional Electron run-as-node兼容决策；ADR0034取代其作为canonical M15外部物理owner的假设，不改变M6普通Node launch profile或底层协议。

---

## M10 — User Input ✅ Closed historical

Canonical gate：`npm run test:m10`。Frozen `InputListener`、Main InputTarget/Activation authority、Renderer producer/gate seam。

```text
M14       existing/synthetic RendererInputSource for consumer qualification
M15       real Hostra BrowserWindow DOM Keyboard/Pointer/Gamepad physical producer
M17       equivalent PWA Window producer
```

旧说M14负责真实Desktop DOM input已Superseded；新增Viewport独立InputTarget，绝不改Frozen Input wire或继承旧M10 PASS充当新Profile完整PASS。

---

## M11 — Render Replication ⏳ Requalification Pending

Canonical gate：`npm run test:m11`。既有已实现/Frozen：Subsystem authoritative RenderDomain、Render Update v1、Renderer Store、one-shot node identity、fresh-carrier baseline、Event transient。Consumer author surface：

```text
scope.createRenderDomain(initialState) → SDK chooses opaque domainId
RenderDomain.replace(state)
RenderDomain.update(update)
RenderDomain.emit(event)
RenderDomain.close()
```

Map不得选择domainId或重开Render wire。ADR0035的existing-node update旧executable subject `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea`仅历史：本地`npm run test:m11`曾通过，hosted Node20/24待复验；[旧M11 run 34998417265](https://github.com/lithdoo/loom-realm/actions/runs/34998417265)不能给新executable背书。Map PR0发现full-state validation独立瓶颈须另行设计review，不能偷改Frozen limits。

---

## M12 — Content ✅ Closed historical

Canonical gate：`npm run test:m12`；readonly Content Service/FSDB、Subsystem ContentClient、Renderer trusted/private resource、version/credential boundary已闭合。M14复用`ContentClient.record()`/`ContentClient.resource()`/`PresentationResourceClient`；不能为首consumer加metadata/HEAD author API。M15浏览器物理组合的Content/Data私有client要在业务JS之前capture/bind权威browser primitives；这是原M12/M9 physical hardening，不是新逻辑协议。

---

## M13 — Web Presentation ✅ Closed historical / new subject regression pending

Canonical gate：`npm run test:m13`；Frozen Web Presentation Config v1、Web Presentation API v1、ADR0031、M13_01–05。流程：

```text
prepared Content → ordered <link>/classic <script> → business customElements register
→ window.onload → thin Web Projector → business WCs
```

Live identity=`(Session,subsystemKey,generation,domainId,key)`；same identity same HTMLElement，fresh Session/G新element universe。M13不建第二Store/loader/registry/map SDK。Viewport source本身不是第三种Projector reevaluation trigger；Map必须先经existing RenderDomain提交。Map PR0必须量测M13 frozen structural JSON equality的CPU residual，不许map刀直接改Projector；新four-child executable要跑受影响M13 regression。

---

## M14 — Map Game Library + First Real Game ⏳ Requalification Pending

旧M14 subject证明 Input/Render/Content/M13可供独立game-domain consumer；此前full retained snapshot暴露可测performance gap，ADR0035只补existing-node author update，不改repository owner；新dynamic extension与M14历史Frozen scope严格分开。

```text
examples/essentials-v21.1 (private concrete game)
→ game-libs/map / @loomrealm-game/map (reusable domain library)
→ public @loomrealm/subsystem author API
→ M10 Input + M11 Render + M12 Content + M13 Presentation
→ playable RMXP-compatible map slice
```

Current qualification subject以[`m14-qualification.md`](./m14-qualification.md)为准；旧`c642...` Requalification Pending，旧PASS不证明dynamic1080。原M14 landing order依次`M14_01_WORKSPACE_BOUNDARY.md`→`M14_02_MAP_GAME_LIBRARY.md`→`M14_03_ESSENTIALS_EXAMPLE.md`→`M14_04_REAL_GAME_VERTICAL.md`→`M14_05_QUALIFICATION_CLOSURE.md`；consumer projection事实归`tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md`。

### Workspace/author boundary

```text
packages/* → @loomrealm/* framework
game-libs/* → @loomrealm-game/* business library
examples/* → private concrete games
```

无Framework→game/example反向依赖。一个subsystemKey=`map`、一个business RenderDomain（domainId由SDK分配）。Source projection选择Map/{id} `tileset_id,width,height,data`、Tileset/{id}`id,tileset_name,passages,priorities`；经prepared Content按`struct.Map/struct.Tileset/resource.Graphics`使用，未消费MapInfo/Event/Metadata/Color/Tone/AudioFile不因viewport逆向扩 importer。Original first slice input=`keyboard.event`/non-repeat Arrow、一步attempt、directional passage bits z2→1→0、source+target reverse passability；fixed tile32、viewport640×480、nominal20×15、Runtime camera和旧DOM无resize反馈**只是历史first-slice**，新候选可经已治理`scope.viewport`改变。Managed tree仍`lr-map-view > lr-map-sprite`，Browser JS/CSS由prepared Content经M13 classic bootstrap。

### Example/vertical/gates

`examples/essentials-v21.1/game.json`原参数`{mapId:1,x:10,y:8,characterName:"m14_player"}`；CI使用repository-author fixtures+PNGs，外部exact Essentials v21.1 corpus须本地单独证据且不commit第三方bytes。Vertical：game.json→long-livedMapFrame→Map/Tileset Content→initial full Render→M13 bootstrap→real Chromium tile+Sprite→ArrowRight `(10,8)→(11,8)`→第二次 blocked `(12,8)`；M14用synthetic/test-ownedRenderer producer，真实Hostra physical归M15。

Hosted：`npm run test:m14`。Exact local：

```text
npm run test:m14:essentials-local -- --source <path-to-exact-v21.1-root> --map-id 66 --x 8 --y 7 --character-name trainer_POKEMONTRAINER_Red
```

原M14 closure需要**one behavior-affecting subject SHA + exact-local PASS + hosted Node20 PASS + hosted Node24 PASS**；当前PASS/PENDING只看M14 ledger。Map新viewport还受独立Core C0/C1与Map PR0→PR1/PR2→PR3 gate；旧Frozen gameplay/transfer/animation不可因新性能方案被削弱。

---

## M15 — Hostra-owned Desktop Full E2E ⏳ Requalification Pending

历史`c642...` ordinary P95 42.9ms≤50而refresh P95 96.3ms>50 FAIL；[旧run34998417264](https://github.com/lithdoo/loom-realm/actions/runs/34998417264)只证明历史。ADR0034与M15 physical frozen，不因Map性能差错重选outer owner。

```text
Hostra shell (sole Electron/BrowserWindow/RPC)
└── HOSTRA_SUBCMD LoomRealm Desktop plain Node process
    ├── Main
    ├── RuntimeHosting → Runner
    ├── Desktop Data Broker
    ├── Content + trusted shell
    ├── Renderer Control loopback carrier
    └── Data settlement loopback carrier
Hostra-owned BrowserWindow → trusted Renderer → real DOM Input → M13 → M14 game
```

**不采用**LoomRealm-owned Electron app/BrowserWindow、preload、MessageChannelMain、ADR0033 embedding。Physical SSOT为`M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md`+ADR0034；冻结baseline `hostra@1.0.1-beta.1`、source`d863beab3c59c3bd4f271514a228fa8fee0bf5b6`、Electron44.1.1、shutdown grace1000ms；旧M15_01–05仅保留supersession matrix明确的逻辑/input意图。

Physical invariants：Hostra shell唯一Electron/window owner；LoomRealm Desktop是实际HOSTRA_SUBCMD child，Runner是LoomRealm RuntimeHosting child；Hostra RPC仅host-control；Control/Data settlement/Data application/Content分开；M9 Broker唯一candidate/current owner；reload=freshRenderer identity；same-generation Data-only reconnect保留Renderer identity；M10/M13/M14逻辑路径不变。Bootstrap bounded `pendingAcquire 0..1 / pendingDocument 0..1 / currentDocument 0..1`，Main acquire与合法top-level document navigation whichever first；fetch(location.href)/XHR/subframe/resource不得mint/retire Renderer。

Reload链：sameHostra windowId→retire old document/Renderer→fresh acquire+rendezvous→newRenderer material，Main/Runner/Subsystem truth继续。Data reconnect链：same Renderer Control participant→physical pair replace→fresh `RendererDataBinding.acquire()`→sameRenderer identity恢复；不可把Data loss当全Window重启。

唯一idempotent terminal owner：window.closed/SIGTERM/SIGINT/host.shuttingDown/RPC terminal/programmatic close/Main or Runner fatal/startup failure→`beginTermination`→abort runMain→Main/RuntimeHosting convergence→finally close Control/Data/Content/document→LoomRealm exit。必须在Hostra1000ms grace下证明没有orphan Runner；Desktop不得增加第二direct Runner kill authority。迁移期间Slices1–6 canonical Hostra不依赖legacy Electron owner；legacy可隔离作regression oracle；**只有Hostra vertical合格后**删除legacy direct-Electron production ownership并要求 canonical apps/desktop Electron owner/import=FAIL，不能提前强制全仓删除。

Canonical gate：`npm run test:m15`，内部先`test:m14`再real Hostra boundary/build/E2E/input/reload/Data-reconnect/lifecycle。正式status只看[`m15-qualification.md`](./m15-qualification.md)。新改造P95用相同Browser Window clock `input-captured→browser-first-motion-paint`和真实pixel oracle，严禁跨进程减performance.now或以CDP screenshot round-trip计入原50ms指标；screenshots是独立正确性证据。失败须维持FAIL、按Map contract的新设计/实现资格路径收口，不能重开M15 Hostra physical design。

---

## M16 — PWA Runtime — pending

只闭合PWA runtime host：PWA PREPARE→Dedicated Worker Runner→RuntimeHosting→Runtime Control MessagePort→Main/Worker/Subsystem lifecycle与termination/failure；不要求PWA Renderer/Data/Content/Web presentation，现有Subsystem可先用普通Content unavailable capability等待M17。M15 Hostra shell/HOSTRA_SUBCMD/loopback皆Desktop-only。

---

## M17 — PWA Full E2E / Equivalence — pending

```text
Window Renderer Control → PWA Data broker/provisioning → PWA Content
→ physical Window Input → Render → M13 presentation → same M14 concrete game/WCs
→ Hostra/PWA shared logical business outcomes equivalence
```

等价比较logical semantics/business outcomes，不要求同PID/Worker或WebSocket/MessagePort或physical storage。

---

## Current status

```text
M1–M9                              ✅ historical
M10 Input                          ✅ Closed historical
M11 Render                         ⏳ Requalification Pending
M12 Content                        ✅ Closed 2026-09-08
M13 Web Presentation               ✅ historical Closed; new SHA regression pending
M14 Map                            ⏳ Requalification Pending
M15 Desktop E2E                    ⏳ Requalification Pending
Viewport + corrected /1            ⏳ Core Docs Freeze HOLD / Not Implemented
Map dynamic/performance             ⏳ Map Docs Freeze HOLD / PR0 NOT RUN
M16 PWA Runtime                     pending until all required earlier closure
M17 PWA Full E2E                    pending
```

Last unaffected historical milestone gate `npm run test:m13`，不是新four-child完整PASS。Live evidence分别归[Core v1](./viewport-profile-v1-qualification.md)、[M11](./m11-qualification.md)、[M14](./m14-qualification.md)、[M15](./m15-qualification.md) ledger。Refresh历史失败要求STOP/report及单独冻结follow-up，不授予改M14 business ownership或M15物理owner的权力。**当前路由已修正为：C0→C1→PR0可行性→Map Docs Freeze→PR1/PR2真实优化和P95→PR3同SHA全资格→才继续M16。**
