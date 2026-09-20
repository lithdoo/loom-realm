# 地形行为系统：规格冻结门禁与 Agent 实施交接

> 状态：**Freeze preparation / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 多维度复核修订。本文管理从 [设计草案](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) 和 [实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 到可派单合同的门禁，**不是已冻结合同或已实现代码**。Map 7 事件已取证（负证据），见 [TERRAIN_BEHAVIOR_EVIDENCE.md](./TERRAIN_BEHAVIOR_EVIDENCE.md)。
>
> 已定架构：内部易扩展，不支持外部插件/handler 注册/DSL/通用 RMXP 事件解释器；`tools` 只导入，`game-libs/map` 持有业务状态与规则，Browser 只呈现。Map 47 Route 7 仍是悬崖样本；Map 27 Day Care 不作桥样本。**2026-09-20 Map 7 取证**：本 corpus 的 Map 7 Cedolan City **没有** Bridge 图块、也 **没有** `pbBridgeOn`/`pbBridgeOff` 事件，因此不能再把 Map 7 当作桥头正例。证据见 [TERRAIN_BEHAVIOR_EVIDENCE.md](./TERRAIN_BEHAVIOR_EVIDENCE.md)。

## 1. 冻结成功的可操作定义

实施 Agent 给定 `固定基线 SHA + 一份规范 + 原版证据 + 可取得 fixtures + 准确任务卡 + 现成验收命令`，不需猜测原版事件、决定跨模块 JSON/TypeScript 字段、发明 motion ABI、改变既有资格合同即可实施。**Freeze candidate** 是材料齐备待审；全部门禁有可复核 PASS 才能标 **Contract Frozen / Implementation Pending**；之后代码和资格另行验收。状态标签不能代替实际证据。

冻结后唯一规范性增量入口拟为 `TERRAIN_BEHAVIOR_CONTRACT_V1.md`（尚未创建）。证据索引为 [TERRAIN_BEHAVIOR_EVIDENCE.md](./TERRAIN_BEHAVIOR_EVIDENCE.md)，目前只有 Map 7 负证据，不是完整 FG-01。设计草案、实施计划与本清单仅作背景/执行跟踪，不应与规范形成双事实源。历史 M14 first-slice 仍按原适用范围有效，但现有实现增加了 `autotile_names`、拟增加 `terrain_tags`，必须依文档治理同步当前增量合同/相关设计导航与资格输入，不许追溯改写历史结论。

## 2. FG-01～FG-06：所有门禁仍 OPEN

| Gate | 必须交付及证明 | 当前 |
|---|---|---|
| **FG-01 原版事实** | 本地 FSDB 的 Map 7 每个桥头 map/event/page ID、坐标、页面条件和逆序选页、trigger、through、graphic、完整命令/缩进/参数/顺序；Map 47 固定起点和路线；v21.1 `move_generic`、event start/执行、jump 和渲染源码对应规则与测试 | **OPEN**：Map 7 子项已取证（负证据，见下）；Map 47 未取证；无动态 RGSS 运行。**整项不得标 PASS** |
| **FG-02 数据和导入契约** | Tileset 当前完整字段+`terrain_tags` exact Table/引用/迁移；`MapAction` namespace/schema；MapTransfer 静态筛选 vs Runtime 动态通行的审计及修正约定；无关事件排除、相关候选 fail-closed | **OPEN**：事件事实及精确 schema 缺失 |
| **FG-03 事件时序与状态机** | 通行成功/失败分支、touch `start` 与脚本执行时点、step/edge/transfer 冲突与 held input；桥数值状态初始/跨图/Frame 生命周期；NPC 碰撞可支持边界；失败/取消原子性 | **OPEN**：依 FG-01，旧“contact 先执行再立即重算”须删除 |
| **FG-04 运动及画面协议** | walk/jump exact ABI、两端所有 250ms 依赖、起终点/时间/ID/epoch/动画/相机、resize/切图/取消和 payload 负例；桥 depth 缓存失效与同更新一致性 | **OPEN**：还没有字段级双方确认 |
| **FG-05 验收可重放** | 来源和许可明确的最小真实派生 fixtures、生成步骤/指纹、Map 7/47 每步 expected、正反例、具体存在的测试入口；本地完整 FSDB 与 CI 覆盖差距 | **OPEN**：golden fixtures 尚未制作 |
| **FG-06 Agent 与资格交接** | 固定规范版本/base SHA、四张允许/禁止文件/依赖/测试/停工卡；M14/M15 正式 ledger vs 特定 SHA CI 结果、旧 Tileset 断言漂移、影响新资格 subject 的重跑策略；审查签核 | **OPEN**：任务卡与基线未冻结 |

没有全部可定位证据、实际审查结果和对应 fixture/代码测试，不得把任何一行从 OPEN 改为 PASS。现有 M14 ledger 曾记录 exact-local 旧字段断言失败及重新资格待完成；即使后续某个 PR SHA 的 M14 workflow 成功，也只代表该 workflow 在该 SHA 的结果，不能替换正式 ledger 的全面 Closed 判定，更不能证明未实现的地形行为。

### Map 7 取证子项（2026-09-20，已完成且有证据）

依据 [TERRAIN_BEHAVIOR_EVIDENCE.md](./TERRAIN_BEHAVIOR_EVIDENCE.md)，本地官方 FSDB 的 Map 7 Cedolan City 已完整扫描 11 个事件 / 19 页 / 521 条命令：

- **桥相关候选 = 0**（无 `pbBridgeOn`/`pbBridgeOff`，无事件名 Bridge，无 terrain tag 15 图块）。
- 事件只有门（player-touch + Transfer Player）和招牌（action-button 文本）。
- v21.1 `move_generic` 先判通行、失败才 touch `start`；`start` 只置待执行；`pbBridgeOn/Off` 存在于引擎但不被本图调用。
- `MapTransfer/7.json` 已有 32 条 door contacts 与 4 条边连接；**未证明** `projectedD0Passable` 在本图丢掉了桥出口（本图没有桥出口）。
- 本 corpus 已扫描全部 69 张 `Map*.rxdata`：**只有 Map 21 Route 2** 放置了 Bridge 图块（93 格）并含 `pbBridgeOn`/`pbBridgeOff` 事件（8 个已确认 + 2 个仅因邻接桥面列入的未确认进化事件）。Tileset 1/2/6 定义了 tag 15，但使用这些图块集的其他地图放置次数均为 0。详见证据文档第 13 节。这 **不能** 把 FG-01 标为 PASS。AG-03 若需要真实桥事件，须单独立项取证 Map 21，不得再假设 Map 7。

## 3. 强制纠正的三个 P0 设计矛盾

### P0-A：事件不能抢在通行前执行

旧版设计写“输入 → 检查面前事件 → 通行”和“contact 改桥层后立即重算同一次移动”；两者均不可作为冻结语义。原版 `Game_Player#move_generic` 先判方向可通，成功再选择 Ledge/普通移动，失败才检查面前 touch；`Game_Event#start` 是启动标记，不表示脚本同步执行。冻结合同 C-04 必须分开 `check → start → interpreter executes → state change → following input`。**Map 7 没有桥脚本，因此不能用本图确认桥层在哪一帧改变**；时序骨架以 v21.1 源码为准，逐帧仍需动态验证。现有 Runtime `ContactTransfer` 在通行前处理是**现存行为，不自动等于原版**；需明确保留/修正边界与回归。不得预设立即重算、重复触发或死锁特判。

### P0-B：导入器不得预先删掉状态相关传送

当前 `projectedD0Passable` 仅理解 passages/priorities，却被 `emitStep`、事件分类和 `expandConnection` 用来永久过滤传送。冻结 C-01/C-03 必须给出“可静态证明 vs 必须保留到 Runtime 判断”的判别表：Bridge、Neutral、动态页面、事件图形/through、跨图出口如何表示，何时过滤，何时触发；给出旧数据→新记录→运行结果的对照测试。只投影被证据确认为需要的事实，**不因无关 NPC/剧情事件失败整图**；已识别但不能保真的桥候选报 map/event/page ID/原因。若需要 NPC 阻挡落点测试，须真正投影对应最小事件碰撞信息；否则限制支持/断言，不可空口承诺。

### P0-C：运动、桥深度是一份同步协议

Runtime 和 Browser 在普通 walk 的 validator、启动、重入/resize、插值多处固定 250ms；不得只加 `kind: jump` 或放宽一个校验。冻结 C-06 覆盖生产/验证/消费全路径；jump 的 duration/弧线根据 v21.1 取证，不是两次 walk。`bridgeLevel` 改变即使人物和 camera 不变，也使包含桥面的缓存投影失效，桥 depth 与 player 数据通过同次 RenderDomain 更新、相同 scene/visual epoch 接受。不能全局抬高玩家 z-index，不能让 Browser 自行判断地形碰撞。

## 4. `CONTRACT_V1` 的必备章节（均需 exact types + 正反例）

| ID | 冻结到什么精度 |
|---|---|
| C-01 Data | `struct.Tileset` 的当前完整 keys、terrain_tags 的 RGSS 一维 Table 维度、长度、tag 0–17/非法值、tile 引用、旧 fixture/版本迁移、Content 不存在/不兼容错误；不能遗漏现有 autotile_names |
| C-02 Semantics | `resolveEffectiveTerrainTag` 和 `evaluatePassability` 各自签名与逐层顺序；非空 None 仍参与 passage、Neutral 只忽略本层、NoEffect 不等于 Neutral、桥上下、源格/目标格双向位和边界 |
| C-03 Event data | MapTransfer 与狭义 MapAction 身份、namespace/key、可识别页面/命令白名单、动态事实保留、重复/同格/缺记录/相关未知候选的严格规则，不执行 Ruby |
| C-04 Event order | 方向→通行成功/失败分叉→失败 touch `start`→真正执行与输入解锁；成功 movement→抵达事件/transfer；edge/held input/多事件优先级，既有 ContactTransfer 兼容决策 |
| C-05 State | `bridgeLevel` 数值、初值/范围/继承/转图/Frame 取消与新建、变更及图块重投影原子边界；禁止凭空扩展原四字段初始参数 |
| C-06 Motion | `blocked/walk/jump` exact MovementPlan、Runtime↔Browser payload；时长范围、时间源、motionId、scene/visual epoch、逻辑坐标时机、camera 与人物共享进度、跳跃峰值/帧、resize/replay/取消/切图/错误 |
| C-07 Support | 本轮只落实 Bridge/Ledge/Neutral；其他 15 种标签可读取不等于实现玩法；counter/bush 独立；事件页/动态碰撞/跨图跳跃若无证据则列明不支持及可观测处理 |
| C-08 Qualification | 当前实现 schema 与 M14 历史 first-slice 适用边界、当前正式 ledger、实际 CI run SHA、旧 exact-local 断言、变更触发新 subject 的矩阵与重跑门槛 |

正式规范要有字段生产者/消费者表、完整 TypeScript/JSON schema 与非法样本、状态转换表，不能只写名称。“walk/jump 共用 ID”必须说明是否同一 ID、生成与退役、重放及乱序如何处理；“原子更新”要精确到哪些 RenderDomain nodes/epochs。PR 2 冻结完整 MovementPlan 类型但只实现 blocked/walk，PR 4 再实现 jump，杜绝空执行器。涉及 Bridge 的行为不能硬编码 Map 7 坐标或 tile ID。

## 5. 状态转换和真实测试要求

必须给出至少两张可检查的矩阵：

1. `bridgeLevel=0/>0 × 面前是否 Bridge × 双向 passage × 无事件/touch/step/edge`：写出 `next x/y、direction、bridgeLevel、event started/executed count、motion、depth、是否 transfer、是否需要新输入`。
2. `idle/walking/jumping/transitioning/event-running/aborted × input/motion complete/resize/transfer/cancel`：写出操作允许/拒绝/排队、计时器归属、场景 epoch 和清理；只为真实消费建最小状态，不额外发明通用调度器。

规则编号和实际测试一一关联：`DATA-*`、`TR-*`（导入与传送）、`BR-PASS-*`、`BR-EVENT-*`、`BR-RENDER-*`、`LD-JUMP-*`、`MOTION-*`、`REG-*`。每个测试提供 Given 真实数据和玩家/事件状态，When 输入或动作完成，Then 精确下一位置、事件次数、桥层、motion 身份、画面遮挡；既有普通一步和 M14/M15 路径必须回归。Map 7/47 需要真实、固定、可重放的起点及操作，不能用自造桥事件代替。尚未创建/运行的命令不准标 PASS。若素材不能合法进入 CI，明确差距且保持 FG-05 OPEN。

## 6. 四张 Agent 任务卡待产出

每张卡必须填 `baseline commit SHA、contract version、依赖、允许/禁止修改路径、确切产物、测试 ID/命令、通过断言、停工规则、证据报告`；当前只是任务范围草案，**不是 Agent 已获派单**。

| 卡 | 主要边界 | 交付和停止条件 |
|---|---|---|
| AG-01 | Importer、Tileset record/validator、MapTransfer 投影、fixture、Content 测试；禁止 Core、修改原始 passages、改写历史资格 | terrain_tags 全链路、导入静态筛选修正、历史 fixture 明确迁移；发现 ABI/记录不兼容先提交证据 |
| AG-02 | `game-libs/map` 语义纯函数和 Runtime 最小接线；不触碰 Browser 玩法权限 | 有效标签 vs 逐层通行、Neutral/Bridge、blocked/walk；旧一步/transfer 回归；jump 只冻结类型不造空执行器 |
| AG-03 | 已验证的桥候选事件（**不能再假设为 Map 7**）、MapAction/Runtime、桥层投影与必要 Browser 调整 | 事件 start/执行、桥两端/桥下/折返、同步遮挡、相关传送；Map 7 无桥事件，相关正例须另选授权样本或显式改为合成/负例；无法保真即停相关项上报 |
| AG-04 | Ledge planner、Runtime motion、Browser motion 与测试 | Map 47 方向+落点检查、单次 jump、弧线/相机、负例/resize/切图；原版冲突先变更合同 |

AG-01→AG-02→AG-03，AG-04 的独立规划器可在 AG-02 后准备，共享 Runtime/Browser 最终集成需以 AG-03 已稳定协议为基线；禁止无审查并发覆写同文件。所有卡不得擅自新增外部插件/通用调度器、改变 M10–M15 公共协议、编造 FSDB 坐标、吞错误或弱化测试。

## 7. 冻结签核模板与变更治理

```text
Specification: TERRAIN_BEHAVIOR_CONTRACT_V1.md (目前尚不存在)
Contract version: <审查时填写>
Implementation baseline commit SHA: <审查时填写；不能用浮动 main>
Source evidence: <v21.1 blob SHA + Map 7/47 event/route + fixture digest>
Schema/ABI owners: <填写并审查>
FG-01 ... FG-06: <逐项 PASS + 证据 URL>
Qualification baseline: <ledger + workflow/run + exact SHA；区分缺口>
Unsupported: <逐项填写>
Reviewer / decision: <填写>
Status: Contract Frozen / Implementation Pending
```

任一 FG 为 OPEN、事件时序未证实、传送事实被误删、motion 两端不一致、fixture 无法复现或未核实基线时，状态保持 NOT FROZEN。冻结后新证据推翻规则，停止相关实现：提交 `证据 → 冲突条款和测试 → 兼容影响 → 最小变更及新版本/任务卡`，审查后再继续。无需真实兼容义务时，遵守文档治理的 current-v1 直接修正规则；已有真实兼容义务则显式迁移或版本化，不保留无理由的双模型。

**下一步实际执行顺序**：Map 47 取证与（若授权）真实桥地图事件取证 → 导入差异审计 → C-01～C-08 exact 合同与状态矩阵 → 合法 fixture/golden 测试 → 当前资格基线复核 → 四张定稿任务卡和签核。Map 7 本地事件扫描已完成并记录为负证据；整体冻结门禁仍全部 OPEN。当前没有修改 Runtime/Browser 玩法代码。
