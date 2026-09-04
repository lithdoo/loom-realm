# M8 / 04 — Data Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：04  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md) → [M8 / 02](M8_02_DATA_BINDINGS.md) → [M8 / 03](M8_03_DATA_ROLE_INTEGRATION.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：用 deterministic paired Data Bindings + MemoryCarrier 跑通真实 Main authority → Renderer Control → role-facing current Data seam → real `@loomrealm/data` peers；证明 M8 authority/currentness/lifecycle/failure semantics，不实现 M9 physical Broker。

> **Fixture only simulates “Platform already has a current-deliverable pair”. Main authority、Renderer Control、role reconciliation 和 Data peers必须走 production code path。**

---

## 1. Frozen Vertical

```text
real Main Session
→ Runtime lifecycle commit
→ Main DataAuthority(S,G,P)
→ real Renderer Control Snapshot
→ RendererDataBinding.acquire(S,G,P)

real Subsystem host ready
→ SubsystemDataBinding.acquire()

Deterministic paired Binding fixture
→ MemoryCarrier pair
→ Renderer endpoint + Subsystem endpoint
→ real RendererDataPeer / SubsystemDataPeer
```

Fixture MAY use Renderer-requested `S/G/P` only as deterministic pairing selector。It MUST NOT claim that request is Platform/Main authority source。

M8 does NOT qualify：

```text
Platform obtains authoritative S/G/P from Main
candidate authentication/provisioning
commit-time Runtime/Renderer/DataAuthority revalidation
serialized physical candidate winner/cutover
```

Those begin in M9。

---

## 2. Fixture Boundary

Fixture may own only：

```text
pending Renderer acquire requests
pending Subsystem acquire for target Runtime
MemoryCarrier pair creation
pair resolution / abort / close observations
Binding rejection trigger
malformed trusted-integration result trigger for isolation tests
```

Fixture MUST NOT：

```text
mint generation/profile
mutate Main Runtime state
mutate Renderer current participant
parse child Data protocol
keep replay history
claim Connection-v1 Broker conformance
```

---

## 3. Main Atomic Authority Trace

Normal ready transition must be observed as one Renderer-visible commit：

```text
before: Runtime != ready, no DataAuthority
commit: Runtime=ready + DataAuthority(S,G1,P)
after: one new Renderer revision contains both
```

MUST NOT observe a normal intermediate `ready + no DataAuthority` Snapshot。

Normal exit from ready：

```text
before: Runtime=ready + S/G/P
commit: Runtime=stopping/failed/stopped/replaced + no DataAuthority
after: one new Renderer revision contains both consequences
```

MUST NOT observe non-ready Runtime with stale DataAuthority。

Generation exhaustion is the explicit exception：Runtime may become ready without a fresh authority and without Runtime/Frame failure。

---

## 4. Initial Installation

```text
Runtime before ready
→ no Main DataAuthority
→ no Renderer Data acquire

Runtime ready commit
→ Main publishes S/G1/P
→ Renderer requests exact S/G1/P
→ Subsystem/Renderer receive paired carrier
→ both construct/install real @loomrealm/data peers
```

Pending Subsystem acquire MUST NOT block Runtime Control/Frame；pending Renderer acquire MUST NOT block later Control Snapshots。

---

## 5. Late / Stale Acquire

```text
start acquire S/G1/P
→ Main removes/replaces authority or Control participant changes
→ old acquire resolves late
```

Required：

```text
returned carrier closed/disposed
old peer not installed
new/current authority and peers unchanged
```

Same identity rule applies to stale peer terminal and stale close completion。

---

## 6. Data Loss / Same-generation Recovery

Current carrier loss：

```text
Data peer terminal
→ local current Data cleared
→ Main Runtime/Frame/InputTarget unchanged
→ Renderer Control unchanged
→ Main DataAuthority S/G/P unchanged
```

If acquisition capability remains healthy：

```text
same S/G/P
→ fresh pair
→ fresh peers
```

Must prove：

```text
no generation bump
no Renderer revision bump solely for reconnect
no old unsent migration/replay
fresh peer object/state
```

---

## 7. Runtime / Authority Replacement

```text
G1 current
→ Runtime leaves ready / is replaced
→ same Main visible commit removes authority
→ Renderer retires G1 peer + aborts G1 pending acquire
```

Future fresh Runtime for same subsystem：

```text
G2 > G1
→ only G2 may install
```

Renderer participant A→B with unchanged `S/G/P`：

```text
A Data retires because parent participant changed
B may obtain fresh pair under same G
```

---

## 8. Subsystem Teardown

With current/pending Data present：

```text
Subsystem graceful shutdown or fatal terminal
→ host leaves ready
→ local Data currentness cleared
→ pending acquire aborted
→ current peer close/retire requested
→ no future acquire
```

Late result cannot install。

Qualification MUST show Data cleanup uses existing `terminalCleanupDeadlineMs` and Data cleanup failure/time limit does not replace the primary graceful/fatal Runtime result。

---

## 9. Binding Terminal Fan-out

Renderer with multiple subsystem slots：

```text
S1 current
S2 acquire pending
S3 acquire rejects non-abort
```

Required：

```text
Renderer acquisition capability terminal
→ S2 pending aborted
→ no future acquire for any S
→ S1 current remains current solely with respect to Binding rejection
→ Renderer Control remains current
```

Subsystem Binding rejection likewise blocks future acquire for that host lifetime but does not fail Runtime/Frame or retire an already-current peer solely for that reason。

---

## 10. Trusted-integration Construction Failure

Fixture may return a malformed trusted integration result / invalid carrier to force role peer-construction failure。

Required on either role：

```text
no peer installed
→ returned carrier best-effort closed
→ role acquisition capability latched terminal
→ no busy retry
→ parent Runtime/Frame/Control authority unchanged
```

Renderer additionally aborts all other pending acquires while preserving unrelated already-current peers solely with respect to this failure。

---

## 11. Capability Absence

```text
RendererDataBinding absent
→ Renderer Control path unchanged

SubsystemDataBinding absent
→ Runtime/Frame path unchanged
```

Existing Hostra Runtime-only composition remains valid without fake Data Binding。

---

## 12. Child-protocol Boundary

M8 vertical proves only：

```text
peer installed
peer retired/replaced
stale work rejected
terminal/failure isolation
```

It MUST NOT use Input/Render application traffic to claim M8 closure。

Input business semantics = M10；Render business semantics = M11；physical Hostra/PWA Profile equivalence = M14/M16。

---

## 13. CI Shape

Keep separate evidence：

```text
main DataAuthority tests
platform-ports Binding tests
subsystem-host Data lifecycle tests
renderer Data reconciliation tests
@loomrealm/data package regression
M8 deterministic vertical
M1–M7 regression
```

No giant E2E replaces package/role tests。

---

## 14. Frozen Closure

M8/04 is implementation-ready when the production role path proves：

```text
atomic Main Runtime/DataAuthority visible commits
real Control propagation
real role Binding consumption
real @loomrealm/data peer install/retire
non-blocking pending acquire
stale acquire rejection
same-generation recovery without replay/G bump
Subsystem teardown
Renderer Binding terminal fan-out
trusted-integration construction-failure isolation
capability absence
no Platform authority-feed/commit-time revalidation claim
```
