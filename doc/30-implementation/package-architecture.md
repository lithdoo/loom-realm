# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：M12/M13 closed；M14/M15 implemented, qualified, and Closed  
> 主要定义：protocol、role、platform、Content、Web presentation、framework/game-library/example package ownership/dependency boundary  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[ADR 0034](../decisions/0034-hostra-owned-desktop-composition.md)  
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

---

## 1. Dependency Shape

Core framework继续位于 `packages/*`。M14 consumer layer：

```text
examples/*
    ↓
game-libs/*
    ↓
public LoomRealm author APIs
    ↓
packages/*
```

Business Runtime Definition只依赖公开 author surface；business browser presentation不获得 Main/Renderer Store/Data/physical Content credential authority。

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
    concrete product/platform compositions

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

`@loomrealm/renderer` keeps existing Control/Data/Input/Render role implementation plus trusted M13 mechanics。

M15 introduces **no new framework package**。Production Desktop consumer继续使用：

```text
@loomrealm/renderer/web-presentation
@loomrealm/renderer/resource-client
```

`web-presentation`只暴露已有 M13 product-composition mechanics，不建立 PresentationHost/PresentationRuntime/RendererServices。

Business presentation可拥有 Custom Elements、Shadow DOM/Canvas/WebGL、private decoded cache和 layout，但不能获得 Renderer physical credentials或 reverse-sync authority。

---

## 4. M14 Game Library / Example Placement

Reusable map：

```text
game-libs/map
package: @loomrealm-game/map
```

Concrete game：

```text
examples/essentials-v21.1
private=true
```

不存在 `packages/map` / `@loomrealm/map`。M14 selective consumer representation仍由实际行为驱动，不建立 universal map schema/projection registry。

---

## 5. Browser Artifact / Resource Placement

Map browser JS/CSS通过 prepared Content + `WebPresentationConfigV1`进入 Window。

Renderer trusted ResourceClient拥有 private Content bearer/origin binding；M15 concrete browser composition必须在 business bootstrap前绑定需要的 native request primitives，而不是暴露 BrowserPrimitiveRegistry或动态重新读取 business-replaceable globals。

---

## 6. M15 Hostra Composition Placement

ADR 0034 不新增 workspace/package层。

Canonical ownership：

```text
external lithdoo/hostra executable/package
    starts
        ↓ HOSTRA_SUBCMD
apps/desktop plain Node product
    consumes Hostra only through concrete JSON-RPC adapter
        ↓
existing LoomRealm packages
```

Frozen external host baseline由 M15 physical SSOT拥有：

```text
hostra@1.0.1-beta.1
source d863beab3c59c3bd4f271514a228fa8fee0bf5b6
bundled Electron 44.1.1
```

Hostra RPC adapter必须留在 `apps/desktop`，因为目前只有一个真实 consumer。

不得为了这次迁移新增：

```text
@loomrealm/hostra
@loomrealm/desktop-host
HostraPlatformPort
HostraClient interface package
Window/Document lifecycle package
generic WebSocket transport package
```

`@loomrealm/game-launcher-hostra` 保持现有 **Hostra launch profile** package：

```text
game.json + launch.hostra.json
→ PREPARE
→ HostraLaunchPlan / LogicalGameBootstrap
→ Node Runner realization
```

它与 external `lithdoo/hostra` shell是两个不同 owner，不因为名字相同而合并 package或职责。

---

## 7. Migration Package Rule

迁移前半段允许 legacy direct-Electron code暂存为 isolated regression oracle；因此早期 slice只要求：

```text
canonical Hostra entry/path does not import Electron
canonical path does not own BrowserWindow/app.quit
```

当 Hostra vertical qualification完成后，final replacement必须：

```text
delete dead direct-Electron production ownership
remove canonical Electron runtime/start dependency from apps/desktop
repository-wide apps/desktop production Electron ownership/import = FAIL
```

不要为了满足最终 cleanliness gate而在 replacement vertical可工作前提前删除 migration oracle。

---

## 8. Workspace Rule

Root workspaces：

```text
packages/*
apps/*
game-libs/*
examples/*
```

`tools/*` remains development tooling。M15不增加 workspace category或 shared package。

---

## 9. Qualification Ownership

```text
M11 Renderer
    Render wire/Store conformance

M12
    logical Content + trusted ResourceClient

M13
    Config/bootstrap + Projector + real Chromium

M14
    importer/preparation + game-lib + example consumer evidence

M15
    frozen Hostra shell
    → HOSTRA_SUBCMD apps/desktop
    → Hostra-owned BrowserWindow
    → full Desktop physical E2E/lifecycle

M16
    PWA Worker Runtime

M17
    PWA full E2E / equivalence
```

M15 qualification必须证明 Hostra是实际 Electron/Window owner，但这不正当化 production HostraManager/WindowManager abstraction。

---

## 10. Explicitly Rejected Abstractions

除真实 correctness/consumer evidence外，不建立：

```text
@loomrealm/map / packages/map
Generic GameLibrary framework/registry
MapNormalizedV1 / universal map schema
AssetManager / decoder/plugin registry
UniversalRendererServices
PresentationHost / PresentationRuntime
BrowserPrimitiveRegistry
MiniDesktopHost / MapHost / GameRuntimeHost
HostraManager / HostraSession / HostraPlatformPort
WindowRegistry / WindowLifecycleManager / WindowSession
DocumentManager / BootstrapCoordinator
ConnectionManager / TransportRegistry / RecoveryManager
```

---

## 11. Milestone Placement

```text
M12 Content
→ M13 Web Presentation
→ M14 Map Game Library + First Real Game
→ M15 Hostra-owned Desktop Full E2E
→ M16 PWA Runtime
→ M17 PWA Full E2E / Equivalence
```

Live status由 [`phase-1-delivery-plan.md`](./phase-1-delivery-plan.md) 汇总。M15 current physical SSOT为 ADR 0034 + root recomposition plan，formal status为 Closed；不再以 historical direct-Electron package boundary为准。
