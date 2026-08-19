# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：第一阶段实施顺序、Platform port/adapter 落地、Hostra Desktop/PWA composition 与关闭条件  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[仓库与目录方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-19

第一阶段采用“协议足够成熟后进入开发，在实现中继续细化非核心 wire 边界”的节奏。

核心实施原则：

```text
platform-neutral application roles first
→ role-facing platform ports
→ technical adapters
→ Hostra Desktop composition
→ PWA composition
→ cross-platform abstract-trace equivalence
```

---

## 里程碑 0：文档、契约与 Platform Architecture 基线

已确认：

```text
Game Package v1
Desktop Node.js Launcher v1
Subsystem Control v1
Runtime Control Profile v1
Frame / Call v1 Frozen
Renderer Control v1
Data Connection v1
Frame-scoped User Input v1
Render Update v1
Content API v1
```

系统级 Platform Composition 已确认：

```text
Main / Renderer / Subsystem / Content = platform-neutral logical roles
Platform = complete physical Session realization
role-local bindings = Platform ports projection
Transport != Platform
Platform Architecture != platform npm package
apps/desktop + apps/pwa = current composition roots
```

不新增 Hostra/PWA application protocol。

---

## 里程碑 1：Workspace + Game Package + Runtime Control 基础

优先 workspace：

```text
@loomrealm/wire
@loomrealm/game-package
@loomrealm/runtime-control
@loomrealm/main
@loomrealm/subsystem
@loomrealm/launcher-node
@loomrealm/transport-websocket
```

实现：

```text
Descriptor Loader / Validator
Entry Resolver
Runtime Control schemas/dispatcher
Control+Frame shared ID namespace
Subsystem-side RuntimeControlPlane
Main-side Runtime Registry / Launch Attempt
```

同时先定义最小 Main/Subsystem platform port interfaces 和 in-memory fakes；不要让 role code 直接依赖 Node/WebSocket。

关闭：

```text
hello selects Control v1
launch != connected != identified != ready
ready has no Data endpoint
stopped only from supervisor observation
unexpected exit/control loss fails Runtime
no same-attempt reconnect/restart
role core tests run entirely with fake ports
```

---

## 里程碑 2：Hostra Desktop Runtime Hosting Vertical Slice

实现/接入：

```text
launcher-node
transport-websocket
Hostra/Desktop app-local RuntimeHosting glue
RuntimeControlHost/Binding
process Supervisor integration
Desktop bootstrap material injection
```

目标：

```text
apps/desktop
→ launch one test Subsystem process
→ establish Control WebSocket
→ hello / ready
→ shutdown
→ actual process exit → stopped
```

Hostra Shell RPC 与 LoomRealm Runtime Control 必须保持协议域分离。

---

## 里程碑 3：Frame / Call v1 Vertical Slice + Conformance

实现 Frozen Frame v1：

```text
Main-owned Frame/Stack/Activation/InputTarget
exact seven Requests
closed schema
commit barriers
timeout/no-retry
lowest-root fixed-point unwind
accepted outcome preservation
fresh final Caller resume
```

`@loomrealm/subsystem` author surface：

```text
Frame.id
Frame.params
Frame.call(...)
handler normal resolution → frame.return
```

业务不见 `activationId` / RPC / mutation gate。

关闭：Main、Subsystem、WebSocket adapter 通过适用 fixtures，并跑通 initial Frame → nested call → return/resume → shutdown。

---

## 里程碑 4：Subsystem SDK Scope / Capability Model

冻结最小 author API：

```text
defineSubsystem(factory)
per-instance SubsystemScope
Frame
createInputListener({frame,...})
createRenderDomain(...)
ContentClient
AbortSignal/lifecycle hooks
```

内部结构：

```text
RuntimeControlPlane
RendererDataPlane
FrameRegistry
InputManager
RenderManager
Subsystem Platform Ports
```

关闭：

```text
no runtime.* service locator
no module-global current Subsystem
no Frame.input naming conflict
no author WebSocket/MessagePort surface
same definition can run with two fake Platform port implementations
```

---

## 里程碑 5：Main ⇄ Renderer Control + Renderer Role Ports

新增/实现：

```text
@loomrealm/renderer-control
@loomrealm/renderer
RendererControlBinding port
RendererDataBinding port
```

实现 full committed authority snapshot：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority
```

必须保持：

```text
ACK-before-publication
InputTarget one-shot
DataAuthority has no endpoint/token/Port
Control loss revokes old Renderer input/Data authority usage
Renderer does not compute failure unwind
```

Renderer core 用 fake ports 完成 unit/integration，不直接打开 WebSocket/MessagePort。

---

## 里程碑 6：Data Connection Core + System Data Broker Boundary

新增：

```text
@loomrealm/data
```

Data Connection Core：

```text
identity = Session + current Renderer + subsystemKey + generation
lifecycle = current → retired
max one current carrier
same-generation sequential reconnect
```

同时定义 app/composition 所需 DataConnectionBroker implementation boundary：

```text
Main current DataAuthority
→ broker establishes matching Renderer + Subsystem endpoints
```

Broker 不进入 `@loomrealm/subsystem` author surface，也不拥有 generation。

---

## 里程碑 7：Hostra Desktop Renderer/Data Vertical Slice

在 `apps/desktop` 组合：

```text
Hostra Renderer Hosting
Renderer Control WebSocket binding
Desktop Data Connection Broker
transport-websocket
```

闭环：

```text
Renderer hello
→ Authority Snapshot
→ Main DataAuthority(S,G)
→ broker provisions authenticated localhost carrier
→ Renderer/Subystem install current Data Connection
```

验证 Data loss 不失败 Runtime/不 unwind Frame；same-generation fresh carrier 正确重建。

---

## 里程碑 8：User Input v1

实现 Frame Interest Registry：

```text
Subsystem → Renderer
    full replacement InterestRegistry<frameId, channels>

Renderer → Subsystem
    State / Event / Reset carrying frameId + activationId
```

关闭：

```text
fresh Data connection registry empty
no mandatory Interest handshake
Interest-first/Authority-first converge
new child waits own Interest
suspended caller Interest retained
fresh Activation reuses Interest config
fresh Activation does not reuse Input State/Event
state false→true fresh baseline
event false→true future-only
interest shrink drops late input
renderer does not interpret push/pop
```

`@loomrealm/subsystem` InputListener 自动聚合/republish registry；business 不见 Data reconnect。

---

## 里程碑 9：Render Update v1 + Renderer

实现：

```text
render.domains
render.snapshot
render.patch
render.event
```

`@loomrealm/subsystem` author API 只表达：

```text
createRenderDomain
set(desired state)
event
close
```

SDK 自己维护 protocol domain identity/publication/reconnect baseline。

关闭：

```text
Domain one-shot lifecycle
Patch atomic revision chain
fresh carrier Registry + Snapshots
Frame close does not auto-destroy Domain
Data reconnect hidden from business
```

---

## 里程碑 10：Content + Hostra Desktop Content

新增/实现：

```text
@loomrealm/content
@loomrealm/content-service
@loomrealm/content-fs
@loomrealm/content-http
```

Desktop composition：

```text
filesystem-backed service
localhost HTTP
credential injection
```

业务/role 使用统一 logical ContentClient。

---

## 里程碑 11：`@loomrealm/map` 普通 Business Subsystem

`loom.map` 必须只依赖：

```text
@loomrealm/map
    → @loomrealm/subsystem
```

实现：

```text
business Frame handlers
world/session state
InputListener consumers
RenderDomain desired state
Content client
Essentials/RMXP compatibility integration
```

不得重新实现 Control/Frame/Data adapters 或平台分支。

关闭：在 fake platform 与 Hostra Desktop 上均运行相同 map definition。

---

## 里程碑 12：`apps/desktop` 完整闭环

Hostra Desktop Composition：

```text
Runtime Hosting       Node child process
Runtime Control       WebSocket
Renderer Hosting      Hostra BrowserWindow
Renderer Control      WebSocket
Data Broker           authenticated localhost carrier
Content               fs + HTTP
```

E2E：

```text
Game Package
→ required Runtime ready
→ initial Frame
→ map input/render/content
→ nested call/return
→ Data reconnect
→ Renderer reload
→ shutdown
```

---

## 里程碑 13：PWA Platform Ports / Adapters

按真实需要新增：

```text
@loomrealm/transport-messageport
@loomrealm/content-service-worker
```

实现 PWA ports：

```text
RuntimeHosting        Dedicated Worker
RuntimeControlBinding MessagePort
RendererControlBinding MessagePort
DataConnectionBroker MessageChannel / Port transfer
ContentBinding        Fetch / Service Worker / OPFS
```

不建立第二套 application protocol。

---

## 里程碑 14：`apps/pwa` + Cross-platform Equivalence

运行与 Desktop 相同的 logical scenario/business Subsystem definition。

比较：

```text
Runtime public lifecycle
Frame/Activation/outcome
failure unwind result
Renderer logical authority
Data current/retired lifecycle
User Input delivered logical messages
Render authoritative state
Content logical response
```

不比较 PID/Worker id、WS URL/MessagePort、HTTP/Service Worker 等物理 trace。

关闭条件：同一 abstract trace logical outcome 等价。

---

## 第一阶段最终验收

- role packages platform-neutral；
- Platform ports 边界清晰且可用 in-memory fakes；
- technical adapters 不拥有 application authority；
- Game Package / Launcher / Control / Runtime Profile 实现；
- Frame v1适用角色通过 conformance；
- Renderer Control authority闭合；
- system Data broker 正确绑定 current Session/Renderer/subsystem/generation；
- User Input 使用 Frame Interest Registry 并闭合 activation/reconnect semantics；
- Render Update Registry/Snapshot/Patch/Event 跑通；
- Content logical API跨平台一致；
- `@loomrealm/map` 只依赖 `@loomrealm/subsystem`，无平台分支；
- Hostra Desktop E2E通过；
- PWA E2E通过；
- 两个平台对共享 abstract trace 的 logical outcome 等价。

---

## 暂缓

Save System、不可信 executable Sandbox、第二 Launcher、automatic Runtime restart、Control heartbeat、lazy recycle、多 Runtime per key、多 Renderer、Frame migration、Activation reuse、caller-driven cancellation、Frame replay/resync、Render history replay、cross-Domain transaction，以及没有真实独立消费者的预测性 `platform-*` package。
