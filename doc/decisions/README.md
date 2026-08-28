# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策背景、取舍、替代关系、current-v1 映射与重新评估条件  
> 最近复核：2026-08-28

ADR 记录“为什么这样设计”；current 可实现事实以 `00-overview`、`10-architecture`、`15-contracts` 为准。Superseded ADR 保留完整历史，但不形成第二份 current contract。

---

## 决策列表

1. [ADR 0001：每个 System 一个 Runtime Container](./0001-system-container-per-system-id.md)
2. [ADR 0002：平台 Transport Binding](./0002-platform-transport-profiles.md)
3. [ADR 0003：统一只读 Content API](./0003-readonly-content-api.md)
4. [ADR 0004：Client State 渲染流水线](./0004-client-state-rendering-pipeline.md)
5. [ADR 0005：Game Entry 声明 Subsystem Topology](./0005-game-entry-subsystem-launchers.md)
6. [ADR 0006：Frame 与 Render 生命周期解耦](./0006-frame-render-decoupling.md)
7. [ADR 0007：Subsystem Descriptor MVP（Superseded）](./0007-subsystem-descriptor-mvp.md)
8. [ADR 0008：Desktop Node.js Direct-entry Launcher（Superseded）](./0008-desktop-nodejs-launcher-profile-v1.md)
9. [ADR 0009：Subsystem Control Protocol v1](./0009-freeze-subsystem-control-protocol-v1.md)
10. [ADR 0010：Frame / Call v1 Batch A](./0010-freeze-frame-call-protocol-v1-batch-a.md)
11. [ADR 0011：Frame / Call v1 Batch B](./0011-freeze-frame-call-protocol-v1-batch-b.md)
12. [ADR 0012：Frame / Call v1 Batch C](./0012-freeze-frame-call-protocol-v1-batch-c.md)
13. [ADR 0013：Frame / Call v1 Batch D](./0013-freeze-frame-call-protocol-v1-batch-d.md)
14. [ADR 0014：Frame / Call v1 Batch E](./0014-freeze-frame-call-protocol-v1-batch-e.md)
15. [ADR 0015：Frame / Call v1 Batch F / Freeze](./0015-freeze-frame-call-protocol-v1-batch-f.md)
16. [ADR 0016：协议边界清理与 Data Authority](./0016-protocol-boundary-cleanup.md)
17. [ADR 0017：平台是系统级 Composition Boundary](./0017-system-level-platform-composition.md)
18. [ADR 0018：首次实现前直接收口 current v1](./0018-preimplementation-v1-closure.md)
19. [ADR 0019：Game Logical Topology 与 Platform Launch Manifest 分离](./0019-platform-launch-manifest-boundary.md)
20. [ADR 0020：Game Entry 消费边界归 Platform Launcher，Main 只接收 LogicalGameBootstrap](./0020-game-entry-consumer-boundary.md)
21. [ADR 0021：Runtime Control 首次实现前收口 current v1 mechanics](./0021-runtime-control-preimplementation-closure.md)
22. [ADR 0022：Render Update v1 freeze closure](./0022-render-update-v1-freeze-closure.md)
23. [ADR 0023：User Input v1 semantic closure](./0023-user-input-v1-semantic-closure.md)
24. [ADR 0024：Renderer ⇄ Subsystem Data Connection v1 semantic closure](./0024-renderer-subsystem-data-connection-v1-semantic-closure.md)
25. [ADR 0025：Renderer Data Profile v1 preimplementation closure](./0025-renderer-data-profile-v1-preimplementation-closure.md)
26. [ADR 0026：Concrete Platform 是 Session Composition Object，Launcher 是 Platform 内部 PREPARE Component](./0026-session-scoped-platform-instance.md)

---

## 当前替代 / 修正关系

```text
ADR 0004
    → ADR 0006 supersedes Frame-owned Render lifetime assumption

ADR 0005
    → Game Entry declares Subsystem topology remains
    → old launcher/module declaration later narrowed by 0018/0019

ADR 0007
    → Superseded by later current-v1 Descriptor closure

ADR 0008
    → Superseded by Host-owned Runner + current Hostra Launcher Profile

ADR 0009
    → current Control lifecycle-only decision
    → Data provisioning stays outside Control

ADR 0010–0015
    → Frame / Call v1 semantic freeze

ADR 0015 old PWA structured-object transport mapping
    → corrected by ADR 0018
    → current = UTF-8 JSON text string

ADR 0016
    → current DataAuthority / Data Profile / protocol minimization

ADR 0017
    → Platform owns complete physical Session composition

ADR 0018
    → direct-current-v1 governance precedent
    → original Game {key,module}/same-artifact part superseded by ADR 0019

ADR 0019
    → Game Descriptor = {key}
    → independent Hostra/PWA Launch Manifests
    → exact Game↔Platform key-set join
    → full zero-side-effect executable PREPARE
    → Main launch(key) / plan-bound RuntimeHosting
    → same ABI/semantics; same artifact not required

ADR 0020
    → Game Package = document validation capability, not Runtime role
    → matching Platform Launcher owns Runtime-product Game Entry consumption
    → GameEntryV1 != Main bootstrap model
    → Main has no Game Package/concrete Launcher dependency
    → Main consumes immutable LogicalGameBootstrap only
    → prepared-result `LogicalGameBootstrap + RuntimeHosting` shape clarified/superseded by ADR 0026

ADR 0021
    → Runtime Control package root-only + role-specific peers
    → one reader that never blocks Response correlation
    → one serialized writer + Response causal barrier
    → same-sender Control+Frame Request IDs strict monotonic
    → finite deadline/terminal settlement first-wins
    → duplicate JSON source semantics follow frozen Wire/JSON.parse
    → no second JSON parser

ADR 0026
    → concrete Platform is session-scoped product composition object
    → Launcher is Platform-internal PREPARE component
    → PlatformLaunchPlan installed privately in concrete Platform
    → Main receives LogicalGameBootstrap + Main-facing narrow Platform view
    → concrete Platform object does not create universal Core Platform contract/mega-package
```

---

## Current v1 Game / Runtime Model

```text
Game installation / source
        ↓
Session-scoped Concrete Platform.prepareGame(...)
        ↓
Current Platform Launcher component PREPARE
    ├── @loomrealm/game-package
    │       Game Entry {key...} + initial validation
    ├── Current Platform Launch Manifest
    │       Hostra: launch.hostra.json
    │       PWA:    launch.pwa.json
    ├── exact key-set join
    ├── full executable resolution
    └── hosting/security preflight
        ↓
immutable PlatformLaunchPlan → installed privately in Platform
immutable LogicalGameBootstrap → returned to composition
        ↓
apps/* runs Main({ bootstrap, platform })
        ↓
Main launch(key) ─────────────► Platform.runtimeHosting
                                      ↓
                              Host-owned Runner
                                      ↓
                         platform-selected Definition Module
```

Current Game Package不包含 `module`。

Main不解析 Game Entry、不持有 `formatVersion` / `ValidatedGameEntryV1` / module material。

Hostra/PWA Launch Manifest/Profile独立；不建立 universal launcher schema，也不要求 same artifact。

---

## Current Runtime Control

```text
Runtime Control Application Profile v1
= Subsystem Control v1
+ Frame / Call v1
```

Current connection mechanics：

```text
one UTF-8 JSON text unit
→ frozen Wire parse/decode
→ profile limits
→ one connection-wide reader/dispatcher
→ Control / Frame role dispatch
```

Same sender / same connection：

```text
Request IDs = positive safe integer
strictly monotonically increasing
Control + Frame shared namespace
never reuse / never wrap
```

Dispatcher/writer：

```text
one inbound reader
Response correlation is never blocked by role handler
one serialized outbound writer
Response send acceptance before dependent afterResponse action
```

Deadline/terminal：

```text
finite Request deadline covers send + Response wait
pending settlement first-wins
timeout/loss ambiguous for Frame mutation
late Response diagnostics only
terminal first-wins
no retry/replay/reconnect
```

JSON source duplicate members：

```text
follow frozen @loomrealm/wire / ECMAScript JSON.parse semantics
parsed object still exact closed schema
no private Runtime Control duplicate-member parser
```

Frame v1 remains Frozen：

```text
exact seven Requests
ACK-before-publication
post-commit no rollback
whole-suffix fixed-point unwind
```

ADR 0021 does not change Frame authority/Outcome/unwind semantics。

---

## Current Renderer Data

Renderer Control publishes：

```text
DataAuthority {subsystemKey,generation,dataProfile}
```

Current：

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Platform DataConnectionBroker realizes physical carrier only；does not own generation/profile。

```text
Data provisioning/loss != Runtime failure / Frame unwind
```

---

## Current Carrier Rule

```text
one carrier application unit
= one UTF-8 JSON text string
```

```text
WebSocket   text message
MessagePort postMessage(string)
Memory      string
```

Structured Clone only for Platform bootstrap/Port transfer。

---

## Platform / Package Boundary

```text
@loomrealm/game-package
    Game Entry document validation

@loomrealm/runtime-control
    Control + Frame application protocol mechanics
    Foundation MessageCarrier + Wire consumer
    no Main/Subsystem authority

@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
    narrow Runtime-product Game PREPARE + launch integration

@loomrealm/main
    application authority; no Game Package/Launcher dependency

apps/desktop
apps/pwa
    current full composition roots
```

Runtime Control business author surface remains behind `@loomrealm/subsystem`。

---

## Compatibility Governance

Game/Launcher/Main and M3 Runtime Control mechanics corrections still occur before a real conformant/deployed compatibility boundary：

```text
update current v1 directly
no fake v2
no legacy Game {key,module} parser
no Runtime Control compatibility parser
no second duplicate-member JSON parser
no deprecated alias
```

ADR 0021 is intentionally narrow：it does not reopen Frame seven methods/authority/Outcome/commit/unwind/hard business limit semantics。

History/provenance remains in ADR/Git；current docs stay single-source。

Once first real compatibility obligation forms, future incompatible changes require normal version/migration；ADR 0018/0019/0020/0021 are not permanent exemptions。

---

## 重新评估信号

```text
lazy/optional Subsystem changes exact key-set relation
multiple Runtime implementations per key require application negotiation
third-party/remote Runtime requires public launch/provisioning/control interoperability
third-party Launcher requires stable prepared-result interoperability
LogicalGameBootstrap expands enough to justify independent shared package
multiple Renderer changes Platform coordination topology
source-level duplicate JSON detection becomes mandatory security boundary
Request ID generation needs distributed/multi-writer semantics
reconnect/resume/checkpoint changes Control connection lifetime
executable signing/sandbox forms independent trust contract
real deployed compatibility boundary already exists
```
