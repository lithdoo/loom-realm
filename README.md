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
- [Hostra Game Launcher / Node Runner Profile v1](./doc/15-contracts/nodejs-launcher-profile-v1.md)
- [PWA Game Launcher / Worker Runner Profile v1](./doc/15-contracts/pwa-launcher-profile-v1.md)
- [独立分包与发布架构](./doc/30-implementation/package-architecture.md)
- [第一阶段交付计划](./doc/30-implementation/phase-1-delivery-plan.md)
- [ADR 0020：Game Entry 消费边界归 Platform Launcher](./doc/decisions/0020-game-entry-consumer-boundary.md)
- [ADR 0021：Runtime Control 首次实现前收口](./doc/decisions/0021-runtime-control-preimplementation-closure.md)
- [完整阅读指南](./doc/README.md)

---

## Game / Platform / Main Bootstrap 闭环

```text
Game installation / source
        ↓
Current Platform Game Launcher PREPARE
    ├── @loomrealm/game-package
    │       Game Entry parse / validate
    ├── current Platform Launch Manifest
    │       ├── Hostra: launch.hostra.json
    │       └── PWA:    launch.pwa.json
    ├── exact Game↔Platform key-set join
    ├── full executable resolution
    ├── installation/security containment
    └── hosting capability preflight
        ↓
immutable PlatformLaunchPlan
+
immutable LogicalGameBootstrap
        ↓
apps/* composition installs Main
        ↓
Main launch(subsystemKey)
        ↓
plan-bound RuntimeHosting
        ↓
Host-owned Runner
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

Tooling MAY直接消费；Main/Business不直接消费。

---

## Main-facing Logical Bootstrap

Matching Launcher 在 full PREPARE 后只向 Main投影：

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
@loomrealm/game-launcher-hostra
→ game-package validation
+ launch.hostra.json
→ exact join / safe filesystem resolution
→ HostraLaunchPlan + LogicalGameBootstrap
→ Node Runner RuntimeHosting
```

PWA：

```text
@loomrealm/game-launcher-pwa
→ game-package validation
+ launch.pwa.json
→ exact join / installation + same-origin resolution
→ PwaLaunchPlan + LogicalGameBootstrap
→ Worker Runner RuntimeHosting
```

两个 launcher package 是窄 Subsystem Runtime launch capabilities，不是 Renderer/DataBroker/Content Platform mega-package。

Phase 1：

```text
keys(GameEntry.subsystems)
=
keys(CurrentPlatformLaunchManifest.subsystems)
```

Full PREPARE 未闭合前：

```text
Process/Worker creation = 0
business Definition import = 0
Runtime Control establishment = 0
```

---

## Runtime Control / Frame / Data

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

Renderer Control publishes committed：

```text
Runtime / Stack / Activation / InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

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

Runtime bootstrap token、Runner bootstrap、Data ticket/Port、Content credential相互独立。

---

## 分包与依赖

```text
@loomrealm/foundation ─────→ @loomrealm/platform-ports ─────→ Main / Subsystem Host
       │
       ├──────────────────────┐
       │                      ↓
@loomrealm/wire ───────→ @loomrealm/runtime-control
       │                      ↓
       │             Main / Subsystem Host
       │
       └→ @loomrealm/game-package
               ↓
@loomrealm/game-launcher-hostra / @loomrealm/game-launcher-pwa
               ↓
       apps/desktop / apps/pwa
```

Role graph：

```text
@loomrealm/main
    → runtime-control / renderer-control / wire as required

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
runtime-control → WebSocket/MessagePort/Worker
main → game-package / concrete launcher
business → game-package / launcher / runtime-control
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
    M6/M15 real launcher consumer qualification pending

@loomrealm/runtime-control
    Implemented Baseline / Core Contract Frozen
    M3 local closure complete
    M4/M5 real role-consumer qualification pending

@loomrealm/platform-ports
    Implemented Baseline / Core Boundary Frozen / M4 Slice Frozen
    M4 Subsystem real consumer qualification pending
    M5+ exact ports Evolving

@loomrealm/data
    Package-local Core Baseline Implemented
    M8 role integration pending
    Full Profile conformance pending

@loomrealm/subsystem
    implementation pending

@loomrealm/main
    implementation pending

@loomrealm/game-launcher-hostra
    implementation pending

@loomrealm/game-launcher-pwa
    implementation pending

@loomrealm/fsdb-http
    v1 Release Candidate implementation + tests
```

下一实现门：

```text
M4 @loomrealm/subsystem/host
```

之后：

```text
M4 Subsystem author/host = first real Subsystem-side Runtime Control consumer
→ M5 Main = real Main-side Runtime Control consumer + authority slice
→ M6 Hostra Launcher (first real Game Package runtime-product consumer)
...
→ M15 PWA Launcher (second real Game Package consumer)
```

---

## Cross-platform Equivalence

Hostra/PWA share：

```text
same Game Entry logical topology
same resulting LogicalGameBootstrap semantics
same subsystem keys
same SubsystemDefinitionFactory ABI
same Runtime Control / Frame formal semantics
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

First conformant compatibility obligation has not yet formed for the Game/Launcher reset or M3 Runtime Control implementation mechanics，so current v1 is corrected directly with ADR provenance：

```text
no fake v2
no legacy {key,module} Game parser
no deprecated module alias
no Main compatibility adapter
no universal launcher options/prepared bag
no Runtime Control second JSON parser
no legacy non-monotonic Request-ID compatibility mode
```

ADR 0021 does not reopen Frame seven methods/authority/Outcome/commit/unwind semantics。

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
