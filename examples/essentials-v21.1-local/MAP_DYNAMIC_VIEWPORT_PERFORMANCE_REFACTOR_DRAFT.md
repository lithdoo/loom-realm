# Map 动态视口与大屏性能：机械实施合同候选

> 状态：**Map Docs Freeze APPROVED (design/test contract only) / Not implemented or product-performance qualified**；2026-09-16。本文为 Map viewport/performance 唯一主实施合同。PR1/PR2/PR3 可按 §11 文件边界实施；冻结不等于代码或 640/720/1080 P95 PASS。签署见 §14 与 [freeze review](./MAP_VIEWPORT_DOCS_FREEZE_REVIEW_2026-09-16.md)。
> Core：[ADR0037](../../doc/decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)、[Profile `/1`](../../doc/15-contracts/renderer-data-profile-v1.md)、[Viewport v1](../../doc/15-contracts/viewport-state-v1.md)、[Core ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)。继承 Frozen [Render Update v1](../../doc/15-contracts/render-update-v1.md)、[M13 Web Presentation API](../../doc/15-contracts/web-presentation-api-v1.md)、[walking](./MAP_WALKING_ANIMATION_DESIGN_DRAFT.md)、[transfer](./MAP_TRANSFER_DESIGN_DRAFT.md)。[Map-private motion-stage 子规范](./MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)仅细化本文 §8，不是独立上层合同；若冲突 STOP 交设计负责人同步。旧 Profile `/2` 已撤销，不发布/不实现。

## 0. Agent 只能机械实施

任何无法同时满足本文、Core/Frozen contract、已接受业务需求的情况 **STOP + exact fixture/trace + 文件和原因 + 请求设计修订**。Agent 不能自行改 schema/算法/性能数值/文件范围、放宽 byte/depth limits、关 autotile、用 mock 替代 product gate、修改 Framework/Importer/Content/M13 Projector、增加 Event ACK/replay queue、generic Chunk/Layer/Environment manager、从 DOM 反向改业务 authority。Docs Freeze、代码完成、M11/M14/M15 资格是不同状态；全部 PASS 必须来自同一新 executable/coherent build SHA，旧历史数据不能迁移。

## 1. Boundary、viewport source、resize

```text
Current Desktop/PWA product document layout viewport (Window.innerWidth/innerHeight)
→ Core corrected renderer-data/1 Viewport State v1; independent of InputTarget
→ Runtime-scoped readonly scope.viewport
→ Map local accepted size / camera / world / ProjectionWindow
→ ordinary RenderDomain.update/replace
→ Frozen Renderer Store + M13 projector
→ managed lr-map-view > lr-map-sprite
→ map-private detached complete pair, single physical stage commit
```

Framework/Main 不存 map size/camera/chunks；例子页面拥有 centering、CSS map allocation、letterbox，**Window viewport不保证等于 WC content box**。Core只提供一个原始 CSS logical size；Map `DEFAULT={width:640,height:480}`、min320×240、max1920×1080，每轴 clamp后等值不提交。Frame/world/content/初始 RenderDomain/movement owners 创建完成**之后**注册 `scope.viewport.subscribe`；初读 `scope.viewport.current ?? DEFAULT`，同步首发同值 no-op，初读→subscribe间不同 latest必须收敛。null/fallback不回写 Core；resize callback只依据已提交 world truth投影，不触发 movement/collision/transfer/call。Frame terminal退订、取消所有 map timers/later async；未来 menu/dialog 不在当前 map-only消费者范围，不借此扩 Frame API。

第一次合法不同尺寸可在安全 movement boundary直接尝试；其后 resize burst **100ms trailing latest wins**，active logical step只存最新 pending并在 step completion boundary author commit；已经显示的 camera/sprite motion按 §8 物理连续 rebase。DPR-only不更改logical尺寸或scale backing。当前页面须实测 layout viewport→map allocated content box/overcap letterbox关系；低于 min 的输入按 Map policy clamp，物理页面负责不拉伸/不露空白。

**三种不同 latency bucket**：ordinary=input captured→首个正确运动像素；refresh=合法非resize refresh trigger→对应新像素；resize-end-to-paint=最后一个合法 raw resize事件→相应尺寸两WC共同首次呈现，包含100ms settle、只单列报告，不受refresh 50/75/100ms约束。测试不得用 resize 伪装为 short refresh。

## 2. Frozen gameplay 和拥塞裁定

保留 walking 250ms/格、世界坐标 step start 已变 integer target、held direction priority、stop/collision standing、step timer、transfer原有行为/失败结果。Frozen walking §3与Frozen Render允许背压合并**尚未 emitted 的中间运动**，所以“所有 logical steps 全部完整显示且零跳过”不是既有能力，本改造**不做可靠动画命令队列**。如果 A 从未显示且 B 是更晚 desired，A 的 private pending stage可被B取代；记录 `superseded-before-paint`，B必须从最后真实可见 pose向最新 authoritative target**连续**收敛，若没有旧可见 pair则初次全stage准备完成时直接显示最新 target并记录 `initial-motion-not-shown`，不能从不存在的 pose推测。不得一边允许跳过A、一边用“每个step都必须播完”为硬 gate。已经呈现的像素绝不与另一个motion/scene混帧；old async/rAF不能回盖。Standing按 Frozen walking在最新 complete paired stage可cancel并snap target，但不得 Sprite 已停而旧 camera继续。新方案只改变两WC的**物理成对起动**，不改变 logical step clock或因 image decode 加长250ms。

Map transfer仍是同一个Frame、target完整validate/read→一次完整Scene RenderDomain.replace→成功后更新world；失败 MAP_TRANSFER_FAILED且不得半加载 target、A→B→A固定fixture。Resize没有 gameplay authority；Core viewport独立InputTarget不授予suspended Frame mutation permit。

## 3. 精确几何与事务

常量：`TILE=32; CHUNK=8×8×3; CHUNK_OVERSCAN=1 chunk; VIEW_DATA_GUARD=196608 bytes`。

```ts
anchorX=Math.floor((viewport.width-32)/2);
anchorY=Math.floor((viewport.height-32)/2);
cameraX=clamp(playerX*32-anchorX,0,Math.max(map.width*32-viewport.width,0));
cameraY=clamp(playerY*32-anchorY,0,Math.max(map.height*32-viewport.height,0));
minX=Math.max(0,Math.floor(cameraX/32));
maxX=Math.min(map.width-1,Math.floor((cameraX+viewport.width-1)/32));
minY=Math.max(0,Math.floor(cameraY/32));
maxY=Math.min(map.height-1,Math.floor((cameraY+viewport.height-1)/32));
```

640×480 必须退化为 304/224 anchor；覆盖地图四边、小地图、奇数尺寸、motion source+target的可见bounds union。Required tile bounds→包含这些 tile 的 chunk coords→周边扩1完整 chunk→map边界clamp，Y/X顺序固定。运行时**仅当前**ProjectionWindow，重叠块复用同一 frozen object，仅entering投影一次、leaving drop，evicted再次进入允许重算；不得map-wide历史块/像素缓存。

所有路径先局部构造 `candidate {loaded,world,acceptedViewport,window,sceneEpoch,visualEpoch,motionId,RenderData}`，按§4 exact schema与§5 guard验证，再在 existing RenderDomain一次同步 update/replace成功后才推进以上本地 authority；失败所有旧world+Render state不变，不能先推进player、epoch或pending resize，不能偷偷减少overscan。Movement一次 update只更新View camera/motion/motionId及Sprite pose/motion/motionId，不重投影chunks/visuals、不重复map端JSON.stringify；refresh/resize一次update更新双方同visualEpoch；transfer一次full replace新scene，绝不能复用旧scene像素。任何Core `RenderDomain.update`全状态验证开销**必须量测而不能跳校验**。

## 4. Map-private RenderData：完整封闭类型

`ResourceRef`沿用现有精确 `{namespace:string,key:string,contentVersion:string}`；Input/Render wire不增加kind。View与Sprite各为一个既有RenderNode的**closed own-key `data`**，无“existing fields”占位。Tile visual仅列**当前块实际使用**的非0 tile id，不为整个Tileset完整列表上传浪费bytes。

```ts
type VisualRegular=readonly [tileId:number,depthBias:number,kind:0,sourceIndex:number];
type VisualAutotile=readonly [tileId:number,depthBias:number,kind:1,slot:number,
  tlSx:number,tlSy:number,trSx:number,trSy:number,
  blSx:number,blSy:number,brSx:number,brSy:number];
type TileVisual=VisualRegular|VisualAutotile;
type ProjectedChunk=Readonly<{chunkX:number;chunkY:number;cells:readonly number[]}>;
type CameraMotion=Readonly<{id:number;durationMs:250;fromCameraX:number;fromCameraY:number}>;
type PlayerMotion=Readonly<{id:number;durationMs:250;fromY:number;fromScreenX:number;fromScreenY:number}>;
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
  x:number;y:number;screenX:number;screenY:number;
  direction:2|4|6|8;pattern:0|1|2|3;
  sprite:ResourceRef;motion:PlayerMotion|null;
}>;
```

`sceneEpoch/visualEpoch`初始=1，在一个Runtime内严格单调正安全整数、不可wrap/reuse；scene仅成功transfer增，visual只成功viewport/refresh/transfer增；ordinary movement不增。`motionId`初始/standing/transfer为null，每成功movement分配一次唯一positive safe integer，View和Sprite相同；camera clamp仍必须更新View.motionId确保M13的两个callback实际发生。`cameraMotion`/Sprite.motion同为null或都non-null；non-null时二者id=motionId且duration=250，from values遵Frozen walking。失败candidate不能消耗**已发布**ID。

每chunk `cells.length===192`，索引 `((z*8+localY)*8)+localX`，z0..2、map外padding 0；cell=0或合法tileId，tile1..47 unsupported fail closed；exact required+1overscan chunk set、不缺、不多、不重复，chunkX/Y safe非负按Y/X严格有序。Map.data原布局 `x+y*mapW+z*mapW*mapH`。`tileVisuals`只含全部chunk内所有非0 tileId且恰好每个一次，按tileId严格升序；Browser构建`Map<tileId,TileVisual>`查询，tile0不用entry。regular sourceIndex=tileId-384；autotile slot=floor((tileId-48)/48)、variant=(tileId-48)%48；依现有`autotileCorners`产出tl/tr/bl/br各自sx/sy 8整数。全部字段精确own-key、有限safe范围、真实tile/slot/resource引用、camera viewport/bounds及动画形状须完整验证，不能仅靠TS annotation。Priority0→depthBias=-1、tileDepth=0；priority>0→depthBias=(priority+1)*32、tileDepth=worldY*32+depthBias，严格等于旧 `tileVisualDepth(worldY,priority)`。深度不是CSS z-index：tile canvas zIndex=`tileDepth*2`；Sprite visual depth=`round(lerp(fromY*32,y*32,p))+32+(frameHeight>32?31:0)`，zIndex=`depth*2+1`，同深度Sprite在上。

还原chunk pixels必须全局先按z0→2、每z按world y再x排序，**chunk Y/X排序只管编码，不代表真实画面叠加顺序**；按tileDepth分桶后每桶稳定保留原(z,y,x)相对顺序，保证legacy priority/autotile/tall sprite pixel parity。TileVisual数组中每一项 exact tuple长度/成员值合法，MapSprite只有上述完整字段集合，不允许额外`progress/elapsed`之类扩展。

## 5. Byte limit、不可规避的中层成本、内存预算

Initial/scene/viewport/chunk refresh的 guard对象是**完整 MapView data object** `TextEncoder().encode(JSON.stringify(data)).byteLength <196608`，严格小于，不把RenderNode外壳计入；ordinary movement map侧不重stringify全部chunks。既有Frozen Render Node data≤262144B、Data unit≤1MiB/depth≤64与其他limits照常完整执行。M13 Frozen JSON structural equality可能在camera-only更新时扫描大数组，必须在PR0单列对新shape测CPU；不可用object identity、跳Projector、修改Frozen equality优化。Core RenderDomain.update full-state validation/snapshot residual也独立拆测；任何独立项本身打破门槛→STOP独立Core/M13 design review，不得在Map刀里偷偷改。

同时存活的 **accepted/visible** stage 所有 Canvas（含 Sprite crop）以`Σ(width*height*4)`估算 backing ≤128MiB。准备中的 detached candidate 可与 accepted 同时存在，以便 failure 保留旧完整画面；**accepted + detached canvases + current scene 已 decode ImageBitmap** 的同一瞬间峰值 ≤256MiB。128MiB 约束的是已显示 stage，不是“禁止第二套 preparing canvases”。不得把 detached 从 256MiB 总预算拿掉，不得常驻 max1080 envelopes 或无限缓存。Initial/steady accepted 必须单独 ≤128MiB。超过任一限额 STOP，提交资源尺寸/深度与峰值数据，不降低语义强行过关。

## 6. Map Browser raster、layering、autotile

Browser对validated `(sceneEpoch,visualEpoch)`缓存chunk/visual indices；motionId-only update**只做motion/placement**，不重validate/raster全部chunks。每depth最多visible+detached各一个Canvas，backing按当前required world pixel bounds分配；refresh将overlap按相同world坐标从旧canvas drawImage复制，entering一次投影，leaving drop；跨scene不能copy。资源bitmap按current scene/version索引，decode failure不改Runtime authority。Autotile `slot→depth→cell→ordered blits`，只在slot frame真的变化时对dirty32×32 cell及必要重叠绘制，tick dedupe；无motion/animated cell不保永久rAF。Sprite同resource+direction+pattern复用crop raster，placement/depth更新不重新设置canvas.width/height或clear。

Camera-only rAF只更新已存在depth layers private CSS world-origin/translate与Sprite private position/depth，**不得 await/fetch/decode/full chunk walk/full validate/canvas width/height/clear/tile drawImage**；真正autotile frame变化的dirty paint单独标记为autotile工作，不得计入camera-only。Canvas scale=1，DPR-only不改变logical backing。任何prepare failure保留旧完整stage、局部有界retry，不靠same-G reconnect等价RenderData重新通知。

**M13边界**：Map不可改Web Component host `this.style`/managed attrs、lightDOM children/order；Parent只改自己ShadowDOM canvases、private CSS rule及slot；Child只改自己ShadowDOM absolute canvas。Parent stylesheet的`::slotted(lr-map-sprite)`规则控制Sprite host定位及 zIndex（改parent-owned CSSStyleRule，不写host style），Child shadow canvas负责screen left/top与crop；所有depth canvas和slotted Sprite在一个stacking context按§4整数深度交错。**PR0必须用real Chromium现有 pixel oracle证明这种 private-only CSS stack 可行；若不成立 Map Docs Freeze继续HOLD/STOP设计修改，不允许Agent回退改host或M13 Projector。**

## 7. 两WC paired commit

每次新scene/visual/viewport/movement要成对改变时，`domain.update`一次同步更改两节点相同`(sceneEpoch,visualEpoch,motionId)`；transfer一次replace。M13 `receiveRenderData`可能View-first/Sprite-first，资源准备async。Parent维护最新每端data和有限候选，**两端都具 matching latest token、resources ready、仍是同一个managed parent+child、before commit重新check** 才在一个同步JS task切换parent depth canvas/clip与child shadow bitmap/pose，再由Parent唯一rAF驱动两端。任一先到只pending/保留旧完整pair；initial未ready整stage隐藏；fresh Session/G新元素不能复用旧stage。Standing Sprite-only仅在View/camera truly static、cameraMotion=null、无active/pending pair且scene/viewport/visual均不变时可同步改变Sprite；其他standing必须pair停止旧camera与Sprite。Same-G reconnect equal full data没有强制M13 callback，私有retry用last delivered data。

## 8. 运动、resize、失败的确定状态机

Parent私有状态=`EMPTY|VISIBLE|PREPARING|RETRY_WAIT|DISPOSED`；最新`desiredView/desiredSprite`、一个`acceptedPair`、每端一个candidate、单parent rAF、`sequence`、retryAttempts。每收到任何一端新data先exact validate并存latest、`sequence++`使旧pending/async/rAF inert；两端token `(actual element pair identity,sceneEpoch,visualEpoch,motionId)`不同就等待，不准第一回调先paint。Matching并prepare完成后，在同一task commit完整 stage；新 sequence/late decode/disconnect不能复活旧stage。

**250ms的起始时间必须保持Frozen walking的 receipt semantics**：同一对匹配RenderData**第一端接收时**由Parent记录`pairReceivedAt=performance.now()`，第二端加入时沿用这个时间（不是重新开始）；资源准备耗时不重置起点。首次共同rAF的 `p=clamp((now-pairReceivedAt)/250,0,1)`，camera、sprite、sprite depth共享同一个now/p；decode已耗250ms→直接target，不额外播放250ms。旧walking两端可独立receipt相差一帧，本次只将起点统一为最早的同pair receipt，**并未延长logical timer或修改Frozen walking允许的coalescing**。若pair token较新取新receivedAt，不从旧episode继承。

中途同一步motion的accepted viewport/refresh：在切换共同帧t先按旧已显示progress读取camera+Sprite screen pose/pattern/depth为新from；target按新viewport和world确定；remainingMs=`max(0,oldMotionEndTime-t)`，两端用相同剩余时长、同一个t作rebase clock，=0则目标直接paint。若更新是新的 step B，则从最后显示pose起、以B第一端receipt time和250ms共同插值到最新B target；A未显示被覆盖则计`superseded-before-paint`。若从未有acceptedPair，不凭A/B from fields捏造画面，初次匹配pair ready直接呈现最新target并计`initial-motion-not-shown`。Scene transfer保留旧**完整**scene到新scene完整ready后同task全部替换、不做跨scene interpolation；standing最新完整pair可按Frozen contract一起snap camera+Sprite target/结束rAF，绝不能单停Sprite。

Prepare失败保留旧完整pair或EMPTY；同latest data在**100、200、400ms**依次retry最多3次，每次核身份/sequence，更新或terminal取消。三次耗尽→保持完整旧画面/EMPTY并明确 qualification FAIL，只有新真实data/fresh元素才能重新开始；不无限排队、不伪造Store refresh。Disconnect/terminal取消rAF/retry，旧ImageBitmap.close和canvas释放。所有物理重试/clock都map-private，不加Core ACK/Render Event。精确矩阵见[motion子规范](./MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)，其必须同步采用**最早receipt**起点及本节的无旧stage首次目标规则。

## 9. Functional & pixel oracle

尺寸`320×240、640×480、800×600、960×540、1280×720、1920×1080`；null/default/sync subscriber/resize latest/noop、4edge、small map/odd、source+target bounds、padding/order、tile0/unsupported1..47/regular/autotile48 variants/priority0..5、overlap+eviction、initial/reconnect/freshG/terminal。Negative exact validator包括extra keys、bad tuples/slots/refs、duplicate/missing/extraneous chunks、nonzero padding、tileVisual set错配、motion pair不同、guard边界；失败不得部分commit。

Pixel oracle沿用 `test/map-layering-browser.test.mjs`：640 ground/overhead、equal-depth/tall-sprite、dirty autotile与从真实图得来的pixel样本；增 parent/child两顺序、static camera也有new motionId、standing while camera moves、step A→B被coalesce、resize中途连续rebase、scene transfer A→B→A、three retries及后续新data、DPR、no mixed accepted stage、旧rAF/async覆盖零。`superseded-before-paint`必须原样报告不要求为0；**零 mixed-stage、零 stale overwrite、最终authoritative state收敛**是硬门槛，不再要求每个被协议允许合并的logical step都播放。`complete visual stage dropped`定义：已经accepted且没有在首次画帧前被更晚authoritative target明确supersede却从未真实呈现，必须0；明确supersede另计不得偷偷掩盖。

## 10. PR0 feasibility vs 完成后的真实性能：解开循环

**PR0发生在Map Docs Freeze前，但只是原型/风险测量，不要求PR1/PR2优化成果已PASS。** PR0 production zero diff，新增`test/map-viewport-pr0.test.mjs`与`test/map-viewport-pr0-hostra.test.mjs` 两个已有tests目录的调查harness，复用 `test/map-layering-browser.test.mjs` 的PNG/Chromium/clock与 `test/m15-hostra-product.test.mjs` 的Hostra fixture/单Browser clock，不新增依赖/修改Framework。构造固定 synthetic dense map：width128、height96、z0..2全非零；每格 tileId `z0=384+((x+y)%8)`、`z1=48+((x+2*y)%48)`、`z2=384+((x+3*y)%8)`，合法Tileset表覆盖0..391、regular384..391 priority依次`0,1,2,3,4,5,0,1`、autotile48..95至少slot0合法；center player(64,48)，还测四边和center→right一格source/target union。固定Resources由现有Chromium PNG generator产生，形状与IDs通过既有validators；若尺寸/source数据无效直接FAIL，不换更稀疏假fixture。**对每个尺寸生成§4完整最新MapView数据**，测exact bytes、完整`RenderDomain.update`验证+snapshot、M13 structural equality（包括同chunks但camera变更）、当前Browser 640 baseline refresh/raster和新private stylesheet z-index synthetic stacking pixel oracle、Canvas/images峰值估算；本地真实Essentials FSDB Map002/066同样报告dense1080数据及真实资源尺寸，材料不可用则记 `LOCAL EVIDENCE MISSING`、Map Freeze HOLD，不以hosted synthetic取代。720/1080未实施的Browser只可标 prototype-only，不能谎称产品性能。

PR0退出条件：exact shape/guard、128/256MiB预算与Chromium private-only stacking可行证据；Core full-state及M13 compare成本单列无无法克服的瓶颈；真实数据和source SHA/commands/raw logs归档。PR0 **不要求**camera-rAF 0 draws、优化后640 refresh P95、真实dynamic720/1080 P95——这些只能在PR1/PR2后测。guard/平台栈/独立Core成本严重不符合→STOP、先设计修订，不能签Map Docs Freeze。

PR1固定640、PR2动态、PR3同新 SHA资格后，真实 Hostra product最终performance gates：

| Gate | 640×480 | 1280×720 | 1920×1080 |
|---|---:|---:|---:|
| ordinary input-captured→first-correct-motion-paint P95 | ≤50ms | ≤50ms | ≤50ms |
| accepted nonresize refresh→first-correct-paint P95 | ≤50ms | ≤75ms | ≤100ms |
| active motion frame >33.4ms | <1% | <1% | <2% |
| mixed/partial stage or stale override | 0 | 0 | 0 |
| camera-only tile draw/clear/resize per rAF | 0 | 0 | 0 |
| exact View data UTF-8 JSON bytes | <196608 | <196608 | <196608 |
| Canvas accepted backing / live canvases+decode peak | ≤128 / ≤256MiB | ≤128 / ≤256MiB | ≤128 / ≤256MiB |

**Latency canonical clock继承现有 M15 Hostra product harness**：同一个真实Renderer Window `performance.now()`记录`input-captured.at`和相应`browser-first-motion-paint.at`，只在同一Window相减；刷新起始mark→新正确paint亦在该Window记录。画面真实正确另用Chromium截图/pixel oracle复验，**截图/CDP传输不插入历史50ms测量口径**；Browser paint mark必须位于实际canvas/placement commit后，不能用`receiveRenderData`到达充当paint。Node/Runner不同进程clock不相减。每档ordinary每轮≥100、refresh每轮≥30、3轮，按现有M15 nearest-rank口径报告各轮与合并P50/P95/max、invalid≤5%、frame>33.4比例与各层CPU拆分；autotile、resize separate buckets也记录P50/P95/max，resize从最后resize event到新stage paint含100ms settle**不受refresh门槛**。附Node/Hostra/Electron/Chromium/CPU/GPU/DPR/map/position/build mode/受治理SHA、raw trace、Canvas/image allocations、M13 compare。旧42.9/96.3ms历史仅作baseline、96.3 FAIL，不能转写新PASS。

## 11. 四刀精确文件边界及命令

Core C0由release owner查external `/1`compat并签Core Docs Freeze，C1按Core ledger协调`@loomrealm/data`/Renderer/Subsystem/Main/product source新实现与Conformance，Map agent不能越界代劳。PR0**只允许**新建两项 `test/map-viewport-pr0*.test.mjs` 及记录调查结果的 `examples/essentials-v21.1-local/MAP_VIEWPORT_PR0_EVIDENCE.md`；不改production、不动既有断言。PR0需先记录实际存在的`npm run build:m14`及`node --test test/map-viewport-pr0.test.mjs test/map-viewport-pr0-hostra.test.mjs`命令、local FSDB材料路径和环境；本轮尚无这两个新test文件，不能冒充已运行。

PR1 production **仅** `game-libs/map/src/runtime.ts`、`game-libs/map/src/semantics.ts`、`game-libs/map/browser/map.browser.js`、`game-libs/map/browser/map.css`，tests仅现有`game-libs/map/test/*`、`test/map-layering-browser.test.mjs`及PR0两个test；fixed640实现§4 exact model/chunks/raster/private stylesheet/paired stage并保持640 pixel parity与refresh性能。PR2 production沿用PR1四文件，额外仅当前具体Example page/CSS（先核真实路径，不存在STOP），消费已通过C1的`scope.viewport`完成动态、settle、mid-motion-rebase；禁止改`packages/**`、framework/wire/importer/Content。PR3只有上述范围bugfix+test/harness/ledger，修bug后更新 executable SHA全量重跑。

每刀必须列`base/head SHA、allowed diff、fixtures/commands/raw logs、expected/actual/CPU/byte/memory、STOP或PASS`。既存命令：`npm test -w @loomrealm-game/map`、`node --test test/map-layering-browser.test.mjs`、`npm run test:m11`、`npm run test:m13`、`npm run test:m14`、`npm run test:m15`、`npm run docs:check-links`。新增两个PR0命令先创建文件才合法。PR1须640 pixel/guard/camera-only gate和640 refresh PASS才能进PR2；PR2须720/1080 real Chromium shape/visual/cost PASS才能进PR3；PR3同executable SHA全回归及正式product performance、Node20/24/Hostra/C1 cohort证据 PASS才能Closed。任何不达标STOP并保留FAIL，不得删测试/提高limit/自行加Core fast path。

## 12. 唯一无循环顺序

```text
Core C0 external compatibility + protected docs cross-review → Core Docs Freeze SHA
Core C1 coordinated corrected-/1 executable + conformance/regression
Map PR0 exact hosted+local dense prototype, Core+M13+Browser residual, private CSS feasibility
→ owner/reviewer sign Map Docs Freeze subject (no post-PR1/2 performance PASS requirement)
Map PR1 fixed640 data+chunks+raster+paired stage +640 parity/performance
→ PR2 true dynamic viewport + rebase + 720/1080 real tests
→ PR3 same latest executable/cohort SHA full M11/M13/M14/M15/Hostra/product gates
→ designated qualification ledgers sign Product Closed
```

PR0 synthetic feasibility可在C1尚未完成时单独准备，但在Core可用与C0合格前不能实现/签署动态产品功能。冻结设计不等于代码/性能通过，不再要求“先PR1性能PASS才准Map Docs Freeze”。

## 13. STOP报告格式

`subject SHA / exact modified files / fixture source and checksum / failing expected vs actual / raw trace / Core or Map owner / recovery decision / new docs subject`。Guard超限须报告真实chunks+tileVisual entries和bytes；Core/M13独立热点须提交CPU profile；layout/pixel失败给截图和stacking tree；运动不连续给old visible pose/new target/receipt clock与frame trace；性能FAIL保留三轮原始样本和完整环境。未获设计负责人修订/Freeze签署不得临场换算法。

## 14. Freeze Gate

Core Docs Freeze只由[Core ledger](../../doc/30-implementation/viewport-profile-v1-qualification.md)拥有，须compat owner/date/evidence、SSOT cross-review、docs SHA；Map不能代签。

```text
Map Docs Freeze: APPROVED 2026-09-16 as design/test contract only
Owner: project owner continuation after PR0 STOP (“继续”) authorizing the §5 accepted≤128MiB / live+decode≤256MiB split
Reviewer: Cursor Grok 4.6
Conflict: the same session authored the §5 wording; freeze signs PR0 numbers + remainder of the original contract, not a second independent author of that paragraph
Evidence: examples/essentials-v21.1-local/MAP_VIEWPORT_PR0_EVIDENCE.md
Review: examples/essentials-v21.1-local/MAP_VIEWPORT_DOCS_FREEZE_REVIEW_2026-09-16.md
docs-only subject SHA: fc0f05c4891cbfb19dc5dd0cadba90b980159568
Not claimed: Implemented, PR1/PR2 product P95, camera-only zero tile draws, PWA
```

Map Docs Freeze covers：本文+motion子规范/已冻结walking/transfer无冲突；§4 schema、§8 receipt clock、§6 CSS z-index通过 PR0 反证；PR0真实hosted及local Map002/066报告含dense1080 exact bytes、Core/M13 full-state/structural equality残余、Browser baseline、128/256MiB和现有Pixel oracle；§11每个入口/文件/STOP合法。**只冻结可执行的设计/测试合同；PR1/2的真实性能PASS属于实施后资格。**
