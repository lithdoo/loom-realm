# Terrain Behavior：实施准入与端到端交付合同

> **IMPLEMENTATION AUTHORIZED / PRODUCT IMPLEMENTED / BEHAVIOR QUALIFICATION PENDING / NOT FORMALLY FROZEN**。AG-01～04 已在 `feat/map-terrain-behavior` 落地为真实 importer→Content→Map→Runtime→Browser 链。schema：`struct.Tileset/v2-terrain-tags`（subject `map-tileset-terrain-tags-v1`）、`struct.MapAction/v1-bridge`、motion ABI `map-motion/v1-walk-jump-bridge`。walk=250ms 为既有产品事实；jump `JUMP_DURATION_MS=400`、`JUMP_PEAK_RULE=distancePx * 3 / 8` 为 `PROJECT-DECISION-PROVISIONAL`。FG-01～06 与 CONTRACT_V1 仍未签核，不得称为原版逐帧保真。审查起点：`62938013103b94c3b69786b66216440b1d49fb1c`；本轮工作基线 `d6e3f5961fa7293fe89971f749904941d02315b4`。
>
> 规格细节：[合同候选](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md) C-01～08；历史事实：[证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) §15–16、[复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)；[设计](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md)；[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md)；[门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md)。冻结准备 FZ-00～06 和 [Issue #42](https://github.com/lithdoo/loom-realm/issues/42) 是**历史与最终原版保真资格证据**，不再是实施准入阻断器。

## 1. 三种状态不能混淆

| 判定 | 现在 | 改变条件 |
|---|---|---|
| **实施准入** | **AUTHORIZED**：只限本页的 AG-01→04、Map/Tools/Content/自有 Browser 具体范围 | 用户已授权；每 PR 固定基线及接口/测试；不要求预先取得原版 Game.exe、真图 CI 再分发许可、六道 FG PASS |
| **代码交付** | **IMPLEMENTED**（产品 E2E 与合成/真图对照测试已绿；合入主分支以实际 PR 为准） | 四个纵向 PR 各自合入、真实产品端到端通过，回归及当前代码 SHA 的 CI 有证据后，才称已合入主分支 |
| **原版行为资格／正式冻结** | NOT QUALIFIED / NOT FORMALLY FROZEN | 原版动态对照、素材许可范围、授权 reviewer 对 FG/DEC 签核全部如实满足后另行升级；CI live skip 仍只是 skip |

**允许开始编码 ≠ 允许标 FG PASS；没有 RGSS 不意味着禁止构建 LoomRealm 可验证的产品功能。** 对无法从源码、FSDB、现有产品代码确定的帧数或调度策略，写明 `PROJECT-DECISION-PROVISIONAL`、来源和可替换点，建立产品测试；不得称 `DYNAMIC-OBSERVED`。原版环境日后可用时对比差异并开限界修正，不倒逼预开发无限取证。

## 2. 最小架构与唯一状态所有权

```text
原始 v21.1 Map/Tileset/Events/PBS（只读；本地 SHA 验证）
    ↓ selective importer（白名单、精确错误、合法合成 fixture）
prepared struct.Map / struct.Tileset / struct.MapTransfer / narrow struct.MapAction
    ↓ Content 校验与版本化
map-owned 纯查询：effectiveTerrainTag 与 passability（分开）
    ↓ movement planner：blocked | walk | jump（一输入一计划）
map Runtime：坐标、方向、bridgeLevel、事件 start/execute、motionId 唯一权威
    ↓ 单次 RenderDomain 更新：人物 + 相机 + 地形深度（同一状态／epoch）
map-owned Browser：验证并播放已给出的 motion，不决定通行／桥状态
```

不动原版 passages；不更改初始输入 `{mapId,x,y,characterName}`，除非有单独明确的向后兼容审查。TerrainTag 原值 0～17 全部保留，本轮只赋予 Neutral(13)、Bridge(15)、Ledge(1) 额外行为，None(0) 与 NoEffect(17) 不等于 Neutral。`struct.Tileset` 原有 `autotile_names` 必须保留；新 `terrain_tags` 以**新增 schema subject + 显式迁移**交付，禁止向历史 M14/M15 ledger 回填虚假资格。

不按 Map/event/tile ID 写运行时分支；不执行原始 Ruby；不建通用事件解释器、TerrainBehavior 插件/DSL；相关未知事件按 map/event/page 精确 fail-closed，不让无关 NPC 使整图不加载。所有动态状态相关的连接/通行不得在 importer 用静态 D0 错误删去；Map21 真实误删**尚未证实**，不得制造修复故事。原始 rxdata/PBS/完整事件转储和未授权派生物不进入仓库。

## 3. 共享 ABI 最小先行决策：AG-01 必须固定，AG-02 消费

在首张 PR 中把候选 C-01/03 和各 producer-consumer 的**实际字段差异**落成版本化的 TS/JSON 正反例、错误码、迁移测试；PR2 开始前由代码 reviewer 核对 PR1 已合入的类型，而不是等待 RGSS。AG-02 须把 `MovementPlan` 的 blocked/walk/jump **完整判别联合类型与序列化样例**在合约测试中固定，但 PR2 仅执行 blocked/walk，绝不以两次 walk 假装 jump。AG-03/04 在共享 Runtime/Browser 改动前对同一个 motion 与事件时序 ABI 做一次联合评审并固定版本；**每 PR 仅一个版本化共同协议，不维护两套并行适配或通用兼容层**。

必须明确以下相互影响的时序，不用天然默认值掩盖空缺：`can_move → blocked/front touch` 或 `can_move → walk/jump → arrival → event start → interpreter execute → bridgeLevel → next input`；held input、重复 size 触发、一次事件调度多个候选、切图、resize、取消、旧 motion completion。原版未实测的分支选最小且确定的**产品策略**，在 PR 描述中列 `assumption / deterministic decision / test / future RGSS comparison`；不要阻挡 PR1/2，PR3/4 在集成前必须有明确策略和测试。

运动状态唯一由 Runtime 持有；`motionId` 随新动作递增，`sceneEpoch` 随切图，`visualEpoch` 随需要失效的画面版本变化；陈旧完成包与旧帧禁止改变现态。切图/取消须清理未完成运动、解释器待处理动作及旧定时器，避免同一输入跨场景二次触发。Bridge level 切换时即使玩家坐标不变，也要在**一次 RenderDomain 原子更新**中刷新 player/depth/必要 viewport；不得靠玩家永远置顶掩盖树冠/屋檐。Browser 不自行读地形来决定动作。

**Jump 时长**：目前既有 walk=250ms 是产品代码事实，不能自动推出 jump=250ms。AG-04 在 Runtime 与 Browser **同一常量或同一 payload 字段**确定暂定项目时长、弧线、相机和完成回调；附测试与 `PROJECT-DECISION-PROVISIONAL` 标识。原版时长未证不得写“原版精确”；不要把 `'UNVERIFIED-pending-RGSS'` 字符串作为真正的数值 durationMs 发送到 Browser。

## 4. 四个按依赖推进的纵向 PR（每张 PR 可独立验收）

| PR | 仅交付什么 | 本 PR 必过（阻断合入） | 不能借口阻断编码 |
|---|---|---|---|
| **AG-01 Data / importer** | `terrain_tags` 六字段 Tileset、显式旧记录迁移、新 schema subject、狭义 MapAction producer/validator、MapTransfer 状态相关连接保留、Content 读写契约 | source→prepared→Content→map consumer 合成用例、旧 fixture 回归、非法 Table/事件 fail-closed、Map7/21 真源本机可用则比较、CI 合成绿；既有 `autotile_names`/传送不退化 | 等原版逐帧或真实素材 CI 再分发许可 |
| **AG-02 Semantics / walk** | map-owned 两个纯查询、Neutral/Bridge 0/2 逐层及双向规则、blocked/walk planner 与 Runtime 最小接线；冻结 jump 数据形状但不执行 | Table/方向/边界/有效标签与通行分离的矩阵，Map7 普通连接、现有 250ms walk/resize/transfer 回归、map package CI | 等 Bridge 事件或 jump 动画实现 |
| **AG-03 Bridge vertical** | MapAction 事件占用与启动/执行检查点、bridgeLevel 与切图清零、桥上/桥下规则、同次 depth/player 投影、自有 Browser 必需更新 | Map7 负例 + Map21 四组 On/Off/真实 tag15/返程，held input/重复触发/失败触碰、事件时序产品策略、静止切层 depth、取消/旧包及产品端到端；如本地有 FSDB，真实输入 SHA 与静态 E2E-21 对照 | 无 Game.exe 时产品可验证功能照做，原版帧精度单独保持待资格 |
| **AG-04 Ledge vertical** | 有效前方判断、合法落点、一次两格 jump、完整数值 motion payload、Browser 弧线与相机/resize/取消 | Map47 `(16,9)→(16,11)`、30 真实静态样本本地对照、逆向/起点/落点/边界/中间事件合成负例，单 jump ID/一到达事件、旧 walk/Bridge/切图回归、产品动态演示 | 原版时长未知：暂定项目值并明示，不阻挡实现 |

AG-01→AG-02→AG-03→AG-04 **顺序集成**；AG-04 的纯 planner 可在 AG-02 后先准备，但共享 Runtime/Browser 的 AG-03/04 不能并行盲改。每 PR 附 `actual base SHA / changed schema or ABI version / paths / assumptions / acceptance command+exit+pass-fail-skip / CI run+SHA / rollback`。只有该 PR 所有**可在当前环境运行**的新增和受影响测试通过才合入；真实素材缺失应标局部 skip 或 BLOCKED，不得算 PASS；未完成必需产品集成测试不得标 PR DONE。

## 5. 两层闭环验收（不新增独立框架）

**每个 PR 的本地闭环**：源数据或手写合成输入→校验/纯规则→Runtime→RenderDomain→Browser（按该 PR 已覆盖路径）→断言→受影响旧回归→相关 CI→代码评审；不要求 PR1 已有 Browser 行为。错误路径必须有反例：非法数据、缺字段/事件、不可通行、缺转图目标、桥层切换中 resize/cancel、过期 motion、跳跃落点阻挡。禁止只比较 tracer 与 tracer 的输出；静态 E2E-21 独立核对器的边成员/邻接/tag15 范围要保留，且不宣称核对过逐帧。

**功能交付闭环（四 PR 合流后才可宣称 IMPLEMENTED）**：从本地合法 Map7 出发实际产品转入 Map21，四组 On/Off、桥面/桥下与折返、切图关桥、事件触发次数及画面深度；Map47 前方合法两格跳、非法逆向/落点/边界；静止层变时人物与桥面/相机一致，无残影、卡键、重复事件或旧 motion 包；Map7 无桥行为与已有 M14/M15/地图布局/旧 Transfer 回归不退化。至少一次以**真实产品 Runtime+Browser**完成输入→可观察结果，不可用只读 forensic CLI 代替。提交可复现脚本、观测结果/截图或日志、测试 SHA、CI run；有合法本地 FSDB 即本地运行，不要求将其上传。

**附加原版保真资格**：有合法 RGSS 再对比帧、held input、事件解释器、jump 时长；有素材权利依据再扩展 CI live。若没有，准确记 `BEHAVIOR QUALIFICATION PENDING`，但不撤销已经通过的产品实现/合成 CI。是否需要调整正式 FG 条款由 owner/reviewer 另行批准；不自动将六 FG 变 PASS。

## 6. 本次明确的 Done/Stop

- **可立即开始 AG-01**：本文件 + CANDIDATE 提供开发基线；无需先产出 `CONTRACT_V1`、RGSS 日志或许可批准。`TERRAIN_BEHAVIOR_FREEZE_READINESS.md` 保留六 FG 原版资格门禁但不管理实施准入。
- **单 PR 暂停条件**：当前代码/数据与候选字段直接矛盾而导致可能破坏已有行为、未知相关事件无法安全投影、产品测试实际失败、安全或许可问题。限定受影响 PR，先修/写最小可复现反例，不重新启动全项目取证。
- **功能 Done**：四 PR 与实际产品 E2E、反例和回归在当前环境全绿，文档依实际 API 和测试结果更新；无 RGSS 时只能叫 `IMPLEMENTED / BEHAVIOR QUALIFICATION PENDING`，不可宣称原版逐帧复刻或正式 CONTRACT FROZEN。
- **避免重复确认**：Agent 在上述边界内自行做最小可逆技术决策并记录，不逐卡要求用户确认；仅当必须更改项目范围、分发授权或破坏性公开 ABI 且无兼容方案时才请求明确决策。

## 7. 本轮已落地的实际 API 与产品策略

| 项 | 实际值 |
|---|---|
| Tileset schema | `struct.Tileset/v2-terrain-tags`，subject `map-tileset-terrain-tags-v1`；旧五字段只经 `migrateLegacyTilesetRecord` |
| MapAction schema | `struct.MapAction/v1-bridge`；字段含 `occupied`/`through`/`emptyGraphic`/`op`；无关 NPC 省略，相关不透明进 `opaqueRelated` |
| Motion ABI | `map-motion/v1-walk-jump-bridge`；walk durationMs=250；jump durationMs=400、peakPx=`distancePx * 3 / 8`（`PROJECT-DECISION-PROVISIONAL`） |
| Queries | `resolveEffectiveTerrainTag` 与 `evaluatePassability` 分离；`planMovement` → `blocked` \| `walk` \| `jump` |
| Runtime | 唯一 `bridgeLevel ∈ {0,2}`；On execute→2，Off execute 与 transfer→0；非法值 fail-closed |
| over_trigger | `through===true` 或（`emptyGraphic` 且格子通行）；空图形不是自动 walk-on |
| 事件策略 | 到达后 start/execute；同一 size 占用带不重复 execute；execute 后本检查点不消费 held 键（下一次输入） |
| 注释命令 | 108/408 在 confirmable 桥页面视为可忽略（`PROJECT-DECISION-PROVISIONAL`） |
| 跨图 jump | 落点越界 → `blocked`，不拆两次 walk |

原版 RGSS 逐帧、真图 CI 再分发许可、FG 签核仍为 `BEHAVIOR QUALIFICATION PENDING`。
