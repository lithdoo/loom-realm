# LoomRealm 设计文档

本文是**导航与当前事实源索引**，不重复定义协议字段、状态机或 milestone closure。精确语义以对应 Architecture / Frozen Contract / Accepted ADR / Frozen Implementation Plan / Qualification Record 为准。

文档按定义依赖组织：

```text
产品目标
→ 系统架构
→ 正式契约
→ 模块设计
→ 实施计划
```

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
16. [PWA Game Launcher / Worker Subsystem Runner Profile v1](./15-contracts/pwa-launcher-profile-v1.md)
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
29. [Web Renderer](./20-modules/web-renderer/README.md)
30. [Game Package](./20-modules/game-package/README.md)
31. [Hostra Desktop Composition](./20-modules/desktop-host/README.md)
32. [PWA Composition](./20-modules/pwa-host/README.md)
33. [`loom.map`](./20-modules/loom-map/README.md)
34. [实施计划目录](./30-implementation/README.md)
35. [独立分包与发布架构](./30-implementation/package-architecture.md)
36. [仓库与目录方案](./30-implementation/repository-layout.md)
37. [测试策略](./30-implementation/testing-strategy.md)
38. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)
39. [ADR 索引](./decisions/README.md)
40. [ADR 0027：Renderer Control v1 / M7 首次实现前冻结](./decisions/0027-freeze-renderer-control-v1-preimplementation.md)
41. [ADR 0028：M9 Desktop Data Broker 首次实现前冻结](./decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)
42. [ADR 0030：M12 Content preimplementation closure](./decisions/0030-freeze-m12-content-preimplementation-closure.md)
43. [ADR 0031：业务拥有 Web Components，LoomRealm 只投影 Render replica](./decisions/0031-business-owned-web-component-projection.md)

---

## Frozen Milestone Implementation Plans

M7：

```text
M7_01_RENDERER_CONTROL_PACKAGE.md
→ M7_02_MAIN_AUTHORITY_PROJECTION.md
→ M7_03_RENDERER_CONTROL_HOLDER.md
→ M7_04_VERTICAL_INTEGRATION.md
→ M7_05_QUALIFICATION_CLOSURE.md
```

M8：

```text
M8_01_MAIN_DATA_AUTHORITY.md
→ M8_02_DATA_BINDINGS.md
→ M8_03_DATA_ROLE_INTEGRATION.md
→ M8_04_VERTICAL_INTEGRATION.md
→ M8_05_QUALIFICATION_CLOSURE.md
```

M9：

```text
M9_01_DESKTOP_DATA_BROKER.md
→ M9_02_RUNNER_PROVISIONING_IPC.md
→ M9_03_PAIRED_INSTALLATION.md
→ M9_04_VERTICAL_INTEGRATION.md
→ M9_05_QUALIFICATION_CLOSURE.md
```

M9 `05` is the unique qualification/closure gate；the first four documents refine one implementable boundary rather than define independent architecture variants。

M10–M12 的后续 closure/qualification 证据继续保留在对应 implementation plan 与 `doc/30-implementation/*-qualification.md`；本索引不重写这些历史事实。

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

Runtime Control owns connection-local mechanics；Main owns Session/Runtime/Frame/Stack/Activation/InputTarget/failure unwind；Subsystem Host maps typed control outcomes into business control-flow。

Frame/Call Frozen causal rules remain ACK-before-publication、post-commit no rollback、ambiguous mutation→Runtime failure、no retry/replay。

### Renderer Control — M7 Qualified

```text
Main committed authority
→ RendererAuthoritySnapshotV1
→ @loomrealm/renderer-control
→ current Renderer local holder
```

Main owns Renderer currentness/token/revision；renderer-control owns hello/version/wire mechanics；Renderer local holder is a mirror, not remote-currentness proof。

### Renderer Data — M8 Qualified Logical Seam

```text
Main ready Runtime
→ DataAuthority S/1/loomrealm.renderer-data/1
→ Renderer Control Snapshot

Renderer / Subsystem
→ M8 RendererDataBinding / SubsystemDataBinding
→ real @loomrealm/data peers
```

Data physical loss/reacquire does not alter Main S/G/P or Renderer revision。

### Desktop Data Physical Core — M9 Implemented / Qualified

```text
Main current Renderer + exact HostedRuntime + S/G/P
→ DataConnectionAuthoritySink.replace(full view)
→ apps/desktop DataConnectionBroker
→ Renderer WS + Runner WS paired candidate
→ exact HostedRuntime → HostraRuntimeDataProvisioner
→ Broker paired install
→ post-install role Binding delivery
```

Frozen M9 distinctions：

```text
sink replace is synchronous/non-blocking/non-throwing
Renderer token retention after M7 auth is inert correlation only
candidate != current Connection
Broker installation != Runner IPC commit ACK
post-install delivery failure → new current retires; old never resurrects
Data failure != Runtime/Frame failure
```

### M10–M12 Closed Slices

```text
M10 User Input
    → Subsystem InputListener + RendererInputSource + Effective gate

M11 Render Replication
    → Subsystem authoritative Render tree
    → Render Update v1
    → Renderer committed internal Render Store

M12 Content
    → @loomrealm/fsdb
    → Desktop Content Service
    → Subsystem ContentClient
    → Renderer ResourceClient
```

M11 没有关闭 physical Web presentation；M12 没有定义 RenderNode → presentation semantics。

### M13 Web Presentation Direction

```text
M11 committed Render Store
→ thin Web Projector
→ business-owned Custom Element instances
```

当前已冻结：

```text
key      → stable HTMLElement identity
attrs    → Renderer-managed host attributes
data     → complete readonly full snapshot
children → Renderer-managed ordered light DOM
WC       → read-only consumer of all projected state
```

具体 WC semantics由业务拥有；Web Projector是 exclusive physical projection mutator，DOM不是 Render authority source。

M13尚未冻结 presentation implementation 的 package/subpath/bundle topology、loading responsibility、customElements registration vs native upgrade ordering或 projection-start ordering。

---

## Platform Composition Placement

Main-facing shape：

```text
DeadlineScheduler
OpaqueMaterialGenerator
RuntimeHosting
RendererControlBinding?         // M7
dataConnections?                // M9 DataConnectionAuthoritySink
```

Renderer/SubSystem role Data Bindings remain M8 shared ports。

Physical placement：

```text
M6   Hostra Runtime / Node Runner / Runtime Control WS ✅
M7   logical Renderer Control ✅
M8   logical Data authority + role seam ✅
M9   Desktop Data Broker / Runner late provisioning / Data WS ✅
M10  User Input ✅
M11  Render Replication ✅
M12  Desktop Content + Subsystem/Renderer consumers ✅
M13  Web Presentation Projection pending
M14  loom.map business + map-owned WC pending
M15  BrowserWindow + physical Renderer Control + Data/Input/Render/Content full Desktop E2E
M16  PWA Runtime vertical
M17  PWA full Renderer/Data/Input/Render/Content/Web projection + equivalence
```

---

## Package / Authority Boundary

```text
Foundation / Wire
    low-level primitives

Game Package
    document validation

Runtime Control / Renderer Control / Data
    protocol mechanics

Platform Ports
    narrow shared Core↔Platform capabilities/facts

Main / Renderer / Subsystem
    role authority/policy/local state

Concrete launcher integration
    Game PREPARE / Runner ownership mechanics

apps/*
    one-app physical composition/policy
```

M9 exact placement继续保持：

```text
DataConnectionAuthoritySink → platform-ports
Main sink projection         → main
HostraRuntimeDataProvisioner → game-launcher-hostra
Desktop DataConnectionBroker → apps/desktop
```

M13 不预先建立 generic presentation/component package。Business Definition 与 Web presentation implementation保持 execution/authority boundary，但 package/artifact/bundle placement由真实 M13 implementation决定。

Forbidden：generic RPC、AuthorityEventBus、ConnectionRegistry/Manager、RuntimeDirectory service、GenericTransaction/2PC、retry framework、second currentness lease/epoch/heartbeat、second LoomRealm projection tree authority、generic business Web Component vocabulary。

---

## 当前里程碑状态

```text
M1 Foundation / Wire                               ✅ Implemented Baseline
M2 Game Package                                   ✅ Closed
M3 Runtime Control mechanics                      ✅ Closed
M4 Subsystem Runtime/Frame core                   ✅ Closed
M5 Main Runtime/Frame authority                   ✅ Closed
M6 Hostra Runtime physical vertical               ✅ Qualified (2026-09-03)
M7 Renderer Control                               ✅ Qualified (2026-09-03)
M8 Renderer Data logical/core role integration    ✅ Qualified (2026-09-04)
M9 Desktop DataConnectionBroker                   ✅ Qualified (2026-09-04)
M10 User Input                                    ✅ Qualified (2026-09-07)
M11 Render Replication                            ✅ Qualified / Closed
M12 Content                                       ✅ Qualified / Closed (2026-09-08)
M13 Web Presentation Projection                   Pending
M14 loom.map business + Web presentation          Pending
M15 Desktop Full E2E                              Pending
M16 PWA Runtime vertical                          Pending
M17 PWA Full E2E / Cross-platform equivalence     Pending
```

**当前下一实现门 = M13 Web Presentation Projection。**

当前 canonical executable closure gate仍为 `npm run test:m12`；M13 implementation plan冻结后再建立 `test:m13`。

---

## Current Contract Stability

Precise status remains in [正式契约目录](./15-contracts/README.md)。Key Frozen contracts：

```text
Frame / Call v1
Main ⇄ Renderer Control v1
Renderer Data Application Profile v1
Renderer ⇄ Subsystem Data Connection v1
User Input v1
Render Update v1
Readonly Content API v1
```

M13 不修改 Render Update v1 wire/profile；它只定义 M11 committed Render Store之后的 physical Web consumer boundary。

---

## Governance

Current-v1 correction/freeze follows [文档分层与变更规则](./00-overview/document-governance.md)。

Key ADR chain：

- [ADR 0017：Platform 是系统级 Composition Boundary](./decisions/0017-system-level-platform-composition.md)
- [ADR 0018：首次实现前直接收口 current v1](./decisions/0018-preimplementation-v1-closure.md)
- [ADR 0019：Game topology 与 Platform Launch Manifest 分离](./decisions/0019-platform-launch-manifest-boundary.md)
- [ADR 0020：Game Entry 消费边界归 Platform Launcher](./decisions/0020-game-entry-consumer-boundary.md)
- [ADR 0021：Runtime Control 首次实现前收口](./decisions/0021-runtime-control-preimplementation-closure.md)
- [ADR 0026：Concrete Platform 是 Session composition object](./decisions/0026-session-scoped-platform-instance.md)
- [ADR 0027：Renderer Control v1 / M7 首次实现前冻结](./decisions/0027-freeze-renderer-control-v1-preimplementation.md)
- [ADR 0028：M9 Desktop Data Broker / Late Provisioning 首次实现前冻结](./decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)
- [ADR 0030：M12 Content preimplementation closure](./decisions/0030-freeze-m12-content-preimplementation-closure.md)
- [ADR 0031：业务拥有 Web Components，LoomRealm 只投影 Render replica](./decisions/0031-business-owned-web-component-projection.md)

Frozen changes to authority、identity、lifecycle/order、failure/recovery or public surfaces require the corresponding ADR reopen rule；implementation cannot silently broaden them。
