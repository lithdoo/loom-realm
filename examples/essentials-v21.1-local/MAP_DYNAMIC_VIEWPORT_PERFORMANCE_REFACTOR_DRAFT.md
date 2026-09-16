# 地图动态视口与大屏呈现性能改造草案

> 状态：**Draft for review / Map Freeze HOLD**（revised Core `/1` 未 Frozen/实现；PR0真实性能证据未取得）  
> 日期：2026-09-16；旧 executable baseline `3c10ae8` 仅历史，Map Freeze前重新核真实 SHA  
> 范围：`game-libs/map` Runtime/Browser presentation、Essentials local具体产品页面/验收；Core只消费已治理 contract  
> 目标：按真实业务接受的320×240..1920×1080 geometry动态投影，不依赖InputTarget；避免 movement/autotile/refresh在camera rAF做全量 tile work，证明性能/正确性而不虚报PASS。

**Core SSOT：** [ADR0037](../../doc/decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) · [Viewport architecture](../../doc/10-architecture/viewport-capability.md) · [Viewport State v1](../../doc/15-contracts/viewport-state-v1.md) · [revised Renderer Data Profile `/1`](../../doc/15-contracts/renderer-data-profile-v1.md) · [qualification ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)。原 `/2`仅 Superseded historical proposal，**不发布、不实现、不在当前设计里选择**。本文不重新定义任何 Core wire、profile、Frame authority、callback或物理 Web source。与现有 movement、transfer、autotile、walking animation、layering drafts交叉时，它们各自拥有具体语义；本文独占 viewport policy/projection/raster及其性能 gate。不得 reopen frozen Input/Render。

## 1. Dataflow and ownership

```text
Current product: physical document layout viewport (designated surface)
→ Core Viewport State v1 over corrected renderer-data/1, independent of InputTarget
→ Runtime-scoped readonly scope.viewport observation
→ Map accepted viewport + authoritative camera/current ProjectionWindow
→ existing RenderDomain.update/replace (no new Core map path)
→ Renderer Store + Web Projector
→ lr-map-view managed parent / lr-map-sprite managed child
→ map-owned detached rasters and synchronized private physical commit
```

Core只传一个 CSS logical surface的 raw size，**不**拥有地图窗口cap、min、settle、camera、tile、letterbox或 gameplay。Current Desktop/PWA physical composition选择 document layout viewport/`Window.innerWidth/innerHeight`，产品必须对照实际为 map分配的content box/居中/letterbox检验对应关系；不能从 Core observation直接推断 map WC box始终等于Window。Browser owns decoded resources, current-window raster, WC-local retry/motion；Main不存 width/height。禁止 `x.loomrealm.viewport.state` Input channel、Input bypass、Browser-local authoritative camera、permanent max-envelope、generic Environment/Chunk manager、framework Render fast path或 framework ACK。

## 2. Historical baseline / measured problem

旧实现 camera和MapView固定640×480；camera rAF每帧 full tile clear/traversal/drawImage，MapSprite每帧resize/clear/redraw；refresh全投影/序列化/prepare/raster，autotile常重画depth layers。历史 Map066 491 tiles/3 depths/约43116B，Map002 753 tiles/6 depths/约66875B；ordinary P95 42.9ms（≤50），refresh P95 96.3ms（>50 FAIL）。测量 seam不完全相同不得交叉当作新PASS。**正确获得尺寸不自动消除CPU/payload/Canvas成本。**

## 3. Consumer viewport policy / safe initialization

```ts
const DEFAULT_VIEWPORT = Object.freeze({ width: 640, height: 480 });
const MIN_WIDTH = 320, MIN_HEIGHT = 240;
const MAX_WIDTH = 1920, MAX_HEIGHT = 1080;
const RESIZE_SETTLE_MS = 100;
```

这些数字只属于 map，不属于 Core。Core提供 designated logical surface raw CSS integer；Map detach+clamp为accepted/pending size，初次读取 `scope.viewport.current ?? DEFAULT_VIEWPORT`，绝不把 fallback/null回写Core。第一份真实不同 size可在安全boundary立即尝试；后续 resize burst使用100ms trailing settle/latest-wins；normalized equal不 commit。Movement step in-flight只标记 pending，在下一 motion baseline前安全提交，不并发破坏当前 motion。低于min按 map policy clamp，高于max cap，当前 example页面负责居中/letterbox并验证实际 content box；DPR不进入 RenderData，不乘大所有 canvas backing。

**Sync subscribe初始化必须按顺序：** 读取 snapshot→load/validate content/world facts→建立初始 projection+RenderDomain+本地 committed state→建立 render/movement owners→subscribe；同步首发 equal no-op，read→subscribe间变化需接最新并收敛。不能在domain/current/window未初始化时重入commit，初始值不得重复投影。Frame/Runtime terminal取消subscription、resize timer与late async，旧promise不得提交。

## 4. Camera/bounds semantics

```ts
computeCamera(map, playerX, playerY, viewport = DEFAULT_VIEWPORT)
viewportTileBounds(map, cameraX, cameraY, viewport = DEFAULT_VIEWPORT)
```

```text
anchorX=floor((viewport.width-32)/2); anchorY=floor((viewport.height-32)/2)
cameraX=clamp(playerX*32-anchorX,0,max(map.width*32-viewport.width,0))
cameraY=clamp(playerY*32-anchorY,0,max(map.height*32-viewport.height,0))
minX=max(0,floor(cameraX/32)); maxX=min(map.width-1,floor((cameraX+viewport.width-1)/32))
minY=max(0,floor(cameraY/32)); maxY=min(map.height-1,floor((cameraY+viewport.height-1)/32))
```

640×480必须严格退化为旧304/224 anchor和inclusive tile bounds；四边、地图小于viewport、奇数尺寸、movement source/target插值所需coverage union均覆盖。Viewport不改变player world position/collision/transfers。

## 5. Dense current ProjectionWindow / exact Map RenderData

```ts
const TILE_SIZE=32, CHUNK_TILES=8, CHUNK_CELL_COUNT=8*8*3;
const CHUNK_OVERSCAN=1, MAX_PROJECTED_DATA_BYTES=196_608;
```

Chunk `(floor(tileX/8),floor(tileY/8))`按Y/X稳定排序；192 cells，index `((z*8+localY)*8)+localX`，z0..2，map外padding0。`tileVisuals[tileId]`从当前 Tileset冻结一次 canonical blit/depth instruction：nonrenderable/null、regular `[depthBias,0,sourceIndex]` 或 autotile `[depthBias,1,slot,tlSx,tlSy,trSx,trSy,blSx,blSy,brSx,brSy]`；priority0→depthBias=-1，priority>0→(priority+1)*32。Browser只使用预计算视觉指令，不重新解析 RMXP Tileset。map-dense shape属 package-private，**不能提升成 Core RenderNode或 Tile API**。

```ts
type ProjectedChunk=Readonly<{chunkX:number;chunkY:number;cells:readonly number[]}>;
type MapViewRenderData=Readonly<{
  sceneEpoch:number; visualEpoch:number;
  viewportWidth:number;viewportHeight:number;
  mapId:number;mapWidth:number;mapHeight:number;
  cameraX:number;cameraY:number;
  tileset:ResourceRef;autotiles:readonly (ResourceRef|null)[];
  tileVisuals:readonly TileVisual[];chunks:readonly ProjectedChunk[];
  cameraMotion:CameraMotion|null;
}>;
type MapSpriteRenderData=Readonly<{
  visualEpoch:number;
  // existing resource/world/screen/direction/pattern/motion fields
}>;
```

`sceneEpoch`只在成功scene transfer变化，`visualEpoch`在chunk refresh/accepted viewport/scene transfer变化，Runtime instance scoped positive safe monotonic、不可wrap/reuse。Ordinary movement/Browser retry/autotile rAF不增长，绝非 Render v1 revision、Main G或跨WC wire ACK。Camera source/target tile union→required chunks→1-chunk overscan→map clamp。唯一有界Runtime cache为当前ProjectionWindow；overlap保留同frozen chunk object，entering一次projection，leaving drop，reentry可重算。Coverage足够的ordinary move不更新 chunks；不得建立 map-wide history或无上限像素cache。

Full JSON guard只在initial/transfer/accepted resize/refresh测 exact UTF-8 map View node bytes；ordinary movement不在map侧重复 stringify。但 `RenderDomain.update`可能对完整最终state再验证，这笔 Core residual **必须真实测量**，不能借map优化绕过Frozen contract。

## 6. Candidate & authoritative commit

所有路径先构造 candidate world/camera/window/RenderData，验证 `196608 B` guard与Core accepted shape，再由现有同步 `domain.update/replace`承诺；成功后才推进 Map acceptedViewport、player/world/window/epoch。失败保留先前完整world+Render state，不可新player+旧projection，不能偷降低overscan、提高 Core limit或部分commit。`domain.update()`自身可能因full-state limit同步抛错，不能先修改Map authority再无处理。

```text
ordinary movement → one update(View cameraX/Y/motion + Sprite world/screen/pose/motion)
                    no chunks/visuals/viewport/epochs change
chunk refresh     → reuse+entering projection+guard, visualEpoch++, one update(View+Sprite same epoch)
accepted resize   → resized camera/window+guard, visualEpoch++, one update(View+Sprite same epoch)
scene transfer    → validate new scene/resource/window under accepted viewport,
                    sceneEpoch++/visualEpoch++, one full replace
```

Transfer不得复用旧scene pixels/resources；pending resize独立在安全boundary提交。容量溢出按既有Map business/Frame failed路径并留下证据，不冒充 Browser physical failure。

## 7. Gameplay vs geometry / consumer scope（原 MF-01 scope correction）

**通用 Core不变量**只是：接收Viewport observation不创建InputTarget/Activation/Frame mutation permit；业务逻辑不能由resize事件直接启动玩家移动、collision、transfer或Frame call。Map的viewport callback仅从已经提交的world facts重算呈现；Frame terminal/abort时取消timer/subscription/async。真实 gameplay是否在 child overlay下暂停、held-direction如何继续，是 **map movement/lifecycle consumer**独立需求，不能拿它定义Viewport contract。

当前 `examples/essentials-v21.1/game.json`只有map Subsystem，`MAP_BEHAVIOR_REQUIREMENTS.md`未把menu/dialog列为该slice验收条件。现有Map `finishStep`在heldDirection仍存在时可能自动chain `attempt()`，public Frame只有`id/params/signal/call`，InputListener没有suspend getter；这是真实**未来集成风险**，但**不是当前已经证明必须新增Core lifecycle API或阻塞当前只包含map的Viewport Docs Freeze的证据**。禁止猜测`frame.signal=suspend`、从Main/DOM偷读、Viewport bypass或牺牲movement cadence伪装修复。若正式接纳menu/overlay场景：先给出真实consumer/acceptance与hold→move→child InputTarget→timer deadline→no unauthorized new move/transfer→return/fresh input→continue trace；如现有seam不足，单独ADR审最小lifecycle能力，不能绑在Viewport/Profile修正上。当前Map Freeze只要求当前已接受场景与不从resize触发gameplay的测试；未来场景单独资格，不假称已PASS。

## 8. Browser current-window raster / camera rAF

Browser对current scene/window缓存decoded resource、tile instruction和animated-cell index；每visual depth最多一张live canvas，backing只按当前depth实际world pixel bounds分配、scale=1。保留priority/equal-depth/tall-sprite/interleaving；不能max-1080p预分配、对共同ancestor transform破坏混层。

```text
validate/prepare (async resource)
→ reuse retained instructions / prepare entering once
→ detached stage raster (copy retained overlap + draw entering)
→ only latest current epoch commit
→ camera rAF placement only, O(live layers)
```

rAF禁止await/content request/decode、full chunk revalidate、tile traversal/clear、unchanged autotile drawImage、canvas width/height assignment。Depth world origin用style left/top+`translate3d(-cameraX,-cameraY,0)`只修改business-private physical presentation，不改managed attrs/data/children/order。Refresh copy overlap/draw entering并修正animated-cell stale frame；leaving drop。Retained同`(sceneEpoch,chunkX,chunkY)`内容变化fail closed；evicted重入可重验证。Autotile `slot→depth→cell→ordered instructions`，只在changed slots做dirty32×32 repaint/tick dedupe，idle无permanent rAF。Sprite相同 resource/direction/pattern复用crop raster，position/depth change只placement，不重复resize/clear。

Ordinary `receiveRenderData()`虽字段不变仍需测CPU：不得每次 full chunks/tileVisuals revalidation、redecode/raster；以scene/epoch+已验证current-window identity判断不变项。但Core `RenderDomain.update()` full final-state validation residual仍存在且单独测。WC prepare/resource失败由WC私有bounded retry已收到的data，same G reconnect的structurally-equal data**不是**重试通知。

## 9. Map-owned View/Sprite one-paint stage（原 MF-02）

同一次domain.update/replace只保证业务authoritative Render commit一致，**不保证两个WC的async prepare与paint自动原子**。必须仅在 `game-libs/map` package-private parent/child coordination完成一个完整old-stage→new-stage的同步JS task switch；不创建Framework ACK/revision join或Window-global registry。

```text
MapView new (sceneEpoch,visualEpoch): detached depth raster ready
MapSprite matching visualEpoch: detached crop/pose ready
Either arrives first → pending only, retain previous full View+Sprite stage
Both current, connected, matching latest desired epoch/scene/motion:
  one synchronous JS task, no await/rAF boundary:
  swap private map stage + logical clipping dimensions
  → synchronously invoke child-owned private sprite stage commit
  → parent acceptedVisualEpoch advances
  → enable placement/motion for that accepted stage
```

初次未ready全stage不显示；不能出现新尺寸地图+旧screen sprite或反之。只读LoomRealm-managed parent/child关系；parent只改自己的ShadowDOM/Canvas，child只改自己的；不改managed light DOM、attrs/data/children/order。新epoch/scene或fresh generation插队→abort旧detached work，旧stage保持直到最新共同ready；old async/terminal/disconnect后 inert。Prepare失败保留旧stage、同已收data做private bounded retry与latest check。Fresh Session/G新element universe不跨identity复用stage。Ordinary movement epoch不变时，parent/child共享同一movement id与Browser monotonic time sample以同步camera/sprite pose，rAF仅placement。测试parent-first、child-first、async fail、rapid A→B→C、transfer、disconnect/reconnect、recorded frame/screenshot无mixed stage；设计已给出但PR2真实证据尚未取得。

## 10. Example CSS / physical allocation

`lr-map-view`业务host使用`display:block;position:relative;overflow:hidden;image-rendering:pixelated`，默认640×480 fallback；共同visual stage commit才更新logical width/height。Example页面 owns centering/max-cap letterbox；**必须验证被实际分配的content box与Renderer所指定layout viewport的关系**，不要把`window.innerWidth`直接当WC width。DPR-only不改logical Runtime/RenderData，不将所有Canvas backing乘DPR。Core source自己bounded latest，map 100ms settle不能代替Core sender backpressure。

## 11. Package boundary

Core Track若经Docs Freeze只更改 `packages/data/renderer/subsystem/main`、trusted physical Desktop/PWA source/必要的port typings，且完全不加map vocabulary。Map Track限制`game-libs/map/src/{semantics,runtime}.ts`、`game-libs/map/browser/{map.browser.js,map.css}`、Essentials example page/CSS、受治理generated outputs和target tests。禁止改`packages/wire` limits、Content、importer、Frozen Input v1/Render v1/Main InputTarget authority。新Frame lifecycle只有真实已接受consumer缺口与独立review才可考虑。

## 12. Canonical PR0 measurement / gates

正式 product stimulus→paint只用Hostra product harness**单一monotonic clock**；跨进程 `performance.now()` 不可相减。记录 release-like build SHA、Node/Electron/Chromium/CPU/GPU/DPR/map/position/viewport；每档三轮各轮及合并P50/P95/max，ordinary/refresh/autotile分桶，Browser/Runtime clock只在同进程诊断。

| Gate | 640×480 | 1280×720 | 1920×1080 |
|---|---:|---:|---:|
| ordinary stimulus→paint P95 | ≤50ms | ≤50ms | ≤50ms |
| refresh stimulus→paint P95 | ≤50ms | ≤75ms | ≤100ms |
| active movement frame >33.4ms | <1% | <1% | <2% |
| complete visual step dropped | 0 | 0 | 0 |
| camera-only tile drawImage / rAF | 0 | 0 | 0 |
| exact MapView node serialized bytes | <196608 | <196608 | <196608 |

附加：Map002 640 refresh≤50ms、dense1080 guard真实PASS、idle no-autotile no permanent rAF、DPR-only backing count不变。以dense real tileVisuals+chunks测 exact UTF-8 View node bytes，不用粗估192 cells当PASS。拆分`RenderDomain.update` author total/full-state validation/snapshot probe residual、wire/Store、Browser ordinary `receiveRenderData` unchanged-payload work、chunk refresh/overlap/entering raster、Canvas allocations/peak depth memory、resize burst→final visual commit。历史96.3ms refresh为FAIL。Payload超guard→Map representation review；Core residual独立破gate→单独Core design review；Browser仍full raster→修Browser；禁止牺牲语义、关autotile、提高limits或跳validation造假通过。

## 13. Test matrix / freeze route

Sizes：320×240、640×480、800×600、960×540、1280×720、1920×1080；initial null/default/sync subscription、latest resize/no-op、movement-boundary commit、terminal/old callback。Camera four edges/small map/odd/inclusive bounds/source-target union；192-cell chunk padding/order、regular/autotile/priority、overlap reuse/entering once/eviction；movement无chunk/epoch，refresh/viewport同 update，transfer full replace，guard fail保留所有前状态。

Browser：640 pixel oracle、edges/no seams、priority/equal-depth/tall sprite、dirty autotile、camera rAF zero tile draw/resize、retained overlap、parent/child arrive in both orders、async failure/private retry、scene/resize crossing、same G reconnect equal data no callback、fresh G no old stage、DPR invariance。Real Essentials：Map066 resize、Map066→Map002 long camera、Map002 Flowers1+walk+resize、Map066↔Map067 transfer、640→720→1080→640、minimize/reconnect、overcap letterbox与CSS actual allocation。**Menu/dialog+held input**作为未来需求独立qualification，不在尚未存在该consumer时强行升格为当前Core或Map Freeze必选项。

```text
Core C0: ADR0037 compatibility assessment + corrected /1 + Viewport v1
         + author/conformance cross-review → Docs Freeze SHA
Core C1: one-profile /1 data/renderer/subsystem/main/Desktop implementation
         → original v1 regression + revised v1 revision3 + viewport qualification SHA
Map PR0: exact 1080 payload/Core residual/Browser costs/memory/single-clock latency
         + current accepted gameplay test boundary
         → Map Docs Freeze subject
Map PR1: fixed640 chunk/raster/sprite optimization
Map PR2: dynamic viewport/epochs/private View+Sprite stage
Map PR3: affected M11/M13/M14/M15 requalification on governed executable subject
```

PR0可与Core实现并行准备数据，但dynamic product implementation不得先于已治理Core contract与可用subject。Map Freeze gate：PR0数字与residual满足、当前scope的geometry与Render/Canvas行为可实现并可测、MF-02 stage规范/测试、参数和movement/autotile/layering一致、no reconnect-as-retry、真实 production baseline SHA复核；未满足仍Draft/HOLD。**Core Docs Freeze不等于Map PASS；未来菜单功能另行立消费者证据与资格，不能预先上移到Framework。**