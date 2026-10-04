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
4. 缺少 `state` 的既有 Game Entry 继续合法，并等价于空的 Realm State initial definition；
5. Platform Launcher 在 PREPARE 阶段验证并投影 Game Entry state，但不是 runtime State authority；
6. Realm State 必须在任何 business Runtime side effect 前初始化完成；
7. `namespace` 只承担逻辑分组与命名，不是权限、更新、版本、冲突或事务单位；
8. `(namespace,key)` Record 是读写、版本与冲突基本单位；
9. Transaction 是跨 Record 的原子提交单位，并且 MAY 跨 namespace；
10. v1 写入采用 whole-record replacement，不提供 field-level patch；
11. 每个 logical key 同时具有 immutable `initialValue` 与 mutable current `value`；
12. Game Entry 未声明 key 时 `initialValue = null`；新游戏 current `value = initialValue`；
13. Runtime transaction 永远不能修改 `initialValue`；
14. `revision` 与所有 Record `version` 在新 Session bootstrap 时从 `0` 开始；
15. Load Game 创建新的 Session / RealmStateAuthority 时，旧 Session 的 runtime revision/version 不继承，新 Session 重新从 `0` 开始；
16. 多 key `read()` 返回同一 logical snapshot；
17. mutation 采用 optimistic concurrency control（OCC）：read-set version conditions + atomic write-set；
18. 每个 write target MUST 出现在 read-set/conditions 中；read-set MAY 包含只读但影响业务判断的 Record；
19. 任一 observed version stale，整个 transaction 返回 `CONFLICT` 且 zero write；
20. v1 不提供跨 Runtime 长生命周期锁事务，也不自动重试业务 transaction；
21. Realm State v1 不提供 Subsystem / namespace / key 级业务 ACL；所有 live Runtime-scoped `RealmStateClient` 均可 read/list/commit/subscribe；
22. `list()` 返回当前 materialized Records 的 `(namespace,key,version)` 一致索引快照，不返回 value；
23. Save System 不要求保存所有 State；Save 可以只持久化自己选择的部分 current values；
24. Load Game 使用 **sparse current-value override**：Save 中存在的 key 覆盖 current value；Save 中缺失的 key 回退到当前 Game `initialValue`；
25. Save 中“record absent”和“record present with `value = null`”语义不同；后者表示 current value 明确为 null；
26. RealmStateAuthority fatal 是 Session 级 fatal infrastructure failure，直接导致 Session terminal；
27. v1 不考虑大型 external / Content-derived initial state，初始 State 仅支持 Game Entry inline records。

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

`frame.call()` 表达控制流，不应承担普通跨 Subsystem 共享状态读写。

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

它不负责强制：

```text
Battle 只能写 battle-owned data
Menu 不得修改 player profile
Quest 只能访问 quest namespace
```

这类业务 ownership 由 game-lib API、共享 key 常量/types、测试、代码审查和业务 invariant 保证。

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

Record identity：

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
world/flags
```

**Record 是 read/write/version/conflict 单位。**

### 5.3 Transaction

Transaction 是 atomicity unit，可以跨 Record / namespace：

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

## 6. Record Value Model

候选读模型：

```ts
interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly initialValue: JsonValue;
  readonly value: JsonValue;
  readonly version: number;
}
```

### 6.1 Initial Value

`initialValue` 来自当前 Game Entry 的 initial definition，并在整个 Session lifetime 内不可变：

```text
MUST NOT mutate
MUST NOT be replaced by commit
MUST NOT be affected by current write
MUST NOT be changed by Runtime / Frame / Renderer / Data reconnect
```

如果 Game Entry 未声明某 key：

```text
initialValue = null
```

### 6.2 Current Value

新游戏：

```text
value = initialValue
```

Runtime transaction 只能替换 current `value`。

v1 一个成功 `put` 替换目标 Record 整个 JsonValue，不提供 JSON Patch / field merge / field version。

### 6.3 Logical Default

从未显式 materialize 的合法 key 可逻辑读取为：

```text
initialValue = null
value        = null
version      = 0
```

### 6.4 Clear

`put(null)` 表示清空 current value：

```text
current value = null
```

但不会修改 `initialValue`，也不会删除 Record identity 或重置 version。

---

## 7. Materialized Record / Index

Realm State logical key space 不要求预注册，因此 `list()` 只枚举 **materialized records**。

一个 Record 满足以下任一条件即 materialized：

```text
1. Game Entry 显式声明该 initial record；
2. Load Game sparse current seed 显式包含该 record；
3. Runtime 至少一次成功 commit 写入该 record。
```

单纯：

```text
read(unknownKey)
```

MUST NOT materialize Record。

`put(null)` 对已 materialized Record 也不会 dematerialize。

namespace view 由 materialized Records 自然 group 得到，不存在独立 NamespaceRegistry。

---

## 8. Game Entry v1 Initial State

### 8.1 Version Decision

**Realm State 不引入 Game Entry v2。**

正式 Game Package contract 应直接修改现有 `GameEntryV1` closed schema，使 `state` 成为 optional field：

```ts
interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly state?: RealmStateGameDefinitionV1;
  readonly initial: InitialFrameTargetV1;
  readonly subsystems: readonly SubsystemDescriptorV1[];
}
```

这意味着：

```text
existing v1 without state
    → still valid
    → equivalent to empty Realm State initial definition

v1 with state
    → validates optional Realm State initial records
```

该决定是本架构提案的设计结论；当前正式 Game Package v1 closed schema 尚未实现这一修改，因此正式 contract/source/tests 仍需后续同步更新。

### 8.2 State Shape

候选：

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

示例：

```json
{
  "formatVersion": 1,
  "state": {
    "records": [
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
    "input": { "mapId": 1 }
  },
  "subsystems": [
    { "key": "loom.map" },
    { "key": "loom.battle" }
  ]
}
```

如果整个 `state` 字段缺失：

```text
initial definition = empty
```

任意未声明 key 仍拥有 logical default `initialValue = null`。

### 8.3 Inline Only

v1 只考虑 Game Entry inline initial records。

当前明确不考虑：

```text
external state file
Content-derived seed
streaming initial state
large-state loader
```

如果未来出现真实大型 initial-state consumer，再单独扩展。

---

## 9. Runtime Metadata Baseline

Game Entry MUST NOT 指定：

```text
record version
global revision
transaction id
physical endpoint
credential
```

正式采用：

```text
new Session bootstrap:
    global revision = 0
    every logical/materialized record version = 0

first successful mutation:
    global revision 0 → 1
    changed record version 0 → 1
```

version/revision 属于当前 `RealmStateAuthority` 的 runtime concurrency metadata。

因此 Load Game 即使来自旧 Session：

```text
old save source session:
    revision = 3821
    player/economy version = 57
```

建立新 Session 时仍是：

```text
new RealmStateAuthority:
    revision = 0
    loaded player/economy version = 0
```

旧 Session concurrency metadata 不继承。

---

## 10. `state` vs `initial.input`

二者必须并存：

```text
state
    Game-level shared business baseline

initial.input
    initial Frame invocation parameters
```

Realm State 不应吞并 Frame 参数；长期共享事实也不应塞进 `initial.input`。

---

## 11. Launcher PREPARE / Session Bootstrap

Platform Launcher 是 Game Entry consumer，但不是 Realm State authority。

PREPARE：

```text
read game.json
→ validate Game Entry v1 including optional state
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

`Realm State` payload MUST NOT 塞进 `LogicalGameBootstrap`。

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

必须保持：

```text
first business Runtime side effect
    ⇒ Realm State READY
```

---

## 12. New Game / Load Game

### 12.1 New Game

```text
Game initial
    → initialValue
    → current value = initialValue
```

### 12.2 Load Game = Sparse Current Override

Load Game 使用：

```text
current Game initial baseline
+
Save sparse current overrides
```

规则：

```text
Save contains key
    → current value = Save value

Save does not contain key
    → current value = current Game initialValue
```

例如：

```text
Current Game:
A initial = 1
B initial = 2
C initial = 3

Save:
A = 10
C = null

Loaded Session:
A = 10
B = 2
C = null
```

必须区分：

```text
Save record absent
    → fallback to Game initialValue

Save record present with value = null
    → explicit current null
```

Save MUST NOT redefine `initialValue`。

Game 升级后新增 initial key 时，旧 Save 未包含该 key，将自然获得当前 Game 定义的 initialValue；更复杂的不兼容变化仍由 Save migration 层负责。

---

## 13. Subsystem Author Capability

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

所有 live Runtime-scoped `RealmStateClient` 可访问任意 valid key；v1 没有业务 ACL。

业务不得直接依赖 RealmStateAuthority implementation、Desktop IPC、MessagePort/WebSocket 或 storage handle。

---

## 14. Consistent Read

```ts
interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

多 key `read()` MUST 来自一个 logical revision：

```text
revision = 105
player/economy version = 8
inventory/main version = 15
world/flags version = 20
```

不能把不同 revision 的多次 point read 拼成一致 snapshot。

返回 JsonValue MUST detached / immutable。

---

## 15. Index Snapshot / `list()`

`list()` 用于 key discovery，不返回业务 value。

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

`list()` MUST 返回同一个 global revision 的全部 materialized Record identities + versions。

它不返回：

```text
initialValue
current value
```

典型 Save 流程：

```text
list()
→ discover materialized keys
→ Save policy selects subset
→ read(selectedKeys)
→ persist selected current values
```

`list()` 不意味着 Save 必须保存所有 listed Records。

`list()` revision 与随后 `read()` revision 不要求一致；如果未来需要同 revision 的完整 key+value capture，再基于真实需求设计 snapshot token / capture capability，v1 不提前引入 MVCC snapshot handle。

---

## 16. Optimistic Transaction Model

Mutation 流程：

```text
consistent read
→ local business computation without lock
→ conditional atomic commit
```

### 16.1 Read-set / Conditions

```ts
interface RealmStateCondition {
  readonly key: RealmStateKey;
  readonly version: number;
}
```

所有影响本次业务决策的 Record SHOULD 进入 conditions，即使最终不写该 Record。

### 16.2 Write-set

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

固定：

```text
every write key MUST appear exactly once in conditions
write-set ⊆ read-set
```

未 materialized key 可以先读到：

```text
value = null
version = 0
```

再以 `version == 0` 作为 first-write condition。

### 16.3 Atomic Authority Step

```text
validate complete request
→ verify conditions / writes shape
→ compare every condition.version against one current authority state
→ any mismatch: CONFLICT / zero write
→ otherwise atomically replace all target current values
→ materialize newly-written Records
→ assign one fresh global commit revision
→ assign fresh versions to changed Records
→ publish committed change
```

condition check 与 commit 之间不得释放 authority serialization。

### 16.4 Per-record Version vs Global Revision

```text
record version
    optimistic conflict detection

global revision
    snapshot identity / total commit order / subscription / diagnostics
```

普通 transaction 不要求 global revision 未变化，因此无关 Record 的提交不会制造无意义冲突。

---

## 17. Commit Result / Conflict / Failure

成功 commit SHOULD 返回 post-commit metadata：

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

### Conflict

```text
CONFLICT
    = known no-commit
    = zero write
```

caller 可以 fresh read → recompute → 构造新 transaction → 显式 retry。

Realm State MUST NOT 自动重放旧 write-set。

### No Long-lived Locks

Subsystem 业务计算期间不持有 authority lock。

不提供：

```text
beginTransaction() remote lock
lock lease
cross-Runtime lock ordering
deadlock recovery framework
```

### Ambiguous Mutation

```text
success response
    → known committed

CONFLICT / explicit pre-commit rejection
    → known no-commit

timeout / connection loss after request may have reached authority
    → possibly committed / ambiguous
```

ambiguous MUST NOT 被伪装成 `CONFLICT`，也不得自动 retry。

Commit cancellation / AbortSignal 的精确 commit-point 语义仍属于剩余缺口，见 Open Questions。

---

## 18. Subscription

Subscription 只观察 authoritative current-value commit：

```text
baseline snapshot @ revision N
→ committed change N+1
→ committed change N+2
```

Subscription 不是 generic EventBus。

允许：

```text
inventory/main current value changed
world/flags current value changed
```

不允许：

```text
battleStarted
playSound
buttonClicked
```

failed/conflicted transaction MUST NOT 产生 state-change notification。

Baseline 与 subsequent changes 如何无 gap linearize，以及断线后如何恢复，仍是剩余 contract 缺口。

---

## 19. No Authorization Layer in v1

Realm State v1 不定义：

```text
namespace readers / writers
per-subsystem ACL
key-prefix policy
wildcards / deny overrides
dynamic grants / revocation policy
state admin role
```

Runtime/binding terminal 后既有 RealmStateClient 必须 terminal/inert。

这属于 capability lifetime correctness，不是业务 ACL。

---

## 20. Lifetime / Fatal Policy

Realm State authority 是 Session-scoped：

```text
Session lifetime
    owns Main authority
    owns Realm State authority
    owns immutable initial baseline
    owns mutable current values
    owns materialized index

Runtime lifetime
    owns RealmStateClient capability

Frame lifetime
    owns Frame Context

Activation lifetime
    owns ordinary input/call-return epoch
```

保持：

```text
Frame suspend        != State unavailable
Frame close          != State deleted
Activation change    != State reset
Renderer reload      != State changed
Data reconnect       != State changed
put(null)            != record identity forgotten
Runtime terminal     → its RealmStateClient terminal
Session terminal     → RealmStateAuthority terminal
```

正式决定：

```text
RealmStateAuthority fatal
    → Session terminal
```

原因：Realm State 是 Session shared business facts 的唯一 authority；v1 不设计 transparent authority restart / journal replay / client reattach。

---

## 21. Communication Placement

Realm State SHOULD 使用独立 logical protocol，例如：

```text
loomrealm.realm-state/1
```

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

协议至少需要表达：

```text
consistent read
materialized index list
conditional commit
commit result/conflict
subscription baseline/change
terminal/failure
```

---

## 22. Interaction with Main / Renderer / Content / `frame.call()`

### Main

Main 不持有具体 State Records，也不解释 namespace/value/initialValue。

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
    immutable game-defined initial business baseline

Realm State value
    mutable current Session facts
```

### `frame.call()`

```text
frame.call()
    control-flow composition

Realm State transaction
    shared-state coordination
```

进入 Battle 仍应 `Map → call(Battle)`；Battle 消耗 Potion 应通过 State transaction 修改 inventory，而不是调用一个 Inventory Frame。

---

## 23. Persistence / Save Boundary

Realm State authority 不等于 Save Game 系统。

Save System 可以选择只保存部分 State：

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

缺失 key 自动 fallback 到当前 Game initialValue；显式 `null` 是真正的 current null。

Save 不应把旧 Session runtime revision/version 当作新 Session concurrency metadata。

---

## 24. Physical Platform Realization

### Desktop candidate

```text
LoomRealm Desktop process
├─ Main
├─ RealmStateAuthority
├─ Content Service
├─ Data Broker
└─ RuntimeHosting
      ↓
   Subsystem Runner
      ⇅ Realm State binding
   RealmStateAuthority
```

RealmStateAuthority 与 Main MAY 同进程，但必须保持不同 logical owner/API。

### PWA candidate

Realm State 可以与 Main 共 Worker，也可独立 Worker；logical semantics 必须与 Desktop 等价。

---

## 25. v1 Initial Implementation Scope

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
one RealmStateAuthority per Session
bootstrap-before-runtime barrier
namespace + key Records
no namespace registry
materialized record index
list() consistent index snapshot
read unknown key does not materialize
put(null) keeps Record materialized
no business ACL
whole-record put
consistent multi-key read
optimistic read-set version conditions
write-set ⊆ read-set
atomic multi-record commit
explicit CONFLICT / zero write
post-commit revision/version result
ordered state-change subscription
Runtime-scoped RealmStateClient
RealmStateAuthority fatal → Session terminal
Desktop in-process authority + explicit transport seam
```

不实现 / 延后：

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

## 26. Qualification Targets

正式关闭前至少证明：

```text
Game Entry / Bootstrap
- existing GameEntryV1 without state remains valid
- optional state validates as part of GameEntryV1
- duplicate/invalid/oversized initial records reject during PREPARE
- State is READY before first business Runtime side effect

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

Read / Transaction
- multi-key read is one consistent revision
- every write target has observed-version condition
- read-only dependency may enter conditions
- stale condition → CONFLICT + zero write
- writes are all-or-nothing
- unrelated Record commits do not conflict unless conditioned upon

Lifetime / Failure
- Runtime terminal terminates its client
- RealmStateAuthority fatal terminates Session
- CONFLICT and ambiguous transport outcome remain distinguishable

Subscription
- no event for failed/conflicted transaction
- committed changes are ordered
- subscription remains State observation, not generic EventBus
```

---

## 27. Remaining Open Questions

以下是当前 Realm State v1 **仍未冻结的完整主要缺口**：

### 27.1 Key Grammar

需要定义：

```text
namespace/key 是否允许空字符串
exact Unicode policy
case sensitivity
是否 trim / normalize
UTF-8 / character length bounds
```

目标是让不同 transport / platform 对“同一个 key”有完全一致的 identity 解释。

### 27.2 Capacity Limits

需要冻结合理上限，例如：

```text
initial record count
single JsonValue encoded size
total initial State size
JSON depth
read key count
list materialized-record count / response size
transaction condition count
transaction write count
transaction total payload size
subscription key count
```

这是 protocol/resource boundedness，而不是业务功能。

### 27.3 Subscription Linearization / Reconnect

需要定义如何保证：

```text
baseline @ N
→ N+1
→ N+2
```

中间绝不漏 commit。

同时还要决定断线后：

```text
fresh subscribe + fresh baseline
```

还是支持 reconnect cursor / replay。

v1 倾向前者，但尚未正式冻结。

### 27.4 Commit Cancellation / Ambiguous Outcome

需要定义 `AbortSignal` / timeout 在 commit linearization point 前后的语义：

```text
cancel before authority accepts
    → known no-commit ?

authority may already commit but response lost
    → ambiguous outcome
```

还要决定 v1 是否只暴露 ambiguous failure，还是引入 client transaction ID + status query / dedup journal。

### 27.5 No-op Write

需要决定：

```text
current = { money: 100 }
put { money: 100 }
```

是否仍视为成功 mutation：

```text
record version + 1
global revision + 1
subscription change
```

还是 authority deep-equal 后作为 no-op。

### 27.6 Transaction Shape Validation

需要冻结：

```text
empty conditions 是否合法
empty writes 是否合法
condition-only commit 是否合法
duplicate condition key 如何报错
duplicate write key 如何报错
write key 缺少 condition 如何报错
error taxonomy
```

### 27.7 `list()` Ordering

需要决定 `RealmStateIndexSnapshot.records`：

```text
按 (namespace,key) 确定性排序
```

还是：

```text
order unspecified
```

这主要影响测试、调试、序列化稳定性与跨平台等价性。

---

## 28. 已关闭、不再开放的设计问题

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

Save must persist every Realm State record
    = no

list() enumerates all logical possible keys
    = no

list() enumerates all materialized Records
    = yes

read unknown key materializes it
    = no

put(null) dematerializes Record
    = no

write may blindly replace without observing version
    = no

write-set may contain key absent from conditions
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

## 29. Final Invariants

1. Main 唯一拥有 Control Authority；
2. Realm State 唯一拥有 Session shared mutable business facts；
3. Subsystem 拥有 domain-local execution/state；
4. Content 保持只读；
5. Renderer 不成为第二业务状态 authority；
6. `frame.call()` 表示控制流，不承担普通 State RPC；
7. Namespace 只承担 naming/logical grouping；
8. `(namespace,key)` Record 是 current replacement/version/conflict 单位；
9. Transaction 是 atomicity unit，可跨 namespace；
10. 每个 key 有 immutable initialValue 与 mutable current value；
11. 缺失 initial key 的 initialValue = null；
12. GameEntryV1 的 `state` optional，缺失等价于 empty initial definition；
13. State 直接纳入 GameEntryV1，不因该功能升级 formatVersion；
14. New Game current = initialValue；
15. Load Game 使用 sparse current override，Save absent → current Game initialValue；
16. Save explicit null != Save absent；
17. Runtime transaction 永远不能修改 initialValue；
18. 每个新 Session 的 global revision 和 Record versions 从 0 开始；
19. 旧 Save 不继承旧 Session concurrency metadata；
20. materialization 只来自 explicit initial、explicit load seed 或 successful write；
21. read unknown key 不 materialize；
22. put(null) 不遗忘 Record identity；
23. list() 返回一个一致 revision 的 materialized Record index，不返回 value；
24. Save 不要求保存所有 listed Records；
25. read(keys) 返回一致 logical snapshot；
26. 每个 write target 必须有 caller observed version condition；
27. read-only business dependencies 可以进入 conditions；
28. Authority 原子执行 condition check + all writes；
29. stale condition → CONFLICT + zero write；
30. v1 不持有跨 Runtime 长事务锁，不自动 retry；
31. CONFLICT 与 ambiguous failure 必须区分；
32. Realm State v1 不提供业务 ACL；
33. live Runtime-scoped client 可 read/list/commit/subscribe；
34. Runtime terminal 使其 client terminal/inert；
35. RealmStateAuthority fatal → Session terminal；
36. Realm State 必须在第一项 business Runtime side effect 前 READY；
37. initial State v1 只支持 Game Entry inline records；
38. Hostra/PWA physical realization 可以不同，但上述 logical semantics 必须一致。

---

## 30. Architectural Summary

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

Read Snapshot
    one revision + selected values + versions

Transaction
    read-set version conditions + write-set
    multi-record atomicity
```

当前大架构已经基本闭合；剩余工作主要是把 key grammar、resource limits、subscription linearization、commit ambiguity、no-op write、transaction shape 与 list ordering 冻结成精确 contract。