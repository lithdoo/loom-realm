# 地图视觉层级 / 遮挡冻结实现规格

> 状态：**Frozen for implementation；Product closure pending real-asset visible acceptance**  
> 目录：`examples/essentials-v21.1-local`  
> 对应需求：`MAP_BEHAVIOR_REQUIREMENTS.md` 第 1 节「人物与地图环境的遮挡关系」  
> 范围：只实现地图 tile 与玩家角色的视觉前后关系；不包含行走动画、地图跳转、NPC/Event 行为。  
> 文件名因历史链接保留 `MAP_LAYERING_DESIGN_DRAFT.md`；实现状态以本文头部为准。

本文是给执行型 agent 使用的冻结规格。除本文明确标记为“可自由实现”的局部代码组织外，执行者没有设计裁量权。

如果实现过程中出现下列任一情况，**停止扩展设计并报告 blocker**：

- 当前源码与本文冻结的输入/输出合同无法同时满足；
- Essentials v21.1 实际 `Tileset.priorities` 出现 `0..5` 之外的值；
- 本文规定的 RMXP depth/tie 规则与真实原版可观察行为冲突；
- 本文指定的 browser test 无法在现有 Playwright/Chromium 基线表达；
- 需要修改本文明确禁止修改的 framework package 才能完成。

禁止为了绕过 blocker 自行放宽数据值域、发明第二套排序规则、增加 framework 层抽象或制造 test-only presentation path。

---

## 1. 完成目标与修改预算

当前缺口是：`lr-map-view` 把全部地图 tile flatten 到一个 Canvas，`lr-map-sprite` 再显示在该 Canvas 上方，因此玩家永远盖住所有地图像素。

冻结后的最小数据流：

```text
Map.data[x,y,z] + Tileset.priorities[tileId]
        ↓
tileVisualDepth(y, priority)
        ↓
VisibleTile.depth
        ↓
lr-map-view 当前可见 depth buckets
        ↓
tile stack value = depth * 2

player y + character frameHeight
        ↓
characterVisualDepth(y, frameHeight)
        ↓
character stack value = depth * 2 + 1
```

### 1.1 允许修改的 production 文件

只允许：

```text
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
game-libs/map/browser/map.browser.js
```

### 1.2 允许修改/新增的测试文件

```text
game-libs/map/test/semantics.test.mjs
test/map-layering-browser.test.mjs      # 新增
```

### 1.3 默认不得修改

```text
package.json
package-lock.json
tools/fixtures/essentials-v21.1/**
examples/essentials-v21.1-local/game.json
packages/renderer/**
packages/subsystem/**
packages/main/**
packages/data/**
packages/wire/**
```

现有 root 已有 `playwright`，不增加依赖。

### 1.4 禁止新增的抽象

不要新增：

```text
SceneGraph
LayerManager
DepthManager
CanvasRegistry
PresentationRuntime
Renderer generic z-sort API
任何 framework 通用 depth/layer API
```

本需求是 `@loomrealm-game/map` 的业务 presentation semantics。

---

## 2. 冻结的 RMXP 兼容规则

本节是实现合同，不再是候选方案。

### 2.1 Tileset priority 值域

冻结为：

```text
priority ∈ {0,1,2,3,4,5}
```

`validateTilesetRecord()` 必须在 Frame activation 时一次性验证 `priorities.values` 全表。`validateTable()` 已经负责 safe integer 校验；这里额外只检查范围。

如果出现 `<0` 或 `>5`：

```ts
throw new TypeError("Tileset.priorities values must be integers from 0 through 5");
```

不要在 viewport 第一次看到某个 tile 时才发现非法 priority。

### 2.2 Tile visual depth

冻结实现：

```ts
const TILE_SIZE = 32;

export function tileVisualDepth(y: number, priority: number): number {
  if (priority === 0) return 0;
  return (y + priority + 1) * TILE_SIZE;
}
```

精确测试向量：

```text
tileVisualDepth(0, 0) === 0
tileVisualDepth(0, 1) === 64
tileVisualDepth(1, 1) === 96
tileVisualDepth(0, 2) === 96
```

camera 不参与该函数；world depth 只决定排序，`cameraX/cameraY` 只决定屏幕绘制位置。

### 2.3 Character visual depth

冻结实现位于 `map.browser.js`，不增加 Runtime `depthBase`：

```js
function characterVisualDepth(y, frameHeight) {
  return y * 32 + 32 + (frameHeight > 32 ? 31 : 0);
}
```

精确测试向量：

```text
characterVisualDepth(0, 32) === 32
characterVisualDepth(0, 33) === 63
```

### 2.4 Equal-depth tie

冻结规则：

```text
tileDepth < characterDepth  → tile 在角色下面
tileDepth > characterDepth  → tile 在角色上面
tileDepth == characterDepth → character 在 tile 上面
```

不得依赖 DOM 创建顺序“碰巧”得到 equal-depth 结果。

使用下面唯一允许的 numeric stacking 编码：

```js
function tileStackValue(depth) {
  return depth * 2;
}

function characterStackValue(depth) {
  return depth * 2 + 1;
}
```

所以：

```text
tile depth=32      → z-index 64
character depth=32 → z-index 65
```

既保留不同 depth 的严格顺序，也显式冻结 equal-depth 时角色在上。

### 2.5 兼容规则来源

实现 agent 不需要重新研究这些规则。冻结依据：

- RMXP Tilemap Z 规则：priority 0 的 tile 为 Z=0；priority 1 的最上行 tile 为 Z=64；每向下一行或 priority 增加一级，Z 增加 32：  
  `https://www.rpg-maker.fr/dl/monos/aide/xp/source/rgss/gc_tilemap.html`
- RMXP Sprite 同 Z 时，后创建对象显示在前；标准地图组合先创建 Tilemap、后创建 Character Sprite，因此 equal-depth 冻结为 character above tile。  
- RMXP character `screen_z(height)` 的高度修正规则为 `height > 32 ? +31 : +0`。

如果真实 Essentials v21.1 明确覆盖上述基础行为，返回 blocker；不要由执行 agent 自行改兼容规则。

---

## 3. `semantics.ts` 精确修改

### 3.1 `VisibleTile` 最终形态

必须保留现有字符串索引签名，只增加 `depth`：

```ts
export interface VisibleTile {
  readonly [key: string]: number;
  readonly x: number;
  readonly y: number;
  readonly z: 0 | 1 | 2;
  readonly tileId: number;
  readonly depth: number;
}
```

不要把 `z` 改名为 `layer`。

### 3.2 `tileVisualDepth()`

在 `semantics.ts` 中导出 `tileVisualDepth()`，供该 package 的直接语义测试使用。

**不要**修改 `game-libs/map/src/index.ts`；不要把该 helper 扩成 `@loomrealm-game/map` package root 的新公开 API。

### 3.3 `validateTilesetRecord()`

现有 `passages/priorities` 1D shape validation 保留。

在 shape validation 后增加：

```ts
if (priorities.values.some((value) => value < 0 || value > 5)) {
  throw new TypeError("Tileset.priorities values must be integers from 0 through 5");
}
```

不要修改 passages 的既有语义。

### 3.4 `projectVisibleTiles()` 签名

从：

```ts
projectVisibleTiles(map, cameraX, cameraY)
```

冻结为：

```ts
export function projectVisibleTiles(
  map: MapRecord,
  tileset: TilesetRecord,
  cameraX: number,
  cameraY: number,
): readonly VisibleTile[]
```

保留当前遍历顺序：

```text
z = 0 → 1 → 2
每个 z 内 y 递增
每个 y 内 x 递增
```

不要增加第二套排序。

循环中的最终逻辑：

```ts
const tileId = tableAt(map.data, x, y, z);
if (tileId === 0) continue;
if (tileId < 384) throw new TypeError(`Unsupported M14 tile id ${tileId}`);
if (tileId >= tileset.priorities.xSize) {
  throw new TypeError(`Tileset.priorities has no entry for tile id ${tileId}`);
}
const priority = tableAt(tileset.priorities, tileId);
const depth = tileVisualDepth(y, priority);
tiles.push(Object.freeze({ x, y, z, tileId, depth }));
```

返回数组继续 `Object.freeze()`。

---

## 4. `runtime.ts` 精确修改

`runtime.ts` 只改一个调用点。

从：

```ts
tiles: projectVisibleTiles(map, cameraX, cameraY)
```

改为：

```ts
tiles: projectVisibleTiles(map, tileset, cameraX, cameraY)
```

以下全部不改：

```text
player RenderData 字段
x / y authority
screenX / screenY 算法
direction
pattern
camera 算法
input handling
collision / canMove
RenderDomain zIndex
```

尤其不要新增：

```text
depthBase
playerDepth
priority
```

到 player RenderData。

---

## 5. `map.browser.js` 精确修改

### 5.1 只新增三个局部 helper

放在本 IIFE 内部即可：

```js
function characterVisualDepth(y, frameHeight) {
  return y * 32 + 32 + (frameHeight > 32 ? 31 : 0);
}

function tileStackValue(depth) {
  return depth * 2;
}

function characterStackValue(depth) {
  return depth * 2 + 1;
}
```

不要创建 class/manager 来承载它们。

### 5.2 `LoomRealmMapView` 目标 Shadow DOM

删除当前 `.entities` wrapper。

目标 flattened 结构必须等价于：

```text
lr-map-view shadowRoot
├─ style
├─ canvas.tile-layer      # 0..N，可复用
├─ canvas.tile-layer
├─ ...
└─ slot
    └─ light-DOM lr-map-sprite
```

所有 tile-layer canvas 必须插在 slot **之前**。

冻结 CSS：

```css
:host {
  display: block;
  position: relative;
  overflow: hidden;
  width: 640px;
  height: 480px;
}

canvas.tile-layer {
  position: absolute;
  inset: 0;
  display: block;
  width: 640px;
  height: 480px;
  image-rendering: pixelated;
  pointer-events: none;
}

canvas.tile-layer[hidden] {
  display: none;
}

slot {
  display: contents;
}
```

`lr-map-sprite` 自身现有 `:host{position:absolute...}` 保留，并增加 `pointer-events:none`；不要给 slot 或额外 wrapper 设置 `z-index`、`transform`、`opacity` 等会产生额外 stacking context 的属性。

### 5.3 MapView constructor

删除：

```text
this._canvas
this._context
.entities div
```

增加：

```js
this._layers = [];
this._slot = document.createElement("slot");
```

Shadow DOM 初始只 append：

```text
style
slot
```

canvas 在需要时由 `_ensureLayer()` 插到 slot 前。

### 5.4 `_ensureLayer(index)`

行为冻结：

- 已有 `this._layers[index]`：`canvas.hidden = false` 后复用；
- 不存在：创建 `640×480` Canvas；className=`tile-layer`；context `{ alpha: true }`；`imageSmoothingEnabled=false`；插入 `this._slot` 前；保存 `{ canvas, context }`；
- 不按 world depth 建立永久 Map registry。

### 5.5 `_trimLayers(count)`

冻结为 **clear + hidden**，不要 remove：

```js
for (let index = count; index < this._layers.length; index += 1) {
  const layer = this._layers[index];
  layer.context.clearRect(0, 0, 640, 480);
  layer.canvas.hidden = true;
}
```

### 5.6 MapView RenderData validation

`receiveRenderData(data)` 顶层既有 camera/tiles/tileset validation 保留。

在写入 `this._latestData` 前，同步验证每个 tile：

```text
tile 是 object
tile.x / tile.y 是 non-negative safe integer
tile.z ∈ {0,1,2}
tile.tileId 是 safe integer 且 >=384
tile.depth 是 non-negative safe integer
```

invalid → 同步抛 `TypeError("Invalid visible regular tile")`。

不要在 browser 重新查询/推导 priority。

### 5.7 MapView 接收新状态时立即去除旧视觉

validation 通过后：

```text
this._latestData = data
→ clear 当前所有 layer canvas
→ hidden=true
→ 调用 _paintLatest()
```

这样异步等待 tileset 图像期间不会继续展示上一帧旧 foreground。

### 5.8 `_paintLatest()` 的 latest-wins

冻结步骤：

```text
requested = this._latestData
→ await this._image(requested.tileset)
→ 重新读 current = this._latestData
→ current 不存在：return
→ current.tileset identity 与 requested 不同：return
→ 使用 current（不是 requested）的 tiles 分组并绘制
```

因此同一 tileset 下，如果 await 期间 RenderData 已更新，允许本次异步完成后直接绘制最新 `current`；不同 tileset 的旧异步完成绝不能覆盖当前状态。

当前请求的 resource load 失败：

```text
clear + hide 所有 layer
return
```

不要保留旧 foreground。

### 5.9 depth bucket 分组

每次 paint 只使用一个**临时** `Map<number, VisibleTile[]>` 分组；不要保存为实例 registry。

规则：

```text
current.tiles 输入顺序进入各 bucket
→ bucket 按 numeric depth 升序
→ bucket 内不再次排序
```

每个 bucket：

```js
const layer = this._ensureLayer(index);
layer.context.clearRect(0, 0, 640, 480);
layer.canvas.style.zIndex = String(tileStackValue(depth));
```

然后沿用当前 tile crop/draw 数学：

```js
const source = tile.tileId - 384;
const sx = (source % 8) * 32;
const sy = Math.floor(source / 8) * 32;
context.drawImage(
  image,
  sx,
  sy,
  32,
  32,
  tile.x * 32 - current.cameraX,
  tile.y * 32 - current.cameraY,
  32,
  32,
);
```

全部当前 bucket 画完后调用 `_trimLayers(groups.length)`。

### 5.10 MapSprite validation 与 z-index

`LoomRealmMapSprite.receiveRenderData()` 只为本需求新增：

```text
Number.isSafeInteger(data.y) && data.y >= 0
```

已有 direction、`pattern===0`、sprite ref validation 保留。

**不要**为 `screenX/screenY` 新增整数校验。本需求不处理它们，后续行走 interpolation 需要允许非整数屏幕位置。

PNG 加载后、得到 `frameHeight` 后增加：

```js
const depth = characterVisualDepth(current.y, frameHeight);
this.style.zIndex = String(characterStackValue(depth));
```

现有 frame crop、left/top、width/height 代码不改。

---

## 6. 自动化测试冻结规格

### 6.1 `game-libs/map/test/semantics.test.mjs`

现有测试文件继续使用 Node test。

修改 import，加入：

```js
tileVisualDepth
```

所有 `projectVisibleTiles(...)` 调用都必须传入 validated tileset。

必须新增/更新以下断言：

```text
tileVisualDepth(0,0) === 0
tileVisualDepth(0,1) === 64
tileVisualDepth(1,1) === 96
tileVisualDepth(0,2) === 96
```

现有第一条 projection 断言更新为包含：

```js
{ x: 0, y: 1, z: 0, tileId: 384, depth: 0 }
```

增加 priority validation：

```text
priority = -1 → validateTilesetRecord throws /priorities/
priority = 6  → validateTilesetRecord throws /priorities/
0 和 5 均接受
```

增加 projection 证明：

```text
同一个 tileId 在相同 y，priority 从 0 改为 1
→ projected depth 从 0 变为对应的非零精确值
```

保持 z/y/x 原有输出顺序测试。

Runtime 现有 player RenderData exact equality 必须继续通过，证明本 slice 没给 player data 增字段。

### 6.2 新增 `test/map-layering-browser.test.mjs`

目的：只验证 `@loomrealm-game/map` browser custom elements 的 owner-local presentation 行为。不要复刻 Hostra/Main/Renderer authority，也不要修改 `test/m15-hostra-product.test.mjs`。

测试技术基线冻结为：

```text
node:test
+
root devDependency playwright@现有版本
+
headless Chromium
```

可直接复制 `scripts/m14-essentials-local.mjs` 中 `executablePath()` 的现有浏览器 fallback 逻辑；不新增依赖。

测试步骤：

1. `npm run build -w @loomrealm-game/map` 后，测试直接把 `game-libs/map/dist/browser/map.browser.js` 加载进一个空白 Playwright page；
2. page 内创建可返回 PNG bytes 的 fake `PresentationResourceClient`；这里只测 browser element owner-local behavior，fake resource client 不代表新生产路径；
3. 创建 `lr-map-view`，把一个 `lr-map-sprite` 作为其 light-DOM child；
4. 分别调用 `receiveRenderContext()` / `receiveRenderData()`；
5. 等待异步图片 decode/paint 完成后检查 Shadow DOM、Canvas z-index、sprite z-index 和像素清理。

必须覆盖以下 7 个 case：

#### Case A — DOM / stacking context 结构

```text
shadowRoot 不存在 .entities
slot 的 computed display == contents
tile-layer canvas 是 shadowRoot 的直接 child
所有 tile-layer canvas 位于 slot 之前
```

#### Case B — equal depth 显式 character above

构造：

```text
tile.depth = 32
player.y = 0
character frameHeight = 32 → character depth = 32
```

断言：

```text
tile canvas z-index == "64"
player z-index == "65"
```

不要只比较 DOM 顺序。

#### Case C — higher tile above character

```text
tile.depth = 64  → tile stack 128
character depth=32 → character stack 65
```

断言 tile stack > character stack。

#### Case D — lower tile below character

```text
tile.depth = 0 → tile stack 0
character depth=32 → character stack 65
```

断言 tile stack < character stack。

#### Case E — stale bucket cleanup

先提交：

```text
buckets [0,64]
```

再提交：

```text
buckets [0]
```

断言第二个 layer：

```text
hidden === true
且 canvas 像素已 clear
```

#### Case F — old async resource cannot overwrite latest

使第一份 tileset resource promise 延迟；在其完成前提交第二份不同 resource identity 的 RenderData。

断言第一份晚完成后，最终可见 canvas/z-index/像素仍只对应第二份最新 RenderData。

#### Case G — validation

```text
negative / non-integer tile.depth → synchronous TypeError
negative / non-integer player.y    → synchronous TypeError
```

不要顺带增加 `screenX/screenY` integer validation 测试。

---

## 7. 执行顺序

执行 agent 严格按此顺序：

### Step 1 — Semantics

改：

```text
game-libs/map/src/semantics.ts
game-libs/map/test/semantics.test.mjs
```

运行：

```bash
npm test -w @loomrealm-game/map
```

必须全绿后才能继续。

### Step 2 — Runtime plumbing

只改 `runtime.ts` 的 `projectVisibleTiles` 调用。

再次运行：

```bash
npm test -w @loomrealm-game/map
```

### Step 3 — Browser compositor

改：

```text
game-libs/map/browser/map.browser.js
```

新增：

```text
test/map-layering-browser.test.mjs
```

运行：

```bash
npm run build -w @loomrealm-game/map
node --test test/map-layering-browser.test.mjs
```

### Step 4 — M14 regression gate

运行：

```bash
npm run test:m14
```

不得通过修改既有 M14 fixture/gate 来让回归变绿。

---

## 8. 真实 Essentials 本地 smoke 与 Product closure

Implementation freeze 与 Product closure 分开。

### 8.1 执行 agent 的真实素材 smoke

若环境中提供 Essentials v21.1 source 路径，则运行现有本地真实素材路径：

```bash
npm run test:m14:essentials-local -- \
  --source <ESSENTIALS_V21_1_SOURCE> \
  --map-id 66 \
  --x 8 \
  --y 7 \
  --character-name trainer_POKEMONTRAINER_Red
```

这些启动参数来自当前 `examples/essentials-v21.1-local/game.json`。

该 smoke 只证明：

```text
真实 Map/Tileset/Character 仍可导入
真实 priority 可通过冻结 validation
真实 presentation 仍能绘制
```

如果环境没有 source 路径，记录 `real-asset smoke not run: source unavailable`，不要虚构素材路径。

如果真实 priority 出现 `0..5` 之外值，停止并报告 blocker；禁止自行扩值域。

### 8.2 Product closure 仍需要可见行为验收

`MAP_BEHAVIOR_REQUIREMENTS.md` 第 1 节只有在真实 local 示例中完成下列人工/产品级可见验收后才能标记完成：

```text
玩家走到原版树冠/屋檐/门楣等后方
→ 环境正确盖住角色

玩家走回空地/前方
→ 角色重新完整可见

前后关系与原版 Essentials/RMXP 可观察结果一致
```

当前仓库没有把真实 Essentials 本地素材和固定遮挡坐标提交为可移植 fixture，因此**执行 agent 不负责自行寻找或猜一个树/屋檐坐标**。Product closure 由拥有真实素材环境的一方完成。

如果该可见验收失败：重新打开本文兼容规则，不允许执行 agent 临场发明修复规则。

---

## 9. 完成定义

代码实现可报告完成，当且仅当：

```text
[ ] 只修改本文允许的 production 文件
[ ] VisibleTile 保留原 index signature，只增加 depth
[ ] priority 严格验证为 0..5
[ ] tileVisualDepth 精确向量全部通过
[ ] equal-depth 明确编码为 character above tile
[ ] tile stack = depth*2
[ ] character stack = depth*2+1
[ ] runtime 只多传 tileset，没有修改 player RenderData
[ ] .entities wrapper 已删除
[ ] Canvas 使用当前可见 bucket 数量对应的可复用数组
[ ] 多余 Canvas 统一 clear + hidden，不 remove
[ ] latest-wins / stale cleanup browser tests 通过
[ ] 没有新增 package dependency
[ ] 没有新增 framework abstraction
[ ] npm test -w @loomrealm-game/map 通过
[ ] node --test test/map-layering-browser.test.mjs 通过
[ ] npm run test:m14 通过
```

若提供真实 source：再记录 `test:m14:essentials-local` 结果。

本文冻结的是**实现方式**；需求第 1 节的 **Product Closed** 状态仍以真实素材窗口中的可见遮挡验收为最终 gate。

---

## 10. 执行者停止条件

执行 agent 遇到任何不符合本文的实际证据时：

```text
STOP
→ 保留失败测试/错误输出
→ 报告具体文件、输入值、预期与实际
→ 不新增抽象
→ 不放宽兼容规则
→ 不修改 M14/M15 Closed fixture/gate
→ 不修改 framework 来绕过 map-local 问题
```

本规格的目标就是把执行工作降为：

```text
按三个 production 文件的冻结改动实现
→ 增加指定测试
→ 跑指定命令
→ 全绿即结束实现
```

而不是让执行 agent 再做一次架构设计。