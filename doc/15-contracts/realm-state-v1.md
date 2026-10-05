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
    Session / Runtime / Frame / Activation / InputTarget / failure unwind

RealmStateAuthority
    Session Shared Business State Authority
    Records / versions / OCC / commit revision

Subsystem Runtime
    domain execution + local state
    author-facing RealmStateClient

Renderer
    no direct Realm State authority

Content
    readonly installation definitions/resources

Platform / Session composition
    physical construction / binding / disposal only
```

Realm State MUST NOT：

```text
be implemented as arbitrary Main business fields
become Renderer-owned state
reuse frame.call() as ordinary shared-state mutation
inherit @loomrealm/data Renderer↔Subsystem connection-local semantics
consume Frame / Activation / InputTarget as State transaction authority
become a universal application store / service locator
```

Session composition MAY construct、wire and dispose Main / RealmStateAuthority sibling components, but MUST NOT become a third application authority or interpret either Main control state or Realm State business values。

RealmStateAuthority fatal MUST be treated as a **Session-fatal condition**：

```text
RealmStateAuthority detects fatal
→ reports Session-fatal condition
→ Main / Session lifecycle owner commits Session terminal + failure unwind
```

RealmStateAuthority MUST NOT itself own Runtime/Frame unwind、Renderer currentness 或 Main Session transition。

Realm State v1 假设同一 Game Package 内的 Subsystem implementation 属于同一受信游戏产品。v1 MUST NOT 提供 Subsystem / namespace / key 级业务 ACL。

### 1.1 State Placement Rule

Realm State SHOULD only contain facts that legitimately need to be **Session-scoped, cross-Subsystem, mutable authoritative business truth** and benefit from Record OCC / subscription semantics。

典型适合：

```text
player global attributes
party / inventory
quest / progression flags
world/session business flags
economy
cross-Subsystem business metadata
```

Framework MUST NOT use Realm State as the owner of：

```text
Frame / Stack / Activation / InputTarget
Runtime lifecycle / failure state
Renderer currentness / Data generation/profile
Input retained state / Interest
RenderDomain / animation / presentation state
Subsystem-local task progress
local caches / derived projections
transport endpoint/connectivity/credential
Platform configuration / executable binding
immutable Content definitions/resources
Save-slot / persistence policy
```

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

Current `read()` / `scan()` / subscription projection MUST NOT 重复携带 immutable `initialValue`。

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

Initial projection 不携 current `revision` / Record `version`，因为 prepared Game baseline 在 Session 内 immutable。

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

### 2.5 Prepared Bootstrap Definition

Realm State runtime/bootstrap layer owns a platform-neutral prepared representation distinct from Game Package document types：

```ts
export interface PreparedRealmStateInitialRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
}

export interface PreparedRealmStateDefinition {
  readonly records: readonly PreparedRealmStateInitialRecord[];
}
```

`PreparedRealmStateDefinition` MUST be detached/immutable trusted input produced during Launcher PREPARE。RealmStateAuthority MUST NOT require `GameEntryV1`、`formatVersion`、`game.json` path 或 Platform Launch Manifest types。

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

跨不可信 carrier/process boundary 后，接收侧 MUST 重新验证 wire representation / 建立 trust；同一 trusted internal path MAY 复用已验证 representation。

---

## 5. Initial / Current Value Model

RealmStateAuthority 对每个 logical Record 内部拥有：

```text
initialValue
    current prepared Game-defined immutable baseline

current value
    current Session authoritative mutable value

version
    per-Record successful-write generation
```

prepared Game baseline 未声明某个合法 Record：

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
1. PreparedRealmStateDefinition explicitly contains the initial Record
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

Game Package v1 document 使用 optional `state`，不升级 `formatVersion`：

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

Game Package owns document schema/validation；Launcher owns runtime projection：

```text
GameEntryV1.state document
→ Game Package validation / detached ValidatedGameEntryV1
→ Launcher projection
→ PreparedRealmStateDefinition
```

Prepared logical output 概念上包含平级 projection：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: PreparedRealmStateDefinition;
}
```

State definition MUST NOT 被塞入 `LogicalGameBootstrap`。RealmStateAuthority MUST consume `PreparedRealmStateDefinition`, not Game Package document types。

Session bootstrap MUST 满足：

```text
PREPARE complete
→ select New Game or validated sparse Load seed
→ composition constructs fresh RealmStateAuthority from prepared.state
→ install immutable prepared Game baseline
→ apply sparse current overrides
→ derive materialized membership
→ revision/version baseline = 0
→ Realm State READY
→ construct Runtime-scoped RealmStateClient bindings
→ business Runtime side effects may begin
```

Session composition owns physical ordering/binding/disposal only；it MUST NOT become a second Realm State authority or Main control authority。

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
    → current value = current prepared Game initialValue
```

Save Record absent 与 Save Record present with `value = null` MUST 区分。

Save MUST NOT redefine `initialValue`；`readInitial()` 在 loaded Session 中仍返回 current prepared Game baseline。

RealmStateAuthority is not Save policy owner and MUST NOT expose save-slot/storage-path/persistence-format authority。

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

export interface RealmStateSubscription {
  close(): void;
}
```

`RealmStateClient` is Runtime-scoped。Its operations MUST NOT require or infer a current Frame / Activation / InputTarget。

```text
state.commit(transaction)
    no Frame argument
    no activationId
    no ambient Frame context
    no Frame mutation permit
```

Frame suspend/close、Activation replacement、pending `frame.call()` MUST NOT by themselves reject an otherwise valid Realm State operation or revoke the Runtime-scoped client。

`read()` / `readInitial()` / `list()` / `scan()` 无 authoritative mutation side effect，因此 MAY 接受 `AbortSignal`。

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
return current prepared Game immutable baseline values
not expose current revision/version
not materialize unknown Records
ignore Runtime current writes
ignore sparse Load current overrides
return detached / immutable projections
```

### 11.3 Returned Ordering — Freeze Blocker

正式 freeze 前 MUST 决定 `RealmStateSnapshot.records` 与 `RealmStateInitialSnapshot.records` order for key-addressed `read()` / `readInitial()`。

当前 candidate direction：按 §4 canonical `(namespace,key)` order 返回，而不是 caller input order。

`scan()` ordering 不属于该 blocker；`scan()` 因为没有 caller-provided key order，MUST 使用 canonical `(namespace,key)` order。

---

## 12. Discovery / `list()` / `scan()`

`list()` 与 `scan()` 都观察当前 materialized Record membership，但职责不同：

```text
list(namespace?)
    discovery/index only
    → key + version

scan(namespace?)
    consistent current snapshot
    → key + value + version
```

两者都不创建独立 Collection authority，也不把 membership 提升成 OCC predicate。

### 12.1 `list()`

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

因此 `list(namespace) + read(discoveredKeys)` MUST NOT 被解释为 atomic Collection key-set + value snapshot。需要当前动态 membership 与对应 values 来自同一个 revision 时，caller SHOULD 使用 `scan()`。

### 12.2 `scan()`

`scan()` 是 materialized current Record snapshot API。

```ts
scan(
  options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }
): Promise<RealmStateSnapshot>;
```

`scan()` MUST 在一个 logical authority snapshot 中同时确定：

```text
materialized Record membership
+
each selected Record current value
+
each selected Record version
+
one RealmStateSnapshot.revision
```

`scan()` 无 `namespace` 时 MUST 返回当前全部 materialized Records；`scan({ namespace: "quest" })` MUST 只返回该 namespace 当前 materialized Records。

所有返回 Record 的 key、value、version MUST 来自同一个 logical revision。并发 commit 可以发生在 `scan()` 完成之后，但 MUST NOT 使同一个 `scan()` result 混合不同 revision 的 membership 或 values。

不存在匹配的 materialized Record 时 MUST 返回：

```ts
{
  revision: N,
  records: []
}
```

`scan()` MUST：

```text
not materialize unknown Records
not return initialValue
return detached / immutable current JsonValue projections
return records in canonical (namespace,key) UTF-8 byte order
```

`scan()` 是 point-in-time observation，不是 Collection lock、predicate 或 transaction condition。之后新的 Record materialization、Record mutation 或 Collection membership change 都是合法的；如果业务 correctness 依赖未来 commit 时 membership 仍未变化，业务仍 MUST 将该 invariant 显式建模为普通 versioned Record 并参与 OCC。

v1 public `scan()` 不暴露 pagination/cursor 或 long-lived snapshot handle。Physical binding MAY 对一个 logical `scan()` result 做内部 chunking/streaming，但 MUST 对 caller 保持一个 revision 的单一 logical snapshot semantics。

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

Frame state / Activation / InputTarget MUST NOT participate in Realm State transaction conditions or admission。

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

`scan()` v1 同样不暴露 pagination/cursor；它的 logical result 是一个 revision 的完整 snapshot。Physical binding MAY chunk/stream 单次 logical result，但 scan result 的 exact physical resource bound/profile 在正式 freeze 前仍需关闭。

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

### 16.1 Listener Execution Boundary

Listener delivery MUST occur outside RealmStateAuthority serialized mutation/establishment lane。

Listener is Runtime-local business callback, not Authority flow control。A listener synchronous throw or returned rejected thenable MUST：

```text
be locally contained / diagnostic
not retroactively fail the committed transaction
not make the subscription protocol fatal merely because business callback failed
not make RealmStateAuthority fatal
not make Session terminal
not act as delivery ACK/backpressure flow control
```

Listener MAY reenter：

```text
read / readInitial / list / scan / commit / subscribe / close
```

Binding/SDK MUST NOT hold an Authority lock while invoking listener and MUST NOT deadlock on such reentrancy。

### 16.2 Backpressure / Overflow

Subscription delivery MUST NOT 阻塞 RealmStateAuthority commit lane。无法继续保证 ordered delivery 时 MUST terminal with `overflow`，MUST NOT silently drop。

### 16.3 Binding Loss / Recovery

Physical binding loss MUST terminal the affected old subscription with `binding-terminal` and MAY terminal the affected client according to the physical profile。Old client/subscription identity MUST NOT be transparently reattached。

Physical Realm State binding loss by itself MUST NOT：

```text
fail Main Runtime
unwind Frame
terminate Session
reset RealmStateAuthority
change Main DataAuthority
```

If a later profile supports a fresh logical client binding, recovery MUST use fresh binding + fresh subscribe + fresh baseline。v1 MUST NOT provide replay journal/resume cursor。

### 16.4 Close

`close()` MUST idempotent；返回后 listener MUST NOT 再被调用；MUST NOT emit terminal("closed")；closed subscription identity MUST NOT reactivated。

Subscription baseline/change record ordering 在正式 freeze 前仍为 blocker；candidate direction 为 canonical `(namespace,key)` order。

---

## 17. Lifetime / Terminal Policy

```text
Frame suspend        != Realm State unavailable
Frame close          != Realm State unavailable / deleted
Activation change    != Realm State reset / client replacement
Renderer reload      != Realm State changed
Data reconnect       != Realm State changed
put(null)            != Record identity forgotten
put(null)            != Collection membership removed
Realm State binding loss → affected binding/client/subscriptions terminal only
Runtime terminal     → its RealmStateClient / subscriptions terminal
Session terminal     → RealmStateAuthority terminal
RealmStateAuthority fatal → report Session-fatal condition to Main/Session lifecycle owner
```

Realm State v1 MUST NOT transparent restart authority、replay journal 或 reattach old clients/subscriptions。

Runtime-scoped client lifetime 是 capability/lifecycle correctness，不是业务 authorization。

Main/Session lifecycle owner remains the sole owner of Session terminal and Runtime/Frame failure unwind。

---

## 18. Persistence Boundary

RealmStateAuthority 不是 Save Game policy owner。

Persistence SHOULD 根据 key-set 的来源选择读取方式：

```text
Save policy already knows exact keys
→ read(keys)
→ one-revision current snapshot

Save policy needs current dynamic materialized membership
→ scan() / scan({ namespace })
→ membership + current values + versions from one revision
```

`list()` 仍可用于轻量 discovery、工具、调试或先观察 key/version index；但 `list() + read()` 不提供 atomic membership + value snapshot，因此不应在需要 exact dynamic snapshot correctness 时替代 `scan()`。

Save policy MAY 在取得 `read()` / `scan()` 的一致 current snapshot 后选择持久化其中全部或部分 Records。Realm State 仍 MUST NOT interpret save-slot、storage path、autosave/cloud policy、persistence format 或业务上的“哪些 Record 应该保存”。

Realm State v1 MUST NOT 把 `list()` / `scan()` 提升成 long-lived MVCC snapshot handle，也 MUST NOT expose save-slot/storage-path/persistence-format policy。

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
current scan request / result
conditional commit request / result
subscription establish / baseline / change / terminal / close
INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT / TERMINAL / OUTCOME_UNKNOWN
client / authority terminal
Session-fatal report from Authority to lifecycle owner
```

Hostra/PWA physical realization MAY 不同，但 MUST 保持相同 logical observable semantics。

本 contract MUST NOT 规定 Node Process、Worker、MessagePort、HTTP/WebSocket 等具体 transport，也 MUST NOT 把 Realm State 塞入 renderer-data profile、Runtime Control 或 `frame.call()`。

Physical binding/transport MUST NOT own Main Runtime/Session lifecycle policy or automatically retry mutation。

### 19.1 Wire Error Shape — Freeze Blocker

正式 freeze 前 MUST 定义 stable public/wire error object shape、category serialization 与 structural diagnostics boundary。

---

## 20. Cross-contract Synchronization Requirements

Game Package v1 MUST 接受 optional `state.records`，并保持 closed schema。Game Package owns document validation only；its `RealmStateGameDefinitionV1` MUST NOT become the RealmStateAuthority bootstrap ABI。

Launcher MUST project validated Game State to detached/immutable `PreparedRealmStateDefinition` during PREPARE。

Subsystem author surface MUST 暴露 Runtime-scoped：

```ts
interface SubsystemScope {
  readonly state: RealmStateClient;
}
```

`RealmStateClient` MUST NOT require Frame/Activation identity or mutation permit。

Launcher/Platform Composition MUST：

```text
validate Game Entry State during PREPARE
project to PreparedRealmStateDefinition
keep prepared State separate from LogicalGameBootstrap
establish fresh RealmStateAuthority before business Runtime side effects
provide Runtime-scoped RealmStateClient binding
report RealmStateAuthority fatal to Main/Session lifecycle owner
keep physical binding loss local to Realm State plane
```

Business Definition MUST NOT 依赖 RealmStateAuthority implementation、Game Package document types、carrier、Hostra/PWA transport 或 host-only binding。

Session composition MUST remain physical assembly/lifetime containment, not a third application authority。

---

## 21. Conformance Requirements

Active / Normative freeze 前至少 MUST 有 qualification 覆盖：

```text
Authority Placement
- one RealmStateAuthority per Session
- Session composition cannot mutate/interpret Main or Realm State application authority
- RealmStateAuthority fatal reports Session-fatal condition; Main/Session owner performs terminal/unwind
- state.commit has no Frame/Activation dependency
- Frame suspend/close/Activation replacement does not revoke RealmStateClient
- physical State binding loss does not fail Runtime/Session or reset Authority

Game Entry / Bootstrap
- existing GameEntryV1 without state remains valid
- optional state validates as Game Package document
- Launcher projects validated State to PreparedRealmStateDefinition
- RealmStateAuthority consumes prepared representation, not GameEntryV1
- invalid/duplicate/oversized initial Records reject during PREPARE
- State READY before first business Runtime side effect

Identity / Grammar
- exact Unicode identity / UTF-8 bounds / no normalization

Bootstrap / Load
- omitted Game Entry state = empty definition
- new-game current = initial
- sparse Save override / absent fallback / explicit null
- fresh loaded Session revision/version = 0

Current / Initial Read
- multi-key current read is one revision
- ordinary read excludes initialValue
- readInitial returns immutable prepared-Game baseline only
- unknown current/initial read does not materialize

Materialization / Discovery / Scan
- initial / Load seed / successful first write materialize
- put(null) does not dematerialize
- flat list full/filter snapshot is one revision
- list canonical ordering
- scan full/filter returns materialized membership + current value + version from one revision
- scan excludes initialValue and does not materialize unknown Records
- scan canonical ordering
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
- Frame/Activation state never participates in transaction admission

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
- listener executes outside Authority lane
- listener throw/rejected thenable locally contained
- listener may reenter RealmStateClient without deadlock
- overflow/disconnect terminal old subscription/binding
- close idempotent / no callbacks after return
- fresh binding/subscribe/baseline recovery; no replay/reattach

Lifetime
- Runtime terminal → client/subscriptions terminal
- RealmStateAuthority fatal → Session-fatal report to Main/Session owner
```

---

## 22. Freeze Blockers

以下项目关闭后，本 contract candidate 才适合升级为 Active / Normative：

```text
1. revision/version exact integer bound + exhaustion semantics
2. read([]) / duplicate read identities final rule
3. readInitial([]) / duplicate readInitial identities final rule
4. subscribe([]) / duplicate subscription identities final rule
5. RealmStateSnapshot.records ordering for key-addressed read()
6. RealmStateInitialSnapshot.records canonical ordering
7. RealmStateCommit.records canonical ordering
8. subscription baseline/change record ordering
9. exact JsonValue encoded-size accounting
10. exact transaction payload-size accounting
11. exact JsonValue nesting-depth accounting
12. stable public/wire error object shape
13. bounded subscription queue physical profile
14. Load current-seed total resource bound
15. physical client/binding terminal mapping while preserving no Runtime/Session supervision ownership
16. scan result exact physical resource bound/profile while preserving one-revision logical snapshot semantics
```

这些 blocker 不重新打开 Realm State authority / OCC / Collection / subscription core architecture；它们是 formal deterministic surface / representation / profile closure。

---

## 23. Core Invariants

1. 每个 Session 恰有一个 logical RealmStateAuthority；
2. Main唯一拥有 Session/Runtime/Frame/Activation/InputTarget/failure unwind；RealmStateAuthority只拥有 shared business Records；
3. Session composition只拥有 physical assembly/order/disposal，不是第三 application authority；
4. RealmStateAuthority fatal 只报告 Session-fatal condition，Main/Session owner提交 terminal/unwind；
5. Namespace 是 Record Collection / discovery boundary，不是 value/version/conflict/transaction/security unit；
6. Collection membership 是 observational metadata，不参与 OCC；
7. `(namespace,key)` 是完整 Record identity，也是 replacement/version/conflict unit；
8. Transaction 是 multi-Record atomicity unit，可跨 Collection；
9. Authority 内部每个 Record 有 immutable initial baseline + mutable current value；ordinary current projection 不重复携带 initial value；
10. `readInitial()` 单独投影 immutable prepared-Game baseline，不携 current revision/version；
11. Game Package document State 与 Realm State bootstrap representation 分离；Launcher投影 `PreparedRealmStateDefinition`；
12. RealmStateAuthority 不依赖 GameEntryV1/formatVersion/game.json/Platform manifest；
13. Runtime-scoped RealmStateClient 不需要 Frame/Activation/InputTarget；Frame transitions 不构成 State admission condition；
14. Unknown read/readInitial 不 materialize；`put(null)` 不 dematerialize；
15. `list()` 是 flat deterministic discovery/index snapshot，只返回 key/version，不是 transactional Collection predicate；
16. `scan()` 是 materialized current Record 的 point-in-time consistent snapshot，membership + current value + version MUST 来自同一个 revision；
17. `scan()` 不把 Collection membership 提升为 future transaction predicate；需要该 invariant 时业务必须显式建模 versioned Record；
18. revision 是 global State commit sequence；version 是 per-Record OCC generation；
19. every write target has exactly one version condition；stale condition → CONFLICT + zero write；
20. deep-equal successful put advances revision/version；
21. successful commit returns revision + written versions only；
22. no remote mutation cancellation；post-dispatch ambiguity → OUTCOME_UNKNOWN；no automatic retry；
23. semantic validation has one owner per trust boundary；trusted internal representations may be reused；
24. Authority serialized step excludes avoidable deep validation/serialization/listener delivery；
25. subscription establishment atomically binds baseline + subsequent observer；
26. listener delivery is outside Authority lane；listener failure is Runtime-local and reentrant-safe；
27. overflow/binding loss terminal old observation binding without silently dropping or changing Main lifecycle；
28. old client/subscription identities are never transparently reattached；
29. Realm State does not own Save policy、Renderer/Data/Input/Render、Content、Platform configuration or local caches/tasks；
30. Realm State must be READY before first business Runtime side effect；
31. Hostra/PWA physical realization may differ but observable logical semantics must match。
