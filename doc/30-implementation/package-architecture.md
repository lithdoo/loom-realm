# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：M12 closed / M13 Web Presentation **Design Frozen / implementation pending**  
> 主要定义：protocol、role、platform、Content、Web presentation、business package ownership/dependency boundary  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  
> 最近复核：2026-09-09

```text
Protocol boundary
!= npm package boundary
!= process boundary
!= Platform boundary
!= milestone boundary
```

只有真实 ownership/consumer需要时才 materialize package；不为了 symmetry 预建 framework。

---

## 1. Current Dependency Shape

```text
foundation ─→ platform-ports ─→ main / subsystem-host / renderer
wire ───────→ runtime-control / renderer-control / data / game-package
                                     ↓
                           launcher-hostra / launcher-pwa
                                     ↓
                                   apps/*

Node stdlib → fsdb → fsdb-http / apps/desktop Content composition
```

Business Definition继续只依赖 `@loomrealm/subsystem`。Business Web presentation是独立 execution side，可使用 browser APIs，但不获得 Render/Main authority。

---

## 2. M13 Physical Startup Ownership

Concrete app / Renderer Window composition拥有：

```text
Config source acquisition
current prepared Content view selection
private browser href/src binding
document/Window bootstrap lifecycle
```

```text
WebPresentationConfigV1
→ prepared M12 Content
→ exact MIME check
→ ordered JS/CSS
→ window.onload
→ start presentation
```

M13不为此增加 platform universal module-loader port、PresentationRegistry port、AssetManager port或 RendererServiceLocator port。

---

## 3. Renderer Ownership

`@loomrealm/renderer` 继续拥有 existing Control/Data/Input/Render role implementation。

M13只增加 package-private/trusted mechanics：

```text
current Control Session/DataAuthority topology + Store commit
→ presentation reevaluation
→ per-subsystem eligibility
→ live identity → HTMLElement mapping
→ managed create/remove/move/attrs/children
→ context/data delivery
→ PresentationResourceClient façade
→ Window-local failure/resource lifetime
```

M13不 root-export Store、PresentationState、PresentationTopology、PresentationAdapter、component registry、layer manager或 Content credential。

---

## 4. Subsystem / Business Boundary

Subsystem author root继续只暴露真实 business能力：

```text
Frame
Input
Render
Content
```

M13不向 `@loomrealm/subsystem` 增加 DOM/Web Component API。

Business Web presentation可以拥有：

```text
Custom Elements
Shadow DOM / Canvas / WebGL
private UI framework
layout/position/stacking
private decoded resource cache
```

Business WC不得获得 Data peer、Render Store writer、Subsystem RenderDomain writer、Main authority、Content bearer/path/FSDB/privileged URL/private Renderer client。

---

## 5. Identity / Currentness Placement

完整 presentation identity：

```text
(Session, subsystemKey, generation, domainId, key)
```

Control snapshot仍是 Session/DataAuthority topology authority；Store仍是 per-subsystem Render replica authority。M13不 materialize Presentation topology registry或 second currentness state machine。

Same-generation reconnect保留 wire/HTMLElement identity；fresh Session/generation结束旧 element universe。

---

## 6. Resource Placement

M12 Renderer-private ResourceClient继续拥有 Content credential/origin/cache/version validation。

M13 façade只提供：

```text
namespace + key + expectedContentVersion
→ caller-owned bytes + MIME + actual version
```

Window teardown取消 reads；M13不建立第二份 cache、AssetManager、decoder registry、prefetch planner或 dynamic loader。

---

## 7. Workspace Rule

Current workspace继续：

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

只有 implementation ownership证明独立 package真实必要且不改变 frozen contract时才可重新评估。

---

## 8. Qualification Ownership

```text
M11 Renderer
    Render Store / wire conformance

M12 Renderer
    trusted ResourceClient

M13
    Config/bootstrap
    authority/Store reevaluation
    per-subsystem currentness
    thin Projector
    WC ABI/resource lifetime
    real Chromium

M14
    map business + map-owned WC real consumer

M15/M17
    complete physical E2E/equivalence
```

No giant E2E replaces role/contract evidence。

---

## 9. Explicitly Rejected Abstractions

除 real correctness/consumer need reopen 外，禁止：

```text
@loomrealm/presentation
Generic Repository / StorageProvider
InstallationManager
AssetManager / decoder/plugin registry
UniversalRendererServices
Presentation DSL / graphics scene graph
LoomRealm component library
Presentation Layer / stacking manager
Dynamic Component / ESM loader
second projection tree/topology authority
public RenderNodeIdentity service
Window-global service locator
DOM transaction/rollback framework
RenderEvent WC bridge
```

---

## 10. Milestone Placement

```text
M12 Content                         closed
M13 Web Presentation               Design Frozen / implementation pending
M14 loom.map                        pending
M15 Desktop full E2E                pending
M16 PWA Runtime                     pending
M17 PWA full E2E/equivalence        pending
```

M13 implementation必须按根目录 M13/01–05执行；不得为了 package symmetry扩大 public API。
