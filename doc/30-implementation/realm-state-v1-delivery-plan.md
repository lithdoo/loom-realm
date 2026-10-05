# Realm State v1 Implementation Delivery Plan

> 状态：**Implemented / Qualified / Closed**
> Normative SSOT：[Realm State v1 Contract](../15-contracts/realm-state-v1.md)  
> 架构解释：[Realm State System](../10-architecture/realm-state-system.md)  
> 最近复核：2026-10-05

> 完成证据：[Realm State v1 qualification](./realm-state-v1-qualification.md)。本文保留为已执行工作包与 gate 的追溯，不再表示待办。

本文不是第二份 Realm State contract。它只把已冻结 contract 映射为可由实现 Agent 顺序执行的工程工作包、qualification gate 与完成定义。

如果本文与 Realm State v1 formal contract 的 observable semantics 冲突，以 formal contract 为准。

---

## 1. Implementation Goal

完整落地目标：

```text
Game Package state document
→ Launcher PREPARE projection
→ PreparedRealmStateDefinition
→ one RealmStateAuthority per live Session
→ Runtime-scoped RealmStateClient
→ Desktop/Hostra physical binding
→ SubsystemScope.state
→ read/readInitial/list/scan/commit/subscribe
→ fatal/binding/terminal semantics
→ qualification
```

不得把实现任务扩大为：

```text
Save system
Load bootstrap
generic StateManager
NamespaceRegistry
Renderer direct State client
generic EventBus
transaction journal / dedup service
automatic retry
ACL/RBAC
generic cross-platform transport framework
```

---

## 2. Package / Ownership Target

Recommended minimum package boundary：

```text
packages/realm-state
    public logical types
    validation/accounting helpers
    reference in-memory RealmStateAuthority
    logical RealmStateClient/binding abstractions
    failure/evidence/subscription semantics

packages/game-package
    GameEntryV1 optional state document types + validation

packages/subsystem
    SubsystemScope.state: RealmStateClient
    author-facing re-export/import seam only

packages/game-launcher-hostra
    validated Game State → PreparedRealmStateDefinition projection
    Desktop session composition / State physical realization join

packages/game-launcher-pwa
    same logical prepared projection contract
    no Desktop-only type leakage

packages/main
    no State values / OCC / bootstrap payload
    narrow Session-fatal intake only if needed by existing Main lifecycle surface

platform-specific Hostra/PWA code
    binding transport / generation fencing / disposal only
```

Do not put Realm State business values into `LogicalGameBootstrap`、Runtime Control、Renderer Data profile、Hostra RPC application payload or Content API。

---

## 3. Work Package A — Contract Types + Pure Validation

Implement first, with no process/Worker transport dependency：

```text
RealmStateKey
RealmStateRecord / Snapshot
RealmStateInitialRecord / InitialSnapshot
RealmStateIndexRecord / IndexSnapshot
RealmStateCondition / Transaction / Commit
RealmStateFailure
RealmStateSubscriptionEvent / Subscription
PreparedRealmStateDefinition
RealmStateClient surface
```

Implement exact contract helpers：

```text
namespace/key grammar
canonical UTF-8 ordering
JsonValue validation
JSON encoded-size counting
container nesting-depth counting
Game Entry State payload accounting
transaction payload accounting
safe-integer validation/exhaustion
empty/duplicate input validation
```

### Gate A

Pure unit/property tests MUST prove：

```text
Hostra/Browser-compatible JS values obtain identical logical byte/depth results
canonical ordering is deterministic
caller-owned mutation cannot change validated/detached representation
all hard bounds have exact boundary tests (limit-1 / limit / limit+1)
```

No Authority/IPC code should be required for Gate A。

---

## 4. Work Package B — Reference In-memory Authority

Implement one deterministic reference `RealmStateAuthority` before physical IPC。

Internal architecture SHOULD remain small：

```text
Record table
    key → { initialValue, currentValue, version, materialized }

global revision
materialized discovery index
serialized mutation/subscribe-establishment lane
subscription registry
terminal state
```

Authority public/internal methods should map directly to contract operations；avoid creating extra Collection manager or transaction coordinator objects unless implementation mechanics genuinely benefit。

Critical rules：

```text
read/readInitial/list/scan snapshot consistency
whole-record OCC commit
cross-Collection atomicity
deep-equal successful write advances metadata
no mutation on validation/conflict/limit failure
fatal self-terminal before reporting Main sink
terminal Authority admits no new operations
listener delivery outside Authority serialized lane
```

### Gate B

Reference Authority qualification MUST cover all non-transport items in formal contract §20, including deterministic ordering、numeric exhaustion、scan empty snapshot、subscription baseline/change aggregation and listener reentrancy。

---

## 5. Work Package C — Game Package + Launcher Projection

Update `packages/game-package` current pre-release v1 schema：

```text
formatVersion: 1
state?: {
  records: [
    { namespace, key, value }
  ]
}
```

Keep closed-schema validation and validate Realm State grammar/limits during PREPARE-compatible document validation。

Launcher projection：

```text
ValidatedGameEntryV1
    ├─ main projection  → LogicalGameBootstrap
    └─ state projection → PreparedRealmStateDefinition
```

`PreparedRealmStateDefinition` MUST be detached/immutable and MUST NOT contain：

```text
formatVersion
save/load data
revision/version
transaction IDs
platform executable binding
```

### Gate C

Tests：

```text
missing state → empty prepared definition
valid initial Records project exactly
invalid/duplicate/oversized records reject before side effects
Main projection does not gain State payload
historical unpublished v1 shape compatibility layer is not introduced
```

---

## 6. Work Package D — Subsystem Author Surface

Expose Runtime-scoped：

```ts
interface SubsystemScope {
  readonly state: RealmStateClient;
}
```

Rules：

```text
created once per Runtime logical lifetime
not Frame-scoped
not Activation-scoped
not InputTarget-scoped
Frame suspend/close does not revoke it
Runtime terminal makes it terminal/inert
```

Do not expose Authority implementation、binding endpoint/port、binding generation or persistence capability through this surface。

### Gate D

A focused Subsystem test MUST demonstrate：

```text
same scope.state identity survives Frame transitions
State commit works without Frame mutation permit
Runtime terminal makes later State operation TERMINAL
```

---

## 7. Work Package E — Logical Client + Replaceable Binding

Implement `RealmStateClient` as a stable Runtime-scoped facade over an attachable/detachable physical binding。

Minimum client state machine：

```text
LIVE + BOUND(binding generation N)
LIVE + UNBOUND
TERMINAL
```

Rules：

```text
UNBOUND new request → BINDING_UNAVAILABLE immediately
no wait-for-reconnect queue
no automatic replay
fresh binding keeps same logical client
old subscriptions terminal
fresh subscribe required
```

Every binding MUST have private generation/token fencing。All response/event completion paths MUST verify they still belong to the originating live binding generation。

### Gate E

Deterministic transport-neutral fake-binding tests：

```text
binding A lost → client remains live/unbound
operation while unbound → BINDING_UNAVAILABLE
fresh B → same client works
A late read response ignored
A late subscription event ignored
A dispatched commit losing result → OUTCOME_UNKNOWN
late A commit response cannot retroactively replace OUTCOME_UNKNOWN
no auto replay on B
```

---

## 8. Work Package F — Subscription Delivery / Backpressure

Implement：

```text
atomic baseline capture + observer registration
handle resolved before first callback
baseline first
one aggregated change event per commit/subscription
canonical record ordering
listener outside Authority lane
listener failure containment
reentrant listener safety
64 pending-change-event bound
8 MiB pending-change logical-payload bound
overflow terminal
binding-terminal
authority-terminal
idempotent close
```

If baseline physical delivery is slow, relevant post-baseline changes may buffer within the frozen change queue profile；baseline still must be first callback。

### Gate F

Include slow-consumer tests that cross both event-count and byte bounds independently。

---

## 9. Work Package G — Main Fatal Seam + Bootstrap Ordering

Do not move State into Main。

Required lifecycle seam：

```text
before READY construction failure
→ Session bootstrap failure/cleanup
→ no business Runtime side effect

live Authority fatal
→ Authority self-terminal
→ narrow fatal fact to Main
→ Main commits Session terminal + existing Runtime/Frame unwind
→ platform cleanup follows existing owner chain
```

Prefer adapting an existing Main failure/terminal intake seam if one exists。If a new seam is required, keep it narrow and fact-oriented；do not create a SessionCoordinator or make Main understand Record/business values。

### Gate G

Tests MUST distinguish bootstrap construction failure from live Authority fatal and prove there is still only one terminal/unwind authority。

---

## 10. Work Package H — Desktop / Hostra Physical Realization

Desktop realization MUST use a dedicated Realm State plane or narrow private binding seam appropriate to current Runner topology。

Do NOT reuse as generic application bus：

```text
Hostra host-control RPC
Renderer Data carrier
Content bearer
Runtime Control protocol
```

Physical implementation may be same-process where topology allows and IPC where Runtime isolation requires；both paths MUST share the same logical qualification suite。

Required Desktop properties：

```text
State READY before first business Runtime side effect
one Authority per Session
one logical client per Runtime
binding generation fencing
clean binding disposal
binding loss does not fail Runtime/Session by itself
Authority fatal reaches Main only
```

### Gate H

Add Desktop E2E covering at minimum：

```text
Game initial baseline visible in multiple Subsystems
cross-Subsystem OCC conflict
multi-Record atomic commit
subscription propagation
Frame transition does not revoke State
physical binding loss + fresh bind + fresh subscribe
OUTCOME_UNKNOWN path with no replay
Authority fatal → Main terminal/unwind
shutdown/reload cleanup has no second lifecycle owner
```

---

## 11. Work Package I — PWA Contract Realization

Realm State implementation MUST NOT block on a full production PWA app if the current PWA product slice is not yet materialized；however no Desktop-only assumption may leak into shared Realm State / Game Package / Subsystem contracts。

At minimum before calling Realm State cross-platform-ready：

```text
packages/game-launcher-pwa can produce the same PreparedRealmStateDefinition semantics
browser/Worker-compatible logical client/binding implementation exists or transport harness proves it
same conformance vectors run in browser/Worker environment
binding loss/fencing semantics match Desktop outcomes
```

PWA may place Main and Realm State in one Worker or separate Workers；placement is not logical authority。

---

## 12. Work Package J — Qualification + CI

Create a dedicated Realm State qualification layer rather than scattering only ad-hoc package tests。

Recommended split：

```text
contract vectors
    grammar / ordering / size / depth / failure objects

authority qualification
    read/scan/OCC/materialization/terminal

client-binding qualification
    fail-fast/rebind/fencing/evidence

subscription qualification
    atomic baseline/order/backpressure/reentrancy

Game Package/Launcher qualification
    document validation/projection/bootstrap barrier

Desktop E2E
    full physical chain

Browser/Worker qualification
    platform equivalence
```

Qualification SHOULD use reusable vectors against both same-process reference binding and physical carrier bindings。

---

## 13. Recommended Commit Sequence

To keep review/revert boundaries clear：

```text
1. realm-state logical types + validators + accounting tests
2. reference Authority + pure qualification
3. Game Package optional state + Launcher prepared projection
4. SubsystemScope.state author surface
5. stable RealmStateClient + fake replaceable binding + fencing tests
6. subscription queue/terminal implementation
7. Main fatal seam + Session bootstrap composition
8. Hostra physical State binding
9. Desktop cross-Subsystem/E2E qualification
10. PWA projection + browser/Worker equivalence qualification
11. docs/status cleanup: mark implementation + qualification achieved
```

Do not combine all slices into one unreviewable change if repository workflow allows staged PRs。

---

## 14. Definition of Done

Realm State v1 is **implemented** only when：

```text
formal public types exist
Game Package schema/projection landed
reference Authority landed
SubsystemScope.state landed
Runtime-scoped client + replaceable binding landed
Main fatal seam landed
Desktop physical realization landed
all formal contract qualification passes
```

Realm State v1 is **qualified** only when, additionally：

```text
all §20 contract requirements have automated coverage
Desktop full-chain E2E passes
browser/Worker equivalence vectors pass for platform-neutral semantics
no path creates a second Main/State/Session authority
```

PWA full product UI/application completion is not required merely to qualify Realm State logical semantics, but a real browser/Worker realization or equivalent production-target binding must prove that shared contracts contain no Desktop-only assumptions。

---

## 15. Agent Decision Boundary

An implementation Agent is authorized to decide：

```text
internal file layout
class/function names not public
Map/index structures
mutex/serialized executor implementation
private binding token representation
IPC framing/private message IDs
unit-test organization
performance optimizations preserving semantics
```

An implementation Agent is **not** authorized to silently decide/change：

```text
public State API
limits
error codes
ordering
OCC semantics
subscription queue profile
binding fail-fast/reconnect behavior
fatal ownership
Save/Load bootstrap policy
Renderer access
Main/Frame authority boundary
```

If one of those appears impossible or internally contradictory during implementation, stop that slice and treat it as a contract defect rather than inventing a local workaround。
