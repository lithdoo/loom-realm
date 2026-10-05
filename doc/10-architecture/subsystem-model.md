# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10 Input closed + M11 Render surface frozen/current subject requalification pending / M12 Content author slice frozen**；Viewport v1 **Core Docs Frozen / not implemented / not qualified**；Realm State v1 **Core Semantics Closed / contract candidate / not implemented / not qualified**  
> 主要定义：Subsystem logical role、Definition Module ABI、Runtime/Frame local context、FrameOutcome、Input/Render/Content/Viewport/Realm State author projections与 error/lifetime boundary  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[渲染系统](./rendering-system.md)、[存储与内容系统](./storage-system.md)、[Realm State](./realm-state-system.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 正式 Input：[User Input v1](../15-contracts/user-input-v1.md) · [ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 正式 Render：[Render Update v1](../15-contracts/render-update-v1.md)  
> 正式 Content：[Content API v1](../15-contracts/content-api-v1.md)  
> Viewport 候选：[Viewport State v1](../15-contracts/viewport-state-v1.md) · [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) · [唯一 Core ledger](../30-implementation/viewport-profile-v1-qualification.md)  
> Realm State 候选：[Realm State v1](../15-contracts/realm-state-v1.md)  
> 最近复核：2026-10-05

---

## 1. Role Boundary

Subsystem Runtime负责：

```text
business-local state
Runtime-level business initialization/cleanup
local Frame Context + mutation gate
Frame-scoped Desired Input Interest
retained author-safe Input State + business delivery
outbound Frame call/return role
business Render Domain authoritative state + transient Event intent
readonly ContentClient usage
Runtime-scoped RealmStateClient usage for Session shared mutable business facts
```

新增的**待实施**角色能力：

```text
scope.viewport
    Runtime-scoped retained readonly Viewport observation

scope.state
    Runtime-scoped Realm State capability
    current read / initial read / discovery / OCC commit / subscription
```

Viewport 精确 API 与 terminal 行为以 [Viewport v1](../15-contracts/viewport-state-v1.md) 为准。Realm State 精确 logical semantics 以 [Realm State v1](../15-contracts/realm-state-v1.md) 为准。两者均不得被误写成已实现/已 qualified。

Subsystem不负责 Game/Platform manifest、executable selection、Process/Worker、Main public authority、Renderer hosting、DataConnectionBroker、Content physical service/credential/storage、RealmStateAuthority hosting/transport/persistence policy。

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
RealmStateAuthority implementation / Realm State carrier
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

Realm State
    Session shared mutable business facts
    Record version / OCC / commit revision

Subsystem
    business-local state
    local Frame Context + mutation gate
    Desired Interest[F]
    retained Input State / delivery
    business Render Domains
    RealmStateClient consumer

Platform
    executable + physical hosting/provisioning
    Content service/binding/credential
    Realm State physical binding/composition
```

Runner/module/transport/Content/Realm State physical ownership都不能产生第二份 Frame/Input/Render/Realm State authority。

Viewport observation独立 InputTarget/Activation/Frame gate；收到尺寸本身不授权 ordinary Frame-scoped mutation，也不直接写 Renderer Store/Projector 或创建新的 Render authority。

Realm State 是独立的 Runtime-scoped shared-state capability。`read` / `readInitial` / `list` / `commit` / `subscribe` 均不创建、消费或验证 Main 的 Frame / Activation / InputTarget authority。`state.commit()` 不因为调用点恰好位于某个 Frame handler 中，就自动受该 Frame 的 local mutation gate 支配。

必须保持：

```text
Frame suspend / close
Activation replacement
pending frame.call / return
    != RealmStateClient revoked
    != Realm State transaction admission condition
```

Realm State OCC 只解决 shared Record concurrency；Main/Subsystem control-flow mutation gate 只解决明确属于 Frame/Activation authority 的操作。两者正交，任何一方都不得隐式升级为另一方的 authority。

Runtime terminal 仍会终止该 Runtime 的 RealmStateClient / subscriptions；RealmStateAuthority fatal 则上报 Session-fatal condition，由 Session/Main lifecycle owner 提交 Session terminal 与 failure unwind。

---

## 4. Runtime / Frame

Startup 概念顺序：

```text
Realm State READY at Session level
→ Runner loads planned module
→ validates ABI
→ constructs required role capabilities
    ContentClient
    RealmStateClient
    Viewport / Data bindings as applicable
→ acquire Runtime Control
→ hello / identified
→ definition.initialize
→ ready
```

如果 required ContentClient 或 RealmStateClient 在 business initialize 前无法构造，属于 Runtime bootstrap failure。Realm State Authority 自身 fatal 是 Session-fatal condition，由 Session/Main lifecycle owner 收敛，不是 ordinary Runtime-local read error，也不由 RealmStateAuthority 直接执行 Runtime/Frame unwind。

`ready != Data exists != Renderer exists != Input/Render baseline exists`。Realm State READY 是 **business Runtime side effect 的前置条件**，而不是 `ready` 推导出的后置事实。

Frame author capability只暴露：

```text
id
params
signal
call(subsystem, params)
```

Author不见 activationId/generation/platform material 或 Realm State physical binding material。

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

`frame.call()` 是 control-flow composition；Realm State commit 是 shared-state coordination。业务 MUST NOT 用 `frame.call()` 模拟普通共享状态修改，也 MUST NOT 用 Realm State mutation模拟 child Frame 控制流。

---

## 6. Mutation Gate

每个 local Frame Context有 commit-sensitive mutation gate。pending call/return、administrative suspend、closing/closed、Runtime terminal阻止**其契约明确要求 current Frame/Activation authority** 的 ordinary business mutation。

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

Realm State **不属于这个 Frame mutation gate**：

```text
RealmStateClient lifetime
    Runtime-scoped

Realm State transaction admission
    client live
    request valid / within limits
    Record versions current
    Authority live

Frame state / Activation
    not a Realm State commit condition
```

因此 Subsystem SDK MUST NOT 为了调用 `state.commit()` 要求 `Frame`、`activationId`、ambient Frame context 或 mutation permit。已经 dispatch 的 Realm State commit 继续遵循 Realm State 自己的 commit-evidence / no-remote-cancellation 规则。

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

Accepted target 的 Current 实现已包含 `RenderDomainUpdate` root type 与 `RenderDomain.update(update)`；它覆盖 Domain zIndex 和 existing-node attrs/data 顶层 members，结构变化仍 `replace()`。它不暴露 domainId/revision/Patch/carrier，不改变 authority/lifetime，也不把 Map camera/tiles/motion带入 architecture contract。

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

返回 `contentVersion` 精确为 `sha256:<64 lowercase hex>`。

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

Object 与 Scope 同 Runtime lifetime，初始 `current=null`，存活期订阅同步交付最新值（含 null）；值先更新再调用；同步 throw/返回 rejected thenable 局部隔离；取消订阅幂等。Runtime terminal 后既有 callback inert，旧引用再次 `subscribe` 只返回 inert unsubscribe，**不首发**。Data loss保留历史值不等于当前画面可用；fresh carrier独立 baseline，old authority/source fenced。尺寸观察绝不创建 Frame mutation permit、InputTarget 或 Render commit；业务仅通过既有 author API渲染。[完整边界](../15-contracts/viewport-state-v1.md)与[可执行断言](../15-contracts/viewport-state-conformance-v1.md)拥有精确行为。

---

## 9b. Realm State Author Projection — v1 candidate, not implemented

`SubsystemScope` 计划 add-only 暴露：

```ts
interface SubsystemScope {
  readonly state: RealmStateClient;
}
```

RealmStateClient exact logical surface 由 [Realm State v1](../15-contracts/realm-state-v1.md) 拥有，当前为：

```text
read(keys,{signal?})
    current values + Record versions at one revision

readInitial(keys,{signal?})
    immutable current-Game baseline only

list({namespace?,signal?})
    flat materialized RealmStateKey + version discovery snapshot

commit(transaction)
    Record-version OCC + atomic whole-Record replacement
    no AbortSignal / no remote cancellation
    no Frame / Activation argument or gate

subscribe(keys,listener)
    explicit Record identities
    atomic baseline + ordered committed changes
```

Realm State current read / subscription 不重复携带 `initialValue`；initial baseline 只通过 `readInitial()` 按需读取。Commit success 只返回 commit revision + written Record identities/new versions，不 echo value。

RealmStateClient 是 Runtime-scoped capability，不是 repository/service locator。它不暴露 RealmStateAuthority、transport、Session ID、platform path、carrier、Frame/Activation identity、transaction coordinator、ACL registry 或 persistence handle。

Subscription listener 是 Runtime-local business callback，而不是 Authority execution step：listener delivery MUST 在 RealmStateAuthority serialized lane 外；同步 throw 或 returned rejected thenable MUST 被本地隔离/诊断，MUST NOT 反向使 subscription protocol fatal、RealmStateAuthority fatal 或 Session terminal。Listener MAY reenter `read` / `readInitial` / `list` / `commit` / `subscribe` / `close`，binding MUST NOT 因此 deadlock Authority。

Ordinary Realm State rejection/conflict 是 caller-visible business coordination结果，不自动 fail Frame/Runtime。`OUTCOME_UNKNOWN` 要求业务 fresh-read reconciliation，MUST NOT 自动 retry。RealmStateAuthority fatal 是 Session-fatal condition；Authority 报告该 condition，由 Session/Main lifecycle owner 提交 Session terminal 与 failure unwind。

---

## 10. Lifetime Matrix

```text
Frame lifetime
    owns Frame Context / frame.signal

Activation lifetime
    owns effective Input lease facts

Runtime lifetime
    owns SubsystemScope
    owns ContentClient / RealmStateClient / Viewport object
    owns business RenderDomain registry
    owns Realm State subscriptions created by this client

Data carrier lifetime
    owns connection-local Input/Render/Viewport publication baseline
```

因此：

```text
Frame suspend/close != ContentClient replacement
Frame suspend/close != RealmStateClient replacement
Activation change    != RealmStateClient replacement
Data reconnect       != RealmStateClient replacement
Renderer reload      != Realm State changed
Frame close          != RenderDomain close
Data retire          != business RenderDomain destroy
```

Runtime terminal最终 settle/abort owned work、terminal/inert RealmStateClient/subscriptions，并清理 live author resources。

---

## 11. Data / Realm State Planes

Subsystem SDK只有一个 connection-wide Renderer Data peer/reader：

```text
SubsystemDataBinding
→ @loomrealm/data peer
→ InputManager / RenderManager / Viewport role behavior
```

Input/Render/Viewport managers不得竞争 raw Data carrier。Content不是 Data application protocol，也不复用 M9 Data provisioning IPC。

Realm State 也 **不是 Renderer Data application protocol**：

```text
RealmStateClient
→ dedicated Realm State logical binding
→ RealmStateAuthority
```

Desktop MAY 使用同进程 direct binding；PWA MAY 使用 Worker/MessagePort 等 physical binding。无论 physical realization，Realm State MUST NOT 进入 `loomrealm.renderer-data/1`、Runtime Control 或 `frame.call()`。

---

## 12. Portability / Error Boundary

Business portability target：

```text
@loomrealm/map → @loomrealm/subsystem
```

错误分域：

```text
business validation                 → FrameOutcome.failed
pre-commit frame.call rejection     → typed local error
Input handler failure               → local containment
Render author misuse/limit          → TypeError / RangeError
Content author misuse               → synchronous TypeError
Content ordinary read failure       → ContentReadError, caller-local
Realm State invalid/limit/conflict  → Realm State caller-visible error/evidence
Realm State listener failure        → Runtime-local containment / diagnostics
Realm State OUTCOME_UNKNOWN         → caller reconciliation, no automatic retry
Realm State Authority fatal         → report Session-fatal condition to Main/Session owner
Control ambiguity/fatal             → Runtime failure
Data protocol fatal                 → Data retirement
module/capability bootstrap          → Runtime bootstrap failure
```

Platform path/token/ticket/internal stack与 Realm State carrier material不得泄漏给业务。

---

## 13. Final Invariants

1. Subsystem role platform-neutral；
2. Main独占 public Frame/Activation/InputTarget/DataAuthority；RealmStateAuthority独占 Session shared mutable business facts；
3. Business Definition只依赖 `@loomrealm/subsystem`；
4. Input、Render、Content、Viewport、Realm State使用不同且清晰的 authority/lifetime；
5. ContentClient是 Runtime-scoped readonly capability；RealmStateClient是 Runtime-scoped shared-state capability；二者都不是 service locator；
6. Content/Realm State logical capability与 executable/FSDB/HTTP/transport physical capability分离；
7. Render authoritative Domain独立于 Frame/Data carrier；
8. Realm State operations不创建或消费 Frame/Activation authority；`state.commit()` 不受 Frame mutation gate支配，也不接受 Frame/Activation参数；
9. Realm State OCC 与 control-flow mutation gate 正交；commit dispatch 后不提供 remote cancellation；
10. ordinary Input callback/Render author/Content read/Realm State conflict/listener failure不自动升级 Runtime/Frame/Session；RealmStateAuthority fatal 只报告 Session-fatal condition，由 Main/Session owner 提交 terminal/unwind；
11. Hostra/PWA physical差异不得改变 author-visible Realm State semantics；
12. Renderer Data plane 与 Realm State logical plane保持分离。

Viewport v1 与 Realm State v1 都是另行 formalized 的 Runtime capability 增量；它们不得把历史 M10–M13 PASS 误解释为新 capability 已实现/qualified。
