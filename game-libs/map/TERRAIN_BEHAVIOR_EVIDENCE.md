# 地形行为原版证据（Essentials v21.1）

> 状态：**Evidence record / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。
> 本文只记录已经从本地官方 corpus 和固定 tag `v21.1` 源码读到的事实。它不是冻结合同，不是实施计划，也不证明任何 Runtime 行为已经实现。
> 范围：Map 7 Cedolan City 全事件取证，以及同 corpus 全部 69 张地图的桥地形 / 桥脚本清单。Map 47 Route 7 悬崖路线尚未取证。Map 27 Pokémon Day Care 不是桥样本。

## 1. 取证范围、日期、仓库 HEAD、原始素材

| 项 | 值 |
|---|---|
| 日期 | 2026-09-20 |
| 仓库 | `lithdoo/loom-realm`（本工作区） |
| 分支 | `docs/map-terrain-behavior-freeze-handoff` |
| HEAD | `4165ed5a63a157035873da8234c09a422e125e82` |
| 正式地图对象 | **Map ID 7 / Map007.rxdata / Cedolan City** |
| 本轮追加 | 全部 `Map*.rxdata` 的 Bridge 图块与 `pbBridgeOn/Off` 清单 |
| 明确排除 | 不得用 Map 27 或 Map 21 替代 Map 7 的结论；Map 21 只作为「哪些地图有桥」的清单对象 |
| 原版源码基线 | Pokémon Essentials tag [v21.1](https://github.com/Maruno17/pokemon-essentials/tree/v21.1)（commit `ea7b5d56d2436591160983c4e641a2ceee2d875a`） |
| 本地 FSDB | `examples/essentials-v21.1-local/[FSDB]Essentials v21.1`（`[FSDB]*` 已 gitignore，不提交） |
| 是否运行原版游戏 | **否** |

### 1.1 文件指纹

路径为仓库相对路径。SHA-256 由 Node `crypto.createHash("sha256")` 计算。

| 文件 | SHA-256 | 字节 |
|---|---|---:|
| `[resource]Data/Map007.rxdata` | `c34ddaaec265241fd35149d6d3758f8f08a5503b057c891e396c39b08518c6b7` | 37559 |
| `[resource]Data/MapInfos.rxdata` | `8ed090fb27db75e046755896e0d4dbb53fa6de6279d21865315dd60f868d5007` | 3377 |
| `[resource]Data/Tilesets.rxdata` | `433033b45527c0f07b781c862724df64d6a416c0ac2ed71907f645c0b2219fa6` | 163802 |
| `[resource]Data/CommonEvents.rxdata` | `196c5ee7f51e656b79514ce203f4077f4b12ff55192ebdf4dd0aefdd7734de12` | 2566 |
| `[struct]MapTransfer/7.json` | `8fe855894055ea026c9da590fdd3d2c178f938cd392f2bebe91918568dd6f449` | （派生 JSON） |

Map 21 指纹（清单对象，不是 Map 7 替代）：`[resource]Data/Map021.rxdata` SHA-256 `cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575`，28708 字节。

未提交原始 FSDB 或机器绝对路径。解析时读到的绝对路径示例：`examples/essentials-v21.1-local/[FSDB]Essentials v21.1/[resource]Data/Map007.rxdata`。

## 2. 数据解析方式与可复现步骤

复用现有 Marshal / RMXP 解码器，不另起解析器，不 `eval` 地图 Ruby：

- `tools/fixtures/essentials-v21.1/lib/marshal/decoder.mjs`
- `tools/fixtures/essentials-v21.1/lib/rmxp/decoder.mjs`
- `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs`
- `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs`
- 取证库：`tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-event-evidence.mjs`
- CLI：`tools/fixtures/essentials-v21.1/map7-bridge-evidence.mjs`

默认只完整抽取 Map 7。`--map` 不是 7 立即失败。`--corpus-scan` 扫描同目录全部 `Map*.rxdata`：Bridge-tagged 图块、`pbBridgeOn/Off` 脚本、事件名 / 注释 / MapInfos 名中的 bridge，并对命中地图输出候选事件页摘要。不执行 Ruby。

脚本拼接与 v21.1 `Interpreter#command_355` 一致：从 code 355 起，把后续连续 355 与 655 用 `\n` 连接。

### 2.1 本次实际执行的命令

```text
node tools/fixtures/essentials-v21.1/map7-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --corpus-scan --output ".local/map7-bridge-evidence.json"
```

- 退出码：`0`
- Map 7：events=11 pages=19 commands=521 scripts=32；bridge cells=0；candidates=0
- corpusScan：maps=69；inventory=1；tileMaps=1；scriptMaps=1

```text
node --test tools/fixtures/essentials-v21.1/map-event-evidence.test.mjs
```

CI 若无本地 FSDB，live 用例 skip。

## 3. Map 7 基本信息

| 字段 | 值 |
|---|---|
| Map ID | 7 |
| 文件名 | Map007.rxdata |
| MapInfos 名称 | Cedolan City |
| 尺寸 | 60 × 43 |
| Tileset ID | 1 |
| Tileset 名 | Outside / Outside |
| 事件数 | 11（IDs 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12） |
| 页 / 命令 / 脚本命令 | 19 / 521 / 32 |

## 4. Map 7 桥相关扫描覆盖

扫描全部 11 个事件的全部 19 页、全部 521 条命令。计入候选的条件：事件名 `/bridge/iu`、位于或正交邻接 tag 15 格子、拼接脚本匹配 `pbBridgeOn/Off`、调用含这些脚本的 Common Event、Transfer Player 且邻接桥地形。

结果：`candidates.length === 0`。32 段脚本的 `matchesBridgePattern` 全为 false。CommonEvents 1–10 的 `hasBridgeScript` 全为 false。Tileset 1 虽有 17 个 tag 15 tile ID，Map 7 放置 0。

Map 7 全部拼接脚本只有：`Followers.follow_into_door`、`Followers.hide_followers`、`Followers.put_followers_on_player`、`setTempSwitchOn("A")`。

## 5. Map 7 事件事实表

### 5.1 桥候选

无。

### 5.2 含 Transfer Player 的门

| Event ID | Name | x,y | 页数 | 默认页 trigger | graphic | page0 脚本 | Transfer params `[appoint, map, x, y, dir, fade]` |
|---:|---|---|---:|---|---|---|---|
| 1 | Dept door left | 11,13 | 2 | 1 player-touch | `doors6` | Followers.follow_into_door | `[0,14,2,14,8,1]` |
| 2 | Dept door right | 15,13 | 2 | 1 player-touch | `doors6` | Followers.follow_into_door | `[0,14,10,14,8,1]` |
| 3 | Gym door | 11,29 | 2 | 1 player-touch | `doors6` | Followers.follow_into_door | `[0,10,6,14,8,1]` |
| 4 | Condo door | 22,28 | 2 | 1 player-touch | `doors1` | Followers.follow_into_door | `[0,12,6,9,8,1]` |
| 7 | Poké Center door | 47,10 | 2 | 1 player-touch | `doors3` | Followers.follow_into_door | `[0,9,7,8,8,1]` |
| 8 | Game Corner door | 34,20 | 2 | 1 player-touch | `doors6` | Followers.follow_into_door | `[0,13,9,13,8,1]` |
| 9 | Institute door | 35,28 | 2 | 1 player-touch | `doors4` | Followers.follow_into_door | `[0,11,7,9,8,1]` |
| 12 | Prize building door | 39,19 | 2 | 1 player-touch | `doors6` | Followers.follow_into_door | `[0,13,4,29,8,1]` |

门的 page 1：`switch1_valid=true` `switch1_id=22`，trigger 3 autorun。开关 22 的系统名未解析。

### 5.3 招牌

| Event ID | Name | x,y | trigger | 文本命令 |
|---:|---|---|---|---|
| 5 | Gym sign | 13,30 | 0 action-button | 1 show-text |
| 6 | Condo sign | 20,29 | 0 action-button | 1 show-text |
| 10 | Lab sign, size(2,1) | 33,28 | 0 action-button | 2 show-text |

完整命令见附录 A。

## 6. 页面生效条件与优先级

v21.1 `Game_Event#refresh` 从最后一页向前选第一张条件满足的页。`Game_Event#start` 仅当 `@list.size > 1` 时置 `@starting`，不执行命令。

## 7. 原版源码与事件时序

已由 tag v21.1 源码证明，**不是** Map 7 桥事件逐帧观察：

1. `Scene_Map#update` 先 `pbMapInterpreter.update`，再 `$game_player.update`。
2. `Game_Player#move_generic` 先 `can_move_in_direction?`；失败才 `check_event_trigger_touch` → `start`。同一次 `move_generic` 不会立刻重算通行。
3. `start` 只置位。命令在之后的解释器 `update` 中执行。`command_355` 拼接后 `eval`。
4. `pbBridgeOn(height=2)` / `pbBridgeOff` 只写 `$PokemonGlobal.bridge`。`transfer_player` 总是 `pbBridgeOff`。
5. `Game_Map#playerPassable?` 在 tag Bridge 时按 `bridge==0` 忽略该层、`bridge>0` 只信桥面 passage。
6. `TilemapRenderer#refresh_tile_z` 在 `bridge>0` 时把桥面 z 降为 0。

仍需动态验证：失败 touch 与解释器执行是否跨一圈 `Scene_Map#update`；无 Wait 短脚本是否可能让**下一次**移动用到新 bridge。Map 7 无桥脚本，不能当正例。旧设计「先执行 contact 再立即重算本次通行」与源码冲突。

## 8. `pbBridgeOn` / `pbBridgeOff` 触发路径

引擎路径见第 7 节。Map 7 **不调用**。本 corpus 实际调用只出现在 Map 21，见第 13 节。

## 9. Map 7 与通行、碰撞、传送

- 无 Bridge 格，无桥头事件。
- StillWater 水池在 (24–29, 20–21)，部分 z=1 Neutral overlay；Ledge 在 (4–8, 32)。都不是桥。
- `MapTransfer/7.json`：0 steps，32 contacts（8 扇门×4 向），edges 南 5 / 西 44 / 东 47 / 北 21。
- `projectedD0Passable` 不知 Neutral/Bridge。Map 7 没有因桥被删的出口，因为没有桥出口。潜在误删风险只对真实桥地图成立。

## 10. 分栏结论

### 已证实事实

1. Map 7 是 Cedolan City，60×43，tileset 1，无桥事件、无 Bridge 图块。
2. 全 corpus 69 张 `Map*.rxdata` 中，**只有 Map 21 Route 2** 放置了 Bridge 图块并含 `pbBridgeOn/Off`。
3. Tileset 1、2、6 定义了 tag 15；使用这些 tileset 的其他地图放置次数为 0。
4. v21.1 先通行后 touch start；`start` ≠ 执行；切图关桥。
5. Map 27 名称是 Pokémon Day Care；Map 47 是 Route 7，tileset 1，**没有** Bridge 图块。

### 合理推论（不是冻结依据）

1. 若合同需要真实桥头事件，授权对象应是 Map 21，不是 Map 7。
2. Map 21 的 8 个确认事件是成对的 `size()` 不可见 touch 带，用来在桥端切换 `pbBridgeOn` / `pbBridgeOff`。

### 未解决问题

1. Map 47 悬崖路线。
2. Map 21 尚未按 Map 7 附录 A 的完整 209/509 命令级转储；目前是页摘要与脚本原文。
3. Map 21 的 `projectedD0Passable` 对照、逐帧 RGSS、合法 CI fixture。
4. 未运行原版游戏。

## 11. 事实 → 设计规则候选 → 将来测试 ID

| 事实 | 规则候选 | 将来测试 ID |
|---|---|---|
| Map 7 无桥 | 不得把 Map 7 坐标写成 Bridge 运行时逻辑 | `BR-EVENT-MAP7-NEG-*` |
| 全 corpus 仅 Map 21 有桥 | 真实桥正例须单独立项 Map 21 | `BR-EVENT-MAP21-*`（未授权实施） |
| Tileset 1/2/6 有 tag 15 定义 | 投影 terrain_tags 与是否放置是两件事 | `DATA-TAG-15-*` |
| `move_generic` 先通行后 touch | 禁止「contact 后立即重算本次移动」 | `BR-EVENT-ORDER-*` |
| Map 21 确认事件 trigger 1、through false、空图形、`size()` | 桥头是不可见扩大碰撞的 player-touch，不是门图形 | `BR-EVENT-SIZE-*` |
| 邻接桥面的 Yamask 进化事件无 pbBridge | 邻接 ≠ 桥脚本；不得误投影 | `BR-EVENT-ADJ-NEG-*` |

## 12. 取证结论与覆盖范围

**Map 7：** 不包含桥状态事件，也不包含 Bridge 地形。桥层不会由本图事件切换。

**全 corpus：** 69/69 张地图扫描后，唯一同时具有 Bridge 图块和 `pbBridgeOn/Off` 的地图是 **Map 21 Route 2**。

**FG-01** 仍 OPEN：Map 7 负证据已完成；Map 21 已定位但不是原门禁指定对象、也未做 Map 47。不得标 Contract Frozen。

## 13. 哪些地图有桥（全 corpus 清单）

扫描覆盖：`MapInfos` 69 条；`Map*.rxdata` 69 个文件。检索包括：terrain tag 15 放置、拼接脚本 `pbBridgeOn/Off`、事件名、事件注释、地图显示名。**不是**只搜事件名。

### 13.1 定义了 Bridge 标签的图块集

这些图块集**可以**画出桥，不等于某张地图已经放置：

| Tileset ID | 名称 | tileset_name | tag 15 tile 数 | tile IDs |
|---:|---|---|---:|---|
| 1 | Outside | Outside | 17 | 1616, 1617, 1618, 1619, 1624, 1625, 1626, 1627, 1632, 1633, 1634, 1635, 1640, 1641, 1642, 1643, 1651 |
| 2 | Outside waterfall | Outside | 17 | 1616, 1617, 1618, 1619, 1624, 1625, 1626, 1627, 1632, 1633, 1634, 1635, 1640, 1641, 1642, 1643, 1651 |
| 6 | Caves | Caves | 17 | 384, 385, 386, 387, 392, 393, 394, 395, 400, 401, 402, 403, 408, 409, 410, 411, 419 |

其余 tileset（3–5、7–25 中实际存在的条目）`bridgeTileCount = 0`。

使用上述图块集但 **Bridge 放置 = 0** 的地图：

- Tileset 1 Outside（20 张地图，仅 Map 21 放置了桥）：2 Lappet Town，5 Route 1，**7 Cedolan City**，23 Lerucean Town，28 Natural Park，31 Route 3，35 Ingido Plateau outside，39 Route 4，40 Route 4 Cycling Road，41 Route 5，44 Route 6，45 Route 6 Cycling Road，**47 Route 7**，52 Battle Frontier，66 Safari Zone outside，68 Safari Zone，72 Berth Island，73 Faraday Island，75 Tiall Region。
- Tileset 2 Outside waterfall：69 Route 8。
- Tileset 6 Caves：34 Ice Cave，49 Rock Cave 1F，50 Rock Cave B1F。

地图名、事件名、事件注释含 `bridge` 的命中：**0**。

### 13.2 实际放置了桥 / 调用了桥脚本的地图

| Map ID | 名称 | 文件 | tileset | 尺寸 | Bridge 格（唯一 x,y） | 放置层次数 | bbox | pbBridge 事件 | 地图名/事件名/注释 |
|---:|---|---|---:|---|---:|---:|---|---:|---|
| 21 | Route 2 | Map021.rxdata | 1 | 39×77 | 93 | 93 | (8,10)–(32,66) | 8 确认 | 0 |

**结论：本官方 v21.1 corpus 里，玩家能走上的桥只出现在 Map 21 Route 2。** Map 7 / Map 47 / Map 27 都没有。

使用的 Bridge tile IDs（Map 21）：1616, 1617, 1618, 1627, 1635, 1643。样本格从 (31,10) 起沿 z=2 放置 1616/1618。

### 13.3 Map 21 已确认桥脚本事件

8 个事件均为单页、`alwaysActive`、trigger 1 player-touch、through false、always_on_top false、空图形 `tile_id=0` `character_name=""`。事件名带 `size(w,h)`，用于覆盖整条桥端通路。脚本都是单条 355，没有 655 续行。均无 Transfer Player。`terrainHits` 为空：事件格子本身不是 Bridge tile，靠 `size()` 扩大占用。

| Event ID | Name | x,y | 页 | trigger | through | graphic | 脚本 |
|---:|---|---|---:|---|---|---|---|
| 4 | EV004 size(1,4) | 20,49 | 1 | 1 player-touch | false | "" | `pbBridgeOn` |
| 7 | EV007 size(3,1) | 14,31 | 1 | 1 player-touch | false | "" | `pbBridgeOff` |
| 10 | EV010 size(3,1) | 14,32 | 1 | 1 player-touch | false | "" | `pbBridgeOn` |
| 20 | EV020 size(2,1) | 22,58 | 1 | 1 player-touch | false | "" | `pbBridgeOff` |
| 22 | EV022 size(2,1) | 22,57 | 1 | 1 player-touch | false | "" | `pbBridgeOn` |
| 23 | EV023 size(2,1) | 14,69 | 1 | 1 player-touch | false | "" | `pbBridgeOff` |
| 25 | EV025 size(2,1) | 14,68 | 1 | 1 player-touch | false | "" | `pbBridgeOn` |
| 28 | EV028 size(1,4) | 19,49 | 1 | 1 player-touch | false | "" | `pbBridgeOff` |

成对关系（静态相邻，不是运行时证明）：

| 功能 | On | Off |
|---|---|---|
| 竖条 size(1,4) @ y=49 | Event 4 (20,49) `pbBridgeOn` | Event 28 (19,49) `pbBridgeOff` |
| 横条 size(3,1) @ x=14 | Event 10 (14,32) `pbBridgeOn` | Event 7 (14,31) `pbBridgeOff` |
| 横条 size(2,1) @ x=22 | Event 22 (22,57) `pbBridgeOn` | Event 20 (22,58) `pbBridgeOff` |
| 横条 size(2,1) @ x=14 | Event 25 (14,68) `pbBridgeOn` | Event 23 (14,69) `pbBridgeOff` |

注释说明 `size()` 用一个事件覆盖整条通路。这些事件**尚未**按附录 A 导出全部 209/509 命令；当前证据足以证明「谁在何时调用 pbBridgeOn/Off」，不足以代替 Map 21 的完整命令级冻结。

### 13.4 Map 21 未确认候选（不得当成桥脚本）

因正交邻接 Bridge 格进入候选，脚本是 `pbEvolutionEvent(2)`，不是桥：

| Event ID | Name | x,y | 原因 | 邻接桥格 | 脚本 |
|---:|---|---|---|---|---|
| 1 | Galarian Yamask evo left size(1,4) | 30,15 | event-tile-orthogonally-adjacent-to-bridge-terrain | adj 31,15 | `pbEvolutionEvent(2)` |
| 2 | Galarian Yamask evo right size(1,4) | 33,15 | event-tile-orthogonally-adjacent-to-bridge-terrain | adj 32,15 | `pbEvolutionEvent(2)` |

### 13.5 与 Map 7 / 冻结的关系

- Map 7 北缘 edge 通向 Map 21，那只是地图连接，不在 Map 7 上放置桥。
- 不得把 Map 21 Event ID/坐标写进 Runtime。
- `projectedD0Passable` 是否丢掉 Map 21 的 step/edge：**未在本次对照**，标为潜在问题。
- FG-01 不因定位到 Map 21 而 PASS。

---

## 附录 A. Map 7 全部事件的原始命令表

由取证库按 Event ID、pageIndex、command.index 稳定排序生成。这是派生摘要，不是 `Map007.rxdata` 本身。

### Event 1 `"Dept door left"` @ (11, 13)

- Map ID: 7
- Event ID: 1
- Name: Dept door left
- Coordinates: x=11, y=13
- Page count: 2; original page order is 0..1

#### Page 0 / 2 (originalOrder=0)

- trigger: `1` (player-touch)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `"doors6"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `1`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 16–16:
    ```ruby
Followers.follow_into_door
    ```
- commands (33), original order:

```
000 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
001 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
002 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
003 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
004 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
005 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
006 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
007 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
008 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
009 indent=0 code=210 wait-for-move-completion params=[]
010 indent=0 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
011 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}}]
012 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}}]
013 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}}]
014 indent=0 code=210 wait-for-move-completion params=[]
015 indent=0 code=208 change-transparent-flag params=[0]
016 indent=0 code=355 script params=[{"kind":"RubyString","text":"Followers.follow_into_door"}] script="Followers.follow_into_door"
017 indent=0 code=210 wait-for-move-completion params=[]
018 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
020 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
021 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
022 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
023 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
024 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
025 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
026 indent=0 code=210 wait-for-move-completion params=[]
027 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":-255,"green":-255,"blue":-255,"gray":0},6]
028 indent=0 code=106 wait params=[8]
029 indent=0 code=208 change-transparent-flag params=[1]
030 indent=0 code=201 transfer-player params=[0,14,2,14,8,1]
031 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":0,"green":0,"blue":0,"gray":0},6]
032 indent=0 code=0 empty-or-end params=[]
```

#### Page 1 / 2 (originalOrder=1)

- trigger: `3` (autorun)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `true` switch1_id=`22`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `false`
- graphic.tile_id: `0`
- graphic.character_name: `"doors6"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `1`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 2–2:
    ```ruby
Followers.hide_followers
    ```
  - commands 17–17:
    ```ruby
Followers.put_followers_on_player
    ```
  - commands 28–28:
    ```ruby
setTempSwitchOn("A")
    ```
- commands (30), original order:

```
000 indent=0 code=111 conditional-branch params=[12,{"kind":"RubyString","text":"get_self.onEvent?"}]
001 indent=1 code=208 change-transparent-flag params=[0]
002 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.hide_followers"}] script="Followers.hide_followers"
003 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
004 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
005 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
006 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
007 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
008 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
009 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
010 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
011 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
012 indent=1 code=210 wait-for-move-completion params=[]
013 indent=1 code=208 change-transparent-flag params=[1]
014 indent=1 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
015 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}}]
016 indent=1 code=210 wait-for-move-completion params=[]
017 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.put_followers_on_player"}] script="Followers.put_followers_on_player"
018 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
020 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
021 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
022 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
023 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
024 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
025 indent=1 code=210 wait-for-move-completion params=[]
026 indent=1 code=0 empty-or-end params=[]
027 indent=0 code=412 branch-end params=[]
028 indent=0 code=355 script params=[{"kind":"RubyString","text":"setTempSwitchOn(\"A\")"}] script="setTempSwitchOn(\"A\")"
029 indent=0 code=0 empty-or-end params=[]
```

### Event 2 `"Dept door right"` @ (15, 13)

- Map ID: 7
- Event ID: 2
- Name: Dept door right
- Coordinates: x=15, y=13
- Page count: 2; original page order is 0..1

#### Page 0 / 2 (originalOrder=0)

- trigger: `1` (player-touch)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `"doors6"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `1`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 16–16:
    ```ruby
Followers.follow_into_door
    ```
- commands (33), original order:

```
000 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
001 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
002 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
003 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
004 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
005 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
006 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
007 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
008 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
009 indent=0 code=210 wait-for-move-completion params=[]
010 indent=0 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
011 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}}]
012 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}}]
013 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}}]
014 indent=0 code=210 wait-for-move-completion params=[]
015 indent=0 code=208 change-transparent-flag params=[0]
016 indent=0 code=355 script params=[{"kind":"RubyString","text":"Followers.follow_into_door"}] script="Followers.follow_into_door"
017 indent=0 code=210 wait-for-move-completion params=[]
018 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
020 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
021 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
022 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
023 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
024 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
025 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
026 indent=0 code=210 wait-for-move-completion params=[]
027 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":-255,"green":-255,"blue":-255,"gray":0},6]
028 indent=0 code=106 wait params=[8]
029 indent=0 code=208 change-transparent-flag params=[1]
030 indent=0 code=201 transfer-player params=[0,14,10,14,8,1]
031 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":0,"green":0,"blue":0,"gray":0},6]
032 indent=0 code=0 empty-or-end params=[]
```

#### Page 1 / 2 (originalOrder=1)

- trigger: `3` (autorun)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `true` switch1_id=`22`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `false`
- graphic.tile_id: `0`
- graphic.character_name: `"doors6"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `1`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 2–2:
    ```ruby
Followers.hide_followers
    ```
  - commands 17–17:
    ```ruby
Followers.put_followers_on_player
    ```
  - commands 28–28:
    ```ruby
setTempSwitchOn("A")
    ```
- commands (30), original order:

```
000 indent=0 code=111 conditional-branch params=[12,{"kind":"RubyString","text":"get_self.onEvent?"}]
001 indent=1 code=208 change-transparent-flag params=[0]
002 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.hide_followers"}] script="Followers.hide_followers"
003 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
004 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
005 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
006 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
007 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
008 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
009 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
010 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
011 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
012 indent=1 code=210 wait-for-move-completion params=[]
013 indent=1 code=208 change-transparent-flag params=[1]
014 indent=1 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
015 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}}]
016 indent=1 code=210 wait-for-move-completion params=[]
017 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.put_followers_on_player"}] script="Followers.put_followers_on_player"
018 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
020 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
021 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
022 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
023 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
024 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
025 indent=1 code=210 wait-for-move-completion params=[]
026 indent=1 code=0 empty-or-end params=[]
027 indent=0 code=412 branch-end params=[]
028 indent=0 code=355 script params=[{"kind":"RubyString","text":"setTempSwitchOn(\"A\")"}] script="setTempSwitchOn(\"A\")"
029 indent=0 code=0 empty-or-end params=[]
```

### Event 3 `"Gym door"` @ (11, 29)

- Map ID: 7
- Event ID: 3
- Name: Gym door
- Coordinates: x=11, y=29
- Page count: 2; original page order is 0..1

#### Page 0 / 2 (originalOrder=0)

- trigger: `1` (player-touch)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `"doors6"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `0`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 16–16:
    ```ruby
Followers.follow_into_door
    ```
- commands (33), original order:

```
000 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
001 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
002 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
003 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
004 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
005 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
006 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
007 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
008 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
009 indent=0 code=210 wait-for-move-completion params=[]
010 indent=0 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
011 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}}]
012 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}}]
013 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}}]
014 indent=0 code=210 wait-for-move-completion params=[]
015 indent=0 code=208 change-transparent-flag params=[0]
016 indent=0 code=355 script params=[{"kind":"RubyString","text":"Followers.follow_into_door"}] script="Followers.follow_into_door"
017 indent=0 code=210 wait-for-move-completion params=[]
018 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
020 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
021 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
022 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
023 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
024 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
025 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
026 indent=0 code=210 wait-for-move-completion params=[]
027 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":-255,"green":-255,"blue":-255,"gray":0},6]
028 indent=0 code=106 wait params=[8]
029 indent=0 code=208 change-transparent-flag params=[1]
030 indent=0 code=201 transfer-player params=[0,10,6,14,8,1]
031 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":0,"green":0,"blue":0,"gray":0},6]
032 indent=0 code=0 empty-or-end params=[]
```

#### Page 1 / 2 (originalOrder=1)

- trigger: `3` (autorun)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `true` switch1_id=`22`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `false`
- graphic.tile_id: `0`
- graphic.character_name: `"doors6"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `0`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 2–2:
    ```ruby
Followers.hide_followers
    ```
  - commands 17–17:
    ```ruby
Followers.put_followers_on_player
    ```
  - commands 28–28:
    ```ruby
setTempSwitchOn("A")
    ```
- commands (30), original order:

```
000 indent=0 code=111 conditional-branch params=[12,{"kind":"RubyString","text":"get_self.onEvent?"}]
001 indent=1 code=208 change-transparent-flag params=[0]
002 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.hide_followers"}] script="Followers.hide_followers"
003 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
004 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
005 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
006 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
007 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
008 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
009 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
010 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
011 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
012 indent=1 code=210 wait-for-move-completion params=[]
013 indent=1 code=208 change-transparent-flag params=[1]
014 indent=1 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
015 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}}]
016 indent=1 code=210 wait-for-move-completion params=[]
017 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.put_followers_on_player"}] script="Followers.put_followers_on_player"
018 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
020 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
021 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
022 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
023 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
024 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
025 indent=1 code=210 wait-for-move-completion params=[]
026 indent=1 code=0 empty-or-end params=[]
027 indent=0 code=412 branch-end params=[]
028 indent=0 code=355 script params=[{"kind":"RubyString","text":"setTempSwitchOn(\"A\")"}] script="setTempSwitchOn(\"A\")"
029 indent=0 code=0 empty-or-end params=[]
```

### Event 4 `"Condo door"` @ (22, 28)

- Map ID: 7
- Event ID: 4
- Name: Condo door
- Coordinates: x=22, y=28
- Page count: 2; original page order is 0..1

#### Page 0 / 2 (originalOrder=0)

- trigger: `1` (player-touch)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `"doors1"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `1`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 16–16:
    ```ruby
Followers.follow_into_door
    ```
- commands (33), original order:

```
000 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door enter"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
001 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door enter"},"@pitch":100,"@volume":100}}]}}}]
002 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
003 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
004 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
005 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
006 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
007 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
008 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
009 indent=0 code=210 wait-for-move-completion params=[]
010 indent=0 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
011 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}}]
012 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}}]
013 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}}]
014 indent=0 code=210 wait-for-move-completion params=[]
015 indent=0 code=208 change-transparent-flag params=[0]
016 indent=0 code=355 script params=[{"kind":"RubyString","text":"Followers.follow_into_door"}] script="Followers.follow_into_door"
017 indent=0 code=210 wait-for-move-completion params=[]
018 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
020 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
021 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
022 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
023 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
024 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
025 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
026 indent=0 code=210 wait-for-move-completion params=[]
027 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":-255,"green":-255,"blue":-255,"gray":0},6]
028 indent=0 code=106 wait params=[8]
029 indent=0 code=208 change-transparent-flag params=[1]
030 indent=0 code=201 transfer-player params=[0,12,6,9,8,1]
031 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":0,"green":0,"blue":0,"gray":0},6]
032 indent=0 code=0 empty-or-end params=[]
```

#### Page 1 / 2 (originalOrder=1)

- trigger: `3` (autorun)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `true` switch1_id=`22`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `false`
- graphic.tile_id: `0`
- graphic.character_name: `"doors1"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `1`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 2–2:
    ```ruby
Followers.hide_followers
    ```
  - commands 17–17:
    ```ruby
Followers.put_followers_on_player
    ```
  - commands 28–28:
    ```ruby
setTempSwitchOn("A")
    ```
- commands (30), original order:

```
000 indent=0 code=111 conditional-branch params=[12,{"kind":"RubyString","text":"get_self.onEvent?"}]
001 indent=1 code=208 change-transparent-flag params=[0]
002 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.hide_followers"}] script="Followers.hide_followers"
003 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door enter"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
004 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door enter"},"@pitch":100,"@volume":100}}]}}}]
005 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
006 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
007 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
008 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
009 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
010 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
011 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
012 indent=1 code=210 wait-for-move-completion params=[]
013 indent=1 code=208 change-transparent-flag params=[1]
014 indent=1 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
015 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}}]
016 indent=1 code=210 wait-for-move-completion params=[]
017 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.put_followers_on_player"}] script="Followers.put_followers_on_player"
018 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
020 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
021 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
022 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
023 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
024 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
025 indent=1 code=210 wait-for-move-completion params=[]
026 indent=1 code=0 empty-or-end params=[]
027 indent=0 code=412 branch-end params=[]
028 indent=0 code=355 script params=[{"kind":"RubyString","text":"setTempSwitchOn(\"A\")"}] script="setTempSwitchOn(\"A\")"
029 indent=0 code=0 empty-or-end params=[]
```

### Event 5 `"Gym sign"` @ (13, 30)

- Map ID: 7
- Event ID: 5
- Name: Gym sign
- Coordinates: x=13, y=30
- Page count: 1; original page order is 0..0

#### Page 0 / 1 (originalOrder=0)

- trigger: `0` (action-button)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `""`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `0`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: none
- commands (2), original order:

```
000 indent=0 code=101 show-text params=[{"kind":"RubyString","text":"\\w[signskin]Cedolan Gym"}]
001 indent=0 code=0 empty-or-end params=[]
```

### Event 6 `"Condo sign"` @ (20, 29)

- Map ID: 7
- Event ID: 6
- Name: Condo sign
- Coordinates: x=20, y=29
- Page count: 1; original page order is 0..0

#### Page 0 / 1 (originalOrder=0)

- trigger: `0` (action-button)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `""`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `0`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: none
- commands (2), original order:

```
000 indent=0 code=101 show-text params=[{"kind":"RubyString","text":"\\w[signskin]Move Maniac Meeting Room"}]
001 indent=0 code=0 empty-or-end params=[]
```

### Event 7 `"Poké Center door"` @ (47, 10)

- Map ID: 7
- Event ID: 7
- Name: Poké Center door
- Coordinates: x=47, y=10
- Page count: 2; original page order is 0..1

#### Page 0 / 2 (originalOrder=0)

- trigger: `1` (player-touch)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `"doors3"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `3`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 16–16:
    ```ruby
Followers.follow_into_door
    ```
- commands (33), original order:

```
000 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
001 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
002 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
003 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
004 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
005 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
006 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
007 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
008 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
009 indent=0 code=210 wait-for-move-completion params=[]
010 indent=0 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
011 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}}]
012 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}}]
013 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}}]
014 indent=0 code=210 wait-for-move-completion params=[]
015 indent=0 code=208 change-transparent-flag params=[0]
016 indent=0 code=355 script params=[{"kind":"RubyString","text":"Followers.follow_into_door"}] script="Followers.follow_into_door"
017 indent=0 code=210 wait-for-move-completion params=[]
018 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
020 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
021 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
022 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
023 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
024 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
025 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
026 indent=0 code=210 wait-for-move-completion params=[]
027 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":-255,"green":-255,"blue":-255,"gray":0},6]
028 indent=0 code=106 wait params=[8]
029 indent=0 code=208 change-transparent-flag params=[1]
030 indent=0 code=201 transfer-player params=[0,9,7,8,8,1]
031 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":0,"green":0,"blue":0,"gray":0},6]
032 indent=0 code=0 empty-or-end params=[]
```

#### Page 1 / 2 (originalOrder=1)

- trigger: `3` (autorun)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `true` switch1_id=`22`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `false`
- graphic.tile_id: `0`
- graphic.character_name: `"doors3"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `3`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 2–2:
    ```ruby
Followers.hide_followers
    ```
  - commands 17–17:
    ```ruby
Followers.put_followers_on_player
    ```
  - commands 28–28:
    ```ruby
setTempSwitchOn("A")
    ```
- commands (30), original order:

```
000 indent=0 code=111 conditional-branch params=[12,{"kind":"RubyString","text":"get_self.onEvent?"}]
001 indent=1 code=208 change-transparent-flag params=[0]
002 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.hide_followers"}] script="Followers.hide_followers"
003 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
004 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
005 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
006 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
007 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
008 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
009 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
010 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
011 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
012 indent=1 code=210 wait-for-move-completion params=[]
013 indent=1 code=208 change-transparent-flag params=[1]
014 indent=1 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
015 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}}]
016 indent=1 code=210 wait-for-move-completion params=[]
017 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.put_followers_on_player"}] script="Followers.put_followers_on_player"
018 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
020 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
021 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
022 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
023 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
024 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
025 indent=1 code=210 wait-for-move-completion params=[]
026 indent=1 code=0 empty-or-end params=[]
027 indent=0 code=412 branch-end params=[]
028 indent=0 code=355 script params=[{"kind":"RubyString","text":"setTempSwitchOn(\"A\")"}] script="setTempSwitchOn(\"A\")"
029 indent=0 code=0 empty-or-end params=[]
```

### Event 8 `"Game Corner door"` @ (34, 20)

- Map ID: 7
- Event ID: 8
- Name: Game Corner door
- Coordinates: x=34, y=20
- Page count: 2; original page order is 0..1

#### Page 0 / 2 (originalOrder=0)

- trigger: `1` (player-touch)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `"doors6"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `0`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 16–16:
    ```ruby
Followers.follow_into_door
    ```
- commands (33), original order:

```
000 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
001 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
002 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
003 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
004 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
005 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
006 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
007 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
008 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
009 indent=0 code=210 wait-for-move-completion params=[]
010 indent=0 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
011 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}}]
012 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}}]
013 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}}]
014 indent=0 code=210 wait-for-move-completion params=[]
015 indent=0 code=208 change-transparent-flag params=[0]
016 indent=0 code=355 script params=[{"kind":"RubyString","text":"Followers.follow_into_door"}] script="Followers.follow_into_door"
017 indent=0 code=210 wait-for-move-completion params=[]
018 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
020 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
021 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
022 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
023 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
024 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
025 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
026 indent=0 code=210 wait-for-move-completion params=[]
027 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":-255,"green":-255,"blue":-255,"gray":0},6]
028 indent=0 code=106 wait params=[8]
029 indent=0 code=208 change-transparent-flag params=[1]
030 indent=0 code=201 transfer-player params=[0,13,9,13,8,1]
031 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":0,"green":0,"blue":0,"gray":0},6]
032 indent=0 code=0 empty-or-end params=[]
```

#### Page 1 / 2 (originalOrder=1)

- trigger: `3` (autorun)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `true` switch1_id=`22`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `false`
- graphic.tile_id: `0`
- graphic.character_name: `"doors6"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `0`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 2–2:
    ```ruby
Followers.hide_followers
    ```
  - commands 17–17:
    ```ruby
Followers.put_followers_on_player
    ```
  - commands 28–28:
    ```ruby
setTempSwitchOn("A")
    ```
- commands (30), original order:

```
000 indent=0 code=111 conditional-branch params=[12,{"kind":"RubyString","text":"get_self.onEvent?"}]
001 indent=1 code=208 change-transparent-flag params=[0]
002 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.hide_followers"}] script="Followers.hide_followers"
003 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
004 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
005 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
006 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
007 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
008 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
009 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
010 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
011 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
012 indent=1 code=210 wait-for-move-completion params=[]
013 indent=1 code=208 change-transparent-flag params=[1]
014 indent=1 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
015 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}}]
016 indent=1 code=210 wait-for-move-completion params=[]
017 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.put_followers_on_player"}] script="Followers.put_followers_on_player"
018 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
020 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
021 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
022 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
023 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
024 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
025 indent=1 code=210 wait-for-move-completion params=[]
026 indent=1 code=0 empty-or-end params=[]
027 indent=0 code=412 branch-end params=[]
028 indent=0 code=355 script params=[{"kind":"RubyString","text":"setTempSwitchOn(\"A\")"}] script="setTempSwitchOn(\"A\")"
029 indent=0 code=0 empty-or-end params=[]
```

### Event 9 `"Institute door"` @ (35, 28)

- Map ID: 7
- Event ID: 9
- Name: Institute door
- Coordinates: x=35, y=28
- Page count: 2; original page order is 0..1

#### Page 0 / 2 (originalOrder=0)

- trigger: `1` (player-touch)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `"doors4"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `3`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 17–17:
    ```ruby
Followers.follow_into_door
    ```
- commands (34), original order:

```
000 indent=0 code=121 control-switches params=[13,13,1]
001 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door enter"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
002 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door enter"},"@pitch":100,"@volume":100}}]}}}]
003 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
004 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
005 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
006 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
007 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
008 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
009 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
010 indent=0 code=210 wait-for-move-completion params=[]
011 indent=0 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
012 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}}]
013 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}}]
014 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}}]
015 indent=0 code=210 wait-for-move-completion params=[]
016 indent=0 code=208 change-transparent-flag params=[0]
017 indent=0 code=355 script params=[{"kind":"RubyString","text":"Followers.follow_into_door"}] script="Followers.follow_into_door"
018 indent=0 code=210 wait-for-move-completion params=[]
019 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
020 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
021 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
022 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
023 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
024 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
025 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
026 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
027 indent=0 code=210 wait-for-move-completion params=[]
028 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":-255,"green":-255,"blue":-255,"gray":0},6]
029 indent=0 code=106 wait params=[8]
030 indent=0 code=208 change-transparent-flag params=[1]
031 indent=0 code=201 transfer-player params=[0,11,7,9,8,1]
032 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":0,"green":0,"blue":0,"gray":0},6]
033 indent=0 code=0 empty-or-end params=[]
```

#### Page 1 / 2 (originalOrder=1)

- trigger: `3` (autorun)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `true` switch1_id=`22`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `false`
- graphic.tile_id: `0`
- graphic.character_name: `"doors4"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `3`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 2–2:
    ```ruby
Followers.hide_followers
    ```
  - commands 17–17:
    ```ruby
Followers.put_followers_on_player
    ```
  - commands 28–28:
    ```ruby
setTempSwitchOn("A")
    ```
- commands (30), original order:

```
000 indent=0 code=111 conditional-branch params=[12,{"kind":"RubyString","text":"get_self.onEvent?"}]
001 indent=1 code=208 change-transparent-flag params=[0]
002 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.hide_followers"}] script="Followers.hide_followers"
003 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door enter"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
004 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door enter"},"@pitch":100,"@volume":100}}]}}}]
005 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
006 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
007 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
008 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
009 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
010 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
011 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
012 indent=1 code=210 wait-for-move-completion params=[]
013 indent=1 code=208 change-transparent-flag params=[1]
014 indent=1 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
015 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}}]
016 indent=1 code=210 wait-for-move-completion params=[]
017 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.put_followers_on_player"}] script="Followers.put_followers_on_player"
018 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
020 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
021 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
022 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
023 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
024 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
025 indent=1 code=210 wait-for-move-completion params=[]
026 indent=1 code=0 empty-or-end params=[]
027 indent=0 code=412 branch-end params=[]
028 indent=0 code=355 script params=[{"kind":"RubyString","text":"setTempSwitchOn(\"A\")"}] script="setTempSwitchOn(\"A\")"
029 indent=0 code=0 empty-or-end params=[]
```

### Event 10 `"Lab sign, size(2,1)"` @ (33, 28)

- Map ID: 7
- Event ID: 10
- Name: Lab sign, size(2,1)
- Coordinates: x=33, y=28
- Page count: 1; original page order is 0..0

#### Page 0 / 1 (originalOrder=0)

- trigger: `0` (action-button)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `""`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `0`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: none
- commands (12), original order:

```
000 indent=0 code=108 comment params=[{"kind":"RubyString","text":"This event is size 2x1. It is 2 tiles wide and 1 tile tall. "}]
001 indent=0 code=408 comment-continuation params=[{"kind":"RubyString","text":"An event's size can be set by adding \"size(x,y)\" in the "}]
002 indent=0 code=408 comment-continuation params=[{"kind":"RubyString","text":"event's name, where x and y are numbers."}]
003 indent=0 code=108 comment params=[{"kind":"RubyString","text":"The event's placed position determines the bottom "}]
004 indent=0 code=408 comment-continuation params=[{"kind":"RubyString","text":"left tile occupied by the event in-game."}]
005 indent=0 code=108 comment params=[{"kind":"RubyString","text":"There are a lot of reasons to change an event's size. "}]
006 indent=0 code=408 comment-continuation params=[{"kind":"RubyString","text":"Here, it is covering the whole sign with just one "}]
007 indent=0 code=408 comment-continuation params=[{"kind":"RubyString","text":"event, rather than needing two events that do the "}]
008 indent=0 code=408 comment-continuation params=[{"kind":"RubyString","text":"same thing."}]
009 indent=0 code=101 show-text params=[{"kind":"RubyString","text":"\\w[signskin]Pokémon Institute"}]
010 indent=0 code=101 show-text params=[{"kind":"RubyString","text":"\\w[signskin]\"Building Tomorrow Out Of Yesterday\""}]
011 indent=0 code=0 empty-or-end params=[]
```

### Event 12 `"Prize building door"` @ (39, 19)

- Map ID: 7
- Event ID: 12
- Name: Prize building door
- Coordinates: x=39, y=19
- Page count: 2; original page order is 0..1

#### Page 0 / 2 (originalOrder=0)

- trigger: `1` (player-touch)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `false` switch1_id=`1`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `true`
- graphic.tile_id: `0`
- graphic.character_name: `"doors6"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `0`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 16–16:
    ```ruby
Followers.follow_into_door
    ```
- commands (33), original order:

```
000 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
001 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
002 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
003 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
004 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
005 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
006 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
007 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
008 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
009 indent=0 code=210 wait-for-move-completion params=[]
010 indent=0 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
011 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":37,"@parameters":{"kind":"Array","items":[]}}}]
012 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":4,"@parameters":{"kind":"Array","items":[]}}}]
013 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":38,"@parameters":{"kind":"Array","items":[]}}}]
014 indent=0 code=210 wait-for-move-completion params=[]
015 indent=0 code=208 change-transparent-flag params=[0]
016 indent=0 code=355 script params=[{"kind":"RubyString","text":"Followers.follow_into_door"}] script="Followers.follow_into_door"
017 indent=0 code=210 wait-for-move-completion params=[]
018 indent=0 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
020 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
021 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
022 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
023 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
024 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
025 indent=0 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
026 indent=0 code=210 wait-for-move-completion params=[]
027 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":-255,"green":-255,"blue":-255,"gray":0},6]
028 indent=0 code=106 wait params=[8]
029 indent=0 code=208 change-transparent-flag params=[1]
030 indent=0 code=201 transfer-player params=[0,13,4,29,8,1]
031 indent=0 code=223 change-screen-color-tone params=[{"kind":"Tone","red":0,"green":0,"blue":0,"gray":0},6]
032 indent=0 code=0 empty-or-end params=[]
```

#### Page 1 / 2 (originalOrder=1)

- trigger: `3` (autorun)
- through: `false`
- always_on_top: `false`
- move_type: `0`
- condition.switch1_valid: `true` switch1_id=`22`
- condition.switch2_valid: `false` switch2_id=`1`
- condition.variable_valid: `false` variable_id=`1` variable_value=`0`
- condition.self_switch_valid: `false` self_switch_ch=`"A"`
- condition.alwaysActive (all four valid flags false): `false`
- graphic.tile_id: `0`
- graphic.character_name: `"doors6"`
- graphic.character_hue: `0`
- graphic.direction: `2`
- graphic.pattern: `0`
- graphic.opacity: `255`
- graphic.blend_type: `0`
- concatenated 355/655 scripts: 
  - commands 2–2:
    ```ruby
Followers.hide_followers
    ```
  - commands 17–17:
    ```ruby
Followers.put_followers_on_player
    ```
  - commands 28–28:
    ```ruby
setTempSwitchOn("A")
    ```
- commands (30), original order:

```
000 indent=0 code=111 conditional-branch params=[12,{"kind":"RubyString","text":"get_self.onEvent?"}]
001 indent=1 code=208 change-transparent-flag params=[0]
002 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.hide_followers"}] script="Followers.hide_followers"
003 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
004 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":44,"@parameters":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::AudioFile","fields":{"@name":{"kind":"RubyString","text":"Door slide"},"@pitch":100,"@volume":100}}]}}}]
005 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
006 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
007 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
008 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
009 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
010 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":19,"@parameters":{"kind":"Array","items":[]}}}]
011 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
012 indent=1 code=210 wait-for-move-completion params=[]
013 indent=1 code=208 change-transparent-flag params=[1]
014 indent=1 code=209 set-move-route params=[-1,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
015 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":1,"@parameters":{"kind":"Array","items":[]}}}]
016 indent=1 code=210 wait-for-move-completion params=[]
017 indent=1 code=355 script params=[{"kind":"RubyString","text":"Followers.put_followers_on_player"}] script="Followers.put_followers_on_player"
018 indent=1 code=209 set-move-route params=[0,{"kind":"RmxpObject","className":"RPG::MoveRoute","fields":{"@list":{"kind":"Array","items":[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}},{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":0,"@parameters":{"kind":"Array","items":[]}}}]},"@repeat":false,"@skippable":true}}]
019 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":18,"@parameters":{"kind":"Array","items":[]}}}]
020 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
021 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":17,"@parameters":{"kind":"Array","items":[]}}}]
022 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
023 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":16,"@parameters":{"kind":"Array","items":[]}}}]
024 indent=1 code=509 move-route-continuation params=[{"kind":"RmxpObject","className":"RPG::MoveCommand","fields":{"@code":15,"@parameters":{"kind":"Array","items":[2]}}}]
025 indent=1 code=210 wait-for-move-completion params=[]
026 indent=1 code=0 empty-or-end params=[]
027 indent=0 code=412 branch-end params=[]
028 indent=0 code=355 script params=[{"kind":"RubyString","text":"setTempSwitchOn(\"A\")"}] script="setTempSwitchOn(\"A\")"
029 indent=0 code=0 empty-or-end params=[]
```

