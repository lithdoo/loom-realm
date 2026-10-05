# Realm State：Session 级共享业务状态系统

> 层级：系统架构  
> 状态：Active / **Core Architecture Semantics Closed / Implemented**
> 稳定程度：**Implemented / Formal Contract Active / Requalification Pending**
> 主要定义：Session 级共享业务状态 authority、Namespace Record Collection、Game Entry 初始状态、immutable initial value、materialized Record discovery index、consistent snapshot、optimistic transaction、subscription linearization、commit evidence、validation ownership、生命周期与平台边界  
> 依赖：[系统架构总览](./system-overview.md)、[模块子系统模型](./subsystem-model.md)、[栈式运行系统](./stack-runtime-system.md)、[存储与内容系统](./storage-system.md)、[通信系统](./communication-system.md)、[Game Package v1](../15-contracts/game-package-v1.md)  
> 正式化：[Realm State v1](../15-contracts/realm-state-v1.md)  
> 最近复核：2026-10-05

本文定义 LoomRealm 的 **Realm State**：位于 `Main` 控制 authority 与各 `Subsystem Runtime` 局部业务状态之间的 **Session 级、跨 Subsystem、可变业务状态唯一 authority**。

这些冻结语义已落实到 Game Package、Realm State logical protocol、Subsystem author API、Hostra Launcher/Desktop 独立 State plane，以及 browser/Worker-compatible MessagePort realization；对应资格证据见 [Realm State v1 qualification](../30-implementation/realm-state-v1-qualification.md)。

Formal contract 已冻结并实现 API empty/duplicate input、canonical ordering、revision/version safe-integer bound、JsonValue encoded-size/depth 与 wire error semantics；这些规则仍由 formal contract 单一持有。

---

## 1. 核心结论

1. Realm State 是独立于 Main 的 Session Shared Business State Authority；
2. Realm State 初始业务值属于 platform-neutral Game Entry；
3. Game Package v1 尚未正式发布/freeze，因此当前直接增加 optional `state` 字段并继续使用 `formatVersion: 1`；历史 draft v1 shape 不构成兼容性承诺；
4. 缺少 `state` 的 Game Entry 继续合法，并等价于空 Realm State initial definition；
5. Realm State 必须在任何 business Runtime side effect 前初始化完成；
6. `namespace` 是 **Record Collection identifier**：负责组织与发现一组 materialized Records；`key` 是该 Collection 内的 Record identifier；
7. Namespace/Collection 不拥有 value、version、conflict、ACL、transaction 或独立 lifecycle；
8. Collection membership 是 **observational discovery metadata**，不是 OCC condition 或 transactional set predicate；
9. `(namespace,key)` Record 是读写、replacement、version 与 conflict 单位；
10. Transaction 是跨 Record 的原子提交单位，并 MAY 跨 Collection；
11. Collection 不需要预创建；不存在 NamespaceRegistry、`createNamespace()` 或 `deleteNamespace()`；Collection existence 由 materialized Records 派生；
12. v1 使用 whole-record replacement，不提供 field-level patch；
13. Authority 为每个 logical key 持有 immutable `initialValue` 与 mutable current `value`；普通 `read()` 只返回 current projection，initial baseline 通过独立 `readInitial()` 按需读取；
14. Game Entry 未声明 key 时 `initialValue = null`；Session bootstrap 时 current `value = initialValue`；
15. 每个新 Session 的 global revision 与所有 Record version 从 `0` 开始；Save/Load/restore 不拥有特殊 concurrency metadata bootstrap 语义，运行期恢复只是普通 commit；
16. 多 key `read()` 返回同一 logical snapshot；`readInitial()` 读取 Session 内 immutable baseline，不携带 current revision/version；
17. mutation 使用 optimistic concurrency control（OCC）：read-set Record version conditions + atomic write-set；
18. 每个 write target MUST 出现在 conditions 中；read-only business dependencies MAY 同样进入 conditions；
19. stale condition → `CONFLICT` + zero write；
20. v1 不提供跨 Runtime 长事务锁，也不自动 retry business transaction；
21. Realm State v1 不提供 Subsystem / namespace / key 业务 ACL；
22. `list()` 是 Collection/Record discovery API，可枚举全部 materialized Records，或只枚举指定 namespace Collection 内的 Records；
23. `list()` 返回一致 revision 的扁平 `(namespace,key,version)` discovery index，不返回业务 value，也不是 transactional Collection scan；
24. `scan()` 返回同一 revision 的 materialized membership + current values + versions；它是 potentially expensive exceptional operation，而不是 hot-path query；
25. Subscription 只观察显式已知 `RealmStateKey` Records；v1 不提供 namespace wildcard subscription；
26. Save/Load/restore 是 game/product business workflow：Save 使用普通 observation，Load/restore 使用普通 `RealmStateClient.commit()`；Realm State 不提供 Load seed/sparse bootstrap override；
27. RealmStateAuthority fatal 是 **Session-fatal fact**；Authority 只报告该 fact，**Main 唯一提交 Session terminal 与 Runtime/Frame failure unwind**；Platform/Session composition 只负责 wiring；
28. Key grammar、capacity limits、transaction shape、deep-equal write、discovery index ordering 均为已确定架构方向；
29. 一个 logical request 的 semantic validation MUST 有明确 owner；实现 MAY 将已验证 key/value/request 投影为 trusted internal representation，并避免在 SDK / transport adapter / Authority 间重复执行等价 deep validation；
30. Authority serialized commit step SHOULD 保持为 Record lookup、version comparison、atomic reference replacement、revision/version allocation、materialization/index metadata update 等短路径；serialization、deep clone、canonical sorting 与 listener delivery SHOULD 在该 serialized step 外完成；
31. 成功 `commit()` 只返回 commit evidence + 新 concurrency metadata，不重复回传 caller 已提交的 value；
32. Subscription 采用 authority 原子 baseline + observer registration；断线/overflow 后 fresh subscribe，不提供 replay cursor；listener delivery 属 Runtime-local callback execution，不是 Authority execution；
33. `commit()` 不支持 remote cancellation；一旦 dispatch，结果丢失时使用 `OUTCOME_UNKNOWN`，不得自动 retry；
34. exactly-once business intent / ambiguous outcome reconciliation MAY 由业务使用普通 operation-marker Record 建模；v1 不引入 transaction ID、dedup journal、status query 或 generic transaction coordinator；
35. `RealmStateClient` 是 Runtime-scoped **logical capability**；Realm State operations 不创建、消费或验证 Frame / Activation / InputTarget authority，`state.commit()` 不受 Frame mutation gate 支配；
36. physical Realm State binding 可在 Runtime 存活期间替换，不定义 `RealmStateClient` identity；binding loss 终止旧 binding/其 subscriptions，但不自动终止 logical client、Runtime 或 Session；
37. Realm State 只承载真正需要成为 **Session 范围跨 Subsystem 唯一业务真相** 的事实，不作为 local task state、Render/Input cache、platform state、Content definition、Save/Load workflow 或 universal Redux store。

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

Session composition 可以在物理上构造、持有和清理 Main 与 RealmStateAuthority，但它只是 **composition/lifetime containment owner**，不得成为第三份 application authority：

```text
Session composition
    MAY construct sibling authorities
    MAY wire fatal/terminal signals
    MAY own physical disposal

Session composition
    MUST NOT interpret Main Frame/Activation state
    MUST NOT interpret Realm State business values
    MUST NOT create a second Session/business/control state machine
```

RealmStateAuthority 检测到无法继续维持自身 invariant 时：

```text
RealmStateAuthority detects fatal
→ report Session-fatal fact through a narrow platform-wired sink
→ Main receives the fact
→ Main commits Session terminal + Runtime/Frame failure unwind
```

RealmStateAuthority MUST NOT 直接拥有 Runtime/Frame unwind、Renderer currentness 或 Main Session transition。Platform / Session composition MAY physically carry the signal，但 MUST NOT become another Session terminal owner。

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

### 3.1 State Placement Rule

一个事实进入 Realm State 的充分理由是：

> **它需要成为同一 Session 内跨 Subsystem 共享、可变、authoritative 的业务真相，并且需要由 Record version / OCC / subscription 等 State semantics 协调。**

典型适合：

```text
player global attributes
party / inventory
quest flags / progression
world/session business flags
economy
cross-Subsystem business metadata
```

默认不应进入 Realm State：

```text
Frame / Stack / Activation / InputTarget
Runtime lifecycle / failure state
Renderer currentness / Data generation/profile
Input retained state / Interest Registry
RenderDomain state / animation / presentation state
Subsystem-local task progress
local caches / derived projections
transport connectivity / endpoint / credential
Platform configuration / executable binding
immutable Content definitions/resources
Save-slot / persistence policy / Save-Load workflow
```

`Subsystem local state != automatically Realm State`。如果一个事实只被单个 Subsystem 的局部执行需要，或者可以从其他 authority 派生，就应保留在其原 owner，而不是为了“方便共享”升级进 Realm State。

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
Load seed / sparse persistence bootstrap override
transparent authority restart/recovery
universal application store / service locator
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

一个 Collection 可被发现，当且仅当该 namespace 下至少存在一个 materialized Record。

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

会 materialize 该 Record，并使 `quest` Collection 自然成为之后 discovery index 中可发现的 namespace。

因为 v1 没有 dematerialize Record 的操作，所以一个已经出现的 Collection 在当前 Session 中不会因为 `put(null)` 消失。

### 4.3 Collection Membership Is Observational, Not Transactional

Collection membership / discovery index 是 **observational discovery metadata**。

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

只证明 revision 100 时返回的 `quest/*` materialized Records 是该 discovery snapshot 所示集合；它不保证之后某个 `commit()` 时没有新的 `quest/*` Record 被其他 Runtime materialize。

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

上述 grammar 是 logical contract，不要求每次 `read()` / `readInitial()` / `commit()` / `subscribe()` 都重新 UTF-8 encode 与扫描同一个已验证字符串。实现 MAY intern/cache 已验证的 `RealmStateKey` identity，或投影为内部 canonical token / RecordId；只要 author-visible identity 与跨 trust boundary validation semantics 保持不变即可。

跨越不可信 carrier / process boundary 时，接收侧仍 MUST 验证 wire representation；但在同一 trusted implementation 内，已验证 representation MAY 被复用，MUST NOT 因分层而强制重复执行等价 key grammar validation。

---

## 6. Record Value Model

RealmStateAuthority 对每个 logical Record 内部拥有：

```text
initialValue
    current Game-defined immutable baseline

current value
    current Session mutable authoritative value

version
    current Record concurrency generation
```

Author-facing current observation 不重复携带 immutable baseline：

```ts
interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
  readonly version: number;
}
```

Initial baseline 使用独立 projection：

```ts
interface RealmStateInitialRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
}

interface RealmStateInitialSnapshot {
  readonly records: readonly RealmStateInitialRecord[];
}
```

Game Entry 未声明 key：

```text
initialValue = null
```

Session bootstrap：

```text
current value = initialValue
```

从未 materialize 的合法 key：

```text
read(key)
    value   = null
    version = 0

readInitial(key)
    value   = null
```

`readInitial()` MUST NOT materialize Record。Initial baseline 在一个 Session 内 immutable，因此 initial snapshot 不需要 global revision 或 Record version。

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

显式声明 initial `null` 与未声明 key 在 `readInitial()` 上都得到 `null`；它们只在 bootstrap materialization 上有差异。v1 不增加 `hasInitial()` / `listInitial()` 或另一套 Game Entry declaration-membership authority。

---

## 7. Materialization / Discovery Index

一个 Record 满足以下任一条件即 materialized：

```text
1. prepared Game baseline 显式声明该 record；
2. Runtime 至少一次成功 commit 写入该 record。
```

Persistence / Save / Load data 没有 privileged materialization path。业务从持久化数据恢复某个 Record 时，只有普通 successful `commit()` 才会 materialize 它。

`read(unknownKey)` 与 `readInitial(unknownKey)` MUST NOT materialize Record，也不得让其 namespace Collection 成为可发现 Collection。

Collection existence 是 materialized Record membership 的派生视图：

```text
Collection exists / is discoverable
    ⇔ at least one materialized Record has that namespace
```

Collection 自身没有独立 storage object 或 authority metadata。

---

## 8. Game Entry v1 Initial State

Game Package v1 尚未正式发布/freeze。Current pre-release contract 可以直接修改 `GameEntryV1` closed schema并继续使用 `formatVersion: 1`：

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

历史 draft v1 shape 不构成兼容性承诺，因此当前 optional `state` 不要求为了兼容未发布 draft 而创建 Game Entry v2、dual parser 或 deprecated alias。

Game Package v1 一旦正式 release/freeze，closed-schema structural addition/change 原则上 MUST 使用新的 `formatVersion`，除非已发布 contract 事先定义对应 extension mechanism。

Game Entry 声明的是 Records，而不是 Namespace objects。Namespace/Collection 由这些 Records 的 `namespace` 字段自然形成。

缺少整个 `state`：

```text
Realm State initial definition = empty
```

v1 只支持 Game Entry inline initial records；不支持 external file、Content-derived seed、streaming large-state loader。

`state` 与 `initial.input` 职责不同：

```text
state
    Game-level shared business baseline document

initial.input
    initial Frame invocation parameters
```

Game Package document representation **不是 RealmStateAuthority 的 bootstrap ABI**。Game Package 负责 document schema/validation；matching Launcher 在 PREPARE 中把 validated document State 投影为 Realm State-owned prepared bootstrap representation。Realm State core MUST NOT 依赖 `GameEntryV1`、`formatVersion`、`game.json` 或 Launcher manifest types。

Game Entry `state` 只定义 prepared Game baseline；Save/Load/restore data 不进入 Game Entry State，也不成为第二套 Authority bootstrap input。

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

Save/Load/restore 不重建或替换 RealmStateAuthority concurrency metadata。业务在运行期恢复持久化 current values 时，它们是普通 successful transactions，因此照常推进 global revision 与被写 Record version。

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
readInitial(keys) key count           <= 256
subscribe(keys) key count             <= 256
transaction conditions count          <= 128
transaction writes count              <= 128
transaction total payload             <= 2 MiB
```

`encoded JSON size` 按 logical protocol 的 UTF-8 JSON payload 计算；物理 carrier 不得绕过限制。精确 canonical encoding/size accounting 与 nesting-depth accounting 由 formal protocol contract 冻结。

正式 size/depth contract SHOULD 定义可由 streaming / one-pass traversal 等价计算的 logical byte/depth semantics；MUST NOT 把“先构造完整 canonical JSON string / byte buffer”本身规定为 correctness requirement。实现 MAY 在遍历期间累计 encoded size，并在超过 hard limit 后立即停止。

`list()` v1 不分页。materialized Record 数和 namespace/key size 已有 hard bound，因此全量 discovery index 响应天然有界。

`scan()` v1 同样不暴露 pagination/cursor 或 long-lived snapshot handle。它是 potentially expensive exceptional operation；v1 **不为了使 scan 变便宜而额外引入 aggregate live-State payload limit**。Physical binding MAY 内部 chunk/stream 一个 logical scan result，但 author-facing semantics 仍是一个 revision 的完整 snapshot。

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
→ detach/freeze validated Game Package State document
→ validate Platform Launch Manifest
→ exact subsystem key-set join
→ executable/content/capability preflight
→ freeze PlatformLaunchPlan
→ freeze LogicalGameBootstrap
→ project/freeze PreparedRealmStateDefinition
──────────────────────────────────────── PREPARE complete
```

Realm State-owned prepared bootstrap representation：

```ts
interface PreparedRealmStateDefinition {
  readonly records: readonly PreparedRealmStateInitialRecord[];
}

interface PreparedRealmStateInitialRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
}

interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: PreparedRealmStateDefinition;
}
```

这里的 `PreparedRealmStateDefinition` 是 platform-neutral、detached/immutable 的 Authority bootstrap input；它不是 Game Package document type。Launcher owns the projection：

```text
Validated GameEntryV1.state
→ PreparedRealmStateDefinition
```

State payload MUST NOT 塞进 `LogicalGameBootstrap`；RealmStateAuthority 也 MUST NOT 反向解析 Game Entry document。

Session bootstrap：

```text
PREPARE complete
→ composition constructs RealmStateAuthority from PreparedRealmStateDefinition
→ install immutable Game initial baseline
→ derive materialized Collection membership
→ initialize revision/version = 0
→ Realm State READY
→ create Runtime-scoped RealmStateClient logical capabilities
→ run Main / RuntimeHosting
→ Subsystem initialize
→ initial Frame
```

Realm State bootstrap only has one privileged value source：the prepared Game baseline。Session bootstrap MUST NOT accept Load seed、sparse Save override 或 persistence document。

必须保持：

```text
first business Runtime side effect
    ⇒ Realm State READY
```

Session composition 在这里拥有 physical assembly/order/disposal/wiring，不因此获得 Realm State business authority 或 Main control authority。

---

## 12. Persistence Is Ordinary Business State Mutation

Realm State v1 不定义 `Load Game` lifecycle/bootstrap path。

### Save

Save 是普通业务 observation：

```text
Save/business Subsystem
→ read(keys) or scan(...)
→ select/serialize values according to game policy
→ write them through its own persistence capability
```

Realm State 不决定 save slot、storage path、save document schema、autosave/cloud policy 或“哪些 Records 应该保存”。

### Load / Restore

Load/restore 是普通业务 mutation：

```text
Save/Load business Subsystem
→ reads persistence data through its own capability
→ validates / migrates / interprets business data
→ observes current Realm State as needed
→ ordinary RealmStateClient.commit()
```

Realm State 不知道某次 commit 来自存档恢复。

因此不存在：

```text
Load seed
sparse bootstrap current override
Load-specific materialization path
Load-specific revision/version reset
fresh Authority solely because a save is loaded
```

Persistence-driven restore MUST NOT 修改 `initialValue`。`readInitial()` 始终返回 current prepared Game baseline。Successful restore writes 正常推进 global revision 和对应 Record versions。

如果游戏要求整个存档恢复作为一个 business-atomic operation，那么业务必须在普通 transaction semantics / limits 内建模该 invariant；Realm State v1 不增加 generic whole-save transaction coordinator。

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

  readInitial(
    keys: readonly RealmStateKey[],
    options?: { readonly signal?: AbortSignal }
  ): Promise<RealmStateInitialSnapshot>;

  list(
    options?: {
      readonly namespace?: string;
      readonly signal?: AbortSignal;
    }
  ): Promise<RealmStateIndexSnapshot>;

  scan(
    options?: {
      readonly namespace?: string;
      readonly signal?: AbortSignal;
    }
  ): Promise<RealmStateSnapshot>;

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

`read()` / `readInitial()` / `list()` / `scan()` 是无 authoritative mutation side effect 的 observation，因此可以使用 `AbortSignal`。

`commit()` **不接受 `AbortSignal`**。Mutation 一旦 dispatch，就不提供 remote cancellation；调用方不得把本地“停止等待”解释成“transaction 未提交”。

`RealmStateClient` 与 Subsystem Runtime 同 logical lifetime，不与 Frame/Activation 绑定：

```text
state.commit(transaction)
    no Frame argument
    no activationId
    no ambient Frame context requirement
    no Frame mutation permit
```

Frame suspend/close、Activation replacement、pending `frame.call()` 不构成 Realm State request admission condition。Runtime terminal 才真正终止该 Runtime 的 logical client/subscriptions。

所有 live Runtime-scoped clients 可访问任意 valid Collection/Record；v1 没有业务 ACL。

### 13.1 Logical Client vs Physical Binding

`RealmStateClient` 是 Runtime-scoped **logical capability**；一个 Process/Worker/MessagePort/in-process channel 只是 physical binding。

```text
stable Runtime-scoped RealmStateClient
        │
        ├─ physical binding A
        │      ↓ lost
        └─ physical binding B
```

Physical binding loss by itself MUST NOT terminal the still-live Runtime-scoped logical client。Fresh binding MAY serve subsequent operations through the same `scope.state` capability。

Binding replacement MUST NOT：

```text
create a new RealmStateAuthority
create a new Runtime identity
create a new Frame/Activation authority
silently replay an already-dispatched mutation
reattach/resume an old subscription identity
```

An in-flight dispatched commit whose definitive result is lost follows `OUTCOME_UNKNOWN` semantics。

### 13.2 Subscription Handle Visibility

`subscribe()` establishment 在 Authority 上仍按 §18 的 atomic linearization 完成，但 author API 还必须保证：

```text
subscription established
→ Promise resolves with RealmStateSubscription handle
→ only then may listener receive baseline
→ then subsequent changes
```

也就是 **subscription handle MUST become observable before the first listener callback**。这样 listener 在 baseline callback 内安全调用 `subscription.close()` 不会遇到 handle 尚未返回的 race。

---

## 14. Current Read / Initial Read

### 14.1 Current Snapshot

```ts
interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

`read()` 使用完整 `(namespace,key)` Record identities。

多 key `read()` MUST 来自一个 logical revision。返回的 current `JsonValue` MUST detached / immutable。

Collection 只组织 Records，不改变 `read()` 的 snapshot/Record semantics。

Authority 内部 MAY 通过 immutable authoritative value references 构造 logical snapshot，而不是在 serialized authority step 内 deep-clone 每个 value。Author-visible / cross-boundary representation 仍 MUST 满足 detached / immutable semantics；物理 binding MAY 在 authority step 外完成必要 clone/encoding。

### 14.2 Initial Snapshot

`readInitial(keys)` 返回这些 logical Records 的 immutable prepared Game baseline：

```ts
interface RealmStateInitialSnapshot {
  readonly records: readonly RealmStateInitialRecord[];
}
```

Initial snapshot：

```text
has no global revision
has no Record version
does not materialize unknown Records
is unaffected by all Runtime current writes
including persistence-driven business restore writes
```

原因是 initial baseline 在一个 Session 内 immutable；把 current revision/version 塞入 initial projection 只会制造无业务意义的 concurrency metadata。

---

## 15. Discovery / `list()` / `scan()`

`list()` 是 Realm State 的 Collection/Record **discovery API**。Collection 仍是一等 organization/discovery concept，但 public index 不为 Collection 再建立无 metadata 的 wrapper object。

### 15.1 Index Shape

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

Index 不返回：

```text
initialValue
current value
Collection wrapper objects
```

它只表达：

```text
which materialized Record identities exist
current version of each Record at the index snapshot revision
```

Collection membership 可直接从 `record.key.namespace` 派生，不需要 `RealmStateCollectionIndex` 这一层 public abstraction。

### 15.2 Full Discovery

```ts
await state.list();
```

返回当前 revision 下所有 materialized Records，例如：

```text
revision = 100

inventory/main       @ version 8
player/economy       @ version 5
player/profile       @ version 2
quest/main-story     @ version 4
quest/side-001       @ version 1
```

由这些完整 identities 可直接看出 materialized Collections：`inventory`、`player`、`quest`。

### 15.3 Collection-filtered Discovery

```ts
await state.list({ namespace: "quest" });
```

只返回 namespace 为 `quest` 的 materialized Records。

如果指定 namespace 当前没有 materialized Record：

```ts
{
  revision: N,
  records: []
}
```

v1 不制造 empty Collection object，因为 Collection existence 由 materialized Records 派生。

### 15.4 Consistency

无论 full list 还是 namespace-filtered list，结果 MUST 来自一个 global revision。

Authority 不得一边遍历 materialized Record index、一边接受 commit，最后返回混合 revision 的索引。

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
tooling / diagnostics
UI discovery
finding dynamic Records
lightweight persistence discovery when cross-step atomicity is unnecessary
```

单独依赖 `list()` **不足以**表达：

```text
"the Collection still contains exactly these Records"
"no new Record has appeared"
collection-wide transactional invariant
```

这类业务 invariant SHOULD 通过普通 versioned Record 显式建模，而不是给 discovery index 隐式增加 OCC semantics。

### 15.6 Canonical Ordering

```text
records:
    namespace ascending by unsigned lexicographic UTF-8 byte comparison
    then key ascending by the same comparison
```

不得使用 locale-sensitive ordering 定义 contract order。

该顺序仅用于 deterministic presentation、tests、diagnostics 与 serialization stability，不赋予业务优先级。

### 15.7 Consistent `scan()`

`scan()` 是 materialized current Record 的一致 snapshot API。

```ts
await state.scan();
await state.scan({ namespace: "quest" });
```

一个 logical `scan()` MUST 在同一 revision 内确定：

```text
selected materialized membership
+
each selected Record current value
+
each selected Record version
+
one global revision
```

因此：

```text
scan(namespace)
= atomic point-in-time membership + current values snapshot
```

但它仍不是 Collection lock / predicate。`scan()` 返回后新 Record materialization或 mutation 都可以合法发生；如果之后的 commit correctness 依赖“成员集合没有变化”，业务仍需用普通 versioned Record显式建模该 invariant。

`scan()` 属于 potentially expensive 非常规 operation。v1 不因为它可能昂贵而引入 pagination、cursor、long-lived snapshot handle 或额外 aggregate live-State payload limit。Physical binding MAY internal chunk/stream，但 caller 仍观察一个 revision 的完整 logical result。

### 15.8 Persistence Observation

如果 Save/business persistence 已知精确 key set：

```text
read(keys)
→ one-revision current snapshot
```

如果业务需要动态 materialized membership + values 同 revision：

```text
scan() / scan({ namespace })
```

`list()` 仍适合轻量 discovery，但 `list() + read()` 不应被误解为 exact atomic Save snapshot。

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

Realm State transaction admission **不读取 Main Frame/Activation authority**。调用者是否当前位于某个 Frame handler、该 Frame 是否 suspended、是否存在 pending `frame.call()`，都不是本 transaction 的 condition。

---

## 17. Commit Result / Evidence / Ambiguity

成功 commit 返回 authoritative commit evidence / concurrency metadata：

```ts
interface RealmStateCommit {
  readonly revision: number;
  readonly records: readonly {
    readonly key: RealmStateKey;
    readonly version: number;
  }[];
}
```

`records` 包含全部 write targets，包括 deep-equal successful writes。

Commit result 不重复回传 `value`。v1 是 whole-record replacement，Authority 不做 merge/normalization/server-side transform，因此 caller 已知自己提交的 value；如果之后需要 authoritative current observation，应显式 `read()`。

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
    Runtime-scoped client or Authority already terminal before admission
    known no-commit

OUTCOME_UNKNOWN
    mutation may have reached/crossed authority commit point,
    but definitive result is unavailable
```

Ordinary physical-binding request failure is not by itself proof that the Runtime-scoped client is terminal；public/wire error shape for binding-local operation failure remains formal contract detail。

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

### Business Reconciliation after `OUTCOME_UNKNOWN`

业务遇到 `OUTCOME_UNKNOWN` 时可以 fresh read 做 reconciliation；Realm State core 不保证所有 mutation 都能仅从普通 current values 反推出是否执行过。

如果某项业务需要 exactly-once intent，game MAY 显式建模一个普通 operation marker Record，并将它与业务 writes 放入同一 atomic transaction。例如：

```text
conditions:
    economy/gold @ version N
    inventory/main @ version M
    operation/purchase-123 @ version 0

writes:
    economy/gold = ...
    inventory/main = ...
    operation/purchase-123 = "committed"
```

发生 `OUTCOME_UNKNOWN` 后：

```text
fresh binding if needed
→ read(operation/purchase-123)
→ business reconciles authoritative outcome
```

这个 marker 属 business model。Realm State core MUST NOT 自动创建 operation ID、status journal、dedup record 或自动 retry。

---

## 18. Subscription

Subscription 只观察 authoritative committed current state，不是 generic EventBus，也不重复携带 immutable initial baseline。

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

### 18.3 Listener Execution Boundary

Listener 是 **Runtime-local business callback**，不是 RealmStateAuthority serialized execution，也不拥有 Session/Runtime/Frame lifecycle authority。

必须保持：

```text
Authority captures/buffers committed notification data
→ leaves Authority serialized lane
→ binding/SDK schedules listener delivery
```

Listener synchronous throw 或 returned rejected thenable：

```text
MUST be locally contained / diagnostic
MUST NOT retroactively fail the committed transaction
MUST NOT make RealmStateAuthority fatal
MUST NOT make Session terminal
MUST NOT become subscription protocol backpressure acknowledgement
```

Listener MAY reenter：

```text
read / readInitial / list / scan
commit
subscribe
subscription.close()
```

binding/SDK MUST NOT 因 reentrancy 持有 Authority lock 或形成 callback→Authority deadlock。

### 18.4 Backpressure / Overflow

Subscription delivery MUST NOT 阻塞 RealmStateAuthority commit lane。

物理 binding MAY 使用 bounded queue；若 consumer 太慢导致无法继续保证 ordered delivery：

```text
MUST NOT silently drop change
MUST terminal the subscription with reason = overflow
```

consumer 之后通过 fresh subscribe 恢复。

### 18.5 Disconnect / Reconnect

v1 不提供 replay journal、resume cursor 或 `resumeFromRevision`。

```text
physical binding / connection lost
→ old physical binding terminal
→ subscriptions attached to that binding terminal(reason = binding-terminal)
→ live Runtime-scoped RealmStateClient remains the same logical capability
```

Physical Realm State binding loss 本身不得：

```text
terminal a still-live Runtime-scoped RealmStateClient
fail Main Runtime
unwind Frame
terminate Session
reset RealmStateAuthority
change Main DataAuthority
```

若 platform/profile 能恢复 carrier：

```text
fresh physical binding established
→ same live RealmStateClient can issue new operations
→ old subscription identity remains terminal
→ business fresh subscribe
→ fresh baseline
→ ordered changes after that new baseline
```

旧 subscription 不透明 reattach/resume；v1 不 replay event history。

如果 lost binding 上某个 `commit()` 已 dispatch 但 definitive response 丢失，该 operation 是 `OUTCOME_UNKNOWN`；fresh binding MUST NOT 自动 replay 它。

无 authoritative mutation side effect 的 interrupted read/list/scan MAY 由 caller 重新发起；确切 binding-local error representation 属 formal contract closure。

因此 v1 的 subscription 恢复模型是 **state resynchronization**，不是 event replay；client recovery 是 **physical carrier replacement**，不是 logical client replacement。

### 18.6 Close

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

Runtime terminal 后既有 RealmStateClient 必须 terminal/inert。

这是 capability lifetime correctness，不是业务 ACL。

---

## 20. Lifetime / Fatal Policy

```text
Frame suspend        != State unavailable
Frame close          != State unavailable / deleted
Activation change    != State reset / client replacement
Renderer reload      != State changed
Data reconnect       != State changed
put(null)            != Record identity forgotten
put(null)            != Collection membership removed
Realm State binding loss → old physical binding + attached subscriptions terminal; logical client remains Runtime-scoped
fresh State binding  → same live RealmStateClient may continue; subscriptions require fresh subscribe
Runtime terminal     → its RealmStateClient/subscriptions terminal
Session terminal     → RealmStateAuthority terminal
RealmStateAuthority fatal → report Session-fatal fact to Main; Main commits terminal/unwind
```

Collection 没有独立 lifetime；其可见存在性由 Session 内 materialized Records 派生。

v1 不设计 transparent authority restart / journal replay / old subscription reattach / ambiguous mutation auto-retry。

**Main 是 Session terminal / Runtime/Frame unwind 的唯一 application owner**。RealmStateAuthority、binding、Runner 或 Platform 只能报告其拥有的 terminal/fatal facts；Platform/Session composition 只做物理 wiring/disposal。

---

## 21. Communication Placement

Realm State SHOULD 使用独立 logical protocol，例如：

```text
loomrealm.realm-state/1
```

协议至少表达：

```text
consistent current Record read
immutable initial baseline read
flat Record discovery index with optional namespace filter
consistent materialized current scan
conditional Record commit
validation / limit / conflict / outcome evidence
binding-local operation failure / carrier replacement
atomic subscription baseline establishment
ordered subscription changes / terminal
logical client / authority terminal
Session-fatal report to Main
```

Logical protocol MUST 定义 validation semantics，但 MUST NOT 要求每一层 carrier adapter 重复执行同一 semantic deep validation。每个不可信边界的接收侧负责建立新的 trusted representation；之后可沿 trusted internal path 复用。

不得塞进 renderer-data、Runtime Control 或 `frame.call()`。

Realm State binding loss 只产生该 logical plane 的 binding/subscription facts；MUST NOT 自行改变 Main Runtime/Frame/Session state，也不自动终止 live Runtime 的 logical RealmStateClient。RealmStateAuthority fatal 则通过显式 Session-fatal report seam 交给 Main。

---

## 22. Interaction with Main / Renderer / Content

Main 不持有具体 State Collections/Records，也不解释 namespace/value/initial baseline。

RealmStateAuthority 不读取 Frame/Activation/InputTarget，也不把这些 Main facts 作为 read/commit/subscription admission 条件。

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

Realm State 不存储 Content cache、Renderer projection、Input retained state、Platform execution facts 或 Save/Load policy；这些数据继续由各自 owner 管理。

---

## 23. Persistence / Save Boundary

Realm State authority 不等于 Save Game 系统，也没有 Load bootstrap lifecycle。

Save/business code 可以按需求选择：

```text
known exact keys
→ read(keys)
→ serialize selected current values

need dynamic membership + values from one revision
→ scan() / scan({ namespace })
→ serialize selected current values
```

`list()` MAY 用于轻量 persistence discovery，但 `list() + read()` 不提供 exact atomic membership + value snapshot。

Load/restore：

```text
business persistence capability
→ Save/Load Subsystem validates/migrates/interprets data
→ ordinary RealmStateClient reads/commits
→ current Realm State changes like any other business mutation
```

Restored writes 不修改 prepared Game `initialValue`，也不 reset revision/version。

Realm State MUST NOT 提供：

```text
saveSlot()
loadSlot()
Load seed
sparse bootstrap override
storage path
persistence format/schema authority
migration policy
autosave/cloud policy
```

这些属于 game/product persistence/application policy owner。

---

## 24. Physical Platform Realization

Desktop 可以同进程托管 Main 与 RealmStateAuthority，但二者必须保持不同 logical owner/API。

PWA 可以把 Realm State 与 Main 放在同一 Worker 或不同 Worker；logical semantics 必须与 Desktop 等价，包括：

```text
Collection/Record identity
flat discovery semantics
current/initial read semantics
scan consistency
snapshot consistency
OCC semantics
hard limits
validation ownership / trusted representation semantics
commit evidence
Runtime-scoped logical client lifetime
replaceable physical binding semantics
subscription linearization
subscription terminal / fresh-resubscribe semantics
Main-owned fatal unwind
```

同进程 realization MAY 复用 validated immutable references / interned Record identities；跨 Worker/Process realization MAY 在 carrier decode boundary 重新验证并 detach。二者不要求拥有相同 validation pass 数量，只要求 observable validity、limits 与 authority semantics 等价。

Platform / Session composition 可以 physically construct/bind/rebind/dispose RealmStateAuthority/client carriers，但 MUST NOT：

```text
interpret namespace/value business semantics
own Record versions/revision
own OCC/retry policy
replace logical Runtime/client identity merely because carrier changed
turn binding loss into Runtime/Session transition
automatically replay an ambiguous mutation
interpret Save/Load as Realm State bootstrap policy
become a generic Session coordinator/service locator
```

---

## 25. v1 Initial Implementation Scope

实现：

```text
optional GameEntryV1 state.records document input
pre-release Game Package v1 keeps formatVersion: 1; no legacy draft compatibility layer
Launcher projection to PreparedRealmStateDefinition
RealmStateAuthority consumes prepared State bootstrap representation, not GameEntryV1
inline initial records only
omitted state/key → default null semantics
immutable internal initialValue
current read projection excludes initialValue
readInitial() exposes baseline on demand
Session-bootstrap current = initial
no privileged Load seed / sparse persistence bootstrap override
persistence restore uses ordinary Runtime commit semantics
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
materialized Record discovery index
flat list() Record index
list({ namespace }) filtered Record index
list() as discovery snapshot, not transactional Collection scan
scan() as potentially expensive one-revision membership+value snapshot
no scan pagination/cursor/MVCC handle or extra aggregate State limit
consistent deterministic `(namespace,key)` ordering
whole-record put
successful deep-equal put advances version/revision
consistent multi-key current read
separate immutable initial read
strict transaction shape validation
OCC read-set Record-version conditions
write-set ⊆ read-set
atomic multi-record / cross-Collection commit
commit independent from Frame/Activation authority
commit result contains revision + written Record versions only
short serialized authority commit path
explicit INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT / TERMINAL / OUTCOME_UNKNOWN
commit() without AbortSignal / remote cancellation
no automatic mutation retry
business operation-marker reconciliation for exactly-once intent when needed
atomic subscription baseline + observer establishment
subscription handle observable before baseline callback
listener delivery outside authority serialized lane
listener failure locally contained; callback reentrancy supported
ordered relevant current Record changes
no namespace wildcard subscription
subscription overflow/disconnect → old subscription terminal
binding loss does not fail Main Runtime/Session or reset Authority
Runtime-scoped RealmStateClient survives replaceable physical binding loss while Runtime lives
close() idempotent, no post-close callback
fresh physical binding + fresh subscribe + fresh baseline recovery
RealmStateAuthority fatal reports Session-fatal fact to Main
Desktop in-process authority + explicit transport seam
```

延后 / 不实现：

```text
independent NamespaceRegistry
empty namespace objects
public Collection index wrapper object
namespace value/version/transaction/lifecycle
Collection membership version / predicate lock
namespace ACL / security boundary
namespace wildcard subscription
Game Entry v2 only for pre-release State addition
legacy draft Game Entry dual parser
large external / Content-derived initial State
ACL / RBAC
schema registry
field-level patch
long-lived transaction locks
global-revision default mutation condition
automatic retry / merge
transaction result value echo
transaction ID / dedup / mutation status query
subscription replay journal / reconnect cursor
long-lived MVCC snapshot handle
scan pagination/cursor
aggregate State limit introduced only for scan
persistence implementation / Save-Load workflow itself
Load seed / persistence bootstrap override
cross-session sharing
CRDT / distributed authority
Renderer direct access
query language / secondary indexes
generic events
transparent authority restart/recovery
Frame/Activation-gated Realm State mutation
universal application state store
```

---

## 26. Qualification Targets

正式关闭实现前至少证明：

```text
Game Entry / Bootstrap
- current pre-release GameEntryV1 without state remains valid
- optional state validates as part of current pre-release GameEntryV1
- historical draft v1 compatibility is not promised / no dual parser is required
- invalid/duplicate/oversized initial Records reject during PREPARE
- Launcher projects validated Game document State to detached PreparedRealmStateDefinition
- RealmStateAuthority bootstrap does not depend on GameEntryV1/formatVersion/game.json
- State is READY before first business Runtime side effect
- no Save/Load seed participates in Realm State bootstrap

Authority Boundaries
- Session composition only wires/owns physical lifetime; it cannot inspect/modify Main or Realm State application authority
- state.commit requires no Frame / activationId / ambient Frame context
- Frame suspend/close/Activation replacement does not revoke RealmStateClient or reject an otherwise valid Realm State request
- RealmStateAuthority fatal reports Session-fatal fact; Main performs terminal/unwind
- Realm State binding loss does not fail Runtime/Session or reset Authority
- fresh binding can continue serving the same live Runtime-scoped RealmStateClient
- local/cache/render/input/platform/content/persistence-policy facts are not stored by framework in Realm State

Namespace Collection / Discovery
- namespace is a Collection identifier, not merely an opaque repeated field
- Collection is discoverable iff at least one materialized Record belongs to it
- no independent namespace creation/registry is required
- first successful write into a new namespace makes that Collection discoverable
- read/readInitial of unknown Record does not create Record or Collection
- put(null) does not remove Record or Collection membership
- list() returns all materialized Record identities at one revision
- list({ namespace }) returns only that namespace's Records at one revision
- missing Collection filter returns records: []
- flat index ordering is canonical `(namespace,key)` UTF-8 byte order
- Collection membership is not accepted as an OCC condition
- list()+read is not treated as atomic Collection scan
- scan full/filter returns membership + current values + versions from one revision
- scan is qualified as potentially expensive, without pagination/cursor semantics

Key / Limits
- exact grammar behaves identically across platforms
- no hidden trim/case-fold/Unicode normalization
- value/request/session hard limits are enforced
- repeated use of an already validated key may use intern/cache without changing identity semantics
- no additional aggregate State limit is required solely for scan

Validation / Hot Path
- each untrusted boundary has a clear validation owner
- trusted internal representation cannot be mutated by the original caller after validation
- implementation is not required to repeat equivalent key/JsonValue deep validation at SDK, binding and Authority layers
- JsonValue validity + depth + size + detach may be implemented in one bounded traversal
- size accounting can be performed without materializing a full canonical JSON byte buffer
- Authority serialized commit step does not perform avoidable JSON serialization / listener delivery
- same-process immutable stored values may be snapshot by reference internally while preserving detached author semantics

Initial / Persistence
- Session bootstrap current = initialValue
- initialValue cannot mutate
- ordinary read/subscription current projection does not duplicate initialValue
- readInitial returns immutable current-Game baseline on demand
- readInitial unknown key returns null without materialization
- persistence restore is an ordinary commit
- persistence restore does not redefine readInitial baseline
- persistence restore advances normal revision/version

Materialization
- Game baseline / successful first write materialize Records
- persistence data itself does not privileged-materialize a Record
- read/readInitial unknown key does not materialize
- put(null) does not dematerialize

Read / Transaction
- multi-key read is one consistent revision
- scan membership/values/versions are one consistent revision
- readInitial has no current revision/version semantics
- malformed transaction rejects before version comparison
- every write target has exactly one observed-version condition
- stale condition → CONFLICT + zero write
- writes are all-or-nothing across Collections
- deep-equal successful put advances version/revision
- commit result contains all written keys/new versions but does not echo values

Commit Evidence
- commit API exposes no Frame/Activation dependency and no remote cancellation
- explicit pre-commit rejection is known no-commit
- dispatch followed by lost definitive result produces OUTCOME_UNKNOWN
- neither CONFLICT nor OUTCOME_UNKNOWN is automatically retried
- reconnect never replays an ambiguous dispatched mutation
- operation-marker Record pattern can reconcile exactly-once business intent without core transaction IDs

Subscription
- establishment captures baseline and registers observer atomically
- Promise resolves with subscription handle before baseline callback
- baseline is delivered before buffered post-baseline changes
- baseline/change carry current projection only, not initialValue
- no relevant subscribed-Record commit can be silently lost
- newly materialized same-Collection Record is not implicitly subscribed
- change revisions are monotonically increasing
- one transaction maps to at most one change event per subscription
- unrelated commits may create revision gaps
- listener delivery occurs outside Authority serialized lane
- listener sync throw / rejected thenable is locally contained and does not affect Authority/Session
- listener may reenter RealmStateClient without deadlock
- slow-consumer overflow terminals instead of dropping changes
- disconnect terminals old subscription/physical binding without failing Main Runtime/Session
- disconnect alone does not terminal the still-live Runtime-scoped RealmStateClient
- close() is idempotent and prevents future listener invocation after return
- reconnect uses fresh physical binding + fresh subscribe/baseline; old subscription identity not reattached
- no replay/cursor is required for v1

Lifetime / Failure
- Runtime terminal terminates its logical client/subscriptions
- RealmStateAuthority fatal reports Session-fatal fact to Main
- Main alone performs Session terminal / Runtime/Frame unwind
```

---

## 27. Formal Contract Closure Checklist

以下项目 **不改变 Realm State core architecture semantics**，但正式 `loomrealm.realm-state/1` / `@loomrealm/subsystem` author contract MUST 在实现前冻结：

```text
Observation request shape
- read([]) 是否合法
- duplicate read Record identities 如何处理
- readInitial([]) 是否合法
- duplicate readInitial Record identities 如何处理
- subscribe([]) 是否合法
- duplicate subscription Record identities 如何处理

Returned-array ordering
- RealmStateSnapshot.records canonical ordering
- RealmStateInitialSnapshot.records canonical ordering
- RealmStateIndexSnapshot.records canonical ordering
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
- binding-local operation failure representation
- structural path / diagnostics boundary

Validation / trusted representation
- each carrier/trust boundary 的 validation owner
- validated key/value/request internal representation ownership
- caller mutation isolation / detachment point
- equivalent semantic validation MUST NOT be required repeatedly inside one trusted path

Transport/profile realization
- bounded subscription queue profile
```

Load current-seed resource bound 不再是 blocker，因为 Realm State 不拥有 Load bootstrap。Logical client / replaceable physical binding 的 authority/lifetime semantics 与 wire error/profile representation 均已由 v1 contract 和实现关闭。`scan()` 被明确视为 potentially expensive exceptional operation，不增加 aggregate live-State limit/pagination blocker。

这些项目属于 formal contract / profile / qualification closure，不应被重新解释为需要扩张 Realm State authority model 的架构缺口。

---

## 28. Contract Synchronization Work

架构结论已经要求后续正式同步：

```text
Game Package v1
    pre-release closed schema 增加 optional state while keeping formatVersion: 1
    RealmStateGameDefinitionV1 / initial Record validation
    document layer does not become Realm State runtime bootstrap ABI
    formal v1 release 后 breaking structural change uses new formatVersion

Subsystem author contract
    SubsystemScope.state
    RealmStateClient read/readInitial/list/scan/commit/subscribe surface
    no Frame/Activation dependency
    logical client lifetime distinct from replaceable physical binding

Realm State logical protocol
    current read / initial read / flat list / scan / commit / subscribe / terminal / evidence
    validation owner / validated internal representation seam
    binding-local request failure / carrier replacement semantics
    listener-failure isolation + old-subscription terminal boundary

Launcher / Platform Composition
    project Validated Game State → PreparedRealmStateDefinition
    State bootstrap barrier from Game baseline only
    no persistence Load seed
    composition remains physical owner, not third application authority
    RealmStateAuthority fatal report wired to Main

Hostra / PWA
    equivalent logical semantics + limits + failure behavior
    platform-appropriate validation/copy strategy
    binding loss does not become Runtime/Session supervision
    fresh carrier may continue serving same live Runtime-scoped client

Persistence/game code
    Save/Load is business workflow
    Save observes via read/scan
    restore writes via ordinary commit
```

在这些 normative contract / implementation 完成前，本文仍不得被解释为“功能已经实现”。

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

public Collection wrapper in list result
    = no

list() can filter one namespace Collection
    = yes

list() index shape
    = flat RealmStateKey + Record version entries

list()+read is atomic Collection key-set/value snapshot
    = no

scan() can return membership + current values from one revision
    = yes

scan() is intended hot-path query / paginated DB cursor
    = no; potentially expensive exceptional snapshot operation

scan() requires extra aggregate live-State size limit
    = no

ordinary read includes initialValue
    = no

initialValue author access
    = separate readInitial() observation

readInitial has current revision/version
    = no

commit result echoes written value
    = no

state.commit consumes Frame / Activation authority
    = no

Frame suspend/close gates Realm State commit
    = no

namespace wildcard subscription
    = no

Game Entry state requires v2 before first formal v1 release
    = no; current v1 is pre-release and breaking schema changes are allowed

historical draft v1 compatibility layer required
    = no

GameEntryV1 state required
    = no; optional

RealmStateAuthority directly owns Session terminal/unwind
    = no; it reports Session-fatal fact to Main

Main owns Session terminal / Runtime-Frame unwind
    = yes

Session composition is third application authority
    = no; physical assembly/lifetime/wiring only

Realm State core runtime bootstrap type is GameEntryV1 document type
    = no; Launcher projects to PreparedRealmStateDefinition

Realm State has privileged Load seed / Save sparse override bootstrap
    = no

Save/Load is business workflow using RealmStateClient
    = yes

persistence restore resets revision/version
    = no; ordinary successful commits advance normal metadata

subscription listener failure can fail Authority/Session
    = no; Runtime-local containment

subscription listener may reenter RealmStateClient
    = yes; delivery outside authority lock

physical State binding loss fails Runtime/Session
    = no

physical binding identity equals RealmStateClient identity
    = no

fresh physical binding may continue serving same live Runtime-scoped client
    = yes

old subscription transparently reattaches after binding replacement
    = no; fresh subscribe + fresh baseline

revision/version bootstrap baseline
    = 0

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

readInitial unknown key materializes it
    = no

put(null) dematerializes Record
    = no

deep-equal successful put is no-op
    = no

empty / condition-only / duplicate-key transaction allowed
    = no

discovery index order unspecified
    = no; canonical `(namespace,key)` UTF-8 byte ordering

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

business may reconcile OUTCOME_UNKNOWN with ordinary operation marker Record
    = yes

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

business Runtime may start before Realm State initialization
    = no
```

---

## 30. Final Invariants

1. Main 唯一拥有 Control Authority；Realm State 唯一拥有 Session shared mutable business facts；
2. Session composition只负责 sibling authority 的 physical assembly/order/disposal/wiring，不成为第三 application authority；
3. RealmStateAuthority fatal 只报告 Session-fatal fact；**Main 唯一提交 Session terminal、Runtime/Frame unwind**；
4. Namespace 是一等的 **Record Collection / organization + discovery boundary**；Key 是该 Collection 内的 Record identifier；
5. Namespace/Collection 不拥有 value、version、conflict、replacement、transaction、ACL 或独立 lifecycle；
6. Collection existence 由 materialized Record membership 派生；v1 不存在 NamespaceRegistry、`createNamespace()` 或 `deleteNamespace()`；
7. Collection membership 是 observational discovery metadata，不参与 OCC，也不提供“成员集合未变化”的 transactional predicate；
8. `(namespace,key)` Record 是 replacement/version/conflict unit；Transaction 是 atomicity unit，并可跨 Collection；
9. RealmStateKey 使用 exact、case-sensitive、no-normalization identity，并受明确 UTF-8 hard bounds；validated identity MAY 被 intern/cache，不要求每次操作重新编码/扫描；
10. Authority 为每个 key 持有 immutable `initialValue` 与 mutable current value；普通 current read/subscription 不重复携带 baseline，author 通过独立 `readInitial()` 按需读取；缺失 initial key → `null`；
11. `readInitial()` 不携带 current revision/version，不 materialize unknown Record，也不受包括 persistence restore 在内的任何 Runtime current writes 影响；
12. GameEntryV1 `state` optional；Game Package v1 尚未正式 release，所以当前 pre-release breaking schema evolution 不要求 v2；formal release 后 closed-schema breaking structural evolution原则上使用新的 formatVersion；
13. Game Package document type 不成为 Realm State runtime bootstrap ABI；Launcher 将 validated Game State 投影成 `PreparedRealmStateDefinition`；RealmStateAuthority 不依赖 GameEntryV1/formatVersion/game.json；
14. Realm State bootstrap 的唯一 privileged value source 是 prepared Game baseline；每个新 Session revision/version 从 0 开始；
15. Save/Load/restore 不属于 State bootstrap/lifecycle；恢复 current facts 是普通 Runtime commits并正常推进 revision/version；
16. Materialization 只来自 explicit prepared baseline 或 successful write；read/readInitial unknown key 不 materialize Record/Collection；
17. `put(null)` 不 dematerialize Record，也不移除 Collection membership；
18. `list()` 返回一致 revision 的扁平 `RealmStateKey + version` discovery index，可选择 namespace filter，并按 canonical `(namespace,key)` UTF-8 byte order 排序；不建立无 metadata 的 public Collection wrapper；
19. `list()` 不是 transactional Collection scan；`list()` + 后续 `read()` 不保证 key-set 与 values 同 revision；
20. `scan()` 返回一个 revision 的 materialized membership + current values + versions，是 potentially expensive exceptional snapshot operation；v1 不为它引入 pagination/cursor/MVCC handle 或额外 aggregate State limit；
21. 所有既有 key/value/request/session resource 受明确 hard limits；精确 wire size/depth accounting 属 formal contract closure，并必须允许等价 streaming/one-pass counting；
22. `read(keys)` 使用完整 Record identities，并返回一致 logical current snapshot；内部 MAY capture immutable refs，author-visible representation 仍须 detached/immutable；
23. 每个 write target 必须且只能有一个 caller-observed Record version condition；Authority 原子执行 condition check + all writes；
24. Realm State request/transaction admission 不依赖 Frame/Activation/InputTarget；`state.commit()` 不受 Frame mutation gate支配；
25. semantic validation 在每个不可信边界必须有明确 owner；trusted validated representation MAY 沿内部路径复用，不要求 SDK/binding/Authority 重复等价 deep validation；
26. JsonValue validity、depth、size accounting 与 detach SHOULD 可融合为 bounded traversal；Authority serialized mutation path SHOULD 只承担 authority-sensitive metadata/reference work；
27. stale condition → `CONFLICT` + zero write；successful deep-equal put 仍推进 version/revision；
28. successful commit result 只返回 global revision + write-target new versions，不重复回传 caller 已知的 value；
29. `commit()` 不提供 remote cancellation；dispatch 后失去确定结果 → `OUTCOME_UNKNOWN`；不得自动 retry；
30. v1 不提供 mutation ID/dedup/status journal；业务需要 exactly-once intent 时 MAY 使用普通 versioned operation-marker Record做 reconciliation；
31. `RealmStateClient` 是 Runtime-scoped logical capability，physical binding 不定义其 identity/lifetime；
32. live Runtime 的 State binding 可以替换；binding loss终止 old binding及其 subscriptions，但不自动终止 logical client、Runtime、Frame、Session 或 Authority；
33. Subscription establishment 原子绑定 baseline revision 与后续 observer；author handle 必须先于第一条 callback 可观察；
34. Subscription listener delivery 在 Authority serialized lane 外；listener failure Runtime-local隔离，listener reentrancy 不得 deadlock Authority；
35. Subscription 只观察显式 Record identities，不隐式观察 Collection membership，也不重复携带 initial baseline；
36. Subscription 只交付 ordered committed current Record changes；revision 可因 unrelated commits 跳号；
37. Overflow/disconnect 必须 terminal old subscription，不得 silent drop；binding recovery使用 fresh physical binding + fresh subscribe + fresh baseline，旧 subscription 不透明恢复；
38. `subscription.close()` idempotent；返回后不得再次调用 listener；主动 close 不产生 terminal("closed")；
39. Realm State v1 不提供业务 ACL；live Runtime-scoped client 可 read/readInitial/list/scan/commit/subscribe；
40. Runtime terminal 终止其 logical client/subscriptions；Session terminal 终止 RealmStateAuthority；
41. Realm State 只承载 Session 跨 Subsystem authoritative mutable business facts，不吸收 Main/Frame、Renderer/Data、Input/Render、Content、Platform、local cache/task 或 Save/Load policy；
42. Realm State 必须在第一项 business Runtime side effect 前 READY；
43. Hostra/PWA physical realization 可不同，包括 validation/copy pass 数量不同，但上述 Collection/Record semantics、hard limits、validation outcome、commit evidence、logical-client/binding lifetime 与 subscription semantics 必须一致；
44. Formal contract checklist 中的 API/wire edge rules 必须在实现前冻结，但不得因此引入第二套 Collection authority/version/transaction model。

---

## 31. Architectural Summary

```text
                     GameEntryV1 document
                 state? + initial + topology
                       │
                Game Package validation
                       │
                 Launcher PREPARE
           ┌───────────┴───────────┐
           │                       │
           ▼                       ▼
LogicalGameBootstrap      PreparedRealmStateDefinition
           │                       │
           ▼                       ▼
          Main               RealmStateAuthority
    Control Authority         Business-state Authority
                              revision = 0
                              versions = 0
                              initial/current = Game baseline
                                      │
                                      ▼
                     Runtime-scoped RealmStateClient
                                      │
                           ┌──────────┴──────────┐
                           ▼                     ▼
                    physical binding A     physical binding B
                       (replaceable)          (replaceable)

Session composition
    physical assembly/order/disposal/wiring only
    State fatal → Main
    Main alone commits Session terminal / Runtime-Frame unwind

Save / Load business
    persistence capability ↔ business Subsystem
    Save: read/scan
    Restore: ordinary commit
    no privileged State bootstrap path

                    Realm State Collections
                    ───────────────────────
                    player
                      ├─ profile
                      └─ economy
                    inventory
                      └─ main
                    quest
                      └─ main-story

             ┌──────────────┬──────────────┬──────────────┬──────────────┐
             ▼              ▼              ▼              ▼              ▼
        read(keys)   readInitial(keys)   list(...)      scan(...)   subscribe(keys)
      current @ N       baseline only    discovery    snapshot @ N   baseline @ N
                                             │              │             │
                                             ▼              ▼             └→ ordered current changes > N
                              flat key+version index   membership+values

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
    └→ serialization / listener delivery outside serialized authority step
             listener failure locally contained
             listener may reenter RealmStateClient

                    local business computation
                              │
                   Record-version conditions
                        + write-set
                              │
                              ▼
                    atomic OCC commit
                    MAY span Collections
                    no Frame/Activation condition
                              │
                ┌─────────────┴─────────────┐
                ▼                           ▼
        definitive result            result unavailable
      revision + versions            after dispatch
      or known-no-commit                    │
                                            ▼
                                     OUTCOME_UNKNOWN
                                            │
                                  business reconciliation
                                  MAY read marker Record
```

核心粒度：

```text
Namespace / Collection
    organization + discovery boundary
    derived from materialized Record membership
    observational, not transactional
    no separate public index wrapper object

Record key
    identifier inside one Collection
    may be validated/interned into trusted internal identity

Authority Record (namespace,key)
    immutable initialValue + mutable current value + version
    replacement / conflict unit

Current RealmStateRecord projection
    key + current value + version
    no duplicated initialValue

Initial Read Snapshot
    selected key + immutable initial value
    no current revision/version

Materialized Discovery Index
    flat materialized RealmStateKey + version entries
    one revision + deterministic `(namespace,key)` order
    discovery snapshot only

Current Read Snapshot / scan
    one revision + selected/materialized current values + versions

Validation Boundary
    one semantic validation owner per trust boundary
    validated immutable representation reusable inside trusted path
    no required repeated deep validation across implementation layers

Transaction
    validated Record-version conditions + write-set
    multi-record / cross-Collection atomicity
    short serialized authority step
    independent from Frame/Activation authority

Commit Result
    global revision + write-target new versions
    no value echo

Runtime-scoped RealmStateClient
    logical capability for Runtime lifetime
    physical binding may be replaced
    no mutation replay on reconnect

Subscription
    explicit Record identities only
    atomic current baseline + observer registration
    handle-before-callback ordering
    callback outside Authority lane; failure local; reentrant-safe
    ordered relevant committed current Record changes
    old subscription terminal on binding loss
    fresh-binding/fresh-subscribe/fresh-baseline recovery
```

Realm State v1 的 **core architecture semantics 与实现闭环** 已完成，并保持与 Main/Frame、Renderer/Data、Content、Platform、Subsystem-local state、Persistence workflow 的 authority 边界。后续版本演进不得把未被真实 consumer 证明必要的机制重新塞入 v1 core。
