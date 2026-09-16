# Map View/Sprite 成对运动：主合同 §7–§9 的私有实施细则

> 状态：**Map design candidate / Map Docs Freeze HOLD / Not implemented or measured**。唯一上级：[Map 机械实施主合同](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)。本文件只拥有Map-private paired stage state-machine细节；一旦与上级或Frozen walking/Render/M13相抵触立即 STOP 请求设计修订，不得自行决定。Core/Profile/Input/Frame/Projector接口不变。

## 1. 精确身份与既有语义

```text
sceneEpoch  Runtime内初始1，仅成功scene transfer递增且不回绕
visualEpoch Runtime内初始1，仅chunk refresh/accepted resize/transfer成功递增
motionId    初始null；每次成功walking step分配唯一positive safe整数
pairToken   (actual same managed parent/child HTMLElement universe,
             sceneEpoch,visualEpoch,motionId|null)
```

Runtime对一次成功`domain.update`分别给View和Sprite写入匹配的三字段token。若camera clamp不动也改View.motionId，使M13按JSON structural change交付新回调；sceneEpoch必须在Sprite上明确存在。CameraMotion和SpriteMotion必须都null或都non-null且各自id=motionId、durationMs=250。普通步进不增加visualEpoch。Failed候选不能成为已提交id/epoch；fresh Session/G新元素绝不复用旧stage。

**Frozen walking §3允许backpressure时跳过尚未发出/尚未呈现的中间transition，保证latest-state convergence，而非每步重放。** 如果A从未可见而B更新成最新目标，可废弃A的pending画面并记录`suppressed-before-paint`；不能伪装为完整逐步播放，也不能引入ACK/replay queue。已经显示的A画面不能由A的late async覆盖B。保持逻辑250ms step timer和world coordinates已提交的规则。

## 2. 唯一 MapView parent-coordinator 状态

```ts
type State='EMPTY'|'VISIBLE'|'PREPARING'|'RETRY_WAIT'|'DISPOSED';
// Private to current lr-map-view instance:
// desiredView?: {data, receivedAt, token}
// desiredSprite?: {data, receivedAt, token}
// acceptedPair?: {token, canvases, sprite, motionStart, motionEnd, displayedPose}
// candidateView?, candidateSprite? (at most one latest per endpoint)
// sequence, parentRaf, retries (at most one timer)
```

两个`receiveRenderData`回调各自先exact validate，再提交parent的自己一端latest data及同一Window `performance.now()` receipt时刻，更新sequence令所有早期promise/candidate/rAF inert。若两端token不匹配，只保留旧完整acceptedPair/EMPTY，不让一端独自开始physical paint或motion；一旦matching则根据两份latest data**重建**当前sequence的配对候选。由于第二个callback也会更新sequence，允许重建，不得把已作废的第一个异步prepare误判为current。准备完成前再检查same element identity/isConnected/desired token/sequence，方可commit；不能凭同资源contentVersion/JS对象 identity冒充current。

历史M13同值不会自动再次`receiveRenderData`；WC-local retry必须用已经收到的latest数据，不以same-G carrier重连充当重试通知。Parent不得读取Renderer Store/Main/Data G私有对象；只读其被管理的实际DOM parent/child关系和自身Map render data。

## 3. 一次同步paired physical commit

```text
EMPTY + 仅一端→PREPARING，初始整组隐藏
VISIBLE + 更新→PREPARING，保留上一份完整可见pair
同pair最新token、两端资源/bitmap/depth raster ready、still connected
→ 同一JS task且两个commit之间不能await/rAF：
   parent swap自己的ShadowDOM canvases / viewport clip / 私有stylesheet
   child通过Map-package-private method swap自己的ShadowDOM sprite bitmap/pose
   更新acceptedPair并fence所有旧候选
→ parent拥有唯一后续rAF；child无独立motion rAF
```

不改parent/child的host `this.style`、M13-managed attrs/data/lightDOM/children/order。Parent自己的Shadow CSS `::slotted(lr-map-sprite)`规则给slotted Sprite host设置position与动态zIndex，Child只改自身Shadow canvas位置；和tile depth canvases共用stacking context。深度关系与样本的确切oracle归主合同§4/§6，PR0若private CSS无法满足像素遮挡，冻结继续HOLD，不能让Agent私改Host。Fresh element universe尚未complete pair一律不显示、旧元素不得迁移。

**Sprite-only standing/facing fast path全部条件**：accepted View的cameraMotion=null、parent没有任何active/pending paired animation、新data不改scene/visual/viewport/camera且Sprite motion=null。任一不满足（含camera clamp但逻辑step仍有motion）则等paired stage或当前motion完成；绝不能Sprite已站定而背景继续移动。站立需要同时停止camera时使用完整pair。

## 4. 250ms receipt clock / decode catch-up（不得延长已Frozen步时）

已冻结walking要求“image decode不能重新开始250ms”，所以**不要在双方准备完成的第一帧设`startTime=now`**。同一match token的第一端`receiveRenderData`回调时，由parent记录`pairReceivedAt`；第二端回调沿用此相同起点。即使候选在等待资源时sequence重建，也不重置同pair第一receipt。Pair在t准备好时立刻采用`p=clamp((performance.now()-pairReceivedAt)/250,0,1)`；若准备耗时≥250ms直接target，不多播250ms。下一次parent rAF仅取一份Window `now`，camera/sprite/depth用同一p执行Frozen lerp→round；同pair不许以各自callback/解码时刻启动两个时钟。与原walking“两端可差一帧”的物理 seam只改为same-pair共同起点，**不改变逻辑移动节奏、pattern或transport latest-state coalescing**。`motionEnd=pairReceivedAt+250`。

当当前pair运动中途收到同一motionId的新visualEpoch（resize/chunk refresh）时，在将要切换的共同帧t读取旧pair**实际上已显示**camera/sprite screen pose/pattern/depth作为新`from`，target由最新world+accepted viewport计算。两端共享`remainingMs=max(0,oldMotionEnd-t)`以及同一rebase时刻t；remaining=0直接完整target。若后续step B插队，则从旧可见pose向B target，时长=250ms，起点=B pair第一receipt（decode不得延长）；A未显示的pending可废弃并计数。若当前`acceptedPair`不存在，**没有合法old visible pose**：第一次完整匹配stage一准备好就显示latest authoritative target，不捏造看不见的A/B source，记录`initial-motion-not-shown`。如果旧pair存在但已被同scene较新的standing覆盖，standing的完整commit可按Frozen walking直接snap target并一起取消camera/sprite rAF，不允许只停一边。

Scene transfer不跨场景lerp/复制像素；旧完整scene保留到fresh scene两端ready，新pair同task整体换入。Old scene/tile/resource work在scene/identity转换之后一律inert。DPR-only不触发logical stage/canvas backing rebuild。

## 5. Retry/terminal/boundedness

任一最新pair图片/prepare失败，旧完整acceptedPair保持（初始则保持全隐藏）；进入RETRY_WAIT，100、200、400ms各重试一次**共最多三次**。每次核latest token/sequence/element currentness，期间更新/terminal/disconnect取消旧timer。三次失败停止retry、记录资格FAIL、旧pair保持/EMPTY；只有更晚真实data或fresh组件才重新候选，不无限自发retry。每端最多一个candidate，只有当前scene/window有效资源，stale `ImageBitmap.close()`/detachedCanvas释放；Canvas/decoded估算峰值限额见主合同§5。Parent disconnect/Runtime terminal取消rAF/retry并fence all async；不改Core Store/RenderEvent/ACK。

## 6. Exhaustive regression vectors（Map-owned, not Core）

| 输入/到达顺序 | 唯一结果 |
|---|---|
| View先/Child后，或Child先/View后 | 先保持旧完整pair，两端ready后一次同步切换 |
| Camera clamped的新step | View.motionId仍变化，收到双回调并共享250ms clock |
| 两端之间decode慢>250ms | 最初receipt计时，直接target，不新增250ms |
| Step A pending、B更新 | A候选作废；B从可见pose连贯到latest，记录suppressed；无旧pair则latest target |
| Active camera时收到standing | paired停止或completion boundary，不能Sprite单边停 |
| Active motion中accepted viewport | 旧实际显示pose→新target，用remainingMs；无mixed尺寸 |
| Transfer A→B→A | fresh scene双资源stage，旧pixels不可进入新scene |
| 两端prepare一端失败 | 保留旧完整pair/EMPTY，三次bounded retry，耗尽FAIL |
| same-G reconnect equal full data | M13无需回调，WC自有retry；无连接级恢复依赖 |
| Fresh element universe / disconnect / late image | 旧候选与旧rAF永不影响新元素 |
| DPR-only/仅autotile帧变化 | 不改logical viewport/camera motion；dirty autotile另计 |

Pixel/trace必须证明zero mixed stage、zero stale override、latest convergence；丢失的中间transport transition以suppressed counter如实记，不再施加与Frozen walking相矛盾的“所有step都必须完整显示”门槛。完整功能/性能与终局PASS归主合同§9–§14和各资格ledger，本文件仅候选设计，不是假称已实现。
