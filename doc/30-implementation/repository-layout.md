# 仓库与目录方案

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M1–M15 implemented；M11 baseline Closed，M14/M15 current subject requalified、hosted CI PASS；Viewport Core Qualified；M16/M17 PWA implemented with independent gate
> 主要定义：current monorepo physical placement、framework/game-library/example/app ownership、M14–M17 materialization order  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
> 最近复核：2026-10-08

公开 package/authority 职责以 architecture/contracts/package architecture 为权威；本文只回答“代码放哪里、何时 materialize”。Live milestone status 由 [`roadmap.md`](./roadmap.md) 与对应 qualification ledger 拥有。

---

## 1. Current Top-level

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
    map/        @loomrealm-game/map

examples/      concrete private games
    essentials-v21.1/
    essentials-v21.1-local/

apps/          platform/product compositions
    desktop/    Hostra HOSTRA_SUBCMD plain Node product
    pwa/        canonical PWA Window/Worker product composition

tools/         development/import/compatibility tooling
    fixtures/essentials-v21.1/
```

M12 Content 分布在 existing FSDB/HTTP、Subsystem/Renderer clients 与 Desktop/PWA composition；不存在 mandatory `packages/content` / `packages/content-service`。Map business 属于 `game-libs/map`，不存在 framework `packages/map`。

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

packages/game-launcher-pwa
    PWA launch/install/bootstrap profile used by the canonical PWA composition

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

apps/pwa
    Window Renderer/Input/Viewport/Presentation
    Session Worker with Main + RealmStateAuthority
    Dedicated Runtime Worker / Runner
    Service Worker Content/private executable/runtime-info boundary
```

External `lithdoo/hostra` shell is not a LoomRealm workspace package。Do not move Hostra RPC/Window ownership into protocol packages or map business into `apps/desktop` / `apps/pwa`。

---

## 4. M14 Physical Placement

M14 materialized the first real framework-consumer layer：

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

M14 qualification uses test-owned composition + real Chromium and exact official Essentials production-path evidence；it is not a production Host。

---

## 5. M15 Desktop Placement

M9 created `apps/desktop` for Desktop Data Broker mechanics；M15 recomposed the product without adding a top-level package category or shared Hostra framework。

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

Dead direct-Electron ownership is not a current product path。Do not add another package merely to hold Hostra bootstrap、Window state、WS transport or native primitive capture；concrete files/functions in `apps/desktop` are preferred。

---

## 6. M16 / M17 PWA Placement

The canonical PWA composition is materialized in `apps/pwa` and preserves logical authority while using a distinct physical topology：

```text
PWA Installer / complete installation
→ Window Renderer/Input/Viewport/Presentation
→ Session Worker: Main + RealmStateAuthority
→ Dedicated Runtime Worker: Runner + Subsystem Runtime
→ Service Worker: Content/private executable/runtime-info physical boundary
```

M16 owns Worker Runtime hosting/lifecycle；M17 completes Window Renderer/Data/Content/Input/Web Presentation and same-game product equivalence。Hostra shell/HOSTRA_SUBCMD/loopback WS/HTTP/signal mechanics remain Desktop-only and do not create common physical-host abstractions。

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

apps/pwa + PWA qualification tests
    M16/M17 physical realization/equivalence evidence
```

A giant E2E never replaces lower-owner qualification。

---

## 8. Abstraction Budget

Do not introduce without real consumer evidence：

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

Current summary 见 [`roadmap.md`](./roadmap.md)。M11 baseline 已 Closed；M14/M15 current subject 已重资格并通过 evidence checkout `d9d59c6741127a1e0cfdf3ff619d79b4c4074b01` 的 hosted CI；Viewport Core 已 Qualified；M16/M17 已 materialized 并接入独立 qualification gate。后续不得为测试 symmetry 提前增加没有真实 consumer/authority 的新目录或抽象；任何行为变化按对应 ledger 重新形成 subject/evidence。
