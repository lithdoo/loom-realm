# LoomRealm 正式契约目录

> 层级：正式契约索引  
> 状态：Active Design  
> 稳定程度：M10–M13 historical qualification baseline；M14/M15 milestone status ledger-owned；Viewport /1 correction Docs Freeze HOLD / not implemented  
> 主要定义：current cross-role contracts、version/compatibility boundary、maturity  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-18

契约层只冻结跨角色/跨实现必须一致的 observable semantics；physical provisioning、Process/Worker、endpoint/ticket/Port creation 默认不形成 application protocol。本文不维护 M14/M15 的第二套 live PASS/Closed 状态。Viewport 的正式签署与资格仅见[唯一冻结账本](../30-implementation/viewport-core-freeze-ledger.md)。

---

## 1. Current Contract Map

```text
Frame / Call v1                         Active / Normative / Frozen
Main ⇄ Renderer Control v1              Active / Normative / Frozen
Renderer Data Application Profile v1    Four-child normative candidate / Docs Freeze HOLD
Renderer ⇄ Subsystem Data Connection v1 Active / Normative / Frozen
User Input v1                           Active / Normative / Frozen
Render Update v1                        Active / Normative / Frozen
Viewport State v1                       Normative candidate / Docs Freeze HOLD / not implemented
Readonly Content API v1                 Active / Normative / Evolving
Hostra Game Launcher / Node Runner v1   Active / Normative / Frozen M6 slice
Web Presentation Config v1              Active / Normative / Frozen
Web Presentation API v1                 Active / Normative / Frozen
```

本次 [ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md) 明确批准首次发布前协调修订原 `loomrealm.renderer-data/1`，目标是 Connection1+Input1+Render1+Viewport1：

- [自包含的当前 Profile v1](./renderer-data-profile-v1.md) + [Viewport child v1](./viewport-state-v1.md) 定义唯一目标语义；旧 executable 仍是三个 child，不可混连。
- [自包含的 Profile revision3 conformance](./renderer-data-profile-conformance-v1.md) + [Viewport conformance](./viewport-state-conformance-v1.md) 定义实施后的新资格，旧 revision2 义务完全保留，旧 PASS 不迁移。
- [原 Profile](./renderer-data-profile-v1-previewport-baseline.md) 与[原 revision2](./renderer-data-profile-conformance-v1-previewport-baseline.md) 仅提供不可变 Git 历史入口，不是第二套 current contract。

M15 Hostra shell/HOSTRA_SUBCMD/window/bootstrap mechanics 是 product physical composition，不新增 cross-role application protocol，也不修改上述 Renderer/Data/Content/Web Presentation 旧语义。Viewport 不修改 Main、M13 或实际 Desktop/Map 产品行为。

---

## 2. M13 Authority Summary

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

Presentation reevaluation 只有两类 production source：

```text
committed current Control Session/DataAuthority topology change
successful current Render Store commit
```

DOM、Presentation mapping 或 test harness 不得成为第二份 topology/currentness/Render authority。Viewport 只提供 Subsystem Runtime readonly observation，不作为 M13 第三种 reevaluation source。

---

## 3. Web Presentation Config Frozen Rules

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

MIME parameters 不参与 compatibility；missing/unparseable/wrong MIME 直接 bootstrap failure，不做 sniff/fallback。

M15 top-level-navigation-only trusted shell lifetime 属于 Desktop physical composition；它不得改变 Config v1 value contract 或 M13 `window.onload` presentation semantics。

---

## 4. Web Presentation API Frozen Rules

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

Same identity → same HTMLElement；fresh Session/fresh generation → fresh element universe。

`PresentationResourceClient` 只暴露 logical resource identity/version。Window teardown 取消在途 reads；teardown 后 well-formed `resource()` MUST reject `CONTENT_CANCELLED`。

---

## 5. Currentness / Failure Frozen Rules

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

M15 reload is a fresh Renderer logical participant；M15 Data-only reconnect is not。These physical scenarios consume the frozen contracts rather than redefining them。

Unregistered tag remains projection-time structural failure：preflight before first DOM mutation；failure means zero mutation for that reconciliation and permanent Window-local managed-DOM failure until fresh Window/document lifetime according to current product composition。

---

## 6. Implementation / Milestone Route

This contract index intentionally does not publish a second live milestone ledger。Current authoritative status sources：

```text
M10–M13
    closed qualification records

M14
    ../30-implementation/m14-qualification.md

M15
    ../30-implementation/m15-qualification.md
    + ../../M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md

Viewport Core
    ../30-implementation/viewport-core-freeze-ledger.md
```

Current summary for navigation only：

```text
M10, M12–M13  Closed historical baseline
M11      Requalification Pending → ../30-implementation/m11-qualification.md
M14      Requalification Pending → ../30-implementation/m14-qualification.md
M15      Requalification Pending → ../30-implementation/m15-qualification.md
M16–M17  pending
Viewport Core  Docs Freeze HOLD / production not implemented / tests not run
```

M13 landing docs remain `M13_01`–`M13_05`。M11/M14/M15 formal status must come from their designated evidence ledgers, not this index；Viewport 也有自己的独立 ledger。

---

## 7. Freeze Governance

Frozen contract 只有以下事实才能 reopen：

```text
demonstrated correctness/security contradiction
cross-contract conflict
real consumer capability failure
```

不得以 API symmetry、目录对称、future speculation、Hostra/PWA physical symmetry 或 test convenience 为理由增加 public presentation package、第二份 Store/topology/currentness、generic loader/registry、layout/layer authority、DOM rollback framework 或 RenderEvent WC ABI。

本次 Viewport 预发布修订由 [ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md) 显式治理；材料准备不等于 Frozen。经正式文档 SHA 复核/批准后才能开放 Agent 生产实现。