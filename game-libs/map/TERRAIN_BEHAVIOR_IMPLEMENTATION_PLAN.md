# 地图地形行为系统：实施闭环与验收计划（Essentials v21.1）

> 状态：**Implementation plan / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 负证据复核修订。[设计草案](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) 管架构，[冻结门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 管准入，[原始证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) 记观察，[证据复核与后续交接](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 记扫描边界。本计划不是代码实施或资格通过声明，不追溯改写 M14 历史合同。
>
> **地图职责：Map 7 Cedolan City = Bridge 负例、门 contact/edge 及 Neutral 回归；Map 21 Route 2 = Bridge 正例待完整取证；Map 47 Route 7 = Ledge 正例待取证；Map 27 Day Care 不是桥样本。** Map 21 已有 93 格/8 个直接桥脚本的清单，但缺命令级、`size`/时序和可重放路线，不能把已定位等同已验收。

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

**事件：** 旧“先执行 contact 改状态并立即重算本次移动”不得实现。v21.1 `move_generic` 先查通行，失败时才检查 touch；`Game_Event#start` 不同步运行脚本。具体桥端 `size(w,h)` 碰撞、start→interpreter→bridgeLevel→后续输入须以真实 Map 21 加固定源码和（可运行时的）动态证据证明；既有 Runtime `ContactTransfer` 在通行前触发须另作兼容审计，不能直接套给桥事件。

**传送：** `map-transfer-consumer.mjs` 的 `projectedD0Passable` 不理解 Neutral/Bridge/玩家状态，但参与 step/contact/edge 筛选。只有经 Map 21 源事件→现有投影→状态对照，才能断言真实记录被误删；目前是**潜在风险**。静态不可判定的状态相关事实须保留到 Runtime；无关 NPC 不令整图失败，相关无法保真的候选带 map/event/page 报错。

**运动：** Runtime/Browser 的普通 walk 校验、启动、重入及插值多处固定 250ms；jump 是一个动作而非两次 walk，双方冻结完整 kind/duration/ID/epoch/坐标时点/相机/帧/resize/取消协议。bridgeLevel 原地切换也要失效桥 depth 缓存并与人物同更新；Browser 不掌握碰撞。

## 2. 阶段 0：规格冻结前必须完成的真实取证

| 子项 | 执行及可审查产物 | 未达成时的约束 |
|---|---|---|
| **0A Map 7 严格复核** | 对已记录的 11 events/19 pages/521 commands、0 Bridge 格/0 直接桥脚本补齐 355/655、209/509 内脚本、可达 CommonEvent/间接调用的扫描覆盖；缺 Tilesets/Table/越界/解析异常 fail 或明确 INCOMPLETE；记录 SHA、命令、退出码、pass/fail/skip | 不把没扫描/缺表/skip 算作零命中或 PASS；Map 7 不要求桥头 event ID |
| **0B Map 21 Bridge 正例** | Map021/MapInfos/Tilesets/CommonEvents/MapTransfer 来源 SHA；全地图事件/所有页/全部命令、8 个直接桥脚本及 2 个邻接非桥候选；原版 `size(w,h)` 命名→占用→touch 调用链，四对 On/Off 的位置/方向/trigger/bridgeLevel/通行/遮挡/传送最小路线；静态与动态观察分开 | 目前只有清单、不是完整证据；不可硬编码 Map21 坐标作为 Runtime 规则 |
| **0C Map 47 Ledge** | 真实起点、面向 tag、源格通行、`jumpForward(2)` 最终落点与事件、正向/逆向/阻挡/边界、跨地图支持边界和输入序列；原版源码对照 | 不把中间格当作第二次普通 walk；无证据项列待证 |
| **0D 导入对照** | Map 7 普通 door/edge 基线及 Map 21 `projectedD0Passable`、`selectStaticPage`、`emitStep`/`emitContacts`/`expandConnection` 源→当前→期望记录，明确已证实误删与潜在误删 | 未实际对照不能声称已复现误删 |
| **0E 许可/测试/资格** | 原始 FSDB SHA、许可核查、可分发最小派生 fixture/可重复脚本；做不到则列本地与 CI 缺口；记录正式 M14/M15 ledger、旧 autotile_names 断言及 CI run/exact SHA | live test 在无 FSDB 时会 skip；skip≠PASS；历史资格≠新 subject 资格 |

[Map 7 证据附录](./TERRAIN_BEHAVIOR_EVIDENCE.md) 含较多原始事件命令；下一轮先核查复制/派生素材许可，未明确前不继续向公开仓库复制整张 Map 21 的大段原始命令。可在本地生成完整转储，在仓库提交必要的结构化摘录、指纹、覆盖计数和重放办法，许可情况与移除/压缩已有附录的决定须记录。

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

**下一步真实顺序：** 严格扫描补证与 Map7/corpus 重跑 → Map21 桥正例完整取证 → Map47 Ledge 取证 → 导入/时序/ABI 契约 → 许可明确 fixtures、真实测试、资格基线 → FG-01～06 审核签核 → 四实施任务卡。现在仍全部 OPEN。