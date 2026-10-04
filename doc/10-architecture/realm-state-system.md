# Realm State：Session 级共享业务状态系统

> 层级：系统架构  
> 状态：Proposal / Architecture Semantics Closed  
> 稳定程度：**Not Implemented / Not Contract Frozen / Not Qualified**  
> 主要定义：Session 级共享业务状态 authority、Game Entry 初始状态、immutable initial value、materialized record index、consistent snapshot、optimistic transaction、subscription linearization、commit evidence、生命周期与平台边界  
> 依赖：[系统架构总览](./system-overview.md)、[模块子系统模型](./subsystem-model.md)、[栈式运行系统](./stack-runtime-system.md)、[存储与内容系统](./storage-system.md)、[通信系统](./communication-system.md)、[Game Package v1](../15-contracts/game-package-v1.md)  
> 最近复核：2026-10-05

本文定义 LoomRealm 的候选 **Realm State**：位于 `Main` 控制 authority 与各 `Subsystem Runtime` 局部业务状态之间的 **Session 级、跨 Subsystem、可变业务状态唯一 authority**。

本文的核心架构语义已经闭合；后续工作是把这些语义落实到 Game Package、Realm State protocol、Launcher、Subsystem API、Hostra/PWA realization、测试与 qualification。本文不宣称对应生产实现已经存在。

---

## 1. 核心结论

1. Realm State 是独立于 Main 的 Session Shared Business State Authority；
2. 新游戏 Realm State 初始业务值属于 platform-neutral Game Entry；
3. Game Entry v1 直接增加 optional `state` 字段，继续使用 `formatVersion: 1`；
4. 缺少 `state` 的既有 Game Entry 继续合法，并等价于空 Realm State initial definition；
5. Realm State 必须在任何 business Runtime side effect 前初始化完成；
6. `namespace` 只承担逻辑分组与命名，不是权限、更新、版本、冲突或事务单位；
7. `(namespace,key)` Record 是读写、版本与冲突单位；
8. Transaction 是跨 Record 的原子提交单位，并 MAY 跨 namespace；
9. v1 使用 whole-record replacement，不提供 field-level patch；
10. 每个 logical key 具有 immutable `initialValue` 与 mutable current `value`；
11. Game Entry 未声明 key 时 `initialValue = null`；新游戏 current `value = initialValue`；
12. 每个新 Session 的 global revision 与所有 Record version 从 `0` 开始；Load Game 不继承旧 Session concurrency metadata；
13. 多 key `read()` 返回同一 logical snapshot；
14. mutation 使用 optimistic concurrency control（OCC）：read-set version conditions + atomic write-set；
15. 每个 write target MUST 出现在 conditions 中；read-only business dependencies MAY 同样进入 conditions；
16. stale condition → `CONFLICT` + zero write；
17. v1 不提供跨 Runtime 长事务锁，也不自动 retry business transaction；
18. Realm State v1 不提供 Subsystem / namespace / key 业务 ACL；
19. `list()` 返回 materialized Records 的 `(namespace,key,version)` 一致索引快照；
20. Save 可以只保存部分 current values；Load Game 使用 sparse current-value override；
21. RealmStateAuthority fatal → Session terminal；
22. Key grammar、capacity limits、transaction shape、deep-equal write、`list()` ordering 均为确定 contract semantics；
23. Subscription 采用 authority 原子 baseline + observer registration；断线/overflow 后 fresh subscribe，不提供 replay cursor；
24. `commit()` 不支持 remote cancellation；一旦 dispatch，结果丢失时使用 `OUTCOME_UNKNOWN`，不得自动 retry；
25. v1 不引入 transaction ID、dedup journal、status query 或 generic transaction coordinator。

---

## 2. Authority Model

```text
Main
    Control Authority
    ├── Session / Runtime lifecycle
    ├── Frame / Stack / Activation
    ├── InputTarget
    ├── DataAuthority
    └── failure unwind

Realm State
    Session Business State Authority
    ├── immutable Game-defined initial values
    ├── mutable current values
    ├── materialized record index
    ├── per-record versions
    ├── global commit revision
    ├── consistent snapshots
    ├── optimistic atomic transactions
    └── committed-state subscriptions

Subsystem
    Domain Execution / Local State Authority

Content
    Readonly Definition Authority

Renderer
    Readonly Presentation Replica / Input Producer
```

核心区分：

```text
Main
    "谁正在运行 / active / 当前控制流是什么"

Realm State
    "共享业务事实初始是什么、现在是什么"

Subsystem State
    "这个领域执行器现在正在做什么"

Content
    "这个东西按安装定义是什么"
```

Realm State MUST NOT 被实现为 Main 内部业务字段集合。

---

## 3. Trust Model / Non-goals

Realm State v1 假设 Game Package 中的 Subsystem implementation 属于同一受信游戏产品，而不是互相敌对的第三方 tenant。

Realm State core 强制的是 correctness：

```text
consistent snapshot
record version / conflict
atomic commit
initialValue immutability
subscription ordering
Runtime / Session lifetime
commit evidence
```

业务 ownership 由 game-lib API、共享 key constants/types、测试、代码审查与业务 invariant 保证。

v1 不设计：

```text
ACL / RBAC / policy engine
namespace registry
schema registry
field-level JSON patch
SQL/query language / secondary indexes
long-lived remote transaction locks
automatic retry / merge
transaction ID / dedup journal / mutation status query
replay cursor / subscription history journal
CRDT / distributed consensus
cross-session shared authority
Renderer direct State access
generic EventBus
large external initial-state source
transparent authority restart/recovery
```

---

## 4. Namespace / Record / Transaction

```text
Namespace
    naming / logical grouping

Record (namespace + key)
    read / write / version / conflict unit

Transaction
    atomicity unit
    MAY span Records / namespaces
```

`namespace` 不需要预声明，也不存在独立 NamespaceRegistry。

```ts
interface RealmStateKey {
  readonly namespace: string;
  readonly key: string;
}
```

例如：

```text
player/profile
player/economy
inventory/main
quest/main-story
world/flags
```

---

## 5. RealmStateKey Grammar

### Namespace

```text
MUST be non-empty
MUST be a valid Unicode scalar-value string
UTF-8 encoded length MUST be <= 64 bytes
MUST NOT contain '/'
MUST NOT contain U+0000..U+001F
MUST NOT contain U+007F
```

### Key

```text
MUST be non-empty
MUST be a valid Unicode scalar-value string
UTF-8 encoded length MUST be <= 256 bytes
MUST NOT contain '/'
MUST NOT contain U+0000..U+001F
MUST NOT contain U+007F
```

Identity comparison：

```text
case-sensitive
exact scalar sequence
no trimming
no Unicode normalization
no locale-sensitive comparison
```

因此 `player != Player`，`foo != "foo "`。Framework / transport MUST NOT silently trim、normalize 或 case-fold。

`namespace/key` 只是 canonical human-readable notation；禁止 `/` 避免误读为多级路径。

---

## 6. Record Value Model

```ts
interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly initialValue: JsonValue;
  readonly value: JsonValue;
  readonly version: number;
}
```

### Initial / Current

```text
initialValue
    current Game Entry-defined immutable baseline

value
    current Session mutable authoritative value
```

Game Entry 未声明 key：

```text
initialValue = null
```

新游戏：

```text
value = initialValue
```

从未 materialize 的合法 key 逻辑读取为：

```text
initialValue = null
value        = null
version      = 0
```

Runtime transaction 只能修改 current `value`。

### Whole-record Replacement

一个成功 `put` 替换目标 Record 的整个 `JsonValue`。v1 不提供 JSON Patch、field merge、field-level version 或 automatic merge。

### `put(null)`

`put(null)` 清空 current value，但：

```text
MUST NOT change initialValue
MUST NOT dematerialize Record
MUST NOT reset version
```

### Deep-equal Put

成功 `put` 即使与当前 value deep-equal，也仍然是一次 authoritative write：

```text
record version + 1
global revision + 1
publish committed change
```

Record version 表达 successful authoritative writes，而不是“值的语义差异次数”。RealmStateAuthority 不引入 author-visible deep-equality/no-op policy。

---

## 7. Materialized Record / Index

一个 Record 满足以下任一条件即 materialized：

```text
1. Game Entry 显式声明 initial record；
2. Load Game sparse current seed 显式包含该 record；
3. Runtime 至少一次成功 commit 写入该 record。
```

`read(unknownKey)` MUST NOT materialize Record。

namespace view 由 materialized Records group 得到。

---

## 8. Game Entry v1 Initial State

Realm State 不引入 Game Entry v2。正式 Game Package contract 应直接修改 `GameEntryV1` closed schema：

```ts
interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly state?: RealmStateGameDefinitionV1;
  readonly initial: InitialFrameTargetV1;
  readonly subsystems: readonly SubsystemDescriptorV1[];
}

interface RealmStateGameDefinitionV1 {
  readonly records: readonly RealmStateInitialRecordV1[];
}

interface RealmStateInitialRecordV1 {
  readonly namespace: string;
  readonly key: string;
  readonly value: JsonValue;
}
```

缺少整个 `state`：

```text
Realm State initial definition = empty
```

v1 只支持 Game Entry inline initial records；不支持 external file、Content-derived seed、streaming large-state loader。

`state` 与 `initial.input` 职责不同：

```text
state
    Game-level shared business baseline

initial.input
    initial Frame invocation parameters
```

---

## 9. Runtime Metadata Baseline

Game Entry MUST NOT 指定 record version / global revision / transaction id。

```text
new Session bootstrap:
    global revision = 0
    every logical/materialized Record version = 0

first successful mutation:
    global revision 0 → 1
    every write target version 0 → 1
```

Load Game 建立新的 RealmStateAuthority，同样重新从 `revision/version = 0` 开始。旧 Session concurrency metadata 不属于业务存档事实。

---

## 10. Capacity Limits

Realm State v1 使用明确 hard limits。违反限制 MUST 在任何 mutation 前 known-no-commit reject。

```text
namespace UTF-8 bytes                 <= 64
key UTF-8 bytes                       <= 256
single JsonValue encoded JSON size    <= 256 KiB
JsonValue nesting depth               <= 64

Game Entry initial record count       <= 4096
Game Entry total Realm State payload  <= 8 MiB

materialized Records per Session      <= 16384
read(keys) key count                  <= 256
subscribe(keys) key count             <= 256
transaction conditions count          <= 128
transaction writes count              <= 128
transaction total payload             <= 2 MiB
```

`encoded JSON size` 按 logical protocol 的 UTF-8 JSON payload 计算；物理 carrier 不得绕过限制。

`list()` v1 不分页。materialized Record 数和 key size 已有 hard bound，因此响应天然有界。

达到 materialized Record 上限后：

```text
first-write to a new key
    → LIMIT_EXCEEDED / known no-commit

write to an existing Record
    → not rejected merely because record-count limit is reached
```

---

## 11. Launcher PREPARE / Session Bootstrap

PREPARE：

```text
read game.json
→ validate GameEntryV1 including optional state
→ validate key grammar / JsonValue / capacity limits
→ detach/freeze initial Realm State records
→ validate Platform Launch Manifest
→ exact subsystem key-set join
→ executable/content/capability preflight
→ freeze PlatformLaunchPlan
→ freeze LogicalGameBootstrap
→ freeze Realm State game definition
──────────────────────────────────────── PREPARE complete
```

Prepared output 概念上是平级 projection：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: RealmStateGameDefinitionV1;
}
```

State payload MUST NOT 塞进 `LogicalGameBootstrap`。

Session bootstrap：

```text
PREPARE complete
→ select New Game or validated Load Game sparse current seed
→ create RealmStateAuthority
→ install immutable Game initial baseline
→ apply sparse current overrides
→ initialize revision/version = 0
→ Realm State READY
→ create Runtime-scoped RealmStateClient
→ run Main / RuntimeHosting
→ Subsystem initialize
→ initial Frame
```

必须保持：

```text
first business Runtime side effect
    ⇒ Realm State READY
```

---

## 12. New Game / Load Game

### New Game

```text
Game initial
→ initialValue
→ current value = initialValue
```

### Load Game = Sparse Current Override

```text
Save contains key
    → current value = Save value

Save does not contain key
    → current value = current Game initialValue
```

必须区分：

```text
Save record absent
    → fallback to current Game initialValue

Save record present, value = null
    → explicit current null
```

Save MUST NOT redefine `initialValue`。

Save 不要求持久化所有 materialized Records；persistence selection 属于 Save System policy。

---

## 13. Subsystem Author API

```ts
interface SubsystemScope {
  readonly content: ContentClient;
  readonly viewport: Viewport;
  readonly state: RealmStateClient;
}

interface RealmStateClient {
  read(
    keys: readonly RealmStateKey[],
    options?: { readonly signal?: AbortSignal }
  ): Promise<RealmStateSnapshot>;

  list(
    options?: { readonly signal?: AbortSignal }
  ): Promise<RealmStateIndexSnapshot>;

  commit(
    transaction: RealmStateTransaction
  ): Promise<RealmStateCommit>;

  subscribe(
    keys: readonly RealmStateKey[],
    listener: (event: RealmStateSubscriptionEvent) => void
  ): Promise<RealmStateSubscription>;
}

interface RealmStateSubscription {
  close(): void;
}
```

`read()` / `list()` 是无 authoritative side effect 的 observation，因此可以使用 `AbortSignal`。

`commit()` **不接受 `AbortSignal`**。Mutation 一旦 dispatch，就不提供 remote cancellation；调用方不得把本地“停止等待”解释成“transaction 未提交”。

所有 live Runtime-scoped clients 可访问任意 valid key；v1 没有业务 ACL。

---

## 14. Consistent Read

```ts
interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

多 key `read()` MUST 来自一个 logical revision。返回的 `JsonValue` MUST detached / immutable。

---

## 15. Index Snapshot / `list()`

```ts
interface RealmStateIndexRecord {
  readonly key: RealmStateKey;
  readonly version: number;
}

interface RealmStateIndexSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateIndexRecord[];
}
```

`list()` MUST 返回同一个 global revision 的全部 materialized Record identities + versions，不返回 `initialValue` / current `value`。

Canonical order：

```text
1. namespace ascending by unsigned lexicographic UTF-8 byte comparison
2. namespace equal → key ascending by the same comparison
```

不得使用 locale-sensitive ordering 定义 contract order。

典型 Save discovery：

```text
list()
→ discover materialized keys
→ persistence policy selects subset
→ read(selectedKeys)
→ serialize selected current values
```

`list()` revision 与随后 `read()` revision 不要求相同。v1 不引入 snapshot token / long-lived MVCC handle。

---

## 16. Optimistic Transaction Model

```ts
interface RealmStateCondition {
  readonly key: RealmStateKey;
  readonly version: number;
}

interface RealmStateTransaction {
  readonly conditions: readonly RealmStateCondition[];
  readonly writes: readonly {
    readonly type: "put";
    readonly key: RealmStateKey;
    readonly value: JsonValue;
  }[];
}
```

合法 transaction MUST 满足：

```text
conditions.length >= 1
writes.length >= 1
condition keys are unique
write keys are unique
every write key appears exactly once in conditions
writes MAY be a strict subset of conditions
```

因此 read-only dependency 可以只出现在 conditions 中。

以下均 invalid：

```text
empty conditions
empty writes
condition-only commit
duplicate condition key
duplicate write key
write key absent from conditions
```

Authority validation order：

```text
1. request structural shape
2. key grammar
3. JsonValue validity
4. count / byte / depth limits
5. condition/write uniqueness
6. verify write-set ⊆ condition-set
7. compare versions
8. atomic commit
```

非法请求 MUST 在 version comparison 前 reject，不得映射成 `CONFLICT`。

Atomic authority step：

```text
validate complete request
→ compare every condition.version against one current authority state
→ any mismatch: CONFLICT / zero write
→ atomically replace every write target current value
→ materialize newly-written Records
→ assign one fresh global commit revision
→ assign fresh version to every write target
→ publish one committed change
```

普通 transaction 使用 per-record version 做 conflict detection；global revision 不作为默认全局条件。

---

## 17. Commit Result / Evidence / Ambiguity

成功 commit 返回 authoritative post-commit projection：

```ts
interface RealmStateCommit {
  readonly revision: number;
  readonly records: readonly {
    readonly key: RealmStateKey;
    readonly version: number;
    readonly value: JsonValue;
  }[];
}
```

`records` 包含全部 write targets，包括 deep-equal successful writes。

### Error / Evidence Taxonomy

```text
INVALID_REQUEST
    malformed key/value/transaction shape
    known no-commit

LIMIT_EXCEEDED
    exceeds v1 hard bound
    known no-commit

CONFLICT
    request valid but observed version stale
    known no-commit

TERMINAL
    client / binding / authority already terminal before admission
    known no-commit

OUTCOME_UNKNOWN
    mutation may have reached/crossed authority commit point,
    but definitive result is unavailable
```

Commit evidence：

```text
success response
    → known committed

explicit INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT /
pre-admission TERMINAL
    → known no-commit

local failure before commit request is dispatched
    → known no-commit

request has been dispatched and transport/result is lost
    → OUTCOME_UNKNOWN
```

### No Remote Cancellation

v1 不提供 mutation cancellation protocol：

```text
caller has not dispatched commit
    → caller may simply not call commit

commit dispatched
    → cannot be remotely cancelled
```

调用方可以停止等待 Promise 的业务流程，但 framework MUST NOT 把这种本地停止等待解释为 authoritative cancellation。

### No Automatic Retry

`CONFLICT` 可以 fresh read → recompute → 显式 retry。

`OUTCOME_UNKNOWN` MUST NOT 自动 retry，因为第一次 mutation 可能已经提交。

v1 不提供：

```text
client transaction ID
status(transactionId)
dedup journal
replay-safe mutation
```

如果业务遇到 `OUTCOME_UNKNOWN`，可以 fresh read 做业务级 reconciliation；Realm State core 不保证所有 mutation 都能从 current state 反推出是否执行过。

---

## 18. Subscription

Subscription 只观察 authoritative committed current state，不是 generic EventBus。

### 18.1 Event Model

```ts
type RealmStateSubscriptionEvent =
  | {
      readonly type: "baseline";
      readonly snapshot: RealmStateSnapshot;
    }
  | {
      readonly type: "change";
      readonly revision: number;
      readonly records: readonly RealmStateRecord[];
    }
  | {
      readonly type: "terminal";
      readonly reason: "closed" | "binding-terminal" | "overflow";
    };
```

每个成功 commit 对一个 subscription 至多产生一个 `change` event；若同一 transaction 修改多个 subscribed Records，它们 MUST 位于同一个 change event 中。

failed / conflicted / invalid transaction MUST NOT 产生 change。

成功 deep-equal write 是 committed write，因此会产生 change。

### 18.2 Atomic Establishment / Linearization

`subscribe(keys, listener)` 是一个 Authority operation，而不是：

```text
read baseline
→ later register listener
```

Authority MUST 在同一个 serialized logical step 内：

```text
1. validate subscription keys
2. capture baseline snapshot at revision N
3. register observer whose lower bound is strictly after N
4. release authority serialization
```

这定义 subscription establishment linearization point。

即使 revision `N+1` 在 baseline 物理传输完成前就已 commit，binding 也必须先交付 baseline，再交付已缓冲的相关 change；不得漏掉 relevant commit。

Delivery invariant：

```text
first event MUST be baseline @ N
all subsequent change revisions MUST be > N
change revisions MUST be monotonically increasing
all relevant commits after N MUST be delivered unless subscription terminals
unrelated commits MAY cause revision gaps
```

例如只订阅 `inventory/main`：

```text
baseline @ 100
revision 101 changes world/weather
revision 102 changes debug/foo
revision 103 changes inventory/main

subscriber observes:
baseline @ 100
change @ 103
```

revision gap 不代表漏事件。

### 18.3 Backpressure / Overflow

Subscription delivery MUST NOT 阻塞 RealmStateAuthority commit lane。

物理 binding MAY 使用 bounded queue；若 consumer 太慢导致无法继续保证 ordered delivery：

```text
MUST NOT silently drop change
MUST terminal the subscription with reason = overflow
```

consumer 之后通过 fresh subscribe 恢复。

### 18.4 Disconnect / Reconnect

v1 不提供 replay journal、resume cursor 或 `resumeFromRevision`。

```text
binding / connection lost
→ old subscription terminal
→ reconnect
→ fresh subscribe
→ fresh baseline @ current revision
```

因此 v1 的恢复模型是 **state resynchronization**，不是 event replay。

### 18.5 Close

`subscription.close()` 是 observation-side teardown，不影响 Realm State authority。close 后不要求继续交付已排队 change；最终可观察 `terminal(reason="closed")`，或由本地 API 直接完成 teardown。正式 wire contract 可选择其中一种物理表示，但不得在 close 后重新激活同一 subscription identity。

---

## 19. No Authorization Layer in v1

Realm State v1 不定义 namespace readers/writers、per-subsystem ACL、key-prefix policy、dynamic grants 或 state admin role。

Runtime/binding terminal 后既有 RealmStateClient 必须 terminal/inert。

这是 capability lifetime correctness，不是业务 ACL。

---

## 20. Lifetime / Fatal Policy

```text
Frame suspend        != State unavailable
Frame close          != State deleted
Activation change    != State reset
Renderer reload      != State changed
Data reconnect       != State changed
put(null)            != Record identity forgotten
Runtime terminal     → its RealmStateClient terminal
Session terminal     → RealmStateAuthority terminal
RealmStateAuthority fatal → Session terminal
```

v1 不设计 transparent authority restart / journal replay / client reattach。

---

## 21. Communication Placement

Realm State SHOULD 使用独立 logical protocol，例如：

```text
loomrealm.realm-state/1
```

协议至少表达：

```text
consistent read
materialized index list
conditional commit
validation / limit / conflict / outcome evidence
atomic subscription baseline establishment
ordered subscription changes / terminal
client / authority terminal
```

不得塞进 renderer-data、Runtime Control 或 `frame.call()`。

---

## 22. Interaction with Main / Renderer / Content

Main 不持有具体 State Records，也不解释 namespace/value/initialValue。

Renderer v1 不直接成为 Realm State client：

```text
Realm State
→ Subsystem business logic
→ RenderDomain
→ Renderer Store
→ Web Presentation
```

Content 继续拥有 immutable installation definitions/resources；Realm State 拥有 Session shared mutable business facts。

```text
frame.call()
    control-flow composition

Realm State transaction
    shared-state coordination
```

---

## 23. Persistence / Save Boundary

Realm State authority 不等于 Save Game 系统。

```text
list()
→ discover materialized Records
→ persistence policy selects subset
→ read(selected keys)
→ serialize selected current values
```

Load：

```text
current Game initialValue baseline
+
Save-present current values
```

Save missing key fallback 到当前 Game initialValue；Save explicit null 是真正 current null。

Save 不应把旧 Session runtime revision/version 当作新 Session concurrency metadata。

---

## 24. Physical Platform Realization

Desktop 可以同进程托管 Main 与 RealmStateAuthority，但二者必须保持不同 logical owner/API。

PWA 可以把 Realm State 与 Main 放在同一 Worker 或不同 Worker；logical semantics 必须与 Desktop 等价，包括：

```text
snapshot consistency
OCC semantics
hard limits
commit evidence
subscription linearization
subscription terminal / fresh-resubscribe semantics
```

---

## 25. v1 Initial Implementation Scope

实现：

```text
optional GameEntryV1 state.records
inline initial records only
omitted state/key → default null semantics
immutable initialValue
new-game current = initial
sparse load-game current overrides
load absent key → current Game initialValue
revision/version baseline = 0 per new Session
explicit key grammar / hard limits
one RealmStateAuthority per Session
bootstrap-before-runtime barrier
materialized Record index
list() consistent deterministic snapshot
whole-record put
successful deep-equal put advances version/revision
consistent multi-key read
strict transaction shape validation
OCC read-set version conditions
write-set ⊆ read-set
atomic multi-record commit
explicit INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT / TERMINAL / OUTCOME_UNKNOWN
commit() without AbortSignal / remote cancellation
no automatic mutation retry
atomic subscription baseline + observer establishment
ordered relevant changes
subscription overflow/disconnect → terminal
fresh subscribe + fresh baseline recovery
Runtime-scoped RealmStateClient
RealmStateAuthority fatal → Session terminal
Desktop in-process authority + explicit transport seam
```

延后 / 不实现：

```text
Game Entry v2 only for State
large external / Content-derived initial State
ACL / RBAC
schema registry
field-level patch
long-lived transaction locks
global-revision default mutation condition
automatic retry / merge
transaction ID / dedup / mutation status query
subscription replay journal / reconnect cursor
long-lived MVCC snapshot handle
persistence implementation itself
cross-session sharing
CRDT / distributed authority
Renderer direct access
query language / secondary indexes
generic events
transparent authority restart/recovery
```

---

## 26. Qualification Targets

正式关闭实现前至少证明：

```text
Game Entry / Bootstrap
- existing GameEntryV1 without state remains valid
- optional state validates as part of GameEntryV1
- invalid/duplicate/oversized initial Records reject during PREPARE
- State is READY before first business Runtime side effect

Key / Limits
- exact grammar behaves identically across platforms
- no hidden trim/case-fold/Unicode normalization
- value/request/session hard limits are enforced

Initial / Load
- new game current = initialValue
- initialValue cannot mutate
- Save-present key overrides current
- Save-absent key falls back to current Game initialValue
- Save-present null remains explicit null
- new loaded Session revision/version start at 0

Materialization / Index
- Game initial / Load seed / successful first write materialize Records
- read unknown key does not materialize
- put(null) does not dematerialize
- list() returns exactly materialized identities + versions at one revision
- list() ordering is canonical UTF-8 byte ordering

Read / Transaction
- multi-key read is one consistent revision
- malformed transaction rejects before version comparison
- every write target has exactly one observed-version condition
- stale condition → CONFLICT + zero write
- writes are all-or-nothing
- deep-equal successful put advances version/revision

Commit Evidence
- commit API exposes no remote cancellation
- explicit pre-commit rejection is known no-commit
- dispatch followed by lost definitive result produces OUTCOME_UNKNOWN
- neither CONFLICT nor OUTCOME_UNKNOWN is automatically retried

Subscription
- establishment captures baseline and registers observer atomically
- baseline is delivered before buffered post-baseline changes
- no relevant post-baseline commit can be silently lost
- change revisions are monotonically increasing
- one transaction maps to at most one change event per subscription
- unrelated commits may create revision gaps
- slow-consumer overflow terminals instead of dropping changes
- disconnect terminals old subscription
- reconnect uses fresh subscribe + fresh baseline
- no replay/cursor is required for v1

Lifetime / Failure
- Runtime terminal terminates its client/subscriptions
- RealmStateAuthority fatal terminates Session
```

---

## 27. 已关闭、不再开放的核心设计问题

```text
Game Entry state requires v2
    = no

GameEntryV1 state required
    = no; optional

revision/version bootstrap baseline
    = 0

Save missing key
    = current Game initialValue

Save explicit null
    = explicit current null

RealmStateAuthority fatal
    = Session terminal

namespace is permission unit / State has business ACL
    = no

namespace must be predeclared
    = no

record is version/conflict/replacement unit
    = yes

transaction may span namespaces
    = yes

field-level patch
    = no

list() enumerates materialized Records
    = yes

read unknown key materializes it
    = no

put(null) dematerializes Record
    = no

deep-equal successful put is no-op
    = no

empty / condition-only / duplicate-key transaction allowed
    = no

list() order unspecified
    = no; canonical UTF-8 byte ordering

protocol limits implementation-defined/unbounded
    = no

commit supports AbortSignal / remote cancellation
    = no

dispatched mutation may be assumed no-commit after local timeout
    = no

OUTCOME_UNKNOWN may be automatically retried
    = no

v1 requires transaction ID / status query / dedup journal
    = no

subscription baseline and observer registration are separate non-atomic operations
    = no

subscription may silently drop changes on overflow
    = no

v1 subscription reconnect replays history
    = no

reconnect uses fresh baseline
    = yes

business Runtime may start before Realm State initialization
    = no
```

---

## 28. Final Invariants

1. Main 唯一拥有 Control Authority；Realm State 唯一拥有 Session shared mutable business facts；
2. Namespace 只承担 naming/logical grouping；Record 是 replacement/version/conflict unit；Transaction 是 atomicity unit；
3. RealmStateKey 使用 exact、case-sensitive、no-normalization identity，并受明确 UTF-8 hard bounds；
4. 每个 key 有 immutable `initialValue` 与 mutable current value；缺失 initial key → `initialValue = null`；
5. GameEntryV1 `state` optional，不因 Realm State 升级 document version；
6. 每个新 Session 的 revision/version 从 0 开始；Load 不继承旧 Session concurrency metadata；
7. Materialization 只来自 explicit initial、explicit load seed 或 successful write；read unknown key 不 materialize；
8. `list()` 返回一致 revision 的 materialized index，并按 canonical UTF-8 byte order 排序；
9. 所有 key/value/request/session resource 均受明确 hard limits；
10. `read(keys)` 返回一致 logical snapshot；
11. 每个 write target 必须且只能有一个 caller-observed version condition；Authority 原子执行 condition check + all writes；
12. stale condition → `CONFLICT` + zero write；successful deep-equal put 仍推进 version/revision；
13. `commit()` 不提供 remote cancellation；dispatch 后失去确定结果 → `OUTCOME_UNKNOWN`；不得自动 retry；
14. v1 不提供 mutation ID/dedup/status journal；
15. Subscription establishment 原子绑定 baseline revision 与后续 observer；baseline 后 relevant commits 不得漏失；
16. Subscription 只交付 ordered committed state changes；revision 可因 unrelated commits 跳号；
17. Overflow/disconnect 必须 terminal subscription，不得 silent drop；恢复使用 fresh subscribe + fresh baseline；
18. Realm State v1 不提供业务 ACL；live Runtime-scoped client 可 read/list/commit/subscribe；
19. Runtime terminal 终止其 client/subscriptions；RealmStateAuthority fatal → Session terminal；
20. Realm State 必须在第一项 business Runtime side effect 前 READY；
21. Hostra/PWA physical realization 可不同，但上述 logical semantics、hard limits、commit evidence 与 subscription semantics 必须一致。

---

## 29. Architectural Summary

```text
                     GameEntryV1
                 state? + initial
                       │
           ┌───────────┴───────────┐
           │                       │
           ▼                       ▼
LogicalGameBootstrap      Realm State Initial Definition
           │                       │
           ▼                       ▼
          Main               RealmStateAuthority
    Control Authority         revision = 0
                              versions = 0
                                  ▲
                                  │ sparse current overrides
                              Save (optional)

                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
                read(keys)      list()      subscribe(keys)
                 snapshot       index        baseline @ N
                                              │
                                              └→ ordered changes > N

                    local business computation
                              │
                   conditions + write-set
                              │
                              ▼
                    atomic OCC commit
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
        definitive result            result unavailable
      success / reject /            after dispatch
          CONFLICT                         │
                                           ▼
                                    OUTCOME_UNKNOWN
```

核心粒度：

```text
Namespace
    naming / logical grouping

Record
    initialValue + current value + version
    replacement / conflict unit

Materialized Index
    current known Record identities + versions
    one revision + deterministic order

Read Snapshot
    one revision + selected values + versions

Transaction
    validated read-set version conditions + write-set
    multi-record atomicity

Subscription
    atomic baseline + observer registration
    ordered relevant committed changes
    fresh-baseline recovery
```

至此 Realm State v1 的核心架构语义已经闭合。下一阶段应转向 **正式 contract、reference authority、Launcher/Subsystem projection、Desktop binding 与 qualification**，而不是继续向 core 增加未被真实 consumer 证明必要的机制。
