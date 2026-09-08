# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving overall / **M12 Implemented / Qualified / Closed；M13 Web Projection pending**  
> 主要定义：M0..M17 实现顺序、当前 closure、Desktop/PWA qualification 边界  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[渲染系统](../10-architecture/rendering-system.md)、[独立分包与发布架构](./package-architecture.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

核心顺序：

```text
Foundation/Wire
→ Game document
→ Runtime Control
→ Subsystem Runtime/Frame
→ Main authority
→ Hostra Runtime
→ Renderer Control
→ Data role seam
→ Desktop Data Broker
→ Input
→ Render Replication
→ Content
→ Web Presentation Projection
→ loom.map
→ Desktop full E2E
→ PWA Runtime
→ PWA full E2E/equivalence
```

规则：

```text
Package Scope
!= Current Implementable Slice
!= Milestone Closure
```

首次实现只维护一个 current model；不制造 fake v2 / deprecated alias / generic framework。

---

## M0：文档与契约基线

Current docs统一 Game/Launcher/Main、Runtime/Frame、Renderer Control、Data/Input/Render/Content contracts、Web projection与 Platform composition boundary。

---

## M1–M9：基础与 Hostra/Data 主干 ✅

```text
M1 Foundation + Wire                ✅
M2 Game Package                     ✅
M3 Runtime Control                  ✅
M4 Subsystem Runtime/Frame          ✅
M5 Main Core                        ✅
M6 Hostra Runtime vertical          ✅
M7 Renderer Control                 ✅
M8 Renderer Data role/core          ✅
M9 Desktop Data Broker              ✅
```

这些 milestone 已建立：logical Game bootstrap、Main authority、Hostra Runner/Control、Renderer Control、Data role seam、Desktop paired Data Broker/late provisioning。

---

## M10：User Input — Implemented / Qualified / Closed ✅

Exact closure包括：

```text
SubsystemScope.createInputListener
Interest contribution vs handler registration
retained State / Event no replay
mutation-gate known-no-commit convergence
RendererInputSource construction/lifetime
Effective gate
bounded State/Event/Reset publication
Desktop/Hostra real Data vertical
```

Root gate：

```text
npm run test:m10
```

M15/M17 physical DOM/Gamepad source必须复用 frozen M10 source API，不得新开 Renderer→Data shortcut。

---

## M11：Render Replication — Implemented / Qualified / Closed ✅

Exact author surface：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
SubsystemScope.createRenderDomain(initialState)
RenderDomain.replace / emit / close
```

Closure包括：

```text
business Render authority
bounded publication via existing Data peer
Renderer internal replica
same-generation reconnect baseline rebuild
Domain/Node identity invariants
Event no future-carrier replay
Desktop/Hostra real vertical
formal subsystem-sender + renderer-receiver qualification
```

Root gate：

```text
npm run test:m11
```

M11关闭的是 Render authority/publication/current replica，不实现 DOM/Custom Element/Canvas/WebGL presentation。M13消费 M11 committed Store，而不重开 Render Update v1。

---

## M12：Content — Implemented / Qualified / Closed ✅

M12已按冻结设计完整实施，并于 2026-09-08 在 Node 20.20.2 / 24.20.0 通过同一个 `npm run test:m12` 根门禁；证据见 [M12 qualification](./m12-qualification.md)。

Root implementation plans：

```text
M12_01_CONTENT_SERVICE.md
M12_02_SUBSYSTEM_CONTENT_CLIENT.md
M12_03_RENDERER_RESOURCE_CLIENT.md
M12_04_VERTICAL_INTEGRATION.md
M12_05_QUALIFICATION_CLOSURE.md
```

决策 provenance：

```text
ADR 0030
packages/fsdb-http/M12_CORE_EXTRACTION.md
```

### Exact package/ownership slice

M12新增 exactly one Node FSDB domain package：

```text
@loomrealm/fsdb
```

它有两个真实 production consumers：

```text
@loomrealm/fsdb-http
apps/desktop Content Service
```

`@loomrealm/fsdb` 完整拥有 readonly FSDB validation/snapshot/index/descriptor/ordinary+metadata lookup/safe-open/read-lease；不拥有 LoomRealm Content version/HTTP/installation authority。

它是 public publishable Node>=20 ESM workspace package。`@loomrealm/fsdb-http` 只增加这一项 runtime workspace dependency，existing root API/HTTP conformance保持不变。

M12 **不新增**：

```text
@loomrealm/content
@loomrealm/content-service
Repository hierarchy
StorageProvider SPI
InstallationManager/global registry
AssetManager
Content RPC / credential profile
```

### Desktop prepared Content view

```text
Hostra PREPARE success
→ current immutable prepared installation view
→ @loomrealm/fsdb snapshot
→ normalized public GameEntry manifest
→ private immutable Content Index
→ prepare-time Content version hashing
→ Desktop localhost Content Service
```

Desktop Content直接消费 genuine `PreparedHostraGame`的 trusted projection；manifest不再二次解析 `game.json`，FSDB source从 canonical installation内唯一 `[FSDB]*`直接子目录派生，`apps/desktop`不直接依赖 `@loomrealm/game-package`。

不建立 global mutable Installation Registry。Content source在 service lifetime内属于 Host-trusted readonly installation；不为恶意 concurrent physical writer建立 transactional filesystem abstraction。

### Content API semantics

```text
GET / HEAD
manifest / record / group / resource
record/group key = one logical segment
resource key = hierarchical logical ResourceKey
contentVersion = sha256:<64 lowercase hex>
ETag = quoted exact contentVersion
Desktop scoped bearer
Content capability != executable resolver
```

### Subsystem consumer

M12 exact author root：

```text
scope.content.record(namespace,key,{signal?})
scope.content.resource(namespace,resourceKey,{signal?})
```

以及最小 `ContentReadError` vocabulary、同步 local argument validation、detached return ownership。Author不观察 installationId、URL、bearer、HTTP status/headers、filesystem path。

`manifest()` / `group()` / raw fetch不因 HTTP surface symmetry而 root-export；若 M14出现第一个真实 group consumer，再最小显式 reopen。

### Renderer consumer

M12只冻结：

```text
logical namespace + hierarchical resourceKey + expectedContentVersion
→ trusted Renderer integration-subpath ResourceClient
→ bytes + MIME + actualVersion
```

RenderNode.data→resource identity、decode/presentation、DOM/Canvas/WebGL/Audio没有在 M12冻结；M13/M14只消费已关闭的 ResourceClient/version/credential boundary。

### Real verticals

M12 closure必须有两个 production consumers：

```text
A. Hostra child → Runner → runSubsystem({content}) → business record/resource
B. Renderer ResourceClient → real Desktop Content HTTP → version-checked bytes
```

同时 qualification FSDB core extraction、existing fsdb-http regression、bearer auth、GET/HEAD/ETag/304/version/error/path confidentiality、caller cache-mutation isolation。

### Root closure target

实现后唯一 M12 gate：

```text
npm run test:m12
= npm run test:m11
+ @loomrealm/fsdb build/test/pack
+ fsdb-http regression/pack
+ Content API qualification
+ Subsystem ContentClient tests
+ Renderer ResourceClient tests
+ dependency/boundary tests
+ real M12 verticals
```

Node 20 + Node 24运行同一 gate。

该 gate与 qualification record现已关闭；M12后续变更继续遵循 M12/05 correctness-contradiction reopen门槛。

---

## M13：Web Presentation Bootstrap + Projection — pending

M13补齐 M11 有意留下的 physical Web presentation seam，但**不创作业务 Custom Elements**。它关闭：

```text
A. user-selected Window-level Web presentation config/bootstrap
B. committed Render Store → thin document.body WC projection
```

### Goal

```text
user-selected WebPresentationConfigV1
→ current prepared Content/FSDB resolution
→ ordered <link> / classic <script>
→ business JS customElements registration
→ window.onload
→ committed M11 Renderer Store
→ package-private post-commit seam
→ thin Web Projector
→ document.body / business-owned Custom Elements
```

职责边界：

```text
Subsystem
    authoritative Render writer

Renderer Store
    current authoritative replica

Web Projector
    mechanical physical projection

Business WC
    projection reader
    private presentation/layout writer
```

### Web Presentation Config v1

Current config exact shape：

```ts
interface WebPresentationConfigV1 {
  readonly formatVersion: 1;
  readonly scripts: readonly WebPresentationResourceRefV1[];
  readonly styles: readonly WebPresentationResourceRefV1[];
}

interface WebPresentationResourceRefV1 {
  readonly namespace: string;
  readonly key: string;
}
```

关键边界：

```text
config source/path = explicit product startup input
scripts/styles = entire Renderer Window scope
no subsystems field
no subsystemKey → presentation resource binding
config != game.json
config != launch.hostra.json / launch.pwa.json
config != LogicalGameBootstrap
config != Render state
```

每个 script/style ref使用 M12 logical resource identity：

```text
namespace + hierarchical ResourceKey
```

Current Desktop：

```text
user selects installationRoot
→ successful Hostra PREPARE
→ prepared installation
→ exactly one [FSDB]* direct child
→ M12 prepared Content view
```

M13 **不新增用户可配置 `fsdbRoot`**。Config中的 JS/CSS从 current prepared Content view解析并固定 current `contentVersion` / MIME facts。

Config不得携 filesystem path、FSDB handle、URL、bearer、Content credential或 arbitrary loader capability。

### Browser bootstrap / ready barrier

Current M13 browser mechanism：

```text
validated/resolved WebPresentationConfigV1
→ Renderer bootstrap document
→ styles[] as ordered <link rel="stylesheet">
→ scripts[] as ordered classic <script>
→ business scripts customElements.define(...)
→ window.onload
────────────────────────────────────────
Web Projector starts
```

classic scripts不得使用 `async`破坏 declaration evaluation order。

M13不建立 ESM/Blob/module-graph/dynamic component loader framework。trusted host只需把 prepared logical resources私下绑定成 `<link href>` / `<script src>` 可加载位置，且不得把 Content bearer/path/resolver capability暴露给 business config/WC。

projection使用某个 `RenderNode.tag` 时若该 WC仍未注册，属于 presentation-local failure。

### Physical mount / no generic layer system

Top-level projected Render roots直接进入：

```text
document.body
```

M13不创建：

```text
per-Domain wrapper/layer
CSS stacking context framework
automatic z-index styles
cross-Subsystem visual layer manager
layout engine
```

Projector只同步 projected nodes。实际 layout/position/stacking由 business WC / business CSS决定。

### Exact projection model

Current `RenderNode` shape保持不变：

```text
key      → stable HTMLElement identity
tag      → business-owned Custom Element name
attrs    → Renderer-managed host attributes
data     → optional receiveRenderData(full readonly snapshot)
children → Renderer-managed ordered light DOM
```

同一 live key必须保持同一 HTMLElement instance；`move`移动 existing instance，不得 remove + recreate。

`tag` 对 Render Core保持 opaque。Renderer不建立 known business tag vocabulary、不发布 component library、不实现具体业务 WC。

### Read-only WC boundary / no policing

业务 WC 对 LoomRealm projected Render state只有读取权：

```text
Element identity/tag
Render-managed attrs
Render data
managed children/order
```

业务 contract上不得修改这些 state；但 M13不使用 MutationObserver或其他 policing机制检测/修复违规 DOM mutation。

如果业务违反 contract：

```text
Renderer Store remains authoritative
DOM state is never adopted back into Store
subsequent presentation-local behavior is not guaranteed
business-local accidental consequences are not LoomRealm responsibility
```

Renderer不得从实际 DOM反向推导 Store state。

### `children`

```text
RenderNode.children
→ ordered light-DOM children
```

标准 `slot` / Shadow DOM composition直接可用，不新增 LoomRealm slot protocol。第一版不增加 raw TextNode/CommentNode/HTML fragment child model。

### `data` — exact `receiveRenderData(...)`

`data`独立于 `attrs`，表示 complex structured retained state。

M13冻结：

```ts
interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}
```

语义：

```text
optional method
initial materialization → complete current data
committed data change → complete current data
missing receiveRenderData → no data delivery, not failure
wire patch never exposed
object identity has no semantic meaning
```

第一版明确不做 partial patch / JSON Patch / Observable/Proxy/Signal contract / WC→Render data write。

### Store → Projector seam

Web Projector不得消费 raw Render wire。

```text
Render wire
→ Renderer Store validate
→ atomic Store commit
→ package-private post-commit notification/effect
→ Web Projector
```

通知只能发生在 successful Store commit后；failed Store mutation不得产生 projection notification；business不能订阅这一 seam。

Snapshot/current Store MAY按 authoritative key identity做 mechanical reconciliation，以保持 same live key → same HTMLElement。这不构成第二份 desired-tree authority。

### Projection ordering

一次 committed change按以下顺序投影：

```text
1. structure / children
2. attrs
3. receiveRenderData(full current data)
```

所以业务进入 `receiveRenderData(...)` 时，managed structure/children和 attrs已经对应同一次 Store commit。

browser `connectedCallback` / `attributeChangedCallback`不是 LoomRealm atomic-commit ABI。

### RenderEvent not projected to WC

M11 `RenderEvent`保持原有 transient/non-authoritative/no-replay semantics，但 M13 **不** 定义：

```text
onRenderEvent
receiveRenderEvent
DOM dispatchEvent mapping
```

当前没有真实 presentation consumer要求这项能力；未来有真实需求时再 demand-driven reopen。

### Business presentation implementation boundary

Business Definition与 Web presentation implementation保持 execution/authority boundary：

```text
Business Definition side
→ @loomrealm/subsystem only
→ no Browser/DOM authority

Business Web presentation side
→ concrete Custom Element definitions
→ browser APIs allowed
→ no Render authority write capability
```

业务 build/package如何产出 JS/CSS不是 Renderer runtime contract。运行时 implementation source是 `WebPresentationConfigV1`引用的 current installation resources。

### Failure behavior

Bootstrap failure：

```text
config invalid
required JS/CSS unavailable/load failure
script evaluation/registration failure
→ Projector does not enter running state
```

Runtime projection/WC failure：

```text
unregistered tag
receiveRenderData throws
DOM operation failure
WC contract violation
business presentation local exception
→ report local error
→ no Store rollback
→ no Main/Subsystem authority mutation
→ continue best-effort where possible
```

M13不预建复杂 node/domain recovery framework。

### M13 Qualification Target

使用 fixture business Custom Elements和真实 headless Chromium，至少证明：

```text
WebPresentationConfigV1 closed-schema validation
scripts/styles are Window-level; no subsystem binding
Desktop resolves refs against current prepared unique-FSDB Content view
no separate fsdbRoot input
ordered <link> / classic <script>
window.onload blocks projection start
business JS registers fixture Custom Elements
roots project directly into document.body
snapshot / insert / remove / move
move preserves same HTMLElement instance
attrs projection exact
receiveRenderData initial/update full snapshot
structure/attrs already current when receiveRenderData runs
Store commit → Projector notification only after successful commit
WC DOM mutation never changes authoritative Store
WC callback failure never rolls back Store/Main/Subsystem
RenderEvent is not delivered as WC/DOM event
```

M13不复制 M11 protocol conformance，也不重测 M12 Content service internals。

未来 canonical closure target：

```text
npm run test:m13
```

具体 gate composition在 M13 implementation plan冻结，但必须包含真实 Chromium qualification，不能只用 Node fake DOM。

---

## M14：`loom.map` Business + Web Presentation — pending

M14把原 M13 map business milestone顺延，并首次形成真实业务 presentation consumer。

### Business side

```text
@loomrealm/map → @loomrealm/subsystem
```

必须真实使用：

```text
Frame / FrameOutcome / frame.call
M10 InputListener
M11 RenderDomain replace/close
M12 ContentClient record/resource
```

`RenderDomain.emit`仍是 M11 frozen能力，但 M14不为了 API coverage强制使用；只有真实 business/presentation consumer证明需要时才启用。

Business Definition仍不允许 Game/Launcher/Runtime Control/Platform/FSDB/Browser imports。

### Business-owned Web presentation side

同一个 map business owner提供自己的 Web presentation implementation：

```text
map RenderNode.tag/data/children contract
↔
map-owned Custom Elements
```

业务 owner同时产出 map presentation JS/CSS resource；启动所选的 Window-level `WebPresentationConfigV1`引用这些资源。**不是**把 `scripts/styles` 绑定到 `loom.map` subsystem descriptor。

它可以使用 Web Components、Shadow DOM、Canvas/WebGL与 M13明确授予的 presentation integration capability，但不获得 Render write authority、Main authority、Content bearer/path或 raw protocol carrier。

M14不再自行发明另一套 loading boundary，也不把具体 map tags提升成 LoomRealm Render vocabulary。

### M14 Qualification Target

至少证明一个真实 map vertical：

```text
real @loomrealm/map Definition
→ Content record/resource
→ Input listener
→ RenderDomain replace/close
→ M11 replication
→ M13 Window-level presentation bootstrap
→ M13 document.body Web projection
→ map-owned WC
→ receiveRenderData current snapshot
→ observable real presentation
→ nested frame.call/return
→ business outcome
```

若真实地图需求证明 `ContentClient.group()`必要，按 demand-driven rule最小 reopen M12 author projection；不得 raw fetch旁路。

---

## M15：Desktop Full E2E — pending

```text
user selects installationRoot + WebPresentationConfigV1
→ HostraPlatform.prepareGame
→ current prepared unique-FSDB Content view
→ Main / Node Runner / Runtime Control
→ BrowserWindow bootstrap document
→ M13 ordered <link> / classic <script>
→ window.onload
→ M13 Web Projector roots → document.body
→ physical Renderer Control WS
→ M9 Data Broker
→ M10 real DOM/Gamepad RendererInputSource
→ M11 Render replica
→ M14 map-owned Custom Elements
→ M12 ResourceClient / runtime Content bytes
→ reconnect/reload/shutdown
```

M15不重新设计 Input/Render/Content/Web presentation logical semantics；只完成真实 Desktop physical composition。

---

## M16：PWA Runtime — pending

只关闭：

```text
PWA PREPARE
Worker Runner
RuntimeHosting
Runtime Control MessagePort
real Main↔Worker↔Subsystem trace
termination/failure
```

不提前 claim PWA Renderer/Data/Content/presentation full equivalence。

---

## M17：PWA Full E2E / Equivalence — pending

完成：

```text
Window Renderer Control
PWA DataConnectionBroker / MessageChannel provisioning
Input/Render full trace
same WebPresentationConfigV1 logical scripts/styles semantics
same <link>/classic <script>/window.onload bootstrap semantics
same thin document.body Web projection semantics
PWA Content via same-origin Fetch + Service Worker + OPFS/Cache as needed
business-owned WC presentation
Renderer reload/replacement
Session shutdown
Hostra/PWA logical trace equivalence
```

比较：

```text
Game topology/bootstrap
Runtime/Frame/Activation/outcome
Renderer authority/Data currentness
Input delivery
Render replica
Content logical response
Web Presentation Config logical resource identities/order/ready barrier
Web projection identity/attrs/receiveRenderData/children semantics
business-observable state/result
```

不比较：

```text
module path/bytes
PID vs Worker
WebSocket vs MessagePort
Desktop FSDB/HTTP vs PWA OPFS/Service Worker
trusted physical browser src/href binding
business WC private implementation details
```

Node-only `@loomrealm/fsdb` 不成为 PWA storage abstraction。

---

## Current Status

```text
M1  Foundation + Wire                  ✅
M2  Game Package                       ✅
M3  Runtime Control                    ✅
M4  Subsystem Runtime/Frame            ✅
M5  Main Core                          ✅
M6  Hostra Runtime                     ✅
M7  Renderer Control                   ✅
M8  Renderer Data                      ✅
M9  Desktop Data Broker                ✅
M10 User Input                         ✅ Implemented / Qualified / Closed
M11 Render Replication                 ✅ Implemented / Qualified / Closed
M12 Content                            ✅ Implemented / Qualified / Closed 2026-09-08
M13 Web Presentation Projection        pending
M14 loom.map                           pending
M15 Desktop full E2E                   pending
M16 PWA Runtime                        pending
M17 PWA full E2E/equivalence           pending
```

当前 canonical executable closure gate仍为 `npm run test:m12`。

下一步不是直接实现 `loom.map`，而是实现 M13 Web Presentation Config/bootstrap + thin Projection；M13关闭后再进入 M14 map business + business-owned Web presentation vertical。
