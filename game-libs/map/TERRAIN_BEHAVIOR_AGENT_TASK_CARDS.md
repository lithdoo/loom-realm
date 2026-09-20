# Terrain Behavior：可执行冻结准备任务卡与受限实施交接

> **FREEZE PREPARATION CARDS / IMPLEMENTATION NOT AUTHORIZED**。取证代码基线 `e60e4a521a726233bbda0bb1892f6d25bc47573d`，冻结准备工作起点 `b26a4d68d1cbe4136242e0b4fd09dd2d617e56a6`。实际执行 Agent 必须先读取分支 HEAD 和工作区，改用真实当前 HEAD；不得硬重置到示例 SHA。权威状态 [冻结门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md)；执行标准 [冻结执行记录](./TERRAIN_BEHAVIOR_FREEZE_EXECUTION.md)；字段决策 [合同候选](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md)。以下卡片**不是**已经批准的正式 AG-01～04 玩法实施授权。

## 通用执行契约（每张卡必须满足）

运行前：`git status --short --branch`、`git rev-parse HEAD`、核对远端分支；保护用户已有改动，不 reset/clean/force-push、不并发覆盖共享文件。固定 v21.1 源码 commit 和本地 FSDB 实际 SHA-256；无素材时只提交独立合成用例与明确 BLOCKED，不能伪造真图结果。测试记录 `command/exit/pass/fail/skip/environment/input digest/exact HEAD`，在修复后重新运行；静态模拟与 RGSS 原版日志分别列出。不得提交原始 rxdata、未确认可再分发的完整事件文本、机器绝对路径或历史 ledger 改写。只改必要路径，检查 `git diff --check` 和最终 diff；失败不能留给下轮还称完成。

## FZ-01：E2E-21 单状态、原版事实可核验的回放（首要执行卡）

**依赖**：本地官方 FSDB（本轮若无法取得则先写合成回归，真实验收 BLOCKED）；源版本及 map sha 覆核。

**允许路径**：`tools/fixtures/essentials-v21.1/lib/essentials/v21.1/map21-bridge-routes.mjs`、`map-route-trace.mjs`、必要的 `map-connection-audit.mjs`/专用 `map21-bridge-evidence.mjs`、`map-evidence-acceptance.test.mjs`、地形证据与复核文件。**禁止**改 `game-libs/map/src/runtime.ts`、Browser、原始 FSDB 或重写通用事件解释器。

**输入**：Map7→21 的真实已物化 edge，而不是只有 PBS 期望 sample；实际 Map021/Tileset/事件，初始 `(mapId=7,x,y,direction,bridgeLevel=0)` 必须从验证过的边界源格选取，不得伪造具体起点；四组 On/Off 真实事件由 FSDB 定位。

**必须改正**：BFS、On、沿带、Off、返程消费一个连续 state（禁止各段重设 `enter`、bridge=0）；加入实际 transfer 记录；`continuous` 校验 mapId/x/y/direction/bridgeLevel 的前后等价性，并检查 blocked/motion 对逻辑状态的影响；`onBand.final` 真正作为 Off 段输入；必须走到 `tag15` 真实桥面后才能叫上桥；逐次记录 here/touch/start/execute 预测与事件计数，不能假装脚本同步原版执行；BFS 若走跳跃须拒绝或显式报告。源/目标坐标有自己的 mapId，跨图后状态清零只在有 v21.1 依据处推断。

**测试 IDs**：`E2E-21-01` 四组真实统一 trace；`-02` 缺边/伪 sample fail-closed；`-03` BFS→On 或 OnBand→Off 断链检测；`-04` 反向/折返/重复 size 事件计数；`-05` 真桥面格+桥层交叉验证；`-06` 连接转图与 source/target 坐标；`-07` 逐步输入与状态指纹确定性；`-08` 防止以静态 execute 伪装 RGSS 帧。

**验收命令候选**：`node --test tools/fixtures/essentials-v21.1/map-event-evidence.test.mjs tools/fixtures/essentials-v21.1/map-evidence-acceptance.test.mjs`；随后执行真实 Map7/21 专用 evidence CLI 和 `map-evidence-independent-check.mjs`（以文件 help/实际参数核对命令），再用真实 E2E JSON 独立重算。已有 36/36 是旧提交报告，不算本卡结果。**停止线**：若 E2E 源边不存在、某一步无合法通行或解释器顺序不确定，不改事实凑绿，提交失败位置和原版差异。

## FZ-02：原版 RGSS 动态见证（有环境才可执行；不允许模拟替代）

**依赖**：可合法运行 v21.1 的游戏和保存/恢复机制。**允许**本地 gitignored 调试副本、只读/可恢复状态采样、证据文档；**禁止**提交存档、修改原始 FSDB、把静态 JS tracer 冒充原版日志。

桥四组：从 Map7 边界落点开始，步进 Off/On/真桥面/退出/折返，分别记录按键、帧号、坐标、事件 start 置位、解释器命令索引、bridgeLevel、是否可接受下一输入和渲染 depth。另测 held input、事件 size 重复和跨图归零。Map47：正向一次两格、逆向、阻挡、落点事件、边界、相机与实际动作帧；不可获得的原版样本必须用合成测试**单独标注**。将真实/静态差异逐条回填 §15 后的新证据段。**停止线**：找不到 RGSS 环境 → 在 FZ-02 标 `BLOCKED`，保留准确尝试/路径/错误；**不得自行修改 FG-01 等门禁使动态变可选**，须 reviewer 正式批准变化。

## FZ-03：Map47 支持界限与独立验证

**依赖**：FZ-00 map/Tileset 指纹、固定 v21.1 的 `jumpForward(2)` 与 `jump` 源码、若需动态则 FZ-02。

**允许路径**：`map47-ledge-routes.mjs`、`vanilla-map-rules.mjs`（仅只读模拟修正）、相关测试和证据。逐条给 mapId、before/dir、mid、land、源/目标 passage、事件 ID/页面（若实际存在）、逻辑提交与运动等级。覆盖逆向、源阻、落点阻、边界、无中途事件时合成 middle-event 负例、是否跨连接支持。不得把所有 Ledge 原值当作无条件双步，也不得臆造 Map47 事件坐标。验收测试 `LD47-01..08`，每项区分 `FSDB-OBSERVED / STATIC-INFERRED / DYNAMIC-OBSERVED / UNVERIFIED`；缺实际 RGSS 时对应项 BLOCKED。

## FZ-04：最小 fixture、许可、CI 与资格差异

**依赖**：确认原始素材和派生地图数据的合法分发条件；不能从「仓库可读」推断授权再分发。**允许路径**：`tools/fixtures/essentials-v21.1/` 的合法最小合成 fixture/测试/说明、对应 workflow（仅用户允许且必要）、证据与门禁。不得把本地 `[FSDB]*`、Map007/021/047 原始 rxdata、完整事件附录再次复制入库。

先审现有 `TERRAIN_BEHAVIOR_EVIDENCE.md` 附录 A 的原文许可与最小保留原则，记录权利依据或待处理决定；若未确认，继续只提交手工合成的非侵权极小用例、SHA、生成程序，实图 live 只能在有素材的本地跑并报告 CI 缺口。工作流应让合成回归**确实执行**，对 live 断言 skip 明确报告，不能把“workflow 绿 + 全 live skip”算 FG-05 PASS。测试包括坏 table、source/target mapId、事件触发、状态拼接、Map47 规则与无素材行为。记录 Git SHA、workflow ID/run URL、Job 结论与 skip；更新 M14/M15 subject 差异但**不改写历史 ledger**。停止线：无法获得许可或 CI 数据时 FG-05 OPEN。

已记录：run [35499223917](https://github.com/lithdoo/loom-realm/actions/runs/35499223917) on `faf4c64` 为 **failure**（`EV-SAFETY-01` POSIX `forensicRelPath`）。该路径脱敏已修；许可与 live skip 仍使 FG-05 OPEN。

## FZ-05：唯一合同 V1 候选决策与跨模块 ABI 评审

**依赖**：FZ-01 可复核静态结果；FZ-02/03 对动态要求已完成或明示 BLOCKED+正式 gate 变更决定；FZ-04 fixture/资格范围。**允许路径**：`game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md`、相关设计/计划/门禁；只有全部 DEC-01～07 已实际批准才创建 `TERRAIN_BEHAVIOR_CONTRACT_V1.md`。不在本卡修改 Runtime/Browser。

逐项书面决定 C-01～08：exact Tileset 六字段 schema 与迁移/错误；`resolveEffectiveTerrainTag/evaluatePassability` 两函数 exact 输入输出；MapTransfer 不丢动态事实与狭义 MapAction schema；事件优先级/start→execute 及桥状态原子时点；MovementPlan blocked/walk/jump 类型、Runtime↔Browser on-wire exact payload、scene/visual epoch/ID/duration、resize/cancel/transfer/坏包；允许/拒绝的 tag/NPC 能力；M14/M15 新资格 subject/CI。填完 TypeScript 与 JSON 正反例、`idle/walking/jumping/transitioning/event-running/aborted × input/completion/resize/transfer/cancel` 状态矩阵，并由 data、runtime、browser、qualification reviewer 分别签。**停止线**：任何欄位仍是 `PROPOSED/OPEN` 则不得创建“Frozen”标题文件或发布 AG 授权。

## FZ-06：六门禁真实签核与固定实施基线

**依赖**：FZ-01～05 证据及审查通过，许可、CI、动态门禁真实满足或正式变更且有记录。**允许**更新 [冻结准备](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 的真实 gate 状态、正式合同和四个 AG 卡版本；禁止改 runtime/browser 来掩盖不满足条件。

签核记录必备：规范版本；最终不再浮动的 implementation base SHA；上游 tag/commit 与地图、Tilesets、CommonEvents、PBS 文件 SHA；E2E/dynamic/Map47 依据；每个 gate 的验收、命令、exit/pass/fail/skip、CI run/SHA；素材分发决定；M14/M15 适用范围；批准者与日期。只有 FG-01～06 全 PASS 才标 `Contract Frozen / Implementation Pending`。任一缺失保留 `NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED`。

---

## 以下为冻结后 AG-01～04 模板：**现在一律 BLOCKED / NOT AUTHORIZED**

| 模板 | 顺序与仅允许的主修改范围 | 必须先有的冻结交付 | 停止线 |
|---|---|---|---|
| AG-01 数据与选择性导入 | PR1；`tools/fixtures/essentials-v21.1/` producer/transfer、Content 与 `game-libs/map/src/semantics.ts` validator/对应测试 | C-01/03 exact schema，合法 fixture/迁移/所有旧字段、Map21 transfer 与异常输入 golden | 不改 Core/原始 passages；无 fixture/字段漂移则停 |
| AG-02 纯语义与普通 walk | PR2，AG-01 后；`game-libs/map/src/` 规则、Runtime 最小接线和 map tests | C-02/04/05/06 MovementPlan exact 类型，Map7 普通门/连接回归、Neutral/Bridge 状态矩阵 | jump 只冻结类型不执行；不得提前改 Browser/做空跳跃 |
| AG-03 Bridge 纵向实现 | PR3，AG-02 后；狭义 MapAction、map-owned Runtime、必要 Browser 投影及 tests | 已验证 E2E-21、原版事件时序、C-03～06、Map21/Map7 golden 与桥深度 ABI | 不硬编码 Map21/event IDs；来源行为冲突停受影响项 |
| AG-04 Ledge 纵向实现 | PR4，AG-02 且共享 ABI 审核后；map-owned planner、Runtime、Browser 与 tests | Map47 合法跳跃与失败矩阵、完整 jump motion/resize/transfer ABI | 一个 jump≠两个 walk；与 AG-03 共享文件不得无审查并发覆写 |

每张正式 AG 卡派单时**重新填入**实际冻结 `baseline SHA / CONTRACT_V1 version / dependency commit / exact allowed+forbidden paths / deliverables / expected assertions / commands / stop+rollback policy / owner+reviewer`。上表仅给范围，不是固定数值合同。最终状态由 FZ-06 审查者签，不由 Agent 自证通过。

---

## AG-01～04 交接卡（准备完成，尚未授权实施）

Contract version: **none** (`TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md` only).
Exact base SHA: **not authorized**. Bind to `CONTRACT_V1` freeze SHA after FG-01～06 reviewer PASS.
Reviewer: specification / data / runtime / browser owners — **unsigned**.
Definition of Done: not applicable until authorized. Stop condition: freeze not signed.

### AG-01 Data

| Field | Value |
|---|---|
| Task ID | AG-01 |
| Dependencies | CONTRACT_V1 frozen |
| Allowed files | `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs` and Tileset/MapAction producer tests; Content schema for `struct.Tileset` / `struct.MapAction`; `game-libs/map/src/semantics.ts` validators only |
| Forbidden files | `src/runtime.ts`; `browser/map.browser.js`; original FSDB; M14/M15 historical ledgers |
| Producer/consumer | importer → prepared `struct.Tileset` (six fields) + `struct.MapAction` list → Content → `validateTilesetRecord` / future MapAction validator |
| Scope | Add `terrain_tags` 1D Table; reject legacy five-field records via explicit migrator; project Wait-free pbBridgeOn/Off pages only; do not add bridgeLevel onto MapTransfer |
| Required tests | `DATA-01..03`; MapAction JSON examples; existing `m14-consumer.test.mjs` plus new six-field cases |
| Regression | current five-field fixtures must fail new validator until migrated |
| CI | `essentials-fixture.yml` + map package test |
| Artifacts | schema subject id, migrator, golden synthetic Tileset JSON |
| Stop | any undocumented extra Tileset key; hard-coded Map21 IDs |

### AG-02 Semantics and walk

| Field | Value |
|---|---|
| Task ID | AG-02 |
| Dependencies | AG-01 merged |
| Allowed files | `game-libs/map/src/semantics.ts`, `src/runtime.ts` walk/blocked only, map tests |
| Forbidden files | Browser jump; MapAction execute; original passages |
| Producer/consumer | Content Tileset/Map → `resolveEffectiveTerrainTag` / `evaluatePassability` → `canMove` walk/blocked |
| Scope | Neutral skip-layer; Bridge skip at 0 / use layer at 2; blocked vs walk; no jump execution |
| Required tests | Neutral/Bridge passability matrix; Map7 connection regression |
| Regression | existing layout/runtime walk tests |
| CI | map package + essentials-fixture |
| Artifacts | MovementPlan walk/blocked types wired |
| Stop | implementing jump or bridge events |

### AG-03 Bridge

| Field | Value |
|---|---|
| Task ID | AG-03 |
| Dependencies | AG-02; E2E-21 static traces as golden *shape* (not RGSS) |
| Allowed files | map-owned Runtime bridgeLevel; MapAction consume; Browser depth reproject tests |
| Forbidden files | hard-coded map/event/tile IDs; generic interpreter |
| Producer/consumer | MapAction → Runtime bridgeLevel → RenderDomain depth |
| Scope | start vs execute split as in candidate C-04 static assumption until RGSS exists; transfer clears bridge |
| Required tests | synthetic On/Off; transfer clear; Map7 negative |
| Regression | walk 250ms; transfer replace epochs |
| CI | map package + desktop not required this PR |
| Artifacts | bridgeLevel×passability matrix tests |
| Stop | RGSS conflict; expanding InitialInput without review |

### AG-04 Ledge

| Field | Value |
|---|---|
| Task ID | AG-04 |
| Dependencies | AG-02; shared motion ABI review with AG-03 |
| Allowed files | planner jump kind; Runtime jump motion; Browser jump interpolation |
| Forbidden files | two-walk fake jump; cross-map jump |
| Producer/consumer | MovementPlan jump → Runtime ActiveMove → Browser sprite/camera same motionId |
| Scope | one jumpForward(2); reverse/start/land failures; duration not 250 unless RGSS says so |
| Required tests | LD47 synthetic + live skip; reverse; mid-event synthetic |
| Regression | walk/resize/transfer |
| CI | map package + renderer tests if Browser changes |
| Artifacts | jump payload JSON examples |
| Stop | duration guessed; concurrent overwrite with AG-03 |
