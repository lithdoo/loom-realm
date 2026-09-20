# 地形行为系统：规格冻结门禁与 Agent 实施交接

> 状态：**Freeze preparation / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 Map 21 静态取证后修订。本文管理门禁，不是已冻结合同或已实现代码。原始记录见 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md)（含 §14），复核见 [证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)。
>
> **样本职责：Map 7 = Bridge 负例；Map 21 = Bridge 正例（静态取证已记录，动态未跑）；Map 47 = Ledge 正例待取证；Map 27 不作桥样本。** 不得再索取 Map 7 桥头事件。不得把静态取证写成 FG-01 PASS。

## 1. 冻结的准确含义和证据分级

Agent 给定固定 base SHA、唯一规范版本、原版证据、可取得 fixtures、准确任务卡和现成验收命令，即可不猜原版事件、字段、motion ABI、资格范围而实施。`Design draft → Freeze candidate → Contract Frozen / Implementation Pending → Implemented / Qualified` 是不同状态；只有六门禁均有可复核证据和审查签核才能冻结；代码及资格须后续实际验证。

拟议唯一规范性增量入口 `TERRAIN_BEHAVIOR_CONTRACT_V1.md` **尚未创建**；不以草案、计划、证据或本清单冒充合同。历史 M14 first-slice 的原适用范围不追溯改写，但当前 Tileset 已有 `autotile_names`、新增 `terrain_tags` 拟形成新的 qualification subject；按文档治理记录 schema 和资格基线漂移。

事实强度必须分开：`SOURCE-PROVEN` / `STATIC-INFERRED` / `DYNAMIC-OBSERVED` / `UNVERIFIED` / `INCOMPLETE`。Map 7 零桥在本轮严格扫描（含 move-route 45、111 type 12、117 图、表齐全）下仍成立，`provenNegativeBridge=true`；方法体内间接 Ruby 仍 UNVERIFIED。

## 2. FG-01～FG-06（全部 OPEN）

| Gate | 必须提供的证据与冻结条件 | 状态 |
|---|---|---|
| **FG-01 原版事实** | Map 7 负例严格扫描；Map 21 桥格/事件/命令/`size()`/静态路线；Map 47 Ledge；v21.1 源码与逐帧 | **OPEN**。已消除：Map 7 假零扫描缺口；Map 21 静态正例（证据 §14）。剩余：Map 47、动态逐帧、方法体内间接 Ruby |
| **FG-02 数据和导入** | terrain_tags 合同；MapTransfer/MapAction；Map 21 D0 筛选对照 | **OPEN**。本轮审计：**无已证实误删**；67 格 D0-false 为潜在风险未复现；`21,E,77,47` 几何越界已排除 |
| **FG-03 事件/状态** | 成功走/失败 touch 分路、`size` 占用、start≠execute、跨图 `pbBridgeOff` | **OPEN**。静态：空图形 `size()` 为 walk-on（`check_event_trigger_here`），失败 touch 会跳过。动态帧对齐 UNVERIFIED。禁止同次输入立即重算 |
| **FG-04 运动及呈现** | walk/jump ABI 与桥 depth | **OPEN** |
| **FG-05 验收可重放** | 三图 fixture 与 CI | **OPEN**。本机提取测试 18 pass；无合法 CI rxdata。不得标 PASS |
| **FG-06 Agent/资格交接** | 合同、任务卡、签核 | **OPEN** |

Map 7 仍不是桥正例。Map 21 静态取证已进入证据 §14，仍不是动态验收或 Bridge 实现。所有门禁保持 OPEN。

## 3. 三个 P0 设计断点及本次新增取证质量门槛

**P0-A 事件时序。** 源码骨架不变。Map 21 八个桥事件是空图形 `size()`：**SOURCE-PROVEN** 走通占用格后 `check_event_trigger_here` 才 `start`，失败 bump 不会切桥层。逐帧仍 UNVERIFIED。禁止同一次 `can_move` 因 contact 立即重算。Runtime `ContactTransfer` 先于 `canMove` 仍只是待审计现状。

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

**执行顺序**：Map 7 严格扫描与 Map 21 静态取证已完成 → **下一步 Map 47 Ledge** → 动态 RGSS（可选）→ ABI/合同/fixtures → 签核。直到 FG-01～06 真实 PASS，始终 NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED。