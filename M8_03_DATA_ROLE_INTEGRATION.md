# M8 / 03 — Subsystem / Renderer Data Role Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：03  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md) → [M8 / 02](M8_02_DATA_BINDINGS.md)  
> 正式契约：[Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md) · [`@loomrealm/data` design](packages/data/DESIGN.md)  
> 目标：让 `@loomrealm/subsystem/host` 与 `@loomrealm/renderer` 成为 `@loomrealm/data` 的真实 role consumers，只关闭 current Data peer lifecycle/currentness；不提前实现 M10 InputManager、M11 RenderManager 或 Store framework。

> **Role 只拥有本地 peer currentness。Platform/Data Connection Core owns logical Connection installation/retirement；role 通过 clear local identity + close peer 表达自己不再使用该 carrier。**

---

## 1. Subsystem Host Construction

`RunSubsystemOptions` adds exactly one optional field：

```ts
data?: SubsystemDataBinding
```

Binding absent preserves existing Runtime/Frame behavior；no fake/no-op Binding。

Subsystem Data local facts only：

```text
currentDataPeer | null
0..1 pending acquire
acquisitionStopped: boolean
```

No DataPlane manager/state-machine framework is required；these may remain private fields/control flow inside the existing host。

---

## 2. Subsystem Ready / Acquire

After the host becomes locally ready, if Binding exists and acquisition is not stopped：

```text
start data.acquire(signal)
→ Runtime Control reader / Frame handling continues
→ resolve {carrier,G,P}
→ recheck host still ready/current and acquire still current
→ construct DataCurrentBindingV1 with launch.subsystemKey
→ createSubsystemDataPeer(...)
→ install peer as local current
```

Data provisioning MUST NOT be awaited by Runtime Control or Frame processing。

Late/stale resolution：

```text
host no longer ready/current
OR acquire superseded/aborted
→ install nothing
→ best-effort close returned carrier
```

---

## 3. Subsystem Peer Terminal / Reacquire

Current peer terminal：

```text
if terminal peer === currentDataPeer
→ clear currentDataPeer synchronously
→ Runtime/Frame authority unchanged
→ if host still ready AND acquisition not stopped:
     start at most one fresh acquire
```

Old/stale peer terminal cannot clear a replacement peer。

Fresh same-authority carrier always creates a fresh `@loomrealm/data` peer；no old queue/replay/publication cursor is migrated。

---

## 4. Subsystem Leaves Ready

Graceful shutdown、fatal Runtime terminal or any host transition that makes the Runtime no longer application-ready：

```text
clear currentDataPeer identity synchronously
→ abort pending acquire
→ best-effort close former current peer
→ start no fresh acquire
```

A late acquire result after this boundary is best-effort closed and never installed。

Cleanup reuses：

```text
runtimePolicy.terminalCleanupDeadlineMs
```

M8 MUST NOT add a Data-specific deadline/scheduler。Data cleanup MAY join existing bounded graceful/fatal cleanup；failure/time limit is secondary and MUST NOT replace the already-latched Runtime result。

Role wording is intentionally `clear + close`；the surrounding Platform/Data Connection lifecycle owns the resulting Connection retirement semantics。

---

## 5. Subsystem Acquire / Construction Failure

Surfaced non-abort Binding rejection：

```text
acquisitionStopped = true
→ no future acquire for this host lifetime
→ current peer, if already present, is not closed solely for this fact
→ Runtime/Frame unchanged
```

If Binding resolves but `DataCurrentBindingV1` / `createSubsystemDataPeer(...)` construction fails before installation：

```text
install nothing
→ best-effort close returned carrier
→ acquisitionStopped = true
→ no future acquire
→ Runtime/Frame unchanged
```

This is local integration/capability failure, not Runtime failure or remote protocol violation。

---

## 6. Renderer Public Construction Seam

M8 freezes the public factory signature exactly：

```ts
createRendererControlHolder(
  data?: RendererDataBinding,
): RendererControlHolder
```

No alternative public options object is introduced in M8。

Forbidden：

```text
mutable registerDataBinding()
service locator
RendererPlatform / RendererServices
Data Store / EventBus
```

Renderer local facts per `subsystemKey`：

```text
0..1 current RendererDataPeer
0..1 pending acquire
0..1 failed desired authority identity
```

Failed desired identity is exactly：

```text
current Control peer identity + S/G/P
```

There is no Renderer-wide Data acquisition terminal state。

---

## 7. Renderer Reconciliation

After each accepted whole Control Snapshot is installed, for each subsystem slot：

```text
current peer has no exact desired S/G/P
→ clear local current identity
→ best-effort close old peer

pending acquire has no exact desired S/G/P
→ abort it

failed desired identity no longer matches current Control peer + S/G/P
→ clear failure fact

exact desired S/G/P already current/pending
→ keep

exact desired S/G/P has matching failure fact
→ do not retry

current authority exists + no current/pending/failure
→ start acquire(S,G,P)
```

Acquire resolution MUST recheck：

```text
same Control peer is still locally current
AND exact S/G/P is still desired
AND this acquire is still the slot's current pending attempt
AND signal was not aborted
```

Failure of any recheck：best-effort close returned carrier；never install。

Reconciliation MUST be non-blocking：

```text
install Control Snapshot
→ compute local Data changes synchronously
→ abort stale pending / clear+close stale peer
→ start missing acquire work
→ return to Control consumption
```

Control consumption MUST NOT await Data acquire、peer close or physical provisioning。

---

## 8. Renderer Acquire / Construction Failure

For one current desired identity `(Control peer,S,G,P)`：

```text
acquire rejects non-abort
→ record failed desired identity for this slot
→ no busy retry for this same desired identity
→ other subsystem slots unchanged
→ Renderer Control unchanged
```

Resolved carrier fails `DataCurrentBindingV1` / `createRendererDataPeer(...)` construction：

```text
install nothing
→ best-effort close carrier
→ record the same slot-local failed desired identity
→ other slots unchanged
→ Renderer Control unchanged
```

When Control peer or exact S/G/P changes, the old failure fact is stale and cleared by reconciliation；a new desired identity may attempt once。

No global failure manager or error hierarchy is added。

---

## 9. Renderer Peer Terminal / Fresh Acquire

Current Data peer terminal：

```text
if terminal peer === slot current peer
→ clear local current identity
→ if exact authority still desired
   AND no matching failed desired identity
   AND no pending acquire:
     start one fresh acquire
```

Data peer terminal does not clear Renderer Control or mutate Main authority。

---

## 10. Control Parent Authority

Current Renderer Control peer replacement / terminal：

```text
abort all pending Data acquires
→ clear all local Data current identities
→ best-effort close all former current Data peers
→ clear all failed desired identities
```

Old Control peer late Snapshot/terminal/acquire result cannot affect the new Control state。

Reverse direction is forbidden：

```text
Data peer terminal / acquire rejection / peer construction failure
✗ clear Renderer Control
✗ mutate Main Runtime/Frame authority
✗ synthesize DataAuthority replacement
```

---

## 11. `@loomrealm/data` / Child Boundary

Roles MUST directly use：

```text
createSubsystemDataPeer(...)
createRendererDataPeer(...)
```

MUST NOT copy JSON/profile validation、single-reader dispatch、serialized writer or terminal mechanics。

M8 does NOT implement/qualify：

```text
Input Interest business state
Input producer/listener/effective gate
Render Domain/Store/revision business state
fresh Input/Render baseline materialization
```

M8 vertical sends no child application traffic as closure evidence。Any minimal internal handler glue required to instantiate peers creates no author-facing/business state and is not a Profile conformance claim。

No InputManager / RenderManager / registry/store placeholder abstraction is introduced。

---

## 12. Dependencies

```text
@loomrealm/subsystem/host depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/data

@loomrealm/renderer depends on:
    @loomrealm/renderer-control
    @loomrealm/platform-ports
    @loomrealm/data
```

No role→Main or role→concrete Platform dependency。

---

## 13. Qualification

Subsystem：

```text
Binding absent keeps Runtime/Frame path green
pending acquire does not block Runtime Control/Frame
ready + Binding installs one real Data peer
stale acquire closes carrier and cannot install
peer terminal identity-safe; Data loss does not fail Runtime/Frame
same-generation fresh carrier creates fresh peer
leaving ready clears local current + aborts pending + closes peer
cleanup reuses terminalCleanupDeadlineMs
cleanup failure never replaces graceful/fatal Runtime result
Binding rejection/construction failure stops future acquire only for this host lifetime
```

Renderer：

```text
exact public createRendererControlHolder(data?) signature
Snapshot add/remove reconciliation
pending acquire never blocks later Control state
late stale acquire cannot install
per-slot acquire rejection suppresses only same Control-peer+S/G/P retry
S1 acquire failure does not alter independent S2 current/pending work
Control/authority change clears obsolete failure fact and permits fresh attempt
Control A→B clears/closes all A Data and slot failure facts
old terminal/result cannot affect new peer
Data terminal alone keeps Control current
Binding absent keeps M7 behavior
```

---

## 14. Frozen Closure

M8/03 is implementation-ready when Subsystem and Renderer have direct acquire/install/clear/close/failure semantics with no unresolved lifecycle policy, no cross-slot failure coupling, and no premature Input/Render framework。
