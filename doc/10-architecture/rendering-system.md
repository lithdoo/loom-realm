# 渲染系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M11 Render Replication **Frozen / Implemented / Qualified**；M13 Web Presentation **Frozen / Preimplementation Closed**  
> 主要定义：Subsystem Render authority、Renderer replica、Session/DataAuthority currentness、wire-node identity、thin Web projection、deterministic body ordering  
> 依赖：[系统架构总览](./system-overview.md)  
> 正式化：[Render Update v1](../15-contracts/render-update-v1.md)、[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)  
> 决策：[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-09

---

## 1. Authority

```text
Subsystem
    business RenderDomain lifecycle/state
    authoritative Render tree

Main / Renderer Control snapshot
    current Session + DataAuthority topology

Renderer Store
    current per-subsystem authoritative Render replica
    generation-scoped one-shot identity history

Web Projector
    mechanical physical DOM mutation only
    presentation context injection

Business WC
    concrete tag semantics
    Shadow DOM / Canvas / WebGL / layout/private presentation state
```

DOM不是 Store source；Projector不是第二份 desired Render authority。

---

## 2. Render / Presentation Lifetimes

必须区分：

```text
business RenderDomain lifetime
!= wire Domain lifetime
!= Data carrier lifetime
!= HTMLElement lifetime
```

Wire Domain identity：

```text
(Session, subsystemKey, generation, domainId)
```

Node identity再加 `key`：

```text
(Session, subsystemKey, generation, domainId, key)
```

Same-generation carrier replacement只重建 carrier-local baseline，不创建新 wire identity universe。Fresh generation / fresh Session建立 fresh universe。

---

## 3. M11 Store — Frozen

```text
render.domains
→ atomic Registry replacement

render.snapshot / render.patch
→ validate isolated candidate
→ atomic authoritative commit

render.event
→ transient trace only
```

Failed authoritative mutation不修改 current Store。Fresh carrier先 Registry，再为每个 current Domain建立 fresh baseline。M13不修改这些 semantics，也不新增 public Store/subscription。

---

## 4. M13 Reevaluation Boundary

Projector不得直接消费 raw Render wire。Presentation运行后 only production triggers：

```text
A. current Renderer Control snapshot committed/fresh
   → sessionId / dataAuthorities topology change

B. successful current Renderer Store commit
   → domains / snapshot / patch
```

概念路径：

```text
current Control Session/DataAuthority ─┐
                                      ├→ package-private reevaluation
current per-subsystem Store ──────────┘
                                               ↓
                                     per-subsystem eligibility
                                               ↓
                                         Web Projector
```

Failed Store mutation与 RenderEvent不触发 projection。Business不可订阅该 seam。

---

## 5. Per-subsystem Currentness

Current `(sessionId, subsystemKey, generation)` presentation-eligible iff：

```text
committed DataAuthority exists
AND matching current Data carrier
AND Store currentCarrier
AND registrySeen
AND every Domain in current Registry baselined
```

Registry为空时 Registry commit即 complete baseline。

### Same-generation carrier loss

```text
Control仍声明 same identity
→ preserve/freeze only affected subsystem last successful DOM
→ no receiver callback caused by loss
→ no detach/reinsert
```

Partial rebaseline不泄漏；complete baseline后 reconcile一次。其他 healthy subsystem可以继续 projection。

### Control transport loss

Local Control terminal若没有 committed replacement snapshot：

```text
→ preserve/freeze last managed presentation
→ do not invent empty Session/DataAuthority topology
```

---

## 6. Authoritative Topology Change

```text
fresh Session
→ retire/remove entire old Session element universe
→ new Session waits current carriers/baselines

DataAuthority removed
→ remove that subsystem managed DOM immediately
→ no future Render commit required

generation changed
→ retire/remove old generation DOM immediately
→ wait new matching carrier + complete baseline
```

Topology仍只由 current Control snapshot拥有；Presentation不得复制成独立 registry。

---

## 7. Identity / Mechanical Projection

Frozen：

```text
same live wire-node identity → same HTMLElement
```

Move/reparent/reorder只移动 existing instance。Different Session/Subsystem/Domain/fresh generation即使 textual key相同也不是同一 element。

Projection：

```text
tag      → document.createElement(tag)
attrs    → managed host attrs
children → managed ordered light DOM
data     → receiveRenderData full current data
context  → receiveRenderContext
```

Business WC 对 managed attrs/data/children/order只读；DOM mutation永不 adopt 回 Store。

---

## 8. Managed Body Ordering

Top-level roots直接进入 `document.body` 的 LoomRealm-managed sequence；不创建 per-Domain wrapper。

```text
subsystemKey UTF-8 lexical ascending
→ within subsystem: zIndex ascending
→ same zIndex: domainId UTF-8 lexical ascending
→ roots order
```

M11 `zIndex/domainId`只定义 Subsystem 内 logical order；M13 的 `subsystemKey` 只提供 deterministic physical concatenation，不定义 cross-Subsystem visual stacking。Actual layout/stacking属于 business WC/CSS。

Frozen subsystem element不得因为其他 subsystem更新被 detach/recreate。

---

## 9. Bootstrap / API

Config v1负责：

```text
Window-level scripts/styles
prepared Content
script MIME essence = text/javascript
style MIME essence = text/css
ordered browser bootstrap
window.onload start barrier
```

API v1负责：

```text
receiveRenderContext
receiveRenderData
PresentationResourceClient
Session/DataAuthority/currentness browser-observable semantics
Window resource lifetime
```

Config source与 private href/src binding属于 concrete app/Renderer Window composition。

---

## 10. Receiver / Resource Rules

新 element：

```text
construct → context → first insertion/structure → attrs → data
```

已有 element：

```text
structure/reorder → attrs → data only when retained JSON value changed
```

Context同一 HTMLElement最多一次。Data callback throw不导致同一 value retry。

PresentationResourceClient复用 M12 private ResourceClient；business看不到 bearer/path/origin/private client。Window teardown取消在途 reads；teardown 后格式正确的 read reject `CONTENT_CANCELLED`。

---

## 11. Structural / Ordinary Failure

所有本次需要新建的 tags MUST 在首次 DOM mutation前 preflight。

```text
unregistered tag
→ zero mutation for reconciliation
→ preserve last successful DOM exactly
→ latch no-further-managed-DOM-mutation for this Window
→ recovery only via fresh Window
```

Latch后 authority/Store可以变化，但 failed Window physical DOM保持 frozen。

Receiver/resource/ordinary DOM failure保持 presentation-local best effort。任何 presentation failure都不 rollback Store、不 mutate Main/Subsystem、不自动 fail Runtime/Frame。

M13不定义 RenderEvent → WC/DOM ABI。

---

## 12. Qualification / Core Invariants

Real Chromium必须证明 bootstrap、Custom Element lifecycle、full identity、Session/DataAuthority/generation transitions、per-subsystem reconnect、body ordering、tag preflight、resource bytes/teardown 与 failure isolation。

Core invariants：

1. Subsystem owns Render authority；Control owns Session/DataAuthority topology；Store owns per-subsystem replica；
2. Projector只机械读取 existing authority/currentness facts；
3. same full live identity保持 same HTMLElement；fresh Session/generation不复用；
4. same-generation transport loss只冻结受影响 subsystem；
5. partial rebaseline不泄漏；
6. deterministic body order不产生 global layout authority；
7. DOM不 reverse-sync Store；
8. structural failure fail-closed且 permanently freezes failed Window；
9. M13不建立 second Store/topology、public PresentationState、component loader/registry、AssetManager、layout/layer framework或 RenderEvent WC ABI。

M13 设计已冻结；实施期间只允许选择不改变上述 observable semantics 的 private mechanics。
