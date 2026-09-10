# LoomRealm 设计文档

本文只做**导航与 current source-of-truth 索引**，不重复定义协议字段、状态机、Web Presentation interfaces 或 milestone closure。

阅读优先级：

```text
Architecture topic
→ Formal Contract
→ Accepted current ADR
→ Module placement
→ Implementation plan / qualification
```

Live milestone summary只看 [`第一阶段交付计划`](./30-implementation/phase-1-delivery-plan.md)；M14 current qualification subject / evidence / formal status只看 [`M14 Qualification Record`](./30-implementation/m14-qualification.md)。索引页不维护第二套 dated PASS/Closed checkmark。

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
17. [Web Renderer](./20-modules/web-renderer/README.md)
18. [Map Game Library](./20-modules/loom-map/README.md)
19. [独立分包与发布架构](./30-implementation/package-architecture.md)
20. [仓库与目录方案](./30-implementation/repository-layout.md)
21. [测试策略](./30-implementation/testing-strategy.md)
22. [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)
23. [M14 Qualification Record](./30-implementation/m14-qualification.md)
24. [ADR 索引](./decisions/README.md)
25. [ADR 0031：M13 Web Presentation](./decisions/0031-business-owned-web-component-projection.md)
26. [ADR 0032：Framework / Game Library / Example Boundary](./decisions/0032-game-library-example-boundary.md)
27. [ADR 0033：Electron-hosted Hostra Runner uses current executable in Node mode](./decisions/0033-electron-hostra-run-as-node.md)

---

## 当前已关闭主干

```text
M10 User Input
    → Subsystem InputListener
    → RendererInputSource / Effective gate

M11 Render Replication
    → Subsystem authoritative Render Domains
    → Render Update v1
    → Renderer committed Store

M12 Content
    → readonly Content
    → Subsystem ContentClient
    → Renderer trusted/private ResourceClient

M13 Web Presentation
    → WebPresentationConfigV1
    → thin Web Projector
    → business-owned Custom Elements
    → PresentationResourceClient
```

M10–M13 是当前正式 closed baseline。M14 已有完整 consumer implementation，但 formal status仍由 qualification ledger判定；本文不从实现完成推导 Closed。

---

## Current M14 Source Map

M14 是第一个真实 framework consumer，不是新的 framework module。Current source-of-truth：

```text
ADR 0032
    repository/package ownership + rejected abstractions

M14_01_WORKSPACE_BOUNDARY.md
    workspace/package identity/dependency direction

M14_02_MAP_GAME_LIBRARY.md
    map Runtime/Input/passability/camera/Render/WC semantics

M14_03_ESSENTIALS_EXAMPLE.md
    concrete example/fixture/config/resources

M14_04_REAL_GAME_VERTICAL.md
    end-to-end observable evidence

M14_05_QUALIFICATION_CLOSURE.md
    executable closure gate

doc/30-implementation/m14-qualification.md
    live qualification subject / evidence / formal status

tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
    selective RMXP Map/Tileset source→JsonValue projection
```

Repository placement：

```text
packages/      LoomRealm framework/runtime

game-libs/map
    @loomrealm-game/map

examples/essentials-v21.1
    private concrete game
```

M14 first slice materializes only current consumer facts：

```text
Map/{id}: tileset_id,width,height,data
Tileset/{id}: id,tileset_name,passages,priorities
```

It does not recursively project the whole RMXP object graph or create a universal map schema。

---

## Platform Route

责任/materialization route：

```text
M6   Hostra Runtime / Runner / Control
M7   Renderer Control
M8   logical Data role seam
M9   Desktop Data Broker
M10  User Input
M11  Render Replication
M12  Content
M13  Web Presentation
M14  Map Game Library + First Real Game
M15  Desktop Full E2E
M16  PWA Runtime
M17  PWA Full E2E / Equivalence
```

Current summary：

```text
M1–M13  closed baseline
M14     implementation complete; formal status → m14-qualification.md
M15     Implementation Frozen / Preimplementation Closed
M16–17  planned
```

M14 uses existing/synthetic input source + real Chromium。M15 owns real Electron-hosted Hostra child、BrowserWindow、same-origin Desktop shell/Content、DOM input and lifecycle。M16 owns PWA Worker Runtime hosting only。M17 completes PWA Renderer/Data/Input/Content/Web presentation and cross-platform logical equivalence。

---

## Documentation Governance

Summary/index docs only describe ownership、placement、milestone route and links。Exact schema/lifetime/order/failure semantics stay in formal contracts or the current frozen milestone source；live evidence stays in the designated qualification ledger。

Frozen authority、identity、lifecycle/order、failure/recovery or public surface can change only through the corresponding reopen rule；implementation cannot silently expand them。
