# M9 / 02 — Runner Late Provisioning IPC

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：02  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md)  
> 冻结决策：[ADR 0028](doc/decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Runtime Hosting](doc/10-architecture/runtime-hosting-system.md)  
> 目标：冻结 exact `HostedRuntime` → Hostra child provisioner handoff 与 Runner late Data provisioning；不复用 Runtime Control，不把 Data endpoint 固定进 Runtime bootstrap，也不让 launcher拥有 Broker policy。

> **Launcher owns the child and its IPC；Desktop owns Broker policy。两者只通过一个 Runtime-scoped Hostra provisioner 交接。**

---

## 1. Frozen Physical Shape

```text
Main current Data view
    exact HostedRuntime R
        ↓
Desktop Broker
        ↓ lookup R
HostraRuntimeDataProvisioner
        ↓ dedicated child IPC
Node Runner
        ↓ Data WebSocket held by provisioning layer
SubsystemDataBinding
```

Data endpoint/ticket/candidateId MUST NOT进入 `RunnerBootstrapV1`。Runtime bootstrap只负责 Runtime Control/business Runtime启动；Data material始终 late、candidate-scoped。

---

## 2. Exact Hostra-private Surface

`@loomrealm/game-launcher-hostra` 增加：

```ts
export interface HostraRuntimeDataPrepareRequest {
  readonly candidateId: string;
  readonly endpoint: string;
  readonly generation: number;
  readonly dataProfile: string;
}

export interface HostraRuntimeDataProvisioner {
  prepare(
    request: HostraRuntimeDataPrepareRequest,
    signal: AbortSignal,
  ): Promise<void>;

  commit(
    candidateId: string,
    signal: AbortSignal,
  ): Promise<void>;

  revoke(candidateId: string): void;
}
```

`createHostraRuntimeHosting(...)` adds one optional composition hook：

```ts
onRuntimeDataProvisioner?: (
  runtime: HostedRuntime,
  provisioner: HostraRuntimeDataProvisioner,
) => void;
```

No generic `RuntimeDirectory`、ProvisioningBus、RPC client or Platform registry。

---

## 3. Handoff Ordering

For each successful `RuntimeHosting.launch()`：

```text
spawn exact child
→ construct HostedRuntime R
→ construct one provisioner P bound to that exact child
→ invoke onRuntimeDataProvisioner(R,P) if present
→ only then resolve launch() with R
```

Rules：

```text
one HostedRuntime object → exactly one provisioner when hook present
provisioner lifetime ≤ exact child lifetime
fresh Runtime object → fresh provisioner
```

`apps/desktop` MAY store the relation in a private `WeakMap<HostedRuntime, HostraRuntimeDataProvisioner>`。No public map/lookup service is introduced。

Headless/M6 consumers omit the callback and retain existing behavior。

The callback is composition glue and MUST be synchronous/non-blocking。If a supplied callback throws, Hostra launch fails closed and the just-created child is converged/terminated before ownership is returned；this is a non-conforming product-composition setup error, not an ordinary Data candidate failure。

---

## 4. Dedicated IPC Scope

Hostra-private child IPC expresses only Data provisioning lifecycle：

```text
host → runner : provision(candidate, endpoint, G, P)
runner → host : prepared(candidate)
host → runner : commit(candidate)
runner → host : committed(candidate)
host → runner : revoke(candidate)
```

It MUST NOT carry：

```text
Runtime Control / Frame RPC
business commands
Main authority mutation
Renderer Control
Input/Render application payload
Game/LaunchPlan mutation
```

IPC encoding and message field layout remain Hostra-private。Do not introduce generic RPC mechanics or `@loomrealm/wire` application schema for this channel。

`candidateId` is stale-work correlation only；it is not Connection identity、generation、credential or authority。

---

## 5. `prepare()` Semantics

`prepare(request, signal)` resolves only after the exact Runner has：

```text
accepted the candidate as its current prepared candidate
connected the exact local Data WebSocket endpoint
held the resulting carrier privately
sent prepared(candidate)
```

Before `prepare()` resolves：

```text
carrier is not role-visible
SubsystemDataBinding does not resolve
no child Data peer exists for this candidate
```

Runner only needs：

```text
0..1 prepared uncommitted candidate
0..1 committed current-deliverable carrier
0..1 SubsystemDataBinding acquire waiter
```

A second prepare while another uncommitted candidate occupies the Runner prepare slot MAY reject/supersede according to the Broker's chosen candidate; it MUST NOT create multiple role-current carriers。

Abort/stale candidate closes the private carrier and resolves no Binding waiter。

---

## 6. Installation vs `commit()` Delivery

**Broker installation commit is not the IPC `commit()` call.**

Frozen ordering：

```text
both physical sides prepared
→ Broker serialized authority revalidation
→ old current loses current status
→ candidate B becomes sole logical current Data Connection
→ only after that, Broker calls provisioner.commit(B,...)
```

`commit(candidateId, signal)` is a **post-install Runner delivery notification**。It resolves when the Runner has accepted that exact candidate as current-deliverable to `SubsystemDataBinding` and has replied `committed(candidate)`。

This distinction removes half-install ambiguity：

```text
commit() rejects/fails after B logical install
→ B is a real current that immediately retires
→ Broker closes/revokes B
→ old A is never resurrected
→ Runtime/Frame/Main authority unchanged
```

If B is superseded/invalidated while `commit()` is pending：

```text
abort B delivery signal
revoke(B)
late committed(B) ACK is stale
→ cannot re-deliver/reinstall B
```

No rollback protocol。

---

## 7. `revoke()` Semantics

`revoke(candidateId)` is identity-safe, non-blocking and MUST NOT throw。

It synchronously makes the matching Hostra provisioner candidate/current-deliverable slot unusable locally, then best-effort sends revoke/closes physical material。

Late revoke/commit/prepared events for old candidate IDs cannot clear or mutate a newer candidate。

If a carrier was already delivered to `@loomrealm/subsystem/host`, Broker WS closure produces normal Data peer terminal/clear semantics；there is no out-of-band role state mutation。

---

## 8. Existing `SubsystemDataBinding`

M8 public shape is unchanged：

```text
SubsystemDataBinding.acquire(signal)
→ wait for one already-committed current-deliverable carrier
→ resolve {carrier,G,P}
```

Important：

```text
acquire() != candidate creation
acquire() != authority feed
acquire() != paired-install prerequisite
```

Therefore Broker may prepare/install B while old role peer A is still current。When A is retired/closed, existing M8 terminal→fresh-acquire flow receives B if B remains current-deliverable。

If B was committed with no waiter, Runner holds exactly one committed-undelivered carrier until the next valid acquire or until it is revoked/retired。

---

## 9. Provisioning Failure Domain

Candidate-level：

```text
WS connect failure
prepare rejection
stale provision/revoke
post-install commit delivery rejection
```

remain Data-only facts。

Provisioning IPC becomes unusable while child remains alive：

```text
provisioner becomes terminal for new Data work
prepared/committed-undelivered material fails closed
future SubsystemDataBinding acquire MAY surface one non-abort rejection
Runtime Control remains independent
```

Actual child process exit remains the existing RuntimeHosting termination/Runtime failure fact。

No Data provisioning failure directly causes Frame unwind or changes Main DataAuthority。

---

## 10. Security / Transport

Hostra Data endpoint is Host-owned：

```text
127.0.0.1 only
fresh one-time unguessable candidate material
single intended role side
closed on abort/retire/session shutdown
```

Game/manifest cannot select Data endpoint、ticket、IPC or credential policy。

Data WebSocket application unit remains one UTF-8 JSON text message；provisioning IPC never parses Data application payload。

---

## 11. Qualification

Must prove：

```text
exact public Hostra provisioner names/signatures
hook optional; M6/headless path unchanged
hook fires before launch resolves HostedRuntime
exact HostedRuntime object maps to exact provisioner
callback failure converges child before launch failure returns
Data material absent from RunnerBootstrapV1
prepare holds carrier private and reports prepared
Broker logical install precedes provisioner.commit delivery
commit rejection after install retires new pair; no old resurrection
stale/aborted commit ACK cannot install/re-deliver old candidate
revoke non-throwing + identity-safe
SubsystemDataBinding only waits for committed current-deliverable carrier
provisioning IPC failure is Data-only
child process exit remains Runtime fact
no generic RPC/registry abstraction
```

---

## 12. Frozen Closure

M9/02 is implementation-closed when Desktop can deterministically map exact `HostedRuntime` → exact child provisioner, and Runner prepare/commit/revoke semantics have no unresolved installation/rollback interpretation。
