# M9 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：05  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md) → [M9 / 02](M9_02_RUNNER_PROVISIONING_IPC.md) → [M9 / 03](M9_03_PAIRED_INSTALLATION.md) → [M9 / 04](M9_04_VERTICAL_INTEGRATION.md)  
> 冻结决策：[ADR 0028](doc/decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Connection Conformance](doc/15-contracts/renderer-subsystem-data-connection-conformance-v1.md)  
> 目标：定义唯一 M9 implementation qualification gate；关闭 Main authority feed、Desktop Broker、Hostra Runner late provisioning、two-sided Data WS 与 M8 role delivery，不提前声明 M10/M11/M14/M16。

> **M9 closure = Main current authority通过一个非抛异常 immutable full-view sink安全驱动 bounded Desktop paired installation；Hostra Runner delivery失败只会 retire Data pair，绝不产生半提交回滚或 Runtime/Frame authority变化。**

---

## 1. Exact Frozen Public Additions

### `@loomrealm/platform-ports`

```ts
interface DataConnectionAuthorityEntry {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly runtime: HostedRuntime;
}

interface DataConnectionAuthorityView {
  readonly rendererControlToken: string;
  readonly entries: readonly DataConnectionAuthorityEntry[];
}

interface DataConnectionAuthoritySink {
  replace(view: DataConnectionAuthorityView | null): void;
}
```

### `@loomrealm/main`

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
  readonly dataConnections?: DataConnectionAuthoritySink;
}
```

### `@loomrealm/game-launcher-hostra`

```ts
interface HostraRuntimeDataPrepareRequest {
  readonly candidateId: string;
  readonly endpoint: string;
  readonly generation: number;
  readonly dataProfile: string;
}

interface HostraRuntimeDataProvisioner {
  prepare(request: HostraRuntimeDataPrepareRequest, signal: AbortSignal): Promise<void>;
  commit(candidateId: string, signal: AbortSignal): Promise<void>;
  revoke(candidateId: string): void;
}
```

`createHostraRuntimeHosting(...)` adds optional `onRuntimeDataProvisioner(runtime, provisioner)` composition hook。

M8 `RendererDataBinding` / `SubsystemDataBinding` signatures remain unchanged。

---

## 2. Must Implement

```text
@loomrealm/platform-ports
    exact M9 authority sink types

@loomrealm/main
    optional dataConnections validation
    initial replace(null)
    current Renderer token retention as inert correlation
    fresh immutable full-view projection using exact HostedRuntime identity
    same serialized-lane sink replacement on Renderer/Runtime/DataAuthority/session changes

apps/desktop
    first real private workspace
    session-scoped DataConnectionBroker
    sink implementation
    one Map<S,Slot> with 0..1 current + 0..1 pending per S
    two-sided loopback Data WS opaque relay
    finite application buffering/resource policy
    per-S RendererDataBinding delivery cells
    Broker contract harness + deterministic physical Renderer host

@loomrealm/game-launcher-hostra
    exact Runtime→provisioner handoff
    dedicated child provisioning IPC
    Runner 0..1 prepared + 0..1 current-deliverable state
    second prepare rejection / explicit revoke-before-replacement
    real Runner-side SubsystemDataBinding delivery

existing @loomrealm/data peers
focused real M9 vertical
root npm workspace/test:m9 integration
```

---

## 3. Abstraction Budget / Must Not Add

```text
EventBus / ObserverHub / generic authority stream
public DataConnectionBroker interface/service locator
RuntimeDirectory service
ConnectionRegistry / ConnectionManager framework
multi-pending candidate queue/scheduler
GenericTransaction / 2PC framework
Data application hello/ready/resume/close messages
Runtime Control or Renderer Control provisioning RPC
retry/backoff framework
BackpressureManager / application flow-control protocol
new generation allocator/history
second Renderer lease/epoch/currentness protocol
InputManager / RenderManager / Store placeholders
BrowserWindow/Electron product shell
Content
PWA abstraction solely for symmetry
```

Every new public type must have a current M9 consumer。

---

## 4. Authority Sink Evidence

Must prove：

```text
dataConnections absent preserves all M1–M8 paths
provided sink receives initial null
non-null view exists only for exact current Renderer
rendererControlToken was consumed for M7 auth and is retained only as inert current correlation
current retained token participates in live opaque-material duplicate defense
entries are unique by subsystemKey and deterministic
entry runtime is exact HostedRuntime object identity
entry S/G/P equals Main current DataAuthority
view/entries containers are fresh detached immutable snapshots after publication
HostedRuntime itself is preserved by reference identity, not cloned/frozen
replace(view/null) is full replacement
replace is synchronous/non-blocking/non-throwing
replace performs no network/IPC wait
replace alone does not bump rendererRevision
Renderer replacement changes sink in same Main mutation lane
Runtime/DataAuthority changes refresh sink in same lane
current Renderer terminal → null
Session terminal → null before async cleanup
```

A throwing sink implementation is non-conforming；qualification fails rather than inventing Runtime/Frame recovery semantics。

---

## 5. Hostra Provisioner Evidence

Must prove：

```text
hook optional; M6/headless path unchanged
one successful HostedRuntime → one exact provisioner when hook present
hook fires before RuntimeHosting.launch resolves HostedRuntime
Desktop uses private exact-object WeakMap correlation
Data endpoint/ticket absent from RunnerBootstrapV1
Runner state bounded to 0..1 prepared-uncommitted + 0..1 committed-current-deliverable
prepare holds connected carrier private until install
second prepare while pending exists rejects and leaves existing pending unchanged
pending replacement requires Broker revoke/invalidate old before new prepare
prepare cancellation/stale handling identity-safe
Broker logical installation happens before provisioner.commit
commit resolves only after Runner committed ACK/current-deliverable acceptance
commit rejection after logical install retires the new current pair
old current is never resurrected
revoke is non-blocking/non-throwing and identity-safe
late prepared/committed/revoke event cannot affect newer candidate
committed-undelivered carrier does not accumulate unbounded application traffic
provisioning IPC terminal remains Data-only
actual child exit remains existing Runtime fact
```

---

## 6. Paired Install / Relay Evidence

Must prove：

```text
Renderer-only prepared → not current
Runner-only prepared → not current
pre-install child bytes never exposed as current
both prepared + exact current view → may install
commit-time revalidation catches S/G/P/Renderer/Runtime race
normative cardinality is current Renderer + S; implementation storage is one Map<S,Slot>
per-S state exactly 0..1 current + 0..1 pending
same-S concurrent candidate requests → one pending owner; newcomers reject/dispose
different subsystem slots independent
old current retires before new current becomes sole occupant
no old/new current overlap
Binding waiter may be absent at installation
Renderer delivery cell holds committed carrier for later acquire
Runner may hold one committed-undelivered carrier for later acquire
one relay side read/write/close terminal retires whole pair
retired carrier never current again
late retired traffic/send completion cannot affect replacement
Broker relays opaque UTF-8 text and does not parse Data application JSON
```

---

## 7. Finite Buffer / Resource Evidence

Every production Data carrier/relay path MUST have a finite application buffering policy whenever a role reader/binding delivery is absent or delayed。

Must prove：

```text
no unbounded inbound queue on Renderer or Runner side
exact buffer constant remains adapter-private
pre-install buffer/resource overflow → candidate disposed / never Connection
post-install buffer/resource overflow → current pair retired whole
buffer overflow never mutates Main S/G/P or Runtime/Frame
buffered old units are never replayed or migrated to a fresh pair
```

No application flow-control/ACK/retry protocol is introduced solely to satisfy this resource bound。

---

## 8. Post-install Delivery Failure Evidence

Required explicit trace：

```text
A current
→ B paired prepared
→ serialized install retires A + makes B current
→ Runner post-install commit notification rejects
→ B current→retired
→ B closed/revoked
→ A never resurrects
→ Main S/G/P + Runtime/Frame unchanged
```

This is the only allowed interpretation of Runner commit-delivery failure after installation。It MUST NOT be reported as a pre-install candidate failure and MUST NOT roll back cutover。

---

## 9. Recovery / Traffic Evidence

Must prove：

```text
Data loss → Runtime/Frame/Renderer Control/Main authority unchanged
same S/G/P may install fresh current
proactive same-generation replacement uses one pending candidate + same install path
no generation or rendererRevision change solely for physical replacement
no resume token
no replay of old emitted traffic
no migration of old unsent queue
fresh @loomrealm/data peer/connection-local state after replacement
late old traffic cannot retire/clear new current
```

M9 does **not** qualify：

```text
fresh User Input Interest/State/Event/Reset business baseline
fresh Render Domain/snapshot/patch/event business baseline
```

Those child-profile semantics are M10/M11 obligations even though the Frozen contracts already define them。

---

## 10. Conformance Claim Boundary

M9 MUST NOT claim full Renderer ⇄ Subsystem Data Connection v1 platform/cross-platform qualification because Phase 1 production M9 does not yet close：

```text
production fresh generation allocation/replacement/exhaustion
M10 User Input fresh publication baseline
M11 Render fresh publication baseline
PWA Platform Mapping / Hostra-PWA equivalence
```

M9 DOES qualify the **Hostra/Desktop physical Broker slice** for all cases applicable before those deferred responsibilities：

```text
authority exactness / no-authority rejection
candidate boundary
paired readiness/install
commit-time races
cardinality/bounded pending ownership/cutover
current→retired lifecycle
same-generation physical replacement/recovery
parent Renderer/Session/Runtime invalidation
late/stale traffic isolation
finite physical resource buffering
failure-domain isolation
no Data Connection application handshake messages
```

A small Broker contract harness MAY synthesize sink-view G/P/HostedRuntime replacements without adding fake Runtime restart/generation allocation to Main。

---

## 11. Production Vertical Evidence

Must use production：

```text
Main ready-derived S/1/loomrealm.renderer-data/1
Renderer Control peers + Main acceptance
DataConnectionAuthoritySink projection
Hostra HostedRuntime / Node Runner / provisioning IPC
Desktop two-sided Data WebSocket relay
M8 RendererDataBinding + SubsystemDataBinding
Renderer/Subsystem @loomrealm/data peers
```

Physical Renderer hosting alone may be deterministic/test。No BrowserWindow/Input/Render/Content required。

---

## 12. Repository / CI Evidence

M9 creates the first `apps/desktop` workspace and root workspace pattern includes `apps/*`。

Root adds：

```text
npm run test:m9
```

M9 gate MUST compose focused evidence rather than only one E2E。

Keep green：

```text
npm run test:m8
npm run test:game-launcher-hostra
npm run test:packages
npm run docs:build
npm run docs:check-links
```

---

## 13. Regression Boundary

Keep M1–M8 semantics unchanged：

```text
M6 Hostra Runtime launch/control path works when provisioner hook absent
M7 RendererControlBinding public signature/settlement/currentness unchanged
M7 token remains one-shot authentication credential; M9 retention never reauthorizes it
M8 Main logical DataAuthority remains ready-derived generation=1/profile fixed
M8 RendererDataBinding / SubsystemDataBinding public signatures unchanged
M8 role acquire/current/terminal/failure semantics unchanged
@loomrealm/data protocol mechanics unchanged
```

M9 extends physical authority facts and Hostra integration；it does not reopen Frozen Data application contracts。

---

## 14. Implementation Checklist

```text
[ ] platform-ports exact DataConnectionAuthorityEntry/View/Sink exported
[ ] platform-ports runtime dependency remains Foundation-only
[ ] MainPlatform.dataConnections optional + validated
[ ] Main initial null / full-view projection implemented
[ ] published view/entries detached immutable; HostedRuntime reference preserved
[ ] current Renderer token retained inertly and removed on currentness loss
[ ] live token duplicate-material guard updated
[ ] sink replace non-throwing/non-blocking qualification passes

[ ] apps/* added to workspace with apps/desktop created
[ ] Desktop Broker sink + Map<S,Slot> implemented
[ ] each S slot bounded to 0..1 current + 0..1 pending
[ ] same-S second pending candidate rejects/disposes; no implicit supersede
[ ] two-sided one-time loopback Data WS candidate implemented
[ ] relay gate closed before install / opaque after install
[ ] finite Data buffering policy implemented; no unbounded queue
[ ] per-slot serialized install/retire implemented

[ ] HostraRuntimeDataPrepareRequest/Provisioner exact API implemented
[ ] onRuntimeDataProvisioner handoff before launch resolution
[ ] Runner dedicated IPC provision/prepared/commit/committed/revoke implemented
[ ] Runner 0..1 prepared + 0..1 committed-undelivered state bound
[ ] pending replacement requires explicit revoke before fresh prepare
[ ] commit failure after install → new current retired / no rollback proven
[ ] revoke non-throwing/identity-safe proven

[ ] authority/Renderer/Runtime race harness passes
[ ] same-S concurrent request one-pending-owner passes
[ ] whole-pair retirement passes
[ ] finite-buffer overflow pre/post install passes
[ ] proactive same-generation replacement passes
[ ] loss same-generation recovery passes
[ ] no replay/resume/migration passes
[ ] Data failure isolation passes

[ ] no M10/M11 publication-baseline claim
[ ] no full cross-platform Connection-v1 qualification claim
[ ] npm run test:m9 passes
[ ] M6–M8 regressions pass
[ ] docs build/link checks pass
```

---

## 15. Documentation Closure After Implementation

After code qualification only, update：

```text
doc/30-implementation/m9-qualification.md
README current implementation status
doc/README current milestone status
phase-1-delivery-plan M9 status
Hostra/Desktop/package module status
```

The frozen preimplementation documents and ADR remain semantic source；qualification record adds implementation evidence, not new architecture。

---

## 16. Freeze Gate

**Gate status: CLOSED.**

All public seams、authority sources、immutable snapshot semantics、identity binding、bounded per-S slot state、installation order、finite physical buffering、post-install delivery failure、retirement、repository placement and qualification claim boundaries are fixed。Coding-time freedom is limited to private helper/file/class names、IPC encoding details、candidate ID generation format、finite buffer constants and WebSocket adapter internals that preserve these semantics。

Reopen only for：

```text
demonstrated correctness/security contradiction
conflict with a Frozen contract
a real M9 consumer cannot be implemented through these exact minimal seams
```

Not reopen reasons：framework reuse、future PWA symmetry、naming preference、test convenience、reducing call sites。
