# 第一阶段项目 FSDB 数据模型（已替代）

> 状态：**Superseded**  
> 替代日期：2026-07-25

本文档记录了第一阶段早期的单层地图和逐格 `blocked` 数据模型。当前第一阶段已经采用 Pokémon Essentials v21.1 / RPG Maker XP 三层地图兼容基准。

当前实现依据：

- [游戏包契约 v1](../contracts/game-package-v1.md)
- [Pokémon Essentials v21.1 地图与行走运行时](../runtime/phase-1-pokemon-essentials-map-runtime.md)
- [FSDB 文件存储系统目录结构详解](./FSDB目录结构详解.md)
- [游戏启动与异步内容加载](../game-package/phase-1-game-loading.md)

当前最小 LoomRealm FSDB Profile 包含：

```text
map.definition
map.tileset
map.tile
map.portal

tile.set
tile.property
tile.sheet
tile.autotile
tile.compiled

actor.definition
actor.sprite
```

早期文档中的以下内容已失效：

- `map.tile` 每格一条记录；
- `map.tile` 直接保存 `blocked`；
- 单层地图；
- 不支持 Autotile 和 Priority；
- 旧的人物资源和 Tile 索引示例。

历史内容已由 Git 版本记录保留。本页只保留替代关系。