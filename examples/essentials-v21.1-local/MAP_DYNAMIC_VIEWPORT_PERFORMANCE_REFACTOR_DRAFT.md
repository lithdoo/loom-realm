# 地图动态视口与大屏呈现性能改造草案

> 状态：**Draft for review；Core architecture 已拆分，Map Freeze 仍受 PR0 证据阻塞**
>
> 日期：2026-09-16
>
> 生产代码基线：`3c10ae8`（其后的相关变更截至本文均为文档设计）
>
> 适用范围：`game-libs/map` Runtime/Browser presentation、Essentials local presentation；Core Viewport capability 只作为前置依赖引用
>
> 核心目标：使用独立于 Frame / Activation / InputTarget 的 `SubsystemScope.viewport` 支持动态逻辑视口，同时把地图移动、chunk refresh、autotile 与大屏 raster 的持续成本从 camera rAF 的全 tile 重画中移除。

本文是 map slice 的候选实施合同。Core viewport wire/profile/author API 不再由本文定义；对应 SSOT：

- `doc/decisions/0036-viewport-state-and-renderer-data-profile-v2.md`
- `doc/10-architecture/viewport-capability.md`
- `doc/15-contracts/viewport-state-v1.md`
- `doc/15-contracts/renderer-data-profile-v2.md`
- 对应两份 conformance 文档

如本文与上述 Core SSOT 冲突，以 Core SSOT 为准并停止实施，不允许在 map 层自行修协议。

本文继续覆盖：

- `M14_02_MAP_GAME_LIBRARY.md` 固定 `640×480` viewport 与旧逐 tile RenderData；
- `MAP_MOVEMENT_LATENCY_REFACTOR_DRAFT.md` 的 Browser static backing / camera-only frame / sprite raster-placement slice；movement cadence、turn buffer、collision、transfer trigger 仍由 movement 文档拥有；
- `MAP_AUTOTILE_ANIMATION_DESIGN_DRAFT.md` 的 async prepare + sync paint 方向，但以 dirty-cell repaint 取代整层 repaint；
- `MAP_LAYERING_DESIGN_DRAFT.md` 的 depth/equal-depth/z-index 规则保持不变；
- `RenderDomain.update()` / Render Patch/currentness沿用既有 Core，不在本文 reopen Render Update v1。

---

## 1. 已决定的整体数据流

```text
Renderer physical surface
  → Viewport State v1 / Renderer Data Profile v2       [Core SSOT]
  → SubsystemScope.viewport                            [Core SSOT]
  → Map Runtime accepted viewport                      [本文]
  → chunk-aligned current ProjectionWindow             [本文]
  → RenderDomain.update / replace                      [既有 Core]
  → Renderer Store / Web Projector                     [既有 Core]
  → lr-map-view / lr-map-sprite                        [本文]
  → world raster + placement-only camera rAF           [本文]
```

冻结候选原则：

1. Viewport 不是 User Input；map 不再声明 `x.loomrealm.viewport.state`。
2. Core提供 raw positive CSS logical size；map拥有 min/max、settle、camera、projection与 letterbox policy。
3. Runtime拥有 accepted viewport、camera target、current ProjectionWindow、map scene/visual epoch。
4. Browser拥有 decoded resources、current-window prepared representation、world raster、motion timeline与 private physical-realization cursor。
5. Browser/DOM不得反向写 Runtime/Store。
6. camera rAF只做 placement；tile raster不随 camera pixel移动重复执行。
7. current ProjectionWindow就是 Runtime bounded chunk cache；不建 LoadedMap-wide历史 cache。
8. refresh必须 overlap pixel reuse + entering-only raster；autotile必须 dirty-cell-only；sprite raster与placement分离。
9. 不新增 generic ViewportManager/ChunkManager/SceneManager/RenderLoop/Environment service locator。

---

## 2. 问题基线

当前 production 性能耦合：

```text
computeCamera / viewportTileBounds 固定 640×480
MapView CSS/canvas 固定 640×480
camera interpolation 每 rAF：clear + full projected tile traversal + drawImage
MapSprite movement 每 rAF：resize/clear/redraw crop
window refresh：重新投影/序列化/校验/分桶/full raster
autotile frame change：重画所有 depth layer
```

历史 Essentials 证据：

| 场景 | camera | projected tiles | depth layers | tile JSON约值 |
|---|---|---:|---:|---:|
| Map066 `(8,7)` | clamp `0,0` | 491 | 3 | 43,116 B |
| Map002 `(16,10)` | `208→240` | 753 | 6 | 66,875 B |

历史 qualification：

```text
ordinary update P95 = 42.9ms
refresh update  P95 = 96.3ms
refresh gate         = 50ms FAIL
```

这些数字必须在 §13 canonical measurement seam 下重测；旧 seam 若不同，只作为历史证据。

---

## 3. Map viewport policy

Core `scope.viewport.current` 语义由正式候选 contract拥有；map只消费它。

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

Map Frame启动：

```text
scope.viewport.current == null
→ acceptedViewport = DEFAULT_VIEWPORT

scope.viewport.current != null
→ normalize/clamp
→ initial candidate may commit immediately
```

Runtime只需：

```text
acceptedViewport
pendingViewport?      // latest normalized candidate
resizeTimer?
```

Normalization：positive safe integer raw size → clamp min/max。Core已经拒绝 malformed wire；map仍不能信任 arbitrary consumer-side object mutation，因此使用 detached local value。

Transition：

```text
first legal normalized sample different from accepted
→ tryCommitViewport immediately

later changed sample
→ pendingViewport = latest
→ reset 100ms trailing timer

timer fires while no movement step is in-flight
→ tryCommitViewport

timer fires during a movement step
→ keep pending only

movement step boundary
→ commit pending before next motion baseline
```

Map被 child Frame suspend / 失去 InputTarget 时，`scope.viewport`仍可通知。Viewport callback不依赖 Input Interest；若当前 map RenderDomain仍 live，standing 状态可按同一 settle/commit policy更新画面。

同 normalized size不 commit。Frame/runtime cleanup取消 timer/subscription；late callback inert。

---

## 4. Camera / visible bounds

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

公式：

```text
anchorX = floor((viewport.width  - 32) / 2)
anchorY = floor((viewport.height - 32) / 2)

cameraX = clamp(playerX*32-anchorX, 0, max(map.width*32 -viewport.width,  0))
cameraY = clamp(playerY*32-anchorY, 0, max(map.height*32-viewport.height, 0))

minTileX = max(0, floor(cameraX/32))
maxTileX = min(map.width-1,  floor((cameraX+viewport.width -1)/32))
minTileY = max(0, floor(cameraY/32))
maxTileY = min(map.height-1, floor((cameraY+viewport.height-1)/32))
```

`640×480`必须严格退化为当前 anchor `304/224` 与 inclusive bounds语义。Walking coverage使用 source/target viewport bounds union。

---

## 5. Dense projection contract

### 5.1 Constants / ordering

```ts
const TILE_SIZE = 32;
const CHUNK_TILES = 8;
const CHUNK_CELL_COUNT = 8 * 8 * 3; // 192
const CHUNK_OVERSCAN = 1;
const MAX_PROJECTED_DATA_BYTES = 196_608;
```

chunk coordinate：

```text
chunkX = floor(tileX/8)
chunkY = floor(tileY/8)
```

`chunks` canonical order：`chunkY` ascending，然后 `chunkX` ascending。

`cells` exact length 192：

```text
((z*8+localY)*8)+localX
z=0,1,2
```

地图外 cell `0`；非空值为原始 tileId。

### 5.2 RenderData

```ts
type ProjectedChunk = Readonly<{
  chunkX: number;
  chunkY: number;
  cells: readonly number[];
}>;

type TileVisual =
  | null
  | readonly [depthBias: number, kind: 0, sourceIndex: number]
  | readonly [
      depthBias: number, kind: 1, slot: number,
      tlSx: number, tlSy: number,
      trSx: number, trSy: number,
      blSx: number, blSy: number,
      brSx: number, brSy: number,
    ];

type MapViewRenderData = Readonly<{
  sceneEpoch: number;
  visualEpoch: number;
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

type MapSpriteRenderData = Readonly<{
  visualEpoch: number;
  // existing resource/world/screen/direction/pattern/motion fields
}>;
```

这里刻意使用 `Epoch` 而不是 `Revision`：Render Update v1 的 Domain revision已有严格协议含义。Map `sceneEpoch/visualEpoch`只是 business RenderData identity，不是 Store/domain/Main revision、ACK或 replay cursor。

Epoch scope：

```text
one live map Runtime instance
positive safe integer
monotonic within that instance
never wrap/reuse
```

不得读取 Main Session/generation来生成。

### 5.3 tileVisuals

每次 `loadMap()` 为当前 Tileset构造冻结一次：

```text
index = tileId
0 / reserved non-renderable → null
regular → sourceIndex
animated autotile → slot + precomputed four-corner source coordinates
priority 0 → depthBias = -1
priority >0 → depthBias = (priority+1)*32
```

Browser只执行投影后的 blit/depth instruction，不读取 Tileset record、不计算 priority/autotile semantics。

---

## 6. Current ProjectionWindow

Runtime不维护 LoadedMap-wide chunk history。

```text
new required window ∩ old window
→ reuse same frozen ProjectedChunk object

new - old
→ project entering chunk once

old - new
→ drop
```

内存 `O(current window)`；evicted chunk未来重新进入允许 reproject。

Window selection：source/target union tile bounds → required chunk bounds → each side `CHUNK_OVERSCAN=1` → map chunk bounds clamp。

如果 current window仍包含新的 required bounds，ordinary movement不更新 `chunks`。

Map-side explicit byte preflight只在：

```text
initial baseline
scene transfer
accepted viewport commit
chunk window refresh
```

ordinary retained-window movement不重复 map自己的 `JSON.stringify` guard。

---

## 7. Runtime publication / epochs

### 7.1 Epoch rules

```text
sceneEpoch
    only changes when a new map scene successfully becomes authoritative

visualEpoch
    changes when MapView/MapSprite must atomically switch visual backing:
    - chunk window refresh
    - accepted viewport change
    - successful scene transfer
```

ordinary retained-window movement不增加 epoch。

### 7.2 Ordinary movement

```text
MapView node:
    set cameraX/cameraY/cameraMotion

MapSprite node:
    set x/y/screenX/screenY/direction/pattern/motion
```

不重复 set `chunks/tileVisuals/resources/viewport size/epochs`。

### 7.3 Chunk refresh

```text
construct candidate window
→ reuse retained chunks
→ project entering chunks
→ payload preflight
→ visualEpoch += 1
→ one domain.update()
```

同一个 update：

```text
MapView   visualEpoch/camera/chunks/motion
MapSprite visualEpoch/player/motion
```

如果同 accepted viewport下 candidate超过 `196,608 B`：

```text
MUST NOT commit player/camera authoritative state with stale projection
MUST NOT shrink overscan ad hoc
MUST NOT call this Browser presentation failure
→ map-library projection capacity/invariant failure
→ resolve through existing map business/Frame failure path
```

### 7.4 Viewport commit

Candidate viewport必须先构造 camera + candidate ProjectionWindow + payload并通过 guard，然后：

```text
visualEpoch += 1
→ one domain.update()
```

```text
MapView:
  visualEpoch/viewportWidth/viewportHeight/camera/chunks
MapSprite:
  visualEpoch/screenX/screenY
```

失败：acceptedViewport/current window/epoch/Render state全部不变。后续较小 candidate仍可尝试。

### 7.5 Scene transfer

```text
construct complete new scene candidate using current acceptedViewport
→ content/resources/tileVisuals/window/camera/player all valid
→ sceneEpoch += 1
→ visualEpoch += 1
→ domain.replace(full scene)
```

新 scene不复用旧 pixels/prepared chunks/resource-derived raster。Pending viewport若另有变化，按合法 boundary独立 commit；不得把未验证 resize顺手塞入 scene replacement。

---

## 8. Browser world-space raster

固定三个阶段，不冻结 cache/helper class：

```text
validate/prepare
→ exact RenderData validation
→ reuse same-scene decoded resources
→ build/update current-window instructions + animated-cell index

raster
→ world-space depth backing
→ refresh copies overlap + rasters entering chunks only
→ autotile repaints dirty cells only

placement
→ camera rAF only moves existing depth canvases
```

rAF callback禁止：

```text
await / Content request / image decode
chunk validation
full tile traversal
full canvas clear
any tile drawImage when autotile frame unchanged
canvas width/height assignment
```

每个实际 visual depth最多一个 live canvas；canvas使用该 depth当前 tile的最小 world-pixel bounding rectangle，backing scale 1，zIndex沿既有 layering规则。

Placement：

```js
canvas.style.left = `${originX}px`;
canvas.style.top = `${originY}px`;
canvas.style.transform = `translate3d(${-cameraX}px, ${-cameraY}px, 0)`;
```

不得给全部 depth共同 ancestor加 transform而破坏 tile/player interleave stacking。

---

## 9. Refresh / autotile / sprite invariants

Same-scene window refresh：

1. validate new chunks；
2. diff retained/entering/leaving；
3. retained prepared instructions reuse；entering prepare一次；
4. build detached blank depth backings；
5. copy old world-bounds overlap；
6. raster entering chunks only；
7. 按 current autotile frame修正 overlap内 stale animated cells；
8. latest scene/visual/currentness checks；
9. replace live layers；
10. drop leaving prepared state。

仍 retained 的 `(sceneEpoch,chunkX,chunkY)` 若 content突变，fail closed。Evicted后重新进入重新 validate，不要求历史 fingerprint。

Animated autotile index：

```text
slot → depth → world cell → canonical ordered draw instructions
```

Frame tick只 clear/repaint changed slot影响的 `(depth,cell)` 32×32 region；同 tick cell去重。Single-frame autotile无 permanent rAF。

Sprite：

```text
same resource + direction + effective pattern
→ reuse sprite raster

position/depth change
→ placement only
→ MUST NOT resize/clear/redraw same crop
```

---

## 10. Atomic visual commit

`visualEpoch`只协调两个 map-owned Web Components的 physical realization。

MapView处理更高 `visualEpoch`：

```text
validate
→ prepare/decode
→ detached raster
→ latest data + sceneEpoch + visualEpoch + connected/currentness check
→ commit live layers/stage
→ acceptedVisualEpoch = visualEpoch   // private browser cursor
```

MapSprite：

```text
sprite.visualEpoch < parent accepted → stale/drop
sprite.visualEpoch > parent accepted → retain latest pending/do not paint
sprite.visualEpoch = parent accepted → paint/placement
```

`acceptedVisualEpoch`：

```text
private WC physical-realization cursor only
!= Renderer Store authority
!= Render Update revision
!= ACK
!= Runtime-observable state
```

MapView↔MapSprite private coordination不得 create/remove/reparent/reorder LoomRealm-managed light-DOM nodes，不得修改 managed attrs/data，不得建立 Window-global component registry，不得 reverse-sync Store。

Failure保留上一 accepted stage/layers/player，不先 clear live canvas。

**same-generation Data reconnect不是 UI retry trigger。** Structurally equal retained RenderData不会仅因 reconnect再次调用 receiver。Temporary resource/raster failure若要重试，只能由 WC对已经交付的 value做 Window-local private retry，或等待 structurally different data / fresh Window。

---

## 11. CSS / large-screen policy

`lr-map-view`不再写死 640×480：

```css
lr-map-view {
  display: block;
  position: relative;
  overflow: hidden;
  image-rendering: pixelated;
}
```

Essentials local presentation保留首帧 `640×480` fallback与居中。首份 accepted RenderData后，MapView按 accepted viewport同步 host/stage logical size。

超过 `1920×1080` 的 physical surface由 map cap保持最大 logical viewport，外部自然 letterbox。

DPR不进入 Runtime/RenderData，不把 canvas backing乘 DPR；DPR-only change不得改变 logical coverage或 backing pixel count。

---

## 12. Ownership / file scope

### Core Track（前置，本文不定义 semantics）

可能修改：

```text
packages/data/**
packages/renderer/**
packages/subsystem/**
packages/main/**     // only canonical profile selection/currentness policy
platform composition / apps/desktop viewport physical source
formal docs/conformance
```

只允许实现 ADR0036 / Viewport State v1 / Profile v2；不得加入 map-specific vocabulary。

### Map Track

```text
game-libs/map/src/semantics.ts
game-libs/map/src/runtime.ts
game-libs/map/browser/map.browser.js
game-libs/map/browser/map.css
examples/essentials-v21.1-local presentation/build-sync outputs as governed
```

测试覆盖 map semantics/runtime/browser/product harness。

### 禁止借 map 性能改造修改

```text
packages/wire/** payload model/limits
tools/fixtures/essentials-v21.1 importer semantics
Content contract
User Input v1
Render Update v1
Main Frame/Activation/InputTarget authority
```

若只有修改这些才能过 gate，STOP并返回证据。

---

## 13. Measurement / performance gates

### 13.1 Canonical latency seam

跨进程 `performance.now()` 不可直接相减。

Formal product latency：Hostra product harness单一 monotonic clock domain，从 stimulus dispatch到 Browser observation hook确认目标 presentation commit/paint。Browser/Runtime内部时间戳只能做同进程诊断。

Release-like build；记录 subject SHA、Node/Electron/Chromium、CPU/GPU、DPR、viewport、map/position。每档三轮，报告每轮与合并 P50/P95/max；ordinary/chunk refresh/autotile分桶。

### 13.2 Gates

| 指标 | 640×480 | 1280×720 | 1920×1080 |
|---|---:|---:|---:|
| ordinary movement stimulus→paint P95 | ≤50ms | ≤50ms | ≤50ms |
| chunk refresh stimulus→paint P95 | ≤50ms | ≤75ms | ≤100ms |
| active movement `>33.4ms` frame ratio | <1% | <1% | <2% |
| complete visual step drop | 0 | 0 | 0 |
| camera-only tile drawImage/rAF | 0 | 0 | 0 |
| map view node data bytes | <196,608 | <196,608 | <196,608 |

额外：

```text
Map002 640 refresh ≤50ms on canonical seam
dense synthetic 1080p fixture passes map payload guard
idle + no animated autotile → no permanent rAF
DPR change → backing pixel total unchanged
```

### 13.3 Core RenderDomain residual

`RenderDomain.update()`仍可能对最终完整 node data做 validation/snapshot representability probe，即使 ordinary patch很小。

PR0必须分别测 640/720p/1080p dense payload下：

```text
author update total
full-state validation
snapshot/patch representability probe
full node bytes
```

如果 Browser工作量 invariant已满足，但 Core residual单独导致 latency gate失败：

```text
STOP
archive profile/payload/latency evidence
return Core design review
```

不得在 map中跳过 validation、绕开 RenderDomain或提高 framework limit。

---

## 14. Test matrix

尺寸：`320×240 / 640×480 / 800×600 / 960×540 / 1280×720 / 1920×1080`。

必须覆盖：

- `scope.viewport` initial null/default、initial immediate commit、later trailing settle、latest pending、same-size no commit、suspended/non-InputTarget map仍可 resize；
- camera four-edge clamp、small map、odd viewport、inclusive `-1` bounds、source/target union；
- chunk edge padding/order/192-cell index、tileVisual regular/autotile/priority；
- retained chunk object reuse、entering once、leaving drop、evicted re-entry allowed reproject；
- ordinary retained movement不更新 chunks/epochs；
- chunk refresh increments `visualEpoch` once并同 update发布 View/Sprite；
- viewport commit atomic；budget reject preserves all prior business/render state；
- transfer increments `sceneEpoch + visualEpoch` and uses full replace；
- 640 pixel oracle、all viewport edge seamless、priority/equal-depth/tall sprite；
- rapid resize A→B→C only latest accepted visual state survives；
- transfer/resize/async prepare interleaving cannot let old scene overwrite new；
- reconnect rebuild Store/DOM baseline但不作为 WC retry trigger；
- camera placement samples：chunk validation 0、full traversal 0、tile drawImage 0、canvas resize 0；
- autotile only dirty cells/depth；
- refresh semantic retained projection 0 + overlap copy + entering raster once；
- real Essentials：Map066 resize、Map066→Map002 long camera path、Map002 Flowers1+walking+resize、Map066↔Map067 transfer、child menu/dialog while resize、minimize/reconnect、rapid 640→720p→1080p→640、over-cap letterbox。

---

## 15. Implementation / Freeze route

### Core Track C0 — 文档 closure（当前阶段）

必须完成：

```text
ADR0036 Accepted
Viewport architecture SSOT
Viewport State v1 contract + conformance
Renderer Data Profile v2 contract + conformance
Subsystem model / protocol-layer architecture aligned
```

然后做一次 cross-contract review，确认 v1 acceptance集合未变化、Main Control wire不需升级、profile selection/currentness无歧义。通过后 Core docs可标记 `Frozen for implementation`。

### Map Track PR0 — 只做证据，不改变画面 semantics

- canonical single-clock baseline；
- 640/720p/1080p exact dense RenderData bytes；
- `RenderDomain.update()` residual分解；
- current camera rAF validation/traversal/drawImage/canvas resize counters；
- source/dist/FSDB baseline hashes。

PR0结束后，如果 §13 payload/Core residual可满足 gates，本文才允许从 Draft改为 `Frozen for implementation`。

### Core implementation C1

按 Frozen Core contracts实现：

```text
Profile v2 peer/dispatch
Viewport State sender/receiver
SubsystemScope.viewport
Desktop physical source
Main canonical dataProfile=/2 policy
conformance + v1 regression
```

不得顺手实现 map/chunk逻辑。

### Map PR1 — fixed 640 performance model

在 640×480下先完成：dense chunks/tileVisuals、current ProjectionWindow reuse、world raster overlap copy、entering-only raster、dirty autotile、sprite raster/placement split，并证明 pixel/layering baseline相同与 640 refresh gate通过。

### Map PR2 — dynamic viewport

消费 Frozen `scope.viewport`，参数化 camera/bounds，加入 accepted/pending/100ms settle、`sceneEpoch/visualEpoch` publication、atomic Browser gate、dynamic CSS/stage size。

### PR3 — qualification / governance

完整 §14/§13 矩阵、三轮 metrics、M11/M13/M14/M15受影响 requalification、frozen docs回写、删除未被 gate使用的调试 hook。

---

## 16. Freeze Gate

### Core Freeze

- [ ] ADR0036 与 architecture/contract无 authority矛盾；
- [ ] Viewport State exact schema/direction/currentness/failure闭合；
- [ ] Profile v2 exact composition/direction/reader-writer/fresh-carrier/terminal闭合；
- [ ] canonical target policy固定 `/2`，无实现者自选 negotiation；
- [ ] v1 contract/acceptance集合明确保持不变；
- [ ] `SubsystemScope.viewport` exact API/lifetime/callback semantics闭合；
- [ ] no-carrier/fresh-carrier/fresh Renderer/Runtime terminal测试矩阵一一对应；
- [ ] Desktop/PWA author-visible CSS logical semantics平台无关。

### Map Freeze

- [ ] PR0 canonical seam可复现；
- [ ] dense 1080p exact `MapViewRenderData <196,608 B`；
- [ ] Core full-state residual已测且不会单独破 gate；
- [ ] chunk size 8、overscan 1、viewport min/max、settle 100ms、payload guard单一一致；
- [ ] movement/autotile/layering文档无双重 ownership；
- [ ] `sceneEpoch/visualEpoch` tests与 publication一一对应；
- [ ] Browser state只 bounded by current window；
- [ ] no reconnect-as-retry依赖；
- [ ] 当前 qualification blockers被单独治理，不借本 refactor顺手修改 importer/framework limit。

全部 PASS 后才把本文头部改为：

```text
状态：Frozen for implementation
生产基线：<当时重新核对的 production SHA>
证据：<PR0 subject SHA / raw artifacts>
```

---

## 17. 明确拒绝

```text
viewport as User Input / InputTarget bypass
Browser-local camera authority that removes Runtime projection correctness
permanent max-1080p projection envelope just to avoid Core capability
camera rAF full raster + throttle
full VisibleTile[] limit raise
chunk Render node / <lr-map-chunk>
LoadedMap-wide unbounded history cache
Browser reads Map/Tileset business records
generic Environment/Viewport/Chunk/Scene manager framework
map-specific Core fast path
cross-component ACK/event queue
DPR-scaled all-layer backing
clear live canvas before async prepare
same-generation reconnect as receiveRenderData retry
turn off autotile/layering/validation to pass performance
raise framework payload limits without independent Core review
```

当前允许的最小核心概念：

```text
Core: Viewport State v1 + Profile v2 + SubsystemScope.viewport
Map: accepted/pending ViewportSize
     ProjectedChunk + TileVisual
     current ProjectionWindow
     sceneEpoch + visualEpoch
Browser: current-window prepared state + world raster + private acceptedVisualEpoch
```

任何执行者若发现合同与生产代码不符、dense 1080p超预算、Core residual单独失败、或必须触碰明确禁止边界，唯一正确行为是停止并返回最小复现/测量证据。
