# LoomRealm

LoomRealm 是一个通过只读 Game Entry 声明 **platform-neutral logical Subsystem topology**、由 matching Platform Launcher 完成 common Game validation 与 current-platform executable PREPARE、由 Main 管理 Session/Runtime/Frame/Data authority，并由 Hostra Desktop / PWA 等 Platform Composition 实现真实物理承载的模块化游戏运行平台。

第一阶段使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` Subsystem 的纵向验证场景。

---

## 设计文档

推荐入口：

- [产品设计总览](./doc/00-overview/product-vision.md)
- [文档分层与变更规则](./doc/00-overview/document-governance.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [平台组合系统](./doc/10-architecture/platform-composition-system.md)
- [运行承载系统](./doc/10-architecture/runtime-hosting-system.md)
- [运行时启动与连接建立系统](./doc/10-architecture/runtime-bootstrap-system.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Game Package v1](./doc/15-contracts/game-package-v1.md)
- [Runtime Control Application Profile v1](./doc/15-contracts/runtime-control-profile-v1.md)
- [Frame / Call v1](./doc/15-contracts/frame-call-protocol-v1.md)
- [Main ⇄ Renderer Control v1](./doc/15-contracts/main-renderer-control-v1.md)
- [Hostra Game Launcher / Node Runner Profile v1](./doc/15-contracts/nodejs-launcher-profile-v1.md)
- [PWA Game Launcher / Worker Runner Profile v1](./doc/15-contracts/pwa-launcher-profile-v1.md)
- [独立分包与发布架构](./doc/30-implementation/package-architecture.md)
- [第一阶段交付计划](./doc/30-implementation/phase-1-delivery-plan.md)
- [ADR 0020：Game Entry 消费边界归 Platform Launcher](./doc/decisions/0020-game-entry-consumer-boundary.md)
- [ADR 0021：Runtime Control 首次实现前收口](./doc/decisions/0021-runtime-control-preimplementation-closure.md)
- [ADR 0027：Renderer Control v1 / M7 首次实现前冻结](./doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)
- [M7 / 01 — Renderer Control Package](./M7_01_RENDERER_CONTROL_PACKAGE.md)
- [M7 / 02 — Main Authority Projection + Binding](./M7_02_MAIN_AUTHORITY_PROJECTION.md)
- [M7 / 03 — Renderer Control Holder](./M7_03_RENDERER_CONTROL_HOLDER.md)
- [M7 / 04 — Vertical Integration](./M7_04_VERTICAL_INTEGRATION.md)
- [M7 / 05 — Qualification and Closure](./M7_05_QUALIFICATION_CLOSURE.md)
- [完整阅读指南](./doc/README.md)

---

## Game / Platform / Main Bootstrap 闭环

```text
Game installation / source
        ↓
create HostraPlatform / PwaPlatform
        ↓
platform.prepareGame(source)
    → matching game-launcher-* component
    → @loomrealm/game-package validation
    → current Platform Launch Manifest
    → exact key-set join / executable resolution / security preflight
    → immutable PlatformLaunchPlan
        ↓
concrete Platform installs LaunchPlan privately
+ returns immutable LogicalGameBootstrap
        ↓
runMain({bootstrap, platform, policy})
        ↓
Main generates/registers Runtime bootstrap material
        ↓
platform.runtimeHosting.launch({subsystemKey, bootstrapToken})
        ↓
HostedRuntime / Host-owned Runner
        ↓
platform-selected Definition Module
        ↓
@loomrealm/subsystem/host
```

关键规则：

```text
Game Entry document != Main bootstrap model
Game Package != Runtime role
Product bootstrap caller → matching Launcher
Launcher → @loomrealm/game-package
Main ✗ @loomrealm/game-package
Business ✗ Game Package / Launcher
```

Game common config不包含 `module`；Main不接触 `formatVersion`、Game document brand、module/path/URL、Node/Worker options。

---

## Game Package v1

Current Game Entry：

```ts
interface GameEntryV1 {
  readonly formatVersion: 1;
  readonly initial: {
    readonly subsystem: string;
    readonly input: JsonValue;
  };
  readonly subsystems: readonly {
    readonly key: string;
  }[];
}
```

`@loomrealm/game-package` 是 document validation capability：

```text
untrusted JSON text/value
→ @loomrealm/wire representation validation
→ closed Game schema / exact key-set / initial validation
→ detached deeply immutable ValidatedGameEntryV1
```

Primary Runtime-product consumers：

```text
@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
```

Hostra consumer 已在 M6 real product vertical qualification；PWA consumer 留到 M15。Tooling MAY直接消费；Main/Business不直接消费。

---

## Main-facing Logical Bootstrap

Concrete Platform 的 `prepareGame()` 通过 matching Launcher 完成 full PREPARE 后，只向 Main投影：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

它不包含：

```text
formatVersion
ValidatedGameEntryV1 brand
PlatformLaunchPlan
module/path/URL
Node/Worker/Runner/Port
```

PlatformLaunchPlan 保持 Platform-private；Main 通过 plan-bound `RuntimeHosting` 使用它。

---

## Hostra / PWA Launch Boundary

Hostra：

```text
HostraPlatform.prepareGame()
→ @loomrealm/game-launcher-hostra component
→ game-package validation + launch.hostra.json
→ exact join / safe filesystem resolution
→ HostraLaunchPlan installed privately + LogicalGameBootstrap returned
→ HostraPlatform exposes Node Runner RuntimeHosting
```

PWA：

```text
PwaPlatform.prepareGame()
→ @loomrealm/game-launcher-pwa component
→ game-package validation + launch.pwa.json
→ exact join / installation + same-origin resolution
→ PwaLaunchPlan installed privately + LogicalGameBootstrap returned
→ PwaPlatform exposes Worker Runner RuntimeHosting
```

两个 launcher package 是 concrete Platform 内部的窄 Game PREPARE / Runner integration components，不是完整 Platform object，更不是 Renderer/DataBroker/Content mega-package。

Phase 1：

```text
keys(GameEntry.subsystems)
=
keys(CurrentPlatformLaunchManifest.subsystems)
```

Full PREPARE 未闭合前：

```text
Process/Worker creation = 0
business Definition import count = 0
Runtime Control establishment = 0
```

---

## Runtime Control / Frame / Renderer Control / Data

Runtime Control：

```text
Subsystem Control v1
+ Frame / Call v1
= Runtime Control Application Profile v1
```

M3 current mechanics：

```text
already-established MessageCarrier<string>
→ bounded Wire/Profile decode
→ exactly one connection-wide reader/dispatcher
→ Control + Frame role dispatch

all outbound messages
→ one serialized writer
```

Same sender / same Control Connection：

```text
Request IDs positive safe integer
strictly monotonically increasing
Control + Frame shared namespace
never reuse / never wrap
```

Deadline / terminal：

```text
finite deadline covers send + Response wait
pending settlement first-wins
terminal first-wins
late Response diagnostics only
no retry/replay/reconnect
```

Frame causal barrier：

```text
frame.call Response send accepted
→ Child initialize / activate

frame.return Response send accepted
→ close / resume
```

Runtime Control owns this protocol mechanics but not Main Stack authority。

Source duplicate JSON members follow frozen `@loomrealm/wire` / ECMAScript `JSON.parse` observable semantics；Runtime Control does not add a second JSON parser。

Frame / Call v1 remains Frozen：

```text
ACK-before-publication
post-commit no rollback
Timeout/loss ambiguous → Runtime failure
whole-suffix fixed-point unwind
```

Renderer Control v1 is Frozen by ADR 0027：

```text
Main committed Runtime / Stack / Activation / InputTarget / DataAuthority
→ full RendererAuthoritySnapshotV1
→ renderer.hello id=1 + renderer.state
→ one current Renderer participant
→ 0..1 inFlight + 0..1 pendingLatest
```

M7 Main implementation固定 `dataAuthorities=[]`；真实 DataAuthority generation/profile policy 从 M8 开始。

Current Data Profile：

```text
loomrealm.renderer-data/1
= Data Connection v1 + User Input v1 + Render Update v1
```

```text
Data provisioning/loss != Runtime failure / Frame unwind
```

Hostra late Data provisioning via Runner IPC + Data WebSocket；PWA via Worker provisioning + transferred MessagePort。

---

## Content / Execution Boundary

必须区分：

```text
Platform executable capability
    PlatformLaunchPlan + trusted Runner loads selected Definition Module

Readonly Content API
    logical data/resource access only
```

Content API 不得成为 arbitrary executable path/capability。

Runtime bootstrap token、Renderer Control token、Data ticket/Port、Content credential相互独立。

---

## 分包与依赖

下图箭头表示 dependency/provider → consumer：

```text
@loomrealm/foundation ─────→ @loomrealm/platform-ports ─────→ Main / Subsystem Host
       │
       ├──────────────────────┐
       │                      ↓
@loomrealm/wire ───────→ @loomrealm/runtime-control ───────→ Main / Subsystem Host
       │
       ├──────────────→ @loomrealm/renderer-control ───────→ Main / Renderer
       │
       └──────────────→ @loomrealm/game-package
                               ↓
@loomrealm/game-launcher-hostra / @loomrealm/game-launcher-pwa
                               ↓
                       apps/desktop / apps/pwa
```

Role graph：

```text
@loomrealm/main
    → platform-ports + runtime-control + renderer-control + wire

@loomrealm/renderer
    → renderer-control   // M7 minimal holder implemented / qualified

@loomrealm/subsystem/host
    → platform-ports + runtime-control + role-local policy/integrations

@loomrealm/subsystem
    → author-facing data/content/foundation capabilities

@loomrealm/map
    → @loomrealm/subsystem
```

Forbidden：

```text
runtime-control → Main/Subsystem implementation
renderer-control → Main/Renderer/Platform implementation
runtime-control / renderer-control → WebSocket/MessagePort/Worker
main → game-package / concrete launcher / renderer role
business → game-package / launcher / protocol packages
```

---

## 当前实现状态

```text
@loomrealm/foundation
    Implemented Baseline / Core Contract Frozen

@loomrealm/wire
    Implemented Baseline / Core Contract Frozen

@loomrealm/game-package
    Implemented Baseline / Core Contract Frozen
    M2 local closure complete
    M6 Hostra real launcher consumer qualified
    M15 PWA real launcher consumer pending

@loomrealm/runtime-control
    Implemented Baseline / Core Contract Frozen
    M3 local closure complete
    M4 Subsystem + M5 Main real role consumers qualified

@loomrealm/platform-ports
    Implemented Baseline through M5
    M4/M5 slices qualified
    M7 OpaqueMaterialGenerator + optional RendererControlBinding implemented / qualified

@loomrealm/subsystem
    M4 Runtime/Frame Core Implemented
    M4 Host Runtime Control consumer qualified
    M8/M10/M11/M12 later capability slices pending

@loomrealm/main
    M5 Runtime/Frame Authority Implemented Baseline
    Main Runtime Control consumer qualified
    M7 Renderer authority projection/currentness implemented / qualified

@loomrealm/renderer-control
    M7 concrete asymmetric peers implemented / qualified
    Protocol v1 remains Frozen

@loomrealm/renderer
    M7 minimal Control holder implemented / qualified

@loomrealm/data
    Package-local Core Baseline Implemented
    M8 role integration pending

@loomrealm/game-launcher-hostra
    M6 Implemented / Qualified Baseline
    real Node Runner + Runtime Control WebSocket vertical qualified

@loomrealm/game-launcher-pwa
    design/PREPARE component ready; M15 implementation pending

@loomrealm/fsdb-http
    v1 Release Candidate implementation + tests
```

下一实现门：

```text
M8 Renderer Data role integration
    starts from the qualified M7 current Renderer participant
    + RendererDataAuthorityV1 wire shape
```

M7 不要求 Hostra BrowserWindow/Renderer WebSocket 或 PWA MessagePort physical realization；它们分别在 M14/M16 完成。

---

## Cross-platform Equivalence

Hostra/PWA share：

```text
same Game Entry logical topology
same resulting LogicalGameBootstrap semantics
same subsystem keys
same SubsystemDefinitionFactory ABI
same Runtime Control / Frame formal semantics
same Renderer Control formal semantics
same logical scenario/business input
same business-observable result
```

May differ：

```text
Platform Launch Manifest
Definition artifact/path/bytes
PID vs Worker id
WebSocket vs MessagePort
IPC/ticket vs Port transfer
HTTP vs Service Worker internals
```

---

## Current v1 Governance

First conformant compatibility obligation has not yet formed for the Game/Launcher reset or current Renderer Control first implementation，so current v1 corrections are made directly only with ADR provenance and document-governance propagation：

```text
no fake v2
no legacy {key,module} Game parser
no deprecated module alias
no Main compatibility adapter
no universal launcher options/prepared bag
no Runtime Control second JSON parser
no legacy non-monotonic Request-ID compatibility mode
no BootstrapTokenGenerator compatibility alias after M7 OpaqueMaterialGenerator migration
no generic Renderer RPC/Store/currentness framework
```

ADR 0021 does not reopen Frame seven methods/authority/Outcome/commit/unwind semantics；ADR 0027 freezes Renderer Control v1/M7 authority、Binding、hello/currentness、replacement与 representation isolation semantics。

History/provenance留在 ADR/Git；current docs保持单一事实源。Real compatibility obligation形成后，incompatible changes return to normal version/migration governance。

---

## 文档站点

GitHub Pages：`https://lithdoo.github.io/loom-realm/`

需要 Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
