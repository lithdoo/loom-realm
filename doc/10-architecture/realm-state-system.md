# Realm State：Session 级共享业务状态系统

> 层级：系统架构  
> 状态：Proposal / Active Design  
> 稳定程度：Evolving / **Not Implemented / Not Contract Frozen / Not Qualified**  
> 主要定义：Session 级共享业务状态 authority、Subsystem 访问 capability、事务/版本/订阅语义、生命周期与平台边界  
> 依赖：[系统架构总览](./system-overview.md)、[模块子系统模型](./subsystem-model.md)、[栈式运行系统](./stack-runtime-system.md)、[存储与内容系统](./storage-system.md)、[通信系统](./communication-system.md)  
> 最近复核：2026-10-04

本文记录 LoomRealm 当前架构中已识别的一项设计缺口及候选解决方向：在 `Main` 的控制权威与各 `Subsystem Runtime` 的局部业务状态之间，缺少一个 **Session 级、跨 Subsystem、可变业务状态的唯一 authority**。

本文是架构提案，不改变现有 Frozen contracts，也不宣称存在对应生产实现。后续若进入实现，应先形成最小正式 contract、conformance 与 qualification subject。

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

这些数据通常具备以下特征：

1. 生命周期跨越单个 Frame；
2. 生命周期跨越单个 Subsystem Runtime 的一次局部调用；
3. 多个 Subsystem 都是合法 reader；
4. 多个 Subsystem 可能是合法 writer；
5. 修改需要明确的原子性、版本、冲突和失败语义；
6. 它们是业务事实，不属于 Main 的控制状态，也不是 readonly Content。

当前最容易出现的替代方案是利用 `frame.call()` 把拥有某份状态的 Subsystem 当成“状态服务”。这在语义上不成立。

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

`call` 适合表达业务控制流进入另一个 Frame，不适合承担普通跨 Subsystem 共享状态读写。

结论：当前架构存在一个 **Session Shared Business State Authority** 缺口。

---

## 2. Design Goal

新增逻辑角色：

```text
Realm State
    = Session-scoped shared mutable business-state authority
```

它解决：

```text
Subsystem-local business state
        +
Session-global shared business state
```

之间的责任缺口，同时保持 LoomRealm 既有原则：

> 一个 application fact 只有一个 authoritative owner；物理 host、transport、cache、projection 或 consumer 不得复制第二份 authority。

目标：

1. 为跨 Subsystem 的运行期业务状态提供唯一 owner；
2. 允许多个 Subsystem 显式读取/修改；
3. 保证多记录原子 commit；
4. 支持版本、冲突检测和一致 snapshot；
5. 支持只观察 authoritative commit 的 subscription；
6. 独立于 Frame / Activation / Renderer / Data carrier 生命周期；
7. 保持 Hostra/PWA logical semantics 一致；
8. 不把 Main、Content、Renderer 或 `frame.call` 扩张成通用业务状态系统。

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
cross-session persistence system
Content replacement
Renderer Store replacement
```

尤其禁止向业务暴露：

```ts
scope.globalState.foo.bar = value;
```

因为直接共享可变对象会消除 authority、commit、conflict 与 failure 边界。

---

## 4. Authority Model

引入 Realm State 后，核心 application authority 划分为：

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
    ├── domain-local mutable state
    ├── local Frame Context
    ├── Input behavior
    └── authoritative Render Domains

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

Realm State MUST NOT 被实现为 Main 内部任意业务字段集合；Main 仍保持 platform-neutral control authority，而不是游戏数据 God Object。

---

## 5. State Classification

新增能力后，业务数据应先按 ownership 分类。

### 5.1 Subsystem-local State

只服务某一领域执行过程、无需被其他 Subsystem 直接共享的状态继续归原 Subsystem 所有。

例：

```text
Battle current tick
Battle event queue
Battle cast progress
Map local movement interpolation
Schema Form local editing session
```

这些状态不应因为 Realm State 存在而被搬入全局层。

### 5.2 Realm State

满足以下条件之一时，应考虑 Realm State：

```text
跨 Frame lifetime
跨 Subsystem consumer
跨领域共同读写
需要统一原子 commit
代表整个当前 Game Session 的业务事实
```

例：

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

逻辑拓扑：

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

未来 PWA 可以是：

```text
one Worker + two logical authorities
```

或：

```text
Main Worker
Realm State Worker
```

物理部署不得改变 author-visible Realm State semantics。

---

## 7. Subsystem Author Capability

业务 Definition 仍只依赖 `@loomrealm/subsystem`。

候选 author API：

```ts
interface SubsystemScope {
  readonly content: ContentClient;
  readonly viewport: Viewport;
  readonly state: RealmStateClient;
}
```

业务不得直接依赖：

```text
Main
RealmStateAuthority implementation
Desktop IPC
MessagePort / WebSocket
physical state server endpoint
storage/database handle
```

建议第一版能力保持最小：

```ts
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

Exact API 需要在正式 contract 阶段重新冻结；本节只定义候选方向。

---

## 8. Record Model

不建议一个巨型 shared root object。建议采用显式 logical key：

```ts
interface RealmStateKey {
  readonly namespace: string;
  readonly key: string;
}
```

例：

```text
player/profile
player/progression
inventory/main
party/current
quest/main-story
world/flags
```

Record：

```ts
interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly version: number;
  readonly value: JsonValue;
}
```

返回给 caller 的 value MUST detached / immutable；caller mutation 不得改变 authoritative state 或 future reads。

Realm State 不携带：

```text
Frame identity
Activation identity
Renderer identity
Data generation
physical path
transport endpoint
credential
```

除非未来某个正式 contract 明确证明业务语义需要，否则这些 identity 不应污染共享业务数据模型。

---

## 9. Global Commit Revision

除每条 record 自身 `version` 外，Realm State SHOULD 拥有 Session-local monotonic `revision`：

```text
revision 1062
    ↓ atomic transaction
revision 1063
```

一次 transaction 中多个 record 的修改共享同一个 `commitRevision`。

用途：

```text
consistent snapshots
ordered subscription
save snapshot coordination
debug / trace
future replay tooling
```

`revision` 是 Realm State authority 内部的业务状态序列，不得被解释为 Main rendererRevision、Data generation 或 Frame transaction identity。

---

## 10. Consistent Read

多 key read SHOULD 返回同一 logical snapshot：

```ts
interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

例如：

```ts
await state.read([
  { namespace: 'player', key: 'profile' },
  { namespace: 'inventory', key: 'main' },
  { namespace: 'party', key: 'current' }
]);
```

必须避免：

```text
read player at revision 100
commit happens
read inventory at revision 101
```

却被 caller 误认为同一 snapshot。

实现可以通过 single serialized authority lane、immutable snapshot 或等价机制完成；API 不要求暴露内部锁或数据库 transaction。

---

## 11. Atomic Commit / Conflict

Realm State 的核心写语义不是 `get + set`，而是 conditional atomic transaction。

候选 shape：

```ts
interface RealmStateTransaction {
  readonly conditions: readonly {
    readonly key: RealmStateKey;
    readonly version: number | null;
  }[];

  readonly writes: readonly (
    | {
        readonly type: 'put';
        readonly key: RealmStateKey;
        readonly value: JsonValue;
      }
    | {
        readonly type: 'delete';
        readonly key: RealmStateKey;
      }
  )[];
}
```

语义：

```text
validate complete request
→ check all authorization
→ check all conditions against one current snapshot
→ if any condition fails: zero write / CONFLICT
→ otherwise commit all writes atomically
→ assign fresh global revision
→ assign changed record versions
→ publish committed change
```

必须满足：

```text
all or nothing
```

典型场景：购买物品。

```text
player/economy.money -= 100
inventory/main.potion += 1
```

不得出现扣钱成功但物品未增加的中间 authoritative state。

第一版无需 generic distributed transaction；一个 Session 内一个 RealmStateAuthority + serialized commit lane 即可提供明确线性化点。

---

## 12. Conflict and Retry

发生版本冲突时：

```text
commit → CONFLICT
```

caller 可以：

```text
read fresh snapshot
→ recompute business mutation
→ explicitly retry
```

Realm State v1 SHOULD NOT 自动 retry application transaction，因为自动重放可能重复业务副作用或在新状态上产生不同业务意义。

同样，不提供 generic merge policy。需要 merge 的 domain 应在自身业务规则中显式实现。

---

## 13. Subscription

Realm State SHOULD 支持对 authoritative commit 的 retained observation：

```text
initial snapshot
→ revision N+1 committed change
→ revision N+2 committed change
→ ...
```

Subscription 只观察状态变化，不是 generic EventBus。

允许：

```text
inventory/main changed
world/flags changed
party/current changed
```

不允许把它扩张成：

```text
battleStarted
playSound
openMenu
buttonClicked
```

判断标准：

> 如果消息在没有持久 authoritative state change 的情况下依然成立，它大概率不是 Realm State subscription 应承载的东西。

建议 change 至少包含：

```ts
interface RealmStateChange {
  readonly revision: number;
  readonly changed: readonly RealmStateRecordChange[];
}
```

Exact baseline / reconnect / backpressure 语义需要正式 contract 冻结后再实现。

---

## 14. Authorization

Realm State 不能成为所有 Subsystem 都可任意写所有 key 的共享字典。

Game logical configuration SHOULD 显式声明 namespace-level access policy：

```text
namespace
    readers
    writers
```

概念例：

```json
{
  "player": {
    "readers": ["map", "battle", "menu"],
    "writers": ["map", "battle", "menu"]
  },
  "quest": {
    "readers": ["map", "battle", "menu"],
    "writers": ["map", "battle"]
  },
  "settings": {
    "readers": ["map", "battle", "menu"],
    "writers": ["menu"]
  }
}
```

这里仅定义设计方向，不冻结 Game Package schema。

授权主体优先使用 `subsystemKey`，而不是 Frame/Activation。

原因：Realm State 本身就是 Runtime/Session-scoped shared capability；Frame suspension 不应自动意味着该 Runtime 无法观察共享状态。

未来如果真实 consumer 证明某个 namespace 需要 Frame/Activation-scoped mutation permit，应新增窄能力或显式 gate，而不是默认把所有 Realm State 写操作绑定 Main InputTarget。

---

## 15. Lifetime

Realm State authority 建议是 **Session-scoped**。

Lifetime matrix：

```text
Session lifetime
    owns Main authority
    owns Realm State authority

Runtime lifetime
    owns SubsystemScope / RealmStateClient capability instance
    owns subsystem-local state

Frame lifetime
    owns local Frame Context

Activation lifetime
    owns ordinary input/call-return epoch

Data carrier lifetime
    owns Renderer↔Subsystem connection-local publication state
```

因此：

```text
Frame suspend        != Realm State unavailable
Frame close          != Realm State deleted
Activation change    != Realm State reset
Runtime restart      != Realm State necessarily reset
Renderer reload      != Realm State changed
Data reconnect       != Realm State changed
Session terminal     → Realm State terminal
```

Runtime terminal 后，该 Runtime 既有 RealmStateClient 必须终止/inert；它不能成为绕过 Runtime lifecycle 的孤儿 capability。

---

## 16. Failure Boundary

Realm State ordinary business failures需要与 Main/Runtime failure 分离。

候选分类：

```text
invalid author request      → synchronous TypeError / typed validation error
unauthorized namespace      → typed authorization rejection
condition/version conflict  → typed CONFLICT, zero commit
caller cancellation         → typed CANCELLED, commit boundary必须明确
transport before commit     → known no-commit only when protocol can prove
transport ambiguity         → MUST NOT report safe retry unless commit status provable
Realm State protocol fatal  → Realm State connection terminal
Realm State authority fatal → Session-level product policy required
```

尤其要延续 LoomRealm 现有 commit evidence 原则：

```text
成功响应        → known committed
明确 conflict   → known no-commit
超时/连接丢失   → 如果无法证明 applied/not-applied，则不能伪装成普通可重试错误
```

正式协议需要明确 transaction id / commit acknowledgement 是否足以查询最终结果；在没有该能力前，不应自动 retry ambiguous mutation。

---

## 17. Communication Placement

Realm State SHOULD 使用独立 logical protocol，例如：

```text
loomrealm.realm-state/1
```

通信关系：

```text
Subsystem Runtime
        ⇅
Realm State Authority
```

不得塞入现有：

```text
loomrealm.renderer-data/1
```

因为 Renderer Data 的逻辑双方是：

```text
Renderer ⇄ one Subsystem
```

而 Realm State 是：

```text
many Subsystems ⇄ one Session State Authority
```

两者 authority、identity、failure domain 和生命周期都不同。

同样，Realm State mutation 不应通过 `Runtime Control` 或 `frame.call()` 承载。Control plane 负责生命周期/控制事务；Realm State 是独立的业务状态 data plane。

---

## 18. Interaction with Main

Main 不持有具体 Realm State records，也不解释业务 namespace/value。

Main 与 Realm State 可能需要的系统级关联只应限于：

```text
Session creation
Runtime/subsystem identity admission
Session terminal
possibly Runtime terminal capability revocation
```

Main SHOULD NOT 提供：

```text
globalState.get/set
business namespace registry
business transaction execution
inventory/quest/player special cases
```

Realm State 也 MUST NOT 反向拥有：

```text
Frame stack
Activation
InputTarget
Runtime failure unwind
Renderer currentness
DataAuthority
```

---

## 19. Interaction with `frame.call()`

引入 Realm State 不替代 `frame.call()`。

两者职责：

```text
frame.call()
    control-flow composition
    "进入另一个业务 Frame 并等待 outcome"

Realm State
    shared-state coordination
    "读取/原子修改 Session 共享业务事实"
```

例如：

```text
Map → call(Battle)
```

仍然合理，因为 Battle 是一个新的控制流阶段。

但：

```text
Battle → call(Menu, consumePotion)
```

如果目的只是修改 inventory，则应改为 Realm State transaction，而不是创建 child Frame。

---

## 20. Interaction with Renderer

Renderer v1 不应直接成为 Realm State client。

推荐链路继续是：

```text
Realm State
    ↓ Subsystem observes/reads
Subsystem business logic
    ↓ authoritative RenderDomain
Renderer Store
    ↓
Web Presentation
```

这样不会创造：

```text
Realm State → Renderer Store
Subsystem → Renderer Store
```

两条并行 presentation authority 路径。

如果未来出现明确的跨 Subsystem system UI consumer，需要单独设计只读 projection，而不是默认让 Browser 任意查询 Realm State。

---

## 21. Interaction with Content

Realm State 与 Content 必须保持严格分离：

```text
Content
    immutable installation definitions/resources

Realm State
    mutable current Session business facts
```

可以存在引用关系：

```text
inventory record
    itemId = "potion"

Content
    items/potion = definition
```

但 Realm State 不复制整个 definition；业务通过 ContentClient 解析定义，通过 Realm State 读取当前数量/拥有关系。

---

## 22. Persistence / Save Game Boundary

Realm State v1 定义当前 Session authoritative state，不等于 Save Game 系统。

未来 persistence 可作为独立角色：

```text
Realm State Snapshot
        ↓
Save Serializer / Migration
        ↓
Persistent Storage
```

Load：

```text
Persistent Save
        ↓ validate / migrate
Initial Realm State Snapshot
        ↓
Session starts
```

禁止直接等同：

```text
Realm State == Database == Save File == Content
```

Persistence failure 不应在没有显式产品 policy 的情况下改变当前已提交的 in-memory Realm State。

---

## 23. Physical Platform Realization

### Hostra Desktop candidate

推荐第一版：

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

`RealmStateAuthority` 与 Main 可同进程，但必须是不同逻辑 owner/API。

### PWA candidate

可选择：

```text
Worker-hosted Realm State authority
⇅ MessagePort
Subsystem Workers
```

或与 Main 共用一个 Worker 内部进程，但仍保持 logical role boundary。

跨平台要求：

```text
same namespace/key semantics
same snapshot semantics
same atomic commit/conflict semantics
same authorization semantics
same terminal/ambiguity semantics
```

不要求同一 transport、process topology 或 storage backend。

---

## 24. Initial Implementation Scope

建议 v1 只实现：

```text
one RealmStateAuthority per Session
namespace + key records
JsonValue payload
per-record version
monotonic global revision
consistent multi-key read
conditional atomic multi-key commit
explicit CONFLICT
ordered state-change subscription
subsystemKey-based reader/writer authorization
Runtime-scoped RealmStateClient capability
Desktop in-process authority + explicit transport seam
```

明确推迟：

```text
persistence
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

## 25. Suggested Delivery Order

建议按以下顺序推进，避免先写 generic framework：

```text
R1  Architecture closure
    freeze role / authority / lifetime / non-goals

R2  One real consumer analysis
    choose inventory + money or party + battle result
    prove multi-subsystem read/write need

R3  Realm State contract v1
    read / commit / conflict / subscription / terminal

R4  In-memory reference authority
    deterministic serialized implementation

R5  Subsystem author projection
    scope.state

R6  Hostra Desktop physical binding
    at least two real Subsystem consumers

R7  Failure / reconnect / ambiguity qualification

R8  Save/Load proposal only after real persistence consumer exists

R9  PWA realization/equivalence with the same logical contract
```

最重要的是先用真实 consumer 固定最小能力，而不是预先抽象 Repository/EventBus/DB framework。

---

## 26. Qualification Targets

正式关闭该能力前至少应证明：

```text
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
- unauthorized read/write is rejected before mutation
- one Subsystem cannot forge another subsystemKey

Lifetime
- Frame suspend/close does not reset shared state
- Renderer reload/Data reconnect does not affect shared state
- Runtime terminal revokes its client
- Session terminal retires authority

Failure
- known no-commit and ambiguous mutation are distinguishable
- no automatic retry of ambiguous commit

Subscription
- ordered committed revisions
- no notification for failed/conflicted transaction
- subscription is state observation, not generic event delivery

Platform
- Hostra physical realization preserves logical semantics
- future PWA realization proves equivalence instead of introducing a second model
```

---

## 27. Open Questions

实现前仍需冻结的关键问题：

1. Realm State namespace/access policy 最终放入 Game Package、单独 manifest，还是由 prepared launch plan 注入？
2. v1 subscription 是否必须支持 reconnect baseline，还是 Runtime connection terminal 后由新 client fresh subscribe？
3. ambiguous mutation 是否引入 client-generated transaction ID + status query，以提供确定 commit evidence？
4. delete/missing record 的 version 语义如何定义？
5. transaction 最大 key 数、payload 大小、snapshot 大小和 subscription backlog 上限是多少？
6. authorization 是否只做 namespace 粒度，还是需要 key-prefix 粒度？
7. Realm State authority fatal 时，是必然 Session terminal，还是存在可证明安全的 authority restart + snapshot restore？
8. 初始 Realm State 从 Game initial input、Content-derived seed、Save snapshot 中如何组成，并在哪个 bootstrap barrier 前冻结？

这些问题在真实 consumer 与 failure model 未验证前不应通过便利性假设提前冻结。

---

## 28. Final Invariants

候选设计最终必须保持：

1. Main 继续唯一拥有 Control Authority；
2. Realm State 唯一拥有 Session shared mutable business facts；
3. Subsystem 继续拥有 domain-local execution/state；
4. Content 继续只读，不因 Realm State 出现而变成 mutable store；
5. Renderer 不成为第二业务状态 authority；
6. `frame.call()` 继续表示控制流，而不是普通共享状态 RPC；
7. 同一 Realm State transaction 多 key all-or-nothing；
8. stale write 必须显式 conflict，不允许 last-write-wins 静默覆盖；
9. subscription 只投影 committed state，不成为 EventBus；
10. Frame/Activation/Renderer/Data carrier 生命周期不得隐式重置 Realm State；
11. Session terminal 终结 Realm State authority；
12. author capability 通过 `@loomrealm/subsystem` 暴露，不泄漏 transport/platform implementation；
13. Hostra/PWA 可以物理不同，但 logical Realm State semantics 必须一致；
14. persistence/save 是后续独立能力，不与 Realm State v1 authority 混为一体；
15. 新设计优先由真实跨 Subsystem consumer 验证，不为未来假想需求创建 generic framework。

---

## 29. Architectural Summary

引入 Realm State 后，LoomRealm 的核心状态模型由原来的：

```text
Main Control Authority
+
Subsystem-local Business Authority
```

扩展为：

```text
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

这不是弱化现有 single-authority 原则，而是补齐当前没有 owner 的那一类业务事实。

真正需要避免的不是“全局状态”本身，而是“没有明确 authority、事务、版本、权限和生命周期的全局可变对象”。Realm State 的目标，是让跨 Subsystem 共享状态成为一个有明确 owner、可验证 commit 语义和独立 failure boundary 的正式系统角色。
