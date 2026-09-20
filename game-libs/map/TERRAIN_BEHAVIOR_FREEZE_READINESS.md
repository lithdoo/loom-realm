# Terrain Behavior：规格冻结门禁、执行记录与实施交接

> **FREEZE PREPARATION / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。取证基线 [`e60e4a52`](https://github.com/lithdoo/loom-realm/commit/e60e4a521a726233bbda0bb1892f6d25bc47573d)，本次准备起点 [`b26a4d68`](https://github.com/lithdoo/loom-realm/commit/b26a4d68d1cbe4136242e0b4fd09dd2d617e56a6)。现已建立 [冻结执行记录](./TERRAIN_BEHAVIOR_FREEZE_EXECUTION.md)、[非规范合同候选](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md)、[冻结准备任务卡](./TERRAIN_BEHAVIOR_AGENT_TASK_CARDS.md)，对应跟踪 [Issue #42](https://github.com/lithdoo/loom-realm/issues/42)。**创建文件和 issue 只是准备，不是测试完成或门禁 PASS。**
>
> 权威分工：[原始证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) §14 为历史记录、§15 是 `e60e4a52` 静态重跑；[复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 管证明边界；[设计](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) 管架构；[计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 管分期；本文件**唯一管理 FG-01～06**。Map7＝Bridge 负例、Map21＝Bridge 正例、Map47＝Ledge 正例、Map27 非桥正例。六门禁全部 **OPEN**。

## 1. 证据强度与当前不能混淆的状态

`SOURCE-PROVEN` 只表示固定 Essentials v21.1 commit `ea7b5d56d2436591160983c4e641a2ceee2d875a` 的源码条件；`FSDB-OBSERVED` 是对应 SHA-256 的素材抽取；`STATIC-INFERRED` 是 JS 原版规则移植/BFS/trace；`DYNAMIC-OBSERVED` 必须附原版 RGSS 帧日志。`INCOMPLETE/UNVERIFIED/BLOCKED` 均不等于 PASS。`COMPLETE/provenNegativeBridge` 仅限已声明的本图/事件/脚本入口，不能等同遍历整个游戏任意 Ruby 方法体。

本地 Agent 在 `e60e4a52` 记录 Windows/Node 取证测试 **36 pass / 0 fail / 0 skip**；本次 GitHub 远程准备未取得本地 FSDB，**未重新运行测试或原版游戏**；未确认本次 HEAD 对应的 CI PASS。独立核对器重算 Map21 93 桥格/8 个脚本事件和 Map47 30 Ledge 格，**未独立核对触发矩阵、完整跨图路线或运动逐帧**。Map7 零桥仅在明确扫描范围内成立。旧 18/18 属旧提交历史，CI live skip 不等于 PASS。

当前 `game-libs/map/src/semantics.ts` 的 Tileset 精确 keys 只有 `id,tileset_name,autotile_names,passages,priorities`；`terrain_tags` 是待加入字段。当前 MapTransfer schema 是 `id/steps/contacts/edges`，MapAction 尚无正式 schema；`src/runtime.ts` 初始输入仍为 `{mapId,x,y,characterName}`，walk 时间 250ms；jump on-wire ABI 未冻结。唯一正式 `TERRAIN_BEHAVIOR_CONTRACT_V1.md` **不存在、未签核**。新建的是明确标为 `CANDIDATE` 的审查稿，不得供玩法 Agent 当实施规范。历史 M14 first-slice/M15 资格不能追溯更改；新增 Tileset 字段须形成新 subject。

## 2. FG-01～FG-06：全部 OPEN（证据与关闭条件分开）

| Gate | 当前已有、可复核的有限子项 | 真正关闭条件及差距 | 状态 |
|---|---|---|---|
| **FG-01 原版事实** | Map7 限定范围零桥；Map21 93 格、8 桥事件、bridge=0/2 静态 `over_trigger?=true`；Map47 30 Ledge 格、静态两格样本 | [FZ-01/E2E-21](./TERRAIN_BEHAVIOR_FREEZE_EXECUTION.md#3-e2e-21-最小可执行审查合同已发现代码缺口不是假想风险) 从真实 Map7 edge 到真桥面、下桥/返程的**同一状态连续 replay**；Map47 阻挡/边界/运动及原版事件时序；RGSS 原版逐帧。无动态环境只能 BLOCKED，若要变更要求必须正式审查，不可自行宣告可选 | **OPEN** |
| **FG-02 数据/导入** | 取证器区分 source/target mapId，Map21 3 PBS 行生成 7 edge，67/93 桥格 D0=false 的潜在风险已分开记录 | C-01/03 中 terrain_tags exact Table+旧 fixture 迁移+Content、MapTransfer 保留动态事实、MapAction exact schema/筛选与生产消费合同。**无已证实 Map21 误删**，不得以风险冒充 bug | **OPEN** |
| **FG-03 事件/状态** | v21.1 已证先通行、`start`≠execute；八事件 here 是静态计算；跨图清桥源码分支已查 | held input、多事件优先级、重复触发、脚本真实生效/下一输入、bridgeLevel 初始/合法范围/Frame/失败原子性的精确状态矩阵与验证 | **OPEN** |
| **FG-04 运动/画面** | 已定位 Runtime/Browser 普通 walk 250ms、已有 scene/visual epoch 与 depth 缓存断点 | blocked/walk/jump exact on-wire payload、ID/duration/epoch、逻辑提交与相机弧线、resize/cancel/transfer/旧包、原地桥层变化的单次 RenderDomain 投影共同签核与测试 | **OPEN** |
| **FG-05 可重放/CI/许可** | Map7/21/47 digest、合成 fixture、本机 54 pass（有 FSDB）；绿 CI [35499617524](https://github.com/lithdoo/loom-realm/actions/runs/35499617524) on `5b550b4` 为 **100 pass / 0 fail / 6 skip** | 许可仍无书面依据；6 skip 均为 live FSDB，skip ≠ PASS；绿合成不能关闭本 gate | **OPEN** |
| **FG-06 资格/Agent** | 已有设计分期和本轮候选合同、准备卡、Issue #42 | C-01～08 唯一正式版本、DEC-01～07 实际裁决、固定实施 base SHA、AG-01～04 精确正式任务卡、M14/M15 资格 subject/ledger/CI 关联、授权 reviewer 逐 gate 签核 | **OPEN** |

所有 FG 的具体输入/命令/错误等级、退出标准以 [执行记录](./TERRAIN_BEHAVIOR_FREEZE_EXECUTION.md) 为本次准备清单；**Gate 状态仍以本文件为准**，不能仅凭 issue checkbox 关闭。

## 3. REVIEW-01～04、E2E-21 与 Map47：哪些只是静态结果

| 卡 | 已记录完成的部分 | 仍须验收的边界 |
|---|---|---|
| REVIEW-01 | 移植 `passable?(d=0)`，逐占用格计算 Map21 八事件 0/2 `over_trigger=true`，推断 here | 原版 RGSS 的 start/execute/同帧/重复/held input；空图形**不自动等于** walk-on |
| REVIEW-02 | 1D/长度、负 tile、孤立 655、坏 111/117 等 fail-closed；Map7 限定范围零桥 | 实际异常覆盖分母与未知入口不得扩大证明范围 |
| REVIEW-03 | Common Event 按调用入口递归可达闭包+合成测试 | autorun/parallel、方法体动态间接调用仅按已证明范围处理 |
| REVIEW-04 | 传送源/目标分别按 mapId 查；Map21 几何越界与 D0 过滤区别 | 未复现真实误删；需 C-03 明确动态保留策略 |
| **E2E-21** | 统一 `replayWorld` 从物化 Map7 edge 到 tag15/下桥/反向；四组 live STATIC-INFERRED | 不得当 RGSS；分段 `buildMap21BridgeRoutes` 仍禁止当 E2E |
| **LD-47** | Map47 30 格与静态 `(16,9)→(16,11)` 两格样本 | 源/落点阻挡、边界/中间事件实际或合成范围、跨图支持、动态帧/相机；未取得日志不得填 DYNAMIC-OBSERVED |

静态 `map-route-trace.mjs#applyStarts` 将脚本执行作为离散步骤的推测并立即清 busy，**并非**原版帧对齐模型。`bfsWalk` 若经过 ledge jump，须显式禁止或标注，不得默称普通步。完整验收在 FZ-01 和 FZ-02 卡，原证据 §14 历史草图、§15 分段 trace 不能直接充当端到端实现合同。

## 4. 必须裁定的正式合同 C-01～C-08

新[合同候选](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md) 已逐项列存在的代码字段、拟议类型、错误、兼容与 OPEN 决策；**其 TypeScript 是讨论方案，不是已存在 API**。

| ID | 正式签核必须交付 |
|---|---|
| C-01 Data | 完整 Tileset 六字段含 `autotile_names`、`terrain_tags` 1D/长度/tag0～17/索引/坏值、旧 Content 和 fixture 迁移、错误精度 |
| C-02 Semantics | `resolveEffectiveTerrainTag` 与 `evaluatePassability` 两个 exact API，None/Neutral/NoEffect/Bridge、逐层 priority/双向 passage/边界 |
| C-03 Event | MapTransfer/MapAction 各自 namespace/key/schema、size/over_trigger/页面与脚本命令白名单、动态事实与冲突/不透明候选 fail-closed；不执行 Ruby |
| C-04 Time | input→通行→失败 touch 或成功动作→arrival、start≠execute、事件顺序/重复/held input/step/edge/transfer/出错恢复 |
| C-05 State | 数值 bridgeLevel 的初值、脚本真正生效、切图/Frame/异常、深度重投影，保持现有四字段启动输入除非另经审核 |
| C-06 Motion | blocked/walk/jump 精确 Runtime↔Browser payload、duration/单 motion ID/scene+visual epoch、相机/弧线/resize/取消/转图/乱序包 |
| C-07 Support | 本轮只支持 Neutral/Bridge/Ledge；其他标签保留不冒称水/冰完整玩法；NPC/跨图跳跃缺证据则明确支持边界 |
| C-08 Qualification | 新 subject 与 M14 first-slice、M15 历史范围区分，workflow/run/exact SHA、CI 与资格签名 |

正式合同必须含字段 producer→consumer、TypeScript/JSON 正反例、bridgeLevel×事件/通行及 idle/walk/jump/transition/event-running/aborted×input/completion/resize/transfer/cancel 状态矩阵，逐项标坐标/方向/事件 start/execute 次数/motionId/depth/下一输入；不能交给实现 Agent 凭“原版一致”自创 ABI。

## 5. 实施顺序、禁止事项与签核

必须先完成 [任务卡 FZ-00～06](./TERRAIN_BEHAVIOR_AGENT_TASK_CARDS.md)，并经六门禁审查，才授权四张正式 AG 任务卡。预定顺序：AG-01 数据/importer/transfer → AG-02 map-owned 语义 + blocked/walk（jump 类型冻结但不执行）→ AG-03 Map21 Bridge/Map7 负例 → AG-04 Map47 jump 与 Browser motion。AG-04 纯 planner 可单独准备，但与 AG-03 共享 Runtime/Browser 集成不可无审查同时覆写。

硬约束：不得硬编码 map/event/tile ID 到 Runtime、改原版 passages、引入插件/通用 Ruby 事件解释器、向 framework/Renderer/Hostra 下沉地图玩法；无关 NPC 不使整图失败，相关事件无法保真按 map/event/page 精确 fail-closed。不可把潜在 D0 风险写成 Map21 已证实误删；不可改历史 M14/M15 ledger 掩盖新 schema 漂移；未经许可不提交真实 FSDB/完整转储。没有证据就停受阻分支、报告事实→冲突合同→所需决策→下游测试影响，其他可独立准备工作可继续。

```text
Specification: TERRAIN_BEHAVIOR_CONTRACT_V1.md（当前 NOT CREATED）
Freeze implementation base SHA: <审查签核时真实固定 SHA，不填浮动 main>
Source: <v21.1 commit + Map7/21/47, Tilesets, CommonEvents, PBS sha256>
E2E-21: <single-state trace + independent check + command/exit/CI run>
RGSS: <真实日志；缺少时 BLOCKED 或正式 reviewer 门禁变更记录>
Map47: <真实/合成与动态区分>
Fixture licence + CI: <合法依据 + run ID/commit SHA + pass/fail/skip>
Data/Event/State/Motion ABI: <C-01..08 exact version + owners/reviewers>
M14/M15 subject/ledger: <实际核验，不修改历史>
FG-01..06: <逐项 PASS/证据/授权 reviewer/日期>
Status: NOT FROZEN（只有六项真实 PASS 后方能更改）
```

**当前正式结论：六 Gate 全 OPEN；E2E-21/Map47 静态候选已闭合（§16），RGSS/许可/CI/签核仍为外部阻碍。`FREEZE CANDIDATE COMPLETE / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED`。**