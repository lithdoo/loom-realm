# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving by milestone / M10 boundary frozen  
> 主要定义：primitive、protocol capability、role、platform ports、launcher/integration、composition root 与 business package 的 ownership/dependency boundary  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 最近复核：2026-09-07

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

Role SDK package MAY use Wire JSON types internally/type-only；这不授权 business Definition直接 import Wire/protocol packages。

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

M10 does not move Input role policy into `@loomrealm/data`。

---

## 4. `@loomrealm/platform-ports` — Shared Core↔Platform Facts

Runtime dependency remains exactly：

```text
@loomrealm/foundation
```

Frozen root surfaces through M10仍然只有 M4–M9 declarations：

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

**M10 adds no Platform Port。** Renderer input source是 Renderer role integration surface，不是 reusable Core↔Platform capability。

No universal Platform/service locator/event stream/connection registry/future port inventory。

---

## 5. Platform-neutral Role Packages

### Main

Through M10仍依赖：

```text
@loomrealm/platform-ports
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/wire
```

Main owns Session、Runtime/Launch Attempt、Renderer currentness/authentication、Frame/Stack/Activation/InputTarget、Renderer revision、DataAuthority policy、failure/unwind。

M10 adds no Main API/authority。

### Renderer

Through M10依赖：

```text
@loomrealm/renderer-control
@loomrealm/platform-ports
@loomrealm/data
```

M10 exact additive role surface：

```text
createRendererControlHolder(data?, input?)
RendererInputSource
RendererInputSourceChange
```

Source object construction-time fixed；0..1 source subscription follows current Control peer epoch。Renderer owns Effective gate + bounded User Input publisher on existing Data slots；does not mint Main/Data authority。

### Subsystem

Author root owns business SDK；trusted `/host` owns Runtime/Data role integration。

M10 root adds exact author-facing：

```text
InputStateChannel / InputEventChannel / InputChannel
InputPayload / InputHandler / Unsubscribe
CreateInputListenerOptions / InputListener
SubsystemScope.createInputListener
canonical standard author payload/supporting types
```

Author handler sees payload only；protocol envelope/peer/activationId/generation不进入 root business API。

`/host` consumes `RuntimeControlBinding` + optional `SubsystemDataBinding` and protocol peers。Business Definition source只 import `@loomrealm/subsystem`。

---

## 6. M10 Role Ownership

```text
Subsystem FrameRuntime
    local Frame/Activation/mutation-gate facts

Subsystem InputManager
    listener contributions/registrations
    Desired Interest
    retained immutable State
    deterministic business delivery
    latest-only Interest publication

Renderer Control holder/Data slots
    current Control/Data facts

Renderer Input gate/publisher
    Effective intersection
    State/Event/Reset ordering/backpressure

RendererInputSource
    canonical producer facts only
```

No role duplicates another owner。

---

## 7. M10 Author / Async Boundary

Frozen Subsystem SDK rules：

```text
channels/setChannels → Interest contribution
on/unsubscribe       → callback registration only
setChannels preserves dormant registrations
unsubscribe/close idempotent
stable delivery snapshot
same-channel registration order
multi-channel local convergence canonical channel order
async handler Promise never becomes Data-reader flow control
```

Known-no-commit `frame.call`：InputManager retained-State synchronous convergence precedes recoverable rejection becoming business-observable。

No generic subscription/async scheduler framework is extracted。

---

## 8. Protocol vs Authority Ownership

```text
renderer-control peer
    validates hello/protocolVersions
    selects protocol v1

Main
    owns Renderer token/currentness
    owns DataAuthority / InputTarget

DataConnectionAuthoritySink
    only receives committed Main physical-binding view

Desktop/PWA Broker
    only realizes that view into physical paired carriers

User Input roles
    only consume current committed facts
```

No Binding/Broker/Input source can infer authority from endpoint、ticket、socket、focus、role acquire request or local holder state。

---

## 9. Main-facing Platform View Through M10

Consumer-owned structural view remains：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
  readonly dataConnections?: DataConnectionAuthoritySink;
}
```

M10 does not modify this view。

---

## 10. Platform Launch Integration Packages

`@loomrealm/game-launcher-hostra/pwa` own Game Entry consumption、own Platform manifest、key join / executable security resolution、PlatformLaunchPlan、LogicalGameBootstrap、RuntimeHosting / Runner integration。

They MUST NOT become Renderer/DataBroker/Input/Content mega-packages。

Hostra M9 child-scoped Data provisioner mechanics remain unchanged by M10。

---

## 11. Renderer Control / Input Physical Placement

M7 closes logical `RendererControlBinding` only。Physical Hostra BrowserWindow/Renderer Control WS arrives M14；PWA MessagePort realization M16。

M10 closes logical Renderer input role + canonical source seam only：

```text
M10 deterministic RendererInputSource
M14 DOM/Gamepad RendererInputSource
M16 PWA equivalent source
```

M14/M16 source implementations must reuse exact M10 source API/current-Control subscription semantics。

---

## 12. Data Broker / Provisioning Placement

M8 role-facing seam：RendererDataBinding / SubsystemDataBinding。

M9 authority/physical seam：Main DataConnectionAuthoritySink → apps/desktop Broker → Renderer WS + Runner WS → HostraRuntimeDataProvisioner → paired install。

M10 only consumes current M9 Data peers；no Broker/Runner/provisioning ownership moves into Input roles。

---

## 13. No Universal Frameworks

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
GenericInputManager framework
InputDeviceRegistry/plugin system
Generic async callback scheduler
GenericTransaction / 2PC
CurrentnessLease/Epoch/Heartbeat
retry/backoff framework
```

---

## 14. Composition Roots

`apps/desktop` / `apps/pwa` / `apps/cli` MAY depend on lower packages and concrete launch integrations but MUST NOT duplicate Game/Launcher/protocol/domain validation。

M9 materialized `apps/desktop` for Broker/WS relay；M14 adds BrowserWindow/real Renderer Control/Input/Render/Content。

---

## 15. Port Placement Rule

```text
protocol mechanics → owning protocol package
stable Core↔Platform capability/fact → platform-ports
role policy/authority projection → owning role
one-platform Runner mechanics → concrete launcher/integration package
one-app physical composition/policy → app internal
```

`RendererInputSource` stays `@loomrealm/renderer` role surface because its consumer is Renderer input composition and M10 has no second shared Core↔Platform capability requirement。

---

## 16. Target Workspace — Demand Driven

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
├── desktop/
├── pwa/        // later
└── cli/        // later
```

M10 creates no new package/workspace。

---

## 17. Conformance / Qualification Ownership

```text
@loomrealm/data
    formal User Input wire/profile mechanics

@loomrealm/subsystem
    exact Input author types/API
    listener/Interest/State/delivery/async semantics

@loomrealm/renderer
    exact source API/lifetime
    Effective gate/publisher

apps/desktop M10 vertical
    real M9 physical Data + production role integration

M14/M16
    real physical source + full platform equivalence
```

No giant E2E replaces package/role/contract evidence。

---

## 18. Runtime Dependency Invariants Through M10

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

@loomrealm/subsystem package depends on shared protocol/port/wire packages for host/internal realization,
but business Definition consumes only @loomrealm/subsystem root
```

Forbidden：renderer-control→roles/platform；platform-ports→protocol/role/concrete Platform；main→renderer/game-package/concrete launcher；business Definition→protocol/platform packages。

---

## 19. Semver / Compatibility

`npm semver != protocol/profile version`。

Current first implementation has no external compatibility obligation。M10 exact author/source APIs land directly as current first implementation；no deprecated alias/parallel Input API/fake v2。

---

## 20. Core Rules Through M10

1. Foundation/Wire remain orthogonal primitives；
2. protocol packages own mechanics, not Main/Platform authority；
3. Main remains single Runtime/Frame/Renderer/Data/InputTarget authority owner；
4. M8/M9 Data currentness/Broker ownership remains unchanged；
5. M10 adds no Platform Port/package；
6. Subsystem one InputManager owns Desired Interest + retained author State + deterministic delivery；
7. Input handler registration does not own Interest；
8. async handler completion does not own Data flow control；
9. Renderer one construction-time source object + current-Control subscription feeds canonical facts only；
10. Renderer one bounded publisher per current Data slot owns User Input ordering/backpressure；
11. no generic RPC/authority/event/input/connection/transaction/retry/currentness framework。
