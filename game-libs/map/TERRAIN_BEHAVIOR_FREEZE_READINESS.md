# 地形行为系统：规格冻结门禁与 Agent 实施交接

> 状态：**Freeze preparation / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 Map 7 负证据后复核修订。本文管理门禁，不是已冻结合同或已实现代码。原始记录见 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md)，复核边界及 Map 21 后续交接见 [证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)。[设计草案](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) 是背景，[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 管交付。
>
> 架构不变：内部易扩展，无外部插件/handler/DSL/通用 RMXP 解释器；`tools` 导入、`game-libs/map` 掌握规则和业务状态，Browser 消费严格投影，不独立推导碰撞。**样本职责：Map 7 Cedolan City = Bridge 负例/普通传送回归；Map 21 Route 2 = Bridge 正例待完整取证；Map 47 Route 7 = Ledge 正例待取证；Map 27 Day Care 不作桥样本。** 不得再请求 Map 7 上不存在的桥头事件 ID。

## 1. 冻结的准确含义和证据分级

Agent 给定固定 base SHA、唯一规范版本、原版证据、可取得 fixtures、准确任务卡和现成验收命令，即可不猜原版事件、字段、motion ABI、资格范围而实施。`Design draft → Freeze candidate → Contract Frozen / Implementation Pending → Implemented / Qualified` 是不同状态；只有六门禁均有可复核证据和审查签核才能冻结；代码及资格须后续实际验证。

拟议唯一规范性增量入口 `TERRAIN_BEHAVIOR_CONTRACT_V1.md` **尚未创建**；不以草案、计划、证据或本清单冒充合同。历史 M14 first-slice 的原适用范围不追溯改写，但当前 Tileset 已有 `autotile_names`、新增 `terrain_tags` 拟形成新的 qualification subject；按文档治理记录 schema 和资格基线漂移。

事实强度必须分开：`OBSERVED`（指定原始文件/源码/实际运行、带指纹与位置）、`INFERRED`（基于事实的静态推论）、`UNVERIFIED`（尚待验证）、`INCOMPLETE`（缺数据/扫描未覆盖）。负结论同时写清扫描分母与所有未检查入口。原证据的 Map 7 无直接桥调用／无 Bridge 格是**指定 corpus 和当前扫描范围的记录**；移动路线内脚本、嵌套调用、缺表/坏引用的严格性尚待 [复核文档 §2](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 补证，不能用无条件的“所有调用已排除”代替。

## 2. FG-01～FG-06（全部 OPEN）

| Gate | 必须提供的证据与冻结条件 | 状态 |
|---|---|---|
| **FG-01 原版事实** | Map 7：负例、11 事件/19 页/521 命令的已记录扫描及严格性补强；**Map 21**：桥格、8 个直接脚本事件及其他候选的 map/event/page/命令、`size(w,h)` 碰撞和桥端路线完整取证；Map 47：Ledge 起点/落点/边界/事件；v21.1 源码与逐帧时序可复核 | **OPEN**：Map 7 原始记录有；移动路线/间接脚本与坏数据扫描边界未闭；Map 21 目前只有清单/页摘要；Map 47 和原版动态跟踪未完成 |
| **FG-02 数据和导入** | 当前 Tileset keys + exact terrain_tags Table/引用/迁移；MapTransfer 与狭义 MapAction schema/producer/consumer；Map 21 真实 `projectedD0Passable` 静态筛选差异；相关候选 fail-closed、无关事件排除 | **OPEN**：未给出字段级合同，Map 21 传送误删仅是潜在风险，不能宣称已复现 |
| **FG-03 事件/状态** | `can_move` 成功/失败、touch start 与解释器执行分离、桥端 `size` 命中、step/edge/transfer/held input、bridgeLevel 进入/离开/跨图/Frame、碰撞支持边界和原子失败 | **OPEN**：Map 21 时序/`size()` 与状态机未证；禁止 contact 执行后立即重算同一次输入 |
| **FG-04 运动及呈现** | walk/jump exact ABI；Runtime/Browser 所有 250ms 路径、ID/epoch/duration/相机/resize/取消；桥深度缓存失效及同次 RenderDomain 提交 | **OPEN**：精确字段和双方验证尚无定稿 |
| **FG-05 验收可重放** | Map 7 **负例**、Map 21 **桥正例**、Map 47 **Ledge 正例**分别固定原始指纹、可复现起点/输入/expected；许可明确的最小派生 fixture，实际测试命令/结果/skip，CI 与本地差距 | **OPEN**：既有 live test 无素材会 skip；无完整测试日志、可分发 golden fixture 或 Map 21/47 路线；不得把 skip 写 PASS |
| **FG-06 Agent/资格交接** | 固定 base SHA、合同版本、AG-01～04 精确路径/交付/验收/停工卡、历史 ledger 与当前 CI 的 SHA/运行记录、schema 漂移策略、Reviewer 签核 | **OPEN**：尚无冻结任务卡和资格闭环 |

Map 7 子项不是一个要求查出桥头 ID 的正例任务。证据 §13 记录 corpus 69/69 张地图扫描，Map 21 有 93 个 Bridge 格和 8 个 `pbBridgeOn/Off` 直接脚本事件，另有 2 个因邻接列入、脚本非桥的候选；这些属于**已记录扫描观察**，不是 Map 21 完整事件、动态行为或桥功能测试已通过。Map 7 的 32 条 door contacts/四条 edge 是传送基线，未证明该图因桥误删出口。所有门禁保持 OPEN，不能因任一文档新增就标 PASS。

## 3. 三个 P0 设计断点及本次新增取证质量门槛

**P0-A 事件时序。** v21.1 `Game_Player#move_generic` 先判方向通行，失败才检查面前 touch，`Game_Event#start` 只是待执行标记；冻结时要记录 `input → check → start → interpreter → bridgeLevel → following input` 与成功行走后事件路径，原版真正逐帧观察缺失时写 UNVERIFIED。Map 7 没桥脚本，须以 Map 21 证据验证桥头，不能凭避免死锁而立即重算同一次输入。现有 Runtime `ContactTransfer` 先于 `canMove` 是待兼容审计的当前行为，不是原版依据。

**P0-B 导入时不能删动态事实。** `projectedD0Passable` 仅知道 passages/priorities，现有 step/contact/edge 过滤需与 Map 21 的**实际输入和投影记录**核对，列源事实→当前投影→正确保留范围。仅确定性静态事实可过滤；动态桥状态须延后 Runtime。无关 NPC/剧情事件不令整图失败；已识别且无法保真的桥候选带 map/event/page 与原因 fail-closed。仅潜在风险不得称已复现。

**P0-C 运动和深度同协议。** Browser 校验、启动、重入、插值和 Runtime 的 walk 路径均涉及 250ms；jump 是一次动作而非两次 walk。桥状态即使玩家与 camera 不动，也使 tile-depth 缓存失效；桥层与人物/相机投影经同次 RenderDomain 更新、scene/visual epoch 一致接收，不将玩家全局置顶。

**取证质量新门槛。** 证明“无桥”的严格模式须验 Map/MapInfos/Tilesets/CommonEvents 存在、相关 Table 尺寸及每个放置 tile 引用合法；`bridgeTerrain.missing`、跳过地形扫描、未知移动路线脚本/递归 common event、坏数据不能冒充零命中。脚本入口应覆盖直接 355/655、209/509 内真实可执行脚本和可达 CommonEvent；间接 Ruby 无法静态确认时列 INCOMPLETE，不需要也禁止执行任意源 Ruby。测试有素材才能写 live PASS；记录退出码、通过/失败/skip 数、命令、SHA、覆盖分母。原始命令转储及派生 fixture 先核实分发许可，不明时保留本地仅提交最小事实/哈希/再生成方法，不假装 CI 具有本地 FSDB。具体交接见 [证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)。

## 4. CONTRACT_V1 必备章节（exact types、正反例、producer/consumer）

| ID | 需精确冻结 |
|---|---|
| C-01 Data | `struct.Tileset` 完整 keys（含已有 autotile_names）/terrain_tags RGSS Table 维度、长度、0–17/坏值、tile 引用、旧 fixture/版本迁移、Content 读取错误 |
| C-02 Semantics | `resolveEffectiveTerrainTag` 与 `evaluatePassability` 各自签名、逐层/优先级；非空 None 仍查 passage、Neutral 忽略本层、NoEffect 不等 Neutral、Bridge 上下、源格与目标格双向位和边界 |
| C-03 Event data | MapTransfer / MapAction 各自 namespace/key/schema，Map 21 已验证的 event/page/命令白名单及 `size` 所需事实、动态/静态页面、冲突、未知候选 fail-closed；不运行 Ruby |
| C-04 Event order | input/check 分叉、失败 touch `start`→脚本执行→后续输入；成功 movement→抵达事件/transfer；step/edge/held input/多个事件优先级，现有 ContactTransfer 的兼容决策 |
| C-05 State | bridgeLevel 数值及取值/初始/转图/Frame 生命周期，真正脚本生效和 tile 重投影提交边界；不能擅自扩大原四字段启动输入 |
| C-06 Motion | blocked/walk/jump plan，Runtime↔Browser exact payload、duration/ID/scene+visual epoch、坐标提交、人物帧/跳跃弧线/相机、resize/取消/重播/切图/非法输入 |
| C-07 Support | 只实施 Neutral/Bridge/Ledge；其他 15 个 tag 保留原值但不假称完整玩法，bush/counter 独立；无证据的动态 NPC 碰撞/跨图跳跃明确不支持或补最小事实 |
| C-08 Qualification | 当前 schema vs M14 历史 first-slice、正式 M14/M15 ledger、workflow/run/exact SHA、旧断言漂移，新 subject 测试及证据矩阵 |

必须补 TypeScript/JSON exact 示例和非法样本、桥层×通行/事件与 idle/walking/jumping/transitioning/event-running/aborted×输入/完成/resize/transfer/cancel 的**精确状态矩阵**，列 mapId、位置/方向、bridgeLevel、事件 start/execute 次数、motionId、depth、下一输入。PR 2 冻结完整 MovementPlan 类型但只执行 blocked/walk；PR 4 才实现 jump，不造空执行器。没有源码和事件依据时，不硬编码地图坐标、tile ID 或补万能 callback。

## 5. 实际验收和任务卡

测试族：`DATA-*`、`TR-*`、`BR-PASS-*`、`BR-EVENT-*`、`BR-RENDER-*`、`LD-JUMP-*`、`MOTION-*`、`REG-*`。Map 7 应有 `BR-EVENT-MAP7-NEG-*`（无桥）及门/edge/Neutral 回归；**Map 21** 应有 `BR-EVENT-MAP21-*` 真桥端/桥上下/返回/遮挡/传送；Map 47 应有真实 Ledge 正反例、落点及中途事件。各 Given/When/Then 明确初始状态、输入、位置、事件次数、画面/动作。不能用合成桥正例替代 Map 21，也不能以未跑的测试名称宣称通过。合法 fixture 尚不存在则 FG-05 保持 OPEN。

四张实施卡（**范围草案，尚不能派单**）：

| 卡 | 依赖和修改范围 | 交付／停止线 |
|---|---|---|
| AG-01 | 冻结后 importer、Tileset validator、MapTransfer、fixture/Content 测试；禁止改 Core 或原始 passages | terrain_tags 端到端和动态传送事实，发现 schema 不兼容即上报 |
| AG-02 | AG-01 后 Map Library 纯规则与 Runtime 最小接线 | 有效标签 vs 通行、Neutral/Bridge、blocked/walk 回归；jump 仅冻结类型 |
| AG-03 | AG-02 后已验证 **Map 21** 桥事件、MapAction/Runtime/投影和必要 Browser | bridgeLevel、size 碰撞、两端/桥下/折返/遮挡/传送；无法保真则停受影响工作 |
| AG-04 | AG-02 后可先写独立 planner；共享 Runtime/Browser 集成依 AG-03 协议 | Map 47 一次两格 jump、落点/逆向/阻挡、相机/弧线/resize/切图；原版冲突先改合同 |

每卡填写 `baseline SHA / contract version / 依赖 / 精确允许与禁止路径 / deliverables / test IDs 与实际命令 / 预期断言 / 停工和报告`。禁止 AG-03/04 无审查同时覆写共享 Runtime/Browser。遇缺 FSDB、原版证据冲突、无法保真、CI fixture 不可合法复现或旧资格 baseline 失败，只暂停相关项并报告事实→冲突条款→备选方案→下游测试，不放宽校验、编造坐标或篡改 M14/M15 历史。

## 6. 签核记录模板及下一步

```text
Specification: TERRAIN_BEHAVIOR_CONTRACT_V1.md (NOT CREATED)
Version / implementation base SHA: <实际冻结时填，不使用浮动 main>
Source: <v21.1 commit/blob + Map 7 negative + Map 21 Bridge + Map 47 Ledge + FSDB/fixture SHA-256>
Extractor scope: <全部入口、缺失/间接/异常、真实运行和 CI skip 差距>
FG-01 .. FG-06: <每项独立 PASS + 原始证据/复核结果>
Schema/ABI owners, qualification ledger/run/SHA, unsupported, reviewer: <逐项填写>
Status: Contract Frozen / Implementation Pending（仅全部 PASS、签核后填写）
```

**执行顺序**：补强现有取证器并重跑 Map 7/corpus → 以 Map 21 完成真实桥正例及 `size`/触发/传送取证 → Map 47 悬崖取证 → 数据和运动 ABI／两张状态矩阵 → 许可明确的 fixtures 与实际测试 → M14/M15 当前资格基线 → 定稿合同、四卡和签核。若新证据推翻拟议规范，先修规范/测试/任务卡并重新审查；直到所有门禁真实 PASS，始终保持 NOT FROZEN。