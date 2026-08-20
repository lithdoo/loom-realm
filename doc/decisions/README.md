# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策的背景、取舍、替代关系、current-v1 映射与重新评估条件  
> 最近复核：2026-08-20

ADR记录“为什么这样设计”；current可实现事实以 `00-overview`、`10-architecture`、`15-contracts` 为准。Superseded ADR保留完整历史，但不形成第二份 current contract。

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

---

## 当前替代 / 修正关系

```text
ADR 0004
    → ADR 0006 supersedes Frame-owned Render lifetime assumption

ADR 0005
    → Game Entry declares Subsystem topology仍保留
    → old launcher/module declaration被后续 0018/0019继续收口

ADR 0007
    → Superseded by later current-v1 Descriptor closure

ADR 0008
    → Superseded by Host-owned Runner + current Hostra Launcher Profile

ADR 0009
    → current Control lifecycle-only decision
    → Data provisioning明确留在 Control之外

ADR 0010–0015
    → Frame / Call v1 semantic freeze

ADR 0015 old PWA structured-object transport mapping
    → one-time preimplementation correction by ADR 0018
    → current mapping = UTF-8 JSON text string

ADR 0016
    → current DataAuthority / Data Profile / protocol-minimization direction

ADR 0017
    → Platform owns complete physical Session composition

ADR 0018
    → direct-current-v1 governance precedent
    → Frame/Data/SDK/late provisioning closure
    → original Game {key,module}/same-artifact part later superseded by ADR 0019

ADR 0019
    → Game Descriptor = {key}
    → Hostra/PWA independent Launch Manifests/Profiles
    → exact Game↔Platform key-set join
    → full zero-side-effect PlatformLaunchPlan preflight
    → Main launch(key) / plan-bound RuntimeHosting
    → same ABI/semantics; same artifact not required
```

---

## Current v1 Game / Runtime Model

```text
Game Package v1
    Game Entry
    Descriptor {key}
    initial target/input
        │
        ├──────────────► Main logical topology
        │
        └──────────────► Current Platform Launch Manifest
                              ├── Hostra: launch.hostra.json
                              └── PWA:    launch.pwa.json
                                      ↓
                              exact key-set join
                              full executable resolution
                              hosting/security preflight
                                      ↓
                            immutable PlatformLaunchPlan
                                      ↓
Main launch(key) ─────────────► plan-bound RuntimeHosting
                                      ↓
                              Host-owned Runner
                                      ↓
                         platform-selected Definition Module
```

Current Game Package不包含 `module`。

Hostra/PWA Launch Manifest/Profile独立；不建立 universal launcher schema，也不要求 same module path/bytes/build artifact。

---

## Current Runtime Control

```text
Runtime Control Application Profile v1
= Subsystem Control v1
+ Frame / Call v1
```

Frame v1保持 Frozen：

```text
exact seven Requests
Response-before-dependent-RPC
ACK-before-publication
post-commit no rollback
timeout/loss ambiguous → Runtime failure
no retry/replay
whole-suffix fixed-point unwind
```

ADR 0019不改变 Frame semantics。

---

## Current Renderer Data

Renderer Control发布：

```text
DataAuthority {subsystemKey,generation,dataProfile}
```

当前：

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Platform DataConnectionBroker只实现 physical carrier；不拥有 generation/profile。

```text
Data provisioning/loss != Runtime failure / Frame unwind
```

---

## Current Carrier Rule

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

Structured Clone只用于 Platform bootstrap/Port transfer。

---

## Platform / Package Boundary

```text
Platform Composition
    = architecture responsibility for complete physical Session

@loomrealm/game-launcher-hostra
@loomrealm/game-launcher-pwa
    = narrow Runtime launch integration packages

apps/desktop
apps/pwa
    = current full composition roots
```

因此 ADR 0019建立 launcher packages不推翻 ADR 0017“不要默认创建 platform mega-package”的决策。

---

## Compatibility Governance

当前 Game/Launcher reset发生在 first conformant baseline前，因此：

```text
update current v1 directly
no v2
no legacy Game {key,module} parser
no deprecated module alias
no dual model
```

Frame / Call v1 Frozen semantics不受 ADR 0019影响；其 earlier transport correction仍由 ADR 0018的 Frozen preimplementation rule解释。

一旦真实 compatibility boundary形成，future incompatible changes必须按正常 version/migration治理，不能继续引用 0018/0019作为永久豁免。

---

## 重新评估信号

以下情况需要新 ADR/版本评估，而不是静默扩展 current model：

```text
lazy/optional Subsystem改变 exact key-set关系
multiple Runtime implementations per key需要 application negotiation
third-party/remote Runtime需要公开 launch/provisioning wire
multiple Renderer改变 Platform coordination topology
executable signing/sandbox形成独立 trust contract
real deployed compatibility boundary已经形成
```
