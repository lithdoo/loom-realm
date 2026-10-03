# Realm State：Session 级共享业务状态系统

> 层级：系统架构  
> 状态：Proposal / Active Design  
> 稳定程度：Evolving / **Not Implemented / Not Contract Frozen / Not Qualified**  
> 主要定义：Session 级共享业务状态 authority、Game Entry 初始状态、immutable initial value、namespace/record/transaction 粒度、RealmStateBootstrap、Subsystem 访问 capability、事务/版本/订阅语义、生命周期与平台边界  
> 依赖：[系统架构总览](./system-overview.md)、[模块子系统模型](./subsystem-model.md)、[栈式运行系统](./stack-runtime-system.md)、[存储与内容系统](./storage-system.md)、[通信系统](./communication-system.md)、[Game Package v1](../15-contracts/game-package-v1.md)  
> 最近复核：2026-10-04

本文记录 LoomRealm 当前架构中已识别的一项设计缺口及候选解决方向：在 `Main` 的控制权威与各 `Subsystem Runtime` 的局部业务状态之间，缺少一个 **Session 级、跨 Subsystem、可变业务状态的唯一 authority**。

本文同时固定以下架构方向：

1. 新游戏 Realm State 的初始业务值属于 platform-neutral Game Entry；
2. Platform Launcher 在 PREPARE 阶段验证并投影 Game Entry state；
3. Platform Composition 必须先建立并初始化 Realm State authority，才允许任何 business Runtime side effect；
4. `namespace` 只承担逻辑分组/授权边界，不是更新、版本或事务单位；
5. `record = namespace + key` 是读写、版本与冲突的基本单位；
6. `transaction` 是跨 record 的原子提交单位，并且 MAY 跨 namespace；
7. v1 写入是 whole-record value replacement，不提供 field-level patch；
8. 每个 key 同时具有不可变 `initialValue` 与可变 `value`；未在 Game Entry 中声明初始值时 `initialValue = null`；
9. 新游戏的 `value` 初始等于 `initialValue`；读档只恢复 current `value`，不得修改 Game Entry 定义的 `initialValue`。

本文仍是架构提案，不改变现有 Frozen contracts，也不宣称存在对应生产实现。尤其当前 Game Package v1 是 closed schema，尚不接受 `state` 字段；正式实现前必须通过 ADR / contract revision 明确兼容与版本策略。

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

随着 Map、Battle、Menu、Quest、Inventory 等领域增加，会出现不能自然归属于任一 Subsystem 的运行期事实：

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

结论：当前架构需要一个独立的 **Session Shared Business State Authority**。

---

## 2. Design Goal

新增逻辑角色：

```text
Realm State
    = Session-scoped shared mutable business-state authority
```

目标：

1. 为跨 Subsystem 的运行期业务状态提供唯一 owner；
2. 允许多个 Subsystem 显式读取/修改；
3. 保证多 record 原子 commit；
4. 支持 per-record version、冲突检测和一致 snapshot；
5. 支持 immutable initial value 与 mutable current value；
6. 支持只观察 authoritative commit 的 subscription；
7. 独立于 Frame / Activation / Renderer / Data carrier 生命周期；
8. 保持 Hostra/PWA logical semantics 一致；
9. 提供确定的新游戏/读档初始化 barrier；
10. 不把 Main、Content、Renderer 或 `frame.call()` 扩张成通用业务状态系统。

核心原则：

> 一个 application fact 只有一个 authoritative owner；物理 host、transport、cache、projection 或 consumer 不得复制第二份 authority。

---

## 3. Non-goals

Realm State v1 不应成为：

```text
global mutable JavaScript object
generic EventBus
service locator
Redux-like reducer registry
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
```

禁止：

```ts
scope.globalState.foo.bar = value;
```

直接共享可变对象会消除 authority、commit、conflict 与 failure 边界。

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
    ├── per-record versions
    ├── global commit revision
    ├── atomic transactions
    └── subscriptions to committed state

Subsystem
    Domain Execution / Local State Authority

Content
    Readonly Definition Authority

Renderer
    Readonly Presentation Replica / Input Producer
```

Main 与 Realm State 是同一 Session 下的两个不同逻辑 authority：

```text
Main owns "who is running / active / authorized"
Realm State owns "what shared game facts currently are"
```

Realm State MUST NOT 被实现为 Main 内部任意业务字段集合。

---

## 5. State Classification

### 5.1 Subsystem-local State

继续由对应 Subsystem 拥有：

```text
Battle current tick
Battle event queue
Battle cast progress
Map local movement interpolation
Schema Form local editing session
```

### 5.2 Realm State

代表当前 Game Session 的跨领域业务事实：

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

`namespace` 是逻辑 domain / authorization boundary，例如：

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
authorization boundary
key naming scope
subscription/filter grouping
future bounded policy scope
```

明确：

```text
namespace != replacement unit
namespace != version unit
namespace != conflict unit
namespace != transaction unit
```

Realm State 不存在“更新 player namespace 就必须全量提交 player 下所有数据”的要求。

### 6.2 Record

`record` 由 `(namespace,key)` 唯一标识：

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

**Record 是 v1 的读写、版本和冲突基本单位。**

例如修改：

```text
player/economy
```

只替换 `player/economy` record 的 current value，不影响：

```text
player/profile
player/progression
```

### 6.3 Transaction

`transaction` 是原子性单位，可以同时修改多个 record，并且 MAY 跨 namespace：

```text
player/economy
+
inventory/main
+
quest/shopping-tutorial
```

可在一个 transaction 中 all-or-nothing commit。

因此固定：

```text
Namespace   = authorization / logical-domain unit
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

把 potion 从 `3` 改为 `2` 时，author 读取 detached snapshot，生成新的完整 record value，然后 conditional put：

```text
inventory/main @ version 15
→ put {
     "potion": 2,
     "pokeball": 8,
     "ether": 2
   }
→ version 16
```

这不是 namespace 全量 replacement，只是一个 record 的 whole-value replacement。

v1 不增加：

```text
JSON Patch
JSON Pointer
field merge policy
array-index mutation protocol
field-level version
field-level conflict resolution
```

如果 record 太大或不同字段的 writer/更新频率明显不同，应通过合理拆分 record 降低 conflict domain，而不是先发明 patch framework。

Record 拆分原则：

> 经常一起读取、一起修改、需要共同维护 invariant 的字段 SHOULD 放入同一 record；writer、生命周期或冲突特征明显不同的数据 SHOULD 拆成不同 record。

例如：

```text
player/profile      name / appearance / identity-like facts
player/progression  level / exp / progression invariants
player/economy      money / economy facts
```

而不是一个巨型 `player/all`，也不是把每个 primitive field 都拆成独立 record。

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

因此未声明 key 在新游戏中的默认语义是：

```text
initialValue = null
value        = null
```

`null` 是 author-visible 的 canonical empty/unset value；v1 不要求业务作者区分“从未物理 materialize”与“逻辑值为 null”。

### 8.2 Initial Value Is Immutable

`initialValue` 在 Game Entry validation / Realm State bootstrap 时确定，此后在整个 Session lifetime 内：

```text
MUST NOT mutate
MUST NOT be replaced by commit
MUST NOT be affected by reset/current write
MUST NOT be changed by Runtime/Frame/Renderer/Data reconnect
```

Realm State transaction 只能修改 `value`。

不提供：

```text
setInitial(...)
patchInitial(...)
commitInitial(...)
```

如果业务需要恢复默认值，可以：

```text
read initialValue
→ commit current value = initialValue
```

这是普通 current-state transaction，不是 initial-state mutation。

### 8.3 Initial Value vs Session Start Value

`initialValue` 精确指 **Game Entry 定义的游戏初始基线**，不是“本次 Session 启动时碰巧载入的 current value”。

因此读档必须保持：

```text
Game Entry initial records
    → immutable initialValue

Save snapshot
    → current value seed
```

而不是把 Save snapshot 覆盖为新的 initial value。

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

这样 Subsystem 可以稳定比较：

```text
current vs game-defined initial baseline
```

而不受 New Game / Load Game 启动来源影响。

---

## 9. Game Entry Owns Initial Values

新游戏 Realm State 的初始业务值属于 **platform-neutral Game Entry**，而不是 `launch.hostra.json`、`launch.pwa.json` 或 Main bootstrap。

候选 Game Entry：

```json
{
  "formatVersion": 1,
  "state": {
    "records": [
      {
        "namespace": "player",
        "key": "profile",
        "value": {
          "name": "Player"
        }
      },
      {
        "namespace": "player",
        "key": "economy",
        "value": {
          "money": 3000
        }
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
    "input": {
      "mapId": 1,
      "spawn": "new-game"
    }
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

这里的 `value` 在进入 Realm State authority 后成为该 key 的 `initialValue`。

Game Entry MAY 省略某个 key；省略精确等价于：

```text
initialValue = null
```

不要求把所有可能 key 预先枚举为显式 null record。

---

## 10. Runtime Metadata Is Not Game Data

Game Entry MUST NOT 指定：

```text
record version
global revision
transaction id
physical endpoint
credential
```

版本/revision 由 RealmStateAuthority 产生。

候选 v1 基线建议：

```text
bootstrap baseline revision = 0
all logical key current versions begin at 0
first successful mutation → commit revision 1
changed record version 0 → 1
```

对未 materialize 的 key，可逻辑视为：

```text
initialValue = null
value = null
version = 0
```

实现不需要为无限 key 空间预创建物理 record；这是 author-visible logical default。

Exact numeric baseline 仍需由正式 contract 冻结，但本设计优先采用 `0 = bootstrap baseline`，以区分初始化与运行期 commit。

---

## 11. `state` vs `initial.input`

二者必须并存：

```text
state
    Game-level shared business baseline

initial.input
    initial Frame invocation parameters
```

例如：

```text
state.player/profile
    "这个游戏初始玩家是谁"

initial.input.mapId
    "initial Frame 从哪张地图开始"
```

Realm State 的出现不应把所有 Frame 参数搬进共享状态；反之，也不应为了跨 Subsystem 共享而把长期业务事实塞进 `initial.input`。

---

## 12. Launcher PREPARE Projection

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

概念关系：

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

Hostra/PWA Launcher 对同一个 Game Entry 必须产生等价 initial-state definition；平台差异只存在于 executable/capability realization。

---

## 13. New Game / Load Game Bootstrap

Platform Composition 最终创建 Realm State authority 时，应形成两个概念输入：

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

对于 Save 未提供的 key，current seed SHOULD 默认使用 Game-defined `initialValue`；确切 migration/partial-save policy 由未来 Save contract 冻结。

关键不变量：

```text
Save may seed current value
Save MUST NOT redefine initialValue
```

---

## 14. Session Bootstrap Barrier

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

## 15. Subsystem Author Capability

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

`read()` 返回的 record MUST 同时提供：

```text
initialValue
value
version
```

所有返回 JsonValue MUST detached / immutable。

业务不得直接依赖 Main、RealmStateAuthority implementation、Desktop IPC、MessagePort/WebSocket 或 storage handle。

---

## 16. Consistent Read

多 key read MUST 来自同一 logical snapshot：

```ts
interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

例如：

```ts
const snapshot = await state.read([
  { namespace: 'player', key: 'profile' },
  { namespace: 'inventory', key: 'main' },
  { namespace: 'party', key: 'current' }
]);
```

即使某个 key 从未在 Game Entry 或运行期显式 materialize，也必须返回 logical default：

```text
initialValue = null
value = null
version = 0   // 若正式 contract 采用 0 baseline
```

不能通过“record missing”迫使业务调用者自行推断默认初始值。

---

## 17. Atomic Commit / Conflict

核心写语义是 conditional atomic transaction：

```ts
interface RealmStateTransaction {
  readonly conditions: readonly {
    readonly key: RealmStateKey;
    readonly version: number;
  }[];

  readonly writes: readonly {
    readonly type: 'put';
    readonly key: RealmStateKey;
    readonly value: JsonValue;
  }[];
}
```

v1 推荐不再需要独立 `delete` 业务语义：

```text
put value = null
```

即 canonical clear/unset。

事务语义：

```text
validate complete request
→ authorize complete request
→ check all conditions against one current snapshot
→ conflict: zero write
→ otherwise replace all targeted record current values atomically
→ fresh global revision
→ fresh changed-record versions
→ publish committed change
```

`initialValue` 不参与 writes，且不能作为写 target。

典型跨 namespace transaction：

```text
player/economy.money -= 100
inventory/main.potion += 1
quest/shopping-tutorial.value = completed
```

必须 all-or-nothing。

---

## 18. Conflict / Retry / Commit Evidence

发生版本冲突：

```text
commit → CONFLICT / known no-commit
```

caller 可显式：

```text
fresh read
→ recompute
→ retry
```

Realm State SHOULD NOT 自动 retry application transaction。

继续遵守 LoomRealm commit evidence 原则：

```text
成功响应        → known committed
明确 conflict   → known no-commit
超时/连接丢失   → applied/not-applied 若无法证明，则属于 ambiguous
```

ambiguous mutation 不得伪装成安全可重试错误。

---

## 19. Subscription

Subscription 只观察 authoritative current-value commit：

```text
initial/current snapshot
→ revision N+1 committed change
→ revision N+2 committed change
```

`initialValue` 在 Session 中不可变，因此普通 commit change event 不需要把它当作“changed field”。Subscription 建立时的 baseline snapshot SHOULD 包含 initial/current 两个视图，使 consumer 能建立完整本地观察状态。

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

---

## 20. Authorization

Realm State 不能成为所有 Subsystem 可任意写所有 key 的共享字典。

Game logical configuration 最终 SHOULD 声明 namespace-level reader/writer policy；授权主体优先使用 `subsystemKey`，而不是 Frame/Activation。

因此 namespace 是 authorization unit，但不是 write/version/transaction unit。

同一 transaction MAY 跨多个 namespace；Realm State 必须在任何 mutation 前验证 caller 对所有目标 namespace 都有对应权限。如果任一目标未授权：

```text
zero commit
```

确切 access-policy schema 尚未冻结；不能放进 Hostra/PWA executable manifest 中制造平台差异。

---

## 21. Lifetime

Realm State authority 是 **Session-scoped**：

```text
Session lifetime
    owns Main authority
    owns Realm State authority
    owns immutable initial baseline
    owns mutable current values

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
Session terminal     → Realm State terminal
```

Runtime terminal 后，该 Runtime 既有 RealmStateClient 必须终止/inert。

---

## 22. Communication Placement

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

不得塞进 `loomrealm.renderer-data/1`、Runtime Control 或 `frame.call()`。

---

## 23. Interaction with Main / Renderer / Content

### Main

Main 不持有具体 records，也不解释 namespace/value/initialValue。系统级关联只应限于 Session 创建/终止、Runtime identity admission 与 capability revocation。

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

这三者不得合并成一个 Repository/service locator。

---

## 24. Persistence / Save Game Boundary

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
→ current-value seed
```

Save snapshot SHOULD 主要保存 current values 及其 persistence-required schema/version metadata；是否保存 runtime record version/global revision 是未来 Save contract 的问题，不得默认把旧 Session concurrency metadata 当作新 Session runtime authority metadata。

关键边界：

```text
initialValue comes from current Game definition
current value may come from Save
```

如果 Game 升级改变了 initial definition，而旧 Save 被加载，migration 层负责决定旧 Save 如何映射到当前 Game definition；RealmStateAuthority 本身不执行游戏版本 migration。

---

## 25. Physical Platform Realization

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

### PWA candidate

Realm State 可与 Main 共 Worker，也可独立 Worker；logical semantics 不变。

跨平台要求：

```text
same initialValue semantics
same default null semantics
same namespace/record/transaction granularity
same whole-record replacement semantics
same snapshot semantics
same atomic commit/conflict semantics
same authorization semantics
same terminal/ambiguity semantics
```

---

## 26. Initial Implementation Scope

建议第一版只实现：

```text
Game Entry inline initial records
omitted initial key → null
immutable initialValue per logical key
new-game current defaults to initial
optional load-game current seed
one RealmStateAuthority per Session
bootstrap-before-runtime barrier
namespace + key records
namespace-level authorization
whole-record current-value put
null as canonical clear/unset
per-record version
monotonic global revision
consistent multi-key read
conditional atomic multi-key commit
explicit CONFLICT
ordered state-change subscription
Runtime-scoped RealmStateClient capability
Desktop in-process authority + explicit transport seam
```

推迟：

```text
field-level patch
large external bootstrap source
persistence implementation
schema registry
cross-session sharing
distributed authority
CRDT
automatic merge/retry
Renderer direct access
query language
secondary indexes
generic events
```

---

## 27. Suggested Delivery Order

```text
R1  Architecture closure
    freeze role / authority / lifetime / namespace-record-transaction granularity / initial-current semantics

R2  Game Package contract change proposal
    state initial schema + default null + validation + version/compatibility decision

R3  Realm State contract v1
    read(initial+current) / commit / conflict / subscription / terminal

R4  In-memory reference authority
    deterministic serialized implementation

R5  Launcher prepared projection
    LogicalGameBootstrap + Realm State Game Definition

R6  Subsystem author projection
    scope.state

R7  Hostra Desktop physical binding
    bootstrap barrier + at least two real Subsystem consumers

R8  Failure / reconnect / ambiguity qualification

R9  Save/Load proposal
    preserve Game initialValue + restore current seed

R10 PWA realization/equivalence
```

---

## 28. Qualification Targets

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
- put(null) may clear current without changing initialValue
- load-game current seed cannot redefine initialValue

Granularity
- modifying one record does not replace sibling records in the same namespace
- record version changes only for changed records
- one transaction may atomically span records/namespaces
- namespace authorization does not imply namespace-wide replacement

Read
- multi-key read is one consistent revision
- each record exposes immutable initialValue + current value + version
- returned values detached from internal ownership

Commit
- whole-record writes are all-or-nothing
- stale version returns conflict with zero writes
- one successful transaction has one commit revision
- concurrent writers serialize deterministically

Authorization
- unauthorized read/write rejected before mutation
- one Subsystem cannot forge another subsystemKey

Lifetime
- Frame suspend/close does not reset shared state
- Renderer reload/Data reconnect does not affect shared state
- Runtime terminal revokes its client
- Session terminal retires authority

Failure
- known no-commit and ambiguous mutation distinguishable
- no automatic retry of ambiguous commit

Subscription
- baseline exposes initial/current state
- ordered committed current-value revisions
- no notification for failed/conflicted transaction
- subscription remains state observation, not generic event delivery
```

---

## 29. Open Questions

仍需正式冻结：

1. Game Package 是 reopen current v1 还是引入新的 document version 来承载 `state`？
2. namespace reader/writer policy 的 exact Game-level schema 是什么？
3. initial record count、单 record / total payload、depth 上限是多少？
4. 是否正式采用 `revision/version = 0` 作为 bootstrap baseline？
5. v1 subscription 是否支持 reconnect baseline？
6. ambiguous mutation 是否引入 client-generated transaction ID + status query？
7. authorization 是否只做 namespace 粒度，还是未来需要 key-prefix 粒度？
8. Realm State authority fatal 是否必然导致 Session terminal？
9. 大型 initial state 何时需要 Content-derived seed / external source，而不是 inline Game Entry records？
10. Save snapshot 缺少某 key 时，load policy 是否固定 fallback 到 Game-defined initialValue，还是必须由 migration 显式产出完整 current seed？

以下问题不再开放：

```text
namespace is whole-update unit
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

Main LogicalGameBootstrap contains state payload
    = no

business Runtime may start before Realm State initialization
    = no
```

---

## 30. Final Invariants

1. Main 继续唯一拥有 Control Authority；
2. Realm State 唯一拥有 Session shared mutable business facts；
3. Subsystem 继续拥有 domain-local execution/state；
4. Content 继续只读；
5. Renderer 不成为第二业务状态 authority；
6. `frame.call()` 继续表示控制流，而不是普通共享状态 RPC；
7. Namespace 是 logical/authorization unit，不是 replacement/version/transaction unit；
8. `(namespace,key)` Record 是 current value replacement、version、conflict 的基本单位；
9. Transaction 是原子性单位并 MAY 跨 namespace；
10. v1 写入 whole-record replacement，不提供 field-level patch；
11. 每个 key 有 immutable `initialValue` 与 mutable current `value`；
12. Game Entry 未声明 key 时 `initialValue = null`；
13. 新游戏 current `value = initialValue`；
14. Runtime transaction 永远不能修改 `initialValue`；
15. Load Game 可以 seed current value，但不能重定义 Game-defined initialValue；
16. 新游戏 initial Realm State 属于 platform-neutral Game Entry，而不是 Hostra/PWA manifest；
17. Launcher PREPARE 只验证/投影初始定义，不拥有 runtime state；
18. Realm State 必须在第一项 business Runtime side effect 前原子初始化完成；
19. `initial.input` 表示 initial Frame 参数，不替代 Session shared state；
20. Game Entry 不指定 record version/global revision 等 runtime authority metadata；
21. 同一 transaction 多 record all-or-nothing；
22. stale write 必须显式 conflict，不允许静默 last-write-wins；
23. subscription 只投影 committed current state，不成为 EventBus；
24. Frame/Activation/Renderer/Data carrier 生命周期不得隐式重置 Realm State；
25. Session terminal 终结 Realm State authority；
26. author capability 通过 `@loomrealm/subsystem` 暴露，不泄漏 transport/platform implementation；
27. Hostra/PWA 可以物理不同，但 logical Realm State semantics、initial/current semantics 必须一致；
28. Save/Load 是独立 bootstrap/persistence 能力，不与 Realm State runtime authority 混为一体。

---

## 31. Architectural Summary

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
Save (optional) ── current seed ──→ Realm State
                               Shared Business Authority
                                  │
                                  ├─ initialValue (immutable)
                                  └─ value        (mutable)
                                           │
                              ┌────────────┼────────────┐
                              ▼            ▼            ▼
                             Map         Battle        Menu
                           Subsystem    Subsystem     Subsystem
```

核心粒度：

```text
Namespace
    authorization / logical grouping

Record (namespace + key)
    initialValue + current value + version
    replacement / conflict unit

Transaction
    multi-record atomicity unit
```

这不是弱化 single-authority 原则，而是补齐当前没有 owner 的业务事实，并为它建立确定的初始基线、当前值、版本、事务和 Session 初始化边界。