# ADR 0036：Viewport State v1 与 Renderer Data Profile v2

> 状态：Accepted（architecture decision）；formal contracts 尚未 Frozen/implemented  
> 日期：2026-09-16；复核：2026-09-16 Core Docs Freeze Review  
> 影响：Renderer⇄Subsystem Data、`@loomrealm/subsystem` author surface、Desktop/PWA、M14/M15资格重验  
> 依赖：[ADR0006](./0006-frame-render-decoupling.md) · [ADR0023](./0023-user-input-v1-semantic-closure.md) · [ADR0025](./0025-renderer-data-profile-v1-preimplementation-closure.md) · [ADR0029](./0029-user-input-v1-mutation-gate-state-convergence.md) · [ADR0032](./0032-game-library-example-boundary.md)  
> Normative candidates：[Viewport State v1](../15-contracts/viewport-state-v1.md) · [Renderer Data Profile v2](../15-contracts/renderer-data-profile-v2.md)  
> Freeze review：[2026-09-16 report](../30-implementation/viewport-core-docs-freeze-review-2026-09-16.md)

## Context

M14 map真实 consumer在 map Frame被 child menu/dialog suspend、已不再是 Main InputTarget时仍需接收当前 Renderer viewport；其 RenderDomain可能继续可见。Frozen User Input v1的 current Data × InputTarget × Activation × Interest × producer gate不允许这种 geometry被当作普通 input接收。Browser-local geometry不足以供 Runtime计算 authoritative camera/projection；恒定发布最大 1080p envelope令小视口承担不必要的 payload/CPU成本。因此需要 narrow Renderer-observed、Subsystem Runtime-scoped readonly retained size fact，而不修改 Input authority。

## Decision

### 1. Orthogonal viewport child

Viewport MUST NOT成为 `x.*.state` User Input或绕过 InputTarget特例；blur/focus/keyboard available不影响其 observation。唯一消息 Renderer→Subsystem：

```ts
{ type: "viewport.state", width: positiveSafeCssInteger, height: positiveSafeCssInteger }
```

自包含 retained latest state；没有 event/reset/interest/request/ack/revision。Current Renderer participant的 v1 surface严格为**一个 document layout viewport**，以 Window `innerWidth/innerHeight` floor CSS pixels为同义观察；Desktop/PWA均一致，不得混用 visualViewport、screen、DPR或 arbitrary DOM rect。未来 multi-surface必须新 compatibility/design boundary，不在 v1 增加 surfaceId。

Core Freeze Review确认额外性能约束：每 current carrier一个 writer-admitted/in-flight viewport unit，最多一个 not-admitted latest pending size；resize覆盖 pending；已 admitted不得撤回；fresh carrier独立基线；普通 resize burst不得无界积累、单独触发 writer overflow或饿死 Input/Render。不改 Frozen v1 writer，不创建 generic priority scheduler。

### 2. Explicit complete profile / immutable v1

```text
loomrealm.renderer-data/1 = Connection1 + Input1 + Render1 [Frozen compatibility]
loomrealm.renderer-data/2 = Connection1 + Input1 + Render1 + Viewport1 [candidate target]
```

Profile v2重用 single reader/dispatcher、serialized writer、preflight、terminal；不创建跨 child transaction、revision、ACK、replay。Main仍选择每个 current DataAuthority `{S,G,P}`；canonical target subject对所有 current Subsystem authorities统一选择 `/2`，broker只按 exact tuple pair。profile change须 fresh generation，无 per-Subsystem negotiation、feature bits、Game Entry request或 silent `/1` downgrade。`/2` endpoints不兼容时 Data absent，不假装可获得 viewport。

Frozen Renderer Control v1的 `dataProfile: string`以及 Connection v1的“profile replacement→fresh generation”已经允许新 profile。旧 contracts写的“Phase 1 profile=/1”及 Profile-v1 specialized TypeScript literal是当时基线和该 profile peer专用，不是修改 Control/Connection wire 的理由。不得改变旧 `/1` acceptance set；compatibility解释由新 Profile-v2 contract拥有。

### 3. Runtime-scoped public capability

```ts
interface ViewportSize { readonly width: number; readonly height: number }
interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (viewport: ViewportSize | null) => void): () => void;
}
interface SubsystemScope { readonly viewport: Viewport }
```

`current`是 Runtime最后成功接受的 detached/immutable observation，不是 present carrier/Renderer/paintability证明。初始 null；loss保留last；matching fresh carrier发布当前合法 baseline，同值不重复callback，异值先更新 current再callback；fresh Renderer/ generation旧样本必须 fenced。订阅同步首次交付包含 null以消除 read→subscribe race，unsubscribe幂等；listener throw/thenable rejection局部 containment、不阻塞 Data reader。Runtime terminal后无交付。v1 explicit compatibility若从未接受 v2 observation则此 capability保持null；存活 Runtime从已收到 v2迁入 v1须另案，不默默降级。

### 4. Exact failure/currentness boundary

`viewport.state`已识别但 malformed → Profile-v2 child terminal diagnostic `protocol:"viewport"`，只 retire Data，不自动 Runtime fail/Frame unwind/RenderDomain destroy。Control、Viewport、Render无跨 plane total order/barrier；fresh Renderer在新合法 baseline前可能留旧 observation，但只能用 matching current authority traffic收敛，不可把旧 size当 live paintability。Main不存/转发 width/height；map处理 min/max、100ms settle、camera/chunks/Render政策。

### 5. Scope and freeze governance

Core仅新增 exact three-field child、bounded publication、retained value+subscribers、profile `/2` selection、trusted source。禁止 generic Environment/manager、Frame viewport interest、Main viewport mirror、per-surface router、DPR/visibility bundle、Browser DOM→Runtime reverse sync、cross-child ACK或 map-specific fast path。

**Docs Freeze**需要 cross-contract consistency + executable-ready conformance specifications + docs-only SHA/review，不要求 implementation PASS；**implementation qualification**在新的 executable SHA验证本 profile、v1 regression、hosted/product；**Map Docs Freeze**另需 PR0 payload/CPU/raster/latency证据。唯一 live maturity见 [Viewport qualification ledger](../30-implementation/viewport-profile-v2-qualification.md)。ADR Accepted不意味着 contracts Frozen或 implementation Qualified。

## Supersession / rejected alternatives

本 ADR仅替代 viewport-as-custom-input proposal以及“永远只有 Profile v1”的扩展假设；不 supersede User Input v1、Render Update v1、Data Connection v1、Control v1、Main authority或 ADR0031 business WC ownership。拒绝 InputTarget bypass、permanent max-1080p projection、Main width/height relay、Browser-only authoritative camera、profile negotiation与无真实 consumer的 generic service locator。

## Consequences

非 InputTarget 的 visible suspended map可接收 Runtime-scoped geometry；实际 size可驱动 map bounded projection。Renderer physical source与 Data currentness仍按各自 owner恢复。对性能的最终结论仍取决于 map PR0的 dense 1080p bytes、`RenderDomain.update` full-state validation residual、Browser raster及 single-clock latency，不能把 capability设计正确当作性能已通过。