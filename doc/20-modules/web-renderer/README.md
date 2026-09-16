# Web 渲染端模块设计

> 层级：模块设计  
> 状态：M8 Data / M10 Input / M11 Render / M12 ResourceClient / M13 Web Presentation **Implemented + Qualified**
> 稳定程度：M13 **Implemented / Qualified / Closed**
> 主要定义：Renderer currentness、per-subsystem Render Store、trusted ResourceClient、M13 package-private reevaluation + Projector placement  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Web Presentation Config v1](../../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-09

---

## 1. Current / Target Shape

```text
@loomrealm/renderer
└── ControlHolder
    ├── current Control peer/snapshot
    ├── per-subsystem Data slots
    │   ├── current RendererDataPeer
    │   ├── M10 Input gate
    │   └── M11 RendererRenderStore
    ├── M12 trusted/private ResourceClient
    └── M13 package-private presentation integration
        ├── authority/Store reevaluation effect
        ├── per-subsystem eligibility
        ├── thin Web Projector
        └── PresentationResourceClient façade

concrete Renderer Window composition
└── Config source + prepared Content selection
    → exact Config/MIME validation
    → private href/src binding
    → ordered JS/CSS
    → window.onload
    → start presentation
```

M13复用现有 authority/currentness facts；DOM/WC existence不 mint authority。

---

## 2. Existing Closed Slices

M11 Store挂在 current Data slot/generation 上，拥有 Registry/baseline/revision/tree/one-shot history；same-generation carrier replacement只重建 baseline。

M12 private ResourceClient提供：

```text
namespace + hierarchical key + expectedContentVersion
→ bytes + MIME + actual contentVersion
```

M13不暴露其 origin/token/path/private object。

---

## 3. M13 Reevaluation Seam

Presentation运行后只有：

```text
A. current Control snapshot sessionId/dataAuthorities change
B. successful current Store domains/snapshot/patch commit
```

```text
Control topology ─┐
                  ├→ private reevaluation → per-subsystem eligibility → Projector
Store facts ──────┘
```

Failed Store mutation / RenderEvent → no projection effect。Business不可订阅。

Implementation可同步或 bounded/coalesced local scheduling；不得新增 EventBus/public observer/topology registry。

---

## 4. Per-subsystem Eligibility / Lifecycle

```text
current Session + DataAuthority
AND matching Data carrier
AND Store currentCarrier
AND registrySeen
AND every current Domain baselined
```

```text
same-generation carrier loss
→ freeze only affected subsystem DOM
→ healthy subsystem continues
→ partial rebaseline hidden
→ complete baseline reconciles once

DataAuthority removed
→ remove subsystem DOM immediately

generation changed
→ retire old elements immediately
→ wait new baseline

fresh Session
→ retire entire old Session universe

Control terminal without committed replacement
→ freeze last presentation
```

No second PresentationState/currentness machine。

---

## 5. Projector

Full identity：

```text
(Session, subsystemKey, generation, domainId, key)
```

Same identity → same HTMLElement。Move/reparent/reorder只 move existing instance；fresh Session/generation必须 fresh element。

Projection：

```text
tag      → business-owned Custom Element
attrs    → managed host attrs
children → managed ordered light DOM
context  → receiveRenderContext
data     → receiveRenderData
```

Managed root order：

```text
subsystemKey lexical
→ zIndex
→ domainId lexical
→ roots
```

不创建 per-Domain wrapper、global layer、CSS z-index synthesis或 layout engine。

---

## 6. Structural Preflight / Failure

每次 reconcile 在首次 managed DOM mutation前，对所有本次需要新建的 tags：

```text
customElements.get(tag) !== undefined
```

任一失败：

```text
zero DOM mutation for reconciliation
preserve previous successful DOM exactly
latch Window structural failure
no future managed DOM mutation in that Window
```

恢复只 fresh Window。Authority/Store可继续前进，但 failed Window不得恢复。

Ordinary callback/resource/DOM failure保持 presentation-local best effort。

---

## 7. WC ABI / Resource Lifetime

新 element：

```text
construct → context → first insertion/structure → attrs → data
```

已有 element：

```text
structure/reorder → attrs → data only when retained JSON value changed
```

Context同一 HTMLElement最多一次；data callback throw不对相同 value retry。

PresentationResourceClient复用 M12 private client。Window teardown：

```text
abort lifetime
→ cancel in-flight reads
→ CONTENT_CANCELLED
→ later well-formed resource() also CONTENT_CANCELLED
```

---

## 8. Bootstrap Ownership

Concrete Window composition拥有：

```text
Config source acquisition
current prepared Content view
private href/src binding
document/Window bootstrap lifecycle
```

Frozen MIME：

```text
scripts = text/javascript essence
styles  = text/css essence
```

`@loomrealm/renderer` MAY提供 pure/private helper，但 M13不新增 universal loader port、`@loomrealm/presentation` package 或 bootstrap state machine。

---

## 9. Public / Package Boundary

M13不得 root-export：

```text
RenderStore
PresentationState
PresentationTopology
PresentationAdapter
RenderNodeIdentity service
Resource credential/resolver
component registry
```

允许的新增 state仅为 package-private implementation mechanics：HTMLElement identity mapping、minimal data-delivery bookkeeping、structural-failure latch、Window resource lifetime controller。

---

## 10. Implementation / Qualification

直接按：

```text
M13_01_WEB_PRESENTATION_BOOTSTRAP.md
→ M13_02_RENDERER_PRESENTATION_SEAM.md
→ M13_03_WEB_PROJECTOR.md
→ M13_04_VERTICAL_INTEGRATION.md
→ M13_05_QUALIFICATION_CLOSURE.md
```

Real Chromium必须覆盖 Session/DataAuthority/generation transitions、per-subsystem reconnect、Custom Element lifecycle、body ordering、unknown-tag zero-mutation preflight、real M12 resource bytes与 Window teardown。

设计已冻结；只有 implementation correctness contradiction 或 real consumer failure允许 reopen。
