# Render Update v1 Incremental Design Draft

> 层级：正式契约演进草案  
> 状态：Working Draft / Closure Candidate  
> 目标协议：`loomrealm.render-update / 1`  
> 方向：Subsystem → Renderer only  
> 基线：[Render Update Protocol v1](./render-update-v1.md)  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> 架构：[渲染系统](../10-architecture/rendering-system.md)  
> 最近复核：2026-08-09

本文不是 Frozen Contract。它记录 Render Update v1 从 Snapshot-only 演进到 **Snapshot baseline + key-addressed incremental Patch + transient Event** 后的 closure candidate。

后续设计应优先消除剩余自由度、冻结 limits/conformance，并最终合并回正式 `render-update-v1.md`；除非出现新的 correctness 需求，否则不再扩展 v1 wire surface。

核心原则：

> **递归 Render Tree 保持为权威数据模型；stable one-shot Node key 用于 Patch 寻址；per-Domain revision 表示已发布 authoritative commit 顺序；Snapshot 始终是恢复锚点；Patch 只优化正常运行时的 authoritative state transition；Event 只表达不可恢复的一次性 presentation impulse。**

---

## 1. 设计目标

Render Update v1 需要完成 Subsystem → Renderer 的单向 Render 数据复制，并同时满足：

```text
Domain lifecycle
    full Domain Registry

首次建立 / reconnect / recovery
    full Snapshot

正常高频 authoritative state change
    incremental Patch

一次性表现动作
    transient Event
```

目标不是构建：

```text
remote DOM protocol
JSON Patch protocol
historical mutation log
Renderer-driven resync RPC
remote graphics command buffer
```

目标是复制 Subsystem-owned Render Domain current state。

v1 优先保持：

```text
single authority
small wire surface
stable identity
explicit causality
atomic application
bounded queues
fresh reconnect baseline
no historical replay
no Renderer → Subsystem Render RPC
```

---

## 2. Roles / Direction

```text
Subsystem
    authoritative Domain Registry
    authoritative Domain State
    Domain revision allocator
    Snapshot/Patch/Event producer

Renderer
    read-only replicated Domain Store
    validates authoritative updates
    atomically commits Snapshot/Patch
    derives presentation/component instances
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

无 ACK 并不意味着没有顺序保证；顺序由 Data Connection ordered carrier + Domain revision continuity共同保证。

---

## 3. Carrier Scope

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

完整 authority scope由 enclosing Data Connection提供。

Data Connection retired 后，旧 carrier 上未完成的 Render publication chain全部终止；旧 chain不能在 fresh carrier上继续。

---

## 4. Message Surface

候选 v1 wire surface固定为四种 message kinds：

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

职责：

| type | 职责 |
|---|---|
| `render.domains` | current Domain Registry / lifecycle authority |
| `render.snapshot` | 一个 Domain 的完整 authoritative baseline 或 full commit |
| `render.patch` | 一个 Domain 的 atomic incremental authoritative commit |
| `render.event` | 一个 current Node 的 transient presentation impulse |

v1 不再增加第五种 Render Update message kind。

---

## 5. Domain Registry

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

### 5.1 Domain one-shot lifecycle

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

这使 Registry可以安全 latest-state coalesce，同时避免 destroy→recreate 被隐藏后错误复用旧 presentation-local state。

### 5.2 Registry publication barrier

fresh Data Connection上的第一条 Render Update message MUST 是 `render.domains`。

某 Domain只有在已发送 Registry包含该 `domainId` 后，才可发送其 Snapshot/Patch/Event。

一旦发送 Registry移除 Domain：

```text
all pending unsent Snapshot/Patch/Event for that Domain
    MUST be discarded
```

之后不得再为该 Domain发送消息。

---

## 6. Authoritative Domain Data Model

Patch 不改变当前 Render Tree 数据结构。

权威 Domain State 保持自然递归树：

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

Domain允许：

```text
0..N ordered roots
```

Node允许：

```text
0..N ordered children
```

Domain Host不是 Render Node，不要求 fake root。

### 6.1 Node key

`key` 是 Domain-wide logical Node identity。

每个 committed Domain State：

```text
all keys across all roots + descendants MUST be unique
```

当前 Node可通过：

```text
(domainId, key)
```

在当前 Render authority scope内唯一寻址。

### 6.2 Node key one-shot lifetime

对已经进入已发布 authoritative state 的 Node key：

```text
once that key is removed from the published Domain state
→ the same key MUST NOT be introduced again
  during the same Domain lifecycle
```

即 Node key与 Domain ID采用相同的 one-shot identity原则。

如果需要新的 logical component lifetime，producer MUST 使用 fresh key。

该规则是 producer obligation；协议不要求 Renderer保存无限历史 tombstone用于跨 reconnect验证。

目的：避免以下情况在 Snapshot coalescing / disconnect期间被隐藏：

```text
old K removed
→ new logical component recreated as K
```

Renderer不应被迫判断新 K 是否应继承旧 K 的 component-local state。

### 6.3 Tag continuity

同一 live key持续存在期间：

```text
tag MUST remain stable
```

改变 component type必须通过：

```text
remove old key
+ insert fresh key with new tag
```

---

## 7. Wire Tree 与 Internal Store 分离

协议 wire保持递归 Tree，不为了 Patch强制 normalized representation。

Renderer和Subsystem实现 MAY在内部建立：

```ts
interface DomainStoreIndex {
  readonly nodeByKey: Map<string, NodeRef>;
  readonly parentByKey: Map<string, string | null>;
}
```

推荐 Renderer Store概念结构：

```text
DomainStore
├── revision
├── zIndex
├── roots
├── nodeByKey
└── parentByKey
```

因此：

```text
wire model
    natural recursive tree

Patch addressing
    stable key

implementation
    MAY normalized/indexed/copy-on-write/persistent-tree
```

协议要求 atomic commit，但不要求 deep-clone整棵 Tree。

---

## 8. Domain Revision

每个 Domain lifecycle拥有独立 revision space。

Revision：

```text
Subsystem-owned
Domain-lifecycle scoped
positive safe integer
represents published authoritative commits
```

Revision不是：

```text
business mutation count
Render Event sequence
transport message sequence
history replay cursor
ACK sequence
resume token
```

### 8.1 Revision表示 protocol commit

内部业务状态可以变化任意次数，但只有真正发布新的 authoritative Domain state时才推进 revision。

例如 remote 已发布 R100，Subsystem内部经历多个未发送 desired states：

```text
A → B → C → D
```

如果最终只发布一次 Patch/Snapshot，则 protocol commit为：

```text
R100 → R101
```

而不是人为产生 R101..R104。

### 8.2 Baseline 与 subsequent commit

fresh Data Connection上，某 Domain第一条 Snapshot建立 baseline：

```text
Snapshot revision = current authoritative revision R
```

R只要求是合法 positive safe integer；不要求从 1开始，也不与旧 carrier缓存连续。

baseline建立后，在同一 current carrier上，每一个后续 authoritative commit MUST：

```text
new revision = current revision + 1
```

因此：

```text
Snapshot R
→ Patch R→R+1
→ Patch R+1→R+2
→ Snapshot R+3
→ Patch R+3→R+4
```

post-baseline Snapshot和Patch都属于 authoritative commit，因此都连续 +1。

不同 Domain revision互相独立；不存在 global Render revision或 cross-Domain revision transaction。

---

## 9. Sender Publication Cursor

为了在无 ACK 的情况下安全生成后续 Patch，Subsystem对每个：

```text
current carrier + domainId
```

维护 sender-local publication cursor：

```text
lastEmittedRevision
```

它不是 wire字段，也不是 remote ACK。

规则：

```text
fresh carrier
    lastEmittedRevision = unset

emit baseline Snapshot R
    lastEmittedRevision = R

emit Patch R→R+1
    lastEmittedRevision = R+1

emit full Snapshot R→R+1
    lastEmittedRevision = R+1
```

为什么 emitted 足够：Data Connection已经保证同方向 ordered delivery、preserved message boundaries、observable loss、no adapter retry、no adapter duplicate。

如果 carrier保持 current，Renderer按发送顺序观察 authoritative messages；如果 carrier loss，则旧 publication cursor整体废弃，fresh carrier重新从 Registry + Snapshot开始。

协议不需要知道旧 carrier最后成功送达的具体 revision。

---

## 10. Snapshot

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
fresh-connection recovery baseline
normal full-commit fallback
```

Renderer：

```text
validate whole Snapshot
→ build candidate Domain Store
→ if valid: atomic replace
→ current revision = snapshot.revision
```

不得暴露：

```text
partial tree
new zIndex + old tree
half-updated index
```

### 10.1 Fresh baseline Snapshot

fresh connection中某 Domain的第一条 authoritative state message MUST 是 Snapshot。

它直接建立：

```text
current Domain Store
current revision
```

Renderer旧 presentation cache不能作为 Patch base authority。

### 10.2 Post-baseline Snapshot

baseline建立后，Snapshot也可以作为一次 full authoritative commit，例如用于 backpressure fallback。

此时 MUST：

```text
snapshot.revision == currentRevision + 1
```

以下都属于 continuity violation：

```text
snapshot.revision <= currentRevision
snapshot.revision > currentRevision + 1
```

因为 ordered/no-duplicate carrier下没有合法理由发送 stale/duplicate/gapped post-baseline Snapshot。

---

## 11. Patch

Patch表示：

> **从当前明确的 Domain authoritative state，原子转换到下一个 authoritative state。**

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

Patch可应用的必要条件：

```text
patch.baseRevision == current Domain revision
patch.revision == patch.baseRevision + 1
```

Patch revision不允许跳号。

多个尚未发布的内部变化如果需要合并，应直接针对 `lastEmittedRevision` 当前状态生成一个完整 Patch，并只推进一个 protocol revision。

---

## 12. Patch Operation Algebra

v1 Core structural operations固定为四种：

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

不定义：

```text
JSON Patch
JSON Pointer
appendChild
removeChild
setChildAtIndex
replaceChildren
moveBefore/moveAfter command family
```

`ops[]` 是有序操作序列；中间 candidate state可变化，但整个 Patch只产生一次 atomic authoritative commit。

每个 op 的 precondition 和寻址均针对：

> **该 op 执行前的 current candidate state。**

---

## 13. Insert

```ts
interface RenderNodeInsertV1 {
  readonly op: "insert";
  readonly parentKey: string | null;
  readonly beforeKey: string | null;
  readonly node: RenderNodeV1;
}
```

### 13.1 Destination

```text
parentKey = null
    insert into Domain roots

parentKey = K
    insert into K.children
```

```text
beforeKey = K
    insert immediately before sibling K

beforeKey = null
    append at end
```

`beforeKey`必须存在于当前 candidate destination sibling list。

### 13.2 Insert subtree

`node` 是完整递归 Node，因此一次 Insert可以创建完整 subtree。

Inserted subtree所有 keys MUST：

```text
be unique inside subtree
not be live in current candidate state
not be present in current Patch tombstone set
not violate Domain-lifecycle one-shot key rule
```

Insert完成后，新 subtree立即进入后续 op可见的 candidate state。

因此同一 Patch MAY：

```text
insert fresh subtree
→ update/move a newly inserted key later
```

前提是所有后续 preconditions成立。

---

## 14. Remove

```ts
interface RenderNodeRemoveV1 {
  readonly op: "remove";
  readonly key: string;
}
```

Remove要求 target key当前存在。

语义：

> 删除目标 Node，以及该 op 执行时仍属于该 Node 的整个 current subtree。

例如：

```text
A
├── B
│   ├── C
│   └── D
└── E
```

`remove B` 删除 B/C/D。

如果要保留 C：

```text
move C out of B
→ remove B
```

即可。

### 14.1 Patch-local tombstone

每次 Remove执行后，被删除 target + 当前 descendants全部加入当前 Patch的 tombstone set。

同一 Patch后续 op MUST NOT：

```text
insert a tombstoned key
move/update a tombstoned key
use a tombstoned key as parentKey
use a tombstoned key as beforeKey
```

因此：

```text
remove K
→ insert K
```

在同一 Patch内始终非法。

这避免单个 atomic commit内部出现 destroy→recreate same identity。

---

## 15. Move

```ts
interface RenderNodeMoveV1 {
  readonly op: "move";
  readonly key: string;
  readonly parentKey: string | null;
  readonly beforeKey: string | null;
}
```

Move同时表达：

```text
reparent
reorder
root → child
child → root
```

### 15.1 Exact apply semantics

Move按以下固定顺序解释：

```text
1. require target key currently exists
2. detach target subtree from current parent/root list
3. resolve destination parent in the detached candidate
4. resolve beforeKey in the destination sibling list after detach
5. insert target before beforeKey, or append if null
```

因此：

```text
beforeKey == key
```

始终非法。

`parentKey`不能是 target自身或其 descendant；否则会形成 cycle，整个 Patch invalid。

### 15.2 Why beforeKey, not index

位置使用 sibling identity：

```text
beforeKey
```

而不是 numeric index，避免同一 Patch前序操作改变数组长度造成 index漂移。

---

## 16. Update

```ts
interface RenderNodeUpdateV1 {
  readonly op: "update";
  readonly key: string;
  readonly attrs?: StringMapDeltaV1;
  readonly data?: JsonObjectDeltaV1;
}
```

Update要求 target key当前存在，且未 tombstoned。

Update不能修改：

```text
key
tag
children
```

Tree structure统一由 insert/remove/move表达。

### 16.1 attrs delta

```ts
interface StringMapDeltaV1 {
  readonly set?: Readonly<Record<string, string>>;
  readonly remove?: readonly string[];
}
```

### 16.2 data delta

```ts
interface JsonObjectDeltaV1 {
  readonly set?: Readonly<Record<string, JsonValueV1>>;
  readonly remove?: readonly string[];
}
```

`set/remove`只作用于 top-level members。

规则：

```text
set MAY replace existing member or create new member
remove target MUST currently exist
remove list MUST contain no duplicates
same member MUST NOT appear in both set and remove
```

如果 remove 指向不存在 member，视为 producer/base-state divergence，而不是 no-op。

不引入：

```text
JSON Pointer
nested path expression
array splice DSL
recursive generic merge language
```

如果嵌套 object需要变化，替换其 top-level完整值；如果长期过大，应优化 Component/Node粒度，而不是扩大 Core patch language。

---

## 17. zIndex Update

`RenderPatchV1.zIndex` 若存在：

```text
replace current Domain zIndex
```

zIndex与 ops属于同一次 Domain atomic transition。

Renderer只能观察 old state或完整 new state。

---

## 18. Patch Execution / Atomicity

Renderer处理 Patch：

```text
current committed Domain Store
        │
        ▼
verify baseRevision / revision
        │
        ▼
create isolated candidate
        │
        ▼
apply ops[0]
apply ops[1]
...
apply ops[N-1]
        │
        ▼
validate final candidate
        │
        ├─ invalid → discard candidate
        │
        └─ valid   → atomic commit
                         revision = old + 1
```

中间 candidate不得暴露给 presentation。

协议不要求具体实现 deep clone；MAY使用：

```text
copy-on-write
persistent tree
normalized internal node table
structural sharing
transactional mutable candidate
```

---

## 19. Final Candidate Validation

Snapshot/Patch最终 candidate至少满足：

```text
all Node keys Domain-wide unique
0..N ordered roots valid
one Node has at most one parent
root Node has no parent
no cycles
all live Nodes reachable from roots
same live key keeps stable tag
one-shot Node key rule not violated
attrs/data plain-data constraints valid
tree depth/count/size within limits
tag syntax / declaration valid
```

注意：

```text
Component Factory currently loaded/instantiable
```

不属于 authoritative state continuity validation。

Component availability属于 Renderer Component Bootstrap/Presentation concern。缺少实现时 Renderer可以进入 presentation pending/error，但 MUST NOT 因加载时序直接判定 Render Patch chain divergence。

未知或未声明的 tag 是否属于 state validation error，仍由 Component Profile closure冻结；不得 fallback为任意 DOM tag。

任何 authoritative candidate validation失败：

```text
current Domain Store unchanged
current revision unchanged
whole message not partially applied
```

---

## 20. Authoritative Continuity Failure

以下统一视为 authoritative Render stream continuity failure：

```text
Patch baseRevision mismatch
Patch revision != baseRevision + 1
Patch op precondition failure
Patch final candidate invalid
post-baseline Snapshot revision != currentRevision + 1
post-baseline Snapshot invalid
hard malformed authoritative message
```

Renderer MUST NOT：

```text
skip failed authoritative commit
continue applying later Patch
invent missing state
silently downgrade invalid mutation to no-op
```

当前恢复统一为：

```text
stop trusting current Render authoritative stream
→ retire current Data Connection
→ if DataAuthority still current, establish fresh carrier
→ render.domains
→ fresh Snapshot for every current Domain
```

仍不定义：

```text
render.patchError
render.resync
render.requestSnapshot
ACK / NACK
```

该 Data Connection retirement不等于 Runtime terminal failure，也不触发 Frame unwind。

---

## 21. Fresh Connection Baseline

fresh current Data Connection：

```text
1. render.domains(current full Registry)
2. fresh render.snapshot for every current Domain
3. ordinary render.patch / render.event
```

Patch MUST NOT成为一个 Domain在 fresh connection上的第一条 authoritative state message。

即使 Renderer持有旧 connection缓存：

```text
cached revision != recovery authority
```

Renderer MAY出于视觉连续性暂时保留旧 presentation cache，但在 fresh Snapshot到达前：

```text
no Patch may apply to cached state
no new Event may target cached state
```

fresh Snapshot建立新的 current authoritative baseline。

---

## 22. Event

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

Event只能影响 component-local presentation state，不能修改 authoritative Domain Store。

Event不能作为以下事实的唯一表达：

```text
Node existence
persistent visibility
persistent selection
persistent position
current business data
anything whose loss causes permanent divergence
```

### 22.1 Event target gate

Event只有在：

```text
Domain current
fresh baseline already applied
targetKey exists in current committed tree
```

时才能交给 Component。

否则 drop，并 MAY记录 bounded diagnostics。

不得：

```text
queue until Node appears
retarget
replay after reconnect
```

stale/missing Event target是 soft transient failure，不导致 authoritative stream divergence。

---

## 23. Event / Authoritative Commit Barrier

Snapshot/Patch/Event共享 Subsystem → Renderer ordered carrier。

例如：

```text
Snapshot R100
Patch 100→101
Patch 101→102
Event E
Patch 102→103
```

Renderer必须在 logical component processing顺序上保证：

```text
commit R102
→ deliver E to component instance derived from R102
→ commit R103
```

这里的 barrier不要求等待浏览器 physical paint / vsync；要求的是 Store commit、component reconciliation和 Event dispatch不能在逻辑上越序。

例如：

```text
Patch inserts X
→ Event targets X
```

Event必须交给由该 Patch建立的 X component lifetime，而不能因为 DOM尚未 paint就被错误丢弃。

同理：

```text
Event targets X
→ Patch removes X
```

Event先作用于旧 X lifetime，再执行后续 authoritative removal。

Event不需要额外 `afterRevision` / `eventSequence`。

---

## 24. Backpressure / Coalescing

所有队列 MUST bounded。

优先级原则：

> **authoritative state convergence MUST NOT be indefinitely blocked by transient Events。**

### 24.1 Registry

尚未发送的 full Registry MAY latest-state coalesce，但必须保持 Domain lifecycle barrier与 one-shot ID规则。

### 24.2 Emitted authoritative message

已经提交给 carrier的 Snapshot/Patch：

```text
MUST NOT retract
MUST NOT reorder
MUST NOT silently skip
```

### 24.3 Unsent desired changes

尚未发送的多个内部 desired-state变化可以直接相对于 `lastEmittedRevision` 的已发布状态重新 diff，生成一个新的：

```text
Patch R→R+1
```

不需要保留每一次内部业务 mutation。

### 24.4 Snapshot fallback

当：

```text
Patch too large
Patch diff too complex
pending mutation count too high
queue pressure high
Snapshot cheaper than Patch
```

sender MAY选择发送：

```text
Snapshot revision = lastEmittedRevision + 1
```

作为下一次 full authoritative commit。

具体 Patch-vs-Snapshot cost threshold属于 implementation detail，不进入 Core。

### 24.5 Event FIFO

Event使用 bounded ordered FIFO：

```text
MUST NOT coalesce
MAY drop under overflow policy
surviving Events preserve relative order
never replay dropped Event
```

如果 Event backlog妨碍 authoritative progress，应优先丢弃 transient Event，而不是无限阻塞 Snapshot/Patch。

具体 Event queue容量和 drop-oldest/drop-newest策略由 Completion/Profile冻结。

---

## 25. Subsystem Patch Generation

业务逻辑 SHOULD NOT直接拼 wire Patch。

推荐：

```text
Business State
      │
      ▼
Render Projector
      │
      ▼
Desired recursive Domain Tree
      │
      ├───────────────┐
      │               │
last published     newest desired
logical tree       logical tree
      │               │
      └──── Diff ──────┘
              │
              ▼
       Patch or Snapshot
```

Diff Engine利用 stable key：

```text
old has / new missing
    → remove

old missing / new has
    → insert

same key, parent/order changed
    → move

same key, attrs/data changed
    → update

same key, tag changed
    → invalid logical continuity;
      producer must model as old-key remove + fresh-key insert
```

sender的 diff base必须对应 `lastEmittedRevision` 的逻辑 state，而不是未确认的 Renderer presentation state。

---

## 26. Example

已发布：

```text
Domain world
revision=100
zIndex=0

scene
├── player
│   data {x:10, y:20, hp:100}
└── npc-1
```

新 desired state：

```text
scene
├── npc-1
├── player
│   data {x:11, y:20, hp:90}
└── effect-7
```

Patch：

```json
{
  "type": "render.patch",
  "domainId": "world",
  "baseRevision": 100,
  "revision": 101,
  "ops": [
    {
      "op": "move",
      "key": "npc-1",
      "parentKey": "scene",
      "beforeKey": "player"
    },
    {
      "op": "update",
      "key": "player",
      "data": {
        "set": {
          "x": 11,
          "hp": 90
        }
      }
    },
    {
      "op": "insert",
      "parentKey": "scene",
      "beforeKey": null,
      "node": {
        "key": "effect-7",
        "tag": "effect",
        "attrs": {},
        "data": {},
        "children": []
      }
    }
  ]
}
```

Renderer：

```text
require current revision=100
require patch revision=101
→ apply ordered ops to isolated candidate
→ validate resulting tree
→ atomic commit
→ current revision=101
```

---

## 27. Why Not Generic JSON Patch

v1不采用 JSON Patch / JSON Pointer作为 Core Tree mutation model。

原因：

```text
Node已经拥有 stable key identity
array index不是稳定 identity
path escaping增加第二套寻址规则
Tree结构与Component data语义会混在同一通用 path language
reorder/reparent表达不自然
```

Render Core只提供：

```text
key-addressed structural operations
+ shallow attrs/data map delta
```

---

## 28. Failure Boundary

以下不等于 Runtime failure / Frame unwind：

```text
Patch queue pressure
Snapshot fallback
Event loss
Data reconnect
Renderer reload
Component presentation pending/error
```

authoritative continuity failure可以要求 retire current Data Connection以重新建立 Render baseline，但 Renderer不得因此自行宣布：

```text
Subsystem Runtime terminal failed
Frame outcome failed
Frame unwind
```

Runtime/Frame failure authority仍属于 Control Plane。

---

## 29. Current Closure Invariants

1. Render Update只有 Subsystem → Renderer 单向 Render data flow；
2. Subsystem是 Domain Registry / Domain State / revision authority；
3. Domain Registry full replacement决定 Domain lifecycle；
4. 同 generation内 removed `domainId`不复用；
5. authoritative wire model保持递归 `roots: Node[] / children: Node[]`；
6. Node key在 Domain Tree中全局唯一；
7. published Node key在同 Domain lifecycle内为 one-shot identity；
8. live same-key tag稳定；
9. Renderer/Subsystem MAY内部建立 key/parent indexes；
10. Snapshot携带完整递归 Tree + revision；
11. fresh connection必须先 Registry，再为每个 current Domain建立 fresh Snapshot baseline；
12. fresh baseline Snapshot revision可直接使用当前 authoritative revision；
13. baseline之后每次 authoritative commit严格 `R→R+1`；
14. sender以 `lastEmittedRevision` 作为 publication cursor，不使用 ACK；
15. Patch必须 `baseRevision == currentRevision` 且 `revision == baseRevision + 1`；
16. Patch ops按数组顺序执行，但整个 Patch只产生一次 atomic commit；
17. Core structural ops仅 `insert/remove/move/update`；
18. insert可插入完整 fresh subtree；
19. remove删除目标及其执行时 current subtree，并建立 Patch-local tombstone；
20. move使用 detach-then-resolve semantics；
21. update只修改 attrs/data，不修改 key/tag/children；
22. attrs/data Core delta只做 top-level set/remove，冲突/重复/missing-remove非法；
23. generic JSON Patch/JSON Pointer不进入 v1 Core；
24. Snapshot/Patch candidate必须满足完整 Tree invariants；
25. Component当前是否已加载不属于 authoritative continuity validation；
26. authoritative continuity failure不能被跳过后继续；
27. divergence通过 fresh Data Connection + Snapshot恢复；
28. Event只表达 transient presentation impulse；
29. Event不修改 authoritative Store；
30. Event按 logical component processing order与 Snapshot/Patch形成 barrier；
31. stale Event target可丢弃，不构成 authoritative divergence；
32. emitted authoritative message不可撤销/重排；
33. unsent desired changes可以重新 diff为一个 Patch或 materialize为 Snapshot；
34. authoritative state progress优先于 transient Event backlog；
35. 无 Patch history replay / ACK / NACK / Renderer resync RPC。

---

## 30. Remaining Closure Items

核心状态机已基本闭合，剩余工作不应扩展 wire surface，主要是 Completion/Profile 与 conformance：

1. `domainId` / Node `key` / `tag` UTF-8 byte limits与grammar；
2. message size、JSON depth、tree depth、Node count、Patch op count limits；
3. attrs count/key/value limits、data size/depth limits；
4. zIndex具体 numeric range；
5. Event FIFO容量与 overflow drop policy；
6. unknown/undeclared tag 与已声明但 implementation暂不可用的错误分类；
7. closed-schema JSON wire encoding细节；
8. Snapshot/Patch/Event/Registry conformance fixture matrix；
9. sender diff策略和 Snapshot-vs-Patch cost heuristic仅作为 implementation guidance验证，不进入 normative Core。

如果这些项目冻结且 conformance覆盖通过，当前 Incremental Design即可合并回正式 `render-update-v1.md`。

---

## 31. Minimum Conformance Scenarios

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
zero-root-domain
multi-root-order

snapshot-fallback-under-backpressure
publication-cursor-resets-on-fresh-carrier
same-generation-reconnect-requires-fresh-snapshot

patch-insert-node-then-event-targets-new-instance
event-before-remove-targets-old-instance
stale-event-target-dropped
event-overflow-does-not-block-authoritative-progress

authoritative-continuity-failure-retires-data-connection
data-retire-does-not-fail-runtime
data-retire-does-not-unwind-frame
component-not-yet-loaded-does-not-diverge-domain-store
```

---

## 32. Summary

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
        │       ordered key-addressed ops
        │       insert / remove / move / update
        │       isolated candidate + atomic commit
        │
        └── Event
                transient presentation impulse
                ordered against logical component commits

Subsystem sender
    lastEmittedRevision per carrier + Domain

Renderer
    recursive logical Store
    + internal key/parent indexes
    + copy-on-write/transaction candidate

Recovery
    no Patch replay
    no ACK/NACK
    no Renderer resync RPC
    continuity failure / reconnect
        → retire carrier
        → Registry
        → fresh Snapshots
```

最终设计取向：

> **不要为了 Patch改变 Render业务数据模型，也不要为了恢复建立第二套双向协议。让递归 Tree保持自然，让 one-shot key承担 identity，让 revision只承担 published commit causality，让 ordered carrier + publication cursor承担无 ACK 的正常传输，让 Snapshot承担所有恢复。**
