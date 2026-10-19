# PokeMan / 口袋从者

PokeMan 当前先接入 `@loomrealm-game/map`，只实现地图子系统，作为后续业务玩法的可运行底座。

- 产品与技术文档：[`doc/`](./doc/README.md)
- 原始概念设计基线：[`DESIGN.md`](./DESIGN.md)，保持不变
- Game Entry：`game.json`
- Hostra composition：`launch.hostra.json`
- 地图子系统：`subsystems/map.mjs`
- Map Content 与资源：`[FSDB]PokeMan/`

## 当前启动内容

- 初始进入 Map 3（玩家家），玩家素材使用 `resource.Graphics/Characters/Player`
- 复用 Map / MapTransfer / Tileset 及 Map 模块现有的移动、碰撞、地形和地图切换逻辑
- 当前不接入 NPC placement、Dialogue、Event、Encounter、Battle 或 Shared State 业务

## 运行

Windows 环境下运行 `play.bat`。脚本会按其他可运行示例的方式检查 Hostra、安装依赖并构建 Desktop / Map 后启动。

`[FSDB]PokeMan` 必须直接位于示例安装根目录下；Desktop Content loader 只接受安装根目录下唯一的 FSDB root，不会递归扫描 `fsdb/` 子目录。

## 测试

在仓库根目录构建所需 packages 后运行：

```sh
npm run build:m15
npm test -w @loomrealm-example/pokeman
```
