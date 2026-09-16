# Map 动态视口与大屏性能：机械实施合同候选

> 状态：**Design closure candidate / Map Docs Freeze HOLD / not implemented or qualified**；2026-09-16。本文是本次 Map viewport/performance 改造的**唯一主实施合同**。仅当 §14 的设计签署完成才可将 PR1/PR2/PR3 下发低判断力 Agent；PR0 是独立受控可行性工作，非生产功能实施授权。
> 规范依赖：[修正后的 Profile `/1`](../../doc/15-contracts/renderer-data-profile-v1.md) · [Viewport v1](../../doc/15-contracts/viewport-state-v1.md) · [Render Update v1](../../doc/15-contracts/render-update-v1.md) · [M13 Web Presentation API](../../doc/15-contracts/web-presentation-api-v1.md) · [冻结 walking](./MAP_WALKING_ANIMATION_DESIGN_DRAFT.md) · [冻结 transfer](./MAP_TRANSFER_DESIGN_DRAFT.md)。[Motion-stage 细节](./MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)只细化本文 §8；冲突时 STOP，请设计负责人修订本文，不准 Agent 自行选择解释。
> Scope：`game-libs/map` 与 Essentials example；Core 只提供独立 raw Viewport。原 Profile `/2` 已撤销，不发布/不实现。Core Docs Freeze、Map Docs Freeze、Implementation PASS、Product PASS 是四种不同状态。

## 0. Agent 权限和 STOP

实施者没有权修改架构、Frozen wire、Core validation/1MiB/262144B 限制、InputTarget、M13 Projector、Content/importer、已有 walking/transfer 业务规则、测试门槛或产品尺寸策略。只能按 §13 的各刀文件范围执行；不能通过跳过校验、关闭 autotile、放宽限制、仅在局部 harness 作弊来过门槛。本文所有 exact shape、数值、排序、状态转移与验收均为本候选的确定规则；任何与当前源码/Frozen contract 不相容、合法产品密集数据超过预算、性能不达标、实现需要新增通用 Framework API 的情况：**STOP、记录输入/trace/定位，交设计负责人修文档并产生新 subject**。不得自行新增 EventBus、ACK、movement replay queue、Environment/Chunk/Layer manager、跨 WC 通用事务或私有 Main/Store 读口。

## 1. Ownership、尺寸与时序

```text
Desktop/PWA product document layout viewport (Window.innerWidth/innerHeight)
→ corrected renderer-data/1 Viewport State v1
→ Runtime-scoped readonly scope.viewport
→ Map accepted viewport / world authority / camera / ProjectionWindow
→ existing RenderDomain.update/replace
→ Frozen Renderer Store + M13 Projector
→ managed lr-map-view > lr-map-sprite
→ map-private prepared paired stage / paint
```

Core 不拥有 map cap、camera、tiles、CSS letterbox 或任何 gameplay；`scope.viewport`不授予 Frame mutation permit。当前产品 DOM source 的具体选择归 [Core rollout ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)。Example/page 必须在物理测试里核对 raw document viewport 与 map 实际 content box：**不能假设 Window 大小等于 WC box**。Viewport subscription 在 Frame 初始化完成、domain/world/movement owners 就绪之后注册；初始 `current ?? {width:640,height:480}` 只作 map 内 fallback，不回写 Core；同步首回调同值不重复 commit，read→subscribe race 根据回调最新值收敛。Frame/Runtime terminal 取消 subscription、resize timer、step timer、pending candidate；晚到 resource/worker/rAF inert。

Map 固定配置：`TILE=32; DEFAULT=640×480; MIN=320×240; MAX=1920×1080; RESIZE_SETTLE_MS=100; CHUNK=8×8×3; OVERSCAN=1 chunk; VIEW_DATA_GUARD=196608 bytes`。原始尺寸独立按 min/max clamp；normalize 后同值不 commit。第一份真实尺寸允许在安全 boundary 立即 commit；其后的 resize burst 用 100ms trailing latest-wins。正在进行 logical movement 时先记 latest pending，下一 step boundary 再 author commit；正在显示的 physical motion 可按 §8 重基准。DPR-only 不改逻辑尺寸、RenderData 或 canvas backing scale；example own centering/letterbox。

**计时分桶严格分开：** `ordinary` 是键盘动作到人物/相机对应画面；`refresh` 是已经接受并开始执行的 chunk/autotile/scene refresh 到相应像素；`resize-end-to-paint` 是最后一个 raw resize sample 到最终 accepted viewport 首次完整 paint，单列且**包含 100ms settle，不适用 refresh 50/75/100ms 门槛**。不得将 resize 伪装成短 refresh 或跨进程 `performance.now()` 相减。

## 2. 现有不变的业务语义

Walking：250ms/格、world `x/y` 在 step start 变成 integer target、held direction 和 completion timer 不变。Frozen walking §3 明许 Data/Render backpressure 合并未 emitted 中间 movement：**不存在“每个 logical accepted step 必须在 Browser 完整播放”的保证**；不建 ACK、重放队列或阻塞 world truth。若较新的 step 在旧 step 尚未显示时出现，丢弃旧未接受 physical candidate，最新 stage 从**上一已显示** pose 连续插值到最新 truth，最终收敛；记录 coalesced motion count，不称之为 packet loss 或错误 PASS。对已开始播放的 stage，后续真正确认的 motion/standing、scene、resize 只按 §8 新 stage 切换；不得旧 async/rAF 回盖。Standing 最新状态依 Frozen walking 可 cancel motion 并 snap target，§8 的 standing-only fast path仅在 camera/paired stage真正静止时使用，否则走 paired stage，不能留旧运动中的背景。Frozen transfer：不重建 Frame、load target失败既有 MAP_TRANSFER_FAILED、完整新 scene replace、A→B→A fixture 不变。Map viewport observation不得触发 player movement/collision/transfer/call；未来 menu/dialog 不属于当前只有 map 的产品验收，也不借此扩 Frame API。

## 3. 精确 camera、window 和 candidate transaction

```ts
anchorX=Math.floor((viewport.width-32)/2); anchorY=Math.floor((viewport.height-32)/2);
cameraX=clamp(playerX*32-anchorX,0,Math.max(map.width*32-viewport.width,0));
cameraY=clamp(playerY*32-anchorY,0,Math.max(map.height*32-viewport.height,0));
minX=Math.max(0,Math.floor(cameraX/32)); maxX=Math.min(map.width-1,Math.floor((cameraX+viewport.width-1)/32));
minY=Math.max(0,Math.floor(cameraY/32)); maxY=Math.min(map.height-1,Math.floor((cameraY+viewport.height-1)/32));
```

640×480 必须得到旧 304/224 camera anchor；覆盖四边、小地图、奇数尺寸、source/target visual pose 的 required tile bounds union。Required tile bounds → 覆盖它的 chunk coordinates → 四周再增 1 **chunk** → map bounds clamp，Y/X 排序；不能偷偷降 overscan 换取 bytes。只保留当前 ProjectionWindow，overlap reuse 先前 frozen chunk object、仅 entering projection、leaving drop；没有 map-wide historical chunk/pixel cache。

所有 initial、accepted resize、refresh、ordinary movement、transfer 先在局部建完整 candidate（world facts、camera、window、RenderData、epochs/id），检查 §4 精确 shape 和 §5 byte limit 后由既有 `RenderDomain.update/replace` **一次同步提交**；成功之后才推进 map-local acceptedViewport/world/window/sceneEpoch/visualEpoch/motion cursor；失败时四者均不变。Ordinary movement仍只一次 `update`，只更改 View camera/motion/id 与 Sprite world/screen/pose/motion/id，**不可在 map 侧反复 stringify 全 chunks**。Initial/transfer 用 full replace，refresh/resize 用一次 update；只能对已有 node data 做现有 RenderDomain.update，不改 Frozen Patch grammar。失败后不得在业务层留下新 player+旧 projection。Frame terminal 的错误 code沿现有 map-local路径，不能将 Browser decode failure当成 MAP_TRANSFER_FAILED。

## 4. 封闭的 Map-private data schema（不增加 Core RenderNode 类型）

下列为 RenderNode `data` 的**精确必需 own keys**，不是示意。`ResourceRef` 沿用现有 exact `{namespace,key,contentVersion}`；Map/Tileset 原始 records 不变。`TileVisual` 不采用未限定的全 Tileset 稠密数组，**仅为当前 chunks 实际使用的非零 tileId 建有序紧凑表**，避免把未显示 tile 全量传到 1080p。

```ts
type VisualRegular=readonly [tileId:number,depthBias:number,kind:0,sourceIndex:number];
type VisualAutotile=readonly [tileId:number,depthBias:number,kind:1,slot:number,
  tlSx:number,tlSy:number,trSx:number,trSy:number,
  blSx:number,blSy:number,brSx:number,brSy:number];
type TileVisual=VisualRegular|VisualAutotile;
type ProjectedChunk=Readonly<{chunkX:number;chunkY:number;cells:readonly number[]}>;
type MapViewRenderData=Readonly<{
  sceneEpoch:number;visualEpoch:number;motionId:number|null;
  viewportWidth:number;viewportHeight:number;
  mapId:number;mapWidth:number;mapHeight:number;cameraX:number;cameraY:number;
  tileset:ResourceRef;autotiles:readonly (ResourceRef|null)[];
  tileVisuals:readonly TileVisual[];chunks:readonly ProjectedChunk[];
  cameraMotion:CameraMotion|null;
}>;
type MapSpriteRenderData=Readonly<{
  sceneEpoch:number;visualEpoch:number;motionId:number|null;
  x:number;y:number;screenX:number;screenY:number;direction:2|4|6|8;
  pattern:0|1|2|3;sprite:ResourceRef;motion:PlayerMotion|null;
}>;
type CameraMotion=Readonly<{id:number;durationMs:250;fromCameraX:number;fromCameraY:number}>;
type PlayerMotion=Readonly<{id:number;durationMs:250;fromY:number;fromScreenX:number;fromScreenY:number}>;
```

`sceneEpoch/visualEpoch` 为 Runtime-instance positive safe monotonically increasing、不可 wrap/reuse；初始皆 1，scene 仅 transfer 增，visual 在 scene/viewport/chunk refresh 增，ordinary movement 不增。`motionId` 初始/standing/scene transfer 为 null，每次**成功** logical movement分配唯一正 safe integer，View/Sprite 两份相同，即使 camera clamp 无运动也必须更改 View 的 motionId，强制 M13 给两个 WC 新 callback。`cameraMotion`/`motion` 同时为 null 或同时非 null；非 null 时 `id=motionId`、duration=250；字段还须遵 frozen walking 的 from/target 算法。Failed candidate 不消耗已提交 ID。

每 chunk `cells.length===192`，索引 `((z*8+localY)*8)+localX`，z=0..2、local 0..7，地图外 padding 为 0；Map.data 仍 `x+y*mapWidth+z*mapWidth*mapHeight`。chunkX/Y 非负整数、Y/X 严格升序、无重复；只允许 required+overscan 的确切集合，不允许缺块或额外无界块。cell 为0或在 Tileset range 内且通过 `assertRenderableTileId`，tile 1..47 fail closed。`tileVisuals` 恰好包含当前所有非零 cell 的去重 tileId，tileId 严格升序、无冗余，browser构建 `Map<tileId,entry>`；0无 entry。Regular sourceIndex=tileId-384。Autotile slot=floor((tileId-48)/48)，variant=(tileId-48)%48，四对 source coords 由既有 `autotileCorners(variant)` 顺序 tl/tr/bl/br 转为8个整数。Priority=0⇒depthBias=-1 (special layer depth0)；priority>0⇒depthBias=(priority+1)*32，画时 `tileDepth=worldTileY*32+depthBias`。此公式必须逐 pixel 对齐现有 `tileVisualDepth(y,priority)`；不得把 depthBias 直接当 CSS zIndex。每个数组成员为有限 safe integer，非零tile、合法资源slot、合法 source rect、Map width/height/viewport/camera范围与 motion payload 都须完整验证；Browser按 exact own key set fail closed，不能只凭 TypeScript annotation。

Depth 绘制顺序仍是现有 tile `z=0→1→2`，每 z 内 `y`再`x`；chunk 顺序不具有像素叠加顺序，Browser须先把全部 chunk cell 还原为 `(z,y,x)` 全序，再按 depth 以**稳定原相对顺序**分桶。Sprite visual depth=`round(lerp(fromY*32,y*32,p))+32+(frameHeight>32?31:0)`；tile zIndex=`tileDepth*2`、sprite zIndex=`visualDepth*2+1`，相等人物在上。不要把所有 tiles 直接按 chunk 顺序绘制导致 autotile/depth regression。

## 5. Guard、校验成本与内存

Initial/transfer/refresh/accepted resize 针对**完整 MapView `data` object** 执行 canonical `JSON.stringify` 后 `TextEncoder().encode(...).byteLength < 196608`；注意是 `<`，不是 `≤`，不把 host Node attrs 包进这条 map-local guard。依然必须遵守 Frozen Render data 262144B、application unit 1MiB、depth64、所有 Node/Domain limits；不能用 map guard 替换其校验。Ordinary movement 不重复 map-local stringify，Core `RenderDomain.update` 仍可能验证完整 state，M13 `receiveRenderData` 的 structural equality仍可能扫描整个 retained `chunks/tileVisuals`：**两处都必须独立 profile，不能通过 object identity、绕过 Projector 或跳过 validation 优化**。如果其中任一单独打破时间门槛，STOP 申请独立 Core/M13 design review，不得混在 Map PR 里改 Frozen 行为。

Map Browser 同时存在的可见/候选 Canvas（包括 Sprite crop）估算 backing bytes=`Σ(canvas.width*canvas.height*4)`，峰值 **≤128 MiB**；所有已 decode `ImageBitmap` 估算 bytes=`Σ(width*height*4)`，加上 backings 的总峰值 **≤256 MiB**。两个 gate 同时适用，含 stage prepare 期间旧+新并存；按真实创建/释放记录，不能只统计 commit 后。超过则 STOP/提供真实尺寸与资源报告；不自动降 overscan、裁层或预分配 max 1080 envelope。Cache只持当前 scene/window 所需且 bounded；detached stale image/canvas在替代或 terminal 后 release/close；避免 ImageBitmap 累积到 map-wide memory。

## 6. Map/Browser raster 机械算法

Browser对同 `(sceneEpoch,visualEpoch)` 验证过的 tileVisuals/chunks 缓存只在内容变更时重新建；`motionId`变化**只准备 motion/placement，不重验证全 tiles/raster**。每 depth 最多一张 visible 和一张 detached candidate Canvas，尺寸按当前 required world pixel bounds，不得 1920×1080 全量预分配每层或每 camera rAF resize/clear。进入 chunk raster一次；从旧 depth canvas 按相同 world coordinates `drawImage` copy overlap 到 detached；新进入块按 §4 稳定 tile order绘制；离开块不绘制。动画 autotile保留 slot→depth→cell→ordered blits索引，只有 frame 真的改变时脏 32×32 重绘该 cell及同 depth 必要重叠元素，重复 tick dedupe，idle且无 motion无永久 rAF。Sprite同 image/direction/pattern重用 crop bitmap/backing，placement/depth改变不重设 canvas.width/height或 clear/redraw。

Camera-only rAF **只更新已绘好的 tile depth layer 的私有 style transform/left/top 和 Sprite 私有位置/层级**，不遍历全部 tiles/chunks、不 await/decode/fetch、不做完整 validator、canvas resize/clear或任何 tile drawImage。Autotile发生实际 frame 变化时允许独立 dirty-cell paint，但须在 trace 中归为 autotile，不归为 camera-only。Canvas `scale=1`，DPR-only不会重建 logical backing。Refresh失败保留上一个完整 visual stage并按 §8 bounded retry；不得清空仅一端或等待 same-G 重连再触发 M13 equal-data callback。

**严格 M13 DOM 边界：** M13 管理 Web Component host `attrs/data/children`，Map 禁止写 host `this.style`/attrs、不能重排 managed light DOM。`lr-map-view`只操纵自己的 ShadowDOM（depth canvases、private `<style>`、slot），`lr-map-sprite`只操纵自身 ShadowDOM 内 absolute canvas。Parent的 ShadowDOM private stylesheet 维护 `::slotted(lr-map-sprite){position:absolute;inset:0;z-index:...}` 的 z-index rule，每帧仅更新这条 parent-owned CSS rule 的 z-index；Child只更新自己 Shadow canvas 的 private left/top/bitmap，host style 不写。Tile canvases与 slotted Sprite 必须在同一父 stacking context按 §4 zIndex交错；如果 Chromium fixture 证实 `::slotted` stacking无法保持 priority/equal/tall-sprite 像素 oracle，则 STOP 重新选定**仍仅 map-private**的布局，Agent不得偷偷恢复 host style 写入或修改 Projector。

## 7. Runtime 到两个 WC 的提交规则

每次需要成对改变 camera/scene/viewport/visual/motion 时，`domain.update` 在同一同步 call 内更改 `lr-map-view` 与 `lr-map-sprite` 的完整匹配 token `(sceneEpoch,visualEpoch,motionId)`；transfer用一次完整 replace。M13 可先向任一个 WC投递其 `receiveRenderData`，不保证同时回调、同时解码或同 paint。只有两端收到**匹配 latest token**且 resources/raster准备好，Parent才在一个同步 JS task commit 两份 map-private stage，接着统一启动一条 parent-owned rAF clock；Child不得自己提前启动独立 motion。仅 View 完全静止且当前没有 active/pending pair、viewport/scene/visual没有变化、standing/facing 只改 Sprite pose 时可 Sprite-only commit；上段 camera/motion 尚在进行时必须等待 §8 completion/safe replacement。Initial missing pair完全隐藏，fresh Session/G element universe绝不继承旧 stage。

同一 scene/visual 的 motionId 变化是新 stage，不会凭 `visualEpoch` 相等错配旧 Sprite。两个 WC callback 任一先到：只记录 latest candidate，不 paint；更新 token使旧 pending/async/rAF失效；同一 token重投递相同 data也不等于 retry通知，失败后用 WC本地 bounded retry已收到数据。不得新增 Core revision join、Store ACK、Frame scheduler或业务 wire event。§8 是唯一更细的算法与 transition table。

## 8. Motion、resize 和 failure 有穷状态机

Parent private states=`EMPTY | VISIBLE | PREPARING | RETRY_WAIT | DISPOSED`，private vars=`desiredView?,desiredSprite?,acceptedPair?,candidateView?,candidateSprite?,sequence,raf,attempts`。任一新的 WC data callback覆盖本端 desired 并 `sequence++`；只有两端 desired 的 `(scene,visual,motion)` 完全相同才能准备/commit pair，若当前另一端尚旧则保留完整 acceptedPair；旧 sequence resource promise完成只丢弃。Callbacks可顺序进入，绝不按 callback 时间给两端独立 clock。

`EMPTY`新配对未ready→整体hidden；`VISIBLE`收到较新 token→`PREPARING`且保留旧完整画面；两端同步ready且 identity/connected/latest 再检查→同一 JS task parent swap private canvases/clip、child swap private bitmap/pose、更新acceptedPair；下一个 parent rAF读取一次同一Window `performance.now()`，同一 progress 更新 camera + sprite。新 token出现/terminal/disconnect→取消旧 rAF、使旧 sequence inert；若新 identity fresh Session/G，不能显示旧元素，重新 EMPTY。合法 Sprite-only fast path须满足 §7 全部静止条件。

同 scene的旧 motion正在显示、accepted resize/refresh插队：在**即将切换的共同帧 t**一次计算旧已显示 camera 和 Sprite screen pose 及其 pattern/depth，作为新 stage 的`from`；新 accepted viewport/world truth给 target camera/screen；若仍属同一 movement，`remainingMs=max(0,oldMotionEndTime-t)`，两端共享此时长与下一帧起始时间；若是后续 logical step B取新的250ms。若 remaining=0 当帧完整 target standing；scene transfer**不做跨场景插值**，旧完整画面保留到新 scene pair ready，然后同 task整体切换。Backpressure直接跳过未呈现 step A而接到 B时，以最后**实际显示** pose作为 B 起点、250ms 插值到最新 B truth；记录 skipped-intermediate counter，但不创建 replay queue。Standing 最新 truth在 paired stage切换时按 Frozen walking 可以 snap target、取消旧 motion；不可先只停 Sprite 让旧 camera 继续。

任一资源/prepare失败：保留旧完整 pair或保持 EMPTY，`RETRY_WAIT`对同 latest data最初失败后的 **100ms、200ms、400ms** 最多三次 retry；每次前核对 current sequence/identity/connected，更新来了取消旧 retry。三次仍失败→停止该 latest stage的重试，记录明确失败并保持旧完整 pair/EMPTY；**该次资格 FAIL，不报 PASS**，只有更晚实际 data或全新 component identity才可开始新候选。Runtime/Frame terminal取消 Map-owned timers/subscription；WC disconnect取消自己的 rAF/retry，late async inert。不得无限积累更多 pending than 1 per end；旧 ImageBitmap应close。所有 retry/timeout 仅 map-private presentation，不写 Core Store、不能变成 `RenderEvent`。

## 9. Test oracle 和防伪断言

旧640 fixture pixel oracle、walking/transfer/autotile/layering 全部保留；新增 fixtures最少 `320×240、640×480、800×600、960×540、1280×720、1920×1080`，小地图、四边、odd viewport、dense Map002/066、Map066↔067 transfer、640→720→1080→640、DPR only、minimize/restore、same-G reconnect/fresh-G。Typed/negative tests覆盖 unknown fields/invalid tile/slot/priority/chunk duplicate/missing/padding/entry mismatch/motion mismatch/max bytes、no mutation before failure、old rAF/resource/unmount fencing。

Browser截图对比必须覆盖 regular/autotile 48 variants/animated slots、priority0..5、equal-depth/tall-sprite、所有四边、overlap/new chunk seams、idle no perpetual rAF、camera-only 0 tile draw/clear/resize、Sprite reused crop。Pair tests View-first/Sprite-first、clamped camera、A→B coalescing、standing while moving、resize during motion连续 rebase、scene transfer、failed prepare local retry耗尽。**实际 world state与最后最终画面必须收敛；没有混合 stage、旧结果覆盖、半提交；丢失的未显示中间 transition必须统计，不能作为“每步完整播放”的证明。** 物理 `complete visual stage dropped` 指已宣布 acceptedPair却从未被真实 frame呈现；该值须0，除非在首帧前有更晚 authoritative target supersede且明确记录为 `superseded-before-paint`（另报，不计已显示完整步进）。不得重新引入不可能的“所有 logical steps 均完整播放”指标。

## 10. 性能统计与阶段验收：不再循环

**PR0 是冻结前可行性 / baseline，不是修完性能。** 在不提交 PR1/PR2 production 优化前，用代表性 dense1080 pure data prototype生成§4 exact MapView data并测JSON bytes、Frozen Core full-state validation residual、M13 structural compare、现有Browser baseline full raster/Canvas内存；记录当前640/720/1080真实Hostra latency（尚无 dynamic实现的720/1080不能伪称真实产品，标 `prototype-only`）。报告实测/预期上界和若超过guard或预算的 STOP 决定；PR0**不要求**camera-only 0 drawImage、refresh P95达标或dynamic产品实测，这些只能在 PR1/PR2之后取得。可行性达到：exact shape/payload合法、重要CPU/内存风险归因完整、无必须改变Frozen contracts的未解决缺口，才允许 §14 Map Docs Freeze；任何独立不可修复Core/M13 residual或guard失败先STOP redesign。

**PR1 固定640、PR2动态尺寸、PR3完整资格**之后，才在真实 product harness执行以下终局 gate：

| Product gate | 640×480 | 1280×720 | 1920×1080 |
|---|---:|---:|---:|
| ordinary action→first correct painted motion P95 | ≤50ms | ≤50ms | ≤50ms |
| accepted non-resize refresh→correct paint P95 | ≤50ms | ≤75ms | ≤100ms |
| active-motion frames >33.4ms | <1% | <1% | <2% |
| mixed/partial accepted stage, stale overwrite | 0 | 0 | 0 |
| camera-only tile drawImage/clear/resize per rAF | 0 | 0 | 0 |
| exact complete MapView data JSON bytes | <196608 | <196608 | <196608 |
| peak Canvas backing bytes | ≤128MiB | ≤128MiB | ≤128MiB |
| peak estimated decoded+backing bytes | ≤256MiB | ≤256MiB | ≤256MiB |

**Resize-end-to-paint 单列报告 P50/P95/max，不与 refresh 50/75/100ms 判据混用；禁止发布前隐瞒100ms settle成本。** Map002 640 refresh仍须≤50ms。每档 ordinary/refresh/autotile/resize分别三轮，每轮≥100有效样本，报告各轮/合并 P50/P95/max、超33.4ms比例、事件/帧的丢失与 superseded counters、CPU breakdown和性能元数据。只接受同一 Hostra test process `process.hrtime.bigint()`：Node在发出Playwright键盘/resize请求**前**取 t0，在取回显示目标像素的 Chromium screenshot/可见证据**后**取 t1；`t1−t0`保守包含测试传输开销，所有尺寸同一 harness；Browser/Runtime本地 `performance.now()`仅各自诊断，不跨进程相减。刷新触发须由同一 harness 发出并标记 commit-start，完成以 screenshot证实的目标像素为准；每次截图的 target state须与实际状态/epoch匹配。记录 SHA、Hostra/Electron/Chromium、Node、CPU/GPU/DPR、地图和位置、build mode、raw logs；不得用异步 JS callback到达冒充真正 paint。历史 refresh P95=96.3ms 是 FAIL，非新subject证据。

## 11. 文件清单 / 每刀不可越界

**Core C0**：发布负责人完成 `/1` 外部compat核查、旧文档保全/最终cross-review、签署 Core Docs Freeze SHA。**C1**：按 [Core v1 ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)实施同 cohort的`@loomrealm/data`/Renderer/Subsystem/产品 physical source 并重跑四 child+旧回归；Map Agent不可用自己的PR替代。Core 未可用前可以独立 PR0 prototype，不能实现动态产品功能。

**Map PR0（单独 investigation）**：production zero change；允许新增 `test/map-viewport-pr0.test.mjs`、`test/map-viewport-pr0-hostra.test.mjs` 两个受控 harness（复用既有 `test/m15-hostra-product.test.mjs` 与 `test/map-layering-browser.test.mjs`的现有 Hostra/Chromium机制，不新增依赖），记录 baseline SHA/命令/fixture/raw logs到独立资格报告。Core 残余成本/guard/内存超出必须 STOP 决策，不直接改代码救测量。

**PR1 固定640性能**：production只能改 `game-libs/map/src/semantics.ts`、`game-libs/map/src/runtime.ts`、`game-libs/map/browser/map.browser.js`、`game-libs/map/browser/map.css`；tests只改/增 `game-libs/map/test/*`、`test/map-layering-browser.test.mjs`、`test/map-viewport-pr0*.test.mjs`。保留现有640数据/像素 oracle；引入§4 chunks/visuals 和§6 raster/Map-private paired stage，固定640默认仍可在仅当前业务/旧输入情形运行。PR1须先验证 dense schema/640 pixel parity、camera-only tile work0及640 refresh gate；不声称动态尺寸已PASS。

**PR2 dynamic**：production除PR1范围，仅允许 `examples/essentials-v21.1/`与 `examples/essentials-v21.1-local/`的具体页面/CSS组合（先核对真实repo路径，不存在则 STOP）、测试受控 fixtures；消费已经通过C1的 `scope.viewport`，按§1/§3动态camera/settle/size、§8中途motion/resize。不得改 packages/**、Core wire/renderer、importer、Content。PR2须取得所有尺寸功能/视觉、payload、retry、内存/latency资格。

**PR3 qualification-only**：仅 test/harness/ledger 或针对PR2已允许的Map bug fix；修bug后更新 executable SHA并重跑所有受影响门槛。必要命令按已有 `package.json` 事实：`npm test -w @loomrealm-game/map`、`node --test test/map-layering-browser.test.mjs`、`npm run test:m11`、`npm run test:m13`、`npm run test:m14`、`npm run test:m15`、`npm run docs:check-links`；新增两个 PR0 harness 用 `node --test test/map-viewport-pr0*.test.mjs`（**当前不存在，PR0须先创建**）。所有结果只对同一最终 executable/cohort SHA有效。不得改既有测试assertions或删性能 gate求绿；需 Node20/24、Hostra/Chromium和原M14本地材料按各自ledger补证据。

## 12. 验收顺序与所有权

```text
Core C0 external compat + cross-review → Core Docs Freeze SHA
Core C1 coherent corrected-/1 implementation + Core conformance on executable SHA
Map PR0 baseline + exact dense feasibility/prototype + Core/M13/Browser residual diagnosis
→ 完成本合同 schema/算法/反证复核、Map Docs Freeze SHA（不要求未来PR1/PR2性能PASS）
Map PR1 fixed640 chunk/raster + baseline parity/performance
→ Map PR2 dynamic viewport + paired stage/motion + 1080 real-product tests
→ Map PR3 latest executable SHA full gates + affected milestone requalification
→ 只有资格 ledger 完成才可产品 Closed
```

PR0可与C1并行准备纯 prototype；只有C0签署后的Core实施可声称修订`/1`符合规范。**Map Docs Freeze不等于PR1/PR2性能通过；PR0仅负责设计可行性和识别阻塞，真正目标性能只在实现后验收。** 任何设计性 blocker 必须回到设计负责人修本文，不能由实现Agent猜。

## 13. 单项阶段 exit / STOP 报告格式

每个阶段报告必须包含：`base SHA / head SHA / allowed diff inventory / exact fixtures / commands / raw logs / expected vs actual / gating result / blockers / next permitted stage`。PR0失败时提交 data shape/bytes、Core full-state与M13 compare CPU、Browser paint/Canvas peak和单时钟trace，然后STOP；PR1不保640 pixel或<50ms→STOP，PR2混帧/resize不正确或guard/内存超标→STOP，PR3历史测试或P95不达标→STOP且保留FAIL，不得宣称冻结设计自然等于PASS。

## 14. Freeze 签署门槛

**Core Docs Freeze**仅由[Core ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)拥有，必须真实compat owner/date/evidence/conclusion、SSOT cross-review与docs SHA；本文件不代签。**Map Docs Freeze**另需：本合同及motion子规范没有矛盾；§4所有 exact schema 与原像素oracle完成反证复核；§8 source/async/standing/rebase可由现有 Map-private DOM 实现、无需改Frozen M13；§10 PR0可行性报告提供dense1080 bytes + Core/M13 residual + Browser/Canvas baseline并确认无阻塞；§11所有路径/harness/测试实际存在或在指定 PR 新建；归档 reviewer/date/docs SHA。尚未获得证据前始终 **Draft / Map Freeze HOLD**，不可直接把本候选交低判断力Agent做完整生产实施。
