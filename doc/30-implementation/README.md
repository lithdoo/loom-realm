# LoomRealm 实施计划目录

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Experimental  
> 主要定义：当前分包、Platform Composition 落地、测试和第一阶段交付入口  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-19

实施层描述如何落地当前架构/契约；内部机制可以调整，但不得改变上层 authority/lifecycle/recovery 语义。

## 当前 Tracking 文档

- [独立分包与发布架构](./package-architecture.md) — package/publish boundary 的权威来源；
- [仓库与目录方案](./repository-layout.md) — monorepo、role platform ports 与 composition root 布局；
- [测试策略](./testing-strategy.md) — protocol/role/adapter/platform equivalence；
- [第一阶段交付计划](./phase-1-delivery-plan.md) — vertical slice 与 Hostra/PWA 推进顺序。

---

## 当前实施前提

```text
Game Package v1
Desktop Node.js Launcher Profile v1
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1 Frozen
Renderer Control v1
Data Connection v1
User Input v1 (Frame Interest Registry)
Render Update v1
Content API v1

Platform Composition
    Hostra Desktop realization
    PWA realization
```

没有 Renderer Component Profile、Standard Input Mapping Profile、Content Access Profile、Range Profile、Event FIFO Profile 或 Desktop/PWA Data Bootstrap application protocol。

---

## Platform 实施基线

系统架构定义：

```text
Main / Renderer / Subsystem / Content
    = platform-neutral roles

Platform Composition
    = complete physical Session realization
```

实施层默认：

```text
apps/desktop
    Hostra Desktop composition root

apps/pwa
    PWA composition root
```

role packages 通过 role-facing Platform ports 消费基础设施；不自己寻找 Process/Worker/WebSocket/MessagePort。

```text
Subsystem-facing
    RuntimeControlBinding
    RendererDataBinding
    ContentClient

Renderer-facing
    RendererControlBinding
    RendererDataBinding
    ContentClient

Main-facing
    RuntimeHosting
    Control/Renderer hosting facilities
    DataConnectionBroker
    Content integration
```

这些 port names 是 implementation boundary；不要求一项对应一个 npm package。

---

## 分包基线

```text
能力一包
角色一包
技术 Adapter 一包
Platform Architecture 与 package boundary 分离
apps/desktop + apps/pwa 作为当前 composition roots
协议版本与 package semver 分离
```

当前目标包族：

```text
contract/capability
    @loomrealm/wire
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/data
    @loomrealm/content
    @loomrealm/game-package

runtime/role
    @loomrealm/main
    @loomrealm/subsystem
    @loomrealm/renderer
    @loomrealm/content-service

technical adapter
    @loomrealm/launcher-node
    @loomrealm/transport-websocket
    @loomrealm/transport-messageport
    @loomrealm/content-fs
    @loomrealm/content-http
    @loomrealm/content-service-worker

business
    @loomrealm/map
    @loomrealm/map-essentials

composition roots
    apps/desktop
    apps/pwa
    apps/cli
```

不因为 Platform Architecture 存在就预创建 `platform-hostra/platform-pwa` package；只有真实独立消费者出现才抽。

---

## Runtime / Frame

```text
Runtime Control Application Profile v1
    = Subsystem Control v1 + Frame / Call v1
```

关键：

```text
Control hello selects v1
Frame v1 statically bound
hello before Frame operation
shared sender-side Request ID namespace
one JSON-RPC message per transport unit
no JSON-RPC Batch
ready has no Data endpoint
```

Hostra Desktop 与 PWA 可以分别使用 WebSocket/MessagePort，但 role core 使用相同 RuntimeControlPlane semantics。

`@loomrealm/subsystem` author API 隐藏 activation/RPC/mutation gate；`Frame.params` 表示 initialize business params，User Input 独立存在。

---

## Renderer / Data

Renderer Control：Main 发布 full committed Authority Snapshot，不携 endpoint/ticket/MessagePort。

actual Data carrier：

```text
Main current DataAuthority(S,G)
→ Platform DataConnectionBroker
→ matching Renderer + Subsystem endpoints
→ Data Connection current/retired
```

Broker 不拥有 generation；Transport adapter 只负责具体 carrier mechanics。

---

## User Input

```text
Effective(F,A,C)
=
current Data Connection
∩ Main InputTarget(S,F,A)
∩ active/current Activation
∩ Interest[F]
∩ Producer availability
```

Interest publication：

```text
full Frame Interest Registry snapshot
fresh Data Connection registry empty
no mandatory Interest handshake
```

Frame suspension/fresh Activation 可以复用 `Interest[F]` configuration；old Activation Input State/Event 不复用。

Renderer 不解释 push/pop/call/return/unwind。

---

## Render

```text
Registry
Snapshot
Patch(R→R+1)
Event
```

`@loomrealm/subsystem` author surface 只表达 RenderDomain desired state/event/close；carrier/revision/reconnect publication 由 SDK 管理。

Render Domain lifecycle 不从 Frame/Data carrier 推导。

---

## Content

Content API 只定义 logical readonly semantics。

```text
Hostra Desktop → filesystem + localhost HTTP
PWA            → Fetch + Service Worker / OPFS
```

technical/platform binding 不改变 Content logical results。

---

## Business Portability

```text
@loomrealm/map
    → @loomrealm/subsystem
```

业务 package 不依赖 transport/launcher/platform app；同一 business definition 由 `apps/desktop` / `apps/pwa` 运行。

这是 Phase 1 跨平台验证的核心 consumer boundary。

---

## Conformance / Equivalence

测试分三层：

```text
protocol conformance
role/package + platform-port fakes
Hostra/PWA composition semantic equivalence
```

Hostra Desktop / PWA 对相同 abstract application trace 比较：

```text
Runtime lifecycle
Frame/Activation/outcomes
failure unwind
Renderer logical authority
Data current/retired state
User Input delivered messages
Render authoritative state
Content logical results
```

不比较 PID/Worker、WS URL/Port、HTTP/SW 等 physical trace。

---

## 当前实施顺序

```text
workspace / package skeleton
→ wire + game-package
→ runtime-control + main + subsystem + platform-port fakes
→ launcher-node + WebSocket + Hostra Runtime vertical slice
→ Frame / Control conformance
→ subsystem author capability model
→ renderer-control + data + renderer
→ Desktop Data broker / Renderer vertical slice
→ User Input Frame Interest Registry
→ Render Update
→ content + Desktop content adapters
→ loom.map
→ apps/desktop E2E
→ MessagePort / Service Worker + PWA ports
→ apps/pwa E2E
→ Hostra/PWA abstract-trace equivalence
```

治理原则：**只协议化必须互操作的事实；只拆分有独立能力、消费者和发布价值的 package；只让 Platform Composition 拥有物理 topology，不让 Platform 获得 application authority。**
