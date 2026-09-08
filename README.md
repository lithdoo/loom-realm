# LoomRealm

LoomRealm 是一个通过只读 Game Entry 声明 **platform-neutral logical Subsystem topology**、由 matching Platform Launcher 完成 common Game validation 与 current-platform executable PREPARE、由 Main 管理 Session/Runtime/Frame/Data authority，并由 Hostra Desktop / PWA Platform Composition 实现物理承载的模块化游戏运行平台。

Phase 1 使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` vertical validation。

---

## 当前入口

- [产品设计总览](./doc/00-overview/product-vision.md)
- [文档治理](./doc/00-overview/document-governance.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [Subsystem 模型](./doc/10-architecture/subsystem-model.md)
- [渲染系统](./doc/10-architecture/rendering-system.md)
- [存储与内容系统](./doc/10-architecture/storage-system.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Content API v1](./doc/15-contracts/content-api-v1.md)
- [Phase 1 交付计划](./doc/30-implementation/phase-1-delivery-plan.md)
- [Package Architecture](./doc/30-implementation/package-architecture.md)
- [ADR 0030：M12 Content 预实施闭环](./doc/decisions/0030-freeze-m12-content-preimplementation-closure.md)

### M10 — Implemented / Qualified / Closed

- [M10 / 01 — Subsystem InputManager](./M10_01_SUBSYSTEM_INPUT_MANAGER.md)
- [M10 / 02 — Renderer Input Gate](./M10_02_RENDERER_INPUT_GATE.md)
- [M10 / 03 — Renderer Input Producers](./M10_03_RENDERER_INPUT_PRODUCERS.md)
- [M10 / 04 — User Input Vertical Integration](./M10_04_VERTICAL_INTEGRATION.md)
- [M10 / 05 — Qualification and Closure](./M10_05_QUALIFICATION_CLOSURE.md)
- [M10 qualification record](./doc/30-implementation/m10-qualification.md)

### M11 — Implemented / Qualified / Closed

- [M11 / 01 — Subsystem RenderManager](./M11_01_SUBSYSTEM_RENDER_MANAGER.md)
- [M11 / 02 — Render Publication](./M11_02_RENDER_PUBLICATION.md)
- [M11 / 03 — Renderer Render Store](./M11_03_RENDERER_STORE.md)
- [M11 / 04 — Render Vertical Integration](./M11_04_VERTICAL_INTEGRATION.md)
- [M11 / 05 — Qualification and Closure](./M11_05_QUALIFICATION_CLOSURE.md)
- [M11 final closure review](./doc/30-implementation/m11-final-closure-review.md)
- [M11 qualification record](./doc/30-implementation/m11-qualification.md)

### M12 — Implemented / Qualified / Closed

M12 readonly Content capability 已完整落地，并在 Node 20.20.2 / 24.20.0 通过同一个 `npm run test:m12` 根门禁。

- [M12 / 01 — Desktop Content Service](./M12_01_CONTENT_SERVICE.md)
- [M12 / 02 — Subsystem Content Client](./M12_02_SUBSYSTEM_CONTENT_CLIENT.md)
- [M12 / 03 — Renderer Resource Client](./M12_03_RENDERER_RESOURCE_CLIENT.md)
- [M12 / 04 — Content Vertical Integration](./M12_04_VERTICAL_INTEGRATION.md)
- [M12 / 05 — Qualification and Closure](./M12_05_QUALIFICATION_CLOSURE.md)
- [`fsdb-http` M12 Core Extraction Amendment](./packages/fsdb-http/M12_CORE_EXTRACTION.md)
- [M12 qualification record](./doc/30-implementation/m12-qualification.md)

历史 M7/M8/M9 root plans继续保留作为已完成 milestone implementation provenance。

---

## Bootstrap Boundary

```text
Game installation/source
→ concrete Platform.prepareGame(source)
→ matching Launcher
→ @loomrealm/game-package validation
→ current Platform Launch Manifest join/preflight
→ immutable PlatformLaunchPlan
→ Platform-private plan install
→ LogicalGameBootstrap
→ runMain({bootstrap, platform, policy})
→ RuntimeHosting.launch
→ Host-owned Runner
→ platform-selected Definition Module
→ @loomrealm/subsystem/host
```

固定：

```text
Game Entry document != Main bootstrap model
Game topology != Platform executable binding
Main ✗ game-package / concrete launcher
Business ✗ Game Package / Launcher / protocol packages
```

---

## Authority / Role Boundary

```text
Main
    Session / Runtime / Frame / Stack / Activation
    InputTarget / Renderer currentness / DataAuthority

Subsystem
    business state
    local Frame Context / mutation gate
    Desired Input Interest + retained author State
    Render authoritative state
    author-facing ContentClient usage

Renderer
    read-only Main mirror
    current Data consumers
    canonical Producer facts / Input sender
    Render replica
    private Content resource reads

Platform
    executable binding
    Runtime/Renderer hosting
    Control/Data physical provisioning
    Content service/binding/credential
```

一个 authority 只允许一个 owner；Platform physical ownership不产生第二份 application authority。

---

## Current Data / Input / Render

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Data provisioning/loss != Runtime failure / Frame unwind。

Input：

```text
Effective
= current Data
× Main InputTarget(F,A)
× active F/A
× Interest[F]
× Producer(C)
```

M10已关闭：Subsystem `createInputListener`、Renderer `RendererInputSource`、mutation-gate State convergence、fresh Data/Activation semantics均已 qualification。

M11已关闭：Subsystem `createRenderDomain(initialState)` + `replace/emit/close`、bounded publication、Renderer internal replica、same-generation reconnect baseline、identity one-shot和 Desktop/Hostra vertical均已 qualification。DOM/Canvas/WebGL presentation仍属于 M14。

---

## M12 Frozen Content Boundary

M12不是“重新实现 HTTP”。现有 `@loomrealm/fsdb-http` 的 FSDB HTTP mechanics被机械拆成一个完整 readonly FSDB core：

```text
Node stdlib
    ↓
@loomrealm/fsdb
    ├────────→ @loomrealm/fsdb-http
    └────────→ apps/desktop Content composition
```

`@loomrealm/fsdb` 是 Node-only、public publishable workspace package；它只拥有 FSDB validation/snapshot/index/descriptor/entry+metadata lookup/safe-read/read-lease，不拥有 LoomRealm Content API。

Desktop M12：

```text
Hostra PREPARE
→ current immutable prepared installation view
→ @loomrealm/fsdb snapshot
→ private immutable Content Index + normalized public manifest
→ localhost Content Service
```

Content v1 当前固定：

```text
GET / HEAD only
record/group key = single segment
resource key = hierarchical logical ResourceKey
contentVersion = sha256:<64 lowercase hex>
ETag = quoted exact contentVersion
Desktop bearer is Host-private scoped material
Content capability != executable resolver
```

Subsystem author root只增加真实 consumer需要的 `scope.content.record/resource`；Renderer通过 trusted `@loomrealm/renderer/resource-client` integration subpath提供 logical resource → version-checked bytes responsibility，Renderer root保持不变。M12不建立 `@loomrealm/content`、`@loomrealm/content-service`、generic Repository、StorageProvider、InstallationRegistry 或 AssetManager framework。

---

## Current Milestones

```text
M1 Foundation + Wire                  ✅
M2 Game Package                       ✅
M3 Runtime Control                    ✅
M4 Subsystem Runtime/Frame            ✅
M5 Main Core                          ✅
M6 Hostra Runtime vertical            ✅
M7 Renderer Control                   ✅
M8 Renderer Data role/core            ✅
M9 Desktop Data Broker                ✅
M10 User Input                        ✅ Qualified / Closed
M11 Render                            ✅ Qualified / Closed
M12 Content                           ✅ Qualified / Closed 2026-09-08
M13 loom.map                          pending
M14 Desktop full E2E                  pending
M15 PWA Runtime                       pending
M16 PWA full E2E/equivalence          pending
```

Critical path保持：

```text
Input → Render → Content → loom.map → Desktop full E2E → PWA Runtime → PWA full E2E/equivalence
```

M13 `@loomrealm/map → @loomrealm/subsystem`，真实消费 Frame/Input/Render/Content；M14完成 BrowserWindow/Renderer Control/Input/Render presentation/Content；M15只完成 PWA Runtime；M16完成 PWA Renderer/Data/Input/Render/Content和 Hostra/PWA logical equivalence。

---

## Dependency Rules Through M12

```text
@loomrealm/foundation → platform-ports / protocol mechanics
@loomrealm/wire       → runtime-control / renderer-control / data / game-package
@loomrealm/main       → platform-ports + runtime-control + renderer-control + wire
@loomrealm/renderer   → renderer-control + platform-ports + data
@loomrealm/subsystem/host → platform-ports + runtime-control + data
Business Definition  → @loomrealm/subsystem only
@loomrealm/map        → @loomrealm/subsystem

@loomrealm/fsdb-http  → @loomrealm/fsdb
apps/desktop Content  → @loomrealm/fsdb
```

Forbidden：

```text
protocol mechanics → role authority implementations
main → game-package / concrete launcher / renderer role
business → platform/protocol/FSDB/HTTP packages
InputManager/RenderManager → raw carrier reader
ContentClient → filesystem path / bearer / raw Response exposure
Hostra/PWA private retry/currentness protocol
```

---

## Cross-platform Equivalence

Hostra/PWA共享 logical semantics，而不是 physical identity：

```text
same logical Game topology/bootstrap semantics
same SubsystemDefinitionFactory ABI
same Runtime/Frame/Renderer Control/Data/Input/Render semantics
same Content logical response semantics
same business-observable result for same logical scenario
```

可不同：Platform Launch Manifest、artifact/path、PID/Worker、WebSocket/MessagePort、IPC/Port transfer、Desktop FSDB/HTTP vs PWA Service Worker/OPFS/Cache。

完整 Hostra/PWA transport/content equivalence在 M16关闭。

---

## 文档与测试

需要 Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```

当前 package/unit/vertical regression入口为：

```text
npm run test:regression
```

M12唯一 canonical closure target为 `npm run test:m12`，并由 `.github/workflows/m12.yml`在 Node 20/24持续执行；`test:m9`、`test:m10`、`test:m11`仅保留各自的历史 qualification，不再递归承载后续 milestone regression。后续 M13/M14只消费已冻结的 `scope.content` 与 Renderer resource bytes seam，不重新选择 M12 identity/version/credential/lifetime语义。
