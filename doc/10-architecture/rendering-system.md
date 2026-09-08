# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Stabilizing overall / **M11 implementation slice Frozen / M13 Web projection Active Design**  
> 主要定义：Subsystem-owned business Render Domain、generation-scoped Render wire lifecycle、Renderer authoritative replica、thin Web Component projection、Web presentation startup config、Data/Frame/Input independence  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)  
> 被以下文档使用：[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)、[Web Renderer](../20-modules/web-renderer/README.md)  
> 正式化：[Render Update v1](../15-contracts/render-update-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> M11 实施：[M11 / 01](https://github.com/lithdoo/loom-realm/blob/main/M11_01_SUBSYSTEM_RENDER_MANAGER.md) → [M11 / 05](https://github.com/lithdoo/loom-realm/blob/main/M11_05_QUALIFICATION_CLOSURE.md)  
> 最近复核：2026-09-08

---

## 1. Goal

```text
Subsystem business state
→ declarative business Render Domains
→ generation-scoped Render publication
→ Renderer authoritative replica
→ thin Web projection
→ business-owned Custom Elements
→ local physical presentation
```

M11 Render protocol复制 authoritative presentation state，不把 Renderer变成 business authority，也不把 DOM/Canvas/WebGL命令暴露给 Subsystem。

M13补齐 M11 有意留下的 physical Web presentation seam：LoomRealm只把 current replica机械投影为 business-owned Custom Element实例树，不拥有具体 component vocabulary、layout engine、stacking framework 或 component implementation。

---

## 2. Authority

Subsystem拥有：

```text
business Render Domain lifecycle
Domain desired state
Domain zIndex
Render tree authoritative state
publication intent
transient Render Event source
```

Renderer拥有：

```text
current authoritative replica when Data stream current
stale presentation cache after stream loss if product chooses
Web projection instance mapping
physical projection mutation
paint/presentation hosting integration
```

Business Web Component拥有：

```text
concrete tag semantics
Shadow DOM / private DOM
Canvas / WebGL resources
decoded resource objects
animation/cache/timers
presentation-local derived state
business layout / positioning / stacking policy
```

Business Web Component **不拥有** Render projection authority。它对 LoomRealm投影的 Element identity/tag/attrs/data/managed children只有读取权。

Main不拥有 Render Domain state；physical hosting/composition也不产生第二份 Render authority。

---

## 3. Two Lifetimes

必须区分：

```text
business Render Domain lifetime
!=
Render Update wire Domain lifetime
!=
physical WC instance hosting lifetime
```

Frozen Render v1 wire identity：

```text
(Session, subsystemKey, DataAuthority generation, domainId)
```

因此：

```text
same-generation Data carrier replacement
    → fresh publication baseline
    → same wire Domain/Node lifetime

fresh DataAuthority generation
    → fresh Render wire universe
    → business Domain MAY survive and be re-exported
```

Web projection必须服从 current Renderer Store lifetime；不得从 DOM/WC instance反向 mint wire/currentness identity。

---

## 4. Domain Model

一个 Runtime：

```text
0..N business Render Domains
```

M11 author boundary冻结：成功创建的 live business Domains `<= 256`，保证 current business state始终可形成 Frozen Render v1 Registry。

当前 generation 导出的每个 wire Domain：

```text
domainId one-shot within generation
zIndex
0..N ordered roots
recursive keyed nodes
carrier-local revision continuity after baseline
```

Domain不是 Frame；同一个 business Domain可以服务多个 Frame，也可以在 zero active Frame时继续存在。

### 4.1 M11 Frozen Author Projection

M11 exact author seam：

```text
SubsystemScope.createRenderDomain(initialState) → RenderDomain
RenderDomain.replace(state): void
RenderDomain.emit(event): void
RenderDomain.close(): void
```

`RenderManager` 是 SDK internal implementation，不是 public service。Author不观察 domainId/generation/Registry/revision/Snapshot/Patch/carrier/send outcome。

成功 author mutation固定：

```text
validate Frozen Render v1 representability
→ detach caller-owned value
→ atomic local commit
→ synchronous return
```

SDK-minted `domainId` 在一个 Subsystem Runtime instance 内不复用。business Node key 在一个 business RenderDomain lifetime 内采用 stronger one-shot rule：一旦从 authoritative state移除，不得作为 later new Node lifetime重新引入。

---

## 5. Render Update Model

Frozen v1：

```text
render.domains
render.snapshot
render.patch
render.event
```

```text
Registry  → generation-scoped wire Domain lifecycle
Snapshot  → full authoritative baseline/commit
Patch     → strict carrier-local revision incremental commit
Event     → transient presentation impulse + ordering barrier
```

Renderer必须原子应用 authoritative commit，不暴露半更新 Render Store tree。

M13 Web projection不改变这些 wire semantics，也不建立第二份 Render protocol。

---

## 6. Data Profile / Carrier

Render Update运行在：

```text
loomrealm.renderer-data/1
```

当前 Profile静态绑定 Render Update v1。

```text
DataPlane single dispatcher
→ render.* messages
→ Render Store
```

Render implementation不得自己竞争读取 raw Data carrier；Web Projector也不得直接消费 raw carrier。

---

## 7. Fresh Data Carrier / Per-Domain Baseline

fresh current Data carrier：

```text
first Render message = current render.domains
```

Registry 中每个 Domain独立：

```text
unbaselined
→ fresh render.snapshot
→ baselined(R)
→ patch/event
```

不存在 global Render ready。Registry可以在部分 Domain尚未 baseline 时继续变化。

旧 carrier sender cursor/Renderer Patch base不得继承为 fresh carrier authority。

same-generation fresh carrier 不创建新 wire Domain lifecycle。

Web projection只能消费 committed current Store；fresh baseline如何替换/重建 physical WC tree属于 projector realization，不改变 wire identity rule。

---

## 8. Frame Independence

禁止隐式关系：

```text
Frame create  → create Domain
Frame active  → show Domain
Frame suspend → hide Domain
Frame close   → destroy Domain
```

如果业务希望某 Domain与某 Frame同生共死，应由 business代码显式管理，不能升级成 protocol semantics，也不建立 Frame→Domain implicit registry。

WC physical lifecycle同样不得反向创建或销毁 Frame/Domain authority。

---

## 9. Data Independence / Stale Cache

```text
Data carrier retired
    → current Render publication authority ends
    ↛ business Domain destroyed
```

Renderer MAY保留最后合法 Store用于视觉连续性，但此时只可视为：

```text
stale presentation cache
```

它不是：

```text
current authoritative replica
fresh Patch base
Input authority
DataAuthority proof
```

恢复必须使用 fresh Registry + Snapshots。

如果 stale WC tree被产品策略暂时保留，它也只是 stale presentation，不获得新的 Render authority。

---

## 10. Runtime Independence

business Render Domain属于 Subsystem Runtime业务 state的一部分。

Runtime terminal最终释放本 Runtime business Domains/resource；这是 Runtime cleanup，不表示 Frame/Data/WC拥有 Domain lifecycle。

未来新 Runtime通常通过 fresh Data generation建立新的 Render wire universe。

---

## 11. Node Identity

Render node `key` 是 wire Domain-wide logical identity；同一 wire Domain lifetime内 one-shot。

```text
removed published key
→ same key cannot represent later new node lifetime
```

live key保持 stable `tag`。

same-generation reconnect保留该 identity history；fresh generation创建新的 wire universe。

M11 business author boundary使用更强 local invariant：Node key一旦从同一 business RenderDomain lifetime移除，即使尚未 emitted，也不得重新引入。

### 11.1 Web Instance Identity

M13 Web projection进一步要求：

```text
same live RenderNode key
=
same HTMLElement instance
```

因此 Render `move` 必须移动已有 HTMLElement，不得以 remove + recreate替代。`key` 默认保持 projector-private identity，不自动暴露为 DOM `id` / attribute / WC-visible protocol material。

---

## 12. Logical Ordering vs Physical Layout

M11 logical ordering保持：

```text
Domain 内 roots order
children order
Domain zIndex / domainId ordering semantics
```

M13 **不** 为这些 logical facts新增 generic CSS layer/container/stacking abstraction。

Top-level projected roots直接挂到 `document.body`；Projector只维护 projected nodes本身，不创建 per-Domain wrapper、CSS stacking context或自动 `z-index` style。

因此：

```text
LoomRealm owns Render logical state + DOM node projection
Business WC / business CSS owns actual layout / position / stacking realization
```

M13也不新增跨 Subsystem 的 global physical stacking contract。业务如果需要稳定视觉层级，应在自己的 WC/CSS contract中表达，不依赖 LoomRealm生成额外 layer system。

---

## 13. Web Presentation Projection

`tag` 在 Render Core 中继续是 opaque string。

M13 Web projection定义的是 thin mechanical projection：

```text
Render Store
    ↓
package-private committed-change seam
    ↓
Web Projector
    ↓
document.body + business-owned Custom Element instances
```

映射：

```text
key      → stable HTMLElement identity
tag      → Web element construction using business-owned tag semantics
attrs    → Renderer-managed host attributes
data     → receiveRenderData(complete readonly current snapshot)
children → Renderer-managed ordered light DOM
```

Render Core/Renderer不得定义：

```text
known business tag vocabulary
pokemon-map / loom-sprite / loom-text semantics
business component class implementation
business Shadow DOM
business Canvas/WebGL object model
generic visual layer system
```

concrete Custom Elements由 business Web presentation implementation提供；业务 JS通过 browser `customElements`注册，运行时 bootstrap source由 [Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md) 定义。

---

## 14. Projection Read-only Boundary

对每个 projected Element，LoomRealm-managed state包括：

```text
Element instance identity
host tag
Render-managed host attrs
Render data
managed light-DOM children/order
```

业务 WC对这些 state **全部只有读取权**：

```text
WC ✗ mutate Render-managed host attributes
WC ✗ append/remove/reorder managed light-DOM children
WC ✗ mutate delivered Render data
WC ✗ write Render Store / RenderDomain / protocol state
```

WC拥有自己的 private presentation state：

```text
private fields
Shadow DOM
internal DOM
Canvas / WebGL
decoded resource/cache
animation/timer
presentation-local derived state
```

DOM永远不是 source of truth。Renderer不得读取实际 DOM mutation并反向同步到 Render Store。

### 14.1 No Mutation Policing

M13不使用 MutationObserver或其他 policing机制检测/阻止/修复业务 WC 对 managed attrs/light DOM 的违规 mutation。

如果业务违反 contract：

```text
Store remains authoritative
DOM mutation is never adopted back into Store
presentation behavior after the violation is not guaranteed
business-local accidental consequences are not LoomRealm responsibility
```

Phase 1 business presentation scripts是 trusted executable material；M13不建立 hostile-code sandbox。

---

## 15. Children / Composition

`RenderNode.children` 直接对应 ordered light DOM children：

```text
RenderNode.children
→ managed HTMLElement light-DOM child list
```

Renderer Projector拥有 composition mutation。业务 WC可以通过标准 DOM读取 children，并使用标准 Web Component slot composition；LoomRealm不新增 slot protocol。

第一版只投影 keyed RenderNode/Custom Elements，不新增 raw TextNode/CommentNode/HTML fragment model。业务如需文本或其他 primitive，由自己的 WC表达。

WC私有 implementation不得写入或重排 Render-managed light DOM；private subtree应放在 Shadow DOM或其他 component-private state中。

---

## 16. Data / Attr Separation — `receiveRenderData`

`attrs` 与 `data` 是独立 channel：

```text
attrs
= browser-native string attributes

data
= complex structured retained component state
```

Core不自动互映，也不对业务重复字段做 semantic conflict resolution。

M11 wire/Store允许 data顶层 delta，但 WC v1不观察 patch：

```text
wire snapshot / data delta
→ Render Store atomic commit
→ complete current JsonObject
→ readonly full snapshot delivery
→ receiveRenderData(...)
```

M13冻结：

```ts
interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}
```

语义：

```text
optional method
initial projected node receives current full data if implemented
subsequent committed data change receives current full data
missing method = no data delivery, not failure
object identity has no semantic meaning
```

第一版禁止把以下能力提升为 WC contract：

```text
partial data patch callback
JSON Patch
Observable/Proxy/Signal store as LoomRealm contract
WC → data mutation API
```

M13必须保证收到的 data value不能成为 Renderer Store reverse-write capability。detached value + runtime deep-freeze是允许的 implementation mechanics；authority contract的关键是没有任何 WC→Store data write surface。

---

## 17. Store → Projector Committed-change Seam

Web Projector不得直接解释 raw wire。

内部方向固定：

```text
Render wire
→ Renderer Store validate
→ atomic Store commit
→ package-private post-commit notification/effect
→ Web Projector
```

exact private type/name不属于 public architecture，但必须满足：

```text
successful commit only
failed Store mutation → no projection notification
business code cannot subscribe
no new Render authority
```

Projector MAY 对 committed Snapshot/current Store执行基于 authoritative key identity的必要 mechanical reconciliation，以保证：

```text
same live key
→ same HTMLElement instance
```

这不构成第二套 business/Render authority。

---

## 18. Projection Commit Ordering

一次 committed Render state变化的 physical projection顺序固定为：

```text
1. structure
   create / insert / remove / move / managed children

2. attrs
   set / remove managed host attributes

3. data
   receiveRenderData(complete current data)
```

因此 `receiveRenderData(...)` 被调用时，该 element的 managed structure/children与 attrs已经反映同一次 committed Store state。

浏览器 native `connectedCallback` / `attributeChangedCallback` 不是 LoomRealm atomic-commit ABI；业务要观察完整 current Render data时使用 `receiveRenderData(...)`。

---

## 19. Business Presentation Boundary / Startup Config

业务 logical Definition与 Web presentation implementation必须保持 execution/authority separation：

```text
business Definition side
→ @loomrealm/subsystem
→ no Browser/DOM/Renderer/Platform/protocol authority imports

business Web presentation side
→ concrete Custom Element definitions
→ may use Web APIs / Shadow DOM / Canvas / WebGL
→ read-only consumer of LoomRealm projection
```

M13 current runtime source冻结为：

```text
user-selected WebPresentationConfigV1
    scripts[]
    styles[]
→ entire Renderer Window presentation environment
```

配置没有 `subsystems`，不建立 `subsystemKey → scripts/styles` binding。

每个 JS/CSS引用使用 M12 logical Content identity：

```text
namespace + hierarchical resource key
```

Current Desktop从 successful Hostra PREPARE后的 prepared installation唯一 `[FSDB]*` / Content view解析；用户不另行指定 `fsdbRoot`。

正常 browser bootstrap：

```text
validated/resolved presentation resources
→ ordered <link rel="stylesheet">
→ ordered classic <script>
→ business JS customElements.define(...)
→ window.onload
→ Web Projector starts
```

不得把 module path/URL、loader capability或 executable resolver写回 Render tree或业务 Definition作为动态旁路。

---

## 20. Resource References / Content Boundary

Render `data` MAY携 business-defined logical runtime resource reference，但不得携：

```text
filesystem path capability
Content bearer
absolute privileged local URL
resource bytes as hidden capability channel
```

M12 Renderer ResourceClient已负责 logical resource + expected version → version-checked bytes。

Presentation bootstrap resource与 runtime business resource必须区分：

```text
bootstrap JS/CSS
    → WebPresentationConfigV1
    → <link>/<script> before window.onload / projection

runtime resource
    → business Render data / element contract
    → restricted M12 ResourceClient semantics after projection
```

Business WC不得绕过 ResourceClient/Platform credential boundary。Render Core仍不冻结 product-specific resource-reference schema；具体 element如何解释其 data并消费受限 resource capability属于 business presentation contract。

不为此预建 universal AssetManager、loader/decoder registry或 generic Presentation DSL。

---

## 21. Render Event Boundary

Render Event保持 M11 frozen semantics：

```text
ordered
transient
non-authoritative
no replay
may be lost
```

不能作为 persistent correctness唯一来源。

well-formed Event若 Domain/baseline/target不再 applicable：

```text
drop only
```

M11 publication继续保持 current-carrier ordering/barrier/drop规则。

**M13不定义 RenderEvent → WC delivery ABI。** 不新增 `onRenderEvent`、`receiveRenderEvent` 或 DOM `dispatchEvent` mapping。

当前 Web Projector只投影 retained Render state：

```text
tag
attrs
data
children
```

未来真实 presentation consumer若证明必须消费 RenderEvent，再按 demand-driven rule独立设计，不为了协议对称性提前扩张 WC ABI。

---

## 22. Input Boundary

Render focus/component存在不能创造 User Input authority。

User Input ordinary gate仍是：

```text
Main InputTarget(S,F,A)
∩ Interest[F]
∩ Producer(C)
∩ current matching Data connection
```

Business WC可以成为 physical input source implementation的一部分，但必须继续进入 frozen `RendererInputSource` / M10 gate；不得 WC→Data shortcut，也不得因为 element focus改变 Main InputTarget authority。

---

## 23. Failure Boundary

Render v1区分：

```text
representation/schema/limit invalid
    → Data stream fatal

authoritative Registry/Snapshot/Patch continuity invalid
    → Data stream fatal

well-formed stale Event
    → drop
```

M13 presentation failure采用简单两层语义。

### Bootstrap failure

```text
Web Presentation Config invalid
required JS/CSS unresolved/unavailable
stylesheet/script load failure
script evaluation/registration failure
```

```text
→ presentation bootstrap fails
→ Web Projector does not enter running state
```

### Runtime projection/WC failure

```text
projected tag unregistered
receiveRenderData throws
DOM operation failure
WC contract violation
business presentation local exception
```

```text
→ report presentation-local error
→ no Store rollback
→ no Main/Subsystem authority mutation
→ continue best-effort where possible
```

M13不预建复杂 node/domain recovery framework。

---

## 24. Browser Qualification / Cross-platform Presentation

M13必须有真实 browser qualification；Node/fake DOM不足以关闭 Custom Elements/lifecycle/`window.onload`/DOM identity语义。

Current M13 target使用 headless Chromium，至少验证：

```text
WebPresentationConfigV1 validation/resolution
<link> / ordered classic <script>
window.onload ready barrier
customElements registration
Store commit → Projector notification
roots → document.body
snapshot / insert / remove / move
same key → same HTMLElement
attrs projection
receiveRenderData initial/update full snapshots
structure/attrs before receiveRenderData
WC mutation never rewrites Store
WC callback failure does not roll back authority
RenderEvent not delivered as WC/DOM event
```

Hostra/PWA共享 logical Web presentation semantics；physical Content storage和 trusted `href/src` binding可以按平台不同实现，但不得改变 WebPresentationConfigV1、`window.onload` ready barrier、projector/data ABI的 business-observable semantics。

---

## 25. Final Invariants

1. business Render authority在 Subsystem；
2. Renderer只维护 current replica + optional stale presentation cache；
3. Main/Frame不拥有 Render lifecycle；
4. Render wire identity包含 DataAuthority generation；
5. same-generation reconnect不创建新 wire Domain lifecycle；
6. fresh generation创建新的 Render wire universe，但不强制 business Domain销毁；
7. fresh carrier用 Registry + per-Domain fresh Snapshot重建 baseline；
8. Frame close/suspend不隐式 destroy/hide business Domain；
9. Data retire不 destroy business Domain；
10. Node key在 wire Domain lifetime内 one-shot；M11 business boundary使用更强 Domain-lifetime one-shot；
11. same live key在 Web projection中保持同一 HTMLElement instance；
12. M11 logical root/children/Domain ordering保持，但 M13不新增 generic CSS layer/zIndex system；
13. top-level projected roots直接进入 `document.body`；
14. tag对 Render Core保持 opaque；具体 Custom Element semantics由业务拥有；
15. Render-managed attrs/data/children等全部 projection state对 WC只读；M13不做 MutationObserver policing；
16. children是 Renderer-managed ordered light DOM；业务私有 subtree放在 WC private presentation state；
17. data与 attrs独立；WC v1通过 optional `receiveRenderData(complete readonly current data)` 接收完整 snapshot；
18. projection observable order = structure → attrs → receiveRenderData；
19. DOM不是 authority source，Renderer不得从 DOM反向同步 Store；
20. Web Projector不建立第二份 desired presentation tree authority；必要 keyed physical reconciliation不构成第二 authority；
21. Store只在 successful atomic commit后通过 package-private seam通知 Projector；
22. runtime bootstrap source是用户指定的 Window-level WebPresentationConfigV1；没有 subsystems；Desktop用户不单独指定 FSDB；
23. presentation bootstrap使用 ordered `<link>` / classic `<script>`，`window.onload`后才启动 Projector；
24. M13不定义 RenderEvent → WC/DOM event ABI；
25. stale Store/WC tree不是 current authority/Patch base；
26. Render state不携 physical resource capability；Business WC不得绕过 M12 Content credential/version boundary；
27. Render/presentation不能生成 Main InputTarget；
28. presentation-local failure不回滚 Store、不自动 fail Runtime/Frame；
29. M13使用真实 Chromium qualification关闭 browser semantics；
30. M11 Renderer Store internal-only；M13 projection消费 trusted/package-private current Store seam，不新增 business Render Store API。
