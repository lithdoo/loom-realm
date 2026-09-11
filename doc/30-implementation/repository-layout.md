# 仓库与目录方案

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M1–M15 implemented/qualified/Closed  
> 主要定义：current monorepo physical placement、framework/game-library/example/app ownership、M14–M17 materialization order  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 最近复核：2026-09-11

公开 package/authority职责以 architecture/contracts/package architecture为权威；本文只回答“代码放哪里、何时 materialize”。Live milestone status由 `phase-1-delivery-plan.md` 与对应 qualification ledger拥有。

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

apps/          platform/product compositions
    desktop/    existing from M9; M15 recomposes as Hostra HOSTRA_SUBCMD plain Node product
    pwa/        materializes with real PWA work

tools/         development/import/compatibility tooling
    fixtures/essentials-v21.1/
```

M12 Content仍分布在 existing FSDB/HTTP、Subsystem/Renderer clients 与 Desktop composition；不存在 mandatory `packages/content` / `packages/content-service`。Map business属于 `game-libs/map`，不存在 framework `packages/map`。

Root workspace categories remain：

```text
packages/*
apps/*
game-libs/*
examples/*
```

`tools/*` remains tooling。

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
    concrete product/platform composition
    may own Process/Worker/transport services
    does not automatically own external host primitives

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

```text
packages/platform-ports
    narrow shared Core↔Platform structural ports only

packages/main
    Session/Runtime/Frame/Activation/InputTarget/DataAuthority authority

packages/subsystem
    author API + trusted runSubsystem host integration

packages/renderer
    Renderer Control/Data/Input/Render + trusted M13 Web presentation mechanics
    includes narrow @loomrealm/renderer/web-presentation product subpath

packages/game-launcher-hostra
    Hostra launch profile: PREPARE / Node Runner / child-owned provisioning mechanics
    conditional Electron-main run-as-node compatibility remains local to this Runtime owner

packages/fsdb + packages/fsdb-http
    Desktop prepared-content storage / readonly HTTP mechanics

apps/desktop
    Desktop app-scoped Hostra RPC adapter
    Main/RuntimeHosting composition
    Desktop Data Broker
    Content + trusted shell
    Renderer Control/Data settlement physical carriers
    DOM RendererInputSource
    product startup/reload/termination composition
```

External `lithdoo/hostra` shell is not a LoomRealm workspace package。Do not move Hostra RPC/Window ownership into protocol packages or map business into `apps/desktop`。

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
    launch.hostra.json
    presentation.json
    presentation.css
    fixture/              repository-owned semantic/PNG fixture material as needed
```

`@loomrealm-game/map` root is the Runtime Definition entry。Browser artifacts stay on stable package subpaths and enter the product through prepared Content + M13 Config；Prepared Content assembly remains a small concrete action rather than GamePackager/ContentBuilder framework。

M14 qualification may use test-owned composition + real Chromium；it is not a production Host。

---

## 5. M15 Desktop Placement

M9 already created `apps/desktop` for Desktop Data Broker mechanics。M15 recomposes the product without adding a top-level package category or shared Hostra framework。

Canonical placement：

```text
external lithdoo/hostra
    Electron / BrowserWindow / JSON-RPC / direct HOSTRA_SUBCMD owner
        ↓
apps/desktop
    plain Node product entry
    concrete Hostra RPC adapter
    Main + existing RuntimeHosting
    Desktop Data Broker
    Content + trusted shell
    Renderer Control loopback carrier
    Data settlement loopback carrier
    DOM RendererInputSource browser artifact/composition
        ↓
packages/game-launcher-hostra
    existing Node Runner realization
        ↓
Runner

packages/renderer
    @loomrealm/renderer/resource-client
    @loomrealm/renderer/web-presentation

examples/essentials-v21.1
    checked-in Hostra-ready game installation
```

Canonical physical chain：

```text
frozen Hostra shell ready
→ HOSTRA_SUBCMD apps/desktop plain Node process
→ Hostra launch-profile PREPARE
→ Main / RuntimeHosting / Runner
→ LoomRealm Control/Data/Content services
→ Hostra RPC openWindow
→ Hostra-owned BrowserWindow
→ trusted Renderer / real DOM input / M13 presentation
→ same M14 game
→ reload / reconnect / termination qualification
```

Final replacement boundary：

```text
canonical apps/desktop production path imports no Electron
canonical path creates no BrowserWindow and owns no app.quit
Hostra RPC remains host-control only
```

Migration may temporarily retain isolated direct-Electron code as regression oracle until Hostra replacement vertical passes；then dead Electron ownership/start dependency must be removed。

Do not add another package merely to hold Hostra bootstrap、Window state、WS transport or native primitive capture。Concrete files/functions in `apps/desktop` are preferred。

---

## 6. M16 / M17 PWA Placement

M16 materializes only：

```text
PWA PREPARE
→ Dedicated Worker Runner
→ RuntimeHosting
→ Runtime Control MessagePort
→ Main ↔ Worker ↔ Subsystem lifecycle
```

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

Hostra shell/HOSTRA_SUBCMD/loopback WS/HTTP/signal mechanics are Desktop-only and do not create PWA directories/packages or common physical-host abstractions。

---

## 7. Test Placement

```text
packages/*/test
    package/role/protocol behavior

game-libs/map/test
    map validation/passability/camera/projection behavior

tools/fixtures/essentials-v21.1/test
    selective M14 source→consumer projection

repository test/m14* / equivalent
    cross-owner M14 qualification harness

apps/desktop/test
    concrete Desktop physical composition tests

test/m15* / equivalent
    frozen Hostra boundary/full E2E/lifecycle qualification

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
HostraManager / HostraSession / HostraPlatformPort
WindowRegistry / WindowLifecycleManager / WindowSession
DocumentManager / BootstrapCoordinator
ConnectionManager / TransportRegistry / RecoveryManager
workspace orchestration framework
Generic RPC / EventBus / transaction / retry framework
```

Small private records/maps/functions remain preferable。

---

## 9. Current Materialization Order

```text
M1–M13
↓
M14 Map Game Library + First Real Game
↓
M15 Hostra-owned Desktop Full E2E
↓
M16 PWA Runtime
↓
M17 PWA Full E2E / Equivalence
```

Current summary见 [`phase-1-delivery-plan.md`](./phase-1-delivery-plan.md)。M14 and M15 are Closed。Do not materialize later-milestone machinery early merely for test symmetry。
