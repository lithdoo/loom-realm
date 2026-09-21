# 模块文档：当前实现

**先看[核心模块总览](./core/README.md)，再按实际 owner 进入模块正文。** 本目录只描述实现/消费位置；跨边界 ABI 查[正式契约](../15-contracts/README.md)，未完成与签核缺口只查[路线图](../30-implementation/roadmap.md)。历史 milestone 工作记录不再是导航入口。

| 当前模块 | 当前资料 | 代码归属 |
| --- | --- | --- |
| Foundation / Wire / Game Package | [核心模块](./core/README.md) · [Game Package](./game-package/README.md) | `packages/foundation`、`packages/wire`、`packages/game-package` |
| Main / Runtime / Subsystem | [Main](./main-system/README.md) · [Subsystem 架构](../10-architecture/subsystem-model.md) | `packages/main`、`packages/runtime-control`、`packages/subsystem` |
| Renderer / Input / Web Presentation | [Web Renderer](./web-renderer/README.md) · [渲染架构](../10-architecture/rendering-system.md) | `packages/renderer` 和相关 author/transport 模块 |
| FSDB / Content | [当前 Content 模块](./fsdb-content-service/README.md) | `packages/fsdb`、`packages/fsdb-http`、`apps/desktop` |
| Map Game Library | [含 Bridge/Ledge 的当前地图库](./loom-map/README.md) | `game-libs/map` + `examples/essentials-v21.1` |
| Hostra Desktop | [Desktop composition](./desktop-host/README.md) | `apps/desktop`；Electron/Window 属 Hostra |
| PWA（未实现完整产品） | [PWA 规划中的物理实现](./pwa-host/README.md) | M16/M17 路线图 |

依赖原则：`examples → game-libs → framework public author API`。Main 唯一拥有 Session/Runtime/InputTarget/DataAuthority，Subsystem 拥有业务状态和 RenderDomain；Renderer 维护当前副本并机械投影，Browser 的游戏组件不能重建权威。不能因为地图、桌面或未来 PWA 的单一需要引入通用地图框架、第二套 Store/运动协议、Hostra Manager 或泛化 AssetManager。

正式资格与状态不由本目录复制维护，避免“源码已完成但老 PASS 被冒充为当前版本”。[下阶段与资格记录](../30-implementation/roadmap.md)。
