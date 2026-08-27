# 独立分包与发布架构

> 层级：实施计划  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving  
> 主要定义：primitive、document/contract capability、role、platform launch integration、technical adapter/Runner integration、composition root 与 business package 的拆分原则  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[模块设计目录](../20-modules/README.md)  
> 被实现：[仓库与目录方案](./repository-layout.md)  
> 最近复核：2026-08-27

本文是 package/publish boundary 的主要事实源；repository layout只实现本文，不反向定义它。

```text
Protocol boundary
!= npm package boundary
!= Runtime process boundary
!= Platform boundary
!= implementation milestone boundary
```

Milestone只描述 capability 的实现顺序与阶段性 closure。**不得根据某个 milestone 首次写到某 package，就推导该 milestone 已覆盖该 package 的全部职责。** 一个 role package MAY跨多个 milestone逐步实现，只要 package ownership 与 public boundary保持一致。

---

## 1. Dependency Layers

Current low-level primitives feed multiple independent capability branches。以下第一张图只描述 Runtime/Game 的低层主干，不应被解释为完整 Role dependency graph：

```text
@loomrealm/foundation ─────→ @loomrealm/platform-ports
        │                           ↓
        ├──────────────┐     Core role integrations
        │              ↓
@loomrealm/wire ─→ @loomrealm/runtime-control
        │              ↓
        │       Main / Subsystem Host
        ↓
@loomrealm/game-package
        ↓
matching game-launcher-*
        ↓
apps/* composition
```

对 `@loomrealm/subsystem` 必须同时观察 Runtime、Data、Content 等 capability branch：

```text
Runtime branch                     Data / presentation branch
──────────────                     ──────────────────────────
foundation + wire                  wire/foundation as required
        ↓                                   ↓
runtime-control                           data
        ↓                              ┌─────┴─────┐
subsystem/host                        input       render
        \                              /           /
         \                            /           /
          └──────── @loomrealm/subsystem ────────┘
                         ↑
                      content
                         ↓
                  business packages
```

这里的 `subsystem/host` 是 Runtime Control 的真实 consumer boundary；它不是整个 Subsystem role package 的同义词。

Business package only depends on the nearest author-facing role SDK。

---

## 2. Foundation / Wire

```text
@loomrealm/foundation
    MessageCarrier / CarrierClosed
    deterministic memory carrier
    generic low-level lifecycle primitives only when independently justified
    no JSON/domain/platform semantics

@loomrealm/wire
    JSON / JSON-RPC representation
    exact keys / safe integer / UTF-8/depth primitives
    no carrier/lifecycle/domain authority
```

Foundation/Wire remain orthogonal；do not merge into `common/utils`。

Wire source parsing follows its frozen JSON semantics；domain package MUST NOT silently introduce a second parser to compensate for profile wording。

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

### `game-package`

Platform-neutral Game Entry document validation capability：

```text
GameEntryV1
formatVersion
initial target/input
Descriptor {key}
complete logical key-set validation
validated detached immutable snapshot
```

Primary Runtime-product consumers：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

Not：Main role dependency / business dependency / loader / Platform manifest / RuntimeHosting。

### `runtime-control`

Position：platform-neutral Runtime Control protocol mechanics capability。

Owns：

```text
Subsystem Control v1
Frame / Call v1 protocol-facing representation/mechanics
Runtime Control Profile v1
one connection-wide reader/dispatcher
one serialized writer
shared strict-monotonic sender Request ID namespace
profile limits / pending correlation / deadlines / terminal
Response causal barrier
role-specific typed peers
```

Does not own：

```text
Main Runtime/Frame/Stack authority
Launch Attempt/token storage
Subsystem business SDK/input dispatch
Runtime failure unwind commit
WebSocket/MessagePort establishment
Platform provisioning
```

Runtime dependencies exactly：

```text
@loomrealm/foundation
@loomrealm/wire
```

First package surface：root export only；no `/control` `/frame` `/profile` `/testing` subpaths。

M3 `RuntimeControlScheduler` remains a Runtime Control-owned structural constructor input；M4 `DeadlineScheduler` independently defines the Core↔Platform deadline capability with the same shape。Neither requires a generic Foundation Clock。

### `data`

```text
Renderer Data Profile v1
Data Connection v1
User Input v1
Render Update v1
```

Profile composition does not merge child identity/lifecycle/authority。

### `platform-ports`

Position：platform-neutral Core ↔ Platform capability contract boundary；它定义 Core 需要平台提供的窄 capability/fact，不拥有 Core authority、role policy、protocol mechanics 或 concrete Hostra/PWA implementation。

M4 frozen root surface exactly：

```text
DeadlineScheduler
RuntimeControlBinding
```

Runtime dependency exactly：

```text
@loomrealm/foundation
```

`DeadlineScheduler` 与 Runtime Control scheduler structural-compatible，但 `platform-ports` MUST NOT依赖 `@loomrealm/runtime-control`。`RuntimeControlBinding` 是 one-Launch-Attempt / single-use / no-reconnect establishment capability。

M5+ Main/Renderer/Data/Content ports 只在对应 real consumer closure 时增长；不得提前建立万能 `Platform` object、service locator 或 future port inventory。

---

## 4. Platform-neutral Role Packages

```text
@loomrealm/main
@loomrealm/subsystem
@loomrealm/renderer
@loomrealm/content-service
```

Role packages consume capability packages/ports and never import concrete Hostra/PWA composition APIs。

### Main

Main consumes：

```text
LogicalGameBootstrap
@loomrealm/runtime-control
@loomrealm/renderer-control
Main-facing Platform ports
```

Main owns：

```text
Runtime Registry / Launch Attempt authority
bootstrap credential authority
Frame/Stack/Activation/InputTarget
DataAuthority
Runtime failure unwind
```

Main MUST NOT depend on：

```text
@loomrealm/game-package
@loomrealm/game-launcher-hostra/pwa
```

`LogicalGameBootstrap` is Main-facing logical input，not Game Entry document model。

### Subsystem dual surface

`@loomrealm/subsystem` 是完整 platform-neutral Subsystem role SDK，不是 Runtime Control wrapper，也不等同于 Subsystem Runtime host mechanics。

Author：

```text
@loomrealm/subsystem
    defineSubsystem
    Frame / FrameOutcome
    InputListener
    RenderDomain
    ContentClient
```

Trusted integration：

```text
@loomrealm/subsystem/host
    runSubsystem
    SubsystemLaunchContext
    SubsystemRuntimeControlPolicy
```

M4 Platform capability contract 由 `@loomrealm/platform-ports` 唯一拥有：

```text
DeadlineScheduler
RuntimeControlBinding
```

`@loomrealm/subsystem/host` consumes these ports and is the first real Subsystem-side consumer of Runtime Control typed peer；it owns role-local deadline policy and maps protocol mutation-pending state into ordinary-input gating/business control flow。`SubsystemDataBinding` exact Platform contract deferred to M8；M4 MUST NOT预定义 fake Data port。

Business package MUST NOT depend on `/host`、Game Package、Launcher、Runtime Control directly。

#### Subsystem package implementation spans milestones

Package responsibility 与 implementation readiness 分离：

| Subsystem responsibility | Primary capability dependency | Phase 1 implementation gate |
| --- | --- | --- |
| Definition/lifecycle + Frame/Outcome | Runtime Control / Frame v1 | M4 |
| Host Runtime Control role mapping | `@loomrealm/platform-ports` M4 slice + Runtime Control v1 | M4 |
| DataPlane + future Subsystem Data binding application integration | Renderer Data Profile + M8 Platform port closure | M8 |
| `InputListener` / InputManager | User Input v1 | M10 |
| `RenderDomain` / RenderManager | Render Update v1 | M11 |
| `ContentClient` author mapping | Content capability/contracts | M12 |

因此：

```text
M4 closes a Subsystem Runtime/Frame slice
M4 != full @loomrealm/subsystem package closure
```

M8/M10/M11/M12继续修改/实现同一个 role package，不因为 milestone 不同而拆出新的 Subsystem ownership。

---

## 5. Platform Launch Integration Packages

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

Each owns：

```text
Game Entry consumption via @loomrealm/game-package
own Platform Launch Manifest schema/parser
Game↔Platform exact key-set join
platform executable resolution/security preflight
immutable PlatformLaunchPlan
Main-facing LogicalGameBootstrap projection
Main-facing RuntimeHosting implementation
Host-owned Runner/bootstrap/supervision integration
Runner provisioning integration point
```

They solve only Subsystem Runtime Game PREPARE + launch capability。

Must not expand into Renderer/DataBroker/Content/Platform mega-package/universal launcher registry。

---

## 6. No Universal Launcher / RPC Schema

Do not generalize current similarity into：

```text
PlatformLaunchOptions
launcher.type
options:any
PreparedPlatformGame universal DTO
GenericRpcPeer
GenericSchemaCodec
UniversalProtocolSession
```

Runtime Control may have internal dispatcher/schema helpers，but M3 MUST NOT publish a generic JSON-RPC framework。Shared semantics are specific protocol/profile mechanics, not a prediction that Renderer/Data use identical application APIs。

---

## 7. Definition Module vs Runner

```text
Business Definition Module
    .mjs
    default SubsystemDefinitionFactory
    author-level business implementation

Host-owned Runner
    physical Process/Worker entry
    imports exact plan-selected module
    constructs role-local ports
```

```text
business module != Node process entry
business module != Worker constructor entry
```

Hostra/PWA artifacts MAY differ；ABI/formal semantics/business-observable result must be equivalent。

---

## 8. Host Policy Injection

Game/platform config MAY select installation business artifact；Host policy injects：

```text
Node executable / Worker Runner entry
security policy
bootstrap credential sources
resource/timeouts
Control/provisioning facilities
CSP/same-origin policy
```

Runtime Control receives already-established `MessageCarrier` and injected finite scheduler/deadline values；it does not decide executable/transport establishment policy。

Manifest cannot override trusted Runner/security boundary。

---

## 9. Technical Adapter / Integration

Candidates：

```text
@loomrealm/launcher-node
@loomrealm/transport-websocket
@loomrealm/transport-messageport
@loomrealm/content-fs
@loomrealm/content-http
@loomrealm/content-service-worker
```

Single capability only：

```text
transport-* != Runtime Control protocol
transport-* != DataConnectionBroker
launcher-node != Game Package/Hostra Game Launcher
content-http != Content semantics
```

Adapters establish/deliver `MessageCarrier` and physical facts；they do not parse Runtime Control domain methods or implement retry/recovery。

---

## 10. Platform Provisioning Placement

System DataConnectionBroker realizes current Main `S/G/dataProfile` physical carrier。

```text
Hostra
    Broker + Runner provisioning IPC + transport-websocket

PWA
    Broker + Worker provisioning + transport-messageport
```

Provisioning interface/encoding stays app-local unless a real independent interoperability boundary appears。

Never place provisioning into Runtime Control、Subsystem author API、Renderer Control Snapshot、Game Package、Wire/Foundation。

Launcher package may hold Runner-side provisioning integration point，not DataAuthority/full Broker。

---

## 11. Business Packages

Example：

```text
@loomrealm/map
```

Dependency fixed：

```text
map → @loomrealm/subsystem
```

MUST NOT：

```text
map → game-package
map → game-launcher-*
map → subsystem/host
map → runtime-control
map → platform adapter
```

Build artifact MAY vary by platform；path/bytes are not application identity。

---

## 12. Platform Composition Roots

```text
apps/desktop
apps/pwa
apps/cli
```

Desktop：

```text
Hostra Launcher prepare
Main/Renderer roles
Runtime/Renderer Control WS adapters
Runner provisioning IPC
Data Broker/Data WS
fs/HTTP Content
business artifacts
```

PWA：

```text
PWA Launcher prepare
Main/Renderer roles
Runtime/Renderer Control MessagePort adapters
Worker provisioning
Data Broker/MessageChannel
SW/Fetch Content
business artifacts
```

Composition root MAY depend on all lower-level packages but MUST NOT duplicate Game/Launcher/protocol/domain validation semantics。

---

## 13. Port Placement Rule

```text
protocol-specific mechanics/input
    → owning protocol package

Core ↔ Platform capability/fact
with stable platform-neutral semantics
    → @loomrealm/platform-ports

role-specific policy/orchestration
    → owning role integration surface

only one app glue consumes
    → app internal
```

A single Core role consumer does not by itself make a cross-Platform capability role-owned；ownership follows the semantic boundary, not consumer count alone。

Thus：

- M4 `DeadlineScheduler` / `RuntimeControlBinding` live in `@loomrealm/platform-ports` because Core consumes them while Hostra/PWA may realize them differently；
- Runtime Control keeps its own structural scheduler type and does not become a dependency of `platform-ports`；
- `SubsystemDataBinding` exact Platform contract is deferred to M8 and is not an M4 host-owned placeholder；
- `RendererDataBinding` exact placement waits for its real consumer closure；
- `DataConnectionBroker` stays outside subsystem；
- RuntimeHosting concrete implementation lives in matching launcher；
- Main only sees abstract RuntimeHosting port；
- `LogicalGameBootstrap` exact type placement waits for M5/M6 smallest Main-facing surface。

---

## 14. Dependency Graph

完整图必须同时显示 capability package 与 role package 的多分支关系：

```text
foundation ─────→ platform-ports ─────→ main / subsystem-host
 │
 ├───────────────────────┐
 │                       ↓
wire ─────────────→ runtime-control
 │                        ↓
 │                main / subsystem-host
 │                        │
 │                        └──────────────┐
 │                                       │
 ├──────────────→ data ─────────────→ subsystem
 │                    │                  ↑
 │                    ├─ input slice ────┤
 │                    └─ render slice ───┤
 │                                       │
 ├────────────→ content ─────────────────┘
 │
 └→ game-package
        ↓
   game-launcher-hostra / game-launcher-pwa
        ↓
      apps/*

main
    → runtime-control / renderer-control / wire as required

subsystem
    author root → data/content/foundation as exposed by SDK
    host        → platform-ports + runtime-control + role-local policy/integrations

renderer
    → renderer-control / data / content / foundation as required

map
    → subsystem author root
```

这张图表达的是 ownership/dependency，不表达 milestone completion。比如 `subsystem-host → runtime-control` 在 M4首先落地，但 `subsystem → data/content` 的实现会在后续 milestone继续完成。

Forbidden：

```text
main → game-package
main → game-launcher-*
map/business → game-package / launcher / runtime-control
runtime-control → main/subsystem implementation
runtime-control → WebSocket/MessagePort/Worker
runtime-control → Game Package/Launcher
wire/foundation → domain authority
subsystem author root → concrete transport
main/renderer/subsystem → apps/*
contract → role implementation
```

---

## 15. Target Workspace

Demand-driven：

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
├── launcher-node/
├── transport-websocket/
├── transport-messageport/
├── content-fs/
├── content-http/
├── content-service-worker/
└── map/

apps/
├── desktop/
├── pwa/
└── cli/
```

Do not pre-create package only because target graph imagines it。

---

## 16. Package Semver / Protocol Version

```text
npm semver != protocol/profile version
```

ADR 0021 occurs before first conformant Runtime Control compatibility obligation，therefore current v1 is directly corrected；no fake Runtime Control v2/compat parser。

After real compatibility obligation exists，incompatible wire/application semantics require normal protocol/profile version/migration。

---

## 17. Conformance Ownership

```text
game-package tests
    common Game Entry/document snapshot

runtime-control tests
    Control/Frame protocol mechanics
    bounded profile validation
    one reader/writer
    strict-monotonic IDs
    deadline/terminal/Response barrier
    no role authority implementation

subsystem host/runtime-frame tests (M4)
    protocol outcome → local Frame/business control-flow mapping
    Runtime Control binding/terminal/mutation-gate behavior

subsystem data/input/render/content tests (M8/M10/M11/M12)
    DataPlane current/fresh-carrier behavior
    Frame-scoped input interest/receive gate
    Render Domain publication/lifetime
    ContentClient role mapping

main tests
    Runtime/Frame authority transactions/unwind
    protocol outcome → Main authority commit mapping

game-launcher-hostra/pwa tests
    platform Game PREPARE + RuntimeHosting/Runner integration
```

Repository-level：transport binding equivalence、Runner/provisioning integration、Platform E2E、cross-platform abstract trace。

---

## 18. Core Rules

1. Foundation/Wire remain low-level orthogonal primitives；
2. Game Package is document validation capability，not Runtime role；
3. Runtime Control is protocol mechanics capability，not Main/Subsystem authority；
4. Runtime Control depends exactly on Foundation + Wire and publishes root-only first surface；
5. one Runtime Control connection = one reader/dispatcher + one serialized writer；
6. same-sender Control+Frame Request IDs strict monotonic and never reused/wrapped；
7. source duplicate JSON semantics follow Wire；domain package must not create second parser；
8. Response causal barrier belongs to Runtime Control mechanics，application commit remains role-owned；
9. M3 scheduler stays package-local until real reuse justifies promotion；
10. Runtime-product Game consumers are matching Platform Launchers；
11. Main does not depend on Game Package/concrete Launcher；
12. Host-owned Runner and Definition Module remain distinct；
13. Subsystem author/host surface remain distinct；business never imports Runtime Control directly；
14. `@loomrealm/subsystem` is a complete role SDK boundary, not a Runtime Control wrapper；
15. milestone grouping describes implementation slices and MUST NOT redefine package responsibility；
16. M4 closes the Subsystem Runtime/Frame slice；M8/M10/M11/M12 continue Data/Input/Render/Content implementation in the same role package；
17. Platform provisioning stays in correct integration layer；
18. apps are complete composition roots；
19. packages split only for real consumer/replacement/publish value；
20. Hostra/PWA equivalence compares logical/semantic outcome，not artifact identity。
