# Renderer ⇐ Subsystem Render Update Protocol v1

> 层级：正式契约  
> 状态：Active Design / Closure Candidate  
> 协议版本：1  
> 协议标识：`loomrealm.render-update / 1`  
> 稳定程度：Stabilizing  
> 方向：Subsystem → Renderer only  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> 架构：[渲染系统](../10-architecture/rendering-system.md)  
> 相邻协议：[User Input Protocol v1](./user-input-v1.md)  
> 最近复核：2026-08-09

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Render Update v1 只复制 Subsystem-owned Render Domain authoritative state。Registry 管 lifecycle，Snapshot 建立/替换完整基线，Patch 表达严格 `R→R+1` 的原子增量 commit，Event 表达可丢失的一次性 presentation impulse。`tag` 只是 opaque string；协议不定义组件语义、组件注册或加载。**

---

## 1. Scope / Direction

Render Update v1 运行在 current Renderer ⇄ Subsystem Data Connection 上，方向固定：

```text
Subsystem → Renderer only
```

它负责：

```text
Domain Registry / lifecycle
full Snapshot baseline / full commit
incremental Patch
transient Event
```

它不负责：

```text
Renderer → Subsystem RPC
Render ACK / NACK / Result
Renderer-driven resync
historical Patch/Event replay
component registry / loading
DOM remote-control
Frame / Input authority
Content transport
```

Carrier 已绑定：

```text
Session
current Renderer participant
subsystemKey
DataAuthority generation
```

因此 Render Update message 不重复 `sessionId`、`rendererId`、`subsystemKey`、`generation` 或 `connectionProfile`。

---

## 2. Message Surface

v1 只有四种 application message：

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

没有 Batch，也不再增加第五种 Render message kind。

---

## 3. Domain Registry / Lifecycle

```ts
interface RenderDomainsV1 {
  readonly type: "render.domains";
  readonly domains: readonly string[];
}
```

`domains` 是 full replacement set：

```text
no duplicates
array order has no presentation meaning
```

在同一：

```text
Session + subsystemKey + DataAuthority generation
```

内，`domainId` 是 one-shot lifecycle identity：

```text
absent → present → absent
```

一旦 removed，同一 generation 内 MUST NOT重新出现；新 lifecycle 使用 fresh `domainId`。

不存在独立：

```text
render.create
render.destroy
render.close
```

Registry membership 本身就是 Domain lifecycle authority。

### 3.1 Publication barrier

fresh Data Connection 上第一条 **Render Update** message MUST 是 `render.domains`。

某 Domain 只有在更早 emitted Registry 已包含该 `domainId` 后，才可发送 Snapshot/Patch/Event。

一旦 emitted Registry 移除 Domain：

```text
all pending unsent Snapshot/Patch/Event for that Domain
    MUST be discarded
```

之后不得再发送该 Domain 的 Render message。

尚未 emitted 的 Registry MAY latest-state coalesce，但不得破坏 one-shot lifecycle 与 publication barrier。

---

## 4. Authoritative Domain Data Model

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

Domain 允许 `0..N` ordered roots；Node 允许 `0..N` ordered children。Domain Host 不是 Render Node。

### 4.1 Node key

`key` 是 Domain-wide logical Node identity。

每个 committed Domain State 中：

```text
all Node keys across all roots + descendants MUST be unique
```

published Node key 在同一 Domain lifecycle 内是 one-shot identity：

```text
once removed from published Domain state
→ same key MUST NOT be introduced again
  during the same Domain lifecycle
```

新 logical Node lifetime 使用 fresh key。

### 4.2 `tag`

`tag` 是 opaque string 字段。

Render Core只定义：

```text
it is a string
it obeys generic wire/byte limits
same live key keeps the same tag
```

Render Core不定义：

```text
tag 的具体含义
known / unknown tag
tag declaration / discovery
(subsystemKey, tag) registry
Component Factory
component/module loading
per-tag attrs/data schema
DOM / Canvas / WebGL mapping
```

因此不存在 Render Core 的 unknown-tag error category，也不存在 Renderer Component Profile。

同一 live key 若需要不同 `tag`，必须建模为：

```text
remove old key
+ insert fresh key
```

### 4.3 `attrs` / `data`

Core只定义数据类型：

```text
attrs = string → string map
data  = plain JSON object
```

不定义业务含义。具体解释由 Subsystem 与 Renderer 实现掌控。

---

## 5. Wire Tree / Internal Store

wire 保持自然递归 Tree，不为了 Patch 强制 normalized representation。

Renderer/Subsystem MAY 内部维护：

```text
revision
zIndex
roots
key → node index
key → parent index
```

并 MAY 使用 copy-on-write、persistent tree、structural sharing 或 transactional mutable candidate。

协议只要求最终 authoritative commit 原子可见，不要求 deep-clone 整棵 Tree。

---

## 6. Domain Revision

每个 Domain lifecycle 拥有独立 revision space。

Revision：

```text
Subsystem-owned
Domain-lifecycle scoped
positive safe integer
represents published authoritative commits
```

Revision 不是：

```text
business mutation count
transport message sequence
Event sequence
ACK sequence
replay cursor
resume token
```

fresh carrier 上某 Domain 的第一条 Snapshot 可直接建立当前 authoritative revision `R`；`R` 不要求从 1 开始。

baseline 建立后，同一 current carrier 上每个 authoritative commit严格：

```text
newRevision = currentRevision + 1
```

不同 Domain revision 相互独立；没有 global Render revision 或 cross-Domain transaction。

---

## 7. Sender Publication Cursor

Subsystem 对每个：

```text
current carrier + domainId
```

维护 sender-local：

```text
lastEmittedRevision
```

它不是 wire field，也不是 ACK cursor。

```text
fresh carrier
    lastEmittedRevision = unset

emit baseline Snapshot R
    lastEmittedRevision = R

emit Patch R→R+1
    lastEmittedRevision = R+1

emit full Snapshot R+1
    lastEmittedRevision = R+1
```

Data Connection 已保证同方向 ordered delivery、preserved application-message boundaries、observable loss、no adapter retry、no adapter duplicate，因此 v1 不需要 Render ACK。

carrier loss 后旧 publication cursor 整体废弃；fresh carrier 用 Registry + fresh Snapshots 重建。

---

## 8. Snapshot

```ts
interface RenderSnapshotV1 {
  readonly type: "render.snapshot";
  readonly domainId: string;
  readonly revision: number;
  readonly zIndex: number;
  readonly roots: readonly RenderNodeV1[];
}
```

Snapshot 是：

```text
full current authoritative state
atomic replacement
fresh-connection recovery baseline
normal full-commit fallback
```

Renderer：

```text
validate whole Snapshot
→ build candidate Domain Store
→ atomic replace
→ current revision = snapshot.revision
```

不得暴露 partial tree 或新旧 `zIndex/tree` 混合状态。

### 8.1 Fresh baseline

fresh connection 中某 Domain 第一条 authoritative state message MUST 是 Snapshot。

它直接建立 current Domain Store 与 current revision；旧 presentation cache 不是 Patch base authority。

### 8.2 Post-baseline full commit

baseline 之后 Snapshot 仍可作为 full authoritative commit，例如用于 backpressure fallback。

此时 MUST：

```text
snapshot.revision == currentRevision + 1
```

stale/duplicate/gapped post-baseline Snapshot 都是 continuity violation。

---

## 9. Patch

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

可应用条件固定：

```text
patch.baseRevision == currentRevision
patch.revision == patch.baseRevision + 1
```

多个尚未发布的内部变化可以直接相对 `lastEmittedRevision` 的已发布 state 重新 diff，只产生一个下一 revision commit。

### 9.1 Operation algebra

```ts
type RenderPatchOpV1 =
  | RenderNodeInsertV1
  | RenderNodeRemoveV1
  | RenderNodeMoveV1
  | RenderNodeUpdateV1;
```

Core 只有：

```text
insert
remove
move
update
```

不定义 JSON Patch、JSON Pointer、path identity 或 DOM mutation command family。

每个 op 的 precondition 与寻址都针对“该 op 执行前的 candidate state”。

### 9.2 Insert

```ts
interface RenderNodeInsertV1 {
  readonly op: "insert";
  readonly parentKey: string | null;
  readonly beforeKey: string | null;
  readonly node: RenderNodeV1;
}
```

`parentKey=null` 表示 roots；`beforeKey=null` 表示 append。

`node` 可携完整递归 subtree。所有 inserted keys MUST fresh、内部唯一、当前 candidate 不存在，且不得违反 Domain-lifecycle one-shot key rule。

同一 Patch 后续 op MAY target 刚插入的 key。

### 9.3 Remove

```ts
interface RenderNodeRemoveV1 {
  readonly op: "remove";
  readonly key: string;
}
```

Remove 删除 target 以及该 op 执行时仍属于 target 的整个 current subtree。

被删除 target + descendants 加入 Patch-local tombstone set；当前 Patch 后续不得：

```text
reinsert tombstoned key
move/update tombstoned key
use tombstoned key as parentKey/beforeKey
```

### 9.4 Move

```ts
interface RenderNodeMoveV1 {
  readonly op: "move";
  readonly key: string;
  readonly parentKey: string | null;
  readonly beforeKey: string | null;
}
```

固定解释顺序：

```text
1. require target exists
2. detach target subtree
3. resolve destination parent in detached candidate
4. resolve beforeKey in destination sibling list after detach
5. insert before beforeKey, or append if null
```

`beforeKey == key` 非法；不得 move 到自身或 descendant 下。

### 9.5 Update

```ts
interface RenderNodeUpdateV1 {
  readonly op: "update";
  readonly key: string;
  readonly attrs?: StringMapDeltaV1;
  readonly data?: JsonObjectDeltaV1;
}

interface StringMapDeltaV1 {
  readonly set?: Readonly<Record<string, string>>;
  readonly remove?: readonly string[];
}

interface JsonObjectDeltaV1 {
  readonly set?: Readonly<Record<string, JsonValueV1>>;
  readonly remove?: readonly string[];
}
```

Update 只能修改 attrs/data；不能修改 key/tag/children。

`set/remove` 只作用于 top-level members：

```text
set MAY replace/create
remove target MUST exist
remove list has no duplicates
same member MUST NOT appear in set and remove
```

嵌套 object 变化通过替换其 top-level value 表达，不扩展 generic nested patch language。

### 9.6 zIndex

Patch `zIndex` 若存在，替换当前 Domain zIndex，并与 `ops[]` 属于同一个原子 Domain commit。

---

## 10. Patch Atomicity / Final Validation

Renderer：

```text
current committed Domain Store
→ verify baseRevision/revision
→ isolated candidate
→ apply ordered ops
→ validate final candidate
→ atomic commit once
```

中间 candidate MUST NOT 暴露给 presentation。

最终 candidate 至少满足：

```text
all Node keys Domain-wide unique
0..N ordered roots valid
one Node has at most one parent
root Node has no parent
all live Nodes reachable from roots
no cycles
one-shot Node key rule not violated
same live key keeps stable tag string
attrs/data plain-data constraints valid
all wire/tree limits satisfied
```

Renderer 当前如何解释 tag、是否存在某种 Component/Factory、presentation 是否成功，不属于 authoritative candidate validation。

---

## 11. Event

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
MUST NOT coalesce
MUST NOT replay
MAY be lost
```

Event 不能成为 persistent correctness 唯一来源。

只有：

```text
Domain current
fresh baseline already applied
targetKey exists in current committed tree
```

时才交给本地 presentation。否则直接 drop；不得 queue-until-target、retarget 或 reconnect replay。

### 11.1 Event / commit barrier

Snapshot/Patch/Event 共享 ordered carrier。

Renderer 必须保证 logical processing order：

```text
commit state
→ reconcile local presentation lifetime as needed
→ deliver Event
→ apply later commit
```

例如：

```text
Patch inserts X
→ Event targets X
```

Event 必须作用于该 Patch 建立的 X lifetime。

```text
Event targets X
→ Patch removes X
```

Event 必须先作用于旧 X lifetime，再处理 removal。

不要求等待 physical paint / vsync，也不增加 `afterRevision`。

---

## 12. Backpressure / Coalescing

所有实现队列 MUST bounded。

协议只冻结 correctness，不冻结具体容量或 drop-oldest/drop-newest 参数。

### Registry

尚未 emitted 的 full Registry MAY latest-state coalesce，但必须保持 lifecycle barrier。

### Authoritative commits

已 emitted Snapshot/Patch：

```text
MUST NOT retract
MUST NOT reorder
MUST NOT silently skip
```

尚未 emitted 的 desired-state 变化可以相对最后已发布 state 重新 diff 为一个 Patch `R→R+1`。

如果 Patch 过大/过复杂/队列压力高，sender MAY 直接 materialize：

```text
Snapshot revision = lastEmittedRevision + 1
```

作为下一次 full commit。

具体 Patch-vs-Snapshot cost heuristic 是 implementation detail。

### Event

Event 使用 bounded ordered queue；MAY 在压力下丢弃，surviving Events 保持原相对顺序，丢弃后不得 replay。

如果 transient Event backlog 妨碍 authoritative state progress，实现 MUST 优先保证 authoritative convergence；具体队列容量与丢弃策略不属于 protocol conformance。

---

## 13. Continuity Failure / Recovery

以下属于 authoritative Render stream continuity failure：

```text
Patch baseRevision mismatch
Patch revision != baseRevision + 1
Patch op precondition failure
Patch final candidate invalid
post-baseline Snapshot revision != currentRevision + 1
post-baseline Snapshot invalid
hard malformed authoritative message
hard wire/size/depth violation
```

Renderer MUST NOT：

```text
skip failed authoritative commit
continue later Patch
invent missing state
silently downgrade invalid mutation to no-op
```

恢复固定：

```text
stop trusting current Render stream
→ retire current Data Connection
→ if DataAuthority still current, establish fresh carrier
→ render.domains(current Registry)
→ fresh Snapshot for every current Domain
→ ordinary Patch/Event
```

不定义：

```text
render.patchError
render.requestSnapshot
render.resync
ACK / NACK
Patch history replay
resume cursor
```

Render continuity failure不等于 Runtime terminal failure，也不触发 Frame unwind。

---

## 14. Frame / Input / Data Independence

Render Update message MUST NOT携带 `frameId`、`activationId`、InputTarget 或 Frame lifecycle。

```text
Frame active != Domain visible
Frame suspended != Domain hidden
Frame close/unwind != Domain destroy
Activation replacement != Domain lifecycle
Data Connection retire != authoritative Domain destroy
Domain/Node existence != ordinary input authority
```

Runtime failure authority仍属于 Control/Supervisor；ordinary input authority仍属于 Main InputTarget/Activation + User Input v1。

---

## 15. Plain JSON / Closed Schema

Render Update v1 使用 plain JSON-compatible values；protocol objects 为 closed schema。

禁止：

```text
undefined
NaN / Infinity
BigInt
Function / Symbol
DOM/Host object
MessagePort
Blob
class instance
invalid Unicode scalar sequence
duplicate JSON object member
```

整数语义字段 MUST 是 safe integer。

`attrs` 只允许 string→string；`data`/Event `data` 只允许 plain JSON object。

---

## 16. Limits Boundary

在 v1 closure 中需要固定会影响跨实现 validation 的 hard limits：

```text
domainId byte limit / grammar
Node key byte limit / grammar
tag byte limit only; no semantic grammar
message byte limit
JSON depth
tree depth
Node count
Patch op count
attrs count/key/value limits
data size/depth limits
zIndex numeric range
```

不需要协议化：

```text
Event FIFO concrete capacity
Event drop-oldest/drop-newest preference
Patch-vs-Snapshot cost threshold
internal index/cache size
presentation scheduler policy
```

---

## 17. Minimum Conformance Scenarios

至少覆盖：

```text
fresh-connection-registry-before-render-state
fresh-snapshot-establishes-arbitrary-current-revision
post-baseline-snapshot-exact-plus-one
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
opaque-tag-no-semantic-validation
zero-root-domain
multi-root-order

snapshot-fallback-under-backpressure
publication-cursor-resets-on-fresh-carrier
same-generation-reconnect-requires-fresh-snapshot

patch-insert-node-then-event-targets-new-lifetime
event-before-remove-targets-old-lifetime
stale-event-target-dropped
event-overflow-does-not-block-authoritative-progress

authoritative-continuity-failure-retires-data-connection
data-retire-does-not-fail-runtime
data-retire-does-not-unwind-frame
```

---

## 18. Explicit Non-Goals

v1 不定义：

```text
Renderer → Subsystem Render RPC
ACK / Result / NACK
historical mutation log
Patch replay
resume cursor
JSON Patch / JSON Pointer
cross-Domain transaction
cross-Subsystem transaction
render frame fence
vsync protocol
animation clock synchronization
damage rectangles
raster command stream
graphics codec negotiation
binary texture streaming
component registry/profile/loading
DOM/CSS protocol
Frame binding
Input authority
business state mutation
```

---

## 19. Current Closure Invariants

1. Render Update 只有 Subsystem → Renderer 单向数据流；
2. Subsystem 是 Domain Registry / State / revision authority；
3. Domain Registry full replacement 决定 lifecycle；
4. 同 generation removed `domainId` 不复用；
5. authoritative wire model 保持递归 `roots[]/children[]`；
6. Node key Domain-wide unique 且同 Domain lifecycle one-shot；
7. `tag` 只是 opaque string，同 live key 保持稳定；
8. fresh connection 先 Registry，再为每个 current Domain建立 fresh Snapshot；
9. baseline 后 authoritative commit 严格 `R→R+1`；
10. sender 用 `lastEmittedRevision`，不使用 ACK；
11. Patch 仅 `insert/remove/move/update`，whole candidate atomic commit；
12. generic JSON Patch/JSON Pointer 不进入 Core；
13. Event 是 transient logical barrier，不修改 authoritative Store；
14. continuity failure 通过 fresh Data Connection + Registry/Snapshots 恢复；
15. no ACK/NACK/replay/resync RPC；
16. Frame/Data/Input/Render authority 与 lifecycle 保持独立；
17. Component/presentation 实现完全不属于 Render protocol conformance。

## 20. Remaining Closure Work

剩余工作只关闭：

```text
hard wire/tree numeric limits
identifier byte limits/grammar
zIndex range
closed-schema encoding details
Snapshot/Patch/Event/Registry fixture matrix
```

不再新增 Component Profile、tag semantic grammar、Event FIFO Profile、Render ACK 或新的 message kind。
