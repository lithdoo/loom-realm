# LoomRealm Realm State v1 Contract

> 层级：正式契约  
> 状态：Draft / Normative Candidate  
> 契约版本：1  
> 逻辑协议：`loomrealm.realm-state/1`  
> 稳定程度：**Core Semantics Synchronized / Representation Freeze Blockers Remaining / Not Implemented / Not Qualified**  
> 架构来源：[Realm State：Session 级共享业务状态系统](../10-architecture/realm-state-system.md)  
> 相关契约：[Game Package v1](./game-package-v1.md)  
> 最近复核：2026-10-05

本文定义 Realm State v1 的 formal contract candidate。本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

本文冻结 Realm State logical semantics 与 author/authority boundary；物理 carrier、Hostra/PWA IPC 形式、进程/Worker 拓扑不是本 contract 的 authority。

> [!IMPORTANT]
> 本文当前仍是 **Normative Candidate**。Core authority / Collection / Record / OCC / subscription / lifetime semantics 已与架构同步；§22 的 representation / deterministic API / wire blockers 在实现前仍必须关闭。

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

### 2.2 Current Record

```ts
export interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
  readonly version: number;
}

export interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}
```

Current `read()` / subscription projection MUST NOT 重复携带 immutable `initialValue`。

### 2.3 Initial Record

```ts
export interface RealmStateInitialRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
}

export interface RealmStateInitialSnapshot {
  readonly records: readonly RealmStateInitialRecord[];
}
```

Initial projection 不携 current `revision` / Record `version`，因为 current Game baseline 在 Session 内 immutable。

### 2.4 Discovery Index

```ts
export interface RealmStateIndexRecord {
  readonly key: RealmStateKey;
  readonly version: number;
}

export interface RealmStateIndexSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateIndexRecord[];
}
```

Public index MUST be flat；v1 MUST NOT 引入无独立 metadata 的 `RealmStateCollectionIndex` wrapper。

---

## 3. Namespace / Collection Semantics

`namespace` MUST 被解释为 Record Collection identifier。

```text
Namespace / Collection
    organization + discovery/filter boundary

Key
    Record identifier inside one Collection

Record identity
    (namespace,key)
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

Collection existence MUST 由 materialized Record membership 派生：一个 namespace 可发现，当且仅当至少一个 materialized Record 使用该 namespace。

Collection membership 是 **observational discovery metadata**，MUST NOT 被解释为 transactional set predicate。

如果业务 correctness 依赖完整成员集合，业务 SHOULD 将 membership/invariant 显式建模为普通 versioned Record，并使用该 Record 的 version 参与普通 OCC conditions。

---

## 4. Namespace / Key Identity Grammar

Namespace MUST：

```text
be non-empty
be a valid Unicode scalar-value string
have UTF-8 encoded length <= 64 bytes
not contain '/'
not contain U+0000..U+001F
not contain U+007F
```

Key MUST：

```text
be non-empty
be a valid Unicode scalar-value string
have UTF-8 encoded length <= 256 bytes
not contain '/'
not contain U+0000..U+001F
not contain U+007F
```

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

需要 deterministic identity ordering 时，比较 MUST 为 namespace UTF-8 unsigned lexicographic ascending，再按 key 使用相同规则；MUST NOT 使用 locale-sensitive ordering。

实现 MAY intern/cache 已验证的 identity 或投影为 trusted internal `RecordId`；logical grammar 不要求每次操作重新 UTF-8 encode/scan 同一已验证字符串。

---

## 5. Initial / Current Value Model

RealmStateAuthority 对每个 logical Record 内部拥有：

```text
initialValue
    current Game-defined immutable baseline

current value
    current Session authoritative mutable value

version
    per-Record successful-write generation
```

Game Entry 未声明某个合法 Record：

```text
initialValue = null
```

New Game：

```text
current value = initialValue
```

从未 materialize 的合法 Record：

```text
read()        → value = null, version = 0
readInitial() → value = null
```

Runtime mutation MUST NOT 修改 `initialValue`。

v1 mutation MUST 使用 whole-record `put` replacement，不提供 field patch / field merge / field version。

`put(null)` MUST：

```text
set current value to null
not change initialValue
not dematerialize the Record
not reset version
```

成功 deep-equal `put` 仍 MUST 是 authoritative write：Record version advances、global revision advances、matching subscriptions observe a committed change。

---

## 6. Materialization

一个 Record 在以下任一条件成立时 materialized：

```text
1. current Game Entry explicitly declares the initial Record
2. validated Load seed explicitly contains the Record
3. Runtime successfully commits the Record at least once
```

`read()` / `readInitial()` unknown logical Record MUST NOT materialize 它。

`put(null)` MUST NOT dematerialize Record。

因为 v1 没有 dematerialization，一个已经出现的 Collection 在当前 Session 内不会因 `put(null)` 消失。

---

## 7. Revision / Version Model

`revision` 是 RealmStateAuthority 的 global successful-commit sequence / current snapshot identity。

`version` 是单个 Record 的 successful-write generation，用于 OCC conflict detection。

每个新 Session：

```text
global revision = 0
every logical/materialized Record version = 0
```

每次 successful transaction MUST：

```text
global revision += 1
for each write target: record.version += 1
```

未写 Record version MUST NOT 因其他 Record commit 改变。

```text
revision
    snapshot identity / total commit order / subscription ordering

version
    per-Record OCC conflict detection
```

普通 transaction MUST NOT 默认要求 global revision 未变化。

### 7.1 Numeric Representation — Freeze Blocker

正式 freeze 前 MUST 决定 `revision` / `version` exact integer bound 与 exhaustion behavior。

当前 candidate direction：non-negative JavaScript safe integer `0..2^53-1`；本条尚未升级为最终 normative requirement。

---

## 8. Game Entry / Session Bootstrap Integration

Game Entry v1 使用 optional `state`，不升级 `formatVersion`：

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

Game Entry MUST NOT 指定 Record version、global revision 或 transaction ID。

Launcher PREPARE MUST 在任何 business Runtime side effect 前完成 Realm State initial definition validation / detached projection。

Prepared logical output 概念上包含平级 projection：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: RealmStateGameDefinitionV1;
}
```

State definition MUST NOT 被塞入 `LogicalGameBootstrap`。

Session bootstrap MUST 满足：

```text
PREPARE complete
→ select New Game or validated sparse Load seed
→ create fresh RealmStateAuthority
→ install immutable Game initial baseline
→ apply sparse current overrides
→ derive materialized membership
→ revision/version baseline = 0
→ Realm State READY
→ construct Runtime-scoped RealmStateClient bindings
→ business Runtime side effects may begin
```

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

Save Record absent 与 Save Record present with `value = null` MUST 区分。

Save MUST NOT redefine `initialValue`；`readInitial()` 在 loaded Session 中仍返回 current Game Entry baseline。

---

## 10. Author-facing API Candidate

```ts
export interface RealmStateClient {
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

`read()` / `readInitial()` / `list()` 无 authoritative mutation side effect，因此 MAY 接受 `AbortSignal`。

`commit()` MUST NOT 接受 `AbortSignal` 或 remote mutation cancellation capability。

所有 live Runtime-scoped RealmStateClient MAY 访问任意 valid Record；v1 不定义业务 ACL。

### 10.1 Observation Input Shape — Freeze Blocker

正式 freeze 前 MUST 决定：

```text
read([]) / duplicate read identities
readInitial([]) / duplicate readInitial identities
subscribe([]) / duplicate subscription identities
```

当前 candidate direction：empty 与 duplicate 均 `INVALID_REQUEST`，不得 silently deduplicate。

---

## 11. Current Read / Initial Read

### 11.1 `read()`

`read(keys)` MUST：

```text
validate every RealmStateKey
read all requested Records from one logical authority state
return one RealmStateSnapshot.revision
return detached / immutable current JsonValue projections
not materialize unknown Records
```

同一 response 中所有 Records MUST 来自同一个 logical revision。

Unrelated concurrent commits MAY cause returned `revision` to advance without changing requested Record versions。

### 11.2 `readInitial()`

`readInitial(keys)` MUST：

```text
return current Game immutable baseline values
not expose current revision/version
not materialize unknown Records
ignore Runtime current writes
ignore sparse Load current overrides
return detached / immutable projections
```

### 11.3 Returned Ordering — Freeze Blocker

正式 freeze 前 MUST 决定 `RealmStateSnapshot.records` 与 `RealmStateInitialSnapshot.records` order。

当前 candidate direction：按 §4 canonical `(namespace,key)` order 返回，而不是 caller input order。

---

## 12. Discovery Index / `list()`

`list()` 是 materialized Record discovery API；Collection 仍是 organization/discovery concept，但 public result 不创建 Collection wrapper object。

```ts
export interface RealmStateIndexRecord {
  readonly key: RealmStateKey;
  readonly version: number;
}

export interface RealmStateIndexSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateIndexRecord[];
}
```

`list()` MUST 返回同一个 logical revision 的 flat materialized Record index，不返回 initial/current value。

`list({ namespace: "quest" })` MUST 只返回该 namespace 的 materialized Records。

不存在 materialized Record 时 MUST 返回：

```ts
{
  revision: N,
  records: []
}
```

`records` MUST 按 canonical `(namespace,key)` UTF-8 byte order 排序。

`list()` 是 point-in-time discovery snapshot，不是 transactional Collection scan：

```text
list(namespace) @ N
→ choose keys
→ concurrent membership change @ N+1
→ read(previously selected keys) @ N+1
```

是合法行为。

因此 `list(namespace) + read(discoveredKeys)` MUST NOT 被解释为 atomic Collection key-set + value snapshot。

---

## 13. Transaction / OCC

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

合法 transaction MUST 满足：

```text
conditions.length >= 1
writes.length >= 1
condition Record identities are unique
write Record identities are unique
every write Record appears exactly once in conditions
writes MAY be a strict subset of conditions
```

Read-only business dependency MAY 只出现在 conditions 中。Transaction MAY 跨 Collections；Collection 不形成额外 conflict domain。

Invalid request MUST 在 Record version comparison 前 reject，不得映射为 `CONFLICT`。

Authority logical admission order：

```text
1. structural shape
2. namespace/key grammar
3. JsonValue validity
4. count / byte / depth limits
5. identity uniqueness
6. write-set subset of condition-set
7. Record version comparison
8. atomic commit
```

Atomic commit MUST：

```text
compare all condition versions against one authority state
→ any mismatch: CONFLICT / zero write
→ otherwise replace all write target current values
→ materialize new Records
→ update derived Collection membership
→ global revision + 1
→ each write target version + 1
→ publish one committed change
→ return commit evidence
```

### 13.1 Validation Ownership / Trusted Representation

上述顺序定义 logical admission requirements，不要求 SDK、binding、transport adapter 与 Authority 对同一个可信对象逐层完整重跑等价 validation。

每个 physical trust boundary MUST 有明确 validation owner：

```text
untrusted / author-owned input
→ validation owner
→ trusted validated representation
→ Authority execution
```

实现 MAY 使用 interned RecordId、ValidatedJsonValue、ValidatedRealmStateTransaction 等 internal representation，只要 caller mutation 无法在 validation 后篡改它，且跨不可信 carrier 后由接收侧重新建立 trust。

JsonValue validity、nesting depth、encoded-size accounting 与 detach/immutable construction SHOULD 可融合为一个 bounded traversal；contract MUST NOT 要求先 materialize 完整 canonical JSON string/byte buffer 才能计算 size。

RealmStateAuthority serialized mutation step SHOULD 只承担 authority-sensitive lookup/version/ref-swap/revision/index work；serialization、avoidable deep clone、canonical result sorting、physical copy 与 listener delivery SHOULD 在该 serialized step 外完成。

---

## 14. Commit Result / Evidence

```ts
export interface RealmStateCommit {
  readonly revision: number;
  readonly records: readonly {
    readonly key: RealmStateKey;
    readonly version: number;
  }[];
}
```

`records` MUST 包含全部 write targets，包括 deep-equal successful writes。

Commit result MUST NOT echo `value`。v1 是 whole-record replacement，Authority 不做 merge/normalization/server-side transform；如果 caller 之后需要 authoritative current observation，应显式 `read()`。

Commit result ordering 在正式 freeze 前仍为 blocker；candidate direction 为 canonical `(namespace,key)` order。

Logical API MUST 至少区分：

```text
INVALID_REQUEST    known no-commit
LIMIT_EXCEEDED     known no-commit
CONFLICT           valid request, stale condition, known no-commit
TERMINAL           pre-admission terminal, known no-commit
OUTCOME_UNKNOWN    mutation may have crossed commit point; definitive result unavailable
```

`CONFLICT` MUST 意味着 zero write。

`OUTCOME_UNKNOWN` MUST NOT 被映射成 `CONFLICT` 或 known no-commit。

```text
success response
    → known committed

explicit INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT /
pre-admission TERMINAL
    → known no-commit

local failure before dispatch
    → known no-commit

dispatched mutation + definitive result lost
    → OUTCOME_UNKNOWN
```

`commit()` dispatch 后 mutation MUST NOT 远程取消。Caller 本地停止等待 MUST NOT 被解释为 no-commit evidence。

Realm State core MUST NOT 自动 retry mutation。尤其 `OUTCOME_UNKNOWN` MUST NOT 自动 retry。

v1 MUST NOT 提供 transaction ID、status query、dedup journal 或 replay-safe mutation。

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
readInitial(keys) key count           <= 256
subscribe(keys) key count             <= 256
transaction conditions count          <= 128
transaction writes count              <= 128
transaction total payload             <= 2 MiB
```

违反 hard limit MUST 在 mutation 前 reject，并属于 known no-commit。

达到 materialized Record 上限时，first write to a new Record MUST `LIMIT_EXCEEDED`；write to an existing Record MUST NOT 仅因为 record-count 已达上限而失败。

`list()` v1 不要求 pagination/cursor，因为 materialized Record count 与 identity lengths 已有 hard bound。

### 15.1 Size / Depth Accounting — Freeze Blocker

正式 freeze 前 MUST 定义跨 Hostra/PWA 一致的 single-value encoded-size、transaction total payload-size 与 nesting-depth exact accounting rule。

该规则 MUST 允许等价 streaming/one-pass counting；物理 carrier MUST NOT 通过本地 object representation 绕过 logical limit。

---

## 16. Subscription

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

Subscription MUST 只观察显式 `RealmStateKey[]`；新 materialize 的同 namespace Record MUST NOT 自动匹配已有 subscription。

Subscription current projection MUST NOT 重复携带 `initialValue`。

Establishment MUST 是 Authority operation。Authority MUST 在同一个 serialized logical step 内：

```text
1. admit/validate subscription identities
2. capture current baseline @ revision N
3. register observer for relevant commits strictly after N
4. release authority serialization
```

Author API MUST 保证：

```text
subscription established
→ Promise resolves with RealmStateSubscription handle
→ first listener event = baseline @ N
→ ordered relevant changes > N
```

即使 post-baseline commit 在 baseline 物理 delivery 前发生，binding MUST preserve/buffer relevant change，并先交付 baseline。

每个 successful commit 对一个 subscription 至多产生一个 `change` event；同一 transaction 修改多个 subscribed Records 时 MUST 聚合在该 event 中。

Failed/conflicted/invalid transaction MUST NOT 产生 change。Successful deep-equal write MUST 产生 relevant change。

Change revisions MUST monotonically increase；unrelated commits MAY 造成 gaps。

Subscription delivery MUST NOT 阻塞 RealmStateAuthority commit lane。无法继续保证 ordered delivery 时 MUST terminal with `overflow`，MUST NOT silently drop。

Binding lost：old subscription MUST terminal `binding-terminal`；恢复 MUST fresh subscribe + fresh baseline。v1 MUST NOT 提供 replay journal/resume cursor。

`close()` MUST idempotent；返回后 listener MUST NOT 再被调用；MUST NOT emit terminal("closed")；closed subscription identity MUST NOT reactivated。

Subscription baseline/change record ordering 在正式 freeze 前仍为 blocker；candidate direction 为 canonical `(namespace,key)` order。

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
Runtime terminal     → its RealmStateClient / subscriptions terminal
Session terminal     → RealmStateAuthority terminal
RealmStateAuthority fatal → Session terminal
```

Realm State v1 MUST NOT 透明 restart authority、replay journal 或 reattach old clients/subscriptions。

Runtime-scoped client lifetime 是 capability/lifecycle correctness，不是业务 authorization。

---

## 18. Persistence Boundary

RealmStateAuthority 不是 Save Game policy owner。

典型 flow：

```text
list()
→ discover materialized RealmStateKeys
→ Save policy selects subset
→ read(selected keys)
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
current read request / result
initial read request / result
flat list request / result
conditional commit request / result
subscription establish / baseline / change / terminal / close
INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT / TERMINAL / OUTCOME_UNKNOWN
client / authority terminal
```

Hostra/PWA physical realization MAY 不同，但 MUST 保持相同 logical observable semantics。

本 contract MUST NOT 规定 Node Process、Worker、MessagePort、HTTP/WebSocket 等具体 transport，也 MUST NOT 把 Realm State 塞入 renderer-data profile 或 `frame.call()`。

### 19.1 Wire Error Shape — Freeze Blocker

正式 freeze 前 MUST 定义 stable public/wire error object shape、category serialization 与 structural diagnostics boundary。

---

## 20. Cross-contract Synchronization Requirements

Game Package v1 MUST 接受 optional `state.records`，并保持 closed schema。

Subsystem author surface MUST 暴露 Runtime-scoped：

```ts
interface SubsystemScope {
  readonly state: RealmStateClient;
}
```

Launcher/Platform Composition MUST：

```text
validate/project Game Entry State during PREPARE
keep State definition separate from LogicalGameBootstrap
establish fresh RealmStateAuthority before business Runtime side effects
provide Runtime-scoped RealmStateClient binding
propagate RealmStateAuthority fatal to Session terminal
```

Business Definition MUST NOT 依赖 RealmStateAuthority implementation、carrier、Hostra/PWA transport 或 host-only binding。

---

## 21. Conformance Requirements

Active / Normative freeze 前至少 MUST 有 qualification 覆盖：

```text
Identity / Grammar
- exact Unicode identity / UTF-8 bounds / no normalization

Bootstrap / Load
- omitted Game Entry state = empty definition
- new-game current = initial
- sparse Save override / absent fallback / explicit null
- fresh loaded Session revision/version = 0
- State READY before first business Runtime side effect

Current / Initial Read
- multi-key current read is one revision
- ordinary read excludes initialValue
- readInitial returns immutable current-Game baseline only
- unknown current/initial read does not materialize

Materialization / Discovery
- initial / Load seed / successful first write materialize
- put(null) does not dematerialize
- flat list full/filter snapshot is one revision
- list canonical ordering
- Collection membership not accepted as OCC condition
- list()+read not treated as atomic Collection scan

Transaction / OCC
- invalid shape rejected before version comparison
- every write target has exactly one condition
- stale condition → CONFLICT + zero write
- all writes atomic across Collections
- unrelated Record commit does not conflict
- deep-equal successful put advances version/revision
- commit result contains written identities/new versions only, no value echo

Validation / Hot Path
- one validation owner per trust boundary
- validated representation isolated from caller mutation
- no required equivalent deep revalidation across trusted internal layers
- one-pass JsonValue validate/size/depth/detach allowed
- serialized Authority mutation path excludes avoidable serialization/listener delivery

Commit Evidence
- no remote cancellation
- pre-dispatch failure known no-commit
- lost definitive result after dispatch → OUTCOME_UNKNOWN
- no automatic retry

Subscription
- baseline capture + observer registration atomic
- handle observable before first callback
- baseline first
- current projection excludes initialValue
- relevant changes ordered and not silently lost
- same transaction → at most one change event
- new same-Collection Record not implicitly subscribed
- overflow/disconnect terminal
- close idempotent / no callbacks after return
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
3. readInitial([]) / duplicate readInitial identities final rule
4. subscribe([]) / duplicate subscription identities final rule
5. RealmStateSnapshot.records canonical ordering
6. RealmStateInitialSnapshot.records canonical ordering
7. RealmStateCommit.records canonical ordering
8. subscription baseline/change record ordering
9. exact JsonValue encoded-size accounting
10. exact transaction payload-size accounting
11. exact JsonValue nesting-depth accounting
12. stable public/wire error object shape
13. bounded subscription queue physical profile
14. Load current-seed total resource bound
```

这些 blocker 不重新打开 Realm State authority / OCC / Collection / subscription core architecture；它们是 formal deterministic surface / representation / profile closure。

---

## 23. Core Invariants

1. 每个 Session 恰有一个 logical RealmStateAuthority；
2. Namespace 是 Record Collection / discovery boundary，不是 value/version/conflict/transaction/security unit；
3. Collection membership 是 observational metadata，不参与 OCC；
4. `(namespace,key)` 是完整 Record identity，也是 replacement/version/conflict unit；
5. Transaction 是 multi-Record atomicity unit，可跨 Collection；
6. Authority 内部每个 Record 有 immutable initial baseline + mutable current value；ordinary current projection 不重复携带 initial value；
7. `readInitial()` 单独投影 immutable current-Game baseline，不携 current revision/version；
8. 每个新 Session revision/version 从 0 开始；
9. `revision` 表示 global successful-commit order；`version` 表示 per-Record successful-write generation；
10. `read()` 返回一个 logical revision 的一致 current snapshot；
11. `list()` 返回一个 logical revision 的 flat materialized Record index，但不是 transactional Collection scan；
12. 每个 write target 必须有 caller-observed Record version condition；stale condition → `CONFLICT` + zero write；
13. successful commit 原子写入全部 targets，只推进一个 global revision，并推进每个 write target version；
14. successful deep-equal put 仍是 authoritative write；
15. commit result 只返回 revision + written identities/new versions，不 echo value；
16. commit dispatch 后不得 remote cancel；结果不确定时使用 `OUTCOME_UNKNOWN`；不得自动 retry；
17. Subscription establishment 原子绑定 baseline 与 post-baseline observer；handle 先于 callback 可观察；
18. Subscription 只观察显式 Record identities；没有 namespace wildcard；
19. overflow/disconnect terminal subscription；恢复使用 fresh baseline；
20. semantic validation 每个不可信边界有明确 owner；trusted validated representation 可在内部复用；
21. Runtime terminal → client terminal；RealmStateAuthority fatal → Session terminal；
22. Hostra/PWA 可以使用不同 physical realization，但不得改变上述 logical observable semantics。
