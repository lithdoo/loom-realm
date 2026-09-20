# 地图地形行为系统：实施闭环与验收计划（Essentials v21.1）

> 状态：**Implementation plan / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。本轮已修复取证器并重跑 Map 7/21/47。[设计草案](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) 管架构、[冻结门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 管准入、[原始证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) 记抽取观察（§14 历史 + §15 本轮）、[证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 记 REVIEW-01～04 修复结果。此文件不是代码实现或资格 PASS 声明，不追溯更改 M14 历史合同。
>
> 地图职责：**Map 7 Bridge 负例（严格扫描后仍为零）；Map 21 Bridge 正例（八事件 here/walk-on 为逐格计算结果；陆地侧连续路线已生成）；Map 47 Ledge 正例（静态 30 格）；Map 27 不作桥样本。** 空图形 size 只是 over_trigger 资格；本轮计算结果恰好为 walk-on，不得改回“必然”而不附计算。

## 1. 全链路与交叉断点

```text
固定版本 v21.1 Map / Tileset / Event
 → 严格取证（扫描边界、源指纹、路径/触发条件、许可）
 → selective importer 保留 terrain_tags、传送与必要桥事件事实
 → prepared FSDB → M12 Content 严格校验
 → resolveEffectiveTerrainTag / evaluatePassability 两个独立查询
 → 方向 can_move；成功选择 walk/jump，失败按条件检查 front touch
 → 动作完成时按条件检查 arrival event；解释器后续执行与 bridgeLevel 生效
 → Runtime 同次投影人物／相机／桥深度 → Browser 严格接受并呈现
 → Map 7 负例 + Map 21 桥 + Map 47 悬崖 + M14/M15 回归
```

**事件断点：** v21.1 `Game_Event#over_trigger?` 对空图形进一步检查所有占用格中至少一格 `map.passable?(x,y,0,$game_player)`。成功抵达是否 `check_event_trigger_here→start`，失败 touch 是否跳过，需要逐事件、逐桥状态计算。`start` 仅置位，脚本后续执行。严禁“先 contact、立刻重算同次移动”；既有 Runtime ContactTransfer 先于 canMove 仅为待审计现状。

**传送断点：** `projectedD0Passable` 不了解 Neutral/Bridge/player state，静态永久过滤可能丢信息，但 Map 21 当前**没有已证实误删**。D0=false 桥格是假设出现相应落点时的潜在风险；`21,E,77,47` 是几何越界。取证器已按 `targetMapId` 加载目标图比较目标坐标；源端只与源图比较。

**运动断点：** Runtime 和 Browser 在 validator/启动/续接/插值多处写死普通 walk 250ms；jump 一次动作不是两个 walk；bridgeLevel 即使原地变化也须令 tile-depth 缓存失效、RenderDomain 与人物同更新。Browser 不掌握碰撞。

## 2. 阶段 0：当前先后顺序及真实出口

| 子项 | 现状 / 必须交付 | 不满足时 |
|---|---|---|
| **0A REVIEW-01 / P0 触发判定** | 已对 Map 21 八个桥事件全部占用格在 bridgeLevel 0/2 计算 `passable?(d=0)`、`over_trigger?`、here/touch；结果均为 here。解释器同帧仍未动态验证 | 不得把空图形资格写成未经计算的必然 walk-on；不得把静态路线写成 RGSS 实测 |
| **0B REVIEW-02 / P1 严格扫描** | 已强制 1D terrain_tags、负 tile、orphan 655、坏 111/117；`EV-VALID-*` 会让旧实现失败 | 扫描不到 ≠ 证明不存在 |
| **0C REVIEW-03 / P1 Common Event** | 已从每个调用入口做可达闭包；A→B→C 测试通过；autorun 单独入口 | 不能声称整个游戏无间接桥调用 |
| **0D REVIEW-04 / P1 传送空间** | 源/目标 mapId 已分开；同坐标不同地图反例；D0 对照与误删分开 | 不得把潜在 D0 风险写成已证实误删 |
| **0E ROUTE-21 / P1 路线** | 四组从 Map 7 落点连续 BFS 到陆地侧桥头；上桥结束 bridgeLevel=2；下桥结束 0 | §14.6 旧草图不得单独当合同；以 §15 为准 |
| **0F 回填/复验** | 本轮重跑 Map7/21/47 与 69 图 corpus；测试 36 pass（有本地 FSDB）；独立核对器不复用 collectMapEvidence JSON | CI 无 FSDB 时 live skip ≠ PASS |
| **0G Map47 Ledge** | Map047 SHA `5f4ee232…df043e`，30 Ledge 格，合法两格跳与逆向失败已静态列出 | 不能把 jump 当两个 walk；无动态日志不得写 DYNAMIC-OBSERVED |
| **0H 合同/资格** | 实际数据/事件/运动字段及 producer-consumer、合法 golden fixture、M14/M15 资格 baseline、审查签核 | 六道 FG 全 OPEN；不得创建虚假的 frozen v1 |

**本轮 0A～0G 的静态取证子项已执行并回填。** 仍缺动态 RGSS、合法可分发完整地图 fixture 与 CONTRACT_V1。不得把静态重跑写成 Gate PASS。

## 3. 四个实施 PR（须全部冻结后派单）

| PR | 依赖与边界 | 可审查交付及准许的完成声明 |
|---|---|---|
| **PR 1 数据与投影** | 冻结合同；m14-consumer、map-transfer-consumer、Tileset schema/Content/fixture；不改 Core/原 passages | terrain_tags 0–17 Table 精确校验/迁移，按已证明的静态/动态差异保留传送和事件事实；只说数据就绪 |
| **PR 2 内核与普通一步** | PR 1；Map Library 纯规则与 Runtime 最小接线 | 有效 tag 与逐层 passage 分离，Neutral/Bridge/None/NoEffect、源目标双向规则；MovementPlan 类型全冻结但仅执行 blocked/walk；旧转图回归 |
| **PR 3 Bridge 纵向闭环** | PR 2 + REVIEW-01～04/ROUTE-21 修复证据；狭义 MapAction、Runtime、桥深度/必要 Browser | 用真实 Map21 的**已验证触发分支**做桥两端/桥上/桥下/折返/状态/遮挡/附近传送；Map7 零桥负例；禁止写死 map/event/tile ID |
| **PR 4 Ledge 纵向闭环** | PR 2 + 已审查的共享运动协议；planner、Runtime、Browser | Map47 正反/阻挡/边界、一次两格 jump、落点事件、相机弧线、held input、resize/切图实测 |

PR 1→2→3；PR 4 纯规划器可在 PR 2 后单独开发，最终共享 Runtime/Browser 集成需以 PR 3 已稳定 ABI 为基线，禁止无审查并发覆写相同文件。若后续来源证据改变切片，先修合同和任务卡，不为凑四个 PR 半实现功能。

## 4. 精确 C-01～C-08 合同项

| 合同 | Producer → Consumer / 冻结要求 |
|---|---|
| C-01 Data | RMXP→importer→FSDB→Content/TilesetRecord：terrain_tags exact key、1D/长度/tag 0–17/坏值/非法引用、已有 autotile_names 与迁移 |
| C-02 Semantics | validated map+tileset→规则：有效标签与逐层通行分开、非空 None passage、Neutral 忽略本层、NoEffect 非 Neutral、Bridge 上下/优先级/源目标方向位 |
| C-03 Event | RMXP→selective importer→MapTransfer/MapAction→Runtime：真实 size/page/命令/trigger 与 over_trigger 条件、跨图 ID 空间、相关候选 fail-closed、不执行 Ruby |
| C-04 Time | input→can_move→失败 front touch 或成功 walk/jump→arrival；start/execute 区分、条件触发事件次数、step/edge/held input/ContactTransfer 兼容 |
| C-05 State | Runtime→通行/画面：数值 bridgeLevel 初值/跨图/Frame/实际生效/失效/重投影；不擅自扩大四字段启动输入 |
| C-06 Motion | Runtime→Browser：kind/from/to/duration/单 ID/scene+visual epoch、逻辑提交/相机/弧线/resize/取消/切图/坏包 |
| C-07 Support | 本轮仅 Neutral/Bridge/Ledge；其他标签原值保留不承诺完整水/冰；若无 NPC 投影则不承诺碰撞负例 |
| C-08 Qualification | 当前 schema vs 历史 M14 first-slice、正式 M14/M15 ledger/CI run/exact SHA、旧断言修复与新 subject 验收 |

冻结合同必须有 exact TypeScript/JSON 正反例、字段 producer/consumer 表、桥层×通行×事件和 movement 状态×输入/完成/resize/transfer/cancel 矩阵；给出 mapId/x/y/朝向/bridgeLevel/事件启动与执行次数/motion/depth/下一输入时刻、RenderDomain 原子边界。不能以“同步/复刻原版”等描述让 Agent 自定 ABI。

## 5. 验收、停止线与资格记录

测试族：`DATA-*`、`TR-*`、`BR-PASS-*`、`BR-EVENT-*`、`BR-RENDER-*`、`LD-JUMP-*`、`MOTION-*`、`REG-*`，取证新增 REVIEW-01～04 与 ROUTE-21 明确负例。Map7 负例/门/edge；Map21 桥正例；Map47 悬崖正例。所有 Given/When/Then 精确给来源 digest、起点/输入/通行/事件/结果、实际执行命令、环境、commit、exit、pass/fail/skip；合成单测不能冒充真实图闭环，未运行不得写 PASS。

合法性未确认前不提交 Map021.rxdata、完整 Map21 事件转储；旧 Map7 附录 A 的分发条件仍须核查。CI 无本地 FSDB 的 live skip ≠ PASS，FG-05 继续 OPEN。M14 历史记录及 M15 ledger 不改写；旧 Tileset 断言漂移和新增 subject 须分开报告。

遇未知间接 Ruby、`over_trigger?`/路径与预期矛盾、缺目标地图、坏表、许可/ABI/测试冲突时，只暂停受影响的实施项，报告`事实 → 冲突条款 → 修正选项 → 下游/测试影响`；不编造事件坐标、不弱化校验、不写插件或通用解释器。

**下一步：动态 RGSS（有合法环境时）、合法 fixture、CONTRACT_V1 与签核。当前 FG-01～06 全 OPEN，NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED。**