# ADR 0036：Viewport State v1 与 Renderer Data Profile v2

> 状态：Accepted  
> 日期：2026-09-16  
> 影响范围：Renderer⇄Subsystem Data、`@loomrealm/subsystem` author surface、Desktop/PWA viewport physical realization、M14/M15 requalification  
> 依赖：[ADR 0006](./0006-frame-render-decoupling.md)、[ADR 0023](./0023-user-input-v1-semantic-closure.md)、[ADR 0025](./0025-renderer-data-profile-v1-preimplementation-closure.md)、[ADR 0029](./0029-user-input-v1-mutation-gate-state-convergence.md)、[ADR 0032](./0032-game-library-example-boundary.md)  
> 候选正式契约：[Viewport State v1](../15-contracts/viewport-state-v1.md)、[Renderer Data Profile v2](../15-contracts/renderer-data-profile-v2.md)

## Context

M14 map 的动态 viewport 需求暴露了一个真实 Core capability gap：Subsystem Runtime 需要读取并持续观察 current Renderer presentation surface 的逻辑 CSS 尺寸，即使当前业务 Frame 被 child Frame suspend、不是 Main `InputTarget`，其 RenderDomain 仍可能继续存在并可见。

Frozen User Input v1 的 ordinary Effective gate 必须同时满足 current Data、Main `InputTarget(Frame,Activation)`、active/current Activation、Frame Desired Interest 与 Producer availability。把 viewport 编码成 `x.*.state` 会把“是否拥有交互 authority”错误地变成“是否能观察 presentation geometry”。这在 visible suspended map + child menu/dialog + resize 场景中会产生 stale viewport。

Browser-local viewport 又不能替代所有 Runtime 需求：map camera、projection bounds、payload budget 与 authoritative RenderData 都需要 Runtime-side accepted viewport。为了避免最大视口预发布带来的稳定 payload/Core validation 成本，需要一个独立、窄、readonly 的 Renderer→Subsystem current-state capability。

## Decision

### 1. Viewport 不属于 User Input

固定：

```text
Viewport lifetime != Input lease lifetime
Viewport currentness != InputTarget
Viewport observation != User Input
```

不得：

- 给 User Input 增加 viewport 绕过 InputTarget 的例外；
- 把 viewport 放进 `x.*.state`；
- 让 keyboard/pointer/gamepad focus availability决定 viewport availability；
- 因 viewport reopen User Input v1 的 Frame/Activation/Interest semantics。

User Input v1 保持 Frozen。

### 2. 新增 Viewport State v1 child protocol

Viewport State v1 是 Renderer→Subsystem 的 retained current-state protocol，仅表达 current presentation-surface logical CSS size：

```ts
interface ViewportStateV1 {
  readonly type: "viewport.state";
  readonly width: number;
  readonly height: number;
}
```

它不携带 Frame/Activation、revision/sequence、DPR、focus、visibility、screen/display id、DOM rect 或 camera/tile/chunk policy。

语义固定为：self-contained current truth、latest wins、emission 前可 coalesce、same value可 suppress、fresh carrier建立 fresh baseline；不存在 event/reset/interest/ack/request。

### 3. Frozen Renderer Data Profile v1 不原地修改

现有：

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

保持 Frozen。

新增：

```text
loomrealm.renderer-data/2
= Data Connection v1
+ User Input v1
+ Render Update v1
+ Viewport State v1
```

Profile v2 继续使用同一 current Data Connection、one inbound reader/dispatcher、one serialized writer、common preflight 与 terminal boundary；Viewport 不建立跨 child transaction/revision/ACK。

Profile replacement `P1 → P2` 仍是 DataAuthority replacement，必须 fresh generation。Renderer Control v1 已把 `dataProfile` 定义为字符串，因此不需要升级 Control wire schema。

### 4. Profile selection authority

Main 继续是 DataAuthority `{subsystemKey,generation,dataProfile}` 的唯一公共 authority；Platform broker只物理实现已选 authority。

目标 implementation subject 的 canonical product policy固定选择：

```text
loomrealm.renderer-data/2
```

用于该 subject 的 current Renderer⇄Subsystem DataAuthorities。`loomrealm.renderer-data/1` 保留为 Frozen compatibility profile，不做 per-Subsystem capability negotiation、Game Entry profile option、carrier-level downgrade 或 feature handshake。

如果未来真实 composition 证明同一 Session 必须混用 profile 1/2，再以新证据显式 reopen；当前实现者不得自行设计协商层。

### 5. Subsystem author surface新增 Runtime-scoped readonly capability

目标 surface：

```ts
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (viewport: ViewportSize | null) => void): () => void;
}

export interface SubsystemScope {
  readonly viewport: Viewport;
}
```

`Viewport` object lifetime = Subsystem Runtime/Scope lifetime，独立于 Frame、Activation、InputTarget 与 RenderDomain。

`current` 表示“该 Runtime 最后成功接受的 viewport observation”，不是 current carrier/Renderer/presentation paintability proof：

```text
Runtime start, never observed baseline → null
legal viewport.state(V)                → current=V
Data carrier loss                      → retain last V
fresh carrier baseline same V          → no author-visible change
fresh carrier baseline different V     → update + notify
Runtime terminal                       → no further callback
```

`subscribe()` 同步先交付一次 current（包括 `null`），然后只交付 retained value变化，避免 `read → subscribe` race。unsubscribe idempotent。Listener failure local-contain；不得 terminalize Runtime/Data，也不得形成 peer flow control。

### 6. Renderer owns observation; business owns policy

Renderer physical realization观察 presentation surface logical CSS size。Main 不保存或转发 width/height。

Core只提供 raw positive safe-integer size；业务 package决定 min/max、settle、camera、projection、letterbox等 policy。DPR继续属于 browser/compositor physical fact，不进入 Viewport State v1。

Desktop first realization可读取 `window.innerWidth/innerHeight`；PWA 后续可使用不同 physical source，但必须保持相同 author-visible CSS logical-pixel semantics。

## Supersession Boundary

本 ADR只修正：

- 把 viewport 视为 custom User Input state 的候选设计；
- Renderer Data Profile v1 是当前唯一未来可扩展 profile 的隐含假设。

不 supersede：

- Main 对 Session/Runtime/Frame/Activation/InputTarget/DataAuthority 的唯一 authority；
- User Input v1；
- Render Update v1；
- Data Connection v1；
- Frame/Render lifetime decoupling；
- Business Web Component / Renderer Store authority split。

## Qualification / Freeze Route

本 ADR 是 docs-only accepted architecture correction，不声称 Viewport State/Profile v2 已实现或 Frozen。

正式 Freeze 前必须具备：

```text
Viewport State v1 normative contract + conformance
Renderer Data Profile v2 normative contract + conformance
SubsystemScope.viewport exact author contract
profile-v2 canonical selection policy tests
fresh-carrier/loss/replacement currentness matrix
Desktop source platform-neutral semantics proof
```

第一个 executable change建立新 qualification subject；M11/M13/M14/M15 按受影响边界重跑，不能复用旧 SHA 的 Closed/PASS 宣称新 capability 已关闭。

## Rejected

```text
viewport as x.* User Input
InputTarget bypass special-case
generic Environment/PlatformInfo service locator
Main forwarding viewport values
per-Frame viewport subscription
DOM/ResizeObserver directly visible to business Runtime
DPR/orientation/focus/visibility bundled into v1
profile negotiation on Data carrier
per-Subsystem feature flags without a real mixed-profile consumer
```

## Consequences

- Core 增加一个窄 retained-state child protocol和一个 author readonly capability；
- Frozen v1 wire semantics保持兼容；
- visible suspended Frames仍可让其 Runtime响应 viewport变化；
- map可按实际 viewport投影，不必永久预发布最大 1080p envelope；
- profile v2 的实现/qualification成为 dynamic viewport map Freeze 的前置条件。
