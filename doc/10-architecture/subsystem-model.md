# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10 Input closed + M11 Render surface frozen/current subject requalification pending / M12 Content author slice frozen**；Viewport v1 **Core Docs Frozen / not implemented / not qualified**  
> 主要定义：Subsystem logical role、Definition Module ABI、Runtime/Frame local context、FrameOutcome、Input/Render/Content author projections与 error/lifetime boundary  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[渲染系统](./rendering-system.md)、[存储与内容系统](./storage-system.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 正式 Input：[User Input v1](../15-contracts/user-input-v1.md) · [ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 正式 Render：[Render Update v1](../15-contracts/render-update-v1.md)  
> 正式 Content：[Content API v1](../15-contracts/content-api-v1.md)  
> Viewport 候选：[Viewport State v1](../15-contracts/viewport-state-v1.md) · [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) · [唯一 Core ledger](../30-implementation/viewport-profile-v1-qualification.md)  
> 最近复核：2026-09-16（仅新增 Viewport seam；历史 Input/Render/Content 原文保留）

---

## 1. Role Boundary

Subsystem Runtime负责：

```text
business state
Runtime-level business initialization/cleanup
local Frame Context + mutation gate
Frame-scoped Desired Input Interest
retained author-safe Input State + business delivery
outbound Frame call/return role
business Render Domain authoritative state + transient Event intent
readonly ContentClient usage
```

新增的**待实施**角色能力：Runtime-scoped retained readonly `scope.viewport`；只保留当前 Renderer 经修订四-child `/1` 发布的最后合法 CSS logical size，不拥有物理 Window、Map camera 或 Frame/Input authority。精确 API 与 terminal 行为以[Viewport v1](../15-contracts/viewport-state-v1.md)为准，不将此能力误写成已实现。

Subsystem不负责 Game/Platform manifest、executable selection、Process/Worker、Main public authority、Renderer hosting、DataConnectionBroker、Content physical service/credential/storage。

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
Node/Browser transport
```

Hostra/PWA artifact可以不同，但 author ABI和 business-observable semantics必须相同。

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
    business Render Domains

Platform
    executable + physical hosting/provisioning
    Content service/binding/credential
```

Runner/module/transport/Content ownership都不能产生第二份 Frame/Input/Render authority。

Viewport observation独立 InputTarget/Activation/Frame gate；收到尺寸本身不授权 ordinary business mutation，也不直接写 Renderer Store/Projector 或创建新的 Render authority。业务有权在现有 mutation gate 内按自身规则使用 observation 更新 RenderDomain；Core 不规定地图策略。

---

## 4. Runtime / Frame

Startup：

```text
Runner loads planned module
→ validates ABI
→ constructs required role capabilities including M12 ContentClient
→ acquire Runtime Control
→ hello / identified
→ definition.initialize
→ ready
```

如果 required ContentClient在 business initialize前无法构造，属于 Runtime bootstrap failure。

`ready != Data exists != Renderer exists != Input/Render baseline exists`。

Frame author capability只暴露：

```text
id
params
signal
call(subsystem, params)
```

Author不见 activationId/generation/platform material。

---

## 5. FrameOutcome / Call

业务结果：

```text
completed(value)
cancelled()
failed(error)
```

Accepted child call会 suspend/revoke caller Activation，child完成后 surviving caller使用 fresh Activation。

只有明确 pre-commit recoverable rejection可以 typed reject并确认 same current Activation继续；timeout/loss/divergence等 ambiguous/fatal绝不重新进入业务 continuation。

M10已冻结：known-no-commit + same Activation reopen时 retained Input State synchronous local convergence先于 recoverable `frame.call` rejection observable。

---

## 6. Mutation Gate

每个 local Frame Context有 commit-sensitive mutation gate。pending call/return、administrative suspend、closing/closed、Runtime terminal阻止 ordinary business mutation。

Input：

```text
same-current-Activation pending mutation
    .state → retain latest, suppress delivery
    .event → drop

known-no-commit reopen
    → deliver current retained State
    → then recoverable rejection observable
```

Render Domain lifecycle不由 mutation gate/Frame自动创建或销毁。

---

## 7. Input Author Projection — M10 Closed

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

---

## 8. Render Author Projection — M11 Surface Frozen / Current Subject Requalification Pending

> **Current：** `RenderDomain.update()` 的 current implementation subject 是 `c642cda9cee2b318b3aa8f6285de05d6b6ed6bea`，author surface 保持冻结，本地 `npm run test:m11` 已通过，hosted Node 20/24 尚待复验。旧 [M11 run 34998417265](https://github.com/lithdoo/loom-realm/actions/runs/34998417265) 仅证明 `a838a4fa43fc57bdaaf4f52bf7bc076bb4771e9f`。

Exact surface：

```ts
export interface RenderDomainState {
  readonly zIndex: number;
  readonly roots: readonly RenderNode[];
}

export interface RenderDomainUpdate {
  readonly zIndex?: number;
  readonly nodes?: readonly {
    readonly key: string;
    readonly attrs?: { readonly set?: Readonly<Record<string, string>>; readonly remove?: readonly string[] };
    readonly data?: { readonly set?: Readonly<Record<string, unknown>>; readonly remove?: readonly string[] };
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

Accepted target 的 Current 实现已包含 `RenderDomainUpdate` root type 与 `RenderDomain.update(update)`；它覆盖 Domain zIndex 和 existing-node attrs/data 顶层 members，结构变化仍 `replace()`。它不暴露 domainId/revision/Patch/carrier，不改变下述 authority/lifetime，也不把 Map camera/tiles/motion带入 architecture contract。

所有 author operations synchronous local-only：

```text
validate → detach caller value → atomic local commit / bounded Event offer
```

固定：

```text
live business Domains <= 256
SDK domainId author-invisible / Runtime-instance no reuse
business Node key Domain-lifetime one-shot
Frame close/suspend != Domain destroy/hide
Data retire != Domain destroy
Event no future-carrier replay
```

M11 Renderer Store internal-only；DOM/Canvas/WebGL presentation属于 M14。

---

## 9. Content Author Projection — M12 Frozen

`SubsystemScope` exact新增：

```ts
readonly content: ContentClient;
```

M12 author root只暴露：

```text
ContentClient.record(namespace,key,{signal?})
ContentClient.resource(namespace,hierarchicalResourceKey,{signal?})
ContentRecord / ContentResource
ContentReadOptions
ContentReadError / ContentReadErrorCode
```

Author不提供：

```text
installationId
contentVersion request selector
manifest()/group()/head()
raw fetch / Response / Headers
URL builder / bearer
filesystem path / FSDB handle
```

返回 `contentVersion` 精确为：

```text
sha256:<64 lowercase hex>
```

Local arguments在 HTTP前同步验证；invalid usage → `TypeError` + zero HTTP。Already-aborted valid signal → returned Promise rejects `ContentReadError("CONTENT_CANCELLED")` + zero HTTP。

Returned JSON/`Uint8Array`必须与 internal cache ownership隔离；caller mutation不能改变 future reads。

普通 Content rejection：

```text
!= Runtime failure
!= Frame failure
!= automatic Frame unwind
```

Business自行决定 fallback/retry/failed outcome。

如果 M13出现第一个真实 `group()` author consumer，再显式最小 reopen；不得 raw Content/FSDB旁路。

---

## 9a. Viewport Author Projection — revised `/1` candidate, not implemented

```ts
interface ViewportSize { readonly width: number; readonly height: number }
interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (value: ViewportSize | null) => void): () => void;
}
interface SubsystemScope { readonly viewport: Viewport }
```

Object 与 Scope 同 Runtime lifetime，初始 `current=null`，存活期订阅同步交付最新值（含 null）；值先更新再调用；同步 throw/返回 rejected thenable 局部隔离；取消订阅幂等。Runtime terminal 后既有 callback inert，旧引用再次 `subscribe` 只返回 inert unsubscribe，**不首发**。Data loss保留历史值不等于当前画面可用；fresh carrier独立 baseline，old authority/source fenced。尺寸观察绝不创建 Frame mutation permit、InputTarget 或 Render commit；业务仅通过既有 author API 渲染。[完整边界](../15-contracts/viewport-state-v1.md)与[可执行断言](../15-contracts/viewport-state-conformance-v1.md)拥有精确行为。

---

## 10. Lifetime Matrix

```text
Frame lifetime
    owns Frame Context / frame.signal

Activation lifetime
    owns effective Input lease facts

Runtime lifetime
    owns SubsystemScope / ContentClient / business RenderDomain registry

Data carrier lifetime
    owns connection-local Input/Render publication baseline
```

Viewport object/retained last value属 Runtime lifetime；Viewport 的 outbound publication cursor属各 current Data carrier，二者不得混同。

因此：

```text
Frame suspend/close != ContentClient replacement
Activation change   != ContentClient replacement
Data reconnect       != ContentClient replacement
Frame close          != RenderDomain close
Data retire          != business RenderDomain destroy
```

Runtime terminal最终 settle/abort owned work并清理 live author resources。

---

## 11. Data Plane

Subsystem SDK只有一个 connection-wide Data peer/reader：

```text
SubsystemDataBinding
→ @loomrealm/data peer
→ InputManager / RenderManager role behavior
```

修订后 `/1` 仅在相同 reader/peer 后追加 Viewport retained role handler；见[Data add-only exact seam](../../packages/data/VIEWPORT_V1_IMPLEMENTATION_DELTA.md)。Input/Render managers不得竞争 raw carrier。Content不是 Data application protocol，也不复用 M9 Data provisioning IPC。

---

## 12. Portability / Error Boundary

Business portability target：

```text
@loomrealm/map → @loomrealm/subsystem
```

错误分域：

```text
business validation            → FrameOutcome.failed
pre-commit call rejection      → typed local error
Input handler failure          → local containment
Render author misuse/limit     → TypeError / RangeError
Content author misuse          → synchronous TypeError
Content ordinary read failure  → ContentReadError, caller-local
Control ambiguity/fatal        → Runtime failure
Data protocol fatal            → Data retirement
module/capability bootstrap     → Runtime bootstrap failure
```

Platform path/token/ticket/internal stack不得泄漏给业务。

---

## 13. Final Invariants

1. Subsystem role platform-neutral；
2. Main独占 public Frame/Activation/InputTarget/DataAuthority；
3. Business Definition只依赖 `@loomrealm/subsystem`；
4. M10 Input、M11 Render、M12 Content使用不同但清晰的 lifetime/ownership；
5. ContentClient是 Runtime-scoped readonly capability，不是 Repository/service locator；
6. Content与 executable/FSDB/HTTP physical capability分离；
7. Render authoritative Domain独立于 Frame/Data carrier；
8. ordinary Input callback/Render author/Content read failure不自动升级 Runtime/Frame；
9. Hostra/PWA physical差异不得改变 author-visible semantics；
10. M13作为真实业务 consumer验证这些冻结边界，而不是重新定义它们。

Viewport v1 是另行候选的 Runtime readonly 增量，不改变以上十项或将历史 M10–M13 PASS 解释为修订后四-child `/1` 合格。