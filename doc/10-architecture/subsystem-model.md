# 模块子系统模型

> 层级：系统架构 / Active Design  
> 稳定程度：Frame/Input、Render、Content沿既有 Frozen/Evolving contracts；Viewport v1与修正 Profile `/1` 为 preimplementation candidates / Not Frozen  
> 主要定义：Subsystem/Definition/Frame/Runtime 边界、Input/Render/Content/Viewport author projection与 lifetime/error ownership  
> 依赖：[System overview](./system-overview.md) · [Runtime hosting](./runtime-hosting-system.md) · [Stack runtime](./stack-runtime-system.md) · [Rendering](./rendering-system.md) · [Viewport](./viewport-capability.md)  
> Formal：[Input v1](../15-contracts/user-input-v1.md) · [Render v1](../15-contracts/render-update-v1.md) · [Content v1](../15-contracts/content-api-v1.md) · [Viewport v1](../15-contracts/viewport-state-v1.md) · [Revised Profile v1](../15-contracts/renderer-data-profile-v1.md)；Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> 最近复核：2026-09-16

本文件管理角色、author API ownership与通用 mutation/lifetime，不定义地图 gameplay 或物理 DOM sampling；wire/currentness/callback细节以 formal contracts为准。旧 Profile v2已 Superseded。

## 1. Role/dependency and authority

```text
Platform LaunchPlan
→ selected Definition Module
→ Host-owned Runner / role-local capabilities
→ @loomrealm/subsystem/host
→ Business Definition
```

Business Definition只依赖 public `@loomrealm/subsystem`，不得直接依赖 `/host`、Data/RuntimeControl、fsdb、Platform ports/launcher、Node/Browser DOM或 credentials；Hostra/PWA采用相同 author semantics。Main独占 Session/Runtime public lifecycle、Frame/Stack/Activation/InputTarget/DataAuthority/failure unwind；Subsystem拥有 business state、本地 Frame mutation gate、Desired Input Interest/local delivery、authoritative Render Domains、readonly ContentClient与候选 Runtime viewport observation；Renderer拥有 readonly Control mirror、Input producer、Render replica和 current logical surface观测；Platform拥有物理 process/carrier/source provisioning。没有第二份 Main/Render authority。

## 2. Startup / scope

Runner preflight→capabilities→Runtime Control hello/identified→Definition.initialize→ready。`ready`不能推断 Data/Renderer/Viewport/Render baseline已存在；Viewport object在 Runtime/Scope创建、初始值 null。Framework不得要求游戏因为需要 geometry直接持有 DOM或物理端点。

## 3. Frame outcome / ordinary mutation gate（通用）

Public `Frame`：`id / params / signal / call(subsystem,params)`，不公开 Activation id、Data G/P或 DOM。FrameOutcome：completed/cancelled/failed。Accepted child call suspend caller/revoke Activation；child完成后幸存 caller取得 fresh Activation。Local Frame Context mutation gate拦住 pending call/return、administrative suspension、closing/closed、Runtime terminal期间的 **ordinary Frame business mutation**。Input State在 same-current-Activation pending mutation期 retains latest/suppresses business delivery，Event drop；known-no-commit reopen先converge State。RenderDomain是独立 Runtime resource，Frame close/suspend不会隐式 destroy/hide Domain。

**通用不变量：** Runtime viewport observation可以在 Frame suspend时更新，但 observation 本身不授予新的 Frame mutation permit、InputTarget/Activation，也不直接提交 Render desired state。业务决定是否根据已提交 facts用既有 RenderDomain更新 presentation。此架构不指定人物行走/碰撞/地图转场、不要求 Frame拥有新 suspend getter。某个真实 consumer若证明现有合法 seam无法满足已接受行为需求，必须单独提交 consumer evidence评审最小 lifecycle能力，不可从 viewport 存在直接推出要扩 public Frame API。Current example只有 map Subsystem，未将 menu/dialog gameplay语义列为该 slice必需验收。

## 4. Input author API（M10 Frozen）

```text
scope.createInputListener({frame,channels})
```

Channels/setChannels为 Frame Desired Interest；`on`/unsubscribe注册回调；close幂等。State detached/immutable，Event never replay，stable handler ordering；async Promise不作为 Data reader backpressure。Fresh Activation不复用旧 State/Event；fresh carrier重发 desired Interest并等待 State baseline。Viewport绝不伪装成 custom input channel。

## 5. Viewport author API（候选）

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

Runtime-scoped detached/immutable last accepted value，initial null；Data loss保留 last，matching fresh carrier/G/Renderer baseline收敛，equal不重复 callback。Subscribe同步首发含null，callback前更新 getter，throw/rejected Promise local containment，unsubscribe幂等，Runtime terminal后 inert。Frame suspend/close或 InputTarget/Activation变化不替换 Runtime capability。Author不见 Window/DOM、Renderer identity、profile/G、DPR或传输；physical source由 Renderer composition指定 single CSS logical surface。

该能力在**修正后的唯一 `/1`**下提供；旧三 child `/1`当前代码不满足它，必须整套 implementation qualification，不设计 `/2`/compatibility null mode。Exact value/source、diagnostic/terminal参照 [Viewport v1](../15-contracts/viewport-state-v1.md)。

## 6. Render author projection（M11 frozen surface）

```ts
interface RenderDomainState { readonly zIndex: number; readonly roots: readonly RenderNode[] }
interface RenderDomainUpdate {
  readonly zIndex?: number;
  readonly nodes?: readonly RenderNodeUpdate[];
}
interface RenderDomain {
  replace(state: RenderDomainState): void;
  update(update: RenderDomainUpdate): void;
  emit(event: RenderEvent): void;
  close(): void;
}
// scope.createRenderDomain(initialState): RenderDomain
```

`update`仅 zIndex和 existing-node attrs/data top-level members；structural mutation用 `replace`。业务不见 Domain id/revision/Patch/carrier。Author API operations synchronous validate→detach→local atomic commit；Domain keys Runtime-lifetime one-shot；Frame close/suspend或 Data retire不自动关闭 Domain。既有具体 limits和 qualification归 Render v1/M11，不因 viewport改动提高。

## 7. Content author projection（M12 frozen）

`scope.content` readonly Client仅 `record/resource`和对应 returned values/options/errors；不泄漏 installationId、raw FSDB/HTTP/path/token。read failure由业务决定 fallback/retry/outcome，不自动 Frame/Runtime failure。

## 8. Lifetime / Data profile integration

```text
Frame       Frame Context / frame.signal / ordinary mutation gate
Activation  Main InputTarget one-shot lease facts
Runtime     SubsystemScope / ContentClient / Viewport / RenderDomain registry
Data        per-carrier Input / Render / Viewport publication cursors
Renderer    physical designated surface / presentation document
```

Subsystem SDK一个 connection-wide `SubsystemDataBinding → @loomrealm/data corrected Profile /1 peer → Input/Render/Viewport role behaviors`，child不竞争 reader；Content不在 Profile。Data reconnect不替换 Runtime resources；fresh G只需 new matching baseline，不自行创建 Frame/Activation。Runtime terminal settles/aborts owned work。Main profile-change fresh G规则不因本次 doc correction放宽。

## 9. Error/portability boundary

Business outcome→FrameOutcome.failed；precommit call rejection→typed local error；Input/Viewport subscriber error→local containment；Render author misuse/limit→TypeError/RangeError；ordinary Content read→ContentReadError caller-local；Control fatal→Runtime failure；Data child/profile fatal→Data retirement；module/capability bootstrap failure→Runtime bootstrap failure。Platform path/token/DOM不得泄漏到 business author。

Framework不能反向依赖 map/example，不建立 Environment/Viewport manager、map-specific mutation exception或未被真实消费者证明的 Frame lifecycle public API。Docs Freeze只依 [revised-v1 ledger](../30-implementation/viewport-profile-v1-qualification.md) 且包含兼容核查；Map验收独立。