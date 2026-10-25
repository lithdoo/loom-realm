# PokeMan / 口袋从者

PokeMan 当前先落一个 **Map-only vertical slice**，只接入 `@loomrealm-game/map`，用于验证 Game Package、FSDB Content、Map Runtime、Renderer/Input 与 Essentials 地图资源能够真实跑通。

- 产品文档：[`doc/`](./doc/README.md)
- 原单文件设计基线：[`DESIGN.md`](./DESIGN.md)（保留不变）
- Game Package 入口：`game.json`
- Hostra launch composition：`launch.hostra.json`
- Map Subsystem：`subsystems/map.mjs`
- Content FSDB：`[FSDB]PokeMan/`
- 启动：Windows 下运行 `play.bat`

当前启动点：

```text
Map 3 = 玩家家
spawn = (3, 8)
player sprite = resource.Graphics / Characters/Player
```

当前 Game Entry 精确注册 product-private **`base + map`**：`base` 只持有一个 `<game-controls-input>` producer 并调用 `map`，`map` 仍是唯一 gameplay subsystem。原来的 system-menu / message / world / dialogue / battle 占位文件仍保留在仓库中，但不参与当前运行拓扑。

Controls composition 的 canonical landing 见 [`doc/72-controls-composition.md`](./doc/72-controls-composition.md)。Desktop 与 PWA 都使用同一 `base + map` 逻辑 topology；PWA 安装索引包含两个 executable，但没有增加新的 gameplay subsystem。

Map-only 阶段的 NPC placement 暂时由 `subsystems/map.mjs` 在 `onMapEntering` 中静态提供，只用于验证 Map NPC 渲染与碰撞链路；后续接入 Story Resolver 后，应由 Character / Event / Encounter Content 解析结果替代，不把这份临时 placement 作为业务 authority。

最小检查：

```bat
node --test examples/PokeMan/test/map-smoke.test.mjs
```
