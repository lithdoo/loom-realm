# 地图地形行为系统设计草案（Essentials v21.1）

> 状态：**Design draft / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 一致性复核修订。本文是增量设计背景，不是冻结实现合同；[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 管交付，[冻结准备](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 管门禁。问题基线见 [桥与悬崖缺口分析](./LEDGE_BRIDGE_PASSABILITY_ANALYSIS.md)。
>
> 决策：**内部易扩展、暂不支持外部扩展**。保留 LoomRealm `tools/` 导入 → prepared FSDB → M12 Content → `game-libs/map` Runtime → map-owned Browser 的权责；不建插件、外部注册表、行为 DSL、通用事件解释器，不向 framework、Renderer 或 Hostra 下沉地图玩法。Map 7 Cedolan City 验桥，Map 47 Route 7 验悬崖；Map 27 Day Care 不作为桥样本。

## 1. 目标、非目标和设计纠错

目标是让源事实、通行、事件、单次移动和画面形成闭环；后续扩展冰面或水域时按职责增添内部规则，不在 `canMove`、`attempt` 或 Browser 中散落地图 ID/tile ID 特判。不得修改原版 `passages` 来掩盖缺口，不执行 RMXP 任意 Ruby/JS，不一次实现 18 种玩法。

**2026-09-20 复核后的纠错**：旧流程图将“检查面前事件”放在通行判断之前，实施计划又提出“执行 contact 后立即重算本次通行”。均不得冻结。Essentials `Game_Player#move_generic` 先判 `can_move_in_direction?`，成功才识别面前 Ledge；失败才调用 `check_event_trigger_touch`。`Game_Event#start` 标记事件启动，并不意味着脚本已经同步执行。事件命令的真正执行、下一次输入和桥层改变必须结合原版调度与真实 Map 7 事件确定。不能以避免桥头死锁为由凭空改变原版顺序。

## 2. 数据：保留原始标签，但按需实现行为

从 `RPG::Tileset.@terrain_tags` 增量投影 `struct.Tileset.terrain_tags`，为 tile ID 索引的一维 RGSS Table。与 `passages`、`priorities` 一起在 importer、`TilesetRecord`、严格校验、fixture、prepared FSDB 和 M12 Content 路径闭合；长度、维度、值域、引用与历史 fixture 迁移规则需在冻结合同逐字段确定。既有 Tileset 实现**已经有 `autotile_names`**，不能把历史四字段文档当成当前代码 schema；新增属性会形成新的 qualification subject，不能追溯宣称旧 M14 已支持特殊地形。

| ID | Essentials v21.1 标签 | 本轮承诺 |
|---:|---|---|
| 0 | None | 普通图块仍按 passage/priority 参与通行 |
| 1 | Ledge | 实现原版单动作两格跳跃 |
| 2 | Grass | 只保留标签 |
| 3 | Sand | 只保留标签 |
| 4 | Rock | 只保留标签 |
| 5 | DeepWater | 只保留标签 |
| 6 | StillWater | 只保留标签 |
| 7 | Water | 只保留标签 |
| 8 | Waterfall | 只保留标签 |
| 9 | WaterfallCrest | 只保留标签 |
| 10 | TallGrass | 只保留标签 |
| 11 | UnderwaterGrass | 只保留标签 |
| 12 | Ice | 只保留标签 |
| 13 | Neutral | 实现本图层 `ignore_passability` |
| 14 | SootGrass | 只保留标签 |
| 15 | Bridge | 实现桥层通行、事件和遮挡 |
| 16 | Puddle | 只保留标签 |
| 17 | NoEffect | 不是 Neutral；仍按普通图块参与通行 |

`passages` 的 `0x40` bush 和 `0x80` counter 不是 TerrainTag；另列未来切片。未实现标签保留原值、按本轮已定义的通行子集处理，**不等于把它改写成 Neutral、无条件放行或声称完整水域/冰面语义**。未知数值标签、缺表与错误引用采用冻结合同的确定性校验，不由 Agent 猜测。

## 3. 内部职责：区分地形名称与能否通过

```text
Essentials 原始 Map / Tileset / Event
  -> selective importer 保留地形与必要事件事实
  -> prepared FSDB / M12 ContentClient
  -> 经过校验的 Map / Tileset / event records
  -> resolveEffectiveTerrainTag（判面前是什么地形）
  -> evaluatePassability（逐层、源格/目标格方向检查）
  -> movement planner（blocked / walk / jump）
  -> Runtime（唯一人物、桥层、事件及运动权威）
  -> RenderDomain 投影（桥深度、人物/相机同次更新）
  -> Browser（严格校验和绘制；不推导玩法）
```

**两种查询不能合并**：`resolveEffectiveTerrainTag` 为 Ledge 等询问有效标签，依原版跳过 None、Neutral 和桥下被忽略的 Bridge；`evaluatePassability` 独立逐层检查 tile ID、方向 passage、`0x0f` 和 priority。非空 None 图块仍可阻挡，NoEffect 不等于 Neutral。二者共享经过验证的底层图层读取器，但不能用“有效标签为 None”跳过该层的 passage。Bridge 在 `bridgeLevel=0` 下忽略桥图层继续下层；`bridgeLevel>0` 使用桥面 passage 并依原版结束该格判定。保留出发格方向与抵达格反方向检查及现有边界语义。

内部 `MovementContext` 包含地图、tileset、当前坐标、方向、`bridgeLevel` 与被本轮支持的事件碰撞事实。`MovementPlan` 可表示 `blocked`、`walk(to)`、`jump(to,distance=2)`，但此处仅是类型草图：完整字段、错误与状态转换须在正式合同冻结。PR 2 冻结类型、执行 `blocked/walk`；PR 4 才实现 jump。无空 slide 实现、万能 TerrainBehavior 回调或外部 API。

## 4. 事件投影与传送：不能在导入阶段删除运行时事实

既有 `map-transfer-consumer.mjs` 的 `projectedD0Passable` 不含 Neutral/Bridge/人物状态，却在导入时决定某些 step/contact/edge 是否生成。升级 Runtime 通行而不修复这条导入链，会让合法出口先被静态筛掉。因此必须同一次设计审计：哪些静态条件永远成立，哪些事件事实需保留到 Runtime 依状态判定。**静态投影不能把动态不可判定误写成永久不可进入。** Existing `MapTransfer` 与狭义桥头 `MapAction` 保持不同业务身份，可共享 RMXP 事件读取工具；不重造通用事件引擎。

只识别证据证明需要的桥头候选：逐项核验 map/event/page ID、完整命令、参数、trigger、through、图形、页面条件与优先级、缩进、命令顺序。允许形式由真实 Map 7 决定，可将已验证的 `pbBridgeOn(height=2)`、`pbBridgeOff` 投影成声明式 `set-bridge-level`，绝不执行源 Ruby。无关 NPC/剧情事件按 selective consumer 范围排除；**相关桥事件候选**若无法完整保真解析，则报告 map/event/page 和具体原因，不静默丢弃。条件页、动态实体碰撞需要的最小事实由实物取证决定；若未纳入，不能承诺对应负例已被支持。

## 5. 行为与时间语义

### Neutral

仅忽略该图层通行并继续下层；不可无条件通行，需验证多图层、方向位、priority、None/NoEffect 的区别。

### Bridge

内部 `bridgeLevel` 是数值而非布尔；原版 `pbBridgeOn(height=2)` 设置数值、`pbBridgeOff` 设置 0。桥下忽略 Bridge 的通行图层、桥面可在人物上方；桥上以 Bridge passage 为准、桥面按原版 depth 降层。状态由 Runtime 唯一持有，同一状态决定碰撞和画面。初值、合法范围、事件真正执行时机、跨地图传送、Frame 重建/重入必须先取证再冻结；不得改动原四字段 initial input 来随意注入新状态。

### Ledge

普通方向通行检查通过且面前有效地形为 Ledge 才尝试 `jumpForward(2)`；`Game_Character#jump` 另校验最终落点。跨越格**不是第二次普通 walk**。跳跃为一个动作 ID；失败不产生半次位移或中间格 step transfer。原版对地图边界、事件阻挡和特殊相邻地图跳跃的精确结果须取证并列明支持范围；不擅自增加比原版更严的路径检查。

### 方向输入时序骨架（不是 Map 7 事件逐帧证明）

```text
方向输入 → 朝向 / 既有边界规则
  ├─ 前进方向不可通 → 按原版检查面前 touch 事件 → 事件 start/后续调度 → 此次尝试结束
  └─ 可通 → 面前是否 Ledge → 落点校验 → 单次 jump 或普通 walk
                              → 动作完成 → 按原版触发同格/抵达事件
                              → 决定 transfer / 下一次 held input
```

`start` 和脚本真正生效的时间必须分别建模；不得先执行 contact、立即重算并在同一次输入里穿过桥头。既有 ContactTransfer 在当前 Runtime 中先于 `canMove` 执行，其兼容性须明确审计，不能直接作为桥事件的保真模板。step、edge、同格事件的冲突优先级以原版取证及现有回归确定。

## 6. Runtime／Browser 是一份完整 motion 协议

Runtime 现有 walk 在动作开始更新逻辑目标坐标、发布 camera/player motion，普通计时 250ms；Browser 的校验、动画启动、续接和插值多处使用此值。jump 需两端一起冻结：kind、起终点、duration、单一 motion ID、scene/visual epoch、逻辑提交及抵达事件时点、弧线和人物帧、camera 进度、resize/切图/取消/旧包处理、非法 payload 拒绝。既有 walk 不作无关改变；不能靠改一个字段或让 Browser 读取 TerrainTag 推断 jump。

桥层变化即使相机和坐标不变，也必须令包含桥面 depth 的投影缓存失效；相关 tile depth 与人物投影通过**同一次 RenderDomain 更新**发布，Browser 以匹配 epoch 原子接受。不准将玩家永久置顶，破坏树冠/屋檐遮挡。RenderDomain 仍是唯一业务渲染权威，不新增主进程／浏览器业务状态。

## 7. 交付边界与资格

按 [实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 的规格冻结 → PR 1 数据和传送投影 → PR 2 内核/普通步 → PR 3 桥闭环 → PR 4 悬崖闭环推进。Map 7 验桥两端、桥下、折返、遮挡和出口；Map 47 验合法/逆向/阻挡跳跃、单动画和中间事件。合成单测不能代替真实样本；真实 FSDB 不可分发时需合法可复现最小派生 fixture、指纹和覆盖差距。

保留原 M14 历史合同和 qualification 记录；正式资格状态由 `doc/30-implementation/m14-qualification.md` / `m15-qualification.md` 管理。已知旧的 exact-local Tileset 断言漂移需单独记录并在获授权的资格输入改动中纠正；近期某个 CI workflow PASS 也不自动等于全部正式资格 Closed。任何执行代码/fixture/测试输入变动建立新 subject 并重新收集对应证据。当前未作代码修改、未实施本设计、未读取本地 Map 7 FSDB、未完成冻结门禁。

## 8. 证据入口

- [Essentials v21.1 TerrainTag](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/010_Data/001_Hardcoded%20data/011_TerrainTag.rb)、[Game_Map](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/004_Game_Map.rb)、[Game_Player](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/008_Game_Player.rb)、[Game_Character](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/006_Game_Character.rb)、[Game_Event](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/007_Game_Event.rb)、[Overworld](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/012_Overworld/001_Overworld.rb)、[TilemapRenderer](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb)。
- 本仓库：[Tileset importer](../../tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs)、[MapTransfer importer](../../tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map-transfer-consumer.mjs)、[semantics](./src/semantics.ts)、[Runtime](./src/runtime.ts)、[Browser](./browser/map.browser.js)、[ADR 0032](../../doc/decisions/0032-game-library-example-boundary.md)、[文档治理](../../doc/00-overview/document-governance.md)。
