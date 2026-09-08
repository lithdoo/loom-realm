# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M11 Render Replication **Frozen / Implemented / Qualified**；M13 Web Presentation **Stabilizing**  
> 主要定义：Subsystem-owned Render authority、Renderer replica、wire-node identity、thin Web projection、deterministic body ordering、presentation authority boundary  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[Render Update v1](../15-contracts/render-update-v1.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

---

## 1. Goal

```text
Subsystem business state
→ authoritative Render Domains
→ Render Update v1
→ Renderer current replica
→ thin Web Projector
→ business-owned Custom Elements
→ local physical presentation
```

M11 关闭 authoritative Render publication/replication；M13 只补 physical Web realization，不重开 M11 wire semantics，也不把 Renderer变成 business authority。

---

## 2. Authority

Subsystem拥有：

```text
business Render Domain lifecycle
Domain desired state / zIndex
Render tree authoritative state
publication intent
Render Event source
```

Renderer拥有：

```text
current authoritative replica
required one-shot identity history
physical Web projection mutation
presentation context injection
optional stale presentation cache after currentness loss
```

Business Web presentation拥有：

```text
concrete tag semantics
Shadow DOM / private DOM
Canvas / WebGL
decoded resource/cache
animation/timers
layout / position / stacking policy
```

Business WC 对 LoomRealm-managed attrs/data/children/order只有读取权。DOM不是 Store authority source。

---

## 3. Render Lifetimes / Currentness

必须区分：

```text
business RenderDomain lifetime
!= wire Domain lifetime
!= Data carrier lifetime
!= HTMLElement lifetime
```

Frozen Render v1 Domain identity：

```text
(Session, subsystemKey, DataAuthority generation, domainId)
```

Node wire identity再加：

```text
key
```

same-generation carrier replacement只重建 carrier-local baseline，不创建新的 wire Domain/Node identity universe。fresh generation建立新的 wire universe；business Domain MAY 跨 generation继续存在并重新导出。

Frame create/active/suspend/close 与 RenderDomain create/show/hide/destroy没有隐式对应关系。

---

## 4. M11 Render Model — Frozen

Author surface：

```text
SubsystemScope.createRenderDomain(initialState)
RenderDomain.replace(state)
RenderDomain.emit(event)
RenderDomain.close()
```

Wire surface：

```text
render.domains
render.snapshot
render.patch
render.event
```

Renderer Store保持 package-internal；M13不新增 public Render Store、subscription、PresentationAdapter或 EventBus。

fresh current carrier必须以 Registry开局，每个 current Domain独立由 fresh Snapshot建立 baseline。failed Snapshot/Patch不得暴露 partial state；Render protocol-fatal只处理 current Data stream，不自动 fail Runtime/Frame。

---

## 5. Node Identity

`RenderNode.key` 只在一个 wire Domain 内唯一。禁止把裸 `key` 当作 Renderer Window-global identity。

M13 Web projection冻结：

```text
same live wire-node identity
(Session, subsystemKey, generation, domainId, key)
→ same HTMLElement instance
```

因此：

```text
move / reparent / root reorder
→ move existing HTMLElement
→ MUST NOT remove + recreate a still-live node
```

不同 Domain/Subsystem/fresh generation可以合法出现相同 `key` 字符串，但必须对应不同 wire-node identity。

Projector private implementation可以使用 composite/nested mapping；这里不新增 public identity DTO/framework。

---

## 6. Store → Projector Boundary

Web Projector不得直接消费 raw Render wire：

```text
Render wire
→ Renderer Store validate
→ atomic successful commit
→ package-private post-commit notification/effect
→ Web Projector
```

要求：

```text
failed Store mutation → no projection notification
business cannot subscribe to the seam
Projector cannot write Store authority
mechanical reconciliation != second desired-tree authority
```

---

## 7. Web Projection Mapping

M13 projection：

```text
wire-node identity → stable HTMLElement
tag                → document.createElement(tag)
attrs              → Renderer-managed host attrs
children           → Renderer-managed ordered light DOM
context            → Web Presentation API optional receiveRenderContext
RenderNode.data    → Web Presentation API optional receiveRenderData
```

`tag` 对 Render Core仍是 opaque string。Concrete Custom Elements由 business Web presentation实现并通过 browser `customElements.define(...)`注册。

M13不定义：

```text
business tag vocabulary
LoomRealm component library
raw TextNode/CommentNode/HTML fragment protocol
generic UI framework / Presentation DSL
```

---

## 8. `document.body` / Deterministic Root Ordering

Top-level projected roots直接成为 `document.body` 的 LoomRealm-managed children；不建立 per-Domain wrapper、generic layer、CSS z-index synthesis 或 layout engine。

M11 `zIndex/domainId` ordering是在一个 Subsystem 的 Render Update scope内冻结的。M13 **不** 将 zIndex升级成跨 Subsystem global stacking contract。

Managed root sequence固定为：

```text
1. subsystemKey encoded UTF-8 lexical ascending
2. within one subsystem: zIndex ascending
3. same zIndex: domainId encoded UTF-8 lexical ascending
4. authoritative roots order
```

Node内部继续保持 authoritative children order。

`subsystemKey` lexical order只是 M13 deterministic physical concatenation，不表达 business stacking authority。Actual visual stacking仍由 business WC/CSS拥有。

任何 ordering变化都只移动仍 live 的 existing root HTMLElements；不得借 reorder重建 node lifetime。

Host/bootstrap 的非业务 presentation DOM不属于 LoomRealm-managed root sequence；业务不得依赖这些节点形成 LoomRealm stacking semantics。

---

## 9. WC Read-only Boundary

LoomRealm-managed state：

```text
HTMLElement identity/tag
host attrs
Render data
managed light-DOM children/order
```

Business WC不得修改这些 state作为业务协议；其 private presentation state应放在 Shadow DOM/Canvas/WebGL/private fields等自有区域。

M13不使用 MutationObserver policing违规 mutation：

```text
Store remains authoritative
DOM mutation is never adopted back into Store
behavior after business contract violation is not guaranteed
```

这不是 hostile-code sandbox。

---

## 10. Web Presentation Config / API

M13把两个不同职责分别放在两个 formal contract：

```text
Web Presentation Config v1
→ Window启动前加载哪些 business JS/CSS

Web Presentation API v1
→ Projector运行后怎样向 business WC交付 context/data/resource capability
```

Config current bootstrap：

```text
prepared Content refs
→ ordered <link>
→ ordered classic <script>
→ customElements.define(...)
→ window.onload
→ start Projector
```

API current receiver：

```text
receiveRenderContext(...)  // Window-lifetime capability, at most once per HTMLElement
receiveRenderData(...)     // retained current data, repeated as committed data changes
```

精确 shape/lifetime/error vocabulary由 formal contracts拥有；本架构文档不复制完整接口定义。

---

## 11. Runtime Resource Boundary

M12 Renderer-private ResourceClient继续拥有：

```text
logical namespace + hierarchical key + expectedContentVersion
→ version-checked bytes
```

M13只在其外提供 Web Presentation API 的 narrow `PresentationResourceClient` façade。Business WC看不到：

```text
origin / installationId / bearer
filesystem path / FSDB
privileged URL / raw Response
Renderer-private ResourceClient
```

M13不冻结统一 RenderNode.data asset-ref schema，不建立 AssetManager、decoder registry、prefetch planner或 dynamic loader。

---

## 12. Observable Projection Ordering

新 HTMLElement：

```text
construct
→ context injection, if implemented
→ first managed insertion / possible connectedCallback
→ structure / managed children
→ attrs
→ data delivery, if implemented
```

已有 HTMLElement commit：

```text
structure / children / root reorder
→ attrs
→ data delivery when required
```

Browser-native lifecycle callback不是 LoomRealm atomic-commit ABI。

---

## 13. RenderEvent / Input Boundary

M13不定义 RenderEvent → WC/DOM ABI；不新增 `receiveRenderEvent`、`onRenderEvent` 或 `dispatchEvent` mapping。

Physical WC/input realization也不能创造 User Input authority。输入必须继续经过 M10 `RendererInputSource` 与 Main InputTarget/Interest/Producer/current Data gate；禁止 WC→Data shortcut。

---

## 14. Failure Boundary

Bootstrap failure：

```text
invalid config/resource
<link>/<script> load/evaluation/registration failure
→ Projector does not enter running state
```

Runtime presentation failure：

```text
unregistered tag
receiver callback throws
PresentationResourceClient rejects
DOM operation failure
business presentation exception
```

```text
→ presentation-local report/rejection
→ no Store rollback
→ no Main/Subsystem authority mutation
→ no automatic Runtime/Frame failure
→ best-effort continuation where possible
```

M13不预建 node/domain/resource recovery framework。

---

## 15. Qualification

M13必须使用真实 headless Chromium，至少证明：

```text
Config validation + ordered bootstrap + load failure detection
window.onload start barrier
business Custom Element registration
Store successful commit → Projector
same live wire-node identity preserves HTMLElement
same key string across Domain/Subsystem does not collide
fresh generation creates fresh wire-node identity
subsystemKey → M11 Domain order → roots deterministic body sequence
reorder moves existing elements
context before first managed insertion; at most once
context/data receiver independence
data initial/update full snapshot
real M12 runtime resource read through PresentationResourceClient
version conflict / cancellation / caller-owned bytes
no credential/path/private-client exposure
WC/resource failure never rolls back authority
DOM mutation never becomes Store state
RenderEvent is not delivered to WC/DOM
```

M13不复制 M11 protocol conformance或 M12 Content internals。

---

## 16. Core Invariants

1. business Render authority在 Subsystem；Renderer只复制并呈现；
2. wire identity包含 `subsystemKey + generation + domainId + key` scope；bare key不是 Window-global identity；
3. same live wire-node identity保持 same HTMLElement；reorder只 move，不 recreate；
4. M11 zIndex/domainId只在 Subsystem scope内有 logical ordering语义；
5. M13 managed body order = `subsystemKey lexical → M11 Domain order → roots`，只是 deterministic physical concatenation；
6. Projector只消费 successful Store commit后的 package-private seam；
7. Projector不建立第二份 Render/projection authority；
8. WC对 attrs/data/managed children只读；DOM不反向同步 Store；
9. Config管理启动资源；Presentation API管理运行时 context/data/resource；
10. M13不建立 component library、Presentation DSL、AssetManager、dynamic loader、global layer manager、public identity framework或 RenderEvent WC ABI。
