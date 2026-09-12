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

不修改 M14/M15 已 Closed 的 framework contract，不把 RMXP priority、tile stack 或 character depth 上推到 LoomRealm Renderer / Main / Subsystem framework。

---

## 2. 当前结构与问题

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

这里的 `Map.data.z` 只是 RMXP 地图 tile stack 的 source 维度，不能单独决定 tile 与角色之间的最终前后关系。视觉遮挡还需要 `Tileset.priorities[tileId]` 和角色脚点位置。

---

## 3. 最小层级模型

本设计只保留三个事实，不新增 Layer/Depth/SceneGraph 类层次。

### 3.1 Map tile stack

来源：

```text
Map.data[x, y, z]
z ∈ {0,1,2}
```

保留现有字段名 `z`，不为了本需求改名。它继续负责：

- 表示 source tile stack；
- 保持现有 `z=0 → 1 → 2` 的稳定 tile 顺序；
- 多个 tile 得到相同 visual depth 时，继续使用当前输出顺序作为 tile 之间的稳定顺序。

它不单独决定 tile 是否遮住角色。

### 3.2 Tileset priority

来源：

```text
Tileset.priorities[tileId]
```

该字段已经是 M14 `Tileset/{id}` consumer projection 的正式字段，无需扩 importer。

它是 tile visual depth 的 source fact：`priority=0` 处于普通地图底层；`priority>0` 的 tile 随地图 Y 和 priority 进入更高的视觉深度。

### 3.3 Character depth

玩家不是固定在一个全局 entity layer。角色深度跟随脚点 Y，同时受实际 character frame 高度影响。

最终画面是一个 numeric depth 序列，而不是固定的：

```text
ground
player
foreground
```

---

## 4. Visual depth 兼容规则

### 4.1 Tile depth

采用 map-local world depth。camera 只影响屏幕位置，不参与谁在谁前面的判断。

当前兼容候选规则：

```ts
const TILE_SIZE = 32;

function tileVisualDepth(y: number, priority: number): number {
  if (priority === 0) return 0;
  return (y + priority + 1) * TILE_SIZE;
}
```

它应满足以下精确向量：

```text
tileVisualDepth(0, 0) = 0
tileVisualDepth(0, 1) = 64
tileVisualDepth(1, 1) = 96
tileVisualDepth(0, 2) = 96
```

这些精确值用于防止只验证“递增趋势”却把步长实现错。

该规则属于 `@loomrealm-game/map` 的 RMXP/Essentials 兼容语义，不是 LoomRealm framework contract。实现冻结前必须用真实 Essentials v21.1 数据和原版可观察行为确认 Essentials 没有对该基础关系做额外覆写。

### 4.2 Character depth

`lr-map-sprite` 已经知道玩家 `y`，并在加载 Character PNG 后知道真实 `frameHeight`，因此不新增 Runtime `depthBase`。

当前兼容候选规则：

```js
const frameHeight = image.height / 4;
const depth = current.y * 32 + 32 + (frameHeight > 32 ? 31 : 0);
```

精确向量至少锁定：

```text
y=0, frameHeight=32
→ depth=32

y=0, frameHeight>32
→ depth=63
```

frame-height 修正规则同样属于 map presentation compatibility rule；实现冻结前确认 Essentials v21.1 没有覆盖基础 RMXP 行为。

### 4.3 Camera 不参与 depth authority

```text
cameraX / cameraY
→ 只影响 screen position

visual depth
→ 只影响 draw order
```

因此 `tileVisualDepth()` 不接收 camera。

### 4.4 Equal-depth tie 必须显式决定

可能存在：

```text
tile depth == character depth
```

此时不能把结果交给偶然的 DOM 插入顺序或 Shadow DOM stacking 细节。

冻结实现前必须通过 RMXP/Essentials 行为证据确认 equal-depth 时谁在上，并把该规则明确编码进 map presentation。

要求：

```text
tileDepth < characterDepth
→ tile 在角色下面

tileDepth > characterDepth
→ tile 在角色上面

tileDepth == characterDepth
→ 使用已实证的 RMXP/Essentials tie rule
```

在 tie rule 未实证前，本 Draft 不擅自规定偏置值。实现时如果需要 numeric bias，应只在 `@loomrealm-game/map` browser presentation 内实现，不新增 framework 层排序机制。

---

## 5. RenderData 最小改动

### 5.1 VisibleTile 只增加 `depth`

```ts
interface VisibleTile {
  readonly x: number;
  readonly y: number;
  readonly z: 0 | 1 | 2;
  readonly tileId: number;
  readonly depth: number;
}
```

不把 `priority` 重复送到 browser。Browser 只需要最终 depth；priority 留在 `semantics.ts` 作为 source fact 和测试输入。

### 5.2 projectVisibleTiles

从：

```ts
projectVisibleTiles(map, cameraX, cameraY)
```

改成：

```ts
projectVisibleTiles(map, tileset, cameraX, cameraY)
```

核心变化：

```ts
const tileId = tableAt(map.data, x, y, z);
if (tileId === 0) continue;

const priority = tableAt(tileset.priorities, tileId);
const depth = tileVisualDepth(y, priority);

tiles.push({ x, y, z, tileId, depth });
```

现有 tileId / table bounds / regular tile validation 继续 fail closed。

### 5.3 Priority validation 的生命周期

priority 一旦成为可见行为输入，应在 `validateTilesetRecord()` 阶段一次性验证整个 `priorities` table，而不是等某个 tile 第一次进入 viewport 后再失败。

原因：

```text
Frame activation
→ 已知 Tileset record
→ 一次性确认所有 priority facts 可被当前 map consumer 表达
```

这样不会出现“地图已经运行，玩家走到某处才因新揭露 tile 而突然发现非法 priority”的延迟失败。

实际合法值域在冻结前从 Essentials v21.1 真实数据与兼容证据确认；验证逻辑只接受该已实证集合。

### 5.4 Browser RenderData validation

新增字段必须被 presentation 明确验证。

MapView：

```text
VisibleTile.depth
→ Number.isSafeInteger(depth)
→ depth >= 0
```

MapSprite：

```text
current.y
→ Number.isSafeInteger(y)
→ y >= 0
```

已有 `screenX/screenY`、direction、pattern、resource ref 的验证继续保留或补齐现有遗漏。

Browser 不重新推导 tile priority，也不信任未验证的 `depth` 值直接进入 CSS `z-index`。

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

因此 tile presentation 必须能分成多个可与 `lr-map-sprite` 交错的 stacking participant。

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

例如：

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

world depth 会随地图 Y 改变，长期按 depth 保留 Canvas 会累积无界状态。

只维护当前可见 bucket 数量对应的可复用 Canvas 数组：

```js
this._layers = [];
```

每次重绘：

```text
visible tiles
→ 按 depth 分组并按 depth 排序
→ 得到当前 N 个 bucket
→ 复用前 N 个 canvas
→ 设置 canvas z-index = bucket depth / 已冻结 tie rule 后的 stacking value
→ 多余 canvas clear + hide/remove
```

概念实现：

```js
const groups = groupTilesByDepth(current.tiles);

for (let i = 0; i < groups.length; i += 1) {
  const layer = this._ensureLayer(i);
  layer.canvas.style.zIndex = String(stackValueForTile(groups[i].depth));
  paintTiles(layer.context, groups[i].tiles);
}

this._trimLayers(groups.length);
```

`stackValueForTile()` 这里只表示“equal-depth tie 最终需要一个已实证的局部映射”；如果实证表明直接使用 depth 已足够，则不保留该 helper。

不新增 `DepthManager`、`LayerManager`、`CanvasRegistry`、`SceneGraph` 等抽象。

### 6.4 Bucket 内顺序

同一 depth 内直接保持 `projectVisibleTiles()` 现有输出顺序即可。

由于该函数当前按 `z=0 → 1 → 2` 遍历，同一 depth 下的 source tile stack 稳定顺序自然保留；不再引入第二套 tile sort key。

### 6.5 Shadow DOM / slot

必须保证：

```text
depth canvases
和
slotted lr-map-sprite
```

能够在同一个 `lr-map-view` stacking context 中比较最终 stacking value。

具体 DOM/CSS 写法不是逻辑合同，但必须用目标 Chromium/Electron 做真实 presentation test；不能只靠 Node 测试推断 Shadow DOM stacking 行为。

---

## 7. 重绘生命周期与 latest-wins

当前 map presentation 需要异步加载图片，因此多 Canvas 后必须显式保持“新 RenderData 不被旧异步 paint 覆盖”的语义。

### 7.1 Current-only commit

每次 `_paintLatest()`：

```text
记录 requested = this._latestData
→ await resource
→ await 后重新读取 current = this._latestData
→ 只有 requested 仍与 current 对应时才 commit paint
```

不能让旧 RenderData 在资源加载完成后覆盖更新后的地图状态。

现有 resource identity guard 继续保留；如果同一 tileset 下 RenderData 已更新，也必须最终绘制 current data，而不是 requested 的旧 tile 集合。

### 7.2 一次 committed repaint 的可见 bucket 必须精确等于当前 RenderData

Invariant：

```text
After every committed repaint,
the visible canvas set exactly equals
the current RenderData depth bucket set.
```

具体要求：

1. reused canvas 在绘制当前 bucket 前 `clearRect()`；
2. 当前已经不存在的旧 bucket canvas 必须 clear 并 hide/remove；
3. bucket 数量从多变少时，旧上层像素不能残留；
4. resource load / paint 失败不能留下上一帧旧 foreground 冒充当前状态；
5. player `y` 更新后，其 z-index 必须基于同一份 latest RenderData 立即更新。

这直接保护需求中的：角色已经移动后，不允许旧遮挡继续残留。

### 7.3 失败时不展示陈旧视觉状态

如果当前地图资源无法读取或当前 RenderData 验证失败：

- 不提交部分新 bucket；
- 不保留会被误认为当前状态的旧 foreground；
- 继续沿用现有 presentation failure handling，不把 browser presentation failure 升格为新的 Main/Runtime authority failure。

本设计不新增新的恢复管理器。

---

## 8. Ownership / 修改范围

本需求只修改 map consumer：

```text
game-libs/map/src/semantics.ts
    + tileVisualDepth()
    + priority validation
    + projectVisibleTiles(..., tileset, ...)
    + VisibleTile.depth

game-libs/map/src/runtime.ts
    + 调整 projectVisibleTiles() 调用

game-libs/map/browser/map.browser.js
    + RenderData validation
    + current visible depth bucket Canvas
    + lr-map-sprite numeric stacking
    + latest-wins / stale bucket cleanup

game-libs/map/test/*
    + 精确 semantics / browser evidence
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

## 9. 测试策略

### 9.1 Pure semantics：测试精确兼容值

至少锁定：

```text
tileVisualDepth(0, 0) === 0
tileVisualDepth(0, 1) === 64
tileVisualDepth(1, 1) === 96
tileVisualDepth(0, 2) === 96
```

另外验证：

1. `projectVisibleTiles()` 的 depth 确实来自 `Tileset.priorities`，不是 `Map.data.z`；
2. 多个 tile 得到相同 depth 时，现有 `z=0 → 1 → 2` 输出顺序保持；
3. 非法 priority 在 Tileset validation/Frame activation 阶段 fail closed；
4. tileId/table bounds 继续使用现有 fail-closed 规则。

不单独测试“camera 不改变 depth”：`tileVisualDepth(y, priority)` 的签名中没有 camera，该性质由代码结构保证。

### 9.2 Browser presentation

至少在目标 Chromium/Electron 下验证：

```text
低 depth tile < player
高 depth tile > player
已实证的 equal-depth tie 行为
玩家 y 改变后 z-index 同步改变
```

并验证生命周期：

```text
旧状态：depth buckets = [0, 288, 320]
新状态：depth buckets = [0, 288]
→ depth=320 的旧 Canvas 不可见且不残留像素
```

以及：

```text
旧 RenderData 的异步 image load 晚于新 RenderData 完成
→ 最终画面仍只反映新 RenderData
```

### 9.3 Real Essentials acceptance

最终验收必须使用本目录真实 Essentials v21.1 FSDB。

至少选择一个真实遮挡场景并记录：

```text
mapId
玩家前后位置
tile 坐标 / tileId
priority
计算出的 tile depth
角色 frameHeight / character depth
原版可观察前后关系
LoomRealm 实际结果
```

玩家走到树冠 / 屋檐 / 门楣等后方：

```text
→ 环境盖住角色
```

玩家走到空地 / 前方：

```text
→ 角色重新完整可见
```

如原版 Essentials 同地图可运行，以原版画面作为视觉前后关系 oracle。

验收 evidence 不用进入 framework contract，但必须足以解释“为什么这一组 depth/tie 规则与原版一致”。

---

## 10. 落地顺序

### Slice 1 — Compatibility evidence + depth semantics

只改/产出：

```text
真实 Essentials/RMXP depth evidence
semantics.ts
semantics.test.mjs
```

冻结：

```text
tileVisualDepth()
character depth 基础规则
priority 合法值域
equal-depth tie rule
```

并实现：

```text
VisibleTile.depth
projectVisibleTiles(map, tileset, ...)
priority validation
```

这一刀结束后，“什么应该在谁前面”不再留给 browser 临场决定。

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
lr-map-sprite → numeric stacking
RenderData validation
latest-wins
stale bucket cleanup
```

### Slice 3 — Real asset qualification

使用 `essentials-v21.1-local` 真实 FSDB：

```text
选定真实遮挡场景
→ 记录 source/depth evidence
→ 与原版关系对照
→ 玩家移动前后均正确
```

通过后再把 `MAP_BEHAVIOR_REQUIREMENTS.md` 第 1 节视为已落地。

---

## 11. 非目标

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

## 12. 实现前必须关闭的实证项

以下问题不能留给编码阶段随意决定：

1. Essentials v21.1 是否保持当前 tile depth 精确规则；
2. character `frameHeight > 32` 的 `+31` 修正规则是否保持；
3. tile 与 character equal-depth 的 tie-break；
4. Essentials v21.1 实际 Tileset priority 合法值域及特殊值；
5. 当前 local example 的真实遮挡验收位置；
6. 目标 Chromium/Electron 下 Shadow DOM slot 与内部 Canvas 的 stacking 组合方式。

其中 1–4 是 map compatibility rule；5 是 qualification fixture/evidence；6 是 browser realization evidence。它们都不应转化成 LoomRealm framework abstraction。

---

## 13. 完整闭环

实现完成后的 authority/data/presentation 链应为：

```text
Tileset.priorities
        ↓
validateTilesetRecord
        ↓
tileVisualDepth(y, priority)
        ↓
VisibleTile.depth
        ↓
RenderDomain / Renderer Store
        ↓
MapViewRenderData validation
        ↓
current visible depth buckets
        ↓
Canvas numeric stacking

player y + Character PNG frameHeight
        ↓
MapSpriteRenderData validation
        ↓
character visual depth
        ↓
Sprite numeric stacking
```

然后由：

```text
精确 pure semantics tests
        +
Chromium stacking / latest-wins / stale-cleanup tests
        +
真实 Essentials original-parity evidence
```

共同闭合。

最终修改仍保持很小：

```text
semantics.ts
→ 一个 tile depth 规则 + priority validation

VisibleTile
→ 一个 depth 字段

runtime.ts
→ projectVisibleTiles() 多传 tileset

map.browser.js
→ 一个可复用 Canvas 数组 + sprite stacking + current-only repaint
```

玩家看到原版地图已有的前后关系；LoomRealm Renderer 仍然只负责既有 Render Store / Web projection 机制，不知道 tree、roof、priority 或 RMXP tile stack 的存在。