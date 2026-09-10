# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：M12/M13 **Implemented / Qualified / Closed**；M14 workspace taxonomy frozen  
> 主要定义：protocol、role、platform、Content、Web presentation、framework/game-library/example package ownership/dependency boundary  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-10

```text
Protocol boundary
!= npm package boundary
!= process boundary
!= Platform boundary
!= game-library boundary
!= milestone boundary
```

只有真实 ownership/consumer 需要时才 materialize package；不为了 symmetry 预建 framework。

---

## 1. Dependency Shape

Core framework 继续位于 `packages/*`。M14 新增独立 consumer layer：

```text
examples/*
    ↓
game-libs/*
    ↓
public LoomRealm author APIs
    ↓
packages/*
```

Business Runtime Definition 只依赖公开 author surface；business browser presentation 是独立 execution side，不获得 Main/Renderer Store/Data/physical Content credential authority。

---

## 2. Repository / Namespace Rule

```text
packages/
    LoomRealm framework/runtime
    → @loomrealm/*

game-libs/
    reusable game-domain libraries
    → @loomrealm-game/*

examples/
    concrete games
    → private

apps/
    platform hosts/products

tools/
    development/import/compatibility tooling
```

禁止：

```text
packages/* → game-libs/* / examples/*
game-libs Runtime → renderer/main/platform/protocol internals
runtime game code → tools/*
apps/* → reusable concrete business implementation
```

---

## 3. Renderer / Presentation Ownership

`@loomrealm/renderer` keeps existing Control/Data/Input/Render role implementation plus M13 package-private/trusted Web presentation mechanics：

```text
current Control topology + current Store commit
→ presentation reevaluation
→ thin Web Projector
→ managed DOM
→ context/data delivery
→ PresentationResourceClient façade
```

M13 does not root-export Store、PresentationState、component registry、AssetManager、dynamic loader、layer manager or service locator。

Business Web presentation may own：

```text
Custom Elements
Shadow DOM / Canvas / WebGL
private decoded resource cache
layout/position/private animation
```

but cannot mutate LoomRealm authority through DOM reverse-sync。

---

## 4. M14 Game Library / Example Placement

Reusable map：

```text
game-libs/map
package: @loomrealm-game/map

Runtime root
    → @loomrealm/subsystem public author API only

browser side
    → map-owned Custom Elements / classic JS / CSS
```

Concrete game：

```text
examples/essentials-v21.1
private=true
```

There is no `packages/map` / `@loomrealm/map`。

M14 does not define a normalized/universal map schema。Its Runtime Content representation is selective and consumer-driven：

```text
RMXP/Essentials source semantics
→ existing importer/lossless representation
→ selective consumer projection
→ Map/{id}: tileset_id,width,height,data
→ Tileset/{id}: id,tileset_name,passages,priorities
→ prepared Content
→ ContentClient
→ @loomrealm-game/map
```

Unused Event/MapInfo/MapMetadata/Color/Tone/AudioFile/other RMXP graph facts remain in importer/lossless evidence until a real behavior consumes them。Do not create a generic recursive consumer model or projection registry。

Runtime does not depend on Ruby Marshal、`.rxdata` parser、decoder instances/wrappers or tooling filesystem layout。

---

## 5. Browser Artifact Placement

M13 Config loads classic scripts/styles from prepared Content。Map package therefore exposes stable browser subpaths：

```text
@loomrealm-game/map/browser/map.browser.js
@loomrealm-game/map/browser/map.css
```

These are package seams；consumers do not reach into `dist/` or source layout。

Map browser JS/CSS enter the Window through prepared Content + `WebPresentationConfigV1`。Do not add ESM graph loader、PluginManager、component registry or package-wide browser Host abstraction。

---

## 6. Resource Placement

Runtime derives logical visible-resource identities and captures `contentVersion` through `ContentClient.resource()`。Render carries only logical identity/version。Business WC obtains bytes through M13 `PresentationResourceClient`。

Runtime/Renderer duplicate reads are accepted for M14。No Content metadata/HEAD author API、AssetManager or URL escape hatch is introduced for theoretical efficiency。

---

## 7. Workspace Rule

Root workspaces before the M14 additions were：

```text
packages/*
apps/*
```

M14 adds：

```text
game-libs/*
examples/*
```

`tools/*` remains development tooling。After adding workspaces, root scripts must not rely on accidental `--workspaces` expansion to define milestone meaning；use explicit package targets where needed。

Do not add workspace orchestration framework merely to manage these categories。

---

## 8. Qualification Ownership

```text
M11 Renderer
    Render wire/Store conformance

M12
    logical Content + trusted ResourceClient

M13
    Config/bootstrap + Projector + real Chromium

M14 importer/preparation
    RMXP source → selective Map/Tileset consumer records/resources

M14 game-lib
    ContentClient consumer + map business/browser presentation

M14 example
    concrete Game Entry/config/page composition

M14 CI/local
    deterministic author-owned fixture + exact external Essentials compatibility evidence

M15
    full Desktop physical E2E

M16
    PWA Worker Runtime hosting

M17
    full PWA E2E / cross-platform equivalence
```

M14 repository qualification may use a small test-owned composition harness；it does not justify MiniDesktopHost/MapHost production abstractions。

---

## 9. Explicitly Rejected Abstractions

Unless real correctness/consumer evidence reopens them：

```text
@loomrealm/map
packages/map
Generic GameLibrary framework/registry
MapNormalizedV1 / universal map schema
MapBundle / MapRepository / MapManager
ConsumerProjector<T> / ProjectionRegistry
Generic Repository / StorageProvider
AssetManager / decoder/plugin registry
UniversalRendererServices
Presentation DSL / SceneGraph / layer manager
LoomRealm component library
Dynamic Component / ESM loader
second projection tree/topology authority
public RenderNodeIdentity service
Window-global service locator
runtime importer dependency
MiniDesktopHost / MapHost / GameRuntimeHost
```

---

## 10. Milestone Placement

```text
M12 Content                                  ✅ Closed 2026-09-08
M13 Web Presentation                        ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game      ✅ Closed 2026-09-10
M15 Desktop Full E2E                        pending
M16 PWA Runtime                             pending
M17 PWA Full E2E / Equivalence              pending
```

M14 is the first framework consumer proof。M15–M17 materialize physical platform integration without moving game business back into framework/apps or redesigning M14 map semantics。
