# M8 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：05  
> 最近复核：2026-09-04  
> 前置：[M8 / 01](M8_01_MAIN_DATA_AUTHORITY.md) → [M8 / 02](M8_02_DATA_BINDINGS.md) → [M8 / 03](M8_03_DATA_ROLE_INTEGRATION.md) → [M8 / 04](M8_04_VERTICAL_INTEGRATION.md)  
> 正式契约：[Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md) · [Profile Conformance](doc/15-contracts/renderer-data-profile-conformance-v1.md)  
> 目标：定义唯一 M8 implementation qualification matrix；关闭当前可达的 DataAuthority + role-facing current Data peer lifecycle，不提前吸收 Runtime restart、M9 Broker、M10 Input 或 M11 Render。

> **M8 closure = Main 从 current Runtime authority 直接投影 `S/1/loomrealm.renderer-data/1`；Renderer/Subsystem 通过窄 Binding 消费 Platform 已决定可交付的 paired carrier；real `@loomrealm/data` peers 具备确定的 local install/clear/close/failure semantics。**

---

## 1. M8 Closure Scope

Must implement：

```text
@loomrealm/main
    Runtime-ready-derived DataAuthority
    fixed generation=1 / profile policy
    atomic Runtime/DataAuthority visible projection

@loomrealm/platform-ports
    RendererDataBinding
    SubsystemDataBinding
    exact frozen public names/fields

@loomrealm/subsystem/host
    optional Data Binding
    non-blocking acquire
    local current peer lifetime
    ready-exit cleanup
    host-lifetime acquire-failure isolation

@loomrealm/renderer
    exact createRendererControlHolder(data?) seam
    Control-driven non-blocking reconciliation
    per-subsystem current/pending/failed-desired state
    no cross-slot failure coupling

real @loomrealm/data peers on both roles

deterministic paired MemoryCarrier vertical
```

Not M8：

```text
same-key Runtime restart/replacement inside one Session
multiple Runtime instances per key
generation allocator/high-water/exhaustion implementation
Desktop DataConnectionBroker / ticket / Runner provisioning IPC / Data WS
PWA MessageChannel provisioning
Platform authority-feed / candidate authentication
paired commit-time Main revalidation / serialized physical cutover
InputManager / Input producer/listener/effective gate
RenderManager / Render Store / Domain API
Content
Hostra/PWA physical equivalence
```

Frozen Data Connection generation monotonicity remains authoritative if a future milestone introduces a second same-Session DataAuthority epoch；M8 does not prebuild unreachable machinery for it。

---

## 2. Abstraction Budget

Allowed because current consumers require them：

```text
RendererDataBinding
SubsystemDataBinding
Subsystem current peer + one pending acquire + acquisitionStopped fact
Renderer per-subsystem current peer + pending acquire + failed desired identity
one exact construction-time RendererDataBinding argument
small deterministic paired Binding fixture
```

Main adds no Data-specific mutable authority state in M8。

Forbidden：

```text
generation allocator / high-water Map / exhaustion state
DataAuthorityManager
DataConnectionRegistry framework
GenericDataBinding / UniversalConnection
public DataConnectionBroker interface in M8
Renderer-wide Data acquisition terminal
ReconnectManager / retry scheduler
BindingError hierarchy
Data Store / ObserverHub / EventBus
InputManager / RenderManager placeholders
second shared DataCurrentBinding DTO
transport endpoint/ticket DTO in role packages
application replay/resume cursor
lease/heartbeat/currentness protocol
Data-specific cleanup scheduler/deadline
RendererPlatform / RendererServices / service locator
```

---

## 3. Main Evidence

Must prove：

```text
not-ready Runtime → no DataAuthority
ready commit → Runtime=ready + S/1/loomrealm.renderer-data/1 in one visible commit
no normal ready/no-authority intermediate Snapshot
ready exit → Runtime non-ready + no authority in one visible commit
no non-ready Snapshot with stale DataAuthority
all M8 generations exactly 1
ordinary Frame/Activation changes do not change S/1/P
Renderer replacement keeps S/1/P
Data transport loss/reconnect does not change Main authority/revision
projection deterministic; ordering carries no authority semantics
no generation allocator/history/DataAuthority shadow registry
```

M8 MUST NOT manufacture a fake same-key Runtime replacement path merely to test future G2 semantics。

---

## 4. Binding Evidence

Must prove：

```text
exact RendererDataBinding / SubsystemDataBinding / SubsystemDataBindingResult public surfaces
Renderer acquire exact S/G/P driven
Subsystem Binding Runtime-scoped and returns only G/P + carrier
one logical pair → two matching role endpoints
M8 does not claim Platform/Main authority-feed or commit-time revalidation
pending acquire creates no role current state
transient physical provisioning failure may remain internal while acquire stays pending
abort prevents late installation
Renderer non-abort rejection suppresses only same Control-peer+S/G/P desired identity
Renderer S1 failure does not alter S2/S3 current/pending work
new Control peer or changed authority clears obsolete Renderer failure fact
Subsystem non-abort rejection stops future acquire only for that host lifetime
acquire failure alone does not close existing current peer or parent authority
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
late/stale acquire closes carrier and cannot install
old peer terminal cannot clear replacement peer
Data terminal does not fail Runtime/Frame
same-generation fresh carrier creates fresh peer without replay
leaving ready synchronously clears local Data current identity
leaving ready aborts pending + best-effort closes peer + starts no fresh acquire
late acquire after shutdown/fatal cannot install
cleanup reuses terminalCleanupDeadlineMs
cleanup failure/time limit never replaces primary Runtime result
Binding rejection/construction failure stops future acquire for host lifetime without Runtime/Frame failure
```

Role code owns local peer identity/close request, not Platform Connection `current→retired` authority。

---

## 6. Renderer Role Evidence

Must prove：

```text
public signature exactly createRendererControlHolder(data?: RendererDataBinding)
no alternative options object / mutable registration / service locator
Snapshot add S/1/P → start acquire without blocking later Control states
remove authority → abort pending + clear local current + best-effort close peer
same exact desired authority current/pending is not duplicated
late stale acquire is closed
Control A→B clears/closes all A Data and stale failure facts
old Control/Data late terminal/result cannot affect B
Data terminal alone keeps Control current
same-generation fresh carrier supported
one slot rejection records only slot-local failed desired identity
S1 failure leaves independent S2/S3 work untouched
Control/authority change makes old failed identity obsolete and allows one fresh attempt
peer-construction failure uses same slot-local isolation
Binding absent keeps M7 holder semantics
```

Role MUST NOT duplicate `@loomrealm/data` reader/writer/schema/terminal mechanics。

---

## 7. Vertical Evidence

Production role path：

```text
Main Runtime ready commit
→ Main DataAuthority S/1/P
→ real Renderer Control publication
→ Renderer Binding acquire
+
Subsystem Binding acquire
→ deterministic already-current paired MemoryCarrier seam
→ real RendererDataPeer / SubsystemDataPeer
```

Must cover：

```text
atomic ready + S/1/P publication
atomic ready-exit + authority removal
initial Data installation
late acquire after authority removal
same-generation carrier loss/replacement
Renderer A→B same-generation replacement
Subsystem graceful/fatal cleanup
Renderer multi-slot acquire-failure isolation
Subsystem Binding rejection
trusted-integration construction failure on both roles
Binding absence
Session terminal
Data failure isolation
Control/Runtime remain non-blocking while Data acquire pending
```

Must NOT cover by inventing production state：

```text
G1→G2 same-key Runtime replacement
generation exhaustion
profile replacement
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

Therefore M8 completion MUST NOT be described as “Renderer Data Profile fully conformant”。

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
Data acquire/peer/cleanup failure cannot become Runtime failure
Frame call/return/unwind ordering unchanged
Session terminal remains outer cleanup authority
Renderer Control consumption never blocks on Data provisioning
Subsystem Runtime Control/Frame processing never blocks on Data provisioning
@loomrealm/data package-local tests remain green
```

---

## 11. Implementation Checklist

```text
[ ] Main ready projection yields generation=1 / fixed profile
[ ] ready transition publishes Runtime+DataAuthority atomically
[ ] ready exit publishes Runtime+authority removal atomically
[ ] no generation allocator/high-water/exhaustion state added
[ ] Data transport loss/reconnect leaves Main authority/revision unchanged

[ ] exact RendererDataBinding surface implemented
[ ] exact SubsystemDataBinding/Result surface implemented
[ ] pending/abort settlement implemented
[ ] no generic Binding/Broker/error framework

[ ] Subsystem optional Data integration implemented
[ ] pending acquire non-blocking
[ ] ready-exit clear/abort/close implemented
[ ] cleanup reuses terminalCleanupDeadlineMs
[ ] acquire/construction failure stops host-lifetime acquisition only

[ ] Renderer exact createRendererControlHolder(data?) signature implemented
[ ] Control-driven reconciliation implemented
[ ] reconciliation non-blocking
[ ] stale acquire/current terminal identity-safe
[ ] per-slot failed desired identity implemented
[ ] no Renderer-wide acquisition terminal
[ ] S1 failure isolation from S2/S3 proven
[ ] Control/authority change clears stale failure fact
[ ] Data terminal never clears Control

[ ] deterministic paired MemoryCarrier vertical passes
[ ] same-generation fresh carrier passes
[ ] Renderer A→B same-generation passes
[ ] Subsystem cleanup trace passes
[ ] multi-slot failure-isolation trace passes
[ ] trusted-integration failure traces pass
[ ] capability-absent paths pass

[ ] no fake G2/restart/exhaustion qualification
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

Frozen contracts do not change merely because implementation completed。

---

## 13. Implementation Freeze Gate

**Gate status: CLOSED.**

M8 may proceed without another architecture-design pass。Coding-time freedom is limited to private layout/naming that preserves the exact public seams and observable semantics above。

Reopen only if：

```text
1. implementation reveals a direct contradiction with a Frozen contract; or
2. a real M8 consumer cannot be implemented through the frozen seams.
```

Not reopen reasons：

```text
future Runtime restart convenience
future M9/M10/M11 convenience
wanting type symmetry
reducing a few call sites
test-only convenience
generic framework/registry/service abstractions
```

M8 closes the current Phase 1 logical DataAuthority + role-facing current Data peer slice with the minimum state required by reachable behavior。
