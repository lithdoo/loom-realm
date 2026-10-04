# LoomRealm Realm State v1 Contract

> 层级：正式契约  
> 状态：Draft / Normative Candidate  
> 契约版本：1  
> 逻辑协议：`loomrealm.realm-state/1`  
> 稳定程度：**Pre-implementation / Freeze Blockers Remaining / Not Qualified**  
> 架构来源：[Realm State：Session 级共享业务状态系统](../10-architecture/realm-state-system.md)  
> 相关契约：[Game Package v1](./game-package-v1.md)  
> 最近复核：2026-10-05

本文定义 Realm State v1 的正式 contract candidate。本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

本文只冻结 Realm State logical semantics 与 author/authority boundary；物理 carrier、Hostra/PWA IPC 形式、进程/Worker 拓扑不是本 contract 的 authority。

> [!IMPORTANT]
> 本文当前仍是 **Normative Candidate**，不是已完成 qualification 的 Active contract。文末列出的 Freeze Blockers 在转为 Active / Normative 前必须关闭。

---

## 1. Scope / Authority

一个 live Session MUST 恰好拥有一个 logical `RealmStateAuthority`，作为该 Session 跨 Subsystem mutable business facts 的唯一 authority。

```text
Main
    Control Authority

RealmStateAuthority
    Session Shared Business State Authority

Subsystem Runtime
    domain execution + local state
    author-facing RealmStateClient

Renderer
    no direct Realm State authority

Content
    readonly installation definitions/resources
```

Realm State MUST NOT：

```text
be implemented as arbitrary Main business fields
become Renderer-owned state
reuse frame.call() as ordinary shared-state mutation
inherit @loomrealm/data Renderer↔Subsystem connection-local semantics
```

Realm State v1 假设同一 Game Package 内的 Subsystem implementation 属于同一受信游戏产品。v1 MUST NOT 提供 Subsystem / namespace / key 级业务 ACL。

---

## 2. Core Types

### 2.1 Record Identity

```ts
export interface RealmStateKey {
  readonly namespace: string;
  readonly key: string;
}
```

完整 Record identity 是 `(namespace,key)`。

```text
namespace
    Record Collection identifier

key
    Record identifier inside one Collection

(namespace,key)
    complete Record identity
```

### 2.2 Record

```ts
export interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly initialValue: JsonValue;
  readonly value: JsonValue;
  readonly version: number;
}
```

Record 是：

```text
read unit
whole-value replacement unit
version unit
conflict unit
```

### 2.3 Snapshot

```ts
export interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

`revision` 标识该 snapshot 对应的 RealmStateAuthority logical state。

---

## 3. Namespace / Collection Semantics

`namespace` MUST 被解释为 Record Collection identifier，而不是 Record key 的装饰性前缀。

例如：

```text
player
    profile
    economy

inventory
    main

quest
    main-story
    side-001
```

Namespace/Collection 只承担：

```text
logical organization
discovery/filter boundary
human-facing grouping
key naming scope
```

Namespace/Collection MUST NOT 拥有：

```text
value
version
conflict state
replacement semantics
transaction boundary
ACL
independent lifecycle
```

v1 MUST NOT 提供：

```text
NamespaceRegistry
createNamespace()
deleteNamespace()
Collection OCC condition
Collection predicate lock
namespace wildcard subscription
```

一个 Collection 在 index 中存在，当且仅当至少一个 materialized Record 的 `namespace` 等于该 Collection identifier。

Collection membership 是 **observational discovery metadata**，MUST NOT 被解释为 transactional set predicate。

因此：

```text
list({namespace: "quest"}) @ revision N
```

只证明 revision `N` 时的 materialized membership；它不证明之后 `commit()` 时没有新的 `quest/*` Record 出现。

如果业务 correctness 依赖完整成员集合，业务 SHOULD 将该 invariant 显式建模为普通 versioned Record，并用普通 Record OCC conditions 保护。

---

## 4. Namespace / Key Identity Grammar

### 4.1 Namespace

Namespace MUST：

```text
be non-empty
be a valid Unicode scalar-value string
have UTF-8 encoded length <= 64 bytes
not contain '/'
not contain U+0000..U+001F
not contain U+007F
```

### 4.2 Key

Key MUST：

```text
be non-empty
be a valid Unicode scalar-value string
have UTF-8 encoded length <= 256 bytes
not contain '/'
not contain U+0000..U+001F
not contain U+007F
```

### 4.3 Equality

Identity comparison MUST be：

```text
case-sensitive
exact scalar sequence
no trimming
no Unicode normalization
no locale-sensitive comparison
```

Framework / transport MUST NOT silently trim、normalize 或 case-fold identity strings。

`namespace/key` 是 canonical human-readable notation；它不是额外层级结构。

### 4.4 Canonical Ordering

需要 deterministic ordering 时 MUST 使用：

```text
namespace ascending by unsigned lexicographic comparison of UTF-8 bytes
then
key ascending by unsigned lexicographic comparison of UTF-8 bytes
```

MUST NOT 使用 locale-sensitive ordering 定义 contract order。

---

## 5. Initial / Current Value Model

每个 logical Record 同时具有：

```text
initialValue
    current Game-defined immutable baseline

value
    current Session authoritative mutable value
```

Game Entry 未声明某个合法 key 时：

```text
initialValue = null
```

New Game：

```text
value = initialValue
```

从未 materialize 的合法 Record MUST 逻辑读取为：

```text
initialValue = null
value        = null
version      = 0
```

Runtime mutation MUST NOT 修改 `initialValue`。

v1 mutation MUST 使用 whole-record `put` replacement，不提供 field patch / field merge / field version。

`put(null)`：

```text
MUST set current value to null
MUST NOT change initialValue
MUST NOT dematerialize the Record
MUST NOT reset version
```

成功 deep-equal `put` 仍 MUST 被视为 successful authoritative write：

```text
Record version advances
global revision advances
matching subscriptions observe a committed change
```

Authority MUST NOT 对 author 暴露 deep-equality no-op optimization。

---

## 6. Materialization

一个 Record 在以下任一条件成立时 materialized：

```text
1. current Game Entry explicitly declares the initial Record
2. validated Load seed explicitly contains the Record
3. Runtime successfully commits the Record at least once
```

`read()` 一个 unknown logical Record MUST NOT materialize 它。

`put(null)` MUST NOT dematerialize Record。

因为 v1 没有 dematerialization，一个已经出现的 Collection 在当前 Session 内不会因 `put(null)` 消失。

---

## 7. Revision / Version Model

### 7.1 Global Revision

`revision` 是 RealmStateAuthority 的全局 successful-commit sequence / snapshot identity。

每个新 Session：

```text
global revision = 0
```

每次 successful transaction commit MUST：

```text
global revision := previous revision + 1
```

一个 transaction 无论写一个还是多个 Records，都只产生一个 fresh global revision。

### 7.2 Record Version

`version` 是单个 Record 的 successful-write generation，用于 OCC conflict detection。

每个新 Session 中每个 logical/materialized Record 的初始 version 为 `0`。

每次 successful transaction 对每个 write target MUST：

```text
record.version := previous record.version + 1
```

未被该 transaction 写入的 Record version MUST NOT 因其他 Record commit 改变。

### 7.3 Separation of Roles

```text
revision
    snapshot identity
    total successful-commit order
    subscription ordering
    diagnostics

version
    per-Record OCC conflict detection
```

普通 transaction MUST NOT 默认要求 global revision 未变化。

### 7.4 Numeric Representation — Freeze Blocker

正式 freeze 前 MUST 决定 `revision` / `version` 的 exact integer representation bound 与 exhaustion behavior。

当前 candidate direction：

```text
non-negative safe integer
0 <= value <= 2^53 - 1
```

但本条在本 draft 中尚未升级为最终 normative requirement。

---

## 8. Game Entry / Session Bootstrap Integration

Realm State v1 预期 Game Entry v1 直接增加 optional `state`，不升级 `formatVersion`：

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

缺少 `state` MUST 等价于 empty initial definition。

Game Entry MUST NOT 指定：

```text
record version
global revision
transaction ID
```

Launcher PREPARE MUST 在任何 business Runtime side effect 前完成 Realm State initial definition validation / projection。

Session bootstrap MUST 满足：

```text
PREPARE complete
→ select New Game or validated sparse Load seed
→ create fresh RealmStateAuthority
→ install immutable Game initial baseline
→ apply sparse current overrides
→ revision/version baseline = 0
→ Realm State READY
→ construct Runtime-scoped RealmStateClient
→ business Runtime side effects may begin
```

> [!IMPORTANT]
> 当前 `Game Package v1` normative contract 仍需同步更新；在该同步完成前，本节属于跨 contract integration requirement，而不是已完成仓库一致性。

---

## 9. Load Semantics

Load Game MUST 创建 fresh RealmStateAuthority，并重新建立 runtime concurrency metadata：

```text
revision = 0
record versions = 0
```

旧 Save / Session 的 revision/version MUST NOT 被恢复为新 Session concurrency metadata。

Current value 使用 sparse override：

```text
Save contains Record
    → current value = Save value

Save does not contain Record
    → current value = current Game initialValue
```

必须区分：

```text
Save Record absent
    → fallback to current Game initialValue

Save Record present with value = null
    → explicit current null
```

Save MUST NOT redefine `initialValue`。

---

## 10. Author-facing API Candidate

```ts
export interface RealmStateClient {
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

export interface RealmStateSubscription {
  close(): void;
}
```

`read()` / `list()` 无 authoritative mutation side effect，因此 MAY 接受 `AbortSignal`。

`commit()` MUST NOT 接受 `AbortSignal` 或 remote mutation cancellation capability。

所有 live Runtime-scoped RealmStateClient MAY 访问任意 valid Record；v1 不定义业务 ACL。

### 10.1 Observation Input Shape — Candidate Freeze

本 draft 建议冻结：

```text
read([])
    INVALID_REQUEST

read duplicate Record identities
    INVALID_REQUEST

subscribe([])
    INVALID_REQUEST

subscribe duplicate Record identities
    INVALID_REQUEST
```

这些规则在 contract freeze 前仍需最终确认。

---

## 11. `read()`

`read(keys)` MUST：

```text
validate every RealmStateKey
read all requested Records from one logical authority state
return one RealmStateSnapshot.revision
return detached / immutable JsonValue projections
not materialize unknown Records
```

同一 response 中所有 Records MUST 来自同一个 logical revision。

Unrelated concurrent commits MAY cause returned `revision` to advance without changing requested Record versions。

### 11.1 Returned Ordering — Freeze Blocker

正式 freeze 前 MUST 决定 `RealmStateSnapshot.records` order。

当前 candidate direction：按 §4.4 canonical `(namespace,key)` order 返回，而不是 caller input order。

---

## 12. Collection Index / `list()`

### 12.1 Types

```ts
export interface RealmStateIndexRecord {
  readonly key: string;
  readonly version: number;
}

export interface RealmStateCollectionIndex {
  readonly namespace: string;
  readonly records: readonly RealmStateIndexRecord[];
}

export interface RealmStateIndexSnapshot {
  readonly revision: number;
  readonly collections: readonly RealmStateCollectionIndex[];
}
```

`list()` MUST 返回同一个 logical revision 的 materialized Collection index，不返回 `initialValue` / current `value`。

### 12.2 Full Discovery

```ts
await state.list();
```

MUST 返回所有 materialized Collections。

### 12.3 Namespace-filtered Discovery

```ts
await state.list({ namespace: "quest" });
```

MUST 只返回指定 Collection 的 materialized Records。

若该 namespace 当前没有 materialized Record，MUST 返回：

```ts
{
  revision: N,
  collections: []
}
```

MUST NOT 制造 empty Collection object。

### 12.4 Ordering

`collections` MUST 按 namespace UTF-8 unsigned lexicographic order 排序。

每个 Collection 内 `records` MUST 按 key UTF-8 unsigned lexicographic order 排序。

### 12.5 Discovery, Not Transactional Scan

`list()` 是 point-in-time discovery snapshot，不是 transactional Collection scan。

```text
list(namespace) @ N
→ choose keys
→ concurrent membership change @ N+1
→ read(previously selected keys) @ N+1
```

是合法行为。

因此：

```text
list(namespace) + read(discoveredKeys)
!= atomic Collection key-set + value snapshot
```

`list()` 适用于：

```text
Save discovery
tooling / diagnostics
UI discovery
finding dynamic Records
```

它单独不足以表达 collection-wide transactional invariant。

---

## 13. Transaction / OCC

### 13.1 Types

```ts
export interface RealmStateCondition {
  readonly key: RealmStateKey;
  readonly version: number;
}

export interface RealmStateTransaction {
  readonly conditions: readonly RealmStateCondition[];
  readonly writes: readonly {
    readonly type: "put";
    readonly key: RealmStateKey;
    readonly value: JsonValue;
  }[];
}
```

### 13.2 Valid Shape

合法 transaction MUST 满足：

```text
conditions.length >= 1
writes.length >= 1
condition Record identities are unique
write Record identities are unique
every write Record appears exactly once in conditions
writes MAY be a strict subset of conditions
```

因此 read-only business dependency MAY 只出现在 conditions 中。

以下 MUST 为 `INVALID_REQUEST`：

```text
empty conditions
empty writes
condition-only commit
duplicate condition Record identity
duplicate write Record identity
write Record absent from conditions
malformed key/value/shape
```

### 13.3 Validation Order

Authority MUST 在任何 version comparison / mutation 前完成：

```text
1. structural shape
2. namespace/key grammar
3. JsonValue validity
4. count / byte / depth limits
5. condition/write identity uniqueness
6. write-set subset of condition-set
7. Record version comparison
8. atomic commit
```

Invalid request MUST NOT 被映射为 `CONFLICT`。

### 13.4 Atomic Authority Step

Authority MUST 将以下过程作为一个 logical atomic mutation step：

```text
compare every condition.version against one current authority state
→ any mismatch: CONFLICT / zero write
→ otherwise replace all write target current values
→ materialize newly-written Records
→ update derived Collection membership
→ global revision + 1
→ every write target Record version + 1
→ publish one committed change
→ return success projection
```

Transaction MAY 跨多个 Collections；Collection 不形成额外 conflict domain。

### 13.5 Commit Result

```ts
export interface RealmStateCommit {
  readonly revision: number;
  readonly records: readonly {
    readonly key: RealmStateKey;
    readonly version: number;
    readonly value: JsonValue;
  }[];
}
```

`records` MUST 包含所有 write targets 的 authoritative post-commit projection，包括 deep-equal successful writes。

### 13.6 Commit Result Ordering — Freeze Blocker

正式 freeze 前 MUST 决定 `RealmStateCommit.records` order。

当前 candidate direction：按 §4.4 canonical `(namespace,key)` order。

---

## 14. Error / Evidence Model

v1 logical API MUST 至少区分：

```text
INVALID_REQUEST
    request shape / identity / value invalid
    known no-commit

LIMIT_EXCEEDED
    request/resource exceeds v1 hard bound
    known no-commit

CONFLICT
    valid request but one or more observed Record versions are stale
    known no-commit

TERMINAL
    client/binding/authority terminal before request admission
    known no-commit when not admitted

OUTCOME_UNKNOWN
    mutation may have reached/crossed commit point but definitive result is unavailable
```

`CONFLICT` MUST 意味着 zero write。

`OUTCOME_UNKNOWN` MUST NOT 被映射成 `CONFLICT`。

### 14.1 Mutation Evidence

```text
success response
    → known committed

explicit INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT /
pre-admission TERMINAL
    → known no-commit

local failure before commit dispatch
    → known no-commit

commit dispatched and definitive result lost
    → OUTCOME_UNKNOWN
```

### 14.2 No Remote Cancellation

```text
before caller dispatches commit
    caller MAY choose not to call commit

after commit dispatch
    mutation is not remotely cancellable
```

Caller 本地停止等待 MUST NOT 被解释为 authoritative no-commit evidence。

### 14.3 Retry

Realm State core MUST NOT 自动 retry mutation。

`CONFLICT` 后 caller MAY fresh read → recompute → explicitly submit a new transaction。

`OUTCOME_UNKNOWN` MUST NOT 自动 retry，因为第一次 mutation 可能已提交。

v1 MUST NOT 提供：

```text
client transaction ID
status(transactionId)
dedup journal
replay-safe mutation
```

---

## 15. Capacity Limits

Realm State v1 logical bounds：

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

违反 hard limit MUST 在 mutation 前 reject，并属于 known no-commit。

达到 materialized Record 上限时：

```text
first write to a new Record
    → LIMIT_EXCEEDED / known no-commit

write to existing Record
    → MUST NOT fail merely because record-count limit is reached
```

`list()` v1 不要求 pagination/cursor，因为 materialized Record count 和 identity lengths 已有 hard bound。

### 15.1 Encoded Size / Depth Accounting — Freeze Blocker

在 contract freeze 前 MUST 定义跨 Hostra/PWA 一致的：

```text
JsonValue encoded-size calculation
transaction total payload-size calculation
JsonValue nesting-depth counting rule
```

物理 carrier MUST NOT 通过更宽松的本地 object representation 绕过 logical limit。

---

## 16. Subscription

### 16.1 Types

```ts
export type RealmStateSubscriptionEvent =
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

export interface RealmStateSubscription {
  close(): void;
}
```

Subscription MUST 只观察显式 `RealmStateKey[]`。

新 materialize 的同 namespace Record MUST NOT 因 Collection membership 自动匹配已有 subscription。

### 16.2 Establishment Linearization

`subscribe(keys, listener)` MUST 是 Authority operation，而不是 client-side `read()` 后再注册 listener。

Authority MUST 在一个 serialized logical step 内：

```text
1. validate subscription keys
2. capture baseline snapshot at revision N
3. register observer for relevant commits strictly after N
4. release authority serialization
```

这定义 subscription establishment linearization point。

### 16.3 Handle Visibility / Delivery Order

Author API MUST 保证：

```text
subscription established
→ Promise resolves with RealmStateSubscription handle
→ listener receives baseline @ N
→ listener receives ordered relevant changes > N
```

因此 subscription handle MUST 在第一条 listener callback 前可观察。

即使 post-baseline commit 在 baseline 物理 delivery 前发生，binding MUST buffer/preserve relevant change，并先交付 baseline。

### 16.4 Change Semantics

每个 successful commit 对一个 subscription 至多产生一个 `change` event。

如果一个 transaction 修改多个 subscribed Records，它们 MUST 位于同一个 `change` event。

Failed / conflicted / invalid transaction MUST NOT 产生 `change`。

Successful deep-equal write MUST 产生对应 committed change。

Delivered change revisions MUST：

```text
be > baseline revision
be monotonically increasing
```

Unrelated commits MAY 造成 revision gaps。

### 16.5 Backpressure

Subscription delivery MUST NOT 阻塞 RealmStateAuthority commit lane。

如果 bounded delivery queue overflow，implementation：

```text
MUST NOT silently drop committed change
MUST terminal the subscription with reason = "overflow"
```

### 16.6 Disconnect / Reconnect

v1 MUST NOT 提供 replay journal / resume cursor / `resumeFromRevision`。

```text
binding lost
→ old subscription terminal(reason = "binding-terminal")
→ reconnect
→ fresh subscribe
→ fresh baseline @ current revision
```

恢复模型是 state resynchronization，不是 event replay。

### 16.7 Close

`close()` MUST：

```text
be idempotent
perform local observation teardown
prevent any future listener invocation after close() returns
not emit terminal("closed")
not reactivate the same subscription identity
```

### 16.8 Subscription Record Ordering — Freeze Blocker

正式 freeze 前 MUST 决定 baseline snapshot / change `records` ordering。

当前 candidate direction：按 §4.4 canonical `(namespace,key)` order。

---

## 17. Lifetime / Terminal Policy

```text
Frame suspend        != Realm State unavailable
Frame close          != Realm State deleted
Activation change    != Realm State reset
Renderer reload      != Realm State changed
Data reconnect       != Realm State changed
put(null)            != Record identity forgotten
put(null)            != Collection membership removed
Runtime terminal     → its RealmStateClient terminal/inert
Session terminal     → RealmStateAuthority terminal
RealmStateAuthority fatal → Session terminal
```

Realm State v1 MUST NOT 透明 restart authority、replay journal 或 reattach old clients/subscriptions。

Runtime-scoped client lifetime 是 capability/lifecycle correctness，不是业务 authorization。

---

## 18. Persistence Boundary

RealmStateAuthority 不是 Save Game policy owner。

典型 discovery flow：

```text
list()
→ discover materialized Collections + Records
→ Save policy selects subset
→ read(selected RealmStateKeys)
→ persist selected current values
```

`list()` revision 与随后 `read()` revision MAY 不同。

Realm State v1 MUST NOT 把普通 `list()` 提升成 long-lived MVCC snapshot handle。

如果未来 persistence consumer 必须 capture exact key-set + values at one revision，应基于真实需求增加独立 snapshot/capture contract。

---

## 19. Logical Protocol Boundary

Logical protocol identifier：

```text
loomrealm.realm-state/1
```

物理 binding 至少必须能够表达：

```text
read request / result
list request / result
conditional commit request / result
subscription establish / baseline / change / terminal / close
INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT / TERMINAL / OUTCOME_UNKNOWN
client / authority terminal
```

Hostra/PWA physical realization MAY 不同，但 MUST 保持相同 logical observable semantics。

本 contract MUST NOT 规定 Node Process、Worker、MessagePort、HTTP/WebSocket 等具体 transport。

### 19.1 Wire Error Shape — Freeze Blocker

在 contract freeze 前 MUST 定义 stable public/wire error object shape、category serialization 与 structural diagnostics boundary。

---

## 20. Game Package / Subsystem Synchronization Requirements

本 contract 进入 Active / Normative 前，仓库 MUST 同步至少以下 normative surfaces：

### 20.1 Game Package v1

`GameEntryV1` closed schema MUST 接受 optional `state`，并冻结：

```text
state.records shape
namespace/key grammar
initial-state duplicate identity rejection
JsonValue / size / depth validation
bootstrap payload limits
validated detached immutable snapshot
```

### 20.2 `@loomrealm/subsystem`

Author surface MUST 暴露 Runtime-scoped：

```ts
interface SubsystemScope {
  readonly state: RealmStateClient;
}
```

Business Definition MUST NOT 依赖 RealmStateAuthority implementation、carrier、Hostra/PWA transport 或 host-only binding。

### 20.3 Launcher / Platform Composition

Launcher/Composition MUST：

```text
validate/project Game Entry State during PREPARE
establish fresh RealmStateAuthority before business Runtime side effects
provide Runtime-scoped RealmStateClient binding
propagate RealmStateAuthority fatal to Session terminal
```

---

## 21. Conformance Requirements

在 Active / Normative freeze 前至少 MUST 有 qualification 覆盖：

```text
Identity / Grammar
- namespace/key exact Unicode identity
- invalid slash/control/oversized identity rejection
- no trim/case-fold/Unicode normalization

Bootstrap / Load
- omitted Game Entry state = empty definition
- new-game current = initialValue
- sparse Save override
- Save absent fallback to current Game initialValue
- Save explicit null remains null
- fresh loaded Session revision/version = 0

Materialization / Collection
- explicit initial / load seed / successful first write materializes
- read unknown does not materialize
- put(null) does not dematerialize
- Collection existence derived from materialized Records
- no Collection OCC condition

Read / List
- multi-key read is one revision
- list full/filter snapshots are one revision
- list ordering canonical
- list()+read is not treated as atomic Collection scan

Transaction / OCC
- invalid shape rejected before version comparison
- write-set subset of condition-set
- stale condition → CONFLICT + zero write
- all writes atomic across Collections
- unrelated Record commit does not conflict
- deep-equal successful put advances version/revision

Commit Evidence
- no commit AbortSignal / remote cancellation
- pre-dispatch failure known no-commit
- lost definitive result after dispatch → OUTCOME_UNKNOWN
- no automatic retry

Subscription
- baseline capture + observer registration atomic
- handle observable before first callback
- baseline first
- relevant post-baseline commits ordered and not silently lost
- unrelated revision gaps allowed
- same transaction → at most one change event per subscription
- new same-Collection Record not implicitly subscribed
- overflow / disconnect terminal semantics
- close idempotent and no callbacks after return
- reconnect = fresh subscribe + baseline

Lifetime
- Runtime terminal → client/subscriptions terminal
- RealmStateAuthority fatal → Session terminal
```

---

## 22. Freeze Blockers

以下项目关闭后，本 contract candidate 才适合升级为 Active / Normative：

```text
1. revision/version exact integer bound + exhaustion semantics
2. read([]) / duplicate read identities final rule
3. subscribe([]) / duplicate subscription identities final rule
4. RealmStateSnapshot.records canonical ordering
5. RealmStateCommit.records canonical ordering
6. subscription baseline/change record ordering
7. exact JsonValue encoded-size accounting
8. exact transaction payload-size accounting
9. exact JsonValue nesting-depth accounting
10. stable public/wire error object shape
11. Game Package v1 optional state normative synchronization
12. @loomrealm/subsystem RealmStateClient normative synchronization
```

这些 blocker 不重新打开 Realm State authority / OCC / Collection / subscription core architecture；它们是正式 contract deterministic surface 与仓库同步工作。

---

## 23. Core Invariants

1. 每个 Session 恰有一个 logical RealmStateAuthority；
2. Namespace 是 Record Collection / discovery boundary，不是 value/version/conflict/transaction/security unit；
3. Collection membership 是 observational metadata，不参与 OCC；
4. `(namespace,key)` 是完整 Record identity，也是 replacement/version/conflict unit；
5. Transaction 是 multi-Record atomicity unit，可跨 Collection；
6. 每个 Record 有 immutable `initialValue` 与 mutable current `value`；
7. 每个新 Session revision/version 从 0 开始；
8. `revision` 表示 global successful-commit order；`version` 表示 per-Record successful-write generation；
9. `read()` 返回一个 logical revision 的一致 Record snapshot；
10. `list()` 返回一个 logical revision 的 materialized Collection index，但不是 transactional Collection scan；
11. 每个 write target 必须有 caller-observed Record version condition；
12. stale condition → `CONFLICT` + zero write；
13. successful commit 原子写入全部 targets，只推进一个 global revision，并推进每个 write target 的 Record version；
14. successful deep-equal put 仍是 authoritative write；
15. commit dispatch 后不得提供 remote cancellation；结果不确定时使用 `OUTCOME_UNKNOWN`；
16. Realm State core 不自动 retry mutation；
17. Subscription establishment 原子绑定 baseline 与 post-baseline observer；handle 先于 callback 可观察；
18. Subscription 只观察显式 Record identities；没有 namespace wildcard subscription；
19. overflow/disconnect terminal subscription；恢复使用 fresh baseline；
20. Runtime terminal → client terminal；RealmStateAuthority fatal → Session terminal；
21. Hostra/PWA 可以使用不同物理实现，但不得改变上述 logical observable semantics。
