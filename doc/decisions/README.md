# LoomRealm 架构决策记录

> 层级：设计决策记录  
> 状态：Active  
> 主要定义：重大架构决策的背景、取舍、替代关系与重新评估条件  
> 最近复核：2026-08-20

ADR记录“为什么”；current可实现事实以 `00-overview`、`10-architecture`、`15-contracts` 为准。Superseded ADR只保留历史。

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
ADR 0004 → ADR 0006 supersedes Frame-owned Render lifetime
ADR 0005 → topology核心保留；current Descriptor shape由 ADR 0019收口为 {key}
ADR 0007 / 0008 → Superseded history
ADR 0009 → Runtime identity/lifecycle-only Control
ADR 0010–0015 → Frame / Call v1 semantic freeze
ADR 0016 → DataAuthority / protocol minimization
ADR 0017 → Platform owns complete physical Session composition
ADR 0018 → preimplementation direct-current-v1 policy；Frame/Data/SDK closure有效
ADR 0019 → Game {key} + platform manifests + preflight LaunchPlan + Main launch(key)
```

ADR 0019只 supersede ADR 0018的 Game `{key,module}` / same Definition artifact部分，不改变其 Frame/Data/SDK结论。

---

## Current v1 Game / Runtime Model

```text
Game Package v1
    Game Entry {key...} + initial
        │
        ├── Main logical topology
        │
        └── current Platform Launch Manifest
                ↓ exact join / full resolution
           PlatformLaunchPlan
                ↓
Main launch(key) → RuntimeHosting
                ↓
        Host-owned Runner
                ↓
 platform-selected Definition Module
```

Hostra/PWA Launch Manifest/Profile独立；不要求 same module path/bytes。

---

## Runtime / Renderer Data

Runtime Control = Subsystem Control1 + Frozen Frame1。Renderer Control发布 `DataAuthority {subsystemKey,generation,dataProfile}`。Renderer Data Profile v1 = Connection1 + Input1 + Render1。

Provisioning是 Platform infrastructure，不是 application protocol；failure不自动失败 Runtime/Frame。

---

## Carrier Rule

```text
one carrier application unit = one UTF-8 JSON text string
```

Structured Clone只用于 Platform bootstrap/Port transfer。

---

## Compatibility Governance

当前 Game/Launcher reset发生在 first conformant baseline前，因此直接更新 current v1，不创建 v2/compat layer。Frame / Call v1 Frozen semantics不受 ADR 0019影响。
