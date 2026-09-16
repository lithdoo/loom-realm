# Map Game Library 设计

> 层级：Game Library 设计  
> 状态：**M14 first-slice fixed-640 implementation/design historical Frozen；current executable requalification pending；dynamic viewport/performance extension Draft / Map Freeze HOLD**  
> 首次landing：根目录 `M14_01_WORKSPACE_BOUNDARY.md`–`M14_05_QUALIFICATION_CLOSURE.md`  
> 唯一M14资格：[m14-qualification](../../30-implementation/m14-qualification.md) · [ADR0032](../../decisions/0032-game-library-example-boundary.md)  
> 新候选：[map dynamic viewport/performance draft](../../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md) · [ADR0037](../../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> 最近复核：2026-09-16

**以下 first-slice固定640事实为已实现的历史基线，不是对未来候选dynamic viewport的永久限制；两个阶段的状态不能互相覆盖。** Map是game-domain consumer，不是framework module：Framework owns authority/transport/general read-only viewport capability；Map owns tile-RPG camera, world/projection, resource, raster/Canvas and game-specific policies。Core revised Profile `/1`与Viewport v1尚未 Frozen/实现，不声称map已支持动态视口；旧 `/2`方案被ADR0037撤销。

## 1. Package identity/dependency

```text
RMXP/Essentials source semantics
→ selective importer consumer projection
→ prepared FSDB / M12 ContentClient
→ game-libs/map / @loomrealm-game/map Runtime
→ public @loomrealm/subsystem Input/Render/(candidate)Viewport
→ M13 map-owned browser Web Components
```

Package exports：runtime root/default SubsystemDefinitionFactory、`@loomrealm-game/map/browser/map.browser.js` classic JS、`@loomrealm-game/map/browser/map.css`；prepared Content使用package subpaths，不reach private dist。Runtime只import public Subsystem，不依赖DOM/Renderer/Main/Platform/tooling；Browser仅拥有`lr-map-view`/`lr-map-sprite`、private Canvas/slot/sprite/PresentationResourceClient，不取得业务authority或Content credentials。M14 qualification test-owned Chromium harness可复用受治理M13 internals作为测试设施而非production author seam；Desktop Window belongs M15。

## 2. Selective source facts

首slice只投影 `Map/{id}`的`tileset_id,width,height,data`和`Tileset/{id}`的`id,tileset_name,passages,priorities`。`Map.data` RGSS table `dimensions=3,xSize=Map.width,ySize=Map.height,zSize=3,index=x+y*xSize+z*xSize*ySize`。未消费events、BGM/BGS、encounters、autotile names、terrain、MapInfo/Metadata等留在lossless/importer证据；真实行为需要时才小幅新增。Runtime不得接收Ruby/Marshal/RMXP decoder wrappers，不造MapNormalizedV1、universal map/repository schema。

## 3. Frozen M14 first-slice gameplay/baseline（historical）

Initial params `{mapId,x,y,characterName}`，direction down=2、pattern0。Frame activate→load/validateMap/Tileset/resource versions→Frame-bound keyboard.event listener→one RenderDomain→publish initial full state→Frame remains pending。Non-repeat Arrow key→one tile attempt→facing/passability/x-y/camera→RenderDomain update；blocked changes facing only。Passage bits down0x01/left0x02/right0x04/up0x08，layers z2→1→0 and source direction + target reverse passability。原first slice不含event collision/through/terrain/transfer；后续业务文档另拥有transfer/movement/autotile扩展。

First-slice fixed viewport：tile32 CSSpx，viewport640×480，nominal20×15，example CSS固定 host尺寸，Runtime无DOM resize observation。Camera：`cameraX=clamp(playerX*32-304,0,max(mapW*32-640,0))`、`cameraY=clamp(playerY*32-224,0,max(mapH*32-480,0))`；可见projection包含所有与viewport相交的tile，包括非对齐camera额外边行。Canonical `(10,8)→(11,8)` player screen origin `(304,224)`、camera `16→48`，背景左移32。

One business RenderDomain/opaque SDK wire id；managed tree `lr-map-view → lr-map-sprite`，View data为map/camera/resources/visible tiles，Sprite为world/screen/direction/resource。Ordinary walking使用Frozen M11 `update`、structural/new scene使用`replace`；无map-specific delta protocol。Old Browser实现View 640×480 Canvas full clear/draw retained tiles order、Sprite sheet crop；0transparent、≥384 regular tileset、48..383 autotile不要求首slice CI。Async decode必须按latest RenderData/generation检查，不能凭resource version equality绘旧camera。

## 4. Proposed dynamic viewport extension（consumer-owned / not implemented）

[dynamic draft](../../../examples/essentials-v21.1-local/MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md) owns default640×480、cap320×240..1920×1080、100ms settle、camera anchor/ProjectionWindow、8×8×3 chunks、1 overscan、196608B map guard、sceneEpoch/visualEpoch、WC private two-stage/single-paint sync、rAF placement-only/dirty autotile/overlap reuse、PR0性能gate。It **consumes** revised `scope.viewport` over single Profile `/1`，不使framework了解tiles/chunks、window DOM API、map gameplay或example letterbox。具体产品布局由example/page owns；测试Renderer source观察与map WC实际content box的关系。

Viewport observation独立InputTarget不意味着允许Frame gameplay mutation；map callback只能基于已提交world facts做presentation projection，绝不从resize启动movement/collision/transfer/call。现有example `game.json`仅map，menu/dialog不是当前已接受该slice需求；future hold→child overlay→timer behavior需要独立真实consumer acceptance/evidence和必要时独立最小lifecycle review，不能假设必须新增Framework Frame API或通过viewport绕过gate。Frame/Runtime terminal cleanup与late async inert仍需当前实现测试。

WC pair async prepare与Store author原子性不同：map own View/Sprite必须保留旧完整stage，直到同scene/visualEpoch双方ready在同一JS task切换；WC physical retry已交付数据，不依赖same-G reconnect重发 equal RenderData。该逻辑完全位于game library，不需要Renderer ACK/store rollback或通用layer manager。

## 5. Scope discipline / qualification

首slice预算：small Map/Tileset validators、tableAt/passability、computeCamera、projectTiles、renderState、one definition/twoWC/browser JS CSS/test composition。新扩展仅根据PR0证明添加current ProjectionWindow/chunks/raster/epoch/private stage，不建MapRepository/Bundle、GameLibrary framework、AssetManager、SceneGraph/LayerManager、PlayerController、Context service、generic responsive viewport、Tick/EventQueue/Universal schema。

旧M14 qualifying facts留在 [m14 ledger](../../30-implementation/m14-qualification.md)；新的Core `/1`视口资格看 [dedicated ledger](../../30-implementation/viewport-profile-v1-qualification.md)，Map PR0与Map Freeze看 dynamic draft，不用旧M14 PASS推断1080p和Browser性能已通过。未取得Core Docs Freeze/usable implementation、新payload/CPU/latency证据前，dynamic设计保持Draft/HOLD。