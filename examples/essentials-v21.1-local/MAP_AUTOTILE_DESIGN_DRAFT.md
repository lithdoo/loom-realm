# 地图 Autotile First-Slice 改造适配冻结稿

> 状态：Product Closed（2026-09-14；play.bat 真人走通 Map066↔Map067 与 Map066↔Map002；Map002 Flowers1 160×32 single-cell 可见且未关窗）  
> 目录：`examples/essentials-v21.1-local`  
> 需求来源：`MAP_BEHAVIOR_REQUIREMENTS.md` 第 3 节（地图跳转 Product Closed）+ 第 1 节（遮挡在目标图上仍成立）  
> 触发缺陷：Map066 东侧边缘进入 Map002 时程序关窗退出  
> 证据基线：本地 Essentials v21.1 FSDB（`[FSDB]Essentials v21.1`）+ `Maruno17/pokemon-essentials@ea7b5d56` + RMXP/RGSS1 标准 48-variant autotile quarter 表 + 本地 Autotiles PNG 几何  
> 前置能力：layering / walking / map-transfer 已进入 `main`。

本文冻结 M14 之后最小的 RMXP autotile 适配刀：不重开 framework Runtime/Renderer/Data，不引入通用 TileEngine，只补足真实 Map002 所需的 **7 槽、48 variant、两种官方 bitmap layout（96×128 block + 32px-high single-cell）、第 0 动画帧**，并保持既有 map authority / walking / layering / transfer 语义不变。

## 实施合同

本文交给低判断力 implementation agent 机械实施：

- agent **没有**架构、schema、算法、文件范围、fixture、test harness 或 gate 选择权；
- 任一冻结规则无法按原文实现时，**STOP 并报告 blocker**；不得自行扩大 scope；
- 禁止用 `<384 continue`、假 Map002、删除 EdgeTransfer、Browser 解释 RMXP 邻接规则等方式绕过；
- Section 11 是已确认的事实/算法合同；implementation agent 不重新调查或改写；
- 只有 Section 8 白名单文件允许修改；需要超出白名单时 STOP。

---

## 0. 缺陷与根因

### 0.1 真实失败链

```text
Map066 EdgeTransfer (21,y,dir6) → Map002 (0,y)
→ loadMap(2) 成功
→ current = target
→ domain.replace(renderState())
→ projectVisibleTiles(...)
→ tileId 274 (<384)
→ TypeError("Unsupported M14 tile id 274")
→ MAP_TRANSFER_FAILED
→ Desktop 关窗
```

### 0.2 本地事实

```text
Tileset 1 Outside @autotile_names:
  0 Sea
  1 Sea without shore
  2 Sea deep
  3 Sand shore
  4 Flowers1
  5 Water rock
  6 Fountain1

Map002 中 0 < tileId < 384 的唯一集合：
  260, 268, 274, 276, 278, 280

全部属于：
  slot = 4 (Flowers1)
  variants = 20, 28, 34, 36, 38, 40

本地 Autotiles PNG 几何（Outside 相关）：
  Flowers1.png / Flowers2.png = 160×32   ← single-cell（本刀必须支持）
  Sea.png / Sand shore / Water rock = 768×128  ← standard block
  Fountain1.png = 480×128                  ← standard block
```

Map066 / Map067 不含 `0 < tileId < 384`，因此门往返正常而 Map002 首帧失败。

结论：MapTransfer authority、Map/Tileset/MapTransfer content 读取不是根因；缺口是 M14 故意推迟的 autotile consumer/render slice。  
仅支持 96×128 block **不够**：Map002 验收视野依赖的 Flowers1 是 **160×32 single-cell**，必须同时冻结。

---

## 1. Scope 与 authority

### 1.1 必须完成

- `struct.Tileset` 增加 `autotile_names[7]`；
- `tileId 48..383` 可被 Runtime 投影为确定 autotile blit（含 slot + 48-variant corners 数据）；
- 支持两种官方 bitmap layout，并由 Browser 在 decode 后按几何分流绘制：
  - **block**：`height === 128 && width >= 96 && width % 96 === 0` → 四角 16×16；
  - **single-cell**：`height === 32 && width >= 32 && width % 32 === 0` → 整格 32×32（frame 0）；
- Runtime 保持 `tileId → slot/variant → corners` 结构 authority；Browser **不**从邻接关系重算 variant，但 **可以且必须** 按 Section 3.4 用已 decode 的 bitmap 宽高选择 block / single-cell 画法；
- `projectVisibleTiles` 与 transfer preflight 使用同一个 tile 可渲染 invariant；
- transfer target 的结构性 tile projection failure 必须发生在 `current = target` 之前；
- Browser 多图资源必须先全部 decode，再一次性 paint，旧 request 不得部分覆盖新 request；
- Map002 Flowers1（160×32 single-cell）可见，并与人物 layering 共存；
- Map066 ↔ Map067 与 Map066 ↔ Map002 真人往返都成立。

### 1.2 明确不做

本刀不实现：

- autotile 动画计时/帧切换（任何 layout 都只画 frame 0）；
- 除 Section 3.4 两种几何以外的第三种 autotile bitmap layout；
- `tileId 1..47`；
- panorama / fog / battleback / terrain_tags；
- hue；
- framework `packages/*` 修改；
- MapTransfer trigger/state-machine 重设计；
- Browser-side 48-variant / 邻接表（corners 仍由 Runtime 给出）；
- 通用 TileEngine / AutotileService / AnimationTimeline。

### 1.3 authority

```text
RMXP source
  ↓
M14 consumer projection
  → Tileset.autotile_names[7]
  ↓
@loomrealm-game/map semantics
  → tileId partition
  → standard 48-variant quarter table
  → TileBlit { kind:"autotile", slot, corners }
  ↓
Runtime
  → map-wide structural preflight
  → resource refs
  → RenderData
  ↓
Browser
  → decode current request resources
  → classify bitmap: block | single-cell | invalid
  → execute draw path for that class
```

Browser 不读取 RmxpRoot，不从相邻 tile 推导 variant。  
single-cell 路径 **忽略** Runtime 下发的 `corners`（仍必须通过 exact 校验存在），只按 slot 图像素画 frame0 的 32×32。

---

## 2. `struct.Tileset` consumer 合同

### 2.1 Frozen shape

```ts
interface TilesetRecord {
  readonly id: number;
  readonly tileset_name: string;
  readonly autotile_names: readonly (string | null)[]; // exact length 7
  readonly passages: ProjectedTable;
  readonly priorities: ProjectedTable;
}
```

这是对 M14 Closed exact field set 的唯一 schema 增量；`struct.Map` 与 `struct.MapTransfer` 不变。

### 2.2 Importer projection

`RPG::Tileset.@autotile_names` 必须是 decoded Ruby Array，长度恰好 7。

每槽：

```text
null / nil / 空 RubyString → null
非空 RubyString          → 原样 text
其他类型                  → M14_CONSUMER_PROJECTION_FAILURE
```

不得 trim；`"Sea without shore"` 中的空格属于资源名。

输出仍是现有 plain JSON direct-consumer record；不得引入 `$id/$array/$ref`。

### 2.3 Runtime validator

`validateTilesetRecord()` exact fields：

```text
id
tileset_name
autotile_names
passages
priorities
```

要求：

- `autotile_names.length === 7`；
- 每槽为 `null` 或 non-empty string；
- normalized result deep frozen；
- 旧四字段 Tileset 不再合法。

因此 checked-in M14 semantic fixture 也必须补：

```json
"autotile_names": [null, null, null, null, null, null, null]
```

### 2.4 Resource key

```text
regular tileset:
  resource.Graphics / Tilesets/{tileset_name}

autotile slot i:
  resource.Graphics / Autotiles/{autotile_names[i]}
```

`autotile_names[i] === null` 时不请求资源。

Importer 不验证资源存在性；Runtime `content.resource()` 继续负责存在性/contentVersion。Browser decode/bitmap-layout failure 继续属于 presentation failure，不反向变成 Runtime code。

---

## 3. Frozen tile projection

### 3.1 tileId partition

```text
tileId === 0      → empty，跳过
tileId 1..47      → unsupported，throw
tileId 48..383    → autotile
tileId >= 384     → regular
negative/non-int  → invalid（Map Table validator 已应拒绝非 int；projection 仍 fail closed）
```

Autotile：

```text
slot    = floor((tileId - 48) / 48)   // 0..6
variant = (tileId - 48) % 48          // 0..47
```

出现 autotile tileId 但 `autotile_names[slot] === null` → throw，不 skip。

### 3.2 Render types

```ts
type Corner = Readonly<{ sx: number; sy: number }>;

type AutotileCorners = readonly [Corner, Corner, Corner, Corner];

type TileBlit =
  | Readonly<{
      kind: "regular";
      sourceIndex: number; // tileId - 384
    }>
  | Readonly<{
      kind: "autotile";
      slot: number;
      corners: AutotileCorners; // TL, TR, BL, BR
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

Browser 绘制只信任 `blit`；`tileId` 保留给 validation/test/debug。

### 3.3 Frozen 48-variant quarter table

表值是 RMXP 标准 block autotile 第 0 帧中 1-based quarter 编号。每个 variant 恰好四项，顺序 TL/TR/BL/BR。

```ts
const AUTOTILE_QUARTERS: readonly AutotileQuarterRow[] = [
  [27,28,33,34], [ 5,28,33,34], [27, 6,33,34], [ 5, 6,33,34],
  [27,28,33,12], [ 5,28,33,12], [27, 6,33,12], [ 5, 6,33,12],

  [27,28,11,34], [ 5,28,11,34], [27, 6,11,34], [ 5, 6,11,34],
  [27,28,11,12], [ 5,28,11,12], [27, 6,11,12], [ 5, 6,11,12],

  [25,26,31,32], [25, 6,31,32], [25,26,31,12], [25, 6,31,12],
  [15,16,21,22], [15,16,21,12], [15,16,11,22], [15,16,11,12],

  [29,30,35,36], [29,30,11,36], [ 5,30,35,36], [ 5,30,11,36],
  [39,40,45,46], [ 5,40,45,46], [39, 6,45,46], [ 5, 6,45,46],

  [25,30,31,36], [15,16,45,46], [13,14,19,20], [13,14,19,12],
  [17,18,23,24], [17,18,11,24], [41,42,47,48], [ 5,42,47,48],

  [37,38,43,44], [37, 6,43,44], [13,18,19,24], [13,14,43,44],
  [37,42,43,48], [17,18,47,48], [13,18,43,48], [ 1, 2, 7, 8],
];
```

定义：

```ts
type AutotileQuarterRow = readonly [number, number, number, number];
```

唯一坐标公式：

```text
q = AUTOTILE_QUARTERS[variant][corner]   // 1..48
index = q - 1
sx = (index % 6) * 16
sy = floor(index / 6) * 16
```

不得改表、旋转、镜像或基于 Flowers1 外观重新推理。

`autotileCorners(variant)`：

- variant 必须 safe integer 且 `0..47`；
- 返回 deep-frozen `AutotileCorners`；
- 无其他分支。

对 **所有** `48..383` tile（含 single-cell 素材槽）Runtime 仍调用本表生成 `corners`。  
single-cell 只在 Browser paint 时忽略 corners；semantics/Runtime 不因素材几何分支两套 TileBlit。

### 3.4 Autotile bitmap layout contract（两种）

Browser 在资源 decode 成功后，对**本帧实际使用**的每个 autotile bitmap 分类：

#### A. Standard block

```text
height === 128
width >= 96
width % 96 === 0
```

- 每个 96×128 block 是一帧；本刀永远取 frame 0；
- quarter `sx` 只在 `0..95`；
- 绘制走 Section 5.3 **block** 四角路径。

真实样本：`Sea.png` 768×128、`Fountain1.png` 480×128。

#### B. Single-cell（32px-high）

```text
height === 32
width >= 32
width % 32 === 0
```

- 每一帧是横向排列的 32×32 格；本刀永远取 frame 0，即源矩形 `(sx, sy, sw, sh) = (0, 0, 32, 32)`；
- **忽略**该 tile 的 `corners` 与 variant 邻接含义（地图里仍可出现非 0 variant，如 Flowers1 的 20/28/34…；绘制不因 variant 改取样）；
- 绘制走 Section 5.3 **single-cell** 路径。

真实样本（Map002 验收必需）：`Flowers1.png` **160×32**（5 帧 × 32；frame0 = 最左一格）。  
同格式：`Flowers2.png` 160×32。

#### C. Invalid

不满足 A 且不满足 B：

```text
latest request → clear layers + return
stale request  → return
```

不通知 Runtime；不得猜测第三种 layout。

### 3.5 单一结构 invariant

新增一个 semantics-local helper，名称冻结：

```ts
function assertRenderableTileId(tileId: number, tileset: TilesetRecord): void
```

对每个非零 tile 必须同时检查：

```text
1. safe integer && tileId > 0
2. tileId < tileset.passages.xSize
3. tileId < tileset.priorities.xSize
4. tileId 1..47 → throw Unsupported map tile id {tileId}
5. tileId 48..383 → slot 0..6 且 autotile_names[slot] !== null
6. tileId >=384 → pass
```

**`assertProjectable()` 与 `projectVisibleTiles()` 必须调用同一个 helper。** 禁止复制两份近似校验。

### 3.6 `projectTileBlit`

```ts
export function projectTileBlit(
  tileId: number,
  tileset: TilesetRecord,
): TileBlit
```

调用前或函数入口必须执行 `assertRenderableTileId()`。

```text
>=384:
  { kind:"regular", sourceIndex:tileId-384 }

48..383:
  slot/variant
  { kind:"autotile", slot, corners:autotileCorners(variant) }
```

### 3.7 `projectVisibleTiles`

现有 overscan、z/y/x 遍历、priority/depth 公式全部不改。

每个 non-zero tile：

```text
assertRenderableTileId(tileId, tileset)
blit = projectTileBlit(tileId, tileset)
priority = tableAt(tileset.priorities, tileId)
depth = tileVisualDepth(y, priority)
emit frozen VisibleTile
```

### 3.8 `assertProjectable`

```ts
export function assertProjectable(
  map: MapRecord,
  tileset: TilesetRecord,
): void
```

扫描 `map.data.values` 中全部非零 tileId，对每项调用 **同一个** `assertRenderableTileId()`。

因此任何会让 `projectVisibleTiles()` 因 tile structure/schema 抛错的情况，都必须在 map commit 前预先失败。

---

## 4. Runtime contract

### 4.1 `LoadedMap`

```ts
interface LoadedMap {
  readonly mapId: number;
  readonly map: MapRecord;
  readonly tileset: TilesetRecord;
  readonly tilesetRef: ResourceRef;
  readonly autotileRefs: readonly (ResourceRef | null)[]; // exact 7
  readonly transfers: MapTransferRecord;
}
```

### 4.2 `loadMap(mapId)` 唯一顺序

```text
1. struct.Map/<mapId> → validateMapRecord
2. struct.MapTransfer/<mapId> → validateMapTransferRecord
3. struct.Tileset/<tileset_id> → validateTilesetRecord
4. assertProjectable(map, tileset)
5. resource Graphics/Tilesets/{tileset_name} → tilesetRef
6. slot 0..6:
     name null → autotileRefs[slot] = null
     name set  → resource Graphics/Autotiles/{name} → ResourceRef
7. freeze autotileRefs
8. return frozen LoadedMap
```

不加 cache/preload/repository abstraction。

### 4.3 Viewport RenderData exact shape

Browser `lr-map-view` 接收的 `data` exact fields：

```text
mapId
mapWidth
mapHeight
cameraX
cameraY
tileset
autotiles
tiles
cameraMotion
```

其中：

```ts
autotiles: readonly (ResourceRef | null)[] // length 7
```

standing/walking 两条 `renderState()` 都必须发送 `current.autotileRefs`；`tiles[].blit` 必须存在。

### 4.4 initial 与 transfer failure

initial `loadMap/assertProjectable/resource` failure：

```text
MAP_ACTIVATION_FAILED
```

live transfer 中同类 failure：

```text
MAP_TRANSFER_FAILED
```

Browser PNG decode/layout failure不属于 Runtime failure code。

---

## 5. Browser contract

### 5.1 Exact validation

Viewport data 必须 exact match Section 4.3。

每个 tile exact fields：

```text
x / y / z / tileId / depth / blit
```

Regular blit exact：

```text
kind / sourceIndex
```

Autotile blit exact：

```text
kind / slot / corners
```

每个 corner exact：

```text
sx / sy
```

规则：

- x/y/depth/tileId/sourceIndex/sx/sy 为相应 non-negative safe integer；
- z ∈ 0/1/2；
- slot ∈ 0..6；
- corners length 4；
- autotile blit 的 `autotiles[slot]` 不得为 null；
- Runtime 已给定 `corners`，Browser 不重新查 48 表；
- single-cell 路径仍要求 `corners` 字段 exact 合法，但绘制不使用其数值。

### 5.2 Decode transaction：先全量准备，再 paint

每次 `_paintLatest(requested, receivedAt)` 必须按以下顺序：

```text
1. 从 requested.tiles 收集本次可见 tile 实际需要的资源：
   - 至少一个 regular → requested.tileset
   - 每个出现的 autotile slot → requested.autotiles[slot]
   - slot 去重

2. 对 required refs 一次 Promise.all(_image(ref))。
   在全部 settle 前，不得 clear/draw 任一 canvas。

3. 任一 load/decode rejection：
   - _latestData !== requested → return
   - latest → _clearLayers(); return

4. 全部 decode 后再次检查：
   _latestData === requested && isConnected
   否则 return

5. 对本次实际使用的每个 autotile bitmap 做 Section 3.4 分类：
   - block / single-cell → 记录 layout class，供 step 7 使用
   - 任一 invalid 且仍是 latest → _clearLayers(); return

6. 计算 camera progress。

7. 按 depth bucket 一次同步 paint：
   clear bucket canvas
   draw bucket 全部 tile（regular / block autotile / single-cell autotile）

8. trim layers。

9. motion 未完成才 requestAnimationFrame 下一次 _paintLatest。
```

**任何 await 之后、latest check 之前禁止写 canvas。** 这样旧 tileset/autotile 的延迟完成无法产生 partial stale paint。

### 5.3 Draw rules

Regular：

```text
source = sourceIndex
sx = (source % 8) * 32
sy = floor(source / 8) * 32
drawImage(tilesetImage, sx, sy, 32,32, dx,dy,32,32)
```

Autotile **block**（Section 3.4-A）：

```text
image = decoded image for autotiles[slot]
TL corner → dest (dx,dy)
TR        → (dx+16,dy)
BL        → (dx,dy+16)
BR        → (dx+16,dy+16)
每次 drawImage 16×16（使用 blit.corners）
```

Autotile **single-cell**（Section 3.4-B）：

```text
image = decoded image for autotiles[slot]
drawImage(image, 0, 0, 32, 32, dx, dy, 32, 32)
忽略 blit.corners
```

同一 depth bucket 内若混有 block 与 single-cell，按各 tile 所属 slot 的 layout class 分别走上述路径。  
现有 depth bucket 排序、`tileStackValue`、`characterStackValue`、camera rAF contract 不变。

---

## 6. Transfer adaptation

### 6.1 状态机不变

以下均不得修改：

```text
contact → walking → edge attempt 顺序
finishStep step boundary
transitioning boolean
startTransfer/beginTransfer terminal failure channel
held continuation
MapTransfer schema/importer
```

### 6.2 Commit ordering

`loadMap(target)` 已执行完整 `assertProjectable()` 与 resource ref 获取，所以 transfer 必须：

```text
source standing replace
→ await loadMap(target)
→ abort/currentness check
→ target bounds check
→ current/x/y/direction atomic assignment
→ transitioning=false
→ target standing replace
→ held continuation
```

禁止在 `assertProjectable()` 前 swap `current`。

结构性 tileId/passages/priorities/null-slot 错误因此必须发生在 commit 前。

Browser bitmap decode/layout仍是 presentation 边界；它可能在 commit 后 clear presentation，但不改变 Runtime authority，这一点沿用既有 map Browser contract。

---

## 7. Closed contracts 的局部修订

本刀仅修订：

```text
M14_CONSUMER_PROJECTION.md
  Tileset exact fields 增加 autotile_names[7]
  不再声明 autotile_names deferred

MAP_LAYERING_DESIGN_DRAFT.md
  tileId <384 全拒绝被本稿废止
  depth/stack 规则不变

MAP_TRANSFER_DESIGN_DRAFT.md
  target map structural projectability 在 commit 前保证
  trigger/state machine 不变
```

仍然**不声称 full autotile support**；本刀只支持：

```text
标准 96×128 block（多帧宽条取 frame0）
32px-high single-cell（多帧宽条取 frame0）
48 variants 结构投影
```

不得修改 `packages/*` 或重新打开 M14/M15 framework qualification contract。

---

## 8. 文件白名单与测试

### 8.1 Production / contract ONLY

```text
tools/fixtures/essentials-v21.1/lib/essentials/v21.1/m14-consumer.mjs
tools/fixtures/essentials-v21.1/M14_CONSUMER_PROJECTION.md
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
game-libs/map/browser/map.browser.js
examples/essentials-v21.1-local/MAP_AUTOTILE_DESIGN_DRAFT.md
```

### 8.2 Checked-in fixture ONLY

```text
examples/essentials-v21.1/fixtures/semantic-content.json
```

只允许为新 Tileset exact shape 增加 7 个 null；不得改 map/tile expected pixels 来掩盖 regression。

### 8.3 Tests ONLY

```text
tools/fixtures/essentials-v21.1/m14-consumer.test.mjs
game-libs/map/test/semantics.test.mjs
game-libs/map/test/runtime.test.mjs
test/map-layering-browser.test.mjs
test/m14-vertical.test.mjs
```

`test/m14-vertical.test.mjs` 只同步新 viewport exact shape / regular TileBlit，并保持原业务断言。

### 8.4 禁止修改

```text
packages/*
root package scripts
MapTransfer consumer/schema/importer
struct.Map shape
任何 fake Map002 acceptance 数据
其它 M14 qualification tests
```

如 test:m14 证明还必须改其它 Closed test/fixture：STOP，先回写本稿文件白名单。

### 8.5 Required test responsibilities

Importer：

- Outside 的 7 个 autotile 名精确投影；
- nil/empty → null；
- 非 7 长度 fail；
- malformed element fail；
- M14 fixture 的全 null Tileset 合法。

Semantics：

- `validateTilesetRecord` 新 exact shape/deep freeze；
- 48 个 variant 的 quarter table exact snapshot；
- variant <0 / >47 fail；
- regular blit；
- Map002 ids 260/268/274/276/278/280 → slot4 对应 variants；
- null slot fail；
- `1..47` fail；
- passages/priorities bounds fail；
- `assertProjectable` 与 `projectVisibleTiles` 对同一 invalid tile 都 fail；
- tile 274 可正常 VisibleTile + depth。

Runtime：

- `LoadedMap.autotileRefs` exact 7；
- standing/walking viewport 都带 `autotiles` + `blit`；
- initial unsupported map → MAP_ACTIVATION_FAILED；
- transfer structural failure 不 swap current → MAP_TRANSFER_FAILED；
- successful edge transfer → target standing 含 autotile blit；
- held continuation/layering/walking regression 不变。

Browser：

- existing regular drawing unchanged；
- exact RenderData validation；
- block：4 quarters 位置正确；standard 96×128 frame0；animated-width 只读首 96px；
- single-cell：`height===32` 时画 `(0,0,32,32)`，忽略 corners；`Flowers1` 160×32 样本可见；
- 同屏混用 block + single-cell 时按 slot layout class 分流；
- invalid autotile geometry（非 A 非 B）latest → clear；
- tileset/autotile 多资源任一 delayed 时，在 Promise.all 完成前 canvas 不发生 partial paint；
- stale old autotile resolve/reject 不覆盖 latest data；
- depth 与 character occlusion regression 保持。

M14 vertical：

- checked-in fixture 仍能从 Main → Runtime → Renderer → Chromium；
- regular tile 初始/移动/blocked 行为不变；
- 新 exact fields 不破现有 presentation seam。

### 8.6 Exact gates

顺序固定；第一条会 build map package 并刷新 `dist/browser/map.browser.js`，所以后面的 Browser test 不会读旧 dist：

```bash
npm test -w @loomrealm-game/map
node --test tools/fixtures/essentials-v21.1/m14-consumer.test.mjs
node --test test/map-layering-browser.test.mjs
node --test test/m14-vertical.test.mjs
npm run test:fixtures
npm run test:m14
```

沿用 `MAP_TRANSFER_DESIGN_DRAFT.md` 已冻结的 baseline-exception 规则：只有同环境、同 command、clean main 可复现的既有失败可记 exception；本刀新增/修改 targeted case 必须 green。

完成判定：

```text
Feature implementation complete:
  所有 targeted gates green
  + diff 严格落在 Section 8 白名单
  + test:fixtures / test:m14 只有已记录 clean-main baseline exceptions

Strict Implementation Complete:
  上述 exact gates 全部无 exception green

Product Closed:
  Feature implementation complete
  + --force 重导入真实 FSDB
  + Section 11 真人两条往返均成功
```

### 8.7 唯一施工顺序

```text
1. m14-consumer.mjs + M14_CONSUMER_PROJECTION.md + importer test
2. checked-in semantic-content.json 加 autotile_names[7] null
3. semantics.ts：validator → quarter table → shared invariant → blit/project/preflight
4. runtime.ts：autotileRefs → loadMap → RenderData → transfer precommit guarantee
5. map.browser.js：exact validation → multi-resource decode transaction → draw
6. tests：semantics/runtime/browser/m14 vertical
7. Section 8.6 exact gates
8. scripts/init-fsdb.mjs --force
9. play.bat real acceptance
```

任一步发现冻结规则无法成立：STOP，不继续下一步。

---

## 9. 抽象预算

允许：

```text
TilesetRecord.autotile_names
Corner / AutotileCorners / TileBlit
AUTOTILE_QUARTERS
autotileCorners()
assertRenderableTileId()
projectTileBlit()
assertProjectable()
LoadedMap.autotileRefs
viewport.autotiles
```

禁止：

```text
TileEngine
AutotileEngine
AutotileService
TileRenderer framework
AnimationTimeline
Browser-side variant table
Map cache / image preloader authority
兼容模式开关
```

`AUTOTILE_QUARTERS` 是数据常量，不是新 service/manager。

---

## 10. 最终数据流

```text
RPG::Tileset.@autotile_names
        ↓
m14-consumer
        ↓
struct.Tileset + autotile_names[7]
        ↓
validateTilesetRecord
        ↓
assertProjectable ── shared assertRenderableTileId
        ↓
load Tileset/Autotile ResourceRefs
        ↓
projectVisibleTiles
        ↓
VisibleTile.blit
        ↓
Browser collect required refs
        ↓
Promise.all decode + latest check
        ↓
classify each autotile bitmap: block | single-cell | invalid
        ↓
synchronous depth-bucket paint
        ↓
Map002 Flowers1 (160×32 single-cell) visible
```

---

## 11. Frozen evidence / acceptance

### 11.1 Real routes

```text
Event regression:
Map066 (12,8) dir8
→ Door
→ Map067 (4,7)
→ Exit dir2
→ Map066 (12,7)

Edge product closure:
Map066 (21,8) dir6
→ Map002 (0,8) dir6
→ Map002 (0,8) dir4
→ Map066 (21,8) dir4

PBS:
2,W,0,66,E,0
```

### 11.2 Map002 autotile sample

Map002 必须至少正确投影/绘制：

```text
260 → slot4 variant20
268 → slot4 variant28
274 → slot4 variant34
276 → slot4 variant36
278 → slot4 variant38
280 → slot4 variant40
```

素材：`Graphics/Autotiles/Flowers1.png` = **160×32** → Section 3.4-B single-cell。  
进入 `(0,8)` 的首帧必须可见 Flowers1（frame0 整格 32×32）；不得 throw、不得因误用 block 四角留洞、不得关窗。  
Runtime 仍为这些 tile 生成 corners；Browser single-cell 路径忽略 corners。

### 11.3 48 table / layout evidence

Section 3.3 的 48-entry quarter table 是 **block** 绘制的 implementation authority。它与长期使用的 RMXP/RGSS1 compatible Tilemap 实现中的标准表一致；implementation agent 不再寻找其它表，也不做视觉猜测。

block quarter grid 固定为：

```text
6 columns × 8 rows
quarter size = 16×16
frame size = 96×128
```

block 动画素材横向追加 96px frame；本刀 frameOffset 恒为 0。

single-cell 证据：

```text
Flowers1.png / Flowers2.png = 160×32
frame size = 32×32
frame0 source = (0,0,32,32)
```

### 11.4 Unsupported cases

```text
tileId 1..47
第三种 autotile bitmap layout（非 block 且非 single-cell）
autotile animation timing / 非 frame0
null slot referenced by map
malformed bitmap（decode 失败或几何落在 Section 3.4-C）
```

这些不是“画个近似”的许可。结构型错误 Runtime fail closed；bitmap decode/layout 错误 Browser clear latest presentation。

---

## 12. 状态与完成语义

本文已经是：

```text
Product Closed
```

implementation 已按 Section 8.7 落地。Feature implementation complete 的 targeted gates 全绿；`test:fixtures` 全绿；`test:m14` 沿用 map-transfer 已记录的 clean-main baseline exception（`@loomrealm/main` bootstrap / Hostra hang），故不是 Strict Implementation Complete。

本地 `[FSDB]Essentials v21.1` 已 `--force` 重导入：Tileset 1 `autotile_names` 为 Sea / Sea without shore / Sea deep / Sand shore / Flowers1 / Water rock / Fountain1；`Flowers1.png` 为 160×32。Runtime 在真实 Map/MapTransfer/Tileset 上走通门与东缘；`play.bat` 真人窗口完成 Section 11 两条往返：

```text
Map066 (12,8) dir8 → Map067 (4,7) → Exit dir2 → Map066 (12,7)
Map066 (21,8) dir6 → Map002 (0,8) Flowers1 可见 → dir4 → Map066 (21,8)
```

进入 Map002 未 throw、未关窗；Flowers1 按 single-cell frame0 整格绘制，与人物 layering 共存。

状态链（已到达终点）：

```text
Frozen for implementation
→ Feature implementation complete
→ Strict Implementation Complete（若 baseline exceptions 已清；尚未）
→ Product Closed
```
