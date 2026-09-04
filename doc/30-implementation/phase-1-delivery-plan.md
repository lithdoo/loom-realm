# 第一阶段交付计划

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：M0..M16 实现顺序、Game/Launcher/Main bootstrap boundary、Runtime Control mechanics、Renderer/Data/Input/Render/Content capability 与 Desktop/PWA qualification  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[仓库与目录方案](./repository-layout.md)、[测试策略](./testing-strategy.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-09-04

核心顺序：

```text
lowest stable primitives
→ common Game document validation
→ Runtime Control protocol mechanics
→ Subsystem Runtime/Frame role slice
→ Main logical bootstrap + authority
→ Hostra Runtime physical vertical
→ Renderer Control logical mirror vertical
→ Data logical role seam
→ Desktop Data physical Broker/provisioning core
→ Input/Render/Content capability slices
→ Desktop full physical E2E
→ PWA physical vertical/equivalence
```

Current first implementation直接收口；不做 fake v2 / compatibility parser。

### Milestone interpretation rule

```text
Package Scope
!= Current Implementable Slice
!= Milestone Closure
```

Priority：system architecture → package boundary → accepted/frozen ADR + formal contract → milestone slice。

---

## M0：文档与契约基线

Current docs must agree on Game Package v1、Runtime Control Profile v1、Frame/Call v1、Renderer Control v1、Renderer Data/Data Connection/Input/Render contracts and current Platform composition boundaries。

Closed：no Main→game-package、no Game Descriptor.module、no universal launcher options、no generic RPC/connection framework、no second JSON parser。

---

## M1：Foundation + Wire ✅

Implemented Baseline：MessageCarrier/MemoryCarrier + JSON/JSON-RPC representation/limits primitives。

---

## M2：Game Package v1 ✅

Implemented document validation/snapshot capability；Runtime dependency Wire only。M6 Hostra is the first real Runtime-product consumer；M15 PWA is the second。

---

## M3：Runtime Control Mechanics ✅

Implemented concrete one-reader/one-writer Control+Frame mechanics、strict monotonic IDs、deadlines、terminal first-wins、no retry/replay/reconnect。Real role consumers qualified in M4/M5。

---

## M4：Subsystem Runtime/Frame Core ✅

Closed `@loomrealm/subsystem` Runtime/Frame host slice。Input/Render/Content remain M10/M11/M12；M8 later added role-local Data peer integration。

---

## M5：Main Core + LogicalGameBootstrap ✅

Implemented Main Runtime/Frame authority、RuntimeHosting consumption、Stack/Activation/InputTarget、serialized mutation、failure unwind and Session terminal。

---

## M6：Hostra Platform Vertical / Launcher / Node Runner ✅

Qualified Baseline（2026-09-03）：Hostra PREPARE → immutable plan/bootstrap → Node Runner → Runtime Control WS → real Main/Subsystem vertical。

M6 does not require Renderer/Data/Input/Render/Content physical composition。

---

## M7：Renderer Control ✅ Implemented / Qualified (2026-09-03)

Facts：ADR 0027 + `M7_01`–`M7_05` + Frozen Main⇄Renderer Control v1。

Closed：

```text
@loomrealm/renderer-control concrete peers
OpaqueMaterialGenerator migration
optional RendererControlBinding candidate-slot semantics
Main pure authority projection/revision/currentness
Renderer local holder
hello preflight/current switch/replacement/session-terminal races
```

Physical Hostra Renderer Control remains M14；PWA remains M16。

---

## M8：Renderer Data Role/Core ✅ Implemented / Qualified (2026-09-04)

Evidence：[m8-qualification.md](./m8-qualification.md)。

Closed real consumers：

```text
@loomrealm/main
    ready-derived DataAuthority S/1/loomrealm.renderer-data/1

@loomrealm/platform-ports
    RendererDataBinding
    SubsystemDataBinding / Result

@loomrealm/subsystem/host
    optional non-blocking Data peer lifecycle

@loomrealm/renderer
    per-subsystem Data reconciliation

@loomrealm/data
    real peers consumed by both roles
```

Not M8：physical Platform authority feed、Broker、candidate pairing/cutover、Runner late provisioning、Input/Render business managers。

---

## M9：Desktop DataConnectionBroker / Late Provisioning Core — **Implemented / Qualified (2026-09-04)**

Facts：

```text
ADR 0028
M9_01_DESKTOP_DATA_BROKER.md
M9_02_RUNNER_PROVISIONING_IPC.md
M9_03_PAIRED_INSTALLATION.md
M9_04_VERTICAL_INTEGRATION.md
M9_05_QUALIFICATION_CLOSURE.md
```

Implementation evidence：[m9-qualification.md](./m9-qualification.md)。

### M9/01 Main → Platform authority feed

Frozen shared port：

```text
DataConnectionAuthorityEntry
    subsystemKey / generation / dataProfile / exact HostedRuntime

DataConnectionAuthorityView
    current rendererControlToken correlation + full entries

DataConnectionAuthoritySink.replace(view|null)
    synchronous
    non-blocking
    non-throwing
    full replacement only
```

`MainPlatform.dataConnections?` remains optional。Main sends initial null and replaces the full view inside its existing serialized mutation lane。

Current accepted Renderer token remains consumed for authentication; its value is retained only while current as inert Platform correlation and participates in Main live material duplicate defense。

### M9/02 Hostra Runtime-scoped provisioner

`@loomrealm/game-launcher-hostra` adds exact child-owned integration：

```text
HostraRuntimeDataPrepareRequest
HostraRuntimeDataProvisioner.prepare(...)
HostraRuntimeDataProvisioner.commit(...)
HostraRuntimeDataProvisioner.revoke(...)
optional onRuntimeDataProvisioner(HostedRuntime, provisioner)
```

Handoff happens before successful `RuntimeHosting.launch()` resolves。Desktop may keep a private `WeakMap`；no RuntimeDirectory/service registry。

Dedicated child IPC：

```text
provision / prepared / commit / committed / revoke
```

It is not Runtime Control or Data application wire。

### M9/03 Desktop Broker / paired installation

M9 materializes the first `apps/desktop` workspace and root workspace pattern adds `apps/*`。

Concrete candidate：

```text
Renderer WS ─┐
             ├─ Desktop Broker opaque text relay
Runner WS   ─┘
```

Before install relay gate is closed。Per current Renderer/subsystem slot：0..1 current；commit lane revalidates exact latest Main view before install。

Frozen cutover：

```text
paired prepared
→ revalidate
→ old current retires
→ new candidate becomes sole current
→ role delivery occurs after install
```

Runner `commit()` is post-install delivery ACK, not the installation atom。

```text
new B installed
→ Runner delivery failure
→ B current→retired
→ old A never resurrects
```

No rollback/2PC/retry framework。

### M9/04 Vertical / qualification shape

Production path：real Main + real Renderer Control peers + real Node Runner/Runtime Control + real Hostra provisioning IPC + real two-sided Data WS + real M8 Bindings/Data peers；only physical Renderer hosting is deterministic/test。

Broker harness covers stale G/P/Renderer/HostedRuntime races and concurrency without inventing production Runtime restart/generation allocator in Main。

M9 does **not** claim User Input/Render fresh business publication baseline；those are M10/M11。

### M9/05 CI gate

Root adds：

```text
npm run test:m9
```

It composes：platform-ports M9 boundary + Main sink + Hostra provisioner/IPC + Desktop Broker harness + real M9 vertical。

M9 claims the Hostra/Desktop physical Broker slice only；full Connection-v1 cross-platform qualification waits for generation/business-baseline/PWA obligations。

M9 is **not** Desktop full Renderer product composition。BrowserWindow/physical Renderer Control/Input/Render/Content remain M14 composition work。

---

## M10：User Input v1 + InputManager

Frame Interest Registry + State/Event/Reset + Renderer sender gate + Subsystem InputListener/InputManager + fresh Activation/Data publication semantics。

M10 is where fresh Data peer/current receives and qualifies User Input business baseline; M9 only proves fresh physical carrier/peer lifecycle。

---

## M11：Render Update v1 + RenderManager

Render domains/snapshot/patch/event + Renderer Render Store + Subsystem RenderDomain/RenderManager；Frame close != Render destroy。

M11 qualifies fresh Data Render snapshot/domain publication baseline。

---

## M12：Content

Implement `@loomrealm/content` / content-service / Desktop fs/http adapters + Subsystem `ContentClient` author mapping。

---

## M13：`loom.map` Business Definition

```text
@loomrealm/map → @loomrealm/subsystem
```

No Game/Launcher/Runtime Control/Platform imports。

---

## M14：Desktop Full E2E

```text
HostraPlatform.prepareGame
→ Main / Node Runner / Runtime Control
→ Hostra physical RendererControlBinding realization
→ BrowserWindow + Renderer Control WebSocket
→ M9 Desktop DataConnectionBroker / Data WS
→ M10 Input + M11 Render + M12 Content
→ nested Frame outcomes / Renderer reload / shutdown
```

M14 adds real Hostra BrowserWindow/Renderer Control token delivery/stalled-write policy and composes previously qualified M9/M10/M11/M12 slices into one product trace。

Physical RendererControlBinding still obeys ADR 0027 settlement；M14 must not create a second retry/currentness protocol。

---

## M15：PWA Game Launcher / Runner / Second Game Package Consumer

Implement PWA manifest/join/resolver/LaunchPlan/LogicalGameBootstrap/RuntimeHosting/Worker Runner + MessagePort Runtime Control carrier。

---

## M16：PWA Full E2E + Cross-platform Equivalence

```text
PwaPlatform.prepareGame
→ Worker Runner + Runtime Control MessagePort
→ PWA physical RendererControlBinding
→ PWA DataConnectionBroker / MessageChannel provisioning
→ User Input + Render Update
→ PWA Content
→ full logical Session trace
```

PWA may realize the M9 abstract Data authority/install lifecycle differently, but must preserve same logical Connection results before full Hostra/PWA equivalence is claimed。

---

## Phase 1 Acceptance

- Foundation/Wire remain single-purpose；
- Game Package validation boundary intact；
- Runtime/Renderer/Data protocol packages own mechanics, not role authority；
- Frozen Frame causal/commit/unwind rules preserved；
- M7 Renderer currentness/token/revision semantics preserved；
- M8 logical DataAuthority + role Data seams remain unchanged；
- M9 Main→Platform sink is exact full-view/non-throwing and not a generic event framework；
- M9 exact HostedRuntime→Hostra provisioner handoff avoids public Runtime registry；
- M9 paired Broker install precedes role delivery and post-install delivery failure never rolls back old current；
- M9 Data failure remains outside Runtime/Frame authority；
- M10/M11 own child business publication-baseline qualification；
- M14, not M9, claims full Desktop product E2E；
- M16 includes PWA Renderer/Data/Content realization before full cross-platform equivalence；
- no generic RPC/connection/authority/transaction/retry/currentness framework。

---

## Deferred

```text
Save
untrusted executable sandbox / Publisher Trust
automatic Runtime restart/checkpoint
Runtime Control reconnect/resume
lazy / optional Subsystem
multiple Runtime instances per key
remote Runtime
multiple current Renderer participants
runtime implementation negotiation
universal multi-platform launcher schema
generic RPC/connection framework
Foundation-wide Clock abstraction without second consumer
Render history replay
```
