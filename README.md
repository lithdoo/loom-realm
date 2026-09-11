# LoomRealm

LoomRealm 是一个以 **platform-neutral logical Subsystem topology**、Main authority、capability-oriented role boundaries 与 cross-platform composition 为核心的模块化游戏运行平台。

Phase 1 使用 RPG Maker XP / Pokémon Essentials v21.1 compatibility corpus 验证真实 game consumer；M14 不再把 map 视为 framework package，而是通过 `game-libs/map` + `examples/essentials-v21.1` 验证 framework / game library / concrete game 分层。

---

## Repository ownership

```text
packages/      LoomRealm framework/runtime
game-libs/     reusable game-domain libraries (M14+)
examples/      concrete games (M14+)
apps/          Desktop/PWA platform hosts
tools/         development/import/compatibility tooling
```

主依赖方向：

```text
examples → game-libs → public LoomRealm author APIs
```

Framework 不反向拥有 map/menu/dialogue/battle 等业务 vocabulary。

---

## 当前入口

- [产品设计总览](./doc/00-overview/product-vision.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [渲染系统](./doc/10-architecture/rendering-system.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Web Presentation Config v1](./doc/15-contracts/web-presentation-config-v1.md)
- [Web Presentation API v1](./doc/15-contracts/web-presentation-api-v1.md)
- [ADR 0031：M13 Web Presentation Frozen Design](./doc/decisions/0031-business-owned-web-component-projection.md)
- [ADR 0032：Game Library / Example Boundary](./doc/decisions/0032-game-library-example-boundary.md)
- [ADR 0033：historical direct-Electron Runner compatibility](./doc/decisions/0033-electron-hostra-run-as-node.md)
- [Phase 1 交付计划](./doc/30-implementation/phase-1-delivery-plan.md)
- [M14 qualification record](./doc/30-implementation/m14-qualification.md)
- [M15 Hostra Desktop Recomposition Plan](./M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)
- [M15 Desktop product composition retained intent](./M15_01_DESKTOP_PRODUCT_COMPOSITION.md)
- [M15 qualification closure](./M15_05_QUALIFICATION_CLOSURE.md)
- [M15 qualification record](./doc/30-implementation/m15-qualification.md)
- [Package Architecture](./doc/30-implementation/package-architecture.md)
- [Map Game Library design](./doc/20-modules/loom-map/README.md)

---

## 当前状态

```text
M10 User Input                              ✅ Closed
M11 Render Replication                      ✅ Closed
M12 Content                                 ✅ Closed 2026-09-08
M13 Web Presentation                        ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game      ⚠️ Implementation complete / requalification pending
M15 Desktop full E2E                        🔄 Hostra physical recomposition / plan frozen
M16 PWA Runtime                             pending
M17 PWA full E2E                            pending
```

M14 design/implementation is frozen；the current exact-local gate is recorded PASS, while hosted Node 20/24 evidence for the current qualification subject remains pending. Formal status is owned only by [`m14-qualification.md`](./doc/30-implementation/m14-qualification.md).

M15 的 Main/Data/Renderer/Input/Presentation/game logical intent保持冻结；此前 standalone Electron implementation 作为历史/迁移证据保留，但 canonical physical host 已纠正为 **Hostra-owned Electron/BrowserWindow + `HOSTRA_SUBCMD` LoomRealm Node process**。当前 physical SSOT 是 [`M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md`](./M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)。

M15 formal closure仍要求 M14 formal closure + pinned Hostra identity + repeatable Hostra-owned `npm run test:m15` evidence。

Last formally closed milestone gate：

```text
npm run test:m13
```

Current M14 hosted requalification gate：

```text
npm run test:m14
```

---

## Authority Boundary

```text
Main
    Session / Runtime / Frame / Activation
    InputTarget / DataAuthority

Subsystem
    business state / Input Interest
    authoritative Render Domains
    author-facing ContentClient

Renderer
    read-only Main mirror
    per-subsystem Data consumers / current Render replicas
    trusted/private ResourceClient
    physical Web projection mutation

Business Web Component
    read-only projection consumer
    Shadow DOM / Canvas / WebGL / private presentation owner

Hostra
    Electron / BrowserWindow / direct subprocess host

Platform / apps/*
    LoomRealm Control/Data/Content physical composition
    external-host adapters
```

一个 authority只允许一个 owner；DOM/Platform/Host physical ownership不产生第二份 application authority。

---

## M13 Web Presentation — Implemented / Qualified / Closed

M13 已按冻结设计完成生产实现与真实 Chromium qualification。实现主线：

```text
Window bootstrap
→ current Control Session/DataAuthority + per-subsystem Render Store
→ package-private reevaluation / per-subsystem eligibility
→ thin Web Projector
→ business-owned Custom Elements
```

Formal source：

```text
Web Presentation Config v1   Active / Normative / Frozen
Web Presentation API v1      Active / Normative / Frozen
ADR 0031                     Accepted / Frozen decision provenance
```

实施顺序：

- [M13 / 01 — Bootstrap](./M13_01_WEB_PRESENTATION_BOOTSTRAP.md)
- [M13 / 02 — Renderer Presentation Seam](./M13_02_RENDERER_PRESENTATION_SEAM.md)
- [M13 / 03 — Web Projector](./M13_03_WEB_PROJECTOR.md)
- [M13 / 04 — Chromium Vertical](./M13_04_VERTICAL_INTEGRATION.md)
- [M13 / 05 — Qualification Closure](./M13_05_QUALIFICATION_CLOSURE.md)

M13不建立 second Store/topology、public PresentationState、component registry/loader、AssetManager、layout/layer framework、global service locator、DOM rollback framework或 mandatory presentation SDK/package。

M13 closure gate remains：

```text
npm run test:m13
```

Qualification evidence：[M13 Web Presentation qualification](./doc/30-implementation/m13-qualification.md)。M14 consumer evidence is tracked separately in [M14 Map Game qualification](./doc/30-implementation/m14-qualification.md)。

---

## M14 revised direction

M14 implementation does not create `packages/map` / `@loomrealm/map`：

```text
examples/essentials-v21.1
    consumes
        ↓
game-libs/map
    @loomrealm-game/map
        ↓
@loomrealm/subsystem public author APIs
        ↓
Frame / Input / Content / Render / M13
        ↓
playable map slice
```

M14 不为“通用地图”另建 normalized schema，但明确区分语义来源与 Runtime 数据格式：

```text
RMXP / Essentials map model
    = semantic authority

prepared FSDB JSON records/resources
    = persisted/runtime representation

ContentClient.record()/resource()
    = map Runtime access boundary
```

`RPG::Map` / `RPG::Tileset` / `RPG::MapInfo`、`RPG::Event` / Page / EventCommand、RGSS `Table` 与需要的 Essentials MapMetadata/map connections 只定义 FSDB JSON 字段的业务含义与关系来源；它们不是 `@loomrealm-game/map` 接收的 decoder object 类型。

现有 `tools/fixtures/essentials-v21.1` importer 负责 Ruby/Marshal/`.rxdata`/PBS 等 source semantics，并把 importer internal representation materialize 为可由 M12 Content API 返回的 JSON-compatible FSDB records/resources。`@loomrealm-game/map` 只通过 `ContentClient` 消费这些 `JsonValue` records/resources，不依赖 `RmxpObject`、`RubyString`、`$id/$ref/$typed`、decoder class/object、tooling filesystem 或 platform storage。

```text
Essentials source
→ importer decode/internal representation
→ semantic JSON materialization
→ FSDB JSON records + resources
→ M12 ContentClient
→ @loomrealm-game/map runtime
→ Render logical resource refs
→ M13 map WC
→ PresentationResourceClient
```

Map browser JS/CSS 本身也必须通过 prepared Content + `WebPresentationConfigV1` 启动；M14 qualification 使用 test-owned composition harness + existing production roles + real Chromium，不创建新的 production Host。

实施顺序：

- [M14 / 01 — Workspace Boundary](./M14_01_WORKSPACE_BOUNDARY.md)
- [M14 / 02 — Map Game Library](./M14_02_MAP_GAME_LIBRARY.md)
- [M14 / 03 — Essentials Example](./M14_03_ESSENTIALS_EXAMPLE.md)
- [M14 / 04 — First Real Game Vertical](./M14_04_REAL_GAME_VERTICAL.md)
- [M14 / 05 — Qualification Closure](./M14_05_QUALIFICATION_CLOSURE.md)

M10–M13 不因这次 repository/business ownership调整而 reopen。M14 formal requalification changes only the evidence/status claim unless a new hosted run exposes a concrete behavioral defect。

---

## M15 Desktop full E2E — Hostra physical recomposition

M15 当前 canonical product topology：

```text
pinned Hostra
├─ Electron app
├─ Hostra preload/RPC
├─ BrowserWindow owner
└─ HOSTRA_SUBCMD
     ↓
LoomRealm Desktop plain Node process
├─ Hostra RPC adapter
├─ Hostra PREPARE / Main / existing RuntimeHosting / Runner
├─ Desktop Data Broker
├─ Desktop Content + trusted shell
├─ Renderer Control loopback WS
└─ Data settlement loopback WS
     ↓
Hostra-owned BrowserWindow
→ trusted Renderer
→ real DOM input
→ existing M13 presentation
→ same M14 game
```

Frozen current boundaries：

```text
Hostra is sole Electron/BrowserWindow owner
apps/desktop production source does not import Electron
Hostra RPC is Window/lifecycle control only
Control / Data settlement / Data application / Content remain separated
M9 Broker remains sole Data candidate/current owner
trusted Renderer captures private browser primitives before business bootstrap
reload = same Hostra Window + fresh Renderer logical participant
shutdown/fatal/Hostra terminal converge through one Main cancellation owner chain
```

Implementation does not require generic `HostraManager`、`HostraSession`、Window/Document manager、TransportRegistry、ConnectionManager、RecoveryManager or a generic WebSocket transport package。Only concrete adapters with immediate production consumers are allowed。

Current document ownership：

- [M15 Hostra Desktop Recomposition Plan — current physical SSOT](./M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)
- [M15 / 01 — retained product ownership intent](./M15_01_DESKTOP_PRODUCT_COMPOSITION.md)
- [M15 / 02 — retained Renderer/M13/capability constraints](./M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md)
- [M15 / 03 — retained physical input/lifecycle semantics](./M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md)
- [M15 / 04 — Hostra full E2E evidence intent](./M15_04_DESKTOP_FULL_E2E_VERTICAL.md)
- [M15 / 05 — current closure rules](./M15_05_QUALIFICATION_CLOSURE.md)

Historical standalone Electron evidence remains in [M15 qualification record](./doc/30-implementation/m15-qualification.md) as migration evidence only；final closure must use the pinned Hostra-owned E2E subject。

---

## 本地文档

Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
