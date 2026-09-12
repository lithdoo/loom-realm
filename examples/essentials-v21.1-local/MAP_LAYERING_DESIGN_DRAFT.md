# 地图视觉层级 / 遮挡冻结实现规格

> 状态：**Frozen for implementation；Product closure pending real-asset visible acceptance**  
> 对应需求：`MAP_BEHAVIOR_REQUIREMENTS.md` 第 1 节「人物与地图环境的遮挡关系」  
> 范围：只实现地图 tile 与玩家角色的视觉前后关系；不包含行走动画、连续移动、地图跳转、NPC/Event。  
> 文件名因历史链接保留 `MAP_LAYERING_DESIGN_DRAFT.md`；状态以本文头部为准。

本文给执行型 agent 使用。除本文明确允许的局部代码组织外，**没有设计裁量权**。若实际证据与本文冲突，停止并报告 blocker；不要自行放宽规则、改 framework、增加抽象或修改既有 M14/M15 gate。

---

## 1. 修改预算

### 1.1 只允许修改的 production 文件

```text
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
game-libs/map/browser/map.browser.js
```

### 1.2 允许修改/新增的测试

```text
game-libs/map/test/semantics.test.mjs
test/map-layering-browser.test.mjs      # 新增
```

### 1.3 不修改

```text
package.json
package-lock.json
game-libs/map/src/index.ts
tools/fixtures/essentials-v21.1/**
examples/essentials-v21.1-local/game.json
packages/renderer/**
packages/subsystem/**
packages/main/**
packages/data/**
packages/wire/**
```

root 已有 Playwright；不要增加依赖。

### 1.4 禁止新增

```text
SceneGraph
LayerManager
DepthManager
CanvasRegistry
PresentationRuntime
Renderer generic z-sort/depth API
任何 framework 通用 layer/depth abstraction
```

---

## 2. 冻结兼容规则

### 2.1 Priority 值域

```text
Tileset.priorities[*] ∈ {0,1,2,3,4,5}
```

`validateTilesetRecord()` 在 activation 时一次性验证全表。

非法值统一：

```ts
throw new TypeError("Tileset.priorities values must be integers from 0 through 5");
```

不要延迟到 tile 进入 viewport 后再失败。

### 2.2 Tile visual depth

最终实现：

```ts
const TILE_SIZE = 32;

export function tileVisualDepth(y: number, priority: number): number {
  if (priority === 0) return 0;
  return (y + priority + 1) * TILE_SIZE;
}
```

必须满足：

```text
tileVisualDepth(0,0) === 0
tileVisualDepth(0,1) === 64
tileVisualDepth(1,1) === 96
tileVisualDepth(0,2) === 96
```

camera 不参与 depth。

### 2.3 Character visual depth

只在 browser presentation 计算；Runtime 不新增 `depthBase`：

```js
function characterVisualDepth(y, frameHeight) {
  return y * 32 + 32 + (frameHeight > 32 ? 31 : 0);
}
```

必须满足：

```text
characterVisualDepth(0,32) === 32
characterVisualDepth(0,33) === 63
```

### 2.4 Equal-depth

最终规则：

```text
tileDepth < characterDepth  → tile 在角色下面
tileDepth > characterDepth  → tile 在角色上面
tileDepth == characterDepth → character 在 tile 上面
```

禁止依赖 DOM 创建顺序实现 tie。

唯一允许的 stack 编码：

```js
function tileStackValue(depth) {
  return depth * 2;
}

function characterStackValue(depth) {
  return depth * 2 + 1;
}
```

例：

```text
tile depth 32      → z-index 64
character depth 32 → z-index 65
```

### 2.5 规则依据

执行 agent 不重新研究规则。冻结依据：

- RMXP Tilemap：priority 0 → Z=0；顶部 priority 1 → Z=64；每下移一格或 priority +1 → Z +32：  
  `https://www.rpg-maker.fr/dl/monos/aide/xp/source/rgss/gc_tilemap.html`
- RMXP character `screen_z(height)` 使用 `height > 32 ? +31 : +0`。
- RGSS 同 Z 时后创建对象在前；标准地图组合先 Tilemap、后 Character Sprite，因此 equal-depth 冻结为 character above tile。

若真实 Essentials v21.1 明确违反上述规则，STOP 并报告 blocker；不要自行改规则。

---

## 3. `semantics.ts` 最终改动

### 3.1 `VisibleTile`

必须保留当前 index signature，只新增 `depth`：

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

不要把 `z` 改名。

### 3.2 `tileVisualDepth()`

按 §2.2 原样加入并从 `semantics.ts` export，供 `../dist/semantics.js` 测试直接 import。

不要修改 `src/index.ts`，不要增加 package root API。

### 3.3 `validateTilesetRecord()`

现有 table shape validation 后加入：

```ts
if (priorities.values.some((value) => value < 0 || value > 5)) {
  throw new TypeError("Tileset.priorities values must be integers from 0 through 5");
}
```

不要修改 passages 行为。

### 3.4 `projectVisibleTiles()`

最终签名：

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
z 0→1→2；每层 y 递增；每行 x 递增
```

循环逻辑：

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

## 4. `runtime.ts` 最终改动

只改该调用：

```diff
- tiles: projectVisibleTiles(map, cameraX, cameraY)
+ tiles: projectVisibleTiles(map, tileset, cameraX, cameraY)
```

其他全部不改，特别是：

```text
player RenderData
x/y authority
screenX/screenY
camera
input
collision
pattern
direction
RenderDomain zIndex
```

不要给 player data 增加 `depthBase`、`playerDepth` 或 `priority`。

---

## 5. `map.browser.js` 最终改动

### 5.1 Helper

IIFE 内只新增：

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

不要为这三个函数创建 class/manager。

### 5.2 MapView Shadow DOM

删除 `.entities` wrapper。

最终结构：

```text
shadowRoot
├─ style
├─ canvas.tile-layer  # 0..N
├─ canvas.tile-layer
├─ ...
└─ slot
    └─ light DOM lr-map-sprite
```

所有 canvas 插在 slot 前。

冻结 CSS：

```css
:host{display:block;position:relative;overflow:hidden;width:640px;height:480px}
canvas.tile-layer{position:absolute;inset:0;display:block;width:640px;height:480px;image-rendering:pixelated;pointer-events:none}
canvas.tile-layer[hidden]{display:none}
slot{display:contents}
```

`lr-map-sprite` 原 `:host{position:absolute...}` 保留并增加 `pointer-events:none`。

禁止给 slot/额外 wrapper 增加 `z-index`、`transform`、`opacity` 等额外 stacking context。

### 5.3 Constructor

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

初始化只 append `style, this._slot`。

### 5.4 `_ensureLayer(index)`

冻结行为：

- 已存在：`canvas.hidden=false` 并复用；
- 不存在：新建 `640×480` canvas，`className="tile-layer"`，context `{alpha:true}`，`imageSmoothingEnabled=false`，插到 slot 前，push `{canvas,context}`；
- 不建立 `Map<depth,canvas>` 长期 registry。

### 5.5 `_clearLayers()` 与 `_trimLayers(count)`

新增 `_clearLayers()`：所有已创建 layer `clearRect(0,0,640,480)` 并 `hidden=true`。

`_trimLayers(count)`：只处理 index >= count 的 layer：

```js
layer.context.clearRect(0, 0, 640, 480);
layer.canvas.hidden = true;
```

不要 remove canvas。

### 5.6 MapView RenderData validation

在更新 `_latestData` 前同步验证每个 tile：

```text
tile 是 object
tile.x/y 是 non-negative safe integer
tile.z ∈ {0,1,2}
tile.tileId 是 safe integer 且 >=384
tile.depth 是 non-negative safe integer
```

失败统一：

```js
throw new TypeError("Invalid visible regular tile");
```

browser 不重新推导 priority。

validation 通过后：

```js
this._latestData = data;
this._clearLayers();
void this._paintLatest();
```

因此等待异步图片时不展示旧 foreground。

### 5.7 `_paintLatest()` latest-wins

严格顺序：

```text
requested = this._latestData
await _image(requested.tileset)
current = this._latestData
current 不存在 → return
resourceIdentity(current.tileset) !== resourceIdentity(requested.tileset) → return
用 current.tiles 绘制，不用 requested.tiles
```

当前 resource load 失败：调用 `_clearLayers()` 后 return。

同一 tileset 下 await 期间收到新 RenderData，可以直接绘制最新 current；不同 tileset 的旧异步完成绝不能覆盖最新状态。

### 5.8 Bucket

每次 paint 创建临时 `Map<number, VisibleTile[]>`：

```text
按 current.tiles 输入顺序 push 到 bucket
bucket 按 numeric depth 升序
bucket 内不再次排序
```

每个 bucket：

```js
const layer = this._ensureLayer(index);
layer.context.clearRect(0, 0, 640, 480);
layer.canvas.style.zIndex = String(tileStackValue(depth));
```

tile crop/draw 数学保持现状：

```js
const source = tile.tileId - 384;
const sx = (source % 8) * 32;
const sy = Math.floor(source / 8) * 32;
layer.context.drawImage(
  image,
  sx, sy, 32, 32,
  tile.x * 32 - current.cameraX,
  tile.y * 32 - current.cameraY,
  32, 32,
);
```

所有 bucket 完成后 `_trimLayers(groups.length)`。

### 5.9 MapSprite

`receiveRenderData()` 只为本需求新增：

```js
Number.isSafeInteger(data.y) && data.y >= 0
```

direction、`pattern===0`、sprite ref 既有验证保留。

**不要**增加 `screenX/screenY` integer validation；后续 interpolation 需要允许非整数屏幕坐标。

图片加载得到 `frameHeight` 后增加：

```js
const depth = characterVisualDepth(current.y, frameHeight);
this.style.zIndex = String(characterStackValue(depth));
```

现有 sprite crop、left/top、width/height 不改。

---

## 6. 自动化测试

### 6.1 `game-libs/map/test/semantics.test.mjs`

import 增加 `tileVisualDepth`。

所有 `projectVisibleTiles(...)` 调用改为传入 validated tileset。

必须断言：

```text
tileVisualDepth(0,0) === 0
tileVisualDepth(0,1) === 64
tileVisualDepth(1,1) === 96
tileVisualDepth(0,2) === 96
```

现有第一条 projection expected 更新为：

```js
{ x: 0, y: 1, z: 0, tileId: 384, depth: 0 }
```

priority validation：

```text
-1 → throws /priorities/
 6 → throws /priorities/
 0 → accepted
 5 → accepted
```

projection 额外证明：同一 y/tileId，priority 0 与 1 得到不同的精确 depth；原 z/y/x 输出顺序不变。

现有 Runtime player RenderData exact equality 必须继续通过，证明没有给 player data 增字段。

### 6.2 新增 `test/map-layering-browser.test.mjs`

只测 map browser custom elements，不复刻 Hostra/Main/Renderer authority，不改 `test/m15-hostra-product.test.mjs`。

技术基线：

```text
node:test
root 现有 playwright
headless Chromium
```

浏览器 executable fallback 可复制 `scripts/m14-essentials-local.mjs` 的 `executablePath()`；不加依赖。

测试直接加载 build 后的：

```text
game-libs/map/dist/browser/map.browser.js
```

page 内创建最小 fake resource client 返回 PNG bytes；创建 `lr-map-view` 与其 light-DOM `lr-map-sprite`，直接调用 `receiveRenderContext/receiveRenderData`。

必须有 7 个 case：

**A. DOM**

```text
无 .entities
slot computed display === "contents"
tile-layer 是 shadowRoot direct child
canvas 全部在 slot 之前
```

**B. equal depth**

```text
tile.depth=32 → canvas z-index "64"
player.y=0, frameHeight=32 → sprite z-index "65"
```

**C. high tile**

```text
tile.depth=64 → 128
character depth=32 → 65
assert 128 > 65
```

**D. low tile**

```text
tile.depth=0 → 0
character depth=32 → 65
assert 0 < 65
```

**E. stale bucket**

```text
先 [0,64]
再 [0]
→ 第二个 layer hidden===true
→ 第二个 canvas 像素已 clear
```

**F. async latest-wins**

第一份 tileset resource promise 延迟；完成前提交不同 resource identity 的第二份 RenderData；第一份最后才 resolve。

最终 canvas/z-index/像素只能对应第二份最新数据。

**G. validation**

```text
negative/non-integer tile.depth → synchronous TypeError
negative/non-integer player.y   → synchronous TypeError
```

不要增加 screenX/screenY integer validation 测试。

---

## 7. 唯一执行顺序

### Step 1 — Semantics + Runtime plumbing

**同一刀完成**：

```text
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
game-libs/map/test/semantics.test.mjs
```

注意：`projectVisibleTiles` 改成四参数后，必须同时更新 runtime 调用；禁止在旧 runtime 调用仍存在时运行 package build/test 并误判规格失败。

完成后运行：

```bash
npm test -w @loomrealm-game/map
```

必须全绿。

### Step 2 — Browser compositor

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

必须全绿。

### Step 3 — M14 regression

运行：

```bash
npm run test:m14
```

不得修改既有 M14 fixture/gate 来适配失败。

---

## 8. 真实 Essentials smoke 与 Product closure

### 8.1 有真实 source 时执行 smoke

当前 local 启动参数冻结自 `game.json`：

```text
mapId=66
x=8
y=7
characterName=trainer_POKEMONTRAINER_Red
```

若环境提供 Essentials v21.1 source：

```bash
npm run test:m14:essentials-local -- \
  --source <ESSENTIALS_V21_1_SOURCE> \
  --map-id 66 \
  --x 8 \
  --y 7 \
  --character-name trainer_POKEMONTRAINER_Red
```

该 smoke 只证明真实 Map/Tileset/Character 可导入、真实 priority 可通过冻结 validation、真实 presentation 仍能绘制。

没有 source 时记录：

```text
real-asset smoke not run: source unavailable
```

不要虚构路径。

真实 priority 若出现 `0..5` 外值：STOP，报告 blocker；不要扩大值域。

### 8.2 Product closure

仓库没有提交可移植的真实 Essentials 素材及固定树/屋檐坐标，因此执行 agent **不负责自己寻找遮挡点**。

需求第 1 节最终 Product Closed 仍需拥有真实素材环境的一方验证：

```text
走到原版树冠/屋檐/门楣后方 → 环境盖住角色
走回空地/前方           → 角色完整可见
前后关系与原版一致
```

失败时重新打开本规格；执行 agent 不临场改变兼容规则。

---

## 9. 实现完成 Gate

执行 agent 只有在下面全部满足后才能报告 implementation complete：

```text
[ ] production 只改 semantics.ts / runtime.ts / map.browser.js
[ ] VisibleTile 保留 index signature，只增加 depth
[ ] priority 严格 0..5
[ ] tileVisualDepth 精确向量全绿
[ ] equal-depth = character above tile
[ ] tile stack = depth*2
[ ] character stack = depth*2+1
[ ] runtime 只多传 tileset；player RenderData 未变化
[ ] .entities 已删除
[ ] Canvas 为当前可见 bucket 数量对应的可复用数组
[ ] stale Canvas 使用 clear + hidden，不 remove
[ ] latest-wins test 通过
[ ] 无新增 dependency
[ ] 无新增 framework abstraction
[ ] npm test -w @loomrealm-game/map 通过
[ ] node --test test/map-layering-browser.test.mjs 通过
[ ] npm run test:m14 通过
```

有真实 source 时额外记录 real-asset smoke 结果。

**Implementation complete ≠ Product Closed**。Product Closed 仍以 §8.2 的真实窗口可见验收为最终 gate。

---

## 10. STOP 规则

遇到与本文冲突的实际证据：

```text
STOP
→ 保留失败测试/日志
→ 报告文件、输入、预期、实际
→ 不加抽象
→ 不放宽兼容规则
→ 不修改 M14/M15 Closed fixture/gate
→ 不改 framework 绕过 map-local 问题
```

执行任务应当只有：

```text
按本文修改 3 个 production 文件
→ 增加指定测试
→ 跑指定命令
→ 全绿则 implementation complete
```

不再包含架构设计或兼容规则研究。