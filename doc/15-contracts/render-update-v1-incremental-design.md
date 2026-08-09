# Render Update v1 Incremental Design Draft

> 层级：正式契约演进草案  
> 状态：Working Draft / Evolution Note  
> 目标协议：`loomrealm.render-update / 1`  
> 方向：Subsystem → Renderer only  
> 基线：[Render Update Protocol v1](./render-update-v1.md)  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> 架构：[渲染系统](../10-architecture/rendering-system.md)  
> 最近复核：2026-08-09

本文不是 Frozen Contract。它记录 Render Update v1 从 Snapshot-only 向 **Snapshot baseline + key-addressed incremental Patch + transient Event** 演进的当前工作模型。

后续设计讨论直接在本文继续推进；完成 closure review 后，再决定如何合并回正式 `render-update-v1.md`。

核心原则：

> **递归 Render Tree 保持为权威数据模型；stable Node key 用于 Patch 寻址；per-Domain revision 用于验证 Patch 因果连续性；Snapshot 始终是恢复锚点；Patch 只优化正常运行时的数据传输，不承担历史恢复。**

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

---

## 4. Message Surface

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
| `render.patch` | 一个 Domain 的 atomic incremental authoritative transition |
| `render.event` | 一个 current Node 的 transient presentation impulse |

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

该规则使 Registry可以安全 latest-state coalesce，同时避免隐藏 destroy→recreate 后错误复用旧 component-local state。

---

## 6. Authoritative Domain Data Model

**Patch 不改变当前 Render Tree 数据结构。**

权威 Domain State 继续使用自然递归树：

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

因此当前 Node可以通过：

```text
(domainId, key)
```

在当前 Render authority scope内唯一寻址。

### 6.2 Tag continuity

同一 Domain lifecycle内，持续存在的同一 `key`：

```text
tag MUST remain stable
```

改变 component type应：

```text
remove old logical Node
+ insert fresh logical Node
```

并 SHOULD 使用 fresh key。

---

## 7. Wire Tree 与 Internal Store 分离

协议 wire保持递归 Tree，不为了 Patch强制 normalized representation。

Renderer和Subsystem实现 MAY在内部建立索引：

```ts
interface DomainStoreIndex {
  readonly nodeByKey: Map<string, NodeRef>;
  readonly parentByKey: Map<string, string | null>;
}
```

其中：

```text
parentByKey[key] = null
```

表示该 Node 当前是 Domain root。

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
    MAY normalized/indexed/copy-on-write
```

协议不要求实现为了 atomic commit deep-clone整棵树。

---

## 8. Domain Revision

引入 Patch后，ordered carrier只能证明消息顺序，不能单独证明 Renderer当前状态正是 Patch所假定的 base state。

因此每个 Domain lifecycle拥有独立 revision space。

Revision：

```text
Subsystem-owned
Domain-lifecycle scoped
positive safe integer
strictly monotonic for committed authoritative states
```

不同 Domain revision互相独立：

```text
world revision=500
hud   revision=37
menu  revision=8
```

不存在 global Render revision，也不存在 cross-Domain revision transaction。

Revision的职责是：

```text
state continuity / causality validation
```

不是：

```text
history replay cursor
ACK sequence
resume token
```

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
recovery baseline
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

### 9.1 Snapshot revision

Snapshot是完整 baseline，因此不要求：

```text
snapshot.revision = currentRevision + 1
```

允许：

```text
current revision 100
→ Snapshot revision 137
```

Renderer无需知道 101..136 的历史变化。

fresh Data Connection上的 first Snapshot直接建立当前 connection的 baseline。

---

## 10. Patch

Patch表示：

> **从一个明确的 Domain authoritative state，原子转换到另一个 authoritative state。**

候选 wire：

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

Patch只有在：

```text
patch.baseRevision == Renderer current Domain revision
```

时才可应用。

并要求：

```text
patch.revision > patch.baseRevision
```

不强制 `revision = baseRevision + 1`。

原因是一个 Patch MAY描述 sender内部多个尚未发布变化合并后的完整增量 transition：

```text
R100 → R105
```

只要该 Patch完整描述 R100 到 R105 的差异，因果关系仍明确。

---

## 11. Patch Operation Algebra

当前方向只定义四种 Tree operations：

```ts
type RenderPatchOpV1 =
  | RenderNodeInsertV1
  | RenderNodeRemoveV1
  | RenderNodeMoveV1
  | RenderNodeUpdateV1;
```

即：

```text
insert
remove
move
update
```

这四种操作足以表达当前：

```text
key
tag
attrs
data
children
roots
```

组成的递归 Tree变化。

不定义：

```text
JSON Patch
JSON Pointer
setChildAtIndex
appendChild
moveBefore
moveAfter
replaceChildren command family
```

---

## 12. Insert

```ts
interface RenderNodeInsertV1 {
  readonly op: "insert";

  readonly parentKey: string | null;
  readonly beforeKey: string | null;

  readonly node: RenderNodeV1;
}
```

### 12.1 parentKey

```text
parentKey = null
    insert into Domain roots

parentKey = K
    insert into K.children
```

### 12.2 beforeKey

```text
beforeKey = K
    insert immediately before sibling K

beforeKey = null
    append at end
```

`beforeKey` 必须属于目标 parent当前 children，或在 root insertion时属于当前 roots。

### 12.3 Insert subtree

`node` 是完整递归 Node，因此一次 Insert可以创建完整 subtree：

```text
insert A
└── B
    └── C
```

不需要逐节点：

```text
create A
create B
create C
attach B
attach C
```

Inserted subtree内所有 keys必须：

```text
unique within subtree
not already live in current candidate state
```

---

## 13. Remove

```ts
interface RenderNodeRemoveV1 {
  readonly op: "remove";
  readonly key: string;
}
```

Remove语义：

> 删除目标 Node 以及操作执行时仍属于该 Node 的整个 subtree。

例如：

```text
A
├── B
│   ├── C
│   └── D
└── E
```

```text
remove B
```

结果：

```text
A
└── E
```

B/C/D一起被删除。

如果要保留 C：

```text
move C → A
remove B
```

即可。

这种 cascade语义与当前递归 Tree模型一致，比要求显式列出所有 descendants 更自然。

---

## 14. Move

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

例如：

```text
A
├── X
└── Y

B
└── Z
```

执行：

```text
move Y
parentKey = B
beforeKey = Z
```

得到：

```text
A
└── X

B
├── Y
└── Z
```

Node Y自身的 key/tag/attrs/data/children不变。

### 14.1 为什么不用 numeric index

Patch位置通过 stable sibling identity表达：

```text
beforeKey
```

而不是：

```text
index
```

避免同一 Patch前序操作改变数组长度后造成 index漂移。

---

## 15. Update

```ts
interface RenderNodeUpdateV1 {
  readonly op: "update";
  readonly key: string;

  readonly attrs?: StringMapDeltaV1;
  readonly data?: JsonObjectDeltaV1;
}
```

Update不能修改：

```text
key
tag
children
```

原因：

```text
key      = identity
tag      = component identity type
children = Tree structure
```

Tree structure统一由 insert/remove/move表达。

### 15.1 attrs delta

```ts
interface StringMapDeltaV1 {
  readonly set?: Readonly<Record<string, string>>;
  readonly remove?: readonly string[];
}
```

### 15.2 data delta

```ts
interface JsonObjectDeltaV1 {
  readonly set?: Readonly<Record<string, JsonValueV1>>;
  readonly remove?: readonly string[];
}
```

`set/remove`只作用于 `attrs` / `data` 的 top-level keys。

不引入：

```text
JSON Pointer
nested path expression
array splice DSL
recursive generic merge language
```

如果一个嵌套 object需要更新：

```text
set that top-level object to its new complete value
```

如果这种 replacement长期过大，应优先重新审视 Component/Node粒度，而不是把 Core演进成通用 JSON diff engine。

---

## 16. zIndex Update

`RenderPatchV1.zIndex` 若存在：

```text
replace current Domain zIndex
```

zIndex与 ops属于同一次 Domain atomic transition。

例如同一 Patch同时：

```text
move component tree
change zIndex
```

Renderer只能看到 old state或完整 new state，不能看到中间组合。

---

## 17. Patch Operation Ordering

与此前“集合式 Patch”方向不同，当前方案明确：

> **`ops[]` 是有序操作序列，但整个 Patch仍然只产生一次 atomic commit。**

Renderer处理：

```text
current committed Domain Store
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
```

中间 candidate状态不得暴露给 presentation。

Operation ordering允许自然表达依赖关系，例如：

```text
move C out of B
remove B
```

如果反向执行：

```text
remove B
move C
```

第二个 op自然失败，因为 C已不存在。

---

## 18. Patch Preconditions

Renderer应用 Patch前至少验证：

```text
Domain currently present
fresh Snapshot baseline already exists on current connection
baseRevision == current revision
revision > baseRevision
ops within limits
```

每个 op再验证自身 precondition。

### Insert

```text
parentKey exists unless null
beforeKey belongs to destination sibling list unless null
all inserted subtree keys fresh
insert does not violate key uniqueness
```

### Remove

```text
target key exists
```

### Move

```text
target key exists
destination parent exists unless null
beforeKey belongs to destination sibling list unless null
target is not moved under itself/descendant
```

### Update

```text
target key exists
attrs/data delta valid
```

---

## 19. Final Tree Validation

全部 ops执行完成后，candidate MUST满足：

```text
all Node keys Domain-wide unique
all roots structurally valid
one Node has at most one parent
root Node has no parent
no cycles
all live Nodes reachable from roots
same continuous key keeps stable tag
attrs/data plain-data constraints valid
tree depth/count/size within limits
all referenced tags valid under active Component profile
```

任何失败：

```text
whole Patch invalid
current Domain Store unchanged
current revision unchanged
```

不得 partial apply。

---

## 20. Atomic Commit / Implementation Strategy

协议要求 atomic commit，但不要求实现 deep-clone整棵 Tree。

Renderer MAY使用：

```text
copy-on-write
persistent tree
normalized internal node table
structural sharing
transactional mutable candidate
```

典型内部过程：

```text
current Store
    ↓
clone/index only affected branches/nodes
    ↓
apply ops to candidate
    ↓
validate candidate/index
    ↓
atomic store pointer swap
```

Node key index使 lookup接近 O(1)。

---

## 21. Subsystem Patch Generation

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
previous tree      new tree
      │               │
      └──── Diff ──────┘
              │
              ▼
       Render Patch/Snapshot
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
    → logical replacement; use remove + fresh-key insert
```

这样业务状态、Render projection和wire mutation保持分离。

---

## 22. Patch Continuity Failure

Patch是 authoritative state transition，不能像 Event一样任意丢弃。

例如 Renderer current revision=100，却收到：

```text
baseRevision=101
revision=102
```

或收到 base=100 的 Patch但 candidate validation失败。

此时：

```text
Domain Patch chain diverged
```

Renderer MUST NOT：

```text
skip Patch
continue applying later Patch
invent missing state
```

因为后续 Patch的 base将不再可信。

当前推荐恢复：

```text
reject Patch
→ fail closed current Data Connection
→ retire carrier
→ if DataAuthority still current, establish fresh carrier
→ render.domains
→ fresh Snapshot for every current Domain
```

仍不定义：

```text
render.patchError
render.resync
render.requestSnapshot
NACK
```

---

## 23. Fresh Connection Baseline

fresh current Data Connection：

```text
render.domains(current full Registry)
→ fresh render.snapshot for every current Domain
→ ordinary render.patch / render.event
```

Patch MUST NOT成为一个 Domain在 fresh connection上的第一个 authoritative state message。

即使 Renderer持有旧 connection缓存：

```text
cached revision != recovery authority
```

fresh connection必须重新用 Snapshot建立 baseline。

这适用于：

```text
same-generation reconnect
Renderer reload
new Renderer participant
```

---

## 24. Event

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

### 24.1 Event target gate

Event只有在：

```text
Domain current
fresh baseline already applied
targetKey exists in current committed tree
```

时才能应用。

否则 drop。

不得：

```text
queue until Node appears
retarget
replay after reconnect
```

---

## 25. Event / Patch Ordering Barrier

Snapshot/Patch/Event共享同一 Subsystem → Renderer ordered carrier。

例如：

```text
Snapshot R100
Patch 100→101
Patch 101→102
Event E
Patch 102→103
```

Renderer必须保证 E在 R102 authoritative state之后被解释，并在 R103之前。

Event因此是 sender-side authoritative-state coalescing barrier。

合法优化：

```text
Snapshot R102
Event E
Snapshot R103
```

非法：

```text
Event E
Snapshot R103
```

如果 E语义依赖 R102 state。

当前方向不要求 Event额外携带：

```text
afterRevision
eventSequence
```

ordered carrier + commit barrier足够表达 Event相对 authoritative state的位置。

---

## 26. Backpressure / Snapshot Fallback

所有队列必须 bounded。

### 26.1 Patch once emitted

已经发送到 carrier的 Patch：

```text
MUST NOT retract
MUST NOT reorder
MUST NOT silently skip
```

### 26.2 Unsent pending Patch

尚未发送的多个内部变化可以：

```text
coalesce into one Patch
```

只要新 Patch完整描述：

```text
last emitted/current remote baseRevision
→ newest local revision
```

例如：

```text
remote/base R100
local changes produce R101/R102/R103
```

如果都尚未 emitted，可发送：

```text
Patch base=100 revision=103
```

### 26.3 Snapshot materialization

当：

```text
Patch too large
Patch diff too complex
pending mutation count too high
queue pressure high
Snapshot cheaper than Patch
```

sender MAY直接 materialize最新完整状态：

```text
Snapshot revision=Rlatest
```

并替换尚未发送的 pending Patch chain。

因此推荐策略：

```text
small normal diff
    → Patch

large/complex/backpressured diff
    → Snapshot

reconnect/recovery
    → Snapshot
```

协议不冻结具体 cost threshold。

---

## 27. Example

旧状态：

```text
Domain world
revision=100
zIndex=0

scene
├── player
│   data {x:10, y:20, hp:100}
└── npc-1
```

新状态：

```text
Domain world
revision=101
zIndex=0

scene
├── npc-1
├── player
│   data {x:11, y:20, hp:90}
└── effect-7
```

候选 Patch：

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
→ apply ordered ops to candidate
→ validate resulting tree
→ atomic commit
→ current revision=101
```

---

## 28. Why Not Generic JSON Patch

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

这样 wire语义与现有 Render数据结构直接对应。

---

## 29. Failure Boundary

以下不等于 Runtime failure / Frame unwind：

```text
Patch queue pressure
Snapshot fallback
Event loss
Data reconnect
Renderer reload
```

Patch continuity/validation failure可以要求 retire current Data Connection以重新建立 Render baseline，但 Renderer不得因此自行宣布：

```text
Subsystem Runtime terminal failed
Frame outcome failed
Frame unwind
```

Runtime/Frame failure authority仍属于 Control Plane。

---

## 30. Current Candidate Invariants

1. Render Update只有 Subsystem → Renderer 单向 Render data flow；
2. Subsystem是 Domain Registry / Domain State / revision authority；
3. Domain Registry full replacement决定 Domain lifecycle；
4. 同 generation内 removed `domainId`不复用；
5. authoritative wire model保持递归 `roots: Node[] / children: Node[]`；
6. Node key在 Domain Tree中全局唯一；
7. 同一 continuous key的 tag稳定；
8. Renderer/Subsystem MAY内部建立 key/parent indexes；
9. Snapshot携带完整递归 Tree + revision；
10. Snapshot是 fresh connection/recovery baseline；
11. Patch携带 `baseRevision + revision`；
12. Patch只在 `baseRevision == currentRevision` 时可应用；
13. Patch ops按数组顺序执行，但整个 Patch只产生一次 atomic commit；
14. Core structural ops仅 `insert/remove/move/update`；
15. insert可一次插入完整 subtree；
16. remove删除目标及其当前 subtree；
17. move同时表达 reparent/reorder/root transition；
18. update只修改 attrs/data，不修改 key/tag/children；
19. attrs/data Core delta只做 top-level set/remove；
20. generic JSON Patch/JSON Pointer不进入 v1 Core；
21. Patch final candidate必须满足完整 Tree invariants；
22. invalid/mismatched Patch不能被跳过后继续；
23. Patch divergence通过 fresh Data Connection + Snapshot恢复；
24. Event只表达 transient presentation impulse；
25. Event不修改 authoritative Store；
26. Event是同 Domain authoritative update coalescing barrier；
27. emitted Patch不可撤销/重排；
28. unsent Patch chain可以合并或 materialize为 Snapshot；
29. Snapshot fallback是正常 backpressure工具，不是错误；
30. 无 Patch history replay / ACK / Renderer resync RPC。

---

## 31. Open Questions

后续继续在本文收敛：

1. `revision` 是否必须从 1开始，还是只要求 positive safe integer + monotonic；
2. stale Snapshot (`snapshot.revision <= currentRevision`) 应 drop 还是 protocol error；
3. Patch允许 `baseRevision → revision` 跳号是否最终保留；
4. `beforeKey` 对“目标 Node自身正在同 Patch内移动”的精确规则；
5. 同一 Patch内重复操作同 key是否合法，还是 SHOULD避免；
6. insert subtree内 Node是否允许随后同 Patch继续 move/update；
7. remove subtree后同 Patch使用相同 key重新 insert 是否允许；当前倾向禁止，要求 fresh key；
8. shallow `data` delta是否足够 Phase 1；
9. Patch op count / tree depth / message size numeric limits；
10. Snapshot-vs-Patch sender cost heuristic是否仅为 implementation detail；
11. unknown component tag属于 whole Patch invalid还是 carrier hard failure；
12. Event FIFO overflow的具体策略与 numeric limits。

---

## 32. Summary

```text
Subsystem authoritative Domain State
    recursive keyed tree

        │
        ├── Registry
        │       lifecycle
        │
        ├── Snapshot(revision)
        │       full baseline / recovery
        │
        ├── Patch(baseRevision → revision)
        │       ordered key-addressed ops
        │       insert / remove / move / update
        │       atomic candidate commit
        │
        └── Event
                transient presentation impulse

Renderer
    recursive logical Store
    + internal key/parent indexes
    + copy-on-write/transaction candidate

Recovery
    no Patch replay
    no ACK
    no Renderer resync RPC
    divergence/reconnect
        → Registry
        → fresh Snapshots
```

最终设计取向：

> **不要为了 Patch改变 Render业务数据模型。让递归 Tree保持自然，让 stable key承担增量寻址，让 revision承担 Patch因果验证，让 Snapshot承担恢复；Patch只是从一个确定 authoritative state到另一个确定 authoritative state的原子优化路径。**
