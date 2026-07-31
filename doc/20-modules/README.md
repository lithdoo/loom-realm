# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：各系统的内部模块拆分和详细设计入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-01

模块层说明各系统当前准备如何拆解。模块可以重构、合并或替换，但不能改变上层系统职责和正式契约。

## 模块目录

| 系统 | 模块入口 | 说明 |
|---|---|---|
| 程序主系统 | [main-system](./main-system/README.md) | System Registry、Runtime Container Registry、Frame Stack、监督和通道授权 |
| Web 渲染端 | [web-renderer](./web-renderer/README.md) | Stack Store、Frame/Scope Store、输入、状态下行和 DOM/Canvas/WebGL 协调 |
| 游戏包与内容 | [game-package](./game-package/README.md) | Loader、Catalog、Repository 和 Validator |
| FSDB Content Service | [fsdb-content-service](./fsdb-content-service/README.md) | 桌面 HTTP 与 PWA Service Worker 的统一只读 Content API |
| 地图子系统 | [loom-map](./loom-map/README.md) | 多 Frame Runtime、Coordinator、Execution Loop、Core 和兼容层 |
| 桌面宿主 | [desktop-host](./desktop-host/README.md) | Hostra 窗口、localhost WebSocket/HTTP 和桌面安全适配 |
| PWA 宿主 | [pwa-host](./pwa-host/README.md) | Main/System Worker、每 Frame MessagePort、Service Worker 和 OPFS |

## 跨平台承载映射

```text
桌面
    LoomRealm Main Process
    每个 System 一个 OS Process
    每个 Frame 一个 WebSocket 数据连接
    FSDB localhost HTTP Service

PWA
    Main Runtime Dedicated Worker
    每个 System 一个 Dedicated Worker
    每个 Frame 一个 MessagePort 数据连接
    Service Worker Content Service
```

平台模块实现不同 Transport Profile，但必须遵守相同的 System、Frame、Activation、Frame Data Channel 和 Content API 契约。

## 模块文档规则

模块文档应说明：

1. 模块目标；
2. 输入和输出；
3. 拥有的状态；
4. 明确不拥有的状态；
5. 与其他模块的调用方向；
6. 并发和事务边界；
7. 失败和清理；
8. 实现不变量；
9. 依赖的正式契约；
10. 最小测试。

## 依赖规则

- 模块不能绕过正式契约直接修改另一个系统的内部状态；
- 程序主系统模块不能依赖地图子系统内部模块；
- 通用 Client State 类型不能依赖具体地图 DTO；
- Runtime Core 不能依赖 Repository、DOM 或跨进程连接；
- Web Renderer 不能依赖游戏包物理路径；
- Hostra 适配层不能承载 LoomRealm Main、地图、菜单或对话业务；
- Service Worker 不能承载 Frame Stack、权威业务状态或固定 Tick；
- Content Service 不能读取或修改 Frame Runtime State；
- 一个 System Container 可以共享不可变 Repository Cache，但 Frame 可变状态必须隔离；
- 普通输入和 Client State 不经过 Main 或 Hostra 业务转发。

## 迁移说明

现有详细文档暂时保留在旧目录，并由本层模块入口重新分类。后续迁移时，将详细内容逐篇移动到对应模块目录，再把旧路径改为 Legacy 提示。

与新权威入口冲突的旧结论包括：

- 每 Frame 一个独立子系统进程；
- Hostra Main 承载 LoomRealm Main；
- 桌面第一阶段依赖 Electron MessagePort；
- FSDB 运行时直接暴露物理路径。

这些结论不应继续作为实现依据。
