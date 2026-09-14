# 地图 Autotile First-Slice 改造适配冻结稿

> 状态：Draft for freeze（2026-09-14；待确认后改为 Frozen for implementation）  
> 目录：`examples/essentials-v21.1-local`  
> 需求来源：`MAP_BEHAVIOR_REQUIREMENTS.md` 第 3 节（地图跳转 Product Closed）+ 第 1 节（遮挡在目标图上仍成立）  
> 触发缺陷：Map066 东侧边缘进入 Map002 时程序关窗退出  
> 证据基线：本地 Essentials v21.1 FSDB（`[FSDB]Essentials v21.1 2`）+ `Maruno17/pokemon-essentials@ea7b5d56`  
> 前置能力：layering / walking / map-transfer 已落地；Transfer §12.6 门往返已可用，边缘往返因本缺口不合格。

本文是 **改造适配合同**：在不重开 framework Runtime/Renderer/Data 合同、不推翻已冻结 walking/layering/transfer 状态机的前提下，补齐 M14 故意推迟的 RMXP autotile 渲染最小切片，使真实户外图（尤其 Map002）可进入、可看见、可返回。

## 实施合同

本文交给低判断力 implementation agent 机械实施。规则只有一套：

- agent **没有**架构、schema、算法、文件范围、测试 harness、fixture 或 gate 选择权；
- 任一冻结规则无法按原文实现时，**STOP 并报告 blocker**；不得自行扩大 scope、改 framework contract、补 Event Interpreter、用假 Map002 冒充验收，或把“跳过空洞”写成合格；
- walking / layering / transfer 已冻结的 authority、input、timer、Render latest-state、Browser stale-resource/rAF、MapTransfer 状态机继续有效，除非本文明确改写的句子；
- Section 11 是已确认的 v21.1 / 本地 FSDB 事实合同，不再是调查项。

---

## 0. 不合格事实与根因分层

### 0.1 玩家可见现象

1. `play.bat` 启动后，Map066 中间门 → Map067 → 返回：**合格**。  
2. Map066 向东走到边缘格 `(21,8..11)` 再向右：窗口关闭，进程结束：**不合格**。  
3. Transfer 设计稿 §12.6 **Map connection A→B→A**（Map066 ↔ Map002）因此无法 Product Closed。

### 0.2 直接触发链（已无头复现）

```text
Map066 EdgeTransfer (21,y,dir6) → target Map002 (0,y)
  → loadMap(2) 成功（Map / MapTransfer / Tileset1 Outside / Outside.png）
  → beginTransfer commit：current = target
  → domain.replace(renderState())
  → projectVisibleTiles(...)
  → tileId 274（∈ (0,384)）
  → TypeError("Unsupported M14 tile id 274")
  → failTransfer → MAP_TRANSFER_FAILED
  → Main root-outcome ≠ shutdown
  → Desktop 关窗
```

### 0.3 分层根因

| 层 | 事实 |
|---|---|
| 能力缺口 | M14 只支持 regular tile（`tileId >= 384`）；`Tileset.autotile_names` 未投影；Browser 用 `tileId - 384` 只切主图块表 |
| 验收冲突 | Transfer Product Closed 绑定真实 Map002，而 Map002 Outside 出生视野含 Flowers1 autotile |
| 失败放大 | 渲染子集限制被 `beginTransfer.catch` 收成 `MAP_TRANSFER_FAILED`，再被 Desktop 升级成整窗退出 |
| 为何门没事 | Map066 / Map067 的 `data.values` 中 **零个** `0 < tileId < 384` |

### 0.4 本地证据摘要

```text
Tileset id=1 Outside @autotile_names（RmxpRoot，尚未进 consumer）：
  0 Sea
  1 Sea without shore
  2 Sea deep
  3 Sand shore
  4 Flowers1
  5 Water rock
  6 Fountain1

Map002 中 0 < tileId < 384 的唯一集合：
  260, 268, 274, 276, 278, 280
  → 全部 slot=4（Flowers1），variants 20/28/34/36/38/40

[resource]Graphics/Autotiles/ 存在（含 Flowers1.png 等）
validateMapRecord / validateMapTransferRecord(Map2) / validateTilesetRecord(1) 均通过
```

结论：**跳转权威与 FSDB 内容不是根因；缺少 autotile 渲染切片才是。**

---

## 1. 目标、非目标与 authority

### 1.1 必须完成

- 真实 Map 中 `48..383` 的 RMXP autotile 在视野内可绘制，而不是 throw；
- `struct.Tileset` consumer 投影 `autotile_names`（长度恰好 7）；
- Runtime 在 **不把 RMXP 邻接表权威下沉到 Browser** 的前提下，产出 Browser 可直接 blit 的描述；
- 与现有 `priorities` / `tileVisualDepth` / character 遮挡规则共存；
- `loadMap` / transfer **commit 前**完成可投影预检；预检失败不得 swap `current`；
- Browser image decode failure 仍不反向上报 Runtime（与 walking/layering 一致）；
- Section 12 真实验收：Map066 ↔ Map067（回归）与 Map066 ↔ Map002（新闭环）均 A→B→A，且出图不关窗；
- Map002 出生视野中 Flowers1 可见（允许与原版像素级不完全一致，但不得整块留洞、不得把人物沉进空洞）。

### 1.2 明确不做

本刀不实现：

- 水面 / 瀑布 / Fountain **帧动画**与 hue 变色；
- panorama / fog / battleback / terrain_tags 消费；
- `tileId ∈ 1..47` 的非标准或未证实用法（见 Section 11；出现则 projection/preflight failure，不静默画错）；
- 把 `tileId < 384` **skip 留空洞** 当作合格；
- 修改 framework `packages/*` Runtime/Renderer/Data 合同；
- 修改 MapTransfer 状态机语义（contact/step/edge 触发顺序保持）；
- 假地图 / 裁掉 Map002 autotile 后的“演示 FSDB”；
- 通用 TileEngine / AutotileService / SceneManager。

### 1.3 authority 边界

```text
Importer / compatibility
  → 把 RPG::Tileset.@autotile_names 投影进 consumer Tileset
  → 空名归一；资源存在性在 import 或 load 边界按本文规则处理

@loomrealm-game/map Runtime
  → validate Tileset（含 autotile_names）
  → projectVisibleTiles：regular + autotile
  → assertProjectable(map, tileset) 供 initial / transfer 预检
  → 解析 autotile → 固定 blit 描述；加载 Autotiles 资源 ref

Browser (map.browser.js)
  → 校验并绘制 Runtime 给出的 regular / autotile blit
  → 不解释 tileId→variant 邻接表，不读 RmxpRoot

Transfer
  → 只调整 beginTransfer 的预检/commit 顺序（Section 7）
  → 不新增 transfer 类型
```

---

## 2. Consumer 合同改造：`struct.Tileset`

### 2.1 新形状

**打破** M14 Closed 的 Tileset exact field set（仅本字段增量；见 Section 10 对 Closed 合同的显式修订授权）：

```ts
interface TilesetRecord {
  readonly id: number;
  readonly tileset_name: string;
  readonly autotile_names: readonly (string | null)[]; // length === 7
  readonly passages: ProjectedTable;
  readonly priorities: ProjectedTable;
}
```

### 2.2 `autotile_names` 规则

- 来源：`RPG::Tileset.@autotile_names`，Ruby 数组，官方固定 **7** 槽；
- 每个元素：
  - 缺失 / `nil` / 空 `RubyString` → `null`；
  - 非空 `RubyString` → 其 `text`（不得 trim 改变官方文件名空格，例如 `"Sea without shore"`）；
- 长度必须恰好 7；多/少 → projection failure；
- 非字符串且非空槽可归一类型 → projection failure。

### 2.3 FSDB

继续 plain JSON direct-consumer（与 Map / MapTransfer 相同 mapper 分支）。磁盘示例：

```json
{
  "id": 1,
  "tileset_name": "Outside",
  "autotile_names": [
    "Sea",
    "Sea without shore",
    "Sea deep",
    "Sand shore",
    "Flowers1",
    "Water rock",
    "Fountain1"
  ],
  "passages": { "...": "..." },
  "priorities": { "...": "..." }
}
```

`null` 槽在 JSON 中写 `null`，不要省略数组元素。

### 2.4 资源键

```text
主图块表：resource.Graphics / Tilesets/{tileset_name}
Autotile：resource.Graphics / Autotiles/{autotile_names[slot]}
  仅当 autotile_names[slot] !== null
```

Importer **不**因某槽有名字但本 pack 缺文件而在 materialize 阶段失败（与现有 tileset 主图缺失策略对齐：由 Runtime `content.resource` 在 load 时失败）。  
例外：本刀 acceptance 所需的 Outside / Flowers1 必须在真实 FSDB 中存在；缺失则 STOP。

### 2.5 `validateTilesetRecord`

在现有校验上增加：

- exact top-level fields 变为：`id/tileset_name/autotile_names/passages/priorities`；
- `autotile_names` 是 length 7 的数组；
- 每槽 `null` 或非空 string；
- 返回 deep-frozen normalized record。

旧四字段 Tileset JSON **不再合法**（本地 example 必须 `--force` 重导入）。

---

## 3. 可见 tile 与 blit 合同

### 3.1 tileId 分区（冻结）

```text
tileId === 0           → 空白，不发射 VisibleTile
tileId ∈ 1..47         → unsupported（assertProjectable / project 失败）
tileId ∈ 48..383       → autotile
tileId >= 384          → regular（现有路径）
tileId 越出 passages/priorities 长度 → 现有失败语义
```

Autotile 索引：

```text
slot    = floor((tileId - 48) / 48)   // 0..6
variant = (tileId - 48) % 48          // 0..47
```

若 `autotile_names[slot] === null` 但地图出现该 slot 的 tileId → **可投影失败**（不得画主图块表，不得 skip）。

### 3.2 `VisibleTile` 形状

采用 **方案 A：Runtime 展开 blit**（Browser 无邻接表权威）。

```ts
type TileBlit =
  | Readonly<{
      kind: "regular";
      // 从主 tileset 图取样；与现网等价：sx=(tileId-384)%8*32 等由 Browser 用 sourceIndex 计算
      sourceIndex: number; // tileId - 384
    }>
  | Readonly<{
      kind: "autotile";
      slot: number; // 0..6
      // 四个 16×16 角，按 TL, TR, BL, BR 顺序；坐标相对该 slot 的 Autotiles 图像素
      corners: readonly [
        Readonly<{ sx: number; sy: number }>,
        Readonly<{ sx: number; sy: number }>,
        Readonly<{ sx: number; sy: number }>,
        Readonly<{ sx: number; sy: number }>,
      ];
    }>;

interface VisibleTile {
  readonly x: number;
  readonly y: number;
  readonly z: 0 | 1 | 2;
  readonly tileId: number;
  readonly depth: number;
  readonly blit: TileBlit;
}
```

保留 `tileId` 便于测试与调试；绘制只信任 `blit`。

### 3.3 Autotile 四角表

Runtime 内嵌 **一张**冻结的 `variant → 4 corners` 表，语义对齐 RPG Maker XP / RGSS `Tilemap` 对静态 autotile（单帧图）的取样。

约束：

- 每个 corner 的 `sx/sy` 为非负整数，且对齐 16 像素网格；
- 表覆盖 `variant ∈ 0..47` 全部分支；禁止按“看起来像 Flowers1”临场改表；
- **动画条带**（图宽 > 96 时官方按帧横移）：本刀只取 **第 0 帧** 列（`sx` 不加 frameOffset）；不得实现计时切帧；
- 实施前用 Section 11 的 Map002 Flowers1 样本做像素对照；若官方表与本地 PNG 布局冲突 → **STOP**，回写本文，不得猜。

Helper 签名冻结：

```ts
export function autotileCorners(variant: number): TileBlit["corners"] // kind autotile
export function projectTileBlit(
  tileId: number,
  tileset: TilesetRecord,
): TileBlit
```

`projectTileBlit`：

- `>= 384` → `{ kind:"regular", sourceIndex: tileId - 384 }`；
- `48..383` → 校验 slot 名非 null，返回 `{ kind:"autotile", slot, corners: autotileCorners(variant) }`；
- 其他 → throw TypeError。

### 3.4 `projectVisibleTiles`

替换现 throw 逻辑：

```ts
const tileId = tableAt(map.data, x, y, z);
if (tileId === 0) continue;
if (tileId >= tileset.priorities.xSize || tileId >= tileset.passages.xSize) {
  throw new TypeError(`Tileset has no entry for tile id ${tileId}`);
}
const blit = projectTileBlit(tileId, tileset);
const priority = tableAt(tileset.priorities, tileId);
const depth = tileVisualDepth(y, priority);
tiles.push(Object.freeze({ x, y, z, tileId, depth, blit }));
```

遍历顺序不变：`z 0→1→2`；每层 `y` 递增；每行 `x` 递增。

### 3.5 `assertProjectable(map, tileset)`

扫描 **整张** map 的全部 `data` 格（三层），对每个非 0 `tileId` 调用与 `projectTileBlit` 相同的校验；成功返回 void，失败 throw。

用途：

- initial `loadMap` 之后、首次 `createRenderDomain` 之前；
- transfer：`loadMap(target)` 之后、**swap `current` 之前**。

不做“仅视野预检”：避免走进视野才炸；室外图全量扫描可接受。

---

## 4. Runtime / RenderData 改造

### 4.1 `LoadedMap`

```ts
interface LoadedMap {
  readonly mapId: number;
  readonly map: MapRecord;
  readonly tileset: TilesetRecord;
  readonly tilesetRef: ResourceRef;
  readonly autotileRefs: readonly (ResourceRef | null)[]; // length 7
  readonly transfers: MapTransferRecord;
}
```

### 4.2 `loadMap`

固定顺序：

```text
1. struct.Map/<id> + validateMapRecord
2. struct.MapTransfer/<id> + validateMapTransferRecord
3. struct.Tileset/<tileset_id> + validateTilesetRecord
4. assertProjectable(map, tileset)
5. resource Tilesets/{tileset_name} → tilesetRef
6. for slot in 0..6:
     if autotile_names[slot] === null: autotileRefs[slot] = null
     else resource Autotiles/{name} → autotileRefs[slot]
7. return frozen LoadedMap
```

任一步失败：initial → `MAP_ACTIVATION_FAILED`；transfer 路径 → 见 Section 7。

### 4.3 Viewport RenderData

在现有 viewport `data` 上增加：

```ts
autotiles: readonly (ResourceRef | null)[]  // length 7，与 LoadedMap.autotileRefs 相同引用
```

字段集合必须 exact 校验（Browser 与 Runtime 一致）。  
`tiles[].blit` 必须存在。

旧 Browser 只认 `tileId >= 384` 的路径作废；presentation 产物随 `game-libs/map/browser/map.browser.js` 更新（本地 example 经现有 presentation 拷贝/挂载路径消费，不另起第二份权威实现）。

### 4.4 Passability

`canMove` / `mapTilePassable` **不改**。它们已按 `tileId` 查 `passages`；autotile id 本就在表内。

---

## 5. Browser 改造

### 5.1 校验

- viewport：`autotiles` 为 length 7 的数组，元素为 `null` 或合法 ResourceRef；
- 每个 visible tile：
  - 保留 x/y/z/depth/tileId 既有整数约束；
  - **删除** `tileId < 384` 一律非法；
  - 必须有 `blit`；
  - `blit.kind === "regular"` → `sourceIndex` 为非负 safe integer；
  - `blit.kind === "autotile"` → `slot ∈ 0..6`，`corners` length 4，各 `sx/sy` 非负 safe integer；且 `autotiles[slot]` 不得为 `null`。

### 5.2 绘制

在现有 depth bucket 循环内：

```text
regular:
  仍从 tileset image 取 32×32：sx=(sourceIndex%8)*32, sy=floor(sourceIndex/8)*32

autotile:
  取 autotiles[slot] 对应 image（独立 _image 缓存键，沿用 stale/latest 合同）
  按 corners 四次 drawImage 16×16 → 目标格 TL/TR/BL/BR
```

同一 depth bucket 内输入顺序不变。  
`characterVisualDepth` / `tileStackValue` / `characterStackValue` 不变。

### 5.3 Decode failure

Autotile 图与主 tileset 图相同：decode/load 失败时，若仍是 latest requested，clear layers 并 return；**不**通知 Runtime，**不**结束 Frame。

---

## 6. Transfer 适配（最小）

### 6.1 保持不变

```text
attempt 中 contact → walking → edge 顺序
finishStep 中 step 边界
startTransfer / transitioning
held continuation
MapTransfer consumer / edges 投影
```

### 6.2 `beginTransfer` commit 顺序（必须改）

错误现状（会导致权威已换再炸）：

```text
current = target
...
transitioning = false
domain.replace(renderState())   // 这里 throw → 关窗
```

冻结新顺序：

```text
if aborted || transitioning: return
transitioning = true
清 activeMove / stepTimer；source standing replace
target = await loadMap(rule.targetMapId)
  // loadMap 内已 assertProjectable + 资源 ref
if aborted || !transitioning: return
if !inBounds(target.map, targetX, targetY): throw
// 一次性 commit
current = target
x/y/direction 按既有 step/contact/edge 规则
activeMove = null; nextStartPattern = 1; transitioning = false
domain.replace(target standing)
held? → attempt
```

因 `assertProjectable` 已在 `loadMap` 内，commit 后 `replace` 不应再因 `<384` throw。  
若仍 throw（实现 bug），继续 `failTransfer`；但不得在预检可失败的路径上先 swap。

### 6.3 失败码

| 阶段 | code |
|---|---|
| initial loadMap / spawn / 预检 | `MAP_ACTIVATION_FAILED` |
| transfer 中 loadMap / 预检 / bounds / replace | `MAP_TRANSFER_FAILED` |
| Browser decode | 不进上述码 |

不新增第三种业务码（保持简单）；预检失败 message 必须带具体 `tileId` / slot，便于对照本文 Section 0。

---

## 7. 与 Closed 合同的关系

### 7.1 显式修订

下列 Closed 表述被本刀 **局部修订**（仅 autotile 所需最小面）：

```text
M14_CONSUMER_PROJECTION.md
  Tileset 不再 defer autotile_names；exact fields 增加该数组

M14_05_QUALIFICATION_CLOSURE.md §10
  “full autotile support” 仍不声称完成
  本刀只声称：静态单帧、48 variant、7 槽、第 0 动画帧

MAP_LAYERING_DESIGN_DRAFT.md
  projectVisibleTiles 中 `tileId < 384` throw 被本刀废止
  Browser `tileId >= 384` 校验被本刀废止
  depth / stack 公式不变

MAP_TRANSFER_DESIGN_DRAFT.md
  beginTransfer 预检/commit 顺序按本文 Section 6.2
  §12.6 Map066↔Map002 在本刀 Product Closed 后才算真正闭环
```

不得借机重开 M14/M15 qualification 整包；不得修改 `packages/*`。

### 7.2 明确拒绝的“捷径”

```text
❌ projectVisibleTiles 对 <384 continue 留洞
❌ 删除 Map066→Map002 EdgeTransfer 假装无出口
❌ 改 game.json 出生到无 autotile 图冒充户外
❌ Browser 直接读 RmxpRoot/Tilesets_rxdata
❌ 为动画帧引入 GameLoop / 额外 timer authority
```

---

## 8. 文件、测试与完成门禁

### 8.1 Production ONLY

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
game-libs/map/browser/map.browser.js
examples/essentials-v21.1-local/MAP_AUTOTILE_DESIGN_DRAFT.md   # 本文状态行
```

若 presentation 拷贝链路需要同步 browser 产物到 example/FSDB presentation，只允许既有脚本路径，不新增第二实现。

### 8.2 Tests ONLY

```text
tools/fixtures/essentials-v21.1/m14-consumer.test.mjs
game-libs/map/test/semantics.test.mjs
game-libs/map/test/runtime.test.mjs
test/map-layering-browser.test.mjs    # 增加 autotile blit / latest-state 回归；不新 harness
```

### 8.3 禁止修改

```text
packages/*
MAP_TRANSFER 状态机语义（除 Section 6.2 顺序）
struct.Map / struct.MapTransfer shape
用假 map 替换真实 FSDB acceptance
```

### 8.4 Test responsibilities

**Importer**

- Outside（id=1）投影 7 名与 Section 0.4 一致；
- 空名 → `null`；长度非 7 failure；
- 旧四字段不再作为合法期望。

**Semantics**

- `projectTileBlit` regular / autotile / 1..47 / null slot；
- `autotileCorners` 对 0..47 全覆盖且稳定；
- `projectVisibleTiles` 对 Map2 样本 id 274 产出 autotile blit 而非 throw；
- `assertProjectable` 成败；
- `validateTilesetRecord` 新字段。

**Runtime**

- `loadMap` 填充 `autotileRefs`；
- transfer 在 target 含 unsupported tile 时 **不** swap `current` 且 `MAP_TRANSFER_FAILED`；
- 伪造 Map002 子集：edge 成功后 viewport 含 `blit.kind==="autotile"`；
- Browser decode 仍不打爆 Frame（既有合同）。

**Browser**

- regular 回归不破；
- autotile 四角 draw；
- latest-state：旧 tileset/autotile 延迟完成不覆盖新状态。

### 8.5 Exact gates

```bash
npm test -w @loomrealm-game/map
node --test tools/fixtures/essentials-v21.1/m14-consumer.test.mjs
node --test test/map-layering-browser.test.mjs
```

本地 example：

```text
node scripts/init-fsdb.mjs --force
play.bat
  Map066 门 ↔ Map067
  Map066 (21,8) ↔ Map002 (0,8)
```

全部 green + 真人两路径走通 = **Product Closed（本刀）**。

Transfer 原文 baseline-exception（若仍存在）规则继续适用；**不得**把本刀新增失败写入 exception。

### 8.6 唯一施工顺序

```text
1. 冻结本文状态 → Frozen for implementation（人工确认后改状态行）
2. m14-consumer + M14_CONSUMER_PROJECTION + importer tests
3. semantics：Tileset validate、corners 表、projectTileBlit、projectVisibleTiles、assertProjectable
4. runtime：LoadedMap.autotileRefs、loadMap 顺序、RenderData.autotiles、beginTransfer commit 顺序
5. map.browser.js：校验 + 四角绘制 + stale 合同
6. runtime/semantics/browser tests
7. --force 重导入本地 FSDB
8. play.bat Section 12 双路径验收
9. 将本文状态改为 Implementation Complete / Product Closed（按事实）
```

---

## 9. 抽象预算

允许长期概念：

```text
TilesetRecord.autotile_names
LoadedMap.autotileRefs
VisibleTile.blit / TileBlit
autotileCorners / projectTileBlit / assertProjectable
viewport data.autotiles
```

禁止：

```text
AutotileEngine / TileRenderer framework
AnimationTimeline for water
Browser-side variant table as authority
skip-unknown-tile 兼容模式开关
第二套 Map/Tileset schema 并行
```

---

## 10. 最终数据流

```text
RPG::Tileset.@autotile_names
        │
        ▼
 m14-consumer → struct.Tileset (plain JSON, +autotile_names[7])
        │
        ▼
 loadMap: Map + MapTransfer + Tileset
        + assertProjectable
        + Tilesets/* + Autotiles/* refs
        │
        ▼
 projectVisibleTiles → VisibleTile{ blit: regular|autotile }
        │
        ▼
 Browser depth buckets
   regular → Outside.png 32×32
   autotile → Autotiles/{name} 四角 16×16
        │
        ▼
 Map066 edge → Map002 可见 Flowers1，Frame 继续
 Map002 west edge → Map066 返回
```

---

## 11. Frozen 证据合同（实施期不得重解释）

### 11.1 验收坐标

```text
Event（回归）：
  Map066 (12,8) 碰门 → Map067 (4,7)
  Map067 (4,7) 向下碰 Exit → Map066 (12,7)

Edge（本刀必须新绿）：
  Map066 (21,8) dir6 → Map002 (0,8) dir6
  Map002 (0,8) dir4 → Map066 (21,8) dir4
  PBS: 2,W,0,66,E,0
```

### 11.2 Map002 必绘样本

进入 Map002 `(0,8)` 后，首帧视野必须成功投影并绘制至少包含 tileId `274` 的 Flowers1 autotile（允许同视野其他 Flowers1 id）。  
不得因这些 id throw 或关窗。

### 11.3 动画帧

本刀只使用 autotile 图像第 0 帧。即使 `Fountain1` / `Sea` 等图为多帧宽条，也不切帧。

### 11.4 `1..47`

本地 Map066/067/002 验收路径不依赖 `1..47`。若全库扫描 `assertProjectable` 在其它图触发，属后续地图进入时的 fail-closed；不为本刀扩大支持面。

---

## 12. 状态机

```text
Draft for freeze  ← 当前文档提交态
    │ 人工确认 corners 表与文件预算无异议
    ▼
Frozen for implementation
    │ Section 8.6 机械实施
    ▼
Implementation Complete（targeted gates green + diff scope）
    │ play.bat 双路径真人验收
    ▼
Product Closed
```

任一步 STOP 必须写回本文冲突点，禁止静默放宽。

---

这份文档是 Map066↔Map002 验收不合格后的 **整体改造适配合同**。implementation agent 在状态改为 Frozen 后按 Section 8.6 执行；冲突则 STOP。
