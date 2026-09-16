# Map Game Library 设计

> 层级：Game Library 模块投影；状态：**历史 M14 fixed640 已实现；新的动态视口/性能方案为 Design candidate / Map Docs Freeze HOLD / Not Implemented**。M14/M15的当期正式资格看各自ledger。2026-09-16。
> 当前唯一新主合同：[Map 机械实施合同](../../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)；[Map-private motion子规范](../../../examples/essentials-v21.1-local/MAP_VIEW_SPRITE_MOTION_STAGE_CLOSURE.md)仅细化其§8，不是另一个协议。Core [ADR0037](../../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) · [corrected `/1` ledger](../../30-implementation/viewport-profile-v1-qualification.md)。历史M14：[ADR0032](../../decisions/0032-game-library-example-boundary.md) · [qualification](../../30-implementation/m14-qualification.md)。

## 1. Boundaries

```text
RMXP / Essentials material → selective importer projection → prepared FSDB / Content
→ game-libs/map @loomrealm-game/map Runtime (world, movement, camera, projection)
→ public @loomrealm/subsystem Input / Render / candidate readonly Viewport
→ Frozen Renderer Store / M13 Projector
→ map-owned lr-map-view > lr-map-sprite ShadowDOM, Canvas, private stage
```

Framework仅拥有general authority/transport/readonly Viewport；Map独占tile-RPG business、min/max/settle、camera、chunks、resource-specific raster/placement/epochs、两WC physical stage。Core没有map术语、Main不存size、Renderer Store/M13不增加map快路/ACK；Map Runtime不读取DOM/Main/Data/Content credentials。Browser不成为world/transfer authority。Current product指定document layout viewport，但具体 `Window.innerWidth/innerHeight`和example centering/letterbox归physical composition，不升通用wire。

Package exports root SubsystemDefinitionFactory及classic JS `@loomrealm-game/map/browser/map.browser.js`、CSS `@loomrealm-game/map/browser/map.css`；Runtime只依赖public Subsystem，Browser只用M13 resource context和自身ShadowDOM/Canvas。Importer不因为改viewport而增加universal map schema/event interpreter。M14 test-owned Chromium harness可复用测试设施但不成为production author seam。

## 2. 历史已实现 first slice 不可误标为新功能

历史first slice初始参数`{mapId,x,y,characterName}`、tile32 CSSpx、fixed640×480、anchor304/224；Map/Tileset按既有 FSDB读，Frame内一个RenderDomain，tree=`lr-map-view > lr-map-sprite`，Input non-repeat Arrow尝试一步、passability/camera/Render最新状态。后续 walking、layering、autotile、transfer有各自已治理需求/实现；其250ms cadence、latest-state transport coalescing、transfer失败不能因为viewport改造而改变。现有Browser会因camera rAF反复清理/遍历/绘制640 Canvas，现有Runtime仍是 `VisibleTile[]` 和无 `scope.viewport`；旧资格与历史refresh P95=96.3ms FAIL均不能证明当前新候选已实现/达标。

## 3. 新候选职责与精确委托

新[主合同](../../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)独占：default640、map cap320×240..1920×1080、100ms trailing settle、viewport read/subscribe安全初始化、camera公式、8×8×3 chunks+1chunk overscan、当前窗口used-tile紧凑visual table、<196608B MapView data guard、scene/visual/motion identity、128MiB Canvas/256MiB total estimated pixel memory、dirty autotile/overlap raster、private-only DOM layering、pair commit/retry和测试。冻结前**不得凭此前的短草案要求实现者选择`TileVisual`、Sprite fields、站立/重基准算法或时钟**；它们已在主合同§4/§8中给出候选精确语义，并须由PR0反证/负责人签署。

Viewport observation不mint Frame gameplay mutation/InputTarget/Activation；resize只重算已提交world的presentation。现example只有map，没有accepted menu/dialog held-input需求，不因假想overlay扩公共Frame生命周期。Map Frame terminal必须取消其订阅/timer/async。M13不保证View/Sprite同时回调；配对Stage用map-private motionId与相同scene/visual，保留旧完整stage到双方ready才同一task切换。Frozen walking允许背压合并中间未显示transition：必须记录suppressed、保证最新状态收敛和无混帧，不得发明逐步replay/ACK或与旧行为冲突的zero-skipped-steps指标。Frozen walking的receipt clock要求图片decode不延长250ms；新pair统一最早receipt而非ready后重新计时。

## 4. 无循环交付/冻结状态

```text
Core C0: external /1 compat签署 + cross-review → Core Docs Freeze
Core C1: corrected /1 current cohort implementation + revised conformances/regressions
Map PR0: production-zero feasibility：固定dense1080 exact bytes、Core full update、M13 equality、
         Browser baseline、private CSS stacking pixel proof、128/256MiB、真实Map002/066证据
→ design owner复核主合同与子规范、签 Map Docs Freeze SHA（无须PR1/PR2性能PASS）
Map PR1: fixed640 chunk/raster/paired stage +640 parity/performance
Map PR2: true dynamic viewport、in-flight resize rebase、720/1080 real product
Map PR3: same executable SHA M11/M13/M14/M15 + product latency/memory/pixel gate
```

PR0的720/1080若仅synthetic/prototype必须写`prototype-only`，不能冒充真实产品；PR0不要求尚未实施的camera-only 0 tile draws、full P95 PASS。目标性能属于PR1/PR2/PR3，**不是Map Docs Freeze的循环前置证据**。PR0缺真实local FSDB、schema超guard、独立Core/M13瓶颈或private-only layering不可行，必须STOP而不能签Freeze。Source code和newPR0 harness、文件边界、具体fixture/命令及STOP模板见主合同§9–§14。

历史M14 ledger、Core revised `/1` ledger、Map PR0证据和PR3最终qualification各管自己的状态；没有新实现/测试/负责人签署时持续HOLD。禁止 Map Repository/AssetManager/SceneGraph/LayerManager/Environment/通用Tick或把游戏策略上移Core。
