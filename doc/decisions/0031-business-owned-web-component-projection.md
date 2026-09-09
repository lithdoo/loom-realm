# ADR 0031：业务拥有 Web Components，LoomRealm 只投影 Render replica

> 状态：Accepted / Frozen for M13 implementation  
> 日期：2026-09-08  
> 最近复核：2026-09-09  
> 层级：架构决策记录  
> 决策范围：M13 Web Presentation bootstrap、authority/currentness、thin Web projection、local WC ABI、runtime resource capability、failure closure  
> 正式化：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  

---

## 1. Context

M11 已关闭：

```text
Subsystem authoritative Render Domains
→ Render Update v1
→ Renderer current authoritative replica
```

M13 只关闭 replica → physical Web presentation，不重开 Render protocol，也不预建 UI framework、scene graph、layer system、AssetManager 或 component plugin framework。

---

## 2. Decision / Authority

```text
Main / Renderer Control snapshot
    owns current Session + DataAuthority topology

Subsystem
    owns business Render authority

Renderer Store
    owns current per-subsystem authoritative replica

Web Projector
    reads current topology + eligible Store facts
    exclusively mutates LoomRealm-managed DOM
    injects presentation context

Business Web presentation
    owns concrete Custom Element semantics
    owns Shadow DOM / Canvas / WebGL / private presentation state
```

DOM永远不是 Store/Main authority source。M13不创建第二份 presentation topology、desired tree authority或 public currentness state。

---

## 3. Window Bootstrap

使用独立 Window-level `WebPresentationConfigV1`：

```text
product/platform-private config acquisition
→ fail-closed validation
→ current prepared M12 Content refs
→ exact MIME check
→ private href/src binding
→ ordered <link rel="stylesheet">
→ ordered classic <script>
→ business customElements.define(...)
→ window.onload
→ start presentation once
```

Frozen MIME：

```text
scripts MIME essence = text/javascript
styles  MIME essence = text/css
```

Config source/path/handle、prepared Content physical binding 与 document lifecycle属于 concrete app/Renderer Window composition，不进入 Game Entry、Launch Manifest、LogicalGameBootstrap、Main 或 RenderNode。

M13不建立 ESM/Blob module graph、dynamic loader、PluginManager或 second registry。

---

## 4. Presentation Reevaluation

Presentation运行后只有两类 production reevaluation source：

```text
committed/fresh current Renderer Control snapshot
→ Session/DataAuthority topology change

successful current Render Store commit
→ render.domains / render.snapshot / render.patch
```

Failed Store mutation与 `render.event` 不触发 projection。

该 seam package-private；business不能订阅。Implementation MAY 同步执行或 bounded/coalesced local scheduling，但不得引入 EventBus/ObserverHub/history queue。

---

## 5. Identity / Currentness

完整 live identity：

```text
(Session, subsystemKey, generation, domainId, key)
```

```text
same live identity → same HTMLElement
```

Move/reparent/reorder只移动 existing element。Fresh Session 或 fresh generation结束旧 HTMLElement universe，即使 textual ids相同也不复用。

Per-subsystem eligibility：

```text
committed DataAuthority exists
AND matching current carrier
AND Store currentCarrier
AND registrySeen
AND every current Domain baselined
```

Same-generation carrier loss只冻结受影响 subsystem 的 last successful DOM；healthy subsystem可继续 projection。Partial rebaseline不泄漏；complete baseline后 reconcile一次。

Committed DataAuthority removal立即移除该 subsystem DOM，不等待未来 Render commit。Generation change立即 retire旧 DOM，再等待新 generation baseline。

Control transport terminal若没有 committed replacement snapshot，只冻结 last presentation，不解释成 empty authority。

---

## 6. Projection Mapping / Ordering

```text
RenderNode.tag      → document.createElement(tag)
RenderNode.attrs    → managed host attrs
RenderNode.children → managed ordered light DOM
RenderNode.data     → receiveRenderData
context             → receiveRenderContext
```

Top-level managed body order：

```text
subsystemKey UTF-8 lexical
→ within subsystem: zIndex ascending
→ same zIndex: domainId UTF-8 lexical
→ roots order
```

这只是 deterministic concatenation，不产生 global z-index/layout authority。Business WC/CSS继续拥有 layout/stacking。

Business WC 对 managed attrs/data/light DOM只读；Renderer不从 DOM reverse-sync Store，也不使用 MutationObserver policing。

---

## 7. WC ABI / Resource

一个 `Web Presentation API v1`，两个独立 optional receiver：

```text
receiveRenderContext
→ Window-lifetime capability
→ before first managed insertion
→ at most once

receiveRenderData
→ current full retained data
→ initial + only when retained JSON value changes
```

Context只暴露 narrow `PresentationResourceClient`；不暴露 Content token/path/FSDB/privileged URL/private Renderer client。

Window teardown终止 resource capability、取消在途 reads；teardown 后格式正确的 `resource()` 调用 reject `CONTENT_CANCELLED`。

M13不冻结统一 RenderNode asset-ref schema，不建立 AssetManager/decoder registry/prefetch graph。

---

## 8. Structural Failure

Unregistered tag必须在本次 reconciliation 首次 DOM mutation前对所有 newly-required tags预检。

```text
unknown required tag
→ zero mutation for this reconciliation
→ preserve last successful managed DOM exactly
→ no fallback / no late-registration wait
→ latch Window-local structural failure
→ no future LoomRealm-managed DOM mutation in this Window
```

恢复只通过 fresh Window。Authority/Store仍可前进；failed DOM不得自行恢复。

Ordinary receiver/resource/DOM failure保持 presentation-local best effort；所有 presentation failure都不 rollback Store、不 mutate Main/Subsystem、不自动 fail Runtime/Frame。

---

## 9. Consequences

保留：

```text
M11 Render authority/protocol unchanged
M12 Content identity/version/credential boundary reused
one Control topology authority
one per-subsystem Render replica authority
thin package-private Projector
business-owned concrete Web presentation
real Chromium qualification
```

明确拒绝：

```text
@loomrealm/presentation package for symmetry
PresentationStore / topology registry / public currentness
public RenderNodeIdentity service
component registry / loader / PluginManager
AssetManager / decoder registry
Presentation DSL / scene graph
layer/layout engine
global service locator
DOM transaction/rollback framework
MutationObserver policing
RenderEvent WC ABI
```

---

## 10. Freeze / Reopen

M13 设计已 Preimplementation Closed。实施阶段只允许在 formal contracts 与本 ADR 范围内选择 private data structure、文件拆分、同步/有限 coalescing 等非 observable mechanics。

只有 demonstrated correctness/security contradiction、cross-contract conflict 或真实 consumer capability failure 才允许 reopen；API symmetry、目录对称、测试便利或未来猜测不构成 reopen 理由。
