# Render Update v1 Incremental Design Draft

> 层级：正式契约演进草案  
> 状态：Working Draft / Evolution Note  
> 目标协议：`loomrealm.render-update / 1`  
> 方向：Subsystem → Renderer only  
> 基线：[Render Update Protocol v1](./render-update-v1.md)  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> 架构：[渲染系统](../10-architecture/rendering-system.md)  
> 最近复核：2026-08-08

本文不是 Frozen Contract。它记录 Render Update v1 从“Snapshot-only”向“Snapshot baseline + incremental Patch + transient Event”演进的当前工作模型，后续设计讨论直接在本文继续推进；完成 closure review 后，再决定如何合并回正式 `render-update-v1.md`。

核心原则：

> **Snapshot 是恢复基线；Patch 是正常的增量 authoritative update；Event 是一次性的 presentation impulse。恢复依赖完整当前状态，而不是依赖历史 Patch/Event replay。**

---

## 1. 设计目标

Render Update v1 需要完成 Subsystem → Renderer 的单向 Render 数据更新，并同时满足：

```text
低频 / 恢复
    full Snapshot

高频普通变化
    incremental Patch

一次性表现动作
    transient Event

Domain lifecycle
    full Domain Registry
```

目标不是构建远程 DOM / command-buffer 协议，而是复制 Subsystem-owned Render Domain current state。

v1 应优先保持：

```text
small wire surface
single authority
ordered commit semantics
atomic application
bounded queues
fresh reconnect baseline
no historical replay
no Renderer→Subsystem recovery RPC
```

## 2. 参考模型

设计取向参考：

- Wayland：独立对象 identity/lifecycle、atomic committed state；
- List + Watch 类状态复制：先建立 current baseline，再接收后续变化；
- 远程图形协议：surface/lifecycle 与 presentation command 分层；
- Virtual DOM / keyed reconciliation：stable key 用作 component identity，而不是用数组路径当 identity。

不直接照搬：

```text
resourceVersion history replay
JSON Patch path addressing
frame fence
cross-surface transaction DAG
raster command stream
codec/cache negotiation
ACK-driven mutation journal
```

## 3. Protocol Roles / Direction

```text
Subsystem
    authoritative Domain Registry
    authoritative Domain State
    producer of Patch / Event

Renderer
    read-only replicated Domain Store
    validates + atomically applies updates
    derives component instances / presentation
```

方向固定：

```text
Subsystem → Renderer only
```

v1 继续不定义：

```text
render.ack
render.result
render.resync
render.requestSnapshot
render.patchRequest
render.resume
```

## 4. Carrier Scope

Render Update 运行在 current Renderer ⇄ Subsystem Data Connection 上。

Carrier 已绑定：

```text
Session
current Renderer participant
subsystemKey
DataAuthority generation
```

因此 Render Update message 不重复：

```text
sessionId
rendererId
subsystemKey
generation
connectionProfile
```

Domain wire identity只需要：

```text
domainId
```

完整 authority identity由 enclosing carrier提供。

## 5. Message Surface

当前候选 v1 wire surface：

```ts
type RenderUpdateMessageV1 =
  | RenderDomainsV1
  | RenderSnapshotV1
  | RenderPatchV1
  | RenderEventV1;
```

四种 message kinds：

```text
render.domains
render.snapshot
render.patch
render.event
```

职责：

| type | 职责 |
|---|---|
| `render.domains` | current Domain Registry / lifecycle authority |
| `render.snapshot` | 一个 Domain 的完整 authoritative baseline/current state |
| `render.patch` | 一个 Domain 的 atomic incremental authoritative update |
| `render.event` | 一个 current Node 的 transient presentation impulse |

## 6. Domain Registry

```ts
interface RenderDomainsV1 {
  readonly type: "render.domains";
  readonly domains: readonly string[];
}
```

语义：

```text
full replacement
set semantics
no duplicates
array order has no presentation meaning
```

Registry membership决定 Domain lifecycle。

不存在：

```text
render.create
render.destroy
render.close
```

### 6.1 Domain one-shot lifecycle

在同一：

```text
Session + subsystemKey + DataAuthority generation
```

内：

```text
domainId once removed
→ MUST NOT become present again
```

合法：

```text
absent → present → absent
```

非法：

```text
absent → present → absent → present(same domainId)
```

新 lifecycle使用 fresh `domainId`。

原因是允许 Registry coalescing，同时避免隐藏 destroy→recreate，错误复用旧 component-local state。

## 7. Normalized Keyed Domain Tree

为了支持稳定、高效的增量更新，当前方向将递归 wire tree演进为 normalized keyed tree。

Domain State：

```ts
interface RenderDomainStateV1 {
  readonly zIndex: number;
  readonly roots: readonly string[];
  readonly nodes: readonly RenderNodeRecordV1[];
}
```

Node：

```ts
interface RenderNodeRecordV1 {
  readonly key: string;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: JsonObjectV1;
  readonly children: readonly string[];
}
```

逻辑上仍然是：

```text
Domain
├── Root A
│   ├── B
│   └── C
└── Root D
```

但 wire 通过：

```text
roots = [A, D]
A.children = [B, C]
B.children = []
C.children = []
D.children = []
```

表示。

### 7.1 为什么 normalized

目标：

- `key` 成为一等 identity；
- Patch直接按 key定位；
- children reorder/move只修改 key lists；
- 不依赖 JSON path / array index identity；
- Renderer依旧能直接构造/验证完整 tree；
- Snapshot仍能完整恢复 state。

## 8. Tree Invariants

每个 committed Domain State MUST 满足：

```text
all node keys unique Domain-wide
all roots reference existing nodes
all children reference existing nodes
roots unique
children list has no duplicate key
one node has at most one parent
root node has no parent
no cycles
all nodes reachable from roots
same live key keeps same tag
```

`roots=[]` 合法，表示 Domain存在但没有 presentation nodes。

Domain Host不是 Render Node。

## 9. Snapshot

```ts
interface RenderSnapshotV1 {
  readonly type: "render.snapshot";
  readonly domainId: string;
  readonly zIndex: number;
  readonly roots: readonly string[];
  readonly nodes: readonly RenderNodeRecordV1[];
}
```

Snapshot：

```text
full current authoritative state
atomic replacement
recovery baseline
```

收到 Snapshot：

```text
validate whole candidate
→ if valid: atomic replace Domain Store
→ if invalid: no partial apply
```

Snapshot永远可以重新建立一个 current Domain 的完整 authoritative state。

## 10. Patch

Patch 是基于 Renderer 当前已 committed Domain State 的增量 atomic update。

候选 wire：

```ts
interface RenderPatchV1 {
  readonly type: "render.patch";
  readonly domainId: string;

  readonly zIndex?: number;
  readonly roots?: readonly string[];

  readonly create?: readonly RenderNodeRecordV1[];
  readonly update?: readonly RenderNodeUpdateV1[];
  readonly remove?: readonly string[];
}
```

Node Update：

```ts
interface RenderNodeUpdateV1 {
  readonly key: string;
  readonly attrs?: Readonly<Record<string, string>>;
  readonly data?: JsonObjectV1;
  readonly children?: readonly string[];
}
```

Patch中不允许修改 `tag`。

如果需要替换 component type：

```text
remove old key
+ create fresh key with new tag
```

## 11. Patch 是集合式 Atomic Transaction

Patch 不应被解释成逐条 imperative command stream。

Renderer处理：

```text
current Domain Store
+
one Patch
→ build candidate state
→ validate candidate final state
→ atomic commit
```

Patch中的：

```text
create
update
remove
roots
zIndex
```

共同描述一次 atomic state transition。

不要求 producer依赖：

```text
create先执行
update再执行
remove最后执行
```

协议 correctness只看最终 candidate是否合法。

## 12. Patch Operations

### 12.1 Create

`create` 添加 fresh Node records。

要求：

```text
created key not currently present
created keys unique within Patch
```

Node只有在最终 candidate中被 root或parent引用后才合法；最终不可达 Node使整个 Patch invalid。

### 12.2 Update

`update` 只能更新 current existing Node：

```text
attrs
 data
children
```

没有字段即保持旧值。

`attrs` / `data` 当前语义是完整字段 replacement，而不是 recursive merge。

例如：

```text
update.data = {...}
```

表示替换整个该 Node `data` object。

如果以后需要 tag-specific deeper patch，应由 Component-specific schema/profile证明必要性，不默认进入 Core。

### 12.3 Remove

`remove` 删除明确列出的 key。

当前方向：**不做隐式 subtree cascade delete**。

原因：

- 避免 `remove(parent)` 隐式删除大量对象；
- 允许 child在同一 Patch中移动到其他 parent；
- correctness统一通过最终 candidate tree验证。

如果 parent和 descendants都不再需要，producer显式列出对应 keys。

### 12.4 Move / Reorder

v1 不需要 `moveNode` / `moveBefore` / `moveAfter`。

移动通过 parent `children` replacement表示。

例如：

```text
A.children = [X, Y]
B.children = [Z]
```

变成：

```text
A.children = [X]
B.children = [Z, Y]
```

Node `Y` 本身无需更新。

Reorder同理：

```text
children = [C, A, B]
```

即 authoritative order。

### 12.5 roots

`roots` 若存在，则完整替换 top-level root key order。

不提供 root add/remove patch operations。

### 12.6 zIndex

Patch可独立更新 Domain `zIndex`。

一条 Patch如果同时修改 `zIndex + tree`，两者一次原子 commit。

## 13. Patch Ordering

对一个 current Domain，逻辑 authoritative update stream：

```text
Snapshot
→ Patch
→ Patch
→ Patch
...
```

Carrier提供 Subsystem → Renderer顺序。

v1 当前方向仍不增加：

```text
snapshotRevision
patchRevision
baseRevision
domainSequence
```

前提：

> Renderer MUST按收到顺序应用每个合法 authoritative Patch；不得任意跳过已 emitted Patch。

## 14. 为什么暂时不需要 Revision

在当前模型：

```text
ordered carrier
+ no duplicate/retry
+ fresh connection baseline
```

同一 carrier上的 Patch chain天然有唯一顺序。

如果 carrier loss：

```text
stop old stream
fresh connection
→ full Registry
→ fresh Snapshot per Domain
```

不尝试从历史 Patch中间位置 resume。

因此 revision当前没有 correctness职责。

未来如果引入：

```text
Patch history replay
out-of-order carrier
partial snapshot
resume cursor
```

则需要重新评估 revision，并应作为新版本/Profile演进。

## 15. Invalid Patch / Divergence

Patch和 Event 的失败级别不同。

Event可以丢失；Patch不能任意丢失。

如果 Renderer不能合法应用一个 authoritative Patch，例如：

```text
unknown update key
create duplicate key
remove unknown key
invalid child reference
multiple parents
cycle
unreachable node
invalid attrs/data
unknown required tag
```

则：

```text
Domain replication stream can no longer be trusted to remain convergent
```

当前推荐恢复策略：

```text
reject Patch
→ fail closed for this current carrier
→ retire Data Connection
→ establish fresh connection if authority still exists
→ full Registry + fresh Snapshots
```

不定义：

```text
render.patchError
render.resync
render.requestSnapshot
```

也不允许 Renderer跳过 invalid Patch后继续应用后续 Patch。

## 16. Event

Event仍表示 transient presentation impulse：

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

Event只能影响 component-local presentation state，不能改变 authoritative Domain Store。

Event不能作为以下事实的唯一表达：

```text
Node existence
persistent visibility
persistent selection
persistent position
current business data
anything whose loss causes permanent divergence
```

## 17. Event Target Gate

Event只有在：

```text
Domain currently present
fresh baseline for current connection already applied
targetKey exists in current committed Domain Tree
```

时才能应用。

否则 drop。

不得：

```text
queue until Node appears
retarget
replay after reconnect
```

## 18. Event 是 Authoritative Update Barrier

同 Domain：

```text
Patch P1
Patch P2
Event E
Patch P3
Patch P4
```

Event E可能依赖 P2后的 presentation state。

因此任何 sender-side collapse/coalescing都不能让 E越过其前置 authoritative state。

合法：

```text
Snapshot S2
Event E
Snapshot S4
```

或者保持原 Patch chain。

非法：

```text
Event E
Snapshot S4
```

如果 E要求基于 P2后的 state解释。

概念上每个 Domain stream被 Event分成 authoritative state segments：

```text
[Snapshot/Patch segment]
→ Event
→ [Patch/Snapshot segment]
→ Event
```

## 19. Backpressure / Coalescing

所有队列必须 bounded。

### Registry

```text
latest full Registry may replace older unsent Registry
```

但必须遵守 Domain lifecycle barrier和 one-shot rule。

### Snapshot

尚未 emitted 的 Snapshot可由更新的 current Snapshot替换。

### Patch

已经 emitted 的 Patch不可 drop。

尚未 emitted 的 Patch chain不要求复杂 Patch→Patch algebra。

推荐策略：

```text
pending Patch backlog grows
→ Subsystem materializes current full Domain State
→ discard unsent Patch chain
→ enqueue fresh Snapshot of current state
```

例如：

```text
emitted S0
pending P1 P2 P3 P4
```

可以改为：

```text
emitted S0
pending S4
```

这使性能优化不需要把 Core扩展成 mutation-log compactor。

### Event

```text
bounded ordered FIFO
MUST NOT coalesce
MAY drop under overflow policy
surviving Events preserve relative order
no replay
```

具体 numeric limits / overflow preference后续再冻结。

## 20. Fresh Connection Recovery

fresh Data Connection固定恢复模型：

```text
1. render.domains(current full Registry)
2. fresh render.snapshot for every current Domain
3. then render.patch / render.event may flow
```

Patch永远不作为 fresh connection的 baseline。

因此 same-generation reconnect也不需要：

```text
lastPatchId
resume cursor
Patch replay
ACK journal
```

Renderer可以暂时保留旧 presentation cache，但：

```text
cache != newly proven current authoritative state
```

fresh Snapshot到达前不能对旧 cached state应用新 Patch/Event。

## 21. Generation Replacement

DataAuthority generation replacement：

```text
G → G2
```

表示新的 Render replication authority universe。

旧 G 的：

```text
Domain identity
Node identity
Patch chain
Event history
```

都不自动延续到 G2。

G2从：

```text
Registry + Snapshots
```

重新建立 current authority。

## 22. Cross-Domain Atomicity

v1不定义跨 Domain transaction。

```text
one Snapshot = one Domain atomic commit
one Patch = one Domain atomic commit
```

不同 Domain更新不构成 portable atomic transaction。

如果多个 UI部分必须原子改变，应放进同一 Domain。

不引入：

```text
transactionId
commitGroup
renderFrame
frameFence
multiDomainRevision
```

## 23. zIndex Composition

每个 Domain current state拥有 `zIndex`。

```text
lower zIndex → below
higher zIndex → above
```

多个 Subsystem可能发布相同 zIndex。

同 zIndex：

```text
Renderer MUST provide deterministic/stable ordering
but ordering MUST NOT be portable business semantics
```

需要业务确定覆盖顺序时必须使用不同 zIndex。

## 24. Component / Tag Boundary

`tag` 是 logical Renderer Component type，不是 DOM tag。

```text
(subsystemKey, tag)
→ Renderer Component Factory
```

Render Update不负责：

```text
JavaScript module download
Component class loading
CSS installation
executable code transfer
```

Patch不能改变 existing key 的 tag。

Component implementation availability/bootstrap仍属于独立 profile/host/package loading边界。

## 25. Plain Data / Security

`attrs`：

```text
string → string declarative values
```

`data`：

```text
plain JSON object
```

不得携带：

```text
Function
Symbol
BigInt
DOM object
MessagePort
Blob
ArrayBuffer
class instance
callback
```

`attrs`不能直接作为任意 DOM event handler / executable attribute。

所有 Render Update protocol objects应采用 closed schema。

## 26. Frame / Input Independence

Render Update message不包含：

```text
frameId
activationId
InputTarget
Frame lifecycle
```

因此仍保持：

```text
Frame suspend != Domain hidden
Frame close/unwind != Domain destroy
Activation replacement != Domain epoch
Data loss != Frame recovery
```

Render Node/component存在也不产生 User Input authority。

Custom component可注册 `x.*` input producer，但继续服从 User Input Effective Channel gate。

## 27. Candidate Wire Example

### Snapshot

```json
{
  "type": "render.snapshot",
  "domainId": "world-1",
  "zIndex": 0,
  "roots": ["scene"],
  "nodes": [
    {
      "key": "scene",
      "tag": "map-scene",
      "attrs": {},
      "data": {"mapId": "001"},
      "children": ["player", "npc-7"]
    },
    {
      "key": "player",
      "tag": "map-character",
      "attrs": {},
      "data": {"x": 10, "y": 20},
      "children": []
    },
    {
      "key": "npc-7",
      "tag": "map-character",
      "attrs": {},
      "data": {"x": 14, "y": 18},
      "children": []
    }
  ]
}
```

### Incremental player update

```json
{
  "type": "render.patch",
  "domainId": "world-1",
  "update": [
    {
      "key": "player",
      "data": {"x": 11, "y": 20}
    }
  ]
}
```

### Create tooltip and attach

```json
{
  "type": "render.patch",
  "domainId": "world-1",
  "create": [
    {
      "key": "tooltip-17",
      "tag": "tooltip",
      "attrs": {},
      "data": {"text": "Hello"},
      "children": []
    }
  ],
  "update": [
    {
      "key": "scene",
      "children": ["player", "npc-7", "tooltip-17"]
    }
  ]
}
```

### Move existing node

```json
{
  "type": "render.patch",
  "domainId": "ui-1",
  "update": [
    {"key": "left", "children": []},
    {"key": "right", "children": ["item-1"]}
  ]
}
```

### Event

```json
{
  "type": "render.event",
  "domainId": "world-1",
  "targetKey": "player",
  "name": "hit-flash",
  "data": {"strength": 0.8}
}
```

## 28. Candidate Conformance Scenarios

后续至少验证：

```text
fresh-connection-registry-then-snapshot
patch-before-baseline-invalid
patch-only-for-current-domain
patch-applies-in-order
patch-atomic-final-state-validation
patch-create-update-remove-single-commit
patch-tag-change-forbidden
patch-child-move-by-key
patch-root-reorder
patch-zindex-and-tree-atomic
patch-cycle-rejected
patch-multiple-parent-rejected
patch-unreachable-node-rejected
patch-invalid-retire-carrier-and-rebaseline

snapshot-replaces-entire-domain
snapshot-recovers-after-patch-stream
snapshot-normalized-keyed-tree

pending-patches-collapse-to-snapshot
emitted-patch-not-dropped
render-event-is-authoritative-segment-barrier
event-no-replay
event-overflow-does-not-fail-runtime

same-generation-reconnect-no-patch-replay
generation-replacement-new-authority-universe
removed-domain-id-not-reused
frame-close-does-not-destroy-domain
```

## 29. Explicit Non-Goals

当前草案不引入：

```text
JSON Patch
path/index-based node identity
patch revision/baseRevision
ACK/result
history replay
resume cursor
Renderer→Subsystem resync
cross-Domain transaction
cross-Subsystem transaction
render frame fence
vsync sync protocol
damage rectangles
raster command stream
binary texture streaming
component module loading
remote DOM operations
```

## 30. Open Questions

以下尚未冻结，后续直接在本文继续推进：

1. `RenderPatchV1` 空 Patch 是否允许，还是至少必须包含一个 mutation field；
2. `remove` unknown key 是 hard invalid，还是允许 idempotent no-op；当前倾向 hard invalid；
3. `update` 同一 key 在一条 Patch 中是否只允许出现一次；当前倾向只允许一次；
4. `create/update/remove` key sets是否必须互斥；当前倾向要求互斥，以降低歧义；
5. `attrs/data` replacement是否足够，还是未来需要 Component-specific deeper patch；
6. normalized Snapshot是否正式替代递归 `children: Node[]` wire；当前倾向是；
7. unknown/unavailable tag是否统一作为 invalid authoritative update并 retire carrier；
8. message/tree/node/string/data numeric limits；
9. Event queue容量和 overflow preference；
10. equal-zIndex deterministic tie-break是否需要统一跨实现，还是只要求 implementation-stable；
11. sender何时应主动将 Patch backlog materialize成 Snapshot，是否需要 profile阈值；
12. malformed Patch导致整条 Data Connection retire，还是未来允许只 retire Render domain stream；当前架构因为共享 carrier没有独立 Render stream transport，因此倾向 retire current carrier并 fresh baseline。

## 31. Current Working Invariants

当前工作模型：

1. Render Update仍然只有 Subsystem → Renderer；
2. Registry决定 Domain lifecycle；
3. `domainId` 在同 generation removal后不复用；
4. Snapshot完整建立一个 Domain authoritative baseline；
5. Snapshot使用 normalized keyed tree；
6. Patch是一个 Domain的 atomic incremental authoritative commit；
7. Patch按 stable `key`寻址，不使用 JSON path；
8. Patch不修改 existing Node `tag`；
9. create/update/remove/roots/zIndex共同形成最终 candidate state；
10. Renderer验证最终 candidate后一次 commit；
11. Patch不可被任意 drop；
12. pending unsent Patch chain可被 current Snapshot替代；
13. invalid Patch不得跳过后继续应用；恢复使用 fresh connection + Snapshot；
14. Event transient / no replay / non-authoritative；
15. Event是同 Domain authoritative-update coalescing barrier；
16. fresh connection必须 Registry → Snapshot per Domain，再允许 Patch/Event；
17. no revision / ACK / replay / resync cursor in current direction；
18. no cross-Domain transaction；
19. Frame/Input/Data/Render lifecycle继续独立。

## 32. Working Summary

```text
Subsystem authoritative Domain state

render.domains
    lifecycle baseline

render.snapshot
    full recoverable Domain baseline

render.patch
    atomic incremental authoritative state transition
    keyed / normalized / ordered

render.event
    transient presentation impulse

normal path
    Snapshot
    → Patch*
    → Event
    → Patch*

backpressure
    unsent Patch chain
    → materialize latest Snapshot

reconnect
    discard old Patch/Event history
    → Registry
    → fresh Snapshot per Domain
    → Patch/Event resume
```

最终设计方向：

> **让 Patch负责效率，让 Snapshot负责恢复，让 Event负责瞬时表现；不要为了增量更新引入历史日志、ACK 或双向 resync。**
