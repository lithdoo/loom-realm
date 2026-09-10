# 仓库与目录方案

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：M1–M13 implemented/qualified；M14 implementation boundary frozen  
> 主要定义：current monorepo physical placement、framework/game-library/example/app ownership、M14–M17 materialization order  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-10

公开 package/authority 职责以 architecture/contracts/package architecture 为权威；本文只回答“代码放哪里、何时 materialize”。不要为了未来 symmetry 预建目录、package 或 orchestration framework。

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
    desktop/    existing from M9; M15 adds full BrowserWindow E2E
    pwa/        materializes with real PWA work

tools/         development/import/compatibility tooling
    fixtures/essentials-v21.1/
```

The current M12 Content realization is distributed across existing FSDB/HTTP、Subsystem/Renderer clients and Desktop composition；there is no current `packages/content` or `packages/content-service` package。There is also no `packages/map` / `@loomrealm/map`；Map business belongs to `game-libs/map`。

Current root workspaces before M14 implementation：

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
    Renderer Control/Data/Input/Render + M13 package-private Web presentation mechanics

packages/game-launcher-hostra
    Hostra PREPARE / Node Runner / child-owned provisioning mechanics

packages/fsdb + packages/fsdb-http
    Desktop prepared-content storage / readonly HTTP mechanics

apps/desktop
    Desktop app-scoped Data broker/content/presentation physical composition
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

M9 already created `apps/desktop` for real Desktop Data Broker mechanics。M15 extends the real Desktop product composition to：

```text
Hostra PREPARE
→ Main
→ real Node Runner child
→ Runtime/Data physical paths
→ Electron BrowserWindow
→ existing M13 Web presentation
→ real BrowserWindow RendererInputSource
→ same M14 game/map Runtime/WC
→ reload / reconnect / shutdown
```

M15 does not move map code into Desktop and does not reopen M10–M14 logical contracts。

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

Do not pre-create PWA abstractions merely to mirror Hostra filenames/classes。

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
workspace orchestration framework
Generic RPC / EventBus / transaction / retry framework
```

Small private records/maps/functions remain preferable when they satisfy the concrete owner。

---

## 9. Current Materialization Order

```text
M1–M13                                ✅ implemented / qualified
↓
M14 Map Game Library + First Real Game   🔒 frozen for implementation / pending
↓
M15 Desktop Full E2E                     pending
↓
M16 PWA Runtime                          pending
↓
M17 PWA Full E2E / Equivalence           pending
```

Repository layout follows that demand order。Do not create M15/M16/M17 production machinery to make M14 tests look more product-like。
