# Terrain Behavior：CONTRACT_V1 候选审查稿（非规范、不可派单）

> **FREEZE CANDIDATE ONLY / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。依据取证代码提交 `e60e4a521a726233bbda0bb1892f6d25bc47573d`，冻结准备起点 `b26a4d68d1cbe4136242e0b4fd09dd2d617e56a6`。本文件只是供逐项决策的**候选**，不是 `TERRAIN_BEHAVIOR_CONTRACT_V1.md`，不授权玩法实现；任何带 `PROPOSED`、`OPEN` 的字段和时序均不得被 Agent 默认为已签核。
>
> 上游固定 Pokémon Essentials v21.1 commit `ea7b5d56d2436591160983c4e641a2ceee2d875a`；原始素材指纹与本地重跑记录见 [证据 §15](./TERRAIN_BEHAVIOR_EVIDENCE.md)、[证据复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)；签核顺序见 [冻结执行](./TERRAIN_BEHAVIOR_FREEZE_EXECUTION.md) 和 [门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md)。

## 0. 权威来源与修改策略

- 当前**已存在的代码合同**只能从 `src/semantics.ts`、`src/runtime.ts`、`browser/map.browser.js` 和 producer/Content 的实际实现读取。新内容不得悄悄替换既有字段，也不得修改 M14/M15 历史资格记录。
- 原始 v21.1 源码规定行为的条件分支；有 SHA-256 的 Map7/21/47 规定样本事实；静态 JS 移植/BFS 是 `STATIC-INFERRED`，不是 RGSS 原版实际运行。遇冲突须修正候选，不准让实现自己选择。
- 新增 `terrain_tags`、MapAction、bridgeLevel、motion ABI 均须新 subject/schema 版本与兼容性策略。修改 `struct.Tileset` 精确字段集会导致旧校验器不再接受旧数据；不可直接使历史 fixture 自动被视为新合格。
- 本稿的 TypeScript 是**审查提议**，不是已经存在的源码。`OPEN` 决策未填充时不可重命名为 `CONTRACT_V1` 或开始 AG-01～04。

## C-01 数据：已知形状与待签核字段

当前 `semantics.ts` 中 `ProjectedTable = {dimensions,xSize,ySize,zSize,values: readonly number[]}`；`MapRecord = {tileset_id,width,height,data}`；`TilesetRecord` 精确 keys 为 `id,tileset_name,autotile_names,passages,priorities`，`autotile_names` 为长度 7 的 `(string|null)[]`。`Map.data` 校验为 3D 且 `xSize=width,ySize=height,zSize=3`。**这几项是当前代码事实，不是候选新增实现。**

以下是唯一推荐的最小**增量候选**（仍 OPEN）：

```ts
// PROPOSED ONLY: 保留现有 TilesetRecord 全部字段，新增恰好一个字段。
interface CandidateTilesetRecord {
  readonly id: number;
  readonly tileset_name: string;
  readonly autotile_names: readonly (string | null)[]; // length 7; existing
  readonly passages: ProjectedTable;                  // existing 1D
  readonly priorities: ProjectedTable;                // existing 1D
  readonly terrain_tags: ProjectedTable;              // NEW 1D; values indexed by tileId
}
```

签核前须决定：`terrain_tags` 形状 `dimensions=1,ySize=zSize=1,values.length=xSize`；对每个地图非零 tile ID 同时验证 terrain/passages/priorities 都可索引，tag 限定 0～17（是否允许未来未知标签，必须明示）；负 ID、非安全整数、缺字段、错误 table 长度、Tileset key 与 Content key 不一致均 fail-closed，并给精确路径/错误码。旧 records 是拒绝并要求迁移、版本化保留旧 validator，还是双读阶段兼容？由 C-01 审查决定，不可臆测。Producer `m14-consumer.mjs` → prepared `struct.Tileset` → Content → Map Library 的具体 namespace/版本/测试逐段标记 owner。

**必须审核的正反例**：完整六字段且三张表同索引通过；只给新字段而丢 `autotile_names` 拒绝；旧五字段是否走显式迁移；短 1D、3D terrain_tags、负 tile、越界 tile、tag=18、无 Tileset、地图 3D 长度不符拒绝。合成 fixture 不能顶替真实 Map21 素材的合法来源。

## C-02 地形/通行（签名候选；语义规则待逐例签）

```ts
// PROPOSED ONLY; 返回是否有足够数据而非把未知当 false/true。
type CandidateTerrainResult =
  | Readonly<{ status: 'known'; tag: number; sourceLayer: 0 | 1 | 2 | null }>
  | Readonly<{ status: 'invalid'; reason: string }>;
type CandidatePassability =
  | Readonly<{ status: 'decided'; passable: boolean; reason: string }>
  | Readonly<{ status: 'invalid'; reason: string }>;
// resolveEffectiveTerrainTag(context, x, y) 和 evaluatePassability(context, from, direction, bridgeLevel)
// 必须是两个不同查询。以上只是候选返回值，不得作为现有 API。
```

行为审核矩阵必须覆盖：非空 tag 0 仍执行 passage；tag 13 Neutral **忽略该层**并继续下层；tag 17 NoEffect 不等于 Neutral；tag 15 桥下 `bridgeLevel=0` 跳过桥层、桥上数值大于零时由桥层 passage 决策；源格方向与目标格反向均需审原版，方向为 2/4/6/8。`d=0` 是 `over_trigger?` 特殊查询，**不是正常方向输入**：v21.1 负移位结果 bit=0，仍有全阻/priority/其他分支。地图边界、tile 0、未知标签、冲浪/骑车/动态 NPC 的支持边界不得暗中复刻不全却报告原版一致。验收 ID `DATA-*`, `BR-PASS-*`, `REG-*`。

## C-03 事件事实与 MapTransfer 分离

**现有已冻结范围的记录形状（代码事实）**：`struct.MapTransfer` 在 `semantics.ts` 为 `{id,steps,contacts,edges}`，步骤 `(x,y,targetMapId,targetX,targetY,targetDirection)`、接触增加 `direction`、边界记录 `(x,y,direction,targetMapId,targetX,targetY)`；`validateMapTransferRecord` 拒绝多余字段及重复源键。不能在未升级 schema 时偷偷附加 `bridgeLevel` 或 `action`。

**狭义 MapAction 候选**（尚未有正式 producer/schema/Content key）：

```ts
// PROPOSED ONLY. JSON 里的 event/page/command 必须从取证来源验证，不能在 Runtime 硬编码 Map21 ID。
type CandidateMapAction = Readonly<{
  mapId: number; eventId: number; pageIndex: number; commandIndex: number;
  trigger: 1; // 当前桥样本为 player-touch；不声明支持任意事件 trigger
  occupied: readonly Readonly<{ x: number; y: number }>[];
  op: 'bridge-on' | 'bridge-off';
  height: number | null; // on: 默认值 2 的显式投影决策尚待签；off: null
}>;
```

签核前明确：namespace/key、列表排序和唯一键、`size(w,h)` 与原点占用、选择页面倒序及条件投影范围、图形/through/hiddenitem/`over_trigger?` 所需事实、桥脚本严格可接受命令白名单、多个冲突事件优先级、未知相关事件 fail-closed 的范围。不投影/执行通用 Ruby 或无关剧情 NPC。Map21 的八事件 0/2 `over_trigger?=true` 是静态推导而非空图形必然成立；若任何状态/页面变体未被表示，须清晰标注不支持。

**MapTransfer 过滤决策 OPEN**：`projectedD0Passable` 不知道 bridgeLevel，只有可以证明所有相关合法状态均不可走的事实才可导入期永久删除；源端 `(sourceMapId,x,y)` 与目标端 `(targetMapId,x,y)` 单独查。既有 Map21 三条 PBS 中 7 条已物化 edge 无已证实误删；67/93 桥格 D0-false 仅是潜在风险。拟变更保留全部候选、标 eligibility 或增加独立未过滤记录时，需要 exact schema、兼容/迁移与回归清单后才能签。

## C-04 事件时序（当前确定条件与未证时刻）

**SOURCE-PROVEN 分支**：方向 `can_move` 先判定；失败时按条件检测 front touch，成功动作完成才可能 `check_event_trigger_here`；`over_trigger?` 除图形等条件，还要求至少一个占用格 `map.passable?(x,y,0,player)`；`Game_Event#start` 只置 starting，不是同一函数内同步执行脚本。Map21 八事件逐占用格 0/2 的 true 属 `STATIC-INFERRED`。禁止 contact 后对**同次输入**立即重算通行。

**OPEN：** `Game_Player` 的 held-input、事件重入/重复启动、多事件先后、解释器调度与动作完成的帧边界、transfer 与 step/edge/arrival 的优先级；须由逐帧原版日志或经 reviewer 明示批准的静态替代标准确定。`map-route-trace.mjs#applyStarts` 会直接模拟脚本完成并将 `busy` 复零，仅可当离散步骤的静态预测，不是原版帧调度。

## C-05 bridgeLevel 生命周期（OPEN 部分明确列出）

原版 `pbBridgeOn(height=2)`、`pbBridgeOff` 及 `Scene_Map#transfer_player` 调用链提供数值行为骨架。候选：Runtime 独占 bridgeLevel；进入样本初始 0；On 设置 2；Off/跨图归零；下一次通行与 tile depth 读取**已完成脚本**后的状态。仍须冻结：输入 Frame 创建/销毁、异常、取消、动态转图、非 0/2 数值如何合法、同帧投影事务失败时如何回滚及 snapshot 策略。不得未经审查扩大现有 `InitialInput` 四字段 `{mapId,x,y,characterName}`。

## C-06 Motion / RenderDomain ABI（先列实际存在的与新提议）

当前 `runtime.ts` 已有 `ActiveMove {id,fromX,fromY,startPattern}`、`WALK_STEP_MS=250`、根与人物 `sceneEpoch/visualEpoch/motionId`；viewport `cameraMotion {id,durationMs,fromCameraX,fromCameraY}`，player `motion {id,durationMs,fromY,fromScreenX,fromScreenY}`；`beginTransfer` 通过 `domain.replace` 切图并递增 scene/visual epoch；resize 一次 `domain.update` 同时写 viewport 与 player。**现有字段是事实，不等于 jump ABI 已冻结。**

```ts
// PROPOSED conceptual internal plan, not on-wire and not existing TS:
type CandidateMovementPlan =
  | Readonly<{ kind: 'blocked'; direction: 2 | 4 | 6 | 8 }>
  | Readonly<{ kind: 'walk'; fromX: number; fromY: number; toX: number; toY: number; direction: 2 | 4 | 6 | 8 }>
  | Readonly<{ kind: 'jump'; fromX: number; fromY: number; toX: number; toY: number; direction: 2 | 4 | 6 | 8; skippedX: number; skippedY: number }>;
```

签核前需要确定**真正 on-wire 的 exact payload**（kind/from/to/duration、motion ID、epoch、camera/player 同步、jump 弧线/人物图案、逻辑坐标提交时刻），resize/transfer/cancel/abort/old completion/重入/无效包逐项预期。不要把两个 walk 拼成一次 jump，也不要仅为跳跃修 Browser 一侧。bridgeLevel 即使玩家/相机原地不动仍使桥深度重投影，需同次 RenderDomain 更新及 scene/visual epoch 原子一致；不得通过全局提升玩家 zIndex 规避。

## C-07 支持矩阵与 C-08 资格

只承诺 Neutral(13)、Bridge(15)、Ledge(1) 的审定行为；其余 0～17 原值保留，不假称完整水/冰行为。NPC 位置/碰撞若未投影，则相关动态交互必须标为不支持或另获最小事实。`Map7` 仅桥负例与普通门/连接回归，`Map21` 桥正例，`Map47` Ledge 正例；其他地图不能凭“69 张图均扫描”自动获得原版动态资格。

资格闭环：固定实现 base SHA → producer 内容版本/schema diff → TypeScript 构建 → 本地/CI 对应 exact run/SHA → M14 first-slice 与 M15 适用范围差异 → 新 subject 报告 → reviewer 审核。不得把本地 Agent 记录的取证 36/36、CI skip、历史 M14 通过或旧字段断言当新 subject 资格 PASS。许可未确定时完整 FSDB 留本地；合法可分发最小 fixture 及 CI 验证为 FG-05 实际条件。

## 合同签核缺口与决策记录（全部 OPEN）

| 决策 | 需要的证据/确定性输出 | 负责复核对象 | 当前 |
|---|---|---|---|
| DEC-01 | `E2E-21` **单一状态**：Map7 edge→Map21 落点→BFS→Off→On→实际 Bridge tag 格→Off→折返；完整 trace 与事件次数 | source/map reviewer | OPEN |
| DEC-02 | 原版 RGSS bridge/ledge/transfer/held-input/frame 日志；如环境缺失，只能正式 BLOCKED 并由审查者决定是否修改 FG-01，不能自行降级 | original-behavior reviewer | OPEN |
| DEC-03 | Map47 落点/边界/事件支持与运动/相机实际依据及不能证明部分 | movement reviewer | OPEN |
| DEC-04 | terrain_tags schema 及 Content/fixture/旧字段迁移、MapTransfer 不丢动态事实、MapAction exact producer/consumer | data reviewer | OPEN |
| DEC-05 | 真实 TypeScript/JSON on-wire Motion/RenderDomain ABI + 状态矩阵与浏览器共同签核 | runtime/browser reviewers | OPEN |
| DEC-06 | 可合法分发 fixture 及 CI run/SHA；Map7 附录 A 许可处理 | provenance/qualification reviewer | OPEN |
| DEC-07 | C-01～08 逐项批准、AG 任务卡固定 baseline、M14/M15 ledger 正确核对与签名 | specification reviewer | OPEN |

**禁止将本候选直接重命名为正式 `CONTRACT_V1`。** 冻结时应以各项决策的已验证最终结果重写唯一规范文件、写定版本和实现 SHA、记录审查者，并在 FG-01～06 实际 PASS 后才可标 `Contract Frozen / Implementation Pending`。