# LoomRealm 正式契约目录

> 层级：正式契约索引  
> 状态：Active Design  
> 稳定程度：Evolving per-contract / M10+M11+M12 closed / M13 Web presentation Stabilizing  
> 主要定义：current 跨角色协议/Profile、版本绑定、兼容边界与成熟度  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)、[ADR 0032](../decisions/0032-freeze-m13-web-presentation-api-v1.md)  
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

Content API v1 仍标记 `Evolving`，因为 PWA independent implementation / interoperability boundary 尚未形成；但 **M12 Desktop/author/Renderer implementation projection 已由 M12_01–05 + ADR 0030 冻结并完成 qualification**。

M13 Web presentation现在由两份互补 contract组成：

```text
Web Presentation Config v1
→ Window bootstrap JS/CSS source + loading/ready ordering

Web Presentation API v1
→ Projector ↔ business WC local browser ABI
→ receiveRenderContext + receiveRenderData
→ narrow presentation resource capability
```

ADR 0031 + ADR 0032 + Rendering System共同冻结 thin Web projector observable semantics，包括 `document.body` root projection、deterministic Domain flattening、one-shot context injection、`receiveRenderData(...)`、projection ordering与 no RenderEvent→WC mapping。

---

## 2. Bootstrap Boundary

Runtime bootstrap：

```text
Game Entry
→ matching Platform Launcher full PREPARE
→ Platform-private LaunchPlan
→ LogicalGameBootstrap
→ Main narrow capability view
```

Main不读取 Game document/formatVersion/module/path/URL/Node/Worker options。

M13 Web presentation走独立 product/Renderer startup branch：

```text
user-selected WebPresentationConfigV1
→ validate
→ resolve JS/CSS against current prepared Content view
→ ordered <link rel="stylesheet"> / classic <script>
→ business customElements.define(...)
→ window.onload
→ Web Projector may start
```

该配置不进入 Main logical bootstrap、Game Entry或 platform launch manifest。

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

M11 exact author/publication/Renderer Store projection由 `M11_01`–`M11_05` 冻结并已 Implemented / Qualified / Closed；transport-equivalence role留 M17。

M13不改变 Render Update v1，也不要求把 M11 `RenderEvent` 映射为 WC method或 DOM event。

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

ADR 0030记录了对 ADR 0003 realization 的 current-first-implementation收口。

---

## 8. Web Presentation Config v1

正式契约：[Web Presentation Config v1](./web-presentation-config-v1.md)。

V1 exact shape：

```ts
interface WebPresentationConfigV1 {
  readonly formatVersion: 1;
  readonly scripts: readonly WebPresentationResourceRefV1[];
  readonly styles: readonly WebPresentationResourceRefV1[];
}
```

关键语义：

```text
user selects config at product startup
scripts/styles = Renderer Window-level ordered lists
no subsystems field
resource identity = M12 namespace + hierarchical resource key
Desktop FSDB = current prepared installation exactly-one [FSDB]*
user does not separately configure fsdbRoot
styles = ordered <link rel="stylesheet">
scripts = ordered classic <script>, no async ordering break
window.onload = Web Projector start barrier
business JS registers concrete WC through browser customElements
```

该契约不定义 business component vocabulary，也不把 JS/CSS physical URL/path写入 RenderNode。

---

## 9. Web Presentation API v1 / Projector ABI

正式契约：[Web Presentation API v1](./web-presentation-api-v1.md)。

M13 current physical projection：

```text
Renderer Store successful atomic commit
→ package-private post-commit notification/effect
→ thin Web Projector
→ document.body
```

Mapping：

```text
key      → stable HTMLElement identity
tag      → business-owned Custom Element
attrs    → managed host attributes
children → managed light DOM
data     → optional receiveRenderData(complete readonly snapshot)
context  → optional one-shot receiveRenderContext(...)
```

两个 receiver属于同一个 Web Presentation API v1，但接口独立：

```ts
interface RenderContextReceiver {
  receiveRenderContext(context: WebPresentationContext): void;
}

interface RenderDataReceiver {
  receiveRenderData(data: DeepReadonly<JsonObject>): void;
}
```

`WebPresentationContext` V1 exact shape：

```ts
interface WebPresentationContext {
  readonly resources: PresentationResourceClient;
}
```

`PresentationResourceClient` 只暴露：

```text
namespace + hierarchical key + expectedContentVersion
→ caller-owned bytes + MIME + actual contentVersion
```

它包装 M12 Renderer trusted/private ResourceClient；业务不得观察 Content bearer/origin/installationId/filesystem path/privileged URL/private client object。

新 element materialization order：

```text
construct
→ receiveRenderContext(...), if implemented
→ structure / first managed insertion + children
→ attrs
→ receiveRenderData(...), if implemented
```

已有 element committed update仍是：

```text
structure / children / Domain-root reorder
→ attrs
→ receiveRenderData(...)
```

同一 HTMLElement最多注入一次 context；move/reorder/reconciliation不得重复注入。

M13不建立 generic Domain layer/stacking framework；top-level roots按 M11 Domain logical order确定性 flatten后直接进入 `document.body`，actual layout/position/stacking仍由 business WC/CSS负责。

M13也不建立 MutationObserver policing；业务违反 managed DOM read-only contract时，Store仍 authoritative，DOM永远不反向成为 Store state。

---

## 10. Authority Summary

```text
Game Package       document validation
Launcher           Runtime executable PREPARE + PlatformLaunchPlan
Platform/app       physical Window/Data/Content/presentation bootstrap composition
Main               Session/Runtime/Frame/Activation/InputTarget/DataAuthority
Subsystem          business state / Desired Input Interest / Render authority / author Content usage
Renderer Store     current authoritative Render replica
Web Projector      mechanical Store → DOM projection + context injection
Business WC        concrete presentation/layout + private state; projected Render state read-only
Presentation API   narrow readonly resource bytes capability; no Content credential/path exposure
```

---

## 11. Current Implementation Order

```text
M6 Hostra Runtime          ✅
M7 Renderer Control        ✅
M8 Data Role/Core          ✅
M9 Desktop Data Broker     ✅
M10 User Input             ✅ Implemented / Qualified / Closed
M11 Render Replication     ✅ Implemented / Qualified / Closed
M12 Content                ✅ Implemented / Qualified / Closed
M13 Web Projection         pending
M14 loom.map               pending
M15 Desktop Full E2E       pending
M16 PWA Runtime            pending
M17 PWA Full E2E           pending
```

Current closed executable root gate是 `npm run test:m12`。M13实现必须消费既有 M11/M12 contracts，并为 WebPresentationConfig/bootstrap + Web Presentation API + thin projector建立 `npm run test:m13` closure evidence；该 gate必须包含真实 headless Chromium qualification。

---

## 12. Freeze Governance

Frozen contract只有 demonstrated correctness/security contradiction、cross-contract conflict 或 real consumer capability failure 才能 reopen。

首次实现前 Current correction按 [文档治理](../00-overview/document-governance.md)传播；ADR 0030是 M12 Content realization closure provenance，ADR 0031定义 M13 projection ownership/bootstrap基础，ADR 0032关闭 M13 WC context/runtime resource capability；均不制造 fake v2/compat layer。
