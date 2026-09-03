# LoomRealm 设计文档

本文是**导航与当前事实源索引**，不重复定义协议字段、状态机或 milestone closure。精确语义以对应 Architecture / Frozen Contract / Accepted ADR / Implementation Plan 为准。

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
40. [ADR 0021：Runtime Control 首次实现前收口](./decisions/0021-runtime-control-preimplementation-closure.md)
41. [ADR 0026：Session-scoped Concrete Platform](./decisions/0026-session-scoped-platform-instance.md)
42. [ADR 0027：Renderer Control v1 / M7 首次实现前冻结](./decisions/0027-freeze-renderer-control-v1-preimplementation.md)

M7 实施顺序位于仓库根目录：

```text
M7_01_RENDERER_CONTROL_PACKAGE.md
→ M7_02_MAIN_AUTHORITY_PROJECTION.md
→ M7_03_RENDERER_CONTROL_HOLDER.md
→ M7_04_VERTICAL_INTEGRATION.md
→ M7_05_QUALIFICATION_CLOSURE.md
```

---

## 当前系统闭环

### Game / Platform / Main

```text
Game source
→ session-scoped Concrete Platform.prepareGame()
→ matching game-launcher-* PREPARE
→ @loomrealm/game-package validation
→ platform-specific Launch Manifest / exact join / executable preflight
→ Platform-private immutable LaunchPlan
+ immutable LogicalGameBootstrap
→ runMain({bootstrap, platform, policy})
→ RuntimeHosting
→ Host-owned Runner
→ @loomrealm/subsystem/host
```

Main 不读取 Game Entry、Launch Manifest、module/path/URL 或 concrete launcher type。

### Runtime / Frame Authority

```text
Runtime Control
    owns connection-local Control/Frame protocol mechanics

Main
    owns Session / Runtime / Frame / Stack / Activation / InputTarget
    owns Runtime failure + fixed-point unwind

Subsystem Host
    maps typed Runtime Control outcomes into local Frame/business control-flow
```

Frame/Call Frozen causal rules继续成立：ACK-before-publication、post-commit no rollback、ambiguous mutation failure→Runtime failure、no retry/replay。

### Renderer Control — M7 Frozen

```text
Main committed authority
→ RendererAuthoritySnapshotV1
→ @loomrealm/renderer-control
→ current Renderer local holder
```

关键边界：

```text
Main owns Renderer currentness / token / revision
renderer-control owns hello/version/wire/connection mechanics
Platform RendererControlBinding only arms one physical candidate slot + delivers carrier/token
Renderer local {peer,snapshot}|null is a mirror, not remote-currentness proof
M7 Main dataAuthorities=[]
```

Formal source：[Main ⇄ Renderer Control v1](./15-contracts/main-renderer-control-v1.md) + [ADR 0027](./decisions/0027-freeze-renderer-control-v1-preimplementation.md)。

### Renderer Data / Input / Render

Current frozen logical split：

```text
Main DataAuthority {subsystemKey,generation,dataProfile}
→ Platform DataConnectionBroker physical provisioning
→ current paired Data Connection
→ Renderer Data Application Profile
    ├ User Input
    └ Render Update
```

Data provisioning/loss不自动失败 Runtime或 unwind Frame；Control/Data无全局 total order；Input effective authority仍是 Main InputTarget × current matching Data × Activation × Interest × Producer。

---

## Platform Composition Placement

Concrete Platform 是完整 physical Session composition object，但 Core只消费窄 role-facing capability view。

Through M7 Main-facing current shape：

```text
DeadlineScheduler
OpaqueMaterialGenerator
RuntimeHosting
RendererControlBinding?   // optional physical capability
```

`RendererControlBinding` 是 Main-facing candidate-slot/carrier capability，不是 Renderer-facing application API，也不是 `RendererHosting` mega-port。

Physical milestone placement：

```text
M6   Hostra Runtime / Node Runner / Runtime Control WS ✅
M9   Desktop DataConnectionBroker provisioning core
M14  Hostra BrowserWindow + physical Renderer Control + Data/Input/Render/Content full E2E
M15  PWA Runtime / Worker Runner / Runtime Control MessagePort
M16  PWA Renderer Control + Data Broker/bindings + Content full E2E + equivalence
```

---

## Package / Authority Boundary

```text
Foundation / Wire
    low-level primitives only

Game Package
    document validation

Runtime Control / Renderer Control / Data protocol packages
    protocol mechanics only

Platform Ports
    narrow Core↔Platform capabilities/facts only

Main / Renderer / Subsystem
    role authority/policy/local state

Concrete Platform / apps/*
    physical composition/provisioning/hosting
```

不得因为 package symmetry 预建：generic RPC、universal Platform/service locator、Renderer Store framework、ConnectionRegistry、cross-plane currentness lease/epoch/heartbeat。

---

## 当前里程碑状态

```text
M1 Foundation / Wire                               ✅ Implemented Baseline
M2 Game Package                                   ✅ Closed
M3 Runtime Control mechanics                      ✅ Closed
M4 Subsystem Runtime/Frame core                   ✅ Closed
M5 Main Runtime/Frame authority                   ✅ Closed
M6 Hostra Runtime physical vertical               ✅ Qualified Baseline (2026-09-03)
M7 Renderer Control                               ✅ Qualified (2026-09-03)
M8 Renderer Data role integration                 Pending
M9 Desktop DataConnectionBroker                   Pending
M10 User Input                                    Pending
M11 Render                                        Pending
M12 Content                                       Pending
M13 loom.map business vertical                    Pending
M14 Desktop Full E2E                              Pending
M15 PWA Runtime vertical                          Pending
M16 PWA Full E2E / Cross-platform equivalence     Pending
```

**当前下一实现门 = M8 Renderer Data role integration。**

M7 implementation facts由 ADR 0027 + Frozen Renderer Control contract + `M7_01`–`M7_05` 定义；qualification run见 [`M7 qualification record`](./30-implementation/m7-qualification.md)。

---

## Current Contract Stability

精确状态以[正式契约目录](./15-contracts/README.md)为唯一索引。当前关键项：

```text
Frame / Call v1                         Active / Normative / Frozen
Main ⇄ Renderer Control v1              Active / Normative / Frozen
Renderer Data Application Profile v1    Active / Normative / Frozen
Renderer ⇄ Subsystem Data Connection v1 Active / Normative / Frozen
User Input v1                           Active / Normative / Frozen
Render Update v1                        Active / Normative / Frozen
Readonly Content API v1                 Active / Normative / Evolving
```

不要在本 README 建立第二套 contract status 表述。

---

## Governance

Current-v1 首次实现前纠错按[文档分层与变更规则](./00-overview/document-governance.md)执行。

关键 Accepted ADR：

- [ADR 0017：Platform 是系统级 Composition Boundary](./decisions/0017-system-level-platform-composition.md)
- [ADR 0018：首次实现前直接收口 current v1](./decisions/0018-preimplementation-v1-closure.md)
- [ADR 0019：Game topology 与 Platform Launch Manifest 分离](./decisions/0019-platform-launch-manifest-boundary.md)
- [ADR 0020：Game Entry 消费边界归 Platform Launcher](./decisions/0020-game-entry-consumer-boundary.md)
- [ADR 0021：Runtime Control 首次实现前收口](./decisions/0021-runtime-control-preimplementation-closure.md)
- [ADR 0026：Concrete Platform 是 Session composition object](./decisions/0026-session-scoped-platform-instance.md)
- [ADR 0027：Renderer Control v1 / M7 首次实现前冻结](./decisions/0027-freeze-renderer-control-v1-preimplementation.md)

Frozen contract如需改变 authority、identity、state/order、failure/recovery、wire limit或 version binding，必须先走对应 ADR reopen/migration governance；不能在实现中静默扩张。
