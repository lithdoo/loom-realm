# Realm State：Session 级共享业务状态系统

> 层级：系统架构  
> 状态：Proposal / **Core Architecture Semantics Closed**  
> 稳定程度：**Not Implemented / Formal Contract Candidate / Not Qualified**  
> 主要定义：Session 级共享业务状态 authority、Record/Collection、Game Entry initial baseline、OCC transaction、Runtime-scoped client、replaceable physical binding、subscription、commit evidence、persistence non-goal、Main fatal boundary  
> 依赖：[系统架构总览](./system-overview.md)、[模块子系统模型](./subsystem-model.md)、[栈式运行系统](./stack-runtime-system.md)、[存储与内容系统](./storage-system.md)、[通信系统](./communication-system.md)、[Game Package v1](../15-contracts/game-package-v1.md)  
> 正式化：[Realm State v1](../15-contracts/realm-state-v1.md)  
> 最近复核：2026-10-05

本文定义 LoomRealm 的候选 **Realm State**：位于 `Main` 控制 authority 与各 `Subsystem Runtime` 局部业务状态之间的 **Session 级、跨 Subsystem、可变业务状态唯一 authority**。

Realm State 的目标不是提供万能 Store，而是在不污染 Main / Frame / Renderer / Content / Platform 边界的前提下，为真正需要跨 Subsystem 共享的 mutable business facts 提供一个小而确定的 authority。

---

## 1. 核心结论

1. Realm State 是 Main 的 sibling authority，不是 Main 内部业务字段；
2. Main 唯一拥有 Session / Runtime / Frame / Activation / InputTarget / Renderer currentness / DataAuthority / failure unwind；
3. RealmStateAuthority 唯一拥有 Session shared mutable business Records、per-Record version、global revision、OCC 与 committed subscription；
4. Realm State 初始业务 baseline 属于 platform-neutral Game Entry，并由 Launcher 投影为 `PreparedRealmStateDefinition`；
5. Realm State 只有一个特殊 bootstrap value source：prepared Game baseline；
6. **Save / Load 不属于 Realm State lifecycle 或 bootstrap semantics**，而是 Subsystem / game/product 的普通业务操作；
7. `RealmStateClient` 是 Runtime-scoped logical capability，不依赖 Frame / Activation / InputTarget；
8. physical State binding 是可替换 carrier，不定义 `RealmStateClient` identity；
9. binding loss 不自动 fail Runtime / Frame / Session，也不 reset RealmStateAuthority；
10. old subscription 不透明恢复；rebind 后业务 fresh subscribe + fresh baseline；
11. RealmStateAuthority fatal 只报告 Session-fatal fact，**Main 唯一提交 Session terminal 与 Runtime/Frame unwind**；
12. `namespace` 只负责 Record organization/discovery，不拥有 value/version/transaction/ACL/lifecycle；
13. `(namespace,key)` Record 是 read/write/replacement/version/conflict 单位；
14. Transaction 是 multi-Record atomicity unit，可跨 Collection；
15. v1 使用 whole-record replacement，不提供 field patch / merge / automatic retry / transaction journal；
16. `scan()` 是一致的 full snapshot 能力，但属于 potentially expensive exceptional operation；v1 不为它引入 pagination/cursor/MVCC handle 或额外 aggregate State limit；
17. `OUTCOME_UNKNOWN` 不自动 retry；需要 exactly-once business intent 时由业务使用普通 marker Record 做 reconciliation；
18. Game Package v1 尚未正式发布/freeze，因此当前加入 optional `state` 允许 breaking schema evolution，不升级 `formatVersion`。

---

## 2. Authority Model

```text
Main
    Control Authority
    ├── Session / Runtime lifecycle
    ├── Frame / Stack / Activation
    ├── InputTarget
    ├── Renderer currentness / DataAuthority
    └── failure unwind

RealmStateAuthority
    Session Business State Authority
    ├── immutable prepared Game initial baseline
    ├── mutable current Records
    ├── per-Record versions
    ├── global commit revision
    ├── consistent reads / scans
    ├── optimistic atomic transactions
    └── committed-state subscriptions

Subsystem Runtime
    domain execution + local state
    author-facing RealmStateClient

Renderer
    readonly presentation replica

Content
    readonly installation definitions/resources

Platform / Session composition
    physical construction / binding / disposal / wiring only
```

核心区分：

```text
Main
    "谁正在运行，当前控制流是什么"

Realm State
    "跨 Subsystem 的共享业务事实初始是什么、现在是什么"

Subsystem local state
    "这个领域执行器当前正在做什么"

Content
    "这个东西按安装定义是什么"

Renderer
    "当前应该展示什么的只读副本"
```

一个 application authority 只能有一个 owner。Physical process/Worker/MessagePort/Window ownership 不产生第二份 application authority。

---

## 3. State Placement Rule

一个事实进入 Realm State 的充分理由是：

> **它需要成为同一 Session 内跨 Subsystem 共享、可变、authoritative 的业务真相，并且需要 Record version / OCC / subscription 语义协调。**

典型适合：

```text
player global attributes
party / inventory
quest / progression
world/session business flags
economy
cross-Subsystem business metadata
```

默认不应进入 Realm State：

```text
Frame / Stack / Activation / InputTarget
Runtime lifecycle / failure state
Renderer currentness / Data generation/profile
Input retained state / Interest
RenderDomain / animation / presentation state
Subsystem-local task progress
local caches / derived projections
transport connectivity / endpoint / credential
Platform configuration / executable binding
immutable Content definitions/resources
Save slot / persistence format / Load workflow
```

`Subsystem local state != automatically Realm State`。如果一个事实只被一个 Subsystem 的局部执行需要，或可以从其他 authority 派生，就应留在原 owner。

---

## 4. Bootstrap Boundary

Game Entry document：

```text
GameEntryV1
├─ logical Subsystem topology
├─ initial Frame target/input
└─ optional state.records
```

Launcher PREPARE：

```text
Game Entry validation
→ Platform executable/capability preflight
→ Launcher projection
→ PreparedLogicalGame
    ├─ LogicalGameBootstrap
    │     → Main only
    └─ PreparedRealmStateDefinition
          → RealmStateAuthority only
```

Session bootstrap：

```text
PREPARE complete
→ construct fresh RealmStateAuthority(prepared.state)
→ install immutable prepared Game baseline
→ derive initial materialized membership
→ revision/version = 0
→ Realm State READY
→ create Runtime-scoped RealmStateClient capabilities
→ first business Runtime side effect may begin
```

必须保持：

```text
GameEntryV1.state
    != PreparedRealmStateDefinition
    != live RealmStateAuthority
    != LogicalGameBootstrap
    != Content resource
```

RealmStateAuthority MUST NOT parse `game.json`、`formatVersion` 或 Platform manifest。

### 4.1 Game Package v1 Pre-release Rule

Game Package v1 尚未正式发布/freeze。历史 draft v1 shape 不形成兼容性承诺，因此当前 optional `state` 继续使用 `formatVersion: 1`。

一旦 Game Package v1 正式发布/freeze：

```text
closed-schema structural addition/change
→ new formatVersion
```

除非已发布 contract 事先定义明确 extension mechanism。

---

## 5. Initial / Current Model

每个 logical Record 概念上拥有：

```text
initialValue
    immutable prepared Game baseline

current value
    mutable Session business fact

version
    per-Record successful-write generation
```

Game baseline 未声明 key：

```text
initialValue = null
```

Session 初始 current：

```text
current value = initialValue
```

Runtime mutation 永远不修改 `initialValue`。

显式 initial `null` 与未声明 key 在 `readInitial()` 业务值上都表现为 `null`；区别只影响 bootstrap materialization。v1 不增加 `hasInitial()` / `listInitial()` 等第二套 initial metadata API。

---

## 6. Record / Collection / Materialization

Record identity：

```text
(namespace, key)
```

Record 是：

```text
read unit
replacement unit
version unit
conflict unit
```

Namespace / Collection 只负责：

```text
organization
discovery/filter
human-facing grouping
key naming scope
```

明确不是：

```text
value unit
version unit
conflict unit
transaction unit
ACL unit
lifecycle authority
```

Collection 不需要预创建；不存在 NamespaceRegistry / `createNamespace()` / `deleteNamespace()`。

Record materialized 当且仅当：

```text
1. prepared Game baseline 显式声明该 Record
2. Runtime 首次成功 commit 该 Record
```

普通 read 不 materialize；`put(null)` 不 dematerialize。

如果业务 correctness 依赖“Collection 成员集合本身未变化”，业务必须把这个 invariant 显式建模成普通 versioned Record，而不是要求 Realm State 增加 Collection version/predicate lock。

---

## 7. Revision / Version / OCC

```text
revision
    whole Realm State successful-commit sequence
    snapshot identity / subscription ordering

version
    per-Record successful-write generation
    OCC conflict detection
```

每个新 Session：

```text
revision = 0
Record versions = 0
```

每个 successful transaction：

```text
revision += 1
for every write target:
    record.version += 1
```

Transaction：

```text
conditions: Record key + expected version
writes: whole-record put
```

规则：

```text
every write target must be conditioned
read-only dependencies may also be conditioned
any stale condition → CONFLICT + zero write
all writes commit atomically
transaction may cross Collections
unrelated Record changes do not conflict by default
```

v1 不提供 field patch、field version、automatic merge、long-lived transaction lock 或 generic transaction coordinator。

---

## 8. Runtime-scoped Client vs Physical Binding

这是 Realm State 生命周期的关键边界：

```text
RealmStateClient
    Runtime-scoped logical capability

physical Realm State binding
    process/Worker/MessagePort/other carrier realization
```

二者 MUST NOT 等同。

```text
SubsystemScope.state
        │
        ▼
 stable RealmStateClient
        │
        ├─ physical binding A
        │      ↓ lost
        └─ physical binding B
```

Binding A 丢失：

```text
!= RealmStateClient identity lost
!= Runtime failure
!= Frame unwind
!= Session terminal
!= RealmStateAuthority reset
```

Fresh binding 建立后，同一个 live Runtime-scoped client 可以用于后续新操作。

但不得做下面这些事情：

```text
automatically replay dispatched commit
reattach old subscription identity
pretend old subscription delivery continuity still exists
```

因此 subscription 恢复是：

```text
old subscription terminal(binding-terminal)
→ fresh physical binding
→ business fresh subscribe
→ fresh baseline
→ new ordered changes
```

Runtime terminal 才真正 terminal 它的 RealmStateClient。

---

## 9. Read / Discovery / Scan

`read(keys)`：

```text
explicit known key set
one logical revision
current value + version
```

`readInitial(keys)`：

```text
prepared Game immutable baseline only
no current revision/version
```

`list(namespace?)`：

```text
materialized discovery index
key + version only
```

`scan(namespace?)`：

```text
materialized membership
+ current value
+ version
+ one revision
```

`list() + read()` 不等价于 atomic collection snapshot；需要 membership + values 同 revision 时使用 `scan()`。

`scan()` 是非常规、potentially expensive snapshot operation，不应作为 hot path query API。v1 保持它的简单 logical API，不为它引入：

```text
pagination
cursor
long-lived MVCC snapshot handle
additional aggregate live-State payload limit
```

Physical binding 可以内部 chunk/stream，但 caller 观察到的仍是一个 revision 的完整 logical snapshot。

---

## 10. Commit Evidence / `OUTCOME_UNKNOWN`

成功 commit 返回：

```text
revision
written Record identities + new versions
```

不回显 value，因为 v1 是 whole-record replacement，不做 server transform/merge。

Mutation evidence 至少区分：

```text
known committed
known no-commit
OUTCOME_UNKNOWN
```

`OUTCOME_UNKNOWN` 意味着：

```text
mutation 已 dispatch
但 definitive result 丢失
所以它可能已经 commit，也可能没有
```

Realm State core 不能自动 retry，否则可能重复业务效果。

### 10.1 Business Reconciliation Pattern

需要 exactly-once business intent 时，由业务把 operation marker 建模成普通 Record，并和业务 writes 放进同一 transaction。

例如：

```text
operation/purchase-123
```

和扣钱、加道具一起 atomic commit。

若返回 `OUTCOME_UNKNOWN`：

```text
恢复 binding
→ read(operation/purchase-123)
→ 业务根据 authoritative Record 判断结果
```

这个模式属于 business modeling。Realm State core 不增加 transaction ID、status query、dedup journal 或自动 marker。

---

## 11. Subscription

Subscription 只观察显式 Record keys，不提供 namespace wildcard。

建立 subscription 必须在线性化点上原子完成：

```text
capture baseline @ revision N
+
register observer for commits > N
```

对 caller：

```text
first event = baseline @ N
then ordered relevant changes > N
```

同一次 transaction 修改多个 subscribed Records，对一个 subscription 至多产生一个聚合 change event。

Listener 在 Authority serialized lane 外执行；listener throw/rejection：

```text
is Runtime-local
cannot retroactively fail commit
cannot make Authority fatal
cannot make Session terminal
```

无法保证 ordered delivery 时 terminal overflow，不能 silent drop。

Binding loss terminal old subscription；fresh binding 后 fresh subscribe + fresh baseline，不提供 replay cursor/resume journal。

---

## 12. Save / Load / Persistence Boundary

Realm State **没有 Load Game lifecycle semantics**。

Save 是普通业务读：

```text
Save/business subsystem
→ read(keys) or scan()
→ own serialization/storage policy
```

Load/restore 是普通业务写：

```text
Save/Load business subsystem
→ read persistence data through its own capability
→ validate / migrate / interpret business data
→ RealmStateClient.read()/commit()
→ ordinary State mutation
```

Realm State 不知道：

```text
这是存档
这是读档
这是 autosave
这是 cloud restore
```

因此 Realm State 不拥有：

```text
Load seed
sparse bootstrap override
save-slot
storage path
save document schema/version
migration policy
autosave/cloud policy
```

恢复存档值不会重建 RealmStateAuthority，也不会把 revision/version 重置成 0；它只是普通 commit，因此正常推进 revision/version。`initialValue` 始终保持 prepared Game baseline。

如果整个存档替换需要业务原子性，游戏必须在普通 transaction limits 内设计自己的 invariant；Realm State 不增加 generic whole-save transaction coordinator。

---

## 13. Fatal / Failure Ownership

普通 State 结果：

```text
INVALID_REQUEST
LIMIT_EXCEEDED
CONFLICT
OUTCOME_UNKNOWN
binding-local operation failure
subscription overflow/terminal
```

都不自动触发 Main Runtime/Frame/Session transition。

只有 RealmStateAuthority 自己无法继续维持 authority invariant 时才产生 Session-fatal fact：

```text
RealmStateAuthority
→ report fatal fact through narrow sink
→ Main
→ Main commits Session terminal + Runtime/Frame unwind
```

关键点：

```text
RealmStateAuthority may detect/report fatal
Main owns terminal/unwind decision and state transition
Platform/Session composition only wires the signal
```

不再使用含糊的“Main / Session lifecycle owner”双 owner 表述。

---

## 14. Platform Boundary

Hostra 与 PWA 可以采用完全不同的 physical realization：

```text
Desktop
    process / direct in-process binding / IPC

PWA
    Worker / MessagePort / browser-private binding
```

但 observable logical semantics 必须一致：

```text
same Record identity
same snapshot semantics
same OCC
same commit evidence
same Runtime-scoped client lifetime
same binding-replacement rules
same subscription recovery semantics
same fatal ownership
```

Platform MAY：

```text
construct Authority
construct/wire binding
replace failed physical binding
wire fatal signal to Main
dispose physical resources
```

Platform MUST NOT：

```text
interpret namespace/value business semantics
own revision/version/OCC/retry policy
inspect Frame/Activation to authorize commit
turn ordinary binding loss into Runtime/Session transition
implement Save/Load policy inside Realm State
become generic SessionCoordinator / StateManager / service locator
```

---

## 15. Validation / Hot Path

每个 physical trust boundary 必须有明确 validation owner：

```text
untrusted author/wire input
→ validation owner
→ detached trusted representation
→ Authority execution
```

不要求 SDK / adapter / Authority 对同一可信对象重复完整 deep validation。

Authority serialized mutation lane 应尽量只包含：

```text
Record lookup
version comparison
atomic reference replacement
revision/version allocation
materialization/index update
commit publication handoff
```

serialization、avoidable deep clone、canonical sorting、listener execution 应放在 serialized authority step 外。

---

## 16. Explicit Non-goals

v1 不设计：

```text
ACL / RBAC / policy engine
NamespaceRegistry
Collection version / predicate lock
namespace wildcard subscription
schema registry
field-level JSON patch
SQL/query language / secondary indexes
long-lived remote transaction locks
automatic mutation retry / merge
transaction ID / dedup journal / status query
subscription replay cursor/history journal
CRDT / distributed consensus
cross-session shared authority
Renderer direct State access
generic EventBus
transparent RealmStateAuthority restart
Load seed / persistence bootstrap override
Save-slot/storage/migration policy
universal application store / service locator
```

---

## 17. Architecture Closure

Core architecture is considered closed around these invariants：

```text
one RealmStateAuthority per Session
Main and Realm State remain sibling authorities
Main owns all control lifecycle/failure unwind
Realm State owns only shared mutable business Records
Game baseline is the only privileged State bootstrap source
Save/Load are ordinary business reads/writes
Runtime-scoped client != physical binding
physical binding may be replaced without replacing Runtime/client identity
old subscription is never resumed; fresh subscribe gets fresh baseline
OCC uses per-Record version and multi-Record atomic transaction
OUTCOME_UNKNOWN is never automatically retried
scan remains an exceptional full snapshot API
Renderer/Content/Platform do not acquire State business authority
```

Remaining work is formal representation closure、implementation and qualification—not reopening these authority boundaries。
