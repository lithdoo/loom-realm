# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、Subsystem Definition Module/Runner、Platform ports/adapters、Hostra Desktop/PWA composition 与关闭条件  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[仓库与目录方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-19

核心实施原则：

```text
platform-neutral business/module first
→ platform-neutral role core
→ role-facing Platform ports
→ platform-specific Runner/technical adapters
→ Hostra Desktop composition
→ PWA composition
→ shared abstract-trace equivalence
```

---

## 里程碑 0：文档/契约基线

当前基线：

```text
Game Package v1
    Descriptor = {key,module}
    module = package-local .mjs Subsystem Definition Module

Desktop Node.js Launcher / Runner v1
    Host-owned Runner process entry
    Runner imports descriptor.module

Subsystem Control v1
Runtime Control Profile v1
Frame / Call v1 Frozen
Renderer Control v1
Data Connection v1
Frame-scoped User Input v1
Render Update v1
Content API v1
```

Platform Architecture：

```text
Main / Renderer / Subsystem / Content = platform-neutral logical roles
Platform = complete physical Session realization
Transport != Platform
Business module != Runtime process/Worker entry
```

---

## 里程碑 1：Foundation + Wire + Game Package

优先：

```text
@loomrealm/foundation
@loomrealm/wire
@loomrealm/game-package
```

实现最小：

```text
MessageCarrier / MemoryCarrierPair
JSON / JSON-RPC wire primitives
Game Package Descriptor {key,module}
Definition Module logical path validation
complete Descriptor set validation
```

关闭：

```text
closed descriptor schema
key uniqueness
initial target validation
.mjs only
absolute/traversal/url/backslash rejection
zero Runtime side effect on descriptor-set failure
```

---

## 里程碑 2：Runtime Control + Subsystem Host Integration

实现：

```text
@loomrealm/runtime-control
@loomrealm/subsystem host/integration surface
Main/Subsystem role-facing Control ports
```

Control vertical slice：

```text
hello selects Control v1
shared Control+Frame sender request-id namespace
no Batch
Control loss classification
```

role tests全部先跑 MemoryCarrier/fake ports。

---

## 里程碑 3：Desktop Node Subsystem Runner

实现/接入 Desktop technical realization：

```text
validated descriptor.module resolver
Host-owned Node Subsystem Runner
Host-selected Node Runtime
process Supervisor
Runtime Control WebSocket adapter
Desktop Runner bootstrap context
```

流程：

```text
apps/desktop
→ resolve one test descriptor.module
→ spawn Host-owned Runner
→ Runner import Definition Module
→ establish Control
→ hello / ready
→ shutdown
→ actual process exit → stopped
```

关闭：

```text
business module is not process argv entry
Game Package cannot select Node/env/argv
invalid/missing default export fails bootstrap
spawn != connected != identified != ready
```

---

## 里程碑 4：Frame / Call v1 Vertical Slice

实现 Frozen Frame v1：

```text
Main-owned Frame/Stack/Activation/InputTarget
exact seven Requests
commit barriers
timeout/no-retry
lowest-root fixed-point unwind
accepted outcome preservation
fresh final Caller resume
```

Subsystem author surface至少：

```text
Frame.id
Frame.params
Frame.call(...)
```

业务不见 activationId/RPC/mutation gate。

---

## 里程碑 5：Subsystem Definition Module / Capability SDK

冻结：

```text
defineSubsystem(factory)
default-export SubsystemDefinitionFactory module ABI
per-instance SubsystemScope
Frame
InputListener
RenderDomain
ContentClient
AbortSignal/lifecycle hooks
```

目标 business module：

```ts
export default defineSubsystem(scope => ({ ... }));
```

关闭：

```text
no runtime.* service locator
no module-global current Subsystem
no Frame.input naming conflict
no author WebSocket/MessagePort surface
same Definition Module runs under two fake Platform-port realizations
```

---

## 里程碑 6：Main ⇄ Renderer Control + Renderer Ports

实现：

```text
@loomrealm/renderer-control
@loomrealm/renderer
Renderer-facing Control/Data/Content ports
```

full committed authority snapshot：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority
```

Renderer core只用 fake ports测试，不自己打开 WebSocket/MessagePort。

---

## 里程碑 7：Data Connection Core + Broker Boundary

实现：

```text
@loomrealm/data
```

Data Connection：

```text
identity = Session + current Renderer + subsystemKey + generation
lifecycle = current → retired
0..1 current per Subsystem
same-generation sequential reconnect
```

System DataConnectionBroker负责把 matching role-local connection capability交给 Renderer 与 Subsystem Runner，但不拥有 generation。

---

## 里程碑 8：Hostra Desktop Renderer/Data Vertical Slice

组合：

```text
Hostra Renderer Hosting
Renderer Control WebSocket
Desktop Data Connection Broker
Subsystem Runner-side Data provisioning
```

闭环：

```text
Renderer hello
→ DataAuthority(S,G)
→ broker provisions/binds carrier
→ Renderer + target Subsystem Runner install current connection
```

验证 Data loss不失败 Runtime/不 unwind Frame。

---

## 里程碑 9：User Input v1

实现：

```text
Subsystem → Renderer full Frame Interest Registry
Renderer → Subsystem State/Event/Reset with frameId+activationId
```

关闭：

```text
fresh Data registry empty
Interest-first/Authority-first converge
new child waits own Interest
caller resume reuses retained Interest
fresh Activation no old Input State/Event
state fresh baseline
event future-only
interest shrink drops late input
renderer does not interpret push/pop
```

---

## 里程碑 10：Render Update v1

实现：

```text
render.domains
render.snapshot
render.patch
render.event
```

Author API只表达 desired state/event/close；SDK维护 protocol domain identity/revision/publication/reconnect baseline。

---

## 里程碑 11：Content + Desktop Content

实现：

```text
@loomrealm/content
@loomrealm/content-service
filesystem/http adapters
```

保持：

```text
Definition Module executable capability != Content capability
```

业务/role使用统一 logical ContentClient。

---

## 里程碑 12：`@loomrealm/map`

`loom.map` 只依赖：

```text
@loomrealm/map → @loomrealm/subsystem
```

交付一个真正的：

```text
subsystems/loom-map/subsystem.mjs
```

或等价构建输出，default export统一 Definition Module ABI。

不包含 Desktop/PWA bootstrap分支。

---

## 里程碑 13：Desktop E2E

```text
Game Package {key,module}
→ Node Runner loads same business module
→ required Runtime ready
→ initial Frame
→ map input/render/content
→ nested call/return
→ Data reconnect
→ Renderer reload
→ shutdown
```

---

## 里程碑 14：PWA Worker Runner + Platform Adapters

实现：

```text
Dedicated Worker Runtime Hosting
PWA Worker Subsystem Runner
MessagePort Runtime/Renderer Control
MessageChannel Data Broker
Service Worker/Fetch Content
```

Worker Runner加载与 Desktop **同一个 descriptor.module / Definition Module ABI**。

不建立 Worker-specific Game Package Descriptor。

---

## 里程碑 15：PWA E2E + Cross-platform Equivalence

同一：

```text
Game Package logical Descriptor set
Subsystem Definition Modules
business inputs
failure/reconnect scenario
```

分别跑 Hostra/PWA，并比较：

```text
Runtime lifecycle
Frame/Activation/outcomes
failure unwind
Renderer authority
Data current/retired state
User Input delivered logical messages
Render authoritative state
Content logical results
```

不比较 PID/Worker id、WS URL/MessagePort、HTTP/SW internals。

---

## Phase 1 Final Acceptance

- Game Package v1只有 platform-neutral `{key,module}`；
- same Definition Module可由 Node Runner与Worker Runner加载；
- business module不是 Process/Worker bootstrap glue；
- role packages platform-neutral；
- Foundation/Wire边界稳定；
- Control/Frame conformance通过；
- Renderer/Data/Input/Render/Content闭环；
- Platform broker/runner不获得 application authority；
- `@loomrealm/map`无平台分支；
- Desktop/PWA E2E通过；
- shared abstract trace logical outcome等价。

---

## Deferred

Save、untrusted executable sandbox、automatic Runtime restart、lazy/optional Subsystem、multiple Runtime per key、remote Runtime、多 Renderer、Frame migration/replay、Render history replay、以及没有真实消费者的预测性 platform/helper package。
