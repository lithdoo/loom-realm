# Map View/Sprite motion-stage 实施细则（主合同 §7–§9 的子规范）

> 状态：**Map candidate / Map Docs Freeze HOLD / no executable PASS**，2026-09-16。
> 唯一上级：[动态视口与性能主合同](./MAP_DYNAMIC_VIEWPORT_PERFORMANCE_REFACTOR_DRAFT.md)。本文件不改变 Core、Frozen Render/Web Presentation、walking/transfer 的 authority；不独立发布 Freeze 或设置另一套性能门槛。若与主合同相抵触 STOP，由设计负责人同步修订，不留给实施者自行选择。

## 1. Identity 和受保护的 walking 语义

```text
sceneEpoch     初始1，仅成功 scene transfer 增，Runtime 内正安全整数不可回绕
visualEpoch    初始1，仅成功刷新chunk/accepted viewport/transfer增
motionId       初始null，每次成功movement分配唯一正安全整数；standing/transfer为null
paired token   (current HTMLElement universe, sceneEpoch, visualEpoch, motionId|null)
```

View 与 Sprite 必须同时拥有 sceneEpoch/visualEpoch/motionId。View 的 cameraMotion 与 Sprite 的 motion 都必须同为 null 或同为 non-null；non-null 的 `id=motionId`、duration=250。Camera 被 map edge clamp 时 View 数据的 `motionId` 仍改变，保证 M13 两端都收到新数据；仅改变 `motionId` 不允许触发静态 chunk 重验证/raster。Frozen walking `MAP_WALKING_ANIMATION_DESIGN_DRAFT.md` §3 允许尚未 emitted 的中间步进被 latest state coalesce，不承诺拥塞下逐步完整播放；本次实施**不新增 replay queue/ACK**。因此旧文档里的“B替代A却不得丢任何完整步进”的矛盾已裁定：A尚未真正 accepted/paint，则可记 `superseded-before-paint`，只保证 latest world/presentation 收敛及无 mixed stage；不得把它统计成“每步完整播放”的 PASS。Frozen 250ms logical step cadence、held direction/blocked/transfer均不修改。

## 2. 一份由父 MapView 拥有的物理协调状态

```ts
type StageStatus='EMPTY'|'VISIBLE'|'PREPARING'|'RETRY_WAIT'|'DISPOSED';
interface PairToken {
  readonly sceneEpoch:number; readonly visualEpoch:number;
  readonly motionId:number|null;
}
// MapView private: status; desiredView?; desiredSprite?; acceptedPair?;
// candidateView?; candidateSprite?; localSequence; parentRaf?; retryAttempt;
```

Component universe 来自当前 managed parent + direct slotted child 的实际 DOM identity/lifetime；不得读取 Main/Store/Data generation 私有状态，也不能跨 fresh Session/G 元素复用 stage。每端 `receiveRenderData` 先 exact validate，将最新 data 交 parent private coordinator；parent 记录各端 latest desired 并令 `localSequence++`，使以前开始的异步准备/queued rAF失效。同一 token 的 parent/child 数据在两个回调都到达前不能单侧 paint；任一先到只进入 PREPARING，保持旧完整 acceptedPair。若新 callback 在旧图片解码期间出现，用 latest 两份 desired 从头检查匹配并重新准备，禁止旧 promise凭resource identity恰好相等覆盖新状态。`desiredView`/`desiredSprite`各保留最新一份，candidate各最多一个，不能积压历史队列。Exact matching 是同一 HTMLElement universe 与同一(scene,visual,motion)，不能只看 visualEpoch。

**Structural-equal data没有强制 M13 重投递**：失败只能用本 WC已收到的数据做有界私有retry，不能依赖同 G carrier reconnect、重复 `receiveRenderData`或访问 Store。

## 3. Parent-owned paired commit（两个 WC 可以先后到达）

```text
EMPTY + first endpoint → PREPARING; entire map stage hidden
VISIBLE + new desired → PREPARING; keep previous complete stage
matching latest desired + both detached preparations ready + same connected pair
→ one synchronous JS task (no await/rAF split):
     swap parent-owned depth canvases + viewport clip/dimensions
     call child's explicitly package-private commit for its own Shadow canvas
     update acceptedPair and invalidate older private work
→ next parent requestAnimationFrame reads performance.now once
→ camera and sprite compute one identical progress and apply their own private placement
```

Child不得在自己的 data callback、资源 resolve 或独立 rAF中先启动动画。Parent只操作自己的 ShadowDOM/style 和调用 child private method，Child只操作自己的 ShadowDOM canvas；**不得写 `this.style`/host attrs、M13-managed lightDOM/children/order**。Parent 私有 `::slotted(lr-map-sprite)` CSS rule 提供 sprite-host z-index（动态改的是 parent-owned stylesheet，不改 host），child Shadow canvas负责内部绝对定位。Tile layers与 Sprite按主合同 tileDepth*2 / characterDepth*2+1 同一 stacking context交错；Chromium pixel oracle不匹配则 STOP，不能“临时”回到 host `style`写入。初次 pair未ready不显示单边，fresh element universe不显示旧 universe canvas。

当 M13 仅回调 Sprite 的 standing/facing 值，允许不等待新 View 回调的 **全部**条件：已接受 View 在 t 确实 cameraMotion null、当前 parent 无 active/pending pair、View的 scene/visual/viewport/camera本次未改变且 Sprite motion=null。其他情形绝不走 Sprite-only fast path；相机虽然数值clamp不动、但其 cameraMotion 非 null 的 step同样必须成对。上一个 camera motion未结束时，standing必须等待其完成边界或在同一配对 commit 中同时停止 camera 与 Sprite；不得出现 Sprite已站定但背景继续走。该 fast path不为普通新 movement 提供单侧启动捷径。

## 4. 共享时钟和确定性重基准

Parent仅持有一条当前配对 rAF 和该配对 `startTime/endTime`。两端不得继续使用当前旧 Browser 的独立 `acceptMotion(...performance.now())` 时钟。新的 paired motion在**第一次共同帧**取一次 `t=performance.now()`，记录 `startTime=t`、`endTime=t+250`；每帧同一 `p=clamp((now-startTime)/(endTime-startTime),0,1)`，camera/sprite分别按 Frozen 规则 lerp→round；layering sprite visualPixelY等亦使用同一个 p。资源准备时间不反向更改 logical step timer，最新数据比旧更重要；首次 render赶不上250ms时仍须正确最终收敛/记录 latency，不宣称所有步进完整呈现。

中途 accepted viewport/chunk refresh，但**仍属同一 active logical step**：在即将切换的共同帧 t，先用旧 accepted pair 当前实际 p 计算已显示 cameraX/Y、sprite screenX/Y、pattern、visualDepth；以这些 CSS logical coordinates为新的 paired `from`，新 viewport+authoritative target为共同 `to`；`remainingMs=max(0,oldEndTime-t)`，双方同一 remainingMs，值为0则直接显示最新target。若新 callback 表示**后续新 step**，从上个已显示 pose重基准到最新 step target、duration重新为250ms；任何未显示的旧候选废弃，`superseded-before-paint`计数增加。Scene transfer不能跨不同 map scene插值：保留上一完整stage直至新 scene资源双方ready，在一个 task原子替换全 scene，旧像素绝不能进入新 stage。最新 standing按 Frozen 规则可以直接 snap target，但**必须在配对切换时一起取消旧 camera/sprite motion**，不能只更新一边。

Newer token、component disconnect、fresh generation/Session universe、Frame/Runtime terminal均 cancel parent rAF/retry、`localSequence++` fence async；late tasks不得复活旧 stage。DPR-only不能触发新 logical stage、改变canvas backing尺寸。

## 5. 有界失败处理与内存

任一 endpoint prepare error：保持上一个已接受完整 stage（如果初始为空则保持全隐藏），同latest data进入 RETRY_WAIT；等待 100/200/400ms 分别retry，最多三次，任何 newer callback/terminal/disconnect使旧 retry失效。三次仍失败→明确FAIL并保持旧pair或EMPTY，不无限重试，不改authoritative Store，也不要求相同 data重发；新实际 data或fresh元素才有新候选。Parent/Child pending各最多一个latest；旧 detached canvas/image资源及时 release/`ImageBitmap.close()`，两级内存门槛取主合同 §5，包含旧+候选同时存活的峰值。

## 6. 硬验收（非 Core Conformance）

测试同一个 real Chromium M13 managed tree，固定 View-first、Sprite-first、camera clamped、standing while camera active、两段 step A→B被transport coalesce、resize中途连续rebase、chunk refresh、scene transfer、image failure三次耗尽与后续新数据恢复、disconnect/reconnect/fresh G、DPR-only、priority0..5/equal-depth/tall-sprite。截图/trace须显示：zero mixed stage、zero stale overwrite、final latest world/camera/pose convergence、no old scene resource leakage。对于被coalesce的 logical step只记录 `superseded-before-paint`，不可一边允许合并、一边坚持每步播放 gate。PR0完成前本文件仅为候选设计；PR1/PR2/PR3在同一新 executable SHA得到证据后才可谈实施合格。未来 menu/dialog 不作为现有 map-only viewport 任务隐藏验收项。
