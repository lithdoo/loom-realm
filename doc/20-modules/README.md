# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：logical roles/modules、Game/Platform launch boundary、Runner/role-facing Platform capabilities、Renderer Control/Data 与 Desktop/PWA realization 入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 实施映射：[独立分包与发布架构](../30-implementation/package-architecture.md)  
> 最近复核：2026-09-03

模块层描述运行职责/拓扑，不等于 npm package 清单。

```text
module boundary != npm package boundary != protocol boundary != platform boundary
```

---

## 1. Module Map

| 系统/模块 | 入口 | 说明 |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Session/Runtime/Frame/DataAuthority/current Renderer authority、transaction/unwind；只发 logical Runtime/Renderer authority facts |
| Web Renderer | [web-renderer](./web-renderer/README.md) | read-only Main Control mirror、RendererDataBinding、Input/Render replica/presentation |
| Game Package | [game-package](./game-package/README.md) | `{key}` logical topology、initial input、common validation |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | Desktop/PWA readonly Content API implementation |
| `loom.map` | [loom-map](./loom-map/README.md) | 普通 platform-neutral Subsystem Definition consumer |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Hostra manifest/plan、Node Runner、WS、Runner provisioning IPC、Data Broker、HTTP/fs |
| PWA | [pwa-host](./pwa-host/README.md) | PWA manifest/plan、Worker Runner、MessagePort、Worker provisioning、Data Broker、SW/OPFS |

Desktop/PWA 是同一 Platform Composition Architecture 的两个 realization，不是两套 application model。

---

## 2. Game / Platform Launch Boundary

```text
Game Entry
    {key...} + initial target/input
        │
        ├──► Main logical topology
        │
        └──► Current Platform Launch Planner
                + launch.hostra.json / launch.pwa.json
                → exact key-set join
                → resolve all executable bindings
                → hosting/security preflight
                → immutable PlatformLaunchPlan
```

Game Package不拥有 `module`；Main也不接触 module/path/URL。

Launcher profile/package拥有 executable binding，但不因此获得 Frame/Data/Renderer/Content application authority。

---

## 3. Definition Module / Runner

业务 artifact：

```text
Subsystem Definition Module
    .mjs
    default export SubsystemDefinitionFactory
```

Platform artifact：

```text
Host-owned Subsystem Runner
    → lookup frozen PlatformLaunchPlan binding
    → load exact selected Definition Module
    → construct role-local ports
    → run @loomrealm/subsystem/host
```

```text
Hostra → Node Runner
PWA    → Worker Runner
```

Definition Module != Runtime process/Worker entry policy。

Hostra/PWA MAY选择不同 artifact；相同 ABI/formal semantics/business-observable result才是 requirement。

---

## 4. Role / Platform Capabilities

Role-facing capability只随真实 consumer冻结；下面不是 universal `Platform` interface。

```text
Platform Composition
├── Main-facing
│   ├── DeadlineScheduler
│   ├── OpaqueMaterialGenerator
│   ├── RuntimeHosting
│   └── RendererControlBinding?       // M7 Frozen optional capability
│
├── Renderer-facing (current/future)
│   ├── RendererDataBinding           // M8+
│   ├── ContentClient                 // M12+
│   └── presentation/input environment
│
└── Subsystem-facing
    ├── RuntimeControlBinding
    ├── SubsystemDataBinding          // M8+
    └── ContentClient                 // M12+
```

M7 `RendererControlBinding` 是 Main-facing **candidate-slot + already-established carrier** capability：Main issue token → Binding arms one slot → physical candidate binds → renderer-control hello/version → Main grants currentness。

它不是 Renderer-facing API，也不是 `RendererHosting` / `RendererControlHost` service。Renderer Window/BrowserWindow 的创建、显示、reload、销毁属于 Hostra/PWA concrete composition，M14/M16 才做 physical realization。

Role package不直接发现 WebSocket/MessagePort/Process/Worker。Runner/provisioning把物理基础设施转换为窄 role-local capability。

Launcher package主要实现 Main-facing RuntimeHosting + Subsystem Runner integration；不吞并完整 Platform capabilities。

---

## 5. Runtime / Frame / Data / Render

```text
Runtime Container
    Host-owned Runner + one business Definition instance

Frame
    Main-owned call/input Context

Input Interest
    Subsystem-owned Interest[F]

Render Domain
    Subsystem-owned presentation authoritative state

Data Connection
    Session/current Renderer/subsystem/generation
    + immutable dataProfile for authority epoch
```

保持：

```text
Frame lifecycle != Runtime/Data/Render lifecycle
Activation lifetime != Interest lifetime
carrier lifetime != capability lifetime
```

---

## 6. Runtime Control

```text
Runtime Control Profile v1
= Subsystem Control v1 + Frame / Call v1
```

```text
one dispatcher
shared sender Request ID namespace
one UTF-8 JSON text application unit
no Batch
no application retry
```

`ready` 不携 Data material、Platform executable binding或 Renderer state。

---

## 7. Renderer Control — M7 Frozen

```text
Main committed Runtime/Frame/Activation/InputTarget/DataAuthority authority
→ RendererAuthoritySnapshotV1
→ renderer.hello id=1 / renderer.state
→ current Renderer local mirror
```

Ownership：

```text
Main
    token / current Renderer / revision / source authority

@loomrealm/renderer-control
    hello schema + version negotiation
    Snapshot validation
    ordering / bounded publication / terminal

Renderer
    local {peer,snapshot}|null holder only

Platform
    optional RendererControlBinding candidate carrier establishment
```

Renderer local holder不是 Main remote-currentness proof；M7 不建立 Store framework、lease/epoch/heartbeat、Data/Input/Render implementation。

M7 Main `dataAuthorities=[]`；真实 Data policy从 M8开始。

---

## 8. Renderer Data

```text
Renderer Data Application Profile v1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Main发布：

```text
DataAuthority {subsystemKey,generation,dataProfile}
```

Platform Broker实现 matching physical carrier；profile改变必须 fresh generation。

Renderer/Subsystem各自只有一个 connection-wide Data dispatcher读取 carrier，再 demux `input.*` / `render.*`。

```text
Data loss/provisioning failure != Runtime failure/Frame unwind
```

---

## 9. User Input

```text
Effective(F,A,C)
=
current matching Data
∧ Main InputTarget(S,F,A)
∧ current active Activation
∧ C ∈ Interest[F]
∧ Producer(C)
```

Interest是 Frame-scoped config，不是 authority。

fresh Activation可复用 Interest config但不复用 old Input State/Event；fresh Data remote registry/state empty。

SDK local receive gate还必须验证 Frame owner/current Activation/channel/mutation gate。

---

## 10. FrameOutcome Author Projection

`@loomrealm/subsystem` author API必须与 Frame v1 Outcome一一对应：

```text
completed(value)
cancelled()
failed(error)
```

`frame.call()`：

```text
child terminal Outcome → resolve FrameOutcome
pre-commit recoverable rejection → typed reject, current Activation remains valid
Runtime-fatal/ambiguous → never re-enter business continuation
```

Module/Business文档不得重新发明另一套 raw-value/exception映射。

---

## 11. Platform Provisioning

Late Data provisioning属于 Platform infrastructure：

```text
Hostra
    Broker → Runner IPC → Data WS → SubsystemDataBinding

PWA
    Broker → Worker provisioning path → transferred Port → SubsystemDataBinding
```

Provisioning不是 Runtime Control、Renderer Control、Platform Launch Manifest或 Data application/business protocol，failure也不自动失败 Runtime/Frame。

Launcher package可以提供 Runner-side provisioning integration point，但 DataConnectionBroker仍是 system-level Platform coordination responsibility。

---

## 12. Business Portability

```text
@loomrealm/map
    → @loomrealm/subsystem
```

业务 package不依赖：

```text
@loomrealm/subsystem/host
game-launcher-hostra/pwa
transport
Runner
Platform composition
launch.hostra.json / launch.pwa.json
```

Business source保持 platform-neutral；build可生成 Hostra/PWA不同 artifact，由各自 manifest绑定。

---

## 13. Package / Adapter Mapping

```text
low-level
    @loomrealm/wire
    @loomrealm/foundation

contract/capability
    @loomrealm/game-package
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/data
    @loomrealm/content

role
    @loomrealm/main
    @loomrealm/subsystem
    @loomrealm/renderer
    @loomrealm/content-service

runtime launch integration
    @loomrealm/game-launcher-hostra
    @loomrealm/game-launcher-pwa

technical/platform integration
    current concrete transport/content/Runner implementations

composition roots
    apps/desktop
    apps/pwa
    apps/cli
```

Platform Architecture不自动等于 platform mega-package。

---

## 14. Cross-platform Rules

Platform/Adapter/Launcher MUST NOT：

```text
改变 Control/Frame transaction semantics
retry ambiguous Frame mutation
让 Runtime-fatal重新进入 business continuation
从 endpoint/Port推导 DataAuthority
在同 generation静默换 dataProfile
用 Data reconnect恢复 Frame authority
用 Structured Clone扩大 application payload model
从 Render/Interest产生 InputTarget
让 Main接触 module/path/URL
让 Platform manifest替换 Host-owned Runner/security policy
建立 Host/PWA-specific Renderer currentness protocol
```

Hostra/PWA 对相同 logical Game/topology/scenario必须得到等价 logical outcome；不要求相同 Definition artifact/physical trace。

---

## 15. Milestone Placement

```text
M6   Hostra Runtime/Runner physical vertical ✅
M7   logical Renderer Control + Binding contract / role integration
M8   Data role integration
M9   Desktop Data Broker/provisioning core
M10  Input
M11  Render
M12  Content
M14  Hostra BrowserWindow + physical Renderer Control + full Desktop E2E
M15  PWA Runtime/Worker vertical
M16  PWA Renderer Control + Data Broker/bindings + Content + full equivalence
```

M9 不等于 Desktop full Renderer composition；M16 也不能只完成 Renderer Control MessagePort 就宣告 full PWA E2E。

---

## 16. Conformance

协议 conformance由最接近 capability package的 fixtures负责；模块级测试验证 authority projection、port wiring、Runner/provisioning和 business semantics。

系统级必须验证：

```text
same logical Game Entry
platform-specific Hostra/PWA Launch Manifests
exact key-set join
all-preflight-before-first-runtime-side-effect
Main launch request has no executable material
Host-owned Runner loads planned Definition Module
M7 Renderer Control optional-capability/currentness semantics
same logical Frame/Input/Render/Content scenario
equivalent application result
```
