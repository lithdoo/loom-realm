# Map View / Sprite motion + viewport stage — Freeze closure

> 状态：**Map design candidate / Map Freeze HOLD / Not implemented or measured**  
> 所属：`game-libs/map`/Essentials consumer，仅细化 [dynamic viewport/performance draft](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md) §5–§9；不更改 Core Profile、Render Update v1、Projector、Web Presentation API。  
> 目的：关闭 ordinary movement `visualEpoch` 不变、但 View 与 Sprite `receiveRenderData` 并非同时到达时的 physical mixed-frame 风险。PR0/PR2 验证前不声称同步/延迟已 PASS。

## 1. 三种不同身份（全部属于 Map 私有数据，不是 Render revision）

```text
sceneEpoch  仅成功替换 map scene 时增长；Runtime instance 内不可复用/回绕
visualEpoch chunk refresh、accepted resize或 scene replacement时增长
motionId    每次 Map 接受的新 movement step 分配唯一正安全整数；
            本次 step 的 target/源/朝向/cameraMotion 与 SpriteMotion共享此 ID
```

`visualEpoch` **不得**为了每个 ordinary movement 递增；`motionId` 不用来验证 chunk identity、Render Update revision、Data G、Renderer Store commit 或跨 WC ACK。Map Runtime在生成一次 accepted `RenderDomain.update` 时，把同一 `(sceneEpoch,visualEpoch,motionId)` 放入 View 与 Sprite **map-owned RenderData**；即使 camera 被地图边界 clamp 而静止，View仍接收该次 step 的新 `motionId`，使双方对同一次运动有明确配对观察，不能靠“上次 DOM 当前值”推测对方已收到。Sprite RenderData 需显式包含 `sceneEpoch`以避免仅 `visualEpoch` 数值碰撞时把跨 scene 的 Sprite配给 View。新 scene 初始 motion 用 `null`，不凭 ID 猜测有运动。

完成步进的 standing/facing/阻挡方向更新不是新 movement：本次 physical rendering可使 Sprite单独更新不变的静止 View；**任何需要 camera 与 sprite 同步位移的新 step 都必须有成对 motionId。** 如 standing 完成同时产生 camera correction，则该次 correction走成对的完整 stage 而不是更新 Sprite后单独移动 View。Runtime已提交后的连续 step B 可以在 step A尚未被 Browser接受时到来：B成为最新 desired，A的未提交视觉候选废弃；完整跳格仍由既有 walking/movement latency 资格约束，不能用此规则把 A 丢失称为性能合格。

## 2. 唯一 desired 与已显示 stage

父 `lr-map-view` package-private coordinator 持有：

```text
latestDesired = (current component identity, sceneEpoch, visualEpoch, motionId|null)
acceptedStage = last completely visible View + Sprite pair
pendingView / pendingSprite = at most latest matching desired candidates
```

这里的 `current component identity`来自现有 M13 current DOM identity/lifetime，业务不读取 Data G、Store internals、Main或 credential。候选必须同 sceneEpoch/visualEpoch；有 motion 时还须同 motionId。一个 WC回调先于另一回调时只更新 pending，不启动自己的 camera rAF 或 Sprite animation；保留旧完整 stage。新 desired 到达使任何旧 candidate/queued rAF/late async inert；在同一 JS task 内收到新的 RenderData仍不允许单边 paint。纯 Sprite-standing/facing 且 View不变可同步更新 Sprite静止形态，但不得制造 camera/motion的另一半。

## 3. Acceptance / shared clock / paint boundary

在同 scene、同 visualEpoch、同 motionId 的 View和Sprite均通过 private resource/geometry prepare且仍连接于**同一已管理的父子元素**时：

```text
prepare View + Sprite detached (async allowed)
→ latest identity/desired recheck
→ one synchronous JS task, no await or rAF between halves:
     commit private View raster/clip/placement
     commit child-owned private Sprite crop/pose
     acceptedStage = matched pair
→ next animation frame reads one shared Window performance.now() sample
     apply camera & sprite interpolation using the same logical progress
```

Parent仅修改自己 ShadowDOM/Canvas并调用 child 明确的 package-private commit；child只改自己 ShadowDOM/Canvas。不得改 M13-managed attrs/data/light DOM/order，也不加入 generic WC event bus、Store ACK或 cross-child transaction。Animation `startTime`取**配对 stage 接受后的同一帧时间基准**，不得一方按自己 data callback timestamp先跑。共同 monotonic time 仅限同一 Browser Window；真实产品 stimulus→paint P95仍使用 Hostra harness单一时钟，不跨进程相减。

如果该次 viewport/window stage 发生在旧 motion 中途，先取**旧已显示 stage在切换帧的 camera 与 Sprite screen pose**作为视觉起点，并用新窗口的 canonical target camera/screen pose重基准；不能把上一 scene 的像素/资源跨 scene保留。若 existing motion schema不足以表达连续重基准，Map PR0/PR2 应报告设计缺口并重审 map-private interpolation，不可通过瞬移或改 Core protocol掩盖。新 scene transfer用 fresh sceneEpoch+visualEpoch 完整 replace/prepare，旧 stage在新完整 stage ready前保持；新场景资源不得和旧地图像素混用。新的 image/resource promise、Renderer/DOM component retirement、disconnect/terminal后不能复活旧候选。

## 4. Failure and boundedness

父子任一 prepare失败→保持最后完整 stage，对已经交付的 latest RenderData 使用 WC local bounded retry（不得等待 same-G reconnect的 equal data重投递）；更晚 desired 来到时取消旧 retry。每端 pending候选至多一个 latest，旧 detached Canvas/资源受 window lifecycle和当前 scene/window memory bound管理。若最新 desired迟迟不能准备，不允许一半先呈现、也不得用无限待处理队列来保序。若旧 stage已经因 fresh Session/G element universe被卸载，新组件初始完全不显示，直到新 pair ready；不能跨 identity复用 old private stage。

## 5. 必须测的 Map conformance（非 Core conformance）

- Camera移动与 camera-clamped movement：两端收到同一 motionId，按 View-first、Sprite-first 顺序仅共同 ready后启动，静止 View 情形不得死等旧 callback。
- Step A→B快速到达：只接受 latest matching pair，旧 async/rAF不可覆盖；在真实 trace 中完整步进不得无故跳过。
- Motion进行时 640→720 resize、chunk refresh与 scene transfer：共同 stage只在单 task 切换，插值同一时间基准，无混帧、边缘 seam、跨 scene pixels。
- Standing、blocked facing、turn buffer与相同 Camera情况下的 Sprite-only update：保留已显示 View，合法更新且不误造 movement。
- Prepare error、late resource、unmount、same-G reconnect equal RenderData、fresh G/Session：local retry/fencing、无旧 stage泄露；记录帧截图/trace证明零 mixed pair。
- CPU预算：motionId的 View callback不能造成重复 chunk validation/raster；计入 Map PR0 的 Browser unchanged-content work及 Core `RenderDomain.update()` full-state validation residual。

本文件只关闭**候选语义定义**；`motionId` 的精确 TS model/implementation/测试需要 Map draft正式吸收后才能勾选 Map Freeze。不要把未来 menu/dialog held input作为当前只有 map 的 example 必选门槛；真实新增 consumer 时独立做 lifecycle review。
