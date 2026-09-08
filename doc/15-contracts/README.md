# LoomRealm 正式契约目录

> 层级：正式契约索引  
> 状态：Active Design  
> 稳定程度：M10+M11+M12 closed / M13 Web Presentation Stabilizing  
> 主要定义：current cross-role contracts、version/compatibility boundary、maturity  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[渲染系统](../10-architecture/rendering-system.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

契约层只保留跨角色/跨实现必须一致的 observable semantics；physical provisioning、Process/Worker、endpoint/ticket/Port creation默认不形成 application protocol。

---

## 1. Current Contract Map

```text
Game Package v1
Hostra Launcher / Node Runner Profile v1
PWA Launcher / Worker Runner Profile v1
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1                         Active / Normative / Frozen
Main ⇄ Renderer Control v1              Active / Normative / Frozen
Renderer Data Application Profile v1    Active / Normative / Frozen
Renderer ⇄ Subsystem Data Connection v1 Active / Normative / Frozen
User Input v1                           Active / Normative / Frozen
Render Update v1                        Active / Normative / Frozen
Readonly Content API v1                 Active / Normative / Evolving
Web Presentation Config v1              Active / Normative / Stabilizing
Web Presentation API v1                 Active / Normative / Stabilizing
```

M12 Desktop/Subsystem/Renderer realization已由 M12_01–05 + ADR 0030完成 qualification。Content API整体仍 `Evolving`，因为 PWA independent realization/interoperability 尚未关闭。

M13 Web presentation由两份互补 formal contract组成：

```text
Web Presentation Config v1
→ Window bootstrap JS/CSS + prepared Content resolution + loading/ready semantics

Web Presentation API v1
→ Projector ↔ business WC local ABI
→ context/data receivers + narrow runtime resource capability
```

Ownership/identity/body-order decision由 ADR 0031 + Rendering System记录；本索引不复制完整 interface。

---

## 2. Frozen Runtime / Data Contracts

### Runtime / Frame

Main拥有 Frame/Stack/Activation/InputTarget；mutation遵守 ACK-before-publication、post-commit no rollback、timeout/loss ambiguity → Runtime failure、no replay/retry。

### Renderer Control / Data

Current Data profile：

```text
loomrealm.renderer-data/1
= Data Connection v1 + User Input v1 + Render Update v1
```

Data loss/provision failure != Runtime/Frame failure。

### User Input v1

```text
current Data
× Main InputTarget
× active F/A
× Interest[F]
× Producer(C)
```

M10 Implemented / Qualified / Closed。

### Render Update v1

Render Domain/revision/identity与 Frame/Data carrier lifetime分离。fresh carrier用 Registry + Snapshot重建 baseline；Event transient/no future-carrier replay。

M11 Implemented / Qualified / Closed。M13不修改 Render Update v1，也不要求 RenderEvent → WC/DOM mapping。

---

## 3. Readonly Content API v1

Current M12 semantics：

```text
GET/HEAD only
logical installation/namespace/key identity
resource key = hierarchical ResourceKey
contentVersion = sha256:<64 lowercase hex>
ETag = quoted exact contentVersion
Desktop scoped bearer
Content capability != executable capability
```

M12 implementation projection：

```text
M12_01_CONTENT_SERVICE.md
M12_02_SUBSYSTEM_CONTENT_CLIENT.md
M12_03_RENDERER_RESOURCE_CLIENT.md
M12_04_VERTICAL_INTEGRATION.md
M12_05_QUALIFICATION_CLOSURE.md
```

---

## 4. Web Presentation Config v1

正式契约：[Web Presentation Config v1](./web-presentation-config-v1.md)。

只回答：

```text
当前 Renderer Window 启动 projection 前加载哪些 business JS/CSS？
```

核心：Window-level ordered `scripts/styles`、M12 logical resource refs、prepared Content resolution、ordered `<link>`/classic `<script>`、business `customElements.define(...)`、`window.onload` start barrier。

不定义 runtime asset API、dynamic module loader、Subsystem binding或 business component vocabulary。

---

## 5. Web Presentation API v1

正式契约：[Web Presentation API v1](./web-presentation-api-v1.md)。

只回答：

```text
Projector运行后怎样向 business WC交付 capability 与 retained data？
```

两个独立 optional receiver：

```text
receiveRenderContext → Window-lifetime capability, at most once per HTMLElement
receiveRenderData    → retained current full data, repeated on committed data changes
```

Context V1只暴露 narrow `PresentationResourceClient`，复用 M12 logical identity/version semantics，不暴露 bearer/path/FSDB/privileged URL/private Renderer client。

Resource error只冻结 structural `Error + code` vocabulary，不要求共享 constructor/`instanceof` identity。

---

## 6. Projection Identity / Ordering

Render v1中 `key` 只在一个 Domain内唯一。M13不得把裸 key当 Window-global identity：

```text
same live wire-node identity
(Session, subsystemKey, generation, domainId, key)
→ same HTMLElement
```

不同 Domain/Subsystem/fresh generation即使 key string相同也不得 collision。

Top-level managed root order：

```text
subsystemKey UTF-8 lexical
→ within subsystem: M11 zIndex/domainId logical order
→ roots order
```

这里不创建 cross-Subsystem global zIndex/stacking authority；actual layout/stacking属于 business WC/CSS。

---

## 7. Authority Summary

```text
Launcher           Runtime executable PREPARE
Main               Session/Runtime/Frame/Activation/InputTarget/DataAuthority
Subsystem          business state / Input Interest / Render authority / Content author usage
Renderer Store     current authoritative Render replica
Web Projector      mechanical Store → DOM projection + context injection
Business WC        read-only projected state + private presentation/layout
Presentation API   narrow readonly resource capability
```

DOM永远不反向成为 Store authority；M13不使用 MutationObserver policing，也不建立 second desired projection authority。

---

## 8. Current Implementation Order

```text
M10 User Input             ✅ Closed
M11 Render Replication     ✅ Closed
M12 Content                ✅ Closed
M13 Web Presentation       pending
M14 loom.map               pending
M15 Desktop Full E2E       pending
M16 PWA Runtime            pending
M17 PWA Full E2E           pending
```

当前 closed executable root gate是 `npm run test:m12`。M13实现后建立自己的 `npm run test:m13`，并必须包含真实 Chromium qualification。

---

## 9. Freeze Governance

Frozen contract只有 demonstrated correctness/security contradiction、cross-contract conflict 或 real consumer capability failure 才能 reopen。

ADR 0031 是 M13 current decision provenance；Config/API formal contracts是 business-observable source of truth。后续文档应引用它们，而不是复制第二套 interface/ordering/error定义。
