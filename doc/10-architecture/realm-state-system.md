# Realm State：Session 级共享业务状态系统

> 层级：系统架构  
> 状态：Proposal / Active Design  
> 稳定程度：Evolving / **Not Implemented / Not Contract Frozen / Not Qualified**  
> 主要定义：Session 级共享业务状态 authority、Game Entry 初始状态、immutable initial value、materialized record index、consistent snapshot、optimistic transaction、Subsystem 访问 capability、订阅/生命周期与平台边界  
> 依赖：[系统架构总览](./system-overview.md)、[模块子系统模型](./subsystem-model.md)、[栈式运行系统](./stack-runtime-system.md)、[存储与内容系统](./storage-system.md)、[通信系统](./communication-system.md)、[Game Package v1](../15-contracts/game-package-v1.md)  
> 最近复核：2026-10-05

本文定义 LoomRealm 候选的 **Realm State**：位于 `Main` 控制 authority 与各 `Subsystem Runtime` 局部业务状态之间的 **Session 级、跨 Subsystem、可变业务状态唯一 authority**。

本文仍是架构提案，不宣称对应生产实现已经存在。真正实现前仍需把本文已确定的语义落实到 Game Package / Realm State / Launcher / Subsystem 等正式 contracts 与实现中。

---

## 1. 已确定的核心方向

1. Realm State 是独立于 Main 的 Session Shared Business State Authority；
2. 新游戏 Realm State 初始业务值属于 platform-neutral Game Entry；
3. Game Entry v1 **直接增加 optional `state` 字段**，继续使用 `formatVersion: 1`，不因该字段升级到 v2；
4. 缺少 `state` 的既有 Game Entry 继续合法，并等价于空 Realm State initial definition；
5. Platform Launcher 在 PREPARE 阶段验证并投影 Game Entry state，但不是 runtime State authority；
6. Realm State 必须在任何 business Runtime side effect 前初始化完成；
7. `namespace` 只承担逻辑分组与命名，不是权限、更新、版本、冲突或事务单位；
8. `(namespace,key)` Record 是读写、版本与冲突基本单位；
9. Transaction 是跨 Record 的原子提交单位，并 MAY 跨 namespace；
10. v1 写入采用 whole-record replacement，不提供 field-level patch；
11. 每个 logical key 同时具有 immutable `initialValue` 与 mutable current `value`；
12. Game Entry 未声明 key 时 `initialValue = null`；新游戏 current `value = initialValue`；
13. Runtime transaction 永远不能修改 `initialValue`；
14. `revision` 与所有 Record `version` 在新 Session bootstrap 时从 `0` 开始；
15. Load Game 创建新的 RealmStateAuthority 时不继承旧 Session runtime revision/version；
16. 多 key `read()` 返回同一 logical snapshot；
17. mutation 采用 optimistic concurrency control（OCC）：read-set version conditions + atomic write-set；
18. 每个 write target MUST 出现在 read-set/conditions 中；read-set MAY 包含只读但影响业务判断的 Record；
19. 任一 observed version stale，整个 transaction 返回 `CONFLICT` 且 zero write；
20. v1 不提供跨 Runtime 长生命周期锁事务，也不自动重试业务 transaction；
21. Realm State v1 不提供 Subsystem / namespace / key 级业务 ACL；所有 live Runtime-scoped `RealmStateClient` 均可 read/list/commit/subscribe；
22. `list()` 返回当前 materialized Records 的 `(namespace,key,version)` 一致索引快照，不返回 value；
23. Save System 不要求保存所有 State；Save 可只持久化自己选择的部分 current values；
24. Load Game 使用 sparse current-value override：Save 中存在的 key 覆盖 current value；Save 中缺失的 key 回退到当前 Game `initialValue`；
25. Save 中 record absent 与 record present with `value = null` 语义不同；
26. RealmStateAuthority fatal 直接导致 Session terminal；
27. v1 不考虑大型 external / Content-derived initial state，只支持 Game Entry inline records；
28. `namespace` / `key` 使用确定的 Unicode/UTF-8 grammar 与 hard bounds；
29. v1 所有关键请求都有确定 hard capacity limits，不使用 implementation-defined unlimited；
30. 一个合法 transaction 中至少有一个 condition 和一个 write；condition/write keys 各自唯一；每个 write key 必须且只能对应一个 condition；
31. 成功 `put` 即使与当前 value deep-equal，也仍是一次 authoritative write：推进 Record version、global revision，并产生 committed change；
32. `list()` 结果按 `(namespace,key)` 的 UTF-8 unsigned byte lexicographic order 确定性排序，不依赖 locale。

---

## 2. Problem Statement

现有 LoomRealm 已明确区分：

```text
Main
    Session / Runtime / Frame / Stack / Activation
    InputTarget / DataAuthority / failure unwind

Subsystem Runtime
    subsystem-local business state
    Frame Context / mutation gate
    Input Interest
    authoritative Render Domains
    readonly ContentClient

Readonly Content
    immutable definitions / records / resources

Renderer
    read-only authority mirror / render replicas / input producer
```

随着 Map、Battle、Menu、Quest、Inventory 等领域增加，会出现不能自然归属于任一 Subsystem 的 Session 业务事实：

```text
player profile / progression
party
inventory
money / economy
quest progress
world flags
cross-subsystem unlocks
session-wide game variables
```

这些状态跨 Frame、跨 Subsystem，可能被多个 Runtime 合法读写，并要求明确的原子性、版本、冲突和失败语义。它们是业务事实，不属于 Main 的控制状态，也不是 readonly Content。

`frame.call()` 表达 Main-owned LIFO control flow，不应承担普通跨 Subsystem 共享状态读写。

---

## 3. Authority Model

```text
Main
    Control Authority
    ├── Session control
    ├── Runtime lifecycle
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
    └── subscriptions to committed state

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
    "这个 Game 的共享业务事实初始是什么、现在是什么"

Subsystem State
    "这个领域执行器现在正在做什么"

Content
    "这个东西按安装定义是什么"
```

Realm State MUST NOT 被实现为 Main 内部任意业务字段集合。

---

## 4. Trust Model / Non-goals

Realm State v1 假设 Game Package 中的 Subsystem implementation 属于同一个受信游戏产品，而不是互相敌对的第三方 tenant。

因此 Realm State core 强制的是 correctness：

```text
consistent snapshot
record version / conflict
atomic commit
initialValue immutability
Runtime / Session lifetime
transport / commit evidence
```

业务 ownership 由 game-lib API、共享 key 常量/types、测试、代码审查和业务 invariant 保证。

v1 不设计：

```text
ACL / RBAC / policy engine
namespace registry
schema registry
field-level JSON patch
SQL/query language
secondary indexes
long-lived remote transaction locks
automatic transaction retry
automatic merge
CRDT / distributed consensus
cross-session shared authority
Renderer direct State access
generic EventBus
large external initial-state source
```

---

## 5. Namespace / Record / Transaction 粒度

### 5.1 Namespace

`namespace` 只用于逻辑分组与命名：

```text
player
inventory
party
quest
world
```

明确：

```text
namespace != permission unit
namespace != replacement unit
namespace != version unit
namespace != conflict unit
namespace != transaction unit
```

v1 不要求预声明 namespace，也不维护 namespace registry。

### 5.2 Record

```ts
interface RealmStateKey {
  readonly namespace: string;
  readonly key: string;
}
```

Record 是 read / write / version / conflict 单位。

### 5.3 Transaction

Transaction 是 atomicity unit，可跨 Record / namespace：

```text
player/economy
+
inventory/main
+
quest/shopping-tutorial
```

必须 all-or-nothing。

总结：

```text
Namespace   = naming / logical grouping
Record      = read / write / version / conflict
Transaction = atomicity
```

---

## 6. RealmStateKey Grammar

v1 正式采用以下 identity 规则。

### 6.1 Namespace

```text
MUST be non-empty
MUST be a valid Unicode scalar-value string
UTF-8 encoded length MUST be <= 64 bytes
MUST NOT contain '/'
MUST NOT contain U+0000..U+001F
MUST NOT contain U+007F
```

### 6.2 Key

```text
MUST be non-empty
MUST be a valid Unicode scalar-value string
UTF-8 encoded length MUST be <= 256 bytes
MUST NOT contain '/'
MUST NOT contain U+0000..U+001F
MUST NOT contain U+007F
```

### 6.3 Identity Semantics

Realm State identity comparison：

```text
case-sensitive
exact scalar sequence
no trimming
no Unicode normalization
no locale-sensitive comparison
```

因此：

```text
player != Player
foo != "foo "
```

Framework / transport MUST NOT silently trim、normalize 或 case-fold key。

`namespace/key` 只是 canonical human-readable notation；禁止 `/` 避免同一文本被误读为多级路径。

---

## 7. Record Value Model

```ts
interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly initialValue: JsonValue;
  readonly value: JsonValue;
  readonly version: number;
}
```

### 7.1 Initial Value

`initialValue` 来自当前 Game Entry initial definition，并在整个 Session lifetime 内不可变。

Game Entry 未声明某 key：

```text
initialValue = null
```

### 7.2 Current Value

新游戏：

```text
value = initialValue
```

Runtime transaction 只能替换 current `value`。

v1 一个成功 `put` 替换目标 Record 的整个 JsonValue，不提供 JSON Patch / field merge / field version。

### 7.3 Logical Default

从未 materialize 的合法 key 可逻辑读取为：

```text
initialValue = null
value        = null
version      = 0
```

### 7.4 Clear

`put(null)` 表示清空 current value，但不会修改 `initialValue`，也不会删除 Record identity 或重置 version。

### 7.5 Deep-equal Put Is Still a Write

如果：

```text
current value = { money: 100 }
```

提交：

```text
put { money: 100 }
```

只要 transaction 合法、conditions 成立并成功 commit，就仍然：

```text
record version + 1
global revision + 1
publish committed change
```

RealmStateAuthority 不做 author-visible deep-equal no-op 判定。

理由：Record version 表达 successful authoritative writes，而不是“值的语义差异次数”。这避免把 JSON structural equality、object member ordering 与 deep-comparison policy 引入 v1 contract。

---

## 8. Materialized Record / Index

Realm State logical key space 不要求预注册，因此 `list()` 只枚举 materialized Records。

一个 Record 满足以下任一条件即 materialized：

```text
1. Game Entry 显式声明该 initial record；
2. Load Game sparse current seed 显式包含该 record；
3. Runtime 至少一次成功 commit 写入该 record。
```

单纯 `read(unknownKey)` MUST NOT materialize Record。

`put(null)` 对已 materialized Record 不会 dematerialize。

namespace view 由 materialized Records 自然 group 得到，不存在独立 NamespaceRegistry。

---

## 9. Game Entry v1 Initial State

### 9.1 Version Decision

Realm State 不引入 Game Entry v2。

正式 Game Package contract 应直接修改现有 `GameEntryV1` closed schema，使 `state` 成为 optional field：

```ts
interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly state?: RealmStateGameDefinitionV1;
  readonly initial: InitialFrameTargetV1;
  readonly subsystems: readonly SubsystemDescriptorV1[];
}
```

缺少 `state`：

```text
initial definition = empty
```

### 9.2 State Shape

```ts
interface RealmStateGameDefinitionV1 {
  readonly records: readonly RealmStateInitialRecordV1[];
}

interface RealmStateInitialRecordV1 {
  readonly namespace: string;
  readonly key: string;
  readonly value: JsonValue;
}
```

### 9.3 Inline Only

v1 只考虑 Game Entry inline initial records，不考虑 external file / Content-derived seed / streaming large-state loader。

---

## 10. Runtime Metadata Baseline

Game Entry MUST NOT 指定 record version / global revision / transaction id。

正式采用：

```text
new Session bootstrap:
    global revision = 0
    every logical/materialized record version = 0

first successful mutation:
    global revision 0 → 1
    changed record version 0 → 1
```

Load Game 建立新 Session 时 runtime concurrency metadata 也重新从 0 开始。

---

## 11. Capacity Limits

Realm State v1 使用明确 hard limits。违反限制 MUST 在任何 authority mutation 前拒绝，并属于 known no-commit。

### 11.1 Key / Value Limits

```text
namespace UTF-8 bytes                 <= 64
key UTF-8 bytes                       <= 256
single JsonValue encoded JSON size    <= 256 KiB
JsonValue nesting depth               <= 64
```

`encoded JSON size` 指 Realm State logical protocol 采用的 canonical/validated JSON payload 的 UTF-8 byte size；不同物理 carrier 不得通过更宽松的本地对象表示绕过该上限。

### 11.2 Bootstrap Limits

```text
Game Entry initial record count       <= 4096
Game Entry total Realm State payload  <= 8 MiB
```

### 11.3 Session / API Limits

```text
materialized Records per Session      <= 16384
read(keys) key count                  <= 256
subscribe(keys) key count             <= 256
transaction conditions count          <= 128
transaction writes count              <= 128
transaction total payload             <= 2 MiB
```

`list()` 不在 v1 引入 pagination/cursor。由于 materialized Record 总数和 key byte length 已有 hard bound，因此 list response 天然有界。

达到 materialized Record 上限时，对新 key 的 first-write MUST 以 `LIMIT_EXCEEDED` known-no-commit 拒绝；已有 Record 的合法写入不因 record-count limit 被拒绝。

这些数值属于 v1 protocol bounds；未来若真实 workload 证明不足，应通过后续 contract revision 调整，而不是由不同平台自行放宽。

---

## 12. `state` vs `initial.input`

```text
state
    Game-level shared business baseline

initial.input
    initial Frame invocation parameters
```

Realm State 不吞并 Frame 参数；长期共享事实也不塞进 `initial.input`。

---

## 13. Launcher PREPARE / Session Bootstrap

PREPARE：

```text
read game.json
→ validate Game Entry v1 including optional state
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

Prepared output 概念上产生两个平级 projection：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: RealmStateGameDefinitionV1;
}
```

Session bootstrap：

```text
PREPARE complete
→ select New Game or validated Load Game sparse current seed
→ create RealmStateAuthority
→ install immutable Game initial baseline
→ apply sparse current overrides
→ initialize revision/version = 0
→ Realm State READY
→ create Runtime-scoped RealmStateClient capabilities
→ run Main / RuntimeHosting
→ Subsystem initialize
→ initial Frame
```

---

## 14. New Game / Load Game

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

必须区分 Save absent 与 Save present `null`。

Save MUST NOT redefine `initialValue`。

---

## 15. Subsystem Author Capability

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
    transaction: RealmStateTransaction,
    options?: { readonly signal?: AbortSignal }
  ): Promise<RealmStateCommit>;

  subscribe(
    keys: readonly RealmStateKey[],
    listener: (change: RealmStateChange) => void
  ): () => void;
}
```

所有 live Runtime-scoped clients 可访问任意 valid key；v1 没有业务 ACL。

---

## 16. Consistent Read

```ts
interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

多 key `read()` MUST 来自一个 logical revision；返回 JsonValue MUST detached / immutable。

---

## 17. Index Snapshot / `list()`

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

`list()` MUST 返回同一个 global revision 的全部 materialized Record identities + versions，不返回 initial/current value。

### 17.1 Deterministic Ordering

`records` MUST 按以下 canonical order 返回：

```text
1. namespace ascending by unsigned lexicographic comparison of UTF-8 encoded bytes
2. when namespace bytes equal, key ascending by the same comparison
```

不得使用 locale-sensitive ordering（包括默认 `localeCompare()` 结果）定义 contract order。

该顺序只用于 deterministic presentation / tests / diagnostics / serialization stability，不赋予业务优先级语义。

### 17.2 Save Discovery

```text
list()
→ discover materialized keys
→ Save policy selects subset
→ read(selectedKeys)
→ persist selected current values
```

`list()` revision 与随后 `read()` revision 不要求相同。

---

## 18. Optimistic Transaction Model

Mutation：

```text
consistent read
→ local business computation without lock
→ conditional atomic commit
```

### 18.1 Transaction Shape

```ts
interface RealmStateCondition {
  readonly key: RealmStateKey;
  readonly version: number;
}

interface RealmStateTransaction {
  readonly conditions: readonly RealmStateCondition[];
  readonly writes: readonly {
    readonly type: 'put';
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

因此允许：

```text
conditions: A, B, C
writes:     A, B
```

其中 C 可以只是业务判断依赖。

以下均为 invalid transaction：

```text
empty conditions
empty writes
condition-only commit
duplicate condition key
duplicate write key
write key absent from conditions
```

### 18.2 Validation Order

Authority 在进入 version comparison 前 MUST 完整完成 request validation：

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

非法请求不得通过 `CONFLICT` 表示。

### 18.3 Error Taxonomy Direction

v1 至少区分：

```text
INVALID_REQUEST
    malformed key/value/transaction shape
    known no-commit

LIMIT_EXCEEDED
    valid category but exceeds protocol hard bound
    known no-commit

CONFLICT
    request valid but observed version stale
    known no-commit

TERMINAL
    client / binding / authority already terminal
    known no-commit when request was not admitted

OUTCOME_UNKNOWN
    mutation may have crossed commit point but definitive result unavailable
```

`OUTCOME_UNKNOWN` 的精确 Abort/transport 触发条件仍属于剩余 Open Question。

### 18.4 Atomic Authority Step

```text
validate complete request
→ compare every condition.version against one current authority state
→ any mismatch: CONFLICT / zero write
→ otherwise atomically replace all target current values
→ materialize newly-written Records
→ assign one fresh global commit revision
→ assign fresh versions to every write target
→ publish committed change
```

即使某个 write value 与旧 value deep-equal，该 write target 也获得 fresh version。

### 18.5 Per-record Version vs Global Revision

```text
record version
    optimistic conflict detection

global revision
    snapshot identity / total commit order / subscription / diagnostics
```

普通 transaction 不要求 global revision 未变化。

---

## 19. Commit Result / Conflict / Failure

成功 commit SHOULD 返回：

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

`records` 表示本次 write targets 的 authoritative post-commit projection，包括 deep-equal successful writes。

```text
CONFLICT
    = known no-commit
    = zero write
```

caller 可以 fresh read → recompute → 构造新 transaction → 显式 retry。

Realm State MUST NOT 自动重放旧 write-set。

### Ambiguous Mutation

```text
success response
    → known committed

INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT / explicit pre-commit rejection
    → known no-commit

timeout / connection loss after request may have reached commit point
    → possibly committed / OUTCOME_UNKNOWN
```

Commit cancellation / AbortSignal 精确 commit-point 语义仍属于剩余缺口。

---

## 20. Subscription

Subscription 只观察 authoritative current-value commit：

```text
baseline snapshot @ revision N
→ committed change N+1
→ committed change N+2
```

Subscription 不是 generic EventBus。

failed/conflicted/invalid transaction MUST NOT 产生 state-change notification。

成功 deep-equal write 属于 committed write，因此 MUST 产生对应 committed change notification。

Baseline 与 subsequent changes 如何无 gap linearize，以及断线后如何恢复，仍属于剩余缺口。

---

## 21. No Authorization Layer in v1

Realm State v1 不定义 namespace readers/writers、per-subsystem ACL、key-prefix policy、dynamic grants 或 state admin role。

Runtime/binding terminal 后既有 RealmStateClient 必须 terminal/inert。

---

## 22. Lifetime / Fatal Policy

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

## 23. Communication Placement

Realm State SHOULD 使用独立 logical protocol，例如：

```text
loomrealm.realm-state/1
```

协议至少需要表达：

```text
consistent read
materialized index list
conditional commit
validation / limit / conflict / outcome result
subscription baseline/change
terminal/failure
```

---

## 24. Interaction with Main / Renderer / Content / `frame.call()`

Main 不持有具体 State Records，也不解释 namespace/value/initialValue。

Renderer v1 不直接成为 Realm State client：

```text
Realm State
→ Subsystem business logic
→ RenderDomain
→ Renderer Store
→ Web Presentation
```

Content 继续拥有 immutable installation definitions/resources；Realm State 拥有 Session shared facts。

`frame.call()` 表达 control-flow composition；Realm State transaction 表达 shared-state coordination。

---

## 25. Persistence / Save Boundary

Realm State authority 不等于 Save Game 系统。

```text
list()
→ discover materialized Records
→ persistence policy selects subset
→ read(selected keys)
→ serialize current values
```

Load 使用 sparse override：

```text
current Game initialValue baseline
+
Save-present current values
```

Save missing key fallback 到当前 Game initialValue；Save explicit null 是真正 current null。

Save 不应把旧 Session runtime revision/version 当作新 Session concurrency metadata。

---

## 26. Physical Platform Realization

Desktop 可在同一进程中同时托管 Main 与 RealmStateAuthority，但二者必须保持不同 logical owner/API。

PWA 可以把 Realm State 与 Main 放在同一 Worker 或不同 Worker；logical semantics 必须与 Desktop 等价。

---

## 27. v1 Initial Implementation Scope

实现：

```text
optional Game Entry v1 state.records
inline initial records only
omitted state / omitted key → default null semantics
immutable initialValue
new-game current = initial
sparse load-game current overrides
load absent key → current Game initialValue
revision/version baseline = 0 per new Session
explicit key grammar
explicit capacity hard limits
one RealmStateAuthority per Session
bootstrap-before-runtime barrier
namespace + key Records
no namespace registry
materialized record index
list() consistent deterministic index snapshot
read unknown key does not materialize
put(null) keeps Record materialized
no business ACL
whole-record put
successful deep-equal put still advances version/revision
consistent multi-key read
optimistic read-set version conditions
strict transaction shape validation
write-set ⊆ read-set
atomic multi-record commit
explicit INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT
post-commit revision/version result
ordered state-change subscription
Runtime-scoped RealmStateClient
RealmStateAuthority fatal → Session terminal
Desktop in-process authority + explicit transport seam
```

延后：

```text
Game Entry v2 only for State
large external / Content-derived initial State
ACL / RBAC
schema registry
field-level patch
long-lived transaction locks
global-revision default mutation condition
automatic retry / merge
transaction coordinator
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

## 28. Qualification Targets

正式关闭前至少证明：

```text
Game Entry / Bootstrap
- existing GameEntryV1 without state remains valid
- optional state validates as part of GameEntryV1
- invalid key / duplicate / oversized initial records reject during PREPARE
- State is READY before first business Runtime side effect

Key / Limits
- empty/control/slash/oversized namespace or key rejects identically across platforms
- no transport performs hidden trim/case-fold/Unicode normalization
- JsonValue size/depth and request counts enforce exact v1 hard limits
- exceeding materialized record limit rejects first-write with zero mutation

Initial / Load
- new game current equals initialValue
- initialValue cannot mutate
- Save-present key overrides current
- Save-absent key falls back to current Game initialValue
- Save-present null remains explicit null
- new loaded Session revision/version start from 0

Materialization / Index
- Game initial / Load seed / successful first write materialize Records
- read unknown key does not materialize
- put(null) does not dematerialize
- list() returns exactly materialized identities + versions at one revision
- list() order is deterministic UTF-8 byte lexicographic namespace/key

Read / Transaction
- multi-key read is one consistent revision
- empty/duplicate/malformed transaction rejects before version comparison
- every write target has exactly one observed-version condition
- read-only dependency may enter conditions
- stale condition → CONFLICT + zero write
- writes are all-or-nothing
- deep-equal successful put advances target version and commit revision
- unrelated Record commits do not conflict unless conditioned upon

Lifetime / Failure
- Runtime terminal terminates its client
- RealmStateAuthority fatal terminates Session
- CONFLICT and ambiguous transport outcome remain distinguishable

Subscription
- no event for failed/conflicted/invalid transaction
- committed changes are ordered
- deep-equal successful write produces committed change
- subscription remains State observation, not generic EventBus
```

---

## 29. Remaining Open Questions

当前 Realm State v1 只剩两个主要未冻结的并发协议问题。

### 29.1 Subscription Linearization / Reconnect

需要正式定义如何保证：

```text
baseline @ N
→ N+1
→ N+2
```

中间绝不漏 commit。

同时需要决定断线后采用：

```text
fresh subscribe + fresh baseline
```

还是 reconnect cursor / replay。

当前倾向 v1 使用 fresh subscribe + fresh baseline，但尚未冻结。

### 29.2 Commit Cancellation / Ambiguous Outcome

需要定义 `AbortSignal` / timeout 在 commit linearization point 前后的语义：

```text
cancel before authority admits mutation
    → known no-commit

authority may already have crossed commit point but response lost
    → OUTCOME_UNKNOWN
```

同时还需决定 v1 是否仅暴露 `OUTCOME_UNKNOWN`，还是引入 client transaction ID + status query / dedup journal。

---

## 30. 已关闭、不再开放的设计问题

```text
Game Entry state requires v2
    = no

GameEntryV1 state required
    = no; optional

missing Game Entry state
    = empty initial definition

revision/version bootstrap baseline
    = 0

Load Game inherits old Session runtime revision/version
    = no

Save missing key
    = fallback to current Game initialValue

Save explicit null
    = current null

RealmStateAuthority fatal
    = Session terminal

large external initial State in v1
    = no

namespace is permission unit
    = no

Realm State v1 has per-subsystem ACL
    = no

namespace must be predeclared
    = no

record is version/conflict/replacement unit
    = yes

transaction may span records/namespaces
    = yes

v1 field-level patch
    = no

runtime may mutate initialValue
    = no

Save must persist every Realm State Record
    = no

list() enumerates all logical possible keys
    = no

list() enumerates all materialized Records
    = yes

read unknown key materializes it
    = no

put(null) dematerializes Record
    = no

successful deep-equal put is no-op
    = no

successful deep-equal put advances version/revision
    = yes

empty transaction allowed
    = no

condition-only commit allowed
    = no

duplicate condition/write keys allowed
    = no

write without corresponding condition allowed
    = no

list() order unspecified
    = no

list() canonical ordering
    = UTF-8 unsigned byte lexicographic namespace then key

key comparison uses trim/normalization/case folding
    = no

protocol capacity is implementation-defined/unbounded
    = no

write may blindly replace without observing version
    = no

ordinary transaction holds remote locks while business computes
    = no

CONFLICT means known-no-commit
    = yes

Main LogicalGameBootstrap contains State payload
    = no

business Runtime may start before Realm State initialization
    = no
```

---

## 31. Final Invariants

1. Main 唯一拥有 Control Authority；
2. Realm State 唯一拥有 Session shared mutable business facts；
3. Subsystem 拥有 domain-local execution/state；
4. Content 保持只读；Renderer 不成为第二业务状态 authority；
5. Namespace 只承担 naming/logical grouping；
6. RealmStateKey 使用 exact、case-sensitive、no-normalization identity；namespace <= 64 UTF-8 bytes，key <= 256 UTF-8 bytes，并禁止 `/` 与 ASCII control chars；
7. `(namespace,key)` Record 是 current replacement/version/conflict 单位；
8. Transaction 是 atomicity unit，可跨 namespace；
9. 每个 key 有 immutable initialValue 与 mutable current value；
10. 缺失 initial key 的 initialValue = null；
11. GameEntryV1 `state` optional，缺失等价于 empty initial definition；
12. State 直接纳入 GameEntryV1，不因该功能升级 formatVersion；
13. New Game current = initialValue；
14. Load Game 使用 sparse current override，Save absent → current Game initialValue；
15. Save explicit null != Save absent；
16. Runtime transaction 永远不能修改 initialValue；
17. 每个新 Session global revision 和 Record versions 从 0 开始；
18. materialization 只来自 explicit initial、explicit load seed 或 successful write；
19. read unknown key 不 materialize；put(null) 不遗忘 Record identity；
20. list() 返回一致 revision 的 materialized index，并按 UTF-8 byte order 确定性排序；
21. Realm State v1 所有 key/value/request/resource 都受明确 hard limits 约束；
22. read(keys) 返回一致 logical snapshot；
23. transaction 至少包含一个 condition 和一个 write；condition/write key 均唯一；
24. 每个 write target 必须且只能有一个 caller observed version condition；
25. read-only business dependencies 可以进入 conditions；
26. Authority 在 version comparison 前完成完整 validation；非法请求与 LIMIT_EXCEEDED 均 known-no-commit；
27. Authority 原子执行 condition check + all writes；stale condition → CONFLICT + zero write；
28. successful put 永远是 authoritative write，即使 deep-equal，也推进 Record version/global revision 并发布 change；
29. v1 不持有跨 Runtime 长事务锁，不自动 retry；
30. CONFLICT 与 OUTCOME_UNKNOWN 必须区分；
31. Realm State v1 不提供业务 ACL；live Runtime-scoped client 可 read/list/commit/subscribe；
32. Runtime terminal 使其 client terminal/inert；RealmStateAuthority fatal → Session terminal；
33. Realm State 必须在第一项 business Runtime side effect 前 READY；
34. initial State v1 只支持 Game Entry inline records；
35. Hostra/PWA physical realization 可不同，但上述 logical semantics 与 hard limits 必须一致。

---

## 32. Architectural Summary

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
                                  │
                    ┌─────────────┼─────────────┐
                    ▼             ▼             ▼
                read(keys)      list()      subscribe(keys)
                 values       key+version       changes
                    │
             local computation
                    │
          conditions + write-set
                    │
                    ▼
             atomic OCC commit
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
    deterministic canonical order

Read Snapshot
    one revision + selected values + versions

Transaction
    validated read-set version conditions + write-set
    multi-record atomicity
```

当前大架构与普通 runtime contract 边界已基本闭合；剩余核心工作集中在 **Subscription linearization/reconnect** 与 **Commit cancellation/ambiguous outcome** 两项并发协议语义。