# 第一阶段 FSDB 与运行规则设计待办（已替代）

> 状态：**Superseded**  
> 替代日期：2026-07-25

本文档的大部分问题已经被后续 Runtime、游戏包和 Pokémon Essentials 兼容设计关闭；保留旧待办会让已经冻结的结论看起来仍未确定。

当前状态来源：

- [产品定位与第一阶段范围](../overview/product-scope.md)
- [文档状态与权威来源](../overview/document-status.md)
- [第一阶段设计待办](../roadmap/phase-1-design-todos.md)
- [游戏包契约 v1](../contracts/game-package-v1.md)
- [第一阶段 Runtime Core](../runtime/phase-1-runtime-core.md)
- [第一阶段 Runtime Execution Loop](../runtime/phase-1-runtime-execution-loop.md)
- [Pokémon Essentials v21.1 地图与行走运行时](../runtime/phase-1-pokemon-essentials-map-runtime.md)

已关闭的主要问题包括：

- 整数格子坐标和四方向移动；
- 固定 Tick 与单调时钟；
- 三层地图和原始 Tile ID；
- `map.tile` 每图层每行记录；
- `tile.property` 方向通行和 Priority；
- Portal 在一步完成后检测；
- Runtime / Session / Client State Revision 分离；
- `state.snapshot` 与 `scope.replace`；
- 游戏包入口 `realm.game.json`；
- 资源使用稳定 Key 并按需读取。

仍未关闭的问题应只保留在 `roadmap/phase-1-design-todos.md`，并在形成结论后迁入对应权威文档或 ADR。

历史内容已由 Git 版本记录保留。本页只保留替代关系。