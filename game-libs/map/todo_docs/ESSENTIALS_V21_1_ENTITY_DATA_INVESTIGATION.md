# Essentials v21.1 真实地图实体数据调查

> 状态：只读事实调查 / 证据记录，**非冻结 Schema、非重构实施**  
> 调查日期：2026-09-21  
> 工作分支：`docs/map-builder-handler-fsdb-design`  
> 基线 HEAD（开始调查时）：`e211ceac7835d768b86d73b95dfd7c03a9753d35`  
> 配套设计讨论：[`RPG_MAP_GENERIC_MODULE_DESIGN.md`](./RPG_MAP_GENERIC_MODULE_DESIGN.md)（本文不修改其已确认边界）

本文回答的核心问题是：现有 Pokémon Essentials v21.1 数据里，主角、地图事件、NPC、地图物品、建筑和贴图**实际如何表示**；当前 importer / FSDB / Map Runtime / Browser **实际保留和消费了什么**。结论按证据级别标注，允许“目前无法确定”。

---

## 1. 调查范围与证据级别

### 1.1 工作环境

| 项 | 事实 |
| --- | --- |
| Git 分支 | `docs/map-builder-handler-fsdb-design`，跟踪 `origin/docs/map-builder-handler-fsdb-design` |
| 开始时 HEAD | `e211ceac7835d768b86d73b95dfd7c03a9753d35`（`docs(map): capture Builder Handler and FSDB generalization design discussion`） |
| 开始时工作区 | 干净，无未提交更改 |
| Node | v22.12.0 |
| 原版 RGSS / `Game.exe` | **未运行** |
| LoomRealm 产品窗口 / `play.bat` | **本次未运行** |

本次只新增本文件；未改 Map 业务代码、importer、测试或现有 FSDB。临时分析脚本写在系统临时目录，**不入库**。

### 1.2 三类资料（必须分开）

| 类别 | 本次使用的资料 | 能否当作“原版数据结论” |
| --- | --- | --- |
| **1. 真实原始数据** | 仓库 gitignore 的官方 ZIP：`tools/fixtures/essentials-v21.1/Pokemon Essentials v21.1 2023-07-30.zip`。体积 `61987094` 字节，SHA-256 `da0a34ec81ed40a4346fe6101debd7d938cbeadd43ff0aad87c3e388392a1665`，与 `OFFICIAL_ARCHIVE_IDENTITY`（`tools/fixtures/essentials-v21.1/lib/acquisition/eevee-expo.mjs`）一致。ZIP 内 `mkxp.json` 的 `windowTitle` 为 `Pokémon Essentials v21.1`。条目数 7678（含目录）。 | 可以。这是合法持有的官方 v21.1 归档，不是仓库脚本生成的 fixture。 |
| **2. 真实数据的解析/投影产物** | `examples/essentials-v21.1-local/[FSDB]Essentials v21.1`（gitignore：`[FSDB]*`）。`[struct]测试信息/来源.json` 记录 `version: "21.1"`，`acquisition: "local-zip"`。`[resource]Data/Map066.rxdata`、`System.rxdata`、`[resource]PBS/metadata.txt` 的 SHA-256 与官方 ZIP 对应条目**逐字节相同**。 | 可以，作为“该 ZIP 的 importer 产物”。消费者 JSON（`struct.Map` 等）是投影，不是原版文件本身。 |
| **3. 合成测试数据** | `examples/essentials-v21.1/`：`scripts/generate-fixtures.mjs` 生成的 `m14_player` / `m14_tileset`、`game.json` 的 `{ mapId: 1, x: 10, y: 8, characterName: "m14_player" }`、`game-libs/map/test/runtime.test.mjs` 使用的同名参数。 | **不可以**。下文凡引用此类材料都明确标为合成。 |

未找到独立的已解压官方游戏目录作为第三份原件；不需要。官方 ZIP 与本地 FSDB 的原始资源副本已经构成可复核链。环境变量 `ESSENTIALS_V21_1_SOURCE` 未设置。

脚本源码权威（只作对照，不执行 Ruby）：`Maruno17/pokemon-essentials` tag `v21.1`，commit `ea7b5d56d2436591160983c4e641a2ceee2d875a`（见 `vanilla-registry.mjs` / `vanilla-map-rules.mjs`）。

### 1.3 证据级别

| 标记 | 含义 |
| --- | --- |
| **真实数据** | 从官方 ZIP 或与其逐字节相同的 `[resource]Data` / `[resource]PBS` / `[resource]Graphics` 直接观察到的字段、计数、对象 ID |
| **importer 投影** | 由仓库 importer / consumer 代码证明的写入或丢弃行为 |
| **Runtime 消费** | 当前 `game-libs/map` Runtime / Browser / 测试实际读取的字段 |
| **设计推论** | 基于以上三类提出的最小演进方向，不是已实现功能 |
| **未验证** | 本次未观察、或仅有静态结构不足以断定运行时语义 |

未运行原版游戏，因此不声称“与 RGSS 逐帧等价”或“产品已支持 NPC/物品”。

### 1.4 使用的只读工具

- 现有 Marshal / RMXP 解码：`decodeRxdataBytes`（`tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-event-evidence.mjs`）
- 现有投影：`projectMapRecord` / `projectTilesetRecords`、`projectMapActionRecord`、`projectMapTransfer` 相关实现
- 现有 Runtime 类型与校验：`game-libs/map/src/semantics.ts`、`runtime.ts`、`browser/map.browser.js`
- 临时 Node 只读扫描（不修改任何数据）：统计 69 张地图事件、对照 ZIP SHA、抽取命令码和 `pbItemBall` 符号

未执行 ZIP 内 Ruby 脚本、`Scripts.rxdata` 或 `Game.exe`。

### 1.5 本地真实 FSDB 规模（投影产物）

| 表 / 资源 | 数量 |
| --- | --- |
| `struct.Map` / `struct.MapTransfer` / `struct.MapAction` | 各 69 |
| `struct.Tileset` | 23（被地图引用的是其中 13 个，与既有 `PRODUCTION_BASELINE` 一致） |
| `struct.Item` | 693（来自 PBS `items.txt`，不是 RMXP `Items.rxdata`） |
| `struct.PlayerMetadata` | 2（id `1` / `2`） |
| `struct.Metadata` | 1（全局 id `0`） |
| `struct.RmxpRoot` | 110（lossless 解码图，含地图事件） |
| `[resource]Data` Map\*.rxdata | 69 |
| `[resource]Graphics/Characters` PNG | 211 |
| `[resource]Graphics/Tilesets` PNG | 22 |
| `[resource]Graphics/Autotiles` PNG | 40 |
| 全库地图事件 | 503 个事件 / 688 页 |

地图 ID 集合（有缺口，不是 1..75 连续）：1–21、23–31、34–41、44–47、49–75。共 69 张。与 `scripts/map-data-format-essentials-local.mjs` 的 `PRODUCTION_BASELINE.mapCount` 一致。

---

## 2. 整体数据关系图

```text
官方 v21.1 ZIP
  ├─ mkxp.json                         版本身份（importer 校验，不写入消费者 Map 记录）
  ├─ Data/System.rxdata                RPG::System @start_map_id/@start_x/@start_y
  ├─ Data/Actors.rxdata                RPG::Actor[1] 名称 "Player"；@character_name 为空
  ├─ Data/Items.rxdata                 RMXP 占位物品库（1 条空名记录）——与 PBS 物品不是同一套
  ├─ Data/MapInfos.rxdata              地图显示名；69 条
  ├─ Data/MapNNN.rxdata                RPG::Map + @events Hash（局部 event id）
  ├─ Data/Tilesets.rxdata              RPG::Tileset
  ├─ Data/player_metadata.dat          GameData::PlayerMetadata（行走图等）
  ├─ Data/metadata.dat                 GameData::Metadata（Home / 金钱等）
  ├─ PBS/metadata.txt                  上述 metadata 的文本源
  ├─ PBS/items.txt                     背包物品定义（符号 ID）
  └─ Graphics/{Tilesets,Autotiles,Characters,Items,...}

importer
  ├─ 原始文件 → resource.{Graphics,Audio,Fonts,Data,PBS,Plugins}     【原始副本】
  ├─ 选择性 JSON → struct.Map / Tileset / MapTransfer / MapAction   【地图消费者】
  ├─ PBS/编译域 → struct.Item / PlayerMetadata / Metadata / ...     【存在但 Map Runtime 不读】
  └─ lossless → struct.RmxpRoot                                     【含完整事件图；Map Runtime 不读】

当前 Map Runtime 实际读取
  game.json initial.input { mapId, x, y, characterName }
       │
       ├─ struct.Map/{mapId}
       ├─ struct.Tileset/{tileset_id}
       ├─ struct.MapTransfer/{mapId}
       ├─ struct.MapAction/{mapId}          （缺省则空记录；只执行 bridge，opaqueRelated 失败退出）
       ├─ resource.Graphics/Tilesets/{tileset_name}
       ├─ resource.Graphics/Autotiles/{autotile_names[i]}
       └─ resource.Graphics/Characters/{characterName}   ← 仅玩家一张图
```

有证据的关系：

- 地图 ID → `struct.Map/{id}` → `tileset_id` → `struct.Tileset/{id}` → 贴图文件名 → `resource.Graphics`（**真实数据 + importer + Runtime**）
- 地图 ID → `struct.MapTransfer/{id}`：由事件 command 201 与 PBS `map_connections` 投影（**importer + Runtime**）
- 地图 ID → `struct.MapAction/{id}`：仅当事件页能静态确认为 `pbBridgeOn/Off`（**importer + Runtime**；本库 69 张图里只有 Map 21 有 8 条 bridge，opaqueRelated 全库为 0）
- 玩家行走图文件名 ← `PlayerMetadata.@walk_charset` / PBS `[1].WalkCharset`（**真实数据**）；Runtime 使用的是 `game.json` 里手写的同名字符串（**Runtime 消费**，不是读 PlayerMetadata）
- 地图物品实例 ← 地图事件 + 条件分支脚本 `pbItemBall(:ITEMID)` → PBS/`struct.Item` 符号 ID（**真实数据**）；Runtime **不消费**
- NPC 外观 ← 事件页 `@graphic.@character_name` → `Graphics/Characters/{name}`（**真实数据**）；没有独立 NPC 表（**真实数据**）

尚未证实 / 不要画成已有协议的关系：

- 不存在可跨地图复用的 `npcId` 定义表（同名行走图复用 ≠ NPC 定义复用）
- 不存在 Building Record；建筑主体是 Tile，门是事件
- 地图上的物品实例 **不是** `struct.Item` 的行；Item 行没有地图坐标
- 主角不是地图上的 Event，也不是 `struct.Item` / Actor 记录里那张有图的人物
- `Graphics/Items/` 是背包图标目录，不能当成地图掉落协议

---

## 3. 对象逐类调查

### 3.1 主角 / 玩家

**结论（真实数据）：主角的“人设/训练师类型/行走图”和“地图上的可视人物”不是同一个地图 Event；也没有独立的 Player FSDB Record 被 Map Runtime 使用。**

#### 样本 A — `RPG::System` 编辑器出生点

- 来源：`[resource]Data/System.rxdata`（与官方 ZIP 同 SHA-256 `5ebbd0a6112d…`）
- 类型：`RPG::System`
- 字段：`@start_map_id = 1`，`@start_x = 9`，`@start_y = 7`，`@party_members = [1]`
- importer：该文件进入 `resource.Data` 与 `struct.RmxpRoot`；**不**投影为 `struct.Map` 的一部分
- Runtime：不读 System。出生点来自 Subsystem 启动参数

#### 样本 B — `RPG::Actor[1]`

- 来源：`Actors.rxdata`（`RPG::Actor` 不在 RMXP class-registry 中，解码为 `GenericRubyObject`）
- `@id = 1`，`@name = "Player"`，`@character_name` 为空字符串，`@battler_name` 为空
- **真实数据：** 主角可视贴图不来自 Actor
- Runtime：不读 Actor。仓库也没有 `struct.Actor`（计数 0）

#### 样本 C — PlayerMetadata / PBS metadata 玩家段

PBS `metadata.txt` 与 `player_metadata.dat` 一致：

| 段 | 字段（结构） | 值 |
| --- | --- | --- |
| `[0]` 全局 | `Home` | `3,7,5,8`（地图 3，坐标 7,5，朝向 8） |
| `[0]` | `StartItemStorage` | `POTION` |
| `[1]` | `TrainerType` / `WalkCharset` | `POKEMONTRAINER_Red` / `trainer_POKEMONTRAINER_Red` |
| `[1]` | `RunCharset` 等 | `boy_run` / `boy_bike` / `boy_surf` / `boy_fish_offset` |
| `[2]` | 另一名玩家 | `POKEMONTRAINER_Leaf` / `trainer_POKEMONTRAINER_Leaf` |

`player_metadata.dat` 中 `@home` 为 `null`；Home 在全局 Metadata，不在玩家段。

`struct.PlayerMetadata/1` 与 `/2` **已投影**（顶层键 `$id, compiled, id, key`），但 Map Runtime **不读取**。

#### 样本 D — 开场图事件把玩家送走

Map 1 不是“站着一个主角 Event”。它有 2 个**空图**事件：

| 地图 | 事件 ID | 位置 | 页 0 | command 201 参数（节选） |
| --- | --- | --- | --- | --- |
| 1 | 1 | (0,0) | trigger 3（autorun），graphic empty | `[0, 3, 25, 6, 2, 0]` → 目标地图 3，(25,6)，朝向 2 |
| 1 | 2 | (0,14) | trigger 0，graphic empty | `[0, 3, 25, 6, 2, 1]` → 同样到地图 3，(25,6) |

对照：`System` 出生在地图 1 的 (9,7)；开场脚本再传送到地图 3 的 (25,6)；`Metadata.Home` 是地图 3 的 (7,5,朝向 8)。**三套坐标都不是** 当前本地 `game.json` 使用的点。

#### 样本 E — 当前产品启动参数（不是原版出生点）

`examples/essentials-v21.1-local/game.json`：

```json
{ "mapId": 66, "x": 8, "y": 7, "characterName": "trainer_POKEMONTRAINER_Red" }
```

这与既有 M14 资格记录中的“冻结 Map066 选点”一致，是**项目选择的试玩点**，不是 System/Home。地图 66 上 (8,7) 附近没有主角 Event；该图唯一事件是 (12,7) 的门 `doors7`（见 3.4）。

`characterName` 字符串恰好等于 PlayerMetadata `[1].WalkCharset`，也等于实际文件 `resource.Graphics/Characters/trainer_POKEMONTRAINER_Red`（PNG 128×192）。关系是**人工对齐的文件名约定**，不是 Runtime 查询 PlayerMetadata。

合成对照：`examples/essentials-v21.1/game.json` 使用 `m14_player`，由 `generate-fixtures.mjs` 画出来的 128×128 PNG。那不是原版人物。

#### Runtime 如何初始化玩家（Runtime 消费）

```133:141:game-libs/map/src/runtime.ts
function initialInput(value: unknown): InitialInput {
  // ...
  return { mapId: input.mapId as number, x: input.x as number, y: input.y as number, characterName: input.characterName };
}
```

启动时读取 `resource.Graphics` / `Characters/${input.characterName}`，朝向硬编码为 `2`（下），pattern 由行走状态机产生，不读 Event Graphic 的 `@direction/@pattern`。FSDB 中**没有** Player Record 被这一路径使用。

**尚未验证：** 原版如何在 Red/Leaf 两套 charset 之间选择；是否由开场选项写入。本次未跑游戏。

---

### 3.2 NPC / 地图事件

**结论（真实数据）：可视 NPC 主要是地图内 `RPG::Event`，不是独立 NPC 定义。事件 ID 是地图内局部 ID。同一事件的不同页可以换贴图和行为。不能把所有 Event 都叫 NPC。**

#### 事件在原版里的结构（真实数据 + class-registry）

`RPG::Event` 字段：`@id @name @x @y @pages`  
`RPG::Event::Page`：`@condition @graphic @move_type @move_speed @move_frequency @move_route @walk_anime @step_anime @direction_fix @through @always_on_top @trigger @list`  
`Graphic`：`@tile_id @character_name @character_hue @direction @pattern @opacity @blend_type`  
`Condition`：两组开关、变量、self-switch。

Trigger 编号（importer 已文档化，本次全库页直方图也符合）：0 action-button，1 player-touch，2 event-touch，3 autorun，4 parallel-process。

全库 688 页：`move_type` 几乎全是 `0`（固定在原地），仅 1 页为 `3`。本套 v21.1 示例图里“会自己走的 NPC”极少。

全库 503 个事件，事件 ID 取值只有 96 种不同数字，且每张图都从很小的 ID 起编（Map 2 的 max id=4，Map 13 的 max id=31）。**真实数据：ID 按地图局部编号，跨图重复。**

#### 样本 A — 普通对话 NPC（Map 2 Event 3）

| 项 | 值 |
| --- | --- |
| 位置 | 地图 2，事件 3，(12,7) |
| 页数 | 1 |
| Graphic | `character_name = "NPC 06"`，`tile_id = 0`，`direction = 2`，`pattern = 0` |
| Trigger | 0（action-button） |
| `move_type` | 0 |
| 命令 | `101` 显示文本 + `401` 续行；无脚本 |
| 贴图文件 | `Graphics/Characters/NPC 06.png`，128×192 |

足以让地图**画出并站住**一个 NPC 的数据：坐标、character_name、direction、through、以及（若要阻挡）非空 character_name。对话文本属于事件命令，不是独立 NPC 协议。当前 Runtime **不加载**该贴图，也不生成第二个 sprite。

#### 样本 B — 多页、换条件但不换贴图（Map 3 Event 9）

- 页 0：`NPC 28`，action-button，无 self-switch；含条件分支、脚本、`123` 控制 self-switch、播放 ME
- 页 1：同一 `NPC 28`，autorun，`switch1_valid` 且 `switch1_id = 1`；含恢复、控制开关

**真实数据：** 页可以改 trigger 和命令；本样本外观未变。

#### 样本 C — 多页、换贴图（Map 4 Event 5，试剂球/赠送宝可梦，不是背包 Item）

- 页 0：graphic `Object ball`，仅显示文本（不可领取）
- 页 1：仍是 `Object ball`，`switch1_id = 3`；选择 → 脚本 `pbAddPokemon`（符号 `:CHARMANDER`）→ 控制开关/变量/self-switch
- 页 2：graphic **empty**，self-switch `A`，命令只有结束

同类：Event 6 `:SQUIRTLE`，Event 4 `:BULBASAUR`。这是“未领取 / 已领取”的**事件页切换**，对象是宝可梦赠礼，引用的是物种符号而不是 `struct.Item`。

#### 行走图文件名跨图复用 ≠ NPC 定义复用（真实数据）

72 个非空 `character_name`。例如 `NPC 01` 出现在 9 张地图、18 个事件页；`NPC 19` 9 张地图。每个事件仍有自己的 `@id/@x/@y/@list`。没有 `npcId` 把这些实例绑到同一份定义。

#### 哪些事件不是 NPC

| 类型 | 判别（观察，不是官方枚举） | 例 |
| --- | --- | --- |
| 传送/门 | command 201，常配 `doorsN` 图或 tile graphic | Map 66 Event 1；Map 2 Event 1 `doors5` |
| 桥 | 脚本 `pbBridgeOn/Off`，常 `size(w,h)` 且空图 | Map 21 Event 22 `size(2,1)` |
| 地面物品 / 隐藏物 | 事件名 `Item` / `HiddenItem` + `pbItemBall` | Map 21 Event 15/18 |
| 告示 | 空图 + 仅 show-text | Map 7 Event 5/6 |
| 开场/控制系统 | 空图 + autorun + 一堆画面命令 | Map 1 Event 1 |

启发式统计（仅用于覆盖面，**不是**类型系统）：character 图约 145，transfer 命令约 136，trainer 相关脚本约 50，纯告示约 45，itemish 名称/脚本约 6，bridge 脚本 8，`size()` 名称 19，`HiddenItem` 名称 3。

#### importer / FSDB / Runtime / Browser 分别拿了什么

| 层 | NPC / 一般事件 |
| --- | --- |
| 原始 rxdata | 完整 Event 图 |
| `struct.RmxpRoot` | lossless 保留（importer 投影） |
| `struct.Map` | **丢弃 `@events`**。`projectMapRecord` 只写 `tileset_id, width, height, data` |
| `struct.MapTransfer` | 仅静态可证明的 player-touch 传送子集；名字匹配 `hiddenitem` 或 `size(` 的事件被跳过 |
| `struct.MapAction` | 仅 bridge / 与 bridge 相关但无法确认的 opaqueRelated。一般 NPC **不会进入该表** |
| Runtime | 不读事件列表；不创建 NPC sprite。只在玩家踏入 `opaqueRelated` 占用格时失败退出；只执行 bridge |
| Browser | 只有 `lr-map-sprite` 玩家；没有 NPC 节点 |

**若要通过 `npcId` 复用一个 NPC，现有数据缺少什么（只列缺口）：**

1. 跨地图的 NPC 定义身份（现有只有地图局部 event id + 行走图文件名）
2. 定义与实例的分离（位置/朝向/当前页是实例状态）
3. 消费者 JSON 中的事件投影（数据在 rxdata/RmxpRoot 里，不在 `struct.Map`）
4. Runtime/Browser 多实体渲染与碰撞（当前没有）
5. 页条件所用的开关/变量/self-switch 世界状态（Map 模块目前没有这套状态机）

“现有数据已经可以表达但未投影”：地图事件图、graphic、trigger、命令列表。  
“现有数据本身没有独立定义”：可复用 `npcId`。

---

### 3.3 地图上的物品与可交互对象

**结论（真实数据）：地图上的可见球/隐藏物是 Map Event（常加事件页切换），通过脚本引用 PBS 物品符号；不是 Tile，也不是 `struct.Item` 行本身。存在实例 ↔ Item ID 引用，但引用写在事件命令里，不在 Item 表里。**

#### 背包物品定义（独立于地图）

- PBS `items.txt`：693 段。字段包括 `Name, Pocket, Price, FieldUse, BattleUse, Flags, Move, Description` 等
- `struct.Item/{ID}`：同样 693 条，键为符号 ID（如 `POTION`）
- RMXP `Items.rxdata`：1 条 `@name` 为空的占位 `RPG::Item`。**不是** Essentials 物品权威

`Graphics/Items/` 存在，属于背包/UI 图标分类；地图上的球用的是 `Graphics/Characters/Object ball.png`（128×128）。

#### 样本 A — 可见地面物品（Map 21 Event 15）

| 项 | 值 |
| --- | --- |
| 名称 | `Item` |
| 位置 | (24,6) |
| 页 0 graphic | `Object ball` |
| 页 0 命令 | `111` 条件分支 type 12（脚本条件）`pbItemBall(:LEFTOVERS)`；成功则 `123` 置 self-switch `A` |
| 页 1 | graphic empty，self-switch `A`，无实质命令 |

`struct.Item/LEFTOVERS` **存在**。视觉上：未拾取 = 球图；已拾取 = 空页。拾取逻辑是 Ruby `pbItemBall` 的返回值，不是 Map Runtime 行为。

同类：Map 21 Event 16 `pbItemBall(:GREATBALL)`；Map 5 Event 11 同名 `Item` + `:GREATBALL`。

#### 样本 B — 隐藏物（Map 21 Event 18 等）

事件名精确为 `HiddenItem`，graphic **empty**（地图上没有物品图片），同样用条件分支 `pbItemBall(:POTION)` / `:RARECANDY` / `:RARECANDY, 2`（数量参数）。页 1 仍靠 self-switch `A` 变成“已拾取”。

全库名为 `Item` 的事件 3 个、`HiddenItem` 3 个。扫描全部地图事件的 **command 111 type 12** 得到 7 次 `pbItemBall`：

| 地图 | 事件 | 名称 | 符号 | 数量 | `struct.Item` |
| --- | --- | --- | --- | --- | --- |
| 5 | 11 | Item | GREATBALL | 1 | 有 |
| 11 | 5 | Old Amber | OLDAMBER | 1 | 有 |
| 21 | 15 | Item | LEFTOVERS | 1 | 有 |
| 21 | 16 | Item | GREATBALL | 1 | 有 |
| 21 | 17 | HiddenItem | RARECANDY | 1 | 有 |
| 21 | 18 | HiddenItem | POTION | 1 | 有 |
| 21 | 27 | HiddenItem | RARECANDY | 2 | 有 |

**真实数据：** 地图实例通过脚本符号引用 Item ID；7/7 都能在投影后的 `struct.Item` 找到。Item 记录没有 `mapId/x/y`。

`map-transfer-consumer.mjs` 用 `/hiddenitem/iu` **跳过** HiddenItem 事件，避免把它们当成传送。这是 importer 行为，不是删除物品语义。

#### 样本 C — 告示牌（Map 7 Event 5 / 6）

空 graphic、trigger 0、命令只有 `101` 显示文本。没有 Item ID。它们是可交互对象，但是对话，不是物品实例。

#### 样本 D — 不是物品的“球”

Map 4 的 `Object ball` 三件套调用 `pbAddPokemon(:CHARMANDER|:SQUIRTLE|:BULBASAUR)`。外观像物品，引用的是物种，不是 Item。**不要把球图等同于 Item 协议。**

#### 当前项目能否解析 / 消费

| 能力 | 状态 |
| --- | --- |
| 解码事件与 `pbItemBall(:ID)` | 可以（现有解码器 + 只读扫描） |
| `struct.Item` 保留 PBS 物品定义 | 可以（importer 投影） |
| 把地图物品投影进 Map 消费者 JSON | **没有**。`struct.Map` 无 events；`MapAction` 只认 bridge |
| Runtime 拾取、背包、self-switch 页切换 | **没有** |
| Browser 画 Object ball / 隐藏物 | **没有** |

未投影但原始数据已有：事件坐标、球图、条件脚本、self-switch 页。  
数据本身没有的：地图物品实例表、通用 `itemInstanceId`。

---

### 3.4 建筑和地图装饰

**结论（真实数据 + 设计推论分开）：建筑主体是地图 Tile；门/出入口常是带 `doorsN` 行走图或 tileset tile graphic 的 Event；`size(w,h)` 名称主要用于占格（桥等），不是“建筑定义”。没有证据表明需要独立 Building Record 才能画出城镇。**

#### Tile 组成（真实数据）

`RPG::Map.@data` 为 3 层 Table。投影后 `struct.Map.data` 仍是三层。房屋外墙、地面、装饰花草都在 tileId 里。Tileset 1 名 `Outside`，正规图块 `tileId >= 384`，自动图块 48..383。这与既有数据格式审计一致。本次**未**把某栋房子反向拆成独立对象。

#### 样本 A — 角色图做的门（Map 66 Event 1）

- 名称长度 4；位置 (12,7)；graphic `doors7`
- 页 0：trigger 1（player-touch），命令含 move route、`355` 脚本、`201` 传送 `[0, 67, 4, 7, 8, 1]` → 地图 67 (4,7) 朝向 8
- 页 1：trigger 3，依赖 `switch1_id = 22`（到达动画一类）；**静态传送投影只取无条件页**

同类：Map 2 Event 1 `doors5`、Event 2 `doors3`。全库至少 40 个“有 201 且 graphic 为 doors\* 或 tile:\*”的事件。`doors3` 出现在 4 张地图——仍是**文件名复用**，不是 Building ID。

这些门已被投影进 `struct.MapTransfer` 的 contacts/steps（Map 66：0 steps，4 contacts，4 edges）。Runtime **执行传送**，但 **不画门图形**（门如果只靠 Event 图而不是 tile，产品画面上可能看不见门，本次未跑窗口，标 **未验证**）。

#### 样本 B — tileset tile 做的门（Map 3 Event 10 / 11）

`character_name` 空，`tile_id = 1103`，含 command 201。事件图来自当前地图 Tileset 的某一格，而不是 Characters 文件。

#### 样本 C — `size()` 占格，不是房子

19 个事件名含 `size(w,h)`，抽出的样本 graphic 均为 empty。Map 21 Event 22 `size(2,1)` 正是 `MapAction` 里 `bridge-on` 的 occupied `[(22,57),(23,57)]`。这是通行/桥占格，不是建筑身份。

**何种情况建筑有独立数据身份：** 本次未发现独立 Building 表。只有在需要按 ID 引用、复用或对“整栋楼”做交互时才可能需要新身份——当前真实数据没有这个对象。纯背景建筑保持 Tile 即可。此句为**设计推论**。

---

### 3.5 贴图与资源关联

反向追踪通式：

```text
字段（地图 / 图块集 / 事件 / 启动参数）
  → 资源名称字符串（不是数字资产 ID）
  → 原始 Graphics/... PNG
  → FSDB resource.Graphics/{subdir}/{name}
  → Runtime ResourceRef 或根本不加载
```

#### 分类（真实数据：`[resource]Graphics` 子目录）

`Animations, Autotiles, Battle animations, Battlebacks, Characters, Fogs, Gameovers, Icons, Items, Panoramas, Pictures, Pokemon, Tilesets, Titles, Trainers, Transitions, UI, Weather, Windowskins`

Map Runtime 只用其中 **Tilesets / Autotiles / Characters（仅玩家）**。

#### Tileset

- 原始：`Tilesets.rxdata` `RPG::Tileset`，字段包括 `@name @tileset_name @autotile_names @panorama_* @fog_* @battleback_name @passages @priorities @terrain_tags`
- 投影：`id, tileset_name, autotile_names[7], passages, priorities, terrain_tags`
- **丢弃：** `@name`（Tileset 1 上与 tileset_name 同为 `Outside`）、全套 panorama/fog/battleback（Tileset 1 上这些名为空）
- 解析：`resource.Graphics/Tilesets/{tileset_name}`。本库正规图全部宽 256；高度各异（320…16064），即 8 列 × N 行 32px 格
- 图块分区（程序约定 + 本存档计数）：0 空；1..47 保留且本存档未用；48..383 autotile；≥384 regular。见既有 `PRODUCTION_BASELINE`

#### Autotile

- 名称来自数据：`autotile_names` 7 槽
- **帧布局不来自数据字段**，而来自 PNG 几何（Runtime/Browser 硬编码）：block `height===128 && width%96===0`；cell `height===32 && width%32===0`
- 本库 40 张：96×128 21 张、768×128 5 张、128×32 6 张等，无 unsupported 几何（与既有审计一致）
- 48-variant 角块表在 `semantics.ts` 的 `AUTOTILE_QUARTERS`，是 RMXP/RGSS 惯例的程序表，不是 FSDB 字段

#### Characters / 事件图 / 玩家图

- 事件：`@graphic.@character_name` → `Graphics/Characters/{name}`（文件名可含空格：`NPC 06`、`Object ball`）
- 玩家：启动参数 `characterName` → 同一目录
- 本库 **0** 个 `$` 或 `!` 前缀文件名。Essentials 用整文件单角色表，不靠 RMXP 的 `$` 标记
- 尺寸直方图：128×192 共 103（含 `NPC 06`、`trainer_POKEMONTRAINER_Red`，格 32×48）；128×256 68；128×128 21（含 `Object ball`，格 32×32）；另有 192/256 及 32×32 浆果树等

Browser 硬编码 4×4 表：

```1125:1133:game-libs/map/browser/map.browser.js
      const frameWidth = image.width / 4;
      const frameHeight = image.height / 4;
      if (!Number.isInteger(frameWidth) || !Number.isInteger(frameHeight)) throw new TypeError("Character sheet must be 4 by 4");
      // ...
      context.drawImage(image, pattern * frameWidth, ((data.direction - 2) / 2) * frameHeight, ...);
```

行 = 方向 2/4/6/8，列 = pattern 0..3。这是 **RMXP 惯例 + 当前程序硬编码**，原始事件里虽有 `@direction/@pattern`，Runtime 并不用事件页的值驱动玩家，NPC 则完全不画。

`TILE_SIZE = 32` 同样硬编码于 `semantics.ts`，不是每张地图的字段。

**未验证：** 128×256（32×64 格）在原版里是否仍按 4 行方向切；32×32 浆果树是否按 4×4 切（算术上会得到 8×8 帧，看起来会错）。当前 Runtime 不会加载它们，所以产品路径未覆盖。

---

## 4. 原始数据 → 当前 FSDB 投影对照

消费者路径（`mapCanonicalDataset`）对 `Map/Tileset/MapTransfer/MapAction` 写精简 JSON；其余域（含 Item、PlayerMetadata、RmxpRoot）另表保存。

| 原始对象.字段 | importer | 消费者 FSDB | Map Runtime |
| --- | --- | --- | --- |
| `RPG::Map.@tileset_id/@width/@height/@data` | 投影 | `struct.Map` | 读 |
| `RPG::Map.@events` 及全部页/命令 | 进 RmxpRoot；Transfer/Action **选择性**抽取 | Map JSON **无 events** | 不读事件列表 |
| `RPG::Map.@bgm/@bgs/@autoplay_*/@encounter_*` | RmxpRoot | Map JSON 无 | 不读 |
| `RPG::Tileset.@tileset_name/@autotile_names/@passages/@priorities/@terrain_tags` | 投影 | `struct.Tileset` | 读（含 terrain_tags；五字段旧记录会直接拒绝） |
| `RPG::Tileset.@name/@panorama_*/@fog_*/@battleback_name` | RmxpRoot | Tileset JSON 无 | 不读 |
| 事件 command 201 静态子集 + PBS connections | `map-transfer-consumer.mjs` | `struct.MapTransfer` | 读并执行 |
| 事件名 `hiddenitem` / `size(` | Transfer **跳过** | 不进 Transfer | 桥占格改由 MapAction occupied 提供 |
| `pbBridgeOn/Off` 可确认页 | `map-action-consumer.mjs` | `struct.MapAction.actions` | 执行 bridge-on/off |
| 含 bridge 字样但无法确认的页 | 写入 `opaqueRelated` | 本库全 0 条 | 若存在：踩格 `MAP_ACTION_OPAQUE_RELATED` 失败 |
| 一般 NPC / Item / 对话命令 | 仅 RmxpRoot | 无 NPC/ItemInstance 表 | 不执行 |
| `PBS/items.txt` | `struct.Item` | 693 条 | **不读** |
| `player_metadata` / `metadata` Home、WalkCharset | `struct.PlayerMetadata` / `Metadata` | 有 | **不读** |
| `System.@start_*` | RmxpRoot / Data 副本 | 无 Start 记录 | 不读；用 `game.json` |
| `Actors.rxdata` | Data 副本；无 struct.Actor | — | 不读 |
| `Graphics/**` 原样复制 | `resource.Graphics` | 有 | 只解析 Tilesets/Autotiles/Characters(玩家) |
| `mkxp.json` | 导入前身份校验 | 不进消费者表 | 不读 |

`projectMapRecord` 明确不把 events 放进 first-slice Map JSON（`M14_CONSUMER_PROJECTION.md` 仍写着 terrain_tags 当时未进 Tileset；**代码已经把 terrain_tags 加进 Tileset**，以当前 `semantics.ts` 为准）。

---

## 5. 当前消费情况审计

**不能把“数据在 FSDB 里”写成“功能已实现”。**

### Map Runtime（`runtime.ts` `loadMap` + 启动）

实际 `scope.content.record/resource`：

- `struct.Map/{mapId}`
- `struct.MapTransfer/{mapId}`
- `struct.Tileset/{tileset_id}`
- `struct.MapAction/{mapId}`（缺失则 `emptyMapActionRecord`）
- `resource.Graphics/Tilesets/{tileset_name}`
- `resource.Graphics/Autotiles/{name}`
- `resource.Graphics/Characters/{characterName}`（仅初始 input）

行为：通行（passages + priorities + terrain_tags + bridgeLevel）、行走 250ms、边/格/接触传送、bridge on/off、opaqueRelated 失败退出、镜头与玩家投影。  
不行为：NPC、物品拾取、对话、self-switch 页、开门动画、读 PlayerMetadata、读 Item。

玩家朝向初始恒为 2；不读 System/Event。

### Browser

- `lr-map-view`：tile / autotile 动画（presentation-only）、镜头
- `lr-map-sprite`：单一玩家 4×4 表
- 无 NPC/门/物品 sprite 槽位

### 测试

- `game-libs/map/test/runtime.test.mjs`：**合成** `m14_player` + mapId 1
- 本地真实 FSDB 的资格测试存在于 `tools/fixtures/essentials-v21.1/map-*-evidence*.mjs` 等，覆盖桥/崖/传送静态证据；它们解码 rxdata，**不等于** Runtime 已实现 NPC/物品
- 合成 example：`examples/essentials-v21.1`

### 本库 MapAction 实况（真实投影产物）

- 69 张图都有 `struct.MapAction`
- **仅 Map 21** 有 8 条 `kind: "bridge"`；其余 `actions: []`
- 全库 `opaqueRelated: []`
- Map 4 / 7 / 66 的 MapAction 均为空 actions——这些图上的门、NPC、告示、物品都不在该表里

opaqueRelated 在本套数据上是空的，但 Runtime 仍把它当作未知脚本的失败策略。**不得仅因当前未引用就建议从协议删除。**

---

## 6. 数据清理初步分类

理由必须落到证据，而不是“代码里没搜到符号”。

### 6.1 当前必需（现有 Map 模块已消费或失败策略依赖）

| 数据 | 理由 |
| --- | --- |
| `struct.Map` 四字段含三层 `data` | Runtime 绘制与通行 |
| `tileset_id` | 解析 Tileset 与图形 |
| `Tileset.tileset_name / autotile_names` | 资源键 |
| `Tileset.passages / priorities` | 通行与层级 |
| **`Tileset.terrain_tags`** | Bridge/Ledge/Neutral 等；`evaluatePassability` / `planMovement` / `assertProjectable` 读取。标签值 0–17 与 `VANILLA_TERRAIN_TAGS` 对齐。禁止当“原引擎遗留字段”删 |
| `MapTransfer.steps/contacts/edges` | 切图 |
| **`MapAction.actions`（bridge）** | Map 21 八条 occupied 与 `size()` 事件对应；Runtime 执行 |
| **`MapAction.opaqueRelated` + schemaVersion** | 即使本库为 []，未知事件防护仍在 `failOpaque`。删除前必须规定替代失败策略 |
| `resource.Graphics` Tilesets/Autotiles/Characters(玩家) | 画面 |
| 启动 `{mapId,x,y,characterName}` | 当前唯一玩家身份来源 |

### 6.2 目标功能（NPC / 地图物品 / 按 ID 使用实体）可能必需

| 数据 | 理由 |
| --- | --- |
| 事件 `@id/@name/@x/@y/@pages` | NPC 与物品实例都在这里 |
| 页 `@graphic`（name 或 tile_id）、`@trigger`、`@through`、`@walk_anime`、`@direction` | 展示与阻挡 |
| 页 `@condition`（开关 / self-switch） | 已拾取/已对话等页切换 |
| 命令 201、111 type 12、`pbItemBall`、101 文本、123 self-switch | 传送已部分投影；物品/对话未投影 |
| `size(w,h)` 或等价占格 | 桥已经用；宽 NPC/家具可能需要 |
| `PlayerMetadata.WalkCharset` 或等价 | 若出生点不再手写 game.json |
| `struct.Item` 符号 ID | 地图脚本已经在引用；背包不属 Map，但引用要能解析 |
| Characters 下 NPC/doors/Object ball 图 | 多实体渲染 |

这些是“原始数据已有或已进 FSDB 但 Map 消费者未用”，不是新发明，除非要做跨图 `npcId`。

### 6.3 可考虑移出通用 RPGMap 协议（仍可留在 importer/诊断）

| 数据 | 理由 |
| --- | --- |
| PBS 物种/技能/特性、Trainer 战斗、Slot machine、Berry 完整种植模拟 | 不是地图模块职责；事件脚本会调用，但协议不应变成万能 RPG |
| `resource.Audio/Fonts/Plugins`、战斗/标题/UI 图 | Map Runtime 不读 |
| RMXP `Actors` / `Items.rxdata` | 原版已架空；物品权威在 PBS |
| Tileset panorama/fog/battleback | 本 Tileset 1 为空；Runtime 不读。移出前需确认其他 22 个 Tileset 是否有非空（**未全表人工点开，标未验证**） |
| Map BGM/BGS/encounter_list | 不在 struct.Map；遇敌是另一系统 |
| `struct.RmxpRoot` 作为**运行时消费者协议** | 体积与 Ruby 图不适合作为通用 Map API；适合 importer 证据 |
| 硬编码战斗/天气等域 | 与地图通行无关 |

### 6.4 证据不足，禁止删、也不要当成已有协议

- 把全部 Event 收成 NPC 表是否合理（门、桥、隐藏物、autorun 开场会混进去）
- 原版 Red/Leaf 选择与 intro 选项
- `Graphics/Items` 与地图 `Object ball` 是否还需双向绑定
- 未跑原版，无法用动态日志确认 HiddenItem 的调查按键与 `pbItemBall` 返回值
- Tileset fog/panorama 在非 1 号图块集是否使用

---

## 7. 通用化缺口

面向问题：使用方能否按 ID 查找并使用地图、NPC、物品及必要资源？

| 对象 | 现有数据已经可以表达但未投影到 Map 消费者 | 现有数据本身没有独立定义 | Runtime 现状 |
| --- | --- | --- | --- |
| 地图 | 已有 `struct.Map/{id}` | ID 已是地图主键 | **已能**按 ID 加载地图与图块 |
| 图块/自动图块资源 | 已有名称引用 | 无数字资产 ID（名称即键） | **已能** |
| 玩家 | WalkCharset、System 出生、Home、开场 201 | 无 Player Record；主角不是 Event | 仅 game.json 四字段 |
| NPC | 完整 Event 图在 rxdata/RmxpRoot | **无 npcId / NPC 定义表**；跨图只共享 PNG 文件名 | 未实现 |
| 地图物品 | 事件 + `pbItemBall(:ID)` + 页切换 | **无地图物品实例表**；Item 定义已有但不含坐标 | 未实现 |
| 背包 Item 定义 | 已投影 `struct.Item/{SYMBOL}` | — | Map **不应**实现背包；但要引用需能解析符号 |
| 建筑 | Tile + 门 Event | **无 Building 定义** | 门传送已部分执行，门图未画 |
| 资源按 ID | 逻辑键是路径型字符串 | 没有与文件分离的 GUID | Content 按 namespace+key |

因此：精简 RPGMap FSDB **可以**从现有 Essentials 解析结果收，而不是从零发明；但 NPC/地图物品若要“按 ID 使用”，必须先决定是：

- 继续用 **(mapId, eventId)** 作为实例身份（数据已有，未投影），或
- 新增跨图定义 ID（数据本身没有）

本次**不**冻结该选择。

---

## 8. 建议与开放问题

以下为**最小演进方向**，不是 API 或 Schema。

1. **先审计再发明。** Map/Tileset/Transfer/Action + Graphics 名称引用已经足够支撑当前行走/切图/桥崖。NPC/物品应在这条基线上**补投影**，不要另起一套与事件无关的万能实体框架。
2. **保留 terrain_tags、passages、priorities、opaqueRelated。** 未引用 ≠ 可删。
3. **NPC：** 最短路径是把“可展示子集”（坐标、graphic、through、direction、当前页）从事件页投影出来，实例键暂用 `(mapId, eventId)`。`npcId` 复用是新需求，原版没有。
4. **地图物品：** 保留 Event + `pbItemBall(:SYMBOL)` + self-switch 页模型；Item 定义留在物品域。Map 模块需要的是实例与符号引用，不是把 693 条 Item 搬进地图库。
5. **建筑：** 默认保持 Tile；门继续当 Event/Transfer。不要为了对称强行加 Building Record。
6. **玩家：** 若通用模块仍靠 Builder 传入初始 `{mapId,x,y,characterName}`，应在规范里写明这与 Essentials 的 System/Home/开场事件是**不同来源**，避免把 Map 66 试玩点写成原版出生点。
7. **不要**把 `struct.RmxpRoot` 或原始脚本当作可执行内容；Ruby 仍不可作为通用模块默认行为。

开放问题：

- 页条件依赖的开关/变量状态机是否属于 Map 模块？
- HiddenItem 的调查交互在原版里如何触发（本次只有静态命令）？
- 多实体渲染时 Event tile_id 与 Characters 图如何统一资源解析？
- 第二个非 Essentials 消费者是否还需要 `(mapId, eventId)` 以外的 ID？

设计讨论文档中“拟采用 定义 ID + 地图实例”的关系，与本次**真实数据**并不一一对应：原版 NPC/物品实例绑在地图事件上，定义侧只有行走图文件和 Item 符号。那是演进选项，不是已观察事实。

---

## 9. 复核索引

### 9.1 主要代码路径

| 路径 | 作用 |
| --- | --- |
| `tools/fixtures/essentials-v21.1/lib/source/identity.mjs` | ZIP/目录身份：`mkxp.json` 必须匹配 v21.1 |
| `tools/fixtures/essentials-v21.1/lib/acquisition/eevee-expo.mjs` | 官方 ZIP size/sha256 |
| `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs` | Map/Tileset 投影（无 events） |
| `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs` | 201 / connections；跳过 hiddenitem 与 size( |
| `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-action-consumer.mjs` | bridge / opaqueRelated |
| `tools/fixtures/essentials-v21.1/lib/fsdb/mapper.mjs` | 哪些域写成 struct |
| `tools/fixtures/essentials-v21.1/lib/rmxp/class-registry.mjs` | Event/Page/Graphic/System 字段表 |
| `game-libs/map/src/semantics.ts` | Map/Tileset/Transfer/Action 校验；terrain；TILE_SIZE |
| `game-libs/map/src/runtime.ts` | 唯一消费者：四类 struct + 三类图形 |
| `game-libs/map/browser/map.browser.js` | 4×4 人物表、autotile 几何 |
| `examples/essentials-v21.1-local/game.json` | 本地试玩出生点 |
| `examples/essentials-v21.1/scripts/generate-fixtures.mjs` | **合成** fixture |

### 9.2 真实数据样本标识

| 样本 | 标识 |
| --- | --- |
| 官方归档 | ZIP 文件名 `Pokemon Essentials v21.1 2023-07-30.zip`；sha256 见 §1.2 |
| FSDB 与 ZIP 对照 | `Map066.rxdata` / `System.rxdata` / `PBS/metadata.txt` 三对 SHA 完全一致 |
| 玩家 charset | PlayerMetadata id 1；文件 `Characters/trainer_POKEMONTRAINER_Red` |
| System 出生 | map 1，(9,7) |
| Home | map 3，(7,5)，dir 8 |
| 开场传送 | Map 1 Event 1/2 → map 3 (25,6) |
| 试玩点 | game.json map 66 (8,7) |
| 对话 NPC | Map 2 Event 3 `NPC 06` |
| 多页领取 | Map 4 Event 5 `Object ball` → empty，`pbAddPokemon` |
| 地面物品 | Map 21 Event 15 `Item` `pbItemBall(:LEFTOVERS)` |
| 隐藏物 | Map 21 Event 18 `HiddenItem` `pbItemBall(:POTION)` |
| 门 | Map 66 Event 1 `doors7` → map 67 |
| 桥占格 | Map 21 Event 22 `size(2,1)` → MapAction bridge-on |
| 告示 | Map 7 Event 5/6 空图 + show-text |

### 9.3 执行命令与结果（摘要）

工作区：

```text
git status / git branch -vv / git log -1
→ 分支 docs/map-builder-handler-fsdb-design，干净，HEAD e211cea
```

官方 ZIP 身份：

```text
对 tools/fixtures/essentials-v21.1/Pokemon Essentials v21.1 2023-07-30.zip 计算 size 与 sha256
→ size 61987094 且 sha256 与 OFFICIAL_ARCHIVE_IDENTITY 一致
ZIP 内 mkxp.json windowTitle = Pokémon Essentials v21.1
ZIP 条目 7678
```

FSDB 与 ZIP 逐字节：

```text
Map066.rxdata / System.rxdata / PBS/metadata.txt
→ fsdb sha256 == zip 内对应条目 sha256
```

结构扫描（只读解码全部 69 张 Map\*.rxdata）：

```text
事件 503，页 688，局部 ID 重复，pbItemBall 条件分支 7 条且全部命中 struct.Item
MapAction：仅 map 21 有 8 条 bridge，opaqueRelated 全 0
```

均未写入仓库；未改原始文件。

### 9.4 未覆盖场景

- 原版 `Game.exe` 动态日志（开场选项、HiddenItem 调查键、Red/Leaf）
- 本次 LoomRealm `play.bat` 窗口（门图是否可见等）
- 全部 22 个 Tileset 的 fog/panorama 是否非空
- Common Event 被地图事件 `117` 调用后的物品/NPC 行为
- `compile_trainer_events` 是否改写过 rxdata（当前解码的是 ZIP 内已编译 Data）
- 合成 fixture 以外的第二套原创游戏数据

---

## 10. 对后续架构问题的直接回答

> 能否基于现有 Essentials 数据，整理出一个精简的 RPGMap FSDB 规范？其中地图、NPC、地图物品分别应当保留哪些原有语义，哪些需要新增表达，哪些不应属于 Map 模块？

**能以现有解析结果为基线做精简规范，但还不能把 NPC/物品写成已经存在的通用实体协议。**

| | 应保留的原有语义 | 可能需要新增的表达 | 不应塞进 Map 模块 |
| --- | --- | --- | --- |
| **地图** | 三层 tile、tileset 引用、passages/priorities/**terrain_tags**、已投影的 Transfer 与 bridge MapAction、opaque 失败策略 | 规范级 schemaVersion、引用失败语义；出生点若要从数据来，需明确用 System / Home / 开场 201 中的哪一种 | 遇敌表、BGM 播放器、完整 RGSS 事件解释器 |
| **NPC** | 地图内 Event：局部 ID、坐标、页 graphic/trigger/through/命令 | 若要跨图复用：定义 ID（**原版没有**）；消费者 JSON 的可展示子集；多实体渲染 | 把所有 Event 叫 NPC；训练家战斗、商店脚本本体 |
| **地图物品** | Event 实例 + `pbItemBall(:SYMBOL)` + self-switch 页切换；符号指向 PBS Item | 可选的实例投影（坐标、graphic、item 符号、已拾取页）；不要假装 Item 行带地图坐标 | 背包、物品使用效果、693 条图鉴式字段进地图 Runtime |

**目前无法确定**的部分保持开放：独立 Building 是否有真实消费者；NPC 主键用 `(mapId,eventId)` 还是新 `npcId`；页开关状态机的归属。
