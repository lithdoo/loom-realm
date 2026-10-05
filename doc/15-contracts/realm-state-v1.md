# LoomRealm Realm State v1 Contract

> 层级：正式契约  
> 状态：**Active / Normative (Pre-release Implementation Freeze)**  
> 契约版本：1  
> 逻辑协议：`loomrealm.realm-state/1`  
> 稳定程度：**Architecture + Logical Semantics + Deterministic Surface Frozen / Not Implemented / Not Qualified**  
> 架构来源：[Realm State：Session 级共享业务状态系统](../10-architecture/realm-state-system.md)  
> 相关契约：[Game Package v1](./game-package-v1.md)  
> 最近复核：2026-10-05

本文定义 Realm State v1 的实现冻结契约。本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> [!IMPORTANT]
> Realm State v1 的 architecture、author-facing logical semantics、lifetime/failure boundary、deterministic API surface 与 v1 physical-profile requirements 已冻结。实现 Agent SHOULD 直接按本文落地，不应在实现过程中重新设计 authority、Save/Load bootstrap、automatic retry、transaction journal、Collection authority、binding lifetime 或 Renderer direct-State access。
>
> 本文是 Realm State v1 实现的 normative SSOT。架构文档负责解释设计动机；若解释性文字与本文 deterministic contract 冲突，以本文为准。

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
    readonly presentation replica
    no direct Realm State client

Content
    readonly installation definitions/resources

Platform / Session composition
    physical construction / binding / rebinding / wiring / disposal only
```

Realm State MUST NOT：

```text
be implemented as arbitrary Main business fields
become Renderer-owned state
reuse frame.call() as ordinary shared-state mutation
inherit @loomrealm/data Renderer↔Subsystem connection-local semantics
consume Frame / Activation / InputTarget as State transaction authority
own Save/Load slot/path/schema/migration policy
become a universal application store / service locator
```

Session composition MAY physically construct、wire、rebind and dispose Main / RealmStateAuthority sibling components, but MUST NOT become a third application authority or interpret Main control state / Realm State business values。

### 1.1 Fatal Ownership

A live RealmStateAuthority that detects an invariant-fatal condition MUST atomically become terminal/inert before reporting the fatal fact：

```text
RealmStateAuthority detects fatal
→ Authority self-terminal / stop admitting new operations
→ report Session-fatal fact through a narrow platform-wired sink
→ Main receives the fact
→ Main commits Session terminal + Runtime/Frame failure unwind
```

After Authority self-terminal：

```text
new requests → TERMINAL / known no-commit for mutation
existing subscriptions → terminal(reason = "authority-terminal")
no new subscription may establish
```

RealmStateAuthority owns only the fact that **its own State service can no longer preserve invariants**。It MUST NOT itself own Main Session transition、Runtime/Frame unwind、Renderer currentness or process termination。

The logical consumer of the Realm State fatal signal MUST be Main。Platform / Session composition MAY physically transport the signal, but MUST NOT decide Session terminal/unwind policy。

### 1.2 Bootstrap Failure Is Not Live-Authority Fatal

Failure while constructing/validating/installing Realm State **before the Authority has reached READY and joined the live Session** is Session bootstrap failure, not a live `RealmStateAuthority fatal` event：

```text
construction / prepared-baseline install failure before READY
→ bootstrap fails
→ Session composition cleans up partial physical resources
→ business Runtime side effects MUST NOT begin
```

Such a failure MUST NOT require a fake fatal report to a Main instance that is not yet the live Session lifecycle owner。

Once Realm State is READY and part of the live Session, §1.1 applies。

### 1.3 State Placement Rule

Realm State SHOULD only contain facts that need to be **Session-scoped, cross-Subsystem, mutable authoritative business truth** and benefit from Record OCC / subscription semantics。

Typical：

```text
player global attributes
party / inventory
quest / progression flags
world/session business flags
economy
cross-Subsystem business metadata
```

Default non-State owners：

```text
Frame / Stack / Activation / InputTarget       → Main
Runtime lifecycle / failure state              → Main
Renderer currentness / presentation replica    → Renderer/Data
Input retained state / RenderDomain             → Input/Render
Subsystem-local task progress / local cache     → Subsystem
transport endpoint / credential                 → Platform binding
immutable Content definition/resource           → Content
Save slot / migration / cloud policy            → game/product persistence business
```

---

## 2. Core Types

```ts
export interface RealmStateKey {
  readonly namespace: string;
  readonly key: string;
}

export interface RealmStateRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
  readonly version: number;
}

export interface RealmStateSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateRecord[];
}

export interface RealmStateInitialRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
}

export interface RealmStateInitialSnapshot {
  readonly records: readonly RealmStateInitialRecord[];
}

export interface RealmStateIndexRecord {
  readonly key: RealmStateKey;
  readonly version: number;
}

export interface RealmStateIndexSnapshot {
  readonly revision: number;
  readonly records: readonly RealmStateIndexRecord[];
}

export interface PreparedRealmStateInitialRecord {
  readonly key: RealmStateKey;
  readonly value: JsonValue;
}

export interface PreparedRealmStateDefinition {
  readonly records: readonly PreparedRealmStateInitialRecord[];
}
```

Current `read()` / `scan()` / subscription projection MUST NOT repeat immutable `initialValue`。

`PreparedRealmStateDefinition` MUST be detached/immutable trusted input produced during Launcher PREPARE。RealmStateAuthority MUST NOT depend on `GameEntryV1`、`formatVersion`、`game.json` path or Platform Launch Manifest types。

Realm State has exactly one privileged bootstrap value source：**prepared Game baseline**。

---

## 3. Namespace / Record / Collection

完整 Record identity = `(namespace,key)`。

```text
Namespace / Collection
    organization + discovery/filter boundary

Key
    identifier inside one Collection

Record
    read / replacement / version / conflict unit

Transaction
    multi-Record atomicity unit; MAY span Collections
```

Namespace/Collection MUST NOT own：

```text
value
version
conflict state
transaction boundary
ACL
independent lifecycle
```

v1 MUST NOT provide：

```text
NamespaceRegistry
createNamespace()
deleteNamespace()
Collection OCC condition
Collection predicate lock
namespace wildcard subscription
```

Collection existence MUST be derived from materialized Record membership。Collection membership is observational discovery metadata, not a transactional set predicate。

If business correctness depends on membership itself, business MUST model that invariant as an ordinary versioned Record and include its version in OCC conditions。

---

## 4. Identity Grammar / Canonical Ordering

Namespace MUST：

```text
non-empty valid Unicode scalar-value string
UTF-8 encoded length <= 64 bytes
not contain '/'
not contain U+0000..U+001F or U+007F
```

Key MUST：

```text
non-empty valid Unicode scalar-value string
UTF-8 encoded length <= 256 bytes
not contain '/'
not contain U+0000..U+001F or U+007F
```

Identity comparison MUST be：

```text
case-sensitive
exact scalar sequence
no trimming
no Unicode normalization
no locale-sensitive comparison
```

Canonical Record order MUST compare namespace UTF-8 bytes unsigned lexicographically ascending, then key UTF-8 bytes using the same rule。

Unless explicitly stated otherwise, **every returned Record array in v1 MUST use canonical Record order**：

```text
read().records
readInitial().records
list().records
scan().records
RealmStateCommit.records
subscription baseline.snapshot.records
subscription change.records
```

Implementation MAY intern/cache validated identities。Crossing an untrusted carrier/process boundary requires receiver-side validation/trust establishment again。

---

## 5. Initial / Current / Materialization

Each logical Record conceptually owns：

```text
initialValue    immutable prepared-Game baseline
current value   mutable Session authoritative value
version         successful-write generation
```

If prepared Game baseline does not declare a valid Record：

```text
initialValue = null
```

Session bootstrap：

```text
current value = initialValue
```

Never-materialized Record：

```text
read()        → value = null, version = 0
readInitial() → value = null
```

Runtime mutation MUST NOT change `initialValue`。

v1 mutation uses whole-record replacement only；no field patch / merge / field version。

`put(null)` MUST set current value to null but MUST NOT change initialValue、dematerialize the Record or reset version。

Successful deep-equal `put` is still an authoritative write：Record version and global revision advance and matching subscriptions observe the committed change。

A Record becomes materialized iff：

```text
1. PreparedRealmStateDefinition explicitly contains it; or
2. Runtime successfully commits it at least once.
```

`read()` / `readInitial()` of an unknown logical Record MUST NOT materialize it。

Explicit initial `null` and undeclared key both yield `readInitial() = null`; the only difference is initial materialization。v1 MUST NOT add `hasInitial()` / `listInitial()` or expose Game Entry declaration membership as another business authority。

---

## 6. Revision / Version

`revision` = RealmStateAuthority global successful-commit sequence / current snapshot identity。

`version` = per-Record successful-write generation used for OCC。

Representation is frozen：

```text
revision/version type       = non-negative JavaScript safe integer
minimum                     = 0
maximum                     = Number.MAX_SAFE_INTEGER = 2^53 - 1
```

New Session：

```text
global revision = 0
all logical/materialized Record versions = 0
```

Successful transaction：

```text
global revision += 1
for each write target: version += 1
```

If a commit would increment global revision or any target Record version beyond `Number.MAX_SAFE_INTEGER`：

```text
→ LIMIT_EXCEEDED
→ known no-commit
→ Authority remains readable/subscribable
```

Numeric exhaustion MUST NOT wrap、lose precision or silently reset metadata。

---

## 7. Game Entry / Session Bootstrap

Game Package v1 owns the pre-release document schema including optional `state` and continues to use `formatVersion: 1` until its explicit first formal release/freeze。

Game Package v1 is currently pre-release；historical draft v1 shapes do not form a compatibility commitment。After formal v1 release, breaking closed-schema structural evolution follows the Game Package versioning contract。

Game Package validation + Launcher projection：

```text
GameEntryV1.state document
→ detached ValidatedGameEntryV1
→ Launcher projection
→ PreparedRealmStateDefinition
```

Prepared output conceptually：

```ts
interface PreparedLogicalGame {
  readonly main: LogicalGameBootstrap;
  readonly state: PreparedRealmStateDefinition;
}
```

State MUST remain sibling to `LogicalGameBootstrap`；Main MUST NOT receive/interpret the prepared State payload。

Session bootstrap：

```text
PREPARE complete
→ construct fresh RealmStateAuthority from prepared.state
→ install immutable prepared Game baseline
→ derive initial materialized membership
→ revision/version = 0
→ Realm State READY
→ construct Runtime-scoped RealmStateClient capabilities
→ business Runtime side effects may begin
```

State READY is a hard barrier before the first business Runtime side effect。

---

## 8. Persistence Boundary — No Load Bootstrap

Realm State v1 MUST NOT define a privileged `Load Game` bootstrap path。

```text
Save / Load / autosave / checkpoint / cloud synchronization
= game/product business workflow
!= RealmStateAuthority lifecycle/bootstrap
```

Typical：

```text
Save business
→ state.read()/scan()
→ choose/serialize business facts
→ persistence capability

Load/restore business
→ persistence capability
→ validate/migrate/interpret business data
→ state.read() as needed
→ ordinary state.commit()
```

Realm State MUST NOT define/own：

```text
Load seed / sparse bootstrap override
save slot / storage path
save document schema/version
migration policy
autosave/cloud policy
which Records should be persisted
Load-specific revision/version reset
```

Persistence-driven restore writes are ordinary Runtime transactions：they do not modify `initialValue` and they advance normal revision/version metadata。

If a game requires an entire restore to be business-atomic, it MUST model that within ordinary v1 transaction semantics/limits；Realm State MUST NOT add a generic whole-save transaction coordinator。

---

## 9. Author-facing API

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

  list(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<RealmStateIndexSnapshot>;

  scan(options?: {
    readonly namespace?: string;
    readonly signal?: AbortSignal;
  }): Promise<RealmStateSnapshot>;

  commit(transaction: RealmStateTransaction): Promise<RealmStateCommit>;

  subscribe(
    keys: readonly RealmStateKey[],
    listener: (event: RealmStateSubscriptionEvent) => void
  ): Promise<RealmStateSubscription>;
}

export interface RealmStateSubscription {
  close(): void;
}
```

`RealmStateClient` is a Runtime-scoped logical capability。Its operations MUST NOT require/infer Frame、Activation、InputTarget or Frame mutation permit。

Frame suspend/close、Activation replacement、pending `frame.call()` MUST NOT by themselves reject an otherwise valid State operation or revoke the Runtime-scoped client。

### 9.1 Empty / Duplicate Input

Rules are frozen：

```text
read([])                    → INVALID_REQUEST
readInitial([])             → INVALID_REQUEST
subscribe([])               → INVALID_REQUEST

duplicate identity in read/readInitial/subscribe
                            → INVALID_REQUEST
                            → MUST NOT silently deduplicate
```

`read` / `readInitial` key count <= 256；`subscribe` key count <= 256。

---

## 10. Observation Semantics

### 10.1 `read(keys)`

MUST：

```text
validate all keys
observe all requested Records from one logical authority state
return one revision
return detached/immutable current values
not materialize unknown Records
return canonical Record order
```

Unrelated concurrent commits MAY advance returned revision without changing requested Record versions。

### 10.2 `readInitial(keys)`

MUST：

```text
return immutable prepared-Game baseline only
not expose current revision/version
not materialize unknown Records
ignore all Runtime current writes
return detached/immutable values
return canonical Record order
```

### 10.3 `list(namespace?)`

Returns one-revision flat materialized `key + version` discovery index。It MUST NOT return current/initial values or create a Collection wrapper。

No matching materialized Record：

```ts
{ revision: N, records: [] }
```

`list()+read()` is NOT an atomic membership+value snapshot。

### 10.4 `scan(namespace?)`

`scan()` observes one logical revision containing：

```text
selected materialized membership
+ current values
+ Record versions
+ one global revision
```

No matching materialized Record MUST return：

```ts
{ revision: N, records: [] }
```

`scan()` MUST NOT materialize unknown Records or return initialValue。Records use canonical order。

`scan()` is intentionally potentially expensive / exceptional, not a hot-path query。v1 intentionally provides no pagination、cursor、long-lived MVCC snapshot handle or extra aggregate live-State limit solely for scan。Physical binding MAY internally chunk/stream one logical result while preserving one-revision author semantics。

`scan()` is a point-in-time observation, not a future Collection predicate/lock。

---

## 11. Transaction / OCC

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

Valid transaction MUST satisfy：

```text
conditions.length >= 1
writes.length >= 1
condition identities unique
write identities unique
every write target appears exactly once in conditions
writes MAY be a strict subset of conditions
```

Read-only business dependencies MAY appear only in conditions。Transaction MAY span Collections。

Invalid request MUST be rejected before Record version comparison and MUST NOT be mapped to `CONFLICT`。

Logical admission order：

```text
1. structural shape
2. identity grammar
3. JsonValue validity
4. count / byte / depth / numeric limits
5. identity uniqueness
6. write-set subset of condition-set
7. Record version comparison
8. atomic commit
```

Atomic commit：

```text
compare all conditions against one authority state
→ any mismatch: CONFLICT / zero write
→ otherwise replace all write target current values
→ materialize first-written Records
→ update derived Collection membership
→ revision + 1
→ each write target version + 1
→ publish one committed change
→ return commit evidence
```

Frame/Activation/InputTarget MUST NOT participate in State transaction conditions/admission。

### 11.1 Validation Ownership

Every untrusted boundary MUST have one clear semantic validation owner：

```text
untrusted/author-owned representation
→ validate + detach
→ trusted validated representation
→ Authority execution
```

Trusted internal representations MAY be reused；SDK / adapter / Authority are NOT required to repeat equivalent deep validation inside one trusted path。

Authority serialized mutation step SHOULD contain only authority-sensitive lookup/version/ref-swap/revision/index work。Avoidable serialization、deep clone、canonical sorting and listener delivery SHOULD occur outside that serialized lane。

---

## 12. Commit Result / Evidence

```ts
export interface RealmStateCommit {
  readonly revision: number;
  readonly records: readonly {
    readonly key: RealmStateKey;
    readonly version: number;
  }[];
}
```

`records` MUST include every write target including deep-equal successful writes, in canonical Record order。Commit result MUST NOT echo `value`。

Logical failure codes：

```text
INVALID_REQUEST       known no-commit
LIMIT_EXCEEDED        known no-commit
CONFLICT              stale condition, known no-commit
TERMINAL              Authority or Runtime-scoped logical client terminal before admission; known no-commit
BINDING_UNAVAILABLE   no usable binding / binding-local read failure; commit is known no-commit iff not dispatched
OUTCOME_UNKNOWN       dispatched mutation may have crossed commit point; definitive result unavailable
```

`CONFLICT` MUST mean zero write。

Commit evidence boundary：

```text
success response
    → known committed

INVALID_REQUEST / LIMIT_EXCEEDED / CONFLICT / pre-admission TERMINAL
    → known no-commit

BINDING_UNAVAILABLE before mutation dispatch
    → known no-commit

dispatched mutation + definitive result lost
    → OUTCOME_UNKNOWN
```

`commit()` MUST NOT expose remote mutation cancellation。Caller-local stop-waiting MUST NOT be interpreted as no-commit evidence。

Realm State core MUST NOT automatically retry mutation, especially `OUTCOME_UNKNOWN`。

### 12.1 Business Reconciliation after `OUTCOME_UNKNOWN`

Exactly-once business intent belongs to business modeling。A game MAY use an ordinary operation-marker Record in the same atomic transaction：

```text
conditions:
    economy/gold @ N
    inventory/main @ M
    operation/purchase-123 @ 0

writes:
    economy/gold = ...
    inventory/main = ...
    operation/purchase-123 = "committed"
```

After `OUTCOME_UNKNOWN`, business can fresh-read the marker and related Records to reconcile。Core MUST NOT infer operation IDs、create marker Records、provide transaction status journal/dedup service or retry automatically。

---

## 13. Stable Error Shape

Every failed logical operation MUST expose a stable failure object equivalent to：

```ts
export type RealmStateFailureCode =
  | "INVALID_REQUEST"
  | "LIMIT_EXCEEDED"
  | "CONFLICT"
  | "TERMINAL"
  | "BINDING_UNAVAILABLE"
  | "OUTCOME_UNKNOWN";

export interface RealmStateFailure {
  readonly code: RealmStateFailureCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
}
```

Rules：

```text
code     normative and machine-readable
message  diagnostic only; callers MUST NOT branch on exact text
path     optional structural diagnostic path only
```

Wire transport MUST preserve `code` and `path` semantics。Wire representation MUST NOT expose JS stack traces、host filesystem paths、credentials、ports or transport-private objects。

SDK MAY wrap the plain failure in an Error class, but `.code` / `.message` / `.path` MUST remain observably equivalent。

---

## 14. Capacity / Exact Accounting

Logical hard limits：

```text
namespace UTF-8 bytes                 <= 64
key UTF-8 bytes                       <= 256
single JsonValue encoded JSON size    <= 256 KiB
JsonValue container nesting depth     <= 64

Game Entry initial record count       <= 4096
Game Entry total Realm State payload  <= 8 MiB

materialized Records per Session      <= 16384
read(keys) key count                  <= 256
readInitial(keys) key count           <= 256
subscribe(keys) key count             <= 256
transaction conditions count          <= 128
transaction writes count              <= 128
transaction total write-value payload <= 2 MiB
```

Violation MUST reject before mutation and use `LIMIT_EXCEEDED` when the request is otherwise structurally valid。

### 14.1 JsonValue Encoded Size

For a validated `JsonValue`, encoded size is the UTF-8 byte length of ECMAScript `JSON.stringify(value)` with：

```text
no replacer
no space/pretty-print argument
standard JSON string escaping
finite JSON-compatible numbers only
```

Implementation MUST produce the same byte count but NEED NOT construct the full JSON string/byte array；one-pass/streaming equivalent counting is allowed。

Object member ordering does not affect total encoded byte count and therefore is not a size-accounting authority。

### 14.2 Nesting Depth

Depth is frozen：

```text
scalar (null/boolean/number/string) = 0
array/object                         = 1 + max(child depth)
empty array/object                   = 1
```

Maximum allowed depth = 64。

### 14.3 Transaction Payload

`transaction total write-value payload` = sum of §14.1 encoded sizes of every `writes[i].value`。

Identity/request structural overhead is separately bounded by identity byte limits and transaction count limits and is NOT included in the 2 MiB write-value total。

### 14.4 Game Entry State Payload

Game Entry total Realm State payload = for every initial Record：

```text
UTF-8 bytes(namespace)
+ UTF-8 bytes(key)
+ encoded JSON bytes(value)
```

summed across all initial Records。

### 14.5 Materialized Record Exhaustion

At 16384 materialized Records：

```text
first write to a new Record → LIMIT_EXCEEDED / known no-commit
write to existing Record    → allowed if all other limits pass
```

---

## 15. Subscription

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
      readonly reason:
        | "binding-terminal"
        | "overflow"
        | "authority-terminal";
    };
```

Subscription observes explicit `RealmStateKey[]` only；new same-namespace materialization MUST NOT implicitly match an existing subscription。

Establishment MUST atomically：

```text
1. admit/validate keys
2. capture current baseline @ revision N
3. register observer for relevant commits strictly after N
4. release authority serialization
```

Author-visible order：

```text
subscribe() Promise resolves with handle
→ first listener event = baseline @ N
→ ordered relevant change events > N
```

If commits happen after baseline capture but before physical baseline delivery, binding MUST buffer changes and still deliver baseline first。

Each successful transaction produces at most one change event per subscription；multiple matching write targets are aggregated into that event。Failed/conflicted/invalid transaction produces no change。Deep-equal successful write produces a relevant change。

Change revisions MUST increase monotonically；unrelated commits MAY cause gaps。

### 15.1 Listener Execution Boundary

Listener delivery MUST occur outside Authority serialized mutation/establishment lane。

Listener sync throw / returned rejected thenable MUST be locally contained/diagnostic and MUST NOT retroactively fail commit、make Authority fatal or make Session terminal。

Listener MAY reenter `read / readInitial / list / scan / commit / subscribe / close` without deadlock。

### 15.2 Bounded Queue / Overflow Profile

Per subscription, undelivered **change-event** buffering after baseline capture is bounded by both：

```text
pending change event count <= 64
pending change logical payload <= 8 MiB
```

Pending change logical payload = sum, over buffered change records, of：

```text
UTF-8 bytes(namespace)
+ UTF-8 bytes(key)
+ encoded JSON bytes(current value)
```

The baseline itself is not counted against this change queue bound；physical binding MAY stream/chunk baseline delivery。

If enqueuing a change would exceed either bound：

```text
subscription becomes terminal(reason = "overflow")
undelivered change events MAY be discarded
listener MUST eventually observe the terminal event
if baseline was not yet delivered, baseline MUST remain the first listener event
no change event may be delivered after terminal
```

Overflow MUST NOT block the Authority commit lane and MUST NOT silently continue with dropped changes。

### 15.3 Close

`close()` MUST be idempotent。After it returns, listener MUST NOT be invoked again。Active close MUST NOT emit a synthetic terminal("closed") event and the subscription identity MUST NOT reactivate。

---

## 16. Logical Client vs Physical Binding

`RealmStateClient` identity/lifetime MUST NOT equal one physical Process/Worker/MessagePort/in-process connection。

```text
live Runtime-scoped RealmStateClient
        │
        ├─ physical binding A
        │      ↓ lost
        └─ physical binding B
```

Physical binding replacement MUST NOT create a new RealmStateAuthority、Runtime、Frame/Activation or logical client identity。

### 16.1 No Binding = Fail Fast

If a live logical client has no currently usable physical binding **when a new operation is admitted by the client SDK**：

```text
read/readInitial/list/scan/subscribe
    → BINDING_UNAVAILABLE
    → MUST NOT wait for a future binding
    → MUST NOT be silently queued for replay

commit
    → BINDING_UNAVAILABLE
    → known no-commit
    → MUST NOT wait/queue for future binding
```

Caller MAY explicitly retry read-only operations or submit a new business mutation after recovery。Framework MUST NOT do so automatically。

### 16.2 In-flight Binding Loss

```text
read-only request interrupted
    → MAY fail BINDING_UNAVAILABLE
    → caller MAY retry

commit not yet dispatched
    → BINDING_UNAVAILABLE / known no-commit

commit dispatched, definitive result lost
    → OUTCOME_UNKNOWN
```

Binding recovery MUST NOT replay an ambiguous dispatched mutation。

### 16.3 Binding Generation Fencing

Every physical binding instance MUST have a binding-local identity/generation not exposed as business authority。

All request/response/subscription delivery MUST be associated with the binding instance that created it。

After binding A becomes terminal：

```text
late response/event from A MUST NOT complete or mutate an operation belonging to binding B
late A subscription event MUST NOT enter a fresh B subscription
late A response MUST NOT retroactively change an already returned OUTCOME_UNKNOWN
```

Implementation MAY use monotonically increasing generation、opaque token or equivalent fencing。The exact token representation is physical/private；the fencing behavior is normative。

### 16.4 Recovery

Recovery MAY install a fresh physical binding under the same live `RealmStateClient`：

```text
old binding terminal
→ old attached subscriptions terminal(reason = "binding-terminal")
→ fresh binding installed
→ new operations may proceed
→ business must fresh subscribe
→ fresh subscription receives fresh baseline
```

Old subscription identity MUST NOT transparently reattach/resume。v1 has no replay journal / resume cursor。

Physical binding loss by itself MUST NOT fail Main Runtime、unwind Frame、terminate Session、reset Authority or change DataAuthority。

---

## 17. Lifetime / Terminal Policy

```text
Frame suspend        != Realm State unavailable
Frame close          != Realm State unavailable/deleted
Activation change    != Realm State reset/client replacement
Renderer reload      != Realm State changed
Data reconnect       != Realm State changed
put(null)            != Record identity forgotten
binding loss         != logical RealmStateClient terminal
Runtime terminal     → its RealmStateClient/subscriptions terminal/inert
Session terminal     → RealmStateAuthority terminal/inert
authority fatal      → Authority self-terminal → report Main → Main terminal/unwind
```

Runtime terminal is local capability lifetime termination；framework need not invoke business subscription callbacks after that Runtime itself is terminal。

Session terminal MUST make RealmStateAuthority terminal/inert。If a still-live callback can observe Authority terminal before Runtime teardown, its subscription MUST terminal with `authority-terminal`。

v1 MUST NOT transparently restart Authority、replay mutation journal、resume an old subscription or automatically retry mutation。

---

## 18. Logical Protocol / Platform Boundary

Logical protocol identifier：

```text
loomrealm.realm-state/1
```

Physical binding MUST be able to express：

```text
read / readInitial / list / scan request+result
conditional commit request+result
subscription establish / baseline / change / terminal / close
RealmStateFailure codes and diagnostics
binding-local unavailable/replacement
Authority terminal
Session-fatal report from Authority to Main
```

Hostra/PWA physical realization MAY differ, including validation/copy pass count and process/Worker placement, but observable logical semantics、limits、ordering、commit evidence、binding fencing and lifetime MUST match。

Protocol MUST NOT be embedded into Renderer Data、Runtime Control、`frame.call()` or Hostra generic RPC application bus。

---

## 19. Cross-contract Synchronization

Game Package v1 MUST accept optional `state.records` as pre-release document contract and remain closed-schema。Game Package owns document validation only；its document types MUST NOT become Authority bootstrap ABI。

Launcher MUST project validated Game State to detached/immutable `PreparedRealmStateDefinition` during PREPARE。

Subsystem author surface MUST expose：

```ts
interface SubsystemScope {
  readonly state: RealmStateClient;
}
```

Launcher / Platform Composition MUST：

```text
validate Game Entry State during PREPARE
project PreparedRealmStateDefinition
keep it separate from LogicalGameBootstrap
construct State before business Runtime side effects
provide Runtime-scoped logical RealmStateClient
provide replaceable/fenced physical binding
wire live Authority fatal report to Main
keep ordinary binding loss local to State plane
```

Business Definition MUST NOT depend on RealmStateAuthority implementation、Game Package document types、carrier、Hostra/PWA transport or host-private binding material。

Save/Load workflows remain business consumers of RealmStateClient + their own persistence capability。

---

## 20. Conformance / Qualification Requirements

Before Realm State implementation may be marked qualified, automated qualification MUST cover at least：

```text
Authority / Bootstrap
- exactly one RealmStateAuthority per live Session
- bootstrap construction failure before READY does not start business Runtime
- bootstrap failure cleans partial physical resources without fake live-authority fatal
- live Authority fatal self-terminals before reporting Main
- Main alone commits Session terminal / Runtime-Frame unwind
- State READY before first business Runtime side effect
- no Save/Load seed participates in bootstrap

Game Package / Projection
- missing optional state = empty prepared definition
- invalid/duplicate/oversized initial records reject during PREPARE
- Launcher projects detached PreparedRealmStateDefinition
- Main bootstrap excludes State payload
- Authority does not depend on GameEntry/document/platform manifest type

Identity / Initial / Materialization
- exact Unicode identity / UTF-8 bounds / no normalization
- canonical UTF-8 Record ordering
- current initially equals initial
- runtime writes never mutate initialValue
- unknown read/readInitial does not materialize
- initial or successful first write materializes
- put(null) does not dematerialize

Observation
- empty/duplicate read/readInitial rejected INVALID_REQUEST
- multi-key read one revision
- read/readInitial canonical ordering
- list full/filter one revision and canonical ordering
- scan full/filter membership+values+versions one revision
- scan no-match returns {revision:N, records:[]}
- list()+read is not treated as atomic scan

Validation / Limits
- one validation owner per untrusted boundary
- validated representation isolated from caller mutation
- no required repeated equivalent deep validation in trusted path
- exact JSON size algorithm identical Hostra/PWA
- exact depth algorithm identical Hostra/PWA
- numeric safe-integer exhaustion returns LIMIT_EXCEEDED / zero write
- serialized Authority mutation path excludes avoidable serialization/listener delivery

Transaction / Evidence
- invalid transaction rejected before version comparison
- every write target exactly one condition
- stale condition → CONFLICT + zero write
- writes atomic across Collections
- unrelated Record mutation does not conflict
- deep-equal write advances revision/version
- commit result canonical and no value echo
- no remote mutation cancellation
- pre-dispatch failure known no-commit
- post-dispatch lost result → OUTCOME_UNKNOWN
- no automatic mutation retry
- marker-Record reconciliation requires no core transaction journal

Subscription
- empty/duplicate subscribe rejected INVALID_REQUEST
- handle resolves before first callback
- baseline capture + observer registration atomic
- baseline first and canonical
- same commit → at most one aggregated canonical change event
- new same-Collection Record not implicitly subscribed
- listener runs outside Authority lane
- listener throw/rejected thenable locally contained
- listener reentrancy does not deadlock
- queue event/byte bounds enforced
- overflow terminal instead of silent drop
- close idempotent / no callback after return

Binding / Lifetime
- no usable binding → new operation fails BINDING_UNAVAILABLE without queue/wait
- pre-dispatch commit binding failure = known no-commit
- dispatched commit lost on binding failure = OUTCOME_UNKNOWN
- binding loss does not terminal live logical client/Runtime/Session/Authority
- old subscriptions terminal binding-terminal
- fresh binding serves same logical client
- fresh subscribe + fresh baseline; no replay/reattach
- late old-binding response/event fenced from new binding
- Runtime terminal makes client inert
- Session/Authority terminal makes Authority inert
- authority terminal subscriptions observe authority-terminal when callback lifetime permits

Platform Equivalence
- Desktop/Hostra and PWA logical outcomes match for validation, limits, ordering, OCC, evidence, lifetime and fencing
```

---

## 21. Implementation Freeze Rule

Realm State v1 has **no remaining architecture or deterministic-surface blocker** for implementation。

Implementation Agents MAY choose internal data structures、process/Worker placement、serialization mechanics、locking primitive、validated-internal types and test harness organization, provided all normative observable semantics above remain unchanged。

Implementation MUST NOT invent new public semantics for convenience。If implementation encounters a genuinely missing observable rule, it MUST treat that as a contract defect and update this contract deliberately rather than silently choosing platform-specific behavior。

The following are explicitly implementation details, not reopened architecture decisions：

```text
Map/object/internal index representation
mutex/serialized executor primitive
binding private generation token representation
same-process reference reuse strategy
Worker/process IPC framing details
source file/package decomposition
benchmark thresholds beyond normative limits
logging/diagnostics wording
```

---

## 22. Core Invariants

1. Main is the sole Control/lifecycle authority；RealmStateAuthority owns only Session shared mutable business facts；
2. Session composition owns physical assembly/binding/wiring/disposal only；
3. live Authority fatal self-terminals first, then reports Main；Main alone commits Session terminal/unwind；
4. pre-READY construction failure is bootstrap failure, not live-Authority fatal；
5. Namespace is organization/discovery only；Record is replacement/version/conflict unit；Transaction is atomicity unit；
6. Collection membership is observational and never a hidden OCC predicate；
7. prepared Game baseline is the only privileged State bootstrap value source；
8. initialValue is immutable；current value mutates only through successful Runtime transactions；
9. Save/Load/restore is business workflow using ordinary observation/commit；
10. revision/version are safe integers `0..2^53-1` with deterministic non-wrapping exhaustion；
11. unknown reads do not materialize；`put(null)` does not dematerialize；
12. all returned Record arrays use canonical `(namespace,key)` UTF-8 ordering；
13. empty/duplicate key-addressed observation/subscription input is invalid；
14. list is discovery；scan is one-revision materialized membership+value snapshot and may be expensive；
15. every write target has exactly one observed-version condition；stale condition = CONFLICT + zero write；
16. deep-equal successful write still advances version/revision；
17. no Frame/Activation/InputTarget authority participates in State admission；
18. no remote mutation cancellation；post-dispatch ambiguity = OUTCOME_UNKNOWN；no automatic retry；
19. exactly-once business intent belongs to business Record modeling, not core transaction journal；
20. subscription establishment atomically binds baseline+observer；callbacks are outside Authority lane and reentrant-safe；
21. subscription delivery is bounded；overflow terminals instead of silently dropping while continuing；
22. RealmStateClient is Runtime-scoped logical capability；physical binding is replaceable carrier only；
23. no usable binding causes fail-fast BINDING_UNAVAILABLE；framework does not wait/queue requests for reconnect；
24. old binding messages are fenced and cannot contaminate fresh binding operations/subscriptions；
25. physical binding loss does not itself change Main Runtime/Frame/Session/Authority lifecycle；
26. old subscription never transparently resumes；fresh binding requires fresh subscribe+baseline；
27. Renderer does not directly access Realm State；Subsystem remains the business-to-presentation bridge；
28. Content, Platform, Persistence and local Subsystem caches keep their own authority boundaries；
29. Hostra/PWA physical realizations may differ but normative observable semantics must match；
30. v1 core and deterministic surface are frozen for implementation；changes to normative public behavior require deliberate contract revision。
