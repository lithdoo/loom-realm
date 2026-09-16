# 地图动态视口与大屏呈现性能改造草案

> 状态：**Draft for review / Map Freeze HOLD**（revised Core `/1` 未 Frozen/实现；PR0真实性能证据未取得）  
> 日期：2026-09-16；旧 executable baseline `3c10ae8`仅历史，Map Freeze前重新核真实 SHA  
> 范围：`game-libs/map` Runtime/Browser presentation、Essentials local具体产品页面/验收；Core只消费已治理 contract  
> 目标：按真实业务接受的320×240..1920×1080 geometry动态投影，不依赖InputTarget；避免movement/autotile/refresh在camera rAF做全量tile work，证明性能/正确性而不虚报PASS。

**Core SSOT：** [ADR0037](../../doc/decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) · [Viewport architecture](../../doc/10-architecture/viewport-capability.md) · [Viewport State v1](../../doc/15-contracts/viewport-state-v1.md) · [revised Renderer Data Profile `/1`](../../doc/15-contracts/renderer-data-profile-v1.md) · [qualification ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)。旧 `/2`仅Superseded historical proposal，**不发布、不实现、不在当前设计里选择**。本文不重新定义Core wire、profile、Frame authority、callback或物理Web source。与movement、transfer、autotile、walking animation、layering drafts交叉时，它们各自拥有具体业务语义；本文独占viewport policy/projection/raster及其性能gate；本文§9与[map-private motion closure](./MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)共同限定物理成对提交，后者是本Map候选的精确细节，不是第二份Core规范。不得reopen Frozen Input/Render。

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

Core只传一个CSS logical surface的raw size，**不**拥有地图窗口cap、min、settle、camera、tile、letterbox或gameplay。Current Desktop/PWA physical composition选择document layout viewport/`Window.innerWidth/innerHeight`，产品必须对照实际map content box/居中/letterbox检验对应关系；Core observation不证明WC box等于Window。Browser owns decoded resources、current-window raster、WC-local retry/motion；Main不存width/height。禁止`x.loomrealm.viewport.state` Input、Input bypass、Browser-local authoritative camera、permanent max-envelope、generic Environment/Chunk manager、framework Render fast path/ACK。

## 2. Historical baseline / measured problem

旧实现camera和MapView固定640×480；camera rAF每帧full tile clear/traversal/drawImage，MapSprite每帧resize/clear/redraw；refresh全投影/序列化/prepare/raster，autotile常重画depth layers。历史Map066 491 tiles/3 depths/约43116B，Map002 753 tiles/6 depths/约66875B；ordinary P95 42.9ms（≤50），refresh P95 96.3ms（>50 FAIL）。测量seam不完全相同不得交叉当新PASS。**正确取得尺寸不自动消除CPU/payload/Canvas成本。**

## 3. Consumer viewport policy / safe initialization

```ts
const DEFAULT_VIEWPORT = Object.freeze({ width: 640, height: 480 });
const MIN_WIDTH = 320, MIN_HEIGHT = 240;
const MAX_WIDTH = 1920, MAX_HEIGHT = 1080;
const RESIZE_SETTLE_MS = 100;
```

这些数只属于map，不属于Core。Core提供指定logical surface raw CSS integer；Map detach+clamp为accepted/pending size，初次读取`scope.viewport.current ?? DEFAULT_VIEWPORT`，不把fallback/null写回Core。第一份真实不同size可在安全boundary立即尝试；后续resize burst使用100ms trailing settle/latest-wins；normalized equal不commit。Movement step in-flight仅标记pending，在下一motion baseline前安全提交；若旧motion已开始显示，切换窗口必须依§9从旧已显示pose连续重基准，不得直接瞬移。小于min clamp、大于max cap；example负责居中/letterbox并验证actual content box；DPR不进RenderData，不乘大所有Canvas backing。

**Sync subscribe初始化顺序：** snapshot→load/validate content/world facts→初始projection+RenderDomain+local committed state→render/movement owners→subscribe；同步首发equal no-op，read→subscribe间变化接latest并收敛。domain/current/window未初始化前不可重入commit；初始值不重复投影。Frame/Runtime terminal取消subscription/resize timer/late async，旧promise不能commit。

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

640×480严格退化为旧304/224 anchor和inclusive tile bounds；四边、小地图、奇数尺寸、movement source/target插值coverage union均覆盖。Viewport不改变player world position/collision/transfers。

## 5. Dense current ProjectionWindow / exact Map RenderData

```ts
const TILE_SIZE=32, CHUNK_TILES=8, CHUNK_CELL_COUNT=8*8*3;
const CHUNK_OVERSCAN=1, MAX_PROJECTED_DATA_BYTES=196_608;
```

Chunk`(floor(tileX/8),floor(tileY/8))`按Y/X排序；192 cells，index`((z*8+localY)*8)+localX`，z0..2，map外padding0。`tileVisuals[tileId]`从Tileset冻结一次canonical blit/depth：nonrenderable/null、regular`[depthBias,0,sourceIndex]`或autotile`[depthBias,1,slot,tlSx,tlSy,trSx,trSy,blSx,blSy,brSx,brSy]`；priority0→depthBias=-1，priority>0→(priority+1)*32。Browser只消费预计算视觉指令，不重解RMXP Tileset。map-dense shape为package-private，不升Core RenderNode/Tile API。

```ts
type ProjectedChunk=Readonly<{chunkX:number;chunkY:number;cells:readonly number[]}>;
type MapViewRenderData=Readonly<{
  sceneEpoch:number; visualEpoch:number; motionId:number|null;
  viewportWidth:number;viewportHeight:number;
  mapId:number;mapWidth:number;mapHeight:number;
  cameraX:number;cameraY:number;
  tileset:ResourceRef;autotiles:readonly (ResourceRef|null)[];
  tileVisuals:readonly TileVisual[];chunks:readonly ProjectedChunk[];
  cameraMotion:CameraMotion|null;
}>;
type MapSpriteRenderData=Readonly<{
  sceneEpoch:number; visualEpoch:number; motionId:number|null;
  // existing resource/world/screen/direction/pattern/motion fields
}>;
```

`sceneEpoch`只在成功scene transfer增长；`visualEpoch`在chunk refresh/accepted viewport/scene transfer增长；二者Runtime-instance scoped positive safe monotonic、不可wrap/reuse。**`motionId`在每个成功accept的新movement step分配Runtime-instance-scoped唯一positive safe整数，并在一次成功`domain.update`的View/Sprite两份map-private data中完全相等；initial/no active movement为null。** Camera被边界clamp时仍要给View新motionId，使两个WC获得同step matching callback。Ordinary movement、Browser retry、autotile rAF不增长visualEpoch，motionId不是Render revision/Main G或跨WC ACK。`sceneEpoch`也必须在Sprite里以防跨scene同数值误配。motionId的分配和提交遵§6，不可在failed candidate中消耗可见identity或误作为成功step。

Camera source/target tile union→required chunks→1-chunk overscan→map clamp。唯一有界Runtime cache是当前ProjectionWindow；overlap保留同frozen chunk object，entering仅投影一次，leaving drop、reentry可重算。Coverage足够的ordinary move不更新chunks，不建map-wide history/无限像素cache。

Full JSON guard仅initial/transfer/accepted resize/refresh测exact UTF-8 MapView node bytes；ordinary movement map侧不重复stringify。`RenderDomain.update`仍可能验证完整最终state，Core residual**必须实测**。新增motionId字段也计入dense payload及ordinary update CPU，不得因增加配对字段跳过测量。

## 6. Candidate & authoritative commit

所有路径先构造candidate world/camera/window/RenderData，验证`196608 B` guard与Core accepted shape，再由同步`domain.update/replace`commit；成功后才推进Map acceptedViewport、player/world/window/epoch/**motionId cursor**。失败保留先前完整world+Render state，不可新player+旧projection、不能偷偷降低overscan/提高Core limit/部分commit。`domain.update()`的完整state limit也可能同步抛错，不能先动authority。`motionId`分配可在candidate计算时暂定，但只有成功Domain提交后才成为可见accepted ID；不回绕/重用历史已提交ID。

```text
ordinary movement → candidate新motionId → one update(View+Sprite same scene/visual/motionId)
                    View cameraX/Y/motion + Sprite world/screen/pose/motion
                    even when camera clamped, View motionId changes; no chunk/visuals/viewport/epochs change
chunk refresh     → reuse+entering projection+guard, visualEpoch++, one update(View+Sprite same epoch)
accepted resize   → resized camera/window+guard, visualEpoch++, one update(View+Sprite same epoch)
scene transfer    → new scene/resource/window validated under accepted viewport,
                    sceneEpoch++/visualEpoch++, motionId=null, one full replace
```

Standing/facing/blocked更新不是新的movement：仅当上一个已接受View/Camera**确实静止、没有active或pending pair**且没有camera/scene/viewport改变，Sprite可以独立提交静态pose；若相机仍在上一段motion、即使View data未变化，也要等已接受motion completion boundary后再切standing。Standing触发camera correction时走同一成对stage。Map必须按[private motion closure](./MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)处理已有motion与新viewport的连续rebase；同一step无论View-first/Sprite-first都不可单边启动动画。

Transfer不得复用旧scene pixels/resources；pending resize在独立安全boundary提交。容量溢出按已有Map business/Frame failed路径留下证据，不伪装Browser physical failure。

## 7. Gameplay vs geometry / consumer scope（原 MF-01 scope correction）

**Core通用不变量**：Viewport observation不创建InputTarget/Activation/Frame mutation permit；resize callback不能启动玩家移动、collision、transfer或Frame call。Map仅从已提交world facts重算presentation，Frame terminal/abort取消timer/subscription/async。child overlay下游戏是否暂停/held direction如何恢复属于movement/lifecycle consumer独立需求，不能定义Viewport contract。

当前`examples/essentials-v21.1/game.json`仅map Subsystem，`MAP_BEHAVIOR_REQUIREMENTS.md`没有把menu/dialog列为该slice验收。Map `finishStep`可能在heldDirection存在时自动chain`attempt()`，public Frame仅`id/params/signal/call`，InputListener无suspend getter：属于真实未来集成风险，**不自动成为当前Viewport Core Freeze blocker**。不得猜`frame.signal=suspend`、偷读Main/DOM或借Viewport bypass。将来接纳menu/overlay须先有真实consumer acceptance及hold→move→child InputTarget→timer deadline→no unauthorized move/transfer→return/fresh input→continue trace；existing seam不足再独立ADR评最小lifecycle author capability。当前Map Freeze仅检当前已接受场景及resize不触发gameplay，未来场景独立资格。

## 8. Browser current-window raster / camera rAF

Browser按current scene/window缓存decoded resource、tile instruction、animated-cell index；每visual depth最多一张live canvas，backing仅按当前depth world pixel bounds分配、scale=1。保持priority/equal-depth/tall-sprite/interleaving；禁止预分配max1080p或共同ancestor transform破坏混层。

```text
validate/prepare (async resource)
→ reuse retained instructions / prepare entering once
→ detached stage raster (copy retained overlap + draw entering)
→ only latest current epoch commit
→ camera rAF placement only, O(live layers)
```

rAF不await/content request/decode、full chunk revalidate、tile traversal/clear、unchanged autotile drawImage或canvas width/height赋值。Depth world origin用style left/top+`translate3d(-cameraX,-cameraY,0)`只改private physical presentation，不动managed attrs/data/children/order。Refresh copy overlap/draw entering并更新animated-cell stale frame；leaving drop。同`(sceneEpoch,chunkX,chunkY)` retained内容变化fail closed；evicted reentry可重验证。Autotile按`slot→depth→cell→ordered instructions`，仅changed slots dirty32×32 repaint/tick dedupe，idle no permanent rAF。Sprite同resource/direction/pattern复用crop raster，position/depth只placement，不重复resize/clear。

Ordinary`receiveRenderData()`即使chunk/visual数据不变仍需测CPU：不能每次full chunks/tileVisuals revalidate/redecode/raster；以scene/visualEpoch+已验证window identity判断不变项，**motionId变化只准备motion/placement，不触发chunk/raster重建**。Core`RenderDomain.update()`full final-state validation residual单独测。WC resource/prepare failure由WC本地bounded retry已交付data，same G reconnect structurally-equal data不是UI retry通知。

## 9. Map-owned View/Sprite one-paint + motion stage（原 MF-02）

一次Domain update/replace只保证业务authoritative Render commit一致，不保证两WC async prepare/paint原子。由`game-libs/map` package-private parent/child coordination完成old complete stage→new complete stage一个同步JS task，不加Framework ACK/revision join/Window-global registry。精确phase、late-source与standing条件由同目录[Map private motion closure](./MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md) owns；此处固定其不可缺少的联接事实：

```text
MapView candidate  (component identity, sceneEpoch, visualEpoch, motionId|null)
MapSprite candidate(component identity, sceneEpoch, visualEpoch, motionId|null)
Either callback first → pending only; keep old complete pair, no unilateral motion
Both current/connected/prepared/matching latest desired:
  one synchronous task without await or rAF split
  → parent own detached View/clip private commit
  → invoke child-owned Sprite private commit
  → accepted complete pair advances
  → next shared Browser frame timestamp starts camera+sprite interpolation together
```

Initial not-ready→whole stage hidden；不显示新尺寸地图+旧Sprite或反之。仅只读managed parent/child关系；parent只改自己ShadowDOM/Canvas，child只改自己；不改managed DOM/attrs/data/order。Fresh epoch/scene/G/Session/terminal/disconnect令旧candidate/queued rAF/async inert；prepare失败保留旧pair并对已交付latest data private bounded retry，equal reconnect不触发重送。Ordinary movement epoch不变，但通过**双方明确的motionId**配对；即使camera静止，View也收到新ID。仅§6静止条件下standing/blocked facing可以Sprite-only，camera仍运动时等completion boundary。中途resize使用上一个实际已显示camera+sprite screen pose作共同rebase；若当前motion shape做不到连续过渡，必须报告Map设计缺口，不靠跳帧掩盖。Scene transfer不得沿用旧scene pixels；fresh element universe不沿用旧stage。

测试View-first、Sprite-first、static camera、camera仍运动收到standing、async failure/local retry、rapid step A→B、resize during motion、transfer、disconnect/reconnect及真实截图/trace零mixed stage。**motion closure为候选、PR2测试未运行；单独文档修正不等于实现闭环或性能PASS。**

## 10. Example CSS / physical allocation

`lr-map-view`业务host用`display:block;position:relative;overflow:hidden;image-rendering:pixelated`，默认640×480 fallback；共同visual stage commit才更改logical width/height。Example页面owns centering/max-cap letterbox；必须测试真正分配给map的content box与Renderer指定layout viewport关系，不能直接认定`window.innerWidth == WC width`。DPR-only不改Runtime logical RenderData，也不将所有Canvas backing乘DPR。Core sender本身bounded latest，map100ms settle不能替代它。

## 11. Package boundary

Core Track经Docs Freeze只改`packages/data/renderer/subsystem/main`、trusted Desktop/PWA physical source/必要port typings，不加入map vocabulary。Map Track仅`game-libs/map/src/{semantics,runtime}.ts`、`game-libs/map/browser/{map.browser.js,map.css}`、Essentials example CSS/page、受治理generated outputs及target tests。禁止改`packages/wire` limits、Content、importer、Frozen Input/Render、Main InputTarget authority。新Frame lifecycle须真实consumer缺口和独立review。

## 12. Canonical PR0 measurement / gates

正式product stimulus→paint仅用Hostra product harness**单一monotonic clock**，不能跨进程减`performance.now()`。记录release-like SHA、Node/Electron/Chromium/CPU/GPU/DPR/map/position/viewport；每档三轮的各轮和合并P50/P95/max，ordinary/refresh/autotile分桶，Browser/Runtime clock只作同进程诊断。

| Gate | 640×480 | 1280×720 | 1920×1080 |
|---|---:|---:|---:|
| ordinary stimulus→paint P95 | ≤50ms | ≤50ms | ≤50ms |
| refresh stimulus→paint P95 | ≤50ms | ≤75ms | ≤100ms |
| active movement frame >33.4ms | <1% | <1% | <2% |
| complete visual step dropped | 0 | 0 | 0 |
| camera-only tile drawImage / rAF | 0 | 0 | 0 |
| exact MapView node serialized bytes | <196608 | <196608 | <196608 |

附加：Map002 640 refresh≤50ms、dense1080 guard真实PASS、idle no-autotile no permanent rAF、DPR-only backing count不变。dense real tileVisuals+chunks测exact UTF-8 View node bytes，新增motionId也要计入，不以192cells粗估冒充PASS。拆分`RenderDomain.update` author total/full-state validation/snapshot probe residual、wire/Store、Browser ordinary `receiveRenderData` unchanged-content/motionId-only工作、chunk refresh/overlap/entering raster、Canvas allocations/peak depth memory、resize burst→final visual commit。历史96.3ms refresh仍FAIL。Payload超guard→Map representation review；Core residual独立破gate→独立Core design review；Browser仍full raster→修Browser；不能牺牲语义、关闭autotile、提高limits、跳validation造假通过。

## 13. Test matrix / freeze route

Sizes：320×240、640×480、800×600、960×540、1280×720、1920×1080；initial null/default/sync subscribe、latest resize/no-op、movement boundary commit、terminal/old callback。Camera四边/small map/odd/inclusive/source-target union；192cell chunk padding/order、regular/autotile/priority、overlap/entering once/eviction；movement不更改chunks/visualEpoch但new motionId成对更新View/Sprite；refresh/viewport same update，transfer full replace，guard fail所有前状态不变。

Browser：640 pixel oracle、edges/no seams、priority/equal-depth/tall sprite、dirty autotile、camera rAF zero tile draw/resize、retained overlap、View/Sprite任一先到、static camera仍匹配新motionId、standing vs active camera completion gate、async failure/retry、scene/resize中途连续重基准、same G reconnect equal data no callback、fresh G no old stage、DPR invariance。Real Essentials：Map066 resize、Map066→Map002 long camera、Map002 Flowers1+walk+resize、Map066↔Map067 transfer、640→720→1080→640、minimize/reconnect、overcap letterbox/actual CSS allocation。Menu/dialog held input作为未来独立qualification，不升格为尚未存在consumer的Core/Map Freeze必选。

```text
Core C0: ADR0037 compatibility + corrected /1 + Viewport v1 + author/conformance
         + protected-semantic final cross-review → Docs Freeze SHA
Core C1: one-profile /1 data/renderer/subsystem/main/Desktop implementation
         → old regression + revised /1 revision3 + Viewport qualification SHA
Map PR0: exact1080 payload/Core residual/Browser costs/memory/single-clock latency
         + current accepted gameplay boundary → Map Docs Freeze subject
Map PR1: fixed640 chunk/raster/sprite optimization
Map PR2: dynamic viewport/epochs/private matched motion+View/Sprite stage
Map PR3: affected M11/M13/M14/M15 on one governed executable subject
```

PR0可与Core实现并行准备数据，但dynamic product implementation不能早于受治理Core contract/usable subject。Map Freeze必须有PR0实测达标、geometry/Render/Canvas可实现可测、§9与motion closure完整语义/测试、参数和movement/autotile/layering一致、无reconnect-as-retry、真实production baseline SHA复核；否则仍Draft/HOLD。**Core Docs Freeze不等于Map PASS；未来菜单另立consumer证据/资格，不能预先上移Framework。**