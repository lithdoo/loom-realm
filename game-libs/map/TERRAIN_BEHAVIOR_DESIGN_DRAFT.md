# 地图地形行为系统设计草案（Essentials v21.1）

> 状态：**Design draft / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。本轮已修复取证器 REVIEW-01～04 并重跑 Map 7/21/47。本文仍只是增量设计背景，不是冻结合同。[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 管交付、[冻结门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 管准入、[原始证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) 记 FSDB 观察（§14 历史指纹 + **§15 本轮重跑**）、[证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 记修复结果。Gate 仍全部 OPEN。
>
> 架构：**内部易扩展，不开放外部扩展**。保留 `tools` importer → prepared FSDB → M12 Content → `game-libs/map` Runtime → map-owned Browser 权责；不建插件、动态 handler、行为 DSL、万能事件解释器，不向 framework/Renderer/Hostra 下沉地图玩法。Map 7 是 Bridge 负例；Map 21 是 Bridge 正例（静态触发矩阵与连续陆地侧路线已重算，仍缺动态 RGSS）；Map 47 是 Ledge 正例（静态 30 格已抽出）；Map 27 不是桥样本。

## 1. 目标及证据约束

目标是把原版数据、有效标签、通行、事件、移动、桥状态与图层呈现贯通，并在内部分层便于未来扩充；不在 Runtime/Browser 硬编码 map ID/tile ID；不修改原版 passages、不执行原地图 Ruby/JS、不一次实现 18 种地形玩法。

已可从 v21.1 源码确定的**条件骨架**：`Game_Player#move_generic` 先 `can_move_in_direction?`；失败才检查面前 touch；成功后走路或按规则选择 Ledge，移动完成后 `update_event_triggering` 才可能检查抵达事件。`Game_Event#start` 只置 `@starting`，脚本经之后解释器运行，不在同一次 `can_move` 后立即重算。

**关键条件不能省略：** `Game_Player#check_event_trigger_here` 除要求玩家在事件占用格、trigger 匹配外，还要求 `event.over_trigger?`。v21.1 `Game_Event#over_trigger?` 对空图形事件进一步检查至少一个占用格 `map.passable?(i,j,0,$game_player)` 为真；图形名、through、hiddenitem 等也是条件。空图形只取得 over_trigger **资格**，不是结果。本轮对 Map 21 八个事件全部占用格按原版逐层 `playerPassable?(d=0)` 算出 `over_trigger?=true`、分支 **here**（STATIC-INFERRED）。失败 bump **不会** start 这些事件，因为 `check_event_trigger_touch` 跳过 `over_trigger?`（SOURCE-PROVEN）。`d=0` 在 Ruby 1.8 中 `1 << -1` 为右移，bit=0。参见[复核 REVIEW-01](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 与证据 §15。

## 2. 数据：保留全部 terrain tags，按需实现

将 `RPG::Tileset.@terrain_tags` 投影为 `struct.Tileset.terrain_tags`：tile ID 索引的一维 RGSS Table；与 passages/priorities、严格 TilesetRecord、fixture 和 Content 闭合，冻结时精确说明 dimensions、实际 values 长度、值域、引用、旧数据迁移和坏数据错误。当前 Tileset 还有 `autotile_names`，不能照历史 M14 first-slice 四字段断言删减 schema。新增字段触发新的资格 subject，不追溯改写历史资格。

| Tag | 名称与本轮范围 |
|---:|---|
| 0 | None；非空普通 tile 仍按 passage/priority 判断 |
| 1 | Ledge；实现原版一次两格 jump |
| 2–12 | Grass、Sand、Rock、DeepWater、StillWater、Water、Waterfall、WaterfallCrest、TallGrass、UnderwaterGrass、Ice：保留原值，不承诺完整玩法 |
| 13 | Neutral：只忽略所在图层 passage，继续下层 |
| 14 | SootGrass：保留原值 |
| 15 | Bridge：桥状态决定通行、事件与遮挡 |
| 16 | Puddle：保留原值 |
| 17 | NoEffect：不等于 Neutral，仍参与普通通行 |

`0x40` bush 与 `0x80` counter 属于 passages，不是新 TerrainTag。本轮未实施标签不可偷偷改成 Neutral 或无条件通行。取证器已 fail-closed：terrain_tags 必须 1D 且 values.length=xSize；负 tile ID、orphan 655、坏 111/117 不能 `provenNegativeBridge=true`。Common Event 按**调用入口可达闭包**归类，不只扫 CE 自身。Map 7 按新规则重跑仍为严格零桥（仅覆盖本图已扫描入口）。

## 3. 内部职责与两种不同的查询

```text
原始 Map / Tileset / Event → selective importer（仅可解释事实）
 → prepared FSDB / M12 Content 严格校验
 → resolveEffectiveTerrainTag（问地形是什么）
 → evaluatePassability（逐层判断能否通过；源格/目标格方向）
 → movement planner（blocked / walk / jump）
 → Runtime（玩家、bridgeLevel、事件、motion 唯一权威）
 → RenderDomain（人物、camera、桥深度一致投影）
 → Browser（严格校验并绘制；不推断地图玩法）
```

有效标签与逐层 passage **不能合并**：None 图块可能仍阻挡；Neutral 只忽略该层；NoEffect 不等于 Neutral；bridgeLevel=0 跳过 Bridge 层，bridgeLevel>0 按桥面 passage 决定该格；源格方向和目标格反向的判断及边界按原版和既有契约确认。

MovementContext 携带验证过的地图/tileset、坐标方向、bridgeLevel 和本轮确实投影的事件碰撞事实。MovementPlan 为 blocked/walk/jump 的类型草图，完整字段/时序/错误须冻结合同。PR 2 冻结完整类型而仅执行 blocked/walk；PR 4 才落地 jump，不做空实现器。

## 4. 事件投影、跨图传送与 Map 21 真实依据

`projectedD0Passable` 只根据 passages/priorities 作静态判断，不知道 Neutral、Bridge 或玩家桥层。不能在导入阶段永久丢掉依运行时状态决定的传送事实；MapTransfer 和狭义 MapAction 是不同记录身份，可共享最小 RMXP 提取器，不建通用解释器。无关 NPC/剧情按 selective 范围排除，相关未知桥候选无法保真则报告 map/event/page 及理由并停止该分支。

Map 21 素材事实仍是 93 个 Bridge 格、8 个直接桥脚本、2 个邻接进化事件；事件占用格本身是地面而非 tag 15。本轮已按占用格 `passable?(d=0)` 算出 here/walk-on。传送审计按 `(sourceMapId,x,y)` / `(targetMapId,x,y)` 分开；D0 对照是潜在风险，**无已证实误删**。`21,E,77,47` 是几何越界，与 D0 过滤分开。详见 REVIEW-04 与证据 §15。

Map 7 是无桥负例及普通门/边界传送基线；Map 47 已静态抽出 30 个 Ledge 格（SHA `5f4ee232…df043e`），合法两格跳样本如 `(16,9)→(16,11)`，仍缺动态 RGSS。不得将 Map 21 事件 ID、size 原点或测试坐标写入 Runtime 业务规则。

## 5. 行为与时序（待正式证明的条件分支）

**Neutral：** 跳过本层 passage，并继续下层，须测多图层、方向位、None/NoEffect、priority。

**Bridge：** 内部 bridgeLevel 保留数值，原版 `pbBridgeOn(height=2)` 写数值，`pbBridgeOff` 归零，`Scene_Map#transfer_player` 也关桥。桥下可跳过 Bridge 通行层而在画面被桥面盖住；桥上使用 Bridge passage，绘制桥面 depth 按原版变化。Runtime 唯一持状态；初值、合法范围、状态切换/重入/切图时点与缓存失效须冻结。

**Ledge：** 原版普通方向检查成功、面前有效地形是 Ledge 才试 `jumpForward(2)`；最终落点由 `jump` 另校验。一次动作、非两个 walk；中间格事件不得自动按普通一步触发。地图边界、相邻图、NPC 阻挡无证据时不能编造支持。

**输入骨架（v21.1 源码分支，不是 Map 21 实测状态表）：**

```text
input → 方向通行判定
  ├─ blocked → front touch 检查（仅 over_trigger? 为 false 的候选可能 start）→ 本次尝试结束
  └─ passable → 正常 walk / 满足条件则 ledge jump → 动作完成
         → check_event_trigger_here（只有 over_trigger? 为 true、位置/trigger 匹配才 start）
         → 后续 interpreter 执行并改变 bridgeLevel → 后续输入使用已生效状态
```

`start` 与执行、状态变更、后续输入是不同检查点；不能从空图形直接决定走入还是撞击。本轮已逐事件计算 over_trigger，并给出从 Map 7 `(40–43,0)` 落入 `(19–22,76)` 再到各组陆地侧桥头的连续静态输入（§15）。解释器同一步内是否跑完仍为推论。原版动态观察未发生，不得填 DYNAMIC-OBSERVED。

## 6. Motion 与 Browser 渲染协议

现有 walk 在 Runtime 开始时提交目标逻辑坐标，并发布 camera/player motion；普通动作 250ms，Browser validator、启动、续接和插值多处固定此值。jump 需两端一起冻结 kind/from/to/duration、单 motion ID、scene/visual epoch、逻辑时点、弧线/人物帧、相机、resize/切图/取消/乱序/坏包；不让 Browser 从 TerrainTag 推断玩法，不破坏现有 walk。

bridgeLevel 改变即使人物/camera 原地不动，也必须使桥面 depth 的投影缓存失效；桥层与人物/相机经**同次 RenderDomain 更新**发布并以匹配 epoch 接受。不全局提高玩家 z-index，不向 Hostra 或 Browser 挪业务状态。

## 7. 验收和资格

推进次序：**取证器 REVIEW-01～04 / ROUTE-21 / Map 47 静态取证已在本轮完成并回填；下一步是动态 RGSS（有环境时）、合法可分发 fixture、exact CONTRACT_V1 与签核 → PR 1 terrain_tags 与传送 → PR 2 规则与普通步 → PR 3 Bridge → PR 4 Ledge。** 不能把旧本地取证测试 18 pass、本轮 36 pass 或 CI skip 冒充 Gate PASS、玩法实现或合同冻结。历史 M14/M15 ledger 不追溯篡改。六道 FG 仍 OPEN，NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED。