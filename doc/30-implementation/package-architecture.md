# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：M12 closed / M13 Web Presentation pending  
> 主要定义：protocol、role、platform、Content、Web presentation、business package ownership/dependency boundary  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[渲染系统](../10-architecture/rendering-system.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

```text
Protocol boundary
!= npm package boundary
!= process boundary
!= Platform boundary
!= milestone boundary
```

只有真实 ownership/consumer要求出现时才 materialize package；不为了 symmetry 预建 framework。

---

## 1. Current Dependency Shape

```text
foundation ─→ platform-ports ─→ main / subsystem-host / renderer
   │
wire ───────→ runtime-control ─→ main / subsystem-host
   ├────────→ renderer-control ─→ main / renderer
   ├────────→ data ─────────────→ subsystem / renderer
   └────────→ game-package
                         ↓
              game-launcher-hostra/pwa
                         ↓
                       apps/*

Node stdlib
    ↓
@loomrealm/fsdb
    ├──→ @loomrealm/fsdb-http
    └──→ apps/desktop Content composition
```

Business Definition：

```text
business Definition → @loomrealm/subsystem
@loomrealm/map       → @loomrealm/subsystem
```

Business Web presentation implementation是独立 execution/authority side：

```text
concrete Custom Elements
browser APIs allowed
no Render write authority
```

业务 build可以使用同 package不同 entry、独立 package或其他 topology；LoomRealm runtime不冻结 package/subpath/bundle organization。

---

## 2. Protocol / Primitive Packages

`@loomrealm/foundation`、`@loomrealm/wire`与 protocol capability packages只拥有 carrier/representation/wire semantics，不拥有 application/Web presentation authority。

M13 Web projection不是新 network protocol package；它消费已经 committed 的 Renderer Store。

---

## 3. Platform Ports

`@loomrealm/platform-ports`只增加有多个 concrete platform consumer且属于 Core↔Platform narrow seam的能力。

M10 Input、M11 Render、M12 Content均未为了 symmetry 新增 universal port。M13同样不增加：

```text
module-loader port
PresentationRegistry port
AssetManager port
RendererServiceLocator port
layout/layer port
```

Current presentation startup放在 concrete app/Renderer Window composition：

```text
WebPresentationConfigV1
→ prepared Content resolution
→ private browser href/src binding
→ bootstrap document
```

---

## 4. Role Packages

### Main

继续拥有 Session/Runtime/Frame/Activation/InputTarget/DataAuthority；M13不增加 Main presentation authority。

### Renderer

继续依赖现有 renderer-control/platform-ports/data stack。

M11 Render Store仍 internal-only。M12 ResourceClient仍 trusted/private integration boundary。

M13 Renderer只增加 package-private/trusted implementation：

```text
Store successful commit → Projector notification
wire-node identity → HTMLElement mapping
managed create/remove/move/attrs/children
Web Presentation API context/data delivery
PresentationResourceClient façade
presentation-local failure containment
```

M13不 root-export Render Store、PresentationAdapter、component registry、layer manager或 Content credential。

### Subsystem

Author root继续只暴露真实 business能力：Frame/Input/Render/Content。M13不向 `@loomrealm/subsystem` 增加 DOM/Web Component API；Web presentation implementation不是 Subsystem Runtime code。

---

## 5. Content Placement — M12 Frozen

```text
Hostra PREPARE
→ prepared installation
→ unique [FSDB]*
→ @loomrealm/fsdb readonly snapshot
→ Desktop Content Service
```

Subsystem ContentClient属于 `@loomrealm/subsystem` author surface；Renderer ResourceClient属于 `@loomrealm/renderer` trusted/private integration；Desktop Content Service属于 `apps/desktop` composition。

M12不建立：

```text
@loomrealm/content
@loomrealm/content-service
Repository hierarchy
StorageProvider SPI
InstallationRegistry
AssetManager
```

---

## 6. M13 Web Presentation Ownership

```text
M11 committed Store
→ package-private post-commit seam
→ thin Web Projector
→ document.body / business-owned WC
```

Projector必须按完整 live wire-node scope区分 element：

```text
(Session, subsystemKey, generation, domainId, key)
```

不得以 `Map<RenderNodeKey, HTMLElement>` 之类裸 key global map冻结实现。

Managed top-level order：

```text
subsystemKey UTF-8 lexical
→ within subsystem: M11 zIndex/domainId order
→ roots order
```

这里不 materialize cross-Subsystem stacking service；actual stacking由 business CSS/WC拥有。

精确 browser startup与 WC ABI分别由 Config v1 / API v1 formal contract拥有；本 package文档不复制 interface shape。

---

## 7. Business Web Presentation Placement

业务 presentation可以：

```text
Custom Elements / Shadow DOM / Canvas / WebGL
own tag/data/children business semantics
own layout / position / stacking
consume Web Presentation API v1
use private UI framework
```

其中 runtime resource能力明确是 M13 `PresentationResourceClient`，不是模糊的“未来 presentation integration capability”。

Business WC不得获得：

```text
@loomrealm/data peer
Main/Runtime authority
Render Store mutation
Subsystem RenderDomain writer
Content bearer/path/FSDB/privileged URL
Renderer-private ResourceClient
```

Web Presentation API不要求 materialize独立 `@loomrealm/presentation` package；如果 Renderer trusted subpath或 app-private integration足以表达 current ownership，就保持现状。

---

## 8. Launcher / App Composition

Launcher继续拥有 Game Entry consumption、Platform manifest exact join、executable resolution、PlatformLaunchPlan、LogicalGameBootstrap与 Runtime Runner integration。

它不吸收 Renderer/DataBroker/Input/Render/Content/Web presentation成为 mega-package。

`apps/*`组合 physical Window、Content、private browser binding与 lifecycle；presentation config不进入 Launcher manifest。

---

## 9. Demand-driven Workspace

Current/next真实 workspace：

```text
packages/
├── foundation
├── platform-ports
├── wire
├── game-package
├── game-launcher-hostra
├── game-launcher-pwa
├── runtime-control
├── renderer-control
├── data
├── fsdb
├── fsdb-http
├── main
├── subsystem
├── renderer
└── map                 // M14

apps/
├── desktop
└── pwa                 // M16+
```

M13不自动新增：

```text
packages/presentation
packages/web-components
packages/renderer-web
packages/presentation-layers
packages/asset-manager
```

只有 implementation ownership证明独立 package真实必要时才 materialize。

---

## 10. Qualification Ownership

```text
M11 Renderer
    Render Store / wire conformance

M12 Renderer
    trusted ResourceClient

M13
    Config/bootstrap
    package-private Projector
    scoped element identity
    deterministic managed body ordering
    Web Presentation API receivers/resource façade
    real Chromium

M14
    map business + map-owned WC real consumer

M15/M17
    complete physical E2E/equivalence
```

No giant E2E replaces package/role/contract evidence。

---

## 11. Explicitly Rejected Generic Abstractions

除非后续真实 consumer reopen：

```text
Generic Repository / StorageProvider
InstallationManager / global registry
AssetManager / decoder/plugin registry
UniversalRendererServices
Presentation DSL / graphics scene graph
LoomRealm component library
Presentation Layer / stacking manager
Dynamic Component / ESM loader
second projection tree authority
public RenderNodeIdentity service
Window-global presentation service locator
```

业务 WC内部使用任意 UI framework不受此限制；禁止的是 LoomRealm core复制 authority或替业务拥有 presentation semantics。

---

## 12. Milestone Placement

```text
M12 Content                         closed
M13 Web Presentation               pending
M14 loom.map                        pending
M15 Desktop full E2E                pending
M16 PWA Runtime                     pending
M17 PWA full E2E/equivalence        pending
```

M13只新增真实实现需要的 private/trusted surfaces；不为了 package symmetry扩张 public API。
