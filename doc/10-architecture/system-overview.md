# LoomRealm 系统架构总览

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：logical roles、bootstrap boundary、authority/currentness、Render/Web presentation placement、Platform composition  
> 依赖：[产品设计总览](../00-overview/product-vision.md)、[文档治理](../00-overview/document-governance.md)  
> 被以下文档细化：[平台组合系统](./platform-composition-system.md)、[渲染系统](./rendering-system.md)  
> 相关：[Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)、[Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)、[ADR 0031](../decisions/0031-business-owned-web-component-projection.md)  
> 最近复核：2026-09-08

本文只描述 system-level responsibility / authority / topology。精确 wire、schema、limits、error、qualification 由 `15-contracts` 与 milestone closure拥有。

---

## 1. Logical Roles

```text
Game Package
    validates logical Game Entry document

Platform Launcher
    consumes Game Entry + current Platform Launch Manifest
    resolves physical executable binding
    produces immutable PlatformLaunchPlan + LogicalGameBootstrap

Main
    Session / Runtime / Frame / Stack / Activation
    InputTarget / DataAuthority / failure unwind

Subsystem Runtime
    business state
    Frame/Input author context
    authoritative Render Domains

Renderer
    read-only Main authority mirror
    Data connections / Input producers
    current Render replica
    thin physical Web projection

Readonly Content Service
    logical readonly Content bytes

Business Web presentation
    concrete Custom Elements / Shadow DOM / Canvas/WebGL / layout
```

一个 application authority只有一个 owner；physical Platform/DOM ownership不会产生第二份 business/Main/Render authority。

---

## 2. Bootstrap Boundaries

Runtime executable bootstrap：

```text
Game installation/source
→ matching Platform Launcher PREPARE
→ Game Entry validation
→ current Platform manifest exact key join
→ executable/security/capability preflight
→ immutable PlatformLaunchPlan
→ LogicalGameBootstrap
→ RuntimeHosting
```

Main只接收 logical bootstrap，不解析 `game.json`，不接触 module/path/URL/Runner/Web Presentation Config/Content credential。

Web presentation bootstrap是独立 product startup input：

```text
user-selected WebPresentationConfigV1
→ current prepared Content refs
→ Renderer Window browser bootstrap
```

因此：

```text
Game topology != executable binding != Web presentation bootstrap
```

---

## 3. Platform Composition

`apps/*` / Platform integration负责 physical realization：

```text
Runtime Hosting / supervision
Main ⇄ Subsystem Control binding
Renderer hosting
Main ⇄ Renderer Control binding
Renderer ⇄ Subsystem Data broker
Content service/binding
Web presentation config acquisition/resolution
Renderer Window bootstrap
startup/shutdown
```

Hostra可以使用 Process/WebSocket/BrowserWindow/fs/HTTP；PWA可以使用 Worker/MessagePort/Window/Fetch/OPFS。Physical mechanics可以不同，但 logical contracts/currentness/business outcome必须等价。

---

## 4. Main / Runtime / Frame Authority

Main唯一拥有：

```text
Session
Runtime lifecycle
Frame/Stack/caller/outcome
Activation
InputTarget
DataAuthority generation/profile
transaction/failure unwind
```

关键原则：

```text
Response-before-dependent-RPC
ACK-before-publication
ambiguous mutation → Runtime failure, no replay/retry
post-commit no rollback
```

Runtime `ready` 不等于 Data current、Renderer exists或 Web presentation ready。

---

## 5. Renderer Control / Data

Main向 Renderer发布 committed authority snapshot；Snapshot不携 Data endpoint、Render state、presentation config、Content credential或 executable plan。

Current Renderer Data profile：

```text
Data Connection v1
+ User Input v1
+ Render Update v1
```

Data identity：

```text
Session + current Renderer + subsystemKey + generation
```

Data loss不等于 Runtime/Frame failure；same generation/profile可顺序 reconnect，profile change需要 fresh generation。

---

## 6. Input

Input authority来自 Main InputTarget；Subsystem只贡献 Interest；Renderer只产生 physical input。

```text
Effective(F,A,C)
=
current matching Data
∧ Main InputTarget(S,F,A)
∧ active Activation
∧ C ∈ Interest[F]
∧ Producer(C)
```

Business WC DOM focus/event不能创造 Input authority；physical input必须继续进入 frozen `RendererInputSource` seam。

---

## 7. Render Replication

Subsystem拥有 `0..N` authoritative Render Domains。

```text
Frame close != RenderDomain destroy
Data carrier loss != business Domain destroy
```

M11：

```text
Subsystem Render authority
→ Render Update v1
→ Renderer current Store
```

Frozen wire Domain identity：

```text
(Session, subsystemKey, generation, domainId)
```

Node identity再加 `key`。`key`只在一个 Domain内唯一。

---

## 8. M13 Web Presentation

M13只关闭 Render replica → physical Web presentation：

```text
WebPresentationConfigV1
→ ordered <link> / classic <script>
→ business customElements registration
→ window.onload
→ Renderer Store successful commit
→ package-private post-commit seam
→ thin Web Projector
→ document.body / business-owned WC
```

精确 browser/bootstrap semantics属于 [Web Presentation Config v1](../15-contracts/web-presentation-config-v1.md)；Projector↔WC context/data/resource ABI属于 [Web Presentation API v1](../15-contracts/web-presentation-api-v1.md)。本总览不复制 interfaces。

---

## 9. Web Projection Identity / Ordering

M13禁止裸 `key → HTMLElement` 的 Window-global interpretation。

```text
same live wire-node identity
(Session, subsystemKey, generation, domainId, key)
→ same HTMLElement
```

不同 Domain/Subsystem/fresh generation即使 key string相同也不是同一 identity。move/reparent/reorder必须移动 existing HTMLElement。

Top-level roots直接进入 `document.body`。M11 zIndex/domainId只在一个 Subsystem scope内有 logical order；M13只增加 deterministic physical concatenation：

```text
subsystemKey UTF-8 lexical
→ within subsystem: zIndex ascending
→ same zIndex: domainId UTF-8 lexical
→ roots order
```

该顺序不创建 cross-Subsystem global zIndex/stacking authority。Actual layout/stacking由 business WC/CSS拥有。

---

## 10. Business WC Boundary

Business WC 对 LoomRealm-managed state只有读取权：

```text
Element identity/tag
host attrs
Render data
managed light-DOM children/order
```

它可以拥有 Shadow DOM、Canvas/WebGL、decoded resources、cache/animation与 layout state。

DOM永远不反向成为 Store source。M13不使用 MutationObserver policing违规 business mutation，也不建立 hostile-code sandbox。

---

## 11. Web Presentation API / Content

Web Presentation API v1在同一个 local contract下定义两个独立 optional receiver：

```text
receiveRenderContext
→ Window-lifetime capability
→ before first managed insertion
→ at most once per HTMLElement

receiveRenderData
→ retained current data
→ initial + committed data updates
```

Context V1只提供 narrow `PresentationResourceClient`，复用 M12 Renderer-private ResourceClient 的 logical identity/version semantics。Business WC看不到 bearer/path/FSDB/privileged URL/private client。

M13不建立 AssetManager、dynamic component loader、global service locator或统一 RenderNode asset-ref schema。

---

## 12. Failure / Event Boundaries

Bootstrap failure阻止 Projector running。Runtime projection/receiver/resource failure是 presentation-local：

```text
no Store rollback
no Main/Subsystem authority mutation
no automatic Runtime/Frame failure
```

M13不定义 RenderEvent → WC/DOM ABI。

---

## 13. Dependency / Ownership Rules

禁止：

```text
Main → game-package / concrete launcher
Business Definition → renderer/browser/platform/protocol
Business WC → Render Store writer / Data carrier / Content credential
Renderer → DOM reverse-sync into Store
RenderNode → arbitrary module URL / loader capability
```

允许：

```text
Launcher → game-package
apps/* → matching launcher + roles + adapters
Business Definition → @loomrealm/subsystem
Business Web presentation → browser APIs + Web Presentation API v1
```

Business build/package topology不构成 LoomRealm runtime contract。

---

## 14. Phase Route

```text
M10 User Input                    closed
M11 Render Replication            closed
M12 Content                       closed
M13 Web Presentation              pending
M14 loom.map                      pending
M15 Desktop full E2E              pending
M16 PWA Runtime                   pending
M17 PWA full E2E/equivalence      pending
```

M13关闭通用但窄的 Web presentation seam；M14 `loom.map`成为首个真实 business/presentation consumer。
