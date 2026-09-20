# 地图地形行为系统设计草案（Essentials v21.1）

> 状态：**Design draft / NOT Implemented / NOT Qualified**。本文记录 2026-09-20 对桥、悬崖以及后续特殊地形的内部架构方向；不是已落地的接口承诺，也不变更 M14 first-slice 的冻结范围。问题诊断与样本地图见 [Ledge / Bridge 通行缺口分析](./LEDGE_BRIDGE_PASSABILITY_ANALYSIS.md)。
>
> 决策：**内部易扩展，暂不支持外部扩展**。桥与悬崖作为首批行为接入同一套内部机制；不为单张地图、单个 tile ID 写死玩法，也不提前建立插件、脚本或外部注册 API。

## 1. 目标与非目标

目标：保留 Essentials v21.1 的原始地形事实，在 Map Library 内分离地形识别、通行规则、移动规划、事件状态与画面表现。新增冰面、水域等内部行为时，应能增加独立规则，而不是不断把分支堆进 `canMove` / `attempt`。桥、悬崖必须以 Map 7 Cedolan City、Map 47 Route 7 的真实素材和对应原版规则验收。

非目标：不允许游戏内容注册自定义地形处理器；不执行导入素材中的任意 Ruby/JS；不建立通用 RMXP 事件解释器；不同时实现全部 18 种地形玩法；不修改原版 `passages` 来掩盖碰撞缺口；不宣称 M14 历史合同已包含 terrain effects。地图身份以分析文档为准：Map 27 是 Day Care 室内，不充当户外桥的正式样本。

## 2. 数据基础：完整保留、按需实现

`RPG::Tileset.@terrain_tags` 应通过 Essentials fixture consumer 投影到 `struct.Tileset`，与既有 `passages`、`priorities` 同为按 tile ID 查询的一维表。扩展 `TilesetRecord`、严格校验、fixture 生成及实际 Content 读取路径；检查维度、整数范围、表长度/引用 tile ID 一致性，并给旧版严格夹具明确的迁移路径。**完整导入不代表所有地形行为已经实现**。不要把不认识的已定义标签静默当作 `Neutral` 或改成可通行。

v21.1 原版 `GameData::TerrainTag` 内置标签如下：

| ID | 标签 | 原版涉及的属性或用途 | 本轮行为范围 |
|---:|---|---|---|
| 0 | None | 默认、无特殊属性 | 保留；普通通行 |
| 1 | Ledge | 面前悬崖，单次前跳两格 | **实现** |
| 2 | Grass | 草晃动、陆地遭遇 | 仅保留数据 |
| 3 | Sand | 战斗环境 | 仅保留数据 |
| 4 | Rock | 战斗环境 | 仅保留数据 |
| 5 | DeepWater | 冲浪、钓鱼、潜水 | 仅保留数据 |
| 6 | StillWater | 冲浪、钓鱼、倒影 | 仅保留数据 |
| 7 | Water | 冲浪、钓鱼 | 仅保留数据 |
| 8 | Waterfall | 瀑布移动 | 仅保留数据 |
| 9 | WaterfallCrest | 瀑布顶、下行行为 | 仅保留数据 |
| 10 | TallGrass | 深草、遭遇、步行限制 | 仅保留数据 |
| 11 | UnderwaterGrass | 水下遭遇 | 仅保留数据 |
| 12 | Ice | 连续滑行、骑车限制 | 仅保留数据 |
| 13 | Neutral | `ignore_passability`，跳过本图层 | **实现** |
| 14 | SootGrass | 踩踏清除图块、收集灰 | 仅保留数据 |
| 15 | Bridge | 依桥层状态使用/忽略桥面 | **实现** |
| 16 | Puddle | 倒影、战斗环境 | 仅保留数据 |
| 17 | NoEffect | 无特殊属性，但不是 Neutral | 保留；不得当成忽略图层 |

另外，`passages` 中的 `0x40` 草丛标记和 `0x80` 柜台标记**不是 TerrainTag**；分别关联人物草丛遮挡与隔柜台互动探测，另列待办。本版不假定存在 StairLeft/StairRight 等插件标签。

证据：Essentials v21.1 的 `011_TerrainTag.rb`、`004_Game_Map.rb`、`008_Game_Player.rb`、`001_Overworld.rb`；对应源码路径见文末链接。是否有某标签出现在本地全部地图，以及出现次数，需要另用本地 FSDB 扫描，不能由标签定义推断。

## 3. Map Library 内部分层

推荐以明确的职责和内部静态分发组织，不建立可由外部调用的 `registerTerrainHandler()`：

```text
Essentials RMXP source
  -> fixture consumer: Map / Tileset(terrain_tags) / narrow projected MapAction
  -> Map Library: terrain resolution (依图层和人物状态选有效地形)
  -> passability policy (源格/目标格、方向位、Neutral、Bridge)
  -> movement planner (blocked / walk / jump；未来可加入 slide)
  -> runtime executor (原子提交坐标、计时、到达事件和状态)
  -> render projection (运动种类、桥面遮挡状态)
  -> browser renderer (只负责呈现，不推断地形玩法)
```

**地形解析**：提供内部查询，从 z=2→1→0 遍历 tile ID、terrain tag、passage、priority；区分“该层忽略通行”（Neutral）、“桥下忽略 Bridge、继续下层”和“桥上使用 Bridge passage 并结束判定”。`None` / `NoEffect` 不等价于 `Neutral`。所有读取都应复用 Tileset 表校验，不能只根据画面贴图猜地形。

**通行策略**：保留 RMXP 方向位、`0x0F`、priority 的基本规则，增加明确的 `MovementContext`（当前坐标、方向、地图、tileset、玩家状态）。桥属于影响通行层选择的策略，不应被塞进“跳跃动画”的分支。

**移动规划**：从单一 `boolean canMove` 上方引入 Map Library 内部动作计划。示意类型如下（字段、命名和精确边界待代码实现确认）：

```ts
// 示意：非公开 API，也不是已实现的类型。
type MovementPlan =
  | { kind: "blocked" }
  | { kind: "walk"; toX: number; toY: number }
  | { kind: "jump"; toX: number; toY: number; distance: 2 };

// 冰面等将来确有需求时再追加 slide，先不造未被消费的占位分支。
```

首批内部规则可以是 `resolveTerrain` / `evaluatePassability` / `planLedgeMove` / `planRegularMove` 等独立模块或纯函数；由单个内部入口按已定义语义调用。无动态注册表、插件生命周期、扩展 manifest 或外部行为 DSL。对于同时影响多个阶段的标签（Bridge），在对应阶段定义职责，不强行要求所有地形实现相同的万能回调。

**Runtime 执行**：先得到计划并验证，再一次性启动动作；将位置、camera/viewport 和 player motion 一致地发布。动画可以由内部 motion kind 表示，但 renderer 不读取 TerrainTag 决定“玩家应该怎么走”。现有普通一格移动和 MapTransfer 行为不应退化。

## 4. 第一批行为的具体语义

### 4.1 Neutral

`terrain tag 13` 表示该图层不贡献通行判定，继续向下找下一层；不得把它的 `0x0F` 当成墙，也不得直接把整个坐标无条件判定为可走。补充多图层、方向位和优先级组合测试。

### 4.2 Bridge

将原版 `$PokemonGlobal.bridge` 对应为 Map Library 内部玩家状态 `bridgeLevel`（**保留数值，不仅是 boolean**；原版 `pbBridgeOn(height = 2)`、`pbBridgeOff` 分别设置高度和 0）。桥下 `bridgeLevel === 0` 忽略 Bridge 图层，改查下层；桥上 `bridgeLevel > 0` 采用桥面 passage 并结束该格的通行判定。角色与桥 tile 的前后关系必须读取同一状态：桥下桥遮住角色，桥上桥 tile 不再盖住角色；不得用全局 z-index 暴力覆盖其他遮挡。

桥头状态来自**地图事件投影**，不来自 Map ID / 硬编码坐标，也不靠自动识别桥图形切换。导入工具仅白名单识别已核实的原版脚本形式 `pbBridgeOn` / `pbBridgeOn(<受支持整数>)` / `pbBridgeOff`，以及它们实际所在的事件页面、触发条件和命令顺序，转换为狭义 `MapAction`（示例 `{ kind: "set-bridge-level", level: 2 }`）。原版 Map 7 桥头的实际事件命令、事件页、trigger、through、接触/踏入时机须先取证；若涉及不支持的分支、开关、其他命令或触发形式，报出带地图/事件 ID 的未支持结果，不得仅用文本包含匹配就假装已导入。沿用现有 MapTransfer 的事件解析基础，但不将桥事件误识别成传送。

触发顺序按**真实事件语义**确定：接触触发可在目标格因碰撞失败时检查；踏入触发在有效移动完成时执行。不能一律放在抵达后，避免“未上桥→无法抵达桥头→永远无法上桥”的死锁。事件动作、运动和视觉状态应保持一致；传送到桥附近、跨地图及返回时的 bridgeLevel 继承/重置也要按原版行为测试，不能无条件初始化为 0。

### 4.3 Ledge

识别面对方向上的 Ledge，并遵循原版“先判断这一方向可以移动，再执行 `jumpForward(2)`”的触发次序。由 planner 构建**一个**两格 jump 动作，而不是两次普通 walk；对跨越格、落点、图边界、角色/地图事件以及相邻地图边缘按原版跳跃行为核对校验。完整动作通过后才提交，失败停在起点，不在跨越格错误触发普通踏入事件或传送。Runtime 使用单个动作 ID 与时间区间，browser 根据 motion kind 绘制平滑跳跃及抛物线位移；最终落点、人物、相机状态一致。不可通过直接修改 ledge 的 passage 来伪造普通一格行走。

## 5. 行为阶段与事件优先级

以下为**实现目标流程，尚非已验证的原版逐帧次序**：

```text
接收方向输入
  -> 检查面前事件：按原版区分 contact / step / edge
  -> 地形解析与源格/目标格通行策略
  -> movement planner 生成 blocked / walk / jump
  -> 校验该完整动作（含地图边界与事件）
  -> Runtime 原子发布移动状态和视图
  -> 动作完成后处理原版应在抵达时触发的事件与后续输入
```

把事件分类和优先级列为需对照 Map 7 原始事件的未决验证项，不凭设计图直接宣布准确。桥高度状态、移动动作和渲染投影应由同一个 Runtime 权威状态推导，避免碰撞/遮挡相差一帧。任何新增 `Player.motion` / `Viewport` 字段须同步修改 browser 的严格 payload 验证和测试。

## 6. 交付切片与验收

| 切片 | 变更 | 验收要点 |
|---|---|---|
| A：完整数据 | `terrain_tags` 投影、Tileset schema、fixture 与校验；明确不支持的行为 | 标签 0–17 可读取，错误表/引用拒绝；旧 M14 资格不被误改 |
| B：最小内部行为骨架 | 地形解析、桥层通行、Neutral、动作计划接口；普通走路回归 | 多层 + 双向 passage、普通一步、越界保持正确 |
| C：桥头和画面 | 真实桥头事件投影、`bridgeLevel`、运行时事件次序、渲染层次 | Map 7 可在桥下穿行、两端上下桥、往返时人物遮挡正确 |
| D：悬崖跳跃 | Ledge 计划、完整跳跃校验、单动作动画 | Map 47 能合法跳下、逆向阻挡、落点受阻不穿墙、不触发跨越格事件 |

各切片均需合成夹具 + 原版真实地图场景测试；针对动作 ID、运动完成、连续按键、resize、传送和旧一格行走做回归。若真实地图事件超出本轮白名单，新增明确的支持范围/测试，而非悄悄跳过。本文件不声称实现、测试或 qualification 已经完成。

## 7. 后续能力如何接入（仅设计预留）

- **Ice**：未来由独立 planner / 连续移动状态消费 `tag 12`，不是修改原始碰撞为永远可走。
- **水域/瀑布**：需人物冲浪、潜水和瀑布状态、互动和地图转换；行为系统提供语义入口，当前不实现完整玩法。
- **TallGrass / Grass / SootGrass / Puddle**：分别关联移动方式限制、遭遇、踩踏后地图变更、倒影，不应塞入 `mapTilePassable` 的单一布尔逻辑。
- **柜台/草丛 passage flags**：`0x80` 互动与 `0x40` 人物渲染另开明确切片；不是新 TerrainTag。

在实际新增这些功能前，不为了猜测未来需求抽象出公共 SDK。当前仅承诺内部的职责边界与受测试约束的扩展路径。

## 8. 原版证据与本仓库位置

- [Essentials v21.1 TerrainTag 原始定义](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/010_Data/001_Hardcoded%20data/011_TerrainTag.rb)
- [Essentials v21.1 Game_Map 通行与标签查询](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/004_Game_Map.rb)
- [Essentials v21.1 Game_Player 悬崖与移动](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/008_Game_Player.rb)
- [Essentials v21.1 Overworld 桥状态与冰面](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/012_Overworld/001_Overworld.rb)
- [本仓库数据投影](../../tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs)、[事件投影](../../tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs)、[地图语义](./src/semantics.ts)、[Runtime](./src/runtime.ts)、[browser](./browser/map.browser.js)
