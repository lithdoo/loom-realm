# Terrain Behavior：最小架构设计（Essentials v21.1）

> **DESIGN BASELINE FOR IMPLEMENTATION / NOT FORMALLY FROZEN / NOT IMPLEMENTED / BEHAVIOR QUALIFICATION PENDING**。用户已授权从准备转入开发。实施准入、PR 完成条件与必须使用的产品端到端验收以[实施交付合同](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)为准；[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md)分配 PR；[候选合同](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md) C-01～08 提供字段级设计；[门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md)仅管正式原版行为资格，六 FG 仍 OPEN。当前设计不是已经存在的 TypeScript API，也不宣称已获 RGSS 动态证据。

## 1. 范围与数据流：一个状态中心，两项纯查询，一种运动协议

```text
原始固定 Essentials v21.1 Map/Tileset/Event/PBS（合法本地只读）
 → tools selective importer（白名单、精确 fail-closed）
 → prepared FSDB → M12 Content 校验
 → map-owned resolveEffectiveTerrainTag 与 evaluatePassability（分离）
 → 一输入一 MovementPlan：blocked | walk | jump
 → map Runtime 唯一拥有 mapId / position / direction / bridgeLevel / 事件 / motionId
 → 同次 RenderDomain 提交 tile depth + player + 必要 viewport/camera
 → map-owned Browser 校验/播放，不决定碰撞或地形
```

不引入插件、外部 handler、行为 DSL、通用 RMXP/Ruby 解释器；不硬编码地图/事件/tile IDs、不改原版 passages、不把玩法下沉 framework/Renderer/Hostra、不扩充初始输入 `{mapId,x,y,characterName}`。**可扩展性由内部清晰数据边界和判别联合类型提供，不靠预建框架。**

范围仅给 Neutral(13)、Bridge(15)、Ledge(1) 额外行为，其余 TerrainTag 0～17 原值保留但不承诺水/冰/草等完整玩法。Map7 Bridge 限定负例；Map21 93 tag15 格、八 Bridge 事件正例；Map47 30 Ledge 格正例；Map27 非桥正例。`SOURCE-PROVEN`（源码）、`FSDB-OBSERVED`（带 SHA 的文件）、`STATIC-INFERRED`（JS replay）、`PRODUCT-OBSERVED`（实际 LoomRealm）、`DYNAMIC-OBSERVED`（原版 RGSS）绝不能混用。

## 2. Producer/consumer：只增加确需的结构

原版 `RPG::Tileset.@terrain_tags` 作为按 tileId 索引的 1D Table 添加到现有 `struct.Tileset`，**保留 `id,tileset_name,autotile_names,passages,priorities`**；三个 tile-index Table 的形状、长度、索引与 tag 0～17 范围严格校验。旧五字段数据由显式 migrator 和新 schema subject 处理，不能 Runtime 默默补空值，也不能改写 M14/M15 历史 ledger。正反例见 C-01。

MapTransfer 已有 `id/steps/contacts/edges`：源格与目标格分别带自己所属 mapId，静态 producer 只过滤可独立确定的无关事实，桥层/Neutral/player 动态状态交 Runtime 决策；Map21 67/93 tag15 D0-false 只是潜在误过滤风险，**没有证据证明当前真实 transfer 已误删**。MapAction 仅投影可从 v21.1 原始页面严格识别的 On/Off 狭义事实，保留事件占用/触发/页面依据；不 eval Ruby，关联不确定性以 map/event/page 精确失败，不因无关 NPC 让整个地图报错。新增数据结构必须在 AG-01 中完成 Content/schema/consumer 的同 PR 流通与测试。

`resolveEffectiveTerrainTag` 解读标签，`evaluatePassability` 独立处理逐层 passage 和 priority：非空 tile 的 None(0) 仍可能阻挡；Neutral(13) 只跳过当前图层继续下层；NoEffect(17) 不是 Neutral；Bridge(15) 在 bridgeLevel=0 跳过桥面层，在 bridgeLevel=2 考虑桥面 passage；方向 `2|4|6|8` 的源格/目的格反向检查、越界/缺数据都要明确。`0x40` bush、`0x80` counter 属 passages，不能当方向或新的 TerrainTag。Ledge 判断是移动计划分支，不允许把普通 passage 查询里偷塞动画。

## 3. 时序与状态：先判通行，再启动事件，后执行脚本

v21.1 源码已证明 `move_generic` 先做通行：失败走 front touch，成功执行 walk 或合法 Ledge 跳跃，到达满足条件后 `here` start；`Game_Event#start` 只设置待执行标志，不等于脚本即时执行。`over_trigger?` 除图形/through/hiddenitem，还要求占用区域内至少一格 `map.passable?(x,y,0,player)`；Map21 八事件 bridgeLevel=0/2 计算为 true 属**静态预测**，不是空图形天然 walk-on，也不是原版逐帧观测。

Runtime 唯一拥有 `bridgeLevel`：本 slice 初始 0，允许 `{0,2}`，On **execute** 后 2、Off **execute** 和 transfer 后 0。碰撞与渲染消费同一版本状态；单次输入不能先执行 On 再重新判定同次通行。事件 `start`、`execute` 分开记录，解释器 busy、held input、size 重复触发、多事件顺序与取消都需要确定的**产品策略和测试**；RGSS 时点缺失标 `PROJECT-DECISION-PROVISIONAL`，可实施但不得写原版精确一致。

转图需要原子地清桥、运动、事件 pending、过时 timer/回调并更换 sceneEpoch；目标地图缺失/越界要走明确错误和回滚，不允许半切场景。非相关事件不会驱动桥脚本；未知相关页面失败范围须精确且可解释。

## 4. 一个运动协议，逻辑与视觉不分家

现有 Runtime/Browser walk=250ms 是**产品现状**，并非 jump 时长证据；现有 initial params 只有四字段。PR2 冻结 `blocked|walk|jump` 的判别联合类型，但只实施 blocked/walk；PR4 真正实施一个 `jumpForward(2)` 计划，逻辑位置跳过中间格、只在落点到达触发一次事件，不拆两次 walk 或两段动画。原版逻辑/图形差异未实测则标来源和暂定设计值。

Runtime 产生唯一 motionId、sceneEpoch/visualEpoch、数值 duration、from/to、相机数据，Browser 只执行 motion，旧 completion 不得复活前一动作。jump 的 duration 必须是**数值单一来源**，禁止将合同候选里的 `'UNVERIFIED-pending-RGSS'` 类型文字传进产品 payload。行走期间输入、resize、取消、transfer、过期通知须有一份共同状态矩阵和对应负例。resize 同次更新人物+viewport；切图 replace 并递增 epoch；Bridge level 在原地切换必须刷新 tile depth 与人物而非只修改全局 z-index。

共享 Runtime/Browser 的 AG-03、AG-04 不可盲目并行；先在一个代码 PR 里通过测试固定共同 on-wire，再让下一 PR 消费或按明确版本更新。Browser 不读取地形来重新判方向、落点、桥层。

## 5. 地图事实、取证与产品 E2E 的准确分界

[证据 §16](./TERRAIN_BEHAVIOR_EVIDENCE.md) 已补正旧 §15.3 的分段问题：一个 `replayWorld` 从 Map7 `(40,0)` 的**物化边**进入 Map21，走四组 Off→On→真实 tag15 桥面→下桥/折返→反向 transfer，独立检查物化边成员、邻接与 tag15；**E2E-21 统一静态回放已完成**。旧 `map-route-trace.mjs#traceStep.transfer=null`/`buildMap21BridgeRoutes` 只作为局部探针，不能再写“E2E 尚未拼接”，也不能把统一静态 replay 当原版 RGSS 动态日志。独立核对器没有重算 `over_trigger?` 或帧时序。

Map47 静态报告 30 合法跳、逆向 0；`(16,9)→(16,11)` 是原始样本。404 是 `show-choices-branch-end`，位于 EV007/EV013、不是 Ledge 图块上的动作；真实样本缺少的边界、落点阻挡、中间事件以**原创合成用例**覆盖，明确与 FSDB 区分。跨图 jump 本 slice 不支持，不可把全部 tag1 格当作无条件跳跃。

GitHub [CI 35499617524](https://github.com/lithdoo/loom-realm/actions/runs/35499617524) on `5b550b4` 为 100 pass / 0 fail / 6 live skip；本地 Agent 记录有 FSDB fixtures 106 pass、map 78 pass，都是**实施之前**的证据。原版 RGSS `Game.exe` 未在本机提供，合法真图 CI 再分发许可也未取得。不得把 skip 记 PASS，不得因此阻止 AG-01 开发。

## 6. 交付与不扩范围原则

[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md)按 AG-01 数据→AG-02 语义/walk→AG-03 Bridge→AG-04 Ledge 串行集成。每 PR 实际合成测试、合法本地真实地图对照、受影响旧回归和对应 SHA 的 CI 必须通过；最终用**真实 LoomRealm Runtime+Browser**演示 Map7→Map21 桥上/桥下/四组、Map47 一次 jump/逆向/落点及相机/depth，且普通 walk/transfer/resize 不退化。不能以 forensic CLI 或协议草稿代替功能测试。

开发期间 ABI 或产品策略与证据冲突，局部修复、补测试、记录选择；只有破坏性公共 ABI、许可或超出明确 slice 的问题才向 owner 请求决定。不重开整体取证，不伪造原版保真。产品验收后可记 **`IMPLEMENTED / BEHAVIOR QUALIFICATION PENDING`**；六道 FG 真正签核后才记 **`CONTRACT FROZEN / QUALIFIED`**。
