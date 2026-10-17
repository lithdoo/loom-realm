# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10 Input closed + M11 Render surface frozen/current subject requalification pending / M12 Content author slice frozen**；Viewport v1 **Core Docs Frozen / not implemented / not qualified**；Shared State v1 **Core Semantics Closed / contract candidate / not implemented / not qualified**；Session Events v1 **Core Semantics Frozen / implemented / qualified**
> 主要定义：Subsystem logical role、Definition Module ABI、Runtime/Frame local context、FrameOutcome、Input/Render/Content/Viewport/Shared State/Session Events author projections与 error/lifetime boundary  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[渲染系统](./rendering-system.md)、[存储与内容系统](./storage-system.md)、[Shared State](./shared-state-system.md)、[Session Events](./session-events-system.md)、[ADR 0030](../decisions/0030-freeze-m12-content-preimplementation-closure.md)  
> 正式 Input：[User Input v1](../15-contracts/user-input-v1.md) · [ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 正式 Render：[Render Update v1](../15-contracts/render-update-v1.md)  
> 正式 Content：[Content API v1](../15-contracts/content-api-v1.md)  
> Viewport 候选：[Viewport State v1](../15-contracts/viewport-state-v1.md) · [ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md) · [唯一 Core ledger](../30-implementation/viewport-profile-v1-qualification.md)  
> Shared State 候选：[Shared State v1](../15-contracts/shared-state-v1.md)  
> Session Events：[Session Events v1](../15-contracts/session-events-v1.md) · [Conformance](../15-contracts/session-events-conformance-v1.md)  
> 最近复核：2026-10-13

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
Runtime-scoped SharedStateClient usage for Session shared mutable business facts
Runtime-scoped SessionEventClient usage for Session transient cross-Subsystem events
```

标准 Runtime 角色能力：

```text
scope.viewport
    Runtime-scoped retained readonly Viewport observation

scope.state
    Runtime-scoped Shared State capability
    current read / initial read / discovery / OCC commit / subscription

scope.events
    Runtime-scoped Session Events capability
    exact-channel publish / subscribe / observable subscription terminal
```

Viewport 精确 API 与 terminal 行为以 [Viewport v1](../15-contracts/viewport-state-v1.md) 为准。Shared State 精确 logical semantics 以 [Shared State v1](../15-contracts/shared-state-v1.md) 为准。Session Events 精确 routing、delivery、failure/lifetime semantics 以 [Session Events v1](../15-contracts/session-events-v1.md) 为准；current implementation 的 Qualified 状态由 [exact-subject evidence](../30-implementation/session-events-v1-qualification.md) 支撑。

Subsystem不负责 Game/Platform manifest、executable selection、Process/Worker、Main public authority、Renderer hosting、DataConnectionBroker、Content physical service/credential/storage、SharedStateAuthority hosting/transport/persistence policy、SessionEventHub hosting/transport/process placement。

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
SharedStateAuthority implementation / Shared State carrier
SessionEventHub implementation / Session Events carrier
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

Shared State
    Session shared mutable business facts
    Record version / OCC / commit revision

SessionEventHub
    Session-scoped transient routing / bounded delivery
    no business truth ownership

Subsystem
    business-local state
    local Frame Context + mutation gate
    Desired Interest[F]
    retained Input State / delivery
    business Render Domains
    SharedStateClient consumer
    SessionEventClient consumer

Platform
    executable + physical hosting/provisioning
    Content service/binding/credential
    Shared State physical binding/composition
    Session Events physical binding/composition
```

Runner/module/transport/Content/Shared State/Session Events physical ownership都不能产生第二份 Frame/Input/Render/Shared State authority；SessionEventHub 也不能因 routing ownership升级成 business authority。

Viewport observation独立 InputTarget/Activation/Frame gate；收到尺寸本身不授权 ordinary Frame-scoped mutation，也不直接写 Renderer Store/Projector 或创建新的 Render authority。

Shared State 是独立的 Runtime-scoped shared-state capability。`read` / `readInitial` / `list` / `commit` / `subscribe` 均不创建、消费或验证 Main 的 Frame / Activation / InputTarget authority。`state.commit()` 不因为调用点恰好位于某个 Frame handler 中，就自动受该 Frame 的 local mutation gate 支配。

Session Events 同样是 Runtime-scoped Session capability。`events.publish()` / `events.subscribe()` 不创建、消费或验证 Frame / Activation / InputTarget authority，也不因当前 Frame suspend/close 自动撤销。

必须保持：

```text
Frame suspend / close
Activation replacement
pending frame.call / return
    != SharedStateClient revoked
    != Shared State transaction admission condition
    != SessionEventClient revoked
    != Session Events publish/subscribe admission condition
```

Shared State OCC 只解决 shared Record concurrency；Session Events exact-channel routing只解决 transient business notification fan-out；Main/Subsystem control-flow mutation gate 只解决明确属于 Frame/Activation authority 的操作。三者正交，任何一方都不得隐式升级为另一方的 authority。

Runtime terminal 仍会终止该 Runtime 的 SharedStateClient / SessionEventClient 及其 subscriptions；SharedStateAuthority fatal 或 SessionEventHub invariant fatal 则先 self-terminal，再上报 Session-fatal condition，由 Session/Main lifecycle owner 提交 Session terminal 与 failure unwind。

---

## 4. Runtime / Frame

Startup 概念顺序：

```text
Shared State READY + SessionEventHub READY at Session level
→ Runner loads planned module
→ validates ABI
→ constructs required role capabilities
    ContentClient
    SharedStateClient
    SessionEventClient
    Viewport / Data bindings as applicable
→ acquire Runtime Control
→ hello / identified
→ definition.initialize
→ ready
```

如果 required ContentClient、SharedStateClient 或 SessionEventClient 在 business initialize 前无法构造，属于 Runtime bootstrap failure。Shared State Authority / SessionEventHub 自身 fatal 是 Session-fatal condition，由 Session/Main lifecycle owner 收敛，不是 ordinary Runtime-local error，也不由 service 自己执行 Runtime/Frame unwind。

`ready != Data exists != Renderer exists != Input/Render baseline exists`。Shared State READY + SessionEventHub READY 是 **business Runtime side effect 的前置条件**，而不是 `ready` 推导出的后置事实。

Frame author capability只暴露：

```text
id
params
signal
call(subsystem, params)
```

Author不见 activationId/generation/platform material 或 Shared State / Session Events physical binding material。

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

`frame.call()` 是 control-flow composition；Shared State commit 是 shared-state coordination；Session Events publish 是 transient notification。业务 MUST NOT 用 `frame.call()` 模拟普通共享状态修改/事件广播，也 MUST NOT 用 Shared State mutation模拟 child Frame 控制流，或用 Session Events publish + reply-channel 偷偷建立 RPC。

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

Shared State **不属于这个 Frame mutation gate**：

```text
SharedStateClient lifetime
    Runtime-scoped

Shared State transaction admission
    client live
    request valid / within limits
    Record versions current
    Authority live

Frame state / Activation
    not a Shared State commit condition
```

Session Events 同样不属于 Frame mutation gate：

```text
SessionEventClient lifetime
    Runtime-scoped

Event operation admission
    client live
    usable Event binding
    request valid / within limits
    Hub live

Frame state / Activation
    not Event publish/subscribe condition
```

因此 Subsystem SDK MUST NOT 为了调用 `state.commit()`、`events.publish()` 或 `events.subscribe()` 要求 `Frame`、`activationId`、ambient Frame context 或 mutation permit。已经 dispatch 的 Shared State commit / Session Event publish继续遵循各自 evidence/no-auto-retry contract。

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

Input 的 `channels` 是 Input Interest vocabulary，与 Session Events business channel namespace无协议关系。

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

M11 Renderer Store internal-only；DOM/Canvas/WebGL presentation属于 M14。RenderDomain `emit()` 的 Event 是 presentation intent，不是 Session Event；需要 cross-Subsystem notification 时必须显式 `scope.events.publish(...)`。

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

## 9b. Shared State Author Projection — v1 candidate, not implemented

`SubsystemScope` 计划 add-only 暴露：

```ts
interface SubsystemScope {
  readonly state: SharedStateClient;
}
```

SharedStateClient exact logical surface 由 [Shared State v1](../15-contracts/shared-state-v1.md) 拥有，当前为：

```text
read(keys,{signal?})
    current values + Record versions at one revision

readInitial(keys,{signal?})
    immutable current-Game baseline only

list({namespace?,signal?})
    flat materialized SharedStateKey + version discovery snapshot

commit(transaction)
    Record-version OCC + atomic whole-Record replacement
    no AbortSignal / no remote cancellation
    no Frame / Activation argument or gate

subscribe(keys,listener)
    explicit Record identities
    atomic baseline + ordered committed changes
```

Shared State current read / subscription 不重复携带 `initialValue`；initial baseline 只通过 `readInitial()` 按需读取。Commit success 只返回 commit revision + written Record identities/new versions，不 echo value。

SharedStateClient 是 Runtime-scoped capability，不是 repository/service locator。它不暴露 SharedStateAuthority、transport、Session ID、platform path、carrier、Frame/Activation identity、transaction coordinator、ACL registry 或 persistence handle。

Subscription listener 是 Runtime-local business callback，而不是 Authority execution step：listener delivery MUST 在 SharedStateAuthority serialized lane 外；同步 throw 或 returned rejected thenable MUST 被本地隔离/诊断，MUST NOT 反向使 subscription protocol fatal、SharedStateAuthority fatal 或 Session terminal。Listener MAY reenter `read` / `readInitial` / `list` / `commit` / `subscribe` / `close`，binding MUST NOT 因此 deadlock Authority。

Ordinary Shared State rejection/conflict 是 caller-visible business coordination结果，不自动 fail Frame/Runtime。`OUTCOME_UNKNOWN` 要求业务 fresh-read reconciliation，MUST NOT 自动 retry。SharedStateAuthority fatal 是 Session-fatal condition；Authority 报告该 condition，由 Session/Main lifecycle owner 提交 Session terminal 与 failure unwind。

---

## 9c. Session Events Author Projection — v1 implemented

`SubsystemScope` add-only 暴露：

```ts
interface SubsystemScope {
  readonly events: SessionEventClient;
}
```

Exact v1 surface：

```ts
interface SessionEventClient {
  publish(channel: string, type: string, payload: JsonValue): Promise<void>;
  subscribe(
    channels: readonly string[],
    listener: (event: SessionEvent) => void | Promise<void>,
  ): Promise<SessionEventSubscription>;
}

interface SessionEventSubscription {
  readonly closed: Promise<{
    readonly reason:
      | "closed"
      | "overflow"
      | "binding-terminal"
      | "client-terminal"
      | "hub-terminal";
  }>;
  close(): void;
}
```

固定：

```text
channel = exact Hub routing key
type = business discriminator; not v1 filter
source.subsystemKey = binding-derived; publisher cannot spoof
subscribe() resolves only after atomic Hub installation
first callback after subscribe resolves
one subscription = one serial listener lane
close() synchronous local revoke
unexpected terminal observable via closed
no replay / no wildcard / no type filtering / no RPC
```

Session Event listener 是 Runtime-local callback。同步 throw/rejected thenable本地隔离，不 retroactively fail publish，也不自动 terminal subscription。Slow listener由 bounded queue吸收；would-overflow使该 subscription `closed.reason="overflow"`，不反向使 accepted publish失败。

---

## 10. Lifetime Matrix

```text
Frame lifetime
    owns Frame Context / frame.signal

Activation lifetime
    owns effective Input lease facts

Runtime lifetime
    owns SubsystemScope
    owns ContentClient / SharedStateClient / SessionEventClient / Viewport object
    owns business RenderDomain registry
    owns Shared State subscriptions created by this client
    owns Session Events subscriptions created by this client

Data carrier lifetime
    owns connection-local Input/Render/Viewport publication baseline

State/Event physical binding lifetime
    replaceable carrier under Runtime-scoped logical client
```

因此：

```text
Frame suspend/close != ContentClient replacement
Frame suspend/close != SharedStateClient replacement
Frame suspend/close != SessionEventClient replacement
Activation change    != SharedStateClient replacement
Activation change    != SessionEventClient replacement
Data reconnect       != SharedStateClient replacement
Data reconnect       != SessionEventClient replacement
Renderer reload      != Shared State changed
Renderer reload      != Session Events reset
Frame close          != RenderDomain close
Data retire          != business RenderDomain destroy
```

Runtime terminal最终 settle/abort owned work、terminal/inert SharedStateClient/SessionEventClient/subscriptions，并清理 live author resources。

---

## 11. Data / Shared State / Session Events Planes

Subsystem SDK只有一个 connection-wide Renderer Data peer/reader：

```text
SubsystemDataBinding
→ @loomrealm/data peer
→ InputManager / RenderManager / Viewport role behavior
```

Input/Render/Viewport managers不得竞争 raw Data carrier。Content不是 Data application protocol，也不复用 M9 Data provisioning IPC。

Shared State 也 **不是 Renderer Data application protocol**：

```text
SharedStateClient
→ dedicated Shared State logical binding
→ SharedStateAuthority
```

Session Events同样不是 Renderer Data application protocol：

```text
SessionEventClient
→ Session Events logical binding
→ SessionEventHub
```

Desktop MAY 使用同进程 direct binding；PWA MAY 使用 Worker/MessagePort 等 physical binding。State 与 Events MAY multiplex 同一个 Session-service physical carrier，但 logical bindings、failure/evidence、flow control 与 subscription identities必须独立。无论 physical realization，State/Events MUST NOT 进入 `loomrealm.renderer-data/1`、Runtime Control 或 `frame.call()` semantic namespace。

---

## 12. Portability / Error Boundary

Business portability target：

```text
@loomrealm/map → @loomrealm/subsystem
```

错误分域：

```text
business validation                       → FrameOutcome.failed
pre-commit frame.call rejection           → typed local error
Input handler failure                     → local containment
Render author misuse/limit                → TypeError / RangeError
Content author misuse                     → synchronous TypeError
Content ordinary read failure             → ContentReadError, caller-local
Shared State invalid/limit/conflict        → Shared State caller-visible error/evidence
Shared State listener failure              → Runtime-local containment / diagnostics
Shared State OUTCOME_UNKNOWN               → caller reconciliation, no automatic retry
Session Event invalid/limit/no-binding    → Session Event caller-visible failure
Session Event OUTCOME_UNKNOWN             → publisher reconciliation, no automatic retry
Session Event listener failure            → Runtime-local containment / diagnostics
Session Event subscription overflow       → subscription.closed(reason="overflow")
Session Event binding loss                → subscription.closed(reason="binding-terminal"); logical client may recover binding
Shared State Authority fatal               → report Session-fatal condition to Main/Session owner
Session Event Hub invariant fatal         → Hub self-terminal + report Session-fatal condition to Main/Session owner
Control ambiguity/fatal                   → Runtime failure
Data protocol fatal                       → Data retirement
module/capability bootstrap               → Runtime bootstrap failure
```

Platform path/token/ticket/internal stack与 Shared State / Session Events carrier material不得泄漏给业务。

---

## 13. Final Invariants

1. Subsystem role platform-neutral；
2. Main独占 public Frame/Activation/InputTarget/DataAuthority；SharedStateAuthority独占 Session shared mutable business facts；SessionEventHub只拥有 transient routing/delivery mechanics；
3. Business Definition只依赖 `@loomrealm/subsystem`；
4. Input、Render、Content、Viewport、Shared State、Session Events使用不同且清晰的 authority/lifetime；
5. ContentClient是 Runtime-scoped readonly capability；SharedStateClient是 Runtime-scoped shared-state capability；SessionEventClient是 Runtime-scoped transient-event capability；都不是 service locator；
6. logical capabilities与 executable/FSDB/HTTP/transport physical capability分离；
7. Render authoritative Domain独立于 Frame/Data carrier；
8. State/Event operations不创建或消费 Frame/Activation authority；
9. Shared State OCC、Session Event routing/delivery、control-flow mutation gate正交；
10. Event source由binding派生，channel exact routing，type不参与v1 filter；
11. Event subscribe只返回live handle，one subscription one serial lane，terminal通过`closed`可观察；
12. Event overflow explicit terminal，不silent drop，不retroactively fail accepted publish；
13. ordinary Input/Render/Content/State/Event callback/operation failure不自动升级 Runtime/Frame/Session；Authority/Hub fatal只报告 Session-fatal fact，由 Main/Session owner提交 terminal/unwind；
14. binding recovery不得自动 replay ambiguous State mutation/Session Event，也不得 reattach old subscriptions；
15. Hostra/PWA physical差异不得改变 author-visible State/Event semantics；
16. Renderer Data、Shared State、Session Events logical planes保持分离。

Viewport v1、Shared State v1、Session Events v1 都是另行 formalized 的 Runtime capability 增量；Session Events 的实现与资格只由其当前代码及 exact-subject evidence 支撑，不沿用历史 M10–M17 PASS。
