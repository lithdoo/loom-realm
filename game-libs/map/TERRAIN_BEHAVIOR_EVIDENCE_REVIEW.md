# 地形行为证据复核：Map 7 / Map 21 的已知限制与修正门槛

> 状态：**Review / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 对取证提交 `5e71c7e14c21da75f9387cc94776682f723ddf37` 进行后续源码交叉复核。本文件是**纠错说明**，不是新一次本地 FSDB 扫描或原版 RGSS 动态验证。原始记录见 [TERRAIN_BEHAVIOR_EVIDENCE.md](./TERRAIN_BEHAVIOR_EVIDENCE.md) §14；其中被本文逐项指出的过强断言，在修复并重跑前**不得作为冻结依据**。本轮只修文档，不修改取证器或测试，不宣称新测试 PASS。

## 1. 地图职责、已记录观察与证据等级

| 地图 | 职责 | 现有记录及有效范围 | 仍待证明 |
|---|---|---|---|
| Map 7 Cedolan City | Bridge 负例、普通门/地图连接回归 | Agent 记录 11 events / 19 pages / 521 commands；当前工具报告 tag 15 格=0、直接桥候选=0；这是指定本地素材及**已扫描入口内的观察** | terrain_tags 严格 shape/负 tile ID、路线解析失败、Common Event 递归候选传播等边界须修复后重跑；不能无限定宣称排除所有间接调用 |
| Map 21 Route 2 | Bridge 正例 | 本地 Agent 记录 93 Bridge 格、8 个直接 `pbBridgeOn/Off` 事件及 2 个邻接进化事件；完整结构化记录和来源指纹见原始证据 §14 | 八个事件是否实际满足 `over_trigger?`、完整逐格路线、动态事件帧、提取器严格性；不能称完整行为已签核 |
| Map 47 Route 7 | Ledge 正例 | 尚未完成本轮路线取证 | 精确起点、方向、落点、阻挡和中间事件 |
| Map 27 Day Care | 排除的误认样本 | 不是桥正例 | 不得代替 Map 21 |

证据等级：`SOURCE-PROVEN` 仅表示**具体源码分支和条件**已证；`FSDB-OBSERVED` 为带 digest 的本地抽取记录；`STATIC-INFERRED` 为未实际逐格/逐帧验证的推导；`DYNAMIC-OBSERVED` 必须有原版运行日志；`UNVERIFIED`/`INCOMPLETE` 不能用作通过项。此前 18 pass / 0 fail / 0 skip **仅为本地 Agent 在旧提交记录的结果**；此次文档修订没有独立重跑，本提交不能沿用旧结果宣称修复通过。CI 无本地 FSDB 时 live 测试可能 skip；skip 不是 PASS。

## 2. 四个仍未解决的审查缺口（以前的“已完成”声明按本节收窄）

### REVIEW-01 / P0：walk-on 桥头触发是有条件的，尚未逐事件证实

v21.1 `Game_Event#over_trigger?`：若角色图形非空且 `!through` 则 false；若 hiddenitem 则 false；否则对每个占用格调用 `map.passable?(i,j,0,$game_player)`，**至少一格为 true 才返回 true**。`Game_Player#check_event_trigger_here` 在玩家到达且事件 `over_trigger?` 时才 `start`；`check_event_trigger_touch` 的失败分支反而跳过 `over_trigger?` 事件。来源：固定 tag v21.1 `Data/Scripts/004_Game classes/007_Game_Event.rb` 的 `#over_trigger?`、`008_Game_Player.rb` 的 `#check_event_trigger_here/#check_event_trigger_touch/#update_event_triggering`、`004_Game_Map.rb` 的 `#passable?/#playerPassable?`。

原始证据 §14.5～14.6、设计草案、计划与门禁把八个空图形 `size()` 事件**直接定性为必然 walk-on / SOURCE-PROVEN**，超出了当前证据。正确结论：空图形和 `size()` 只说明它们**有资格进入 over-trigger 判断**；是否在指定初始 `bridgeLevel` 下为 true，必须对八个事件的每个占用格逐层检查原版 `map.passable?(x,y,0,player)`，包括地图有效性、图块、优先级和桥状态。方向 `d=0` 在原版分支的实际含义不能猜；源代码可证明条件，不能在条件未算前证明结果。

**验收**：输出 `mapId/eventId/page/occupied(x,y)/bridgeLevel → passable?(...,0) → over_trigger? → here/touch 分支` 矩阵；每个 On/Off 至少桥上/桥下所需状态，并提供源码位置与可验证调用路径。若无法静态复刻整条原版规则，就标 `STATIC-INFERRED/UNVERIFIED`，原版动态日志可补证。修复后才允许把某事件的触发方式升级为已证结论。禁止用“空图形 ⇒ 必定 walk-on”或“撞一下 ⇒ 切桥层”代替矩阵。

### REVIEW-02 / P1：扫描 `COMPLETE` 仍可能误报

当前 `collectBridgeCells` 检查 Map.data 的维度与 values 长度，但没有同等核验 `terrain_tags` 的 dimensions、`ySize/zSize` 与 values.length；放置图块 `tileId < 0` 被 `tileId <= 0` 路径静默跳过（`0` 才是空图块）。`extractMoveCommandScript` 生成的 `decodeError` 未汇入 `scanCoverage.unverified` 或 `collectMapEvidence.completeness`。另须追查缺失或不合法的 355/655、209/509 参数是否能悄悄得到空脚本文本。

**验收**：Map.data 必须合法 3D x/y/z；terrain_tags 必须合法 1D、实际值长度与声明一致，tile ID 必须是合法索引（只有 `0` 可当空），任何无法完整扫描的移动路线/参数错误均使整次负结论 `INCOMPLETE` 或严格模式失败；不准同时给出 `provenNegativeBridge=true`。添加 bad dimension、短 table、负 ID、move-route decodeError、脚本坏参数测试，再用原素材重跑 Map 7/21 和 corpus。此前文档的 `COMPLETE` 只代表旧校验器返回值，**不是以上缺口已验证**。

### REVIEW-03 / P1：嵌套 Common Event 的桥命中没有回传到祖先

`walkCommonEventGraph` 能访问 A→B→C，但当前 `bridgeIds` 仅收集**自身**带桥脚本的事件 ID；`classifyCandidates` 检查调用页面的**直接** 117 参数是否属于该集合。例：地图 Event → Common A → Common B（脚本 `pbBridgeOn`），地图事件只调用 A 时，可能漏掉桥候选。全局 `commonBridgeIds` 的并集不等于“所有祖先可达桥脚本的集合”。

**验收**：为每个 Common Event 计算传递闭包或自下而上的 `canReachBridge`，返回完整调用链；递归环、失踪 ID 和不透明动态调用分别处理，不吞掉异常；加 A→B→bridge、A→B→C、循环、有无桥等端到端候选测试，并检查 corpus 全图结果。本轮**未证明**现有 Map 7/21 数值被该漏洞改变，不得凭空改写 ID 数字。

### REVIEW-04 / P1：传送审计不能把其他地图目标坐标当本地图坐标

`auditMapTransferAgainstFacts` 中 `incomingEdgesOntoBridge` 将当前 `MapTransfer/21.json` 的 `edge.targetX/targetY` 与**Map 21** 的 `bridgeCells` 比较，漏了 `edge.targetMapId`；这些边的目标坐标属于其他地图。`localEdgesFromBridge` 使用本地图源 `edge.x/y` 的比较对象才匹配本地图空间。

**验收**：源端风险按 sourceMapId + source x/y + 本图 bridgeCells 判断；目标端风险按 targetMapId 加载并验证**目标地图** Bridge 格，缺目标地图时明确 `INCOMPLETE/UNVERIFIED`；附两个地图相同坐标但只有一个有桥的反例。Map 21 已记录 7 条 edge、0 step/contact 与“67/93 桥格 D0=false”仅表明潜在过滤风险；**未证实有因 D0 导致的真实传送记录误删**。`21,E,77,47` 的几何越界须与 D0 问题分开。

## 3. 路线完整性：已有四组只是关键点草图，不是可重放 trace

原始证据 §14.6 的 `(19,47)→(20,47)` 等序列和组 D `(14,70)` 是 `STATIC-INFERRED` 的示例。Map 7 北缘连到 Map 21 南缘的入口记录为 `x=19–22`，**入口到 (14,70) 的实际连续路径缺失**。其余四组也缺每一步的源/目标双向 passage、当前桥状态、是否命中事件及事件完成时间；不能将“继续走到某簇”当作已验证路线。

**验收**：从真实连接或明示的合法测试初始状态开始，为每组写连续方向输入逐步表：`mapId, before(x,y,dir,bridgeLevel), input, source/target passable, after(x,y), eventId/page, start, interpreter execute, bridgeLevel, next-input availability, edge/transfer`。路线中每一步有固定 v21.1 源码/地图图块证据；无法静态给出就列出待 RGSS 实测步骤。阻挡、折返和长 size 带重复启动也不得仅凭口头推论。动态报告须留输入/帧日志，不得补造。

## 4. 受影响文档和冻结门禁

本文件对原始证据 §14.5 中“因此八事件是走上之后启动”“失败 bump 不会 start”、§14.6 的公共时序与四组路线，以及设计/计划/冻结门禁中同等的**无条件断言**提出明确纠正：源码证明的是条件分支，**最终 walk-on/bump 归类待 REVIEW-01 矩阵**。原始命令、来源 SHA、地图坐标和脚本文本作为历史观察保留，不因本审查直接推翻；只有重新运行取证器才更新源观察和测试计数。后续 Agent 必须先处理 REVIEW-01～04 及路线逐格验证，再将修正结果直接回填原始证据和设计/计划，消除双事实源；不允许仅引用本审查而默默保留相反的实现合同。

- **FG-01 OPEN**：Map 7/21 旧扫描结果保留为待严格复核观察；Map 21 触发和连续路线未闭；Map 47 未取证；原版逐帧缺失。
- **FG-02 OPEN**：跨图 transfer 坐标审计和动态过滤合同未闭；仅潜在 D0 风险，非已证实误删。
- **FG-03 OPEN**：先行通行/事件 `start` 的源码分支可用，但 `over_trigger?` 的具体状态值和解释器时刻尚待逐例确认。
- **FG-04 OPEN**：Runtime/Browser motion/depth 字段未冻结。
- **FG-05 OPEN**：本地旧测试 18/18 是历史记录；当前缺新负例测试、合法可分发 fixture、CI 复跑。
- **FG-06 OPEN**：尚无唯一已签核合同和 Agent 实施交接。

状态继续 **NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。下一次任务是**纠正取证器+重跑+回填真实证据和逐格路线**，之后再做 Map 47；本次没有修改玩法、取证器、测试或原始 FSDB。