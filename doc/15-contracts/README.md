# LoomRealm 正式契约目录

> 层级：正式契约索引  
> 状态：Active Design  
> 稳定程度：M10–M13 **Implemented / Qualified / Closed**
> 主要定义：current cross-role contracts、version/compatibility boundary、maturity  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-09

契约层只冻结跨角色/跨实现必须一致的 observable semantics；physical provisioning、Process/Worker、endpoint/ticket/Port creation默认不形成 application protocol。

---

## 1. Current Contract Map

```text
Frame / Call v1                         Active / Normative / Frozen
Main ⇄ Renderer Control v1              Active / Normative / Frozen
Renderer Data Application Profile v1    Active / Normative / Frozen
Renderer ⇄ Subsystem Data Connection v1 Active / Normative / Frozen
User Input v1                           Active / Normative / Frozen
Render Update v1                        Active / Normative / Frozen
Readonly Content API v1                 Active / Normative / Evolving
Web Presentation Config v1              Active / Normative / Frozen
Web Presentation API v1                 Active / Normative / Frozen
```

M13 的可实施语义由两份 formal contract + ADR 0031 冻结：

```text
Web Presentation Config v1
→ Window bootstrap JS/CSS
→ prepared Content resolution
→ exact MIME compatibility
→ ordered browser bootstrap
→ window.onload start barrier

Web Presentation API v1
→ Projector ↔ business WC local ABI
→ Session/DataAuthority/currentness observable behavior
→ context/data receivers
→ narrow runtime resource capability
→ Window teardown semantics
```

M13 不修改 Render Update v1，也不复制 M12 Content authority。

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

Presentation reevaluation只有两类 production source：

```text
committed current Control Session/DataAuthority topology change
successful current Render Store commit
```

DOM、Presentation mapping 或 test harness 都不得成为第二份 topology/currentness/Render authority。

---

## 3. Config / Bootstrap Frozen Rules

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

same identity → same HTMLElement；fresh Session/fresh generation → fresh element universe。

`PresentationResourceClient` 只暴露 logical resource identity/version。Window teardown取消在途 reads；teardown 后格式正确的 `resource()` 调用 MUST reject `CONTENT_CANCELLED`。

---

## 5. Currentness / Failure Frozen Rules

```text
DataAuthority removed
→ remove that subsystem managed DOM without waiting Render commit

generation changed
→ old element universe retires immediately
→ new generation waits matching carrier + complete baseline

same-generation Data carrier loss
→ preserve/freeze only affected subsystem DOM
→ partial rebaseline hidden
→ complete baseline reconciles once

Control transport loss without committed replacement snapshot
→ preserve/freeze last presentation
→ do not invent empty authority
```

Unregistered tag 是 projection-time structural failure：所有本次需要新建的 tags MUST 在首次 DOM mutation 前 preflight；失败时本次 zero mutation，并永久停止该 Window 后续 LoomRealm-managed DOM mutation。恢复只能 fresh Window。

---

## 6. Implementation Route

```text
M10 User Input             ✅ Closed
M11 Render Replication     ✅ Closed
M12 Content                ✅ Closed
M13 Web Presentation       ✅ Closed 2026-09-09
M14 loom.map               pending
M15 Desktop Full E2E       pending
M16 PWA Runtime            pending
M17 PWA Full E2E           pending
```

M13 落地文档：

- [M13 / 01](https://github.com/lithdoo/loom-realm/blob/main/M13_01_WEB_PRESENTATION_BOOTSTRAP.md)
- [M13 / 02](https://github.com/lithdoo/loom-realm/blob/main/M13_02_RENDERER_PRESENTATION_SEAM.md)
- [M13 / 03](https://github.com/lithdoo/loom-realm/blob/main/M13_03_WEB_PROJECTOR.md)
- [M13 / 04](https://github.com/lithdoo/loom-realm/blob/main/M13_04_VERTICAL_INTEGRATION.md)
- [M13 / 05](https://github.com/lithdoo/loom-realm/blob/main/M13_05_QUALIFICATION_CLOSURE.md)

当前 executable closure gate是 `npm run test:m13`，包含 real Chromium qualification；证据见 [M13 qualification](../30-implementation/m13-qualification.md)。

---

## 7. Freeze Governance

Frozen contract只有以下事实才能 reopen：

```text
demonstrated correctness/security contradiction
cross-contract conflict
real consumer capability failure
```

不得以 API symmetry、目录对称、未来猜测或测试便利为理由增加 public presentation package、第二份 Store/topology/currentness、generic loader/registry、layout/layer authority、DOM rollback framework或 RenderEvent WC ABI。
