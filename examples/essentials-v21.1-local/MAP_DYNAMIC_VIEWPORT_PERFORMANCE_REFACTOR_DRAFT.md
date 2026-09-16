# 地图动态视口与大屏呈现性能改造草案

> 状态：**Draft for review；未冻结，不得直接实施**
>
> 日期：2026-09-16
>
> 生产代码基线：`3c10ae8`（后续 `main` 变更截至本次评审均为文档）
>
> 适用目录：`examples/essentials-v21.1-local`、`game-libs/map`、Desktop Renderer input realization
>
> 核心目标：支持随窗口变化的逻辑视口，并使地图移动、chunk refresh、autotile 与大屏投影的成本不再按每个 camera rAF 的可见 tile 总数增长。

本文是面向执行型 agent 的候选实施合同。评审通过并将状态改为 `Frozen for implementation` 前，不得据此修改生产代码。

本文只覆盖动态视口和地图呈现性能：

- 覆盖 `M14_02_MAP_GAME_LIBRARY.md` §11 的固定 `640×480` viewport、§14 的旧 `MapViewRenderData` 形状，以及 §15 的每次 paint 全画布重画规则；
- 继承 `RENDER_MOVEMENT_LATENCY_CORE_REFACTOR.md` 已落地的 Render update/patch、latest-state、copy-on-write 和 `zIndex` 语义，不重新设计通用 Render 协议；
- `MAP_MOVEMENT_LATENCY_REFACTOR_DRAFT.md` 中 input latency、movement cadence、turn buffer、collision、transfer trigger 等规则继续独立生效；其中 Browser static backing、camera-only frame、autotile repaint 与 sprite raster/placement 等呈现性能条款由本文统一替代，避免两份草案同时拥有同一性能 slice；
- 复用 `MAP_AUTOTILE_ANIMATION_DESIGN_DRAFT.md` 的“一次异步 prepare + 同步 paint”方向，但以本文 dirty-cell raster 规则替代“动画帧变化时重画整层”；
- 保持 `MAP_LAYERING_DESIGN_DRAFT.md` 已冻结的 tile/player depth 与 equal-depth 规则。

如上述文档与本文在未明确覆盖的 authority、碰撞、transfer trigger、资源访问或最终收敛语义上冲突，以已冻结文档为准并停止实施，不允许执行者自行选择。

---

## 1. 决策摘要

本改造只保留解决已测瓶颈所需的状态和算法：

```text
Desktop Window CSS size
  → existing RendererInputSource custom state
  → Map Runtime accepted viewport
  → current 8×8 chunk-aligned ProjectionWindow
  → RenderDomain.update / scene replace
  → MapView current-window prepared state + world raster
  → camera rAF placement-only
  → autotile tick dirty-cell-only
```

冻结候选决策：

1. 逻辑视口使用 CSS pixel；tile 仍为 `32×32` logical pixel。
2. Desktop 通过 `x.loomrealm.viewport.state` 发布当前可用 CSS 宽高；不增加新的 Control/Data/Render 协议。
3. Runtime 是 accepted viewport、camera、投影范围、scene identity 和 presentation revision 的唯一 authority。
4. tile 投影从逐 tile 嵌套对象改为 `8×8×3` 稠密 chunk，加场景内不可变 `tileVisuals` 表。
5. Runtime 只保留**当前 ProjectionWindow**；重叠 chunk 复用，entering chunk 新投影，leaving chunk 丢弃。不建立 LoadedMap-wide 历史 chunk cache。
6. Browser 只拥有可丢弃的 decoded image、**当前 window 的 prepared representation**、world raster 和 motion timeline；不要求独立的长期 `chunk analysis cache` 抽象。
7. 同 scene window refresh 必须复用 overlap pixels，并只 raster entering chunks；这是当前 refresh 性能 gate 的组成部分，不是可选优化。
8. camera motion 的每个 rAF 禁止 tile validation、full tile traversal、full canvas clear 或 tile `drawImage`。
9. autotile frame 变化只重画受影响 `(depth, cell)`；不重画静态 tile 或无关 depth。
10. player raster identity 与 placement 分离；位置变化不得重设 canvas 尺寸或重新裁切同一帧。
11. `sceneRevision` 只标识 map scene；`presentationRevision` 只协调需要 MapView/MapSprite 原子切换的 raster baseline。不要让 Sprite 理解 scene cache identity。
12. 第一期支持 `320×240` 至 `1920×1080` logical CSS pixel；更大窗口保留居中 letterbox，不静默扩大投影预算。
13. pixel-art backing 保持 `1 logical pixel = 1 canvas backing pixel`；`devicePixelRatio` 不进入 Runtime authority 或 RenderData。
14. 不新增 `ViewportManager`、`ChunkManager`、`SceneManager`、`AnimationManager`、generic render chunk protocol 或 Renderer background authority。
15. 跨组件数据 shape 精确冻结；Runtime/Browser 内部 cache、token、bookkeeping 只冻结行为不变量，不冻结辅助实现形式。

---

## 2. 已确认事实与问题基线

当前实现存在以下性能耦合：

- `computeCamera()` 写死 `640/480` 与 `304/224`；
- `viewportTileBounds()` 写死 `camera + 639/479`；
- `lr-map-view` Shadow CSS 与 canvas backing 写死 `640×480`；
- camera 插值期间，每次 camera pixel 变化都会 clear depth canvas、遍历 projected tiles 并重复 tile `drawImage`；
- MapSprite 每个 movement rAF 都重设 `canvas.width/height`、clear 并 draw；
- retained projection 越界时重新投影并把完整 `tiles` 数组写入 viewport data；
- MapView 在 `tiles` identity 变化时重新校验全部 tile、重建 depth buckets；
- animated autotile frame 变化时当前实现重画所有 depth layer。

2026-09-15/16 的真实 Essentials 基线：

| 场景 | camera 行为 | projected tile | depth layer | tile JSON 约值 |
|---|---|---:|---:|---:|
| Map066 `(8,7)` | camera clamp `0,0` | `491` | `3` | `43,116 B` |
| Map002 `(16,10)` | camera `208→240` | `753` | `6` | `66,875 B` |

现有 qualification 记录：

```text
ordinary update P95 = 42.9ms
refresh update  P95 = 96.3ms
refresh gate         = 50ms（失败）
```

根因排序：

```text
主因：camera rAF 按 O(projected tile count) 重复 raster
次因：window refresh 重复投影、序列化、校验、分桶和全量 raster
放大项：animated autotile 周期性触发全层 raster
附加项：player 每帧重置 backing canvas 并重复 drawImage
```

因此本文必须同时消除持续性 rAF 成本与 refresh 成本；不能只把 camera frame 变快后留下 `96.3ms` refresh。

---

## 3. 目标、非目标与不变量

### 3.1 必须达到

1. `320×240` 到 `1920×1080` 使用同一 Runtime accepted viewport 做 camera、projection 与 Browser clipping。
2. standing、walking、camera-follow、collision、transfer、resize 与 reconnect 均正确收敛。
3. camera-only rAF：

   ```text
   tile validation       = 0
   chunk preparation     = 0
   full tile traversal   = 0
   tile drawImage        = 0
   canvas size assignment= 0
   placement work        = O(active depth layers)
   ```

4. autotile frame 未变化时 tile raster 为 0；变化时只重画受影响 cell。
5. projection window 只在 required chunk bounds 离开当前 retained window、viewport 改变或 scene 改变时刷新。
6. 同一 scene 的 window refresh：retained chunk 不重复 semantic projection，overlap pixels 复用，entering chunk 只处理一次。
7. `MapViewRenderData` 单 node data 始终低于 framework `262,144 B`；map 自身继续使用 `196,608 B` preflight guard。
8. resize candidate 超预算时保留最近 accepted viewport，不发布半成品、不清空当前画面。
9. resize/refresh/transfer 的 presentation commit 不出现 blank、旧 map 覆盖新 map或 ghost sprite。
10. 不以关闭校验、放宽 JSON 限制、关闭 autotile 或降低 layering 正确性换取性能。

### 3.2 保持不变

- Runtime `x/y` 仍是整数目标格 authority；Browser 不决定碰撞、路径或 transfer。
- camera 与 player 使用同一 motion id/duration，最终收敛到 Runtime target。
- tile visual depth、character visual depth、equal-depth 和现有 `zIndex` 编码不变。
- map/tileset/autotile/character 仍通过 Content authority 读取并用 `contentVersion` 引用。
- disconnect/reconnect 通过最新 retained state 重建，不增加 resume log 或可靠 animation event queue。
- 一次 Render update 可同时更新 viewport 与 player；不拆成两个业务 domain。

### 3.3 本轮不做

- WebGL、GPU atlas、worker/offscreen rendering；
- 动态画质、动态 render scale、自动降分辨率；
- 地图编辑或运行时修改 tile；
- NPC/Event、多角色统一 scene graph；
- importer 生成 `resource.MapVisualChunk`；
- framework 通用 chunk、dirty rectangle、viewport 或 animation API；
- 修改 Data/Render/Wire payload 上限；
- Browser 读取 `struct.Map` / `struct.Tileset` 或重新实现碰撞语义；
- 为“离开当前 window 后未来可能再次回来”建立历史 chunk/raster cache。

---

## 4. Authority 与模块边界

| 事实 | owner | consumer |
|---|---|---|
| Window 当前 CSS 宽高 | Desktop `RendererInputSource` | Input gate / interested Subsystem |
| accepted logical viewport | Map Runtime | Map Browser |
| scene/presentation revision | Map Runtime | Map Browser |
| player/map/camera/chunk selection | Map Runtime | Renderer mirror / presentation |
| Map/Tileset 内容 | Content + Map Runtime | Map Runtime |
| decoded image/current prepared state/raster/timeline | Map Browser | Map Browser |
| current Render replica/currentness | existing Renderer | Web Projector |

Desktop producer 只描述 physical surface fact，不知道 map/tile/camera/chunk policy。Map Runtime 不读取 DOM。Map Web Component 不把布局结果写回业务状态。

既有 User Input v1 已允许 `x.*.state`，且已有 fresh sample、availability、latest-state coalescing、activation/currentness 与 bounded payload。因此 `x.loomrealm.viewport.state` 是现有 physical fact seam 的一个 Desktop realization，不增加新协议。

`apps/desktop/src/renderer-input-source.ts` 只允许包含：

```text
window.innerWidth / innerHeight
positive integer normalization
state availability lifecycle
resize rAF coalescing
channel x.loomrealm.viewport.state
```

禁止包含 tile size、viewport cap、camera、overscan、chunk、mapId、movement 或 autotile policy。

---

## 5. Viewport input 与 Runtime accepted state

### 5.1 Desktop payload

```ts
type DesktopViewportState = Readonly<{
  width: number;
  height: number;
}>;
```

channel：

```text
x.loomrealm.viewport.state
```

sample：

```ts
{
  width: Math.floor(window.innerWidth),
  height: Math.floor(window.innerHeight),
}
```

规则：

- width/height 必须是正 safe integer；surface 为 0 时 channel unavailable；
- start 或 unavailable→available：fresh state 先于 `availability=true`；
- resize 用单个 pending rAF 合并，同值不重复发送；
- blur/hidden 沿用既有 unavailable lifecycle，Runtime 保留最后 accepted viewport；
- focus/visible 恢复重新采样；
- stop 取消 pending rAF；
- 不发送 DPR、screen size、display id 或 DOM rect。

### 5.2 Runtime state

```ts
interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

const DEFAULT_VIEWPORT = Object.freeze({ width: 640, height: 480 });
const MIN_VIEWPORT_WIDTH = 320;
const MIN_VIEWPORT_HEIGHT = 240;
const MAX_VIEWPORT_WIDTH = 1920;
const MAX_VIEWPORT_HEIGHT = 1080;
const VIEWPORT_RESIZE_SETTLE_MS = 100;
```

Runtime 只需要：

```text
acceptedViewport
pendingViewport?    // latest normalized sample only
resizeTimer?
```

不再为 candidate/pending/settled 建多套状态对象。

normalization：exact `{width,height}` object、positive safe integer，然后 clamp 到 min/max。非法 sample fail closed for that sample，不覆盖 accepted viewport。

transition：

```text
first legal sample different from default
  → tryCommitViewport immediately

later changed sample
  → pendingViewport = latest
  → reset 100ms trailing timer

timer fires while standing
  → tryCommitViewport

timer fires while moving
  → keep pending only

movement step boundary
  → if pending, tryCommitViewport before next motion baseline
```

相同 normalized size 不产生新 commit。timer/callback 受 frame abort/current map guard；cleanup 必须取消 timer。

---

## 6. Camera 与 viewport 公式

```ts
export function computeCamera(
  map: MapRecord,
  playerX: number,
  playerY: number,
  viewport: ViewportSize = DEFAULT_VIEWPORT,
): Readonly<{ cameraX: number; cameraY: number }>;

export function viewportTileBounds(
  map: MapRecord,
  cameraX: number,
  cameraY: number,
  viewport: ViewportSize = DEFAULT_VIEWPORT,
): TileProjectionBounds;
```

camera：

```text
anchorX=floor((viewport.width-32)/2)
anchorY=floor((viewport.height-32)/2)

cameraX=clamp(playerX*32-anchorX,0,max(map.width*32-viewport.width,0))
cameraY=clamp(playerY*32-anchorY,0,max(map.height*32-viewport.height,0))
```

bounds：

```text
minTileX=max(0,floor(cameraX/32))
maxTileX=min(map.width-1,floor((cameraX+viewport.width-1)/32))
minTileY=max(0,floor(cameraY/32))
maxTileY=min(map.height-1,floor((cameraY+viewport.height-1)/32))
```

`640×480` 必须严格退化为当前 `304/224` 公式。walking coverage 使用 source/target viewport bounds union。

---

## 7. 稠密 projection contract

### 7.1 常量与 ordering

```ts
const TILE_SIZE = 32;
const CHUNK_TILES = 8;
const CHUNK_CELL_COUNT = CHUNK_TILES * CHUNK_TILES * 3; // 192
const CHUNK_OVERSCAN = 1;
const MAX_PROJECTED_DATA_BYTES = 196_608;
```

chunk 坐标：

```text
chunkX=floor(tileX/8)
chunkY=floor(tileY/8)
```

`chunks` canonical order：`chunkY` ascending，再 `chunkX` ascending。

`cells` 固定 192，index：

```text
((z*8+localY)*8)+localX
z=0,1,2; localY=0..7; localX=0..7
```

地图外 cell 为 `0`；非空值是原始 tileId。

### 7.2 跨 Runtime→Browser 的 exact RenderData

```ts
type ProjectedChunk = Readonly<{
  chunkX: number;
  chunkY: number;
  cells: readonly number[]; // exact length 192
}>;

// depthBias === -1 => visual depth 0
// otherwise depth = tileY*32 + depthBias
type TileVisual =
  | null
  | readonly [depthBias: number, kind: 0, sourceIndex: number]
  | readonly [
      depthBias: number,
      kind: 1,
      slot: number,
      tlSx: number, tlSy: number,
      trSx: number, trSy: number,
      blSx: number, blSy: number,
      brSx: number, brSy: number,
    ];

type MapViewRenderData = Readonly<{
  sceneRevision: number;
  presentationRevision: number;
  viewportWidth: number;
  viewportHeight: number;
  mapId: number;
  mapWidth: number;
  mapHeight: number;
  cameraX: number;
  cameraY: number;
  tileset: ResourceRef;
  autotiles: readonly (ResourceRef | null)[];
  tileVisuals: readonly TileVisual[];
  chunks: readonly ProjectedChunk[];
  cameraMotion: CameraMotion | null;
}>;
```

`MapSpriteRenderData` 新增：

```ts
presentationRevision: number;
```

`sceneRevision` 不进入 Sprite。`presentationRevision` 是两个 map-owned element 的原子 presentation baseline id，不是 framework generation。

### 7.3 `tileVisuals`

每次 `loadMap()` 为当前 Tileset 构建并冻结一次：

- index = tileId；
- `0` 与不可渲染保留位为 `null`；
- regular tile 使用既有 `sourceIndex`；
- autotile 使用既有 `slot` 与预计算四组 `sx/sy`；
- `priority===0` → `depthBias=-1`；
- `priority>0` → `depthBias=(priority+1)*32`。

Browser 只执行已投影 blit/depth instruction，不读取 Tileset table、不决定 priority、不调用 `autotileCorners()`。

### 7.4 Current ProjectionWindow 就是 Runtime chunk cache

Runtime 不维护 LoadedMap-wide `(chunkX,chunkY) → ProjectedChunk` 历史表。当前 window 内部允许按 coordinate 索引现有 chunks，仅用于 refresh diff：

```text
new required window
  ∩ old window → reuse existing frozen ProjectedChunk object
  - old window → project entering chunk once
old - new       → drop
```

因此内存为 `O(current window)`，同时保证单次滚动 refresh 的 retained chunk 不重新投影。

chunk 离开 window 后再进入时允许重新 project；文档不为未来可能的 revisit 建立长期 memoization。若 profiling 以后证明 revisit projection 是独立瓶颈，必须用新证据再评审 cache policy。

### 7.5 Window selection

从 source/target union tile bounds 得到 required chunk bounds，再各方向扩一 chunk并 clamp：

```text
requiredMinChunkX=floor(required.minTileX/8)
requiredMaxChunkX=floor(required.maxTileX/8)
requiredMinChunkY=floor(required.minTileY/8)
requiredMaxChunkY=floor(required.maxTileY/8)

window=min/max(required ± CHUNK_OVERSCAN, map chunk bounds)
```

当前 window 仍包含新的 required bounds 时，ordinary movement 不包含 `chunks`。越界时确定性选择新 window，不按 payload 动态改变 overscan。

map-side explicit byte preflight 只在以下时机运行：initial baseline、scene transfer、accepted viewport commit、chunk window refresh。ordinary author update 不重复做自己的 `JSON.stringify` guard。

---

## 8. Runtime publication 与 revision

### 8.1 Revision semantics

```text
sceneRevision
  changes only when a new map scene successfully becomes authoritative

presentationRevision
  changes whenever MapView must commit a new raster baseline together with MapSprite:
  - chunk window refresh
  - accepted viewport change
  - successful scene transfer
```

ordinary movement within retained window不增加 `presentationRevision`。revision 必须为 positive safe integer，session 内单调递增且禁止 wrap；无法递增时 fail closed，而不是复用旧 identity。

### 8.2 Ordinary movement

retained window 命中：

```text
viewport set cameraX/cameraY/cameraMotion
player   set x/y/screenX/screenY/direction/pattern/motion
```

不重复 set `chunks`、`tileVisuals`、resource refs、viewport size 或 revisions。

### 8.3 Chunk refresh

跨 chunk coverage boundary：先构造新 window、复用 overlap chunk、project entering chunk，通过 budget 后 `presentationRevision += 1`，同一个 `domain.update()`：

```text
viewport set presentationRevision/cameraX/cameraY/cameraMotion/chunks
player   set presentationRevision/x/y/screenX/screenY/direction/pattern/motion
```

同 accepted viewport 的 chunk refresh 若超 `196,608 B`，不得缩 overscan 或发布不完整画面；按 map presentation failure fail closed，并形成 qualification 证据。

### 8.4 Viewport commit

pending viewport 通过 projection budget 后，`presentationRevision += 1`，同一个 `domain.update()`：

```text
viewport set presentationRevision/viewportWidth/viewportHeight/
             cameraX/cameraY/cameraMotion/chunks
player   set presentationRevision/screenX/screenY
```

若 boundary 同时开始下一步，仍为同一 update，不先发布 viewport 再修正 player。

resize candidate 超预算：不修改 accepted viewport/current window/revision，不调用 update/replace，保留当前画面；后续较小 sample 可继续尝试。

### 8.5 Scene transfer

成功 map transfer 是明确的 scene replacement，不用 same-scene `update()` 表达：

```text
sceneRevision += 1
presentationRevision += 1
accepted viewport 保持当前值，除非已有独立 pending resize 在合法 boundary 被接受
construct new tileVisuals + current ProjectionWindow + resources + camera/player
→ domain.replace(full scene)
```

新 scene 不复用旧 scene pixels、prepared chunks 或 resource-derived raster。旧 scene async completion 必须被 scene/currentness guard 丢弃。

---

## 9. Browser world-space raster

### 9.1 只冻结三个阶段和工作量，不冻结 cache class

```text
validate/prepare
  → exact RenderData validation
  → reuse same-scene decoded resources
  → build/update current-window draw instructions and animated-cell index

raster
  → build/update world-space depth backing
  → refresh copies overlap and rasters entering chunks only
  → autotile tick repaints dirty cells only

placement
  → camera rAF updates depth canvas placement only
```

当前-window prepared representation 的具体 JS shape 是 implementation detail；不要求独立 `ChunkAnalysisCache`、token class 或 manager。

rAF callback 禁止 `await`、Content request、image decode、chunk validation、full tile traversal 或 full canvas clear。

### 9.2 Depth backing

每个当前实际存在的 visual depth 最多一个 live canvas。canvas 使用该 depth 当前 tile 的最小 world-pixel bounding rectangle：

```text
originX/originY = minimum world pixel
width/height    = exact covered tile rectangle
backing scale   = 1
zIndex          = tileStackValue(depth)
```

placement：

```js
canvas.style.left = `${originX}px`;
canvas.style.top = `${originY}px`;
canvas.style.transform = `translate3d(${-cameraX}px, ${-cameraY}px, 0)`;
```

不得给包住所有 depth canvas 的共同 ancestor 设置 transform，以免创建共同 stacking context 破坏 tile/player 交错 z-index。

### 9.3 Window refresh：overlap reuse 是算法，不是 cache framework

同 scene refresh：

1. exact validate 新 chunks；
2. 以 coordinate diff 得到 retained/entering/leaving；
3. retained chunk 可复用当前-window prepared instructions；entering chunk 只 prepare 一次；
4. 为每个 depth 计算新 bounds并建立 detached blank backing；
5. 从旧 backing 复制 world-bounds overlap；
6. 只 raster entering chunk instructions；
7. 按当前 autotile frame 修正 retained overlap 中已过期 animated cells；
8. scene/presentation/currentness 检查通过后替换 live layer 集合；
9. leaving chunk 的 prepared state 与不可见 layer 立即丢弃。

Browser 保留状态上限就是当前 window。被丢弃的 chunk 后来重新进入时重新 exact validate/prepare；不保留“第一次内容”历史只为审计 identity。

同一**仍 retained** `(sceneRevision, chunkX, chunkY)` 若 cells 与已接受内容不一致，fail closed。evicted 后重新进入不要求与已丢弃历史比较；chunk immutability 的 primary contract 在 Runtime。

新 scene、tile visual identity 或 resource identity 变化时不复制旧 pixels，完整重建。

### 9.4 Animated autotile dirty cells

current prepared state 为 animated slot 保留：

```text
slot → depth → world cell → canonical ordered draw instructions
```

frame tick：

- frame index 未变：0 raster；
- slot 变化：只收集该 slot cells；
- 每个 `(depth,cell)` clear `32×32`；
- 按原 projection canonical order 重画该 cell/depth 的全部 instructions；
- 多 slot 同 tick 命中同 cell 先去重；
- single-frame autotile 不保持永久 rAF。

### 9.5 Invalidation invariants，禁止把 token 当合同

必须满足：

```text
camera/motion placement change
  MUST NOT invalidate tile raster

autotile frame change
  MUST NOT rebuild camera motion timeline

same sprite resource + direction + effective pattern
  MUST reuse sprite raster

sprite position/depth change
  MUST NOT resize/clear/redraw same crop
```

实现可以比较字段、对象 identity 或内部 key；文档不冻结 `rasterToken` / `placementToken` 变量、字符串编码或 helper shape。

---

## 10. 原子 presentation commit

`presentationRevision` 用于所有会替换 MapView raster baseline 的 update：chunk refresh、viewport commit、scene transfer。

MapView 处理高 revision data 时先完成 validate/prepare/detached raster，再做 currentness 检查；只有成功后才把该 revision 标记 accepted。MapSprite：

```text
sprite.presentationRevision < parent accepted → stale, drop
sprite.presentationRevision > parent accepted → keep latest pending, do not paint
sprite.presentationRevision = parent accepted → paint/update placement
```

viewport resize 的 commit 顺序：

1. validate data；
2. prepare/reuse same-scene resources；
3. detached raster；
4. latest data + scene + presentation + connected/currentness checks；
5. 同步设置 host/stage accepted width/height；
6. replace live layers；
7. accept presentationRevision；
8. place camera；
9. flush direct sprite pending data。

scene transfer使用同一 gate，但新 scene必须先完成资源 prepare；旧 map 永远不能作为新 scene 的 fallback。

失败时保留上一 accepted stage/layers/player；不先 clear live canvas。same-scene 后续 state 或 reconnect 可重试；scene transfer failure 沿用现有 fail-closed 规则。

---

## 11. CSS 与大屏策略

`game-libs/map/browser/map.css` 不再写死 `640×480`：

```css
lr-map-view {
  display: block;
  position: relative;
  overflow: hidden;
  image-rendering: pixelated;
}
```

`examples/essentials-v21.1-local/presentation.css` 保持现有首帧 `640×480` fallback 与居中；首份 accepted RenderData 后由 MapView inline width/height 成为 live size。超过 `1920×1080` 时 Runtime cap 保持最大 accepted size，外部自然 letterbox。

本轮不把 canvas backing 乘 DPR。DPR 不影响 camera、collision、visible tile 或 logical viewport；DPR 变化不得改变 backing pixel 总数。

---

## 12. 文件范围

### 12.1 Production

```text
apps/desktop/src/renderer-input-source.ts
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
game-libs/map/browser/map.browser.js
game-libs/map/browser/map.css
```

FSDB presentation 只能通过既有 sync script 从 build output 同步，不手工编辑。

### 12.2 Tests

```text
apps/desktop/test/renderer-input-source.test.mjs
game-libs/map/test/semantics.test.mjs
game-libs/map/test/runtime.test.mjs
game-libs/map/test/package.test.mjs
test/map-layering-browser.test.mjs
test/m14-vertical.test.mjs
test/m15-hostra-product.test.mjs
```

允许新增 map browser performance helper，但必须驱动生产 Custom Elements，不复制 raster implementation。

### 12.3 实施后文档/qualification

```text
M10_03_RENDERER_INPUT_PRODUCERS.md
M14_02_MAP_GAME_LIBRARY.md
M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md
doc/30-implementation/m14-qualification.md
doc/30-implementation/m15-qualification.md
```

该实现会产生新的 qualification subject；M14 与 M15 都必须按新 subject 重跑。当前 M14 exact-local 已知 blocker 必须在声明 Product/Governance Closed 前通过独立授权的 qualification-input 修正或正式处置，不能借本性能 refactor 顺手改 importer/framework contract。

### 12.4 禁止修改

```text
packages/data/**
packages/wire/**
packages/subsystem/**
packages/renderer/**
packages/renderer-control/**
packages/main/**
packages/fsdb/**
packages/fsdb-http/**
tools/fixtures/essentials-v21.1/import.mjs 及 importer implementation
```

若性能 gate 只能通过修改上述范围，STOP，返回最小复现与测量证据。

---

## 13. 实施顺序

### PR 0：基线与测量 seam

只增加/修正 qualification instrumentation，不改变画面：

- 固定 Map066/Map002 ordinary、refresh、autotile、draw/layer 统计；
- 记录 camera rAF 的 validation、tile traversal、drawImage、canvas resize；
- 记录 `MapViewRenderData` full data bytes；
- 分别测 640×480、1280×720、1920×1080 下 author `RenderDomain.update()` 的 residual full-state validation/snapshot-probe 成本；
- 固定 §15 的单时钟 measurement seam；
- source/dist/FSDB hash gate 全绿。

### PR 1：固定 640×480，先闭合性能模型

1. `semantics.ts` 增加 `tileVisuals` 与 8×8 chunk projector；
2. Runtime 改为 current ProjectionWindow reuse，不建 LoadedMap-wide cache；
3. RenderData 切换 `tileVisuals+chunks`；
4. Browser 建 current-window prepared state 与 world-space depth backing；
5. 实现 overlap pixel copy + entering-only raster；
6. 实现 dirty-cell autotile；
7. 实现 sprite raster/placement 分离；
8. 证明 640×480 pixel/layering baseline 相同并通过 refresh gate；
9. 删除 production 旧逐-tile projection path；测试 oracle 可保留为 test-only helper。

本 PR 不改 Desktop source，不改 viewport size。

### PR 2：动态 viewport + presentation revision

1. Desktop 发布 `x.loomrealm.viewport.state`；
2. Runtime 接入 channel，参数化 camera/bounds；
3. 增加 accepted/pending viewport + settle；
4. 引入 `sceneRevision/presentationRevision`；
5. chunk refresh、viewport commit、transfer 按 §8 publication；
6. Browser 按 §10 做 atomic presentation gate；
7. MapView commit inline host/stage size；
8. 同步 build output 与 local FSDB presentation。

### PR 3：qualification 与规范回写

- 完成 §14 全矩阵；
- 三轮性能采样；
- 更新 M10/M14/M15 与 M14/M15 qualification；
- 删除只用于调试且未被 gate 使用的 hook；
- 不在 qualification PR 追加新的优化策略。

---

## 14. 测试矩阵

### 14.1 Desktop / semantics / Runtime

尺寸：

```text
320×240
640×480
800×600
960×540
1280×720
1920×1080
```

必须覆盖：

- source state→availability、resize rAF coalesce、0-size unavailable、focus/visible fresh sample、stop cleanup；
- 小 map camera 0、四边 clamp、odd viewport、inclusive `-1` bounds、source/target union；
- chunk edge zero padding、192-cell index/order、tileVisual regular/autotile/priority；
- retained chunk object reused within current window；entering projected once；leaving dropped；re-enter after eviction may be newly projected；
- first viewport sample immediate、later 100ms trailing、latest pending wins、same size no commit；
- walking boundary viewport commit；
- ordinary retained movement no chunks/revision；
- chunk refresh increments presentationRevision and updates MapView/MapSprite together；
- transfer increments sceneRevision + presentationRevision and uses full replace；
- budget rejection preserves accepted state；abort/late timer inert；
- collision/contact/edge/step transfer/reconnect behavior unchanged。

### 14.2 Browser correctness

- exact keys/revisions/chunk shape/cells/tileVisual invalid fail closed；
- retained same chunk identity content mutation fail closed；evicted/re-entered chunk重新验证，不要求历史 fingerprint；
- 640×480 pixel oracle 相等；所有 supported viewport 四边无缝；
- priority0/1..5、tall sprite、equal-depth layering；
- resize standing/walking/autotile active 无 blank；
- rapid A→B→C 只提交 latest accepted revision；
- chunk refresh期间 Sprite 不超前于 parent accepted presentationRevision；
- transfer prepare 与 resize/旧 async 交错时旧 scene 不覆盖新 scene；
- reconnect 从 full baseline 重建；
- DPR `1/1.5/2` logical coverage 相同且 backing pixel count 不随 DPR 增长。

### 14.3 Work invariants

```text
120 camera placement samples after prepare
→ chunk validation 0
→ full tile traversal 0
→ tile drawImage 0 when autotile frame unchanged
→ canvas width/height assignment 0
→ layer placement > 0
```

```text
autotile frame unchanged → drawImage 0
one slot changes          → only affected cells/depth redraw
```

```text
chunk refresh
→ retained semantic projection 0
→ overlap pixels copied
→ entering chunks prepared/rastered once
→ leaving prepared state dropped
→ Browser retained prepared state bounded by current window
```

### 14.4 Product scenarios

真实 `[FSDB]Essentials v21.1`：Map066 resize、Map066→Map002 camera-follow 长路径、Map002 Flowers1 + walking + resize、Map066↔Map067 transfer、minimize/focus/reconnect、快速 `640→720p→1080p→640`、超过 cap 的 letterbox。

---

## 15. 性能与容量 Gates

### 15.1 Canonical measurement seam

跨进程 `performance.now()` 值不得直接相减。

正式 product latency gate 使用 **Hostra product harness 单一 monotonic clock domain**：同一 harness process 记录 stimulus dispatch 时刻与“目标 presentation 已被 Browser observation hook 确认 paint/commit”返回时刻。Browser/Runtime 内部时间戳只能做局部诊断，不能与另一进程时钟拼成 end-to-end latency。

PR0 必须用该 seam 重新记录 ordinary/refresh baseline；若历史 `42.9/96.3ms` 使用不同 seam，只作为历史证据，不与新 gate 数值直接混算。

Browser 局部 gate 可另外记录 `receiveRenderData→commit`，但必须在 Browser 单进程时钟内完成。

采样要求：release-like build；记录 commit、Node/Electron/Chromium、CPU/GPU、DPR、viewport、map/position；cold load 与 warm movement 分开；每档三轮并报告每轮及合并 P50/P95/max；ordinary、chunk refresh、autotile frame-change 分桶；禁止只报最佳值。

### 15.2 必过指标

在 qualification 机器上：

| 指标 | 640×480 | 1280×720 | 1920×1080 |
|---|---:|---:|---:|
| ordinary movement Hostra stimulus→paint-observed P95 | `≤50ms` | `≤50ms` | `≤50ms` |
| chunk refresh Hostra stimulus→paint-observed P95 | `≤50ms` | `≤75ms` | `≤100ms` |
| active movement `>33.4ms` frame ratio | `<1%` | `<1%` | `<2%` |
| complete visual step drop | `0` | `0` | `0` |
| camera-only tile drawImage/rAF | `0` | `0` | `0` |
| map node data bytes | `<196,608` | `<196,608` | `<196,608` |

此外：

- Map002 640×480 refresh 必须在新 canonical seam 下达到 `≤50ms`；
- dense synthetic 1920×1080 fixture 必须通过 payload guard；
- backing pixel 总数必须报告，DPR 改变不得改变 backing pixel 总数；
- idle 且无 animated autotile 时无常驻 rAF。

若 dense 1080p 无法满足 `196,608 B`，STOP。可重新评审 package-private tuple 编码；不得提高 framework limit、删除 validation、引入 Content chunk resource 或降低已冻结 viewport cap。

---

## 16. 已知 residual：Core full-state validation

本设计消除重复 wire payload、projection 与 Browser raster 工作，但不改变冻结的 Core `RenderDomain.update()` invariant。

因此 ordinary camera/player 小 patch 仍可能触发 Core 对最终完整 node data 的 validation / snapshot representability probe，其成本可能随稳定的 `chunks + tileVisuals` 总字节增长。

本文不因此进入 `packages/subsystem` 或修改 Core。PR0 必须在 640×480、1280×720、1920×1080 payload 上单独测该 residual：

```text
若 Browser/raster 优化已满足工作量 invariant，
但 Core full-state validation 单独导致 §15 gate 失败：
  STOP
  保存 profile / payload bytes / latency evidence
  返回 Core design review
```

禁止在 map refactor 中通过跳过 validation 或绕开 RenderDomain 来掩盖该成本。

---

## 17. 风险与明确拒绝的抽象

主要风险：chunk index/tuple错误、overlap copy 残留 leaving pixels、animated overlap stale frame、resize/motion/transfer交错、dense payload超预算、canvas memory 与 Desktop policy 泄漏。控制手段分别是 old projector test oracle、detached blank backing + world intersection、dirty correction、presentation revision gate、dense 1080p preflight、depth minimum bounds/backing scale 1、source module boundary tests。

禁止：

- camera rAF 继续全量 raster，只靠 throttle/降低 cadence；
- full `VisibleTile[]` 提高 limit；
- chunk Render node / `<lr-map-chunk>` / Content MapVisualChunk；
- LoadedMap-wide 或无界历史 chunk/raster cache；
- 把 Map/Tileset record 暴露给 Browser；
- Renderer/Data/Subsystem map-specific fast path；
- 全局 `ViewportManager/ChunkManager/RenderLoop/AnimationManager/SceneManager`；
- 为 resize 建 ACK/event command queue；
- 把内部 `rasterToken/placementToken`、cache class shape 或 bookkeeping object 提升为冻结 contract；
- DPR 乘所有 layer backing；
- resize/refresh 时先 clear live canvas 再异步 prepare；
- 关 autotile、减少 layer、修改 zIndex 语义换性能。

允许并需要的核心概念只有：

```text
Desktop viewport state
accepted/pending ViewportSize
ProjectedChunk + TileVisual
current ProjectionWindow
sceneRevision + presentationRevision
Browser current-window prepared state + world raster
```

其中 `prepared state` 是职责描述，不规定必须存在同名 class/cache。

---

## 18. 完成定义与 Freeze Gate

### Implementation Complete

- PR1/PR2 production 与 unit/browser tests 落地；
- fixed `640/480/304/224/639/479` 不再散落 production camera/paint path；
- camera-only rAF 零 tile raster；
- chunk refresh overlap reuse + entering-only raster；
- autotile dirty-cell；sprite raster/placement separation；
- `320×240` 至 `1920×1080` matrix 全绿；
- 未修改 §12.4 禁止范围。

### Product Closed

- §14 product scenarios 通过；
- §15 三轮 metrics 与 raw results 归档；
- source/dist/FSDB presentation hash 一致；
- resize/refresh/transfer/reconnect 无 blank、ghost sprite、stale layer；
- M14 exact-local prerequisite 已正式解决，不把旧 blocker 混入本 subject 的“通过”。

### Governance Closed

- M10/M14/M15 frozen docs 与 M14/M15 qualification 都回写到当前 subject；
- 本文更新为 `Implemented / Qualified` 或被正式文档取代并标明 superseded；
- 无临时 public API、无双轨 production path、无未使用 manager/cache abstraction。

### Freeze 前必须 PASS

- [ ] 文档与 movement/autotile/layering 的覆盖关系无双重 ownership；
- [ ] `sceneRevision/presentationRevision` publication 与 Browser gate tests 一一对应；
- [ ] Runtime cache 只 bounded by current ProjectionWindow；Browser prepared/raster state 只 bounded by current window；
- [ ] `8×8`、overscan `1`、viewport cap、100ms settle、196KiB guard 单一一致；
- [ ] dense 1080p exact RenderData fit 已用 fixture 证明；
- [ ] canonical Hostra single-clock measurement seam 已由 PR0 证明；
- [ ] Core full-state validation residual 已测，不把未知成本留给执行 agent；
- [ ] 当前基线 map/layering/M15 Desktop/local presentation gates 通过；
- [ ] custom viewport state 被确认只是 physical fact；DPR 留在 compositor；
- [ ] 不需要 framework/importer 变更。

全部 PASS 后才可改为：

```text
状态：Frozen for implementation
基线提交：<重新核对后的 production SHA>
```

Freeze 后执行 agent 无权改 chunk size、overscan、viewport cap、settle、payload guard、RenderData cross-component shape、framework/importer scope，或用降画质/关动画/放宽校验通过性能 gate。

遇到合同与代码不符、dense 1080p 超预算、Core residual 单独导致 gate 失败或必须修改禁止范围时，唯一正确行为是停止、记录最小复现与测量证据并返回设计评审。