# 地图地形行为系统：实施闭环与验收计划（Essentials v21.1）

> **Implementation plan / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。取证代码基线 [`e60e4a52`](https://github.com/lithdoo/loom-realm/commit/e60e4a521a726233bbda0bb1892f6d25bc47573d)；[证据 §15](./TERRAIN_BEHAVIOR_EVIDENCE.md) 记录静态重跑，[证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 区分已证与 E2E-21 缺口，[冻结门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 逐项管理准入，[设计草案](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) 管架构。本计划不是已冻结合同；所有 FG OPEN，M14/M15 历史资格不追溯改写。
>
> Map7＝Bridge 负例；Map21＝Bridge 正例（静态 93 格/8 事件）；Map47＝Ledge 正例（静态 30 格）；Map27 不作桥样本。**取证工具产生静态结果，不等于 Runtime/Browser 已实现，更不等于原版游戏动态验收。**

## 1. 全链路、断点与当前证明范围

```text
固定 v21.1 原 Map/Tileset/Event + 文件指纹
 → 严格取证（入口分母/坏数据/许可证据/静态与动态分列）
 → tools selective importer：terrain_tags + 狭义事件/连接事实
 → prepared FSDB → M12 Content 严格校验
 → map-owned terrain 识别 + 逐层通行（彼此独立）
 → 方向输入 can_move：失败 front touch；成功 walk 或 ledge jump
 → 移动完成 arrival 事件 start → 后续解释器执行 → Runtime 桥状态
 → 同次 RenderDomain 人物/相机/depth 投影 → map-owned Browser
 → Map7 负例 + Map21 桥正例 + Map47 悬崖 + 旧 M14/M15 回归
```

**事件：** Map21 八个空图形 `size()` 的 `over_trigger?` 已在 bridgeLevel 0、2 静态计算 true，预测成功落入占用格走 here；这依赖原版 `map.passable?(d=0)`，不是“空图形天然 walk-on”。`Game_Event#start` 只置位，解释器/held input/重复触发仍缺逐帧日志。不能把当前 Runtime 先 ContactTransfer 后 canMove 的路径照搬成桥规则，也不能 contact 后立即重算同次输入。

**传送：** Map21 三条 PBS 连接物化 7 edge；目前无已证实误删，67 个 D0-false Bridge 格仅为遇到该类落点时的潜在风险；`21,E,77,47` 的零边是几何越界。源/目标格须携带各自 mapId/tileset，不以同一 `(x,y)` 误比两个地图。以后 importer 修正只能依据字段合同与实际正反例，不能为未复现故障牺牲既有传送。

**运动：** 现有 Runtime/Browser 普通 walk 多处固定 250ms；jump 必须是一次动作，冻结双方 payload、相机和画面弧线、结束/取消/转图。桥状态原地变化需使 tile-depth 缓存失效并与人物同次投影。Browser 不决定碰撞；framework/Renderer/Hostra 不持地图玩法。

## 2. 阶段 0：唯一剩余取证闭环（不要重复已完成调查）

| ID | 已交付的依据 | 下一项必交证据及完成线 |
|---|---|---|
| `EV-MAP7` | 当前 Agent 报告 Map7 11/19/521、零桥、限定入口内 COMPLETE，已补 bad Table/脚本/CE 测试 | 保留输入 SHA、扫描范围和未覆盖入口，作为负例；不索取不存在的 Map7 桥头事件。 |
| `REVIEW-01～04` | 0/2 触发矩阵、fail-closed、Common Event 可达闭包、跨图坐标及 PBS 对照，静态代码与合成测试已提交 | 静态子项可供审查；不能从这些测试推出原版解释器逐帧行为、全方法体覆盖或 CI/资格 PASS。 |
| `E2E-21` **仍 OPEN** | §15.3 的 BFS 从 Map7→21 落点 `(19,76)` 到四组陆地侧桥头，另有 Off→On/On→Off 静态片段 | **同一初始状态连续 replay**：真实 Map7 输入/edge/转图归零→Map21 BFS→Off→On→真实 Bridge-tagged deck→离桥/返程。合并状态、方向、bridgeLevel、事件启动与执行、路径正确性；新增会让“只分别验证两段”的旧实现失败的测试。当前 `traceStep.transfer=null`、On 段重新初始化，不能写端到端 PASS。 |
| `EV-MAP47` | Map047 指纹及 30 Ledge 格、静态合法样本 `(16,9)→(16,11)`，未知命令 404 被保留 | 落点/边界/正反阻挡完整矩阵；确认 404 在原版语义或明确列为本轮不涉及的结构码；真实 Map47 无中间事件时只用标明的合成负例，不造数据。 |
| `DYN-21/47` | 固定 v21.1 源码证明关键条件及 start≠execute | 原版 RGSS 实测桥 On/Off、重复输入/事件调度、地图连接、Ledge 一次跳跃/落点事件/帧、相机；保留场景、初值、逐帧输入/状态/日志与素材 SHA。若环境缺失，写 `BLOCKED` 和可执行复现方案；现行 FG-01 要求逐帧，**不得悄悄降级为可选**。 |
| `FIXTURE/CI` | 本地 Agent 记录 `36 pass / 0 fail / 0 skip`；统计独立核对脚本可用 | 解决素材分发许可，包括既有 Map7 附录 A；建立合法、能在 CI 执行真实正例的最小 fixture；提供实际 run URL、commit SHA、pass/fail/skip。无条件则 FG-05 OPEN。 |
| `SPEC/QUAL` | 设计、C-01～08 目录和四 PR 分工草案 | 先冻结字段级 ABI/错误/生产消费与状态矩阵，核 M14/M15 ledger、迁移 subject，再由 reviewer 逐一签核六门禁；`CONTRACT_V1` 尚不存在，不能提前标 Frozen。 |

**核心质量规则：** 独立核对器当前只确认 Map21 图块/脚本 IDs 和 Map47 图块统计，不能冒充对事件时序和 E2E 路线的独立检查。提交中的 36/36 是当时本地运行记录；本次文档更新没有重跑；CI 无 FSDB 时 skip ≠ PASS。§14.6 旧坐标草图不是逐步事实，§15.3 新片段也未与 edge 跨图模拟拼成一个完整状态轨迹。

## 3. 单次复现与验收格式

固定素材：Map007 SHA `c34ddaaec265241fd35149d6d3758f8f08a5503b057c891e396c39b08518c6b7`；Map021 SHA `cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575`；Map047 SHA `5f4ee232e4f4b8b44950f826b13cd601ffecb87e455c1dda92c5908152df043e`。其它依赖指纹在证据 §1、§14、§15。实际运行必须再核对输入 SHA，不得直接复制旧测试数字。

```text
node --test tools/fixtures/essentials-v21.1/map-event-evidence.test.mjs tools/fixtures/essentials-v21.1/map-evidence-acceptance.test.mjs
node tools/fixtures/essentials-v21.1/map7-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --corpus-scan --output ".local/map7-bridge-evidence.json"
node tools/fixtures/essentials-v21.1/map21-bridge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --output ".local/map21-bridge-evidence.json"
node tools/fixtures/essentials-v21.1/map47-ledge-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1" --output ".local/map47-ledge-evidence.json"
node tools/fixtures/essentials-v21.1/map-evidence-independent-check.mjs 7 21 47
```

以上是**可复现命令，而非本次文档写入时重新执行的结果**。每测试写 `testId / source sha / base commit / environment / initial mapId,x,y,dir,bridgeLevel / input / source+target tile+direction / actual location / event start,execute count / bridgeLevel / transfer / motion/depth / expected / actual / evidence grade / command+exit+pass-fail-skip / CI run`。完整逐步数据若只在 gitignored `.local/`，须明确“本地可重生但审查者无素材无法独立重放”，不得当作已提交 golden fixture。

## 4. 四个实现 PR：冻结后才派单

| PR | 依赖与修改范围 | 交付/验收及停止线 |
|---|---|---|
| **PR1 Data/Importer** | 已签 C-01/C-03、`m14-consumer` / `map-transfer-consumer` / schema / fixture / M12 Content；禁止改原始 passages/Core | terrain_tags 0–17、Table 完整校验及迁移，保留必要动态事件/传送事实；真实源→prepared→Content；如无法区分动态风险则仅停对应映射，报告 map/event/page。 |
| **PR2 Semantics/Walk** | PR1 后，map-owned 纯规则与 Runtime 最小接线；C-02/C-04/C-05/C-06 已签 | 有效标签与通行分离、Neutral/None/NoEffect/Bridge、源/目标方向位及旧传送回归；冻结完整 MovementPlan 类型但只执行 blocked/walk，不造空 jump 执行器。 |
| **PR3 Bridge** | PR2、E2E-21/动态证据/狭义 MapAction 合同；仅修改 map-owned Runtime/必要 Browser | Map21 真桥端、size、here/脚本时序、桥上/桥下/折返、转图清零和静止 depth 重投影；Map7 负例；不硬编码 map/event/tile ID。原版证据与合同不符就停。 |
| **PR4 Ledge** | PR2 与共享运动 ABI；planner 可以先独立准备，但共享 Runtime/Browser 接 PR3 协议 | Map47 前方判断/合法落点/阻挡/逆向、一次两格 jump、相机/弧线/帧/事件、resize/切图/held input；不把中间格当两个 walk。 |

PR1→PR2→PR3；PR4 与 PR3 禁止无审查并发覆写共享 Runtime/Browser。四个 AG 任务卡必须分别填写**固定 base SHA、合同版本、依赖、允许/禁止文件、exact tests/Given-When-Then、stop rule、审查责任人**；当前仅是范围草案，**尚不能派单**。不改 frameworks/Renderer/Hostra 玩法、不引入外部插件、DSL 或万能解释器。

## 5. 唯一合同与资格闭环

| 合同 | Producer→consumer、冻结到字段的要求 |
|---|---|
| C-01 Data | RMXP→importer→FSDB→Content：Tileset 全 keys（含 autotile_names）、terrain_tags 1D/长度/索引/迁移/失败策略 |
| C-02 Semantics | validated map/tileset→地形与通行两个查询：None/Neutral/NoEffect、桥层、priority、源目标双向/边界 |
| C-03 Event | 原始 page/trigger/size/命令→MapTransfer/MapAction：白名单、占用事实、动态条件、跨图 mapId、未知候选 fail-closed |
| C-04 Time | 输入→can_move→触发/完成→event start/execute→桥状态/下一输入；阻挡/held input/edge/step/多事件优先级 |
| C-05 State | Runtime→碰撞/渲染：bridgeLevel 数值/初值/合法值/转图/Frame/重投影边界 |
| C-06 Motion | Runtime↔Browser：blocked/walk/jump kind/from/to/duration/单 motionID/scene+visual epoch/相机/弧线/resize/取消/旧包 |
| C-07 Support | Neutral/Bridge/Ledge 子集与明确不支持的 NPC/跨图 jump 等场景，其他 tags 原值保留 |
| C-08 Qualification | M14 first-slice vs 当前 schema/new subject、M14/M15 ledger、workflow run/exact SHA、回归和签核 |

唯一 `TERRAIN_BEHAVIOR_CONTRACT_V1.md` 要有 TS/JSON 正反例、字段生产者/消费者、`bridgeLevel×passage×event` 与 `idle/walk/jump/transition/event-running×input/complete/resize/transfer/cancel` 精确状态矩阵，输出位置/方向、start/execute 次数、motionId、depth、下一输入与 RenderDomain 原子提交。没签合同不能靠“复刻/一致”让实施 Agent 猜协议。历史资格 ledger 不改写，新增数据形成新 subject。

**当前结束条件：E2E-21 与动态/fixture/ABI/签核尚未闭；FG-01～06 仍全 OPEN，NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED。**
