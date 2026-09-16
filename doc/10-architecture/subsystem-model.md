# 模块子系统模型

> 层级：系统架构 · Active Design  
> 稳定程度：M10 Input frozen / M11 Render surface frozen and current subject requalification pending / M12 Content frozen；Viewport author API under ADR0036, formal contract Not Frozen  
> 主要定义：Subsystem role、Definition/Frame/Runtime boundary、Input/Render/Content/Viewport author projections与 lifetime/error semantics  
> 依赖：[System overview](./system-overview.md) · [Runtime hosting](./runtime-hosting-system.md) · [Stack runtime](./stack-runtime-system.md) · [Rendering](./rendering-system.md) · [Viewport architecture](./viewport-capability.md)  
> Normative：[Input v1](../15-contracts/user-input-v1.md) · [Render v1](../15-contracts/render-update-v1.md) · [Content v1](../15-contracts/content-api-v1.md)；candidate：[Viewport v1](../15-contracts/viewport-state-v1.md) · [Profile v2](../15-contracts/renderer-data-profile-v2.md)；decision：[ADR0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> 最近复核：2026-09-16

本文件描述角色与 author API ownership；Viewport exact wire/currentness/callback以 formal contract为准，不建立第二份相互竞争的规范。

---

## 1. Role and dependency

```text
Platform LaunchPlan
→ selected Definition Module
→ Host-owned Runner / role-local capabilities
→ @loomrealm/subsystem/host
→ Business Definition
```

Business Definition只依赖 public `@loomrealm/subsystem`，不得直接依赖 `/host`、`@loomrealm/data`、`runtime-control`、fsdb/fsdb-http、platform-ports、launcher、Node/Browser DOM或 platform credentials。Hostra/PWA physical artifact可不同，author observable semantics相同。

Subsystem owns business state/initialization/shutdown、local Frame Context/mutation gate、Frame-scoped Desired Input Interest与local delivery、authoritative Render Domains、readonly ContentClient，以及候选 Runtime-scoped retained Viewport observation；不拥有 Main Stack/InputTarget/DataAuthority、Renderer DOM/physical viewport source、Platform process/carrier或 Content storage/credential。

## 2. Authority and startup

```text
Main       Session/Runtime public lifecycle, Frame/Stack/Activation/InputTarget,
           DataAuthority, transaction/failure unwind
Subsystem  business state, Frame mutation gate, Input Interest/delivery,
           retained viewport observation [candidate], authoritative Render Domains
Renderer   readonly Main mirror, input producer facts, current layout viewport
           physical observation [candidate], Render replica/presentation
Platform   executable/hosting/provisioning, physical carrier, Content service
```

Viewport不修改以上 owner：Renderer观察 raw geometry，map自行决定 camera/projection，Main不存宽高。Startup：Runner loads/preflights planned module→creates capabilities→acquires Runtime Control→hello/identified→definition.initialize→ready。`ready != Data exists != Renderer exists != Input/Render/Viewport baseline exists`。

## 3. Frame / outcome / mutation

Frame public author surface仅包含 `id / params / signal / call(subsystem,params)`，不公开 Activation id、Data generation/profile或 DOM。FrameOutcome `completed(value) / cancelled() / failed(error)`。Accepted child call suspend caller/revoke Activation；child完成后幸存 caller获得 fresh Activation。

Local Frame Context mutation gate阻止 pending call/return、administrative suspension、closing/closed和 Runtime terminal期间的**ordinary Frame business mutation**。Input State在 same-current-Activation pending mutation期间 retain latest且suppress delivery；Event drop；known-no-commit reopen先收敛 retained State再暴露 recoverable rejection。RenderDomain是独立 Runtime resource：Frame close/suspend不隐式销毁/隐藏 Domain。

**Viewport observation不等于 suspended Frame gameplay permit。** Runtime-scoped viewport receiver可在 Frame suspend时保存 latest size；若原 live RenderDomain需要更新，业务可只根据**已经提交的 world facts**重新计算 viewport/camera/chunk/presentation Render projection，不能因此执行玩家 position/collision/transfer/Frame call或恢复 held input。已启动的 step timer完成/取消和 InputTarget/Activation revocation之间的协调属于 map consumer的明确职责；当前 public `Frame`没有 active/suspend event或 getter，若 map无法仅用已有合法 seam保证暂停后不自动连走，必须 STOP并提交真实 consumer证据，单独评审最小 lifecycle author capability；不得猜测 Main/DOM status、绕过 gate或借 viewport隐式扩权。详见 map draft的 MF-01 gate。

## 4. Input author projection — M10 frozen

```text
scope.createInputListener({frame,channels})
```

Channels/setChannels贡献 Frame Desired Interest；on/unsubscribe是 callback registration；setChannels保留 dormant registrations；close/unsubscribe idempotent；retained State detached/immutable，Event never replay；stable handler snapshot/order；async handler Promise不成为 Data reader flow control。Fresh Activation不复用旧 Input State/Event；fresh Data carrier republish Desired Interest并等待 fresh State baseline。Viewport永不使用 `x.*.state` 或绕过 Input gate。

## 5. Viewport author projection — candidate under ADR0036

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

Viewport object是 Runtime-scoped readonly capability，last accepted value初始 null、detached/immutable；Data carrier loss保留last，同 generation/fresh generation/fresh Renderer匹配 current authority并取 fresh baseline；等值不重复callback。`subscribe`同步首发包含 null，callback前更新 current，throw/returned rejection局部 containment、无 Data reader flow control；unsubscribe幂等，Runtime terminal后 inert。Frame suspend/close、InputTarget/Activation变化不替换 capability。

Author不见 Renderer id、generation/profile、DOM Window/ResizeObserver、DPR、wire kind或 physical source。对 explicit profile `/1` compatibility，未观察过 v2时 stable capability 为 null；canonical target `/2`不自动 downgrade。精确状态转移/physical source/diagnostic参照 [Viewport v1](../15-contracts/viewport-state-v1.md)；Docs Freeze只需 contract和 executable-ready conformance一致，具体测试 PASS属于后续 implementation qualification。

## 6. Render author projection — M11 surface frozen

```ts
export interface RenderDomainState {
  readonly zIndex: number;
  readonly roots: readonly RenderNode[];
}
export interface RenderDomainUpdate {
  readonly zIndex?: number;
  readonly nodes?: readonly {
    readonly key: string;
    readonly attrs?: { readonly set?: Readonly<Record<string,string>>; readonly remove?: readonly string[] };
    readonly data?: { readonly set?: Readonly<Record<string,unknown>>; readonly remove?: readonly string[] };
  }[];
}
interface SubsystemScope { createRenderDomain(initialState: RenderDomainState): RenderDomain }
interface RenderDomain {
  replace(state: RenderDomainState): void;
  update(update: RenderDomainUpdate): void;
  emit(event: RenderEvent): void;
  close(): void;
}
```

`update`仅 Domain zIndex和 existing-node attrs/data top-level members；structural mutation用 `replace`，业务不见 domainId/revision/Patch/carrier。Author operations synchronous local-only validate→detach→atomic local commit/bounded Event offer。live domains≤256，domainId Runtime-instance SDK-owned never reuse，node key Domain-lifetime one-shot；Frame close/suspend、Data retire都不自动 destroy Domain，Event无 future-carrier replay。当前 executable qualification以对应 M11 ledger为准。

## 7. Content projection — M12 frozen

`SubsystemScope.content` readonly ContentClient，仅 `record/resource`与 Content value/options/errors；不暴露 installationId、contentVersion请求 selector、raw HTTP/FSDB/path/token。Returned value/cache ownership隔离，普通 read rejection由业务自行 fallback/retry/outcome，不自动 Frame/Runtime failure。

## 8. Lifetime matrix / Data peer

```text
Frame           Frame Context / frame.signal / ordinary mutation gate
Activation      Main Input lease facts
Runtime         SubsystemScope / ContentClient / Viewport object / RenderDomain registry
Data carrier    connection-local Input/Viewport/Render publication baselines
Renderer        physical layout viewport source and presentation document
```

Data reconnect不替换 Viewport/ContentClient/RenderDomain，fresh generation需新 baseline但也不自行创建 Frame/Activation。Runtime terminal必须 settle/abort owned work。Subsystem SDK只有一个 connection-wide `SubsystemDataBinding → @loomrealm/data profile peer → Input/Viewport/Render role behaviors`；各 child不竞争 raw reader，Content不在 Data application profile。`/1` Input+Render；candidate `/2` Input+Render+Viewport；Main变 profile须 fresh generation。

## 9. Portability / errors

```text
business validation / outcome          FrameOutcome.failed
precommit call rejection                typed local error
Input / Viewport subscriber failure     local containment
Render author misuse / limit           TypeError / RangeError
Content author misuse                   synchronous TypeError
ordinary Content read failure           ContentReadError caller-local
Control ambiguity/fatal                 Runtime failure
Data child/profile fatal                Data retirement
module/capability bootstrap failure     Runtime bootstrap failure
```

Platform path/token/ticket/DOM/internal stack不泄露业务。Framework不得依赖 map/example反向业务语义，不应建 generic Environment/Viewport manager；真实 consumer gap才允许最小 reopen。