# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：M12/M13 **Implemented / Qualified / Closed**；M14 workspace taxonomy revised
> 主要定义：protocol、role、platform、Content、Web presentation、framework/game-library/example package ownership/dependency boundary  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)  
> 最近复核：2026-09-09

```text
Protocol boundary
!= npm package boundary
!= process boundary
!= Platform boundary
!= game-library boundary
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

M14新增的是 framework consumer layer，不进入上述 core dependency DAG：

```text
examples/* → game-libs/* → public @loomrealm/subsystem author API
```

Business Definition继续只依赖 `@loomrealm/subsystem`。Business Web presentation是独立 execution side，可使用 browser APIs，但不获得 Render/Main authority。

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
game-libs/* → renderer/main/platform/protocol internals
runtime game code → tools/*
apps/* → reusable concrete business implementation
```

---

## 3. M13 Physical Startup Ownership

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

## 4. Renderer Ownership

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

## 5. Subsystem / Business Boundary

Subsystem author root继续只暴露真实 business能力：

```text
Frame
Input
Render
Content
```

M13不向 `@loomrealm/subsystem` 增加 DOM/Web Component API。

Business/game-library Web presentation可以拥有：

```text
Custom Elements
Shadow DOM / Canvas / WebGL
private UI framework
layout/position/stacking
private decoded resource cache
```

Business WC不得获得 Data peer、Render Store writer、Subsystem RenderDomain writer、Main authority、Content bearer/path/FSDB/privileged URL/private Renderer client。

---

## 6. Identity / Currentness Placement

完整 presentation identity：

```text
(Session, subsystemKey, generation, domainId, key)
```

Control snapshot仍是 Session/DataAuthority topology authority；Store仍是 per-subsystem Render replica authority。M13不 materialize Presentation topology registry或 second currentness state machine。

Same-generation reconnect保留 wire/HTMLElement identity；fresh Session/generation结束旧 element universe。

---

## 7. Resource Placement

M12 Renderer-private ResourceClient继续拥有 Content credential/origin/cache/version validation。

M13 façade只提供：

```text
namespace + key + expectedContentVersion
→ caller-owned bytes + MIME + actual version
```

Window teardown取消 reads；M13不建立第二份 cache、AssetManager、decoder registry、prefetch planner或 dynamic loader。

---

## 8. M14 Game Library / Example Placement

M14 map不进入 framework `packages/`：

```text
game-libs/map
    package: @loomrealm-game/map
    runtime side → @loomrealm/subsystem only
    browser side → map-owned Web presentation
```

Concrete game：

```text
examples/essentials-v21.1
    private
```

M14 直接采用 Essentials v21.1 / RMXP map semantic model，不再定义独立 normalized map schema。Map library MAY理解：

```text
RPG::Map
RPG::Tileset
RPG::MapInfo
RPG::Event / Page / EventCommand
RGSS Table
Essentials MapMetadata / map connections
```

但不得理解 Ruby Marshal binary、`.rxdata` parsing、Ruby object-graph wrappers、`tools/fixtures` implementation/filesystem layout。

Preparation：

```text
external/local Essentials v21.1 source
→ tools/fixtures/essentials-v21.1 importer
→ RMXP/Essentials semantic records + raw resources
→ prepared Content/FSDB
→ examples/essentials-v21.1
→ @loomrealm-game/map
```

Importer materialization只剥离 Ruby/Marshal/object-graph transport details，不重新发明地图业务 schema。Tool不是 runtime dependency；第三方 corpus不提交仓库。

Map runtime 通过 `ContentClient` 读取 semantic records；可见资源的 logical identity/version通过 Render data交给 map WC，再由 `PresentationResourceClient`取 bytes。Map browser JS/CSS 本身也通过 prepared Content + `WebPresentationConfigV1` 启动。

---

## 9. Workspace Rule

Current root workspace目前：

```text
packages/*
apps/*
```

M14/01实施时扩展为：

```text
packages/*
game-libs/*
apps/*
examples/*
```

`tools/*` 保持 development tooling，不作为 runtime workspace category。

加入 examples 后必须复核所有 `--workspaces` scripts；framework build/test 不应隐式等价于 example qualification。只做最小命令分层，不引入 workspace orchestration framework。

M13不自动新增：

```text
packages/presentation
packages/web-components
packages/renderer-web
packages/presentation-layers
packages/asset-manager
```

M14也不新增 Generic GameLibrary registry/base package、`MapNormalizedV1`、MapBundle 或 universal map package。

---

## 10. Qualification Ownership

```text
M11 Renderer
    Render Store / wire conformance

M12 Renderer
    trusted ResourceClient

M13
    Config/bootstrap + thin projection + real Chromium

M14 importer/preparation
    Ruby/Marshal/RMXP → semantic map records/resources

M14 game-lib
    RMXP/Essentials-compatible map business + browser consumer

M14 example
    concrete Game Entry / composition / presentation declaration

M14 CI
    distributable synthetic/author-owned RMXP-compatible semantic fixture

M14 local evidence
    exact Essentials v21.1 corpus compatibility

M15/M17
    complete physical E2E/equivalence
```

M14 full vertical可使用 test-owned composition harness复用现有 production roles；不得因此 materialize MiniDesktopHost/MapHost 等 production abstraction。

No giant E2E replaces role/contract evidence。

---

## 11. Explicitly Rejected Abstractions

除 real correctness/consumer need reopen 外，禁止：

```text
@loomrealm/map
packages/map
Generic GameLibrary framework/registry
MapNormalizedV1 / universal map schema
MapBundle abstraction
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
runtime importer dependency
MiniDesktopHost / MapHost production abstraction
```

---

## 12. Milestone Placement

```text
M12 Content                                  closed
M13 Web Presentation                        ✅ Closed 2026-09-09
M14 Map Game Library + First Real Game      pending
M15 Desktop full E2E                         pending
M16 PWA Runtime                              pending
M17 PWA full E2E/equivalence                 pending
```

M14按根目录 M14/01–05执行；不得为了 package symmetry扩大 framework public API，也不得为了假想通用性重新建模已有 RMXP/Essentials map semantics。
