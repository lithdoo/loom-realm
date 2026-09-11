# LoomRealm 设计文档

本文只做 **current source-of-truth 导航**，不重复定义协议字段、状态机或 milestone evidence。

阅读优先级：

```text
Architecture topic
→ Formal Contract
→ Accepted current ADR
→ Module placement
→ Implementation plan / qualification
```

Live milestone summary只看 [`第一阶段交付计划`](./30-implementation/phase-1-delivery-plan.md)。M14 formal status/evidence只看 [`M14 Qualification Record`](./30-implementation/m14-qualification.md)；M15 implementation/qualification evidence只看 [`M15 Qualification Record`](./30-implementation/m15-qualification.md)。索引页不维护第二套 dated PASS/Closed ledger。

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
10. [存储与内容系统](./10-architecture/storage-system.md)
11. [正式契约目录](./15-contracts/README.md)
12. [Render Update v1](./15-contracts/render-update-v1.md)
13. [Readonly Content API v1](./15-contracts/content-api-v1.md)
14. [Web Presentation Config v1](./15-contracts/web-presentation-config-v1.md)
15. [Web Presentation API v1](./15-contracts/web-presentation-api-v1.md)
16. [模块设计目录](./20-modules/README.md)
17. [Hostra Desktop Composition](./20-modules/desktop-host/README.md)
18. [Web Renderer](./20-modules/web-renderer/README.md)
19. [Map Game Library](./20-modules/loom-map/README.md)
20. [独立分包与发布架构](./30-implementation/package-architecture.md)
21. [仓库与目录方案](./30-implementation/repository-layout.md)
22. [测试策略](./30-implementation/testing-strategy.md)
23. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)
24. [M14 Qualification Record](./30-implementation/m14-qualification.md)
25. [M15 Qualification Record](./30-implementation/m15-qualification.md)
26. [ADR 索引](./decisions/README.md)
27. [ADR 0032：Framework / Game Library / Example Boundary](./decisions/0032-game-library-example-boundary.md)
28. [ADR 0034：Hostra owns Desktop Electron composition](./decisions/0034-hostra-owned-desktop-composition.md)
29. [M15 Hostra Desktop Recomposition Plan](../M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)

ADR 0033 仍保留 Electron-main composition 的历史/conditional provenance，但不再定义 canonical M15 physical topology。

---

## 当前 closed / frozen 主干

```text
M10 User Input             Closed
M11 Render Replication     Closed
M12 Content                Closed
M13 Web Presentation       Closed
M14 consumer design        Frozen; formal status ledger-owned
M15 physical composition   Implementation Frozen / Preimplementation Closed
```

M14 已有完整 consumer implementation，但 formal status仍由 qualification ledger判定；本文不从实现完成推导 Closed。

---

## Current M14 Source Map

```text
ADR 0032
M14_01_WORKSPACE_BOUNDARY.md
M14_02_MAP_GAME_LIBRARY.md
M14_03_ESSENTIALS_EXAMPLE.md
M14_04_REAL_GAME_VERTICAL.md
M14_05_QUALIFICATION_CLOSURE.md
doc/30-implementation/m14-qualification.md
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
```

Repository placement：

```text
packages/      LoomRealm framework/runtime
game-libs/map  @loomrealm-game/map
examples/essentials-v21.1  private concrete game
```

M14 first slice只 materialize current consumer读取的 Map/Tileset facts；不建立 universal map schema。

---

## Current M15 Source Map

Canonical Desktop physical owner chain：

```text
Hostra shell
    owns Electron / BrowserWindow / direct HOSTRA_SUBCMD process
        ↓
LoomRealm Desktop plain Node process
    owns LoomRealm Control/Data/Content/trusted-shell composition
        ↓ RuntimeHosting
Runner
```

Current source-of-truth：

```text
ADR 0034
M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md
M15_01..05 retained/superseded landing docs
doc/20-modules/desktop-host/README.md
doc/30-implementation/m15-qualification.md
```

Frozen distinctions：

```text
reload
    → same Hostra Window
    → fresh Renderer logical participant

same-generation Data-only reconnect
    → same Renderer logical participant
    → fresh Data physical pair only

terminal triggers
    → one idempotent LoomRealm termination funnel
```

Historical standalone Electron M15 remains migration evidence only。

---

## Platform Route

```text
M6   Hostra launch-profile Runtime / Runner / Control
M7   Renderer Control
M8   logical Data role seam
M9   Desktop Data Broker
M10  User Input
M11  Render Replication
M12  Content
M13  Web Presentation
M14  Map Game Library + First Real Game
M15  Hostra-owned Desktop Full E2E
M16  PWA Runtime
M17  PWA Full E2E / Equivalence
```

Current summary：

```text
M1–M13  closed baseline
M14     implementation complete; requalification status → m14-qualification.md
M15     Implementation Frozen / Preimplementation Closed; implementation pending
M16–17  planned
```

M16 remains Worker Runtime-only；M17 completes PWA Renderer/Data/Input/Content/Web Presentation and cross-platform logical-outcome equivalence。M15 Hostra shell/HOSTRA_SUBCMD/loopback mechanics不得升级为 PWA contracts。

---

## Documentation Governance

Summary/index docs只描述 ownership、placement、milestone route 和 links。Exact schema/lifetime/order/failure semantics留在 formal contracts 或 current frozen milestone SSOT；live evidence留在 designated qualification ledger。

Frozen authority、identity、lifecycle/order、failure/recovery 或 public surface 只能按 governance reopen；implementation不得静默扩张或恢复 superseded direct-Electron topology。
