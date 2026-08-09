# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web Renderer 内部模块、Main committed authority、Data Connection、User Input、Render Registry/Snapshot/Patch/Event 与本地 presentation  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Data Connection v1](../../15-contracts/renderer-subsystem-data-connection-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update Incremental Design](../../15-contracts/render-update-v1-incremental-design.md)  
> 最近复核：2026-08-09

Renderer **不是 Frame / Call participant**。Frame v1七个 RPC只存在于 Main⇄Subsystem Runtime Control；Renderer只服从 Main committed authority，并处理建立后的 Data application domains。

## 1. 模块结构

```text
Web Renderer
├── Main Renderer Control Connection
├── Control State Store
├── Data Connection Registry
├── Render Replication Manager
│   ├── Domain Registry
│   ├── Domain Store + revision
│   ├── key/parent indexes
│   ├── Snapshot Validator
│   ├── Atomic Patch Engine
│   └── logical Commit/Event Queue
├── Presentation Adapter / Registry        implementation-owned
├── Global Domain Composer
├── Input Interest Registry
├── Input Channel Producer Registry
├── Effective Input Channel Resolver
├── User Input Router
├── Resource Client
└── Presentation State
```

## 2. Renderer Control Authority

Renderer通过 Main ⇄ Renderer Control获得 full committed Snapshot：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority { subsystemKey, generation, connectionProfile }
```

Renderer不得自行：

```text
创建/恢复 Frame或Activation
修改 Stack
计算 Runtime failure unwind
根据 DOM focus创建 InputTarget
根据 Render Domain推导 input authority
```

## 3. InputTarget Lease / Control Loss

```text
frame.activate ACK → Main commit → InputTarget may publish
frame.resume ACK   → Main commit → InputTarget may publish
```

已发布 `InputTarget(frameId,activationId)` 一旦被撤销/替换，同一 lease不得再次成为 InputTarget。

Renderer Control loss/replacement时：

```text
InputTarget := null
stop ordinary input
invalidate DataAuthority
retire/close all old Renderer Data Connections
```

然后通过 fresh Renderer Control hello + full Snapshot恢复。

## 4. Data Connection Registry

Renderer只依据 current DataAuthority建立/持有 Data Connection。

完整 logical identity：

```text
Session
+ current Renderer participant
+ subsystemKey
+ generation
```

每个 `(Session,current Renderer,subsystemKey)` 至多一个 current carrier。

actual WebSocket endpoint/ticket或 MessagePort由 Host/Platform Binding提供，不来自 Subsystem `ready`，也不进入 Renderer Control Snapshot。

```text
Data loss != Runtime failure
Data loss != Frame unwind
```

## 5. User Input Trust Boundary

```text
Main
    owns InputTarget / Activation

Renderer Core
    trusted sender-side InputTarget enforcement point

Subsystem
    validates local Frame/Activation + local Interest
```

对 Channel `C`：

```text
Effective(C)
=
current matching Data Connection
∧ current Main InputTarget matches subsystem
∧ mirrored Frame active/current Activation matches
∧ C in current Input Interest
∧ Producer(C) available
```

只有 Effective Channel产生 ordinary State/Event。

## 6. Input Interest / State / Event / Reset

fresh Data Connection：

```text
Interest = empty
```

Subsystem发布 full exact Interest set；无 wildcard、无 ACK/revision。

`.state` non-effective→effective时必须立即建立 fresh self-contained baseline。

`.event`只发送未来 transient events，不 coalesce/replay。

Reset/implicit reset清理持续 state；Producer loss按 User Input v1执行 Reset + remaining State rebaseline。

## 7. Render Authority Model

Subsystem是 Render Domain Registry / State / revision唯一 authority；Renderer是 read-only replica + presentation engine。

一个 Subsystem拥有：

```text
0..N Render Domains
```

Domain：

```text
domainId
zIndex
0..N ordered roots
revision
```

Node：

```text
key       Domain lifecycle内 one-shot logical identity
tag       opaque string
attrs     string→string
data      JSON object
children  ordered child nodes
```

Domain Host不是 Node。

Renderer只按 Render协议验证 Node结构和类型，不解释 `tag` 的协议语义。

## 8. Fresh Render Baseline

fresh Data Connection上的 Render恢复固定：

```text
render.domains(current Registry)
→ fresh render.snapshot for every current Domain
→ ordinary render.patch / render.event
```

Renderer MAY暂存旧 presentation cache以减少视觉闪烁，但在 fresh Snapshot前：

```text
MUST NOT apply new Patch to cached state
MUST NOT deliver new Event to cached Node lifetime
```

cache不是 recovery authority。

## 9. Domain Store / Revision

Renderer对每个 current Domain维护：

```text
DomainStore
├── revision
├── zIndex
├── recursive roots
├── nodeByKey
└── parentByKey
```

wire仍保持自然递归 Tree；内部 MAY normalized/indexed/copy-on-write。

fresh Snapshot可直接建立当前 authoritative revision `R`。

baseline以后每次 authoritative commit必须：

```text
R → R+1
```

## 10. Snapshot

```text
render.snapshot(revision,zIndex,roots)
```

Renderer：

```text
validate full candidate
→ build indexes
→ atomic replace Domain Store
→ commit revision
```

post-baseline Snapshot只能是 `currentRevision+1`，通常用于 full commit / backpressure fallback。

不得暴露 partial tree或新旧 zIndex/tree混合状态。

## 11. Patch Engine

```text
render.patch {
    baseRevision = R,
    revision = R+1,
    zIndex?,
    ops[]
}
```

Core ops固定：

```text
insert
remove
move
update
```

Renderer处理：

```text
require base=current revision
→ isolated candidate
→ apply ordered ops
→ validate final candidate
→ atomic commit
```

任何 op/candidate失败不得 partial apply或跳过后继续。

## 12. Patch Operation Semantics

### Insert

通过 `parentKey + beforeKey`插入完整 fresh subtree；inserted keys不得 live/tombstoned/违反 Domain-lifecycle one-shot key rule。

### Remove

删除 target及 op执行时仍属于它的 current subtree；所有删除 key进入 Patch-local tombstone，当前 Patch后续不得复用。

### Move

固定 detach-then-resolve：

```text
detach target
→ resolve destination parent in detached candidate
→ resolve beforeKey in destination list
→ insert
```

不得 move到自身/descendant，`beforeKey == key`非法。

### Update

只修改 attrs/data top-level `set/remove`；不修改 key/tag/children。remove missing member或 set/remove冲突是 invalid Patch。

## 13. Authoritative Continuity Failure

以下属于 Render stream continuity failure：

```text
Patch base mismatch
revision not R+1
Patch op precondition failure
Patch final candidate invalid
post-baseline Snapshot stale/gap/invalid
hard malformed authoritative message
```

Renderer：

```text
MUST NOT skip and continue
→ stop trusting current Render stream
→ retire current Data Connection
→ if authority still current, establish fresh carrier
→ Registry + fresh Snapshots
```

这不等于 Runtime failure或 Frame unwind。

`tag` 的具体含义或本地 presentation 映射失败不属于 Render Core continuity validation。

## 14. Render Event / Logical Barrier

`render.event`是 transient presentation impulse，不修改 authoritative Domain Store。

Event只有在 current Domain + fresh baseline + current targetKey存在时交给本地 presentation layer；stale target直接 drop。

同 Domain logical processing顺序必须保持：

```text
commit R
→ reconcile local presentation
→ Event
→ commit R+1
```

不要求等待 physical paint/vsync，但不得让 Event越过 authoritative commit barrier。

Event `name/data` 的解释是 implementation detail。

## 15. Render Backpressure

```text
small desired-state diff
    → Patch

large/complex/backpressured diff
    → Snapshot(lastEmittedRevision+1)

Event
    bounded ordered FIFO
    may drop on overflow
```

Authoritative convergence MUST NOT被 transient Event backlog无限阻塞。

## 16. Presentation Implementation Boundary

Renderer如何将：

```text
tag
attrs
data
children
```

映射到实际 UI，完全由 Renderer实现掌控。

实现 MAY使用：

```text
registry
factory
class/function/component
DOM/Canvas/WebGL
lazy loading
static registration
code generation
other internal mechanism
```

但这些都不是 LoomRealm Protocol/Profile，也不参与 Render wire negotiation/conformance。

Render Core不存在 `known tag` / `unknown tag` 状态；只验证 `tag` 是符合通用 wire/size规则的 string。

本地 presentation对象 MAY注册 `x.*` Input Producers，但仍必须经过 Renderer Core的 Interest/InputTarget gate。

## 17. Global Composition

Domain `zIndex`决定跨 Domain层级：higher above lower。

Frame Stack绝不作为 Render z-order。

same-z deterministic tie-break由 Renderer实现固定；业务不得依赖 arrival/reconnect order，也不得把 equal-z顺序当 portable semantics。

## 18. Renderer Reload

```text
fresh Renderer Control
→ current Authority Snapshot
→ fresh Data Connections for current generations
→ User Input: Interest empty → republish → State baselines
→ Render: Registry → fresh Snapshots → Patch/Event
```

不得恢复 cached old Activation、old Interest、historical input Event或 historical Render Event/Patch chain。

## 19. Core Invariants

- Renderer不是 Frame RPC participant；
- Renderer只镜像 Main committed control authority；
- Renderer Core执行 ordinary InputTarget sender-side gate；
- Data carrier只依据 current DataAuthority；
- 每个 Subsystem可拥有 `0..N` Render Domains；
- Domain Host不是 Render Node；
- Node key在 Domain lifecycle内 one-shot；
- `tag` 是 opaque string，协议不定义其具体含义；
- recursive Tree仍是 authoritative model；
- fresh connection先 Registry+Snapshot，再 Patch/Event；
- baseline以后 authoritative revision严格 `R→R+1`；
- Patch只有 insert/remove/move/update且原子提交；
- Event是 transient logical barrier，不是 authoritative state；
- continuity failure通过 Data reconnect + fresh Snapshot恢复；
- no Render ACK/NACK/replay/resync RPC；
- no Renderer Component Profile；
- Frame/Domain/Data/Input lifecycle保持独立。
