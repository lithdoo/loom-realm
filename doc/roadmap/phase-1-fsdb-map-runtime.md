# 第一阶段：FSDB 驱动的地图运行时原型（已替代）

> 状态：**Superseded**  
> 替代日期：2026-07-25

本文档记录了 LoomRealm 第一阶段早期的单层地图、逐格 `blocked` 和占位 Tile 技术探针。后续设计已经将第一阶段基准升级为 Pokémon Essentials v21.1 / RPG Maker XP 三层地图、原始 Tile ID、Autotile 静态编译、方向通行和 Priority。

当前范围和实现依据：

- [产品定位与第一阶段范围](../overview/product-scope.md)
- [LoomRealm 总体架构](../architecture/system-overview.md)
- [游戏包契约 v1](../contracts/game-package-v1.md)
- [Pokémon Essentials v21.1 地图与行走运行时](../runtime/phase-1-pokemon-essentials-map-runtime.md)
- [第一阶段 Runtime Core](../runtime/phase-1-runtime-core.md)
- [第一阶段 Runtime Execution Loop](../runtime/phase-1-runtime-execution-loop.md)
- [第一阶段设计待办](./phase-1-design-todos.md)

早期方案中的以下内容不得继续作为实现依据：

- 单一地图 Tile 层；
- 每格直接保存 `blocked`；
- 从 `0` 开始的自定义普通 Tile 索引；
- 第一阶段不处理 Autotile；
- 旧的 `[struct]map`、`[group]map-grid` 和 `[resource]map-assets` 目录示例；
- 独立于当前 Runtime Core / Execution Loop 的移动状态定义。

历史内容已由 Git 版本记录保留。本页只保留替代关系。