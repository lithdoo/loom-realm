# 地形行为系统：规格冻结门禁与 Agent 实施交接

> 状态：**Freeze preparation / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。2026-09-20 建立。本文把 [设计草案](./TERRAIN_BEHAVIOR_DESIGN_DRAFT.md) 和 [实施闭环计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 推进为可审查的冻结工作清单；**不是已经冻结的实施合同**。只有取证、精确跨模块契约和可运行验收证据完成后，才允许更改状态。不得改写冻结的 M14 first-slice 合同或事后宣称它已经包含 terrain effects。
>
> 已定方向：地图行为仅在 Map Library 内部易扩展；不支持外部插件、动态 handler 注册、行为 DSL、任意 Ruby/JS 或通用 RMXP 事件解释器。正式桥样本为 Map 7 Cedolan City、悬崖样本为 Map 47 Route 7；Map 27 是 Day Care 室内。

## 1. 冻结目标：Agent 无须自行创造跨模块规则

冻结的可操作判据：实施 Agent 读取确定的基线 commit + 唯一规范版本 + 证据 + fixtures + 任务卡后，能够仅在指定修改边界内实现，并依据指定测试判断成功或失败；不需要猜测原版事件、选择数据结构、发明 Runtime/Browser 协议或自行扩大功能范围。

必须区分四个状态：

1. **Design draft**：方向和分层已讨论，但语义尚有待核实项；当前设计草案属于此状态。
2. **Freeze candidate**：事实证据、接口、状态机、fixtures、任务卡均已形成，等待审查与测试核验。
3. **Contract Frozen / Implementation Pending**：所有冻结门禁通过；记录规范版本、精确 Git commit SHA、审查结论和未支持范围，可派发实施 Agent。
4. **Implemented / Qualified**：实施 PR 的端到端测试与回归有实际运行证据，才逐项声明 Bridge / Ledge 完成；**冻结本身绝不等于实现或 qualification**。

建议以 `TERRAIN_BEHAVIOR_CONTRACT_V1.md` 作为冻结后唯一的**规范性**入口，以 `TERRAIN_BEHAVIOR_EVIDENCE.md` 作为来源与逐项测试关联；本文件、设计草案和实施计划保留为过程/背景说明。两份拟议文件尚不存在：不能仅凭这些文件名宣称已有合同或证据。正式冻结时在规范首页写明优先级：本次 v1 规范 > 背景草案/计划（仅针对本次增量能力）；M14 历史合同维持其原适用范围，不被追溯修改。

## 2. 六道冻结门禁：每项需要可复核产物

| ID | 冻结门禁 | 必需证据和可交付产物 | 当前状态 |
|---|---|---|---|
| FG-01 | 原版取证完整 | Map 7 桥头真实 map/event/page ID、坐标、页面条件、trigger、through、命令码、参数、命令顺序；Map 47 实际路线；对应 v21.1 Ruby 源码位置；事实→规则→测试索引 | **OPEN**：Map 7 实际事件尚未在本轮文档核实 |
| FG-02 | 数据契约精确 | `struct.Tileset.terrain_tags` 的 exact keys、Table 维度/长度/值域、tile ID 引用及 `0` 处理；桥事件 Content namespace、逐字段 schema、版本/迁移、重复与未知事件的错误行为 | **OPEN**：仅设计方向，尚无冻结 schema |
| FG-03 | 时序和状态机确定 | contact / step / edge / passage / motion 的明确优先级；`bridgeLevel` 初值、取值、重入和跨地图规则；失败/中断/连续输入/resize 的原子性及重算边界 | **OPEN**：部分需要 FG-01 证据 |
| FG-04 | Runtime / Browser 协议一致 | `walk`/`jump` 的精确 payload、单位与范围、duration、坐标提交与事件完成时机、motion ID/epoch、跳跃轨迹、桥深度重投影及同更新要求；两端严格校验负例 | **OPEN**：目前是行为约束，不是字段级协议 |
| FG-05 | 验收可复现 | 合法最小真实派生 fixtures 的来源与生成办法、正反例输入和逐字段 expected、测试编号、具体命令；Map 7 / Map 47 真实路线；CI 与本地 FSDB 的覆盖差异 | **OPEN**：测试矩阵存在，尚未落实完整 golden fixtures |
| FG-06 | Agent 交接可执行 | 规范版本及固定基线 SHA；四份任务卡的允许/禁止修改范围、依赖、具体产物、测试命令、停工与上报协议；reviewer 确认无未决跨模块契约 | **OPEN**：现有 PR 切片仍需细化为任务卡 |

以上 `OPEN` 表示**未取得满足冻结门禁的完整证据**，不等于相关代码从未存在。不得因为文档表格填完就自动标记为 `PASS`：每项需链接实际代码位置、fixture、测试或审查记录。任何一项不通过，整体仍为 `NOT FROZEN`。

## 3. 取证先于契约：给每个行为建立事实表

建立 `TERRAIN_BEHAVIOR_EVIDENCE.md` 时，每行至少包括 `Rule ID | 原版 tag/ref/源码行或地图事件坐标与 ID | 原始命令/检查顺序 | 目标语义 | 测试 ID | 已核实/待核实 | 暂不支持说明`。

先从本地 Essentials v21.1 FSDB 提取 Map 7 的**实际事件结构**；不得仅从 `pbBridgeOn` 字符串出现推断事件页或触发时机。记录选页条件、trigger、priority/through、完整命令列表与缩进；对 355/655 连续脚本、多命令、条件分支、开关与 self-switch 分类，并记录本轮白名单能否保真覆盖。若不能保真，输出带 map/event/page ID 的明确 unsupported，不能静默忽略或硬编码坐标。原始 FSDB 可能被本地 `.gitignore` 排除：不能假定 Agent/CI 可以直接访问，需核实许可后准备可提交的最小派生 fixture、生成脚本和来源说明；否则 FG-01/05 不得通过。

Map 47 记录从可复现起点到每次方向输入的坐标、面前地形、出发方向位、跳跃最终落点、反向及阻挡负例。原版 `Game_Player#move_generic` 先做前进方向检查并识别 Ledge，再调用 `jumpForward(2)`；`Game_Character#jump` 检查最终落点。**不能把跨越格当两次普通 walk 全部检查**。边界、事件碰撞、相邻地图跳跃等不确定行为应逐项核实，不能靠额外“安全规则”擅改原版语义。

原版依据入口：[TerrainTag](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/010_Data/001_Hardcoded%20data/011_TerrainTag.rb)、[Game_Map](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/004_Game_Map.rb)、[Game_Player](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/008_Game_Player.rb)、[Game_Character](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/004_Game%20classes/006_Game_Character.rb)、[Overworld](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/012_Overworld/001_Overworld.rb)、[TilemapRenderer](https://github.com/Maruno17/pokemon-essentials/blob/v21.1/Data/Scripts/006_Map%20renderer/001_TilemapRenderer.rb)。引用必须固定在 v21.1/tag 或对应 blob SHA，不用上游 master 替代。

## 4. `CONTRACT_V1` 必须冻结到字段与状态转换的粒度

规范不可停留在“桥上走桥面”“跳两格”。正式合同至少包含以下规范章节，任何关键字段不得用“实现时决定”“可能”“例如”作为最终定义：

| 合同章节 | 必须明确的内容 |
|---|---|
| C-01 数据投影 | 每个 Content record 的 namespace、key、完整字段及类型；`terrain_tags` 的一维 Table 和长度匹配；tag 0–17 原值保留；未知 tag/损坏表/历史 fixtures 的迁移与拒绝策略；`None`、`NoEffect`、`Neutral` 各自语义 |
| C-02 内部语义接口 | `resolveTerrain`、通行策略、规划器的确切输入/输出、不可变约束、源格和目标格反向 passage 规则；Bridge 对图层选择的作用；不得出现游戏地图 ID/tile ID 特判 |
| C-03 事件记录 | `MapAction` 与现有 `MapTransfer` 的身份和复用边界；事件页与 trigger 的精确映射、相同位置事件冲突优先级、未知脚本/部分支持的 fail-closed 行为；Content 缺记录行为 |
| C-04 事件时序 | 接收输入 → contact → 状态动作 → 是否重新求通行 → movement plan → 动作开始 → 动作完成 → step/edge/transfer → held input 的精确次序；失败时哪些状态可变（如朝向），哪些绝不能部分提交 |
| C-05 `bridgeLevel` | 数值范围、默认/初始化/切图/重入规则、与事件动作同步、有效桥面碰撞和桥面/角色绘制关系；变化时投影失效的判断 |
| C-06 Motion ABI | `walk`/`jump` 共享与差异字段、起终点、duration 毫秒及范围、跳跃曲线/峰值定义、motion ID 与 scene/visual epoch、相机、取消、resize、切图、严密校验及不合法 payload 处理 |
| C-07 支持边界 | 冰面、水域、瀑布、遭遇、SootGrass、counter/bush flags 本轮是否只保留数据；禁止未实现行为被静默等价成 Neutral/可通行；不支持情形的显式报告机制 |

**接口草图不是合同**：现有 `MovementPlan = blocked | walk | jump` 是设计示意，正式冻结应给出完整、严格的 TypeScript 类型和 JSON 示例/反例，说明字段是否公开、由谁生产、谁验证、谁消费。若 PR 2 只需要 `blocked/walk` 可执行分支，则 `jump` 仅冻结协议及未来消费责任，不必提前实现空的执行器；PR 4 才实施跳跃。

### 必须写成状态转换表的情形

至少冻结：`bridgeLevel = 0/>0` × 面前是否 Bridge × passage 可通/阻挡 × contact/step 事件类型；以及 `idle/walking/jumping/transitioning/aborted` × 输入、动作结束、resize、transfer 的转换。每个格子写出 `事件执行次数 | next bridgeLevel | next x/y | movement kind | 渲染结果 | 后续事件`。冲突情况必须确定优先级，而非交给 Agent 判断。

特别注意现有 `runtime.ts` 在开始 movement 时已把 x/y 赋为目标坐标，并用 `finishStep` 处理到达传送及 held input；现有 `map.browser.js` 对 player/camera motion 的 `durationMs` 严格等于 250。新 jump 需两端同时变更协议；桥状态改变即使人物不移动，也必须使复用中的 tile projection depth 重新计算并与人物投影同次更新。不能靠全局提高人物 z-index 破坏其他遮挡，也不能在 Browser 根据 TerrainTag 二次实现玩法。

## 5. 验收规格：Given / When / Then + 规则编号

每条规范规则都对应至少一个可执行测试，建议稳定编号 `DATA-*`、`BR-PASS-*`、`BR-EVENT-*`、`BR-RENDER-*`、`LD-JUMP-*`、`MOTION-*`、`REG-*`。**编号是待制作测试目录，不表示测试已存在或通过。**

冻结样例必须带真实初始状态、原始 tag/passage/priority、输入方向或事件触发、精确 expected（下一坐标、方向、桥层、运动 kind/ID、事件执行次数、视觉 depth/遮挡）。至少包含：

| 测试族 | 最低正反例 |
|---|---|
| DATA | 18 种标签原值；错误 shape、短表、负数/未知 tag、越界 tile ID、旧 fixture 迁移 |
| BR-PASS | Neutral 盖在 `0x0F` 上继续看下层；桥上/桥下、双向 passage、NoEffect 不被当 Neutral、桥头被阻挡 |
| BR-EVENT | contact 与 step 各自准确触发/不触发；桥两端反复通行；未知事件拒绝；切图和重入的真实 bridgeLevel 语义 |
| BR-RENDER | 桥下遮挡、桥上不遮挡、状态切换不移动也要更新；同一 render update 中状态/桥深度一致 |
| LD-JUMP | 原版前置判断 + 最终落点、反向、阻挡落点、边界、中间事件不误触发，失败零部分位置提交 |
| MOTION / REG | jump 单 motion ID/完整弧线；duration/epoch/payload 负例；held input、resize、取消、step/contact/edge transfer、普通一步回归 |

正式验收应固定 Map 7 与 Map 47 的合法输入序列和每步 expected，并能从源 fixture 重放。不能用自造桥头事件代替真实事件，也不能以人工试玩代替可运行的核心断言。运行入口以项目实际脚本为准（目前已有 `npm run test:m14:projection`、`npm run build:m14`、`npm run test:m14`、`npm run test:m15`）；新增地形专项测试命令须在任务卡内给出确切名称及预期结果，不把计划中的命令说成已经存在。未运行的测试必须明确写为未运行。

## 6. 四张 Agent 任务卡：从实施计划改为可直接派单

每张卡至少固定 `base commit SHA / contract version / dependencies / allowed paths / forbidden paths / exact deliverables / test IDs + commands / acceptance criteria / stop-and-report rules / evidence report`。以下是**待冻结的任务范围模板**，不是已获批准的写入权限或完成声明：

| 任务卡 | 输入与允许改动的主要范围（正式版应列精确文件） | 交付与停止条件 |
|---|---|---|
| AG-01 数据 | 当前 consumer、Tileset schema/validator、fixture generator 与对应 tests；禁止变更 Core、原版 passages、历史 M14 qualification | 贯通 `terrain_tags` 的 source→Content→Map Library；校验/迁移正反例；碰到不兼容历史数据必须按 C-01 规定处理，不自行降低严格性 |
| AG-02 行为内核 | `game-libs/map/src/semantics.ts` 和新增内部纯函数/测试；Runtime 仅按冻结的最小接线修改 | Neutral/Bridge 与原普通走路；`blocked/walk` 可执行，新 jump ABI 只冻结不造空消费者；任何与源格/目标格语义冲突先报告 |
| AG-03 桥闭环 | 事件 consumer、狭义 MapAction、Content/Runtime、必要的渲染投影和 Browser、测试 | Map 7 真实桥两端/桥下/折返、时序、同步遮挡通过；发现不能保真投影的事件必须报告 map/event/page，不擅写死 |
| AG-04 悬崖闭环 | Ledge planner、Runtime motion、Browser motion 与对应测试 | Map 47 原版前置+落点语义、原子 jump、单 ID、动画和负例通过；出现原版证据冲突时停下提出规格变更 |

AG-01 → AG-02 → AG-03 / AG-04 是规范及代码依赖；AG-04 可在 AG-02 后开展纯规划器工作，但涉及共享 Runtime/Browser ABI 的最终集成须与 AG-03 的约定协调。实现 Agent 不应同时修改同一文件的并行分支并无审查地覆盖提交。只有通过桥的纵向验收才声明 Bridge 完成；通过悬崖纵向验收才声明 Ledge 完成。

**停止与上报协议**：遇到缺失 FSDB、未取证事件、无法唯一解释的触发顺序、规范与 v21.1 证据冲突、Content/Browser 现有合同冲突、测试 fixture 无法在 CI 合法复现时，停止受影响项；提交 `事实/证据 → 冲突的规范条目 → 备选方案 → 对测试和依赖的影响`。不得编造坐标、静默跳过事件、放宽 validator、修改历史资格结果或绕过失败用例。其他独立且已冻结的任务可继续。

## 7. 冻结审查记录模板与变更控制

冻结审查记录应实际填写：

```text
Specification: TERRAIN_BEHAVIOR_CONTRACT_V1.md
Contract version: v1.0.0 (仅为拟议标识；冻结时确认)
Baseline Git commit SHA: <冻结时填写，禁止使用浮动 main>
Upstream reference: pokemon-essentials v21.1 + blob SHA
Evidence file and exact fixture digests: <冻结时填写>
Gate results: FG-01 ... FG-06 = PASS, 每项附证据链接
Reviewer / review outcome: <冻结时填写>
Unsupported cases: <逐项填写>
Status: Contract Frozen / Implementation Pending
```

任何 FG 仍为 OPEN、存在未定义跨模块字段或只有人工观察而无可复现测试时，审查结果必须为 `NOT FROZEN`。实施后更新状态另需实际测试记录，不得将冻结与实现混为一谈。

冻结后的更改采用明确的规格变更：记录原因、原版证据、受影响 C-* 条款和测试 ID、兼容性、需修改的 Agent 卡与规范版本；审查通过后再实施。纯内部重构可自由进行，但不得改变冻结的数据/时序/可观察结果。文档链接、测试失败记录和 PR/commit 号应保持可追溯。

## 8. 下一步（此处均未声称已完成）

1. 取证 Agent 先产出 Map 7/Map 47 源事实表、合法最小素材和原版判定顺序，关闭 FG-01。
2. 规格 Agent 在证据上完成 `CONTRACT_V1` 的 C-01～C-07、精确状态转换表及 Runtime/Browser schema，关闭 FG-02～04。
3. 测试 Agent 将规则编号变为可运行 fixtures/golden 断言，注明 CI 与本地全量 FSDB 的覆盖差异，关闭 FG-05。
4. 审查者核对四张任务卡、依赖及禁止项，冻结 commit/version 并逐项签核 FG-01～06；之后才向实现 Agent 下发 AG-01～04。

冻结前可做取证、契约和验收准备工作，但**不得把本文件或 PR #41 称为已冻结规格或已实现地形系统**。