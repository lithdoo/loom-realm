# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：逻辑 role/modules、Runner/role-facing Platform ports、Renderer Data Profile 与 Desktop/PWA realization 入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)  
> 实施映射：[独立分包与发布架构](../30-implementation/package-architecture.md)  
> 最近复核：2026-08-19

模块层描述运行职责/拓扑，不等于 npm package 清单。

```text
module boundary != npm package boundary != protocol boundary != platform boundary
```

---

## 1. Module Map

| 系统/模块 | 入口 | 说明 |
|---|---|---|
| Main | [main-system](./main-system/README.md) | Runtime/Frame/DataAuthority authority、transaction/unwind；消费 Main-facing ports |
| Web Renderer | [web-renderer](./web-renderer/README.md) | Control mirror、RendererDataBinding、Input/Render replica/presentation |
| Game Package | [game-package](./game-package/README.md) | `{key,module}`、Definition Module/installation validation、Catalog/Repository |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | Desktop/PWA readonly Content API implementation |
| `loom.map` | [loom-map](./loom-map/README.md) | 普通 platform-neutral Subsystem Definition Module |
| Hostra Desktop | [desktop-host](./desktop-host/README.md) | Node Runner、WS、Runner provisioning IPC、Data Broker、HTTP/fs |
| PWA | [pwa-host](./pwa-host/README.md) | Worker Runner、MessagePort、Worker provisioning、Data Broker、SW/OPFS |

Desktop/PWA 是同一 Platform Composition 的两个 realization，不是两套 application model。

---

## 2. Definition Module / Runner

业务 artifact：

```text
Subsystem Definition Module
    default export SubsystemDefinitionFactory
```

Platform artifact：

```text
Host-owned Subsystem Runner
    → load Definition Module
    → construct role-local ports
    → run @loomrealm/subsystem/host
```

```text
Hostra → Node Runner
PWA    → Worker Runner
```

Definition Module != Runtime process/Worker entry policy。

---

## 3. Role / Platform Ports

```text
Platform Composition
├── Main-facing ports
├── Renderer-facing ports
│   └── RendererDataBinding
├── Subsystem-facing ports
│   └── RuntimeControlBinding / SubsystemDataBinding / ContentClient
└── Content-facing integration
```

Role package不直接发现 WebSocket/MessagePort/Process/Worker。

Runner/provisioning把物理基础设施转换为这些 role-local ports。

---

## 4. Runtime / Frame / Data / Render

```text
Runtime Container
    Host-owned Runner + business Definition instance

Frame
    Main-owned call/input Context

Input Interest
    Subsystem-owned Interest[F]

Render Domain
    Subsystem-owned presentation state

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

## 5. Runtime Control

```text
Runtime Control Profile v1
= Subsystem Control v1 + Frame / Call v1
```

```text
one dispatcher
shared sender Request ID namespace
one UTF-8 JSON text application unit
no Batch/no retry
```

`ready` 不携 Data material。

---

## 6. Renderer Data

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

Renderer/Subsystem各自只有一个 Data dispatcher读取 carrier，再 demux `input.*` / `render.*`。

---

## 7. User Input

```text
Effective(F,A,C)
=
current Data
∧ Main InputTarget(S,F,A)
∧ current active Activation
∧ C ∈ Interest[F]
∧ Producer(C)
```

Interest是 Frame-scoped config，不是 authority。

fresh Activation可复用 Interest config但不复用 old Input State/Event；fresh Data remote registry/state empty。

---

## 8. FrameOutcome Author Projection

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

## 9. Platform Provisioning

Late Data provisioning属于 Platform infrastructure：

```text
Hostra
    Broker → Runner IPC → Data WS → SubsystemDataBinding

PWA
    Broker → Worker provisioning path → transferred Port → SubsystemDataBinding
```

Provisioning不是 Runtime Control/Data application/business protocol，failure也不自动失败 Runtime/Frame。

---

## 10. Business Portability

```text
@loomrealm/map
    → @loomrealm/subsystem
```

业务 package不依赖 `/host`、transport、Runner或 Platform composition。

相同 Definition Module在 Hostra/PWA Runner下运行。

---

## 11. Package / Adapter Mapping

```text
low-level
    @loomrealm/wire
    @loomrealm/foundation

role/capability
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/data
    @loomrealm/content
    @loomrealm/main
    @loomrealm/subsystem
    @loomrealm/renderer

technical/platform integration
    launcher-node
    transport-websocket
    transport-messageport
    content adapters
    Runner/provisioning helper only when real reuse justifies it

composition roots
    apps/desktop
    apps/pwa
```

Platform Architecture不自动等于 platform package。

---

## 12. Cross-platform Rules

Platform/Adapter MUST NOT：

```text
改变 Control/Frame transaction semantics
retry ambiguous Frame mutation
让 Runtime-fatal重新进入 business continuation
从 endpoint/Port推导 DataAuthority
在同 generation静默换 dataProfile
用 Data reconnect恢复 Frame authority
用 Structured Clone扩大 application payload model
从 Render/Interest产生 InputTarget
```

Hostra/PWA 对相同 Definition Module + abstract trace必须得到等价 logical outcome。

---

## 13. Conformance

协议 conformance由最接近 capability package的 fixtures负责；模块级测试验证 authority projection、port wiring、Runner/provisioning和 business semantics。

系统级必须验证：

```text
same Definition Module
same logical Frame/Input/Render/Content scenario
Hostra/PWA equivalent application result
```
