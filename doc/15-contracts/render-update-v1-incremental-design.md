# Render Update v1 Incremental Design Draft

> 层级：正式契约演进草案  
> 状态：Working Draft / Closure Candidate  
> 目标协议：`loomrealm.render-update / 1`  
> 方向：Subsystem → Renderer only  
> 基线：[Render Update Protocol v1](./render-update-v1.md)  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> 架构：[渲染系统](../10-architecture/rendering-system.md)  
> 最近复核：2026-08-09

本文记录 Render Update v1 从 Snapshot-only 演进到 **Snapshot baseline + key-addressed incremental Patch + transient Event** 后的 closure candidate。

后续工作只应关闭 limits、wire encoding 与 conformance，不再增加新的 Render message kind 或 tag/component 协议层。

核心原则：

> **递归 Render Tree 保持为权威数据模型；one-shot Node key 用于 Patch 寻址；per-Domain revision 表示已发布 authoritative commit；Snapshot 是恢复锚点；Patch 只优化正常 authoritative state transition；Event 只表达不可恢复的一次性 presentation impulse。`tag` 只是 opaque string，Render Core不定义其具体含义。**

---

## 1. Scope / Direction

Render Update v1 完成 Subsystem → Renderer 的单向 Render 数据复制：

```text
Domain lifecycle
    full Domain Registry

fresh connection / reconnect / recovery
    full Snapshot

normal authoritative state change
    incremental Patch

transient presentation impulse
    Event
```

它不是：

```text
remote DOM protocol
component registry protocol
component loading protocol
JSON Patch protocol
historical mutation log
Renderer-driven resync RPC
remote graphics command buffer
```

角色：

```text
Subsystem
    authoritative Domain Registry / State / revision
    Snapshot/Patch/Event producer

Renderer
    read-only replicated Domain Store
    validates authoritative updates
    atomically commits Snapshot/Patch
    performs local presentation
```

方向固定：

```text
Subsystem → Renderer only
```

v1 不定义：

```text
render.ack
render.result
render.resync
render.requestSnapshot
render.patchRequest
render.resume
```

---

## 2. Carrier Scope

Render Update 运行在 current Renderer ⇄ Subsystem Data Connection 上。

Carrier 已绑定：

```text
Session
current Renderer participant
subsystemKey
DataAuthority generation
```

因此消息不重复：

```text
sessionId
rendererId
subsystemKey
generation
connectionProfile
```

Domain wire identity只需要 `domainId`。

Data Connection retired 后，旧 carrier 上的 publication chain整体终止；fresh carrier不能继续旧 chain。

---

## 3. Message Surface

v1 wire surface固定为四种：

```ts
type RenderUpdateMessageV1 =
  | RenderDomainsV1
  | RenderSnapshotV1
  | RenderPatchV1
  | RenderEventV1;
```

```text
render.domains
render.snapshot
render.patch
render.event
```

| type | 职责 |
|---|---|
| `render.domains` | current Domain Registry / lifecycle authority |
| `render.snapshot` | 一个 Domain 的完整 authoritative baseline 或 full commit |
| `render.patch` | 一个 Domain 的 atomic incremental authoritative commit |
| `render.event` | 一个 current Node 的 transient presentation impulse |

v1 不增加第五种 Render Update message kind。

---

## 4. Domain Registry / Lifecycle

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

在同一：

```text
Session + subsystemKey + DataAuthority generation
```

内，`domainId` 是 one-shot lifecycle identity：

```text
absent → present → absent
```

removed `domainId` MUST NOT在同 generation重新出现；新 lifecycle使用 fresh `domainId`。

fresh Data Connection上的第一条 Render Update message MUST 是 `render.domains`。

某 Domain只有在已 emitted Registry包含该 `domainId` 后才可发送 Snapshot/Patch/Event。

一旦 emitted Registry移除 Domain：

```text
all pending unsent Snapshot/Patch/Event for that Domain
    MUST be discarded
```

---

## 5. Authoritative Domain Data Model

```ts
interface RenderDomainStateV1 {
  readonly zIndex: number;
  readonly roots: readonly RenderNodeV1[];
}

interface RenderNodeV1 {
  readonly key: string;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: JsonObjectV1;
  readonly children: readonly RenderNodeV1[];
}
```

Domain允许 `0..N` ordered roots；Node允许 `0..N` ordered children。Domain Host不是 Render Node。

### 5.1 Node key

`key` 是 Domain-wide logical Node identity。

每个 committed Domain State：

```text
all keys across all roots + descendants MUST be unique
```

published Node key在同一 Domain lifecycle内是 one-shot identity：

```text
once removed from published Domain state
→ same key MUST NOT be introduced again
  during the same Domain lifecycle
```

如果需要新的 logical Node lifetime，producer使用 fresh key。

### 5.2 `tag`

`tag` 是 opaque string 字段。

Render Core只定义：

```text
it is a string
it obeys generic wire/size limits
same live key keeps the same tag
```

Render Core **不定义**：

```text
tag 的具体含义
known / unknown tag
tag declaration / discovery
(subsystemKey, tag) registry
Component Factory
component/module loading
per-tag attrs/data schema
DOM/Canvas/WebGL mapping
```

因此不存在 Render Core 的 unknown-tag error category，也不存在 Renderer Component Profile。

如果同一 live key需要不同 tag，必须建模为：

```text
remove old key
+ insert fresh key
```

### 5.3 `attrs` / `data`

Core只定义数据类型：

```text
attrs = string → string map
data  = plain JSON object
```

不定义业务含义。具体解释由 Subsystem 与 Renderer实现掌控。

---

## 6. Wire Tree / Internal Store

wire保持自然递归 Tree；不为了 Patch强制 normalized representation。

Renderer/Subsystem MAY内部维护：

```ts
interface DomainStoreIndex {
  readonly nodeByKey: Map<string, NodeRef>;
  readonly parentByKey: Map<string, string | null>;
}
```

例如：

```text
DomainStore
├── revision
├── zIndex
├── roots
├── nodeByKey
└── parentByKey
```

协议要求 atomic commit，但不要求 deep-clone整棵 Tree；实现 MAY使用 copy-on-write、persistent tree、structural sharing或 transactional mutable candidate。

---

## 7. Domain Revision

每个 Domain lifecycle拥有独立 revision space。

Revision：

```text
Subsystem-owned
Domain-lifecycle scoped
positive safe integer
published authoritative commit number
```

Revision不是 business mutation count、Event sequence、transport sequence、ACK sequence、replay cursor或 resume token。

内部状态可变化多次，但只在真正发布 authoritative state时推进 protocol revision。

fresh Data Connection上，首个 Snapshot直接建立当前 authoritative revision `R`；R不要求从1开始。

baseline之后每个 authoritative commit严格：

```text
R → R+1
```

因此：

```text
Snapshot R
→ Patch R→R+1
→ Patch R+1→R+2
→ Snapshot R+3
```

不同 Domain revision互相独立，无 global Render revision或 cross-Domain transaction。

---

## 8. Sender Publication Cursor

Subsystem对每个：

```text
current carrier + domainId
```

维护 sender-local：

```text
lastEmittedRevision
```

它不是 wire字段，也不是 remote ACK。

```text
fresh carrier
    unset

emit baseline Snapshot R
    R

emit Patch R→R+1
    R+1

emit full Snapshot R→R+1
    R+1
```

Data Connection已保证 per-direction order、message boundaries、observable loss、no adapter retry、no adapter duplicate。

carrier保持 current 时，emitted order足以作为后续 Patch base；carrier loss时旧 publication cursor整体废弃，fresh carrier重新 Registry + Snapshot。

---

## 9. Snapshot

```ts
interface RenderSnapshotV1 {
  readonly type: "render.snapshot";
  readonly domainId: string;
  readonly revision: number;
  readonly zIndex: number;
  readonly roots: readonly RenderNodeV1[];
}
```

Snapshot是：

```text
full current authoritative state
atomic replacement
fresh-connection baseline
normal full-commit fallback
```

Renderer：

```text
validate whole Snapshot
→ build candidate Domain Store
→ atomic replace
→ current revision = snapshot.revision
```

不得暴露 partial tree 或新旧 zIndex/tree混合状态。

fresh connection中某 Domain第一条 authoritative state message MUST 是 Snapshot。

post-baseline Snapshot作为新的 full commit时 MUST：

```text
snapshot.revision == currentRevision + 1
```

stale、duplicate、gap 都是 continuity violation。

---

## 10. Patch

```ts
interface RenderPatchV1 {
  readonly type: "render.patch";
  readonly domainId: string;
  readonly baseRevision: number;
  readonly revision: number;
  readonly zIndex?: number;
  readonly ops: readonly RenderPatchOpV1[];
}
```

必要条件：

```text
patch.baseRevision == current Domain revision
patch.revision == patch.baseRevision + 1
```

Patch revision不允许跳号。

多个未发布内部变化应直接相对 `lastEmittedRevision` 当前逻辑状态生成一个 Patch，只推进一个 protocol revision。

Core op固定：

```ts
type RenderPatchOpV1 =
  | RenderNodeInsertV1
  | RenderNodeRemoveV1
  | RenderNodeMoveV1
  | RenderNodeUpdateV1;
```

```text
insert
remove
move
update
```

不定义 JSON Patch、JSON Pointer 或 DOM mutation command family。

每个 op 的寻址/precondition针对该 op执行前的 current candidate state。

---

## 11. Patch Operations

### 11.1 Insert

```ts
interface RenderNodeInsertV1 {
  readonly op: "insert";
  readonly parentKey: string | null;
  readonly beforeKey: string | null;
  readonly node: RenderNodeV1;
}
```

`parentKey=null` 表示 roots；`beforeKey=null` 表示 append，否则插入到 current direct sibling前。

`node` 可携完整 recursive subtree。

Inserted keys必须：

```text
unique inside subtree
not live in candidate
not tombstoned in current Patch
not violate Domain-lifecycle one-shot key rule
```

insert后新 key立即可供后续 op引用。

### 11.2 Remove

```ts
interface RenderNodeRemoveV1 {
  readonly op: "remove";
  readonly key: string;
}
```

Remove删除 target，以及该 op执行时仍属于 target的 current subtree。

被删除 key全部加入 Patch-local tombstone。当前 Patch后续不得：

```text
reinsert tombstoned key
move/update tombstoned key
use tombstoned key as parentKey/beforeKey
```

需要保留 descendant时必须先 move出去，再 remove ancestor。

### 11.3 Move

```ts
interface RenderNodeMoveV1 {
  readonly op: "move";
  readonly key: string;
  readonly parentKey: string | null;
  readonly beforeKey: string | null;
}
```

固定 semantics：

```text
1. require target exists
2. detach target subtree
3. resolve destination parent in detached candidate
4. resolve beforeKey in destination sibling list after detach
5. insert before beforeKey, or append if null
```

`beforeKey == key`非法；不能 move到自身或 descendant。

### 11.4 Update

```ts
interface RenderNodeUpdateV1 {
  readonly op: "update";
  readonly key: string;
  readonly attrs?: StringMapDeltaV1;
  readonly data?: JsonObjectDeltaV1;
}
```

Update不能修改 `key/tag/children`。

```ts
interface StringMapDeltaV1 {
  readonly set?: Readonly<Record<string, string>>;
  readonly remove?: readonly string[];
}

interface JsonObjectDeltaV1 {
  readonly set?: Readonly<Record<string, JsonValueV1>>;
  readonly remove?: readonly string[];
}
```

规则：

```text
set may replace/create
remove target must currently exist
remove list has no duplicates
same member cannot appear in both set/remove
```

只做 top-level delta，不引入 JSON Pointer/nested path DSL。

### 11.5 zIndex

`RenderPatchV1.zIndex` 若存在，替换 current Domain zIndex，并与 ops属于同一次 atomic transition。

---

## 12. Patch Atomicity / Candidate Validation

```text
current committed Domain Store
→ verify baseRevision / revision
→ create isolated candidate
→ apply ops in order
→ validate final candidate
→ atomic commit
```

中间 candidate不得暴露给 presentation。

Final candidate至少满足：

```text
all Node keys Domain-wide unique
0..N ordered roots valid
one parent max
roots have no parent
all live Nodes reachable
no cycles
same live key keeps stable tag
one-shot Node key rule not violated
attrs/data plain-data constraints valid
tree depth/count/size within limits
tag is a valid bounded string
```

**Candidate validation不解释 tag 的业务含义。** Renderer不检查 tag是否“已知”、是否已注册、是否存在 Factory，也不通过 Render Core进行 tag capability negotiation。

任何 authoritative candidate validation失败：

```text
current Domain Store unchanged
current revision unchanged
whole message not partially applied
```

---

## 13. Authoritative Continuity Failure

以下统一视为 Render stream continuity failure：

```text
Patch baseRevision mismatch
Patch revision != baseRevision + 1
Patch op precondition failure
Patch final candidate invalid
post-baseline Snapshot revision != currentRevision + 1
post-baseline Snapshot invalid
hard malformed authoritative message
```

Renderer MUST NOT skip failed commit或继续应用后续 Patch。

恢复固定：

```text
stop trusting current Render authoritative stream
→ retire current Data Connection
→ if DataAuthority still current, establish fresh carrier
→ render.domains
→ fresh Snapshot for every current Domain
```

无 `render.patchError`、`render.resync`、`render.requestSnapshot`、ACK或NACK。

Render continuity failure不等于 Runtime terminal failure或 Frame unwind。

---

## 14. Fresh Connection Baseline

fresh current Data Connection：

```text
1. render.domains(current full Registry)
2. fresh render.snapshot for every current Domain
3. ordinary render.patch / render.event
```

Patch不能成为 fresh connection上某 Domain的第一条 authoritative state message。

Renderer MAY暂时保留旧 presentation cache，但：

```text
cached revision != recovery authority
no Patch may apply to cached state
no new Event may target cached state
```

fresh Snapshot建立新的 current authoritative baseline。

---

## 15. Event

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

Event不能作为 Node existence、persistent visibility/selection/position、current business data等 authoritative事实的唯一表达。

Event target gate：

```text
Domain current
fresh baseline applied
targetKey exists in current committed tree
```

否则 drop；不 queue-until-appears、不 retarget、不 reconnect replay。

Event 的 `name/data` 具体含义由 Subsystem 与 Renderer实现掌控，Render Core不建立 Event-name registry/profile。

---

## 16. Event / Authoritative Barrier

Snapshot/Patch/Event共享 ordered carrier。

例如：

```text
Patch inserts X
→ Event targets X
→ Patch removes X
```

Renderer必须保持 logical processing：

```text
commit insert
→ dispatch Event against current X
→ commit removal
```

不要求等待 physical paint/vsync，但 Store commit、本地 reconciliation和 Event dispatch不得逻辑越序。

不需要 `afterRevision` / `eventSequence`。

---

## 17. Backpressure / Coalescing

所有队列 MUST bounded。

核心优先级：

> **authoritative state convergence MUST NOT be indefinitely blocked by transient Events。**

Registry可 latest-state coalesce，但必须保持 Domain lifecycle barrier。

已提交给 carrier的 Snapshot/Patch：

```text
MUST NOT retract
MUST NOT reorder
MUST NOT silently skip
```

未发送 desired changes可相对 `lastEmittedRevision`重新 diff成一个 Patch。

当 Patch太大/复杂或队列压力高时，sender MAY发送：

```text
Snapshot revision = lastEmittedRevision + 1
```

作为下一次 full authoritative commit。

Event使用 bounded ordered FIFO：

```text
no coalescing
may drop on overflow
surviving order preserved
no replay
```

Event backlog妨碍 authoritative progress时，应优先丢 transient Event。

具体 Event容量/drop策略由 Completion冻结。

---

## 18. Subsystem Patch Generation

业务逻辑 SHOULD NOT直接拼 wire Patch。

推荐：

```text
Business State
→ Render Projector
→ Desired recursive Domain Tree
→ diff against last published logical tree
→ Patch or Snapshot
```

Diff利用 stable key：

```text
old has / new missing       → remove
old missing / new has       → insert
same key parent/order       → move
same key attrs/data changed → update
same key tag changed        → remove old + insert fresh key
```

sender diff base对应 `lastEmittedRevision` 的逻辑 state，而不是 Renderer presentation state。

Patch-vs-Snapshot cost heuristic是 implementation detail。

---

## 19. Failure Boundary

以下不等于 Runtime failure / Frame unwind：

```text
Patch queue pressure
Snapshot fallback
Event loss
Data reconnect
Renderer reload
local presentation error
```

Render Core不感知某个 tag在 Renderer内部如何实现，因此本地 presentation integration failure 不是 Render tag protocol error。

Runtime/Frame failure authority仍属于 Control Plane。

---

## 20. Current Closure Invariants

1. Render Update只有 Subsystem → Renderer 单向 Render data flow；
2. Subsystem是 Domain Registry / Domain State / revision authority；
3. Domain Registry full replacement决定 Domain lifecycle；
4. 同 generation内 removed `domainId`不复用；
5. authoritative wire保持 recursive `roots[] / children[]`；
6. Node key Domain-wide unique；
7. published Node key在同 Domain lifecycle内 one-shot；
8. same live key保持同一 `tag` string；
9. `tag` 是 opaque string，协议不定义语义、声明、发现、known/unknown分类或实现映射；
10. attrs/data只冻结 plain-data类型边界；
11. Renderer/Subsystem MAY内部建立 key/parent indexes；
12. Snapshot携带完整 Tree + revision；
13. fresh connection先 Registry，再为每个 current Domain建立 fresh Snapshot baseline；
14. baseline后每次 authoritative commit严格 `R→R+1`；
15. sender以 `lastEmittedRevision` 作为 publication cursor，不使用 ACK；
16. Patch必须 `baseRevision == currentRevision` 且 `revision == baseRevision + 1`；
17. Patch ops按数组顺序执行，whole Patch atomic commit；
18. structural ops仅 insert/remove/move/update；
19. remove建立 Patch-local tombstone；
20. move使用 detach-then-resolve；
21. update只修改 attrs/data；
22. attrs/data delta只做 top-level set/remove；
23. generic JSON Patch/JSON Pointer不进入 v1；
24. continuity failure不能被跳过后继续；
25. divergence通过 fresh Data Connection + Snapshot恢复；
26. Event只表达 transient presentation impulse；
27. Event不修改 authoritative Store；
28. Event按 logical processing order与 Snapshot/Patch形成 barrier；
29. stale Event target可丢弃；
30. emitted authoritative message不可撤销/重排；
31. unsent desired changes可重 diff为 Patch或 Snapshot；
32. authoritative progress优先于 Event backlog；
33. 无 Patch history replay / ACK / NACK / Renderer resync RPC；
34. 无 Renderer Component Profile 或 tag semantic protocol。

---

## 21. Remaining Closure Items

核心状态机已闭合。剩余工作只包括 Completion 与 conformance：

1. `domainId` / Node `key` grammar与 UTF-8 byte limits；
2. `tag` UTF-8 byte limit；**不定义 tag semantic grammar**；
3. message size、JSON depth、tree depth、Node count、Patch op count limits；
4. attrs count/key/value limits、data size/depth limits；
5. zIndex具体 numeric range；
6. Event FIFO容量与 overflow drop policy；
7. closed-schema JSON wire encoding细节；
8. Snapshot/Patch/Event/Registry conformance fixture matrix；
9. sender diff策略和 Snapshot-vs-Patch cost heuristic仅作为 implementation guidance，不进入 normative Core。

不再存在：

```text
unknown/undeclared tag classification
Component Factory availability classification
Renderer Component Profile closure
```

这些不是 Render协议问题。

---

## 22. Minimum Conformance Scenarios

至少覆盖：

```text
fresh-connection-registry-before-render-state
fresh-snapshot-establishes-arbitrary-current-revision
post-baseline-snapshot-revision-plus-one
post-baseline-stale-or-gap-snapshot-fails-closed

patch-base-matches-current
patch-revision-exactly-plus-one
patch-base-mismatch-fails-closed
patch-gap-revision-fails-closed
patch-no-partial-apply

insert-root
insert-child
insert-subtree
insert-duplicate-key-rejected
insert-tombstoned-key-rejected

remove-leaf
remove-subtree-cascade
move-child-before-remove-parent-preserves-child
patch-local-tombstone-blocks-reuse

move-reorder-same-parent
move-reparent
move-root-to-child
move-child-to-root
move-detach-then-resolve-before-key
move-before-self-rejected
move-under-descendant-rejected

update-attrs-set-remove
update-data-set-remove
update-set-remove-same-member-rejected
update-remove-missing-member-rejected

node-key-domain-wide-unique
published-node-key-one-shot
same-live-key-tag-stable
tag-treated-as-opaque-string
zero-root-domain
multi-root-order

snapshot-fallback-under-backpressure
publication-cursor-resets-on-fresh-carrier
same-generation-reconnect-requires-fresh-snapshot

patch-insert-node-then-event-targets-new-node
event-before-remove-targets-current-node
stale-event-target-dropped
event-overflow-does-not-block-authoritative-progress

authoritative-continuity-failure-retires-data-connection
data-retire-does-not-fail-runtime
data-retire-does-not-unwind-frame
```

Conformance MUST NOT require a standard tag registry, Component Factory, component loader或 per-tag schema。

---

## 23. Summary

```text
Subsystem authoritative Domain State
    recursive keyed tree

        │
        ├── Registry
        │       lifecycle authority
        │
        ├── Snapshot(revision)
        │       fresh baseline / full commit / recovery
        │
        ├── Patch(R → R+1)
        │       insert / remove / move / update
        │       isolated candidate + atomic commit
        │
        └── Event
                transient presentation impulse
                ordered against authoritative commits

Node.tag
    opaque string
    no protocol-defined meaning

Subsystem sender
    lastEmittedRevision per carrier + Domain

Renderer
    authoritative replica Store
    + implementation-owned presentation

Recovery
    continuity failure / reconnect
        → retire carrier
        → Registry
        → fresh Snapshots
```

最终设计取向：

> **Render协议只复制结构化 authoritative state，不标准化 Renderer 如何解释或呈现该 state。让 key承担 identity，让 revision承担 published commit causality，让 Snapshot承担恢复；`tag` 的意义留给实现。**
