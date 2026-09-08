# LoomRealm 正式契约目录

> 层级：正式契约索引  
> 状态：Active Design  
> 稳定程度：Evolving per-contract / M10+M11 closed / M12 implementation projection frozen  
> 主要定义：current 跨角色协议/Profile、版本绑定、兼容边界与成熟度  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
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
```

Content API v1 仍标记 `Evolving`，因为 PWA independent implementation / interoperability boundary 尚未形成；但 **M12 Desktop/author/Renderer implementation projection 已由 M12_01–05 + ADR 0030 冻结**，编码阶段不得借 `Evolving` 标签重新选择当前 M12 semantics。

---

## 2. Bootstrap Boundary

```text
Game Entry
→ matching Platform Launcher full PREPARE
→ Platform-private LaunchPlan
→ LogicalGameBootstrap
→ Main narrow capability view
```

Main不读取 Game document/formatVersion/module/path/URL/Node/Worker options。

---

## 3. Runtime / Frame

Runtime Control owns one reader/writer、strict IDs、finite deadlines、terminal first-wins、Response causal barrier、no retry/replay/reconnect。

Frame / Call v1：Main owns Frame/Stack/Activation/InputTarget；ACK-before-publication；post-commit no rollback；timeout/loss ambiguity→Runtime failure；surviving caller uses fresh Activation。

---

## 4. Renderer Control / Data

Renderer Control v1：Main owns token/currentness/revision；Renderer holder只复制 committed authority，不 mint/recover authority。

Current Data profile：

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Data loss/provision failure != Runtime failure / Frame unwind。

---

## 5. User Input v1

Current：

```text
protocolVersion = 1
fixtureSetRevision = 2
ADR 0023 + ADR 0029
```

Effective：

```text
current Data
× Main InputTarget(F,A)
× active mirrored F/A
× Interest[F]
× Producer(C)
```

Known-no-commit + same Activation reopen时，retained State local convergence先于 recoverable `frame.call` rejection observable；Event不 replay。

M10 exact author SDK/Renderer source projection由根目录 `M10_01`–`M10_05` 冻结；M10现为 Implemented / Qualified / Closed。

---

## 6. Render Update v1

Render Domain/revision/replication与 Frame/Input/Data carrier lifetime分离：

```text
Frame close != Domain destroy
Data retire != authoritative Domain destroy
```

fresh carrier通过 Registry + Snapshot重建 baseline；Event不跨 future carrier replay。

M11 exact author/publication/Renderer Store projection由 `M11_01`–`M11_05` 冻结并已 Implemented / Qualified / Closed；transport-equivalence role留 M16。

---

## 7. Readonly Content API v1

Current M12-relevant frozen semantics：

```text
GET/HEAD only
logical installation/namespace/key identity
record/group key = one segment
resource key = hierarchical logical ResourceKey
contentVersion = sha256:<64 lowercase hex>
ETag = quoted exact contentVersion
Desktop scoped bearer
PWA same-origin authorization model
Content capability != executable capability
```

Content API不定义 Host credential delivery wire。

M12 exact current implementation projection：

```text
M12_01_CONTENT_SERVICE.md
M12_02_SUBSYSTEM_CONTENT_CLIENT.md
M12_03_RENDERER_RESOURCE_CLIENT.md
M12_04_VERTICAL_INTEGRATION.md
M12_05_QUALIFICATION_CLOSURE.md
```

ADR 0030记录了对 ADR 0003 realization 的 current-first-implementation收口：M12不要求 global Installation Registry、generic Repository、`@loomrealm/content-service` package或 client-selected historical version protocol。

---

## 8. Authority Summary

```text
Game Package       document validation
Launcher/Platform  PREPARE + physical realization
Protocol packages  wire/profile mechanics
Main               Session/Runtime/Frame/Activation/InputTarget/DataAuthority
Subsystem          business state / Desired Input Interest / Render authority / author Content usage
Renderer           read-only Main mirror + Input/Render role behavior + trusted integration-subpath resource reads
Platform            physical Content binding/service/credentials
```

---

## 9. Current Implementation Order

```text
M6 Hostra Runtime          ✅
M7 Renderer Control       ✅
M8 Data Role/Core         ✅
M9 Desktop Data Broker    ✅
M10 User Input            ✅ Implemented / Qualified / Closed
M11 Render                ✅ Implemented / Qualified / Closed
M12 Content               Implementation Frozen / Preimplementation Closed / implementation pending
M13 loom.map              pending
M14 Desktop Full E2E      pending
M15 PWA Runtime           pending
M16 PWA Full E2E          pending
```

Current closed executable root gate仍是 `npm run test:m11`。M12 implementation完成后才允许把导航状态升级为 Implemented/Qualified/Closed，并建立 `npm run test:m12` closure evidence。

---

## 10. Freeze Governance

Frozen contract只有 demonstrated correctness/security contradiction、cross-contract conflict 或 real consumer capability failure 才能 reopen。

首次实现前 Current correction按 [文档治理](../00-overview/document-governance.md)传播；ADR 0030是 M12 Content realization closure provenance，不制造 fake v2/compat layer。
