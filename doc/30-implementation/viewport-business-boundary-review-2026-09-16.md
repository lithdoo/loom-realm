# Viewport Core / Map 业务边界 Review — 2026-09-16

> 状态：Review completed / ownership corrections recommended；**不构成 Docs Freeze 签署**  
> 审查 subject：`d0ab971d4df8626973afe0f2274b4e6a643d2c1c`（docs-only）  
> 范围：ADR0036、Viewport State v1、Renderer Data Profile v2、两份 conformance、viewport-capability、Subsystem model、protocol layers、system overview、qualification ledger、map dynamic draft；对照 ADR0032、实际 example game.json/presentation.css、Subsystem/Map public API。  
> 审查主题：是否将一个地图 consumer 的 policy、物理产品选择、功能测试、生命周期/性能目标错误提升为所有 LoomRealm consumer 的 Core 契约。本报告仅记录审查，不修改 Frozen v1 contracts、可执行代码或现有 live qualification。

## 1. 总结：保留一个真实的 Core gap，但不得上移整套地图功能

保留 Core 最小共性：Renderer→Subsystem readonly retained viewport geometry；与 User Input/InputTarget 独立；`scope.viewport` Runtime lifetime；exact Data profile v2、current authority/fresh carrier、bounded latest-state publication；Subsystem 原有 Render API 继续拥有业务 Render commit。以上都是**跨角色互操作必须共享**的事实，不是地图专属算法。ADR0032已规定 Framework 不反向依赖 game-libs，map 拥有 Runtime/Browser 业务实现。

地图专属：`640` fallback、`320×240..1920×1080` cap、`100ms` settle、camera anchor、tile/chunk 8×8/overscan、payload `196608 B`、movement/transfer、autotile、View/Sprite `sceneEpoch/visualEpoch`、Canvas/rAF/atomic physical stage、P95 gate、PR0。它们应留在 `game-libs/map` 设计与 example/product qualification；不能变成 Core protocol、Main authority或通用 Frame API。

**Audit disposition：** 有清楚的边界上移/证据过度宣称，不能仅因为 CF-01..07文本已修就签署 Core Docs Freeze。以下按责任归属记录；并不要求撤回 ADR0036、新增多版本协商或重写 Frozen v1。

## 2. BB-01 — P1 / Core Freeze 修正文：产品 `/2` 部署策略被写成 formal Profile MUST

**位置：** `doc/15-contracts/renderer-data-profile-v2.md` §2/§8、`renderer-data-profile-conformance-v2.md` §1、Viewport qualification ledger §2；ADR0036/architecture也多次复述。文本要求 target subject **所有** current Subsystem DataAuthorities一律 `/2`。这其实是当前 product rollout/implementation subject 选择，不是任意符合 `loomrealm.renderer-data/2` 的 endpoint 必须对其他所有连接做的约束。Main 依据每个 `(S,G,P)` 选择 identity、Broker只 exact pair、Profile replacement fresh G才是真正的通用契约。

**修正建议：** Formal Profile v2只规定“当 DataAuthority 选择 `/2` 时双方必须完整实现四 child并按 exact `(S,G,P)` 安装”；Main拥有 profile selection 的 authority不变。将“本次 canonical product所有 authority采用 `/2`；不 fallback、不随 subsystem name/map presence动态选择”放入 `doc/30-implementation/viewport-profile-v2-qualification.md` 或现有 Desktop product composition SSOT，由 product integration tests锁定。Conformance拆成 protocol identity tests与 product policy tests。无需因此新增 feature flags/negotiation；只取消把一次迁移政策当成版本固有语义。

## 3. BB-02 — P1 / Core Freeze 修正文：Window 采样方式被嵌入 Core wire contract

**位置：** `viewport-state-v1.md` §1/§5、ADR0036 §1、`viewport-capability.md` §3、protocol layers §5、system overview §4、Viewport conformance §6，直接以 `current document layout viewport = Window.innerWidth/innerHeight floor`定义所有 Core v1 consumer 的尺寸。当前 Desktop/PWA Web realization使用该尺寸可以成立，但 `innerWidth`是当前产品的 physical source/布局绑定，而不应要求协议实现读取特定 DOM API。尤其“窗口尺寸 == 业务实际获配的可视内容尺寸”只有当前全窗口布局符合时才成立；host content box、sidebar或多 pane的等价性不能从这句话自动推出。

**修正建议：** Core contract固定一个**由当前 Renderer composition明确指定**、单一 logical presentation surface 的 `positive safe integer CSS logical width/height`、同一 Renderer的 `/2` peers看到同一 observation、独立 Input/Frame，且不能静默在一个 participant内变换 surface identity。当前 Desktop/PWA physical realization/qualification单独固定这个 designated surface为 document layout viewport并采用 `innerWidth/innerHeight`；若只打算支持 Web-document layout viewport作为 v1根本兼容身份，也可保留当前限定，但必须在 ADR 中明示这是有意的 Web-only compatibility scope，不是因 map needs 自动推导的 universal surface。不要因此设计 surfaceId、多窗口 router、WC→Runtime DOM feedback或新 Environment 服务。产品测试必须证明 observation与真正分配给 map presentation的 content box/letterbox policy相容。

## 4. BB-03 — P1 / Core 正式规范去业务化：map gameplay规则进入了 Viewport contract/conformance

**位置：** `viewport-state-v1.md` §5直接写 `map Frame / player movement / collision / transfer / Frame call`；`viewport-state-conformance-v1.md` §5要求 map + child menu/dialog并检验 movement/collision/transfer；`viewport-capability.md` §6和 `subsystem-model.md` §3复述同一地图特例，protocol layers §5也写 movement/transfer。通用契约确实需要保证 viewport不创造 InputTarget、Activation或 mutation permit，但没有理由让 Viewport child protocol认知玩家/碰撞/场景转移。

**修正建议：** Core formal contract只保留“Viewport observation独立 Input gate；接收 observation本身不会授予 Frame mutation/input authority、不修改 Render desired state”；Core conformance使用两个 synthetic Subsystems/Frames证明非 InputTarget Runtime仍接收 geometry且 InputTarget/Interest不变。地图被菜单遮挡时是否继续走、held direction/timer如何处理，仅在 map movement/dynamic draft及 M14/M15 consumer qualification中证明。`subsystem-model`可表达通用 mutation-gate不变量，不列游戏机制；`viewport-capability`去掉 map-specific STOP policy及 WC raster-retry（后者归 M13/map Browser）。ADR Context保留 map作为证据可以，但 Decision条款不应拥有 map algorithm。

## 5. BB-04 — P1 / Map Freeze gate 归属：尚不存在的 menu/dialog 被当作当前实现的强制生命周期新能力证据

**现实对照：** `examples/essentials-v21.1/game.json`目前只有 `{key:"map"}`；`MAP_BEHAVIOR_REQUIREMENTS.md`明确菜单/NPC对话不是该 slice验收条件。Map dynamic draft §7的 MF-01发现真实风险：`finishStep`可能持有方向并自动链下一步，而 `Frame`公开 API没有 suspend getter/event。该风险值得记录，但“当前 map+menu production consumer已证明 Core必须新增生命周期 API”尚未成立。

**修正建议：** 分三层隔离：Core viewport conformance用 synthetic Frame/InputTarget变化验证 geometry不受 gate；当前 map PR1/PR2按已接受 gameplay需求验证不在 viewport callback里触发 gameplay，且 frame terminal/late timer安全；真实菜单/child overlay加连续按键的暂停语义等到有明确 consumer/acceptance后在独立 map movement/lifecycle review处理。MF-01可以记录为独立 movement/integration blocker，**不得未经 consumer proof 就把“新增通用 Frame lifecycle author API”作为 viewport/Core Docs Freeze条件**；是否仍阻塞全部 Map Freeze，需由现行 map验收范围判定而非默默扩大需求。禁止猜测 `frame.signal= suspend`、直接探测 Main/DOM、或通过 viewport绕过 gate。

## 6. BB-05 — P2 / Performance evidence 分层，勿将实现容量变成通用协议参数

`viewport-state-conformance-v1.md` §3的 blocked writer + `>1024` resize来自当前 `packages/data/src/runtime.ts` 的 `MAX_PENDING_SENDS=1024`，作为当前 executable stress fixture合理，但 Frozen Profile v1只要求队列 bounded而不指定统一 capacity。规范核心应是每 carrier至多一个 Viewport admitted/in-flight和一个 pending latest、burst本身不线性积累、恢复后最终收敛；`1024`留在当前实现压力测试参数而不成为协议可观察阈值。共享 writer fairness仅保证 Viewport自身不得造成永久饥饿；不得为地图尺寸抖动引入 generic priority scheduler。

地图 PR0 的 1080p bytes、`RenderDomain.update()` final-state residual、`receiveRenderData()`与 Canvas latency仍严格是 Map Freeze条件，不能写成 Profile v2/Viewport v1已通过的性能承诺；现有 map draft的分层基本正确。

## 7. 哪些不属于上移（应继续保留）

- `viewport.state` exact `{type,width,height}`、Renderer→Subsystem方向、validation、fresh-carrier baseline/last observation、Data-only protocol-fatal：跨角色可观察的 Core contract。
- Runtime-scoped `scope.viewport.current/subscribe`、同步首发/异常隔离：公共 API 和 race safety；不会因目前只有一个 map consumer就退回 `x.*.state`。
- 一个 Renderer participant单一 logical viewport：**明确限定的 v1 compatibility scope**，不是地图 `320..1920` policy；但 physical choice必须说明由谁绑定。
- Per-carrier bounded latest-state slot：防 shared Data writer背压，是新 child自身质量/安全义务，不是地图的 100ms settle。
- `sceneEpoch/visualEpoch`、parent/child同一 paint提交、tileVisuals/chunks/camera/raster：map-private；没有提升为 Render Update wire revision或 framework ACK。
- 不增 Main geometry mirror、不改 Frozen User Input/Render/Connection v1、不增 Environment manager/feature negotiation：边界正确。

## 8. Minimum follow-up / Freeze disposition

1. 修改 Profile v2 normative contract/conformance，分离 `P` 的 Core选择权限与 canonical product `/2` rollout test；同步 ADR/architecture/ledger位置。
2. 明确单一 surface的抽象含义与当前 product Window采样绑定边界；补 product content-box/letterbox consistency case，不新增 surface路由。
3. 从 Viewport formal contract/conformance及 system architecture删掉 map movement/collision/transfer、地图专用 STOP policy；保留 generic Frame mutation/input authority不变量；地图规则只归 map文档。
4. 将 MF-01按“已证实的 current acceptance vs future overlay behavior”重新归类；不可仅因尚无菜单便认定 generic lifecycle Core缺口已证实，也不可掩盖实际计时器风险。
5. 更新原 Core Freeze Review 与 qualification ledger，记录本轮边界审查的 disposition/docs SHA；cross-review PASS后才签 Docs Freeze。Map仍需要 PR0与自身现行范围内的 correctness evidence；没有运行可执行/Hosted测试。

**本轮结论：Core抽象本身未发生重大越界，但部分 Product rollout、Web physical binding、map gameplay acceptance被写成 Core `MUST`/conformance 或 Freeze 前置；必须做文本归属收缩。Review ≠ fix/Freeze/Implemented。**
