# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10–M12 Closed / M13 Web Projection Pending**  
> 主要定义：logical roles/modules、Runner/role-facing capabilities、Renderer/Data/Input/Render/Content/Web presentation 与 Desktop/PWA realization 入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 实施映射：[Phase 1 交付计划](../30-implementation/phase-1-delivery-plan.md)  
> 最近复核：2026-09-08

```text
module boundary != npm package boundary != protocol boundary != platform boundary
```

---

## 1. Module Map

| 模块 | 入口 | Current responsibility |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/Activation/InputTarget/DataAuthority/current Renderer authority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | read-only Main mirror、Data reconciliation、M10 Input、M11 internal Render replica、M12 ResourceClient、M13 bootstrap + thin body projection |
| Game Package | [game-package](./game-package/README.md) | logical Game topology/common validation |
| FSDB Content legacy | [fsdb-content-service](./fsdb-content-service/README.md) | **Superseded**；current implementation由 M12 closure 定义 |
| `loom.map` | [loom-map](./loom-map/README.md) | M14 platform-neutral business Definition + business-owned Web presentation implementation |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Hostra Launcher/Runner/WS/Data Broker/M12 Content/M13 Web bootstrap/projection/M15 full composition |
| PWA | [pwa-host](./pwa-host/README.md) | PWA Launcher/Worker/MessagePort；M16 Runtime / M17 full equivalence target |

Desktop/PWA 是同一 application architecture 的不同 physical realization。

---

## 2. Authority / Role Boundaries

```text
Main
    Session / Runtime / Frame / Stack / Activation
    InputTarget / Renderer currentness / DataAuthority

Subsystem
    business state / local Frame Context
    Desired Input Interest / retained author State
    Render authoritative Domains
    author-facing ContentClient usage

Renderer Store
    current authoritative Render replica

Web Projector
    successful Store commit → DOM mechanical projection

Business Web Component
    read-only projected Render state
    private Shadow DOM / Canvas / WebGL / layout / local presentation state

Platform/App Composition
    executable binding / Process-Worker-Window
    Control/Data physical provisioning
    Content service/binding/credential
    Web Presentation Config acquisition/resolution
    trusted browser href/src binding
```

M13 current startup/projection model已经冻结：

```text
user-selected Window-level WebPresentationConfigV1
→ current prepared Content resource refs
→ ordered <link rel="stylesheet"> / classic <script>
→ customElements.define(...)
→ window.onload
→ Store post-commit seam
→ thin Projector
→ document.body
```

保持：

```text
Frame != Runtime != Data != Render != Content != Web presentation lifetime
Platform physical ownership != application authority
Content capability != executable resolver
DOM != Render authority source
```

---

## 3. Role-facing Capabilities Through M13

Main-facing：

```text
DeadlineScheduler
OpaqueMaterialGenerator
RuntimeHosting
RendererControlBinding?
DataConnectionAuthoritySink?
```

Renderer-facing/current role integration：

```text
RendererDataBinding
RendererInputSource
trusted Renderer ResourceClient
package-private Store → Projector seam
```

Subsystem-facing：

```text
RuntimeControlBinding
SubsystemDataBinding
ContentClient
```

M13不自动新增 `@loomrealm/platform-ports` surface、generic presentation package、component registry或 layer manager。

---

## 4. M10 User Input — Closed

```text
Effective(F,A,C)
=
current matching Data
∧ Main InputTarget(S,F,A)
∧ current active Activation
∧ C ∈ Interest[F]
∧ Producer(C)
```

Subsystem author冻结 `createInputListener`；Renderer冻结 one construction-time `RendererInputSource` + current-Control subscription。Known-no-commit同 Activation恢复时 retained State convergence先于 recoverable `frame.call` rejection observable；Event不 replay。

Status：**Implemented / Qualified / Closed**。

---

## 5. M11 Render Replication — Closed

Subsystem exact author surface：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
SubsystemScope.createRenderDomain(initialState)
RenderDomain.replace / emit / close
```

所有 author calls synchronous local-only；business Domain lifecycle独立于 Frame/Data carrier。Renderer Store挂 existing Data slot、internal-only。

M11关闭 authoritative Render tree 的 publication/replication/currentness/identity；physical Web presentation留给 M13。

Status：**Implemented / Qualified / Closed**。

---

## 6. M12 Content — Closed

Physical/data shape：

```text
Hostra PREPARE
→ current prepared installation view
→ exactly one [FSDB]*
→ @loomrealm/fsdb
→ private Content Index + manifest/version
→ apps/desktop Content Service
```

Consumers：

```text
Subsystem
    scope.content.record/resource

Renderer
    resource(namespace,key,expectedVersion)
    → bytes + MIME + actual version
```

固定：

```text
contentVersion = sha256:<64 lowercase hex>
resource key may be hierarchical
Content credential remains Host-private
ordinary Content failure != Runtime/Frame failure
Renderer resource read != Render authority
```

Status：**Implemented / Qualified / Closed**。

---

## 7. M13 Web Presentation Projection

M13关闭两部分：

```text
A. Window-level presentation startup
B. committed Store → document.body thin projection
```

Startup：

```text
user-selected WebPresentationConfigV1
→ scripts/styles logical resources from current prepared Content
→ ordered <link rel="stylesheet"> / classic <script>
→ business customElements.define(...)
→ window.onload
```

Projection：

```text
Store successful atomic commit
→ package-private post-commit notification/effect
→ Web Projector
→ document.body / business-owned WC
```

Mapping：

```text
key      → stable HTMLElement identity
tag      → business-owned Custom Element name
attrs    → Renderer-managed host attributes
data     → optional receiveRenderData(complete readonly snapshot)
children → Renderer-managed ordered light DOM
```

Projection observable order：

```text
structure / children
→ attrs
→ receiveRenderData(...)
```

M13不建立：

```text
second desired projection-tree authority
generic per-Domain layer / CSS stacking framework
cross-Subsystem visual layer manager
ESM/Blob/dynamic component loader framework
RenderEvent → WC/DOM event ABI
MutationObserver policing / hostile-code sandbox
```

Top-level roots直接进入 `document.body`；layout/position/stacking由 business WC/CSS负责。

业务 WC违反 managed DOM read-only contract时，Store仍 authoritative，DOM不反向被采纳；后续 presentation-local行为不保证。

---

## 8. M14 `loom.map`

M14由同一 map owner提供：

```text
@loomrealm/map
    → platform-neutral Business Definition
    → @loomrealm/subsystem only

map Web presentation implementation
    → JS/CSS resources referenced by Window-level WebPresentationConfigV1
    → concrete map-owned Custom Elements
```

真实组合：

```text
Frame/Call
M10 InputListener
M11 RenderDomain replace/close
M12 ContentClient
M13 <link>/<script>/window.onload bootstrap
M13 document.body projection + receiveRenderData
map-owned WC physical presentation
```

`RenderDomain.emit`仍是 M11能力，但 M14不为了 coverage强制使用；M13当前没有 RenderEvent→WC consumer。

如果首次证明需要 `ContentClient.group()`，按真实 consumer最小 reopen author projection；不得 raw-fetch/FSDB旁路。

---

## 9. Physical Placement

```text
M15 Hostra Desktop
    BrowserWindow bootstrap document
    physical Renderer Control WS
    M9 Data Broker
    real DOM/Gamepad RendererInputSource
    M11 current Render replica
    M13 <link>/classic <script>/window.onload
    M13 body Projector
    M14 map-owned WC
    M12 Renderer ResourceClient

M17 PWA full closure
    Window/Worker + MessagePort
    PWA Data provisioning
    same WebPresentationConfig logical meaning
    same <link>/classic <script>/window.onload semantics
    same body/identity/attrs/receiveRenderData/children projection semantics
```

PWA可以使用 Fetch/Service Worker/OPFS/Cache，不复用 Node-only `@loomrealm/fsdb`。trusted physical `href/src` binding可以与 Desktop不同。

---

## 10. Current Milestones

```text
M6  Hostra Runtime             ✅
M7  Renderer Control           ✅
M8  Data role/core             ✅
M9  Desktop Data Broker        ✅
M10 User Input                 ✅ Implemented / Qualified / Closed
M11 Render Replication         ✅ Implemented / Qualified / Closed
M12 Content                    ✅ Implemented / Qualified / Closed
M13 Web Presentation Projection pending
M14 loom.map                   pending
M15 Desktop full E2E           pending
M16 PWA Runtime                pending
M17 PWA full E2E/equivalence   pending
```

M13 qualification必须包含真实 headless Chromium；Node/fake DOM不能单独关闭 Custom Element / `window.onload` / HTMLElement identity semantics。

---

## 11. Abstraction Rule

模块文档不得为了未来可能用途重新引入已经由当前 closure删除的模型。特别禁止：

```text
runtime service locator
generic Content Repository
universal asset loader
Content storage adapter hierarchy
Renderer public Render Store
LoomRealm-owned business component library
generic Presentation DSL
generic presentation layer/stacking manager
dynamic component/module-loader framework
RenderEvent→DOM bridge without real consumer
second LoomRealm projection tree authority
platform-specific business Definition branch
```

业务 WC内部选择 UI framework不是这里禁止的“第二套 authority”；只要它局限在 component-private presentation state即可。

遇到真实 consumer capability gap，按文档治理显式 reopen最小 owning boundary。
