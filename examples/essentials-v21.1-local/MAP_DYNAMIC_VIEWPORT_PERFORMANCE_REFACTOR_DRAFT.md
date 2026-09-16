# 地图动态视口与大屏呈现性能改造草案

> 状态：**Draft for review；未冻结，不得直接实施**
>
> 日期：2026-09-16
>
> 基线分支：`fix/render-movement-closure`
>
> 基线提交：`3c10ae8`
>
> 适用目录：`examples/essentials-v21.1-local`、`game-libs/map`、Desktop Renderer input realization
>
> 核心目标：支持随窗口变化的逻辑视口，并使地图移动、autotile 与视口扩展的成本不再按每个 rAF 的可见 tile 总数增长

本文是面向执行型 agent 的候选实施合同。评审通过并将状态改为 `Frozen for implementation` 前，不得据此修改生产代码。

本文只在动态视口和地图呈现性能范围内覆盖既有文档：

- 覆盖 `M14_02_MAP_GAME_LIBRARY.md` §11 的固定 `640×480` viewport、§14 对 `MapViewRenderData` 的固定形状，以及 §15 的每次 paint 全画布重画规则；
- 继承 `RENDER_MOVEMENT_LATENCY_CORE_REFACTOR.md` 已落地的 Render update/patch、latest-state、copy-on-write 和 `zIndex` 语义，不重新设计通用 Render 协议；
- 与 `MAP_MOVEMENT_LATENCY_REFACTOR_DRAFT.md` 正交：本文解决大地图 camera-follow 重绘和大屏投影成本，不改变步长、按键缓冲或碰撞规则；
- 复用 `MAP_AUTOTILE_ANIMATION_DESIGN_DRAFT.md` 的“一次异步 prepare + 同步 paint”方向，但以本文的 dirty-cell raster 规则替代“动画帧变化时重画整层”；
- 保持 `MAP_LAYERING_DESIGN_DRAFT.md` 已冻结的 tile/player depth 与 equal-depth 规则。

如上述文档与本文在未明确列出的 authority、碰撞、transfer、stale、资源访问或最终收敛语义上冲突，以已冻结文档为准并停止实施，不允许执行者自行选择。

---

## 1. 决策摘要

本改造采用一个闭环，而不是为卡顿、动态分辨率和 payload 分别追加补丁：

```text
Desktop Window CSS 尺寸
  → 既有 RendererInputSource 的 custom state channel
  → Map Runtime 接受并版本化 logical viewport
  → Runtime 计算 camera 与 8×8 对齐的 retained chunk window
  → RenderDomain.update 一次原子发布 viewport/camera/chunks/player
  → Map Web Components 校验并准备 world-space raster cache
  → camera rAF 只更新 placement；autotile tick 只重画受影响 cell
```

冻结候选决策：

1. 逻辑视口使用 CSS pixel；tile 仍为 `32×32` logical pixel。
2. Desktop 通过 `x.loomrealm.viewport.state` 发布当前可用 CSS 宽高；不增加新的 Control/Data/Render 协议。
3. Runtime 是 accepted viewport、camera、投影范围和版本的唯一 authority。
4. Browser 只拥有可丢弃的 decoded image、chunk analysis、raster 和 motion timeline cache。
5. tile 投影从逐 tile 嵌套对象改为 `8×8×3` 稠密 chunk 加场景内不可变 `tileVisuals` 表。
6. chunk 是 map package-private RenderData，不是 framework node、Content resource 或 importer 新格式。
7. camera motion 的每个 rAF 禁止 clear 全画布、遍历全部 tile 或调用 tile `drawImage`。
8. autotile 帧变化只重画使用该 animated slot 的 cell，不重画静态 tile 或无关 depth。
9. player raster identity 与 placement 分离；位置变化不得重设 canvas 尺寸或重新裁切同一帧。
10. 第一期支持 `320×240` 至 `1920×1080` logical CSS pixel；更大窗口保留居中 letterbox，不静默扩大投影预算。
11. pixel-art backing 保持 `1 logical pixel = 1 canvas backing pixel`；CSS/compositor 负责映射 device pixels。`devicePixelRatio` 不进入 Runtime authority 或 RenderData。
12. 不新增 `ViewportManager`、`ChunkManager`、`SceneManager`、`AnimationManager`、generic render chunk protocol 或 renderer background authority。

---

## 2. 已确认事实与问题基线

### 2.1 当前代码事实

当前实现存在以下固定耦合：

- `computeCamera()` 写死 `640/480` 与 `304/224`；
- `viewportTileBounds()` 写死 `camera + 639/479`；
- `lr-map-view` Shadow CSS 与 canvas backing 写死 `640×480`；
- camera 插值期间 `_paintPrepared()` 每次 camera pixel 变化都会：
  - clear 所有 depth canvas；
  - 遍历所有 projected tiles；
  - 对 regular tile 调用一次 `drawImage`；
  - 对 block autotile 最多调用四次 `drawImage`；
- MapSprite 每个 movement rAF 都重设 `canvas.width/height`、clear 并 draw；
- Runtime retained projection 使用 tile margin `[4,3,2,1]`，越过覆盖边界时重新投影并把完整 `tiles` 数组写入 viewport data；
- MapView 在 `tiles` identity 变化时重新校验全部 tile、重建 depth buckets；
- animated autotile 使 rAF 常驻，frame index 变化时当前实现重画所有 depth layer。

### 2.2 真实 Essentials 证据

2026-09-15/16 在当前本地 FSDB 与 `3c10ae8` 基线上得到：

| 场景 | camera 行为 | projected tile | depth layer | tile JSON 约值 |
|---|---|---:|---:|---:|
| Map066，出生点 `(8,7)` | camera 被边界夹在 `0,0` | `491` | `3` | `43,116 B` |
| Map002，中部 `(16,10)` | camera 随角色由 `208→240` | `753` | `6` | `66,875 B` |

当前 `250ms` step 约产生 15 个 rAF。Map002 中部一次移动会触发超过一万次 tile draw；Map066 因 camera 常被 clamp，paint token 多数帧可早退，所以同一实现只在较大地图上明显卡顿。

当前 retained window 的 margin 4 与 coverage margin 1 只留下约 3 tile 的有效余量，连续移动约每 4 格产生一次 projection refresh。现有真实 Hostra qualification 记录：

```text
ordinary update P95 = 42.9ms
refresh update  P95 = 96.3ms
refresh gate         = 50ms（失败）
```

Map002 同时包含 animated autotile `Flowers1`，因此 camera 重绘、projection refresh 和 autotile 全层重绘会叠加。

### 2.3 根因排序

```text
主因：camera rAF 按 O(projected tile count) 重复 raster
次因：window refresh 重复投影、序列化、校验、分桶和全量 raster
放大项：animated autotile 令全层 raster 周期性持续发生
附加项：player 每帧重置 backing canvas 并重复 drawImage
```

不是主因：

- `canMove()` 碰撞判断；
- 整格 Runtime authority；
- Render update/patch 是否保留 `zIndex`；
- FSDB 资源首次加载后的常驻读取；
- 单纯把 `250ms` 改小或提高 timer 优先级。

---

## 3. 目标、非目标与不变量

### 3.1 必须达到

1. 窗口从 `320×240` 到 `1920×1080` 时，Runtime 投影与 Browser clipping 使用同一 accepted viewport。
2. standing、walking、camera-follow、collision、transfer 与 reconnect 均可在 resize 前后正确收敛。
3. camera-only rAF 的 tile 工作量为：

   ```text
   0 次 tile validation
   0 次 bucket/chunk analysis
   0 次 tile drawImage
   O(active depth layer count) 次 CSS placement
   ```

4. autotile frame 未变化时不进行 tile raster；变化时只重画相应 slot 实际占用的 cell。
5. projection window 只在跨越 8-tile chunk coverage boundary 或 viewport/map 变化时刷新。
6. 同一 scene 中重叠 chunk 在 window refresh 后复用已验证 analysis 与 raster pixels。
7. `MapViewRenderData` 单 node data 始终低于既有 `262,144 B` framework limit；map 自身继续使用 `196,608 B` guard。
8. resize candidate 超过预算时保留最近 accepted viewport，不发布半成品、不清空当前画面，并产生 qualification 失败证据。
9. resize commit 不出现空白帧、旧 map 覆盖新 map、player 与 viewport revision 永久错位。
10. 不以关闭安全校验、放宽 JSON 限制或降低 layering 正确性换取性能。

### 3.2 保持不变

- Runtime `x/y` 仍是整数目标格 authority；Browser 不决定碰撞、路径或 transfer。
- camera 与 player 使用同一 motion id/duration，最终收敛到 Runtime target。
- tile visual depth、character visual depth、equal-depth 和现有 `zIndex` 编码不变。
- map/tileset/autotile/character 仍通过 Content authority 读取并用 `contentVersion` 引用。
- stale async image、旧 scene、旧 viewport revision 与旧 motion 不得触碰 live surface。
- disconnect/reconnect 通过最新 retained state 重建，不增加 resume log 或可靠 animation event queue。
- 一次 Render update 可同时更新 viewport 与 player；不拆成两个业务 domain。

### 3.3 本轮不做

- WebGL renderer、GPU atlas、worker/offscreen rendering；
- 动态画质、动态 render scale 或基于帧率自动降分辨率；
- 地图编辑、运行时修改 tile、破坏地形；
- NPC/Event、多角色统一 scene graph；
- importer 生成 `resource.MapVisualChunk`；
- framework 通用 chunk、dirty rectangle、viewport 或 animation API；
- 修改 Data/Render/Wire payload 上限；
- 在 Browser 中读取 `struct.Map`/`struct.Tileset` 或重新实现碰撞语义。

---

## 4. Authority 与模块边界

### 4.1 唯一 owner

| 事实 | owner | 允许的 consumer |
|---|---|---|
| Window 当前 CSS 宽高 | Desktop `RendererInputSource` physical producer | Input gate / interested Subsystem |
| accepted logical viewport + revision | Map Runtime | Map Browser presentation |
| player/map/camera/chunk selection | Map Runtime | Renderer mirror / presentation |
| Map/Tileset 内容 | Content + Map Runtime | Map Runtime |
| decoded image/raster/timeline | Map Browser presentation | Map Browser presentation |
| current Render replica/currentness | existing Renderer | Web Projector |

Desktop producer只描述 surface fact，不知道 map、tile、camera、Frame/Activation authority 或 RenderDomain。Map Runtime 不读取 DOM。Map Web Component 不把布局结果写回业务状态。

### 4.2 为什么使用 custom input state

既有 User Input v1 已允许 `x.*.state`，并已定义：

- fresh sample before `availability=true`；
- latest state coalescing；
- activation/currentness 与 reset；
- bounded payload validation。

因此新增 `x.loomrealm.viewport.state` 是现有 canonical physical fact seam 的一个 Desktop realization，不需要：

- 新的 Renderer→Runtime 协议；
- DOM callback 注入 business component；
- Presentation→Subsystem 私有后门；
- Main/Renderer viewport authority。

### 4.3 下层业务不得进入上层

`apps/desktop/src/renderer-input-source.ts` 只允许出现：

```text
window innerWidth / innerHeight
positive integer normalization
state availability lifecycle
resize rAF coalescing
channel name x.loomrealm.viewport.state
```

禁止出现：

```text
tile size、640×480 fallback、1920×1080 map cap
camera、overscan、chunk、mapId、movement、autotile
```

这些全部留在 `@loomrealm-game/map`。

---

## 5. Viewport state 与 accepted spec

### 5.1 Desktop source exact payload

```ts
type DesktopViewportState = Readonly<{
  width: number;
  height: number;
}>;
```

channel 固定：

```text
x.loomrealm.viewport.state
```

producer sample：

```ts
{
  width: Math.floor(window.innerWidth),
  height: Math.floor(window.innerHeight),
}
```

规则：

1. `width/height` 必须是正 safe integer；surface 为 0 时 channel unavailable。
2. 每次 source `start()` 或 unavailable→available：先发 fresh state，再发 `availability=true`。
3. resize 使用单个 pending `requestAnimationFrame` 合并同一帧内事件；值未变化不发 state。
4. blur/hidden 后沿用现有 source lifecycle 置 unavailable；Runtime 保留最后 accepted viewport。
5. focus/visible 恢复时重新读取当前尺寸，禁止复用旧 sample。
6. source stop 取消 pending resize rAF。
7. 不发送 `devicePixelRatio`、screen size、display id 或 DOM element rect。

### 5.2 Runtime exact types/constants

以下类型保持在 map package 内部，不从 package root export：

```ts
interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

interface AcceptedViewport extends ViewportSize {
  readonly revision: number;
}

const DEFAULT_VIEWPORT = Object.freeze({ width: 640, height: 480 });
const MIN_VIEWPORT_WIDTH = 320;
const MIN_VIEWPORT_HEIGHT = 240;
const MAX_VIEWPORT_WIDTH = 1920;
const MAX_VIEWPORT_HEIGHT = 1080;
const VIEWPORT_RESIZE_SETTLE_MS = 100;
```

normalization：

```ts
function normalizeViewportSample(value: unknown): ViewportSize {
  // exact object: width, height only
  // both positive safe integers
  return Object.freeze({
    width: Math.min(MAX_VIEWPORT_WIDTH, Math.max(MIN_VIEWPORT_WIDTH, value.width)),
    height: Math.min(MAX_VIEWPORT_HEIGHT, Math.max(MIN_VIEWPORT_HEIGHT, value.height)),
  });
}
```

非法 custom state fail closed for that sample，不终止 map frame、不覆盖 accepted viewport。qualification hook 记录拒绝原因；正式产品不得逐 resize console log。

### 5.3 Revision 与 settle

- frame 初始 `acceptedViewport = { revision: 1, ...DEFAULT_VIEWPORT }`。
- 第一份合法 source sample 若与默认值不同，立即尝试 commit，不等待 100ms。
- 后续不同尺寸只保留 latest candidate，并重置一个 `100ms` trailing timer。
- 与 accepted width/height 相同的 sample 不增加 revision。
- candidate 通过 projection byte budget 后，`revision = previous.revision + 1`。
- safe integer 即将溢出时，以完整 `domain.replace()` 建立 `revision=1` 的新 scene baseline；不得发布 0、负数或不安全整数。
- resize timer、candidate 与 callback 都受 frame abort/current map guard；cleanup 必须取消 timer。
- active movement 中 timer 到点时只标记 pending；在当前 step boundary 将 latest viewport 与下一 authoritative state 一次发布，不中途改写旧 motion 几何。

---

## 6. Camera 与 viewport 公式

### 6.1 精确签名

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

默认参数只用于保持现有测试/内部调用迁移安全；新 production call site 必须显式传 accepted viewport。

### 6.2 Camera 公式

```text
anchorX=floor((viewport.width-32)/2)
anchorY=floor((viewport.height-32)/2)

cameraX=clamp(playerX*32-anchorX,0,max(map.width*32-viewport.width,0))
cameraY=clamp(playerY*32-anchorY,0,max(map.height*32-viewport.height,0))
```

必须保持整数 camera。`640×480` 时严格退化为当前 `304/224` 公式。

### 6.3 Bounds 公式

```text
minTileX=max(0,floor(cameraX/32))
maxTileX=min(map.width-1,floor((cameraX+viewport.width-1)/32))
minTileY=max(0,floor(cameraY/32))
maxTileY=min(map.height-1,floor((cameraY+viewport.height-1)/32))
```

walking coverage 仍使用 source/target viewport bounds union，保证 camera 全程无空边。

---

## 7. 稠密 chunk 投影合同

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

`cells` 固定长度 192，index：

```text
index=((z*8+localY)*8)+localX
z order=0,1,2
localY=0..7
localX=0..7
```

地图边缘 chunk 超出 map 的 cell 固定为 `0`。非空值是原始 `tileId`；不把碰撞、event 或 animation state写入 chunk。

### 7.2 Exact package-private RenderData

```ts
type ProjectedChunk = Readonly<{
  chunkX: number;
  chunkY: number;
  cells: readonly number[]; // exact length 192
}>;

// depthBias === -1 表示 visual depth 0；否则 depth=tileY*32+depthBias
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
  viewportRevision: number;
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

`MapSpriteRenderData` 只新增：

```ts
viewportRevision: number;
```

不新增第二套 map domain、chunk Render node 或 `<lr-map-chunk>` tag。

### 7.3 `tileVisuals` 构造

每次 `loadMap()` 为当前 Tileset 构建并冻结一次 `tileVisuals`：

- index 等于 tileId；
- `0` 和不可渲染保留位为 `null`；
- regular tile 使用既有 `sourceIndex`；
- autotile 使用既有 `slot` 与已计算的四组 `sx/sy`；
- `priority===0` → `depthBias=-1`；
- `priority>0` → `depthBias=(priority+1)*32`。

Browser 只执行已投影的 blit/depth instruction，不读取 Tileset table、不决定 priority、不调用 `autotileCorners()`。

### 7.4 Chunk cache 与 scene identity

Runtime 每个 `LoadedMap` 维护一个 package-private lazy cache：

```text
(chunkX,chunkY) → frozen ProjectedChunk
```

cache 不进入 Save/authority，不跨 `LoadedMap` identity 复用。`sceneRevision` 每次成功 map load/transfer commit 增加；同一 revision 下同坐标 chunk 内容必须不可变。

Browser cache identity：

```text
sceneRevision + chunkX + chunkY
```

同 identity 再次出现时仍须验证 exact shape；cells 与第一次内容不一致则 fail closed，禁止用旧 raster 掩盖 identity 破坏。

### 7.5 Chunk window selection

从 source/target union tile bounds 得到 required chunk bounds，再各方向扩一 chunk并 clamp 到 map：

```text
requiredMinChunkX=floor(required.minTileX/8)
requiredMaxChunkX=floor(required.maxTileX/8)
requiredMinChunkY=floor(required.minTileY/8)
requiredMaxChunkY=floor(required.maxTileY/8)

window=min/max(required ± CHUNK_OVERSCAN, map chunk bounds)
```

只要 retained chunk window 包含新的 required chunk bounds，ordinary movement patch 不包含 `chunks`。越界时选择以上确定性窗口，不尝试 margin `[4,3,2,1]`，不按 payload 动态改变 overscan。

候选 viewport/window 构造后只在以下时机做一次 `JSON.stringify` byte guard：

- initial baseline；
- map transfer；
- accepted viewport resize；
- chunk window refresh。

ordinary camera/player update 禁止重复 stringify 稳定 `chunks/tileVisuals`。

---

## 8. Runtime publication

### 8.1 Ordinary movement

retained window 命中时，viewport update 精确只 set：

```ts
{
  cameraX,
  cameraY,
  cameraMotion,
}
```

player update继续 set当前位置、方向、pattern、motion；`viewportRevision` 未变化时不重复 set。

### 8.2 Chunk refresh

跨 chunk coverage boundary 时同一个 `domain.update()`：

```text
viewport set cameraX/cameraY/cameraMotion/chunks
player   set x/y/screenX/screenY/direction/pattern/motion
```

`tileVisuals`、resource refs、viewport size 和 revision 不变，不重复写入 patch。

### 8.3 Viewport commit

resize candidate 通过预算后，同一个 `domain.update()` 必须包含：

```text
viewport set viewportRevision/viewportWidth/viewportHeight/
             cameraX/cameraY/cameraMotion/chunks
player   set viewportRevision/screenX/screenY
```

若当前 step boundary 立即开始下一步，则同一 update 还包含新 player/camera motion；不得先发布一份 viewport、再发布一份 player 修正。

standing resize 的 `cameraMotion=null`，直接切换到新 authoritative camera。walking 中不修改已开始 motion；在 boundary 使用新 viewport 建立下一状态。

### 8.4 Budget rejection

candidate payload 超过 `196,608 B`：

1. 不修改 accepted viewport/revision/window；
2. 不调用 `domain.update/replace`；
3. 保留当前画面与输入功能；
4. qualification 记录 requested normalized size、bytes、mapId；
5. 后续较小的新 sample 仍可成功，不把 frame 标记 terminal failed。

initial/default viewport 或 map transfer 自身超预算仍按现有 activation/transfer failure 语义 fail closed，因为此时没有可保留的同 map accepted projection。

---

## 9. Browser world-space raster cache

### 9.1 三阶段职责

```text
validate/prepare
  → 校验 full RenderData
  → 同 scene 复用 decoded image 与 chunk analysis
  → 新 scene 至多一次 async resource prepare

raster
  → 为当前 projected world window 建立/更新 depth backing
  → window refresh 复制 overlap，只画 entering chunks
  → autotile tick 只重画 dirty cells

placement
  → 每个 camera rAF 计算 cameraX/Y
  → 只更新 depth canvas transform
```

`requestAnimationFrame` callback 禁止 `await`、Content request、image decode、chunk validation、full tile traversal 或 full canvas clear。

### 9.2 Depth backing

每个当前实际存在的 visual depth 最多一个 live canvas。canvas 使用该 depth 中当前 tile 的最小 world-pixel bounding rectangle，而不是一律分配整个 viewport：

```text
originX/min tile world x
originY/min tile world y
width/height = exact covered tile rectangle
backing scale = 1
zIndex = tileStackValue(depth)
```

camera placement：

```js
canvas.style.left = `${originX}px`;
canvas.style.top = `${originY}px`;
canvas.style.transform = `translate3d(${-cameraX}px, ${-cameraY}px, 0)`;
```

不得给包住所有 depth canvas 的共同 ancestor 设置 transform，因为 transform stacking context 会破坏 tile/player 的现有交错 z-index。

### 9.3 Window refresh overlap

同 scene refresh：

1. 校验新 chunks 并划分 retained/entering/leaving。
2. 为每个 depth 计算新最小 bounds。
3. 新建 detached backing；从旧 backing 只复制 world bounds overlap。
4. 只 raster entering chunk 的 draw instructions。
5. 按当前 autotile frame 修正 retained overlap 中已过期的 animated cells。
6. epoch/currentness 检查通过后一次替换 live layer 集合。
7. 删除 leaving chunk analysis 和不可见 layer；cache 上限就是当前 window，不建立无界 LRU。

新 scene、tile visual identity 或 resource identity 变化时不复制旧 pixels，完整重建。

### 9.4 Animated autotile dirty cells

prepare 为每个 animated slot 建立：

```text
slot → depth → world cell → ordered draw instructions for that cell/depth
```

frame tick：

- 所有 slot frame index 未变：不 raster；
- 某 slot 变化：收集该 slot cell；
- 对每个受影响 `(depth,cell)` clear `32×32`；
- 按原 canonical order 重画该 cell/depth 的全部 regular/autotile instructions，恢复同 cell 静态底图并画新动画帧；
- 不 clear 整层，不遍历无关 chunk。

多 slot 同一 tick 命中同 cell 时先去重，再重画一次。single-frame autotile 不保持永久 rAF。

### 9.5 Paint tokens

拆分两个 token：

```text
rasterToken    = sceneRevision + chunk window + tile visuals/resources + autotile frame vector
placementToken = viewportRevision + motion identity + integer cameraX/Y
```

placement 变化不得使 raster token 失效。autotile frame 变化不得重建 motion timeline。

### 9.6 Player raster/placement

```text
raster identity = sprite resource identity + direction + effective pattern
placement       = interpolated screenX/screenY + visual depth
```

- raster identity 未变：不得改 `canvas.width/height`、clear 或 drawImage；
- pattern 只在 half-step boundary 变化时重画一次；
- 每个 movement rAF 只更新 transform/left/top 与必要 z-index；
- 同 motion id redelivery 沿用 startedAt；
- viewport revision 改变时使用新 screen coordinates，但不重画相同 sprite crop。

---

## 10. Resize 的无空白提交

### 10.1 外层 host 与 accepted stage

`lr-map-view` 的 live host 与内部 stage 都使用 Runtime 发布的 `viewportWidth/Height`。当前 example 的 `640×480` page CSS 只是首份 RenderData 到达前的 fallback；成功 commit 后由 MapView 写入 inline `style.width/height`，其优先级明确覆盖 fallback。窗口超过支持上限时 host 保持最大 accepted size并由现有居中 body 留出 letterbox。

```text
host size     = latest committed Runtime viewport
accepted stage= latest committed Runtime viewport
```

不能在原始 DOM resize 到达时直接改 host 或 live canvas；只有同 revision 的投影 raster 已准备完成后才能一起 commit。resize settle 期间继续显示旧 accepted size，因此不需要同步第三份 page CSS/FSDB resource。

### 10.2 Commit 顺序

viewport revision 变化时：

1. validate new data；
2. prepare/reuse current scene resources；
3. 在 detached backing 中完成 chunk raster；
4. 检查 latest data、paint epoch、connected 与 revision；
5. 同步设置 host inline size与 accepted stage size；
6. 原子替换 layer backing；
7. 设置 MapView `_acceptedViewportRevision`；
8. placement 到新 camera；
9. 通知直属 `lr-map-sprite` 尝试提交同 revision pending data。

MapSprite 收到高于 parent accepted revision 的 data 时只保留 latest pending，不提前 paint；低于 parent revision 的 stale data丢弃；相等才 paint。该协调是两个 map-owned element 的 package-private实现，不导出 Web Presentation API，不创建通用 coordinator。

### 10.3 Failure

resize prepare/raster 失败：

- 保留上一 accepted stage 与 player；
- 不清空 live layers；
- 不提交新 viewport revision；
- 后续更新或 reconnect 可以从 latest RenderData 重试；
- 新 scene transfer 的现有 fail-closed 规则保持，不拿旧地图冒充新地图。

---

## 11. CSS 与大屏策略

### 11.1 Map package CSS

`game-libs/map/browser/map.css` 不再写死 host `640×480`：

```css
lr-map-view {
  display: block;
  position: relative;
  overflow: hidden;
  image-rendering: pixelated;
}
```

`lr-map-sprite` 规则保持 absolute/pixelated。

### 11.2 Essentials page CSS

`examples/essentials-v21.1-local/presentation.css` 不修改。现有规则继续提供首帧 fallback、居中与 clipping：

```text
body fills window and centers lr-map-view
lr-map-view fallback = 640×480
```

accepted viewport commit 后，MapView inline size 是唯一 live size。`1920×1080` cap 只属于 map Runtime policy，不复制到 page CSS 或 Desktop source。未来其他产品若需要不同 policy，另行评审 map input，而不是在 Browser 猜测。

### 11.3 DPR 规则

本轮不把 canvas backing 乘 `devicePixelRatio`。理由：

- RMXP 素材是 pixel art，逻辑像素放大由 compositor 完成；
- 1080p、DPR 2 下为所有 depth layer 建 2× backing 会令像素内存扩大 4 倍；
- DPR 不影响 camera、碰撞、可见 tile 或 logical viewport；
- 避免把 display physical fact往返 Runtime 后再返回同一 Browser。

未来若非像素 UI 需要独立 render scale，另写 presentation quality ADR，不复用本计划的 logical viewport revision。

---

## 12. 文件范围

### 12.1 Production 必改

```text
apps/desktop/src/renderer-input-source.ts
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
game-libs/map/browser/map.browser.js
game-libs/map/browser/map.css
```

FSDB 中以下两个 presentation 产物只能通过既有 sync script 从 build output 同步，不手工编辑：

```text
[resource]Presentation/map/map.browser.js.js
[resource]Presentation/map/map.css.css
```

### 12.2 Tests 必改

```text
apps/desktop/test/renderer-input-source.test.mjs
game-libs/map/test/semantics.test.mjs
game-libs/map/test/runtime.test.mjs
game-libs/map/test/package.test.mjs
test/map-layering-browser.test.mjs
test/m14-vertical.test.mjs
test/m15-hostra-product.test.mjs
```

允许新增一个 map browser performance helper，但必须复用生产 Custom Elements，不复制 raster 实现。

### 12.3 实施后文档同步

```text
M10_03_RENDERER_INPUT_PRODUCERS.md       # 记录 Desktop surface custom state realization
M14_02_MAP_GAME_LIBRARY.md               # 替换 fixed viewport 与 old RenderData
M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md
doc/30-implementation/m14-qualification.md
```

草案评审阶段不预先改写已冻结事实文档；实现与 qualification 完成后同一 PR 更新。

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
tools/fixtures/essentials-v21.1/import.mjs 及其 importer 实现
```

若实施必须触及上述路径，STOP 并提交证据；不得以“性能优化”为由顺手扩大 framework surface。

---

## 13. 实施顺序与提交边界

### PR 0：基线与防陈旧

只新增/修正 qualification instrumentation 与基线，不改变画面：

- 固定 Map066、Map002 tile/draw/layer/refresh 统计；
- 记录 ordinary/refresh P50/P95；
- 记录每 rAF 的 validation、tile traversal、drawImage、canvas resize 计数；
- source/dist/FSDB hash gate 全绿。

建议提交：

```text
test(map): freeze dynamic viewport performance baseline
```

### PR 1：固定 640×480 下完成 chunk+raster 闭环

按顺序：

1. `semantics.ts` 增加 tile visual table 与 8×8 chunk projector；保留旧 visible helpers直到本 PR tests 迁移完成。
2. Runtime RenderData 切换为 `tileVisuals+chunks`，viewport 默认仍固定 `640×480`。
3. Browser exact validation/analysis 迁移到新数据形状。
4. 实现 world-space depth backing、overlap copy、camera placement。
5. 实现 autotile dirty-cell raster。
6. 实现 sprite raster/placement 分离。
7. 证明 640×480 pixel output 与 layering baseline 相同。
8. 删除 production 中不再使用的逐 tile projection路径；测试 helper可保留用于 oracle，不导出新 root API。

本 PR 不改 Desktop source、不改 page CSS，先证明性能模型成立。

建议提交：

```text
refactor(map): project retained tile chunks
perf(map-browser): separate world raster from camera placement
perf(map-browser): redraw only changed autotile cells
perf(map-browser): separate sprite raster and placement
```

### PR 2：动态 viewport 端到端

按顺序：

1. Desktop source 增加 `x.loomrealm.viewport.state` 与 lifecycle tests。
2. Runtime listener interest 增加该 state channel。
3. `computeCamera/viewportTileBounds` 参数化并完成确定性向量测试。
4. Runtime 增加 accepted viewport、settle timer、revision 与 budget rejection。
5. RenderData 增加 viewport size/revision；viewport/player 一次 update。
6. Browser 增加 accepted stage 与 sprite revision gate。
7. MapView 在 revision commit 时原子更新 inline host/stage size；example page CSS 保持 fallback。
8. 同步 build output 与唯一 local FSDB presentation。

建议提交：

```text
feat(desktop): publish canonical viewport state
feat(map): project an accepted dynamic viewport
feat(map-browser): commit viewport revisions without blank frames
```

### PR 3：qualification 与规范回写

- 完成 §14 全矩阵；
- 三轮性能采样；
- 更新 M10/M14/M15 与 formal qualification；
- 删除仅用于调试且未被 gate 使用的 hook；
- 不在此 PR 添加新优化策略。

建议提交：

```text
test(map): qualify dynamic viewport and large-map rendering
docs(map): freeze dynamic viewport presentation contract
```

---

## 14. 测试矩阵

### 14.1 Desktop source

- start 时 state→availability 顺序；
- 同尺寸 resize 不重复 sample；
- 同一 rAF 多次 resize 只发 latest；
- 0 尺寸 unavailable，恢复时 fresh baseline；
- blur/focus、hidden/visible fresh baseline；
- stop 取消 pending rAF 且不再 emit；
- payload 只有 `width/height`；
- producer 无 map/tile policy。

### 14.2 Semantics

尺寸至少覆盖：

```text
320×240
640×480
800×600
960×540
1280×720
1920×1080
```

每个尺寸覆盖：

- 小于 viewport 的 map，camera 固定 0；
- 左上、中心、右下 camera clamp；
- 奇数 viewport 尺寸仍为整数 camera；
- non-tile-aligned bounds 的 inclusive `-1` 公式；
- source/target union 全覆盖；
- edge chunk zero padding；
- cells index/order 192 长度；
- tileVisuals regular/autotile/priority0..5；
- chunk order、overscan、map clamp；
- 同 loaded map chunk object identity memoized。

### 14.3 Runtime

- 无 viewport channel 时默认 640×480；
- 首份 sample 立即 commit；后续 100ms trailing settle；
- latest candidate wins；相同 size 无 revision；
- walking 中只在 boundary commit；
- viewport/player 同 update、同 revision；
- ordinary move retained-window update 不含 chunks/tileVisuals；
- 每跨 8 tile boundary 才 refresh chunks；
- map transfer 新 scene revision、旧 chunks 不复用；
- budget rejection 保留 accepted state；较小后续 candidate 可恢复；
- abort/cleanup 清 timer；late callback inert；
- collision、contact/edge/step transfer、reconnect 行为不变。

### 14.4 Browser correctness

- exact keys、revision、chunk shape、cells、visual table 非法时 fail closed；
- 同 chunk identity 内容变化 fail closed；
- 640×480 existing pixel oracle 相等；
- 每个 viewport 尺寸四边/四角无未绘制缝；
- priority0/1..5、tall sprite、equal-depth layering；
- camera source→target 每个 sample 与 player 同步；
- resize standing/walking/autotile active 时无 blank；
- rapid A→B→C resize 只提交 C；stale B 不覆盖；
- transfer prepare 与 resize 交错时旧 scene 不覆盖新 scene；
- reconnect 从 full baseline 重建；
- DPR `1/1.5/2` logical coverage 相同且 pixelated，无 4× backing 扩张。

### 14.5 Browser work invariants

通过测试 hook/counter 断言：

```text
120 个 camera placement samples
→ chunk validation 0（initial prepare 之后）
→ full tile traversal 0
→ tile drawImage 0（不跨 autotile frame 时）
→ canvas width/height assignment 0
→ layer placement > 0
```

autotile：

```text
frame unchanged → drawImage 0
one slot changes → only cells using that slot redraw
unrelated depth/layer raster count 0
```

chunk refresh：

```text
retained chunks → analysis/raster reused
entering chunks → raster once
leaving chunks → removed
cache size == current projected window
```

### 14.6 Product scenarios

真实 `[FSDB]Essentials v21.1`：

1. Map066 默认/800×600 resize；
2. Map066→Map002，camera-follow 区连续走 100 格或可达往返路径；
3. Map002 Flowers1 动画 + walking + resize 同时发生；
4. Map066↔Map067 transfer；
5. standing/walking 时最小化、恢复、失焦、重连；
6. 640×480→1280×720→1920×1080→640×480 快速切换；
7. 超过 1920×1080 的 window 正确 letterbox，Runtime cap 不变。

---

## 15. 性能与容量 Gates

### 15.1 采样协议

- release-like build，禁止 DevTools throttling；
- 记录 commit、Node/Electron/Chromium、CPU/GPU、DPR、viewport、map/position；
- cold resource load 与 warm movement 分开；
- 每档三轮，报告每轮与合并 P50/P95/max；
- ordinary 与 chunk refresh 分桶；
- autotile frame-change 与 unchanged frame 分桶；
- 不使用单次最佳结果。

### 15.2 必过指标

在当前 qualification 机器上：

| 指标 | 640×480 | 1280×720 | 1920×1080 |
|---|---:|---:|---:|
| ordinary movement publish→paint P95 | `≤50ms` | `≤50ms` | `≤50ms` |
| chunk refresh publish→paint P95 | `≤50ms` | `≤75ms` | `≤100ms` |
| active movement `>33.4ms` frame 比例 | `<1%` | `<1%` | `<2%` |
| complete visual step drop | `0` | `0` | `0` |
| camera-only tile drawImage/rAF | `0` | `0` | `0` |
| node data bytes | `<196,608` | `<196,608` | `<196,608` |

此外：

- Map002 640×480 refresh P95 必须把当前 `96.3ms` 降到 `≤50ms`；
- 1920×1080 dense synthetic fixture 必须通过 payload guard，不能只测稀疏 Map002；
- backing pixel 总数必须由测试报告；DPR 变化不得改变 backing pixel 总数；
- idle 且无 animated autotile 时无常驻 rAF。

若 1920×1080 dense fixture 无法满足 `196,608 B`，STOP。允许调整 package-private tuple 编码，但不允许提高 framework limit、删 validation、引入 Content chunk resource 或降低最大 viewport；编码调整后必须回到评审更新本文 exact shape。

---

## 16. 必须执行的命令

每个 production slice：

```bash
npm test -w @loomrealm-game/map
node --test apps/desktop/test/renderer-input-source.test.mjs
node --test test/map-layering-browser.test.mjs
node --test test/m14-vertical.test.mjs
```

修改 Desktop/source 或 product composition 后：

```bash
npm run build:m15
npm run test:m15:desktop
```

同步 local presentation 后：

```bash
node examples/essentials-v21.1-local/scripts/sync-map-presentation.mjs --check
npm run test:m15:hostra
```

合并前：

```bash
npm run test:m14
npm run test:m15
npm run docs:check-links
npm run docs:build
```

`sync-map-presentation.mjs` 当前 `parseArgs()` 已确认只接受空参数或 `--check`；上述命令不是占位符。

---

## 17. 风险、回滚与兼容性

### 17.1 Chunk 编码风险

风险：tuple 可读性下降或 cell index 写错。

控制：集中 helper、精确 ordering vector、旧逐 tile projector 作为测试 oracle。

回滚：PR 1 可整体回退到现有 `VisibleTile[]`，不影响 framework protocol。

### 17.2 Raster overlap 风险

风险：复制 overlap 后留下 leaving pixel 或动画旧帧。

控制：detached blank backing、world bounds intersection、entering raster、animated dirty correction、pixel oracle。

禁止在 live canvas 上先 clear 再异步准备。

### 17.3 Resize 与 motion 交错

风险：old motion geometry 与 new viewport camera 混合。

控制：active step 内只记录 pending；boundary 原子 commit；viewportRevision gate。

### 17.4 Payload 风险

风险：大屏 dense map 超过 node data limit。

控制：8×8 dense numeric cells、visual table去重、196KiB preflight、dense 1080p gate。

禁止通过提高通用限制掩盖。

### 17.5 Canvas memory 风险

风险：按 viewport×depth×DPR 分配导致显存/内存爆炸。

控制：depth最小 bounds、backing scale 1、current window bounded cache、报告 backing pixels。

### 17.6 Custom channel 风险

风险：Desktop 上层混入 map policy。

控制：source只发 raw positive CSS width/height；所有 cap/settle/chunk在 map package。

---

## 18. 明确拒绝的多余抽象与局部补丁

禁止：

- 只把 canvas 从 `640×480` 改为 `window.innerWidth/innerHeight`；
- camera rAF 继续全量重画，只靠更低步频或 throttle 掩盖；
- 每种 viewport 建一份预设常量或 switch；
- 把完整 `VisibleTile[]` limit提高到 1MiB；
- 为 chunk 建 RenderDomain child node 树或 `<lr-map-chunk>` Web Component；
- 新增 `resource.MapVisualChunk` 与 importer pipeline；
- 把 Map/Tileset record 暴露给 Browser；
- 在 Renderer/Data/Subsystem 增加 map-specific fast path；
- 用全局 `ViewportManager/RenderLoop/AnimationManager/SceneManager`；
- 为 resize 建 event command queue 或 ACK protocol；
- 无界保存历史 chunk raster；
- 以 `devicePixelRatio` 乘所有 layer backing；
- resize 时立即 clear/resize live canvas 后等待异步资源；
- 删除 `zIndex` patch 支持或把 map layering塞进 generic Renderer。

允许的新增内部概念只有：

```text
Desktop viewport state sample
AcceptedViewport
ProjectedChunk / TileVisual
map-owned chunk analysis + depth raster cache
viewport revision gate
```

五者分别对应跨进程事实、Runtime authority、紧凑投影、Browser派生缓存和原子提交，没有两个概念承担同一职责。

---

## 19. 完成定义

### Implementation Complete

- PR 1/2 production 与 unit/browser tests 全部落地；
- fixed `640/480/304/224/639/479` 不再散落在 production camera/paint 路径，只保留默认 policy 常量和测试向量；
- camera-only rAF 满足零 tile raster；
- chunk refresh 重用 overlap，autotile dirty-cell，sprite raster/placement 均有工作量断言；
- 320×240 至 1920×1080 functional matrix 全绿；
- 未修改 §12.4 framework/importer 路径。

### Product Closed

- §14.6 所有真实 FSDB 场景通过；
- §15 三轮指标通过并保存原始结果；
- Map002 当前可复现卡顿消失且不是以关闭 autotile/layering 获得；
- source/dist/FSDB presentation hash 一致；
- resize、transfer、reconnect 无 blank、ghost sprite、stale layer。

### Governance Closed

- M10/M14/M15 frozen docs 与 qualification 已回写；
- 本文状态更新为 `Implemented / Qualified` 或由正式文档取代并标明 superseded；
- 没有临时 public API、未使用 abstraction、TODO/TBD 或双轨旧实现；
- git diff 仅包含授权文件和明确生成产物。

---

## 20. Implementation Freeze Gate

Freeze 前必须逐项给出 `PASS/FAIL + 证据`：

### 20.1 文档静态 gate

- [ ] §16 `sync-map-presentation --check` 与当前 `parseArgs()` 仍一致；
- [ ] 全文不存在互相冲突的 viewport 最大值、chunk size、overscan、payload limit；
- [ ] exact RenderData tuple 与 tests 可一一对应；
- [ ] 没有“可选”“建议任选”“实现者决定”的 production 分支；
- [ ] 与 movement/autotile/layering drafts 的覆盖关系已确认。

### 20.2 外部门禁

- [ ] 当前基线 `npm test -w @loomrealm-game/map` 通过；
- [ ] 当前基线 `node --test test/map-layering-browser.test.mjs` 通过；
- [ ] 当前基线 `npm run test:m15:desktop` 通过；
- [ ] 当前 local FSDB/source/dist presentation 一致性已通过真实 check；
- [ ] Map002 ordinary/refresh/autotile 原始性能报告已归档。

### 20.3 架构 gate

- [ ] 评审确认 custom viewport state 是 physical fact，不是 map business authority；
- [ ] 评审确认 package-private chunk 比 Content resource/importer 改造更小且闭环；
- [ ] 评审确认 viewport/player revision gate 不形成通用 Browser coordinator；
- [ ] 评审确认 DPR 留在 compositor，不属于本轮 dynamic logical viewport。

### 20.4 Freeze 声明

以上全部 PASS 后，文档作者才可把头部改为：

```text
状态：Frozen for implementation
基线提交：<重新核对后的 SHA>
```

Freeze 后执行 agent 没有以下裁量权：

- 改 chunk size、overscan、viewport cap、settle 时间或 payload guard；
- 改 RenderData shape；
- 进入 framework/importer 范围；
- 用降画质、关动画、减少 layer 或放宽安全校验通过性能门禁。

遇到合同与代码不符、dense 1080p 超预算或必须修改禁止文件时，唯一正确行为是停止、记录最小复现和测量证据，返回设计评审。
