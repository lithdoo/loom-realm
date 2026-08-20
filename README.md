# LoomRealm

LoomRealm 是一个通过只读 Game Package 声明**逻辑游戏拓扑**、由 Main 编排独立 Subsystem Runtime，并由各 Platform Launcher/Composition 在 Hostra Desktop、PWA 等物理环境中完成 executable binding 与运行承载的模块化游戏运行平台设计项目。

第一阶段使用 RPG Maker XP / Pokémon Essentials v21.1 地图兼容作为 `loom.map` Subsystem 的纵向验证场景。

## 设计文档

推荐入口：

- [产品设计总览](./doc/00-overview/product-vision.md)
- [文档分层与变更规则](./doc/00-overview/document-governance.md)
- [系统架构总览](./doc/10-architecture/system-overview.md)
- [平台组合系统](./doc/10-architecture/platform-composition-system.md)
- [运行承载系统](./doc/10-architecture/runtime-hosting-system.md)
- [正式契约目录](./doc/15-contracts/README.md)
- [Game Package v1](./doc/15-contracts/game-package-v1.md)
- [Hostra Game Launcher / Node Runner Profile v1](./doc/15-contracts/nodejs-launcher-profile-v1.md)
- [PWA Game Launcher / Worker Runner Profile v1](./doc/15-contracts/pwa-launcher-profile-v1.md)
- [Subsystem Control Protocol v1](./doc/15-contracts/subsystem-control-protocol-v1.md)
- [Runtime Control Application Profile v1](./doc/15-contracts/runtime-control-profile-v1.md)
- [Frame / Call Protocol v1](./doc/15-contracts/frame-call-protocol-v1.md)
- [Frame / Call v1 Conformance Profile](./doc/15-contracts/frame-call-conformance-v1.md)
- [独立分包与发布架构](./doc/30-implementation/package-architecture.md)
- [实施计划目录](./doc/30-implementation/README.md)
- [完整阅读指南](./doc/README.md)

## Game / Platform Launch 闭环

```text
Game Entry
    Descriptor {key}
    initial target/input
        │
        ├──────────────► Main logical topology
        │
        └──────────────► Current Platform Launch Manifest
                              ├── launch.hostra.json
                              └── launch.pwa.json
                                      ↓
                               exact key-set join
                               full executable resolution
                               hosting/security preflight
                                      ↓
                            immutable PlatformLaunchPlan
                                      ↓
                               Main launch(key)
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
Game common config不包含 module
Main不接触 module/path/URL
current Platform manifest独立拥有 executable binding
完整 game+platform preflight未闭合前不得产生 business Runtime side effect
```

Phase 1：

```text
keys(GameEntry.subsystems)
=
keys(CurrentPlatformLaunchManifest.subsystems)
```

Hostra/PWA可以选择不同 Definition artifact，但必须实现相同 `SubsystemDefinitionFactory` ABI，并在同一 logical scenario下得到等价 application result。

## 核心模型

```text
Game logical topology
→ Platform preflight plan
→ Main launches required Runtime keys
→ Subsystem Control binds identity / ready / shutdown / failed
→ Runtime Control Profile binds Control v1 + Frame / Call v1
→ Frame / Call manages Main-owned call/input Context
→ Main publishes committed Renderer authority
→ Platform Data Broker realizes authorized Renderer↔Subsystem carriers
→ User Input and Render Update run on independent Data protocol domains
→ Content uses an independent readonly plane
```

核心边界：

```text
Game topology != Platform executable binding
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

## 当前契约状态

```text
Game Package v1                         Active / Normative / Stabilizing
Hostra Game Launcher / Node Runner v1   Active / Normative / Stabilizing
PWA Game Launcher / Worker Runner v1    Active / Normative / Stabilizing
Subsystem Control Protocol v1           Active / Normative / Stabilizing
Runtime Control Application Profile v1  Active / Normative / Stabilizing
Frame / Call Protocol v1                Active / Normative / Frozen
Main ⇄ Renderer Control v1              Draft / near closure
Renderer Data Profile v1                Draft / stabilizing
Renderer ⇄ Subsystem Data Connection v1 Draft / lifecycle closed
User Input v1                           Core semantic closure reviewed
Render Update v1                        Closure candidate
Content API v1                          Active / Normative / Evolving
```

本次 Game/Launcher 变更直接更新 current v1：

```text
no v2
no legacy {key,module} Game parser
no deprecated module alias
no universal launcher options bag
```

历史 shape只留在明确标注 supersession 的 ADR/Git history。

## Runtime Control Profile v1

第一阶段同一 Main ⇄ Subsystem Control Connection 静态组合：

```text
Subsystem Control v1
+
Frame / Call v1
```

`subsystem.hello.protocolVersions`只协商 Subsystem Control；Frame v1不增加独立 hello/version handshake。

```text
launch != connected != identified != ready
ready != Data Connection exists
```

实际 Hostra WebSocket / PWA MessagePort carrier 由 Platform adapter/composition建立，不进入 Runtime/Renderer authority snapshot。

## Frame / Call v1

Frame v1继续 Frozen：

```text
exact seven RPC
Response-before-dependent-RPC
activate/resume ACK-before-publication
Success = known commit
Explicit Error = protocol-defined known no-commit/fatal
Timeout/loss = ambiguous → Runtime failure
no retry/replay
lowest failed-runtime occurrence → whole suffix fixed-point unwind
accepted outcome preserved
fresh surviving Caller resume
```

Author SDK进一步要求：

```text
child completed/cancelled/failed → resolve FrameOutcome
pre-commit recoverable rejection → typed reject
Runtime-fatal/ambiguous → MUST NOT re-enter business continuation
```

正式兼容要求见 [Frame / Call v1 Conformance Profile](./doc/15-contracts/frame-call-conformance-v1.md)。

## Data / Input / Render

```text
Main ⇄ Renderer Control
    committed Runtime / Stack / Activation / InputTarget / DataAuthority

Renderer ⇄ Subsystem Data Connection
    Session + current Renderer + subsystemKey + generation + dataProfile

User Input
    Subsystem → Renderer: Frame Interest Registry
    Renderer → Subsystem: State / Event / Reset

Render Update
    Subsystem → Renderer: Registry / Snapshot / Patch / Event
```

当前：

```text
DataAuthority {subsystemKey,generation,dataProfile}
loomrealm.renderer-data/1 = Connection1 + Input1 + Render1
```

```text
Data reconnect不能修复 Runtime failure或 Frame unwind
Data provisioning failure不自动失败 Runtime/Frame
Frame lifecycle不能推导 Render Domain lifecycle
```

Hostra late Data provisioning走 Runner IPC + Data WebSocket；PWA走 Worker provisioning + transferred MessagePort。

## Content / Execution Boundary

必须区分：

```text
Platform executable capability
    PlatformLaunchPlan + trusted Runner loads selected Definition Module

Readonly Content API
    logical data/resource access only
```

Content API不得成为任意 executable path/capability入口。

Runtime bootstrap token、Runner bootstrap、Data ticket/Port authority、Content credential相互独立。

## 分包与发布

实现采用 monorepo + 独立能力包：

```text
@loomrealm/game-package
    common logical topology

@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
    narrow platform Runtime launch capabilities

role/capability packages
    runtime-control / renderer-control / data / content
    main / subsystem / renderer

technical adapters
    launcher-node / transport-* / content-*

apps/desktop
apps/pwa
    full composition roots
```

```text
Protocol boundary != npm package boundary != runtime process boundary != platform boundary
npm package semver != protocol version
```

两个 launcher package不会扩张成 Renderer/DataBroker/Content platform mega-package。

详细规则见 [独立分包与发布架构](./doc/30-implementation/package-architecture.md)。

## Hostra / PWA Runtime 边界

Hostra：

```text
HostraLaunchPlan
→ Host-selected Node executable
→ Host-owned Node Runner
→ planned Definition Module
→ Runtime Control WebSocket
→ late Data provisioning IPC
```

PWA：

```text
PwaLaunchPlan
→ Host-owned Worker Runner entry
→ planned Definition Module
→ Runtime Control MessagePort
→ late Data Port provisioning
```

共同：

```text
Runner entry is Host-owned
business module is not Process/Worker entry
stopped only from actual termination observation
no automatic Runtime restart in v1
```

## 当前实现资产 / 实施位置

当前仓库的实现状态：

```text
@loomrealm/foundation
    Implemented Baseline / Core Contract Frozen

@loomrealm/wire
    Implemented Baseline / Core Contract Frozen
    M2 Game Package / M3 Runtime Control consumer qualification pending

@loomrealm/game-package
    implementation pending

@loomrealm/runtime-control
    implementation pending

@loomrealm/subsystem
    implementation pending

@loomrealm/fsdb-http
    v1 Release Candidate implementation + tests

Pokémon Essentials v21.1 → FSDB fixture importer
    implemented / local official-corpus RC qualified
```

核心 Runtime vertical slice仍按 `M0..M16` 交付计划推进。Foundation/Wire的本地实现基线已关闭；下一实现门是 M2 Game Package，随后由 M3 Runtime Control完成 Wire Stage F 的第二个真实消费者验证。

本次 launch-boundary reset直接更新 M0/M2/M6/M15 等实施前提：Game Package只产出 logical topology，Hostra/PWA各自负责 executable binding/preflight/Runner。

## 文档站点

GitHub Pages：`https://lithdoo.github.io/loom-realm/`

需要 Node.js 20+：

```bash
npm install
npm run docs:dev
npm run docs:build
npm run docs:check-links
```
