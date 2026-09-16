# ADR 0037 — 首次发布前直接修正 Renderer Data Profile v1

> 状态：**Accepted / preimplementation design correction；npm consumer 项已按项目负责人确认解除，其他兼容性与 Docs Freeze 尚未签署**  
> 日期：2026-09-16  
> 更新：[ADR0036](./0036-viewport-state-and-renderer-data-profile-v2.md) 的「必须另建 Profile v2」结论；保留其中 viewport 不属于 User Input 的问题证明。  
> 依据：[文档治理 §4–7](../00-overview/document-governance.md) · [业务边界 Review](../30-implementation/viewport-business-boundary-review-2026-09-16.md) · [Profile v1](../15-contracts/renderer-data-profile-v1.md)

## 背景与兼容性证据边界

当前产品仍处于首次发布前；Repository 中 `/1` 为已经冻结并实现的内部基线，候选 `/2` 尚未实现或冻结。Viewport 的真实 Core gap 是 Renderer geometry 不受 User Input 的 InputTarget/Activation 约束，而不是必须产生一个新 profile number。单为 pre-release correction 同时维持 `/1` 和 `/2` 造成两套 acceptance、profile rollout、currentness、测试及 fallback 管理，与首次实现治理的「无真实兼容性义务时直接修正 first-version」冲突。

**项目负责人确认（2026-09-16）：不存在 npm 消费者，明确要求不要再验证 npm；npm 消费者兼容性核查从本 ADR 与 Core Docs Freeze 准入条件中移除。** 此项证据类型为 owner attestation，而非 registry 查询、分发渠道扫描或第三方验证；文档不得将其改写为“已检查 npm registry / alpha / tarball”，不得重新要求 npm 查询、npm 分发证明或 npm consumer 签署，也不得把该项以“兼容性总核查”名义重新引入 Freeze 阻塞。唯一 live 状态由 [v1 qualification ledger §2](../30-implementation/viewport-profile-v1-qualification.md) 记录。

**未发布及 npm 无消费者并不自动证明其他兼容性义务不存在。** 非 npm 的明确旧 `/1` 协议/身份承诺、独立对接者、持久化 profile identity、正在运行的旧 peer 或 rolling/rollback/mixed cohort 需求仍须按 ledger 的限定范围由相应负责人确认。项目如确有此类需要互操作的旧 `/1` peer，STOP direct reset，另起兼容性/迁移决策；不得将本 ADR 解释成可以静默破坏已部署 wire。不得将 npm 调查作为这些独立项目的隐含前置。

## 决定

1. **当前首版 identity 保持 `loomrealm.renderer-data/1`**，直接修正其 Frozen preimplementation contract 为 `Data Connection v1 + User Input v1 + Render Update v1 + Viewport State v1`。`viewport.state` 是新增的 child **v1**，不是 User Input 扩展；仅三字段 `{type,width,height}`，Renderer→Subsystem。
2. **不发布、不实现、不协商 `loomrealm.renderer-data/2`。** 原 Profile-v2 草案与其 conformance 退为 superseded provenance；当前规范和测试只指向改正后的 Profile-v1；不保留双 parser、deprecated alias、dual mode或 fallback。旧 `/1` 可执行代码、旧 conformance PASS 只能作为历史 baseline，不可声称已满足修正后 `/1`。
3. Main 继续唯一拥有 DataAuthority `{S,G,P}`；当前产品自然选择唯一 current `/1`。Profile identity 选择属于 Main，产品统一部署属于 implementation/composition，**不**写入 Profile 的跨 consumer MUST；无 per-subsystem negotiation。相同 identity 的改变只能作为**预发布协调升级与新 qualification subject**使用，旧运行中 peer不可混配。现有 Connection 中 profile replacement fresh-generation 规则仍保留用于将来真正不同 identity，而非为本次凭空造 `/2`。
4. Core只提供：由当前 Renderer composition 指定的**一个** logical presentation surface的 CSS logical positive safe integer size，独立 Input gate、per-carrier bounded latest sender、Runtime readonly retained `scope.viewport`、fresh-carrier baseline/currentness、统一 demux/terminal。Core contract 不强制所有实现调用 DOM `window.innerWidth`。Desktop/PWA 当前 product physical composition明确选 document layout viewport，源实现可采用 `innerWidth/innerHeight`，并验证与分配给业务的 box/letterbox对应；未来改变 surface identity须显式审查，不能静默重选。
5. Core 的通用 gate 仅是：geometry observation 不 mint InputTarget/Activation/Frame mutation permit，也不直接写 Render desired state。地图移动、collision、transfer、暂停连续行走、map-specific Frame seam和 menu/dialog 验收属于 map consumer/独立 lifecycle review；不能把假设中的 menu 当作当前产品已实现证据。Map fallback、cap、settle、chunks、raster、View/Sprite stage、performance PR0仍由 `game-libs/map` 拥有。
6. 文档传播：更新 Profile v1 与 conformance、Viewport State v1 与 conformance、architecture、Subsystem、overview、index、qualification、map draft、模块实现计划/历史 ADR 导航；旧 v2 文档仅作 Superseded 历史指针，不能继续声称 current Normative Candidate。保留冻结前交叉复核与 executable-ready conformance gate；实现后新 SHA 重跑 v1 revised conformance、受影响 M10–M15。

## 不变范围与明确拒绝

不改变 Control v1/Connection v1 wire、Main Frame/InputTarget authority、User Input v1/Render Update v1 schema、common 1 MiB/depth64 limits、JSON text unit、single reader/writer、M13 Render Store/Projector/WC ownership。拒绝 Environment service、Main geometry mirror、InputTarget bypass、generic scheduler、ACK/cross-child barrier、surfaceId/multi-pane router、产品 rollout MUST 上升协议和 map-special Core fast path。

## 状态与重新开启条件

ADR decision Accepted，且 npm consumer 兼容项已由项目负责人确认不阻塞；这**不等于**改正后的 Profile-v1 已 Frozen/Implemented/Qualified。Docs Freeze HOLD 仅剩限定范围的非 npm 兼容义务确认、完整修订与 cross-review 签署；代码尚未变更时不得将 revised `/1` 描述为当前 executable。若真实旧 peer 混版义务存在或多个 independently interoperating surfaces 被证实，重新评审显式 version/migration。若 map 证明独立 lifecycle seam 缺失，应另立 consumer-evidence ADR，不塞入 Viewport。
