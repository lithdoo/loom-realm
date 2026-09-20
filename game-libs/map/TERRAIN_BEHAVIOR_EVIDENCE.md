# 地形行为原版证据（Essentials v21.1）

> 状态：**Evidence record / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。
> 本文只记录已经从本地官方 corpus 和固定 tag `v21.1` 源码读到的事实。它不是冻结合同，不是实施计划，也不证明任何 Runtime 行为已经实现。
> 范围：Map 7 Cedolan City 负例全事件取证；Map 21 Route 2 桥正例（§14 历史指纹 + **§15 本轮 REVIEW-01～04 重跑**）；Map 47 Route 7 悬崖静态取证（§15.4）；同 corpus 69 张地图清单。Map 27 Pokémon Day Care 不是桥样本。未运行原版 RGSS。

## 1. 取证范围、日期、仓库 HEAD、原始素材

| 项 | 值 |
|---|---|
| 日期 | 2026-09-20 |
| 仓库 | `lithdoo/loom-realm`（本工作区） |
| 分支 | `docs/map-terrain-behavior-freeze-handoff` |
| 文档更新基线 HEAD | `9e98b3fd3a1fab60ca47fb99536f71dd69cd51b4` |
| 本轮取证工作区起点 | 同上；证据与取证器变更随本文件同一提交入库 |
| 正式地图对象 | **Map 7 = 负例**；**Map 21 / Map021.rxdata / Route 2 = 桥正例** |
| 本轮追加 | 取证器严格扫描（355/655、209/509 路线脚本、111 type 12、117 调用图、缺表 INCOMPLETE）；Map 7+69 图重跑；Map 21 命令级与 `size()` 源码链；MapTransfer 审计 |
| 明确排除 | 不得用 Map 27 替代；不得把 Map 21 完成写成 Map 47 已取证或 Bridge 已实现 |
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

Map 21 正式对象指纹见 §14.1。清单阶段记录的 SHA-256 与本轮复读一致：`cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575`，28708 字节。

未提交原始 FSDB 或机器绝对路径。解析时读到的绝对路径示例：`examples/essentials-v21.1-local/[FSDB]Essentials v21.1/[resource]Data/Map007.rxdata`。

## 2. 数据解析方式与可复现步骤

复用现有 Marshal / RMXP 解码器，不另起解析器，不 `eval` 地图 Ruby：

- `tools/fixtures/essentials-v21.1/lib/marshal/decoder.mjs`
- `tools/fixtures/essentials-v21.1/lib/rmxp/decoder.mjs`
- `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs`
- `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs`
- 取证库：`tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-event-evidence.mjs`
- CLI：`tools/fixtures/essentials-v21.1/map7-bridge-evidence.mjs`（默认 Map 7）
- CLI：`tools/fixtures/essentials-v21.1/map21-bridge-evidence.mjs`（只允许 Map 21）
- CLI：`tools/fixtures/essentials-v21.1/map47-ledge-evidence.mjs`（只允许 Map 47）
- 独立核对：`tools/fixtures/essentials-v21.1/map-evidence-independent-check.mjs`（直接 decode Table，不比较 collectMapEvidence JSON 自身）

白名单仅 Map **7、21、47**。其它 ID（含 27）立即失败。`--corpus-scan` 要求 MapInfos/Tilesets/CommonEvents 存在，否则 corpus completeness=INCOMPLETE，不得把缺表零命中当成证明。扫描含 355/655、移动路线 code 45、111 type 12、117 嵌套图。不执行 Ruby，不是通用事件解释器。

脚本拼接与 v21.1 `Interpreter#command_355` 一致：从 code 355 起，把后续连续 355 与 655 用 `\n` 连接。

### 2.1 本轮实际执行的命令

环境：Windows 10，Node v22.12.0，cwd 仓库根。有本地 FSDB。未运行原版 RGSS。

```text
node tools/fixtures/essentials-v21.1/map7-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --corpus-scan --output ".local/map7-bridge-evidence.json"
```

- 退出码：`0`
- Map 7：completeness=COMPLETE；provenNegativeBridge=true
- events=11 pages=19 commands=521 scripts(355/655)=32；moveRouteScripts=0；conditionalBranchScripts=8（门页 `get_self.onEvent?`，非桥）；commonEventCalls=0；unverified=[]
- bridge scan=COMPLETE cells=0 candidates=0
- 新增盲区覆盖：移动路线 45、111 type 12、117 图、缺 Tilesets/越界 tile 不再能报假零
- corpusScan：maps=69；completeness=COMPLETE（MapInfos/Tilesets/CommonEvents 均在）；inventory=1（仅 Map 21）；tileMaps=1；scriptMaps=1；cells=93；script hits=8

计数与上一轮 Map 7 11/19/521/0 格/0 候选 **相同**；新扫描没有翻出隐藏桥脚本。

```text
node tools/fixtures/essentials-v21.1/map21-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --output ".local/map21-bridge-evidence.json"
```

- 退出码：`0`
- Map 21：completeness=COMPLETE；39×77 tileset 1；events=17 pages=22 commands=132；scripts=12；moveRoute=0；cond=5；cells=93 placed=93；confirmed=8 IDs 4,7,10,20,22,23,25,28；unconfirmed=2 IDs 1,2
- Map021 SHA-256 与清单记录一致

```text
node --test tools/fixtures/essentials-v21.1/map-event-evidence.test.mjs
```

- 退出码：`0`；tests 18；pass 18；fail 0；skipped 0（本机有 FSDB，live Map 7 / Map 21 / 缺表夹具均执行）
- CI 无 FSDB 时：合成用例仍会跑；live Map 7/21 与「缺表 INCOMPLETE」夹具中依赖官方 rxdata 的项 skip。skip ≠ PASS。

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

结果：`candidates.length === 0`，`completeness.status=COMPLETE`，`provenNegativeBridge=true`（仅当 Map/MapInfos/Tilesets/CommonEvents 均在、Table 扫描 COMPLETE、无确认桥脚本、无 unverified 时）。32 段 355/655 的 `matchesBridgePattern` 全为 false。新扫描的 8 条 111 type 12 均为 `get_self.onEvent?`。移动路线脚本 0。地图 117 调用 0。CommonEvents 文件 10 条 `hasBridgeScript` 全为 false。Tileset 1 有 17 个 tag 15 tile ID，Map 7 放置 0。

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

1. 原版 RGSS 动态逐帧未跑；§15 路线与 over_trigger 结果都是 STATIC-INFERRED，不是 DYNAMIC-OBSERVED。
2. 合法可分发的 CI fixture 仍无；附录 A 许可边界见附录 L。
3. 解释器是否在同一次输入周期内跑完短 pbBridgeOn/Off 脚本：未动态验证。
4. 跨连接地图跳跃、Map 47 中间格有真实事件的样本：本图没有现成原始事件。


## 11. 事实 → 设计规则候选 → 将来测试 ID

| 事实 | 规则候选 | 将来测试 ID |
|---|---|---|
| Map 7 无桥 | 不得把 Map 7 坐标写成 Bridge 运行时逻辑 | `BR-EVENT-MAP7-NEG-*` |
| 全 corpus 仅 Map 21 有桥 | 真实桥正例须单独立项 Map 21 | `BR-EVENT-MAP21-*`（未授权实施） |
| Tileset 1/2/6 有 tag 15 定义 | 投影 terrain_tags 与是否放置是两件事 | `DATA-TAG-15-*` |
| `move_generic` 先通行后 touch | 禁止「contact 后立即重算本次移动」 | `BR-EVENT-ORDER-*` |
| Map 21 确认事件 trigger 1、through false、空图形、`size()` | 形态是不可见占用带；是否 here 取决于 passable?(d=0)。本轮八事件计算结果为 here | `BR-EVENT-SIZE-*` |
| 邻接桥面的 Yamask 进化事件无 pbBridge | 邻接 ≠ 桥脚本；不得误投影 | `BR-EVENT-ADJ-NEG-*` |

## 12. 取证结论与覆盖范围

**Map 7：** 不包含桥状态事件，也不包含 Bridge 地形。桥层不会由本图事件切换。

**全 corpus：** 69/69 张地图扫描后，唯一同时具有 Bridge 图块和 `pbBridgeOn/Off` 的地图是 **Map 21 Route 2**。

**FG-01** 仍 OPEN：Map 7 负例在严格扫描下仍为零桥；Map 21 静态正例取证已写入 §14，不等于动态验收、不等于 Map 47、不等于玩法已实现。不得标 Contract Frozen。

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

注释说明 `size()` 用一个事件覆盖整条通路。完整命令级事实见 **§14**；本轮触发矩阵与连续路线见 **§15**。本节表格保留为 corpus 清单摘要。

### 13.4 Map 21 未确认候选（不得当成桥脚本）

因正交邻接 Bridge 格进入候选，脚本是 `pbEvolutionEvent(2)`，不是桥：

| Event ID | Name | x,y | 原因 | 邻接桥格 | 脚本 |
|---:|---|---|---|---|---|
| 1 | Galarian Yamask evo left size(1,4) | 30,15 | event-tile-orthogonally-adjacent-to-bridge-terrain | adj 31,15 | `pbEvolutionEvent(2)` |
| 2 | Galarian Yamask evo right size(1,4) | 33,15 | event-tile-orthogonally-adjacent-to-bridge-terrain | adj 32,15 | `pbEvolutionEvent(2)` |

### 13.5 与 Map 7 / 冻结的关系

- Map 7 北缘 edge 通向 Map 21，那只是地图连接，不在 Map 7 上放置桥。
- 不得把 Map 21 Event ID/坐标写进 Runtime。
- `projectedD0Passable` 对照见 §14.7：**无已证实误删**；67 格 D0-false 为潜在风险未复现；`21,E,77,47` 为几何越界已排除。
- FG-01 不因 Map 21 静态取证完成而 PASS。

---

## 14. Map 21 Route 2 正式桥正例取证（本轮）

> 观察方式标签：**SOURCE-PROVEN** 固定 tag v21.1 commit `ea7b5d56d2436591160983c4e641a2ceee2d875a` 源码；**STATIC-INFERRED** 由本轮 FSDB 解码 + 源码推导、未运行 RGSS；**DYNAMIC-OBSERVED** 本轮不存在（未运行原版）；**UNVERIFIED** 尚缺证据。本节是原始取证记录，不是 Bridge 玩法实现，也不是规格冻结。

复现命令（本地 FSDB 必须存在）：

```text
node tools/fixtures/essentials-v21.1/map21-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --output ".local/map21-bridge-evidence.json"
node --test tools/fixtures/essentials-v21.1/map-event-evidence.test.mjs
```

完整命令转储只写在 gitignored `.local/map21-bridge-evidence.json` / `.local/map21-compact.json`。仓库只保留结构化事实、指纹与短摘录。

### 14.1 来源文件与地图事实

路径相对仓库根目录 `examples/essentials-v21.1-local/[FSDB]Essentials v21.1/`。SHA-256 由 Node `crypto.createHash("sha256")` 计算。

| 文件 | SHA-256 | 字节 |
|---|---|---:|
| `[resource]Data/Map021.rxdata` | `cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575` | 28708 |
| `[resource]Data/MapInfos.rxdata` | `8ed090fb27db75e046755896e0d4dbb53fa6de6279d21865315dd60f868d5007` | 3377 |
| `[resource]Data/Tilesets.rxdata` | `433033b45527c0f07b781c862724df64d6a416c0ac2ed71907f645c0b2219fa6` | 163802 |
| `[resource]Data/CommonEvents.rxdata` | `196c5ee7f51e656b79514ce203f4077f4b12ff55192ebdf4dd0aefdd7734de12` | 2566 |
| `[struct]MapTransfer/21.json` | `f5bbed3a4a61f2e70f1831928c4cb8a774d524e83839943ae1c2f58ccd1d20bd` | （派生 JSON，steps=[] contacts=[] edges=7） |
| `[resource]PBS/map_connections.txt` | `a81c0a2cfad6ead0358384bdeea00353c796bb98c1b996b4b3b2be1233ee3cb0` | 1121 |

| 项 | 值 |
|---|---|
| Map ID / 显示名 | 21 / Route 2（MapInfos） |
| 尺寸 / Tileset | 39×77 / id 1 Outside |
| 事件 / 页 / 命令 | 17 / 22 / 132 |
| 355/655 脚本段 | 12 |
| 移动路线脚本 (209/509/page `@move_route` code 45) | 0 |
| 条件分支 type 12 脚本 | 5（全部 `pbItemBall(...)`，不是桥） |
| Common Event 117 | 0；可达图 visited=0，cycles=[] |
| 未知命令码 / UNVERIFIED 间接 Ruby | 无 / 无 |
| completeness | COMPLETE；provenNegativeBridge=false |
| 扫描入口 | all-events；all-pages-original-order；all-commands-original-order；355/655 按 `command_355` 用 `\n` 拼接；move-route 45；111 type 12；117 调用图+循环检测 |

事件 ID 原始顺序：1, 2, 4, 7, 10, 13, 14, 15, 16, 17, 18, 20, 22, 23, 25, 27, 28。全页扫描，含非默认页（物品页 1 为 self-switch A 空页）。

### 14.2 Bridge 图块（tag 15）统计口径

口径：地图 Table 每个 `(x,y)` 若任一图层 `z∈{0,1,2}` 的 tile ID 在 Tileset 1 `terrain_tags` 中等于 15，则计 **1 个 unique cell**。`placedBridgeTaggedTiles` 计图层命中次数。本图两者都是 **93**，故 93 格均单层放置。缺 Tilesets、Table 维度/长度错误或 tile ID 越界时扫描标 INCOMPLETE，不得输出仿佛完整的 cells=0。

| 项 | 值 |
|---|---|
| scanStatus | COMPLETE |
| unique cells / placed layers | 93 / 93 |
| 图层 | 全部 z=2 |
| tile IDs（出现次数） | 1616×12，1617×6，1618×12，1627×24，1635×15，1643×24 |
| bbox | (8,10)–(32,66) |
| 正交连通簇（5 组） | 12 格 (31,10)–(32,15)；18 格 (8,18)–(16,19)；27 格 (17,35)–(25,37)；18 格 (26,38)–(28,43)；18 格 (18,64)–(23,66) |
| 确认桥事件占用格上的 tag 15 | **0**。事件格本身不是 Bridge 图块 |

Tileset 1 passage/priority 随 tile ID 变化；67/93 格在 importer `projectedD0Passable` 下为 false（见 §14.7）。这不等于原版 `Game_Map#playerPassable?`（后者认识 `bridge` 状态）。

### 14.3 确认桥事件矩阵

8 个事件均为单页、`alwaysActive`（四条件位全 false）、trigger **1** player-touch、`through=false`、`always_on_top=false`、空图形 `tile_id=0` `character_name=""`、`move_type=0`、无 209/210/111/117/201、无 Wait。脚本都是单独一条 code 355，无 655 续行，无参数，因此 `pbBridgeOn` 使用原版默认 `height=2`。

占用范围按 v21.1 `Game_Event#initialize` 解析事件名 `size(w,h)`，原点为 **占用矩形的左下格**（事件注释与源码一致）：`x ∈ [originX, originX+width)`，`y ∈ [originY-height+1, originY]`。

| ID | 名称 | 原点 (x,y) | size | 占用格 | 355 文本 | 命令序列（index/code/indent） |
|---:|---|---|---|---|---|---|
| 4 | EV004 size(1,4) | 20,49 | 1×4 | x=20, y=46–49 | `pbBridgeOn` | 0–8: 108/408 注释；**9: 355/0 `pbBridgeOn`**；10: 0 |
| 28 | EV028 size(1,4) | 19,49 | 1×4 | x=19, y=46–49 | `pbBridgeOff` | 同上，9: `pbBridgeOff` |
| 10 | EV010 size(3,1) | 14,32 | 3×1 | x=14–16, y=32 | `pbBridgeOn` | 同上结构 |
| 7 | EV007 size(3,1) | 14,31 | 3×1 | x=14–16, y=31 | `pbBridgeOff` | 同上结构 |
| 22 | EV022 size(2,1) | 22,57 | 2×1 | x=22–23, y=57 | `pbBridgeOn` | 注释改为 stairs 宽度；9: `pbBridgeOn` |
| 20 | EV020 size(2,1) | 22,58 | 2×1 | x=22–23, y=58 | `pbBridgeOff` | 9: `pbBridgeOff` |
| 25 | EV025 size(2,1) | 14,68 | 2×1 | x=14–15, y=68 | `pbBridgeOn` | stairs 注释；9: `pbBridgeOn` |
| 23 | EV023 size(2,1) | 14,69 | 2×1 | x=14–15, y=69 | `pbBridgeOff` | 9: `pbBridgeOff` |

成对关系（STATIC-INFERRED 几何，不是运行时绑定）：

| 组 | On | Off | 几何 | 最近 tag 15 簇 |
|---|---|---|---|---|
| A 南北双车道 | EV004 东列 x=20 | EV028 西列 x=19 | 同 y=46–49 相邻列 | 簇 3 (17,35)–(25,37)，约在事件北侧 |
| B 东西端条 | EV010 y=32 | EV007 y=31 | 同 x=14–16 相邻行 | 簇 3 在南侧 y=35+ |
| C 楼梯 | EV022 y=57 | EV020 y=58 | 同 x=22–23；注释 stairs | 北侧通向簇 3/4；南侧曼哈顿最近是簇 5 |
| D 楼梯 | EV025 y=68 | EV023 y=69 | 同 x=14–15；注释 stairs | 簇 5 (18,64)–(23,66) 在北侧 |

### 14.4 邻接候选不得投影为桥

| ID | 名称 | 原点 | 占用 | 进入候选原因 | 实际脚本 |
|---:|---|---|---|---|---|
| 1 | Galarian Yamask evo left size(1,4) | 30,15 | x=30, y=12–15 | 占用格正交邻接簇 1 (31,10)–(32,15) | 页 0：111 参数 `[6,-1,6]`（非 type 12）后 355 `pbEvolutionEvent(2)` |
| 2 | Galarian Yamask evo right size(1,4) | 33,15 | x=33, y=12–15 | 邻接 x=32 的桥格 | 111 `[6,-1,4]` + `pbEvolutionEvent(2)` |

其余事件：13/14 HeadbuttTree `pbHeadbutt` action-button；15–18、27 Item/HiddenItem 的 type 12 `pbItemBall`。均无 `pbBridgeOn/Off`。

### 14.5 `size(w,h)` 原版调用链（SOURCE-PROVEN）

固定版本：Pokémon Essentials tag [v21.1](https://github.com/Maruno17/pokemon-essentials/tree/v21.1) / commit `ea7b5d56d2436591160983c4e641a2ceee2d875a`。

| 步骤 | 路径 | 方法 | 行为 |
|---|---|---|---|
| 解析名称 | `Data/Scripts/004_Game classes/007_Game_Event.rb` | `Game_Event#initialize` | `@event.name[/size\((\d+),(\d+)\)/i]` → `@width`/`@height`。无匹配时沿用 `Game_Character` 默认 1×1（同文件 `006_Game_Character.rb` 约 L43–44） |
| 占用查询 | `006_Game_Character.rb` | `#at_coordinate?` | `check_x >= @x && check_x < @x+@width && check_y > @y-@height && check_y <= @y` |
| 占用枚举 | 同上 | `#each_occupied_tile` | `x` 向东 `width` 格，`y` 从 `@y-height+1` 到 `@y`（原点=左下） |
| 事件挡玩家 | 同上 `#passable?` | 约 L249–251 | 仅当目标格事件 `character_name != ""` 且 `through` 为假时挡住玩家。**空图形不挡玩家**，与 page `through=false` 无关 |
| over_trigger | `007_Game_Event.rb` | `#over_trigger?` | 空名图且非 hiddenitem 时，任一占用格 `map.passable?(i,j,0,player)` 则为 true |
| 失败 touch | `008_Game_Player.rb` | `#move_generic` → `#check_event_trigger_touch` | 通行失败才检查面前格。**跳过** `over_trigger?` 为 true 的事件 |
| 成功落点 | 同上 | `#update_event_triggering` → `#check_event_trigger_here([1,2])` | 一步走完且 `!moving?` 后，对**当前格**占用且 `over_trigger?` 的 trigger 1/2 事件 `start` |
| start≠执行 | `007_Game_Event.rb` | `#start` | `@list.size > 1` 时置 `@starting`，不跑命令 |
| 脚本 | `003_Game processing/004_Interpreter_Commands.rb` | `#command_355` | 连续 355/655 用 `"\n"` 拼接后 `eval` |
| 桥状态 | `012_Overworld/001_Overworld.rb` 约 L594–599 | `pbBridgeOn(height=2)` / `pbBridgeOff` | 只写 `$PokemonGlobal.bridge` |
| 切图清零 | `003_Game processing/002_Scene_Map.rb` | `Scene_Map#transfer_player` | 始终 `pbBridgeOff` |
| 桥通行 | `004_Game classes/004_Game_Map.rb` | `#playerPassable?` | `bridge==0` 跳过 Bridge 层；`bridge>0` 只信桥面 passage |

空图形 `size()` **只取得** `over_trigger?` 的资格，不是结果。v21.1 `playerPassable?` 对 `d=0` 使用 Ruby 1.8 `1 << ((0/2)-1)` 右移，bit=0（忽略方向位，仍检查 `0x0f` 与 priority）。本轮对八事件**全部占用格**逐层计算后，bridgeLevel 0 与 2 均为 `over_trigger?=true`，分支 **here**（STATIC-INFERRED）。占用格是地面（如 tile 387），不是 tag 15，故桥层不改变该结果。失败 bump **不会** start：`check_event_trigger_touch` 跳过 over_trigger 事件（SOURCE-PROVEN）。详见 §15.2。不得把空图形写成未经计算的 bump-to-start 或必然 walk-on。

从不同方向命中：玩家只要 **成功走进** 任一占用格即 `at_coordinate?` 为真。横向 3×1 带从东/西/南/北踏入均可；竖向 1×4 带同理。失败 bump 不会 start 这些 here 事件。上桥必须从 Off（陆地）外侧走向 On；中北组陆地在北，见 §15.3。

### 14.6 四组桥端最小路线（静态；已被 §15.3 取代为连续输入）

下列坐标与输入是 STATIC-INFERRED。桥层切换时机的源码骨架是 SOURCE-PROVEN。逐帧日志 DYNAMIC-OBSERVED=无。未跑原版不得当作已动态验证。

公共时序（SOURCE-PROVEN）：

```text
input dir
 → move_generic: can_move_in_direction?
      ├─ false → check_event_trigger_touch（跳过 over_trigger 事件）→ 可能 bump → 本次无脚本
      └─ true  → 写入新 x,y，播放一步
           → 步完成后 update_event_triggering
           → check_event_trigger_here → Event#start（只置位）
           → 之后 Scene_Map#update 开头 pbMapInterpreter.update
           → command_355 eval pbBridgeOn/Off
           → 下一次方向输入才用新 $PokemonGlobal.bridge
```

无 Wait 的短脚本是否在**同一输入周期**内被解释器跑完：STATIC-INFERRED 为「下一步输入前已执行」，因 `pbMapInterpreterRunning?` 时玩家不能走；DYNAMIC 未测。禁止实现「同一次 can_move 因 contact 立即重算」。

**组 A — 南北双车道（上桥/下桥/折返/横向切换）**

1. 从桥下（西列 Off）上桥：`mapId=21, (19,47), dir=6, bridge=0` → 右 → 落到 (20,47) EV004 占用格 → start → `pbBridgeOn` → `bridge=2`。再北走到簇 3 的 (20,37) 时 STATIC-INFERRED 已在桥上。
2. 从桥上（东列）下桥：`(20,47), dir=4, bridge=2` → 左 → (19,47) EV028 → `pbBridgeOff` → 0。
3. 沿东列北进：在 y=49→46 每一步都会再次 start EV004（无 Wait，重复 `pbBridgeOn` 幂等）。折返南进仍在 On 列则保持 2，跨到西列才 Off。
4. 被阻挡：若目标格地形不可走，`check_event_trigger_touch` 不启动这些 over_trigger 事件（SOURCE-PROVEN）。不能靠 bump 切桥层。

**组 B — 横向端条 EV010/EV007（东西向通路的南北相邻带）**

1. 从北侧地上向南上桥：`(15,30), dir=2, bridge=0` → 南到 (15,31) EV007 `pbBridgeOff`（已是 0）→ 再南 (15,32) EV010 `pbBridgeOn` → 继续南至簇 3 y=35。
2. 从桥上向北下桥：`(15,33), dir=8, bridge=2` → 北到 (15,32) On（已是 2）→ (15,31) Off → 0。
3. 折返：南向再走 On 带回到 2。x=14 或 16 同样命中 size(3,1)。

**组 C — 楼梯 EV022/EV020**

注释称覆盖楼梯全宽。On 在北 y=57，Off 在南 y=58。STATIC-INFERRED：向北走上楼梯为上桥，向南走下为下桥。

1. 从南侧地上向北：`(22,59), dir=8, bridge=0` → (22,58) Off → (22,57) On → `bridge=2`，再向北进入簇 3/4 方向的高架。
2. 从北侧桥上向南：`(22,56), dir=2, bridge=2` → (22,57) On → (22,58) Off → 0。
3. x=23 为同一事件占用。

簇 5 虽是 (22,57) 的曼哈顿最近 tag 15，但在南侧；不能把「最近格」当成玩家下一步必到格。

**组 D — 楼梯 EV025/EV023 与 Map 7 南缘**

On y=68 更靠近北侧簇 5 (y=64–66)；Off y=69 更靠近南缘。

1. 从 Map 7 北缘进入后向北上桥：反向连接是 Map 7 `(40–43,0)` dir=8 → Map 21 `(19–22,76)`。`transfer_player` SOURCE-PROVEN 会 `pbBridgeOff`，故入图 `bridge=0`。**不得从 (14,70) 起跳称端到端。** 本轮连续 11 步见 §15.3 南组。
2. 从簇 5 向南下桥再出图：`(14,67), dir=2, bridge=2` → (14,68) On → (14,69) Off → 继续南至 y=76，东列 x=19–22 的 edge 进入 Map 7。切图再次 `pbBridgeOff`。
3. x=15 同事件。

**与其他传送：** 东缘 3 条 edge 到 Map 23 `(38,12–14) dir=6 → (0,13–15)`，源格不在 tag 15 上。PBS `21,E,77,47,W,0` 见 §14.7，不产生 in-bounds edge。

### 14.7 Map 21 传送审计（只审计，不改 importer）

对照代码：`tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs` 的 `projectedD0Passable`、`selectStaticPage`、`emitStep`、`emitContacts`、`expandConnection`、`projectEvent`。

| 原始事实 | importer 判断 | 实际 MapTransfer/21.json | 结论 |
|---|---|---|---|
| 8 个桥事件名称含 `size()`，无 code 201 | `projectEvent` 名称匹配 `size(` **直接 return 空**；即便无 size 规则，也无 Transfer Player | steps=0 contacts=0 | **已排除**：不是误删的 MapTransfer 记录。桥事件本就不是传送 |
| 地图无任何 code 201 | 无 step/contact 可发 | 与抽取一致 | **已排除** |
| PBS `21,S,0,7,N,21` | `expandConnection` 南缘 y=76、x 与 Map 7 北缘对齐且目标 `projectedD0Passable` | 4 条 edge x=19–22 → Map 7 (40–43,0) | **已排除** 误删；源/目标均非 Bridge 格 |
| PBS `21,E,0,23,W,1` | 东缘 x=38 | 3 条 edge y=12–14 → Map 23 | **已排除** 误删；非桥格 |
| PBS `21,E,77,47,W,0` | 东缘 offset y=77，Map 21 合法 y 仅 0–76；`land` 后目标 y=y-77 全 <0，`inBounds` 失败 | **0 条** edge | **已排除（几何越界，不是 D0 过滤）**。不能称为「因 bridgeLevel 误删」 |
| 67/93 个 tag 15 格 `projectedD0Passable===false` | 若有 incoming edge/step **以这些格为 dest**，会被 `expandConnection`/`emitStep` `continue` | 现有 7 条 edge 的 dest 都不在这 67 格 | **潜在风险但未复现**。升级 Runtime 后若出现以桥面为落点的连接，静态 D0 可能永久丢掉；本图现有记录未证明发生 |
| `selectStaticPage` 只留 alwaysActive 页 | 桥事件恰好单页 alwaysActive | 无传送命令 | 对桥事件无影响；物品第二页不参与投影 |

**已证实误删：** 无。
**缺少数据无法判断：** 原版 RGSS 在 `bridge>0` 时南/东缘是否另有可走格子未动态观察；本审计只对照已物化的 MapTransfer JSON 与 PBS 行。

### 14.8 未检查入口（不得当成已排除）

- 方法体内部的间接 Ruby（`pbEvolutionEvent`、`pbItemBall`、`Followers.*` 内部是否再调 `pbBridgeOn`）：静态未见 `send`/`eval`/`method(`，标覆盖范围外，**UNVERIFIED** 于方法体内。
- 未从本图 117 调用的 Common Event 自动运行（本图 117=0；CommonEvents.rxdata 10 条均无桥脚本）。
- 原版逐帧：interpreter 与一步动画的帧对齐、held input。
- Map 47 Ledge：本轮不做。


## 附录 L. 素材许可与仓库保留边界

Pokémon Essentials v21.1 脚本可按上游套件条款阅读；地图 rxdata、PBS、事件原文含游戏数据与 Pokémon 相关名称，**本仓库不能视为已获分发许可**。

本轮结论：

1. **保留** 既有附录 A（Map 7 命令表，已在先前提交入库）。不在本轮扩大附录 A，也不删除（删除会破坏既有复核锚点）。
2. **不提交** `Map021.rxdata`、完整 `map21-bridge-evidence.json`、或 Map 21 每条 108/408 注释全文。本地完整转储仅 `.local/`（gitignore）。
3. **本轮提交** 结构化事实、SHA-256、短脚本标识符 `pbBridgeOn` / `pbBridgeOff`、占用坐标、源码路径、测试命令与覆盖计数。
4. **CI 缺口：** 无官方 FSDB 时 live test skip；不得把 skip 写成 PASS；FG-05 仍 OPEN。

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


## 15. 2026-09-20 取证器修复后重跑（本轮）

> 状态仍是 **Evidence record / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。
> 本节覆盖 REVIEW-01～04 修复后的同一套规则。§14 保留历史指纹与命令级摘录；与本节冲突处以本节为准。
> 证据等级：SOURCE-PROVEN = 固定 tag v21.1 / commit `ea7b5d56d2436591160983c4e641a2ceee2d875a` 源码条件；FSDB-OBSERVED = 官方本地 rxdata 解码；STATIC-INFERRED = 未运行 RGSS 的逐格计算；DYNAMIC-OBSERVED = 无。

### 15.1 环境与命令

| 项 | 值 |
|---|---|
| 日期 | 2026-09-20 |
| 分支 | `docs/map-terrain-behavior-freeze-handoff` |
| 文档修订基线 | `240d084ceba236c6006afc89d7d4957991cf4992` |
| OS / Node | Windows 10 / v22.12.0 |
| 原版游戏 | **未运行** |
| 本轮测试 | `node --test tools/fixtures/essentials-v21.1/map-event-evidence.test.mjs tools/fixtures/essentials-v21.1/map-evidence-acceptance.test.mjs` → 36 pass / 0 fail / 0 skip（本机有 FSDB） |
| 独立核对 | `map-evidence-independent-check.mjs`：Map 21 unique Bridge 93 且脚本 ID 4,7,10,20,22,23,25,28；Map 47 Ledge 30。不复用 `collectMapEvidence` JSON |

```text
node tools/fixtures/essentials-v21.1/map7-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --corpus-scan --output ".local/map7-bridge-evidence.json"
node tools/fixtures/essentials-v21.1/map21-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --output ".local/map21-bridge-evidence.json"
node tools/fixtures/essentials-v21.1/map47-ledge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --output ".local/map47-ledge-evidence.json"
node tools/fixtures/essentials-v21.1/map-evidence-independent-check.mjs 7 21 47
```

完整 JSON 留在 gitignored `.local/`。仓库不提交原始 FSDB。CI 无 FSDB 时 live 项 skip ≠ PASS。旧 18/18 仅为 `5e71c7e` 历史。

本轮比上一轮更严：逐层移植 `playerPassable?(d=0)`；占用格全部列出；Common Event 按调用入口可达；传送带 source/target mapId；COMPLETE/provenNegative fail-closed；路线从上桥陆地侧进入且断言 `bridgeLevel`。

### 15.2 Map 21 八事件触发矩阵（REVIEW-01）

Map021 SHA-256 `cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575`，28708 字节，39×77，Tileset 1，events 17 / pages 22 / commands 132。Bridge unique=placed=93，tile IDs 1616,1617,1618,1627,1635,1643。独立核对一致。

| eventId | 脚本 | 原点 | 占用 | over_trigger 0 | over_trigger 2 | 分支 | 等级 |
|---:|---|---|---|---|---|---|---|
| 4 | On | (20,49) size(1,4) | x=20 y=46–49 | true | true | here | STATIC-INFERRED |
| 28 | Off | (19,49) size(1,4) | x=19 y=46–49 | true | true | here | STATIC-INFERRED |
| 7 | Off | (14,31) size(3,1) | x=14–16 y=31 | true | true | here | STATIC-INFERRED |
| 10 | On | (14,32) size(3,1) | x=14–16 y=32 | true | true | here | STATIC-INFERRED |
| 20 | Off | (22,58) size(2,1) | x=22–23 y=58 | true | true | here | STATIC-INFERRED |
| 22 | On | (22,57) size(2,1) | x=22–23 y=57 | true | true | here | STATIC-INFERRED |
| 23 | Off | (14,69) size(2,1) | x=14–15 y=69 | true | true | here | STATIC-INFERRED |
| 25 | On | (14,68) size(2,1) | x=14–15 y=68 | true | true | here | STATIC-INFERRED |

占用格地面例：EV004 (20,46) z=0 tile 387，passage 0，priority 0，`d=0` bit 0 → return-true-priority-0。Event IDs 1、2 为 `pbEvolutionEvent(2)`，不是桥脚本。

`start` 仅当 `@list.size > 1` 置位。八事件 listSize=11。解释器 `eval` 是否同一步完成 = STATIC-INFERRED。未实测 DYNAMIC。

### 15.3 四组连续静态路线（ROUTE-21）

公共连接：Map 7 `(40,0)/(41,0)/(42,0)/(43,0)` dir=8 → Map 21 `(19,76)/(20,76)/(21,76)/(22,76)`。入图 `bridge=0`（SOURCE-PROVEN `pbBridgeOff`）。BFS 起点一律 `(19,76)`。生成器：`map21-bridge-routes.mjs`。**上桥从 Off 外侧走向 On，结束 bridgeLevel=2；下桥反向结束 0。** 全部 STATIC-INFERRED / `notALiveRun`。

**南组 EV025 On / EV023 Off（完整 11 步到桥头）**

1. 连接落入 mapId=21 `(19,76)` dir=8 bridge=0。
2. 输入 `up,up,up,up,up,up,left,left,left,left,left` → `(14,70)`（11 步，连续）。
3. `up` → `(14,69)` 命中 EV023 Off，here start，推论 execute `pbBridgeOff`，仍 0。
4. `up` → `(14,68)` 命中 EV025 On，here start，推论 execute `pbBridgeOn`，**2**。
5. 沿 On 带 `right` → `(15,68)` 再次 start On（size 占用内重复启动，无 Wait）。
6. 折返：从 `(14,68)` `down,down` → Off 然后陆地，bridge=0。
7. 桥下：从 `(14,70)` `left,left`，不踏 On。
8. 南缘负例：从 `(19,76)` 向南为地图外/不可走（STATIC-INFERRED）。

**中南组 EV022 On / EV020 Off**

- BFS `(19,76)` → 陆地 `(22,59)`：20 步。
- `up,up`：`(22,58)` Off → `(22,57)` On，final bridge=2。
- 反向两步下桥到 0。

**中北组 EV010 On / EV007 Off**

- Off 在 y=31（北），On 在 y=32（南）。陆地在北。
- BFS `(19,76)` → `(14,30)`：73 步。
- `down,down`：`(14,31)` Off → `(14,32)` On，final bridge=2。
- 旧生成器从 `(14,33)` 向北会先 On 再 Off，结束 0；那是下桥，本轮已改正。

**北跨组 EV004 On / EV028 Off**

- BFS `(19,76)` → 陆地 `(18,46)`：37 步。
- `right,right`：`(19,46)` Off → `(20,46)` On，final bridge=2。
- 沿 On 带南走 y=47–49，每步再 start On。
- 该陆地格有 blocked-or-touch 邻格（组级负例）。

每一步字段（mapId、起终点、input、通行、占用、over_trigger/here/touch、start/execute、bridgeLevel）由 `replayInputs` 生成，完整逐步 JSON 在 `.local/round-map21-routes.json`。不得把该 JSON 当成原版运行日志。

### 15.4 Map 7 负例与 Map 47 Ledge

**Map 7** SHA `c34ddaaec265241fd35149d6d3758f8f08a5503b057c891e396c39b08518c6b7`，37559 字节，60×43。COMPLETE；provenNegativeBridge=true；11/19/521；Bridge 格 0；候选 0；117 调用 0。**证明范围**：本 corpus Map 7 全部事件页及已扫描 355/655/209/509/111-12/117 入口内无桥。不证明 autorun Common Event / 其他地图 eval。同图另有 5 个 Ledge 格（y=32 x=4–8），与桥负例无关。

**Map 47 Route 7** SHA `5f4ee232e4f4b8b44950f826b13cd601ffecb87e455c1dda92c5908152df043e`，32107 字节，70×43，Tileset 1。events 12 / pages 17 / commands 250。未知命令 **404** 已记录，未当空脚本。Bridge 0；Ledge unique=placed=30，tile 1194/1198/1212，bbox (14–45,10–18)。独立核对一致。

合法两格跳样本（STATIC-INFERRED）：起点 `(16,9)` dir=2，越过 Ledge `(16,10)` tile 1194，落点 `(16,11)` `passable?(d=0)` true。中间格不占用。逆向从落点向北：`can_move` 失败，不跳。样本 Ledge 上无原版事件；中间格有事件的负例是合成规则，不是 Map 47 原始事件。跨连接跳跃 UNVERIFIED。无 DYNAMIC 跳跃日志。

### 15.5 传送审计（REVIEW-04）

PBS 涉及 Map 21 的三条：

| 原始连接 | 期望边 | MapTransfer/21.json | D0 会丢（潜在） | 越界 | 结论 |
|---|---:|---|---:|---:|---|
| `21,E,0,23,W,1` | 3 | 匹配 3 | 有对照 | 0 | 无已证实误删 |
| `21,S,0,7,N,21` | 4 | 匹配 4 | 35 | 193 | 入图落点 (19–22,76) 保留 |
| `21,E,77,47,W,0` | 0 | 0 | 0 | 232 | 几何越界，不是 D0 误删 |

源格与源图比较，目标格加载目标地图 Tileset。同坐标不同地图不可互换（`EV-TRANSFER-01`）。

### 15.6 Common Event（REVIEW-03）与严格校验（REVIEW-02）

本 corpus CommonEvents 无 `pbBridgeOn/Off`。Map 7/21 地图 117 调用 0。嵌套 A→B→C 由合成测试覆盖。Autorun/parallel CE 与未扫描地图的 `eval` 不在负例范围内。

负 tile ≠ 空 0；短 Table、非 1D terrain_tags、orphan 655、111 缺参、117 非整数：不能 provenNegative，见 `EV-VALID-01`～`06`。
