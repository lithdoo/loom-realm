# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M10–M12 closed；M13 Web Presentation **Frozen / Preimplementation Closed**  
> 主要定义：logical roles、bootstrap boundary、authority/currentness、Render/Web presentation placement、Platform composition  
> 依赖：[产品设计总览](../00-overview/product-vision.md)、[文档治理](../00-overview/document-governance.md)  
> 细化：[平台组合系统](./platform-composition-system.md)、[渲染系统](./rendering-system.md)  
> 相关：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-09

本文只描述 system-level responsibility / authority / topology。精确 browser/ABI/currentness semantics由 formal contracts拥有。

---

## 1. Logical Roles

```text
Game Package
    logical Game Entry

Platform Launcher
    executable binding + PREPARE
    PlatformLaunchPlan + LogicalGameBootstrap

Main
    Session / Runtime / Frame / Stack / Activation
    InputTarget / DataAuthority / failure unwind

Subsystem Runtime
    business state
    Input Interest
    authoritative Render Domains
    author-facing ContentClient

Renderer
    read-only Main authority mirror
    per-subsystem Data consumers
    Input producer gate
    current Render replicas
    thin physical Web projection

Readonly Content Service
    logical readonly Content bytes

Business Web presentation
    concrete Custom Elements
    Shadow DOM / Canvas / WebGL / layout/private state
```

一个 authority只有一个 owner；physical Platform/DOM ownership不会产生第二份 application authority。

---

## 2. Bootstrap Boundaries

Runtime executable bootstrap：

```text
installation/source
→ matching Platform Launcher PREPARE
→ Game Entry + Platform manifest join
→ executable/capability preflight
→ PlatformLaunchPlan
→ LogicalGameBootstrap
→ RuntimeHosting
```

Web presentation bootstrap独立：

```text
product/platform-private Config source
→ WebPresentationConfigV1 validation
→ current prepared Content refs
→ private browser binding
→ ordered business JS/CSS
→ window.onload
→ start presentation once
```

因此：

```text
Game topology != executable binding != Web presentation bootstrap
```

Config source、prepared Content selection、private `href/src` binding、Window/document lifecycle属于 concrete `apps/*` composition，不进入 Main、Frame、RenderNode或 Launcher logical ABI。

---

## 3. Main / Renderer Authority

Main唯一拥有：

```text
Session
Runtime lifecycle
Frame/Stack/Activation
InputTarget
DataAuthority generation/profile
failure unwind
```

Main向 Renderer发布 committed authority snapshot。对 Web presentation，current Control snapshot唯一决定：

```text
current Session
current subsystemKey + DataAuthority generation topology
```

Renderer不得复制出第二份 presentation topology authority。

---

## 4. Renderer Data / Input / Render

Current Data identity：

```text
Session + current Renderer + subsystemKey + generation
```

Data loss != Runtime/Frame failure。Same generation/profile可 reconnect；profile change需要 fresh generation。

Input继续受：

```text
current Data
∧ Main InputTarget
∧ active Activation
∧ Subsystem Interest
∧ physical Producer
```

Render：

```text
Subsystem authoritative Render Domains
→ Render Update v1
→ per-subsystem Renderer Store
```

Wire node identity：

```text
(Session, subsystemKey, generation, domainId, key)
```

---

## 5. M13 Web Presentation — Frozen Design

M13关闭：

```text
Window bootstrap
→ presentation start
→ current Control Session/DataAuthority facts ─┐
                                               ├→ package-private reevaluation
→ current per-subsystem Renderer Store ───────┘
                                                     ↓
                                           per-subsystem eligibility
                                                     ↓
                                               thin Projector
                                                     ↓
                                     document.body / business WC
```

Production reevaluation只有：

```text
committed/fresh current Control snapshot
successful current Store domains/snapshot/patch commit
```

Failed Store mutation与 RenderEvent不触发 Web projection。

---

## 6. Presentation Currentness

Per-subsystem eligibility：

```text
committed DataAuthority exists
AND matching current Data carrier
AND Store currentCarrier
AND registrySeen
AND every current Domain baselined
```

```text
same-generation carrier loss
→ preserve/freeze only affected subsystem DOM
→ partial rebaseline hidden
→ complete baseline reconciles once

DataAuthority removed
→ remove subsystem DOM without waiting Render commit

generation changed
→ retire old generation DOM immediately
→ wait new baseline

fresh Session
→ retire entire old Session element universe

Control transport loss without committed replacement
→ preserve/freeze last presentation
→ do not invent empty authority
```

---

## 7. Projection Identity / Ordering

```text
same full live wire-node identity
→ same HTMLElement instance
```

Move/reparent/reorder MUST move existing element。Fresh Session/generation或 different Subsystem/Domain不得复用 HTMLElement identity。

Managed root order：

```text
subsystemKey UTF-8 lexical
→ within subsystem: zIndex ascending
→ same zIndex: domainId UTF-8 lexical
→ roots order
```

这只是 deterministic physical concatenation，不定义 cross-Subsystem visual stacking；layout/stacking仍属于 business WC/CSS。

---

## 8. Business WC / Resource Boundary

Business WC 对 managed attrs/data/light DOM只读；DOM不 reverse-sync Store。Business可拥有 Shadow DOM、Canvas/WebGL、decoded resource cache、animation/timers与 private layout state。

Web Presentation API v1：

```text
receiveRenderContext
→ Window-lifetime capability
→ before first managed insertion
→ at most once

receiveRenderData
→ current full retained data
→ initial + only on structural data change
```

Context只提供 narrow `PresentationResourceClient`；不暴露 bearer/path/FSDB/origin/private client。Window teardown终止 capability、取消在途 reads，后续格式正确的 `resource()` reject `CONTENT_CANCELLED`。

---

## 9. Bootstrap / Failure

Config v1 exact MIME：

```text
scripts → text/javascript essence
styles  → text/css essence
```

Wrong/missing MIME直接 bootstrap failure；不做 platform-specific sniff/fallback。

Projector在每次 reconciliation 首次 DOM mutation前 preflight all newly-required tags。Unknown tag：

```text
zero mutation for current reconciliation
→ preserve last successful DOM exactly
→ latch no-further-managed-DOM-mutation for this Window
→ recovery only via fresh Window
```

Ordinary receiver/resource/DOM failure保持 presentation-local，不 rollback Store、不 mutate Main/Subsystem、不自动 fail Runtime/Frame。

---

## 10. Dependency / Non-goals

禁止：

```text
Business Definition → renderer/browser/platform/protocol authority
Business WC → Store/Data carrier/Content credential
Renderer → DOM reverse-sync Store
RenderNode → arbitrary module URL/loader
public PresentationState / second Store/topology
component registry / AssetManager / dynamic loader
layout/layer authority / global service locator
RenderEvent WC ABI
```

M13 implementation只允许选择不改变 frozen observable semantics 的 private mechanics。

---

## 11. Phase Route

```text
M10 User Input                    closed
M11 Render Replication            closed
M12 Content                       closed
M13 Web Presentation              Design Frozen / implementation pending
M14 loom.map                      pending
M15 Desktop full E2E              pending
M16 PWA Runtime                   pending
M17 PWA full E2E/equivalence      pending
```

当前 executable closure仍是 `npm run test:m12`；M13只有真实实现并通过 `npm run test:m13` + Chromium qualification 后才可 Closed。
