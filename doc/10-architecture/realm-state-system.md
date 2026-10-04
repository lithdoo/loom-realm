# Realm State：Session 级共享业务状态系统

> 层级：系统架构  
> 状态：Proposal / Active Design  
> 稳定程度：Evolving / **Not Implemented / Not Contract Frozen / Not Qualified**  
> 主要定义：Session 级共享业务状态 authority、Game Entry 初始状态、immutable initial value、namespace/record/transaction 粒度、materialized record index、consistent snapshot、optimistic transaction、Subsystem 访问 capability、订阅/生命周期与平台边界  
> 依赖：[系统架构总览](./system-overview.md)、[模块子系统模型](./subsystem-model.md)、[栈式运行系统](./stack-runtime-system.md)、[存储与内容系统](./storage-system.md)、[通信系统](./communication-system.md)、[Game Package v1](../15-contracts/game-package-v1.md)  
> 最近复核：2026-10-05

本文定义 LoomRealm 候选的 **Realm State**：位于 `Main` 控制 authority 与各 `Subsystem Runtime` 局部业务状态之间的 **Session 级、跨 Subsystem、可变业务状态唯一 authority**。

当前固定的核心方向：

1. 新游戏 Realm State 的初始业务值属于 platform-neutral Game Entry；
2. Platform Launcher 在 PREPARE 阶段验证并投影 Game Entry state；
3. Platform Composition 必须先建立并初始化 Realm State authority，才允许任何 business Runtime side effect；
4. `namespace` 只承担逻辑分组与命名，不是权限、更新、版本、冲突或事务单位；
5. `record = namespace + key` 是读写、版本与冲突基本单位；
6. `transaction` 是跨 record 的原子提交单位，并且 MAY 跨 namespace；
7. v1 写入采用 whole-record value replacement，不提供 field-level patch；
8. 每个 key 同时具有不可变 `initialValue` 与可变 `value`；未在 Game Entry 中声明初始值时 `initialValue = null`；
9. 新游戏的 `value` 初始等于 `initialValue`；Load Game 只恢复 current `value`，不得修改 Game Entry 定义的 `initialValue`；
10. 多 key `read()` 返回同一 logical snapshot；
11. v1 mutation 采用 optimistic concurrency control：业务先读取 record/version，再以 read-set version conditions 原子提交 write-set；
12. 每个 write target MUST 出现在 transaction read-set/conditions 中；read-set MAY 包含只读但参与业务判断的 record；
13. 任一 observed version 已变化时，整个 transaction 返回 `CONFLICT` 且 zero write；
14. v1 不提供跨 Runtime 长生命周期锁事务，也不自动重试冲突；
15. transport ambiguity 与 `CONFLICT` 必须区分：前者可能已提交，后者明确 known-no-commit；
16. Realm State v1 不提供 Subsystem 级 ACL / namespace 权限控制；所有合法且仍存活的 Runtime-scoped `RealmStateClient` 均可 read / list / commit / subscribe；
17. `list()` 返回当前 authority 中所有 **materialized records** 的 `(namespace,key,version)` 一致索引快照；它用于 key discovery，不等于“导出所有 State value”，也不规定 Save 必须保存所有 State。

本文仍是架构提案，不改变现有 Frozen contracts，也不宣称存在对应生产实现。当前 Game Package v1 是 closed schema，尚不接受 `state` 字段；正式实现前必须通过 ADR / contract revision 明确兼容与版本策略。

---

## 1. Problem Statement

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

`frame.call()` 是 Main-owned LIFO control-flow transition：

```text
caller active
→ caller Activation revoked
→ caller suspended
→ child Frame active
→ child terminal
→ caller fresh Activation resume
```

因此：

```text
Battle needs to consume Potion
!=
Battle should suspend and call Menu/Inventory Frame
```

`frame.call()` 表达控制流进入另一个 Frame，不应承担普通跨 Subsystem 共享状态读写。

结论：需要独立的 **Session Shared Business State Authority**。

---

## 2. Design Goal

新增逻辑角色：

```text
Realm State
    = Session-scoped shared mutable business-state authority
```

目标：

1. 为跨 Subsystem 的运行期业务状态提供唯一 owner；
2. 允许多个 Subsystem 显式读取、发现、修改和观察共享状态；
3. 保证多 record 原子 commit；
4. 支持 per-record version、冲突检测和一致 snapshot；
5. 保证业务写入建立在 caller 实际观察到的 state version 上；
6. 支持 immutable initial value 与 mutable current value；
7. 支持只观察 authoritative commit 的 subscription；
8. 独立于 Frame / Activation / Renderer / Data carrier 生命周期；
9. 保持 Hostra/PWA logical semantics 一致；
10. 提供确定的新游戏/读档初始化 barrier；
11. 不把 Main、Content、Renderer 或 `frame.call()` 扩张成通用业务状态系统；
12. 不为当前受信业务代码提前引入 ACL、policy registry、schema registry 或 database/query framework。

核心原则：

> 一个 application fact 只有一个 authoritative owner；物理 host、transport、cache、projection 或 consumer 不得复制第二份 authority。

---

## 3. Trust Model / Non-goals

Realm State v1 假设：

```text
Game Package 中的 Subsystem implementation
    = 同一受信游戏产品的一部分
    != 第三方不可信插件 / hostile tenant
```

因此 Realm State v1 强制的是 correctness boundary：

```text
consistent snapshot
record version / conflict
atomic commit
initialValue immutability
Runtime / Session lifetime
transport / commit evidence
```

它不负责强制：

```text
Battle 只能写 battle-owned data
Menu 不能写 player profile
Quest 只能访问 quest namespace
```

这类业务 ownership 约束由 game-lib API、共享 key 常量/types、测试、代码审查和业务 invariant 承担。

Realm State v1 不应成为：

```text
global mutable JavaScript object
generic EventBus
service locator
ACL / RBAC / policy engine
namespace registry
schema registry
generic actor framework
database abstraction framework
SQL/query language
CRDT / distributed consensus layer
automatic merge framework
automatic retry framework
Content replacement
Renderer Store replacement
Save Game / persistence system
field-level JSON patch framework
cross-Runtime long-lived lock manager
```

禁止：

```ts
scope.globalState.foo.bar = value;
```

若未来 LoomRealm 引入真实 third-party / untrusted Subsystem sandbox，再基于真实安全消费者设计独立的 State capability / authorization profile。

---

## 4. Authority Model

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

Main 与 Realm State 是同一 Session 下两个不同逻辑 authority：

```text
Main owns "who is running / active"
Realm State owns "what shared game facts initially are and currently are"
```

Realm State MUST NOT 被实现为 Main 内部任意业务字段集合。

---

## 5. State Classification

### 5.1 Subsystem-local State

继续由对应 Subsystem 拥有，例如：

```text
Battle current tick
Battle event queue
Battle cast progress
Map local movement interpolation
Schema Form local editing session
```

### 5.2 Realm State

代表当前 Game Session 的跨领域业务事实，例如：

```text
player/profile
player/progression
player/economy
inventory/main
party/current
quest/main-story
world/flags
```

### 5.3 Readonly Content

定义型、安装型、资源型事实继续属于 Content：

```text
Item definition
Species definition
Skill definition
Map definition
Quest definition
images / audio / presentation resources
```

核心区分：

```text
Content
    "这个东西定义是什么"

Realm State
    "这个 Game 的初始共享事实是什么，以及这个 Session 当前变成了什么"

Subsystem State
    "这个领域执行器现在正在做什么"
```

---

## 6. Namespace / Record / Transaction 粒度

### 6.1 Namespace

`namespace` 仅用于逻辑分组和命名，例如：

```text
player
inventory
party
quest
world
```

它主要承担：

```text
logical grouping
key naming scope
subscription/filter grouping
human-facing organization
```

明确：

```text
namespace != permission unit
namespace != replacement unit
namespace != version unit
namespace != conflict unit
namespace != transaction unit
```

v1 不要求预声明 namespace，也不维护 namespace registry。只要 `namespace` / `key` 满足正式 contract 的字符串 grammar，即可形成合法 logical key。

### 6.2 Record

Record 由 `(namespace,key)` 唯一标识：

```ts
interface RealmStateKey {
  readonly namespace: string;
  readonly key: string;
}
```

例如：

```text
player/profile
player/progression
player/economy
inventory/main
quest/main-story
quest/side-001
world/flags
```

**Record 是 v1 的 read/write/version/conflict 基本单位。**

修改：

```text
player/economy
```

只替换 `player/economy` record 的 current value，不影响：

```text
player/profile
player/progression
```

### 6.3 Transaction

Transaction 是原子性单位，可同时修改多个 record，并且 MAY 跨 namespace：

```text
player/economy
+
inventory/main
+
quest/shopping-tutorial
```

可在一个 transaction 中 all-or-nothing commit。

最终固定：

```text
Namespace   = naming / logical-grouping unit
Record      = read/write/version/conflict unit
Transaction = atomicity unit
```

---

## 7. Record Value Replacement

v1 不提供 field-level patch。一个成功 `put` 替换目标 record 的整个 current `JsonValue`。

例如：

```text
inventory/main @ version 15
{
  "potion": 3,
  "pokeball": 8,
  "ether": 2
}
```

把 potion 从 `3` 改为 `2`：

```text
read inventory/main @ version 15
→ construct detached next value
→ conditional put whole value
→ version 16
```

这不是 namespace 全量 replacement，只是单 record whole-value replacement。

v1 不增加：

```text
JSON Patch
JSON Pointer
field merge policy
array-index mutation protocol
field-level version
field-level conflict resolution
```

Record 拆分原则：

> 经常一起读取、一起修改、需要共同维护 invariant 的字段 SHOULD 放入同一 record；生命周期或冲突特征明显不同的数据 SHOULD 拆成不同 record。

例如：

```text
player/profile      name / appearance / identity-like facts
player/progression  level / exp / progression invariants
player/economy      money / economy facts
```

---

## 8. Immutable Initial Value / Mutable Current Value

每个合法 Realm State key 都有两个业务视图：

```text
initialValue
    Game Entry 定义的不可变初始业务值

value
    当前 Session 的可变 authoritative value
```

候选读模型：

```ts
interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly initialValue: JsonValue;
  readonly value: JsonValue;
  readonly version: number;
}
```

### 8.1 Default Semantics

如果 Game Entry 未为某 key 声明 initial record：

```text
initialValue = null
```

新游戏启动时：

```text
value = initialValue
```

因此从未显式 materialize 的合法 key 可逻辑读取为：

```text
initialValue = null
value        = null
version      = 0   // 若正式 contract 采用 0 baseline
```

`null` 是 author-visible canonical empty/unset value；v1 不要求业务作者区分“从未物理 materialize”与“逻辑值为 null”。

### 8.2 Initial Value Is Immutable

`initialValue` 在 Game Entry validation / Realm State bootstrap 时确定，此后整个 Session lifetime：

```text
MUST NOT mutate
MUST NOT be replaced by commit
MUST NOT be affected by current write
MUST NOT be changed by Runtime / Frame / Renderer / Data reconnect
```

Realm State transaction 只能修改 current `value`。

不提供：

```text
setInitial(...)
patchInitial(...)
commitInitial(...)
```

如果业务需要恢复默认值：

```text
read initialValue
→ commit current value = initialValue
```

### 8.3 Initial Value vs Session Start Value

`initialValue` 精确指 **Game Entry 定义的游戏初始基线**，不是“本次 Session 启动时载入的 current value”。

Load Game 必须保持：

```text
Game Entry initial records
    → immutable initialValue

Save snapshot
    → current value seed
```

例如：

```text
Game Entry:
    player/economy.initialValue = { money: 3000 }

Save:
    player/economy.value = { money: 12500 }

Loaded Session:
    initialValue = { money: 3000 }
    value        = { money: 12500 }
```

---

## 9. Materialized Record / Index Semantics

Realm State 的 logical key space 可以包含任意满足 grammar 的 `(namespace,key)`；未 materialize 的 key 仍可按默认 `null / null / version 0` 读取。

但 `list()` 不可能枚举无限的 logical key space，因此它只枚举 **materialized records**。

### 9.1 Materialized Definition

一个 Record 满足以下任一条件，即成为 materialized：

```text
1. Game Entry 显式声明该 initial record；
2. Load Game current seed 显式包含该 record；
3. Runtime 至少一次成功 commit 写入该 record。
```

仅执行：

```text
read(unknownKey)
```

MUST NOT 使 unknownKey materialize，也不得污染 index。

### 9.2 Clear Does Not Forget Identity

`put(null)` 是清空 current value，而不是删除 record identity。

例如：

```text
quest/side-001
version = 4
value = { status: "active" }

put null
→ version = 5
→ value = null
```

此后 `quest/side-001 @ version 5` 仍 MUST 出现在 `list()` 中。

因此：

```text
clear current value != dematerialize record
```

v1 不提供显式“forget record / reset version to 0”的业务操作。

### 9.3 Namespace Is Derived

namespace 不维护独立 registry：

```text
materialized records
    ↓ group by namespace
current namespace view
```

若当前 materialized records 为：

```text
player/profile
player/economy
inventory/main
```

则 index 中自然可观察到：

```text
player
inventory
```

第一次成功写入 `quest/main-story` 后，`quest` 自然进入下一份 index snapshot。

---

## 10. Game Entry Owns Initial Values

新游戏 Realm State 初始业务值属于 **platform-neutral Game Entry**，而不是 `launch.hostra.json`、`launch.pwa.json` 或 Main bootstrap。

候选 Game Entry：

```json
{
  "formatVersion": 1,
  "state": {
    "records": [
      {
        "namespace": "player",
        "key": "profile",
        "value": { "name": "Player" }
      },
      {
        "namespace": "player",
        "key": "economy",
        "value": { "money": 3000 }
      },
      {
        "namespace": "inventory",
        "key": "main",
        "value": {}
      }
    ]
  },
  "initial": {
    "subsystem": "loom.map",
    "input": { "mapId": 1, "spawn": "new-game" }
  },
  "subsystems": [
    { "key": "loom.map" },
    { "key": "loom.battle" }
  ]
}
```

候选 model：

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

Game Entry MAY 省略任意 key；省略精确等价于该 key 的 `initialValue = null`，不要求把所有可能 key 或 namespace 预先枚举。

---

## 11. Runtime Metadata Is Not Game Data

Game Entry MUST NOT 指定：

```text
record version
global revision
transaction id
physical endpoint
credential
```

版本/revision 由 RealmStateAuthority 产生。

候选 v1 基线：

```text
bootstrap baseline revision = 0
all logical key current versions begin at 0
first successful mutation → commit revision 1
changed record version 0 → 1
```

Exact numeric baseline 仍需由正式 contract 冻结，但本设计优先采用 `0 = bootstrap baseline`。

---

## 12. `state` vs `initial.input`

二者必须并存：

```text
state
    Game-level shared business baseline

initial.input
    initial Frame invocation parameters
```

Realm State 的出现不应把所有 Frame 参数搬进共享状态；反之，也不应为了跨 Subsystem 共享而把长期业务事实塞进 `initial.input`。

---

## 13. Launcher PREPARE Projection

Platform Launcher 是 Runtime-product Game Entry consumer，但不是 Realm State authority。

Launcher 只负责：

```text
read Game Entry
→ common validation
→ validate/detach/freeze initial Realm State records
→ preserve them in prepared result
```

Prepared result 应产生平级投影：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: RealmStateGameDefinitionV1;
}
```

```text
Validated Game Entry
          │
          ├─────────────────┐
          ▼                 ▼
LogicalGameBootstrap   Realm State Game Definition
          │                 │
          ▼                 ▼
         Main       RealmStateAuthority bootstrap
```

Realm State payload MUST NOT 塞入 `LogicalGameBootstrap`。

---

## 14. New Game / Load Game Bootstrap

Platform Composition 创建 Realm State authority 时，应形成：

```text
Game-defined initial baseline
+
optional current-state seed
```

候选：

```ts
interface RealmStateSessionBootstrap {
  readonly initial: RealmStateGameDefinitionV1;
  readonly current?: RealmStateCurrentSeed;
}
```

### New Game

```text
Game Entry initial
→ initialValue
→ current value defaults to initialValue
```

### Load Game

```text
Game Entry initial
→ immutable initialValue

validated/migrated Save snapshot
→ current value seed
```

关键不变量：

```text
Save may seed current value
Save MUST NOT redefine initialValue
```

Realm State 不规定 Save 必须保存所有 materialized records；持久化选择属于 Save System policy。

---

## 15. Session Bootstrap Barrier

Realm State 必须在任何 business Runtime side effect 前完成初始化：

```text
read game.json
→ validate Game Entry
→ validate Game-defined Realm State initial values
→ validate current Platform Launch Manifest
→ exact subsystem key-set join
→ executable/content/capability preflight
→ freeze PlatformLaunchPlan
→ freeze LogicalGameBootstrap
→ freeze Realm State game definition
──────────────────────────────────────── PREPARE complete
→ select New Game or validated Load Game current seed
→ create RealmStateAuthority
→ atomically install initial baseline + current seed
→ Realm State READY
→ create/install Runtime-scoped RealmStateClient capabilities
→ run Main / begin RuntimeHosting
→ Subsystem initialize
→ initial Frame
```

必须保持：

```text
first business Runtime side effect
    ⇒ Realm State already initialized and available
```

如果 State validation / initialization 失败，Session startup 必须在 business Runtime side effect 前失败。

---

## 16. Subsystem Author Capability

业务 Definition 仍只依赖 `@loomrealm/subsystem`。

候选 API：

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

业务不得直接依赖 Main、RealmStateAuthority implementation、Desktop IPC、MessagePort/WebSocket 或 storage handle。

### 16.1 No Business ACL in v1

所有当前 Session 内由 Platform/Runner 正常建立、且 Runtime lifetime 仍有效的 `RealmStateClient`：

```text
MAY read any valid RealmStateKey
MAY list materialized records
MAY commit any valid RealmStateKey
MAY subscribe any valid RealmStateKey
```

Host/transport MAY 为 connection ownership、lifetime revocation、logging/tracing/diagnostics 保留 Runtime/subsystem correlation，但该 identity 不进入 Realm State 业务授权语义。

---

## 17. Consistent Read

多 key `read()` MUST 来自同一 logical snapshot：

```ts
interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

例如：

```text
Realm revision = 105
player/economy  version = 8
inventory/main  version = 15
world/flags     version = 20
```

三个 record 必须属于同一个 snapshot，而不是三次独立读取拼出的混合时刻。

所有返回 JsonValue MUST detached / immutable。

---

## 18. Index Snapshot / `list()`

`list()` 提供 **key discovery**，不返回业务 value。

候选 contract：

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

例：

```text
revision = 106

player/profile     version 3
player/economy     version 9
inventory/main     version 16
quest/main-story   version 4
```

### 18.1 Consistency

`list()` MUST 返回一个一致 global revision 下的 materialized-record index；不能一边遍历、一边接受 commit，最后拼出跨 revision 的 key/version 集合。

### 18.2 Flat Contract, Grouped Projection

协议优先采用扁平 `(namespace,key,version)` records；“所有 namespace 以及对应 keys”可以由 consumer 确定性 group：

```text
RealmStateIndexSnapshot.records
    ↓ group by key.namespace
namespace → keys + versions
```

这样无需第二套 namespace registry/model。

### 18.3 `list()` Does Not Return Values

`list()` 不返回：

```text
initialValue
current value
```

需要业务内容时，consumer 再对选中的 keys 执行 `read(keys)`。

典型 Save 流程：

```text
list()
→ discover materialized keys
→ Save policy selects a subset
→ read(selectedKeys)
→ serialize selected current values
```

Realm State 因此只负责“有什么 materialized state”，Save System 决定“哪些应该持久化”。

### 18.4 `list()` and Subsequent `read()`

`list()` 的 revision 与之后 `read()` 的 revision 不要求相同：

```text
list @ revision 100
→ choose keys
→ concurrent commit 101
→ read(selectedKeys) @ revision 101
```

这是合法的，因为 `read()` 自身仍返回一致 snapshot。

如果未来真实 consumer 要求“key 集合与 values 必须来自完全同一 revision”，应另行设计 snapshot token / capture capability；v1 不为该未验证需求引入 MVCC snapshot handle。

---

## 19. Optimistic Transaction Model

Realm State v1 mutation：

```text
consistent read
→ local business computation without lock
→ conditional atomic commit
```

不是：

```text
begin transaction
→ acquire remote locks
→ hold locks while business code runs
→ commit / rollback
```

### 19.1 Read-set / Conditions

```ts
interface RealmStateCondition {
  readonly key: RealmStateKey;
  readonly version: number;
}
```

如果一个 record 的 value 影响本次业务判断，即使最终不写它，也 SHOULD 出现在 conditions/read-set 中。

### 19.2 Write-set

```ts
interface RealmStateTransaction {
  readonly conditions: readonly RealmStateCondition[];

  readonly writes: readonly {
    readonly type: 'put';
    readonly key: RealmStateKey;
    readonly value: JsonValue;
  }[];
}
```

v1 固定：

```text
every write key MUST appear exactly once in conditions
writes MAY be a strict subset of conditions
```

即：

```text
write-set ⊆ read-set
```

未 materialize key 可以先 `read()` 得到 `value=null/version=0`，再以 `version == 0` 作为 first-write condition。

### 19.3 Atomic Authority Step

RealmStateAuthority 在一个短暂原子临界区执行：

```text
validate complete request
→ verify conditions are unique/well-formed
→ verify every write target appears in conditions
→ compare every condition.version with current record.version
→ any mismatch: CONFLICT / zero write
→ otherwise replace every write target current value atomically
→ materialize newly-written records
→ assign one fresh global commit revision
→ assign fresh versions to changed records
→ publish committed change
```

condition check 与 commit 之间不得释放 authority serialization。

### 19.4 Record Version vs Global Revision

```text
per-record version
    optimistic concurrency / conflict detection

global revision
    snapshot identity / total commit order / subscription / diagnostics
```

无关 record 的提交不应导致当前 transaction 冲突，除非 caller 明确把该 record 放入 read-set conditions。

v1 不把 global revision 当作普通 mutation 的全局锁条件。

---

## 20. Commit Result

成功 commit SHOULD 返回 authoritative post-commit metadata：

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

caller 成功后立即知道 commit revision、changed-record new versions 和 authoritative committed values，无需仅为取得新 version 再 read。

返回值 MUST detached / immutable。

---

## 21. Conflict / Retry / Commit Evidence

### 21.1 Conflict

任一 condition version stale：

```text
commit → CONFLICT
```

`CONFLICT` 精确表示：

```text
known no-commit
zero write
```

caller MAY：

```text
fresh read
→ re-run business rules
→ construct a new transaction
→ explicitly retry
```

Realm State MUST NOT 自动重放旧 write-set。

### 21.2 No Long-lived Locks

业务计算期间不持有 RealmStateAuthority 锁。不提供 remote lock token、`beginTransaction()` lock lease、跨 Runtime lock ordering 或 deadlock recovery framework。

### 21.3 Ambiguous Mutation

```text
success response
    → known committed

CONFLICT / explicit pre-commit rejection
    → known no-commit

timeout / connection loss after request may have reached authority
    → applied/not-applied ambiguous unless protocol can prove outcome
```

ambiguous mutation MUST NOT 被映射成 `CONFLICT`，也不得自动 retry。

未来如真实需要，可设计 client transaction id + status query / dedup journal；v1 不提前引入 generic transaction coordinator。

---

## 22. Subscription

Subscription 只观察 authoritative current-value commit：

```text
initial/current baseline snapshot
→ revision N+1 committed change
→ revision N+2 committed change
```

`initialValue` 在 Session 中不可变，因此普通 commit change event 不需要把它当作 changed field。Subscription baseline SHOULD 包含 initial/current 两个视图。

允许：

```text
inventory/main current value changed
world/flags current value changed
party/current current value changed
```

不允许扩张成 generic EventBus：

```text
battleStarted
playSound
openMenu
buttonClicked
```

failed/conflicted transaction MUST NOT 产生 state-change notification。

Subscription baseline 与 subsequent changes 的无缝 linearization/reconnect 细节仍需正式 contract 冻结。

---

## 23. No Authorization Layer in v1

Realm State v1 不定义：

```text
namespace readers / writers
per-subsystem ACL
key-prefix policy
wildcards / deny overrides
dynamic grants / revocation policy
state admin role
```

所有 live Runtime-scoped clients 可访问任意 valid key；Runtime/binding terminal 后既有 client 必须 terminal/inert。

这是 capability 生命周期正确性，不是业务 ACL。

---

## 24. Lifetime

Realm State authority 是 **Session-scoped**：

```text
Session lifetime
    owns Main authority
    owns Realm State authority
    owns immutable initial baseline
    owns mutable current values
    owns materialized record index

Runtime lifetime
    owns SubsystemScope / RealmStateClient capability

Frame lifetime
    owns local Frame Context

Activation lifetime
    owns ordinary input/call-return epoch
```

因此：

```text
Frame suspend        != Realm State unavailable
Frame close          != Realm State deleted
Activation change    != Realm State reset
Renderer reload      != Realm State changed
Data reconnect       != Realm State changed
current value commit != initialValue changed
put(null)            != record identity forgotten
Session terminal     → Realm State terminal
```

---

## 25. Communication Placement

Realm State SHOULD 使用独立 logical protocol，例如：

```text
loomrealm.realm-state/1
```

关系：

```text
many Subsystem Runtimes
        ⇅
Realm State Authority
```

不得塞进：

```text
loomrealm.renderer-data/1
Runtime Control
frame.call()
```

Realm State protocol 至少需要表达：

```text
consistent read
materialized index list
conditional commit
commit result/conflict
subscription baseline/change
terminal/failure
```

物理 transport 可因 Hostra/PWA 不同，但 logical semantics 必须相同。

---

## 26. Interaction with Main / Renderer / Content / `frame.call()`

### Main

Main 不持有具体 records，也不解释 namespace/value/initialValue。系统级关联只限 Session 创建/终止、Runtime lifecycle 与 physical capability revocation。

### Renderer

Renderer v1 不直接成为 Realm State client：

```text
Realm State
→ Subsystem business logic
→ RenderDomain
→ Renderer Store
→ Web Presentation
```

### Content

```text
Content
    immutable installation definitions/resources

Realm State initialValue
    immutable game-defined initial shared business baseline

Realm State value
    mutable current Session shared business facts
```

### `frame.call()`

```text
frame.call()
    control-flow composition

Realm State transaction
    shared-state coordination
```

进入 Battle 仍应 `Map → call(Battle)`；Battle 消耗 Potion 应通过 Realm State transaction 修改 inventory，而不是调用一个 Inventory Frame。

---

## 27. Persistence / Save Game Boundary

Realm State authority 不等于 Save Game 系统。

新游戏：

```text
Game Entry initial records
→ initialValue
→ current value = initialValue
```

读档：

```text
Game Entry initial records
        ↓
immutable initialValue

Persistent Save
→ validate / migrate
→ selected current-value seed
```

Save policy MAY 只保存部分 State；Realm State v1 不要求持久化所有 materialized records。

`list()` 只是发现能力：

```text
Realm State list()
→ all materialized keys + versions
→ Save System chooses subset
→ read(selected keys)
→ persist selected current values
```

Save snapshot 是否保存旧 Session runtime record version/global revision 是未来 Save contract 的问题；默认不得把旧 Session concurrency metadata 当作新 Session authority metadata。

Game 升级时旧 Save 如何映射到当前 Game definition 属于 migration 层；RealmStateAuthority 本身不执行游戏版本 migration。

---

## 28. Physical Platform Realization

### Hostra Desktop candidate

```text
Hostra shell
    ↓
LoomRealm Desktop process
    ├── Main
    ├── RealmStateAuthority
    ├── Content Service
    ├── Data Broker
    └── RuntimeHosting
          ↓
       Subsystem Runner
          ⇅ dedicated Realm State binding
       RealmStateAuthority
```

RealmStateAuthority 与 Main MAY 同进程，但必须是不同 logical owner/API。

### PWA candidate

Realm State 可与 Main 共 Worker，也可独立 Worker；logical semantics 不变。

跨平台要求：

```text
same initialValue semantics
same default-null semantics
same materialized/list semantics
same namespace/record/transaction granularity
same whole-record replacement semantics
same consistent snapshot semantics
same OCC read-set/write-set semantics
same atomic commit/conflict semantics
same no-business-ACL semantics
same terminal/ambiguity semantics
```

---

## 29. Initial Implementation Scope

建议 v1 只实现：

```text
Game Entry inline initial records
omitted initial key → null
immutable initialValue per logical key
new-game current defaults to initial
optional load-game current seed
one RealmStateAuthority per Session
bootstrap-before-runtime barrier
namespace + key records
namespace as naming/grouping only
no namespace registry
materialized-record index
list() consistent index snapshot
read unknown key does not materialize
put(null) keeps record materialized
no business ACL
whole-record current-value put
null as canonical clear/unset
per-record version
monotonic global revision
consistent multi-key read
optimistic read-set version conditions
write-set subset of read-set
conditional atomic multi-record commit
explicit CONFLICT / zero write
post-commit revision+version result
ordered state-change subscription
Runtime-scoped RealmStateClient capability
Desktop in-process authority + explicit transport seam
```

推迟：

```text
ACL / RBAC / per-subsystem state policy
third-party/untrusted Subsystem capability profile
field-level patch
long-lived lock transactions
global-revision default mutation condition
transaction auto-retry
generic transaction coordinator
snapshot token / long-lived MVCC snapshot handle
large external bootstrap source
persistence implementation
schema registry
cross-session sharing
distributed authority
CRDT
automatic merge
Renderer direct access
query language
secondary indexes
generic events
```

---

## 30. Suggested Delivery Order

```text
R1  Architecture closure
    role / authority / lifetime / granularity / initial-current / materialization / OCC / trust semantics

R2  Game Package contract change proposal
    state initial schema + default null + validation + version/compatibility decision

R3  Realm State contract v1
    read / list / conditions / atomic write-set / conflict / subscription / terminal

R4  In-memory reference authority
    deterministic serialized implementation

R5  Launcher prepared projection
    LogicalGameBootstrap + Realm State Game Definition

R6  Subsystem author projection
    scope.state

R7  Hostra Desktop physical binding
    bootstrap barrier + at least two real Subsystem consumers

R8  Failure / reconnect / ambiguous mutation qualification

R9  Save/Load proposal
    selective persistence using list + read
    preserve Game initialValue + restore selected current seed

R10 PWA realization/equivalence
```

---

## 31. Qualification Targets

正式关闭前至少证明：

```text
Bootstrap
- Game Entry state validation has zero business Runtime side effect
- duplicate/oversized/invalid initial record rejects during PREPARE
- omitted initial key reads as null
- validated initial values are detached + immutable
- Realm State initializes before first business Runtime side effect
- Runtime cannot observe partially initialized State

Initial/current
- new game current value equals Game-defined initialValue
- initialValue never changes after runtime commit
- put(null) clears current without changing initialValue
- load-game current seed cannot redefine initialValue

Materialization / index
- explicit Game initial record is materialized
- explicit Load current seed is materialized
- successful first write materializes target record
- read of unknown logical key does not materialize it
- put(null) does not dematerialize an existing record
- list() returns exactly materialized record identities + versions
- list() is one consistent global revision
- namespace view can be derived from listed records; no namespace registry exists

Granularity
- modifying one record does not replace sibling records in same namespace
- record version changes only for changed records
- one transaction may atomically span records/namespaces

Read
- any live Runtime-scoped client may read any valid key
- multi-key read is one consistent revision
- each record exposes immutable initialValue + current value + version
- returned values are detached from internal ownership

Optimistic transaction
- every write target has an observed-version condition
- read-only dependency records may participate in conditions
- write-set is a subset of read-set
- all conditions are checked against one authority state before any write
- one stale condition yields CONFLICT + zero write
- unrelated record commits do not conflict unless caller conditioned on them
- no lock is held while Subsystem performs business computation

Commit
- any live Runtime-scoped client may commit any valid key
- whole-record writes are all-or-nothing
- one successful transaction has one commit revision
- changed records receive authoritative new versions
- success response exposes enough metadata for caller continuation
- concurrent writers serialize deterministically

Trust / lifetime
- no namespace/subsystem ACL is required for v1 conformance
- Runtime terminal revokes/terminates its RealmStateClient
- Session terminal retires authority

Failure
- CONFLICT is known-no-commit
- ambiguous transport loss is distinguishable from CONFLICT
- no automatic retry of conflict or ambiguous mutation

Subscription
- any live Runtime-scoped client may subscribe to any valid key
- baseline exposes initial/current state
- ordered committed current-value revisions
- no notification for failed/conflicted transaction
- subscription remains state observation, not generic event delivery
```

---

## 32. Open Questions

仍需正式冻结：

1. **Game Package schema/version**：reopen current v1 还是引入新的 document version 来承载 `state`？
2. **Key grammar**：`namespace` / `key` 的 exact string grammar、大小写、Unicode 与长度上限是什么？
3. **容量上限**：initial record count、单 record/total payload/depth、read/list/transaction 最大规模是多少？
4. **Version baseline**：是否正式采用 `revision/version = 0` 作为 bootstrap baseline；Load Game 新 Session 是否统一重新从 0 开始？
5. **Subscription linearization**：如何保证 baseline 与后续 change 无 gap；断线后是 fresh subscribe 还是支持 reconnect cursor？
6. **Commit cancellation / ambiguity**：`AbortSignal` 在 commit point 前后如何区分 known-no-commit 与 unknown outcome；是否需要 transaction ID + status query？
7. **Authority fatal**：RealmStateAuthority fatal 是否直接导致 Session terminal？
8. **Save load policy**：Save 未包含某 materialized/logical key 时，Load 是否 fallback 到当前 Game `initialValue`，还是 migration 必须产出完整/明确 current seed？
9. **No-op write**：`put` 与现有 current value deep-equal 时，是仍推进 version/revision，还是作为 no-op？
10. **Transaction shape**：empty conditions/writes、condition-only commit、duplicate keys 等 exact validation/error 规则是什么？
11. **Index ordering**：`list()` records 是否冻结为 `(namespace,key)` 确定性排序，还是 order unspecified？
12. **大型 initial state**：何时需要 Content-derived seed / external source，而不是 inline Game Entry records？

以下问题不再开放：

```text
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

initialValue source
    = platform-neutral Game Entry

omitted initial value
    = null

runtime may mutate initialValue
    = no

new-game current baseline
    = initialValue

Save may redefine initialValue
    = no

Save must persist every Realm State record
    = no

list() enumerates all logical possible keys
    = no

list() enumerates all materialized records
    = yes

read unknown key materializes it
    = no

put(null) dematerializes record
    = no

write may blindly replace a record without observing its version
    = no

write-set may contain a key absent from read-set/conditions
    = no

read-only business dependency may be included in conditions
    = yes

ordinary transaction holds remote locks while business computes
    = no

CONFLICT means known-no-commit
    = yes

Main LogicalGameBootstrap contains state payload
    = no

business Runtime may start before Realm State initialization
    = no
```

---

## 33. Final Invariants

1. Main 继续唯一拥有 Control Authority；
2. Realm State 唯一拥有 Session shared mutable business facts；
3. Subsystem 继续拥有 domain-local execution/state；
4. Content 继续只读；
5. Renderer 不成为第二业务状态 authority；
6. `frame.call()` 继续表示控制流，而不是普通共享状态 RPC；
7. Namespace 只承担 naming/logical grouping，不是 permission/replacement/version/conflict/transaction unit；
8. v1 不要求 namespace registry，不要求 namespace 预声明；
9. `(namespace,key)` Record 是 current value replacement、version、conflict 的基本单位；
10. Transaction 是原子性单位并 MAY 跨 namespace；
11. v1 写入 whole-record replacement，不提供 field-level patch；
12. 每个 key 有 immutable `initialValue` 与 mutable current `value`；
13. Game Entry 未声明 key 时 `initialValue = null`；
14. 新游戏 current `value = initialValue`；
15. Runtime transaction 永远不能修改 `initialValue`；
16. Load Game 可以 seed current value，但不能重定义 Game-defined initialValue；
17. Materialized record 由 Game initial、Load seed 或成功 runtime write 创建；
18. `read()` 未 materialized key 不得改变 materialized index；
19. `put(null)` 清空 current value，但不得忘记 record identity/version history；
20. `list()` 返回一个一致 revision 的全部 materialized `(namespace,key,version)` index；
21. `list()` 不返回业务 value，也不意味着 Save 必须保存所有 listed records；
22. `read(keys)` 返回一个一致 logical snapshot；
23. 每个 record version 是普通 transaction optimistic conflict detection 的依据；
24. 每个 write target 必须携带 caller observed version condition；
25. 影响业务判断但不写入的 record 可以且应该进入 read-set conditions；
26. RealmStateAuthority 必须原子执行 condition check + all writes；
27. 任一 condition stale → `CONFLICT` + zero write；
28. stale transaction 不允许静默 last-write-wins；
29. v1 不持有跨 Runtime 长事务锁；
30. v1 不自动 retry business transaction；
31. `CONFLICT` 与 ambiguous transport failure 必须区分；
32. global revision 用于 snapshot/commit ordering，不作为普通 mutation 的全局锁；
33. Realm State v1 不提供 Subsystem/namespace/key 业务 ACL；
34. 所有 live Runtime-scoped RealmStateClient 均可 read/list/commit/subscribe；
35. Runtime terminal 必须使其 RealmStateClient terminal/inert；
36. 新游戏 initial Realm State 属于 platform-neutral Game Entry，而不是 Hostra/PWA manifest；
37. Launcher PREPARE 只验证/投影初始定义，不拥有 runtime state；
38. Realm State 必须在第一项 business Runtime side effect 前原子初始化完成；
39. `initial.input` 表示 initial Frame 参数，不替代 Session shared state；
40. Game Entry 不指定 record version/global revision 等 runtime authority metadata；
41. subscription 只投影 committed current state，不成为 EventBus；
42. Frame/Activation/Renderer/Data carrier 生命周期不得隐式重置 Realm State；
43. Session terminal 终结 Realm State authority；
44. author capability 通过 `@loomrealm/subsystem` 暴露，不泄漏 transport/platform implementation；
45. Hostra/PWA 可以物理不同，但 logical Realm State semantics、initial/current/materialization/index/OCC/no-ACL semantics 必须一致；
46. Save/Load 是独立 bootstrap/persistence 能力，不与 Realm State runtime authority 混为一体。

---

## 34. Architectural Summary

```text
                        Game Entry
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
    LogicalGameBootstrap       Realm State Initial Definition
              │                         │
              ▼                         │
            Main                        │
      Control Authority                 │
                                        ▼
Save (optional) ─ current seed ─→ RealmStateAuthority
                              Shared Business Authority
                                  │
                                  ├─ initialValue (immutable)
                                  ├─ value        (mutable)
                                  ├─ record version
                                  ├─ materialized index
                                  └─ global revision
                                           │
                     ┌─────────────────────┼─────────────────────┐
                     │                     │                     │
                     ▼                     ▼                     ▼
                 read(keys)              list()              subscribe(keys)
             consistent values      keys + versions        committed changes
                     │
                     ▼
              local computation
                     │
          conditions(read-set versions)
               + writes(write-set)
                     │
                     ▼
             RealmStateAuthority
        atomic condition check + commit
```

核心粒度：

```text
Namespace
    naming / logical grouping only

Record (namespace + key)
    initialValue + current value + version
    replacement / conflict unit

Materialized Index
    current known record identities + versions
    one consistent global revision

Read Snapshot
    one global revision + selected values + observed record versions

Transaction
    read-set version conditions + write-set
    write-set ⊆ read-set
    multi-record atomicity unit
```

v1 的设计重点是：**把必须由框架保证的共享状态 correctness 做强，把持久化策略、业务 ACL、schema/query 等没有真实消费者证明必要性的能力留在 Realm State core 之外。**
