# 地图视觉层级 / 遮挡设计草案

> 状态：Draft  
> 目录：`examples/essentials-v21.1-local`  
> 对应需求：`MAP_BEHAVIOR_REQUIREMENTS.md` 第 1 节「人物与地图环境的遮挡关系」  
> 范围：只讨论地图 tile 与玩家角色的视觉前后关系；不包含行走动画、地图跳转、NPC/Event 行为。

## 1. 目标

当前本地 Essentials v21.1 示例已经能读取真实 `Map/{id}`、`Tileset/{id}`、Tileset PNG 和 Character PNG，并完成普通 tile 绘制、玩家显示、方向键逐格移动与通行判定。

当前缺口是：地图先被整体画进一个 Canvas，玩家 `lr-map-sprite` 再作为独立元素画在 Canvas 上方，因此玩家永远盖住所有地图像素。Tileset `priorities` 虽已进入 consumer record，但只参与通行判定，没有进入 presentation depth。

本设计的目标是：

```text
真实 RMXP / Essentials map facts
        ↓
@loomrealm-game/map 的地图视觉深度语义
        ↓
Map RenderData
        ↓
lr-map-view 内部按深度组合 tile Canvas 与角色
        ↓
玩家在树冠、屋檐、柜台、桥、门楣等环境前后得到与原版一致的遮挡
```

本设计不修改 M14/M15 已 Closed 的 framework contract，不把 RMXP 层级概念上推到 LoomRealm Renderer / Main / Subsystem framework。

---

## 2. 现状与问题

当前 `game-libs/map/src/semantics.ts` 中：

```ts
interface VisibleTile {
  x: number;
  y: number;
  z: 0 | 1 | 2;
  tileId: number;
}
```

`projectVisibleTiles()` 依次遍历 `Map.data` 的 `z=0,1,2`，当前 browser presentation 再按照该数组顺序把所有 tile 画进同一个 Canvas。

当前 `game-libs/map/browser/map.browser.js` 的结构等价于：

```text
lr-map-view
├─ canvas            ← 所有地图 tile 已经 flatten
└─ entities / slot
   └─ lr-map-sprite  ← 玩家永远在整个 Canvas 上方
```

因此现在只有「地图 tile 之间的绘制顺序」，没有「地图 tile 与角色之间的视觉深度」。

`Map.data` 的第三维 `z` 不能直接视为最终视觉深度。它表示地图编辑器中的 tile stack；玩家遮挡还需要消费 `Tileset.priorities[tileId]`，并与角色脚点的垂直位置共同决定最终显示前后。

---

## 3. 三种层级必须分开

### 3.1 Map layer

来源：

```text
Map.data[x, y, layer]
layer ∈ {0,1,2}
```

它表示同一个地图坐标上的三层 tile 数据。

职责：

- 保留 source tile stack；
- 当多个 tile 落入同一个 visual depth bucket 时，作为稳定的内部绘制顺序之一；
- 不单独决定 tile 是否遮住玩家。

实现中建议把当前 `VisibleTile.z` 重命名为 `layer`，避免与最终 visual depth 混淆。

### 3.2 Tileset priority

来源：

```text
Tileset.priorities[tileId]
```

该字段已经是 M14 `Tileset/{id}` consumer projection 的正式字段，无需扩 importer。

职责：

- 保留 RMXP/Essentials 对 tile 视觉高度的事实；
- `priority == 0` 表示普通底层 tile；
- `priority > 0` 的 tile 随地图 Y 与 priority 进入不同的视觉深度；
- 同一 priority 向下移动一格，与 priority 增加一级，都会使视觉深度增加一个 tile 高度。

### 3.3 Character depth

角色不是固定在一个全局 “entity layer”。角色的深度跟随脚点 Y；较高的 character frame 还需要原版兼容的高度修正，使角色能正确夹在相邻 priority tile 之间。

所以最终关系不是：

```text
ground
player
foreground
```

而是一个可交错的有序序列：

```text
depth 0       普通地面
...
depth N       priority tile
...
depth P       player
...
depth N+32    priority tile
...
```

后续 NPC/Event sprite 也可以自然进入同一 map-local depth 空间，而不需要把当前实现推翻成新的 SceneGraph。

---

## 4. Visual depth 语义草案

### 4.1 Tile depth

本设计采用世界坐标中的 map-local depth；camera 只影响屏幕位置，不影响谁在谁前面。

候选规则：

```ts
const TILE_SIZE = 32;

function tileVisualDepth(y: number, priority: number): number {
  if (priority === 0) return 0;
  return (y + priority + 1) * TILE_SIZE;
}
```

该表达满足 RMXP Tilemap 的关键顺序性质：

```text
priority=0
→ 恒处于普通地图底层

相同 y：priority + 1
→ depth + 32

相同 priority：y + 1
→ depth + 32
```

注意：此公式在本草案阶段是兼容候选，不作为新的冻结 framework contract。实现前必须用真实 Essentials v21.1 map 事实和原版可观察行为做至少一组前/后对照；如 source evidence 表明有细节差异，应只修正 `@loomrealm-game/map` 内部的 map semantics。

### 4.2 Character depth

Runtime 已知道玩家 logical tile position，但 browser 在加载实际 Character PNG 后才知道一帧真实高度。因此职责应拆成：

```text
Runtime
→ 提供角色脚点的 world depth base

Browser map presentation
→ 根据实际 character frame height 做原版兼容修正
```

候选基础：

```ts
const depthBase = y * 32 + 32;
```

Browser 加载 4×4 character sheet 后：

```ts
const frameHeight = image.height / 4;
const depth = depthBase + (frameHeight > 32 ? 31 : 0);
```

这里的高度修正同样属于 map presentation compatibility rule，不应进入 LoomRealm Renderer 通用 contract。实现时要用真实 Essentials character sheet 与遮挡场景验证边界，尤其验证同深度附近的 tie 行为。

### 4.3 Camera 不参与 depth authority

当前 camera：

```text
world position
→ cameraX / cameraY
→ screen position
```

visual depth 比较应使用 world Y，不应把 `cameraY` 写进 authoritative depth。原因是 tile 和 character 会被 camera 同量平移，比较前后时 camera offset 会抵消。

因此：

```text
camera
→ 只决定 draw position

map-local depth
→ 只决定 draw order
```

---

## 5. RenderData 设计

### 5.1 VisibleTile

建议把当前：

```ts
{ x, y, z, tileId }
```

改为：

```ts
interface VisibleTile {
  readonly x: number;
  readonly y: number;
  readonly layer: 0 | 1 | 2;
  readonly tileId: number;
  readonly depth: number;
}
```

`priority` 是计算 `depth` 的 source fact，但 browser compositor 没有必须再次理解 priority 的理由。因此默认不把 `priority` 重复放入 RenderData；它留在 `semantics.ts` 的计算与单测里。

如果后续调试证据表明确实需要 browser diagnostics，再增加 package-private/debug 信息，不为了方便先扩正式数据面。

### 5.2 projectVisibleTiles

从：

```ts
projectVisibleTiles(map, cameraX, cameraY)
```

变成：

```ts
projectVisibleTiles(map, tileset, cameraX, cameraY)
```

概念实现：

```ts
for (const layer of [0, 1, 2] as const) {
  for (const visible x/y) {
    const tileId = tableAt(map.data, x, y, layer);
    if (tileId === 0) continue;

    const priority = tableAt(tileset.priorities, tileId);
    const depth = tileVisualDepth(y, priority);

    tiles.push({ x, y, layer, tileId, depth });
  }
}
```

现有 regular tile / bounds / tileset table validation 继续 fail closed。

priority 一旦成为可见行为的输入，应新增明确验证。预期 RMXP priority 范围为普通 priority levels；实际允许集合在冻结前应从真实 Essentials v21.1 数据扫描和原版证据确认，而不是只因为碰撞代码当前使用了 `priority === 0` / `priority > 0` 就直接假设所有值均合法。

### 5.3 Player RenderData

当前 player data：

```text
x/y
screenX/screenY
direction
pattern
sprite
```

增加：

```ts
depthBase: y * 32 + 32
```

不在 Runtime 里输出最终 `depth`，因为 Runtime 不应为了 presentation ordering 去解析 PNG 尺寸。

---

## 6. Browser composition：Depth Bucket Canvas

### 6.1 不采用两个固定 Canvas

最简单的：

```text
background canvas
player
foreground canvas
```

只能处理一个 player。后续出现 NPC/Event 后会需要：

```text
tile
NPC
player
tile
NPC
tile
```

两个固定 Canvas 无法表达。

### 6.2 不采用一 tile 一个 DOM element

640×480 的可视区约 20×15 格，三层普通 tile 最坏会接近数百个可见 tile。把每个 tile 变成 DOM node 会无必要地放大 presentation 成本，也偏离当前 Canvas 路线。

### 6.3 采用 depth bucket

`lr-map-view` 内按 `depth` 对可见 tile 分组：

```text
depth = 0
→ 一个 Canvas，画全部 depth=0 tile

depth = 256
→ 一个 Canvas，画全部 depth=256 tile

depth = 288
→ 一个 Canvas，画全部 depth=288 tile
...
```

角色本身保持 `lr-map-sprite`，使用同一 map-local depth 作为 CSS stacking 值：

```text
canvas depth=0
canvas depth=256
lr-map-sprite depth=287
canvas depth=288
canvas depth=320
```

这样可以在保持 Canvas 聚合绘制的同时，让 tile 与 character 交错。

### 6.4 Bucket 内顺序

同一个 depth bucket 内继续保持 source 稳定顺序：

```text
layer 0
→ layer 1
→ layer 2
```

并保持当前 visible projection 对 x/y 的确定性遍历。

最终排序责任可以理解为：

```text
第一层：visual depth
第二层：Map.data layer / 现有稳定 tile order
```

不要把 `Map.data.layer` 当成跨角色的全局深度。

### 6.5 Shadow DOM / slot

当前 `.entities` 如果形成独立 stacking context，会导致 `lr-map-sprite` 的 z-index 无法与内部 tile canvas 真正交错。

重构后必须保证：

```text
depth canvases
和
slotted lr-map-sprite
```

处在同一个 `lr-map-view` stacking context 中。

实现可以使用不形成额外 stacking context 的 slot/container；具体 CSS 不是本草案的逻辑合同。该行为必须由真实 Chromium presentation test 验证，不能只靠 Node/DOM 推断。

---

## 7. Ownership / 边界

本需求应只落在 map consumer：

```text
tools/fixtures/essentials-v21.1
    已有 priorities projection；默认不改

@loomrealm-game/map / semantics.ts
    RMXP tile priority → map-local visual depth

@loomrealm-game/map / runtime.ts
    输出 computed tile depth + player depthBase

@loomrealm-game/map / browser/map.browser.js
    depth bucket Canvas + sprite stacking
```

明确不修改：

```text
packages/renderer
packages/subsystem
packages/main
packages/data
packages/wire
```

理由：priority、tile layer、character foot depth 都是 map game library 的业务 presentation semantics，不是 LoomRealm framework 的通用 authority。

同样不新增：

```text
SceneGraph
LayerManager
DepthManager
PresentationRuntime
Renderer generic z-sort API
```

当前只有一个真实 map consumer，先在 `@loomrealm-game/map` 内把具体需求做对。

---

## 8. 测试策略

### 8.1 Pure semantics tests

在 `game-libs/map/test/semantics.test.mjs` 增加：

1. `priority=0` 得到底层 depth；
2. 相同 y，priority 每增加 1，depth 增加 32；
3. 相同 priority，y 每增加 1，depth 增加 32；
4. `projectVisibleTiles()` 从真实 `Tileset.priorities` 查值，而不是从 Map layer 猜 depth；
5. 同一个 depth bucket 中保持 `layer=0,1,2` 的稳定顺序；
6. cameraX/cameraY 改变不会改变同一 world tile 的 depth；
7. 非法 priority / 越界 tileId 按最终冻结的 source rule fail closed。

### 8.2 Browser presentation tests

至少验证三种排序：

```text
低 depth tile
< player

高 depth tile
> player

同一 player 移动到相邻 y 后
遮挡关系随新位置立即变化
```

重点测试真实 Chromium 的 stacking，而不是只检查 RenderData 数字。

### 8.3 Real Essentials acceptance

最终验收必须使用本目录初始化得到的真实 Essentials v21.1 FSDB，不新增假地图替代玩家可见验收。

选择至少一个真实场景，证明：

```text
玩家走到树冠 / 屋檐 / 门楣等后方
→ 环境盖住角色

玩家走到空地 / 前方
→ 角色重新完整可见
```

验收坐标和 tile evidence 应在实现阶段从真实 FSDB 中选取并记录，不在本草案中凭印象硬编码。

如果原版 Essentials 的同一地图可运行，应把原版画面作为前后关系 oracle；LoomRealm 不另发明一套视觉层级规则。

---

## 9. 建议落地顺序

### Slice A — 冻结 map-local depth semantics

只改：

```text
semantics.ts
semantics.test.mjs
```

完成：

```text
tileVisualDepth()
VisibleTile.layer
VisibleTile.depth
projectVisibleTiles(map, tileset, ...)
priority validation/evidence
```

先把「什么应该在谁前面」做成纯函数并测准。

### Slice B — RenderData plumbing

改：

```text
runtime.ts
相关 runtime / M14 consumer tests
```

完成：

```text
tile depth → MapViewRenderData
player depthBase → MapSpriteRenderData
```

确认没有修改 Main / Renderer / Subsystem framework contract。

### Slice C — Browser compositor

改：

```text
browser/map.browser.js
browser presentation tests
```

完成：

```text
single map canvas
→ depth bucket canvases

player
→ map-local CSS stacking depth
```

验证 Shadow DOM / slot stacking 在 Chromium 中真实成立。

### Slice D — Real asset qualification

使用 `essentials-v21.1-local` 的真实 FSDB：

```text
选定真实遮挡场景
→ 与原版前后关系对照
→ 玩家移动前后均观察正确
→ 记录 evidence
```

只有这一刀通过后，才把需求文档第 1 节视为已落地。

---

## 10. 非目标

本设计不解决：

```text
行走 pattern / interpolation
按住方向连续移动
地图 Transfer / Map Event
NPC/Event lifecycle
always_on_top 等尚未出现的 event character 行为
autotile 新支持
战斗 / 菜单 / 对话
通用 Renderer scene graph
```

如果后续 NPC/Event 成为真实 consumer，优先复用这里形成的 map-local depth 空间；只有出现无法由具体 map compositor 表达的第二个独立真实 consumer 时，再讨论是否抽公共 presentation mechanism。

---

## 11. 待实证问题

以下问题在实现前必须通过真实 Essentials / RGSS 行为证据确认，不在 Draft 阶段擅自冻结：

1. character frame `height > 32` 时的精确 depth 修正规则，以及 Essentials 是否在基础 RMXP 上有覆写；
2. tile 与 character 出现相同最终 depth 时的 tie-break 行为；
3. Essentials v21.1 实际 Tileset priority 值域及是否存在特殊值；
4. 当前 local example 的最佳真实遮挡验收地点；
5. Shadow DOM slot 与内部 canvas 在目标 Chromium/Electron 版本下的 stacking 细节。

这些都是 `@loomrealm-game/map` 的兼容性证据问题，不应先转化为 LoomRealm framework abstraction。

---

## 12. 预期完成态

实现完成后，map presentation 应从当前：

```text
全部地图像素
↓
玩家
```

变成：

```text
RMXP Map layer + Tileset priority
        ↓
map-local tile visual depth
        ↓
Depth Bucket Canvas

player logical foot position + actual frame height
        ↓
map-local character visual depth
        ↓
与 tile bucket 交错
```

最终玩家看到的是原版地图已有的前后关系；LoomRealm Renderer 仍然只负责已有 Render Store / Web projection 机制，不知道 tree、roof、priority 或 RMXP tile layer 的存在。
