# `@loomrealm/game-launcher-hostra` 设计

> 状态：**M6 Implemented / Qualified + M9 Provisioning Extension Frozen for Implementation**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 最近复核：2026-09-04  
> 正式契约：[Hostra Game Launcher / Node Subsystem Runner Profile v1](../../doc/15-contracts/nodejs-launcher-profile-v1.md)  
> 冻结决策：[ADR 0020](../../doc/decisions/0020-game-entry-consumer-boundary.md) · [ADR 0026](../../doc/decisions/0026-session-scoped-platform-instance.md) · [ADR 0028](../../doc/decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)

核心原则：

> **本包是 concrete HostraPlatform 内部的 Game PREPARE + RuntimeHosting/Runner integration component。M9 允许它增加“因为本包拥有 Node child 而必须拥有”的 Runtime-scoped Data provisioning mechanics，但 Desktop Broker authority/policy 仍不属于本包。**

---

## 1. Package Position

```text
apps/desktop
        ↓
session-scoped HostraPlatform / composition
        │
        ├── prepareGame(...)
        │       ↓
        │  @loomrealm/game-launcher-hostra
        │       ├── @loomrealm/game-package
        │       ├── launch.hostra.json
        │       ├── exact key join/security preflight
        │       ├── HostraLaunchPlan
        │       └── LogicalGameBootstrap
        │
        └── runtimeHosting
                ↓
           package-owned Node Runner
                ↓
           Runtime Control + M9 child provisioning mechanics
```

`@loomrealm/main` and business packages MUST NOT depend on this package。

No generic launcher-node/transport/provisioning/supervisor extraction is required in M9 without another real consumer。

---

## 2. Owned Surface Through M9

Package owns：

```text
Hostra Runtime-product Game Entry consumption
Hostra launch manifest / module security / exact join
immutable HostraLaunchPlan
LogicalGameBootstrap projection
plan-bound RuntimeHosting
Node Runner/bootstrap
Runtime Control WebSocket carrier
physical process convergence
M9 exact child-scoped Data provisioner + provisioning IPC
Runner-side Data WS establishment/delivery into SubsystemDataBinding
```

Package does not own：

```text
Main Runtime/Frame/Renderer/DataAuthority
Renderer hosting/currentness
Desktop DataConnectionBroker
Renderer-side Data pairing policy
candidate winner/supersede policy
Data application protocol parsing
Input/Render/Content business state
PWA abstraction
```

---

## 3. M6 Frozen Integration Surface — Preserved

Existing Game/Runner surfaces remain：

```ts
interface HostraGameSource {
  readonly installationRoot: string;
}

interface HostraRunnerPolicy {
  readonly helloDeadlineMs: number;
  readonly frameDeadlineMs: number;
  readonly terminalCleanupDeadlineMs: number;
  readonly terminationGraceMs: number;
}

interface HostraPrepareOptions {
  readonly source: HostraGameSource;
  readonly runnerPolicy: HostraRunnerPolicy;
}

interface PreparedHostraGame {
  readonly logicalBootstrap: LogicalGameBootstrapShape;
  readonly launchPlan: HostraLaunchPlan;
}

prepareHostraGame(options: HostraPrepareOptions): Promise<PreparedHostraGame>
```

Game source remains exactly `installationRoot`；no universal GameSource/options bag。

---

## 4. M9 Exact Provisioning Surface

Add：

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

`createHostraRuntimeHosting(...)` target becomes：

```ts
createHostraRuntimeHosting({
  launchPlan,
  onRuntimeDataProvisioner,
}: {
  readonly launchPlan: HostraLaunchPlan;
  readonly onRuntimeDataProvisioner?: (
    runtime: HostedRuntime,
    provisioner: HostraRuntimeDataProvisioner,
  ) => void;
}): RuntimeHosting
```

The hook is concrete Hostra composition integration, not a shared platform-ports capability。

---

## 5. PREPARE → COMMIT — Game Path Unchanged

PREPARE remains side-effect-free with respect to business Runtime：validate Game/manifest/security/all modules/Node/Runner → freeze plan/bootstrap。

Before successful PREPARE：

```text
zero Subsystem Runner process
zero business Definition import
zero Runtime Control WebSocket
```

Ordinary Runtime launch still only looks up frozen HostraLaunchPlan and never re-reads Game/manifest/module selection。

---

## 6. RuntimeHosting Launch / Handoff Ordering

For one launch：

```text
validate logical request against frozen plan
→ create loopback Runtime Control listener/material
→ spawn exact package-owned Runner
→ construct HostedRuntime R
→ construct child-bound HostraRuntimeDataProvisioner P
→ if hook supplied: invoke hook(R,P)
→ resolve RuntimeHosting.launch() with R
```

The hook MUST run before successful launch resolution so Desktop can map the exact Runtime identity before Main may publish it in `DataConnectionAuthorityView`。

Hook is synchronous/non-blocking and expected to perform only local composition registration (e.g. WeakMap set)。If supplied hook throws：

```text
launch fails closed
→ child/listener are converged/terminated
→ no HostedRuntime ownership escapes
```

M6/headless caller omits the hook and sees unchanged launch behavior。

---

## 7. Hostra Provisioner Lifetime

```text
one HostedRuntime R
→ one provisioner P
→ same exact Node child
```

P becomes terminal/unusable when：

```text
child terminates
provisioning IPC becomes permanently unavailable
```

Fresh Runtime object always receives a fresh provisioner。No lookup by subsystemKey/PID and no public RuntimeDirectory。

---

## 8. Runner Bootstrap — Startup Material Remains Narrow

Runner startup still consumes only Runtime bootstrap/control/module facts。Data endpoint/ticket/candidate is NOT added to `RunnerBootstrapV1`。

M9 Runner additionally installs one Host-owned provisioning IPC listener before invoking/alongside `runSubsystem(...)` and supplies a real `SubsystemDataBinding` that waits for committed current-deliverable Data carriers。

Business Definition never sees Hostra IPC/endpoint material。

---

## 9. Dedicated Provisioning IPC

Hostra-private messages：

```text
host → runner : provision(candidateId, endpoint, G, P)
runner → host : prepared(candidateId)
host → runner : commit(candidateId)
runner → host : committed(candidateId)
host → runner : revoke(candidateId)
```

No Runtime Control/Frame/business/Renderer Control/Input/Render payload。

`candidateId` is local stale-work correlation, not authority/credential/generation。

Node IPC ordering is used only for Hostra physical coordination；the application contracts do not depend on this wire format。

---

## 10. Runner Candidate State — Exact Bound

Runner provisioning layer state is exactly：

```text
0..1 prepared uncommitted candidate
0..1 committed current-deliverable carrier
0..1 pending SubsystemDataBinding acquire waiter
```

A current carrier and one future replacement candidate may coexist physically because only the current-deliverable carrier is current。

`prepare()`：connect exact Data WS, hold carrier private, ACK prepared。  
`commit()`：only after Broker logical install; make exact candidate current-deliverable, ACK committed。  
`revoke()`：identity-safe, non-blocking, non-throwing invalidation/cleanup。

If `prepare(C2)` arrives while prepared-uncommitted `C1` already occupies the prepare slot：

```text
reject C2
keep C1 unchanged
```

The launcher/provisioner MUST NOT implicitly supersede C1。Desktop Broker owns candidate selection; it must revoke/invalidate C1 before issuing a fresh prepare for C2。

No pending queue、winner arbitration or retry scheduler exists in this package。

`SubsystemDataBinding.acquire()` remains a delivery wait and is not candidate creation/authority/installation gate。

---

## 11. Post-install Delivery Failure

Broker owns logical Data installation。Therefore provisioner `commit()` failure means：

```text
Broker already installed B current
→ Runner delivery fails/rejects
→ Desktop Broker retires B
→ package closes/revokes B material
→ old A never resurrects
```

Package MUST NOT implement rollback to previous Data carrier and MUST NOT report this as Runtime Control failure。

If B is revoked/superseded while commit ACK is pending, late `committed(B)` is stale and cannot restore B。

---

## 12. Committed-undelivered Carrier Resource Bound

A committed current-deliverable carrier may exist before `SubsystemDataBinding.acquire()` has attached the role peer reader。

Therefore Hostra Data carrier buffering during that gap MUST be finite：

```text
no unbounded inbound application queue
```

The exact byte/message limit is Hostra/Desktop adapter policy and is not added to the public provisioner API or Data application wire。

If the finite resource bound is exceeded after logical install：

```text
Data carrier becomes unusable
→ Broker current pair retires whole
→ close/revoke candidate
→ Runtime Control/Frame/Main DataAuthority unchanged
```

No replay、retry、BackpressureManager or application flow-control protocol is introduced。

---

## 13. Process / Runtime Control Facts — M6 Preserved

Child `exit` remains canonical physical termination fact。`HostedRuntime.terminated` semantics and `requestTermination()` convergence remain unchanged。

Unexpected child exit is still Runtime failure via existing Main supervision path。Provisioning IPC/Data WS failure while child + Runtime Control remain healthy is Data-only。

No automatic Runtime restart。

---

## 14. Security Invariants Through M9

```text
module path installation-relative .mjs only
all module bindings safe before plan freeze
reserved bootstrap env scrubbed before business import
Runner env explicit allowlist
Runtime Control WS binds 127.0.0.1 only
Data WS endpoints/candidate material Host-owned and loopback only
fresh one-time unguessable Data candidate material
finite Data application buffering
Game/manifest cannot select Data endpoint/ticket/IPC policy
bootstrapToken remains Runtime Control/Main authority
Data candidate material does not create Main DataAuthority
```

---

## 15. M9 Non-goals for This Package

```text
Desktop DataConnectionBroker
RendererDataBinding product policy
candidate winner/supersede policy
BrowserWindow / Renderer Control physical hosting
Input / Render / Content
PWA provisioning abstraction
universal transport/provisioning package
generic process supervisor
RuntimeDirectory / ConnectionRegistry
multi-pending queue/scheduler
BackpressureManager / flow-control protocol
Runtime restart/reconnect
```

---

## 16. Qualification Through M9

Package tests must prove：

```text
M6 PREPARE/Runtime launch regressions green
hook omitted → existing behavior unchanged
hook fires before successful launch resolution
hook throw → launch fails closed / child converged
one HostedRuntime → one provisioner
Data material absent from startup bootstrap
prepare private carrier + prepared ACK
0..1 prepared + 0..1 current-deliverable state bound
second prepare while pending exists rejects / existing pending unchanged
replacement pending work requires explicit revoke before fresh prepare
commit is post-install delivery ACK
commit cancellation/stale ACK identity-safe
revoke non-throwing/identity-safe
committed-undelivered buffering finite / overflow fails Data-only
IPC terminal disables Data only while Runtime Control may remain healthy
child exit remains Runtime fact
no Broker policy/protocol parsing added
```

---

## 17. Freeze / Reopen Rule

M6 baseline remains frozen。M9 extension is frozen by ADR 0028。

Implementation may choose private file names、IPC JSON/structured message encoding and finite buffer constants, but may not change：

```text
exact public provisioner types/signatures
hook timing before launch resolution
Data startup-bootstrap exclusion
0..1 prepared + 0..1 current-deliverable bound
second-prepare rejection / explicit revoke-before-replacement
prepare/commit/revoke lifecycle
post-install commit failure semantics
finite committed-undelivered buffering
Data-vs-Runtime failure isolation
launcher-vs-Desktop Broker ownership
```

Reopen only for demonstrated contract contradiction or a real M9 consumer inability, not code reuse/future PWA symmetry。
