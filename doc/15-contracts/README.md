# LoomRealm 正式契约目录

> 层级：正式契约索引  
> 状态：Active Design  
> 稳定程度：M10–M13 current v1 contracts frozen/closed；Viewport State v1 / Renderer Data Profile v2 为 **Draft / Candidate for Freeze**；M14/M15 milestone status ledger-owned  
> 主要定义：current cross-role contracts、version/compatibility boundary、maturity  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[Viewport Capability](../10-architecture/viewport-capability.md)、[ADR 0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> 最近复核：2026-09-16

契约层只冻结跨角色/跨实现必须一致的 observable semantics；physical provisioning、Process/Worker、endpoint/ticket/Port creation默认不形成 application protocol。本文不维护 M14/M15 的第二套 live PASS/Closed 状态。

---

## 1. Contract Map

```text
Frame / Call v1                         Active / Normative / Frozen
Main ⇄ Renderer Control v1              Active / Normative / Frozen
Renderer Data Application Profile v1    Active / Normative / Frozen
Renderer ⇄ Subsystem Data Connection v1 Active / Normative / Frozen
User Input v1                           Active / Normative / Frozen
Render Update v1                        Active / Normative / Frozen
Viewport State v1                       Draft / Normative Candidate / Not Frozen
Renderer Data Application Profile v2    Draft / Normative Candidate / Not Frozen
Readonly Content API v1                 Active / Normative / Evolving
Hostra Game Launcher / Node Runner v1   Active / Normative / Frozen M6 slice
Web Presentation Config v1              Active / Normative / Frozen
Web Presentation API v1                 Active / Normative / Frozen
```

Profile relationship：

```text
loomrealm.renderer-data/1
= Connection1 + Input1 + Render1

loomrealm.renderer-data/2   [candidate]
= Connection1 + Input1 + Render1 + Viewport1
```

Profile v2 是显式 compatibility boundary；不得把 `viewport.state` 静默塞进 frozen `/1`。

---

## 2. Viewport Candidate Closure

正式候选：

- [Viewport State v1](./viewport-state-v1.md)
- [Viewport State v1 Conformance](./viewport-state-conformance-v1.md)
- [Renderer Data Profile v2](./renderer-data-profile-v2.md)
- [Renderer Data Profile v2 Conformance](./renderer-data-profile-conformance-v2.md)

Architecture / provenance：

- [Viewport Capability](../10-architecture/viewport-capability.md)
- [ADR 0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)

冻结候选边界：

```text
Viewport != User Input
Viewport author capability = Runtime-scoped readonly retained state
Main owns profile selection/DataAuthority, not width/height
profile /1 unchanged
profile /2 = /1 + Viewport State v1
profile change requires fresh generation
canonical target subject selects /2; no per-Subsystem negotiation in this slice
```

在 Viewport/Profile v2 formal contracts 与 conformance 未通过 Freeze Gate 前，dynamic viewport map 文档不得声称 Core capability 已 Frozen/Implemented。

---

## 3. M13 Authority Summary

```text
Main / Renderer Control snapshot
    owns current Session + DataAuthority topology

Renderer per-subsystem Store
    owns current authoritative Render replica

Web Projector
    reads current topology + eligible Store facts
    owns only LoomRealm-managed DOM mutation

Business WC
    read-only consumer of managed projection
    owns Shadow DOM / Canvas / WebGL / private presentation state
```

Viewport 不改变这条链：Renderer physical realization只观察 surface geometry，并经 Data Profile v2 向 Subsystem复制 readonly state；它不成为 Render/DOM desired-state authority。

Presentation reevaluation只有两类 production source：

```text
committed current Control Session/DataAuthority topology change
successful current Render Store commit
```

Viewport author observation本身不直接改 DOM；业务 Runtime若据此提交新的 Render state，仍通过既有 Render authority链进入 presentation。

---

## 4. Web Presentation Config Frozen Rules

正式契约：[Web Presentation Config v1](./web-presentation-config-v1.md)。

```text
Config source acquisition
→ product/platform-private

WebPresentationConfigV1
→ exact {formatVersion,scripts,styles}
→ Window-level ordered refs
→ M12 prepared Content
→ scripts MIME essence = text/javascript
→ styles MIME essence = text/css
→ ordered <link> / classic <script>
→ window.onload
→ presentation starts once
```

MIME parameters不参与 compatibility；missing/unparseable/wrong MIME直接 bootstrap failure，不做 sniff/fallback。

M15的 top-level-navigation-only trusted shell lifetime属于 Desktop physical composition；它不得改变 Config v1 value contract或 M13 `window.onload` presentation semantics。

---

## 5. Web Presentation API Frozen Rules

正式契约：[Web Presentation API v1](./web-presentation-api-v1.md)。

两个独立 optional receiver：

```text
receiveRenderContext
→ Window-lifetime capability
→ before first managed insertion
→ at most once per HTMLElement

receiveRenderData
→ current retained full data
→ initial + only when retained JSON value changes
```

完整 live identity：

```text
(Session, subsystemKey, generation, domainId, key)
```

same identity → same HTMLElement；fresh Session/fresh generation → fresh element universe。

`PresentationResourceClient`只暴露 logical resource identity/version。Window teardown取消在途 reads；teardown后 well-formed `resource()` MUST reject `CONTENT_CANCELLED`。

---

## 6. Currentness / Failure Frozen Rules

```text
DataAuthority removed
→ remove affected subsystem DOM without waiting Render commit

generation changed
→ old element universe retires immediately
→ new generation waits matching carrier + complete baseline

same-generation Data carrier loss
→ preserve/freeze only affected subsystem DOM
→ same Renderer logical participant remains current
→ partial rebaseline hidden
→ complete baseline reconciles once

Control transport loss without committed replacement snapshot
→ preserve/freeze last presentation
→ do not invent empty authority
```

Viewport candidate follows a compatible but distinct retained observation rule：Data carrier loss preserves last accepted `scope.viewport.current`; fresh carrier republishes a fresh physical viewport baseline。该 retained value不是 current carrier/Renderer/paintability proof。

M15 reload is a fresh Renderer logical participant；M15 Data-only reconnect is not。These physical scenarios consume the contracts rather than redefining them。

Unregistered tag remains projection-time structural failure：preflight before first DOM mutation；failure means zero mutation for that reconciliation and permanent Window-local managed-DOM failure until fresh Window/document lifetime according to the current product composition。

---

## 7. Implementation / Milestone Route

This contract index intentionally does not publish a second live milestone ledger。Current authoritative status sources：

```text
M10–M13
    closed qualification records

M14
    ../30-implementation/m14-qualification.md

M15
    ../30-implementation/m15-qualification.md
    + ../../M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md
```

Current summary for navigation only：

```text
M10, M12–M13  Closed
M11      Requalification Pending → ../30-implementation/m11-qualification.md
M14      Requalification Pending → ../30-implementation/m14-qualification.md
M15      Requalification Pending → ../30-implementation/m15-qualification.md
Viewport/Profile v2  Draft / preimplementation closure pending
M16–M17  pending
```

Viewport/Profile v2 executable behavior一旦落地，会建立新 qualification subject；受影响 milestone必须按该 SHA 重跑，不能复用旧 PASS。

---

## 8. Freeze Governance

Frozen contract只有以下事实才能 reopen：

```text
demonstrated correctness/security contradiction
cross-contract conflict
real consumer capability failure
real compatibility boundary requiring explicit migration/versioning
```

ADR0036 的 viewport gap 属于 real consumer capability failure，因此通过**新 Profile v2**扩展，而不是原地修改 v1。

不得以 API symmetry、目录对称、future speculation、Hostra/PWA physical symmetry或 test convenience 为理由增加 public Environment service locator、第二份 Store/topology/currentness、generic loader/registry、layout/layer authority、DOM rollback framework或 RenderEvent WC ABI。
