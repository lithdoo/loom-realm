# LoomRealm 设计文档

本文只提供 **current source-of-truth 导航**，不重复协议字段、状态机或 milestone evidence。阅读优先级：Architecture topic → Current Formal Contract → Accepted current ADR → Module placement → Implementation plan / qualification；任何历史 ADR 或过期 proposal不得覆盖 current事实。

Live milestone summary看 [第一阶段交付计划](./30-implementation/phase-1-delivery-plan.md)；M11/M14/M15实际证据分别看专属资格记录。本导航不发布第二套 dated PASS/Closed ledger。

## 推荐阅读顺序

1. [产品设计总览](./00-overview/product-vision.md) · [文档治理](./00-overview/document-governance.md)
2. [系统架构总览](./10-architecture/system-overview.md) · [平台组合](./10-architecture/platform-composition-system.md)
3. [Runtime Hosting](./10-architecture/runtime-hosting-system.md) · [栈](./10-architecture/stack-runtime-system.md) · [通信](./10-architecture/communication-system.md)
4. [渲染](./10-architecture/rendering-system.md) · [Subsystem model](./10-architecture/subsystem-model.md) · [存储内容](./10-architecture/storage-system.md)
5. [正式契约目录](./15-contracts/README.md) · [Render Update v1](./15-contracts/render-update-v1.md) · [Content API v1](./15-contracts/content-api-v1.md)
6. [Web Presentation Config v1](./15-contracts/web-presentation-config-v1.md) · [Web Presentation API v1](./15-contracts/web-presentation-api-v1.md)
7. [模块设计目录](./20-modules/README.md) · [Hostra Desktop](./20-modules/desktop-host/README.md) · [Web Renderer](./20-modules/web-renderer/README.md) · [Map Game Library](./20-modules/loom-map/README.md)
8. [Package architecture](./30-implementation/package-architecture.md) · [Repository layout](./30-implementation/repository-layout.md) · [Testing strategy](./30-implementation/testing-strategy.md)
9. [Phase 1 delivery](./30-implementation/phase-1-delivery-plan.md) · [M14 qualification](./30-implementation/m14-qualification.md) · [M15 qualification](./30-implementation/m15-qualification.md)
10. [ADR index](./decisions/README.md) · [ADR0032 game library boundary](./decisions/0032-game-library-example-boundary.md) · [ADR0034 Hostra physical owner](./decisions/0034-hostra-owned-desktop-composition.md) · [M15 recomposition plan](https://github.com/lithdoo/loom-realm/blob/main/M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)

ADR0033仅在conditional Electron composition成立时有效，不定义当前 canonical M15 Hostra topology。

## 当前 Viewport / Data profile 首发修正（未 Frozen/实施）

```text
ADR0037: approved direction for direct first-version correction
    ↓
Renderer Data Profile /1 = Connection1 + Input1 + Render1 + Viewport1
    ↓
Viewport State v1 + corrected Profile v1 conformance revision 3
    ↓
compatibility evidence + Docs Freeze review SHA [PENDING]
    ↓
new executable implementation/qualification SHA [PENDING]
```

入口：[ADR0037](./decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) · [Viewport architecture](./10-architecture/viewport-capability.md) · [revised Profile v1](./15-contracts/renderer-data-profile-v1.md) · [Viewport State v1](./15-contracts/viewport-state-v1.md) · [唯一 live qualification ledger](./30-implementation/viewport-profile-v1-qualification.md) · [Map dynamic draft](../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)。

**没有 current Profile v2。** 历史 ADR0036/Profile-v2/v2-conformance/v2-ledger均 Superseded；原旧三-child `/1`是 historical executable，不和新四-child `/1`混配，旧 PASS不能转移。未发布不能代替真实 compatibility assessment。Profile uniform deployment与 Web DOM source是产品物理/实施选择，地图 cap/camera/menu/Canvas/PR0留给消费者。

## 当前 milestone 与实物 owner

```text
M10 Input               Closed historical baseline
M11 Render              Requalification Pending
M12 Content             Closed
M13 Web Presentation    Closed historical baseline
M14 Map                 Requalification Pending
M15 Hostra E2E          Requalification Pending
M16–17 PWA              planned
```

M14来源：[ADR0032](./decisions/0032-game-library-example-boundary.md)、`M14_01..05`、[M14 qualification](./30-implementation/m14-qualification.md)、`tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md`。Packages为framework，`game-libs/map`为可重用业务，`examples/essentials-v21.1`为私有具体游戏；只投影实际使用 Map/Tileset facts，不建 universal schema。

M15 current physical chain：

```text
Hostra shell: Electron / BrowserWindow / direct HOSTRA_SUBCMD
    ↓
LoomRealm Desktop plain Node child: Control/Data/Content/trusted shell
    ↓ RuntimeHosting
Runner
```

M15 reload=same Hostra Window/fresh logical Renderer；Data-only reconnect=same Renderer/fresh physical Data pair；终态统一 funnel。M15 physical owner以[ADR0034](./decisions/0034-hostra-owned-desktop-composition.md)与 [recomposition SSOT](https://github.com/lithdoo/loom-realm/blob/main/M15_HOSTRA_DESKTOP_RECOMPOSITION_PLAN.md)为准；standalone Electron旧方案只作迁移历史。M16仅Worker Runtime，M17完成PWA Renderer/Data/Input/Content/Web Presentation与logical equivalence。

## Governance

Summary/index只写 navigation；exact schema、lifetime/order/failure去 formal contract；产品物理实现去 composition/implementation；map需求去 game library；真实证据去 designated ledger。Frozen authority/identity等只按 [governance](./00-overview/document-governance.md) explicit ADR + compatibility review重开；不能静默扩张、依赖未发布无消费者推断或恢复 superseded `/2`与Electron topology。