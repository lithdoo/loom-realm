# Map View / Sprite motion + viewport stage — Freeze closure

> 状态：**Map design candidate / Map Freeze HOLD / Not implemented or measured**  
> 所属：`game-libs/map`/Essentials consumer，细化 [dynamic viewport/performance draft](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md) §5–§9；不更改 Core Profile、Render Update v1、Projector、Web Presentation API。  
> 目的：关闭 ordinary movement `visualEpoch` 不变、但 View 与 Sprite `receiveRenderData` 并非同时到达时的 physical mixed-frame 风险。PR0/PR2验证前不声称同步/延迟已 PASS。

## 1. 三种不同身份（全部属于 Map 私有数据，不是 Render revision）

```text
sceneEpoch  仅成功替换 map scene 时增长；Runtime instance 内不可复用/回绕
visualEpoch chunk refresh、accepted resize或 scene replacement时增长
motionId    每次 Map 接受的新 movement step 分配唯一正安全整数；
            本次 step 的 source/target/朝向/cameraMotion 与 SpriteMotion共享此 ID
```

`visualEpoch` **不得**为了每个 ordinary movement 递增；`motionId` 不是 chunk identity、Render Update revision、Data G、Renderer Store commit或跨WC ACK。Map Runtime在一次成功提交的 `RenderDomain.update` 中，把同一 `(sceneEpoch,visualEpoch,motionId)` 放入 View 与 Sprite **map-owned RenderData**；即使 camera在地图边界静止，View仍接收本次新 `motionId`，双方才能对同一运动显式配对，不能从“上次DOM当前值”推断另一端收到更新。Sprite必须显式携带 `sceneEpoch`，不能仅以可能重复的 `visualEpoch`配对跨scene状态。新scene initial motion用`null`，不能靠缺省ID猜测运动。

完成步进的 standing/facing/阻挡方向更新不是新movement。**Sprite-only立即提交的充要条件：当前已接受 View 确为静止、没有正在进行或待提交的 camera/motion pair、该Sprite update不更改 camera/viewport/scene/visualEpoch。** 若 previous camera motion仍进行，即使本次 View数据没有变化，也必须等待对应accepted motion到达completion boundary，再同步切换standing Sprite，不得造成“人物站定但背景还在移动”的混帧。Standing伴随camera correction则走成对完整stage。连续step B可在A未被Browser接受时到达：B为latest desired，A未提交候选废弃；完整跳格仍由既有walking/movement latency资格约束，不能把A丢失算作性能PASS。

## 2. 唯一 desired 与已显示 stage

父 `lr-map-view` package-private coordinator 持有：

```text
latestDesired = (current component identity, sceneEpoch, visualEpoch, motionId|null)
acceptedStage = last completely visible View + Sprite pair
pendingView / pendingSprite = at most latest matching desired candidates
```

`current component identity`只沿已有 M13 managed DOM identity/lifetime，不读取Main/Data G/Store internals或credentials。候选必须同sceneEpoch/visualEpoch，有运动时还须同motionId；View-first或Sprite-first均只登记pending而不自行开始rAF或Sprite animation，保留旧完整stage。新desired使旧pending/rAF/late async inert；即使两个callback在一个JS task按顺序到来，也不得在第一回调里单边paint。Sprite-only standing/facing例外必须通过§1静止条件，否则排队直到pair完成/被新desired安全替代。

## 3. Acceptance / shared clock / paint boundary

在同scene、同visualEpoch、同motionId的 View和Sprite均通过private resource/geometry prepare，且仍连接于**同一已管理的父子元素**时：

```text
prepare View + Sprite detached (async allowed)
→ latest identity/desired recheck
→ one synchronous JS task, no await or rAF between halves:
     commit private View raster/clip/placement
     commit child-owned private Sprite crop/pose
     acceptedStage = matched pair
→ next animation frame reads one shared Window performance.now() sample
     apply camera & sprite interpolation using identical logical progress
```

Parent仅改自己ShadowDOM/Canvas并调用child明确的package-private commit；child只改自己ShadowDOM/Canvas。不得改M13-managed attrs/data/lightDOM/order，也不加generic WC bus、Store ACK或cross-child transaction。Animation `startTime`取**配对stage接受后的同一帧时间基准**，不得各自用data callback timestamp先跑。共同monotonic clock仅限同一Browser Window；真实product stimulus→paint仍用Hostra harness单一时钟，不能跨进程相减。

Viewport/window stage在旧motion中途插入时，取**旧已显示stage在切换帧的camera及Sprite screen pose**作连续视觉起点，用新窗口canonical target camera/screen pose重基准；不能跨scene保留旧像素/资源。若现有map-private motion数据不足以连续重基准，PR0/PR2报告设计缺口并重审插值，不可用瞬移或改Core协议遮盖。新scene transfer以fresh sceneEpoch/visualEpoch完整replace/prepare，旧完整stage在新pair ready前保持但不能混用旧map pixels。旧资源promise、Renderer/DOM component退休、disconnect/terminal后不得复活旧candidate。

## 4. Failure and boundedness

父子任一prepare失败→保持最后完整stage，对已经交付latest RenderData做WC local bounded retry，不等待same-G reconnect重复投递equal data；更晚desired取消旧retry。每端pending至多latest一个，旧detached Canvas/resources受Window lifecycle/current scene+window memory bound管理；不能一半先显示，也不能建立无限待处理队列。fresh Session/G旧element universe卸载，新组件在新pair ready前完全不显示；不跨identity复用old stage。

## 5. 必须测的 Map conformance（非 Core conformance）

- Camera移动和camera-clamped movement：双方同motionId，分别View-first、Sprite-first，只有共同ready后才开始；静止camera仍不得死等旧View callback。
- Step A→B快速到达：只接受latest matching pair，old async/rAF不覆盖，真实trace不得无故跳过完整步进。
- 运动中640→720 resize、chunk refresh及scene transfer：同task完整stage切换、共享时间/连续重基准、无混帧/边缘seam/跨scene像素。
- Standing、blocked facing、turn buffer：当View/Camera truly static才允许Sprite-only；camera motion未结束时holding站姿到completion boundary；若发生camera correction须成对stage。
- Prepare error、late resource、unmount、same-G reconnect equal data、freshG/Session：local retry/fencing、无old stage泄露，帧截图/trace证明zero mixed pair。
- CPU预算：motionId驱动View callback不得重复chunk validation/raster；计入Map PR0的Browser unchanged-content成本和Core `RenderDomain.update()` full-state validation residual。

本文件仅关闭**候选语义**；motionId的精确TS model/implementation/测试必须纳入主Map draft再做Map Freeze。menu/dialog held input属于未来独立consumer/lifecycle需求，不借此上移Core Frame API。
