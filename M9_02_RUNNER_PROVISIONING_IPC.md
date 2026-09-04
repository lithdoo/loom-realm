# M9 / 02 — Runner Late Provisioning IPC

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：02  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Hostra Desktop Composition](doc/20-modules/desktop-host/README.md)  
> 目标：为每个真实 Node Runner 提供一个 runtime-scoped Hostra-private provisioner，使 Desktop Broker 能 late-provision Data candidate；不复用 Runtime Control，不把 Broker 放入 launcher。

> **Launcher owns the child and its IPC；Desktop owns Broker policy。两者只通过一个 runtime-scoped provisioner 交接。**

---

## 1. Physical Shape

```text
Desktop Broker
    │ exact HostedRuntime
    ▼
HostraRuntimeDataProvisioner
    │ dedicated child IPC
    ▼
Node Runner
    │ Data WebSocket
    ▼
SubsystemDataBinding
```

Data endpoint/ticket MUST NOT进入 `RunnerBootstrapV1`。它们是 Runtime 已运行后的 candidate-scoped material。

---

## 2. Exact Hostra-private Handoff

`@loomrealm/game-launcher-hostra` 增加一个 concrete integration type：

```ts
interface HostraRuntimeDataProvisioner {
  prepare(
    request: {
      readonly candidateId: string;
      readonly endpoint: string;
      readonly generation: number;
      readonly dataProfile: string;
    },
    signal: AbortSignal,
  ): Promise<void>;

  commit(candidateId: string): void;
  revoke(candidateId: string): void;
}
```

`createHostraRuntimeHosting(...)` 增加 optional composition callback：

```ts
onRuntimeDataProvisioner?: (
  runtime: HostedRuntime,
  provisioner: HostraRuntimeDataProvisioner,
) => void;
```

规则：

```text
callback happens before RuntimeHosting.launch(...) resolves HostedRuntime
one HostedRuntime object → one provisioner
provisioner becomes unusable when that exact child terminates
```

`apps/desktop` MAY用一个 private `WeakMap<HostedRuntime, HostraRuntimeDataProvisioner>` 做 exact lookup；不创建 public RuntimeDirectory/registry service。

M6/headless consumers omit the callback and remain unchanged。

---

## 3. IPC Scope

Dedicated child IPC only carries provisioning lifecycle：

```text
host → runner : provision(candidate, endpoint, G, P)
runner → host : prepared(candidate)
host → runner : commit(candidate)
host → runner : revoke(candidate)
```

It MUST NOT carry：

```text
Frame RPC
Runtime Control messages
business commands
Main authority mutation
Input/Render payload
Game/launch manifest rewrite
```

Encoding/field layout stays Hostra-private；do not create a generic RPC layer。

`candidateId` is stale-work correlation only, not Data Connection authority identity。

---

## 4. Runner-side Candidate State

Runner provisioning implementation only needs：

```text
0..1 prepared uncommitted candidate
0..1 committed current-deliverable carrier
0..1 SubsystemDataBinding acquire waiter
```

`prepare(...)`：

```text
validate fresh candidate correlation
→ connect exact local Data WS endpoint
→ keep carrier private
→ report prepared
```

`commit(candidate)`：

```text
candidate must be the prepared one
→ replace old committed-deliverable carrier if any
→ new carrier becomes current-deliverable
→ resolve pending SubsystemDataBinding.acquire() if one exists
```

`revoke(candidate)` closes/discards only that candidate/current instance if identity matches；late old revoke/ACK cannot affect a newer candidate。

No generic state machine framework is required。

---

## 5. `SubsystemDataBinding` Relationship

Existing M8 Binding semantics remain unchanged：

```text
SubsystemDataBinding.acquire(signal)
→ wait for one already-committed current-deliverable carrier
→ resolve {carrier,G,P}
```

Important：

```text
acquire() is NOT candidate creation
acquire() is NOT Main authority feed
acquire() is NOT paired-install prerequisite
```

Therefore Broker MAY prepare/commit a fresh candidate while the old role peer is still current。After cutover closes the old peer, the role's existing M8 terminal→fresh-acquire path receives the already-committed replacement。

Abort only cancels that role waiter；it does not resurrect/authorize a candidate。

---

## 6. Failure Semantics

Candidate-level failures：

```text
WS connect failure
stale provision
revoke before commit
candidate cleanup/timeout
```

→ dispose that candidate only。

Provisioning IPC itself terminal/unusable：

```text
no further Runner Data candidates
→ current/pending Data material fail closed
→ future SubsystemDataBinding acquire MAY surface one non-abort rejection
```

Existing M8 host semantics then stop further acquire for that Runtime host lifetime。

All above：

```text
!= Runtime Control loss
!= Runtime failure
!= Frame unwind
```

Actual child process exit still follows existing RuntimeHosting supervision。

---

## 7. Security / Transport

Hostra Data endpoint is Host-owned local capability：

```text
127.0.0.1
fresh one-time unguessable path/material
single intended candidate
finite candidate cleanup
```

Game manifest cannot choose endpoint/ticket/IPC policy。

Data WS application unit remains one UTF-8 JSON text message；provisioning IPC never parses Data payload。

---

## 8. Closure

M9/02 is closed when Desktop composition can map exact `HostedRuntime` object → exact Hostra provisioner, and a live Runner can prepare/commit/revoke Data candidates without Runtime restart、Runtime Control RPC or Broker ownership leaking into launcher。
