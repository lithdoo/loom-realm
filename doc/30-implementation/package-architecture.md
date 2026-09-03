# 独立分包与发布架构

> 层级：实施计划 / Package Boundary  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving by milestone  
> 主要定义：primitive、protocol capability、role、platform ports、launcher/integration、composition root 与 business package 的 ownership/dependency boundary  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[ADR 0026](../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 最近复核：2026-09-03

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
foundation ─────→ platform-ports ─────→ main / subsystem-host
 │
 ├─────────────────────┐
 │                     ↓
wire ─────────────→ runtime-control
 │                     ↓
 │              main / subsystem-host
 │
 ├──────────────→ renderer-control ─────→ main / renderer
 │
 ├──────────────→ data ────────────────→ subsystem / renderer
 │
 ├──────────────→ content ─────────────→ subsystem / renderer/content-service
 │
 └──────────────→ game-package
                         ↓
              game-launcher-hostra/pwa
                         ↓
                       apps/*
```

Business package only depends on nearest author-facing role SDK。

---

## 2. Foundation / Wire

`@loomrealm/foundation`：MessageCarrier / CarrierClosed / deterministic memory carrier；无 JSON/domain/platform semantics。

`@loomrealm/wire`：plain JSON/JSON-RPC representation、exact keys、safe integer、UTF-8/depth primitives；无 carrier/lifecycle/domain authority。

两者保持 orthogonal；domain package不得创建第二个 parser来补偿 wording。

---

## 3. Contract Capability Packages

```text
@loomrealm/game-package
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/data
@loomrealm/content
@loomrealm/platform-ports
```

### `@loomrealm/runtime-control`

Owns concrete Runtime Control mechanics：one reader/dispatcher、one serialized writer、shared same-sender request IDs、pending/deadline/terminal、Response causal barrier、typed peers。

Dependencies exactly Foundation + Wire。No Main/Subsystem authority、WebSocket/MessagePort establishment、generic RPC framework。

### `@loomrealm/renderer-control` — M7 Frozen

Owns concrete Main ⇄ Renderer Control v1 mechanics：

```text
renderer.hello id=1
renderer.state
closed wire/model validation
connection-local session/revision
exact outbound hello preparation/preflight
hello ordering/handoff
0..1 inFlight + 0..1 pendingLatest
retirement / terminal
```

Runtime dependencies exactly：

```text
@loomrealm/foundation
@loomrealm/wire
```

MUST NOT depend on main、renderer、platform-ports、runtime-control、data或 concrete transports。

No GenericRpcPeer / UniversalProtocolSession / Publisher framework / transport subpath。

### `@loomrealm/data`

Owns Renderer Data Profile v1 + Data Connection + User Input + Render Update protocol mechanics。Role policy remains in subsystem/renderer integrations。

### `@loomrealm/platform-ports`

Owns only narrow Core↔Platform capabilities/facts；runtime dependency exactly Foundation。

Frozen root semantics through M7：

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
```

M7 directly replaces historical current implementation name `BootstrapTokenGenerator` with `OpaqueMaterialGenerator`; no compatibility alias。

`RendererControlBinding.acquire(token,signal)` establishes exactly one candidate physical Renderer Control carrier and physically delivers the exact Main-issued token. It does not authenticate token or decide current Renderer。

No universal Platform/service locator/future port inventory。

---

## 4. Platform-neutral Role Packages

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/content-service
```

### Main

Through M7 consumes：

```text
LogicalGameBootstrap
@loomrealm/platform-ports
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/wire
```

Main owns：

```text
Session identity
Runtime Registry / Launch Attempt
all credential issue/bind/invalidate/consume authority
Renderer current participant/replacement
Frame/Stack/Activation/InputTarget
AuthorityRevision
DataAuthority (policy begins M8)
Runtime failure unwind
```

Main MUST NOT depend on game-package、concrete launcher、renderer role或 concrete transport。

M7 Renderer Snapshot is a pure projection of existing Main authority；no shadow Renderer Runtime/Frame/InputTarget registry。

### Renderer

M7 dependency：

```text
renderer → renderer-control
```

M7 role state only：

```text
current {peer, RendererAuthoritySnapshotV1} | null
```

No Main dependency、Platform dependency、second revision/session validator、generic Store framework。

Later M8/M10/M11/M12 add Data/Input/Render/Content consumers in the same role package。

### Subsystem

Author root：`defineSubsystem` / Frame / InputListener / RenderDomain / ContentClient。  
Trusted `/host`：Runtime Control/Data physical role integration。

M4 Runtime/Frame slice != full Subsystem package closure；M8/M10/M11/M12 continue the same role package。

---

## 5. Platform Launch Integration Packages

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

Each owns：Game Entry consumption、own manifest、exact key join、platform executable/security resolution、PlatformLaunchPlan、LogicalGameBootstrap projection、RuntimeHosting/Runner integration primitives。

They solve Subsystem Runtime PREPARE/launch only；MUST NOT become Renderer/DataBroker/Content/Platform mega-package。

---

## 6. M7 Frozen Main-facing Platform View

`@loomrealm/main` consumer-owned structural view：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl: RendererControlBinding;
}
```

This is not exported by platform-ports and is not complete LoomRealm Platform API。

Concrete Hostra/PWA object MAY structurally satisfy it。

Renderer candidate path is frozen：

```text
Main issues/registers token
→ RendererControlBinding.acquire(token,signal)
→ candidate MessageCarrier
→ renderer-control Main peer
→ renderer.hello
→ Main exact preflight + atomic currentness decision
```

No public `attachRenderer()` Main Session controller is required in M7。

---

## 7. Renderer Control Physical Placement

M7 closes **logical Core↔Platform Binding contract + deterministic MemoryCarrier realization**。

Physical realizations stay in product composition：

```text
Desktop M14
    BrowserWindow/bootstrap token delivery
    Renderer Control WebSocket carrier
    finite stalled-write policy

PWA M16
    renderer bootstrap token delivery
    Renderer Control MessagePort string carrier
    host liveness policy
```

Transport adapters only establish/deliver MessageCarrier；they do not parse Renderer Control domain messages or own currentness。

---

## 8. No Universal RPC / Connection Framework

Forbidden prediction/generalization：

```text
GenericRpcPeer
GenericSchemaCodec
UniversalProtocolSession
ConnectionRegistry
UniversalRendererServices
RendererPlatform
PlatformLaunchOptions
options:any
```

Runtime Control and Renderer Control remain independent concrete protocol packages even where implementation shapes look similar。

Shared primitive extraction requires independently implemented consumers and a stable non-domain primitive。

---

## 9. Platform Provisioning / Data Placement

M8/M9 DataConnectionBroker realizes Main current `S/G/dataProfile` into physical Renderer/Subsystem carriers。

Provisioning is not Runtime Control / Renderer Control application wire and does not enter Snapshot。

```text
Hostra: Broker + Runner IPC + Data WS
PWA: Broker + Worker Port transfer + MessageChannel
```

Provisioning failure != Runtime failure/Frame unwind。

---

## 10. Business Packages

Example：

```text
@loomrealm/map → @loomrealm/subsystem
```

Business MUST NOT depend on game-package、launcher、subsystem/host、runtime-control、renderer-control、platform adapters。

---

## 11. Composition Roots

```text
apps/desktop
apps/pwa
apps/cli
```

Composition root MAY depend on lower packages and concrete Platform implementations but MUST NOT duplicate Game/Launcher/protocol/domain validation semantics。

Concrete Platform instance is Session-scoped composition object per ADR 0026；its existence does not imply a Platform mega-package/interface。

---

## 12. Port Placement Rule

```text
protocol mechanics
    → owning protocol package

stable Core↔Platform capability/fact
    → @loomrealm/platform-ports

role policy/authority
    → owning role

one-app glue
    → app internal
```

M7 `RendererControlBinding` qualifies for platform-ports because Main consumes the same abstract candidate-carrier capability while Hostra/PWA physical realization differs。

Data/Content future ports still require their own real consumer closure。

---

## 13. Target Workspace — Demand Driven

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
├── pwa/
└── cli/
```

Do not pre-create package solely because target graph imagines it。

---

## 14. Semver / Protocol Version

```text
npm semver != protocol/profile version
```

Current project has no compatibility obligation；ADR 0027 current-v1 rename/freeze lands directly，不创建 fake v2或 compatibility alias。

---

## 15. Conformance Ownership

```text
renderer-control tests
    protocol/validation/ordering/bounded publication/terminal

platform-ports tests
    frozen capability shape/lifecycle

main tests
    authority projection/revision/Binding accept loop/hello currentness

renderer tests
    current peer+Snapshot holder/identity-safe replacement

M7 vertical
    real Binding → Main → peers → Renderer through MemoryCarrier

M14/M16
    concrete physical Binding realizations
```

No single giant E2E replaces package/role evidence。

---

## 16. Dependency Invariants

```text
foundation → platform-ports
foundation + wire → runtime-control
foundation + wire → renderer-control
main → platform-ports + runtime-control + renderer-control + wire
renderer → renderer-control
subsystem/host → platform-ports + runtime-control
```

Forbidden：

```text
renderer-control → main/renderer/platform-ports
platform-ports → renderer-control/main
renderer → main/platform-ports
main → renderer/game-package/concrete launcher
business → protocol/platform packages
```

---

## 17. Core Rules Through M7

1. Foundation/Wire remain low-level orthogonal primitives。  
2. Game Package is document validation capability, not Main state。  
3. Runtime Control and Renderer Control own protocol mechanics only。  
4. Main is the single Runtime/Frame/Renderer-currentness authority。  
5. Renderer is read-only Main mirror；M7 has no second protocol state machine。  
6. `RendererControlBinding` gives candidate carrier only；hello grants currentness。  
7. `OpaqueMaterialGenerator` gives fresh material only；Main owns all semantics。  
8. M7 closes logical Binding + MemoryCarrier semantics, not physical WS/MessagePort qualification。  
9. Renderer Control representation failure cannot alter Frozen Frame/Runtime authority。  
10. No generic RPC/connection/service framework。  
11. M8 DataAuthority/Data bindings remain consumer-driven。  
12. Business packages depend only on author-facing role SDKs。
