# 地形行为系统：规格冻结门禁与实施交接

> 状态：**Freeze preparation / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。以取证提交 [`e60e4a52`](https://github.com/lithdoo/loom-realm/commit/e60e4a521a726233bbda0bb1892f6d25bc47573d) 为审查基线；[原始证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) §14 为历史快照、§15 为本轮重新提取，[最新复核与明确剩余项](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 是证明强度和任务验收入口，[设计](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) / [计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 仍非合同。**静态子项完成，不等于 Gate PASS。**
>
> 样本：Map 7＝Bridge 负例；Map 21＝Bridge 正例（93 格、8 个事件，静态触发矩阵已记录）；Map 47＝Ledge 正例（静态 30 格）；Map 27 不作为桥样本。六道门禁当前全部 **OPEN**。

## 1. 证据等级、责任与禁止越权

`SOURCE-PROVEN` 只证明固定 Essentials v21.1 commit `ea7b5d56d2436591160983c4e641a2ceee2d875a` 的源码条件；`FSDB-OBSERVED` 是带 SHA-256 的原始文件抽取；`STATIC-INFERRED` 是静态移植规则、BFS 或 trace；`DYNAMIC-OBSERVED` 必须给原版 RGSS 实际日志。`INCOMPLETE/UNVERIFIED/BLOCKED` 不可写 PASS。原取证工具的 `COMPLETE`、`provenNegativeBridge` 仅覆盖其明确列出的 Map/事件/脚本入口，不代表任意 Ruby 方法体或整个游戏皆已遍历。

当前记录的 Windows/Node 本机取证测试为 **36 pass / 0 fail / 0 skip**；这是 Agent 在 `e60e4a52` 提交中的记录，本次文档整理没有重新运行。旧 18/18 属历史基线；没有取得当前 HEAD 对应的 CI PASS 或原版游戏运行证据。独立核对器只重新计算 Map21 Bridge 格/脚本 IDs 和 Map47 Ledge 格，**没有独立验证触发矩阵、完整路线或逐帧逻辑**。

唯一正式规范候选 `TERRAIN_BEHAVIOR_CONTRACT_V1.md` **尚未创建、未签核**。从 `Design draft → Freeze candidate → Contract Frozen / Implementation Pending → Implemented / Qualified` 每次状态升级都需要单独证据。历史 M14 first-slice 资格不得追溯修改；`autotile_names` 是现有 Tileset 字段，新增 `terrain_tags` 属新的资格 subject。

## 2. FG-01～FG-06（均 OPEN）

| Gate | 现有子项证据 | 关闭条件及尚缺事项 |
|---|---|---|
| **FG-01 原版事实** | Map7 限定范围零桥；Map21 93 格、8 桥事件及 0/2 静态 over_trigger=true；Map47 30 Ledge 格与静态两格样本 | **OPEN**：Map21 真正一条连续状态的 Map7 edge→BFS→Off/On→桥面→Off→返程 replay 尚未验证；Map47 边界/落点/运动原版依据需逐项完成；原版 RGSS 逐帧、事件调度仍缺。若无动态运行条件，标 BLOCKED 并明确提出审查变更 Gate，而非自行改成“可选”。 |
| **FG-02 数据/导入** | 取证器源/目标 mapId 已分开；Map21 3 PBS 行对应现有 7 edge；67/93 Bridge 格静态 D0=false | **OPEN**：`terrain_tags` exact Table、schema/migration/Content、MapTransfer 与狭义 MapAction 的 producer-consumer 字段合同及真实状态相关筛选策略未签；无已证实 Map21 误删，不得为假故障改 importer。 |
| **FG-03 事件/状态** | 固定源码证明先通行，`start`≠execute；八事件静态触发矩阵；桥状态跨图清零的源码分支 | **OPEN**：真实输入与 held input、重复触发、多事件优先级、解释器执行/状态变更精确时点、bridgeLevel 初值/合法值/Frame 生命周期与出错原子性未冻结。 |
| **FG-04 运动/画面** | 已定位 Runtime/Browser 多处固定 walk 250ms 和桥 depth 缓存断点 | **OPEN**：blocked/walk/jump 精确 payload、duration/ID/epoch、逻辑坐标提交/相机/跳跃弧线、resize/取消/切图/旧包、bridgeLevel 原地变更的单次 RenderDomain 投影未形成共同 ABI/验证。 |
| **FG-05 可重放/CI** | Map7/21/47 源指纹、静态测试 36 pass（本地 Agent 记录）、独立统计核对 | **OPEN**：完整逐步期望输出目前主要留在 gitignored `.local/`；BFS+桥带尚未合并重播；无已证实可合法分发的真实最小 golden fixture、无相应 CI run/SHA。live skip≠PASS；既有 Map7 附录 A 的原始事件转储许可待核。 |
| **FG-06 资格/Agent 交接** | 设计与四 PR 拆分方案、C-01～08 待冻结目录 | **OPEN**：唯一合同、固定实现 base SHA、AG-01～04 精确任务卡、M14/M15 ledger 与 CI 运行 SHA/变更 subject 差异、正式 reviewer 签核缺失。 |

## 3. 审查卡：状态与新发现的拼接边界

| 卡 | 本轮已完成的**有限结论** | 剩余验收 |
|---|---|---|
| REVIEW-01 | 静态移植 `passable?(d=0)` 并计算 Map21 八事件 0/2 `over_trigger=true`，判为 `here`，不再由空图形直接猜结果 | 原版 RGSS 实测 `start`/执行帧、事件重复与方向输入；静态值与动态值不一致须修规则。 |
| REVIEW-02 | 1D/长度、负 tile、孤立 655、坏 111/117 等 fail-closed，Map7 限定范围重新得零桥 | 保存完整输入/异常分母；未知执行入口与未复现变体不扩大证明范围。 |
| REVIEW-03 | Common Event 按调用入口做递归可达闭包及合成测试 | Autorun/parallel 和方法体间接调用需明确支持边界，不能声称整个游戏无桥。 |
| REVIEW-04 | 按 mapId 比较连接源/目标格，记录三 PBS 行的几何与 D0 对照 | importer 真实误删尚未复现；正确保留规则需在 C-03 冻结。 |
| **E2E-21（新增，尚未关闭）** | `fromMap7Landing.bfs.found` 与 `ontoBridge.continuous` 各自可成立 | **当前代码将 BFS 与上桥分别模拟，On 段重置初始 bridgeLevel=0；`traceStep.transfer=null`。必须从真实 Map7 edge 输入起，将所有步骤及状态合并 replay、逐格走到真实 Bridge 图块、出桥折返并检查状态及事件次数。不能把分段证据称完整端到端。** |
| `LD-47-DYN` | Map47 静态 30 格、合法跳跃样本及逆向结果 | 边界/起终阻挡、原版中间格事件、跨图支持与跳跃帧/相机；实际地图缺样本时用明确标注的合成反例。 |

详细修复/复现命令与观察方式见[证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)。§14.6 历史草图和 §15.3 分段静态路线不能作为无需进一步验证的完整实现合同。

## 4. 唯一规范合同 C-01～C-08 的精度

| ID | 必备字段级交付 |
|---|---|
| C-01 Data | `struct.Tileset` 全 keys（保留 `autotile_names`）、`terrain_tags` 1D Table/长度/tag 0–17/坏值/引用、旧 fixture 与 M12 Content 的迁移和报错 |
| C-02 Semantics | `resolveEffectiveTerrainTag` vs `evaluatePassability` 分离；None/Neutral/NoEffect、桥上下、tile priority、源/目标方向位及严格边界 |
| C-03 Event | MapTransfer/MapAction namespace/key/exact schema，`size` 所需占用、页面/事件码白名单、`over_trigger?` 判定事实、动态状态筛选和相关候选 fail-closed；无通用解释器 |
| C-04 Time | 先 `can_move`、失败 front touch 或成功 walk/jump→arrival、`start`/execute/重复触发/held input/edge/step/转图顺序与错误恢复 |
| C-05 State | bridgeLevel 数值/初始/转图/Frame 生命周期，脚本真实生效与 tile-depth 重投影时点；不自行扩大现有四字段初始输入 |
| C-06 Motion | blocked/walk/jump exact Runtime↔Browser payload、duration/单 ID/scene+visual epoch、相机/帧/弧线/resize/取消/重放/切图/坏包 |
| C-07 Support | 只承诺 Neutral/Bridge/Ledge；其他 tag 保留原值，不冒充水/冰完整玩法；未有 NPC 投影则明确支持边界 |
| C-08 Qualification | 新 schema subject vs M14 历史 first-slice、M14/M15 ledger+workflow/run+exact SHA、旧断言漂移和新覆盖矩阵 |

冻结文件必须附 exact TypeScript/JSON 正反例、producer→consumer、bridgeLevel×通行×事件与 idle/walk/jump/transition/event-running×输入/完成/resize/transfer/cancel 状态矩阵，列 mapId/方向/坐标/event start/execute/motionId/depth/下一输入和 RenderDomain 原子边界。不可由 Agent 凭“复刻原版”自行发明 ABI。

## 5. 实施顺序、停工与签核

待签核后依次：PR1 数据/importer/transfer，PR2 map-owned 纯规则和 blocked/walk（冻结完整 MovementPlan 类型但暂不执行 jump），PR3 Map21 桥事件/Runtime/深度、Map7 负例，PR4 Map47 jump/Browser 动画。PR4 planner 可独立准备，但共享 Runtime/Browser 合流依审核后的共同协议。不得硬编码 map/event/tile ID、不改原版 passages、不建外部插件/万能事件解释器、不向 framework/Renderer/Hostra 放玩法。四份 AG 任务卡目前只是草案，不得当已授权实施。

当前最短验收路径：`E2E-21` 完整静态 replay 与负例 → 如可用则原版 RGSS 帧日志，缺失则正式 BLOCKED → Map47 跳跃动态与支持界限 → 许可/最小 fixture/真实 CI → exact CONTRACT_V1、ledger/ABI 审查与六门禁逐项签核。每项都记录 `source SHA + input+初态 + expected/actual + evidence grade + test command/exit/pass-fail-skip + CI run/SHA + reviewer`。只停止受阻分支，不编造证明或篡改 M14/M15 历史。

**结论：六道门禁仍全部 OPEN；`NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED`。**
