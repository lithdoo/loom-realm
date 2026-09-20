# 地形行为系统：规格冻结门禁与 Agent 实施交接

> 状态：**Freeze preparation / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。本轮已修复取证器 REVIEW-01～04，重跑 Map 7/21/47，并回填 [TERRAIN_BEHAVIOR_EVIDENCE.md](./TERRAIN_BEHAVIOR_EVIDENCE.md) §15。复核见 [TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)。**子项证据齐备 ≠ Gate PASS。**
>
> 样本职责：**Map 7 = Bridge 负例；Map 21 = Bridge 正例（静态矩阵与陆地侧连续路线已重算）；Map 47 = Ledge 正例（静态 30 格）；Map 27 不作桥样本。** 所有门禁仍 OPEN。

## 1. 冻结含义与证据等级

正式冻结要求固定 baseline SHA、唯一规范及字段级 ABI、带指纹原版证据、合法可复现 fixtures、确切任务卡与验证结果、审查签核。设计草案、实施计划、原始证据及本门禁不是正式合同。拟议 `TERRAIN_BEHAVIOR_CONTRACT_V1.md` 尚未创建；不得擅自改写 M14 first-slice 历史资格。新增 terrain_tags 将形成新的 qualification subject；现有 Tileset 还有 autotile_names。

`SOURCE-PROVEN` 是**源码条件与分支**，不是未经判定的具体事件结果；`FSDB-OBSERVED` 为原始文件指纹对应的抽取观察；`STATIC-INFERRED` 为未运行 RGSS 的路径推论；`DYNAMIC-OBSERVED` 必须有原版运行日志；`UNVERIFIED/INCOMPLETE` 不能作为 PASS。旧本机 18/18 pass 是提交 `5e71c7e` 的历史记录。本轮测试为 36 pass（有本地 FSDB）；CI 无素材 skip ≠ PASS。

## 2. FG-01～FG-06：全部 OPEN

| Gate | 必须交付与现状 |
|---|---|
| **FG-01 原版事实** | Map 7 负例、Map 21 桥格/事件/页面/命令/size/over_trigger 矩阵、Map 47 悬崖与原版时序。**OPEN**：静态子项本轮已重跑并写入 §15；**仍缺**原版逐帧 RGSS。不得把 STATIC-INFERRED 写成 DYNAMIC-OBSERVED。 |
| **FG-02 数据/导入** | terrain_tags exact shape/长度/引用/迁移，MapTransfer 与 MapAction 精确边界和跨图审计。**OPEN**：源/目标 mapId 已在取证器分开；67 个 D0-false 桥格仍是潜在风险，**无已证实误删**；`21,E,77,47` 几何越界单独记录。Importer 合同未冻结。 |
| **FG-03 事件/状态** | `can_move` 成功/失败、`size` 命中、`over_trigger?`、`start`/解释器/桥层生效、输入/transfer 时机。**OPEN**：八事件静态 here 已计算；start≠execute 仍成立；解释器同帧与动态 held input 未测。禁止 contact 后同次输入立即重算。 |
| **FG-04 运动/画面** | Runtime/Browser walk/jump exact ABI、250ms 依赖、ID/epoch/duration、resize/取消/转图、桥 depth 缓存失效及同次 RenderDomain 提交。**OPEN**，尚无双方签核。 |
| **FG-05 可重放验收** | Map 7 负例、Map 21 桥正例、Map 47 Ledge 正例各自合法 fixture、指纹、逐步 expected、实际测试命令与 CI 覆盖。**OPEN**：本轮本机 36 pass；无合法可分发完整地图 fixture；CI 无 FSDB 时 live skip。 |
| **FG-06 Agent/资格** | baseline、唯一合同、AG-01～04 允许/禁止文件、测试/停止线、M14/M15 ledger 与对应 CI SHA、签核。**OPEN**。`CONTRACT_V1` 仍不存在。 |

### 当前必须解决的审查卡

| 卡 | 原因及通过标准 |
|---|---|
| `REVIEW-01` **P0** | **本轮已给出矩阵**：八事件 over_trigger=true / here。条件 SOURCE-PROVEN；占用格结果 STATIC-INFERRED。不得把资格写成未经计算的必然。 |
| `REVIEW-02` **P1** | **本轮已 fail-closed** 并补 `EV-VALID-*`。Map 7 重跑仍 COMPLETE + provenNegative。 |
| `REVIEW-03` **P1** | **本轮已按调用入口可达闭包**。本 corpus 无 CE 桥脚本；autorun 入口单独列出。 |
| `REVIEW-04` **P1** | **本轮已按 targetMapId 审计**。D0 对照 ≠ 已证实误删。 |
| `ROUTE-21` **P1** | **本轮已生成陆地侧连续静态路线**（含 Map 7 落点 BFS）。无 RGSS 日志。 |

审查项细节以[证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)与证据 §15 为准。纠正后的结果已直接回填原始证据，避免双事实源。玩法仍未实现。

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

**真实执行顺序：取证器与静态重跑已在本轮完成 → 动态 RGSS（有条件时）/合法 fixture → exact 合同和签核。现阶段全部 FG OPEN，NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED。**