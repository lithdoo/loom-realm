# 独立分包与发布架构

> 层级：实施计划  
> 状态：Active Design / Tracking  
> 稳定程度：Evolving  
> 主要定义：primitive、document/contract capability、role、platform launch integration、technical adapter/Runner integration、composition root 与 business package 的拆分原则  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[模块设计目录](../20-modules/README.md)  
> 被实现：[仓库与目录方案](./repository-layout.md)  
> 最近复核：2026-08-21

本文是 package/publish boundary 的主要事实源；repository layout只实现本文，不反向定义它。

```text
Protocol boundary
!= npm package boundary
!= Runtime process boundary
!= Platform boundary
```

---

## 1. Dependency Layers

Current low-level primitives feed multiple independent capability branches：

```text
@loomrealm/foundation        @loomrealm/wire
        \                         /
         \                       /
          └── @loomrealm/runtime-control
                     ↓
              Main / Subsystem Host

@loomrealm/wire
        ↓
@loomrealm/game-package
        ↓
matching game-launcher-*
        ↓
apps/* composition
```

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

## 3. Document / Contract Capability Packages

```text
@loomrealm/game-package
@loomrealm/runtime-control
@loomrealm/renderer-control
@loomrealm/data
@loomrealm/content
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

M3 scheduler stays a package-local injected port；do not expand Foundation Clock for one consumer。

### `data`

```text
Renderer Data Profile v1
Data Connection v1
User Input v1
Render Update v1
```

Profile composition does not merge child identity/lifecycle/authority。

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
    RuntimeControlBinding
    SubsystemDataBinding
    SubsystemLaunchContext
```

`@loomrealm/subsystem/host` is the first real Subsystem-side consumer of Runtime Control typed peer；it maps protocol mutation-pending state into ordinary-input gating/business control flow。

Business package MUST NOT depend on `/host`、Game Package、Launcher、Runtime Control directly。

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
single role consumes
    → role package integration surface

multiple stable independent consumers
    → smallest shared capability package

only one app glue consumes
    → app internal
```

Thus：

- Runtime Control scheduler remains local M3 port while only Runtime Control needs it；
- `SubsystemDataBinding` may live in subsystem host surface；
- `RendererDataBinding` may live in renderer integration surface；
- `DataConnectionBroker` stays outside subsystem；
- RuntimeHosting concrete implementation lives in matching launcher；
- Main only sees abstract RuntimeHosting port；
- `LogicalGameBootstrap` exact type placement waits for M5/M6 smallest Main-facing surface。

---

## 14. Dependency Graph

```text
foundation ───────────────┐
                          ↓
wire ─────────────→ runtime-control
 │                        ↓
 │               main / subsystem-host
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
    host        → runtime-control + role-local integrations

renderer
    → renderer-control / data / content / foundation as required

map
    → subsystem author root
```

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

subsystem host tests
    protocol outcome → local Frame/input/business control-flow mapping

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
14. Platform provisioning stays in correct integration layer；
15. apps are complete composition roots；
16. packages split only for real consumer/replacement/publish value；
17. Hostra/PWA equivalence compares logical/semantic outcome，not artifact identity。
