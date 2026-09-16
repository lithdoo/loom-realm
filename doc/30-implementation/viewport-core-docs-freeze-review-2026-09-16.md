# Viewport Core Docs Freeze Review — 2026-09-16

> 状态：**Specification corrections applied / final cross-review and Docs Freeze sign-off PENDING**  
> Original audit subject：`8d8523cd0aff48d98b3632a5e7a3a30f5125977a`（docs-only）  
> 修订证据：本次 Core contracts/ADR/architecture/conformance/ledger与 map draft后续 docs-only commits；本报告不独立发布 Frozen/PASS。  
> 审查范围：ADR0036、Viewport architecture、Viewport State v1、Profile v2、Subsystem model、protocol layers、system overview；交叉核对 Frozen Control/Connection/Profile v1、两份 conformance、map draft与现有 package source。

## 1. Findings / disposition

Authority direction保留 ADR0036：Main只选择 DataAuthority/profile，Renderer观察其单一 document layout viewport，Viewport State独立于 InputTarget复制 retained geometry，Subsystem Runtime只读 `scope.viewport`，map拥有 camera/chunk/business Render，Browser拥有 raster/physical retry。拒绝 User Input bypass、max-1080p预发布、Main relay、Environment service、per-Subsystem negotiation及跨 child ACK。修订正式规范不等于 executable capability存在；当前 `/2`尚未实现，未运行新的 local/hosted/product tests。**Core Docs Freeze可在规范终审后独立签署，Map Docs Freeze另受 MF-01/PR0阻塞。**

## 2. Core CF-01..07 resolution ledger

| Finding | Document resolution | State |
|---|---|---|
| CF-01 P0 Docs Freeze ↔ executable PASS circularity | 两份 conformance改为 executable-ready **test specification**；ledger区分 Docs Freeze docs SHA与后续 implementation executable SHA/raw PASS；Profile/Viewport/ADR与 architecture同义 | Spec corrected，待最终 sign-off |
| CF-02 P0 latest-wins only MAY, writer overflow | Viewport v1 §3对每 carrier强制 1 writer-admitted/in-flight + 1 not-admitted pending latest；不撤已 admitted、不迁移旧 queue；Profile v2/architecture同步；conformance新增 blocked writer + >1024 resize + Input/Render并发 + eventual convergence | Spec corrected，待 executable proof |
| CF-03 P1 v1 compatibility text | Profile v2 §1–2解释 Control v1 `dataProfile:string`、Connection v1 fresh G、“Phase 1 `/1`”为历史实现基线、v1 specialized type；旧 acceptance不变，canonical all-current `/2`、Data absent不 silent fallback；explicit `/1`未曾观测则 capability null | Spec corrected，待 regression |
| CF-04 P1 protocol diagnostic | Profile v2 §7锁定 recognized malformed viewport→`protocol:"viewport"`，common invalid→`"profile"`，v2可单独 terminal union、不扩大 `/1` peer observable type；conformance同步 | Spec corrected，待 executable proof |
| CF-05 P1 geometry/source identity | Viewport v1 §1/§5统一 current Renderer document **layout viewport** `window.innerWidth/innerHeight` floor CSS pixels；Desktop/PWA同义，非 visualViewport/element rect/DPR；old participant/source/rAF/carrier fenced | Spec corrected，待 physical proof |
| CF-06 P1 fresh G/Renderer | Viewport v1 §4 transition matrix明确 last observation、same G、fresh G、fresh Renderer、无合法 sample、terminal、no super-snapshot；Profile和两份 architecture同步 | Spec corrected，待 conformance |
| CF-07 P1 subscribe/bootstrap | Viewport v1 §6锁定 synchronous first (含 null)、getter before callback、detached value、local containment/unsubscribe/terminal；map §3明确先 state/domain后 subscribe、首发同值 no-op | Spec corrected，待 conformance |

**没有编辑旧 Frozen Control/Connection/Profile v1 schema/acceptance；新 Profile v2对旧“Phase 1”作兼容性解读。** 新 `/2`专用端口/terminal实现细节须在第一个 executable subject里完成，不在 docs-only阶段伪造。Review原则禁止借这七项引入 generic queue priority/ACK、Main geometry或 environment manager。

## 3. Simplicity and central problem assessment

最小 Core shape是 exact 3-field `viewport.state`、per-carrier bounded latest sender、Runtime last accepted value+subscribers、Main `/2` identity、Renderer trusted single layout source。没有多 surface/RenderNode/Frame id、DPR/focus、环境 service locator或自己的一套 currentness。它在结构上解决了非 InputTarget map Frame无法得到尺寸的 correctness gap，并使 Runtime按实际视口投影、不必恒定传最大 1080p envelope。**它不承诺 RenderDomain full-state validation、Browser receive/raster或产品 P95已经达标。**

## 4. Map Track MF-01..03（不阻塞 Core Docs Freeze，阻塞 Map Freeze）

### MF-01 — OPEN: suspended gameplay vs Runtime viewport observation

Map draft §7已精确定义 suspended Frame仅可基于已提交 world facts更新 viewport/camera/chunk/Render presentation，不能通过 resize继续 movement/collision/transfer/call。真实代码 `frame()`拥有heldDirections与stepTimer，`finishStep`有自动 attempt；public `Frame`仅id/params/signal/call、`InputListener`仅on/setChannels/close，无直接 Activation suspend observation。**因此不声称已经实现 no-step-on-suspend。** 必须以实际 trace证明 existing legal seam能保留 cadence/turn buffer又阻止暂停后的自动连走；否则 STOP，独立最小生命周期 author capability评审，不得借 viewport绕过 InputTarget。测试 hold→child suspend→timer→resize→no next step→fresh Activation rebaseline。

### MF-02 — algorithm CLOSED; executable evidence PENDING

Map draft §9已定义 parent MapView与managed child MapSprite各自 prepare same visualEpoch detached candidate；两者都ready/current时同一同步 JS task原子切换完整 depth stage、logical clip-size与 child shadow sprite stage；parent-first/child-first都保留旧完整stage，失败使用 Window-local private retry，旧 async/fresh G被 fence。普通 movement共享 browser monotonic motion sample，避免 camera/sprite drift。禁止跨 component wire ACK、DOM managed mutations。仍须 PR2 frame/video tests证明无 mixed epoch paint。

### MF-03 — OPEN: performance proof

Map draft §12 PR0必须测真实 dense640/720/1080 exact serialized View node bytes（<196608 B），`RenderDomain.update` full-node validation/snapshot residual、Browser ordinary `receiveRenderData`是否重复验证 stable chunks、wire/Store、raster overlap/entering-only、Canvas allocation/peak memory、resize burst→final visual commit，以及 Hostra单 clock stimulus→paint三轮 P50/P95/max。旧 640 refresh P95 96.3ms >50ms仍是 historical FAIL。任何预算或 Core residual失败STOP相应独立 review，不能提高 limits/跳过验证或宣称性能解决。

## 5. Next governance actions

```text
Final docs-only cross-review of revised exact contract+architecture+conformance
→ record explicit PASS decision and current docs-only subject SHA in dedicated ledger
→ only then change formal contracts to Frozen for implementation
→ implement profile /2 + sender/source/receiver/author/Main policy on new executable SHA
→ v1 regression + v2/Hostra qualification
→ map PR0 evidence + resolve MF-01 (+ MF-02 executable tests)
→ Map Docs Freeze
→ PR1 fixed 640 → PR2 dynamic viewport → PR3 affected milestones qualification
```

As of this report revision：**Core semantics corrected, final Freeze sign-off not yet recorded; Map Freeze HOLD, implementation NOT STARTED, tests NOT RUN**。唯一 live qualification status在 `viewport-profile-v2-qualification.md`及各旧 milestone ledger，不能把 docs-only SHA等同 executable subject。