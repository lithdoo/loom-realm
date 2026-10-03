# Realm State：Session 级共享业务状态系统

> 层级：系统架构  
> 状态：Proposal / Active Design  
> 稳定程度：Evolving / **Not Implemented / Not Contract Frozen / Not Qualified**  
> 主要定义：Session 级共享业务状态 authority、Game Entry 初始状态、RealmStateBootstrap、Subsystem 访问 capability、事务/版本/订阅语义、生命周期与平台边界  
> 依赖：[系统架构总览](./system-overview.md)、[模块子系统模型](./subsystem-model.md)、[栈式运行系统](./stack-runtime-system.md)、[存储与内容系统](./storage-system.md)、[通信系统](./communication-system.md)、[Game Package v1](../15-contracts/game-package-v1.md)  
> 最近复核：2026-10-04

本文记录 LoomRealm 当前架构中已识别的一项设计缺口及候选解决方向：在 `Main` 的控制权威与各 `Subsystem Runtime` 的局部业务状态之间，缺少一个 **Session 级、跨 Subsystem、可变业务状态的唯一 authority**。

本文同时冻结一个架构方向：**新游戏的 Realm State 初始业务值属于 platform-neutral Game Entry；Platform Launcher 在 PREPARE 阶段验证并投影为独立 `RealmStateBootstrap`；Platform Composition 必须先建立并初始化 Realm State authority，才允许任何 business Runtime side effect。**

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

这套模型对 Map、Battle 等单一领域内部状态成立，但随着业务模块增加，会出现一类无法自然归属于任一 Subsystem 的运行期事实：

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

这些状态跨 Frame、跨 Subsystem，可能被多个 Runtime 合法读写，并且要求明确的原子性、版本、冲突和失败语义。它们是业务事实，不属于 Main 的控制状态，也不是 readonly Content。

当前最容易出现的替代方案是利用 `frame.call()` 把拥有某份状态的 Subsystem 当成“状态服务”。这在语义上不成立：

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

结论：当前架构存在一个 **Session Shared Business State Authority** 缺口。

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
3. 保证多记录原子 commit；
4. 支持版本、冲突检测和一致 snapshot；
5. 支持只观察 authoritative commit 的 subscription；
6. 独立于 Frame / Activation / Renderer / Data carrier 生命周期；
7. 保持 Hostra/PWA logical semantics 一致；
8. 提供确定的新游戏初始化 barrier；
9. 不把 Main、Content、Renderer 或 `frame.call()` 扩张成通用业务状态系统。

核心原则仍是：

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
```

禁止向业务暴露：

```ts
scope.globalState.foo.bar = value;
```

直接共享可变对象会消除 authority、commit、conflict 与 failure 边界。

---

## 4. Authority Model

引入 Realm State 后：

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
    ├── shared records
    ├── record versions
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
    "这个 Session 现在是什么状态"

Subsystem State
    "这个领域执行器现在正在做什么"
```

---

## 6. Logical Placement

```text
                         Session
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
            Main                     Realm State
      Control Authority           Business Data Authority
              │                           │
      ┌───────┼───────┐           ┌───────┼───────┐
      ▼       ▼       ▼           ▼       ▼       ▼
     Map    Battle   Menu         Map    Battle   Menu
   Runtime  Runtime Runtime     Client   Client   Client
```

`Realm State` 是新的 logical role，不要求第一版独立 OS process。

Desktop 可先物理组合为：

```text
LoomRealm Desktop process
├── MainSessionRuntime
├── RealmStateAuthority
├── Content Service
├── Data Broker
└── RuntimeHosting
```

物理共进程不改变逻辑 owner 边界。

---

## 7. Game Entry Owns New-Game Initial State

### 7.1 Placement Decision

新游戏的 Realm State 初始业务值属于 **platform-neutral Game Entry**，而不是 `launch.hostra.json`、`launch.pwa.json` 或 Main bootstrap。

理由：

```text
initial Realm State
    = game/application semantics

Hostra/PWA Launch Manifest
    = current-platform executable binding
```

同一个游戏在 Hostra 与 PWA 上必须得到等价的 Realm State 初始业务事实，因此初始 state 不应复制到不同平台 manifest。

当前 Game Package v1 的 top-level schema 精确只有 `formatVersion / initial / subsystems`，因此下面的 shape 只是下一版候选设计；现行 v1 validator 必须继续拒绝额外 `state` 字段，直到正式 contract 被修改。

### 7.2 Candidate Game Entry Shape

建议不要使用一个任意巨型 root object，而是直接采用 Realm State 的 record identity：

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
      },
      {
        "namespace": "world",
        "key": "flags",
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

候选逻辑 model：

```ts
interface RealmStateBootstrapV1 {
  readonly records: readonly RealmStateInitialRecordV1[];
}

interface RealmStateInitialRecordV1 {
  readonly namespace: string;
  readonly key: string;
  readonly value: JsonValue;
}
```

### 7.3 Bootstrap Metadata Is Not Game Data

Game Entry MUST NOT 指定运行期 authority metadata：

```text
record version
global revision
transaction id
physical endpoint
credential
```

例如以下设计不推荐：

```json
{
  "namespace": "inventory",
  "key": "main",
  "version": 1,
  "value": {}
}
```

版本与 revision 必须由新创建的 RealmStateAuthority 在初始化时生成。

### 7.4 Validation Direction

正式 contract 应至少验证：

```text
state closed schema
records array bounded
(namespace,key) exact unique
namespace/key representation bounded
value is valid JsonValue
per-record payload bounded
total bootstrap representation bounded
JSON nesting bounded
validated result detached + immutable
```

具体数值上限在 contract/conformance 阶段冻结。

大型世界数据不应无限内联进 `game.json`。v1 优先支持小型、确定性的 initial records；Content-derived seed 等外部 source 只有在真实 consumer 出现后再设计。

---

## 8. Game Entry `state` vs `initial.input`

二者语义必须同时保留并严格区分：

```text
state
    Session 建立时已经存在的共享业务事实

initial.input
    initial Frame 的调用参数
```

示例：

```text
state.player/profile
    "当前玩家是谁"

initial.input.mapId
    "这一次 initial Frame 从哪张地图开始"
```

Realm State 的出现不应把所有 Frame 参数搬进共享状态；反之，也不应为了跨 Subsystem 共享而把长期业务事实塞进 `initial.input`。

---

## 9. Launcher PREPARE Projection

Platform Launcher 是 Runtime-product Game Entry consumer，但它不是 Realm State authority。

Launcher 对 State 的职责只包括：

```text
read Game Entry
→ common validation
→ validate/detach/freeze Realm State initial records
→ preserve them in prepared result
```

Launcher MUST NOT：

```text
serve runtime state reads
execute runtime state transactions
own record revisions
own subscriptions
become state database/service locator
```

Prepared result 应产生两个平级 logical projections：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: RealmStateBootstrapV1;
}
```

概念关系：

```text
Validated Game Entry
          │
          ├─────────────────┐
          ▼                 ▼
LogicalGameBootstrap   RealmStateBootstrap
          │                 │
          ▼                 ▼
         Main       RealmStateAuthority
```

`RealmStateBootstrap` MUST NOT 被塞进 `LogicalGameBootstrap`，否则 Main 会被迫承载或解释业务 state initialization。

Hostra/PWA Launcher 都从同一个 Game Entry 产生等价 Realm State bootstrap；平台差异只存在于 executable/capability realization。

---

## 10. Session Bootstrap Barrier

Realm State 必须在任何 business Runtime side effect 前完成初始化。

推荐顺序：

```text
read game.json
→ validate Game Entry
→ validate Realm State bootstrap
→ validate current Platform Launch Manifest
→ exact subsystem key-set join
→ executable/content/capability preflight
→ freeze PlatformLaunchPlan
→ freeze LogicalGameBootstrap
→ freeze RealmStateBootstrap
──────────────────────────────────────── PREPARE complete
→ create RealmStateAuthority
→ atomically install RealmStateBootstrap
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

不允许正常启动进入：

```text
Runtime ready
but Realm State still loading
```

否则所有 Subsystem 都需要额外处理不必要的 `state unavailable/loading` 启动状态机。

如果 Realm State bootstrap validation 或 authority initialization 失败：

```text
Session startup fails before business Runtime side effect
```

不允许部分 Runtime 已启动后再回滚共享业务状态初始化。

---

## 11. Subsystem Author Capability

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

业务不得直接依赖 Main、RealmStateAuthority implementation、Desktop IPC、MessagePort/WebSocket 或 storage handle。

---

## 12. Record / Revision Model

```ts
interface RealmStateKey {
  readonly namespace: string;
  readonly key: string;
}

interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly version: number;
  readonly value: JsonValue;
}
```

返回值 MUST detached / immutable。

Realm State SHOULD 另有 Session-local monotonic global revision：

```text
revision 1062
    ↓ one atomic transaction
revision 1063
```

一次 transaction 修改的多个 record 共享同一个 commit revision。

Bootstrap 完成后由 authority 建立初始 record versions/global revision；确切初始数字是 contract 细节，不属于 Game Entry schema。

---

## 13. Consistent Read

多 key read SHOULD 来自同一 logical snapshot：

```ts
interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

必须避免 caller 把跨 revision 的多个独立 read 误认为一个一致 snapshot。

---

## 14. Atomic Commit / Conflict

核心写语义不是裸 `get + set`，而是 conditional atomic transaction：

```ts
interface RealmStateTransaction {
  readonly conditions: readonly {
    readonly key: RealmStateKey;
    readonly version: number | null;
  }[];

  readonly writes: readonly (
    | { readonly type: 'put'; readonly key: RealmStateKey; readonly value: JsonValue }
    | { readonly type: 'delete'; readonly key: RealmStateKey }
  )[];
}
```

语义：

```text
validate complete request
→ authorize complete request
→ check all conditions against one current snapshot
→ conflict: zero write
→ otherwise commit all writes atomically
→ fresh global revision
→ fresh changed-record versions
→ publish committed change
```

典型场景：

```text
player/economy.money -= 100
inventory/main.potion += 1
```

必须 all-or-nothing。

第一版一个 Session 内一个 RealmStateAuthority + serialized commit lane 即可提供明确线性化点，不需要 distributed transaction framework。

---

## 15. Conflict / Retry / Commit Evidence

发生版本冲突：

```text
commit → CONFLICT / known no-commit
```

caller 可显式 fresh read → recompute → retry。

Realm State SHOULD NOT 自动 retry application transaction。

继续遵守 LoomRealm 的 commit evidence 原则：

```text
成功响应        → known committed
明确 conflict   → known no-commit
超时/连接丢失   → applied/not-applied 若无法证明，则属于 ambiguous
```

ambiguous mutation 不得伪装成安全可重试错误。

---

## 16. Subscription

Subscription 只观察 authoritative committed state：

```text
initial snapshot
→ revision N+1 committed change
→ revision N+2 committed change
```

允许：

```text
inventory/main changed
world/flags changed
party/current changed
```

不允许扩张成 generic EventBus：

```text
battleStarted
playSound
openMenu
buttonClicked
```

---

## 17. Authorization

Realm State 不能成为所有 Subsystem 可任意写所有 key 的共享字典。

Game logical configuration 最终 SHOULD 声明 namespace-level reader/writer policy；授权主体优先使用 `subsystemKey`，而不是 Frame/Activation。

确切 access-policy schema 尚未冻结。它可以与 `state` bootstrap 一起进入 Game-level logical configuration，也可以形成独立 platform-neutral section；不能放到 Hostra/PWA executable manifest 中制造平台差异。

Frame suspension 不应自动使 Runtime 失去 State 观察能力；如某个 namespace 未来需要 Activation-scoped mutation permit，应新增窄 gate，而不是默认绑定 Main InputTarget。

---

## 18. Lifetime

Realm State authority 是 **Session-scoped**：

```text
Session lifetime
    owns Main authority
    owns Realm State authority

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
Session terminal     → Realm State terminal
```

Runtime terminal 后，该 Runtime 既有 RealmStateClient 必须终止/inert。

---

## 19. Communication Placement

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

## 20. Interaction with Main / Renderer / Content

### Main

Main 不持有具体 records，也不解释 namespace/value。系统级关联只应限于 Session 创建/终止、Runtime identity admission 与 capability revocation。

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

Realm State
    mutable current Session business facts
```

Realm State 可以保存 `itemId = "potion"`，但 Item definition 仍由 Content 提供。

---

## 21. Persistence / Save Game Boundary

Realm State authority 不等于 Save Game 系统。

新游戏：

```text
Game Entry state
→ validated RealmStateBootstrap
→ RealmStateAuthority
```

读档：

```text
Persistent Save
→ validate / migrate
→ RealmStateBootstrap-equivalent snapshot
→ RealmStateAuthority
```

因此 authority 不需要知道 bootstrap 来源：

```ts
createRealmStateAuthority({ bootstrap });
```

产品层可以选择：

```text
New Game
    → Game Entry bootstrap

Load Game
    → validated Save bootstrap
```

禁止：

```text
RealmStateAuthority
    parses game.json
    opens save files
    performs platform persistence
```

这些属于 bootstrap/persistence composition，而不是 runtime State authority。

---

## 22. Physical Platform Realization

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
same Game Entry initial state semantics
same namespace/key semantics
same snapshot semantics
same atomic commit/conflict semantics
same authorization semantics
same terminal/ambiguity semantics
```

---

## 23. Initial Implementation Scope

建议第一版只实现：

```text
Game Entry inline initial records
RealmStateBootstrap prepared projection
one RealmStateAuthority per Session
bootstrap-before-runtime barrier
namespace + key records
JsonValue payload
per-record version
monotonic global revision
consistent multi-key read
conditional atomic multi-key commit
explicit CONFLICT
ordered state-change subscription
subsystemKey-based authorization
Runtime-scoped RealmStateClient capability
Desktop in-process authority + explicit transport seam
```

推迟：

```text
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

## 24. Suggested Delivery Order

```text
R1  Architecture closure
    freeze role / authority / lifetime / Game Entry bootstrap boundary

R2  Game Package contract change proposal
    state bootstrap schema + validation + version/compatibility decision

R3  Realm State contract v1
    read / commit / conflict / subscription / terminal

R4  In-memory reference authority
    deterministic serialized implementation

R5  Launcher prepared projection
    LogicalGameBootstrap + RealmStateBootstrap

R6  Subsystem author projection
    scope.state

R7  Hostra Desktop physical binding
    bootstrap barrier + at least two real Subsystem consumers

R8  Failure / reconnect / ambiguity qualification

R9  Save/Load proposal after real persistence consumer

R10 PWA realization/equivalence
```

---

## 25. Qualification Targets

正式关闭前至少证明：

```text
Bootstrap
- Game Entry state validation has zero business Runtime side effect
- invalid/duplicate/oversized initial record rejects during PREPARE
- validated bootstrap is detached + immutable
- Realm State initializes before first business Runtime side effect
- Runtime cannot observe a partially initialized State
- Hostra/PWA prepare produce equivalent state bootstrap for same Game Entry

Authority
- one Session has exactly one current Realm State authority
- no Subsystem owns a shadow copy as shared truth

Read
- multi-key read is one consistent revision
- returned values detached from internal ownership

Commit
- multi-key writes are all-or-nothing
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
- ordered committed revisions
- no notification for failed/conflicted transaction
- subscription remains state observation, not generic event delivery
```

---

## 26. Open Questions

仍需正式冻结：

1. Game Package 是 reopen current v1 还是引入新的 document version 来承载 `state`？
2. namespace reader/writer policy 的 exact Game-level schema 是什么？
3. initial record count、单 record / total payload、depth 上限是多少？
4. 初始 record version/global revision 从 0 还是 1 开始？
5. v1 subscription 是否支持 reconnect baseline？
6. ambiguous mutation 是否引入 client-generated transaction ID + status query？
7. delete/missing record 的 version 语义如何定义？
8. authorization 是否只做 namespace 粒度，还是需要 key-prefix 粒度？
9. Realm State authority fatal 是否必然导致 Session terminal？
10. 大型初始 state 何时需要 Content-derived seed / external source，而不是 inline Game Entry records？

以下问题不再开放：

```text
new-game initial shared state owner
    = platform-neutral Game Entry

Hostra/PWA manifest owns initial state
    = no

Main LogicalGameBootstrap contains state payload
    = no

business Runtime may start before Realm State initialization
    = no
```

---

## 27. Final Invariants

1. Main 继续唯一拥有 Control Authority；
2. Realm State 唯一拥有 Session shared mutable business facts；
3. Subsystem 继续拥有 domain-local execution/state；
4. Content 继续只读；
5. Renderer 不成为第二业务状态 authority；
6. `frame.call()` 继续表示控制流，而不是普通共享状态 RPC；
7. 新游戏 initial Realm State 属于 platform-neutral Game Entry，而不是 Hostra/PWA manifest；
8. Launcher PREPARE 只验证/投影 `RealmStateBootstrap`，不拥有 runtime state；
9. `RealmStateBootstrap` 与 `LogicalGameBootstrap` 平级，不嵌入 Main bootstrap；
10. Realm State 必须在第一项 business Runtime side effect 前原子初始化完成；
11. `initial.input` 表示 initial Frame 参数，不替代 Session shared state；
12. Game Entry 不指定 record version/global revision 等 runtime authority metadata；
13. 同一 transaction 多 key all-or-nothing；
14. stale write 必须显式 conflict，不允许静默 last-write-wins；
15. subscription 只投影 committed state，不成为 EventBus；
16. Frame/Activation/Renderer/Data carrier 生命周期不得隐式重置 Realm State；
17. Session terminal 终结 Realm State authority；
18. author capability 通过 `@loomrealm/subsystem` 暴露，不泄漏 transport/platform implementation；
19. Hostra/PWA 可以物理不同，但 logical Realm State semantics 与初始状态必须一致；
20. Save/Load 是独立 bootstrap/persistence 能力，不与 Realm State runtime authority 混为一体。

---

## 28. Architectural Summary

最终状态模型：

```text
                    Game Entry
                  /            \
                 /              \
 LogicalGameBootstrap      RealmStateBootstrap
          │                       │
          ▼                       ▼
        Main                 Realm State
 Control Authority     Shared Business Authority
          │                       │
          └───────────┬───────────┘
                      ▼
              Subsystem Runtime
              scope.state ready
                      │
                initial Frame
```

核心职责：

```text
Game Entry
    platform-neutral topology + new-game initial shared state

Platform Launcher
    PREPARE / validate / project, not runtime state owner

Main
    Control Authority

Realm State
    Session Shared Business State Authority

Subsystem
    Domain Execution / Local State Authority

Renderer
    Read-only Presentation Replica

Content
    Read-only Definition Authority
```

这不是弱化 single-authority 原则，而是补齐当前没有 owner 的业务事实，并为它建立确定的 Session 初始化 barrier。真正需要避免的不是“全局状态”本身，而是“没有明确 authority、事务、版本、权限、初始化顺序和生命周期的全局可变对象”。