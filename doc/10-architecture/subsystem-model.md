# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：M10 Input closed + M11 Render surface frozen/current subject requalification pending + M12 Content frozen；Viewport author capability candidate under ADR0036  
> 主要定义：Subsystem logical role、Definition Module ABI、Runtime/Frame local context、FrameOutcome、Input/Viewport/Render/Content author projections与 error/lifetime boundary  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[渲染系统](./rendering-system.md)、[Viewport Capability](./viewport-capability.md)、[存储与内容系统](./storage-system.md)  
> 正式 Input：[User Input v1](../15-contracts/user-input-v1.md)  
> 候选 Viewport：[Viewport State v1](../15-contracts/viewport-state-v1.md) · [Renderer Data Profile v2](../15-contracts/renderer-data-profile-v2.md) · [ADR 0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> 正式 Render：[Render Update v1](../15-contracts/render-update-v1.md)  
> 正式 Content：[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-09-16

---

## 1. Role Boundary

Subsystem Runtime负责：

```text
business state
Runtime-level business initialization/cleanup
local Frame Context + mutation gate
Frame-scoped Desired Input Interest
retained author-safe Input State + business delivery
Runtime-scoped retained Viewport observation [candidate]
outbound Frame call/return role
business Render Domain authoritative state + transient Event intent
readonly ContentClient usage
```

Subsystem不负责 Game/Platform manifest、executable selection、Process/Worker、Main public authority、Renderer hosting、DataConnectionBroker、Viewport physical DOM source、Content physical service/credential/storage。

---

## 2. Definition Module / Platform Boundary

```text
Platform LaunchPlan
→ selected Definition Module
→ Host-owned Runner
→ role-local capabilities
→ @loomrealm/subsystem/host
→ Business Definition
```

Business Definition source只依赖：

```text
@loomrealm/subsystem
```

不得直接依赖：

```text
@loomrealm/subsystem/host
@loomrealm/data / runtime-control
@loomrealm/fsdb / fsdb-http
platform-ports
game-package / launcher
Node/Browser transport or DOM
```

Hostra/PWA artifact可以不同，但 author ABI与 business-observable semantics必须相同。

---

## 3. Authority Boundary

```text
Main
    Runtime public lifecycle
    Frame / Stack / Activation / InputTarget
    transaction/failure unwind
    DataAuthority

Subsystem
    business state
    local Frame Context + mutation gate
    Desired Interest[F]
    retained Input State / delivery
    retained viewport observation [candidate]
    business Render Domains

Renderer
    physical viewport observation [candidate]
    Render replica / presentation
    Input producer facts

Platform
    executable + physical hosting/provisioning
    Data carrier
    Content service/binding/credential
```

Viewport不改变 authority ownership：Renderer只观察 raw surface geometry；Map/业务 Runtime决定 camera/projection policy；Main不保存 width/height。

---

## 4. Runtime / Frame

Startup：

```text
Runner loads planned module
→ validates ABI
→ constructs required role capabilities
→ acquire Runtime Control
→ hello / identified
→ definition.initialize
→ ready
```

`ready != Data exists != Renderer exists != Input/Render/Viewport baseline exists`。

Frame author capability只暴露：

```text
id
params
signal
call(subsystem, params)
```

Author不见 activationId/generation/profile/platform material。

---

## 5. FrameOutcome / Mutation Gate

业务结果：

```text
completed(value)
cancelled()
failed(error)
```

Accepted child call会 suspend/revoke caller Activation，child完成后 surviving caller使用 fresh Activation。

每个 local Frame Context有 commit-sensitive mutation gate。pending call/return、administrative suspend、closing/closed、Runtime terminal阻止 ordinary business mutation。

Input State在 same-current-Activation pending mutation期间retain latest并 suppress delivery；Event drop。Known-no-commit reopen先同步收敛 retained State，再暴露 recoverable rejection。

RenderDomain与Viewport capability都不是 Activation lease：Frame suspend/InputTarget变化不会自动 destroy/clear它们。

---

## 6. Input Author Projection — M10 Closed

唯一 creation seam：

```text
SubsystemScope.createInputListener({frame,channels})
```

固定：

```text
channels/setChannels = Interest contribution
on/unsubscribe       = callback registration
setChannels preserves dormant registrations
close/unsubscribe idempotent
retained State detached/immutable
Event never replay
stable handler snapshot/order
async handler Promise never becomes Data-reader flow control
```

Fresh Activation不复用 old Input State/Event；fresh Data carrier隐藏地 republish current Desired Interest并等待 fresh State baseline。

Viewport明确不复用 custom Input state seam，因为其 lifetime不属于 InputTarget/Activation。

---

## 7. Viewport Author Projection — Candidate under ADR0036

目标 root surface：

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

Author不见：

```text
Renderer id
generation/dataProfile
DOM Window / ResizeObserver
DPR/screen/display id
wire viewport.state
physical source
```

Lifetime：

```text
Viewport object
    Runtime-scoped

current
    last successfully accepted observation
    null only before any accepted baseline

Frame suspend/close
    does not clear/replace capability

Activation/InputTarget change
    does not gate viewport convergence

Data carrier loss
    retain last current value

fresh carrier
    fresh wire baseline; equal value need not callback

Runtime terminal
    no future callback
```

`subscribe()` synchronously delivers one current value before future changes；unsubscribe idempotent。Callback failure local-contained and never becomes Data-reader flow control。

This candidate only becomes Frozen when Viewport State v1 + Renderer Data Profile v2 + conformance close on one subject。

---

## 8. Render Author Projection — M11 Surface Frozen / Current Subject Requalification Pending

Current `RenderDomain.update()` implementation subject remains qualification-ledger owned。

Exact public shape：

```ts
export interface RenderDomainState {
  readonly zIndex: number;
  readonly roots: readonly RenderNode[];
}

export interface RenderDomainUpdate {
  readonly zIndex?: number;
  readonly nodes?: readonly {
    readonly key: string;
    readonly attrs?: {
      readonly set?: Readonly<Record<string, string>>;
      readonly remove?: readonly string[];
    };
    readonly data?: {
      readonly set?: Readonly<Record<string, unknown>>;
      readonly remove?: readonly string[];
    };
  }[];
}

interface SubsystemScope {
  createRenderDomain(initialState: RenderDomainState): RenderDomain;
}

interface RenderDomain {
  replace(state: RenderDomainState): void;
  update(update: RenderDomainUpdate): void;
  emit(event: RenderEvent): void;
  close(): void;
}
```

`update()`只覆盖 Domain zIndex与 existing-node attrs/data顶层 members；结构变化继续 `replace()`。Author不见 domainId/revision/Patch/carrier。

所有 author operations synchronous local-only：

```text
validate → detach caller value → atomic local commit / bounded Event offer
```

固定：live business Domains ≤256；SDK domainId author-invisible/Runtime-instance no reuse；business Node key Domain-lifetime one-shot；Frame close/suspend != Domain destroy/hide；Data retire != Domain destroy；Event no future-carrier replay。

---

## 9. Content Author Projection — M12 Frozen

`SubsystemScope`：

```ts
readonly content: ContentClient;
```

Root只暴露 `record/resource`、Content value/read options/errors；不暴露 installationId、request contentVersion selector、raw HTTP/FSDB/path/token。

Returned content必须与 internal cache ownership隔离。普通 Content rejection不是 Runtime/Frame automatic failure；business自行决定 fallback/retry/outcome。

---

## 10. Lifetime Matrix

```text
Frame lifetime
    Frame Context / frame.signal

Activation lifetime
    effective Input lease facts

Runtime lifetime
    SubsystemScope
    ContentClient
    Viewport capability [candidate]
    business RenderDomain registry

Data carrier lifetime
    connection-local Input / Viewport / Render publication baselines
```

因此：

```text
Frame suspend/close != Viewport replacement
Activation change   != Viewport replacement
Data reconnect      != Viewport capability replacement
Data reconnect      != ContentClient replacement
Frame close         != RenderDomain close
Data retire         != business RenderDomain destroy
```

Runtime terminal最终 settle/abort owned work并清理 live author resources。

---

## 11. Data Plane

Subsystem SDK只有一个 connection-wide Data peer/reader：

```text
SubsystemDataBinding
→ @loomrealm/data profile peer
→ InputManager / Viewport retained receiver / RenderManager role behavior
```

Input/Viewport/Render不得竞争 raw carrier。Content不是 Data application protocol。

Profile v1只含 Input+Render；candidate Profile v2含 Input+Render+Viewport。Profile change必须由 Main DataAuthority使用 fresh generation表达。

---

## 12. Portability / Error Boundary

Business portability target：

```text
game-libs/* → @loomrealm/subsystem public author APIs
```

错误分域：

```text
business validation             → FrameOutcome.failed
pre-commit call rejection       → typed local error
Input handler failure           → local containment
Viewport subscriber failure     → local containment [candidate]
Render author misuse/limit      → TypeError / RangeError
Content author misuse           → synchronous TypeError
Content ordinary read failure   → ContentReadError, caller-local
Control ambiguity/fatal         → Runtime failure
Data child/profile fatal        → Data retirement
module/capability bootstrap     → Runtime bootstrap failure
```

Platform path/token/ticket/DOM object/internal stack不得泄漏给业务。

---

## 13. Final Invariants

1. Subsystem role platform-neutral；
2. Main独占 public Runtime/Frame/Activation/InputTarget/DataAuthority；
3. Business Definition只依赖 `@loomrealm/subsystem`；
4. Input、Viewport、Render、Content使用各自明确 lifetime/ownership；
5. Viewport是 Runtime-scoped readonly retained observation，不是 User Input lease；
6. ContentClient是 Runtime-scoped readonly capability，不是 service locator；
7. Render authoritative Domain独立于 Frame/Data carrier；
8. ordinary Input/Viewport callback、Render author、Content read failure不自动升级 Runtime/Frame；
9. Hostra/PWA physical差异不得改变 author-visible semantics；
10. 新 capability只有在真实 consumer证明 gap 后最小 reopen，不扩张成 generic Environment API。
