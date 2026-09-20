# 地图地形行为系统设计草案（Essentials v21.1）

> 状态：**Design draft / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 Map 7 负证据复核修订。本文是增量设计背景，不是冻结合同。[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 管交付、[冻结准备](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 管门禁、[原始证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) 记已提取结果、[证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 定义扫描边界与下一轮缺口。问题基线见 [桥与悬崖分析](./LEDGE_BRIDGE_PASSABILITY_ANALYSIS.md)。
>
> 架构决策：**内部易扩展、暂不开放外部扩展**。保持 LoomRealm `tools/` → prepared FSDB → M12 Content → `game-libs/map` Runtime → map-owned Browser 权责；禁止插件、外部 handler 注册、行为 DSL、万能事件解释器或将地图玩法下沉到 framework/Renderer/Hostra。
>
> **地图职责：Map 7 = 无桥负例；Map 21 = Bridge 正例（静态取证见证据 §14）；Map 47 = Ledge 待取证；Map 27 不是桥样本。** 69 图 corpus 在严格扫描下仍仅 Map 21 放置 tag 15 并直接调用桥脚本。未排除方法体内间接 Ruby；未做 Map 21 逐帧验收；未实现 Bridge 玩法。

## 1. 目标、非目标和事实纠错

目标：将原版来源事实、数据校验、地形识别、通行、事件、一次移动、桥状态和图层呈现贯通；未来扩展水域或冰面时在内部职责相应层扩充，不在 `canMove`、`attempt`、Browser 写散落的 map/tile ID 特判。不通过篡改原版 passages 掩盖缺口，不执行素材中的任意 Ruby/JS，也不一次实现 18 种玩法。

原版 `move_generic` 先通行判断；失败才 `check_event_trigger_touch`（**跳过** `over_trigger?` 事件）。成功走路后 `check_event_trigger_here` 才启动 walk-on 事件。Map 21 八个桥事件是空图形 `size()`：SOURCE-PROVEN 为走上去之后 `start`，不是 bump。`start` 不同步执行脚本。禁止“同一次输入因 contact 立即重算通行”。逐帧仍 UNVERIFIED。

## 2. 数据：保留全部标签，只落地本轮承诺行为

将 `RPG::Tileset.@terrain_tags` 增量投影为 `struct.Tileset.terrain_tags`，按 tile ID 索引的一维 RGSS Table；与 `passages`、`priorities` 同步通过 importer → FSDB → 严格 `TilesetRecord` → fixtures → M12 Content。合同精确确定维度/长度/值域/引用/错误/迁移。当前 Tileset 已有 `autotile_names`，历史 M14 四字段 first-slice 不等于当前实现；任何新增字段形成新的 qualification subject，不改写历史资格记录。

| Tag | 名称 | 本轮语义 |
|---:|---|---|
| 0 | None | 非空普通图块仍依 passage/priority 判断 |
| 1 | Ledge | 面前符合方向规则时，单次两格跳跃 |
| 2–12 | Grass、Sand、Rock、DeepWater、StillWater、Water、Waterfall、WaterfallCrest、TallGrass、UnderwaterGrass、Ice | 原值保留，**不承诺对应完整玩法** |
| 13 | Neutral | 忽略**当前图层**的 passage，继续下层 |
| 14 | SootGrass | 原值保留，不实施附加效果 |
| 15 | Bridge | 玩家桥层决定通行、事件切换和深度 |
| 16 | Puddle | 原值保留，不实施附加效果 |
| 17 | NoEffect | 不等于 Neutral；普通通行规则仍有效 |

`0x40` bush、`0x80` counter 是 passage 额外位，非 TerrainTag 的方向位，另列切片。未实施标签保留原始值，不改写成 Neutral 或一律放行；遇未知 tag/坏 Table/缺索引按正式合同确定性拒绝，不由实施 Agent 自选。

## 3. 内部边界和两个不同的地形问题

```text
原版 Map/Tileset/Event
 → selective importer（只保留本轮需要且证据可解释的事实）
 → prepared FSDB / M12 Content 严格校验
 → resolveEffectiveTerrainTag：面前到底是哪种地形
 → evaluatePassability：当前位置、目标格逐层、双向判断能否通行
 → movement planner：blocked / walk / jump
 → Runtime：唯一玩家、bridgeLevel、事件与 motion 状态权威
 → RenderDomain：人物、相机、桥面 depth 的一致投影
 → Browser：校验、绘制和输入，不再推断玩法
```

有效标签识别遵循原版覆盖规则，例如跳过 None/Neutral 和桥下被忽略的桥层；**逐层通行是另一种查询**，必须独立检查非空 tile ID、方向 passage、`0x0f`、priority、桥层。不能因有效 tag 是 None 就跳过该层 passage。Neutral 只忽略本层；bridgeLevel=0 跳过 Bridge 层继续下层，>0 由桥面 passage 决定该格结果。源格方向、目标格反向和边界规则保持现有契约，具体例外由原版证据冻结。

内部 MovementContext 携带 validated map/tileset、玩家位置方向、bridgeLevel 与明确支持的事件碰撞事实。MovementPlan 类型容纳 blocked、walk(to)、jump(to,distance=2)，当前仅为草图：字段/错误/时序需合同锁定。PR 2 冻结类型仅实现 blocked/walk；PR 4 才实现完整 jump，不做占位执行器或万能 TerrainBehavior 回调。

## 4. 事件与导入：不能静态删除动态事实

`projectedD0Passable` 仍不知 Neutral/Bridge。Map 21 对照（证据 §14.7）：**无已证实误删**；67 格 D0-false 为潜在风险未复现。冻结前仍须把动态桥状态留给 Runtime，不得在本轮改 importer。

Map 21 八个桥事件的命令、`size()` 占用和 walk-on 机制已记录。事件格无 tag 15。进化事件 1/2 不得投影为桥。不执行 Ruby，不硬编码 Map 21 ID 到 Runtime。Map 7 严格扫描后仍为零桥。

## 5. 规则与时间

**Neutral：** 仅跳过该层 passage，不能无条件走；多图层、方向位、None/NoEffect 和 priority 给正反例。

**Bridge：** `bridgeLevel` 数值而非 bool；原版 `pbBridgeOn(height=2)` 设置数值、`pbBridgeOff` 设置 0。桥下忽略 Bridge 通行层且桥可盖住人物；桥上按 Bridge passage、桥地面绘制。Runtime 唯一持有状态，同一状态供碰撞/渲染；初值、范围、转图关闭、Frame 生命周期、事件脚本生效时间必须先取证冻结，不能任意扩原四字段 initial input。

**Ledge：** 正常方向通行通过、面前有效地形 Ledge 时才尝试 `jumpForward(2)`；`Game_Character#jump` 再校验最终落点。中间格不是第二次普通 walk，不产生中间 step transfer；失败不允许半次提交。跨连接地图、边界、NPC/事件碰撞须有证据或明确不支持，不能凭空添加更严条件。

**方向输入骨架**（源码骨架，非 Map 21 逐帧证明）：

```text
input → direction / 原版通行判断
    ├─ blocked → 非 over_trigger 才可能 touch start → 解释器后续执行 → 本次结束（Map 21 桥事件走不到这条）
    └─ passable → Ledge ? jump : walk
                 → 步完成后 check_event_trigger_here（空图形 size() 桥带在此 start）
                 → 之后 interpreter eval pbBridgeOn/Off → 下一输入才用新 bridge
```

`start`、执行、状态变更、下一输入是四个不同检查点；step/edge/同格事件冲突和 held input 以原版/现有回归定准。当前 Runtime 的 ContactTransfer 先于 canMove，仅是需兼容审计的现状，不能作为桥事件保真模板。

## 6. 运动与画面是完整的同一协议

当前 Runtime walk 在动作开始提交目标逻辑坐标并发布 camera/player motion，计时 250ms；Browser 校验、启动、重入、续接、插值多处也写有 250ms。jump 要双方同时确定 kind、from/to、duration、单个 motion ID、scene/visual epoch、逻辑提交/完成和抵达事件、弧线/人物帧/相机进度、resize/切图/取消/旧包/负例；保持既有 walk 行为，不让 Browser 自行读取 TerrainTag 判断跳跃。

bridgeLevel 即使在坐标/camera 不变时切换，也必须使 tile-depth 窗口缓存失效，桥图层深度和 player/camera 同一次 RenderDomain 更新、同 epoch 接受；不能全局将玩家置顶破坏树冠/屋檐遮挡，也不把业务状态存进 Hostra 或 Browser。

## 7. 验收和资格状态

实施顺序：原版取证/合同冻结 → PR 1 terrain_tags + 传送 → PR 2 地形纯规则/普通一步 → PR 3 **Map 21 Bridge 正例**（含 Map 7 负例）→ PR 4 Map 47 Ledge；PR 4 规划器可先独立，但 Runtime/Browser 共享 ABI 后合流。原始 FSDB 不可分发则核实许可、给最小合法派生 fixture/指纹/生成命令和 CI 差距；不得用自造合成桥代替 Map 21 真实验收或把原始地图大量复制进仓库。

保留 M14 历史合同和 `doc/30-implementation/m14-qualification.md` / `m15-qualification.md` 的正式记录；旧 Tileset 断言漂移需单列并经授权修复。任何本轮源码/fixture/测试输入变动形成新 subject，旧 SHA 某项 CI PASS ≠ 新 subject 或全部正式 Closed。**当前仅有 Map 7 负证据和 Map 21 正例线索；尚未验证完整桥/悬崖功能、未跑本轮实现测试、未完成六门禁。**