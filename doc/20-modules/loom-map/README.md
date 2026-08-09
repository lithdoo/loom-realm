# `loom.map` 地图 Subsystem 模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：第一阶段地图 Subsystem 的内部模块和协议适配  
> 依赖：[Subsystem Control v1](../../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../15-contracts/frame-call-protocol-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)  
> 最近复核：2026-08-09

`loom.map` 是 Phase 1 vertical slice。内部模块不是所有 Subsystem 的公共协议要求。

## 1. 模块结构

```text
loom.map
├── Subsystem Control Adapter
├── Runtime Control Dispatcher
├── Frame / Call Adapter
│   ├── Validator
│   ├── Shared Request ID Allocator
│   ├── Mutation Gate
│   └── Deadline / Failure Handler
├── User Input Adapter
├── Game Catalog / Repositories
├── Session Coordinator
├── Runtime Loop / World State
├── Render Manager
│   ├── Domain Registry
│   ├── Domain Tree Projectors
│   ├── Published Revision/Snapshot Store
│   └── Patch Diff Generator
└── Pokémon Essentials Compatibility Compiler
```

一个 map Runtime 可服务多个 Frame，并共享 world/cache/loop/render domains。

## 2. Runtime / Frame

```text
Subsystem Control v1
+
Frame / Call v1
=
Runtime Control Application Profile v1
```

Bootstrap：

```text
subsystem.hello {protocolVersions:[1]}
→ identified
→ initializing
→ subsystem.status({state:"ready"})
```

`ready` 不携 Data endpoint，也不表示 Data Connection 已建立。

Frame Adapter严格使用 seven Requests、closed schema、shared sender ID namespace、finite deadline、no retry。

`frame.call/frame.return` pending 时 mutation gate 停止新 ordinary input 与第二个 call/return。

Administrative `frame.suspend` 成功后该 Frame无 v1 generic resume；child-call suspension只通过对应 Child outcome + fresh `frame.resume`恢复。

Runtime terminal failure后 map Runtime不得自行选择 unwind root、恢复 suspended Frame或复用旧 Activation。

## 3. User Input Adapter

接收 ordinary input 至少验证：

```text
current Data Connection
frameId exists
Frame locally active
activationId current
channel in local Interest
no mutation gate
```

公共 Main InputTarget authority由 Renderer Core sender gate保证。

标准 keyboard/pointer/gamepad canonical payload以 User Input v1 为准；`loom.map` 不定义第二套 Mapping Profile。

如果地图实现需要 platform-specific key/pointer/gamepad adapter，那属于 Renderer/Host实现，不进入 map Runtime wire contract。

自定义 `x.*` Channel 允许由 map 与对应 Renderer implementation共同解释，但仍服从 `.state/.event`、plain-data 和 limits。

## 4. Render Domain Model

示例：

```text
world   zIndex=0
hud     zIndex=100
loading zIndex=200
debug   zIndex=1000
```

这些 domain names/zIndex 只是 map implementation choices，不是公共标准。

```text
Domain
    domainId
    zIndex
    roots[]

Node
    key       Domain lifecycle one-shot identity
    tag       opaque string
    attrs     string→string
    data      JSON object
    children  ordered nodes
```

Domain Host不是 Node。

`tag` 的 map-side含义属于 `loom.map` 与当前 Renderer implementation 的内部 integration；Render Update不定义 known/unknown tag、Component Factory 或 per-tag schema。

## 5. Render Publication

唯一协议：[Render Update v1](../../15-contracts/render-update-v1.md)。

```text
render.domains
    current Domain Registry

render.snapshot(revision)
    fresh baseline / full commit

render.patch(baseRevision, revision)
    exact R→R+1
    insert/remove/move/update

render.event
    transient presentation impulse
```

Subsystem sender对每个 current carrier + Domain维护：

```text
lastEmittedRevision
last published logical tree
new desired tree
```

业务逻辑不直接拼 wire Patch；Projector/Diff Engine根据 stable key生成变化。

```text
old has / new missing      → remove
old missing / new has      → insert
same key parent/order diff → move
same key attrs/data diff   → update
same key tag diff          → remove old + fresh-key insert
```

如果 diff过大/复杂/队列压力高，发送 full Snapshot(`lastEmittedRevision+1`)作为下一 commit。

具体 cost threshold 属于 map implementation。

## 6. Render Recovery

fresh Data Connection：

```text
render.domains
→ fresh Snapshot every current Domain
→ ordinary Patch/Event
```

旧 Renderer presentation cache不是 Patch base。

Authoritative continuity failure：

```text
retire current Data carrier
→ if generation still current, Host establishes fresh carrier
→ Registry + fresh Snapshots
```

无 Renderer→Subsystem resync RPC、Patch replay、ACK/NACK。

## 7. Presentation Boundary

`loom.map` 只发布 plain Render data，不发布：

```text
JavaScript module
Component class
CSS bundle
DOM element
executable callback
```

Renderer如何把 tag/attrs/data/children转成 DOM/Canvas/WebGL 是 Renderer implementation。

Component/presentation存在与否不产生 InputTarget authority。Presentation MAY提供 `x.*` Input Producer，但仍经过 User Input Core gate。

## 8. Frame / Domain / Data Independence

```text
Frame close != Domain destroy
Frame suspend != Domain hidden
Activation change != Domain lifecycle
Runtime ready != Data Connection exists
Data retire != authoritative Domain destroy
```

Runtime terminal failure最终会使 Main撤销相应 DataAuthority，但 Frame/Data/Render按各自 authority/lifecycle 收敛。

## 9. Tests

除 Frame v1 Subsystem conformance外，至少：

```text
control-v1-version-selection
ready-has-no-data-endpoint
shared-control-frame-request-id
administrative-suspend-no-generic-resume
call-pending-gate
initialize-business-reject
frame-rpc-timeout-no-retry
same-subsystem-recursive
runtime-failed-does-not-local-resume
stale-activation-rejected

zero-frame-render-domain
multi-domain-map-render
multi-root-domain
published-node-key-one-shot
snapshot-fresh-baseline
patch-R-to-R-plus-1
patch-insert-remove-move-update
patch-atomic-no-partial-apply
snapshot-fallback-under-backpressure
render-event-barrier
same-generation-reconnect-fresh-snapshots
frame-close-does-not-destroy-domain
```

## 10. 不得恢复的旧模型

```text
ready.rendererDataEndpoint
per-Frame mandatory Render ownership
Frame ready/status
Activation reuse
system.call
call→reverse-suspend
timeout→retry
caller remote cancel
partial same-runtime unwind
Frame close=Render destroy
Snapshot-only Render transport
Renderer Component Profile
Standard Input Mapping Profile
```
