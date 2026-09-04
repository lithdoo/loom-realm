# M8 / 03 — Subsystem / Renderer Data Role Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：03  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md) → [M8 / 02](M8_02_DATA_BINDINGS.md)  
> 正式契约：[Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md) · [`@loomrealm/data` design](packages/data/DESIGN.md)  
> 目标：让 `@loomrealm/subsystem/host` 与 `@loomrealm/renderer` 成为 `@loomrealm/data` 的真实 role consumers，只关闭 current Data lifetime/currentness；不提前实现 M10 InputManager、M11 RenderManager 或 Store framework。

> **M8 role state只回答“哪个 Data peer当前可用、是否还能建立新的 peer”。Data 不得反向成为 Runtime/Frame/Control authority。**

---

## 1. Subsystem Host Construction

`RunSubsystemOptions` adds optional：

```text
data?: SubsystemDataBinding
```

Binding absent preserves existing Runtime/Frame behavior；no fake/no-op Binding。

Subsystem Data local facts only：

```text
currentDataPeer | null
0..1 pending acquire
Data acquisition terminal fact
```

The terminal fact MAY be expressed by control flow/boolean；no DataPlane manager/state-machine framework is required。

---

## 2. Subsystem Ready / Acquire

After the host becomes locally ready, if Binding exists and acquisition is healthy：

```text
start data.acquire(signal)
→ Runtime Control reader / Frame handling continues
→ resolve {carrier,G,P}
→ recheck host is still ready/current and acquire is still current
→ construct DataCurrentBindingV1 using launch.subsystemKey
→ createSubsystemDataPeer(...)
→ atomically install as current Data peer
```

Data provisioning MUST NOT be awaited by Runtime Control reader or Frame processing。

Late/stale resolution：

```text
host no longer ready/current
OR acquire superseded/aborted
→ do not construct/install current peer
→ best-effort close returned carrier
```

---

## 3. Subsystem Peer Terminal / Reacquire

Current peer terminal：

```text
if terminal peer === current peer
→ clear current synchronously
→ Runtime/Frame authority unchanged
→ if host still ready AND acquisition healthy:
     start at most one fresh acquire
```

Old/stale peer terminal cannot clear a replacement peer。

Fresh acquire under the same `S/G/P` creates a fresh `@loomrealm/data` peer；no old queue/replay/publication cursor is migrated。

---

## 4. Subsystem Leaves Ready

Graceful shutdown, fatal Runtime terminal, or any host transition that makes the Runtime no longer application-ready fixes：

```text
mark local Data non-current synchronously
→ abort pending Data acquire
→ clear current Data peer identity
→ request current peer close/retirement best-effort
→ issue no fresh acquire
```

A late acquire result after this boundary is closed/disposed and never installed。

Cleanup uses the **existing** Subsystem terminal cleanup budget：

```text
runtimePolicy.terminalCleanupDeadlineMs
```

M8 MUST NOT add `dataCleanupDeadlineMs` or another cleanup scheduler。Data cleanup MAY join existing bounded `finishGraceful` / `finishFatal` work；cleanup failure/time limit is secondary and MUST NOT replace the already-latched Runtime terminal result。

---

## 5. Subsystem Trusted-integration Failure

If Binding resolution succeeds but `DataCurrentBindingV1` / `createSubsystemDataPeer(...)` construction fails before installation：

```text
no Data peer becomes current
→ best-effort close returned carrier
→ latch Subsystem Data acquisition locally terminal for this host lifetime
→ no busy retry / no future acquire
→ Runtime/Frame authority unchanged
```

This is a local integration/capability failure, not evidence of Runtime failure or remote protocol violation。

---

## 6. Renderer Construction Seam

M8 extends the existing Control holder with exactly one construction-time optional Binding：

```text
createRendererControlHolder(data?: RendererDataBinding)
```

An equivalent one-field options object MAY be used。Forbidden：

```text
mutable registerDataBinding()
service locator
RendererPlatform / RendererServices
Data Store / EventBus
```

Renderer Data facts：

```text
one Renderer-wide Data acquisition terminal fact

per subsystemKey:
    0..1 current RendererDataPeer
    0..1 pending acquire
```

---

## 7. Renderer Reconciliation

After each accepted whole Control Snapshot is installed：

```text
installed peer has no exact current S/G/P
→ retire it

pending acquire has no exact current S/G/P
→ abort it

exact current S/G/P already installed/pending
→ keep

current authority exists + no peer/pending + acquisition healthy
→ start acquire(S,G,P)
```

Acquire resolution MUST recheck：

```text
same Control peer is still locally current
AND exact S/G/P is still in current Snapshot
AND this acquire is still the current pending attempt
AND signal was not aborted
```

Failure of any recheck：close returned carrier；never install。

Reconciliation MUST be non-blocking：

```text
install Control Snapshot
→ compute desired Data changes synchronously
→ abort/retire stale work
→ start missing acquire work
→ return to Control state consumption
```

Control consumption MUST NOT await Data acquire、peer close or physical provisioning。Data can never backpressure Renderer Control authority updates。

---

## 8. Renderer Binding / Construction Terminal

First surfaced non-abort `RendererDataBinding.acquire` rejection from any subsystem：

```text
latch Renderer-wide Data acquisition terminal
→ abort all other pending Data acquires
→ start no future Data acquire for any subsystem
→ keep already-current Data peers solely with respect to this failure
→ keep Renderer Control current
```

Likewise, if a resolved carrier cannot construct a valid `DataCurrentBindingV1` / `RendererDataPeer`：

```text
close returned carrier
→ install nothing
→ latch Renderer-wide Data acquisition terminal
→ abort all other pending acquires
→ no future acquire
→ unrelated already-current Data peers remain current
→ Renderer Control remains current
```

No retry manager / Binding error hierarchy is added。

---

## 9. Control Parent Authority

Current Renderer Control peer replacement / terminal：

```text
abort all pending Data acquires
retire/close all current Renderer Data peers
clear all local Data current records
```

Old Control peer late Snapshot/terminal/acquire resolution cannot affect new Control state。

Reverse direction is forbidden：

```text
Data peer terminal / Binding terminal / peer construction failure
✗ clear Renderer Control
✗ mutate Main Runtime/Frame authority
✗ synthesize DataAuthority replacement
```

---

## 10. `@loomrealm/data` Consumption / Child Boundary

Roles MUST directly use：

```text
createSubsystemDataPeer(...)
createRendererDataPeer(...)
```

MUST NOT copy JSON/profile validation、single-reader dispatch、serialized writer or terminal mechanics。

M8 closes Data peer lifecycle only。It does NOT implement or qualify：

```text
Input Interest business state
Input producer/listener/effective gate
Render Domain/Store/revision business state
fresh Input/Render baseline materialization
```

M8 vertical sends no child application traffic as closure evidence。Any minimal package-internal handler glue needed to instantiate peers MUST create no author-facing/business state and is not a conformance claim；M10/M11 replace/complete child role semantics before concrete product Data capability is qualified。

No InputManager / RenderManager / registry/store placeholder abstraction is introduced in M8。

---

## 11. Dependencies

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

No role→Main or role→concrete Hostra/PWA dependency。

---

## 12. Qualification

Subsystem must prove：

```text
Binding absent keeps Runtime/Frame path green
pending Data acquire does not block Runtime Control/Frame
ready + Binding installs one real Data peer
stale acquire cannot install
peer terminal is identity-safe and does not fail Runtime/Frame
same-generation fresh carrier creates fresh peer
leaving ready aborts pending + retires current
terminal Data cleanup reuses terminalCleanupDeadlineMs
Data cleanup failure never replaces graceful/fatal Runtime result
trusted-integration construction failure closes carrier, latches acquisition terminal, no Runtime/Frame failure
```

Renderer must prove：

```text
construction-time optional Binding only
Snapshot add/remove/G1→G2 reconciliation
reconciliation never blocks later Control states
late stale acquire closed
Control A→B retires all A Data
old terminal cannot affect new peer
Data terminal alone keeps Control current
one surfaced Binding rejection aborts all pending and blocks all future acquire
Binding terminal leaves already-current peers and Control intact solely for that cause
peer construction failure has the same acquisition-terminal isolation
Binding absent keeps M7 holder behavior
```

---

## 13. Frozen Closure

M8/03 is implementation-ready when Subsystem and Renderer have deterministic acquire/install/retire/teardown/failure semantics with no unresolved lifecycle policy and no premature Input/Render framework。
