# 地图视觉层级 / 遮挡设计草案

> 状态：Draft  
> 目录：`examples/essentials-v21.1-local`  
> 对应需求：`MAP_BEHAVIOR_REQUIREMENTS.md` 第 1 节「人物与地图环境的遮挡关系」  
> 范围：只讨论地图 tile 与玩家角色的视觉前后关系；不包含行走动画、地图跳转、NPC/Event 行为。

## 1. 目标

当前本地 Essentials v21.1 示例已经能读取真实 `Map/{id}`、`Tileset/{id}`、Tileset PNG 和 Character PNG，并完成普通 tile 绘制、玩家显示、方向键逐格移动与通行判定。

当前缺口是：`lr-map-view` 先把全部地图 tile flatten 到一个 Canvas，`lr-map-sprite` 再显示在该 Canvas 上方，因此玩家永远盖住所有地图像素。Tileset `priorities` 已经进入 M14 consumer record，但目前只参与通行判定，没有参与视觉遮挡。

本设计只增加完成当前真实需求所需的最小机制：

```text
Map.data[x,y,z] + Tileset.priorities[tileId]
        ↓
@loomrealm-game/map 计算 tile visual depth
        ↓
VisibleTile 增加 depth
        ↓
lr-map-view 按 depth 分组绘制 Canvas

player y + 实际 character frame height
        ↓
lr-map-sprite 计算自身 visual depth
        ↓
CSS stacking 与 tile Canvas 交错
```

不修改 M14/M15 已 Closed 的 framework contract，不把 RMXP priority、tile layer 或 character depth 上推到 LoomRealm Renderer / Main / Subsystem framework。

---

## 2. 现状

当前 `game-libs/map/src/semantics.ts` 中：

```ts
interface VisibleTile {
  readonly x: number;
  readonly y: number;
  readonly z: 0 | 1 | 2;
  readonly tileId: number;
}
```

`projectVisibleTiles()` 按 `z=0,1,2` 遍历 `Map.data`。当前 browser presentation 再按数组顺序把所有 tile 画入同一个 Canvas。

当前结构等价于：

```text
lr-map-view
├─ canvas            ← 所有地图 tile 已经 flatten
└─ slot
   └─ lr-map-sprite  ← 玩家始终在整个地图 Canvas 上方
```

这里的 `Map.data.z` 只是 RMXP 地图 tile stack 的一个 source 维度，不能单独决定 tile 与角色之间的最终前后关系。视觉遮挡还需要 `Tileset.priorities[tileId]` 和角色脚点位置。

---

## 3. 最小层级模型

本设计只保留三个事实，不新增 Layer/Depth/SceneGraph 类层次。

### 3.1 Map tile stack

来源：

```text
Map.data[x, y, z]
z ∈ {0,1,2}
```

保留现有字段名 `z`，不为了本需求改名为 `layer`。它继续负责：

- 表示 source tile stack；
- 保持现有 `z=0 → 1 → 2` 的稳定 tile 顺序；
- 当多个 tile 最终落到同一 visual depth 时，维持确定性的内部绘制顺序。

它不单独决定是否遮住角色。

### 3.2 Tileset priority

来源：

```text
Tileset.priorities[tileId]
```

该字段已经是 M14 `Tileset/{id}` consumer projection 的正式字段，无需扩 importer。

它是 tile visual depth 的 source fact。`priority=0` 是普通底层 tile；`priority>0` 的 tile 随地图 Y 和 priority 进入更高的视觉深度。

### 3.3 Character depth

玩家不是固定在一个全局 entity layer。角色深度跟随其脚点 Y，同时受实际 character frame 高度影响。

最终画面因此是一个 numeric depth 序列，而不是固定的：

```text
ground
player
foreground
```

---

## 4. Tile visual depth

采用 map-local world depth。camera 只影响屏幕位置，不参与谁在谁前面的判断。

候选兼容规则：

```ts
const TILE_SIZE = 32;

function tileVisualDepth(y: number, priority: number): number {
  if (priority === 0) return 0;
  return (y + priority + 1) * TILE_SIZE;
}
```

该规则表达以下顺序性质：

```text
priority = 0
→ 普通地图底层

相同 y，priority + 1
→ depth + 32

相同 priority，y + 1
→ depth + 32
```

该公式在 Draft 阶段只是 RMXP/Essentials 兼容候选，不是新的冻结 framework contract。实现前需要用真实 Essentials v21.1 map 与原版可观察行为验证至少一个“玩家在 tile 前”和一个“玩家在 tile 后”的场景。

如果实证发现细节差异，只修正 `@loomrealm-game/map` 内部兼容规则。

### Camera

visual depth 使用 world Y：

```text
cameraX / cameraY
→ 只影响 screen position

visual depth
→ 只影响 draw order
```

不把 `cameraY` 写进 depth 计算。

---

## 5. RenderData 最小改动

### 5.1 VisibleTile 只增加一个字段

保持当前结构，增加 `depth`：

```ts
interface VisibleTile {
  readonly x: number;
  readonly y: number;
  readonly z: 0 | 1 | 2;
  readonly tileId: number;
  readonly depth: number;
}
```

不把 `priority` 重复送到 browser。Browser 只需要最终 `depth`；priority 留在 `semantics.ts` 作为 source fact 和测试输入。

### 5.2 projectVisibleTiles

从：

```ts
projectVisibleTiles(map, cameraX, cameraY)
```

改成：

```ts
projectVisibleTiles(map, tileset, cameraX, cameraY)
```

核心变化只有：

```ts
const tileId = tableAt(map.data, x, y, z);
if (tileId === 0) continue;

const priority = tableAt(tileset.priorities, tileId);
const depth = tileVisualDepth(y, priority);

tiles.push({ x, y, z, tileId, depth });
```

现有 tileId / table bounds / regular tile validation 继续 fail closed。

priority 一旦成为可见行为输入，应增加最小合法性验证；实际允许值域应从 Essentials v21.1 真实数据和 RMXP 行为证据确认后再冻结。

### 5.3 Player RenderData 不新增 depthBase

当前 player data 已经包含：

```text
x / y
screenX / screenY
direction
pattern
sprite
```

不新增 `depthBase`，因为它只是 `y` 的派生值，会制造重复状态。

`lr-map-sprite` 已经知道 `y`，并在加载 Character PNG 后知道实际 `frameHeight`，因此最终 character visual depth 直接在 browser presentation 内计算。

候选兼容规则：

```js
const frameHeight = image.height / 4;
const depth = current.y * 32 + 32 + (frameHeight > 32 ? 31 : 0);
```

这里的 frame-height 修正同样属于 map presentation compatibility rule，需要真实 Essentials/RGSS 行为验证后再冻结。

---

## 6. Browser composition

### 6.1 为什么不能继续使用单 Canvas

当前结构：

```text
全部 tile Canvas
↓
player
```

无法表达：

```text
低 depth tile
↓
player
↓
高 depth tile
```

因此至少需要让 tile presentation 能分成多个可与 `lr-map-sprite` 交错的 stacking participant。

### 6.2 Depth Bucket Canvas

`lr-map-view` 按当前可见 tile 的 `depth` 分组：

```text
depth=0
→ 一个 Canvas

depth=256
→ 一个 Canvas

depth=288
→ 一个 Canvas
```

`lr-map-sprite` 独立计算自己的 numeric depth，并设置 CSS `z-index`。

最终浏览器自然得到：

```text
canvas z=256
player z=287
canvas z=288
```

采用 bucket 的理由只基于当前需求：

- tile depth 由 Map/Tileset facts 决定；
- player 最终 depth 依赖实际 character frame height；
- 两者各自在自己的 presentation element 中得到 numeric depth；
- CSS stacking 可以直接组合它们，不需要 `lr-map-view` 反向知道 player bitmap 尺寸，也不需要 `lr-map-sprite` 把最终 depth 回传给父组件。

未来 NPC/Event 如能复用同一 numeric depth 只是附带收益，不作为本设计成立的前提。

### 6.3 不建立 depth→Canvas 长期 registry

不要实现长期增长的：

```js
this._depthCanvases = new Map();
```

因为 world depth 会随地图 Y 改变，玩家移动后可能不断出现新的 depth 值。

使用一个仅针对当前可见 bucket 数量的可复用 Canvas 数组即可：

```js
this._layers = [];
```

每次重绘：

```text
visible tiles
→ 按 depth 分组并按 depth 排序
→ 当前得到 N 个 bucket
→ 复用前 N 个 canvas
→ 设置每个 canvas 的 z-index = bucket.depth
→ 多余 canvas 隐藏或移除
```

概念实现：

```js
const groups = groupTilesByDepth(current.tiles);

for (let i = 0; i < groups.length; i += 1) {
  const layer = this._ensureLayer(i);
  layer.canvas.style.zIndex = String(groups[i].depth);
  paintTiles(layer.context, groups[i].tiles);
}

this._trimLayers(groups.length);
```

这里不新增 `DepthManager`、`LayerManager`、`CanvasRegistry`、`SceneGraph` 等抽象。

### 6.4 Bucket 内顺序

同一 depth 内直接保持 `projectVisibleTiles()` 现有输出顺序即可。由于该函数当前按 `z=0 → 1 → 2` 遍历，source tile stack 的稳定顺序自然保留。

不再额外引入第二套 layer sort key。

### 6.5 Shadow DOM / slot

重构后必须保证：

```text
depth canvases
和
slotted lr-map-sprite
```

能够在同一个 `lr-map-view` stacking context 中比较 z-index。

具体 DOM/CSS 写法不是逻辑合同，但必须用目标 Chromium/Electron 做真实 presentation test；不能只靠 Node 测试推断 Shadow DOM stacking 行为。

---

## 7. Ownership / 修改范围

本需求只修改 map consumer：

```text
game-libs/map/src/semantics.ts
    + tileVisualDepth()
    + projectVisibleTiles(..., tileset, ...)
    + VisibleTile.depth

game-libs/map/src/runtime.ts
    + 调整 projectVisibleTiles() 调用

game-libs/map/browser/map.browser.js
    + depth bucket Canvas
    + lr-map-sprite numeric z-index

game-libs/map/test/*
    + 最小 semantics / browser evidence
```

默认不修改：

```text
tools/fixtures/essentials-v21.1
```

因为 `Tileset.priorities` 已经存在于 M14 consumer projection。

明确不修改：

```text
packages/renderer
packages/subsystem
packages/main
packages/data
packages/wire
```

也不新增：

```text
SceneGraph
LayerManager
DepthManager
PresentationRuntime
Renderer generic z-sort API
```

priority、tile stack 和 character depth 都是 `@loomrealm-game/map` 的业务 presentation semantics。

---

## 8. 测试策略

### 8.1 Pure semantics

只保留能保护真实规则的测试：

1. `priority=0` 得到底层 depth；
2. 相同 y 时，priority 增加会使 depth 增加；
3. 相同 priority 时，y 增加会使 depth 增加；
4. `projectVisibleTiles()` 确实从 `Tileset.priorities` 得到 depth，而不是从 `Map.data.z` 推断；
5. 多个 tile 落在同一个 depth 时，现有 `z=0 → 1 → 2` 顺序保持稳定；
6. 非法 priority / tileId 按最终实证规则 fail closed。

不单独测试“camera 不改变 depth”：`tileVisualDepth(y, priority)` 的签名中本来就没有 camera，这个性质由代码结构直接保证。

### 8.2 Browser presentation

至少用 Chromium 验证：

```text
低 depth tile < player
高 depth tile > player
玩家 y 改变后遮挡关系同步改变
```

重点验证真实 Canvas / Shadow DOM / CSS stacking，而不仅检查 RenderData 数字。

### 8.3 Real Essentials acceptance

最终验收必须使用本目录真实 Essentials v21.1 FSDB。

选择至少一个真实遮挡场景：

```text
玩家走到树冠 / 屋檐 / 门楣等后方
→ 环境盖住角色

玩家走到空地 / 前方
→ 角色重新完整可见
```

如原版 Essentials 同地图可运行，以原版画面作为视觉前后关系 oracle。

验收坐标和 tile evidence 在实现阶段从真实数据中选取，不在本 Draft 中凭印象硬编码。

---

## 9. 落地顺序

### Slice 1 — Depth semantics

只改：

```text
semantics.ts
semantics.test.mjs
```

完成：

```text
tileVisualDepth()
VisibleTile.depth
projectVisibleTiles(map, tileset, ...)
priority validation/evidence
```

先把“什么应该在谁前面”做成最小纯函数并测准。

### Slice 2 — Browser realization

改：

```text
runtime.ts
browser/map.browser.js
browser presentation tests
```

完成：

```text
tile depth 进入 RenderData
single map canvas → 当前可见 depth bucket canvases
lr-map-sprite → numeric z-index
```

### Slice 3 — Real asset qualification

使用 `essentials-v21.1-local` 真实 FSDB：

```text
选定真实遮挡场景
→ 与原版关系对照
→ 玩家移动前后均正确
→ 记录 evidence
```

通过后再把需求文档第 1 节视为已落地。

---

## 10. 非目标

本设计不解决：

```text
行走 pattern / interpolation
按住方向连续移动
地图 Transfer / Map Event
NPC/Event lifecycle
always_on_top 等 event character 行为
autotile 新支持
战斗 / 菜单 / 对话
通用 Renderer scene graph
```

如果后续出现新的真实 consumer，只在其确实无法复用当前具体 map compositor 时，再讨论是否抽公共 presentation mechanism。

---

## 11. 待实证问题

实现前需要通过真实 Essentials / RGSS 行为证据确认：

1. tile visual depth 的精确公式；
2. character frame `height > 32` 时的精确 depth 修正规则，以及 Essentials 是否覆盖基础 RMXP 行为；
3. tile 与 character 得到相同最终 depth 时的 tie-break；
4. Essentials v21.1 实际 Tileset priority 值域及特殊值；
5. 当前 local example 中最合适的真实遮挡验收地点；
6. 目标 Chromium/Electron 下 Shadow DOM slot 与内部 Canvas 的 stacking 行为。

这些都是 `@loomrealm-game/map` 的兼容性证据问题，不应转化成 LoomRealm framework abstraction。

---

## 12. 预期完成态

实现完成后，变化应保持非常小：

```text
semantics.ts
→ 增加一个 tile depth 规则

VisibleTile
→ 增加一个 depth 字段

runtime.ts
→ projectVisibleTiles() 多传 tileset

map.browser.js
→ 一个可复用 Canvas 数组 + sprite z-index
```

最终玩家看到原版地图已有的前后关系；LoomRealm Renderer 仍然只负责既有 Render Store / Web projection 机制，不知道 tree、roof、priority 或 RMXP tile stack 的存在。