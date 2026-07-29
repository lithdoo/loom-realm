# LoomRealm 模块设计目录

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：各系统的内部模块拆分和详细设计入口  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-07-29

模块层说明各系统当前准备如何拆解。模块可以重构、合并或替换，但不能改变上层系统职责和正式契约。

## 模块目录

| 系统 | 模块入口 | 说明 |
|---|---|---|
| 程序主系统 | [main-system](./main-system/README.md) | Registry、Frame Stack、进程监督和通道管理 |
| Web 渲染端 | [web-renderer](./web-renderer/README.md) | Stack Store、Scope Store、输入和 DOM 协调 |
| 游戏包与内容 | [game-package](./game-package/README.md) | Loader、Catalog、Repository 和 Validator |
| 地图子系统 | [loom-map](./loom-map/README.md) | Coordinator、Execution Loop、Core 和兼容层 |
| 桌面宿主 | [desktop-host](./desktop-host/README.md) | Hostra Main、Preload 和 MessagePort 适配 |

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
- Hostra 适配层不能承载地图、菜单或对话业务。

## 迁移说明

现有详细文档暂时保留在旧目录，并由本层模块入口重新分类。后续迁移时，将详细内容逐篇移动到对应模块目录，再把旧路径改为 Legacy 提示。