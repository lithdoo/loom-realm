# 地形行为系统：规格冻结门禁与 Agent 实施交接

> 状态：**Freeze preparation / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 对 `5e71c7e` 取证结果进行进一步审查。原始取证数据见 [TERRAIN_BEHAVIOR_EVIDENCE.md](./TERRAIN_BEHAVIOR_EVIDENCE.md) §14；**当前已知的过强结论、四项缺陷及修复验收以 [TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md) 为准**，不得直接用未修正的 §14.5～14.6 冻结 walk-on 语义。
>
> 样本职责：**Map 7 = Bridge 负例；Map 21 = Bridge 正例（已记录静态原始素材，行为与工具严格性待复核）；Map 47 = Ledge 待取证；Map 27 不作桥样本。** 所有门禁仍 OPEN。

## 1. 冻结含义与证据等级

正式冻结要求固定 baseline SHA、唯一规范及字段级 ABI、带指纹原版证据、合法可复现 fixtures、确切任务卡与验证结果、审查签核。设计草案、实施计划、原始证据及本门禁不是正式合同。拟议 `TERRAIN_BEHAVIOR_CONTRACT_V1.md` 尚未创建；不得擅自改写 M14 first-slice 历史资格。新增 terrain_tags 将形成新的 qualification subject；现有 Tileset 还有 autotile_names。

`SOURCE-PROVEN` 是**源码条件与分支**，不是未经判定的具体事件结果；`FSDB-OBSERVED` 为原始文件指纹对应的抽取观察；`STATIC-INFERRED` 为未验证的路径推论；`DYNAMIC-OBSERVED` 必须有原版运行日志；`UNVERIFIED/INCOMPLETE` 不能作为 PASS。旧工具返回 `completeness=COMPLETE`、`provenNegativeBridge=true` 和旧本机 18/18 pass 是提交 `5e71c7e` 的历史记录，**不代表 REVIEW-01～04 已修复或本轮复跑**。

## 2. FG-01～FG-06：全部 OPEN

| Gate | 必须交付与现状 |
|---|---|
| **FG-01 原版事实** | Map 7 负例、Map 21 桥格/事件/页面/命令/size、Map 47 悬崖与原版时序。**OPEN**：Map 7/21 已记录观察，但需补 table/负 tile/移动路线异常及 Common Event 祖先传播后重跑；Map 21 八事件的 `over_trigger?` 结果及连续路径未证；Map 47 与原版逐帧未完成。 |
| **FG-02 数据/导入** | terrain_tags exact shape/长度/引用/迁移，MapTransfer 与 MapAction 精确边界和跨图审计。**OPEN**：`incomingEdgesOntoBridge` 用本图桥格比对其他地图 target 坐标，须按 targetMapId 修复；67 个 D0-false 桥格是潜在风险，**无已证实误删**；`21,E,77,47` 几何越界单独记录。 |
| **FG-03 事件/状态** | `can_move` 成功/失败、`size` 命中、`over_trigger?`、`start`/解释器/桥层生效、输入/transfer 时机。**OPEN**：源码已证条件分支与 start≠execute，**不能直接断言空图形 size 事件必定 walk-on 或 bump 一定不启动**；逐事件 `map.passable?(occupiedX,occupiedY,0,player)` 矩阵、逐帧仍缺。禁止 contact 后同次输入立即重算。 |
| **FG-04 运动/画面** | Runtime/Browser walk/jump exact ABI、250ms 依赖、ID/epoch/duration、resize/取消/转图、桥 depth 缓存失效及同次 RenderDomain 提交。**OPEN**，尚无双方签核。 |
| **FG-05 可重放验收** | Map 7 负例、Map 21 桥正例、Map 47 Ledge 正例各自合法 fixture、指纹、逐步 expected、实际测试命令与 CI 覆盖。**OPEN**：旧取证本机记录 18 pass，不是新负例测试结果；原版动态及合法 CI fixture 缺失。 |
| **FG-06 Agent/资格** | baseline、唯一合同、AG-01～04 允许/禁止文件、测试/停止线、M14/M15 ledger 与对应 CI SHA、签核。**OPEN**。 |

### 当前必须解决的审查卡

| 卡 | 原因及通过标准 |
|---|---|
| `REVIEW-01` **P0** | `Game_Event#over_trigger?` 空图形后还对占用格调用 `map.passable?(x,y,0,player)`；每个 Map 21 On/Off 事件以当前桥层逐格给出 `passable → over_trigger → here/touch` 矩阵及源码/必要动态依据。修复前“八事件均 SOURCE-PROVEN walk-on”降级为待验证推论。 |
| `REVIEW-02` **P1** | 严格校验 terrain_tags 一维维度、实际长度、负 tile ID，所有移动路线 `decodeError`/坏脚本参数进入 INCOMPLETE；新增负例后重跑 Map 7/21+69 图。旧 COMPLETE 不能代替新的严格校验。 |
| `REVIEW-03` **P1** | Common Event A→B→bridge 将命中传递回 A 及原地图调用事件；循环/缺失/不透明脚本不丢失；增加端到端负例。 |
| `REVIEW-04` **P1** | 本地图 edge 源 x/y 与本地图桥格比较，目标 x/y **按 targetMapId** 与目标图桥格比较；缺目标图明确 INCOMPLETE；添加相同坐标不同地图反例。 |
| `ROUTE-21` **P1** | 四组路线必须逐步证明来源、通行、事件 start/execute 和桥层；尤其 Map 7 北缘连接落于 Map 21 x=19–22，不能跳步假设已到 (14,70)。无 RGSS 只能标静态待测。 |

审查项细节和具体代码位置以[证据复核 §2～3](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)为准。纠正取证器和测试后，须把新结果**直接回填原始证据 §14、设计草案及实施计划**，避免双事实源。本次仅为文档修正，尚未发生这些修复/重跑。

## 3. 原有三个跨模块设计断点（持续有效）

**P0-A 事件时序：** v21.1 先做方向通行判定；失败才检查面前 touch，成功移动后才有抵达事件检查。`Event#start` 仅置位，不同步 eval。是否命中 `check_event_trigger_here` 依 `over_trigger?` 的**全部条件**而非只依空图形。Runtime 既有 ContactTransfer 先于 canMove 是实现现状，不能自动作为原版依据；禁止同次输入“contact 后立即重算”。

**P0-B 导入不永久删除动态事实：** `projectedD0Passable` 不知道 Neutral/Bridge/玩家状态。分离可静态证明的过滤和必须保留到 Runtime 的事件事实；按 mapId 区分边连接两端。无关 NPC/剧情事件不令整图失败，相关候选解析无法保真时带 map/event/page 具体错误 fail-closed。潜在风险不能报成已复现。

**P0-C motion/depth 同协议：** Runtime 和 Browser 多处 walk 250ms，jump 一次动作而非两次走路；bridgeLevel 即使原地切换也使桥层 depth 缓存失效，人物/相机/桥面经同次 RenderDomain 与匹配 epoch 呈现，不全局置顶玩家。

## 4. 唯一 CONTRACT_V1 应精确冻结的章节

| ID | 交付精度 |
|---|---|
| C-01 Data | struct.Tileset 全 keys（含 autotile_names）、terrain_tags 一维 Table/长度/tag 0–17/非法引用、旧 fixture 迁移、Content 错误 |
| C-02 Semantics | resolveEffectiveTerrainTag 与 evaluatePassability 分离，None/Neutral/NoEffect、桥上下、源格/目标格双向位、priority/边界 |
| C-03 Event | MapTransfer 与狭义 MapAction namespace、schema、页面/命令白名单、size 占用、`over_trigger?` 判定事实、动态/静态筛选、相关未知候选 fail-closed |
| C-04 Time | 输入→can_move 分支→失败 touch / 成功动作→抵达检查；start≠execute；事件次数、held input、edge/transfer、重入 |
| C-05 State | bridgeLevel 数值/初值/跨图/Frame 生命周期、真正执行和图层投影时点、不随意扩大原四字段 initial input |
| C-06 Motion | blocked/walk/jump exact 类型与 Runtime↔Browser payload、duration/ID/epoch、逻辑位置/相机/弧线、resize/取消/切图/坏包 |
| C-07 Support | 只承诺本轮 Neutral/Bridge/Ledge；其他标签保留原值，不假称完整水/冰功能；未投影 NPC 碰撞须明确不支持 |
| C-08 Qualification | 当前 schema 与历史 M14 first-slice 边界、M14/M15 ledger、workflow/run/exact SHA、旧断言漂移、新 subject 测试 |

正式合同必须写 TypeScript/JSON 正反例、producer/consumer 表、桥状态×通行×事件和运动状态×输入/完成/resize/transfer/cancel 矩阵、事件 start/execute 次数、motion ID 与 RenderDomain 原子边界；禁止仅凭“保真/同步”推测 ABI。PR 2 仅执行 blocked/walk，PR 4 才实现 jump；不硬编码地图坐标或 tile ID。

## 5. 验收、任务卡和下一步

测试族：`DATA-*`、`TR-*`、`BR-PASS-*`、`BR-EVENT-*`、`BR-RENDER-*`、`LD-JUMP-*`、`MOTION-*`、`REG-*`；新增取证 `REVIEW-01～04` 与 `ROUTE-21` 的明确负例和日志。Map 7 无桥+普通门/连接回归，Map 21 真桥正例，Map 47 悬崖。每项注明 Given/When/Then、FSDB digest、实际命令、退出码、pass/fail/skip；无素材的 live skip 不能标 PASS。版权/许可未核实不得提交 Map021.rxdata 或完整事件转储；CI 缺口继续 OPEN。

AG-01 importer/数据/transfer，AG-02 Map Library 地形与 blocked/walk，AG-03 已验证的 Map 21 桥事件/Runtime/depth，AG-04 Map 47 跳跃/运动协议。**四卡仍是范围草案，不得派单**；每卡须填写 exact base SHA、合同版本、允许/禁止文件、依赖、测试/停止线、签核。禁止并发覆写共享 runtime/browser，禁止外部插件/通用事件解释器、改原版 passages、篡改历史资格。

签核模板：`合同版本 + 固定 base SHA + v21.1 源码/FSDB/合法 fixture digest + REVIEW-01～04/ROUTE-21 结果 + Map 47 + FG-01～06 全部 PASS + M14/M15 ledger/run/SHA + reviewer`。全部真实通过后才可 `Contract Frozen / Implementation Pending`。

**真实执行顺序：先修 REVIEW-01～04 和 ROUTE-21，重跑、回填原始证据及设计/计划 → Map 47 取证 → 动态 RGSS（有条件时）/合法 fixture → exact 合同和签核。现阶段全部 FG OPEN，NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED。**