# M13 / 03 — Thin Web Projector + Presentation API

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M13 Web Presentation  
> 落地顺序：03  
> 最近复核：2026-09-09  
> 前置：[M13 / 01](M13_01_WEB_PRESENTATION_BOOTSTRAP.md) → [M13 / 02](M13_02_RENDERER_PRESENTATION_SEAM.md)  
> 正式契约：[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：把 presentation-eligible Renderer state机械投影为 business-owned Custom Elements，并提供最窄 context/data/resource ABI；不建立 UI framework、layout system 或第二份 Render authority。

> **Web Projector 只拥有 LoomRealm-managed DOM mutation；业务拥有 Custom Element 实现、Shadow DOM/Canvas/WebGL 与私有 presentation state。**

---

## 1. Identity

Logical live wire-node identity：

```text
(Session, subsystemKey, generation, domainId, key)
```

Frozen rule：

```text
same live wire-node identity
→ same HTMLElement instance
```

Move/reparent/reorder只移动 existing element；different Session/Domain/Subsystem 或 fresh generation对应 distinct/fresh element。不得使用 `Map<key, HTMLElement>`，也不新增 public `RenderNodeIdentity` DTO/service。

---

## 2. Mechanical Mapping

```text
RenderNode.tag      → document.createElement(tag)
RenderNode.attrs    → managed host attributes
RenderNode.children → managed ordered light DOM
RenderNode.data     → optional receiveRenderData(full current data)
context             → optional receiveRenderContext(...)
```

Top-level roots直接进入 `document.body` 的 LoomRealm-managed sequence；不创建 per-Domain wrapper。

Managed body order：

```text
subsystemKey UTF-8 lexical ascending
→ zIndex ascending within subsystem
→ domainId UTF-8 lexical ascending
→ authoritative roots order
```

该顺序只保证 deterministic physical concatenation，不定义 cross-Subsystem global z-index/stacking authority。

M13/02 暂时 ineligible 的 same-generation subsystem保留其最后成功 reconcile 的 elements；健康 subsystem更新不得通过全局重建导致 frozen elements detach/recreate。

---

## 3. Structural Preflight

每次 reconciliation 在首次 managed DOM mutation前检查所有本次需要新建的 element tags：

```text
derive reconciliation
→ collect new live identities
→ customElements.get(tag) for every required new node
→ all pass
→ begin DOM mutation
```

任一 tag未注册：

```text
→ report Window-local structural failure
→ zero managed DOM mutation for this reconciliation
→ no unknown fallback / no late-registration recovery
→ preserve previous successful managed DOM exactly
→ stop all future LoomRealm-managed DOM mutation in this Window
```

Preflight只是 side-effect-free检查；不建立 component registry、transaction或 rollback framework。恢复只通过 fresh Renderer Window/bootstrap。

---

## 4. Receiver Ordering / Data Delivery

新 element：

```text
construct
→ receiveRenderContext(...), if implemented
→ first managed insertion / structure
→ attrs
→ receiveRenderData(...), if implemented
```

Context同一 HTMLElement最多一次；throw也计为一次 attempt，不自动 retry。`connectedCallback()`不得假设 initial attrs/children/data ready。

已有 element：

```text
structure / children / root reorder
→ attrs
→ receiveRenderData(...), only when retained JSON value changed
```

Data change语义完全遵循 formal API §3：object member order无语义，array order有语义，递归按 JSON value比较。实现 MAY 使用任何等价 deterministic private mechanics；不得以 JS object identity 或 property insertion order决定 callback。

Callback throw仍计为该 structural value 的一次 delivery attempt；无 data change 的 commit不得形成 retry loop。

---

## 5. Presentation Resource Façade / Window Lifetime

Business WC只通过 `WebPresentationContext.resources` 获得 narrow readonly capability：

```text
namespace + key + expectedContentVersion + optional AbortSignal
→ caller-owned bytes + MIME + actual contentVersion
```

直接复用 M12 Renderer-private ResourceClient并映射 formal API error vocabulary。Window presentation teardown：

```text
abort lifetime
→ cancel in-flight reads
→ affected callers CONTENT_CANCELLED
→ future well-formed façade reads CONTENT_CANCELLED
```

不得暴露 origin/installationId/token/path/FSDB/privileged URL/raw Response/private ResourceClient/platform resolver；不增加第二份 cache、AssetManager、decoder registry或 dynamic loader。

---

## 6. Read-only / Failure Boundary

Business WC对 managed attrs/data/light-DOM children/order只有读取权；可拥有 Shadow DOM、Canvas/WebGL、private fields/cache/animation/layout。Renderer不从 DOM reverse-sync Store，也不使用 MutationObserver policing。

普通 context/data/resource/DOM failure保持 presentation-local best effort：不 rollback Store、不 mutate Main/Subsystem、不自动 fail Runtime/Frame。Structural unknown-tag failure遵循 §3 的更强 fail-closed规则。

M13不定义 RenderEvent → WC/DOM ABI。

---

## 7. Minimal Implementation Shape

Projector与 façade保持 `@loomrealm/renderer` trusted/package-private ownership。允许的私有 mechanics只有：

```text
live wire identity → HTMLElement mapping
minimal receiver-delivery bookkeeping
Window-local structural-failure latch
Window presentation resource lifetime AbortController/signal
```

Formal API 是 structural ABI；M13 **不要求**新增 public `@loomrealm/presentation` package、presentation author SDK或 type-only subpath。Qualification business elements可按 structural shape实现；M14 若真实 author ergonomics证明需要，再最小 reopen type packaging。

禁止新增：

```text
PresentationAdapter framework
component registry
scene graph / DSL
layer manager
public Render Store subscription
global Window service locator
mandatory base CustomElement class
DOM transaction/rollback framework
```

---

## 8. Tests / Closure

必须覆盖：

```text
same live identity preserves HTMLElement
fresh Session/generation never reuse old HTMLElement
same key across Domain/Subsystem does not collide
move/reorder preserves element identity
managed body order deterministic
unknown tag preflight → zero mutation + permanent Window freeze
context before first insertion / at most once
object member reorder does not redeliver data
array/value change does redeliver full data
attrs/order-only commits with structurally equal data do not redeliver
throwing receiver is not retried for same structural value
PresentationResourceClient maps M12 bytes/errors correctly
Window teardown cancels in-flight reads and disables future reads
credential/path/private client not exposed
callback/resource failure does not rollback authority
RenderEvent is not delivered to WC/DOM
```

Browser lifecycle/HTMLElement/teardown evidence由 M13/04 real Chromium vertical关闭。

M13/03 complete when DOM仍是 M13/02 authoritative/current facts 的 mechanical projection，并且上述 identity/receiver/resource/failure semantics全部成立，未引入 UI/layout/loader/store/rollback/public author-package abstraction。
