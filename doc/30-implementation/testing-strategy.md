# 测试策略

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：Game/Platform PREPARE、protocol mechanics、role authority、Runner/provisioning、Desktop Data Broker、Hostra/PWA equivalence 与 E2E qualification  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[独立分包与发布架构](./package-architecture.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-09-04

测试目标不是“消息能通”，而是证明每一层不能绕过 authority、lifecycle、failure-domain、PREPARE 和 package boundary invariant。

---

## 1. Test Layers

```text
Game document
→ Game Package validation
→ matching Launcher PREPARE
→ LogicalGameBootstrap
→ Main logical authority

Foundation/Wire
→ Runtime Control / Renderer Control / Data protocol mechanics
→ role integrations

Main physical authority facts
→ Platform bindings / Runner provisioning
→ Desktop/PWA Broker realization
→ business Input/Render/Content
→ full E2E / cross-platform equivalence
```

Nearest owner owns nearest tests。No giant E2E replaces package/role/conformance evidence。

---

## 2. Unified Carrier Model

Current message-oriented application carriers use：

```text
one carrier unit = one UTF-8 JSON text string
```

Adapter tests cover boundary/order/close/loss/no duplicate。Foundation tests treat messages opaquely；protocol packages test JSON/wire semantics。

No application retry/duplicate is introduced by adapters。

---

## 3. Game Package / Launcher PREPARE

Game Package tests：schema/keys/immutable detached snapshot/error boundary/dependency boundary。

Hostra/PWA Launcher tests：

```text
matching Game source consumption
own manifest validation
exact Game↔Platform key-set join
safe module resolution
all required executable bindings prepared before first Runtime side effect
Host policy cannot be selected by Game manifest
LogicalGameBootstrap contains logical fields only
```

Every PREPARE negative case proves zero Runner/Worker/business import/Runtime Control establishment。

---

## 4. Runtime Control Mechanics

Package-local tests retain direct evidence for：

```text
one carrier reader/dispatcher
one serialized writer
strict monotonic shared sender ID namespace
closed representation/limits
hello/version/auth callback boundary
Frame exact method/direction schemas
Response-before-dependent-action barrier
deadline covers send + response wait
terminal first-wins
no retry/replay/reconnect
```

Main/Subsystem tests own application authority mapping；Runtime Control fixtures must not duplicate it。

---

## 5. Frozen Frame Authority

Independent tests remain required for：

```text
ACK-before-publication
post-commit no rollback
accepted outcome preserved
ambiguous mutation → Runtime failure
whole-suffix fixed-point unwind
fresh surviving Caller resume
```

Renderer/Data changes cannot weaken these gates。

---

## 6. Subsystem Host / Main Role Tests

Subsystem host tests：business lifecycle、Frame continuation/gating、Runtime failure isolation and M8 Data peer lifecycle。

Main tests through M8：logical bootstrap、Runtime authority、Frame/Stack/Activation/InputTarget、Renderer projection/currentness、ready-derived DataAuthority、Session terminal。

M9 extends Main tests only with the physical authority sink projection; it does not move Broker state into Main。

---

## 7. Renderer Control / Renderer Role

Renderer Control package tests own hello/version/Snapshot/publication/terminal mechanics。

Main tests own token/currentness/replacement/revision。Renderer tests own local `{peer,snapshot}` current mirror and M8 per-subsystem Data reconciliation。

Physical Hostra/PWA RendererControlBinding tests remain M14/M16；M9 deterministic physical Renderer hosting must still use real protocol peers/Main acceptance。

---

## 8. `@loomrealm/platform-ports` Through M9

Declaration/boundary tests must prove：

```text
runtime dependency exactly @loomrealm/foundation
exact exported M4–M9 names/fields
no protocol/role/concrete Platform dependency
no public Broker/registry/event/service surface
```

M9 exact exports：

```text
DataConnectionAuthorityEntry
DataConnectionAuthorityView
DataConnectionAuthoritySink
```

Behavioral sink ordering/non-throwing semantics are qualified by real Main producer + Desktop consumer tests, not a fake state machine inside platform-ports。

---

## 9. Main M9 Authority Sink Tests

Required：

```text
dataConnections absent → all M1–M8 paths unchanged
sink present → initial replace(null)
non-null only while exact current Renderer exists
accepted Renderer token remains auth-consumed
current token retained only as inert physical correlation
current retained token participates in duplicate opaque-material defense
full view entries exact/unique/deterministic
entry runtime is exact HostedRuntime object
Runtime ready/non-ready/DataAuthority changes refresh full view
Renderer A→B changes full view in same serialized current switch
current Renderer terminal → replace(null)
Session terminal → replace(null) before async cleanup
sink replacement alone does not bump Renderer revision
```

Use a conforming fake sink that records calls and never throws/blocks。Do not build EventBus/observer infrastructure for tests。

---

## 10. `DataConnectionAuthoritySink` Consumer Contract

Desktop sink tests directly prove：

```text
replace(view|null) is synchronous
replace is non-blocking
replace never throws
replace performs no network/IPC wait
latest in-memory view changes before physical cleanup work
stale pending candidates become non-installable synchronously
stale current pairs lose current status synchronously
physical close may settle later without restoring authority
```

An intentionally throwing sink is tested only as a **non-conforming provider example** if useful; no Main Runtime/Frame recovery semantics are specified for that contract violation。

---

## 11. Hostra Runtime Provisioner Tests — M9

`@loomrealm/game-launcher-hostra` tests：

```text
hook omitted → M6 RuntimeHosting behavior unchanged
one successful HostedRuntime → one provisioner
hook fires before RuntimeHosting.launch resolves exact HostedRuntime
hook throw → launch fails closed and spawned child converges
Data endpoint/ticket absent from RunnerBootstrapV1
prepare connects exact Data WS + keeps carrier role-private
prepared ACK exact candidate identity
commit called only after Broker logical install in integration trace
commit resolves after exact committed ACK/current-deliverable acceptance
revoke non-blocking/non-throwing/identity-safe
stale prepared/committed/revoke cannot affect newer candidate
provisioning IPC terminal may disable Data while Runtime Control remains healthy
child exit remains existing Runtime termination fact
```

No generic RPC/provisioning framework test fixture。

---

## 12. Desktop Broker Contract Harness — M9

`apps/desktop` owns a small authority/candidate harness driven by frozen sink views。

Required authority cases：

```text
no authority cannot install
wrong S/G/P cannot install
wrong Renderer token cannot install
wrong exact HostedRuntime object cannot install
view replacement during establish rejects stale candidate
```

Candidate/install cases：

```text
Renderer-only prepared not current
Runner-only prepared not current
both prepared exact binding may install
pre-install child bytes rejected/disposed
same-slot concurrent candidates → at most one winner
different subsystem slots independent
old/new current never overlap
retired old never current again
```

---

## 13. Desktop Two-sided Data WebSocket Tests

Concrete candidate topology：

```text
Renderer WS ─┐
             ├─ opaque Broker relay
Runner WS   ─┘
```

Tests：

```text
loopback only
fresh one-time role-specific capability
single intended connection per candidate side
relay gate closed before install
Broker parses no Data application JSON
UTF-8 text message boundaries preserved
read failure on either side retires whole pair
write failure on either side retires whole pair
late retired bytes dropped
late retired send completion cannot affect replacement
```

---

## 14. Installation vs Post-install Delivery Tests

This distinction is a required M9 regression gate。

Normal：

```text
both sides prepared
→ latest Main-view revalidation
→ old current retires
→ B becomes sole current
→ Renderer delivery
→ Runner commit notification/ACK
```

Failure trace：

```text
A current
→ B installs current / A retires
→ Runner post-install commit delivery rejects
→ B current→retired
→ B close/revoke
→ A never resurrects
→ Runtime/Frame/Main DataAuthority unchanged
```

Tests MUST fail implementations that classify this as pre-install candidate failure or restore A。

---

## 15. Same-generation Physical Replacement — M9

Proactive：

```text
A current
→ B prepared under same S/G/P without Binding waiter
→ B installs / A retires
→ old role peers terminal
→ fresh M8 acquire receives B if still deliverable
```

Loss recovery：

```text
A physical loss
→ A retired
→ Main authority unchanged
→ fresh B may install same S/G/P
```

Required negatives：

```text
no generation change
no rendererRevision change solely for replacement
no resume token
no old emitted replay
no old unsent queue migration
```

M9 asserts a fresh Data peer/connection-local boundary only。

---

## 16. M10 User Input Baseline — Not M9

Fresh Data current User Input cases belong to M10：

```text
fresh Desired Interest publication
fresh State/Event/Reset effective semantics
no old input state/event inheritance
Activation/InputTarget/Interest/Producer gate
```

These tests may reuse the M9 physical carrier but MUST NOT be counted toward M9 qualification。

---

## 17. M11 Render Baseline — Not M9

Fresh Data current Render cases belong to M11：

```text
fresh authoritative domain snapshot baseline
revision/patch/event semantics
no old replica cursor inheritance
Frame close/suspend independence from Render Domain lifetime
```

These are not M9 Broker completion criteria。

---

## 18. M9 Production Vertical

Must compose production：

```text
Hostra PREPARE
real Main Session
real Node Runner + Runtime Control WS
real Subsystem host
real Renderer Control peers/Main acceptance
real DataConnectionAuthoritySink
real Hostra provisioner + child IPC
real two-sided Data WS
real M8 Bindings
real Renderer/Subsystem Data peers
```

Only physical Renderer hosting/bootstrap may be deterministic/test。

Vertical covers：initial install、authority removal race、Renderer replacement、same-generation proactive replacement/loss recovery、post-install delivery failure、Session terminal cleanup。

---

## 19. M9 Conformance Claim Boundary

M9 qualifies the Hostra/Desktop physical Broker slice for applicable Data Connection v1 cases。

Not M9 closure：

```text
production generation allocation/replacement/exhaustion
M10 Input business fresh publication baseline
M11 Render business fresh publication baseline
PWA platform mapping / Hostra-PWA equivalence
```

Do not label M9 as full Data Connection v1 cross-platform qualification。

---

## 20. Content / Execution Boundary

Content tests must keep logical readonly Content capability separate from executable resolution/Runner authority and keep Runtime/Data/Content credentials independent。

---

## 21. Cross-platform Equivalence

Hostra/PWA equivalence compares normalized logical/protocol/application outcomes, not PID/Worker/WS/Port/IPC specifics。

M9 does not perform this final Data equivalence; M16 must map PWA Data Broker and compare required abstract traces after M10/M11/M12 product semantics are available。

---

## 22. E2E PREPARE Gate

Every full E2E includes invalid Game/Platform binding/module/capability cases and proves no business Runtime side effect before PREPARE failure。

M14 Desktop E2E additionally composes M9/M10/M11/M12 with physical BrowserWindow/Renderer Control。

---

## 23. Test Ownership Rule

```text
low-level carrier/JSON representation
    → Foundation / Wire

protocol mechanics
    → owning protocol package

role authority/control-flow
    → Main / Renderer / Subsystem tests

shared port declaration
    → platform-ports

Hostra child ownership/provisioning
    → game-launcher-hostra

Desktop Broker/WS physical Data lifecycle
    → apps/desktop

Input/Render business baseline
    → M10/M11 role tests

same abstract semantics across platforms
    → platform equivalence tests

full user-visible chain
    → E2E
```

---

## 24. Root Gates

Existing gates remain green。M9 adds：

```text
npm run test:m9
```

It MUST compose：

```text
platform-ports M9 boundary tests
Main M9 sink tests
Hostra provisioner/IPC tests
Desktop Broker contract harness
M9 production vertical
```

And retain：

```text
npm run test:m8
npm run test:game-launcher-hostra
npm run test:packages
npm run docs:build
npm run docs:check-links
```

---

## 25. Final Test Invariants

1. document/Launcher PREPARE tests prove zero premature Runtime side effects；
2. protocol packages test mechanics, not role authority；
3. role packages test committed authority/control-flow；
4. M9 Main sink tests prove exact full-view projection with no second authority registry；
5. sink consumer tests prove non-blocking/non-throwing synchronous invalidation；
6. Hostra provisioner tests prove exact Runtime handoff and Data-vs-Runtime failure isolation；
7. Desktop Broker tests prove paired-before-current、single-current、no rollback/resurrection、whole-pair retirement；
8. M9 same-generation replacement proves no replay/resume/generation/revision mutation；
9. M10/M11, not M9, qualify fresh Input/Render business publication baselines；
10. cross-platform equivalence is claimed only after both physical mappings and application slices are present；
11. no generic RPC/authority/event/connection/transaction/retry framework is introduced for testing convenience。
