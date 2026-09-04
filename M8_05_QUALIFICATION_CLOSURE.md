# M8 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：05  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md) → [M8 / 02](M8_02_DATA_BINDINGS.md) → [M8 / 03](M8_03_DATA_ROLE_INTEGRATION.md) → [M8 / 04](M8_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md) · [Profile Conformance](doc/15-contracts/renderer-data-profile-conformance-v1.md)  
> 目标：定义唯一 M8 implementation qualification matrix；关闭 DataAuthority + role-facing current Data lifetime，不提前吸收 M9 Broker、M10 Input 或 M11 Render。

> **M8 closure = Main 产生 logical DataAuthority；Renderer/Subsystem 通过窄 Binding 消费 Platform 已决定可交付的 paired current carrier；real `@loomrealm/data` peers 具备确定的 install/retire/teardown/failure semantics。Data failure不改变 Runtime/Frame/Control authority。**

---

## 1. M8 Closure Scope

Must implement：

```text
@loomrealm/main
    DataAuthority allocation/revocation
    generation/profile policy
    atomic Runtime/DataAuthority visible commit
    non-empty Renderer Snapshot projection

@loomrealm/platform-ports
    RendererDataBinding
    SubsystemDataBinding
    frozen settlement / terminal fan-out semantics

@loomrealm/subsystem/host
    optional Data Binding
    non-blocking acquire
    current peer lifetime
    ready-exit teardown
    construction-failure isolation

@loomrealm/renderer
    construction-time optional RendererDataBinding
    Control-driven non-blocking reconciliation
    per-subsystem current/pending state
    Renderer-wide acquisition-terminal fan-out

real @loomrealm/data peers on both roles

deterministic paired MemoryCarrier vertical
```

Not M8：

```text
Desktop DataConnectionBroker / ticket / Runner provisioning IPC / Data WS
PWA MessageChannel provisioning
Platform authority-feed / candidate authentication
paired commit-time Main revalidation / serialized physical cutover
InputManager / Input producer/listener/effective gate
RenderManager / Render Store / Domain API
Content
Hostra/PWA physical equivalence
```

---

## 2. Abstraction Budget

Allowed because there is a real consumer：

```text
one generation high-water fact per subsystem in Main
one generation fact on current Runtime instance
RendererDataBinding
SubsystemDataBinding
Subsystem current peer + one pending acquire + acquisition-terminal fact
Renderer per-subsystem current peer + pending acquire
one Renderer-wide acquisition-terminal fact
one construction-time optional RendererDataBinding seam
small deterministic paired Binding fixture
```

Forbidden：

```text
DataAuthorityManager
DataConnectionRegistry framework
GenericDataBinding / UniversalConnection
public DataConnectionBroker interface in M8
ReconnectManager / retry scheduler
BindingError hierarchy
Data Store / ObserverHub / EventBus
InputManager / RenderManager placeholders
second shared DataCurrentBinding DTO
transport endpoint/ticket DTO in role packages
application replay/resume cursor
lease/heartbeat/currentness protocol
Data-specific cleanup scheduler/deadline
```

---

## 3. Main Evidence

Must prove：

```text
not-ready → no DataAuthority
normal ready transition → Runtime=ready + S/G1/P in one visible commit
no normal ready/no-authority intermediate Snapshot
normal ready exit → non-ready + no authority in one visible commit
no non-ready Snapshot with stale DataAuthority
logical authority commit advances Renderer revision exactly once
Data transport loss/reconnect alone does not change Main authority/revision
fresh Runtime same S uses G2 > G1
Renderer replacement alone keeps G
no generation reuse/wrap
generation exhaustion creates no fresh authority and does not fail Runtime/Frame
projection ordering deterministic but carries no authority semantics
no physical material / shadow Data authority registry
```

---

## 4. Binding Evidence

Must prove：

```text
Renderer acquire is exact S/G/P driven
Subsystem Binding is Runtime-scoped and returns only G/P + carrier
one logical pair → two matching role endpoints
M8 does not claim Platform/Main authority-feed or commit-time revalidation
pending acquire creates no role current state
transient physical provisioning failure may remain internal while acquire stays pending
abort prevents late installation
surfaced non-abort rejection terminalizes acquisition capability
Renderer first rejection aborts all other pending acquires + blocks all future acquire
Renderer Binding terminal does not retire already-current peers or Control solely for that cause
Subsystem Binding terminal blocks future acquire but does not fail Runtime/Frame or retire current peer solely for that cause
successful peer terminal may trigger one fresh same-authority acquire only while acquisition healthy
Binding absence remains valid
platform-ports remains Foundation-only
```

Binding does not authenticate/mint Main authority and does not parse Data application messages。

---

## 5. Subsystem Role Evidence

Must prove：

```text
Binding absent keeps Runtime/Frame path green
ready + Binding installs real SubsystemDataPeer
pending acquire does not block Runtime Control / Frame handling
late/stale acquire is closed, not installed
old peer terminal cannot clear replacement peer
Data terminal does not fail Runtime/Frame
same-generation fresh carrier creates fresh peer without replay
leaving ready synchronously clears Data currentness
leaving ready aborts pending acquire + retires current peer + starts no fresh acquire
late acquire after shutdown/fatal cannot install
Data cleanup reuses existing terminalCleanupDeadlineMs
Data cleanup failure/time limit never replaces primary graceful/fatal Runtime result
trusted-integration/peer-construction failure closes carrier, installs nothing, latches acquisition terminal, no Runtime/Frame failure
```

---

## 6. Renderer Role Evidence

Must prove：

```text
construction-time optional RendererDataBinding only
no mutable registration/service locator/RendererPlatform
Snapshot add S/G/P → start acquire without blocking later Control states
remove/replace authority → abort pending + retire current
G1→G2 cannot install late G1 result
same exact S/G/P installed/pending is kept, not duplicated
Control A→B aborts/retires all A Data
old Control/Data late terminal/result cannot affect B
Data terminal alone keeps Control current
same-generation fresh carrier supported
one surfaced Binding rejection latches Renderer-wide acquisition terminal
Binding rejection aborts every other pending acquire + blocks all future acquire
Binding rejection preserves unrelated current peers + Control solely for that cause
peer-construction failure has same acquisition-terminal isolation
Binding absent keeps M7 holder semantics
```

Role MUST NOT duplicate `@loomrealm/data` reader/writer/schema/terminal mechanics。

---

## 7. Vertical Evidence

Production role path：

```text
Main Runtime lifecycle commit
→ Main DataAuthority commit
→ real Renderer Control publication
→ Renderer Binding acquire
+
Subsystem Binding acquire
→ deterministic already-current paired MemoryCarrier seam
→ real RendererDataPeer / SubsystemDataPeer
```

M8 vertical does not prove how Platform gets Main-authoritative `S/G/P` or performs candidate install revalidation；that is M9 evidence。

Must cover：

```text
normal atomic ready + DataAuthority publication
normal atomic ready-exit + authority removal
initial Data installation
late G1 acquire after revoke
same-generation carrier loss/replacement
G1→G2 Runtime replacement
Renderer A→B same-G replacement
Subsystem graceful/fatal teardown
Renderer multi-slot Binding-terminal fan-out
Subsystem Binding terminal
trusted-integration construction failure on both roles
Binding absence
Session terminal
Data failure isolation
Control/Runtime remain non-blocking while Data acquire pending
```

Tests MUST NOT write Main private authority、construct current Renderer Snapshot manually or inject role current peer directly。

---

## 8. `@loomrealm/data` Evidence Boundary

Existing package-local tests stay green：

```text
single reader
single serialized writer
static role direction/routing
terminal first-wins
no retry/replay
fresh peer has no inherited reader/writer state
```

M8 adds real role-consumer/lifecycle evidence only。

Still deferred：

```text
fresh Desired Interest republish
Input State/Event/Reset effective semantics
fresh Render domains/snapshot baseline
Render revision/patch/event stateful semantics
Hostra WebSocket vs PWA MessagePort abstract profile equivalence
```

Therefore M8 completion MUST NOT be described as “Renderer Data Profile fully conformant”。Concrete product Data capability is not qualified until M10/M11 plus platform milestones complete their obligations。

---

## 9. Dependency Evidence

```text
@loomrealm/platform-ports depends on:
    @loomrealm/foundation

@loomrealm/data depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/main depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/wire

@loomrealm/subsystem/host depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/data

@loomrealm/renderer depends on:
    @loomrealm/renderer-control
    @loomrealm/platform-ports
    @loomrealm/data
```

Forbidden：Main↔Renderer reverse dependency、role→concrete Platform、platform-ports→protocol/role。

---

## 10. Regression Evidence

Keep M1–M7 green, especially：

```text
M6 Hostra Runtime-only path needs no fake Data Binding
M7 Renderer Control capability absence/presence/replacement unchanged
Renderer Control DataAuthority representation remains exact
Data acquisition/peer/cleanup failure cannot become Runtime failure
Frame call/return/unwind ordering unchanged
Session terminal remains outer cleanup authority
Renderer Control consumption is never blocked by Data provisioning
Subsystem Runtime Control/Frame processing is never blocked by Data provisioning
@loomrealm/data package-local tests remain green
```

---

## 11. Implementation Checklist

```text
[ ] Main generation high-water implemented
[ ] profile fixed to loomrealm.renderer-data/1
[ ] ready transition commits Runtime+DataAuthority atomically for Renderer visibility
[ ] ready exit commits Runtime+revocation atomically for Renderer visibility
[ ] generation exhaustion no-wrap/no Runtime-Frame failure
[ ] Data transport loss/reconnect leaves Main authority/revision unchanged

[ ] RendererDataBinding implemented
[ ] SubsystemDataBinding implemented
[ ] pending/abort settlement implemented
[ ] transient internal provisioning failure may leave acquire pending
[ ] Renderer Binding terminal fan-out implemented
[ ] Binding terminal preserves already-current peers solely for that cause
[ ] no generic Binding/Broker/error framework

[ ] Subsystem optional Data integration implemented
[ ] pending acquire non-blocking
[ ] ready-exit teardown implemented
[ ] teardown reuses terminalCleanupDeadlineMs
[ ] cleanup failure does not replace Runtime result
[ ] Subsystem construction-failure isolation implemented

[ ] Renderer construction-time optional Binding seam implemented
[ ] Control-driven reconciliation implemented
[ ] reconciliation non-blocking
[ ] stale acquire/current terminal identity-safe
[ ] Control parent terminal retires all child Data
[ ] Renderer acquisition-terminal fan-out implemented
[ ] Renderer construction-failure isolation implemented
[ ] Data terminal never clears Control

[ ] deterministic paired MemoryCarrier vertical passes
[ ] same-generation fresh carrier passes
[ ] G1→G2 replacement passes
[ ] Renderer A→B same-G replacement passes
[ ] Subsystem teardown trace passes
[ ] multi-slot Binding-terminal trace passes
[ ] trusted-integration failure traces pass
[ ] capability-absent paths pass

[ ] no InputManager/RenderManager/Store placeholder framework
[ ] M1–M7 regression green
[ ] build/type/test/pack clean
```

---

## 12. Documentation Closure After Implementation

After qualification, record implementation evidence in：

```text
doc/30-implementation/m8-qualification.md
README current implementation status
phase-1-delivery-plan M8 status
package/module docs current status
```

Frozen contracts and this preimplementation design do not change merely because implementation completed。

---

## 13. Implementation Freeze Gate

**Gate status: CLOSED.**

The M8 implementation may proceed without another architecture-design pass。Coding-time choices are limited to ordinary private layout/naming that preserve the frozen observable semantics above。

Reopen M8 design only if：

```text
1. implementation reveals a direct contradiction with a Frozen contract; or
2. a real M8 consumer cannot be implemented without changing an observable seam frozen here.
```

The following are NOT reopen reasons：

```text
wanting symmetry
future M9/M10/M11 convenience
reducing a few call sites
test-only convenience
adding generic framework/registry/service abstractions
```

M8 closes logical DataAuthority + role-facing current Data lifecycle only。Endpoint/ticket/IPC/WebSocket、Input business state、Render business state and cross-platform physical equivalence remain in their later milestones。
