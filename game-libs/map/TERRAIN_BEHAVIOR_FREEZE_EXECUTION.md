# Terrain Behavior：冻结准备执行记录与验收关口

> **FREEZE CANDIDATE COMPLETE / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。这是冻结准备工件，不是对既有 6 个 gate 的代签。起点：分支 `docs/map-terrain-behavior-freeze-handoff`，工作基线 `922890356cd505d06350cc3f67510a2482d65f11`。`TERRAIN_BEHAVIOR_CONTRACT_V1.md` 未创建、未签核。合同精度见 [候选](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md)；新运行日志见 [证据 §16](./TERRAIN_BEHAVIOR_EVIDENCE.md)。
>
> 唯一入口：[冻结门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 管 FG-01～06；[证据 §15](./TERRAIN_BEHAVIOR_EVIDENCE.md) 记录本地 Agent 的取证输出；[证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 约束结论强度；[合同候选](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md) 记 C-01～08 的已知事实与 OPEN 决策；[任务卡](./TERRAIN_BEHAVIOR_AGENT_TASK_CARDS.md) 是冻结准备执行顺序。`TERRAIN_BEHAVIOR_CONTRACT_V1.md` 未创建、未签核。

## 1. 本次准备实际能确认的事实

- Map7 是限定扫描范围内的 Bridge 负例，Map21 是 Bridge 正例（本地记录 93 个 tag15 格、8 个直接桥脚本），Map47 是 Ledge 正例（本地记录 30 格）；Map27 Day Care 不替代 Map21。原始文件 SHA-256 详见证据 §15。
- 已提交的取证代码对 Map21 八事件进行了 bridgeLevel=0/2 的 `over_trigger?` **静态**计算，结果均为 `here`；这是静态规则推导，不是原版 RGSS 实测。Fixed v21.1 `Game_Event#start` 并不等于 interpreter 脚本同步执行。
- Agent 的 Windows 10 / Node v22.12.0 本机报告：两份取证测试 36 pass / 0 fail / 0 skip，并重跑 Map7/21/47 与 69 图 corpus；当前准备环境**未独立获取原始 FSDB、未运行这些命令**，不重贴旧数字当新验收。此前未查到取证提交关联的 PR workflow run；不等于证明全仓库从未运行 CI。
- 工具 `map-evidence-independent-check.mjs` 重新计数 Map21 桥格/桥脚本 IDs、Map47 Ledge 格；**未**独立验证 `over_trigger?`、逐帧时间、全路线或 RenderDomain。
- 本轮核对到当前 `src/semantics.ts` 中 Tileset 只有 `id,tileset_name,autotile_names,passages,priorities`，MapTransfer 是 `{id,steps,contacts,edges}`；`src/runtime.ts` 的 `InitialInput` 仍只有 `{mapId,x,y,characterName}` 且普通 walk 250ms。terrain_tags、MapAction 与 jump 线上 ABI 尚不存在，不能当作已实现。
- 本机 **有** 官方 FSDB（路径与 SHA 见证据 §16）。本机 **无** 原版 RGSS `Game.exe`/`RGSS*.dll`；`play.bat` 是 Hostra/Electron。动态验证 BLOCKED，门禁不降级。
- E2E-21 统一 replay 已从物化 Map7 edge 连续跑完四组，STATIC-INFERRED，独立 `tableAt` 核对通过。不得标 DYNAMIC-OBSERVED。
- Map47 静态 30 跳、逆向全失败、404=`show-choices-branch-end` 且不在 Ledge 格。合成负例已分开标注。
- 合成 fixture 可进 CI；原始 rxdata/附录 A 仍无再分发许可。CI 失败 run [35499223917](https://github.com/lithdoo/loom-realm/actions/runs/35499223917) 在 `faf4c64`（EV-SAFETY-01）。修复后绿 run [35499617524](https://github.com/lithdoo/loom-realm/actions/runs/35499617524) 在 `5b550b4`：**100 pass / 0 fail / 6 skip**。6 skip 均为 live FSDB，skip ≠ PASS。许可未签，FG-05 OPEN。
- 当前 `src/semantics.ts` Tileset 仍无 `terrain_tags`；Runtime `InitialInput` 仍四字段；jump ABI 未实现。候选合同已写 PROJECT DECISION，未签核。

## 2. 强制交付顺序与完成判据

| 顺序 / 卡 | 要交付的实际工件 | 硬性完成判据 | 当前 |
|---|---|---|---|
| **FZ-00 锁定事实** | 固定上游 SHA/三图文件 digest/本地分支及 CI run；核对源/目标 mapId 与原始事件命令 | 审查者能重放源文件 SHA 与源代码路径，记录环境、命令、退出码、skip；不改历史证据 | 本机已重核 SHA（§16）；绿 CI `35499617524` on `5b550b4` 为 100/0/6 skip |
| **FZ-01 E2E-21 静态拼接** | 单一状态 machine 的 Map7 edge→Map21 landing→BFS→Off→On→**真实 Bridge tile**→Off→折返/回 Map7 的统一 trace 与负例 | 每步连续 mapId/x/y/direction/bridgeLevel、事件 ID/page/start/execute 分离、transfer、pre/post 与输入可用时刻；与原始图层/连接独立核对；有针对性回归且真实 FSDB 运行 | 静态闭合 STATIC-INFERRED；非 DYNAMIC |
| **FZ-02 原版动态** | v21.1 RGSS 桥、跳跃、事件重复、held input、地图传送、相机/帧日志 | 每组有输入/初态/帧次/事件 start 与 execute/桥层/坐标/截图或结构化日志，和静态输出逐项对照 | BLOCKED：无 Game.exe；门禁不改可选 |
| **FZ-03 Map47 行为边界** | 两格 jump 的方向、源格、mid、land、事件/阻挡、边界/跨图支持矩阵 | 真实 Map47 与明确标记的合成负例分开；动态必需范围同 FZ-02；不以 `jump=2 walks` 替代 | 静态闭合；动态 BLOCKED |
| **FZ-04 许可+fixture+CI** | 可合法分发的最小 fixture、派生过程和 digest；可在 CI 实跑的 map test workflow | 可追溯许可；CI run/commit SHA + pass/fail/skip 逐项；真实 live 项不能 skip 当 PASS；处理既有 Map7 附录 A 许可风险 | 合成已提交；绿 CI `35499617524` 已记 skip=6；许可仍 OPEN |
| **FZ-05 C-01～08 决策** | [合同候选](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md) 的 DEC-01～07 全部证据化裁决，单一规范、版本、exact TS/JSON、反例矩阵 | Producer/consumer、MapAction、MapTransfer、bridgeLevel、事件时间、Motion/Browser payload、数据迁移、资格测试全部无 OPEN 或相互矛盾条款 | 候选已写 PROJECT DECISION；动态/签核仍 OPEN |
| **FZ-06 资格与签核** | [门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 逐项证据/审核人/日期，正式任务卡 baseline、M14/M15 subject/CI 精确关联 | 六个 gate 经授权审查者独立 PASS，所有要求的来源和 workflow SHA 可访问，才创建/签核唯一 `CONTRACT_V1` 并声明 `Contract Frozen / Implementation Pending` | OPEN；Agent 不代签 |

**依赖**：FZ-00→FZ-01；FZ-02/03 可同组收集但必须在 C-04/05/06 最终签前解决，或取得明示且有记录的门禁变更审查；FZ-04 与 FZ-05 可并行准备但各自签核后才能 FZ-06。若运行条件缺失，保留相关项 BLOCKED；其余无环境依赖的准备可继续，禁止虚构日志。

## 3. E2E-21 最小可执行审查合同：已发现代码缺口，不是假想风险

现有 `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map21-bridge-routes.mjs#buildMap21BridgeRoutes`：

1. `fromMap7Landing.bfs` 单独从 `(Map21 landing,bridge=0)` 搜索到 Off 的陆地外侧；`ontoBridge` **重新**从 `enter` 人工构造 bridge=0 开始，而不是消费 BFS 的最终状态。
2. `onBand` 从 `ontoBridge.final` 独立 replay，`offBridge` 也从 `ontoBridge.final` **另起一条**，并非从 `onBand.final` 下桥；`retrace` 又重设状态。分别 `continuous=true` 不等于整体连续。
3. `map-route-trace.mjs#traceStep` 对所有步 `transfer:null`；`replayInputs.continuous` 只比相邻 mapId/x/y，没有比对 bridgeLevel/direction 和是否发生真实 edge。
4. `applyStarts` 把推定脚本执行立即结算并重置 busy，适用于粗粒度静态路线，但**不是** RGSS 帧或“下一输入已实际可用”的证据。
5. `bfsWalk` 使用通用 `traceStep`，其中可返回 ledge-jump；若称「步行 BFS」，须禁止/单独标出 jump，不能把跳步混入无说明的 ordinary walk。
6. `landingCellsFromConnectionAudit` 同时取 sampleIncoming/sampleExpected；须证明所选 landing 的 **source edge 确实出现在已物化 MapTransfer/7**，而不只是一个预期样本。

### 必须输出的一个统一 trace（不是四份自洽分段 JSON）

对四组 On/Off 分别从真实 `MapTransfer/7` edge 出发，保持唯一 state；执行入图、Map21 landing、逐步 BFS、Off、On、实有 tag15 的桥面、沿桥面、下桥 Off、折返与返回/阻挡。每步记录：`index, sourceMapId, from(x,y,direction,bridgeLevel), input, source+target passability, kind, to(mapId,x,y,direction,bridgeLevel), eventId/page, overTrigger, started, executed?, afterEventBridgeLevel, transfer?, nextInputEvidenceGrade`。特殊动作注明 logical step vs RGSS frame；发生 transfer 时必须由源+目标记录及来源构造，不能只在静态 tracer 写 null。

**判错测试（应使旧版失败）**：移除/阻断从 landing 到 enter 的一步后整体失败；单独段成立但方向/桥层不连续时整体失败；改变 MapTransfer/7 的实际落点，未物化 sample 不得冒充来源；`onBand` 最终状态必须实际成为 Off 段起点；多次进入 size 占用、前向 bump、重复 On/Off 脚本次数可核对；桥面 tile 真为 tag15；反向落点和 transfer 后桥层归零；存在 jump 时路径显式拒绝或注明。测试须同时用独立的原始图层与连接核算，不仅比对 tracer 自己输出。

**验收**：合成数据上的断链与重复触发测试 + 有本地 FSDB 的真实四组 trace + 二次独立核对，实际命令/退出码/输入 SHA-256 入证据；不能仅称 `bfs.found`、`ontoBridge.continuous` 即 E2E PASS。原版 RGSS 仍另外验收。

## 4. FG-01～06 当前逐项状态（冻结前不能自动关闭）

| Gate | 已有事实 | 未满足、审核门槛 | 状态 |
|---|---|---|---|
| FG-01 原版事实 | 7/21/47 静态源数据、触发与跳跃样本；E2E-21 统一 STATIC-INFERRED | FZ-02 原版事件/动作时序仍缺 | OPEN |
| FG-02 数据导入 | 真实 Map21 PBS 3 行/7 edge，源/目标空间分离，D0 风险审计；C-01 候选校验器 | schema 未进 Runtime；迁移未签 | OPEN |
| FG-03 事件状态 | 原版源码 start≠execute，8 事件静态 here；统一 replay 分 checkpoint | held input/帧边界无 RGSS | OPEN |
| FG-04 运动画面 | 现有 250ms walk、scene/visual epoch；静态 jump≠两 walk | jump duration/相机无 RGSS | OPEN |
| FG-05 复现资格 | 合成 fixture + 本机 live 测试 | 许可未书面确认；绿 CI `35499617524` 为 100 pass / 6 skip；live skip ≠ PASS | OPEN |
| FG-06 Agent 交接 | 精确候选合同与未授权任务卡 | 无 reviewer 签核、无 CONTRACT_V1 | OPEN |

## 5. 原版验证无法执行时的正式阻碍流程

只有确实没有合法 RGSS 环境或原始素材，才能填 `BLOCKED`，须提供检查命令/路径/错误、准确缺失项、影响的事件/路线/门禁、可复现操作及替代证据。`BLOCKED` **不等于 PASS，也不默认允许通过 Gate**。如项目决定不强制动态原版验证，必须由授权 reviewer 明确变更 FG-01/FG-03/FG-04 的验收条件、风险承担者与版本记录；本执行文档或 Agent 不得单方面把动态验证改成“可选”。

## 6. 文件职责与签核模板

- `TERRAIN_BEHAVIOR_EVIDENCE.md`：原始事实与**真实运行结果**，历史 §14 不篡改，后续新日志另起带时间/输入指纹段。
- `TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md`：复核证明范围、逻辑缺陷与撤销的过强结论。
- `TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md`：未经签核的精确方案与 OPEN 决策；不能用于生产实现。
- `TERRAIN_BEHAVIOR_AGENT_TASK_CARDS.md`：冻结准备卡及**被 gate 阻断**的四个玩法 PR 卡。
- `TERRAIN_BEHAVIOR_FREEZE_READINESS.md`：唯一 Gate 状态管理；六项不能因“新增了候选文件”改变为 PASS。

```text
Review date / reviewer: <实际填写>
Source commit + FSDB Map007/021/047, Tilesets, CommonEvents, PBS sha256: <实际验证>
E2E-21 unified trace + independent check + tests/exit: <实际填写>
RGSS observation or approved gate change: <日志或正式批准记录，不可填假 PASS>
Map47 dynamic/support boundary: <实际填写>
Fixture redistribution basis + CI workflow/run/commit SHA: <实际填写>
C-01..08 final reviewed schema/ABI version: <实际填写>
M14/M15 applicability and changed subject: <实际填写>
FG-01..06 individually PASS + reviewer: <实际填写>
Contract status: NOT FROZEN（只有六项 PASS 后才修改）
```

**本轮出口：FREEZE CANDIDATE COMPLETE / NOT FROZEN。** 本地可做的工具、静态 E2E、合成 fixture、C-01～08 候选 ABI、POSIX `forensicRelPath` 修复已完成。外部阻碍：RGSS、素材再分发许可、授权 reviewer 签核。合成 CI 绿仍不能关闭 FG-05。禁止把候选重命名为 V1 或授权 AG-01～04。