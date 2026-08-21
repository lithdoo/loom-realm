# LoomRealm 设计文档

文档按定义依赖组织：

```text
产品目标
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

横向“相关”引用不应形成主要定义依赖环；被替代正文通过 ADR/Git 历史追溯。

---

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md)
2. [文档分层与变更规则](./00-overview/document-governance.md)
3. [系统架构总览](./10-architecture/system-overview.md)
4. [平台组合系统](./10-architecture/platform-composition-system.md)
5. [运行承载系统](./10-architecture/runtime-hosting-system.md)
6. [栈式运行系统](./10-architecture/stack-runtime-system.md)
7. [通信系统](./10-architecture/communication-system.md)
8. [渲染系统](./10-architecture/rendering-system.md)
9. [Subsystem 模型](./10-architecture/subsystem-model.md)
10. [运行时启动与连接建立系统](./10-architecture/runtime-bootstrap-system.md)
11. [Renderer–Subsystem 协议分层](./10-architecture/renderer-subsystem-protocol-layers.md)
12. [存储与内容系统](./10-architecture/storage-system.md)
13. [正式契约目录](./15-contracts/README.md)
14. [Game Package v1](./15-contracts/game-package-v1.md)
15. [Hostra Game Launcher / Node Runner Profile v1](./15-contracts/nodejs-launcher-profile-v1.md)
16. [PWA Game Launcher / Worker Runner Profile v1](./15-contracts/pwa-launcher-profile-v1.md)
17. [Subsystem Control v1](./15-contracts/subsystem-control-protocol-v1.md)
18. [Runtime Control Application Profile v1](./15-contracts/runtime-control-profile-v1.md)
19. [Frame / Call v1](./15-contracts/frame-call-protocol-v1.md)
20. [Frame / Call v1 Conformance](./15-contracts/frame-call-conformance-v1.md)
21. [Main ⇄ Renderer Control v1](./15-contracts/main-renderer-control-v1.md)
22. [Renderer Data Application Profile v1](./15-contracts/renderer-data-profile-v1.md)
23. [Renderer ⇄ Subsystem Data Connection v1](./15-contracts/renderer-subsystem-data-connection-v1.md)
24. [User Input v1](./15-contracts/user-input-v1.md)
25. [Render Update v1](./15-contracts/render-update-v1.md)
26. [Readonly Content API v1](./15-contracts/content-api-v1.md)
27. [模块设计目录](./20-modules/README.md)
28. [Main System](./20-modules/main-system/README.md)
29. [Game Package](./20-modules/game-package/README.md)
30. [Hostra Desktop Composition](./20-modules/desktop-host/README.md)
31. [PWA Composition](./20-modules/pwa-host/README.md)
32. [`loom.map`](./20-modules/loom-map/README.md)
33. [实施计划目录](./30-implementation/README.md)
34. [独立分包与发布架构](./30-implementation/package-architecture.md)
35. [仓库与目录方案](./30-implementation/repository-layout.md)
36. [测试策略](./30-implementation/testing-strategy.md)
37. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)
38. [ADR 索引](./decisions/README.md)
39. [ADR 0020：Game Entry 消费边界归 Platform Launcher](./decisions/0020-game-entry-consumer-boundary.md)
40. [ADR 0021：Runtime Control 首次实现前收口 current v1 mechanics](./decisions/0021-runtime-control-preimplementation-closure.md)

---

## 当前 Game / Launch 闭环

```text
Game installation / source
        ↓
matching Platform Launcher PREPARE
    ├── @loomrealm/game-package
    │       Game Entry {key...} + initial validation
    ├── current Platform Launch Manifest
    ├── exact Game↔Platform key-set join
    ├── all required executable resolution
    └── installation/security/hosting preflight
        ↓
immutable PlatformLaunchPlan
+
immutable LogicalGameBootstrap
────────────────────────────────────
first business Runtime side effect
        ↓
apps/* installs Main
        ↓
Main launch(key)
        ↓
plan-bound RuntimeHosting
        ↓
Host-owned Runner
        ↓
platform-selected Subsystem Definition Module
        ↓
@loomrealm/subsystem/host
```

Hostra使用 `launch.hostra.json`；PWA使用 `launch.pwa.json`。

Game Package是 Launcher共享的 document validation capability；Main不解析 Game Entry，也不持有 `formatVersion`/module/path/URL。

两个 Platform config schema独立，不建立 universal launcher option bag；Hostra/PWA Definition artifact MAY不同，只要求 same logical key / author ABI / formal semantics / business-observable result。

---

## Authority Boundary

```text
Game Package
    Game Entry document validation only

Runtime Control
    Control/Frame protocol mechanics
    connection-local state/correlation/deadlines/terminal

Main
    Launch Attempt/bootstrap credential authority
    Runtime/Frame/Activation/InputTarget/DataAuthority
    Runtime failure unwind

Platform Launcher
    executable binding
    exact join / zero-side-effect preflight
    PlatformLaunchPlan
    RuntimeHosting / Runner integration

Platform Composition
    complete physical Session
    carrier establishment
    Renderer/Data/Content/provisioning coordination

Subsystem Host
    local Frame/Input state + protocol/business mapping

Subsystem business
    business/Interest/Render authority through author SDK

Renderer
    read-only Main mirror + producer/replica
```

Module path、resolved path/URL、Node/Worker选项不进入 Main/application protocol。

---

## Runtime Control / Frame

```text
Runtime Control Profile v1
= Subsystem Control v1 + Frame / Call v1
```

Current M3 mechanics：

```text
MessageCarrier<string>
→ bounded UTF-8 JSON/Profile validation
→ one connection-wide reader/dispatcher
→ role-specific Main / Subsystem Host peers
```

Connection invariants：

```text
one inbound reader
Response correlation not blocked by role handler
one serialized outbound writer
Control + Frame same-sender Request IDs strictly monotonic
finite deadlines
pending/terminal settlement first-wins
late Response diagnostics only
no retry/replay/reconnect
```

Response causal barrier：

```text
frame.call Response send accepted
→ Child initialize / activate

frame.return Response send accepted
→ close / resume
```

Runtime Control提供 barrier/mechanics，不拥有 Main Stack application commit。

JSON source duplicate members follow frozen `@loomrealm/wire` / ECMAScript `JSON.parse` observable semantics；Runtime Control不建立第二套 parser。Parsed object仍必须满足 exact closed schema。

Frame v1 authority semantics remain Frozen：

```text
exact seven Requests
Main-owned Stack/Activation/InputTarget
ACK-before-publication
Success = known commit
recoverable Explicit Error = known no-commit
timeout/loss ambiguous → Runtime failure
no retry / post-commit no rollback
whole-suffix fixed-point failure unwind
```

`@loomrealm/subsystem/host` 在 M4 将 typed Runtime Control outcome/pending state映射成 local Frame/Input/business control-flow；business author root不直接依赖 Runtime Control。

---

## Renderer / Data

Main发布：

```text
DataAuthority {subsystemKey,generation,dataProfile}
```

当前：

```text
loomrealm.renderer-data/1
= Data Connection v1 + User Input v1 + Render Update v1
```

Profile改变必须 fresh generation。

Platform DataConnectionBroker只实现 current authority的 physical carrier；不拥有 generation/profile。

### Late provisioning

```text
Hostra
    Broker → Runner provisioning IPC → Data WebSocket

PWA
    Broker → Worker provisioning path → transferred MessagePort
```

Provisioning不是 Runtime Control/Renderer Control/Platform Launch Manifest/Data application protocol；失败不自动失败 Runtime或 unwind Frame。

---

## Unified Message Carrier

当前 message-oriented Control/Data Profiles统一：

```text
one carrier application unit
= one UTF-8 JSON text string
```

```text
WebSocket   text message
MessagePort postMessage(string)
Memory      string
```

Foundation treats string opaque；Wire owns generic JSON representation；profile/capability package owns domain limits/state semantics。

Structured Clone只用于 Platform bootstrap/Port transfer。

---

## User Input

```text
Effective(F,A,C)
=
current matching Data
∩ Main InputTarget(S,F,A)
∩ active/current Activation
∩ Interest[F]
∩ Producer(C)
```

Interest是 Subsystem-owned Frame-scoped config，不是 authority。

```text
fresh Activation → may reuse Interest config, never old Input State/Event
fresh Data       → remote Interest/State empty, republish/baseline
```

Control/Data无跨连接 total order。

---

## Render

```text
render.domains
render.snapshot
render.patch
render.event
```

Render Domain authority在 Subsystem；Frame/Data carrier不拥有 Domain lifecycle。

fresh carrier使用 current Registry + fresh Snapshots恢复 replica baseline。

---

## Content / Execution

```text
Platform executable resolution
    selected Definition Module only

Readonly Content API
    logical content/resource access only
```

这两个 capability可以复用 Installation Registry底层 primitive，但不能合并权限面。

---

## Business Portability

```text
@loomrealm/map → @loomrealm/subsystem
```

Business MUST NOT depend on：

```text
@loomrealm/subsystem/host
@loomrealm/runtime-control
game-package / game-launcher-hostra/pwa
WebSocket/MessagePort
Node/Worker Runner
Platform provisioning
launch.hostra.json / launch.pwa.json
```

Hostra/PWA可以绑定不同 Definition artifact；必须共享 logical key、author ABI、formal protocol semantics 与 business-observable result。

---

## Package / Platform Boundary

```text
Protocol boundary
!= npm package boundary
!= Runtime process boundary
!= Platform boundary
```

```text
foundation/wire             low-level primitives
game/runtime/data capability document/protocol mechanics
role packages               platform-neutral role APIs
runtime launch integration  game-launcher-hostra/pwa
technical adapters          transport/launcher-node/content mechanisms
apps/desktop|pwa            final Platform composition roots
```

`@loomrealm/runtime-control` first publish surface root-only，runtime dependencies exactly Foundation + Wire；不发布 generic RPC/schema framework。

Platform Architecture不自动产生 `platform-*` 大包；两个 `game-launcher-*` 只承担窄 Runtime launch capability。

---

## Current Reset / Governance

ADR 0018 establishes preimplementation direct-current-v1 governance。

ADR 0019/0020 close Game topology / Platform binding / Game consumer boundary：

```text
Game Descriptor {key,module}
→ Game Descriptor {key}
+ platform-specific Launch Manifest
+ matching Launcher PREPARE
+ LogicalGameBootstrap
```

ADR 0021 closes M3 Runtime Control mechanics before first conformant implementation：

```text
candidate/dynamic session surface
→ root-only role-specific peers

never-reuse Request IDs
→ strict-monotonic same-sender namespace

blocking-single-reader ambiguity
→ one reader with immediate Response correlation

implicit response ordering
→ serialized writer + Response causal barrier

unspecified deadline/terminal races
→ finite deadlines + first-settlement/terminal-first-wins

source duplicate-member rejection text
→ frozen Wire / JSON.parse observable semantics
```

No Runtime Control v2 or compatibility parser is created。ADR 0021 does not reopen Frame seven methods/authority/Outcome/commit/unwind semantics。

Once real conformant compatibility obligation forms, future incompatible changes require normal version/migration governance。

---

## 当前状态

```text
Foundation / Wire                        Implemented Baseline / Core Contract Frozen
Game Package                             Implemented Baseline / Core Contract Frozen
Runtime Control Profile / package design Implementation Ready / Core Contract Frozen
Frame / Call v1                          Active / Normative / Frozen
Hostra Launcher / Node Runner v1         Active / Normative / Stabilizing
PWA Launcher / Worker Runner v1          Active / Normative / Stabilizing
Renderer Control v1                      Active Design / Draft
Renderer Data Profile v1                 Active Design / Draft / Stabilizing
Data Connection v1                       Active Design / Draft
User Input v1                            Core Closure Candidate / Stabilizing
Render Update v1                         Closure Candidate / Stabilizing
Content API v1                           Active / Normative / Evolving
Platform Composition                     Active Design / Evolving
```

下一实现门：

```text
M3 @loomrealm/runtime-control
```

之后 M4 Subsystem Host 与 M5 Main 分别提供真实 role-consumer qualification。

---

## 关键 ADR

- [ADR 0002：平台 Transport Binding](./decisions/0002-platform-transport-profiles.md)
- [ADR 0016：协议边界清理](./decisions/0016-protocol-boundary-cleanup.md)
- [ADR 0017：平台是系统级 Composition Boundary](./decisions/0017-system-level-platform-composition.md)
- [ADR 0018：首次实现前直接收口 current v1](./decisions/0018-preimplementation-v1-closure.md)
- [ADR 0019：Game Logical Topology 与 Platform Launch Manifest 分离](./decisions/0019-platform-launch-manifest-boundary.md)
- [ADR 0020：Game Entry 消费边界归 Platform Launcher](./decisions/0020-game-entry-consumer-boundary.md)
- [ADR 0021：Runtime Control 首次实现前收口 current v1 mechanics](./decisions/0021-runtime-control-preimplementation-closure.md)
