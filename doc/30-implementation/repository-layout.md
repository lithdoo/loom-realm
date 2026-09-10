# 仓库与目录方案

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M1–M13 implemented/qualified；M14 implementation complete / requalification pending；M15 placement frozen  
> 主要定义：current monorepo physical placement、framework/game-library/example/app ownership、M14–M17 materialization order  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0033](../decisions/0033-electron-hostra-run-as-node.md)  
> 最近复核：2026-09-11

公开 package/authority 职责以 architecture/contracts/package architecture 为权威；本文只回答“代码放哪里、何时 materialize”。不要为了未来 symmetry 预建目录、package 或 orchestration framework。

Live milestone status由 [`phase-1-delivery-plan.md`](./phase-1-delivery-plan.md) 汇总；M14 formal evidence/status只以 [`m14-qualification.md`](./m14-qualification.md) 为准。

---

## 1. Current / Planned Top-level

```text
packages/      LoomRealm framework/runtime
    foundation/
    platform-ports/
    wire/
    game-package/
    game-launcher-hostra/
    game-launcher-pwa/
    runtime-control/
    renderer-control/
    data/
    fsdb/
    fsdb-http/
    main/
    subsystem/
    renderer/

game-libs/     reusable game-domain libraries
    map/        M14 → @loomrealm-game/map

examples/      concrete private games
    essentials-v21.1/   M14

apps/          platform hosts/products
    desktop/    existing from M9; M15 adds full Electron BrowserWindow E2E
    pwa/        materializes with real PWA work

tools/         development/import/compatibility tooling
    fixtures/essentials-v21.1/
```

The current M12 Content realization is distributed across existing FSDB/HTTP、Subsystem/Renderer clients and Desktop composition；there is no current `packages/content` or `packages/content-service` package。There is also no `packages/map` / `@loomrealm/map`；Map business belongs to `game-libs/map`。

Root workspaces before the M14 additions were：

```text
packages/*
apps/*
```

M14/01 adds：

```text
game-libs/*
examples/*
```

`tools/*` remains tooling rather than a runtime workspace category。

---

## 2. Ownership Categories

```text
packages/*
    protocols / roles / shared framework mechanics

game-libs/*
    reusable game business + optional business-owned browser presentation

examples/*
    concrete Game Entry / content composition / example-specific presentation declaration

apps/*
    physical Process / Worker / Window / transport / product composition

tools/*
    import / compatibility / preparation helpers
```

Primary dependency direction：

```text
examples → game-libs → public LoomRealm author APIs
```

Forbidden：

```text
packages → game-libs/examples
game-libs Runtime → renderer/main/platform/protocol internals
runtime game code → tools/*
apps/* owning reusable map business semantics
```

---

## 3. Existing Core Placement

Existing M1–M13 packages keep their current ownership。Important placement constraints：

```text
packages/platform-ports
    narrow shared Core↔Platform structural ports only

packages/main
    Session/Runtime/Frame/Activation/InputTarget/DataAuthority authority

packages/subsystem
    author API + trusted runSubsystem host integration

packages/renderer
    Renderer Control/Data/Input/Render + trusted M13 Web presentation mechanics
    M15 materializes @loomrealm/renderer/web-presentation as the narrow product subpath

packages/game-launcher-hostra
    Hostra PREPARE / Node Runner / child-owned provisioning mechanics
    M15 Electron embedding correction remains here, not in apps/desktop

packages/fsdb + packages/fsdb-http
    Desktop prepared-content storage / readonly HTTP mechanics

apps/desktop
    Desktop app-scoped Data broker/content/shell/presentation physical composition
```

Do not move Hostra WS/IPC into protocol packages or map business into `apps/desktop`。

---

## 4. M14 Physical Placement

M14 materializes exactly the first real framework-consumer layer：

```text
game-libs/map/
    package.json
    tsconfig.json
    src/                  Runtime Definition + small map helpers
    browser/              classic map.browser.js + map.css source
    test/                 game-lib semantic tests

examples/essentials-v21.1/
    package.json          private=true
    game.json
    presentation.json
    presentation.css
    fixture/              repository-owned semantic/PNG fixture material as needed
```

Exact private filenames may vary where M14/01–05 do not make them observable。

`@loomrealm-game/map` root is the Runtime Definition entry。Stable browser package subpaths expose：

```text
@loomrealm-game/map/browser/map.browser.js
@loomrealm-game/map/browser/map.css
```

Prepared Content assembly is a small action/test preparation step; do not create GamePackager/ContentBuilder/Manifest framework。

M14 repository qualification may use a small test-local composition function connecting existing Main/Subsystem/Data/Renderer/Content roles + real Chromium。It is not a production Host package。

---

## 5. M15 Desktop Placement

M9 already created `apps/desktop` for real Desktop Data Broker mechanics。M15 extends the real Desktop product composition without adding another top-level package category：

```text
packages/game-launcher-hostra
    current process.execPath Runner
    + Electron-only host-synthesized ELECTRON_RUN_AS_NODE=1

packages/renderer
    existing @loomrealm/renderer/resource-client
    + narrow @loomrealm/renderer/web-presentation product subpath

apps/desktop
    Electron main entry
    exact loopback app-shell + existing Content route composition
    isolated preload handoff
    BrowserWindow Control/Data adapters
    DOM RendererInputSource
    product startup/reload/shutdown composition

examples/essentials-v21.1
    checked-in Hostra-ready game installation
```

Canonical physical chain：

```text
Hostra PREPARE
→ Main
→ existing Hostra Runner child in Electron Node mode
→ Runtime/Data physical paths
→ same-origin 127.0.0.1 shell + Content
→ secure Electron BrowserWindow
→ existing M13 Web presentation
→ real BrowserWindow RendererInputSource
→ same M14 game/map Runtime/WC
→ reload / reconnect / shutdown
```

M15 does not move map code into Desktop and does not reopen M10–M14 logical contracts。Do not create another package merely to hold Electron bootstrap、native primitive capture or same-origin shell routing；these are bounded concrete `apps/desktop` mechanics except for the nearest-owner Hostra/Renderer fixes already identified。

---

## 6. M16 / M17 PWA Placement

M16 materializes only the real PWA Runtime hosting slice needed for：

```text
PWA PREPARE
→ Dedicated Worker Runner
→ RuntimeHosting
→ Runtime Control MessagePort
→ Main ↔ Worker ↔ Subsystem lifecycle
```

PWA Data/Content/Renderer/physical input/Web presentation are not required to close M16。Existing `runSubsystem` supports absent physical Content by exposing the normal unavailable Content capability。

M17 then completes：

```text
Window Renderer Control
PWA Data broker / MessageChannel provisioning
PWA Content realization
physical Window RendererInputSource
M13 Config/API/Projector
same M14 concrete game + business WC
cross-platform observable equivalence
```

Do not pre-create PWA abstractions merely to mirror Hostra filenames/classes。M15's Electron run-as-node and same-loopback-origin choices do not create PWA directory/package requirements。

---

## 7. Test Placement

Keep evidence close to its owner：

```text
packages/*/test
    package/role/protocol behavior

game-libs/map/test
    map validation/passability/camera/projection behavior

tools/fixtures/essentials-v21.1/test
    selective M14 source→consumer projection

repository test/m14* / equivalent
    cross-owner qualification harness + boundaries

apps/desktop/test
    Desktop physical composition evidence

test/m15* / equivalent
    repository boundary/full Electron vertical evidence

PWA package/app tests
    M16/M17 physical realization evidence
```

A giant E2E never replaces lower-owner qualification。

---

## 8. Abstraction Budget

Do not introduce for M14–M17 without real consumer evidence：

```text
GameLibrary registry/base framework
MapRepository / MapManager / MapBundle
MapNormalizedV1
ConsumerProjector<T> / ProjectionRegistry
AssetManager / ResourceProvider
SceneGraph / LayerManager
MiniDesktopHost / MapHost / GameRuntimeHost
RuntimeDirectory
UniversalPlatform / StorageProvider SPI
BrowserPrimitiveRegistry
LocalWebServer / StaticAssetServer framework
workspace orchestration framework
Generic RPC / EventBus / transaction / retry framework
```

Small private records/maps/functions remain preferable when they satisfy the concrete owner。

---

## 9. Current Materialization Order

Repository layout follows demand order；it does not own formal milestone status：

```text
M1–M13
↓
M14 Map Game Library + First Real Game
↓
M15 Desktop Full E2E
↓
M16 PWA Runtime
↓
M17 PWA Full E2E / Equivalence
```

Current summary见 [`phase-1-delivery-plan.md`](./phase-1-delivery-plan.md)。截至本次复核，M14 implementation complete / requalification pending，M15 Implementation Frozen / Preimplementation Closed。Do not create later-milestone production machinery early merely to make current tests look more product-like。
