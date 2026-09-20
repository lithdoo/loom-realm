# Terrain Behavior：CONTRACT_V1 候选审查稿（非规范、不可派单）

> **FREEZE CANDIDATE COMPLETE / NOT FROZEN / NOT IMPLEMENTED / NOT QUALIFIED**。
>
> 本文件是 C-01～08 的精确候选。它不是 `TERRAIN_BEHAVIOR_CONTRACT_V1.md`，不授权 AG-01～04 玩法实现，不能由本 Agent 代签。可执行校验器见 `tools/fixtures/essentials-v21.1/lib/essentials/v21.1/terrain-behavior-contract-candidate.mjs`。
>
> 上游 Pokémon Essentials v21.1 commit `ea7b5d56d2436591160983c4e641a2ceee2d875a`。当前代码合同只存在于 `src/semantics.ts`、`src/runtime.ts`、`browser/map.browser.js` 与 importer/Content 的已实现字段。下列 TypeScript 在签核前不得被当成已存在 API。

## 0. 状态、证据等级与禁止事项

| 等级 | 含义 |
|---|---|
| SOURCE-PROVEN | 固定 v21.1 源码条件分支 |
| FSDB-OBSERVED | 带 SHA-256 的原始素材抽取 |
| STATIC-INFERRED | JS 规则移植、BFS、统一 replay；**不是 RGSS** |
| STATIC-ASSUMPTION | Wait-free `pbBridgeOn/Off` 在下一次方向输入前完成；**不是帧日志** |
| DYNAMIC-OBSERVED | 原版 RGSS 逐帧。本机 **BLOCKED** |
| PROJECT DECISION | LoomRealm 设计选择，待 reviewer 签核后才能进入 V1 |

禁止：提前实施玩法；为过关改 Runtime/Browser；提交原始 rxdata/完整受限地图 JSON；把静态 execute 写成 RGSS 实测；把 live skip 写成 PASS；Agent 自签 `CONTRACT FROZEN`。

## 1. 已核验基线（FZ-00）

| 项 | 值 | 等级 |
|---|---|---|
| 分支 | `docs/map-terrain-behavior-freeze-handoff` | git |
| 准备起点 SHA | `922890356cd505d06350cc3f67510a2482d65f11` | git |
| OS / Node | Windows 10 19044 / Node v22.12.0 | 本机 |
| 本地 FSDB | `examples/essentials-v21.1-local/[FSDB]Essentials v21.1` | 存在 |
| Map007.rxdata | `c34ddaaec265241fd35149d6d3758f8f08a5503b057c891e396c39b08518c6b7` / 37559 B | FSDB-OBSERVED |
| Map021.rxdata | `cd226a09dbf5cbfd2207edd44fb7dd419327ae901a1f1c0f6ad35601df85c575` / 28708 B | FSDB-OBSERVED |
| Map047.rxdata | `5f4ee232e4f4b8b44950f826b13cd601ffecb87e455c1dda92c5908152df043e` / 32107 B | FSDB-OBSERVED |
| Tilesets.rxdata | `433033b45527c0f07b781c862724df64d6a416c0ac2ed71907f645c0b2219fa6` / 163802 B | FSDB-OBSERVED |
| CommonEvents.rxdata | `196c5ee7f51e656b79514ce203f4077f4b12ff55192ebdf4dd0aefdd7734de12` / 2566 B | FSDB-OBSERVED |
| MapInfos.rxdata | `8ed090fb27db75e046755896e0d4dbb53fa6de6279d21865315dd60f868d5007` / 3377 B | FSDB-OBSERVED |
| PBS map_connections.txt | `a81c0a2cfad6ead0358384bdeea00353c796bb98c1b996b4b3b2be1233ee3cb0` / 1121 B | FSDB-OBSERVED |
| MapTransfer/7.json | `8fe855894055ea026c9da590fdd3d2c178f938cd392f2bebe91918568dd6f449` / 4050 B | FSDB-OBSERVED |
| MapTransfer/21.json | `f5bbed3a4a61f2e70f1831928c4cb8a774d524e83839943ae1c2f58ccd1d20bd` / 545 B | FSDB-OBSERVED |
| RGSS Game.exe / RGSS*.dll | 本仓库与 examples 树中不存在 | BLOCKED |
| `examples/*/play.bat` | Hostra/Electron 产品入口，**不是**原版 RGSS | SOURCE-PROVEN 本仓库 |

## C-01 Data

**事实依据：** 当前 `TilesetRecord` keys 仅为 `id,tileset_name,autotile_names,passages,priorities`。RMXP `RPG::Tileset.@terrain_tags` 存在于 decoder class-registry。旧 fixture 是五字段。

**备选：** (A) 原地加第六字段并拒绝旧记录；(B) 双读兼容期；(C) 新 Content namespace。

**PROJECT DECISION（待签核）：** 选 (A)。保留全部现有字段，**恰好**增加 `terrain_tags`。旧五字段记录 **拒绝**，由 AG-01 显式 migrator 重写；不在 Runtime 暗中默认 `[]`。`autotile_names` 仍为长度 7。三张 1D 表 `xSize` 必须相同。tag 值域 **0～17** 的整数；18、负数、非安全整数 fail-closed。未知未来标签不允许。缺 Tileset、短表、3D terrain_tags、地图非零 tile 无法索引三表之一：错误码 `TILESET_RECORD_INVALID` / `MAP_TILE_INDEX_INVALID`。

```ts
interface ProjectedTable {
  readonly dimensions: number;
  readonly xSize: number;
  readonly ySize: number;
  readonly zSize: number;
  readonly values: readonly number[];
}
interface CandidateTilesetRecord {
  readonly id: number;                     // positive safe integer
  readonly tileset_name: string;
  readonly autotile_names: readonly (string | null)[]; // length === 7
  readonly passages: ProjectedTable;       // dimensions=1, ySize=zSize=1, values.length=xSize
  readonly priorities: ProjectedTable;
  readonly terrain_tags: ProjectedTable;   // NEW; same xSize; each value in 0..17
}
```

**正例：** `CANDIDATE_JSON_EXAMPLES.tilesetOk`。
**反例：** 缺 `autotile_names`；五字段旧记录；短 1D；3D tags；tag=18。测试：`map-e2e-21.test.mjs` C-01 段；`validateCandidateTilesetRecord`。

**Producer / consumer**

| 字段 | Producer | Consumer |
|---|---|---|
| 现有五字段 | `m14-consumer.mjs#projectTilesetRecords` | Content `struct.Tileset` → Map Library `validateTilesetRecord` |
| `terrain_tags` | **未实现**；AG-01 才改 producer | AG-01 起 Map Library；在此之前 Runtime 不得读取 |

**默认值：** 无。缺字段不是 0。
**迁移：** 新 schema subject；不改写历史 M14 ledger。
**验收：** `DATA-01` 六字段同索引通过；`DATA-02` 旧五字段拒绝；`DATA-03` 非法 table 拒绝。

## C-02 Semantics

**事实依据：** `vanilla-map-rules.mjs#playerPassableTrace` 移植 `Game_Map#playerPassable?`。None(0) 非空 tile 仍走 passage；Neutral(13) `ignore_passability` **只跳过该层**；NoEffect(17) 不是 Neutral；Bridge(15) 在 `bridgeLevel===0` 跳过桥层，`bridgeLevel>0` 由桥层 passage 决策；Ledge(1) 由 `move_generic` 另支。`d=0` 仅用于 `over_trigger?` / jump 落点，使用 Ruby 1.8 负移位，bit=0。

**备选：** 合并 tag+passage 单函数；或两查询。

**PROJECT DECISION：** 两查询必须分开。签名（尚未存在于 `semantics.ts`）：

```ts
type TerrainQuery =
  | Readonly<{ status: 'known'; tag: number; id: string; sourceLayer: 0 | 1 | 2 | null }>
  | Readonly<{ status: 'invalid'; reason: string }>;
type PassabilityQuery =
  | Readonly<{ status: 'decided'; passable: boolean; reason: string; bit: number }>
  | Readonly<{ status: 'invalid'; reason: string }>;
// resolveEffectiveTerrainTag(context, x, y, bridgeLevel)
// evaluatePassability(context, x, y, direction, bridgeLevel)
```

方向仅 `2|4|6|8` 为行走输入。边界外 `passable:false` / `reason:'invalid-coordinates'`。tile 0 跳过。冲浪/骑车/NPC 动态碰撞 **本轮不承诺**。

**验收：** 既有 `EV-TRIGGER-01/02`、`BR-PASS-*` 合成 Neutral/Bridge；不得把未知 tag 当 None 而不记 invalid。

## C-03 Event / MapTransfer / MapAction

**事实依据：** `MapTransferRecord = {id,steps,contacts,edges}`。edge `(x,y,direction,targetMapId,targetX,targetY)`。不得在未升 schema 时附加 `bridgeLevel`。Map21 物化：Map7→21 四条 `(40–43,0) dir=8 → (19–22,76)`；反向 `(19–22,76) dir=2 → (40–43,0)`。D0 潜在丢边 ≠ 已证实误删。

Map21 桥事件（本 SHA，page 0 常开、trigger=1、through、空图形）：

| ID | 脚本 | origin | occupied | size |
|---:|---|---|---|---|
| 4 | On | (20,49) | x=20 y=46–49 | (1,4) |
| 28 | Off | (19,49) | x=19 y=46–49 | (1,4) |
| 10 | On | (14,32) | x=14–16 y=32 | (3,1) |
| 7 | Off | (14,31) | x=14–16 y=31 | (3,1) |
| 22 | On | (22,57) | x=22–23 y=57 | (2,1) |
| 20 | Off | (22,58) | x=22–23 y=58 | (2,1) |
| 25 | On | (14,68) | x=14–15 y=68 | (2,1) |
| 23 | Off | (14,69) | x=14–15 y=69 | (2,1) |

`over_trigger?` 在 bridgeLevel 0/2 为 true、here：**STATIC-INFERRED**。空图形 ≠ 自动 walk-on。

**备选：** 通用事件解释器；或狭义 MapAction。

**PROJECT DECISION：** 狭义 MapAction，不执行 Ruby。namespace 待 AG-01 放入 prepared FSDB（建议 `struct.MapAction`，key=`${mapId}` 列表）。唯一键 `(mapId,eventId,pageIndex,commandIndex)`。只投影 trigger=1 且脚本可静态识别为 `pbBridgeOn`/`pbBridgeOff` 的页面。`pbBridgeOn` height **恰好 2**。命令白名单：355/655 且文本匹配 `pbBridgeOn`/`pbBridgeOff`，加终止 0。未知相关桥候选 fail-closed（不投影、不在 Runtime 硬编码 Map21 ID）。404 是 Show Choices branch-end，**不得当空**；Map47 的 404 在 EV007/EV013，不在 Ledge 格上，不改变 jump 物理。

```ts
type CandidateMapAction = Readonly<{
  mapId: number;
  eventId: number;
  pageIndex: number;
  commandIndex: number;
  trigger: 1;
  occupied: readonly Readonly<{ x: number; y: number }>[];
  op: 'bridge-on' | 'bridge-off';
  height: 2 | null; // on: 2; off: null
}>;
```

**JSON 正例：** `mapActionOn` / `mapActionOff`。反例：trigger≠1；on 且 height≠2。
**MapTransfer 过滤：** 保持现有投影；不得因“潜在 D0 风险”删除已物化 Map7/21 edge。新增 eligibility 字段须升 schema。
**验收：** `E2E-21-02` 无物化边 fail-closed；`wouldProjectEventAsTransfer` size/hiddenitem 跳过。

## C-04 Time

**SOURCE-PROVEN：** `can_move` 先于事件；失败才 front touch；成功移动完成后 `check_event_trigger_here`。`Game_Event#start` 只置 `@starting`（且 `@list.size > 1`）。解释器运行中 here/touch 立即返回。

**STATIC-ASSUMPTION（本轮静态合同，不是 RGSS）：** 统一 replay 把 start 与 interpreter-execute 分成两步。Wait-free `pbBridgeOn/Off` 在下一次方向输入前被 `advance()` 插入的 `interpreter-tick` 结算。`nextInputAvailable=false` 直到 execute 完成。held input 在 execute 之后可以再次 start。同一次 walk 的 start 记录 `execute:false`。

**仍须 DYNAMIC-OBSERVED 才能冻结为原版时序：** 帧边界、Wait 命令、多事件优先级、解释器未完成时的 held input 吞键。在取得 RGSS 日志或正式门禁变更前，C-04 的“帧精确”条款保持 **OPEN**；静态 replay 不得自称 DYNAMIC。

**Given/When/Then**

1. Given Map7 `(40,0)` dir=8 bridge=0；When input `up`；Then kind=`transfer`，target Map21 `(19,76)`，`bridgeLevel=0`（`Scene_Map#transfer_player` → `pbBridgeOff`）。
2. Given 走到 On 占用格且 over_trigger；When walk 完成；Then start checkpoint `started=true, execute=false`，`pendingExecute` 置位；下一方向输入前先 execute，bridgeLevel→2。
3. Given 面前有非 through 有名 NPC；When can_move 失败；Then kind=`blocked-or-touch`，可 touch start，不改变 x/y。

## C-05 State

**SOURCE-PROVEN：** `pbBridgeOn(height=2)`；`pbBridgeOff`；`transfer_player` 总是 `pbBridgeOff`。

**PROJECT DECISION：** Runtime **独占** `bridgeLevel`。合法值本轮仅 `{0,2}`；其它值 fail-closed，不静默钳制。初值 0。On execute 后为 2；Off execute 或任何 transfer 后为 0。不扩展现有 `InitialInput` `{mapId,x,y,characterName}`；bridgeLevel 不进启动输入，进图后为 0。Frame 失败须回滚到执行前 snapshot（AG-03 实现时测试）。depth 缓存在 bridgeLevel 变化时必须与人物同次 `domain.update` 失效。

**矩阵（静态）**

| 前态 bridge | 事件 | 后态 | 通行 |
|---:|---|---:|---|
| 0 | none | 0 | 跳过 tag15 层 |
| 0 | On execute | 2 | 使用桥层 passage |
| 2 | Off execute | 0 | 跳过桥层 |
| 任意 | transfer | 0 | 目标图按 0 |

## C-06 Motion / RenderDomain

**已存在（不得假装已含 jump）：** `WALK_STEP_MS=250`；`ActiveMove {id,fromX,fromY,startPattern}`；viewport/player `sceneEpoch,visualEpoch,motionId`；walk 时 `domain.update` 同时写 viewport+player；`beginTransfer` 用 `domain.replace` 且 scene+visual 同增。

**备选：** jump=两次 walk；或一次 jump 计划。

**PROJECT DECISION：** jump **一次** `jumpForward(2)`，逻辑坐标跳过中间格。不得拆成两次 walk。on-wire 在 AG-04 前 **不存在**；候选内部计划：

```ts
type CandidateMovementPlan =
  | Readonly<{ kind: 'blocked'; direction: 2 | 4 | 6 | 8 }>
  | Readonly<{ kind: 'walk'; fromX: number; fromY: number; toX: number; toY: number; direction: 2 | 4 | 6 | 8; durationMs: 250 }>
  | Readonly<{ kind: 'jump'; fromX: number; fromY: number; toX: number; toY: number; skippedX: number; skippedY: number; direction: 2 | 4 | 6 | 8;
      durationMs: 'UNVERIFIED-pending-RGSS'; peakRule: 'distance * TILE_HEIGHT * 3 / 8' }>;
```

**epoch 规则（现有 walk/transfer 事实 + 候选）：** 新 motion 分配新 `motionId`；resize 一次 update 写 viewport+player 且 visualEpoch+1；transfer `replace` 且 sceneEpoch 与 visualEpoch 同增；过期 completion（motionId 不匹配）丢弃；cancel/abort 清 ActiveMove 且 visualEpoch+1。jump duration **不可写死为 250**，须 RGSS 或 reviewer 明示。相机跟随 jump 弧线与人物同一 motionId。

**状态矩阵（实现必须遵守；动态单元格仍 BLOCKED）**

| 状态 \ 事件 | 方向输入 | motion complete | resize | transfer | cancel |
|---|---|---|---|---|---|
| idle | 可开始 walk/jump/blocked | ignore | visual+1 同次 update | replace+清 bridge | ignore |
| walking | 忽略或排队：**OPEN/RGSS** | 提交逻辑格，here 检测 | 同次 update，不改逻辑格 | 见 AG-03 冲突表 | 清 motion |
| jumping | 忽略 | 提交落点，中间格不占用 | 同次 update | **UNVERIFIED** | 清 motion |
| transitioning | 忽略 | 落地 bridge=0 | 禁止半截 | n/a | n/a |
| event-running | 忽略直到 execute 完（静态假设） | n/a | 允许 visual | 以 transfer 规则为准 | n/a |
| aborted | 回到 idle | ignore | visual+1 | 允许 | ignore |

## C-07 Support

本轮只承诺 Neutral(13)、Bridge(15)、Ledge(1)。0～17 原值保留。不承诺水/冰/冲浪/骑车。NPC 碰撞仅当事件被投影为阻塞/touch 时；未投影 NPC **不支持**。跨图 jump **不支持**（`Game_Character#jump` 落点在当前地图 `passable?`）。Map7＝桥负例+普通连接回归；Map21＝桥正例；Map47＝Ledge 正例。69 图扫描 ≠ 动态资格。

## C-08 Qualification

| 项 | 决定 |
|---|---|
| 新 subject | 增加 `terrain_tags` 后必须新 Tileset schema subject；不改历史 M14 first-slice / M15 ledger |
| 本地取证 | `map-event-evidence` + acceptance：36+1（404 标签）及 E2E/LD47 新文件；有 FSDB 时 live 实跑，无 FSDB 时 skip ≠ PASS |
| CI | `.github/workflows/essentials-fixture.yml` → `npm run test:fixtures`。已记录 run [35499223917](https://github.com/lithdoo/loom-realm/actions/runs/35499223917) on `faf4c64`：**failure**（EV-SAFETY-01 POSIX `forensicRelPath`）。修复后须另有 run。live skip ≠ PASS。无许可则 FG-05 不得 PASS |
| 许可 | 合成 fixture `SYNTHETIC_FIXTURE_LICENSE` 可分发；原始 Essentials 地图/PBS/附录 A **未获再分发许可**。附录 A 保持原样不扩大 |
| 审查 | CONTRACT_V1 仅在授权 reviewer 逐项签核 FG-01～06 后创建 |

## DEC-01～07

| 决策 | 事实 / 备选 / 决定 | 验收 | 冻结状态 |
|---|---|---|---|
| DEC-01 E2E-21 | 已用单一 `replayWorld` 从物化 Map7 edge 连续到 tag15、下桥、反向 transfer。输入搜索的 BFS 只生成输入；验收对象是 unified trace。独立核对：`tableAt` 桥格 + MapTransfer 边成员 + 邻接，不导入 `traceWorldStep`/`replayWorld`。 | `map-e2e-21.test.mjs` E2E-21-01..08；CLI `map21-e2e-evidence.mjs`。等级 **STATIC-INFERRED** | 静态闭合；动态仍缺 |
| DEC-02 RGSS | 本机无 Game.exe/RGSS*.dll。play.bat=Hostra。 | 见 §RGSS BLOCKED。Gate 不降级 | **OPEN / BLOCKED** |
| DEC-03 Map47 | 30 格；`(16,9)→(16,11)`；30 逆向均失败；404=show-choices-branch-end，EV007/013 不在 Ledge 格；合成负例单独标注；跨图 jump 不支持 | `map47-ledge-acceptance.test.mjs` LD47-01..06 | 静态闭合；动态仍缺 |
| DEC-04 schema | C-01/C-03 上文。旧五字段拒绝。MapTransfer 不加桥字段 | `validateCandidateTilesetRecord` / MapAction | PROJECT DECISION 待签 |
| DEC-05 motion | C-06。jump duration UNVERIFIED | 现有 runtime walk 测试 + LD47 静态一次两格 | PROJECT DECISION 待 runtime/browser 签 |
| DEC-06 fixture/CI | 合成世界可提交；真图 live 留本机。附录 A 不扩大 | `npm run test:fixtures`；失败 run `35499223917` 已记；POSIX 脱敏已修 | FG-05 **OPEN** 直至绿 CI **且** 许可签核；live skip ≠ PASS |
| DEC-07 签核 | Agent 不得自签 | 授权 reviewer | **OPEN** |

## 测试命令

```text
node --test tools/fixtures/essentials-v21.1/map-event-evidence.test.mjs tools/fixtures/essentials-v21.1/map-evidence-acceptance.test.mjs tools/fixtures/essentials-v21.1/map-e2e-21.test.mjs tools/fixtures/essentials-v21.1/map47-ledge-acceptance.test.mjs
npm run test:fixtures
node tools/fixtures/essentials-v21.1/map21-e2e-evidence.mjs --source "examples/essentials-v21.1-local/[FSDB]Essentials v21.1"
```

无官方 FSDB 时 live 子测试 skip，必须报告 skip 数，不得写 PASS。

## 仅剩外部阻碍（解除后即可签 V1）

1. **RGSS 动态日志：** 合法 v21.1 `Game.exe` + 可恢复测试存档。复现：从 Map7 `(40,0)` 向上进入 Map21，四组 Off/On/tag15/折返；记录逐帧 x/y/bridgeLevel/start/execute；Map47 `(16,9)` 向下跳。完成后填 DYNAMIC-OBSERVED 并对照静态 trace。
2. **素材再分发许可：** 法务/维护者书面允许 CI 使用 Map007/021/047 或其最小派生。否则 FG-05 保持 OPEN，CI 只跑合成。
3. **CI workflow run：** 失败 run `35499223917` 已记录。需要修复后的 `essentials-fixture.yml` 绿 run ID + SHA + 明确 skip 数。绿合成 ≠ FG-05 PASS。
4. **授权 reviewer 签核** DEC-01～07 与 FG-01～06。本 Agent 不能签署。

**在上述 1–4 完成前，禁止创建 `TERRAIN_BEHAVIOR_CONTRACT_V1.md`，禁止把状态改为 CONTRACT FROZEN。**
