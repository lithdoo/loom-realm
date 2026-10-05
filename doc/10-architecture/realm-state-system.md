# Realm State：Session 级共享业务状态系统

> 层级：系统架构  
> 状态：Proposal / **Core Architecture Semantics Closed**  
> 稳定程度：**Not Implemented / Formal Contract Pending / Not Qualified**  
> 主要定义：Session 级共享业务状态 authority、Namespace Record Collection、Game Entry 初始状态、immutable initial value、materialized Collection index、consistent snapshot、optimistic transaction、subscription linearization、commit evidence、validation ownership、生命周期与平台边界  
> 依赖：[系统架构总览](./system-overview.md)、[模块子系统模型](./subsystem-model.md)、[栈式运行系统](./stack-runtime-system.md)、[存储与内容系统](./storage-system.md)、[通信系统](./communication-system.md)、[Game Package v1](../15-contracts/game-package-v1.md)  
> 最近复核：2026-10-05

本文定义 LoomRealm 的候选 **Realm State**：位于 `Main` 控制 authority 与各 `Subsystem Runtime` 局部业务状态之间的 **Session 级、跨 Subsystem、可变业务状态唯一 authority**。

本文冻结的是 **core architecture semantics**：authority、lifetime、Collection/Record/Transaction 粒度、initial/current、materialization、consistent read、OCC mutation、commit evidence、subscription linearization、validation ownership 与 persistence boundary。后续仍需把这些语义落实到 Game Package、Realm State logical protocol、Subsystem author API、Launcher、Hostra/PWA realization、实现与 qualification。

以下内容仍属于 **formal contract closure**，不代表 Realm State 核心架构仍开放：API empty/duplicate input 规则、部分返回数组的 canonical ordering、revision/version 数值 representation bound、JsonValue encoded-size/depth 的精确计算规则、wire error serialization 等。

---

## 1. 核心结论

1. Realm State 是独立于 Main 的 Session Shared Business State Authority；
2. 新游戏 Realm State 初始业务值属于 platform-neutral Game Entry；
3. Game Entry v1 直接增加 optional `state` 字段，继续使用 `formatVersion: 1`；
4. 缺少 `state` 的既有 Game Entry 继续合法，并等价于空 Realm State initial definition；
5. Realm State 必须在任何 business Runtime side effect 前初始化完成；
6. `namespace` 是 **Record Collection identifier**：负责组织与发现一组 materialized Records；`key` 是该 Collection 内的 Record identifier；
7. Namespace/Collection 不拥有 value、version、conflict、ACL、transaction 或独立 lifecycle；
8. Collection membership 是 **observational discovery metadata**，不是 OCC condition 或 transactional set predicate；
9. `(namespace,key)` Record 是读写、replacement、version 与 conflict 单位；
10. Transaction 是跨 Record 的原子提交单位，并 MAY 跨 Collection；
11. Collection 不需要预创建；不存在 NamespaceRegistry、`createNamespace()` 或 `deleteNamespace()`；Collection existence 由 materialized Records 派生；
12. v1 使用 whole-record replacement，不提供 field-level patch；
13. 每个 logical key 具有 immutable `initialValue` 与 mutable current `value`；
14. Game Entry 未声明 key 时 `initialValue = null`；新游戏 current `value = initialValue`；
15. 每个新 Session 的 global revision 与所有 Record version 从 `0` 开始；Load Game 不继承旧 Session concurrency metadata；
16. 多 key `read()` 返回同一 logical snapshot；
17. mutation 使用 optimistic concurrency control（OCC）：read-set Record version conditions + atomic write-set；
18. 每个 write target MUST 出现在 conditions 中；read-only business dependencies MAY 同样进入 conditions；
19. stale condition → `CONFLICT` + zero write；
20. v1 不提供跨 Runtime 长事务锁，也不自动 retry business transaction；
21. Realm State v1 不提供 Subsystem / namespace / key 业务 ACL；
22. `list()` 是 Collection/Record discovery API，可枚举全部 materialized Collections，或只枚举指定 namespace Collection；
23. `list()` 返回一致 revision 的 Collection → Record key/version index，不返回业务 value，也不是 transactional Collection scan；
24. Subscription 只观察显式已知 `RealmStateKey` Records；v1 不提供 namespace wildcard subscription；
25. Save 可以只保存部分 current values；Load Game 使用 sparse current-value override；
26. RealmStateAuthority fatal → Session terminal；
27. Key grammar、capacity limits、transaction shape、deep-equal write、Collection/index ordering 均为已确定架构方向；
28. 一个 logical request 的 semantic validation MUST 有明确 owner；实现 MAY 将已验证 key/value/request 投影为 trusted internal representation，并避免在 SDK / transport adapter / Authority 间重复执行等价 deep validation；
29. Authority serialized commit step SHOULD 保持为 Record lookup、version comparison、atomic reference replacement、revision/version allocation、materialization/index metadata update 等短路径；serialization、deep clone、canonical sorting 与 listener delivery SHOULD 在该 serialized step 外完成；
30. Subscription 采用 authority 原子 baseline + observer registration；断线/overflow 后 fresh subscribe，不提供 replay cursor；
31. `commit()` 不支持 remote cancellation；一旦 dispatch，结果丢失时使用 `OUTCOME_UNKNOWN`，不得自动 retry；
32. v1 不引入 transaction ID、dedup journal、status query 或 generic transaction coordinator。

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
    ├── Namespace Record Collections
    │     └── materialized Records
    ├── immutable Game-defined initial values
    ├── mutable current values
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

Namespace / Collection
    "这些 Records 属于哪一组、当前可发现哪些 materialized Records"

Record key
    "它是该 Collection 中哪一个 Record"

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
Collection/index discovery consistency
subscription ordering
Runtime / Session lifetime
commit evidence
```

业务 ownership 由 game-lib API、共享 key constants/types、测试、代码审查与业务 invariant 保证。

v1 不设计：

```text
ACL / RBAC / policy engine
independent NamespaceRegistry
createNamespace() / deleteNamespace()
namespace value / namespace version / namespace transaction
Collection membership OCC condition / Collection predicate lock
namespace wildcard subscription
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

## 4. Namespace Collection / Record / Transaction

### 4.1 Namespace = Record Collection

`namespace` 是 Realm State 中一组 Records 的 **Collection identifier**。

例如：

```text
Realm State
├─ player
│  ├─ profile
│  ├─ economy
│  └─ progression
├─ inventory
│  └─ main
└─ quest
   ├─ main-story
   └─ side-001
```

这里：

```text
player / inventory / quest
    = Namespace / Record Collection

profile / economy / main / side-001
    = key inside that Collection
```

精确定义：

```text
Namespace
    Record Collection / organization + discovery boundary

Key
    Record identifier within one Collection

Record identity
    (namespace, key)
```

Namespace/Collection 的职责仅是：

```text
logical organization
discovery/filter boundary
human-facing grouping
key naming scope
```

明确：

```text
namespace != value unit
namespace != permission unit
namespace != version unit
namespace != conflict unit
namespace != replacement unit
namespace != transaction unit
namespace != lifecycle authority
```

### 4.2 Collection Is Derived, Not Independently Created

v1 不存在独立 NamespaceRegistry，也不提供：

```text
createNamespace()
deleteNamespace()
```

一个 Collection 在 logical index 中存在，当且仅当该 namespace 下至少存在一个 materialized Record。

例如当前：

```text
player/profile
player/economy
inventory/main
```

则可发现 Collections：

```text
player
inventory
```

第一次成功写入：

```text
quest/main-story
```

会 materialize 该 Record，并使 `quest` Collection 自然出现在之后的 index snapshot 中。

因为 v1 没有 dematerialize Record 的操作，所以一个已经出现的 Collection 在当前 Session 中不会因为 `put(null)` 消失。

### 4.3 Collection Membership Is Observational, Not Transactional

Collection membership / Collection index 是 **observational discovery metadata**。

Realm State v1 不提供：

```text
Collection version
Collection OCC condition
"Collection still contains exactly these Records" predicate
Collection membership lock
Collection-wide conflict domain
```

因此：

```text
list({ namespace: "quest" }) @ revision 100
```

只证明 revision 100 时 `quest` Collection 的 materialized membership 是该 snapshot 所示集合；它不保证之后某个 `commit()` 时没有新的 `quest/*` Record 被其他 Runtime materialize。

如果业务 correctness 真正依赖“成员集合本身没有变化”，业务 SHOULD 把该 membership/invariant 显式建模成普通 Record，例如：

```text
quest/index
```

并让该 Record 的 version 进入普通 OCC conditions。Realm State core 不把 Collection membership 隐式升级为第二套 version/conflict 系统。

### 4.4 Record

```ts
interface RealmStateKey {
  readonly namespace: string;
  readonly key: string;
}
```

Record 是：

```text
read unit
write/replacement unit
version unit
conflict unit
```

例如：

```text
player/profile
player/economy
inventory/main
quest/main-story
world/flags
```

### 4.5 Transaction

Transaction 是 atomicity unit，并 MAY 跨 Collection：

```text
player/economy
+
inventory/main
+
quest/shopping-tutorial
```

必须 all-or-nothing。

Collection 不限制 transaction 边界，也不形成额外 OCC condition。

---

## 5. Namespace / Key Grammar

### Namespace / Collection Identifier

```text
MUST be non-empty
MUST be a valid Unicode scalar-value string
UTF-8 encoded length MUST be <= 64 bytes
MUST NOT contain '/'
MUST NOT contain U+0000..U+001F
MUST NOT contain U+007F
```

### Record Key

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

`namespace/key` 是 canonical human-readable Record notation；禁止 `/` 避免 Collection name 或 Record key 被误读为额外层级。

上述 grammar 是 logical contract，不要求每次 `read()` / `commit()` / `subscribe()` 都重新 UTF-8 encode 与扫描同一个已验证字符串。实现 MAY intern/cache 已验证的 `RealmStateKey` identity，或投影为内部 canonical token / RecordId；只要 author-visible identity 与跨 trust boundary validation semantics 保持不变即可。

跨越不可信 carrier / process boundary 时，接收侧仍 MUST 验证 wire representation；但在同一 trusted implementation 内，已验证 representation MAY 被复用，MUST NOT 因分层而强制重复执行等价 key grammar validation。

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

因此 Collection membership 也不会因为 `put(null)` 消失。

### Deep-equal Put

成功 `put` 即使与当前 value deep-equal，也仍然是一次 authoritative write：

```text
record version + 1
global revision + 1
publish committed change
```

Record version 表达 successful authoritative writes，而不是“值的语义差异次数”。RealmStateAuthority 不引入 author-visible deep-equality/no-op policy。

---

## 7. Materialization / Collection Index

一个 Record 满足以下任一条件即 materialized：

```text
1. Game Entry 显式声明 initial record；
2. Load Game sparse current seed 显式包含该 record；
3. Runtime 至少一次成功 commit 写入该 record。
```

`read(unknownKey)` MUST NOT materialize Record，也不得让其 namespace Collection 出现在 index 中。

Collection existence 是 materialized Record membership 的派生视图：

```text
Collection exists in index
    ⇔ at least one materialized Record has that namespace
```

Collection 自身没有独立 storage object 或 authority metadata。

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

Game Entry 声明的是 Records，而不是 Namespace objects。Namespace/Collection 由这些 Records 的 `namespace` 字段自然形成。

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

Namespace/Collection 不拥有 version。

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

`encoded JSON size` 按 logical protocol 的 UTF-8 JSON payload 计算；物理 carrier 不得绕过限制。精确 canonical encoding/size accounting 与 nesting-depth accounting 由 formal protocol contract 冻结。

正式 size/depth contract SHOULD 定义可由 streaming / one-pass traversal 等价计算的 logical byte/depth semantics；MUST NOT 把“先构造完整 canonical JSON string / byte buffer”本身规定为 correctness requirement。实现 MAY 在遍历期间累计 encoded size，并在超过 hard limit 后立即停止。

`list()` v1 不分页。materialized Record 数和 namespace/key size 已有 hard bound，因此全量 Collection index 响应天然有界。

达到 materialized Record 上限后：

```text
first-write to a new key
    → LIMIT_EXCEEDED / known no-commit

write to an existing Record
    → not rejected merely because record-count limit is reached
```

v1 不单独限制 Collection 数；Collection 数天然不可能超过 materialized Record 数。

---

## 11. Launcher PREPARE / Session Bootstrap

PREPARE：

```text
read game.json
→ validate GameEntryV1 including optional state
→ validate namespace/key grammar / JsonValue / capacity limits
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
→ derive materialized Collection membership
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
    options?: {
      readonly namespace?: string;
      readonly signal?: AbortSignal;
    }
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

所有 live Runtime-scoped clients 可访问任意 valid Collection/Record；v1 没有业务 ACL。

### 13.1 Subscription Handle Visibility

`subscribe()` establishment 在 Authority 上仍按 §18 的 atomic linearization 完成，但 author API 还必须保证：

```text
subscription established
→ Promise resolves with RealmStateSubscription handle
→ only then may listener receive baseline
→ then subsequent changes
```

也就是 **subscription handle MUST become observable before the first listener callback**。这样 listener 在 baseline callback 内安全调用 `subscription.close()` 不会遇到 handle 尚未返回的 race。

---

## 14. Consistent Read

```ts
interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

`read()` 使用完整 `(namespace,key)` Record identities。

多 key `read()` MUST 来自一个 logical revision。返回的 `JsonValue` MUST detached / immutable。

Collection 只组织 Records，不改变 `read()` 的 snapshot/Record semantics。

Authority 内部 MAY 通过 immutable authoritative value references 构造 logical snapshot，而不是在 serialized authority step 内 deep-clone 每个 value。Author-visible / cross-boundary representation 仍 MUST 满足 detached / immutable semantics；物理 binding MAY 在 authority step 外完成必要 clone/encoding。

---

## 15. Collection Index / `list()`

`list()` 是 Realm State 的 Collection/Record **discovery API**。

### 15.1 Index Shape

```ts
interface RealmStateIndexRecord {
  readonly key: string;
  readonly version: number;
}

interface RealmStateCollectionIndex {
  readonly namespace: string;
  readonly records: readonly RealmStateIndexRecord[];
}

interface RealmStateIndexSnapshot {
  readonly revision: number;
  readonly collections: readonly RealmStateCollectionIndex[];
}
```

Index 不返回：

```text
initialValue
current value
```

它只表达：

```text
which materialized Collections exist
which materialized Record keys exist in each Collection
current version of each Record at the index snapshot revision
```

### 15.2 Full Discovery

```ts
await state.list();
```

返回当前 revision 下所有 materialized Collections，例如：

```text
revision = 100

inventory
    main          @ version 8

player
    economy       @ version 5
    profile       @ version 2

quest
    main-story    @ version 4
    side-001      @ version 1
```

### 15.3 Collection-filtered Discovery

```ts
await state.list({ namespace: "quest" });
```

只返回 `quest` Collection 在该 revision 下的 materialized Records。

如果指定 namespace 当前没有 materialized Record：

```ts
{
  revision: N,
  collections: []
}
```

v1 不制造 empty Collection object，因为 Collection existence 由 materialized Records 派生。

### 15.4 Consistency

无论 full list 还是 namespace-filtered list，结果 MUST 来自一个 global revision。

Authority 不得一边遍历 Collection/Record index、一边接受 commit，最后返回混合 revision 的索引。

### 15.5 Discovery Snapshot, Not Transactional Scan

`list()` 是 point-in-time discovery snapshot，不是 transactional Collection scan。

例如：

```text
list({ namespace: "quest" }) @ revision 100
→ choose discovered Record keys
→ concurrent commit materializes quest/side-002 @ revision 101
→ read(previously-selected keys) @ revision 101
```

这是合法的。`list()` 与之后的 `read()` 不要求来自相同 revision。

因此：

```text
list(namespace)
+ read(discoveredKeys)
!= atomic Collection key-set + value snapshot
```

适合使用 `list()` 的场景：

```text
Save discovery
tooling / diagnostics
UI discovery
finding dynamic Records
```

单独依赖 `list()` **不足以**表达：

```text
"the Collection still contains exactly these Records"
"no new Record has appeared"
collection-wide transactional invariant
```

这类业务 invariant SHOULD 通过普通 versioned Record 显式建模，而不是给 Collection index 隐式增加 OCC semantics。

### 15.6 Canonical Ordering

```text
collections:
    namespace ascending by unsigned lexicographic UTF-8 byte comparison

records inside each Collection:
    key ascending by the same comparison
```

不得使用 locale-sensitive ordering 定义 contract order。

该顺序仅用于 deterministic presentation、tests、diagnostics 与 serialization stability，不赋予业务优先级。

### 15.7 Save Discovery

```text
list()
→ discover Collections + materialized Record keys
→ persistence policy selects subset
→ reconstruct RealmStateKey(namespace,key)
→ read(selectedKeys)
→ serialize selected current values
```

Save 流程接受 `list()` 与后续 `read()` revision 可能不同；如果未来 persistence consumer 要求 exact key-set + values 同 revision capture，应基于真实需求设计独立 snapshot/capture 能力，而不是让普通 `list()` 承担 MVCC handle 语义。

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
condition Record identities are unique
write Record identities are unique
every write Record appears exactly once in conditions
writes MAY be a strict subset of conditions
```

因此 read-only dependency 可以只出现在 conditions 中。

Transaction MAY 跨多个 Namespace Collections；Collection 不形成额外锁或 conflict domain。

以下均 invalid：

```text
empty conditions
empty writes
condition-only commit
duplicate condition Record
duplicate write Record
write Record absent from conditions
```

Authority validation order：

```text
1. request structural shape
2. namespace/key grammar
3. JsonValue validity
4. count / byte / depth limits
5. condition/write identity uniqueness
6. verify write-set ⊆ condition-set
7. compare Record versions
8. atomic commit
```

非法请求 MUST 在 version comparison 前 reject，不得映射成 `CONFLICT`。

### 16.1 Validation Ownership / Trusted Internal Representation

上述 validation order 定义的是 **logical admission requirements**，不是要求 SDK、transport adapter、Host binding 与 RealmStateAuthority 对同一可信对象各自完整重跑一遍等价 validation。

每个 physical trust boundary MUST 有明确 validation owner：

```text
untrusted / author-owned input
    ↓
validation owner
    ↓
trusted validated representation
    ↓
Authority admission / execution
```

实现 MAY 将合法输入投影成内部表示，例如：

```text
ValidatedRealmStateKey / interned RecordId
ValidatedJsonValue
ValidatedRealmStateTransaction
```

只要该 representation 不能被未经验证的 caller mutation 篡改，并且跨不可信 carrier 后由接收侧重新建立 trust，Authority MAY 直接消费它，而不重新执行同一套 Unicode scan、UTF-8 length calculation、JsonValue deep validation、size/depth traversal 或 detachment。

对于 transaction write value，JsonValue validity、nesting depth、encoded-size accounting 与 detached immutable representation construction SHOULD 在一个 bounded traversal 中融合完成；contract 不应要求：

```text
validate JsonValue
→ second pass calculate depth
→ third pass calculate size
→ fourth pass clone
→ fifth pass freeze
```

只要 observable validation result 等价，实现 MAY one-pass validate + count + detach，并在发现 invalid / over-limit 后提前终止。

### 16.2 Authority Serialized Fast Path

RealmStateAuthority 必须线性化 condition check + all writes，但该 serialized logical step SHOULD 尽量只包含 authority-sensitive metadata/reference work：

```text
lookup validated Record identities
compare observed versions
atomically replace immutable value references
materialize Record / update derived Collection membership
allocate revision / Record versions
capture result / subscription notification references
```

以下工作 SHOULD 在进入该 serialized step 前或离开后完成，只要不改变 observable semantics：

```text
Unicode / key grammar scanning
JsonValue deep validation
size / depth accounting
detach / immutable representation construction
JSON / wire serialization
canonical result sorting
physical transport copy
subscription listener delivery
```

尤其 MUST NOT 因“分层实现”而把同一个已经验证、不可变的 JsonValue 在 SDK → binding → Authority 每一层重复 deep-clone / deep-validate。

Authority serialized step 的短路径要求是实现/qualification 性能约束，不改变 invalid request MUST 在 mutation admission 前被拒绝的 correctness rule。

Atomic authority step：

```text
validated request
→ compare every condition.version against one current authority state
→ any mismatch: CONFLICT / zero write
→ atomically replace every write target current value
→ materialize newly-written Records
→ update derived Collection membership if a namespace first appears
→ assign one fresh global commit revision
→ assign fresh version to every write target
→ publish one committed change
```

普通 transaction 使用 per-record version 做 conflict detection；global revision 不作为默认全局条件；Namespace/Collection membership 不参与 OCC。

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
    malformed namespace/key/value/transaction shape
    known no-commit

LIMIT_EXCEEDED
    exceeds v1 hard bound
    known no-commit

CONFLICT
    request valid but observed Record version stale
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
      readonly reason: "binding-terminal" | "overflow";
    };
```

Subscription 按显式 `RealmStateKey[]` 订阅已知 Records；v1 不增加“订阅整个 namespace Collection”的隐式 wildcard 语义。

因此一个 subscription 建立后，新 materialize 的同 namespace Record **不会因为 Collection membership 而自动匹配该 subscription**。

如果业务需要实时观察动态 membership，业务 SHOULD 订阅自己显式维护的普通 index Record；v1 不为此增加 Collection-level observer/version system。

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
1. validate subscription Record keys
2. capture baseline snapshot at revision N
3. register observer whose lower bound is strictly after N
4. release authority serialization
```

这里的 `validate subscription Record keys` 同样遵守 §16.1 validation ownership：若 binding 已从可信 validated representation 建立 subscription request，Authority 不需要重新执行等价 grammar scan；serialized step 只需确认 authority-local lifecycle/identity/state 条件。

这定义 subscription establishment linearization point。

即使 revision `N+1` 在 baseline 物理传输完成前就已 commit，binding 也必须保存/缓冲该 relevant change；author API 必须先使 subscription handle 可观察，再交付 baseline，然后才按顺序交付这些 post-baseline changes。

Delivery invariant：

```text
Promise resolves with subscription handle before first listener callback
first listener event MUST be baseline @ N
all subsequent change revisions MUST be > N
change revisions MUST be monotonically increasing
all relevant commits after N MUST be delivered unless subscription terminals/closes
unrelated commits MAY cause revision gaps
```

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
→ old subscription terminal(reason = binding-terminal)
→ reconnect
→ fresh subscribe
→ fresh baseline @ current revision
```

因此 v1 的恢复模型是 **state resynchronization**，不是 event replay。

### 18.5 Close

`subscription.close()` 是 author-initiated observation teardown，不影响 Realm State authority。

固定：

```text
close() is idempotent
close() performs local subscription teardown
once close() returns, listener MUST NOT be invoked again
close() does NOT emit terminal("closed")
closed subscription identity MUST NOT be reactivated
```

`terminal` event 只表示非 caller 主动请求导致的 subscription loss，例如 `binding-terminal` 或 `overflow`。

---

## 19. No Authorization Layer in v1

Realm State v1 不定义：

```text
namespace/Collection readers or writers
per-subsystem ACL
key-prefix policy
dynamic grants
state admin role
```

Namespace/Collection 是 discovery/organization boundary，不是 security boundary。

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
put(null)            != Collection membership removed
Runtime terminal     → its RealmStateClient terminal
Session terminal     → RealmStateAuthority terminal
RealmStateAuthority fatal → Session terminal
```

Collection 没有独立 lifetime；其可见存在性由 Session 内 materialized Records 派生。

v1 不设计 transparent authority restart / journal replay / client reattach。

---

## 21. Communication Placement

Realm State SHOULD 使用独立 logical protocol，例如：

```text
loomrealm.realm-state/1
```

协议至少表达：

```text
consistent Record read
Collection/index list with optional namespace filter
conditional Record commit
validation / limit / conflict / outcome evidence
atomic subscription baseline establishment
ordered subscription changes / terminal
client / authority terminal
```

Logical protocol MUST 定义 validation semantics，但 MUST NOT 要求每一层 carrier adapter 重复执行同一 semantic deep validation。每个不可信边界的接收侧负责建立新的 trusted representation；之后可沿 trusted internal path 复用。

不得塞进 renderer-data、Runtime Control 或 `frame.call()`。

---

## 22. Interaction with Main / Renderer / Content

Main 不持有具体 State Collections/Records，也不解释 namespace/value/initialValue。

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
→ discover materialized Collections + Records
→ persistence policy selects subset
→ read(selected RealmStateKeys)
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
Collection/Record identity
Collection discovery semantics
snapshot consistency
OCC semantics
hard limits
validation ownership / trusted representation semantics
commit evidence
subscription linearization
subscription terminal / fresh-resubscribe semantics
```

同进程 realization MAY 复用 validated immutable references / interned Record identities；跨 Worker/Process realization MAY 在 carrier decode boundary 重新验证并 detach。二者不要求拥有相同 validation pass 数量，只要求 observable validity、limits 与 authority semantics 等价。

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
Namespace as derived Record Collection
Collection existence derived from materialized Records
Collection membership observational, not transactional
no NamespaceRegistry / createNamespace / deleteNamespace
explicit namespace/key grammar / hard limits
validated key intern/cache allowed
one-pass JsonValue validate + size/depth + detach allowed
trusted validated request representation across internal layers
one RealmStateAuthority per Session
bootstrap-before-runtime barrier
materialized Record index
list() full Collection index
list({ namespace }) Collection-filtered index
list() as discovery snapshot, not transactional Collection scan
consistent deterministic Collection/Record index ordering
whole-record put
successful deep-equal put advances version/revision
consistent multi-key read
strict transaction shape validation
OCC read-set Record-version conditions
write-set ⊆ read-set
atomic multi-record / cross-Collection commit
short serialized authority commit path
explicit INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT / TERMINAL / OUTCOME_UNKNOWN
commit() without AbortSignal / remote cancellation
no automatic mutation retry
atomic subscription baseline + observer establishment
subscription handle observable before baseline callback
ordered relevant Record changes
no namespace wildcard subscription
subscription overflow/disconnect → terminal
close() idempotent, no post-close callback
fresh subscribe + fresh baseline recovery
Runtime-scoped RealmStateClient
RealmStateAuthority fatal → Session terminal
Desktop in-process authority + explicit transport seam
```

延后 / 不实现：

```text
independent NamespaceRegistry
empty namespace objects
namespace value/version/transaction/lifecycle
Collection membership version / predicate lock
namespace ACL / security boundary
namespace wildcard subscription
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
- existing GameEntryV1 without state remains valid after formal contract update
- optional state validates as part of GameEntryV1 after formal contract update
- invalid/duplicate/oversized initial Records reject during PREPARE
- State is READY before first business Runtime side effect

Namespace Collection / Index
- namespace is a Collection identifier, not merely an opaque repeated field
- Collection exists in index iff at least one materialized Record belongs to it
- no independent namespace creation/registry is required
- first successful write into a new namespace makes that Collection discoverable
- read of unknown Record does not create Record or Collection
- put(null) does not remove Record or Collection membership
- list() returns all materialized Collections at one revision
- list({ namespace }) returns only that Collection at one revision
- missing Collection filter returns collections: []
- Collection ordering and per-Collection Record ordering are canonical UTF-8 byte order
- Collection membership is not accepted as an OCC condition
- list()+read is not treated as atomic Collection scan

Key / Limits
- exact grammar behaves identically across platforms
- no hidden trim/case-fold/Unicode normalization
- value/request/session hard limits are enforced
- repeated use of an already validated key may use intern/cache without changing identity semantics

Validation / Hot Path
- each untrusted boundary has a clear validation owner
- trusted internal representation cannot be mutated by the original caller after validation
- implementation is not required to repeat equivalent key/JsonValue deep validation at SDK, binding and Authority layers
- JsonValue validity + depth + size + detach may be implemented in one bounded traversal
- size accounting can be performed without materializing a full canonical JSON byte buffer
- Authority serialized commit step does not perform avoidable JSON serialization / listener delivery
- same-process immutable stored values may be snapshot by reference internally while preserving detached author semantics

Initial / Load
- new game current = initialValue
- initialValue cannot mutate
- Save-present key overrides current
- Save-absent key falls back to current Game initialValue
- Save-present null remains explicit null
- new loaded Session revision/version start at 0

Materialization
- Game initial / Load seed / successful first write materialize Records
- read unknown key does not materialize
- put(null) does not dematerialize

Read / Transaction
- multi-key read is one consistent revision
- malformed transaction rejects before version comparison
- every write target has exactly one observed-version condition
- stale condition → CONFLICT + zero write
- writes are all-or-nothing across Collections
- deep-equal successful put advances version/revision

Commit Evidence
- commit API exposes no remote cancellation
- explicit pre-commit rejection is known no-commit
- dispatch followed by lost definitive result produces OUTCOME_UNKNOWN
- neither CONFLICT nor OUTCOME_UNKNOWN is automatically retried

Subscription
- establishment captures baseline and registers observer atomically
- Promise resolves with subscription handle before baseline callback
- baseline is delivered before buffered post-baseline changes
- no relevant subscribed-Record commit can be silently lost
- newly materialized same-Collection Record is not implicitly subscribed
- change revisions are monotonically increasing
- one transaction maps to at most one change event per subscription
- unrelated commits may create revision gaps
- slow-consumer overflow terminals instead of dropping changes
- disconnect terminals old subscription
- close() is idempotent and prevents future listener invocation after return
- reconnect uses fresh subscribe + fresh baseline
- no replay/cursor is required for v1

Lifetime / Failure
- Runtime terminal terminates its client/subscriptions
- RealmStateAuthority fatal terminates Session
```

---

## 27. Formal Contract Closure Checklist

以下项目 **不改变 Realm State core architecture semantics**，但正式 `loomrealm.realm-state/1` / `@loomrealm/subsystem` author contract MUST 在实现前冻结：

```text
Observation request shape
- read([]) 是否合法
- duplicate read Record identities 如何处理
- subscribe([]) 是否合法
- duplicate subscription Record identities 如何处理

Returned-array ordering
- RealmStateSnapshot.records canonical ordering
- RealmStateCommit.records canonical ordering
- subscription change.records canonical ordering

Numeric representation
- revision/version 的 exact integer representation bound
- invalid/overflow representation handling

JsonValue bound accounting
- single-value encoded-size canonical calculation
- transaction total payload-size canonical calculation
- nesting-depth exact counting rule
- accounting semantics MUST allow equivalent streaming/one-pass implementation

Wire/API errors
- public error object shape
- stable category serialization
- structural path / diagnostics boundary

Validation / trusted representation
- each carrier/trust boundary 的 validation owner
- validated key/value/request internal representation ownership
- caller mutation isolation / detachment point
- equivalent semantic validation MUST NOT be required repeatedly inside one trusted path

Transport/profile realization
- bounded subscription queue profile
- Load current-seed total resource bound
```

这些项目属于 formal contract / profile / qualification closure，不应被重新解释为需要扩张 Realm State authority model 的架构缺口。

---

## 28. Contract Synchronization Work

架构结论已经要求后续正式同步：

```text
Game Package v1
    closed schema 增加 optional state
    RealmStateGameDefinitionV1 / initial Record validation

Subsystem author contract
    SubsystemScope.state
    RealmStateClient / subscription surface

Realm State logical protocol
    read / list / commit / subscribe / terminal / evidence
    validation owner / validated internal representation seam

Launcher / Platform Composition
    prepared State projection
    State bootstrap barrier

Hostra / PWA
    equivalent logical semantics + limits + failure behavior
    platform-appropriate validation/copy strategy
```

在这些 normative contract 完成前，本文仍不得被解释为“功能已经实现”。

---

## 29. 已关闭、不再开放的核心设计问题

```text
namespace semantic role
    = Record Collection / organization + discovery boundary

namespace is independent authority object
    = no

namespace has value/version/conflict/transaction/lifecycle
    = no

namespace requires predeclaration / registry
    = no

createNamespace() / deleteNamespace()
    = no

Collection existence
    = derived from materialized Record membership

Collection membership participates in OCC
    = no

Collection index is transactional set predicate
    = no

list() can filter one namespace Collection
    = yes

list() index shape
    = Collection -> Record key/version

list()+read is atomic Collection key-set/value snapshot
    = no

namespace wildcard subscription
    = no

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

record is version/conflict/replacement unit
    = yes

transaction may span namespace Collections
    = yes

field-level patch
    = no

read unknown key materializes it
    = no

put(null) dematerializes Record
    = no

deep-equal successful put is no-op
    = no

empty / condition-only / duplicate-key transaction allowed
    = no

Collection/Record index order unspecified
    = no; canonical UTF-8 byte ordering

protocol limits implementation-defined/unbounded
    = no

validation must be repeated independently in SDK/binding/Authority
    = no; one owner per trust boundary + trusted internal representation

key grammar requires UTF-8 re-encoding on every operation
    = no; validated identity may be interned/cached

JsonValue validity/size/depth/detach require separate traversals
    = no; equivalent one-pass implementation allowed

Authority serialized commit step should include serialization/listener delivery
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

subscription handle may be unavailable during first callback
    = no

subscription may silently drop changes on overflow
    = no

close() may continue invoking listener after return
    = no

v1 subscription reconnect replays history
    = no

reconnect uses fresh baseline
    = yes

business Runtime may start before Realm State initialization
    = no
```

---

## 30. Final Invariants

1. Main 唯一拥有 Control Authority；Realm State 唯一拥有 Session shared mutable business facts；
2. Namespace 是一等的 **Record Collection / organization + discovery boundary**；Key 是该 Collection 内的 Record identifier；
3. Namespace/Collection 不拥有 value、version、conflict、replacement、transaction、ACL 或独立 lifecycle；
4. Collection existence 由 materialized Record membership 派生；v1 不存在 NamespaceRegistry、`createNamespace()` 或 `deleteNamespace()`；
5. Collection membership 是 observational discovery metadata，不参与 OCC，也不提供“成员集合未变化”的 transactional predicate；
6. `(namespace,key)` Record 是 replacement/version/conflict unit；Transaction 是 atomicity unit，并可跨 Collection；
7. RealmStateKey 使用 exact、case-sensitive、no-normalization identity，并受明确 UTF-8 hard bounds；validated identity MAY 被 intern/cache，不要求每次操作重新编码/扫描；
8. 每个 key 有 immutable `initialValue` 与 mutable current value；缺失 initial key → `initialValue = null`；
9. GameEntryV1 `state` optional，不因 Realm State 升级 document version；
10. 每个新 Session 的 revision/version 从 0 开始；Load 不继承旧 Session concurrency metadata；
11. Materialization 只来自 explicit initial、explicit load seed 或 successful write；read unknown key 不 materialize Record/Collection；
12. `put(null)` 不 dematerialize Record，也不移除 Collection membership；
13. `list()` 返回一致 revision 的 Collection → Record key/version discovery index，可选择 namespace filter，并按 canonical UTF-8 byte order 排序；
14. `list()` 不是 transactional Collection scan；`list()` + 后续 `read()` 不保证 key-set 与 values 同 revision；
15. 所有 key/value/request/session resource 均受明确 hard limits；精确 wire size/depth accounting 属 formal contract closure，并必须允许等价 streaming/one-pass counting；
16. `read(keys)` 使用完整 Record identities，并返回一致 logical snapshot；内部 MAY capture immutable refs，author-visible representation 仍须 detached/immutable；
17. 每个 write target 必须且只能有一个 caller-observed Record version condition；Authority 原子执行 condition check + all writes；
18. semantic validation 在每个不可信边界必须有明确 owner；trusted validated representation MAY 沿内部路径复用，不要求 SDK/binding/Authority 重复等价 deep validation；
19. JsonValue validity、depth、size accounting 与 detach SHOULD 可融合为 bounded traversal；Authority serialized mutation path SHOULD 只承担 authority-sensitive metadata/reference work；
20. stale condition → `CONFLICT` + zero write；successful deep-equal put 仍推进 version/revision；
21. `commit()` 不提供 remote cancellation；dispatch 后失去确定结果 → `OUTCOME_UNKNOWN`；不得自动 retry；
22. v1 不提供 mutation ID/dedup/status journal；
23. Subscription establishment 原子绑定 baseline revision 与后续 observer；author handle 必须先于第一条 callback 可观察；
24. Subscription 只观察显式 Record identities，不隐式观察 Collection membership；
25. Subscription 只交付 ordered committed Record changes；revision 可因 unrelated commits 跳号；
26. Overflow/disconnect 必须 terminal subscription，不得 silent drop；恢复使用 fresh subscribe + fresh baseline；
27. `subscription.close()` idempotent；返回后不得再次调用 listener；主动 close 不产生 terminal("closed")；
28. Realm State v1 不提供业务 ACL；live Runtime-scoped client 可 read/list/commit/subscribe；
29. Runtime terminal 终止其 client/subscriptions；RealmStateAuthority fatal → Session terminal；
30. Realm State 必须在第一项 business Runtime side effect 前 READY；
31. Hostra/PWA physical realization 可不同，包括 validation/copy pass 数量不同，但上述 Collection/Record semantics、hard limits、validation outcome、commit evidence 与 subscription semantics 必须一致；
32. Formal contract checklist 中的 API/wire edge rules 必须在实现前冻结，但不得因此引入第二套 Collection authority/version/transaction model。

---

## 31. Architectural Summary

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

                    Realm State Collections
                    ───────────────────────
                    player
                      ├─ profile
                      └─ economy
                    inventory
                      └─ main
                    quest
                      └─ main-story

                    ┌─────────────┼────────────────┐
                    ▼             ▼                ▼
                read(keys)      list(...)      subscribe(keys)
                 snapshot      discovery         baseline @ N
                               index only           │
                                                    └→ ordered Record changes > N

Collection membership
    observational discovery metadata
    no version / OCC predicate / wildcard subscription

Author / carrier input
    │
    ▼
validation owner
    │  one-pass key/value/request validation
    │  detach + size/depth accounting
    ▼
trusted validated representation
    │
    ▼
RealmStateAuthority fast path
    lookup → version check → ref swap → revision/version
    │
    └→ serialization / delivery outside serialized authority step

                    local business computation
                              │
                   Record-version conditions
                        + write-set
                              │
                              ▼
                    atomic OCC commit
                    MAY span Collections
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
Namespace / Collection
    organization + discovery boundary
    derived from materialized Record membership
    observational, not transactional

Record key
    identifier inside one Collection
    may be validated/interned into trusted internal identity

Record (namespace,key)
    initialValue + current value + version
    replacement / conflict unit

Materialized Collection Index
    materialized Collections
      → materialized Record keys + versions
    one revision + deterministic order
    discovery snapshot only

Read Snapshot
    one revision + selected Record values + versions

Validation Boundary
    one semantic validation owner per trust boundary
    validated immutable representation reusable inside trusted path
    no required repeated deep validation across implementation layers

Transaction
    validated Record-version conditions + write-set
    multi-record / cross-Collection atomicity
    short serialized authority step

Subscription
    explicit Record identities only
    atomic baseline + observer registration
    handle-before-callback ordering
    ordered relevant committed Record changes
    fresh-baseline recovery
```

至此 Realm State v1 的 **core architecture semantics** 已闭合。下一阶段应转向 **formal contract closure、reference authority、Game Package/Subsystem contract synchronization、Launcher projection、Desktop binding 与 qualification**，而不是继续向 core 增加未被真实 consumer 证明必要的机制。