# M9 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M9 Desktop DataConnectionBroker / Late Provisioning Core  
> 落地顺序：05  
> 最近复核：2026-09-04  
> 前置：[M9 / 01](M9_01_DESKTOP_DATA_BROKER.md) → [M9 / 02](M9_02_RUNNER_PROVISIONING_IPC.md) → [M9 / 03](M9_03_PAIRED_INSTALLATION.md) → [M9 / 04](M9_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Connection Conformance](doc/15-contracts/renderer-subsystem-data-connection-conformance-v1.md)  
> 目标：定义唯一 M9 qualification gate；关闭 Desktop authority feed、Broker、Runner late provisioning 与 real Data WS，同时精确限制 conformance claim。

> **M9 closure = Main current authority 可以被 Desktop physical Broker安全地 paired-install 到真实 Runner/Renderer role seam；Data failure永远不升级成 Runtime/Frame authority。**

---

## 1. Must Implement

```text
@loomrealm/platform-ports
    DataConnectionAuthorityEntry/View/Sink

@loomrealm/main
    optional MainPlatform.dataConnections
    current Renderer token retention for physical correlation
    serialized full-view replace/null invalidation

apps/desktop
    session-scoped DataConnectionBroker
    exact sink implementation
    per-subsystem 0..1 current slot
    paired Data WS relay
    RendererDataBinding realization for M9 test host

@loomrealm/game-launcher-hostra
    HostraRuntimeDataProvisioner
    optional onRuntimeDataProvisioner handoff
    dedicated Node child provisioning IPC
    real Runner-side SubsystemDataBinding

existing @loomrealm/data peers on both roles
focused M9 vertical
```

---

## 2. Must Not Add

```text
EventBus / ObserverHub / generic authority stream
public Broker service locator
RuntimeDirectory / ConnectionRegistry / ConnectionManager framework
Data application handshake/ready/resume messages
Runtime Control provisioning RPC
Renderer Control provisioning RPC
retry/backoff framework
new generation allocator
InputManager / RenderManager / Store placeholders
BrowserWindow hosting
Content
PWA abstraction solely for symmetry
```

Every new public type must have a real M9 consumer。

---

## 3. Authority Sink Evidence

Must prove：

```text
dataConnections absent keeps M1–M8 paths valid
sink instance is session-scoped
replace(view) is full replacement, synchronous/non-blocking
replace(null) invalidates all Data installability
Renderer acquire request alone cannot authorize install
exact current rendererControlToken required
exact HostedRuntime object required
exact S/G/P required
Main view replacement invalidates pending + current stale material
sink/transport cleanup failure does not fail Runtime/Frame
no second Renderer lease/currentness protocol
```

`rendererControlToken` is correlation only；Broker never treats token possession from a role as authority。

---

## 4. Hostra Provisioner Evidence

Must prove：

```text
one HostedRuntime → one runtime-scoped provisioner
handoff occurs before RuntimeHosting.launch resolves that HostedRuntime
Desktop can exact-map HostedRuntime → provisioner without public registry
Data material absent from RunnerBootstrapV1
provision/prepare/commit/revoke stay Hostra-private
SubsystemDataBinding waits for committed carrier only
Binding acquire is not candidate creation/authority/commit prerequisite
stale ACK/revoke/commit identity-safe
provisioning IPC failure is Data-only
child exit remains existing Runtime failure fact
```

---

## 5. Paired Install / Relay Evidence

Must prove：

```text
Renderer-only prepared → not current
Runner-only prepared → not current
pre-commit child traffic never forwarded
both prepared + exact current Main view → may commit
commit revalidation catches authority/Renderer/Runtime race
concurrent candidates same slot → at most one winner
cutover never exposes two current
Binding waiter may be absent at commit
committed-undelivered carrier can satisfy later acquire
one relay side terminal retires whole pair
retired carrier never current again
late retired traffic cannot affect replacement
Broker relays opaque UTF-8 text without Data parsing
```

---

## 6. Recovery Evidence

Must prove：

```text
Data loss → Runtime/Frame/Renderer Control/Main authority unchanged
same S/G/P may obtain fresh current
proactive same-generation supersede uses same paired commit path
no generation/revision change solely for physical replacement
no resume token
no old message replay
no old unsent migration
fresh role peers/publication baseline
```

---

## 7. Conformance Claim Boundary

M9 MUST NOT claim：

```text
full Renderer ⇄ Subsystem Data Connection v1 cross-platform conformance
PWA platform equivalence
production Runtime-replacement/generation-allocation closure
```

M9 DOES qualify the **Hostra/Desktop physical Broker slice** against every Connection-v1 case applicable to this boundary：

```text
authority exactness / no-authority rejection
candidate boundary
paired readiness/install
commit-time races
cardinality/concurrent winner
cutover
current→retired lifecycle
same-generation recovery
parent Renderer/Session/Runtime invalidation
late/stale traffic isolation
failure-domain isolation
no-message assertions
```

Use a small Broker-level contract harness to drive synthetic sink-view replacement for stale Renderer/Runtime/G/P races that production M9 cannot naturally reach。This harness MUST NOT add fake Runtime restart/generation allocator to Main。

Generation allocation/reuse/exhaustion remains Main authority policy；PWA mapping/equivalence remains later platform work。

---

## 8. Production Vertical Evidence

Production path must prove：

```text
real Main ready-derived S/1/loomrealm.renderer-data/1
real current Renderer acceptance
real DataConnectionAuthoritySink replace
real Hostra HostedRuntime/provisioner handoff
real child IPC
real two-sided Data WS candidate
real paired commit
real M8 Bindings
real RendererDataPeer / SubsystemDataPeer
```

And：

```text
authority removal during establish → stale dispose
Renderer A→B → A Data invalidated
same-generation proactive replacement
same-generation loss recovery
Data failure isolation
Session terminal cleanup
```

BrowserWindow/Input/Render/Content are not required。

---

## 9. Regression Boundary

Keep M1–M8 green, especially：

```text
M6 Hostra Runtime launch/control unchanged when provisioner callback absent
M7 RendererControlBinding signature/currentness unchanged
M8 Main logical DataAuthority policy unchanged
M8 Renderer/Subsystem Binding public signatures unchanged
M8 role terminal→fresh acquire semantics unchanged
@loomrealm/data mechanics unchanged
```

M9 extends Main→Platform physical facts；it does not reopen Frozen Data application contracts。

---

## 10. Implementation Checklist

```text
[ ] DataConnectionAuthoritySink exact minimal surface implemented
[ ] MainPlatform.dataConnections optional
[ ] Main serialized full-view replace/null implemented
[ ] exact Renderer token + HostedRuntime + S/G/P revalidation proven

[ ] HostraRuntimeDataProvisioner implemented
[ ] runtime→provisioner handoff before launch resolution
[ ] Runner provisioning IPC implemented
[ ] committed-undelivered Subsystem carrier supported

[ ] two-sided local Data WS candidate implemented
[ ] pre-commit forwarding forbidden
[ ] per-S serialized commit / 0..1 current proven
[ ] committed carrier delivery independent from acquire waiter
[ ] whole-pair retirement proven

[ ] authority/Renderer/Runtime race cases pass
[ ] proactive same-generation cutover passes
[ ] loss same-generation recovery passes
[ ] no replay/resume passes
[ ] Data failure isolation passes

[ ] Broker contract harness covers applicable Connection-v1 cases
[ ] no full cross-platform conformance claim
[ ] npm run test:m9 passes
[ ] M6–M8 regressions pass
[ ] docs build/link checks pass
```

---

## 11. Documentation Closure After Implementation

After qualification update：

```text
doc/30-implementation/m9-qualification.md
README current implementation status
phase-1-delivery-plan M9 status
Hostra/Desktop module status
```

Do not modify Frozen Data contracts unless implementation demonstrates a real contradiction。

---

## 12. Freeze Gate

**Gate status: CLOSED.**

All authority and physical handoff arrows now have an explicit implementation seam。Coding-time freedom is limited to private Desktop/Hostra layout、candidate naming、IPC encoding and WS adapter details that preserve the above behavior。

Reopen only for demonstrated contract contradiction or inability of a real M9 consumer to use these exact minimal seams；not for framework reuse、future PWA symmetry or test convenience。
