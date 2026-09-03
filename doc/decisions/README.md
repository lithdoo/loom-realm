# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策背景、取舍、替代关系、current-v1 provenance 与 reopen 条件  
> 最近复核：2026-09-03

ADR 记录“为什么这样设计”。Current 可实现事实以 `00-overview`、`10-architecture`、`15-contracts` 与对应 Frozen implementation plan 为准；本索引不复制完整协议状态机。Superseded ADR 保留历史，但不形成第二份 current contract。

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
27. [ADR 0027：冻结 Renderer Control v1 与 M7 Preimplementation Closure](./0027-freeze-renderer-control-v1-preimplementation.md)

---

## Current 替代 / 修正关系

```text
ADR 0004
→ ADR 0006 separates Frame and Render lifetime

ADR 0007
→ superseded by current Descriptor/Game Package closure

ADR 0008
→ superseded by Host-owned Runner + current Hostra Launcher Profile

ADR 0010–0015
→ Frame / Call v1 semantic freeze

ADR 0015 old PWA structured-object transport mapping
→ corrected by ADR 0018
→ current message unit = UTF-8 JSON text string

ADR 0016
→ DataAuthority / protocol-minimization boundary

ADR 0017
→ Platform owns complete physical Session composition

ADR 0018
→ first-implementation direct-current-v1 correction governance

ADR 0019
→ Game Descriptor = {key}
→ Hostra/PWA Launch Manifest owns executable binding
→ exact key-set join / full executable preflight

ADR 0020
→ matching Launcher consumes Game Entry
→ Main receives LogicalGameBootstrap only
→ no Main → game-package/concrete-launcher dependency

ADR 0021
→ concrete Runtime Control mechanics before first implementation
→ one reader / one writer / strict sender IDs / finite deadlines / no generic RPC

ADR 0022–0025
→ Render / Input / Data Connection / Renderer Data Profile current-v1 closure

ADR 0026
→ Concrete Platform is session-scoped composition object
→ Launcher is Platform-internal PREPARE component
→ Main consumes only a narrow Main-facing capability view

ADR 0027
→ Renderer Control v1 Active / Normative / Frozen
→ M7 implementation preclosed
→ Main-facing optional RendererControlBinding candidate-slot capability
→ BootstrapTokenGenerator current-v1 rename to OpaqueMaterialGenerator
→ protocol peer owns version negotiation; Main owns token/currentness/revision
→ exact hello preflight before atomic current switch/replacement
→ Renderer local holder is not remote-currentness proof
→ no generic RPC/Store/currentness framework
```

---

## Current Architecture Decision Chain

### Game / Runtime launch

```text
ADR 0017
→ ADR 0019
→ ADR 0020
→ ADR 0026
→ Game Package + Hostra/PWA Launcher Profiles
→ Platform Composition / RuntimeHosting
```

### Runtime / Frame

```text
ADR 0009
→ ADR 0010–0015
→ ADR 0021
→ Subsystem Control + Frame/Call + Runtime Control Profile
```

### Renderer Control

```text
ADR 0016
→ ADR 0017 / ADR 0026 Platform boundary
→ ADR 0027
→ Main ⇄ Renderer Control v1
→ M7_01 ... M7_05
```

### Renderer Data / Input / Render

```text
ADR 0016
→ ADR 0022 / 0023 / 0024 / 0025
→ Renderer Data Profile + Data Connection + User Input + Render Update
```

---

## Current M7 Decision Snapshot

M7 does not reopen Frame/Runtime semantics。Frozen placement：

```text
Main
    owns Session / Runtime / Frame / Activation / InputTarget
    owns Renderer token/currentness/AuthorityRevision
    pure-projects RendererAuthoritySnapshotV1

@loomrealm/renderer-control
    owns renderer.hello / renderer.state mechanics
    owns protocolVersions validation/version selection
    owns exact Snapshot wire validation and bounded latest-state publication

@loomrealm/platform-ports
    OpaqueMaterialGenerator
    RendererControlBinding? candidate-slot/carrier capability

@loomrealm/renderer
    local {peer,snapshot}|null holder
```

M7 Main `dataAuthorities=[]`；real DataAuthority allocation/generation/profile begins M8。Hostra/PWA physical Renderer Control realization remains M14/M16。

---

## Compatibility / Reopen Governance

首次 conformant/deployed compatibility boundary形成前，current-v1 correction仍需遵守[文档治理](../00-overview/document-governance.md)。

Frozen ADR/Contract 不允许因为以下理由静默 reopen：

```text
code reuse
generic framework preference
future speculation
directory/name symmetry
test convenience
transport-specific preference
```

允许 reopen 的信号必须是：

```text
demonstrated correctness/security contradiction
conflict between Frozen contracts
real consumer proves Frozen capability cannot express required semantics
real compatibility boundary requires explicit migration/versioning
```

Renderer Control/M7 变更遵循 ADR 0027 的具体 reopen rule；不能通过 Hostra/PWA 私有 retry/currentness protocol绕过 Frozen semantics。

---

## Provenance Rule

History stays in ADR/Git。Current readers应优先查看：

```text
Architecture topic source
→ Current Normative/Frozen Contract
→ Accepted current ADR
→ Module projection
→ Implementation plan/tests
```

Superseded ADR 或旧 example/code shape不得覆盖 Current Contract。
