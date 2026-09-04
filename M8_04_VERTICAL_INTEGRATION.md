# M8 / 04 — Data Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：04  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md) → [M8 / 02](M8_02_DATA_BINDINGS.md) → [M8 / 03](M8_03_DATA_ROLE_INTEGRATION.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：用 deterministic paired Bindings + MemoryCarrier 跑通真实 Main authority → Renderer Control → role-facing current Data seam → real `@loomrealm/data` peers；只证明 M8 当前可达的 authority/currentness/lifecycle/failure semantics。

> **Fixture only simulates “Platform already has a current-deliverable pair”. Main authority、Renderer Control、role reconciliation 与 Data peers必须走 production path。**

---

## 1. Frozen Vertical

```text
real Main Session
→ Runtime ready commit
→ Main DataAuthority(S,1,P)
→ real Renderer Control Snapshot
→ RendererDataBinding.acquire(S,1,P)

real Subsystem host ready
→ SubsystemDataBinding.acquire()

Deterministic paired Binding fixture
→ MemoryCarrier pair
→ Renderer endpoint + Subsystem endpoint
→ real RendererDataPeer / SubsystemDataPeer
```

`P = loomrealm.renderer-data/1`。

Fixture MAY use Renderer-requested `S/1/P` only as a deterministic pairing selector；it is not Platform/Main authority source。

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
per-acquire rejection trigger
malformed trusted-integration result trigger
```

Fixture MUST NOT：

```text
mint/change generation/profile
mutate Main Runtime state
mutate Renderer current participant
parse child Data protocol
keep replay history
claim Connection-v1 Broker conformance
```

---

## 3. Main Authority Trace

Normal ready transition：

```text
before: Runtime != ready, no DataAuthority
commit: Runtime=ready + DataAuthority(S,1,P)
after: one new Renderer revision contains both
```

MUST NOT observe normal `ready + no DataAuthority`。

Normal exit from ready：

```text
before: Runtime=ready + S/1/P
commit: Runtime!=ready + no DataAuthority
after: one new Renderer revision contains both consequences
```

MUST NOT observe non-ready Runtime with stale DataAuthority。

M8 has no same-key Runtime replacement/restart path and therefore no G1→G2/exhaustion vertical obligation。

---

## 4. Initial Installation

```text
Runtime before ready
→ no Main DataAuthority
→ no Renderer Data acquire

Runtime ready commit
→ Main publishes S/1/P
→ Renderer requests exact S/1/P
→ Subsystem/Renderer receive paired carrier
→ both construct/install real @loomrealm/data peers
```

Pending Subsystem acquire MUST NOT block Runtime Control/Frame；pending Renderer acquire MUST NOT block later Control Snapshots。

---

## 5. Late / Stale Acquire

```text
start Renderer acquire S/1/P
→ Runtime leaves ready OR Renderer Control participant changes
→ old acquire resolves late
```

Required：

```text
returned carrier best-effort closed
old peer not installed
new/current Control/Runtime state unchanged
```

The same identity rule applies to stale peer terminal and stale close completion。

---

## 6. Data Loss / Same-generation Recovery

Current carrier loss：

```text
Data peer terminal
→ role clears local current peer
→ Main Runtime/Frame/InputTarget unchanged
→ Renderer Control unchanged
→ Main DataAuthority S/1/P unchanged
```

If acquisition remains allowed for that role/slot：

```text
same S/1/P
→ fresh pair
→ fresh peers
```

Must prove：

```text
no generation change
no Renderer revision change solely for reconnect
no old unsent migration/replay
fresh peer object/state
```

---

## 7. Runtime / Renderer Parent Changes

Runtime leaves ready：

```text
same Main visible commit removes S/1/P
→ Renderer clears/closes local peer for S
→ aborts pending S acquire
```

Renderer participant A→B while Main authority remains `S/1/P`：

```text
A holder clears/closes A Data through parent currentness loss
B may obtain fresh pair under the same generation 1
```

No generation allocator is involved。

---

## 8. Subsystem Teardown

With current/pending Data：

```text
Subsystem graceful shutdown or fatal terminal
→ host leaves ready
→ clear local Data current identity
→ abort pending acquire
→ best-effort close current peer
→ no future acquire
```

Late result cannot install。

Qualification MUST show Data cleanup reuses `terminalCleanupDeadlineMs` and cleanup failure/time limit does not replace the primary Runtime result。

---

## 9. Renderer Slot Failure Isolation

Renderer with independent subsystem slots：

```text
S1 current
S2 acquire pending
S3 acquire rejects non-abort
```

Required：

```text
S3 records failed desired identity for current Control peer + S3/1/P
→ no busy retry for that same desired identity
→ S1 current unchanged
→ S2 pending unchanged
→ Renderer Control unchanged
```

Then：

```text
Control peer changes OR S3 authority removed/reintroduced under a new desired identity
→ old S3 failure fact cleared
→ one fresh S3 acquire may start
```

No Renderer-wide acquisition terminal exists。

---

## 10. Trusted-integration Construction Failure

Fixture may return a malformed trusted integration result / invalid carrier to force peer-construction failure。

Subsystem：

```text
install nothing
→ close returned carrier
→ stop future acquire for this host lifetime
→ Runtime/Frame unchanged
```

Renderer slot S：

```text
install nothing
→ close returned carrier
→ record failed desired identity for this Control peer + S/1/P
→ other subsystem slots unchanged
→ Renderer Control unchanged
```

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

## 12. Role / Connection Ownership Vocabulary

M8 role evidence observes：

```text
install peer as local current
clear local current identity
best-effort close peer/carrier
peer terminal
```

It does not claim that Renderer/Subsystem role code owns Platform Connection `current→retired` state。That lifecycle remains governed by Frozen Data Connection v1 and later concrete Platform realization。

---

## 13. Child-protocol Boundary

M8 vertical proves only：

```text
peer install / local clear / close
stale work rejection
same-generation fresh peer
failure isolation
```

It MUST NOT use Input/Render application traffic to claim closure。

Input business semantics = M10；Render business semantics = M11；physical Hostra/PWA Profile equivalence = M14/M16。

---

## 14. CI Shape

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

## 15. Frozen Closure

M8/04 is implementation-ready when the production role path proves：

```text
atomic Runtime/DataAuthority S/1/P visible commits
real Control propagation
real role Binding consumption
real @loomrealm/data peer installation
non-blocking pending acquire
stale acquire rejection
same-generation recovery without replay/revision change
Subsystem teardown
Renderer per-slot failure isolation
trusted-integration construction-failure isolation
capability absence
no speculative G2/restart path
no Platform authority-feed/commit-time revalidation claim
```
