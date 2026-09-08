# M13 / 03 — Thin Web Projector + Presentation API

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M13 Web Presentation  
> 落地顺序：03  
> 最近复核：2026-09-09  
> 前置：[M13 / 01](M13_01_WEB_PRESENTATION_BOOTSTRAP.md) → [M13 / 02](M13_02_RENDERER_PRESENTATION_SEAM.md)  
> 正式契约：[Web Presentation API v1](doc/15-contracts/web-presentation-api-v1.md)  
> 冻结决策：[ADR 0031](doc/decisions/0031-business-owned-web-component-projection.md)  
> 目标：把 eligible Renderer Store机械投影为 business-owned Custom Elements，并提供最窄 context/data/resource ABI；不建立 UI framework、layout system 或第二份 Render authority。

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

---

## 3. New Element Order

```text
construct
→ receiveRenderContext(...), if implemented
→ first managed insertion / structure
→ attrs
→ receiveRenderData(...), if implemented
```

`receiveRenderContext` 对同一 HTMLElement最多一次；throw 也算一次 attempt，不自动重试。

`connectedCallback()` 只可依赖 context 已在首次 managed insertion 前注入；不得假设 attrs/children/data 已 ready。

---

## 4. Existing Element Update

```text
structure / children / root reorder
→ attrs
→ receiveRenderData(...), only when current data delivery is required
```

Existing live element不得因为 reorder 或 same-generation reconnect被 recreate。

`receiveRenderData` 始终交付 current full retained data，不暴露 wire partial patch。

---

## 5. Presentation Resource Façade

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

## 6. Read-only Boundary

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

## 7. Failure Boundary

普通 context/data/resource failure：

```text
report presentation-local error
no Store rollback
no Main/Subsystem mutation
no Runtime/Frame failure
continue best-effort projection where possible
```

Unregistered `RenderNode.tag` 是 structural failure：

```text
customElements.get(tag) === undefined
→ report failure
→ do not create unknown fallback element
→ do not wait for late registration
→ stop further LoomRealm-managed DOM mutation for this Window
→ preserve last successfully reconciled managed DOM
```

恢复使用 fresh Renderer Window/bootstrap；不公开新的 `PresentationState` authority。

M13不定义 RenderEvent → WC/DOM ABI。

---

## 8. Minimal Implementation Shape

Projector与 façade保持 `@loomrealm/renderer` trusted/package-private ownership；具体文件名可按代码大小决定。

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
```

---

## 9. Tests

必须覆盖：

```text
same live identity preserves HTMLElement
same key across Domain/Subsystem does not collide
move/reorder preserves element identity
fresh generation creates fresh element
managed body order deterministic
context before first insertion and at most once
context/data receivers independent
initial/update data are full snapshots
PresentationResourceClient maps M12 bytes/errors correctly
returned bytes are caller-owned
credential/path/private client not exposed
callback/resource failure does not rollback authority
unregistered tag freezes further managed DOM mutation
RenderEvent is not delivered to WC/DOM
```

Browser lifecycle/HTMLElement evidence由 M13/04 real Chromium vertical关闭。

---

## 10. Frozen Closure

M13/03 complete when：

```text
DOM is a mechanical projection of eligible Store state
wire identity maps stably to HTMLElement identity
business WC receives only context/data/resource capabilities defined by v1
presentation failures remain Window-local
no UI/layout/loader/store abstraction is introduced
```
