# Ledge / Bridge 通行缺口分析

> 状态：**Analysis only；NOT Implemented / NOT Qualified**。2026-09-19 试玩：Map 47 单向阶梯无法通过，Map 27 桥上与桥下均无法通行。本文对照当前 `@loomrealm-game/map` 实现与 Pokémon Essentials v21.1（`Maruno17/pokemon-essentials`）官方通行规则，记录成因与未完成功能。本文不是实施规格，不改变 M14 first-slice 合同，也不声称已修复。

证据基线：本地 Essentials v21.1 FSDB（`examples/essentials-v21.1-local/[FSDB]Essentials v21.1`）+ 当前 `game-libs/map/src/semantics.ts` / `runtime.ts` + 官方 `Game_Map#playerPassable?` / `Game_Player#move_generic`。

---

## 1. 结论

这不是方向通行位算错，也不是 viewport / 行走动画 / 地图跳转回归。当前走路只实现了 RMXP 第一刀：`passages` 方向位 + `0x0F` 全阻 + `priorities` 分层。官方用来做「单向阶梯」和「桥上/桥下」的 **terrain tag 玩法整段都还没接上**。

本地图身份：

| 试玩编号 | 官方 Map ID | 名称 | 图块集 |
|---|---|---|---|
| map47 | Map 47 | Route 7（岩石路线，西接 Cedolan、东接 Battle Frontier） | Tileset 1 Outside |
| map27 | Map 27 | Lerucean Town Pokémon Day Care 室内 | Tileset 3 Interior general |

Map 27 官方是 Day Care 室内，不得当作运河桥样本。**2026-09-20 取证更正**：本官方 v21.1 corpus 的 Map 7 Cedolan City **没有** Bridge terrain，也 **没有** `pbBridgeOn`/`pbBridgeOff` 事件；同 corpus 中 Bridge 图块与桥脚本出现在 Map 21 Route 2（尚未同等取证）。详见 [TERRAIN_BEHAVIOR_EVIDENCE.md](./TERRAIN_BEHAVIOR_EVIDENCE.md)。桥上/桥下同时堵住的机制缺口仍与官方 Bridge terrain + `$PokemonGlobal.bridge` 一致，但不依赖把 Day Care 或 Map 7 误当成桥图。

---

## 2. 当前实现实际覆盖的范围

`mapTilePassable` 只扫 `z=2 → 1 → 0`，检查方向 bit 与全阻，`priority == 0` 即停：

```ts
export function mapTilePassable(map, tileset, x, y, direction): boolean {
  if (out of bounds) return false;
  const bit = { 2: 0x01, 4: 0x02, 6: 0x04, 8: 0x08 }[direction];
  for (const z of [2, 1, 0]) {
    const tileId = tableAt(map.data, x, y, z);
    const passage = tableAt(tileset.passages, tileId);
    const priority = tableAt(tileset.priorities, tileId);
    if ((passage & bit) !== 0 || (passage & 0x0f) === 0x0f) return false;
    if (priority === 0) return true;
  }
  return true;
}
```

`canMove` 要求出发格方向 + 目标格反向同时可过。Runtime `attempt()` 在 `canMove` 失败时直接 `publishBlocked`，没有跳、没有桥状态。

这与 [M14 Map Game Library](../../M14_02_MAP_GAME_LIBRARY.md) §9 一致：M14 first-slice **排除 terrain effects**。Importer 虽然认识 `RPG::Tileset.@terrain_tags`，M14 consumer 投影把它丢掉了。当前 Tileset 只有：

```text
id, tileset_name, autotile_names, passages, priorities
```

官方 `playerPassable?` 在同一套 passage 之前先按 terrain tag 分流。缺的就是这一层。

---

## 3. Map 47：单向阶梯过不去

Route 7 上大片 `649–670 / 658 / 666` 是 Outside 图块的悬崖阶梯。官方不是「走进阶梯格」，而是：

1. **Ledge（terrain tag 1）**  
   `Game_Player#move_generic`：`can_move_in_direction?` 通过后，若面前 `pbFacingTerrainTag.ledge`，调用 `jumpForward(2)`，一次跳过 2 格。
2. **Neutral / `ignore_passability`（tag 13）**  
   阶梯、悬崖装饰 overlay 常标 Neutral。官方 `next` 跳过该层，改看下层地面。当前实现把 overlay 的 `0x0F` 当成墙。
3. **方向位单向**（例如 `0x08` 只堵向上）  
   这一小段现有 `mapTilePassable` 理论上能做；上层只要还有 Ledge / Neutral / `0x0F`，第一步就会被挡住。

v21.1 默认 TerrainTag **没有** StairLeft / StairRight（那是插件）。Route 7 用的是 Ledge + 方向位，不是侧向楼梯。

当前 Runtime 没有 `ledge` / `jump` / `terrain`。对着「应该能跳下去的阶梯」只会撞墙。

---

## 4. Map 27：桥上、桥下都过不去

官方桥是同一套 tile，靠玩家状态切换，不是两套碰撞：

| 状态 | `$PokemonGlobal.bridge` | 通行 | 绘制 |
|---|---|---|---|
| 桥下（默认） | `0` | **忽略** Bridge 图块，走下层 | 桥 priority 4，盖在人上面 |
| 桥上 | `> 0` | **只信** Bridge 图块的 passage | 桥当地面，人走在上面 |

对应官方 `playerPassable?`：

```ruby
next if terrain.bridge && $PokemonGlobal.bridge == 0
if terrain.bridge && $PokemonGlobal.bridge > 0
  return (passage & bit == 0 && passage & 0x0f != 0x0f)
end
next if terrain&.ignore_passability
```

上桥靠 `pbBridgeOn` / `pbBridgeOff`（通常是桥头 event），passage 表不会自己变。缺了这些之后：

1. **`terrain_tags` 没进 Tileset** → 无法识别 Bridge / Neutral
2. **没有玩家桥高度状态** → 永远等价于 `bridge == 0`
3. **Map event 没投影** → 即使有状态，桥头 `pbBridgeOn` 也不会触发

桥 overlay 被当成普通墙：桥下被上层挡住，桥上也走不上去。这与「上、下都不能过」一致。

Day Care 室内更常见的是柜台（`passage & 0x80`）和家具。若试玩看到的是能钻过去的木桥，不要默认写成 Map 7 Cedolan；本 corpus 的 Map 7 没有 Bridge 图块。机制缺口（缺 tag、缺桥状态、缺事件投影）仍然成立，但正例地图需另证。

---

## 5. 官方 TerrainTag 与当前缺口对照

v21.1 硬编码 tags（`GameData::TerrainTag`）：

| id_number | id | 与本次相关的行为 | 当前 Runtime |
|---|---|---|---|
| 1 | Ledge | 面向该格时跳 2 格 | 未实现 → 当墙或走错 1 格 |
| 13 | Neutral | `ignore_passability`，跳过该层 | 未实现 → overlay `0x0F` 当墙 |
| 15 | Bridge | 随 `$PokemonGlobal.bridge` 忽略或采用 | 未实现 → 桥上桥下都堵 |

同属 terrain、本次不一定碰到：冲浪、冰面滑行、瀑布、自行车禁行、深草必须步行。

RMXP 附加 passage 旗标当前也未当玩法消费：`0x40` 草丛、`0x80` 柜台。柜台只影响对话探格，不解释桥。

---

## 6. 未完成功能（依赖顺序）

1. 把 `Tileset.terrain_tags` 投影进 consumer（现在被 M14 明确丢掉）
2. `ignore_passability` / Neutral：overlay 不参与碰撞
3. Bridge：tag 15 + 玩家桥状态 + 上桥/下桥（event 或等价规则）
4. Ledge：tag 1 + 面向 ledge 时跳 2 格，而不是走 1 格
5. Map events（至少桥头 `pbBridgeOn` / `pbBridgeOff`）

不能靠改 `passages` 表「修」这两处：官方就是靠 tag + 状态/跳跃，passage 故意按桥面/悬崖来标。落地需要先扩 Tileset 合同，再在 `mapTilePassable` / `attempt` 里接 Neutral、Bridge、Ledge。这已经超出当前 M14 first-slice。

---

## 7. 明确不是什么

- 不是方向 bit 写反。方向位已按 RMXP 实现；缺的是 bit **之前** 的 terrain 分流。
- 不是 viewport、行走动画或 MapTransfer 回归。`canMove` 在撞墙前就返回 false。
- 不是「单向阶梯 = 只改箭头就能走」。Route 7 的可玩单向是 Ledge 跳跃。
- 不是 Map 27 一定画了户外桥。官方身份是 Day Care；桥机制缺口仍成立。
