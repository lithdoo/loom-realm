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

下图箭头固定表示 **provider/dependency → consumer**：

```text
foundation ─────→ platform-ports ─────→ main / subsystem-host
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

Business package only depends on nearest author-facing role SDK。

---

## 2. Foundation / Wire

`@loomrealm/foundation`：MessageCarrier / CarrierClosed / deterministic memory carrier；无 JSON/domain/platform semantics。

`@loomrealm/wire`：plain JSON/JSON-RPC representation、exact keys、safe integer、UTF-8/depth primitives；无 carrier/lifecycle/domain authority。

两者保持 orthogonal；domain package不得创建第二 parser。

---

## 3. Contract Capability Packages

### `@loomrealm/runtime-control`

Owns concrete Runtime Control mechanics：one reader/dispatcher、one writer、shared sender IDs、pending/deadline/terminal、Response causal barrier、typed peers。

Dependencies exactly Foundation + Wire。No Main/Subsystem authority、transport establishment、generic RPC framework。

### `@loomrealm/renderer-control` — M7 Frozen

Owns：

```text
renderer.hello id=1
renderer.state
hello schema + protocolVersions validation
protocolVersion selection
closed wire/model validation
connection-local session/revision
exact outbound hello preparation/preflight
hello ordering/handoff
0..1 inFlight + 0..1 pendingLatest
retirement / terminal
```

Dependencies exactly Foundation + Wire。

MUST NOT depend on main、renderer、platform-ports、runtime-control、data或 concrete transports。

No GenericRpcPeer / UniversalProtocolSession / Publisher framework。

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

`OpaqueMaterialGenerator.generate()` current-v1 common output：ASCII `1..128` bytes、fresh、security-sensitive uses至少 128-bit unpredictability。它不接受 kind/type 参数，不拥有 identity/token semantics。

`RendererControlBinding.acquire(token,signal)` **arms exactly one candidate slot**；它 MAY remain pending，调用本身不创建/显示 Renderer、不发生 replacement。Resolution返回一个 already-established candidate carrier并物理交付 exact Main-issued token。

Settlement：

```text
abort before resolution
→ cancel this slot / no late live result

non-abort rejection
→ Binding terminal for the owning Main Session
→ Main does not re-acquire in that Session

carrier acquired then peer/protocol terminal
→ candidate attempt terminal only
→ does not by itself terminalize Binding
```

Binding不认证 token、不协商 protocol version、不决定 current Renderer。

No universal Platform/service locator/future port inventory。

---

## 4. Platform-neutral Role Packages

### Main

Through M7 consumes：

```text
LogicalGameBootstrap
@loomrealm/platform-ports
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/wire
```

Main owns Session identity、Runtime/Launch Attempt、all credential semantics、Renderer current participant/replacement、Frame/Stack/Activation/InputTarget、AuthorityRevision、DataAuthority policy(M8)、Runtime failure unwind。

Main MUST NOT depend on game-package、concrete launcher、renderer role或 concrete transport。

M7 Snapshot = pure projection；no shadow Renderer Runtime/Frame/InputTarget registry。

### Renderer

M7 runtime dependency：`@loomrealm/renderer-control` only。

M7 role local state only：

```text
current {peer, RendererAuthoritySnapshotV1} | null
```

该 local holder不是 Main remote-currentness 的独立证明。No Main/Platform dependency、second revision/session validator、lease/epoch/heartbeat或 generic Store framework。

### Subsystem

Author root owns business SDK；trusted `/host` owns Runtime/Data physical role integration。M4 Runtime/Frame slice != full Subsystem closure；M8/M10/M11/M12 continue same role package。

---

## 5. Protocol vs Authority Ownership

Renderer Control version negotiation is protocol mechanics：

```text
renderer-control Main peer
    validates protocolVersions
    selects protocolVersion=1
```

Main receives an already-selected typed v1 fact and owns only candidate/token/currentness acceptance。

禁止 Main/Platform Binding实现第二套 version negotiation。

---

## 6. M7 Frozen Main-facing Platform View

`@loomrealm/main` consumer-owned structural view：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
}
```

`rendererControl` optionality是 **physical capability availability**：

```text
absent
→ headless/Renderer-incapable composition
→ Main issues no Renderer attempt
→ Runtime/Frame semantics unchanged

present and healthy
→ Main maintains at most one current Renderer + one armed/pending/bound candidate slot
```

这不是 complete Platform API，也不要求 M6 Hostra Runtime-only composition加入 fake Binding。

Renderer candidate path：

```text
Main issues/registers token
→ RendererControlBinding.acquire(token,signal) arms one slot
→ future physical candidate binds slot
→ candidate MessageCarrier
→ renderer-control Main peer parses hello/selects v1
→ Main exact preflight + atomic currentness decision
```

No public `attachRenderer()` Main Session controller。

---

## 7. Platform Launch Integration Packages

`@loomrealm/game-launcher-hostra/pwa` own Game Entry consumption、own manifest、key join、executable/security resolution、PlatformLaunchPlan、LogicalGameBootstrap projection、RuntimeHosting/Runner integration。

They solve Subsystem Runtime PREPARE/launch only；MUST NOT become Renderer/DataBroker/Content/Platform mega-package。

---

## 8. Renderer Control Physical Placement

M7 closes logical Core↔Platform Binding contract + deterministic MemoryCarrier realization。

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

Transport adapters establish/deliver MessageCarrier only；no Renderer Control parsing/currentness。

---

## 9. No Universal RPC / Connection Framework

Forbidden：

```text
GenericRpcPeer
GenericSchemaCodec
UniversalProtocolSession
ConnectionRegistry
UniversalRendererServices
RendererPlatform
PlatformLaunchOptions
options:any
BindingErrorHierarchy
CurrentnessLease/Epoch/Heartbeat
```

Runtime Control and Renderer Control remain independent concrete protocol packages。

---

## 10. Platform Provisioning / Data Placement

M8/M9 DataConnectionBroker realizes Main current `S/G/dataProfile` into physical Renderer/Subsystem carriers。

Provisioning is not Runtime Control / Renderer Control application wire and does not enter Snapshot。Provisioning failure != Runtime failure/Frame unwind。

---

## 11. Business Packages

Example：`@loomrealm/map → @loomrealm/subsystem`。

Business MUST NOT depend on game-package、launcher、subsystem/host、runtime-control、renderer-control、platform adapters。

---

## 12. Composition Roots

`apps/desktop` / `apps/pwa` / `apps/cli` MAY depend on lower packages and concrete Platform implementations but MUST NOT duplicate Game/Launcher/protocol/domain validation。

Concrete Platform instance is Session-scoped per ADR 0026；其存在不等于 Platform mega-interface。

---

## 13. Port Placement Rule

```text
protocol mechanics → owning protocol package
stable Core↔Platform capability/fact → platform-ports
role policy/authority → owning role
one-app glue → app internal
```

M7 `RendererControlBinding` qualifies because Main consumes the same abstract candidate-slot/carrier capability while Hostra/PWA physical realization differs。Capability availability may still be absent in a given composition。

Data/Content future ports require their own real consumer closure。

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
├── desktop/
├── pwa/
└── cli/
```

Do not pre-create package solely because target graph imagines it。

---

## 15. Semver / Protocol Version

`npm semver != protocol/profile version`。

Current project has no compatibility obligation；ADR 0027 current-v1 rename/freeze lands directly，不创建 fake v2或 compatibility alias。

---

## 16. Conformance Ownership

```text
renderer-control tests
    wire/version negotiation/validation/ordering/bounded publication/terminal

platform-ports tests
    opaque material output contract
    candidate-slot lifecycle
    abort vs non-abort Binding rejection

main tests
    authority projection/revision/optional-Binding slot loop/token/currentness

renderer tests
    local peer+Snapshot holder/identity-safe replacement
    no remote-currentness lease layer

M7 vertical
    Binding-present real path through MemoryCarrier
    no-slot / extra-candidate / Binding-terminal cases

Main integration
    Binding-absent path remains functional

M14/M16
    concrete physical Binding realizations
```

No single giant E2E replaces package/role evidence。

---

## 17. Runtime Dependency Invariants

这里改用明确 `depends on`，不混用箭头方向：

```text
@loomrealm/platform-ports depends on:
    @loomrealm/foundation

@loomrealm/runtime-control depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/renderer-control depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/main depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/wire

@loomrealm/renderer depends on:
    @loomrealm/renderer-control

@loomrealm/subsystem/host depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
```

Forbidden：renderer-control→main/renderer/platform-ports；platform-ports→renderer-control/main；renderer→main/platform-ports；main→renderer/game-package/concrete launcher；business→protocol/platform packages。

---

## 18. Core Rules Through M7

1. Foundation/Wire remain low-level orthogonal primitives。  
2. Runtime Control and Renderer Control own protocol mechanics only。  
3. Renderer Control peer owns version negotiation；Main owns token/currentness。  
4. Main is the single Runtime/Frame/Renderer-currentness authority。  
5. Renderer is a local read-only Main mirror；M7 has no second protocol/currentness state machine。  
6. `RendererControlBinding.acquire` arms one candidate slot；hello grants currentness。  
7. Binding abort cancels one slot；non-abort acquire rejection terminalizes that Binding for the Main Session。  
8. Binding availability may be absent per composition；no fake Binding required。  
9. `OpaqueMaterialGenerator` gives ASCII 1..128-byte fresh material with >=128-bit unpredictability for security-sensitive uses；Main owns semantics。  
10. M7 closes logical Binding + MemoryCarrier semantics, not physical WS/MessagePort qualification。  
11. Renderer Control representation failure cannot alter Frozen Frame/Runtime authority。  
12. No generic RPC/connection/service/currentness framework。  
13. M8 DataAuthority/Data bindings remain consumer-driven。
