# Viewport Core Docs Freeze Review — 2026-09-16

> 状态：**Review completed / Core Docs Freeze HOLD**  
> 审查 subject：`8d8523cd0aff48d98b3632a5e7a3a30f5125977a`（docs-only main）  
> 范围：ADR0036、`viewport-capability.md`、`viewport-state-v1.md`、`renderer-data-profile-v2.md`、`subsystem-model.md`、`renderer-subsystem-protocol-layers.md`、`system-overview.md`；交叉核对 Frozen Control/Connection/Profile v1、两份 conformance、map draft、当前 `packages/data` 和 map Runtime。  
> 本报告记录审查结论/开放项，不替代正式契约、资格 ledger 或 executable PASS；未修改任何 Frozen contract 或宣称新能力已实现。

## 1. 审查结论

**方向成立，尚不满足 Core Docs Freeze。** Authority owner 一致：Main 只拥有 DataAuthority/profile，Renderer 观察唯一 presentation surface，Viewport State 是 Renderer→Subsystem retained geometry，Subsystem 提供 Runtime-scoped readonly `scope.viewport`，业务拥有 camera/projection；Viewport 不复用 User Input 的 InputTarget/Activation/Interest。单一 surface v1、冻结 profile `/1` 与显式完整 profile `/2` 是必要且足够窄的兼容边界；没有证据需要 Environment service locator、Main 转发、ACK、跨 child transaction、多 surface 或 profile negotiation。

**不能把设计上的尺寸正确性当成性能已实现。** `/2` 解决非 InputTarget Frame 收不到尺寸及避免永久 max-1080p envelope 的结构问题；camera rAF、chunk refresh、Browser raster、Core full-state validation 仍由 map PR0/PR1 实测与实现证明。当前 profile `/2`、Desktop source、Main `/2` selection 均尚未实现；没有新测试 PASS。

## 2. Core Freeze blockers

### CF-01 — P0：Docs Freeze 与 executable evidence 的先后顺序冲突

`viewport-profile-v2-qualification.md` 指定 Docs Freeze → implementation subject → executable qualification；但 `viewport-state-conformance-v1.md` 把可执行证据写为「Freeze 前必须具备」，且 Freeze packet 要求 Node/Hostra 版本和 raw PASS logs。按字面会要求在允许实现前先通过实现测试，治理路径形成环。

**修复：** conformance 文档的 Freeze 前要求限定为 **complete executable-ready test specification / expected assertions**；raw PASS、subject SHA、运行环境和 artifact 是 **implementation qualification/closure packet** 的要求。ADR0036、Core ledger、两份 conformance统一措辞；Docs Freeze 不需要伪造 executable PASS。记录 docs-only freeze SHA，随后实施，再在新 executable SHA 下按 ledger 收集 evidence。

### CF-02 — P0：Viewport latest-wins 尚未成为有界发布保证

Viewport contract §3 允许 `MAY coalesce`，Desktop source也多处使用 SHOULD；Profile v2 只复用 bounded shared writer。当前 `packages/data/src/runtime.ts` 的 `MAX_PENDING_SENDS=1024`，超出会以 local-fatal 结束 Data。若 resize burst 对每个样本都调用 sender，不能仅凭「message 很小」认为不会阻塞 Input/Render；既有 100ms map settle 发生在 Subsystem，不能消除 Renderer→Data 方向的队列压力。

**修复：** Viewport child sender 对每一 current carrier **MUST 只有至多一个尚未提交 shared writer 的 pending latest size**，新 legal sample 覆盖它；已提交 writer/已 emitted 的 application unit不能撤回/重排。fresh carrier 必须交付该 carrier 最新合法 baseline；中间 resize 可省略，最终合法值在 carrier 可写时须收敛。不得因普通合法 resize burst 触发 writer-overflow Data fatal、无界积累或永久饿死既有 Input/Render。把「blocked writer + >1024 resize + Input/Render traffic + release」加入 conformance。不要给 Profile 引入通用 priority scheduler 或改变 frozen v1 writer。

## 3. Core specification closure（需解决后才能签署 Freeze）

### CF-03 — P1：Frozen `/1` 文本与 `/2` target 的兼容说明

Control v1 的 `RendererDataAuthorityV1.dataProfile` 正式类型是 `string`，Connection v1明确 profile replacement 使用 fresh generation；因此 **不需要升级 Control/Connection wire**。但 Control v1 §13 与 Connection v1 §6 的 `Phase 1 profile=/1`、Profile v1 中 specialized `dataProfile: ".../1"` 容易与新 canonical `/2` 被读成相互否定。应在 ADR0036/Profile v2/索引增加一处精确 compatibility explanation：旧文中的 Phase 1 是当时实现基线；v1 specialized API 类型只属于 profile-v1 peer；target subject 由 Main 显式选 `/2`，以 fresh generation 迁移。不得偷偷扩大 Frozen `/1` 的 acceptance set。

还须定义在显式 v1 compatibility composition 中新版 `SubsystemScope.viewport` 的可见性：推荐保持 stable capability，未曾收到 v2 state 时 `current=null`、没有合成 viewport；canonical `/2` subject 不做 same-Runtime `/2→/1` silent fallback。任何需要从 `/2` 正式迁移到 `/1` 的使用场景应单独制定 retained-value 规则，不作为本 target 的隐式行为。

### CF-04 — P1：Viewport protocol-fatal 的 public diagnostic 分类未定

Viewport contract规定 malformed `viewport.state` 是 child protocol-fatal；现有 `packages/data/src/model.ts` 的 `DataProtocolFamily` 只有 `profile | input | render`，Data Runtime 现有分派也只能报告这三类。Profile v2 应明确 v2 public terminal diagnostic 是 `protocol:"viewport"` 还是 `protocol:"profile"`，并在 v2 type/conformance固定，不靠 private implementation 猜测；v1 union/行为保持不变。该诊断不改变「只 retire Data、不自动 fail Runtime/Frame」。

### CF-05 — P1：physical geometry 需要同一可移植定义和 stale-source fencing

「logical CSS presentation surface」与 Desktop `window.innerWidth/innerHeight` 已很接近，但 PWA 的“其他 source、CSS pixel 相同”不足以排除 layout viewport/visual viewport/host element box 三种不同尺寸。v1 应具体指定当前 Renderer document 的**单一 layout viewport width/height**（或另一明确且两端相同的 surface，二选一）；Desktop/PWA 都以该定义为准，map 居中/letterbox只是 consumer policy。Renderer participant replacement、source stop、queued rAF、old Data carrier retirement后，旧 source sample不得注入 fresh participant/carrier。补 physical source conformance。无合法 size 时保持 last observation但不发 `0/null/default`。

### CF-06 — P1：跨 generation / fresh Renderer 的 retained observation 说明

现有文档已经正确说 retained `current` 不证明 Renderer/current carrier/paintability，且 fresh carrier独立 baseline。须把 fresh Renderer（不同尺寸）、fresh generation（Runtime存活）、无合法 baseline、等值 baseline四项放进同一 transition/conformance table；明确允许 fresh baseline 前短暂展示旧业务 Render truth，**不保证 Control/Viewport/Render 跨 plane 原子同步**，但 baseline到达后最终收敛。不能偷偷添加同步 barrier、Main width/height 或把 stale observation 当 live surface proof。

### CF-07 — P1：author callback/bootstrap 的最小顺序

`subscribe` 同步立即交付包括 `null` 的 current 是正确的 race closure。应在 author conformance 锁定 `current` 更新先于 callback、listener throw/rejection只影响本 listener、unsubscribe与 Runtime terminal后的 late delivery inert。map consumer须先初始化 RenderDomain/业务 state，再订阅；同步首发只做一次初始化/变更判断，不能因其重复 commit或访问未初始化的 domain。无需增加 getter+onChange 两套 API。

## 4. Map Track blockers（**不应假装是 Core Freeze 的前置性能 PASS**）

### MF-01 — Map correctness：suspended Frame 的 presentation-only mutation owner

Subsystem model规定 suspended Frame 的 ordinary business mutation gate；map 目前将 position/window/domain/timers置于 `frame()` 内，而 draft要求 map在 child Frame取得 InputTarget后仍可响应 viewport。这并不自动成立。map design须明确：Viewport listener是 Runtime-scoped observation delivery；在 map Frame仍存活、RenderDomain仍 live 时，只允许依据**已提交 world facts**更新 viewport/camera/projection/Render presentation；不得借 resize绕过 Frame gate执行玩家移动、collision、transfer、Frame call。移动中 suspend时 step timer/held directions处理要独立校验，防止 child overlay下继续 gameplay。Frame terminal后取消订阅、timer和 pending async。添加 child menu/dialog + rapid resize + held movement 的实际测试。

### MF-02 — Map correctness：View/Sprite atomic visual baseline仍需明确交接

同一 `domain.update` 可同步提交业务 View/Sprite state，但 Projector 回调与 View 的 async image/raster prepare不构成两个 WC 的同一 paint 原子事务。draft的 `visualEpoch` 检查要补：若 View先接受新 epoch、Sprite仍是旧 epoch，旧 sprite究竟留旧舞台、隐藏还是等待新 sprite ready；若 Sprite先有新 epoch、View尚未准备则如何保留上一套完整画面；错误/teardown/新的 epoch插队后哪一套共同成为可见 baseline。必须证明不会出现新尺寸地图配旧屏幕坐标人物的一帧混合。保持 private parent/child presentation coordination，不回写 Store、不增 framework ACK。

### MF-03 — Map performance：现阶段只有 performance architecture，尚无 gate PASS

PR0 必须以真实 640/720p/1080p dense fixture计算 exact serialized View node bytes（`<196608 B`），拆分 `RenderDomain.update` full-state validation/snapshot probe residual，统计 Browser `receiveRenderData` ordinary callback 是否对不变 `chunks/tileVisuals`做完整重验证/重新准备（不能只测 rAF），记录 world raster/refresh overlap/entering-only、Canvas allocation/depth memory、resize burst到最终视觉 commit 的成本。Formal stimulus→paint须单一 monotonic clock seam。既有 640 refresh P95 96.3ms >50ms 是历史失败；不得在无 PR0 PASS 时宣称性能解决或把 Map draft Frozen。Core size capability并不承诺 map性能成功。

## 5. 简洁性 / 实现闭环建议

Core最终应只有：`viewport.state` exact 3-field message、一个 per-carrier latest pending slot、一个 Subsystem retained value + subscribers、Main profile `/2` identity选择、trusted Renderer physical source。绝不扩为 Environment manager、Frame viewport interest、generic queue priority、ACK、跨 child epoch 或 Main geometry mirror。

实施路径：Core docs修 CF-01/02 并补 CF-03..07 → recorded Core Docs Freeze SHA → profile-v2/data/renderer/subsystem/main/Desktop最小实现 → v1 regression + v2 conformance/hosted evidence → Map PR0 参数与 residual证据 → Map docs Freeze → PR1 fixed-640 优化 → PR2 dynamic viewport → PR3同一 subject重 qualification。冻结 map时还需 MF-01/02/03 的明确可执行规则和证据。

## 6. Review disposition

- **Core Docs Freeze：HOLD**，以 CF-01/02 为明确 blockers，CF-03..07签署前必须消除歧义。
- **Map Docs Freeze：HOLD**，等待 MF-01/02设计闭合与 MF-03 PR0 evidence。
- **Architecture direction：retain ADR0036；无理由回退 User Input或引入 permanent max-viewport envelope。**
- **Tests：本次仅审查文档/源代码，未运行本地或 hosted tests。**
- **Evidence/authority：** docs-only review不能把旧 executable subject 的历史 M11/M14/M15 PASS转移给未来 v2 implementation subject；唯一 live status仍由 `viewport-profile-v2-qualification.md` 和 M11/M14/M15 qualification ledgers拥有。
