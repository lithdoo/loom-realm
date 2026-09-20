# 地图地形行为系统设计草案（Pokémon Essentials v21.1）

> **Design draft / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。当前取证基线 [`e60e4a52`](https://github.com/lithdoo/loom-realm/commit/e60e4a521a726233bbda0bb1892f6d25bc47573d)。[原始证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) §14 是历史事实快照，§15 是最新静态重跑；[证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 明确独立核对范围和**未完成的 E2E-21 连续状态拼接**；[冻结门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 管准入，[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 管任务。草案及静态取证均不是已冻结 ABI。
>
> 样本职责：**Map7 Cedolan City＝Bridge 负例；Map21 Route2＝Bridge 正例（93 格、8 事件、静态触发矩阵）；Map47 Route7＝Ledge 正例（30 格、静态跳样本）；Map27 Day Care 非桥样本**。当前所有 Gate OPEN。E2E-21 统一静态 replay 见证据 §16，不是 RGSS。架构保持内部易扩展、暂不开放外部扩展；不引入插件、动态 handler、行为 DSL、万能事件解释器，不向 framework/Renderer/Hostra 下沉地图业务。

## 1. 目标、证据与本轮承诺边界

仅在 `game-libs/map` 的语义/Runtime/自有 Browser 与 `tools` importer、prepared FSDB、M12 Content 间建立可解释的行为链。不能按地图/事件/tile ID 在运行时硬编码，不修改原版 passages，不执行原始事件 Ruby/JS。保留全部原始 TerrainTag，但此次仅实施 Neutral、Bridge、Ledge 对应的有限行为；其余标签不自动获得完整水域/冰面玩法。

证据等级不可混写：固定源码条件是 `SOURCE-PROVEN`，带 digest 的素材记录是 `FSDB-OBSERVED`，静态规则移植/BFS/trace 是 `STATIC-INFERRED`，真正的原版游戏日志才是 `DYNAMIC-OBSERVED`。本轮不存在原版 RGSS 动态日志。Agent 报告的本地 36 pass 是取证器测试，不等于玩法实现、CI、真实事件执行时序或整体 qualification。独立脚本只核对 Map21 桥格/事件 IDs 和 Map47 悬崖格计数，没有独立验证逐帧或所有路线。

## 2. 数据投影与两个独立语义问题

原版 `RPG::Tileset.@terrain_tags` 拟进入 `struct.Tileset.terrain_tags`，以 tile ID 索引的一维 RGSS Table，经 importer→prepared FSDB→M12 Content→严格 TilesetRecord；保留现有 `autotile_names`、passages、priorities。合同须锁 shape、长度、值域 0–17、引用、缺失/负值/越界、兼容迁移与 Content 错误。历史 M14 first-slice 四字段范围不能当成当前完整 schema；新增字段是新 qualification subject，不追溯改历史记录。

| Tag | 必须保持的含义与本轮实现范围 |
|---:|---|
| 0 None | 非空 tile 即使有效标签为 None，仍可能由 passage/priority 阻挡 |
| 1 Ledge | 满足原版方向及落点条件后，一次动作越过中间格、最终跨两格 |
| 2–12 | 保存 Grass/Sand/Rock/Water/Ice 等各原值，不承诺各自完整业务 |
| 13 Neutral | 只忽略**该图层** passage，继续看下层；不是整格无条件放行 |
| 14 SootGrass | 保存，不实施附加行为 |
| 15 Bridge | bridgeLevel=0 忽略桥面通行层；>0 使用桥层 passage；事件与绘制另行分工 |
| 16 Puddle | 保存，不实施附加行为 |
| 17 NoEffect | 不等于 Neutral；普通通行仍有效 |

`0x40` bush 与 `0x80` counter 属 passages 标记，不是方向通行位或新增 TerrainTag。取证严格性已针对 1D/长度、负 tile、孤立 655、坏 111/117 等补校验，但工具 `COMPLETE` 只覆盖已声明输入及入口，不能扩展为整个 Ruby 运行时的保证。

`resolveEffectiveTerrainTag` 回答“面前有效地形是什么”，`evaluatePassability` 回答“逐层、源格方向与目标格反向是否可通行”，**必须分开**。前者按原版覆盖/ignore/bridge 条件识别；后者对非空 tile、passage 四方向位与 `0x0f`、priority、Neutral、桥层和边界进行独立判断。没有正式合同前不可从这段自然语言猜确切 TS 接口或错误码。

## 3. 内部权责与移动数据流

```text
Essentials 原始 Map/Tileset/Event（固定素材指纹）
 → tools selective importer（仅取本轮能解释的事实，不执行 Ruby）
 → prepared FSDB → M12 Content（严格结构校验）
 → map-owned terrain tag + passability 查询
 → movement planner（blocked / walk / jump 类型）
 → game-libs/map Runtime（位置/方向/bridgeLevel/事件与 motion 唯一权威）
 → RenderDomain（人物、相机与桥面深度同次一致投影）
 → map-owned Browser（校验/显示，不自行推断玩法）
```

MovementContext 仅包含验证过的 map/tileset、玩家/桥状态和有证据支持的事件占用/碰撞事实。MovementPlan 全部类型须先冻结，PR2 只实现 blocked/walk，PR4 才实现完整 jump；不要创建可被误用的空 jump 执行器或万能 TerrainBehavior callback。

## 4. 原版事件、桥状态与跨地图的准确边界

固定 v21.1 `Game_Player#move_generic` **先通行判断**：失败才检查面前 touch；成功才进入 walk 或 Ledge 跳跃，并在动作完成后按条件检查抵达事件。`Game_Event#start` 仅置待执行标志，并不在同次通行判定中 eval 脚本。抵达分支必须同时满足触发类型、占用位置和 `over_trigger?`，不能只凭空图形或 `size()` 决定。

`Game_Event#over_trigger?` 除图形/through/hiddenitem 条件，还要求至少一占用格 `map.passable?(x,y,0,player)` 成立。`d=0` 在原版 Ruby 负移位语义下方向 bit=0，但仍需逐层 passage、priority 和桥层。§15 对 Map21 八事件 bridgeLevel 0/2 的静态结果均为 true，故**预测**成功走入对应占用格后走 `here` 分支；失败前方 touch 会跳过 `over_trigger?=true` 事件。脚本实际执行相对于帧/held input 仍需原版运行证据，不可在 Runtime 做“contact→执行→立即重算同一次输入”。

Map21 八事件命令是 `pbBridgeOn` / `pbBridgeOff`，`pbBridgeOn(height=2)` 默认将 bridgeLevel 设为 2、Off 设 0；源码有切图关桥分支。Runtime 持有数值状态，通行、事件和深度消费同一值。`size` 覆盖多占用格，与图块是否 tag15 是两回事；进化事件 1、2 只是邻接候选，不可误投影为桥动作。不可将原版任意脚本当可执行输入，MapAction 仅保存被明确证明且合同允许的狭义事实。

`projectedD0Passable` 静态知道 passage/priority，不知道桥层/Neutral/player state；Map21 已审计三条 PBS 连接与 7 条输出 edge，**没有已证实误删**。67 个 Bridge 格 D0=false 仅为条件性风险；`21,E,77,47` 的零边来自几何越界。传送源/目标必须分别带 mapId 和图块引用。只有确定不依赖动态状态的事实可静态过滤，状态相关判断留 Runtime，字段细节待 C-03 冻结。

## 5. Map21 路线与 Map47 跳跃：静态片段不是整体验收

Map21 §15.3 已生成从 Map7→21 目标落点 `(19,76)` 向四组桥头陆地侧 BFS 的静态路径，以及 Off→On、On→Off 等单独重放片段。**仍缺 E2E-21**：当前代码没有将 BFS 终态接入 Off→On 段的初态，而是将桥带初态重新设为 bridgeLevel 0；`traceStep.transfer=null`，真实跨图 edge 也不在同一次模拟中执行。因此分段 `continuous=true` 不能证明整段 Map7→真实 Bridge-tagged deck→离桥→返程的状态/事件完全连续。待把连接、BFS、桥带、桥面、折返合并逐步 replay，并另用 RGSS 动态日志核对；详见[复核 §3](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)。

Map47 静态计得 30 Ledge 格，合法样本 `(16,9)` 面朝下越过 `(16,10)` 落到 `(16,11)`。原版应先成功进行面前普通方向检查，再按有效 Ledge 规则一次 `jumpForward(2)`，最终由 `jump` 检查落点。中间格不能当第二次普通 walk，也不能自动触发其中间 step；原版动态弧线/相机、跨图跳跃和中间事件实物样本未验证；实际地图没有该类样本时只允许有明确标记的合成测试。未知命令 404 必须保留并核对其适用语义，不能默认为安全忽略。

## 6. Motion/深度必须同一协议

现有 walk Runtime 在动作开始提交逻辑目标位置并发布人物/相机 motion；Runtime/Browser 多处硬编码 250ms。冻结 kind/from/to/duration/单 motion ID、scene/visual epoch、逻辑位置提交/动画结束、人物帧/跳跃弧线/相机、resize/切图/取消/乱序/坏包的 producer-consumer 与原子状态矩阵；Browser 只校验与呈现，不读 TerrainTag 作决策。

bridgeLevel 变化即使坐标和 camera 静止，也必须使桥面 depth 缓存失效，并与人物投影在同一次 RenderDomain 更新中提交和接收，不通过全局抬高玩家 z-index 遮住屋檐/树冠，也不把地图业务状态存入 Hostra。

## 7. 交付顺序与资格

当前取证器 REVIEW-01～04 的静态修复、Map7/21/47 记录、**E2E-21 统一静态 replay** 及合成 fixture 已提交；**不是正式行为闭环**。后续：原版 RGSS 动态逐帧（BLOCKED 直至有 Game.exe）→ 许可与 CI run 签核 → reviewer 签 `CONTRACT_V1` → 才授权 AG-01～04。

旧 18 pass、本次本地 Agent 36 pass、CI skip 和原版玩法验收是不同概念。任何实施 PR 尚未开始；六道 FG 均 OPEN，状态 **NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。
