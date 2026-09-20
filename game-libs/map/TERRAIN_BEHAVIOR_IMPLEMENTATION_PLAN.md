# 地图地形行为系统：实施闭环与验收计划（Essentials v21.1）

> 状态：**Implementation plan / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 对 `5e71c7e` Map 21 取证作后续审查修订。[设计草案](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) 管架构、[冻结门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 管准入、[原始证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) 记抽取观察、[最新证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 记录待修正结论。此文件不是代码实现或资格 PASS 声明，不追溯更改 M14 历史合同。
>
> 地图职责：**Map 7 Bridge 负例；Map 21 Bridge 正例（已有素材观察，但 `over_trigger?` 与路线尚未完整证明）；Map 47 Ledge 正例待取证；Map 27 不作桥样本。** 原始证据 §14.5～14.6 和旧设计中“空图形 size 必然 walk-on”“全部失败 bump 不触发”的无条件句子，在 REVIEW-01 验证前不是合同依据。

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

**传送断点：** `projectedD0Passable` 不了解 Neutral/Bridge/player state，静态永久过滤可能丢信息，但 Map 21 当前**没有已证实误删**。67 个 Bridge 格 D0=false 是假设出现相应落点时的潜在风险；`21,E,77,47` 是几何越界。取证器 `incomingEdgesOntoBridge` 还把目标地图坐标与本地图桥格比较，须先按 `targetMapId` 修正，再形成字段级合同。

**运动断点：** Runtime 和 Browser 在 validator/启动/续接/插值多处写死普通 walk 250ms；jump 一次动作不是两个 walk；bridgeLevel 即使原地变化也须令 tile-depth 缓存失效、RenderDomain 与人物同更新。Browser 不掌握碰撞。

## 2. 阶段 0：当前先后顺序及真实出口

| 子项 | 现状 / 必须交付 | 不满足时 |
|---|---|---|
| **0A REVIEW-01 / P0 触发判定** | 对 Map 21 八个桥事件所有占用格，在相关 bridgeLevel 下计算 `map.passable?(x,y,0,player)`、`over_trigger?`、here/touch；固定源码位置、状态表、必要时动态日志 | **不得宣称八事件全部 walk-on；不得按旧 §14.5 的无条件语句冻结 MapAction** |
| **0B REVIEW-02 / P1 严格扫描** | terrain_tags 1D/声明长度/values 长度校验，负 tile ID、move-route decodeError/坏脚本参数不能报 COMPLETE；新测试实际运行 | 旧 Map7 `provenNegativeBridge=true` 只视为旧扫描记录，不作为加强后的证明 |
| **0C REVIEW-03 / P1 Common Event** | A→B→bridge 对 A 的调用者传递命中；环、缺 ID、不透明脚本标识；端到端反例 | 不能声称间接桥调用完整排除 |
| **0D REVIEW-04 / P1 传送空间** | 本图 edge source 对比本图桥格；targetX/Y 按 targetMapId 加载目标图桥格；缺图为 INCOMPLETE；双图同坐标反例 | 不能用当前 incomingEdgesOntoBridge 推断桥目标格是否被保留 |
| **0E ROUTE-21 / P1 路线** | 四组桥端从合法起点开始逐步列方向、双向通行、事件 start/execute、bridgeLevel、传送；Map7 接入 x=19–22 至 (14,70) 不能跳步 | §14.6 只能称关键点草图，不能视为可重放输入序列 |
| **0F 回填/复验** | 修工具与测试后真实重跑 Map7、Map21 和 69 图 corpus，记录环境/commit/退出码/pass/fail/skip/输入 SHA，直接纠正原始证据 §14 与设计/门禁；合法派生 fixture 或明确 CI 缺口 | 当前仅有上一提交记录本机 18/18 pass，此次文档修订无新测试 |
| **0G Map47 Ledge** | 取证原版方向、起点、面前 tag、源格 passage、最终落点、阻挡、反向、边界、中间事件和逐步路线 | 不能把 jump 当两个 walk 或伪造 Map47 坐标 |
| **0H 合同/资格** | 实际数据/事件/运动字段及 producer-consumer、合法 golden fixture、M14/M15 资格 baseline、审查签核 | 六道 FG 全 OPEN；不得创建虚假的 frozen v1 |

**本轮任务的下一执行入口为 0A～0F，随后才是 0G。** 不能因为上次取证写了“静态已完成”，就把尚未解决的 P0 触发条件跳过。源数据路径、SHA 和事件 ID 是已记录观察；是否实际触发、路线可走和测试通过属于独立命题。

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

**下一步：先完成 REVIEW-01～04 + ROUTE-21，真实重跑并回填原始证据，再开展 Map47。当前 FG-01～06 全 OPEN，NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED。**