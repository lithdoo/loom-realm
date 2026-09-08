# Web 渲染端模块设计

> 层级：模块设计  
> 状态：M8 Data / M10 Input / M11 Render **Implemented + Qualified**；M12 ResourceClient **Implemented + Qualified**；M13 Web Projection **Pending**  
> 稳定程度：closed lower slices / M13 presentation projection Active Design  
> 主要定义：Renderer Control holder、Data reconciliation、Input gate/source、internal Render replica、M12 trusted ResourceClient、M13 `<link>/<script>` bootstrap、Store → `document.body` thin Projector、`receiveRenderData(...)`  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)、[Content API v1](../../15-contracts/content-api-v1.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[ADR 0031](../../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

Renderer不是 Frame/Call participant。它镜像 Main committed authority，并在 current Data peers上执行 Input/Render role behavior；M12增加 trusted logical resource → bytes responsibility；M13补上 Window-level business presentation bootstrap和 current Render Store → business WC 的 thin physical projection，不创建新的 application authority。

---

## 1. Current / Target Shape

```text
@loomrealm/renderer
└── one Control holder
    ├── current Control peer/snapshot
    ├── per-subsystem Data slots
    │   ├── current RendererDataPeer
    │   ├── M10 Input Registry/gate/publisher
    │   └── M11 internal Render replica
    ├── optional construction-time RendererInputSource
    ├── M12 trusted integration-subpath ResourceClient
    └── M13 package-private committed-change seam
            ↓
        thin Web Projector
            ↓
        document.body / business-owned Custom Elements

Renderer Window bootstrap
└── user-selected WebPresentationConfigV1
    ├── ordered styles[] → <link rel="stylesheet">
    └── ordered scripts[] → classic <script>
        ↓ business JS customElements registration
        ↓ window.onload
        ↓ enable Web Projector
```

M8/M10/M11/M12均复用 existing currentness facts。M13 Projector只能消费 committed current Store，不 mint Data/Render authority。

---

## 2. Authority / Currentness

Main publishes committed：

```text
Runtime projection
Frame / Activation / InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

Renderer不得 create/recover Frame/Activation、modify Stack、mint Data authority/currentness或从 focus/Content availability推导 InputTarget。

Render currentness只来自 current Control + DataAuthority + current Data peer + committed M11 Store。DOM/WC instance existence不产生新的 currentness proof。

Presentation bootstrap readiness只是 local physical readiness，不构成 Main/Render authority。

---

## 3. M10 Input — Closed

Exact construction仍是：

```ts
createRendererControlHolder(
  data?: RendererDataBinding,
  input?: RendererInputSource,
)
```

Effective gate仍是：

```text
current Data
× current Control snapshot
× Main InputTarget
× active F/A
× Interest[F]
× Producer(C)
```

M13/M15 physical DOM input必须继续进入 exact `RendererInputSource` seam；业务 WC存在、focus或事件监听不能直接形成 Data input authority。

---

## 4. M11 Render Replica — Closed

M11 Store挂 existing desired Data identity：

```text
current Control peer
+ subsystemKey
+ generation
+ dataProfile
```

Store internal facts：current Registry、per-Domain baseline/revision、committed tree、generation-scoped observed identity history。

same-generation carrier replacement保留 identity history但重建 carrier baseline；old peer不能 mutate replacement current。Render protocol-fatal只 retire current Data peer，不直接 fail Runtime/Frame。

M11 **没有 public Render Store/subscription/presentation API**。M13不改变这一点。

---

## 5. M12 ResourceClient — Closed

Renderer trusted integration subpath继续提供 version-checked logical resource → bytes：

```ts
resource(
  namespace: string,
  hierarchicalResourceKey: string,
  expectedContentVersion: string,
  signal?: AbortSignal,
): Promise<{
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly contentVersion: string;
}>
```

M13 bootstrap JS/CSS也使用 current M12 Content logical identity，但 bootstrap `src/href` resolver属于 Window-startup trusted composition，不把 ResourceClient、URL、bearer或 filesystem path直接交给 business WC。

---

## 6. M13 Projection Mapping

M13 target：

```text
committed M11 Render Store
→ thin Web Projector
→ business-owned Custom Element instances
```

Projection mapping：

```text
RenderNode.key
→ stable HTMLElement instance identity

RenderNode.tag
→ document.createElement(tag)
→ business-owned Custom Element

RenderNode.attrs
→ Renderer-managed host attributes

RenderNode.data
→ optional receiveRenderData(complete readonly current snapshot)

RenderNode.children
→ Renderer-managed ordered light DOM
```

Renderer可维护 internal：

```ts
Map<RenderNodeKey, HTMLElement>
```

`key`不自动暴露为 element `id` / attribute / business-readable protocol state。

---

## 7. Physical Mount — `document.body`

Top-level Render roots直接投影为 `document.body` 的 managed child elements。

M13不创建：

```text
per-Domain wrapper/layer
generic stacking context
CSS z-index synthesis
layout/positioning framework
cross-Subsystem visual layer manager
```

Renderer只负责 projected nodes本身的 create/remove/move/attrs/data/children同步。

业务 WC / business CSS自行决定：

```text
layout
position
stacking
Shadow DOM
Canvas/WebGL realization
```

---

## 8. WC Projection Is Read-only, but Not Policed

业务 WC 对 LoomRealm projection 的 managed state只有 read access：

```text
Element identity/tag
Render-managed host attrs
Render data
managed light-DOM children/order
```

业务 WC contract上不得 mutate这些 state，但 M13 **不** 使用 MutationObserver或其他 policing mechanism检测/修复违规 mutation。

如果业务 WC违规：

```text
Renderer Store remains authoritative
DOM state is never adopted back into Store
subsequent presentation-local behavior is not guaranteed
business-local accidental consequences are not LoomRealm responsibility
```

业务 WC仍完全拥有 private fields、Shadow DOM、Canvas/WebGL、cache/animation/timer等 private presentation state。

---

## 9. Children — Managed Light DOM

```text
RenderNode.children
→ HTMLElement light-DOM child list
```

Renderer owns insert/remove/move/order。标准 `slot` attribute与 Shadow DOM `<slot>`足够表达业务 composition；LoomRealm不建立新的 slot protocol。

M11 `move`必须保留 same HTMLElement object：

```text
same live key
→ same element instance
→ physical move only
```

第一版不新增 raw text/comment/html-fragment child node model。

---

## 10. Data — `receiveRenderData(...)`

`data` 与 `attrs` 独立：

```text
attrs = string host attributes
data  = complex retained JsonObject state
```

Wire/Store内部可以继续使用 M11 top-level set/remove delta，但 WC不观察 delta。

M13 exact WC method：

```ts
interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}
```

Delivery semantics：

```text
method optional
initial materialization → current full data
committed data change → current full data
missing method → no delivery, not failure
wire patch never exposed
object identity has no semantic meaning
```

第一版没有：

```text
partial patch API
JSON Patch
Observable/Proxy/Signal model as LoomRealm contract
WC → Render data mutation
```

Projector不得向 WC提供 Store/data reverse-write capability。

---

## 11. Store → Projector Seam

Web Projector不得直接消费 raw Render wire。

内部方向固定：

```text
render.* wire
→ Renderer Store validate
→ atomic Store commit
→ package-private post-commit notification/effect
→ Web Projector
```

要求：

```text
notify only after successful commit
failed Store mutation → no projection notification
business cannot subscribe
no new Render authority
```

Snapshot replacement MAY执行 keyed mechanical reconciliation，以保持 same live key → same HTMLElement；这不是第二份 desired-tree authority。

---

## 12. Projection Ordering

一次 Store commit的 physical order：

```text
1. structure
   create / insert / remove / move / children

2. attrs
   set / remove host attributes

3. data
   receiveRenderData(full current data)
```

所以 `receiveRenderData(...)` 执行时，managed structure/children和 attrs已经反映同一次 Store commit。

`connectedCallback` / `attributeChangedCallback` 是 browser-native lifecycle，不是 LoomRealm atomic commit notification。

---

## 13. Web Presentation Config / Bootstrap

M13 current startup source：

```ts
interface WebPresentationConfigV1 {
  readonly formatVersion: 1;
  readonly scripts: readonly WebPresentationResourceRefV1[];
  readonly styles: readonly WebPresentationResourceRefV1[];
}
```

规则：

```text
scripts/styles = entire Renderer Window scope
no subsystems field
resource ref = M12 namespace + hierarchical resourceKey
config path = product startup input
```

Current Desktop：

```text
installationRoot
→ successful Hostra PREPARE
→ exactly one direct-child [FSDB]*
→ M12 prepared Content view
```

M13不新增 `fsdbRoot` 用户配置。

---

## 14. Browser Bootstrap / Ready Barrier

Current M13 browser mechanism：

```text
validated/resolved WebPresentationConfigV1
↓
Renderer bootstrap document
↓
ordered <link rel="stylesheet">
↓
ordered classic <script>
↓
business scripts customElements.define(...)
↓
window.onload
────────────────────────────────────────
start Web Projector
```

scripts不得使用 `async`破坏 declaration evaluation order。

LoomRealm不维护第二个 Custom Element registry，也不建立 ESM/Blob/dynamic component loader framework。

projection使用某个 `RenderNode.tag` 时若该 Custom Element仍未注册，属于 presentation-local failure。

---

## 15. Render Event — No WC ABI in M13

M11 `RenderEvent`继续保持：

```text
ordered
transient
non-authoritative
no replay
may be lost
```

M13 **不** 定义：

```text
onRenderEvent(...)
receiveRenderEvent(...)
DOM dispatchEvent mapping
```

Web Projector v1只投影 retained `tag/attrs/data/children`。未来真实 consumer若证明需要 Event进入 physical presentation，再独立设计。

---

## 16. Presentation Failure

### Bootstrap failure

```text
config invalid
required JS/CSS unresolved/unavailable
<link>/<script> load failure
script evaluation/registration failure
```

结果：Projector不进入 running state。

### Runtime failure

```text
unregistered projected tag
receiveRenderData throws
DOM operation failure
WC contract violation
business presentation local exception
```

结果：

```text
report presentation-local error
no Store rollback
no Main/Subsystem authority mutation
continue best-effort where possible
```

M13不预建复杂 node/domain recovery framework。

---

## 17. Resource / Window Lifetime

```text
ResourceClient lifetime != RenderDomain lifetime
resource cache lifetime  != Frame lifetime
Data reconnect            != Content cache invalidation
WC private resource state != Render authority
```

Presentation bootstrap lifetime：

```text
Renderer Window lifetime
=
Web Presentation Config bootstrap lifetime
=
Custom Element registry lifetime
```

V1不按 Subsystem/Frame/Activation/RenderDomain动态装卸 scripts/styles。

---

## 18. M13 Qualification / Phase Placement

M13使用 fixture business Custom Elements和真实 headless Chromium证明：

```text
WebPresentationConfigV1 validation/resolution
<link> / ordered classic <script>
window.onload ready barrier
customElements registration
Store commit → Projector notification
roots → document.body
snapshot / insert / remove / move
same-key HTMLElement identity
attrs
receiveRenderData initial/update full snapshot
structure/attrs before receiveRenderData
DOM violation never mutates Store
callback failure does not roll back authority
RenderEvent not delivered to WC/DOM
```

路线：

```text
M11 Render Replication      closed
M12 Content                 closed
M13 Web Projection          pending
M14 loom.map                pending
M15 Desktop full E2E        pending
M16 PWA Runtime             pending
M17 PWA full E2E            pending
```

M14由 `loom.map` business owner提供真实 Web Components/JS/CSS resources；M15再完成 BrowserWindow/physical Renderer Control/Input/Content/reload/shutdown的完整 Desktop composition。

---

## 19. PWA / M17

PWA Window共享：

```text
same WebPresentationConfigV1 scripts/styles meaning
same logical Content resource identities
same <link>/classic <script>/window.onload bootstrap semantics
same key → same live element identity
same document.body root projection model
same attrs projection
same receiveRenderData full readonly data delivery
same managed light-DOM children order
same WC read-only authority boundary
```

physical Content storage和 trusted browser `src/href` binding可以不同。Node-only `@loomrealm/fsdb` 仍不成为 PWA abstraction。

---

## 20. Final Invariants

1. Renderer仍不是 Frame RPC participant或 application authority owner；
2. Control holder/Data slots保持唯一 currentness facts；
3. M10 Input / M11 Render / M12 Content不复制 currentness；
4. M11 Render Store internal-only；
5. M12 ResourceClient trusted/private integration boundary保持不变；
6. M13 Web Projector只消费 Store successful commit后的 package-private notification，不消费 raw Data carrier；
7. concrete Custom Elements由业务拥有，Renderer不定义 business tag vocabulary；
8. top-level roots直接投影到 `document.body`，不建立 generic layer/stacking framework；
9. same live key对应 same HTMLElement instance；
10. attrs/data/children等 projected state对 WC只读，但 M13不做 DOM mutation policing；
11. children是 Renderer-managed ordered light DOM；
12. data只通过 optional `receiveRenderData(complete readonly snapshot)` 单向投递；
13. projection order = structure → attrs → receiveRenderData；
14. DOM不是 authority source，绝不反向同步 Render Store；
15. 不建立第二份 desired projection tree authority；必要 keyed reconciliation不构成第二 authority；
16. WebPresentationConfigV1由用户启动时选择，顶层只有 Window-level ordered scripts/styles，没有 subsystems；
17. Desktop presentation resources从 current prepared installation唯一 FSDB/Content view解析，用户不单独配置 FSDB；
18. browser bootstrap使用 ordered `<link>` / classic `<script>`，`window.onload`后才能启动 Projector；
19. M13不定义 RenderEvent → WC/DOM event ABI；
20. presentation failure不回滚 Render authority、不自动等于 Runtime/Frame failure；
21. M13以真实 Chromium关闭 browser behavior；
22. PWA M17共享 logical Web presentation/projection semantics，不共享 Node storage mechanics。
