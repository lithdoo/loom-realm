# 模块文档：当前实现

**先看[核心模块总览](./core/README.md)，再按实际 owner 进入模块正文。** 本目录只描述 Current realization/消费位置；跨边界 ABI 查[正式契约](../15-contracts/README.md)，开发与 qualification 规则查[30-development](../30-development/README.md)。工作进度属于 GitHub Issue/PR，历史 milestone ledger 不再是导航入口。

| 当前模块 | 当前资料 | 代码归属 |
| --- | --- | --- |
| Foundation / Wire / Game Package | [核心模块](./core/README.md) · [Game Package](./game-package/README.md) | `packages/foundation`、`packages/wire`、`packages/game-package` |
| Main / Runtime / Subsystem | [Main](./main-system/README.md) · [Subsystem 架构](../10-architecture/subsystem-model.md) | `packages/main`、`packages/runtime-control`、`packages/subsystem` |
| Realm State | [Realm State 架构](../10-architecture/realm-state-system.md) | `packages/realm-state` |
| Renderer / Input / Web Presentation | [Web Renderer](./web-renderer/README.md) · [渲染架构](../10-architecture/rendering-system.md) | `packages/renderer` 与相关 control/data packages |
| FSDB / Content | [Content / FSDB](./fsdb-content-service/README.md) | `packages/fsdb`、`packages/fsdb-http`、平台 Content realization |
| Map Game Library | [Map / Terrain](./loom-map/README.md) | `game-libs/map` + concrete examples |
| Hostra Desktop | [Desktop composition](./desktop-host/README.md) | `apps/desktop`；Electron/Window 属 Hostra |
| PWA | [PWA product composition](./pwa-host/README.md) | `apps/pwa`、`packages/game-launcher-pwa` |

依赖原则：`examples → game-libs → framework public author API`。Main 拥有 Control Authority，Realm State 拥有 session shared mutable business state，Subsystem 拥有 domain execution/local state/RenderDomain，Renderer 维护 readonly/current presentation replica，Content 拥有 readonly installation definitions。

本目录不复制 PASS dashboard。是否需要 requalification 由[subject/staleness 规则](../30-development/qualification.md)结合具体改动判断。
