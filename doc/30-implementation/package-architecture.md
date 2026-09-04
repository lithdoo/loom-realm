# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving by milestone  
> 主要定义：primitive、protocol capability、role、platform ports、launcher/integration、composition root 与 business package 的 ownership/dependency boundary  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)  
> 最近复核：2026-09-04

```text
Protocol boundary
!= npm package boundary
!= process boundary
!= Platform boundary
!= milestone boundary
```

Milestone只描述 implementation slice；package ownership以系统架构 + accepted/frozen ADR + 本文为准。

---

## 1. Dependency Layers

下图箭头表示 provider/dependency → consumer：

```text
foundation ─────→ platform-ports ─────→ main / subsystem-host / renderer
 │
 ├─────────────────────┐
 │                     ↓
wire ─────────────→ runtime-control ──→ main / subsystem-host
 │
 ├──────────────→ renderer-control ───→ main / renderer
 │
 ├──────────────→ data ───────────────→ subsystem / renderer
 │
 ├──────────────→ content ────────────→ subsystem / renderer/content-service
 │
 └──────────────→ game-package
                         ↓
              game-launcher-hostra/pwa
                         ↓
                       apps/*
```

Business packages depend only on nearest author-facing role SDK。

---

## 2. Foundation / Wire

`@loomrealm/foundation` owns MessageCarrier / CarrierClosed / deterministic MemoryCarrier；no JSON/domain/platform semantics。

`@loomrealm/wire` owns plain JSON/JSON-RPC representation、exact keys、safe integer、UTF-8/depth primitives；no carrier/lifecycle/domain authority。

---

## 3. Contract Capability Packages

### `@loomrealm/runtime-control`

Owns concrete Runtime Control mechanics：one reader/dispatcher、one writer、shared sender IDs、pending/deadline/terminal、Response causal barrier、typed peers。

Dependencies exactly Foundation + Wire。No Main/Subsystem authority、transport establishment、generic RPC framework。

### `@loomrealm/renderer-control`

Owns Renderer Control v1 mechanics：hello/version selection、closed wire/model validation、whole current Snapshot、bounded latest-state publication、retirement/terminal。

Dependencies exactly Foundation + Wire。No Main/Renderer/Platform implementation dependency。

### `@loomrealm/data`

Owns Renderer Data Profile v1 connection-local mechanics：Data Connection + User Input + Render Update wire/peer mechanics。Role policy remains in subsystem/renderer integrations；physical Broker authority remains Platform composition。

---

## 4. `@loomrealm/platform-ports` — Shared Core↔Platform Facts

Runtime dependency remains exactly：

```text
@loomrealm/foundation
```

Current frozen root surfaces through M9：

```text
M4
    DeadlineScheduler
    RuntimeControlBinding

M5
    RuntimeLaunchRequest
    MainRuntimeControlBinding
    HostedRuntime
    RuntimeHosting

M7
    OpaqueMaterialGenerator
    RendererControlBinding

M8
    RendererDataBinding
    SubsystemDataBinding
    SubsystemDataBindingResult

M9
    DataConnectionAuthorityEntry
    DataConnectionAuthorityView
    DataConnectionAuthoritySink
```

M9 sink placement qualifies under the port rule because Main is a real platform-neutral producer and Desktop/PWA are distinct physical realizations of the same authority fact。

Frozen M9 sink rules：

```text
full replacement only
session-scoped
replace(view|null) synchronous / non-blocking / non-throwing
no network/IPC waits inside replace
exact current Renderer correlation + HostedRuntime object + S/G/P
no Broker/ticket/candidate/transport exposure
```

No universal Platform/service locator/event stream/connection registry/future port inventory。

---

## 5. Platform-neutral Role Packages

### Main

Through M9 depends on：

```text
@loomrealm/platform-ports
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/wire
```

Main owns Session、Runtime/Launch Attempt、Renderer currentness/authentication、Frame/Stack/Activation/InputTarget、Renderer revision、DataAuthority policy、failure/unwind。

M9 adds no public Main Session controller。It only consumes optional `MainPlatform.dataConnections` and projects current physical-binding facts from existing authority。

Main MUST NOT depend on concrete launcher、renderer role、Data Broker implementation、Node/Worker/WebSocket/MessagePort。

### Renderer

Through M8 depends on：

```text
@loomrealm/renderer-control
@loomrealm/platform-ports
@loomrealm/data
```

Renderer owns only local mirror/Data peer reconciliation。It does not prove Main remote currentness and does not mint Data authority。

### Subsystem

Author root owns business SDK；trusted `/host` owns Runtime/Data physical role integration。

`/host` consumes `RuntimeControlBinding` and optional `SubsystemDataBinding` from platform-ports plus protocol peers。Business root does not import platform ports/protocol implementation/concrete transport。

---

## 6. Protocol vs Authority Ownership

```text
renderer-control peer
    validates hello/protocolVersions
    selects protocol v1

Main
    owns Renderer token/currentness
    owns DataAuthority

DataConnectionAuthoritySink
    only receives committed Main physical-binding view

Desktop/PWA Broker
    only realizes that view into physical paired carriers
```

No Binding/Broker can infer authority from endpoint、ticket、socket、role acquire request or local holder state。

---

## 7. Main-facing Platform View Through M9

Consumer-owned structural view：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
  readonly dataConnections?: DataConnectionAuthoritySink;
}
```

Optionality：

```text
rendererControl absent
→ no physical Renderer attempt

dataConnections absent
→ no Platform Data installation authority feed
```

Neither absence invalidates Runtime/Frame semantics。M6/headless composition need no fake capabilities。

---

## 8. Platform Launch Integration Packages

`@loomrealm/game-launcher-hostra/pwa` own：

```text
Game Entry consumption
own Platform manifest
key join / executable security resolution
PlatformLaunchPlan
LogicalGameBootstrap projection
RuntimeHosting / Runner integration
```

They MUST NOT become Renderer/DataBroker/Content mega-packages。

### Hostra M9 extension

Because `@loomrealm/game-launcher-hostra` owns the Node child, it may additionally own only the exact child-scoped provisioning mechanics：

```text
HostraRuntimeDataPrepareRequest
HostraRuntimeDataProvisioner
optional onRuntimeDataProvisioner(HostedRuntime, provisioner) hook
Runner provisioning IPC
Runner-side physical Data WS establishment
```

Broker policy、Renderer pairing、Main authority revalidation and Data relay remain `apps/desktop`。

No generic provisioning package is extracted in M9。

---

## 9. Renderer Control Physical Placement

M7 closes logical `RendererControlBinding` semantics only。Physical Hostra BrowserWindow/Renderer Control WS arrives M14；PWA MessagePort realization arrives M16。

M9 deterministic Renderer host may physically correlate the Main-issued Renderer token for Data Broker qualification but MUST still use real Renderer Control peers/Main acceptance。

---

## 10. Data Broker / Provisioning Placement

M8 role-facing seam：

```text
RendererDataBinding
SubsystemDataBinding
```

M9 authority/physical seam：

```text
Main DataConnectionAuthoritySink full view
→ apps/desktop Desktop DataConnectionBroker
→ Renderer WS + Runner WS candidate
→ exact HostedRuntime → HostraRuntimeDataProvisioner
→ paired install
→ post-install role Binding delivery
```

Broker install is not Runtime/Renderer Control RPC。Runner provisioning IPC is not Data application protocol。

Post-install Runner delivery failure：

```text
new current → retired
no rollback/resurrection of old current
no Runtime/Frame authority mutation
```

---

## 11. No Universal Frameworks

Forbidden：

```text
GenericRpcPeer
GenericSchemaCodec
UniversalProtocolSession
ConnectionRegistry / ConnectionManager
RuntimeDirectory service
UniversalRendererServices
RendererPlatform
PlatformLaunchOptions
options:any
BindingErrorHierarchy
AuthorityEventBus / ObserverHub
GenericTransaction / 2PC
CurrentnessLease/Epoch/Heartbeat
retry/backoff framework
```

---

## 12. Composition Roots

`apps/desktop` / `apps/pwa` / `apps/cli` MAY depend on lower packages and concrete launch integrations but MUST NOT duplicate Game/Launcher/protocol/domain validation。

M9 is the first real reason to materialize：

```text
apps/desktop
```

It owns Desktop Broker/WS relay and M9 deterministic physical Renderer composition。This is not full Electron product completion；M14 adds BrowserWindow/real physical Renderer Control/Input/Render/Content。

Root workspaces add `apps/*` only when this real app consumer is created。

---

## 13. Port Placement Rule

```text
protocol mechanics → owning protocol package
stable Core↔Platform capability/fact → platform-ports
role policy/authority → owning role
one-platform Runner ownership mechanics → concrete launcher/integration package
one-app physical composition/policy → app internal
```

Examples：

```text
RendererControlBinding → platform-ports
DataConnectionAuthoritySink → platform-ports
HostraRuntimeDataProvisioner → game-launcher-hostra
Desktop DataConnectionBroker → apps/desktop
```

Do not promote Hostra-only provisioner into `platform-ports` before a second real cross-platform consumer proves an identical shared capability is required。

---

## 14. Target Workspace — Demand Driven

```text
packages/
├── foundation/
├── platform-ports/
├── wire/
├── game-package/
├── game-launcher-hostra/
├── game-launcher-pwa/
├── runtime-control/
├── renderer-control/
├── data/
├── content/
├── main/
├── subsystem/
├── renderer/
├── content-service/
└── map/

apps/
├── desktop/    // materializes at M9
├── pwa/        // later
└── cli/        // later
```

Do not pre-create packages/apps solely for target symmetry。

---

## 15. Conformance Ownership

```text
renderer-control package
    wire/version/ordering/current peer mechanics

platform-ports
    exact shared port declarations/boundary tests

main
    authority projection / optional capabilities / sink update discipline

renderer/subsystem
    M8 role-local Data peer lifecycle

game-launcher-hostra
    exact child provisioning IPC/provisioner lifecycle

apps/desktop M9
    Broker authority binding / paired WS / install/cutover/retirement harness
    real Hostra M9 physical vertical

M10/M11
    fresh User Input / Render business publication baseline

M14/M16
    full physical product/platform equivalence gates
```

No single giant E2E replaces package/role/contract evidence。

---

## 16. Runtime Dependency Invariants Through M9

```text
@loomrealm/platform-ports depends on:
    @loomrealm/foundation

@loomrealm/runtime-control depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/renderer-control depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/data depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/main depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/wire

@loomrealm/renderer depends on:
    @loomrealm/renderer-control
    @loomrealm/platform-ports
    @loomrealm/data

@loomrealm/subsystem/host depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/data
```

Forbidden：renderer-control→roles/platform；platform-ports→protocol/role/concrete Platform；main→renderer/game-package/concrete launcher；business→protocol/platform packages。

---

## 17. Semver / Compatibility

`npm semver != protocol/profile version`。

Current first implementation has no external compatibility obligation。M9 new shared port surfaces land directly under ADR 0028；no fake v2/deprecated alias/parallel Broker API。

---

## 18. Core Rules Through M9

1. Foundation/Wire remain low-level orthogonal primitives。  
2. Runtime Control/Renderer Control/Data packages own protocol mechanics, not Main/Platform authority。  
3. Main remains single Runtime/Frame/Renderer/Data authority owner。  
4. M7 RendererControlBinding remains one-slot candidate capability with optional availability。  
5. M8 role Data Bindings only wait for current-deliverable carriers。  
6. M9 DataConnectionAuthoritySink is a non-throwing full-view Main→Platform fact sink。  
7. Current Renderer token retention after auth consumption is inert correlation only。  
8. Exact HostedRuntime object identity binds Data to physical Runtime attempt。  
9. apps/desktop owns Broker/relay；Hostra launcher owns only exact child provisioner mechanics。  
10. Broker logical install precedes post-install role delivery；delivery failure retires new current with no rollback。  
11. M9 qualifies physical Data carrier lifecycle, not M10/M11 publication baseline or full cross-platform equivalence。  
12. No generic RPC/authority/event/connection/transaction/retry/currentness framework。
