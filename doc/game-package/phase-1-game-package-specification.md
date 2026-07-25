# 第一阶段游戏包规范（已替代）

> 状态：**Superseded**  
> 替代文档：[`../contracts/game-package-v1.md`](../contracts/game-package-v1.md)  
> 替代日期：2026-07-25

本文档曾记录第一阶段游戏包目录、清单和加载边界，但其中混入了尚未进入第一阶段的 Save System、`--save` 命令和存档验收要求。

当前实现必须以以下文档为准：

- [LoomRealm 游戏包契约 v1](../contracts/game-package-v1.md)
- [产品定位与第一阶段范围](../overview/product-scope.md)
- [游戏启动与异步内容加载](./phase-1-game-loading.md)
- [Pokémon Essentials v21.1 地图与行走运行时](../runtime/phase-1-pokemon-essentials-map-runtime.md)

第一阶段公开启动命令统一为：

```bash
loom-realm start ./game
```

Save System、`.lrsav`、存档恢复和迁移进入后续阶段，不属于当前第一阶段闭环。

历史内容已由 Git 版本记录保留。本页不再保存可能被误认为当前契约的旧规范全文。