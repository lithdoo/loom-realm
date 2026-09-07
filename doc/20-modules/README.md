# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10 Closed / M11 implementation slice Frozen**  
> 主要定义：logical roles/modules、Runner/role-facing capabilities、Renderer/Data/Input/Render 与 Desktop/PWA realization 入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)  
> 实施映射：[Phase 1 交付计划](../30-implementation/phase-1-delivery-plan.md)  
> 最近复核：2026-09-07

```text
module boundary != npm package boundary != protocol boundary != platform boundary
```

---

## 1. Module Map

| 模块 | 入口 | Current responsibility |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/Activation/InputTarget/DataAuthority/current Renderer authority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | read-only Main mirror、Data reconciliation、M10 Input role、M11 internal Render receiver Store |
| Game Package | [game-package](./game-package/README.md) | logical Game topology/common validation |
| FSDB Content | [fsdb-content-service](./fsdb-content-service/README.md) | readonly Content implementation |
| `loom.map` | [loom-map](./loom-map/README.md) | ordinary platform-neutral Subsystem consumer |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Hostra Launcher/Runner/WS/Data Broker/Content composition |
| PWA | [pwa-host](./pwa-host/README.md) | PWA Launcher/Worker/MessagePort/Broker/Content composition |

Desktop/PWA 是同一 application architecture 的不同 physical realization。

---

## 2. Launch / Runner Boundary

```text
Game Entry logical topology
→ current Platform Launcher
→ platform manifest exact join + preflight
→ immutable PlatformLaunchPlan
→ Host-owned Runner
→ selected Subsystem Definition Module
→ @loomrealm/subsystem/host
```

Game Package/Main不拥有 executable path；Launcher/Runner physical ownership不产生 Frame/Data/Input/Render authority。

---

## 3. Role-facing Capabilities

```text
Main-facing
    DeadlineScheduler
    OpaqueMaterialGenerator
    RuntimeHosting
    RendererControlBinding?
    DataConnectionAuthoritySink?

Renderer-facing
    RendererDataBinding
    RendererInputSource
    presentation environment (M14)

Subsystem-facing
    RuntimeControlBinding
    SubsystemDataBinding
    ContentClient (M12)
```

M10/M11 都不新增 `@loomrealm/platform-ports` surface。

---

## 4. Authority / Lifetime

```text
Main
    Frame / Stack / Activation / InputTarget / DataAuthority

Subsystem
    business state / local Frame Context
    Desired Interest / retained Input State
    business Render Domains

Renderer
    read-only Main mirror
    Producer facts / Input sender gate
    current Render replica + optional stale presentation cache
```

保持：

```text
Frame != Runtime != Data != Render lifecycle
business Render Domain != wire Render Domain != carrier
Data carrier != capability lifetime
```

---

## 5. Completed Control / Data Baseline

```text
M7 Renderer Control ✅
M8 Data role/core   ✅
M9 Desktop Broker  ✅
M10 User Input     ✅ Implemented / Qualified / Closed
```

M11 只能建立在这些 frozen/qualified currentness与 Data lifecycle 之上；不得修改它们换取 Render 实现便利。

---

## 6. Frozen M10 Input Projection

```text
SubsystemScope.createInputListener
Desired Interest / retained State
RendererInputSource
Effective = Data × InputTarget × active F/A × Interest × Producer
State/Event/Reset bounded publication
```

Mutation-gate convergence、handler ordering/async isolation、fresh Data baseline等均已 M10 qualified，不属于 M11 设计面。

---

## 7. Frozen M11 Subsystem Render Projection

Exact author boundary：

```text
SubsystemScope.createRenderDomain(initialState) → RenderDomain
RenderDomain.replace(state): void
RenderDomain.emit(event): void
RenderDomain.close(): void
```

Root新增类型只包括：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
```

固定：

```text
one internal RenderManager
all author calls synchronous local-only
validate → detach → atomic local commit
successful state/event always Frozen-v1 representable
live business Domains <= 256
SDK domainId not reused within Runtime instance
business Node key one-shot within business RenderDomain lifetime
Frame/Data do not own Domain lifetime
```

不得创建 public RenderManager、Frame→Domain registry、identity translation layer或 generic Store/EventBus。

---

## 8. Frozen M11 Publication / Renderer Projection

Subsystem publication：

```text
fresh current Data
→ render.domains
→ fresh Snapshot each current Domain
→ Patch/Snapshot/Event
```

same-generation reconnect保留 wire emitted identity history，重建 carrier-local Registry/baseline/revision。

Event：

```text
no carrier → not retained for future carrier
unbaselined current carrier → MAY bounded-pend behind establishing Snapshot
carrier loss/domain removal → pending Event discarded
never replay
```

Renderer：

```text
existing Data slot
→ internal Render Store
→ atomic Registry/Snapshot/Patch
→ Event deliver/drop
```

M11 不新增 public Renderer Render/subscription API。Authoritative invalidity → Data protocol-fatal；well-formed stale Event → drop only。

---

## 9. Render / Content / Presentation Split

```text
M11 Render
    business authority + wire publication + current replica

M12 Content
    readonly logical Content capability / resource resolution

M14 Desktop presentation
    BrowserWindow/DOM/etc consuming M11 replica + M12 Content
```

不得把 component registry、resource resolver、DOM semantics提前塞入 M11。

---

## 10. Physical Placement

```text
M14 Hostra Desktop
    BrowserWindow
    physical Renderer Control WS
    M9 Data Broker
    real RendererInputSource
    M11 Render replica → presentation
    M12 Content → resources

M16 PWA
    Window/Worker + MessagePort
    PWA Data provisioning
    same logical Input/Render/Content semantics
```

M11 conformance只 claim `subsystem-sender` + `renderer-receiver`；包含 Hostra/PWA trace equivalence 的 `transport` role 留 M16。

---

## 11. Current Milestones

```text
M6 Hostra Runtime             ✅
M7 Renderer Control           ✅
M8 Data role/core             ✅
M9 Desktop Data Broker        ✅
M10 User Input                ✅ Implemented / Qualified / Closed
M11 Render                    Implementation Frozen / Ready
M12 Content                   pending
M13 loom.map                  pending
M14 Desktop full E2E          pending
M15 PWA Runtime               pending
M16 PWA full E2E/equivalence  pending
```

M11 实现遇到困难默认只能调整 private realization；public API、authority/lifetime、identity/error、publication/receiver semantics与 qualification shape已冻结。
