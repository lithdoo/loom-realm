# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10+M11 Closed / M12 Preimplementation Frozen**  
> 主要定义：logical roles/modules、Runner/role-facing capabilities、Renderer/Data/Input/Render/Content 与 Desktop/PWA realization 入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 实施映射：[Phase 1 交付计划](../30-implementation/phase-1-delivery-plan.md)  
> 最近复核：2026-09-08

```text
module boundary != npm package boundary != protocol boundary != platform boundary
```

---

## 1. Module Map

| 模块 | 入口 | Current responsibility |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/Activation/InputTarget/DataAuthority/current Renderer authority |
| Web Renderer | [web-renderer](./web-renderer/README.md) | read-only Main mirror、Data reconciliation、M10 Input、M11 internal Render replica、M12 private resource client target |
| Game Package | [game-package](./game-package/README.md) | logical Game topology/common validation |
| FSDB Content legacy | [fsdb-content-service](./fsdb-content-service/README.md) | **Superseded**；current implementation由 M12_01–05 定义 |
| `loom.map` | [loom-map](./loom-map/README.md) | M13 ordinary platform-neutral Subsystem consumer；消费 frozen Input/Render/Content/Frame APIs |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Hostra Launcher/Runner/WS/Data Broker/M12 Content/M14 full composition |
| PWA | [pwa-host](./pwa-host/README.md) | PWA Launcher/Worker/MessagePort；M16 Content/full equivalence target |

Desktop/PWA 是同一 application architecture 的不同 physical realization。

---

## 2. Authority / Role Boundaries

```text
Main
    Session / Runtime / Frame / Stack / Activation
    InputTarget / Renderer currentness / DataAuthority

Subsystem
    business state / local Frame Context
    Desired Input Interest / retained author State
    Render authoritative Domains
    author-facing ContentClient usage

Renderer
    read-only Main mirror
    Input Producer/gate
    Render replica
    private resource bytes client

Platform Composition
    executable binding / Process-Worker-Window
    Control/Data physical provisioning
    Content service/binding/credential
```

保持：

```text
Frame != Runtime != Data != Render != Content lifecycle
Platform physical ownership != application authority
Content capability != executable resolver
```

---

## 3. Role-facing Capabilities Through M12

Main-facing：

```text
DeadlineScheduler
OpaqueMaterialGenerator
RuntimeHosting
RendererControlBinding?
DataConnectionAuthoritySink?
```

Renderer-facing/current role integration：

```text
RendererDataBinding
RendererInputSource             // M10 public role seam
Renderer-private ResourceClient // M12, not root public API
presentation environment        // M14/M16
```

Subsystem-facing：

```text
RuntimeControlBinding
SubsystemDataBinding
ContentClient                   // M12 author SDK
```

这些不是 universal Platform interface；capability只随真实 consumer冻结。M10/M11/M12均没有新增 `@loomrealm/platform-ports` surface。

---

## 4. M10 User Input — Closed

```text
Effective(F,A,C)
=
current matching Data
∧ Main InputTarget(S,F,A)
∧ current active Activation
∧ C ∈ Interest[F]
∧ Producer(C)
```

Subsystem author冻结 `createInputListener`；Renderer冻结 one construction-time `RendererInputSource` + current-Control subscription。Known-no-commit同 Activation恢复时 retained State convergence先于 recoverable `frame.call` rejection observable；Event不 replay。

Status：**Implemented / Qualified / Closed**。

---

## 5. M11 Render — Closed

Subsystem exact author surface：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
SubsystemScope.createRenderDomain(initialState)
RenderDomain.replace / emit / close
```

所有 author calls synchronous local-only；business Domain lifecycle独立于 Frame/Data carrier。Renderer Store挂 existing Data slot、internal-only；presentation留 M14。

Status：**Implemented / Qualified / Closed**。

---

## 6. M12 Content — Frozen / Pending Implementation

Current implementation baseline：

```text
M12_01_CONTENT_SERVICE.md
M12_02_SUBSYSTEM_CONTENT_CLIENT.md
M12_03_RENDERER_RESOURCE_CLIENT.md
M12_04_VERTICAL_INTEGRATION.md
M12_05_QUALIFICATION_CLOSURE.md
ADR 0030
```

Physical/data shape：

```text
Hostra PREPARE
→ current prepared installation view
→ @loomrealm/fsdb
→ private Content Index + manifest/version
→ apps/desktop Content Service
```

Consumers：

```text
Subsystem
    scope.content.record/resource

Renderer
    private resource(namespace,key,expectedVersion)
    → bytes + MIME + actual version
```

固定：

```text
contentVersion = sha256:<64 lowercase hex>
resource key may be hierarchical
Content credential remains Host-private
ordinary Content failure != Runtime/Frame failure
Renderer resource read != Render authority
```

不创建：

```text
@loomrealm/content
@loomrealm/content-service
generic Repository/StorageProvider
InstallationManager/global registry
AssetManager
```

旧 [FSDB Content Service 模块设计](./fsdb-content-service/README.md) 已标记 Superseded，不得作为 Current implementation source。

---

## 7. M13 `loom.map`

`loom.map` 当前模块文档已同步到 frozen author APIs：

```text
@loomrealm/map → @loomrealm/subsystem
```

M13 应真实组合：

```text
Frame/Call
M10 InputListener
M11 RenderDomain replace/emit/close
M12 ContentClient record/resource
```

如果 M13首次证明需要 `ContentClient.group()`，应以真实 consumer为依据最小 reopen author projection；不得 raw-fetch/FSDB旁路。

---

## 8. Physical Placement

```text
M14 Hostra Desktop
    BrowserWindow
    physical Renderer Control WS
    M9 Data Broker
    real DOM/Gamepad RendererInputSource
    M11 current Render replica → presentation
    M12 Renderer ResourceClient → resources

M16 PWA
    Window/Worker + MessagePort
    PWA Data provisioning
    same logical Input/Render/Content semantics
```

PWA可以使用 Fetch/Service Worker/OPFS/Cache，不复用 Node-only `@loomrealm/fsdb`；比较的是 logical Content response，不是 storage mechanics。

---

## 9. Current Milestones

```text
M6 Hostra Runtime             ✅
M7 Renderer Control           ✅
M8 Data role/core             ✅
M9 Desktop Data Broker        ✅
M10 User Input                ✅ Implemented / Qualified / Closed
M11 Render                    ✅ Implemented / Qualified / Closed
M12 Content                   Implementation Frozen / Preimplementation Closed / pending
M13 loom.map                  pending
M14 Desktop full E2E          pending
M15 PWA Runtime               pending
M16 PWA full E2E/equivalence  pending
```

Module tests验证 role semantics；protocol conformance由对应 contract负责；system E2E验证同一 logical scenario在不同 Platform realization下得到等价 business-observable result。

---

## 10. Abstraction Rule

模块文档不得为了未来可能用途重新引入已经由当前 closure删除的模型。特别禁止用旧 Experimental 文档恢复：

```text
runtime service locator
generic Content Repository
universal asset loader
Content storage adapter hierarchy
Renderer public Render Store
platform-specific business branch
```

遇到真实 consumer capability gap，按文档治理显式 reopen最小 owning boundary。
