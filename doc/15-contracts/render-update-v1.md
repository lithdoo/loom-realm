# Renderer ⇐ Subsystem Render Update Protocol v1

> 层级：正式契约  
> 状态：Active Design / Draft Baseline  
> 协议版本：1  
> 协议标识：`loomrealm.render-update / 1`  
> 稳定程度：Evolving  
> 方向：Subsystem → Renderer only  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> 架构：[渲染系统](../10-architecture/rendering-system.md)  
> 当前增量闭环：[Render Update v1 Incremental Design](./render-update-v1-incremental-design.md)  
> 最近复核：2026-08-09

本文保留 Render Update v1 的基础 Registry/Snapshot/Event 语义。当前实现目标已经由 Incremental Design扩展为 Registry/Snapshot/Patch/Event；两份文档最终应合并为单一 `render-update-v1.md`。

核心原则：

> **Render Update 是 Subsystem-owned Render Domain State 到 Renderer 的单向复制协议。它标准化 Domain/Tree identity、数据结构、lifecycle、ordering 与 recovery，不标准化 Renderer 如何解释或呈现 `tag/attrs/data`。**

---

## 1. 协议位置

```text
Subsystem Runtime
    authoritative Render Domain Registry / State
              │
              │ Render Update v1
              ▼
Renderer
    authoritative replica Store
              │
              ▼
    implementation-owned presentation
```

Render Update不是 Frame protocol、Input protocol、Renderer RPC、DOM protocol、component registry/loading protocol或 historical event stream。

## 2. Roles / Direction

```text
Subsystem
    producer / authority

Renderer
    consumer / read-only mirror
```

方向固定：

```text
Subsystem → Renderer
```

v1 定义 zero Renderer → Subsystem Render Update application messages。

不存在：

```text
render.ack
render.error
render.resync
render.requestSnapshot
render.subscribe
render.resume
```

## 3. Carrier / Scope

Render Update运行在 current Data Connection 上。Carrier已经绑定：

```text
Session
current Renderer participant
subsystemKey
DataAuthority generation
```

因此每条 Render message不重复这些 identity字段。

Data Connection retired后，旧 carrier上的 Render Update不再具有 current authority。

## 4. Plain-Data Model

Render Update是 plain-data message protocol，不使用 JSON-RPC。

一个 carrier application-message boundary对应一个 Render Update message；Batch禁止。

允许 JSON-compatible plain values；协议对象 closed schema；整数语义字段必须 safe integer。

不得携带 executable/host values，例如 Function、BigInt、MessagePort、DOM object、class instance。

## 5. Baseline Message Surface

本基础 Draft定义：

```text
render.domains
render.snapshot
render.event
```

当前 incremental closure candidate增加：

```text
render.patch
```

并给 Snapshot增加 per-Domain revision。当前实现应以 incremental closure candidate为准；本文件不再扩展旧 Snapshot-only wire。

## 6. Render Domain

每个 Subsystem在 current DataAuthority generation内拥有 `0..N` Render Domains。

Domain是：

```text
Render lifecycle unit
atomic authoritative-state unit
global composition unit
```

Domain不是 Render Node。

logical identity由 current Data Connection authority scope + `domainId`构成。

## 7. `domainId` Lifecycle

在同一：

```text
Session + subsystemKey + DataAuthority generation
```

内：

```text
absent → present → absent
```

是 terminal lifecycle。removed `domainId`不得在同 generation重新出现；新 lifecycle使用 fresh ID。

Generation replacement开启新的 Render authority universe。

## 8. Domain Registry

```ts
interface RenderDomainsV1 {
  readonly type: "render.domains";
  readonly domains: readonly string[];
}
```

`domains`：

```text
full replacement
set semantics
no duplicates
array order non-semantic
```

Registry membership就是 Domain lifecycle authority；不存在单独 create/destroy/close message。

fresh Data Connection上的第一条 Render Update message MUST 是 `render.domains`。

Registry加入 Domain后，其 state在 first fresh Snapshot前是 pending。Registry移除 Domain后，旧 authoritative Store和该 Domain pending Render work失效。

Registry可以 latest-state coalesce，但必须保持 lifecycle barrier。

## 9. Domain Snapshot

基础 schema：

```ts
interface RenderDomainSnapshotV1 {
  readonly type: "render.snapshot";
  readonly domainId: string;
  readonly zIndex: number;
  readonly roots: readonly RenderNodeV1[];
}
```

Incremental closure candidate在此基础上增加 `revision`。

Snapshot语义始终是：

> **完整验证后，以消息中的 Domain current state 原子替换旧 authoritative Domain Store。**

不得 partial apply。

## 10. Render Node Value Model

```ts
interface RenderNodeV1 {
  readonly key: string;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: JsonObjectV1;
  readonly children: readonly RenderNodeV1[];
}
```

Domain允许 `roots=[]`；`roots[]` 与 `children[]` 都是 ordered structure。

Domain Host不是隐式 Render Node。

## 11. Node `key`

`key` 是 Domain内 logical Node identity。

每个合法 authoritative Tree：

```text
all Node keys across roots + descendants are unique
```

当前 closure candidate进一步规定 published key在同 Domain lifecycle内 one-shot。

同一 live key的 `tag`保持稳定；需要不同 tag时使用 fresh key。

## 12. Node `tag`

`tag` 是 **opaque string**。

Render Update只规定：

```text
string/wire validity
bounded size
same live key keeps the same tag
```

Render Update **不定义 `tag` 的具体含义**，也不存在：

```text
known / unknown tag
tag declaration/discovery
(subsystemKey, tag) registry
Renderer Component Profile
Component Factory protocol
component/module loading protocol
per-tag schema negotiation
DOM/Canvas/WebGL mapping semantics
```

Renderer与Subsystem如何约定和解释 tag属于实现问题，不属于 LoomRealm wire contract。

因此 tag不会因为“Renderer未注册/未知”而形成 Render protocol error；协议没有这个状态。

## 13. `attrs` / `data`

```text
attrs : string → string
data  : plain JSON object
```

协议只定义数据类型和 size/depth/closed-wire边界，不定义业务含义。

具体实现可以根据自身逻辑解释 attrs/data；不需要 per-tag public Profile。

## 14. Local Reconciliation

Renderer MAY使用 stable Node key本地计算 mount/update/move/unmount 或其他 backend reconciliation。

这些全部属于 implementation detail，不改变 authoritative Render Store，也不进入 wire。

协议不定义 DOM mutation command family或 generic JSON Patch。

## 15. Render Event

```ts
interface RenderEventV1 {
  readonly type: "render.event";
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: string;
  readonly data: JsonObjectV1;
}
```

Event：

```text
ordered
transient
non-authoritative
no replay
no coalescing
may be lost
```

Event必须 target current Tree中的 Node；Domain Host不是 Event target。

`name/data` 的具体业务含义同样属于实现，不定义 Event-name registry/Profile。

Event不能成为 Node existence、persistent visibility、position、selection或其他 authoritative current state的唯一来源。

## 16. Event Target Gate

Renderer只在：

```text
Domain current
fresh current-connection Snapshot applied
targetKey exists in current Tree
```

时处理 Event。

否则 drop，不 queue-until-appears、不 retarget、不 reconnect replay。

Event target如何由本地 presentation实现处理，不属于协议。

## 17. Ordering / Coalescing

Registry是 global Domain lifecycle barrier。

Snapshot是 full current Domain state，可以在未 emitted阶段 latest-state coalesce，但不能越过同 Domain Event barrier。

Event是 transient barrier，不 coalesce。

当前 incremental closure candidate进一步以 per-Domain revision + Patch精确冻结 authoritative commit ordering。

## 18. zIndex / Composition

每个 Domain拥有 authoritative `zIndex`：

```text
lower → below
higher → above
```

Frame Stack/Activation不转换成 zIndex。

相同 zIndex的 tie-break只要求一个 Renderer实现内部 deterministic，业务不得依赖其 portable ordering。

## 19. Fresh Connection / Reconnect

fresh current Data Connection：

```text
render.domains(current full Registry)
→ fresh Snapshot for every current Domain
→ ordinary Event / Patch according to current closure candidate
```

Renderer MAY暂时保留旧 presentation cache，但 cache不是 current authority proof。

同 generation reconnect仍必须 fresh baseline；Event不 replay。

Generation replacement终止旧 Render authority；相同字符串 ID不自动证明跨 generation identity continuity。

## 20. Frame / Input Independence

Render Update message不包含 Frame/Activation/InputTarget authority。

```text
Frame active != Domain visible
Frame suspended != Domain hidden
Frame close != Domain destroy
Activation replacement != Domain epoch
Data loss != Runtime failure / Frame unwind
```

Node/Domain存在也不产生 ordinary Input authority。

Renderer实现 MAY因本地 presentation对象提供 custom Input Producer，但 User Input仍只由：

```text
Main InputTarget/Activation
∩ Input Interest
∩ Producer availability
```

决定。

## 21. Backpressure

所有 Render queues bounded。

基础原则：

```text
Registry/Snapshot authoritative progress
    preferred over transient Event backlog
```

Event MAY按 bounded overflow policy丢弃；Event overflow不意味着 Runtime failure、Frame unwind或DataAuthority replacement。

Incremental closure candidate允许未 emitted state重新 diff成 Patch，或在压力下 materialize为 full Snapshot。

## 22. Structural Validation

Renderer至少验证：

```text
valid message discriminator / closed schema
domainId validity
Registry duplicate rules
Snapshot targets current Domain
zIndex numeric validity
finite recursive Tree
Node key unique Domain-wide
tag is a valid bounded string
attrs string→string
data plain JSON object
children array
Event target exists
message/tree within active limits
```

**Renderer不验证 tag 的语义或“可解析性”。**

Snapshot/authoritative candidate任何结构验证失败不得 partial apply。

## 23. Error / Failure Boundary

Soft transient Event错误，例如 target stale/missing，可直接 drop。

Invalid authoritative state必须 fail closed，不能局部修复后继续。

当前 incremental closure candidate进一步统一为：authoritative continuity/validation failure → retire Data Connection → fresh Registry/Snapshots。

无论 Render failure如何分类，都不得由 Renderer自行宣布 Runtime terminal failure或 Frame outcome/failure unwind。

## 24. Security Boundary

- Render data作为跨边界输入必须执行通用 schema/size/depth验证；
- Render payload不得携 executable/host objects；
- `tag/attrs/data` 的具体解释属于 Renderer实现，其安全策略也属于实现责任；
- Render协议本身不把 `tag`解释成代码位置、模块地址或其他 capability；
- Render Event不能扩大 Frame/Input/Data authority；
- Renderer不得从 Render Tree推断 Main Stack/InputTarget。

## 25. Minimum Baseline Conformance

基础场景至少覆盖：

```text
fresh-connection-first-render-message-is-registry
empty-registry
registry-full-replacement
registry-add-domain-pending-until-snapshot
registry-remove-domain-destroys-authoritative-store
registry-duplicate-domain-rejected
registry-coalescing-safe

domain-id-one-shot-within-generation
removed-domain-id-not-regranted

snapshot-only-for-present-domain
snapshot-atomic-zindex-and-tree-replace
snapshot-full-replacement
snapshot-invalid-tree-no-partial-apply

zero-root-domain
multiple-ordered-roots
domain-wide-unique-node-key
same-key-stable-tag
tag-is-opaque-string
ordered-children
attrs-data-plain-data

render-event-current-target
render-event-transient
render-event-no-authoritative-store-mutation
render-event-no-replay
render-event-not-coalesced
render-event-before-fresh-baseline-dropped
render-event-missing-target-dropped

same-generation-reconnect-full-registry
same-generation-reconnect-fresh-snapshot-per-domain
cached-presentation-is-not-current-proof

generation-replacement-retires-old-render-authority
frame-close-does-not-remove-domain
activation-change-does-not-change-domain-lifecycle
data-loss-does-not-fail-runtime
data-loss-does-not-unwind-frame
```

Conformance不包含 tag registry、known/unknown tag、Component Factory或 component loading测试。

## 26. Explicit Non-Goals

Render Update不定义：

```text
Renderer → Subsystem Render RPC
ACK / Result
history replay
resume cursor
cross-Domain transaction
render frame fence
vsync protocol
animation clock sync
graphics codec
component registry/profile
component module loading
DOM/CSS protocol
per-tag schema protocol
Frame binding
Input authority
business mutation
```

## 27. Current Direction

当前实现/冻结工作以 [Incremental Design](./render-update-v1-incremental-design.md) 为准：

```text
Registry
Snapshot(revision)
Patch(R→R+1)
Event
```

它继承本文所有“tag opaque / implementation-owned”边界。

完成 limits/conformance 后，应把 Incremental Design合并回本文件并删除工作草案，结束双文档状态。

最终原则：

> **Render协议负责复制 current authoritative structure/state；Renderer如何解释 `tag/attrs/data` 是实现问题，不是协议问题。**
