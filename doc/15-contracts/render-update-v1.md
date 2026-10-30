# Renderer ⇐ Subsystem Render Update Protocol v1

> 层级：正式契约  
> 状态：Active / Normative / local resource-budget policy correction pending implementation and qualification  
> 协议版本：1  
> 协议标识：`loomrealm.render-update / 1`  
> 稳定程度：Pre-release correction candidate  
> 方向：Subsystem → Renderer only  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> 架构：[渲染系统](../10-architecture/rendering-system.md)  
> 组合：[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)  
> Conformance：[Render Update v1 Conformance Profile](./render-update-conformance-v1.md)  
> 决策：[ADR 0022](../decisions/0022-render-update-v1-freeze-closure.md) · [ADR 0039](../decisions/0039-render-update-v1-resource-budget-correction.md)  
> 最近复核：2026-10-30

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Render Update v1 只复制 Subsystem-owned Render Domain authoritative presentation state。Registry 决定 generation-scoped wire Domain lifecycle；Snapshot 建立/替换完整 authoritative baseline；Patch 表达严格 `R→R+1` 的原子增量 commit；Event 表达可丢失、不可 replay 的 presentation impulse。Renderer 只复制/呈现，不拥有 business、Frame、Input 或 Render authority。**

---

## 1. Scope / Direction

Render Update v1 运行在 current Renderer ⇄ Subsystem Data Connection 上，方向固定：

```text
Subsystem → Renderer only
```

负责：

```text
Domain Registry / wire lifecycle
full authoritative Snapshot baseline / commit
incremental Patch commit
transient Event
logical Domain stacking order
fresh-carrier Render publication recovery
```

不负责：

```text
Renderer → Subsystem Render RPC
ACK / NACK / Result
Renderer-driven resync
historical Patch/Event replay
component registry / module loading
DOM / Canvas / WebGL command protocol
Frame / Input authority
Content transport
business state mutation
```

Carrier 已绑定：

```text
Session
current Renderer participant
subsystemKey
DataAuthority generation
```

因此 Render message 不重复：

```text
sessionId
rendererId
subsystemKey
generation
dataProfile
transport endpoint / credential
```

---

## 2. Application Unit / Message Surface

每个 Render application unit 固定为：

```text
one carrier application unit
= one UTF-8 JSON text string
= exactly one Render Update message object
```

WebSocket / MessagePort 的具体 mapping 由 Renderer Data Profile v1 统一；Render v1 不允许 binary payload、structured application object、Batch 或一条 carrier unit 内拼接多条 Render message。

v1 只有四种 message：

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

Frozen v1 不增加第五种 Render message kind。

---

## 3. Two Lifetimes: Business Domain vs Wire Domain

必须区分：

```text
Subsystem business Render Domain lifetime
!=
Render Update wire Domain lifetime
```

Render wire identity 完整作用域是：

```text
(Session, subsystemKey, DataAuthority generation, domainId)
```

因此：

### 3.1 Same-generation carrier replacement

同一 `S/G/profile` 下 carrier A → carrier B：

```text
fresh carrier
!= fresh wire Domain lifetime
```

当前 Domain/Node one-shot history 继续有效；只重置 carrier-local publication baseline/cursor。

### 3.2 Fresh DataAuthority generation

`G → G2` 是新的 Data application authority epoch：

```text
wire Render universe G
!=
wire Render universe G2
```

Subsystem-owned business Domain MAY 跨 generation 存活，但必须通过 G2 的 fresh Registry + Snapshot 重新导出。相同 `domainId`/Node `key` 字符串在 G2 中属于新的 wire identity，因为 generation 是 identity 的组成部分。

因此：

```text
Data generation replacement
    does not itself destroy Subsystem business Domain
    but does reset Render wire identity/publication universe
```

### 3.3 Runtime terminal

Runtime terminal cleanup最终释放该 Runtime 的 business Domains。未来新 Runtime/新 generation 的 Render wire identity 与旧 universe 分离。

---

## 4. Domain Registry / Lifecycle

```ts
interface RenderDomainsV1 {
  readonly type: "render.domains";
  readonly domains: readonly string[];
}
```

`domains` 是 current generation 的 full replacement set：

```text
0..N entries, subject only to local resource budget
no duplicates
array order has no presentation meaning
```

`domainId`：

```text
non-empty Unicode scalar string
opaque
case-sensitive exact identity
no normalization
no semantic grammar
```

在同一 generation 内，**已经被成功 emitted 为 present** 的 `domainId` 是 one-shot wire lifecycle identity：

```text
absent → present → absent
```

一旦 emitted Registry 移除，MUST NOT 在同 generation 再次出现；新 wire lifecycle 使用 fresh `domainId`。

尚未进入 carrier ordered-send boundary 的 desired Registry MAY coalesce。一个从未成功 emitted 为 present 的临时 desired `domainId` 不消耗 wire one-shot identity。

不存在：

```text
render.create
render.destroy
render.close
```

Registry membership 本身就是 wire Domain lifecycle authority。

### 4.1 Atomic Registry replacement

Renderer 对合法 `render.domains`：

```text
validate entire Registry
→ atomically replace current membership
```

对每个 transition：

```text
absent → present
    create current wire Domain entry
    publicationState = unbaselined

present → present
    same wire Domain lifetime continues

present → absent
    retire current authoritative replica for that Domain
    discard its per-carrier baseline state
    keep one-shot tombstone for observed lifetime
```

Registry removal可以触发本地 presentation teardown；它不是 Frame close，也不是 Runtime failure。

### 4.2 Publication barrier

fresh Data Connection 上第一条 **Render Update** message MUST 是 `render.domains`。同一 Data carrier 上的 `input.*` sibling message 是否先出现由 Renderer Data Profile v1 决定；本条只约束 Render namespace。

Sender 只有在更早成功 emitted Registry 已包含 `domainId` 后，才可发送该 Domain 的 Snapshot/Patch/Event。

一旦 emitted Registry 移除 Domain：

```text
all pending unsent Snapshot/Patch/Event for that Domain
    MUST be discarded
```

之后同 generation 不得再发送该 wire Domain 的消息。

---

## 5. Per-carrier Baseline State

每个 current carrier + current Domain 维护：

```text
unbaselined
baselined(revision)
```

fresh carrier：

```text
first Render message = render.domains(current Registry)
```

Registry 中每个 current Domain 初始为 `unbaselined`。

对一个 `unbaselined` Domain：

```text
first authoritative state message MUST be render.snapshot
render.patch is protocol-fatal
well-formed render.event is transient-inapplicable and is dropped
```

Snapshot 成功后进入 `baselined(R)`。

Registry MAY 在所有初始 Domain 尚未 baseline 完成前再次变化；不存在 global `render.ready` 或“所有 Domain baseline complete”消息。新加入 Domain 独立进入 `unbaselined`；被移除的 Domain 不再需要 Snapshot。

---

## 6. Authoritative Domain Data Model

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

Domain：

```text
0..N ordered roots
```

Node：

```text
0..N ordered children
```

roots/children order 是 authoritative logical sibling order。Domain Host 不是 Render Node。

### 6.1 Node key

`key` 是 Domain-wide wire Node identity：

```text
non-empty Unicode scalar string
opaque / case-sensitive / no normalization
```

每个 committed Domain State 中：

```text
all Node keys across all roots + descendants MUST be unique
```

已经 published 的 Node key 在同一 wire Domain lifecycle 内 one-shot：

```text
once removed from published Domain state
→ same key MUST NOT be introduced again
```

该规则跨 same-generation carrier reconnect 保持；fresh generation 建立新的 wire Domain universe。

### 6.2 Snapshot 与 one-shot history

full Snapshot 可以任意重排/reparent live nodes、删除旧 nodes、加入 fresh nodes，但：

```text
key live before + live after
    → same Node lifetime; tag MUST remain identical

key absent before + present after
    → key MUST never have been published earlier in this wire Domain lifetime

key present before + absent after
    → key becomes permanently consumed for this wire Domain lifetime
```

fresh same-generation carrier baseline MAY包含此前仍 live 的 keys；这不是 key reuse。

### 6.3 `tag`

`tag`：

```text
non-empty Unicode scalar string
opaque
same live key keeps same tag
```

Render Core不定义：

```text
known / unknown tag registry
tag declaration/discovery
Component Factory / module loading
per-tag attrs/data schema
DOM/Canvas/WebGL mapping
```

同一 live key 若要改变 `tag`，必须删除旧 key 并使用 fresh key 建立新 Node lifetime。

### 6.4 attrs / data

```text
attrs = opaque string → string map
data  = plain JSON object
```

Core不解释业务语义。

`attrs` 保持 string → string map；不定义 key/value 长度或 member count 的协议级上限。

Generic Render `data` 保持 plain JSON object；不定义 key 长度、member count、array element count、payload byte size 或相对嵌套深度的协议级上限。空字符串 key 合法。开发者业务 Schema 由应用拥有。

---

## 7. Domain Stacking / zIndex

`zIndex`：

```text
signed safe integer (Number.isSafeInteger)
```

它定义跨 current Domains 的 logical stacking input：

```text
higher zIndex = logically above lower zIndex
```

相同 `zIndex` 时，Frozen v1 使用确定性 tie-break：

```text
compare domainId by encoded UTF-8 byte sequence lexicographically
smaller domainId = logically below larger domainId
```

Registry array order MUST NOT参与 stacking。

这只冻结 logical ordering，不要求使用 CSS `z-index`、DOM order 或任何特定 presentation technology。

---

## 8. Domain Revision

每个 wire Domain lifecycle拥有独立 revision number space。

Revision：

```text
positive safe integer
1..Number.MAX_SAFE_INTEGER
Subsystem-owned
no wrap / no reuse within one carrier publication stream
```

Revision 不是：

```text
business mutation count
transport sequence
Event sequence
ACK sequence
replay cursor
resume token
cross-Domain revision
```

### 8.1 Carrier-local continuity

revision continuity 是 **current carrier-local** 的：

```text
fresh carrier baseline Snapshot R
    R MAY be any positive safe integer

after baseline on same carrier
    every authoritative commit MUST be R→R+1
```

fresh carrier MUST NOT把旧 carrier revision 当作 Patch base。Receiver MUST NOT仅因为新 baseline `R` 小于、等于或大于旧 carrier 曾观察的 revision 而拒绝。

因此 numeric revision equality **没有跨 carrier state-equality语义**；fresh Snapshot 本身才是新 carrier authority。

### 8.2 Exhaustion

如果 current carrier/domain revision 已为 `Number.MAX_SAFE_INTEGER`，sender MUST NOT wrap/reuse。需要进一步 authoritative change 时，只能结束当前 wire Domain lifecycle并以 fresh identity（或 fresh Data generation）重新建立，不得发送不可表示的下一 revision。

不同 Domain revision 相互独立；不存在 global Render revision 或 cross-Domain transaction。

---

## 9. Sender Publication Cursor / Emitted Boundary

Subsystem 对每个 current carrier + domainId 维护：

```text
lastEmittedRevision | unset
```

`emitted` 的协议含义：

> application unit 已被 current carrier 的 ordered send boundary 成功接受；从这一点开始 sender 必须把它视为已发布，不能因未知 remote delivery 状态而 retract/reorder/retry。

```text
fresh carrier
    lastEmittedRevision = unset

emit baseline Snapshot R
    lastEmittedRevision = R

emit Patch R→R+1
    lastEmittedRevision = R+1

emit post-baseline Snapshot R+1
    lastEmittedRevision = R+1
```

carrier loss 后旧 cursor 整体废弃；不 replay old Patch/Event。

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

Snapshot 是：

```text
full current authoritative state
atomic replacement
fresh-carrier baseline
normal full-commit fallback
```

Renderer：

```text
validate whole Snapshot
→ build isolated candidate
→ validate one-shot/tag/limits
→ atomic replace
→ baselined(snapshot.revision)
```

不得暴露 partial tree 或新旧 `zIndex/tree` 混合状态。

### 10.1 Fresh baseline

对 `unbaselined` Domain：

```text
revision = any positive safe integer
```

旧 presentation cache 不是 Patch base authority。

### 10.2 Post-baseline full commit

对已 baselined Domain：

```text
snapshot.revision == currentRevision + 1
```

stale/duplicate/gapped Snapshot 都是 authoritative continuity failure。

Snapshot fallback 可以把多个尚未 emitted desired changes 收敛为一个下一 revision full commit；不要求逐个重放内部变化。

---

## 11. Patch

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

Patch 只对 baselined Domain 合法：

```text
patch.baseRevision == currentRevision
patch.revision == patch.baseRevision + 1
```

`ops`：0..N entries，但仅受发送端/接收端显式 local resource budget 约束：

```text
ops.length > 0 OR zIndex member is present
```

因此 `{ops:[]}` 且没有 `zIndex` 是非法 no-op Patch。

协议不要求检测 semantic no-op；例如 `zIndex` 设为当前值或 `set` 写回相同值仍可构成合法 commit。

### 11.1 Operation algebra

```ts
type RenderPatchOpV1 =
  | RenderNodeInsertV1
  | RenderNodeRemoveV1
  | RenderNodeMoveV1
  | RenderNodeUpdateV1;
```

只有：

```text
insert
remove
move
update
```

不定义 JSON Patch / JSON Pointer / DOM mutation command family。

每个 op 的 precondition 与寻址都针对“该 op 执行前的 isolated candidate”。

### 11.2 Insert

```ts
interface RenderNodeInsertV1 {
  readonly op: "insert";
  readonly parentKey: string | null;
  readonly beforeKey: string | null;
  readonly node: RenderNodeV1;
}
```

```text
parentKey=null → roots
beforeKey=null → append
```

`beforeKey` 非空时 MUST 是 destination parent 下的 direct sibling。

inserted recursive subtree 的全部 keys：

```text
internally unique
not live in candidate
never previously published in this wire Domain lifecycle
not Patch-local tombstoned
```

同一 Patch 后续 op MAY target 刚插入的 key。

### 11.3 Remove

```ts
interface RenderNodeRemoveV1 {
  readonly op: "remove";
  readonly key: string;
}
```

target MUST exist。Remove 删除 target 以及该 op 执行时仍属于 target 的整个 current subtree。

被删除 target + descendants：

```text
become permanently consumed for Domain-lifetime one-shot rule
+
enter Patch-local tombstone set
```

当前 Patch 后续不得：

```text
reinsert tombstoned key
move/update tombstoned key
use tombstoned key as parentKey/beforeKey
```

### 11.4 Move

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
4. require parent exists when non-null
5. resolve beforeKey in destination direct sibling list after detach
6. insert before beforeKey, or append if null
```

禁止：

```text
beforeKey == key
move under self
move under descendant
missing destination parent
beforeKey not a destination sibling
```

### 11.5 Update

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

合法 Update MUST包含 `attrs` 和/或 `data` 至少一个。

每个提供的 Delta MUST包含：

```text
non-empty set
OR
non-empty remove
OR both
```

因此 `{}`、`{set:{}}`、`{remove:[]}` 都不是有效 Delta。

规则：

```text
set MAY replace/create top-level member
remove target MUST exist in pre-op candidate map
remove list has no duplicates
same member MUST NOT appear in set and remove
```

Delta 作为单个 op 原子作用；不定义 set-before-remove 或 remove-before-set 的可观察中间状态。

嵌套 object 变化通过替换 top-level value 表达，不增加 nested patch language。

### 11.6 zIndex

Patch `zIndex` 若存在，与 `ops[]` 属于同一个原子 Domain commit。

---

## 12. Patch Atomicity / Structural Limits

Renderer：

```text
current committed Domain Store
→ verify baseRevision/revision
→ isolated candidate
→ apply ordered ops with operation preconditions and incremental local resource accounting
→ validate final candidate framework invariants
→ atomic commit once
```

任何失败：

```text
revision unchanged
zIndex unchanged
tree unchanged
no partial authoritative/presentation exposure
```

### 12.1 Structural invariants

Render Update v1 不定义 node count、tree depth、attrs member count、data element/member count 或 data nesting depth 的固定协议级数字上限。

Patch operations 按序作用于 isolated candidate。每个 op 的目标、identity、parent/sibling 关系及后续 op 所依赖的前置条件必须按当前 candidate 解释；协议不要求每个中间 candidate 满足已删除的固定数字上限，也不要求每个 op 后重新扫描整棵树。实现 MUST 在实际分配/增长过程中执行 local resource budget，防止通过“先增长再删除”造成无界峰值资源消耗。

### 12.2 Render data measurement

data / Event data 不设协议级 compact byte limit。发送端实际编码必须使用受 local outbound budget 约束的 bounded serializer；不得为了预检而先完整 stringify 后再计量。

---

## 13. Event

```ts
interface RenderEventV1 {
  readonly type: "render.event";
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: string;
  readonly data: JsonObjectV1;
}
```

`name`：non-empty Unicode scalar string，opaque / case-sensitive / no normalization；无协议级 byte length 上限。

Event：

```text
ordered
transient
non-authoritative
MUST NOT coalesce
MUST NOT replay
MAY be dropped/lost
MUST NOT change Domain revision/store
```

### 13.1 Receiver applicability

一个 schema/limits 合法的 Event 只有在：

```text
Domain current
Domain baselined on current carrier
targetKey exists in current committed tree
```

时才 logical-deliver 给 Renderer presentation layer。

否则：

```text
drop
no queue-until-target
no retarget
no replay
no Data retirement solely for this applicability miss
```

因此 stale Domain Event、pre-baseline Event、stale/missing target Event 都是 transient-inapplicable，不是 authoritative continuity failure。

注意：malformed/oversize/closed-schema-invalid Event 仍是 protocol-fatal，见 §16。

### 13.2 Event / authoritative barrier

Snapshot/Patch/Event 共享 ordered carrier。

Sender MUST保证 retained Event 的 target lifetime在 Event 的 wire position 已由更早 emitted authoritative state建立。

因此：

```text
Patch inserts X
→ Event targets X
```

必须按该顺序 emitted。

```text
Event targets X
→ later Patch removes X
```

Event 必须先 logical-deliver，再处理 removal。

**未 emitted 但决定保留的 Event 是 authoritative coalescing barrier。** Sender不得把 Event 之前建立其 target/lifetime 的 authoritative commit 重写到 Event 之后，也不得在 Event 前把 target lifetime coalesce away。

Sender MAY在 Event 尚未 emitted 时按 backpressure policy 丢弃该 Event；一旦 Event 被丢弃，对应 barrier 消失，尚未 emitted desired authoritative state可继续正常 coalesce。

不要求等待 physical paint/vsync，也不增加 `afterRevision`。

---

## 14. Backpressure / Coalescing

所有队列 MUST bounded。

### Registry

尚未 emitted 的 full Registry MAY latest-state coalesce，但：

```text
cannot resurrect emitted one-shot domainId
cannot cross retained Event/lifecycle barrier illegally
```

### Authoritative state

已 emitted Snapshot/Patch：

```text
MUST NOT retract
MUST NOT reorder
MUST NOT silently skip within current carrier continuity
```

尚未 emitted desired-state 变化 MAY相对 `lastEmittedRevision` 重新 diff 为一个下一 revision Patch，或 materialize：

```text
Snapshot revision = lastEmittedRevision + 1
```

具体 Patch-vs-Snapshot heuristic 不属于协议。

### Event

Event 使用 bounded ordered queue；压力下 MAY丢弃。surviving Events 保持相对顺序，永不 replay。

如果 Event backlog妨碍 authoritative convergence，实现 MUST优先 authoritative state progress。

---

## 15. Carrier Loss / Stale Presentation Cache

current Data carrier retired/lost：

```text
current Render publication stream ends
per-carrier baseline/revision cursor ends
no further Event is current
```

Renderer MAY保留最后合法 Render Store 用于视觉连续性，但此时它只是：

```text
stale presentation cache
```

不是 current authoritative replica，也不能作为 fresh carrier Patch base、Input authority 或 DataAuthority proof。

如果 Main DataAuthority仍允许同一 generation/profile：

```text
fresh carrier
→ render.domains(current Registry)
→ fresh Snapshot each current Domain
→ Patch/Event
```

same-generation reconnect 不创建新 wire Domain lifetime；fresh generation 创建新的 Render wire universe，见 §3。

---

## 16. Failure Classification / Recovery

Frozen v1 明确三类结果。

### 16.1 Protocol-fatal representation/schema failure

任何 Render message 的以下错误：

```text
malformed JSON / invalid Wire representation
top-level unknown type
wrong exact schema / extra or missing field
invalid Unicode scalar sequence
invalid primitive type / integer range
```

→ MUST retire current Data Connection；不得交给 Render business/presentation handler。

### 16.2 Local resource exhaustion

实现的 inbound parse、candidate construction 或 retained-state budget 耗尽时，Renderer MUST 不提交任何部分状态，并停止处理当前 carrier；由于 authoritative continuity 无法继续证明，当前 Data Connection MUST retire。该结果属于 local-resource-exhaustion，不是 peer protocol violation，不得报告为 malformed/invalid message。发送端 outbound budget 耗尽时，不得发送部分消息；可 coalesce 尚未 emitted 的 desired state，或向本地调用边界报告 resource failure。

### 16.3 Authoritative continuity failure

对 Registry/Snapshot/Patch 的 authoritative semantic violation：

```text
Domain lifecycle violation
Patch before baseline
Patch baseRevision mismatch
revision != base+1
Patch op precondition failure
one-shot identity violation
invalid intermediate/final candidate
post-baseline Snapshot stale/gap/invalid
```

→ MUST stop trusting current stream and retire current Data Connection。

Renderer MUST NOT：

```text
skip failed commit
continue later Patch
invent missing state
silently downgrade invalid authoritative mutation to no-op
request ad-hoc snapshot via new RPC
```

### 16.4 Transient Event applicability miss

合法 Event 但 Domain/baseline/target当前不适用：

```text
drop only
```

不退休 Data，不修改 authoritative state。

### 16.5 Presentation-local failure

unknown local component、DOM/Canvas/WebGL resource failure、presentation handler exception 等不改变 authoritative Render validity。具体产品如何降级/记录/终止 Renderer participant 属于 Renderer implementation policy；不得伪造成 Subsystem Runtime/Frame failure。

### 16.5 Recovery

Data retirement 后：

```text
if DataAuthority still current
→ establish fresh carrier
→ Registry
→ fresh Snapshot for each current Domain
→ ordinary Patch/Event
```

Render failure本身：

```text
!= Runtime terminal failure
!= Frame unwind
```

v1 不定义：

```text
render.patchError
render.requestSnapshot
render.resync
ACK / NACK
Patch history replay
resume cursor
```

---

## 17. Plain JSON / Exact Closed Schema

Render v1 使用 frozen Wire JSON representation semantics；Render 不增加第二 tokenizer/parser。

解析：

```text
raw carrier string
→ actual UTF-8 byte gate
→ Wire parseJsonText / ECMAScript JSON.parse observable semantics
→ Wire JsonValue representation validation
→ Render exact-schema/domain validation
```

因此 source-level duplicate JSON object member **不由 Render 额外检测**；parse 后 resulting object仍必须满足 exact closed schema。

禁止 representation：

```text
undefined
NaN / Infinity
BigInt
Function / Symbol
DOM/Host object
MessagePort / Blob
class instance
invalid Unicode scalar sequence
```

所有 protocol objects exact key set：

```text
render.domains
    {type, domains}

render.snapshot
    {type, domainId, revision, zIndex, roots}

render.patch
    {type, domainId, baseRevision, revision, ops, zIndex?}

render.event
    {type, domainId, targetKey, name, data}

RenderNode
    {key, tag, attrs, data, children}

insert
    {op, parentKey, beforeKey, node}

remove
    {op, key}

move
    {op, key, parentKey, beforeKey}

update
    {op, key, attrs?, data?}

StringMapDelta / JsonObjectDelta
    {set?, remove?}
```

Unknown field MUST reject；optional 只表示 member absence，不存在 `undefined`。

---

## 18. Validation Order

Inbound 固定：

```text
carrier string
↓
actual UTF-8 byte gate
↓
Wire parseJsonText
↓
Wire representation + local parser resource budget
↓
top-level Render type discrimination
↓
exact closed schema
↓
framework-owned field/type/identity/revision checks
↓
Registry/current-Domain/baseline gate
↓
revision continuity
↓
message-specific semantic/precondition validation
↓
isolated candidate mutation when authoritative
↓
intermediate/final structural + one-shot/tag validation
↓
atomic commit OR Event applicability/delivery
```

Representation/schema-invalid input不得进入 authority/presentation logic；失败 Patch不得 partial apply。

不冻结 human-readable error wording；冻结 accept/reject/drop/retire 与 authoritative state outcome。

---

## 19. Bounded Resource Policy

Render Update v1 不定义统一的协议级数值上限。以下容量由 Host / Product composition / Runtime implementation 通过显式、有限、可审计的 local resource budget 管理：

- inbound carrier message bytes 与 parser nesting/work；
- JSON object/array members、string/key bytes 与 retained payload bytes；
- Domain Registry entries、RenderNode count、tree depth；
- Patch operation count、candidate allocation 与 retained tombstone/index state；
- outbound serialized bytes、pending messages、queues 与 in-flight work。

要求：

1. 所有可能随输入增长的资源必须有 bounded policy；不得把“无协议级固定上限”解释为无界分配或无界队列。
2. 在 parse、serialize、candidate mutation、queue admission 的实际工作过程中执行 bounded guard；能融合到单次遍历的检查不得再触发重复全树预检。
3. local budgets 可以按 Host / 平台 / 产品配置，不构成 wire accept/reject 的统一数字，也不得被伪装成业务 Schema。
4. local budget exhaustion 与 malformed JSON / exact-schema violation 分开分类；inbound exhaustion 不得部分提交，并 retire 当前 carrier 以避免继续处理失去 continuity 的消息；outbound exhaustion 不得发送部分 application unit。
5. v1 不提供 budget negotiation。产品组合必须选择互操作 peer 可承受的预算，并记录具体部署约束；独立实现之间不保证对超出接收端 local budget 的消息成功交付。
6. revision/baseRevision 必须为 positive safe integer；zIndex 必须为 signed safe integer，以保持 JavaScript number 精确性与跨实现确定排序。
7. 所有 protocol identity strings 必须是非空 Unicode scalar strings；不定义 UTF-8 byte 长度上限。Generic data keys 可以为空字符串。

本节定义 resource-safety obligation，不冻结任何统一 numeric cap。

---

## 20. Frame / Input / Data / Content Independence

Render Update message MUST NOT携带：

```text
frameId
activationId
InputTarget
Frame lifecycle
Data endpoint/ticket/Port
Content credential
physical path/URL capability
```

```text
Frame active != Domain visible
Frame suspend != Domain hidden
Frame close/unwind != business Domain destroy
same-generation Data reconnect != wire Domain recreation
Data carrier retire != business Domain destroy
Domain/Node existence != ordinary input authority
```

Render `data` MAY包含 product-defined logical resource reference，但 Render Core不解释其 schema，也不得携带 physical capability；资源解析通过 Content boundary。

---

## 21. Cross-Domain / Cross-platform Semantics

不同 Domain：

```text
independent revision
no cross-Domain atomic transaction
no shared Render revision
```

同 carrier 的 physical message order可观察，但不创造跨 Domain transaction semantics。

Hostra/PWA 必须等价实现：

```text
wire identity/lifecycle
Registry/baseline semantics
revision/atomic commit
Patch algebra
Event barrier/drop semantics
logical stacking order
failure/recovery
local resource budgets
```

允许不同：

```text
DOM/Canvas/WebGL realization
component implementation
resource cache
paint cadence
internal tree/index representation
```

---

## 22. Explicit Non-goals

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
Event FIFO concrete capacity/drop preference
Patch-vs-Snapshot cost threshold
presentation scheduler policy
```

---

## 23. Frozen v1 Invariants

1. Render Update 只有 Subsystem → Renderer 单向 Render application data；
2. wire Domain identity = Session + subsystemKey + DataAuthority generation + domainId；
3. same-generation reconnect保留 Domain/Node wire lifetime，fresh generation重置 wire universe；
4. Registry full replacement且原子决定 wire Domain membership；
5. fresh carrier first Render message = Registry；每个 Domain 独立 unbaselined→Snapshot→baselined；
6. Domain/Node published identity在其 wire lifetime内 one-shot；
7. Snapshot full replacement仍受 one-shot key + stable-tag history约束；
8. roots/children 是 authoritative ordered siblings；
9. zIndex高者在上，同值按 domainId UTF-8 lexical tie-break；
10. revision continuity只在 current carrier baseline后严格 `R→R+1`；fresh baseline不与旧 carrier revision比较；
11. sender用 carrier-local `lastEmittedRevision`，emitted = ordered-send boundary accepted；
12. Patch仅 insert/remove/move/update，whole candidate atomic；
13. empty Patch只有携 zIndex 才合法；Update/Delta不得结构性空操作；
14. Patch ops 按序应用并满足 operation preconditions；local resource budget 在实际增长过程中受控，最终 candidate 满足 framework structural invariants；
15. Event transient/no replay，不修改 revision/store；retained Event 是 authoritative coalescing barrier；
16. well-formed stale/inapplicable Event drop-only；schema/limit invalid message与 authoritative continuity error retire Data；
17. Data loss后旧 Store最多是 stale presentation cache，不是 current authority/Patch base；
18. recovery固定 fresh carrier + Registry + current Domain Snapshots；
19. no ACK/NACK/replay/resync RPC；
20. tag/presentation/component implementation不属于 Render protocol authority；
21. Frame/Input/Data transport/Content capability 与 Render authority保持分离；
22. exact closed schema、authority/revision semantics、structural integrity、failure/recovery 与 atomic commit 属协议不变量；numeric resource budgets 由 local policy 管理，并可在 pre-release correction 中调整。

---

## 24. Compatibility Boundary

Render Update v1 的 numeric resource-budget policy 属于 Host / Product / Runtime 本地资源策略，不是 wire ABI。调整或移除这些本地容量阈值，在正式发布前后都不要求创建新 protocol version，也不要求改变 `/1` identity。旧接收端若仍有较小的本地容量，可能无法处理超过该容量的具体负载；这是 receiver capacity mismatch，不是消息格式或协议语义不兼容。v1 不提供 budget negotiation，产品应为实际 workload 配置相互可承受的 sender / receiver budgets。只有 message schema、direction、authority、identity、ordering、revision、atomicity、Event 或 recovery semantics 真正改变时，才需要 protocol versioning。Conformance fixture revision 是测试语料版本，不等同于 wire protocol version。

```text
message kind / schema
application-unit encoding
wire Domain identity/lifetime scope
Registry/baseline rules
revision continuity scope
Snapshot semantics
Patch algebra/preconditions/atomicity
Node one-shot/tag rules
Event ordering/barrier/drop semantics
zIndex logical ordering
protocol-owned schema/authority/revision/atomicity semantics
resource-budget policy
validation/failure/recovery semantics
```

新增 Component Profile、tag semantic grammar、Render ACK、resync RPC 或第五种 Render message 同样不属于 v1 兼容扩展。