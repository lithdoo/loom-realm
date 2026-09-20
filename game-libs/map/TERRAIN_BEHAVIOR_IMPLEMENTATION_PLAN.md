# 地图地形行为系统：实施闭环与验收计划（Essentials v21.1）

> 状态：**Implementation plan / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 负证据复核修订。[设计草案](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) 管架构，[冻结门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 管准入，[原始证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) 记观察，[证据复核与后续交接](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 记扫描边界。本计划不是代码实施或资格通过声明，不追溯改写 M14 历史合同。
>
> **地图职责：Map 7 = Bridge 负例；Map 21 = Bridge 正例（静态取证见证据 §14，动态未跑）；Map 47 = Ledge 待取证；Map 27 不是桥样本。** 不得把静态取证写成玩法已实现或规格已冻结。

## 1. 全链路与三个交叉断点

```text
Essentials v21.1 原 Map / Tileset / Event
 → 取证（明确扫描范围、未覆盖入口、源指纹、许可）
 → selective importer 保留 terrain_tags、传送和必要桥事件事实
 → prepared FSDB → M12 Content 严格校验
 → resolveEffectiveTerrainTag + evaluatePassability 两类独立查询
 → 原版方向通行检查：失败才按规则 touch start；成功选 walk/jump
 → 解释器执行／Runtime 更新桥层、移动、到达事件
 → 人物／相机／桥深度同次 RenderDomain 更新
 → Browser 严格校验并呈现
 → Map 7 负例 + Map 21 桥正例 + Map 47 悬崖正例 + M14/M15 回归
```

**事件：** 不得实现“先 contact 再立即重算本次移动”。Map 21 桥事件是空图形 `size()` walk-on：成功踏入占用格后 `start`，解释器随后 `eval`；失败 touch 跳过 `over_trigger`。动态逐帧仍缺。Runtime `ContactTransfer` 先于 `canMove` 不能当桥模板。

**传送：** Map 21 审计（证据 §14.7）：**无已证实误删**。67 个 D0-false 桥格是潜在风险未复现；连接 `21,E,77,47` 因偏移越界不产生 edge。本轮不改 importer。

**运动：** Runtime/Browser 的普通 walk 校验、启动、重入及插值多处固定 250ms；jump 是一个动作而非两次 walk，双方冻结完整 kind/duration/ID/epoch/坐标时点/相机/帧/resize/取消协议。bridgeLevel 原地切换也要失效桥 depth 缓存并与人物同更新；Browser 不掌握碰撞。

## 2. 阶段 0：规格冻结前必须完成的真实取证

| 子项 | 执行及可审查产物 | 未达成时的约束 |
|---|---|---|
| **0A Map 7 严格复核** | 已完成：11/19/521 不变；cells=0；provenNegative=true；新入口已扫 | 方法体内间接 Ruby 仍 UNVERIFIED |
| **0B Map 21 Bridge 正例** | 静态已完成（证据 §14）。动态 RGSS 未跑 | 不可硬编码 Map21 坐标到 Runtime；动态路线仍待证 |
| **0C Map 47 Ledge** | **下一轮** | 不把中间格当第二次 walk |
| **0D 导入对照** | Map 21 已审计：无已证实误删 | 不在本轮改传送规则 |
| **0E 许可/测试/资格** | 附录 L：不提交 Map 21 全文；本机 18 pass；CI skip 缺口仍在 | skip≠PASS |

许可结论见证据附录 L：保留既有 Map 7 附录 A；Map 21 完整命令只留 `.local/`。

**阶段出口：** 证据行均指向 `原始文件指纹 + map/event/page/command 或 tile x,y,z + v21.1 符号 + 观察方式 + 事实/推论/待证 + test ID`，Map 21 与 Map 47 路线可复现；[FG-01～06](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 全部实际 PASS 且审查签核，才建立唯一规范 `TERRAIN_BEHAVIOR_CONTRACT_V1.md` 并标 `Contract Frozen / Implementation Pending`。模板与取证命令不能代替实际结果。

## 3. 四个代码 PR：冻结后派单，当前只是草案

| PR | 依赖/边界 | 可审查交付和完成条件 |
|---|---|---|
| **PR 1 数据与投影** | 冻结合同；`m14-consumer.mjs`、`map-transfer-consumer.mjs`、schema/Content/fixture；不改 Core/原始 passages | terrain_tags 0–17 精确 Table 校验/迁移，基于已证实差异修正静态筛选、保留状态相关事件事实；只声称数据就绪 |
| **PR 2 内核/普通一步** | PR 1，Map Library 纯规则+Runtime 最小接线 | 有效 tag 与逐层 passage 分离、Neutral/Bridge/None/NoEffect 和源目标双向规则；MovementPlan 全类型冻结但只执行 blocked/walk，旧 transfer 回归；不建空 jump 执行器 |
| **PR 3 Bridge 纵向闭环** | PR 2 + **Map 21 正式证据**；狭义 MapAction、Runtime、桥投影/必要 Browser | Map 21 `size`/touch/start/execute/两端上下/折返/桥下/附近 transfer/depth 原地失效实测；Map 7 无桥负例；不得硬编码 map/event/tile ID |
| **PR 4 Ledge 纵向闭环** | PR 2 + 已审查共享 Runtime/Browser motion 协议；planner、Runtime、Browser | Map 47 面前方向+最终落点、一次两格 jump、相机/弧线/事件、反向/边界/阻挡/held input/resize/切图实测 |

依赖 PR 1→2→3；PR 4 纯规划器可在 PR 2 后独立准备，最终 Runtime/Browser 集成以 PR 3 已稳定协议为基线，禁止无审查并发覆写同一文件。若证据改变切片，先改合同/任务卡，不为凑四 PR 拆半功能。

## 4. C-01～C-08 跨模块精确合同

| 合同 | Producer → Consumer；冻结精度 |
|---|---|
| C-01 Data | RMXP→importer→FSDB→Content/TilesetRecord：terrain_tags exact key/Table/长度/值域/非法引用、已有 autotile_names 与 fixture 迁移 |
| C-02 Semantics | validated map/tileset→内部规则：有效标签与逐层通行独立，非空 None passage、Neutral 跳过本层、NoEffect 非 Neutral、Bridge 上下和源/目标方向位 |
| C-03 Event | RMXP→选择性 importer→MapTransfer/MapAction→Runtime：Map 21 证实的 `size`/page/命令白名单、动态事实/静态筛选、未知候选与冲突、禁止执行 Ruby |
| C-04 Time | input→passability→touch start/解释器或 walk/jump→arrival：状态改变时刻、event 次数、edge/step/held input/ContactTransfer 兼容 |
| C-05 State | Runtime→通行和 depth：bridgeLevel 数值/初始/跨图/Frame 生命周期/同次投影；不擅自扩现有四字段 initial input |
| C-06 Motion | Runtime→Browser：kind/from/to/duration/motion ID/scene+visual epoch、逻辑提交/动画帧/相机/resize/重播/取消/坏包 |
| C-07 Support | Neutral/Bridge/Ledge 本轮子集；其他 tag 原值保留不承诺水域/冰面完整玩法；无 NPC 投影不承诺 NPC 碰撞负例 |
| C-08 Qualification | 当前字段与 M14 historical first-slice 范围，正式 ledger/CI run/exact SHA、旧断言修正和新 subject 验收矩阵 |

合同必须给 exact TypeScript/JSON 正反例、字段生产者/消费者、bridgeLevel×passage×event 与运动状态×input/complete/resize/transfer/cancel 的矩阵，列明 mapId/x/y/朝向/bridgeLevel/event started/executed/motion/depth/下一输入，明确 RenderDomain 原子边界；不能让 Agent 从“同步/保真”等自然语言猜 ABI。

## 5. 验收和停工

| 测试族 | 正反例范围 |
|---|---|
| `DATA-*`/`TR-*` | 18 tag、错误 Table/迁移/Content，Map7 门与 edges，Map21 动态 transfer 过滤对照 |
| `BR-PASS-*`/`BR-EVENT-*`/`BR-RENDER-*` | None/Neutral/NoEffect/上下桥；Map7 零桥负例与 Map21 真实桥端/状态/传送/遮挡、静止重投影 |
| `LD-JUMP-*`/`MOTION-*` | Map47 两格最终落点/逆向/阻挡/中间事件，单动作弧线/相机、ID/duration/epoch、resize/切图/取消 |
| `REG-*` | 原普通一步/held input/传送/viewport、M14/M15 包边界及新 subject 回归 |

每测试记录 Given/When/Then、FSDB digest、环境、命令、commit、退出码、pass/fail/skip、覆盖差距；合成单测不能替代真实 Map 21/47。已有命令如 `npm run build:m14`、`npm run test:m14:projection`、`npm run test:m14`、`npm run test:m15` 也仅运行后才能报告 PASS。Agent 卡须固定 base SHA、合同、允许/禁止文件、依赖、准确 test IDs 和停止线。缺素材、未知间接 Ruby、`size()` 无法取证、ABI/许可/测试冲突时暂停受影响项，报 `事实→冲突条款→可选修正→下游影响`，不造假或放松校验。

**下一步真实顺序：** Map 47 Ledge 取证 →（可选）RGSS 动态日志 → ABI/fixtures/合同 → 签核。现在 FG-01～06 仍全部 OPEN。