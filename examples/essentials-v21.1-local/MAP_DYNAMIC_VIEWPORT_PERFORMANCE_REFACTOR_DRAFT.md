# 地图动态视口与大屏呈现性能改造草案

> 状态：**Draft for review / Map Freeze HOLD**（Core contracts仍 Candidate；MF-01 lifecycle seam与 MF-03 PR0实测尚未关闭）  
> 日期：2026-09-16；原有生产代码基线：`3c10ae8`（冻结前必须重新核实际 executable subject）  
> 范围：`game-libs/map` Runtime/Browser presentation与 Essentials local physical composition；Core只作为正式 contract依赖  
> 目标：在非 InputTarget 的可见 map Frame也能按实际 320×240..1920×1080 viewport投影；movement/autotile/refresh不再在 camera rAF全量绘图；在性能与资格证据未通过前不声称已解决。

Core SSOT：[ADR0036](../../doc/decisions/0036-viewport-state-and-renderer-data-profile-v2.md) · [Viewport architecture](../../doc/10-architecture/viewport-capability.md) · [Viewport v1](../../doc/15-contracts/viewport-state-v1.md) · [Profile v2](../../doc/15-contracts/renderer-data-profile-v2.md) · [qualification ledger](../../doc/30-implementation/viewport-profile-v2-qualification.md)。此处不重新定义 Core wire/profile/author callback；冲突时 STOP、按 Core SSOT修正。与已有 M14 map baseline、movement latency、autotile animation、layering draft重叠的部分，以各自专属语义 owner为准：movement doc拥有 cadence/turn buffer/collision/transfer；本文拥有 dynamic viewport/projection/raster和跨文档一致性；既有 Render Update v1不得在本改造中reopen。

---

## 1. Exact data flow / ownership

```text
Renderer current document layout viewport
→ Core Viewport State v1 / Profile v2 (independent of InputTarget)
→ Runtime-scoped scope.viewport retained observation
→ Map business accepted viewport / camera / current ProjectionWindow
→ existing RenderDomain.update/replace
→ Renderer Store → existing Web Projector
→ lr-map-view parent / lr-map-sprite managed child
→ business-owned detached raster + local synchronized presentation commit
```

Core只提供 raw CSS logical size；Map独占 min/max/settle、camera、projection、tile semantics和 letterbox；Browser独占 decoded resources、current-window prepared/raster、physical retry和 motion timeline。Business WC不得反向修改 Store/managed light DOM；Main不存 width/height。不用 `x.loomrealm.viewport.state`、InputTarget bypass、Browser-local authoritative camera、permanent max-1080p projection envelope、generic Viewport/Environment/Chunk manager或 map-special Core path。

## 2. Existing problem / historical baseline

Current implementation：camera/bounds和 MapView固定 640×480；camera interpolation 每 rAF全 tile clear/traversal/drawImage，MapSprite每 rAF resize/clear/redraw；refresh重新投影/序列化/prepare/raster，autotile重画 depth layers。历史 Essentials：Map066 491 tiles/3 depths/约43116B；Map002 753 tiles/6 depths/约66875B。历史 ordinary P95 42.9ms（≤50）；refresh P95 96.3ms（>50 FAIL）。不同 measurement seam不能直接相互比较；必须按 §13 重测。**Viewport capability正确并不代表这些成本已被消除。**

---

## 3. Map viewport policy and safe initialization

```ts
const DEFAULT_VIEWPORT = Object.freeze({ width: 640, height: 480 });
const MIN_WIDTH = 320, MIN_HEIGHT = 240;
const MAX_WIDTH = 1920, MAX_HEIGHT = 1080;
const RESIZE_SETTLE_MS = 100;
```

Core size是 positive safe CSS integer layout viewport，不是 WC element box；map detach并 clamp到 min/max。初始 `scope.viewport.current ?? DEFAULT_VIEWPORT`；不把 `null`写回 Core。`acceptedViewport / pendingViewport? / resizeTimer?`仅 map business state；第一份真实合法且不同的 size在安全 boundary可立即尝试，后续 burst采用 100ms trailing settle、latest wins。相同 normalized size不提交。Movement step in-flight时 timer只记录 pending，在下一 motion baseline之前完成尺寸候选 commit；不得用 viewport callback并行破坏当前 motion。视口小于下限按 map policy clamp，大于1920×1080 cap并由外层 letterbox；DPR不进入 Runtime/RenderData或放大所有 Canvas backing。

**Mandatory initialization order（修正 synchronous subscribe reentrancy）：**

```text
read scope.viewport.current to choose initial detached size
→ load/validate content and initial world facts
→ build initial projection + RenderDomain and commit local map state
→ establish map render/movement owners
→ subscribe(viewportListener), synchronous first delivery must be compare/no-op if equal
→ accept future changed sizes under settle policy
```

不允许 `subscribe`首发时引用尚未初始化的 `domain/current/window`，不得初始 size被读一次、callback同值又重复投影/commit。若 read→subscribe间有新 viewport，Core同步首发最新值，map必须检测并收敛到该值。Frame/runtime terminal取消 subscription/timer、旧 async成果 inert。

---

## 4. Camera and bounds

```ts
computeCamera(map, playerX, playerY, viewport = DEFAULT_VIEWPORT)
viewportTileBounds(map, cameraX, cameraY, viewport = DEFAULT_VIEWPORT)
```

```text
anchorX = floor((viewport.width  - 32) / 2)
anchorY = floor((viewport.height - 32) / 2)
cameraX = clamp(playerX*32-anchorX, 0, max(map.width*32-viewport.width,0))
cameraY = clamp(playerY*32-anchorY, 0, max(map.height*32-viewport.height,0))
minX = max(0,floor(cameraX/32))
maxX = min(map.width-1,floor((cameraX+viewport.width-1)/32))
minY = max(0,floor(cameraY/32))
maxY = min(map.height-1,floor((cameraY+viewport.height-1)/32))
```

640×480必须严格退化为 old 304/224 anchor和 inclusive bounds；四边、small map、odd viewport、walking source/target interpolated coverage union均测试。Viewport只改变 presentation camera/projection，不改变 player world position。

---

## 5. Dense current ProjectionWindow / exact RenderData

```ts
const TILE_SIZE = 32, CHUNK_TILES = 8;
const CHUNK_CELL_COUNT = 8 * 8 * 3; // 192
const CHUNK_OVERSCAN = 1;
const MAX_PROJECTED_DATA_BYTES = 196_608;
```

Chunk `(chunkX=floor(tileX/8), chunkY=floor(tileY/8))`按 Y再X升序；cells exact 192，index `((z*8+localY)*8)+localX`，z 0..2，map外填0，非空为 source tileId。`tileVisuals[tileId]`当前 Tileset冻结一次 canonical dictionary：nonrenderable/null、regular `[depthBias,kind=0,sourceIndex]` 或 autotile `[depthBias,kind=1,slot,tlSx,tlSy,trSx,trSy,blSx,blSy,brSx,brSy]`；priority0→depthBias=-1，priority>0→(priority+1)*32。Browser消费 blit/depth instruction，不读取 Tileset record或重做 RMXP semantic判断。

```ts
type ProjectedChunk = Readonly<{
  chunkX: number; chunkY: number; cells: readonly number[];
}>;
type MapViewRenderData = Readonly<{
  sceneEpoch: number; visualEpoch: number;
  viewportWidth: number; viewportHeight: number;
  mapId: number; mapWidth: number; mapHeight: number;
  cameraX: number; cameraY: number;
  tileset: ResourceRef; autotiles: readonly (ResourceRef | null)[];
  tileVisuals: readonly TileVisual[]; chunks: readonly ProjectedChunk[];
  cameraMotion: CameraMotion | null;
}>;
type MapSpriteRenderData = Readonly<{
  visualEpoch: number;
  // existing resource/world/screen/direction/pattern/motion fields
}>;
```

Map `sceneEpoch/visualEpoch`是 Runtime-instance-scoped positive safe monotonic business identities，never wrap/reuse；不能借 Main Session/G生成，也不能冒充 Render Domain wire revision/ACK。`sceneEpoch`只随成功 scene transfer；`visualEpoch`只随 chunk refresh、accepted viewport change、scene transfer；ordinary movement与Browser retry/autotile rAF不增加 epoch。

Window selection：camera source/target tile bounds union→required chunk coverage→1-chunk overscan→map bounds clamp。当前 window就是唯一 Runtime bounded chunk cache：交集 reuse同冻结 chunk object，entering project一次，leaving drop；evicted future reentry可 reproject。不建 LoadedMap-wide history。若当前window覆盖新的 required bounds，ordinary movement不更新 chunks。map-side full JSON byte guard仅 initial baseline、transfer、viewport commit、refresh；ordinary retained movement不重复作者侧 stringify，但 **Core RenderDomain.update full-node validation residual仍真实存在，必须测**。

---

## 6. Runtime candidate / publication atomicity

Common rule：先构造 candidate camera/window/RenderData、验证 196608B guard和 Core accepted shape，成功后才更新 acceptedViewport/world/window/epoch并发布。失败保留前一 complete business/Render state；不能发布新 player position却留下旧 projection，也不能偷偷降 overscan或提高 Core limit。

```text
ordinary movement:
  MapView set cameraX/cameraY/cameraMotion
  MapSprite set world/screen/direction/pattern/motion
  no chunks/tileVisuals/resources/viewport/epochs set

chunk refresh:
  retained chunks reuse + entering projection + byte preflight
  visualEpoch+=1
  one domain.update(View.visualEpoch/camera/chunks/motion,
                    Sprite.visualEpoch/player/motion)

accepted viewport commit:
  construct resized camera/window + byte preflight
  visualEpoch+=1
  one domain.update(View.epoch/viewport/camera/chunks,
                    Sprite.epoch/new screen pose)

scene transfer:
  full new scene/resources/window validated against acceptedViewport
  sceneEpoch+=1; visualEpoch+=1
  one domain.replace(full scene)
```

Transfer不复用旧 scene pixels/resources/prepared chunks；pending resize另按安全 boundary提交，不能未经验证顺手塞到 replace。若容量溢出，走现有 map business/Frame failed path并归档证据，不能称 Browser physical failure。`RenderDomain.update()`本身可能因 complete final state失败，候选不得先改 map权威状态而不处理该同步失败。

---

## 7. Suspended Frame boundary — MF-01 (OPEN / Map Freeze blocker)

Core viewport receiver属于 Runtime，不受 InputTarget/Activation门控；**但这不是允许 suspended Frame进行普通 gameplay mutation。** 当 map Frame存活、Domain仍 live且被 child menu/dialog suspend时，viewport listener最多依据**已提交 world facts**重算 viewport、camera、chunk与 Render presentation；不能从 resize触发 input attempt、held-direction step、collision、transfer或 Frame call。已授权动作的 Browser视觉插值可依其既有已提交事实完成，但没有 fresh input authority不得开始下一 gameplay step。frame.signal abort/terminal须取消 pending timeout、subscription、async load，late callback inert。

**当前源码/API缺口：** map移动定时器保留 heldDirections并在 `finishStep`中可能自动 `attempt()`；public `Frame`仅有 `id/params/signal/call`，`InputListener`只有 `on/setChannels/close`，没有能准确观察 Activation revoke/suspend的 author API。`frame.signal`不能被臆测为 suspend signal。仅测试“Viewport在 suspend收到事件”不足以证明 gameplay gate。必须先选一种并用 executable trace验证：

```text
A. existing already-frozen author seam can prove that step chaining is suppressed
   across suspension without losing required held-movement cadence;
OR
B. evidence proves no such seam: STOP Map Freeze; separately review one narrow
   Frame/Input eligibility observation capability, with explicit authority/lifetime,
   without weakening InputTarget or packaging it inside Viewport.
```

目前没有证据证明 A；不提前引入 B 的未评审 API，也不牺牲 movement cadence/turn buffer以假装修复。所需测试：hold direction→movement in flight→child取得 InputTarget→rapid resize→timer deadline→no next gameplay step/transfer→child return/fresh Activation→fresh eligible input convergence→可按原 cadence正确继续；Frame terminal/late timers inert。MF-01在此之前明确 OPEN，Core Docs Freeze不以此为前提。

---

## 8. Browser raster model / no full work on rAF

Browser为 current scene/window准备 decoded resource、tile instructions与 animated-cell index，world-space depth raster保持当前 window相关的 bounded backing；每实际 visual depth最多一个 live canvas，其 backing按该depth current content最小 world-pixel bounds选择，scale=1、保留既有 tile/player layering/equal-depth/zIndex。不能把全部 depth预分配为最大 1080p envelope，不能给共同 ancestor transform破坏 interleave。

```text
validate/prepare (async resources allowed)
→ retained instructions reuse / entering prepare once
→ stage raster (detached; copy old overlap + draw entering)
→ commit latest matching stage
→ camera rAF placement only (O(live layers))
```

rAF禁止 await/Content request/decode、chunk validation、full tile traversal/clear、unchanged autotile时 tile drawImage、canvas width/height assignment。Canvas placement例：world origin style left/top + `translate3d(-cameraX,-cameraY,0)`，不得改 managed attrs/data/children/order。Refresh仅 retained overlap pixel-copy、entering raster，修正 overlap里因 autotile frame变化而 stale的 animated cells；leaving prepared state drop。同一 retained `(sceneEpoch,chunkX,chunkY)`内容变更 fail closed，evicted reentry重新验证。Autotile index `slot→depth→cell→ordered draw instructions`，changed slot才 clear/repaint受影响32×32 cells、同 tick去重，no animation则无 permanent rAF。Sprite相同 resource+direction+effective pattern不重建 raster；仅位置/深度变化只 placement，不 resize/clear/redraw crop。

Browser普通 `receiveRenderData`即使 chunks引用未变也要测成本：不得每次 complete chunks/tileVisuals revalidation、redecode、rebuild instruction/raster；只处理变更的 camera/motion/player fields并利用 RenderData structural/scene epoch与已验证 frozen current-window identity。Core仍可能对完整 Render node data做 full-state validation，此 residual不能靠 Browser缓存消除。

---

## 9. View/Sprite one-paint atomic presentation — MF-02 (design closed, evidence pending)

现有真实 Render tree是 `lr-map-view` managed parent → `lr-map-sprite` managed child。**一个 `domain.update()`保证authoritative Render commit原子，但不保证两个 WC async preparation或paint原子。** 必须用 package-private parent/child presentation coordination做**一套旧完整stage→一套新完整stage的同步提交**，不做 framework ACK/revision join。冻结 observable算法，不固定内部class名称：

```text
MapView new (sceneEpoch,visualEpoch): validate, prepare detached depth raster
MapSprite same visualEpoch: prepare detached crop/pose and supply private ready signal
Either receiver may arrive first; neither makes new live content visible alone
Parent retains previous complete accepted View+Sprite stage while waiting
When both candidates are ready, current/connected, matching scene+visual epoch,
latest desired data/motion still valid:
  in ONE synchronous JS task (no await/rAF boundary between swaps)
  → switch map depth stage / logical host clipping-size
  → invoke child-owned private sprite stage commit synchronously
  → advance parent acceptedVisualEpoch
  → only then allow new-epoch placement/animation
```

若 child新 data先于 parent，则只 pending；parent新 raster先于 child则不提前切层；**不能**出现新尺寸map配旧 screenX/Y sprite，也不能显示新人物配旧地图。旧完整 stage保持显示（初次 baseline无旧 stage则整体保持不显示），直到两者一同ready。改变 host clip尺寸与两者stage在同一 JS task，浏览器不会在其中间 paint。Parent只能读取既有 managed parent/child关系、调用 map package-private child method；child只修改自己的 ShadowDOM/Canvas、parent只修改自己的 ShadowDOM/Canvas/自身业务 presentation，双方不得改 LoomRealm-managed attrs/data/light DOM topology。禁止 Window-global registry。

新 epoch/scene或 fresh generation抢先到达：invalidate/abort旧 detached work，旧 stage保持到新共同 ready；旧 async resolve不得覆盖新 desired；terminal/disconnected/removed managed subtree cleanup后全部 inert。发生 prepare失败保留完整旧stage，对**已收到的同一 data**执行 bounded Window-local private retry并做最新性检查；same-generation reconnect的 structurally equal data不会被当作 retry signal。跨 fresh Session/G DOM identity按 M13换 element universe，不跨 universe复用 stage。

Ordinary movement epoch不变：MapView camera与Sprite pose仍来自同一当前 Render facts；共享按 movement id与同一 Browser monotonic time计算 motion sample（package-private parent camera sample可供 child只读消费），不让两套独立 rAF clock把 camera/sprite插值错开。所有 rAF仅placement，不修改 Store。Conformance必须在 parent-first、child-first、async resource failure、rapid A→B→C、scene transfer、disconnect/reconnect、single-paint screenshot/recorded frame下证明没有混合stage。MF-02算法设计在此闭合，但 executable evidence尚待 PR2。

---

## 10. CSS / physical resizing

`lr-map-view` host `display:block; position:relative; overflow:hidden; image-rendering:pixelated`，原默认 640×480 fallback/Essentials centered。只有共同 visual stage commit后才同步应用 accepted viewport logical width/height。Physical surface超cap时 map viewport最多1920×1080，外层letterbox；min clamp按 map policy。DPR-only change不触发 Runtime/RenderData改变，不把 canvas backing乘 DPR。Transient size变化在 Core publisher端有界latest-wins，在 map端独立100ms settle；不能把后者误当 Core writer背压保护。

---

## 11. Ownership / forbidden scope

Core Track可能动 `packages/data/renderer/subsystem/main` 和 Desktop/PWA trusted source，仅按已冻结 Core contracts实现 profile/authority，不加入 map vocabulary。Map Track限 `game-libs/map/src/{semantics,runtime}.ts`、`game-libs/map/browser/{map.browser.js,map.css}`、Essentials local受治理 build/presentation outputs和针对性测试。严禁借本改造修改 `packages/wire` payload/limits、fixture importer semantics、Content、Frozen User Input v1、Render Update v1、Main Frame/Activation/InputTarget authority。若 MF-01真实证明缺少 lifecycle capability，先单独 Core review与兼容治理，不能偷偷在 map或 viewport加旁路。

---

## 12. Canonical measurement and PR0 gate

Formal product stimulus→paint必须使用 Hostra product harness单一 monotonic clock，不能跨进程减两个 `performance.now()`。Release-like build归档 SHA、Node/Electron/Chromium/CPU/GPU/DPR/map/position/viewport；每档三轮报告各轮与合并 P50/P95/max，ordinary/refresh/autotile分桶。Browser/Runtime marks只同进程诊断。

| Gate | 640×480 | 1280×720 | 1920×1080 |
|---|---:|---:|---:|
| ordinary stimulus→paint P95 | ≤50ms | ≤50ms | ≤50ms |
| refresh stimulus→paint P95 | ≤50ms | ≤75ms | ≤100ms |
| active movement frame >33.4ms | <1% | <1% | <2% |
| complete visual step dropped | 0 | 0 | 0 |
| camera-only tile drawImage per rAF | 0 | 0 | 0 |
| exact MapView node serialized bytes | <196608 | <196608 | <196608 |

Additional: Map002 640 refresh≤50ms、dense 1080p guard真实 PASS、idle无autotile无 permanent rAF、DPR-only backing pixel total不变。必须用 dense real `tileVisuals`+chunks测 exact UTF-8 bytes，不用192-cell粗算当 PASS。分别测 640/720/1080 exact size、`RenderDomain.update` author total/full final state validation/snapshot-or-patch representability、wire/Store、Browser ordinary `receiveRenderData` invariant processing、chunk refresh prepare/overlap raster、Canvas allocations/peak depth backing memory、resize burst-to-final-visual-commit。旧 96.3ms refresh FAIL只能当历史证据，不能沿用为成功。

若 exact payload过 guard，STOP map package-private representation review；若 Core residual单独破 gate，STOP单独 Core design review；若 Browser仍 full raster/validation，STOP修 Browser阶段。不得降低语义、关 autotile、提高 framework limit或跳过 validation造假过关。

---

## 13. Test matrix

尺寸：320×240、640×480、800×600、960×540、1280×720、1920×1080。必须覆盖 initial null/default与同步 subscribe、latest resize/no-op、movement-boundary commit、suspended non-InputTarget geometry与 MF-01 gameplay gate；camera four edges/small map/odd/inclusive -1/source-target union；chunk 192 padding/order、regular/autotile/priority，reuse/entering once/eviction；ordinary movement no chunk/epoch mutation，refresh/viewport View+Sprite同 update，transfer full replace，guard failure保留全部前状态。

Browser：640 pixel oracle、all edges seamless、priority/equal-depth/tall sprite、dirty autotile、camera rAF counters zero tile draw/resize、retained overlap copy、parent-first/child-first stage、async failed prepare private retry、scene/resize crossing、same-generation reconnect不重新调用equal receiver、fresh generation no old stage、DPR invariance。Real Essentials：Map066 resize、Map066→Map002 long camera、Map002 Flowers1+walk+resize、Map066↔Map067 transfer、child menu/dialog+held movement+resize、minimize/reconnect、640→720p→1080p→640、over-cap letterbox。每项同时检验 physical-frame无混合stage及 qualification seam。

---

## 14. Implementation and Freeze route

```text
Core C0: ADR/architecture/formal contracts/conformance cross-review
→ Core Docs Freeze on docs-only SHA (executable PASS not prerequisite)
→ Core C1 implementation: /2 peer/sender/receiver/author API/Main policy/Desktop
→ /1 regression + /2 conformance + product qualification on executable SHA

Map PR0: exact dense payload/Core residual/Browser receive/raster/memory/latency evidence
→ resolve MF-01 existing-seam proof or separately approved narrow lifecycle reopen
→ resolve MF-02 design tests and verify performance values
→ Map Docs Freeze on current docs+PR0 evidence SHA
→ PR1 fixed 640 chunks/raster/sprite optimization
→ PR2 dynamic viewport/epochs/synchronous two-WC stage gate
→ PR3 M11/M13/M14/M15 affected requalification on governed executable subject
```

PR0可以与 Core implementation并行准备数据，但 map dynamic production implementation不得先于 Core contract Freeze和 usable subject。若冻结前真实代码/fixture不一致，STOP归档最小复现，不回写虚假 baseline SHA。

## 15. Freeze gate/status

**Core Docs**：由 [viewport qualification ledger](../../doc/30-implementation/viewport-profile-v2-qualification.md) 记录；不由本 map draft重复签署。**Map Docs** 必须：PR0 exact dense1080 bytes PASS；Core residual/Browser ordinary callback/latency gate可行；MF-01 suspended Frame no gameplay authority有合法可实现的 seam/单独评审解决；MF-02同步 stage规范+可验证 test；8×8/overscan1/100ms/sizes/196608B一致；movement/autotile/layering无 ownership冲突；no reconnect-as-retry；当前 importer/requalification blockers独立治理。未满足之前状态保持 Draft/HOLD。完成后重新核真实 production baseline SHA、PR0 evidence和冻结 docs subject，才标 `Frozen for implementation`，不冒充 executable PASS。

**仅允许最小概念：** Core `viewport.state` + `/2` + `scope.viewport`；Map accepted/pending size + chunks/tileVisuals + current window + sceneEpoch/visualEpoch；Browser current-window prepared/raster + private synchronized acceptedVisualEpoch。拒绝 per-map Core fast path、generic manager、max-envelope、map chunk Render node、全量 tile rAF、cross-component wire ACK、UI reconnect重试机制、framework limit raise及未经证据宣称性能完成。