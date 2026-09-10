# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：M12/M13 closed；M14 workspace taxonomy/consumer implementation frozen；M15 package boundary preimplementation frozen  
> 主要定义：protocol、role、platform、Content、Web presentation、framework/game-library/example package ownership/dependency boundary  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-11

```text
Protocol boundary
!= npm package boundary
!= process boundary
!= Platform boundary
!= game-library boundary
!= milestone boundary
```

只有真实 ownership/consumer 需要时才 materialize package；不为了 symmetry 预建 framework。

Milestone live status由 [`phase-1-delivery-plan.md`](./phase-1-delivery-plan.md) 汇总；M14 formal evidence/status只由 [`m14-qualification.md`](./m14-qualification.md) 维护。本文只定义 package ownership与允许 materialize 的 seam。

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

`@loomrealm/renderer` keeps existing Control/Data/Input/Render role implementation plus trusted M13 Web presentation mechanics：

```text
current Control topology + current Store commit
→ presentation reevaluation
→ thin Web Projector
→ managed DOM
→ context/data delivery
→ PresentationResourceClient façade
```

M13 does not root-export Store、PresentationState、component registry、AssetManager、dynamic loader、layer manager or service locator。

M15 introduces **no new package**。The first production Desktop consumer only promotes the already-existing M13 mechanics through exactly one narrow trusted subpath：

```text
@loomrealm/renderer/web-presentation
```

That subpath may expose only the concrete M13 product-composition surface already required by the real consumer：

```text
WebPresentationConfigV1 validation/preparation
bootstrapWebPresentation
attachRendererPresentation
WebProjector
```

Existing private Content resource integration remains the separate trusted subpath：

```text
@loomrealm/renderer/resource-client
```

Neither subpath is a business author API。They do not justify root-exporting Renderer Store/currentness，and they do not create `PresentationHost`、`PresentationRuntime`、`RendererServices` or a new browser framework。

Business Web presentation may own：

```text
Custom Elements
Shadow DOM / Canvas / WebGL
private decoded resource cache
layout/position/private animation
```

but cannot mutate LoomRealm authority through DOM reverse-sync or obtain private Renderer physical credentials/capabilities。

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

These are game-library package seams；consumers do not reach into `dist/` or source layout。

M15 Desktop product similarly must consume Renderer presentation through `@loomrealm/renderer/web-presentation` rather than `packages/renderer/dist/internal/*` reach-through。

Map browser JS/CSS enter the Window through prepared Content + `WebPresentationConfigV1`。Do not add ESM graph loader、PluginManager、component registry or package-wide browser Host abstraction。

---

## 6. Resource Placement

Runtime derives logical visible-resource identities and captures `contentVersion` through `ContentClient.resource()`。Render carries only logical identity/version。Business WC obtains bytes through M13 `PresentationResourceClient`。

Renderer's trusted `@loomrealm/renderer/resource-client` owns the private Content bearer/origin binding；M15's same-Main-World physical realization must bind its native browser request primitive before business JS rather than exposing or dynamically rediscovering that capability through business-replaceable globals。

Runtime/Renderer duplicate reads are accepted for M14。No Content metadata/HEAD author API、AssetManager、BrowserPrimitiveRegistry or URL escape hatch is introduced for theoretical efficiency。

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

M15 does not add a workspace category or a new shared package solely for Electron composition。

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
    + production use of @loomrealm/renderer/web-presentation

M16
    PWA Worker Runtime hosting

M17
    full PWA E2E / cross-platform equivalence
```

M14 repository qualification may use a small test-owned composition harness；it does not justify MiniDesktopHost/MapHost production abstractions。M15 product code replacing that reach-through with the narrow Renderer subpath is the real-consumer justification for materializing the subpath。

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
PresentationHost / PresentationRuntime
BrowserPrimitiveRegistry
second projection tree/topology authority
public RenderNodeIdentity service
Window-global service locator
runtime importer dependency
MiniDesktopHost / MapHost / GameRuntimeHost
```

---

## 10. Milestone Placement

Package architecture只记录 materialization route，不拥有 live milestone closure：

```text
M12 Content
→ M13 Web Presentation
→ M14 Map Game Library + First Real Game
→ M15 Desktop Full E2E
→ M16 PWA Runtime
→ M17 PWA Full E2E / Equivalence
```

Current summary见 [`phase-1-delivery-plan.md`](./phase-1-delivery-plan.md)。截至本次复核，M14 implementation complete / requalification pending，M15 Implementation Frozen / Preimplementation Closed；这些 live status 不在本文独立维护为 dated Closed checkmark。

M14 is the first framework consumer proof。M15–M17 materialize physical platform integration without moving game business back into framework/apps or redesigning M14 map semantics。
