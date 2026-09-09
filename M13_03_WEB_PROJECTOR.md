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

因此：

```text
move/reparent/reorder → move existing element
different Domain/Subsystem → distinct element
fresh generation → fresh element
```

不得使用 `Map<key, HTMLElement>`，也不新增 public `RenderNodeIdentity` DTO/service。

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

M13/02 中暂时 ineligible 的 same-generation subsystem保留其最后成功 reconcile 的 elements；健康 subsystem更新只能移动/插入自身 current roots，不得通过全局重建导致 frozen elements detach/recreate。

---

## 3. Structural Preflight Before DOM Mutation

Formal API要求 unregistered tag structural failure保留“last successfully reconciled managed DOM”。因此每次 reconciliation 在首次 managed DOM mutation前必须先检查所有**本次需要新建**的 element：

```text
derive current mechanical reconciliation
→ collect new live identities
→ for every required new node tag:
     customElements.get(tag) !== undefined
→ all pass
→ begin DOM mutation
```

任一 required tag未注册：

```text
→ report Window-local structural failure
→ zero LoomRealm-managed DOM mutation for this reconciliation
→ create no unknown fallback element
→ wait for no late registration
→ latch stop of all future LoomRealm-managed DOM mutation in this Window
→ preserve previous successfully reconciled managed DOM exactly
```

这里的 preflight只是 current reconciliation 的 side-effect-free检查；不建立 component registry、transaction framework或 DOM rollback system。

---

## 4. New Element Order

```text
construct
→ receiveRenderContext(...), if implemented
→ first managed insertion / structure
→ attrs
→ receiveRenderData(...), if implemented
```

`receiveRenderContext` 对同一 HTMLElement最多一次；throw也算一次 attempt，不自动重试。

`connectedCallback()` 只可依赖 context 已在首次 managed insertion 前注入；不得假设 attrs/children/data 已 ready。

---

## 5. Existing Element Update / Data Delivery

已有 element：

```text
structure / children / root reorder
→ attrs
→ receiveRenderData(...), only when delivery is required
```

Existing live element不得因为 reorder 或 same-generation reconnect被 recreate。

`receiveRenderData`：

```text
initial materialization
→ attempt current full retained data once

later committed state
→ attempt again only when retained data value changed
```

不得按 object identity判断 data change；实现 MAY 对 current frozen JSON 与该 element 上一次 attempted delivery value做结构比较或等价 deterministic判断。

Callback throw仍记录为该 value 的一次 delivery attempt；后续无 data change 的 commit不得形成自动 retry loop。

这个 bounded per-live-element delivery bookkeeping只记录 receiver delivery，不是第二份 Render authority。

---

## 6. Presentation Resource Façade / Window Lifetime

Business WC只通过 `WebPresentationContext.resources` 获得 narrow readonly capability：

```text
namespace + key + expectedContentVersion + optional AbortSignal
→ caller-owned bytes + MIME + actual contentVersion
```

实现直接复用 M12 Renderer-private ResourceClient，并映射稳定错误码：

```text
CONTENT_NOT_FOUND
CONTENT_CONFLICT
CONTENT_INVALID
CONTENT_UNAVAILABLE
CONTENT_CANCELLED
```

Presentation context/resource capability lifetime = Renderer Window presentation lifetime。

```text
Window presentation start
→ create/use one private lifetime AbortSignal
→ underlying M12 ResourceClient uses that lifetime

Window teardown
→ abort lifetime
→ cancel all in-flight presentation resource reads
→ future façade reads reject CONTENT_CANCELLED
```

业务 caller-provided AbortSignal继续只取消其单次 read。

不得暴露：

```text
origin / installationId / token
filesystem path / FSDB
privileged URL / raw Response
private ResourceClient
platform resolver
```

不增加第二份 cache、decoder registry、AssetManager 或 dynamic loader。

---

## 7. Read-only Boundary

Business WC不得把以下内容写回 LoomRealm authority：

```text
managed host attrs
managed light-DOM children/order
Render data
Renderer Store
```

业务可自由拥有：

```text
private fields
Shadow DOM
Canvas / WebGL
decoded resources / cache
animation / timers
business layout state
```

Renderer不从 DOM reverse-sync Store，也不使用 MutationObserver policing。

---

## 8. Failure Boundary

普通 context/data/resource/DOM failure：

```text
report presentation-local error
no Store rollback
no Main/Subsystem mutation
no Runtime/Frame failure
continue best-effort projection where possible
```

Structural unregistered-tag failure遵循 §3 的更强 fail-closed规则，并停止该 Window 后续 managed DOM mutation。恢复使用 fresh Renderer Window/bootstrap；不公开新的 `PresentationState` authority。

M13不定义 RenderEvent → WC/DOM ABI。

---

## 9. Minimal Implementation Shape

Projector与 façade保持 `@loomrealm/renderer` trusted/package-private ownership；具体文件名可按代码大小决定。

允许的私有 state只包括真实 projection mechanics所需：

```text
live wire identity → HTMLElement mapping
minimal last-attempted data delivery bookkeeping
Window-local structural-failure latch
Window presentation resource lifetime AbortController/signal
```

禁止新增：

```text
@loomrealm/presentation
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

## 10. Tests

必须覆盖：

```text
same live identity preserves HTMLElement
same key across Domain/Subsystem does not collide
move/reorder preserves element identity
fresh generation creates fresh element
managed body order deterministic
unregistered new tag is detected before any DOM mutation
structural failure preserves previous DOM exactly
context before first insertion and at most once
context/data receivers independent
initial data is delivered once
attrs/order-only commits with unchanged data do not redeliver
changed data delivers full current snapshot
throwing data receiver is not retried without a new data value
PresentationResourceClient maps M12 bytes/errors correctly
returned bytes are caller-owned
Window teardown cancels in-flight reads and disables future reads
credential/path/private client not exposed
callback/resource failure does not rollback authority
RenderEvent is not delivered to WC/DOM
```

Browser lifecycle/HTMLElement/teardown evidence由 M13/04 real Chromium vertical关闭。

---

## 11. Frozen Closure

M13/03 complete when：

```text
DOM is a mechanical projection of M13/02 authoritative/current facts
wire identity maps stably to HTMLElement identity
structural preflight prevents partial DOM mutation on unknown tag
business WC receives only context/data/resource capabilities defined by v1
resource lifetime terminates with Window presentation lifetime
presentation failures remain Window-local
no UI/layout/loader/store/rollback abstraction is introduced
```
