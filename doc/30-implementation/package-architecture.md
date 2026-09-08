# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving by milestone / **M12 closed / M13 Web projection pending**  
> 主要定义：primitive、protocol capability、role、FSDB core、platform ports、launcher/integration、Web projection、composition root 与 business package 的 ownership/dependency boundary  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[渲染系统](../10-architecture/rendering-system.md)、[正式契约目录](../15-contracts/README.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

```text
Protocol boundary
!= npm package boundary
!= process boundary
!= Platform boundary
!= milestone boundary
```

Milestone只描述 implementation slice；package只有在真实 ownership/consumer要求出现时 materialize。

---

## 1. Current Dependency Shape

```text
foundation ─────→ platform-ports ─────→ main / subsystem-host / renderer
 │
 ├─────────────────────┐
 │                     ↓
wire ─────────────→ runtime-control ──→ main / subsystem-host
 │
 ├──────────────→ renderer-control ───→ main / renderer
 │
 ├──────────────→ data ───────────────→ subsystem / renderer
 │
 └──────────────→ game-package
                         ↓
              game-launcher-hostra/pwa
                         ↓
                       apps/*

Node stdlib
    ↓
@loomrealm/fsdb
    ├────────→ @loomrealm/fsdb-http
    └────────→ apps/desktop Content composition
```

Business Definition只依赖最近的 author SDK：

```text
business Definition → @loomrealm/subsystem
@loomrealm/map       → @loomrealm/subsystem
```

Business Definition与 Web presentation implementation保持 execution/authority boundary：

```text
business Definition side
    → platform-neutral author SDK
    → no Browser/DOM authority

business Web presentation side
    → concrete business-owned Custom Elements
    → browser APIs allowed
    → no Render authority write capability
```

这不是强制 package shape。业务 build可以使用独立 package、同 package不同 entry/subpath或其他构建方式；runtime只认用户选择的 Window-level `WebPresentationConfigV1` 所引用的 current installation JS/CSS resources。

M12不建立 `@loomrealm/content` 或 `@loomrealm/content-service` package。Subsystem ContentClient属于 `@loomrealm/subsystem` author surface；Renderer ResourceClient属于 `@loomrealm/renderer` trusted/private realization；Desktop Content Service属于 `apps/desktop` composition。

M13不建立 generic `@loomrealm/presentation`、component library、graphics DSL、presentation layer manager或 dynamic module-loader package。

---

## 2. Primitive / Protocol Packages

`@loomrealm/foundation` owns MessageCarrier / CarrierClosed / deterministic MemoryCarrier；no JSON/domain/platform semantics。

`@loomrealm/wire` owns plain JSON/JSON-RPC representation、exact keys、safe integer、UTF-8/depth primitives；no carrier/lifecycle/domain authority。

Protocol capability packages：

```text
@loomrealm/runtime-control   → Foundation + Wire
@loomrealm/renderer-control  → Foundation + Wire
@loomrealm/data              → Foundation + Wire
```

它们拥有 wire/profile mechanics，不拥有 Main/Subsystem/Renderer/Platform/Web Component authority。

M13 Web projection不是新 protocol package；它消费已经 committed 的 M11 Renderer Store。

---

## 3. `@loomrealm/platform-ports`

Runtime dependency保持 exactly `@loomrealm/foundation`。

Frozen root surfaces through M12仍只有已经出现真实 Core↔Platform consumer 的能力：

```text
M4  DeadlineScheduler / RuntimeControlBinding
M5  RuntimeLaunchRequest / MainRuntimeControlBinding / HostedRuntime / RuntimeHosting
M7  OpaqueMaterialGenerator / RendererControlBinding
M8  RendererDataBinding / SubsystemDataBinding / SubsystemDataBindingResult
M9  DataConnectionAuthorityEntry / DataConnectionAuthorityView / DataConnectionAuthoritySink
```

M10 Input、M11 Render、M12 Content均不新增 Platform Port。

M13也不因为 presentation bootstrap新增 universal module-loader/service-locator Port。Current responsibility放在 concrete app/Renderer physical composition：

```text
user-selected WebPresentationConfigV1
→ current prepared Content resolution
→ trusted browser href/src binding
→ Renderer bootstrap document
```

只有未来真实 Core↔Platform seam证明需要多个 concrete Platform实现同一 narrow capability时，才 materialize最小 port。

---

## 4. Platform-neutral Role Packages

### Main

依赖：

```text
@loomrealm/platform-ports
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/wire
```

Main owns Session、Runtime、Frame、Stack、Activation、InputTarget、Renderer currentness、DataAuthority、failure/unwind。M10–M13不增加 Main Content/Input/Render/presentation authority。

### Renderer

root依赖保持：

```text
@loomrealm/renderer-control
@loomrealm/platform-ports
@loomrealm/data
```

M10 root surface只有 frozen `RendererInputSource` integration；M11 Render Store internal-only；M12 ResourceClient trusted/private integration；M13 thin Web Projector继续 trusted/package-private，不把 DOM/WC capability提升到 platform-neutral Renderer root API。

Renderer M13拥有：

```text
Store successful commit → package-private projector notification
stable key → HTMLElement mapping
managed element create/remove/move
attrs/light-DOM projection
optional receiveRenderData(full readonly snapshot) delivery
projection-local failure containment
```

Renderer M13不拥有：

```text
business tag vocabulary / WC classes
business Shadow DOM/Canvas/WebGL semantics
business data schema
business layout / position / stacking
per-Domain presentation wrappers/layers
generic CSS z-index framework
RenderEvent → WC/DOM event bridge
DOM mutation policing / hostile-code sandbox
```

### Subsystem

Author root owns：

```text
Frame / FrameOutcome
InputListener
RenderDomain
ContentClient
AbortSignal
```

trusted `/host` owns Runtime/Data/Content physical integration。Business Definition仍只 import `@loomrealm/subsystem`；不得直接 import Wire、protocol、Platform、Renderer、FSDB、HTTP、DOM 或 launcher packages。

M13不向 `@loomrealm/subsystem` 增加 Web Component API；Web presentation implementation不是 Subsystem Runtime code。

---

## 5. `@loomrealm/fsdb` — Frozen M12 Domain Core

M12新增 exactly one Node-specific FSDB package：

```text
@loomrealm/fsdb
```

已有两个 production consumers：

```text
@loomrealm/fsdb-http
apps/desktop Content Service
```

它只拥有 readonly FSDB validation/snapshot/index/descriptor/ordinary+metadata lookup/safe-open/read-lease/close-drain；不拥有 HTTP、LoomRealm Content version policy、installation registry、Game/Launcher/Main/Subsystem/Renderer、Repository/StorageProvider、watch/hot reload或 filesystem transaction abstraction。

`@loomrealm/fsdb` 是 public publishable Node>=20 ESM workspace package，runtime workspace deps = 0。

`@loomrealm/fsdb-http` 从 M12 起唯一新增 runtime workspace dependency就是 `@loomrealm/fsdb`；existing root API 与 HTTP conformance保持不变。

---

## 6. Content Placement — Frozen M12

```text
Hostra PREPARE
→ current immutable prepared installation view
→ exactly one direct-child [FSDB]*
→ @loomrealm/fsdb snapshot
→ private immutable Content Index + manifest/version facts
→ apps/desktop readonly Content HTTP service
```

`apps/desktop`消费 genuine `PreparedHostraGame`及 trusted prepared-installation projection；不直接依赖 `@loomrealm/game-package`，不重读 `game.json`，也不接受可独立组合的 installation/FSDB roots。

Desktop Content Service是 app-private composition responsibility，不单独建立 `@loomrealm/content-service` package。

Content version属于 Content contract：

```text
sha256:<64 lowercase hex>
```

由 prepare-time Content projection对 exact served bytes计算；不是 FSDB domain fact。

Business WC runtime resource usage不得获得 filesystem path、Content bearer、privileged localhost URL或 `@loomrealm/fsdb` direct access。

---

## 7. Launcher / App Composition Ownership

`@loomrealm/game-launcher-hostra/pwa` own Game Entry consumption、own Platform manifest、key join、executable security resolution、PlatformLaunchPlan、LogicalGameBootstrap 与 RuntimeHosting/Runner integration。

它们不得吸收 Renderer/DataBroker/Input/Render/Content/Web projection policy成为 mega-package。

```text
one-platform child mechanics
→ concrete launcher/integration package

one-app physical composition/policy
→ apps/* private implementation
```

M9 child-scoped Data provisioner继续属于 Hostra launcher integration；M12 child-private Content material注入只做最小独立 Host seam，不复用 Data provisioning protocol。

M13 current presentation startup responsibility已经收敛为 app/Renderer Window physical composition，而不是 Launcher executable PREPARE：

```text
user-selected WebPresentationConfigV1
→ prepared Content lookup
→ trusted href/src binding
→ bootstrap document <link> / classic <script>
→ window.onload
```

Launcher manifests不增加 presentation fields，Business Definition/RenderNode也不携 presentation module URL/loader capability。

---

## 8. Web Projection Ownership — M13

M13 target：

```text
M11 committed Render Store
→ package-private post-commit seam
→ thin Web Projector
→ document.body / business-owned Custom Elements
```

Projector只做 mechanical realization：

```text
key      → stable HTMLElement identity
tag      → construct business-owned element
attrs    → managed host attributes
data     → optional receiveRenderData(full readonly snapshot)
children → managed ordered light DOM
```

Top-level roots直接进入 `document.body`。

Projection order：

```text
structure / children
→ attrs
→ receiveRenderData(...)
```

WC对 projected state只有 read access；M13不使用 MutationObserver policing违规 DOM mutation，也不从 DOM反向同步 Store。

M13不建立第二份 desired projection authority。Snapshot replacement可以按 authoritative key做 mechanical reconciliation以保持 live HTMLElement identity。

M13不定义 RenderEvent → WC/DOM event ABI。

是否 projector implementation最终位于 Renderer internal file、trusted subpath或 app-private adapter，由 implementation ownership决定；不为了 package symmetry预建 public package。

---

## 9. Business Web Presentation Placement

业务 Web presentation side 可以：

```text
use Custom Elements / Shadow DOM / Canvas / WebGL
own tag/data/children business semantics
own layout / position / stacking
consume explicitly granted runtime resource capability
use business-chosen internal UI framework
```

但不得获得：

```text
@loomrealm/data direct peer
Main/Runtime Control authority
Render Store mutation
Subsystem RenderDomain writer
Content credential/path
```

业务 build/package topology不构成 LoomRealm runtime authority contract。Runtime只消费 `WebPresentationConfigV1` 中的 ordered logical resource refs；JS通过 `customElements.define(...)` 注册 concrete elements。

---

## 10. Physical Milestone Placement

```text
M10  deterministic RendererInputSource role behavior
M11  Render authority/publication/internal Renderer replica
M12  Desktop Content + Subsystem/Renderer consumers
M13  Window bootstrap + thin Store→body WC projection
M14  @loomrealm/map business + map-owned Web presentation implementation
M15  BrowserWindow + physical Renderer Control/Input/Content/full Desktop composition
M16  PWA Runtime/Worker vertical
M17  PWA Renderer/Data/Input/Render/Content/Web presentation + equivalence
```

M15 browser input必须复用 M10 source seam；presentation消费 M13 projector；runtime资源获取继续消费 M12 ResourceClient语义。

PWA M17共享 M13 logical/browser-visible semantics：Window-level config、ordered `<link>`/classic `<script>`、`window.onload`、body roots、`receiveRenderData`。PWA不依赖 Node-only `@loomrealm/fsdb`，physical storage和 trusted href/src binding可不同。

---

## 11. Target Workspace — Demand Driven

Current/next真实 workspace：

```text
packages/
├── foundation/
├── platform-ports/
├── wire/
├── game-package/
├── game-launcher-hostra/
├── game-launcher-pwa/
├── runtime-control/
├── renderer-control/
├── data/
├── fsdb/
├── fsdb-http/
├── main/
├── subsystem/
├── renderer/
└── map/                  // M14 business side

apps/
├── desktop/
└── pwa/                  // M16+
```

M13 **不自动新增**：

```text
packages/presentation/
packages/web-components/
packages/renderer-web/
packages/presentation-layers/
```

M14也不预设 `map-web` 必须成为独立 package。只有 implementation ownership证明必须独立分包时再 materialize。

不存在 current requirement 的：

```text
packages/content/
packages/content-service/
packages/repository/
packages/asset-manager/
packages/component-library/
```

不得为了未来可能用途预建。

---

## 12. Conformance / Qualification Ownership

```text
@loomrealm/fsdb
    FSDB domain/core extraction tests

@loomrealm/fsdb-http
    existing FSDB HTTP conformance regression

apps/desktop M12
    Content API/auth/version/prepare/index/service vertical

@loomrealm/subsystem
    ContentClient + Frame/Input/Render author behavior

@loomrealm/renderer M11/M12
    Render Store + trusted ResourceClient

M13
    WebPresentationConfig validation/resolution
    <link> / ordered classic <script> / window.onload
    Store post-commit → body projector
    identity/attrs/children/receiveRenderData
    readonly authority / no DOM reverse-sync
    no RenderEvent → WC mapping
    real headless Chromium qualification

M14
    map business + map-owned WC real consumer

M15/M17
    complete physical E2E/equivalence
```

No giant E2E replaces package/role/contract evidence。

---

## 13. No Universal Frameworks

Forbidden unless a later real consumer reopens the boundary：

```text
GenericRpcPeer / GenericSchemaCodec
ConnectionRegistry / RuntimeDirectory
UniversalRendererServices / RendererPlatform
PlatformLaunchOptions / options:any
AuthorityEventBus / ObserverHub
Generic Input/Render manager framework
Generic Repository hierarchy
StorageProvider / StorageBackend SPI
InstallationManager / global mutable registry
AssetManager / loader/decoder plugin registry
Content RPC / credential protocol
Generic Presentation DSL / graphics scene graph
LoomRealm-owned business Web Component library
Generic Presentation Layer / stacking manager
Dynamic Component / ESM module graph loader
second LoomRealm projection tree authority
GenericTransaction / 2PC
CurrentnessLease / Heartbeat / retry framework
```

这里不禁止业务 WC内部选择任意 UI framework；禁止的是 LoomRealm projection层复制 M11 Store authority或代替业务拥有 presentation semantics/layout。

---

## 14. Semver / Compatibility

`npm semver != protocol/profile version`。

Current first implementation只维护一个 current model；没有真实 compatibility obligation时不制造 fake v2/deprecated alias/dual parser。

`@loomrealm/fsdb` 与 `@loomrealm/fsdb-http` 都是正常 publishable workspace packages；M12 core extraction不改变既有 v1 HTTP observable contract。

M13是 M11 frozen Render Store之上的 physical Web consumer，不改变 Render Update v1 wire/profile version。

`receiveRenderData(...)` 与 WebPresentationConfig v1是 M13 presentation contract，不反向修改 M11 Render wire。

---

## 15. Core Rules Through M13

1. Foundation/Wire remain orthogonal primitives；  
2. protocol packages own mechanics, not role/Platform authority；  
3. Main remains single Session/Runtime/Frame/Renderer/Data authority owner；  
4. Input/Render/Content/Web projection不复制 M8/M9 currentness/Broker authority；  
5. Business Definition只依赖 `@loomrealm/subsystem`；  
6. Business Definition与 Web presentation implementation保持 execution/authority boundary；业务 build/package topology不是 runtime authority contract；  
7. runtime presentation source = user-selected Window-level `WebPresentationConfigV1` current installation resources；  
8. browser bootstrap = ordered `<link>` / classic `<script>` + `window.onload`；  
9. concrete Custom Elements由业务拥有，Renderer不建立 business tag vocabulary；  
10. top-level roots直接进入 `document.body`；layout/stacking由业务 WC/CSS负责；  
11. data通过 optional `receiveRenderData(complete readonly snapshot)`投递，structure/attrs先于 data；  
12. DOM不是 Store authority source；M13不做 MutationObserver policing；  
13. M13不建立第二份 desired projection tree authority；  
14. M13不定义 RenderEvent → WC/DOM event ABI；  
15. `@loomrealm/fsdb` / M12 Content边界保持冻结；Business WC不得绕过 credential/version boundary；  
16. package只有在真实 ownership/consumer要求出现时 materialize；  
17. no generic presentation/component/asset/layer/module-loader framework without demonstrated need。
