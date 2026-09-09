# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M10–M13 **Implemented / Qualified / Closed**
> 主要定义：logical roles、bootstrap boundary、authority/currentness、Render/Web presentation placement、Platform composition  
> 依赖：[产品设计总览](../00-overview/product-vision.md)、[文档治理](../00-overview/document-governance.md)  
> 细化：[平台组合系统](./platform-composition-system.md)、[渲染系统](./rendering-system.md)  
> 相关：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-09

本文只描述 system-level responsibility / authority / topology。精确 browser/ABI/error/qualification semantics由 formal contracts与 milestone closure拥有。

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
→ current prepared Content
→ Renderer Window bootstrap
→ presentation start
```

因此：

```text
Game topology != executable binding != Web presentation bootstrap
```

Config source、prepared Content selection、private browser binding、Window/document lifecycle属于 concrete `apps/*` composition，不进入 Main、Frame、RenderNode或 Launcher logical ABI。精确 Config shape/MIME/loading barrier由 Web Presentation Config v1拥有。

---

## 3. Main / Renderer Authority

Main唯一拥有 Session、Runtime/Frame/Stack/Activation、InputTarget、DataAuthority generation/profile 与 failure unwind，并向 Renderer发布 committed authority snapshot。

对 Web presentation，current Control snapshot唯一决定 current Session 与 subsystem/generation topology。Renderer不得复制出第二份 presentation topology authority。

---

## 4. Renderer Data / Input / Render

Current Data identity：

```text
Session + current Renderer + subsystemKey + generation
```

Data loss != Runtime/Frame failure；same generation/profile可 reconnect，profile change需要 fresh generation。

Input继续受 current Data × Main InputTarget × active Activation × Subsystem Interest × physical Producer gate约束。

Render：

```text
Subsystem authoritative Render Domains
→ Render Update v1
→ per-subsystem Renderer Store
```

Wire node identity包含 `(Session, subsystemKey, generation, domainId, key)`。

---

## 5. M13 Web Presentation Placement

```text
Window bootstrap
→ presentation start
→ current Control Session/DataAuthority facts ─┐
                                               ├→ package-private reevaluation
   current per-subsystem Renderer Store ───────┘
                                                     ↓
                                           per-subsystem eligibility
                                                     ↓
                                               thin Projector
                                                     ↓
                                     document.body / business WC
```

Production reevaluation只有 committed/fresh current Control snapshot 与 successful current Store domains/snapshot/patch commit。Failed Store mutation与 RenderEvent不触发 Web projection。

Same-generation transport loss不等于 authority removal；fresh Session/generation结束旧 identity universe。精确 eligibility/reconnect/DOM-observable semantics由 Web Presentation API v1拥有。

---

## 6. Projection / Business Boundary

Same full live wire-node identity保持 same HTMLElement；move/reparent/reorder移动 existing instance。Top-level managed roots按 deterministic physical sequence组成，但该顺序不建立 cross-Subsystem visual stacking authority；layout/stacking仍属于 business WC/CSS。

Business WC 对 managed attrs/data/light DOM只读；DOM不 reverse-sync Store。Business可拥有 Shadow DOM、Canvas/WebGL、decoded resource cache、animation/timers与 private layout state。

Projector只注入 formal Web Presentation API 定义的 narrow context/data/resource capability，不创建 component library、AssetManager、dynamic loader、global service locator或 RenderEvent WC ABI。

---

## 7. Failure / Lifetime Boundary

Bootstrap failure阻止 presentation start。Runtime presentation failure保持 Window-local，不 rollback Store、不 mutate Main/Subsystem、不自动 fail Runtime/Frame。

Unknown-tag precise preflight/freeze semantics、receiver callback ordering/data equality、resource teardown/error semantics全部由 Web Presentation API v1拥有；本总览不复制。

---

## 8. Dependency / Non-goals

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

## 9. Phase Route

```text
M10 User Input                    closed
M11 Render Replication            closed
M12 Content                       closed
M13 Web Presentation              ✅ Closed 2026-09-09
M14 loom.map                      pending
M15 Desktop full E2E              pending
M16 PWA Runtime                   pending
M17 PWA full E2E/equivalence      pending
```

当前 executable closure是 `npm run test:m13`；M13 qualification记录见 [m13-qualification.md](../30-implementation/m13-qualification.md)。
