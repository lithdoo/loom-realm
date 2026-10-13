# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10 Input closed + M11 Render surface frozen/current subject requalification pending / M12 Content author slice frozen**；Viewport v1 **Core Docs Frozen / not implemented / not qualified**；Realm State v1 current；Session Events v1 **Core Semantics Frozen / not implemented / not qualified**  
> 主要定义：Subsystem logical role、Definition Module ABI、Runtime/Frame local context、FrameOutcome、Input/Render/Content/Viewport/Realm State/Session Events author projections与 error/lifetime boundary  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[渲染系统](./rendering-system.md)、[存储与内容系统](./storage-system.md)、[Realm State](./realm-state-system.md)、[Session Events](./session-events-system.md)  
> 正式 Input：[User Input v1](../15-contracts/user-input-v1.md)  
> 正式 Render：[Render Update v1](../15-contracts/render-update-v1.md)  
> 正式 Content：[Content API v1](../15-contracts/content-api-v1.md)  
> Viewport：[Viewport State v1](../15-contracts/viewport-state-v1.md)  
> Realm State：[Realm State v1](../15-contracts/realm-state-v1.md)  
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
business Render Domain authoritative state + transient Render Event intent
readonly ContentClient usage
Runtime-scoped RealmStateClient usage
Runtime-scoped SessionEventClient usage
```

待实施/独立 formalized role capability：

```text
scope.viewport
    Runtime-scoped readonly Viewport observation

scope.state
    Runtime-scoped Shared/Realm State capability

scope.events
    Runtime-scoped Session Events publish/subscribe capability
```

`scope.events` exact logical semantics 由 Session Events v1 拥有。Subsystem不负责 `SessionEventHub` hosting、carrier、subscription registry physical storage 或 process placement。

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
RealmStateAuthority implementation
SessionEventHub implementation
State/Event physical carriers
Node/Browser transport
```

Hostra/PWA artifact可以不同，但 author ABI和 business-observable semantics必须相同。

---

## 3. Authority Boundary

```text
Main
    Runtime public lifecycle
    Frame / Stack / Activation / InputTarget
    failure unwind
    DataAuthority

Realm/Shared State
    Session shared mutable business facts
    Record version / OCC / commit revision

SessionEventHub
    Session-scoped transient routing/delivery mechanics
    no business truth ownership

Subsystem
    business-local state
    local Frame Context + mutation gate
    Desired Interest[F]
    retained Input State / delivery
    business Render Domains
    RealmStateClient consumer
    SessionEventClient consumer

Platform
    executable + physical hosting/provisioning
    Content service/binding/credential
    State/Event physical composition/bindings
```

Runner/module/transport physical ownership不能产生第二份 Frame/Input/Render/State authority，也不能让 Event Hub变成 business authority。

Realm State 与 Session Events 都是 Runtime-scoped Session capabilities，不消费 Main 的 Frame / Activation / InputTarget authority。

```text
Frame suspend / close
Activation replacement
pending frame.call / return
    != RealmStateClient revoked
    != SessionEventClient revoked
```

Realm State OCC解决 shared state concurrency；Session Events channel routing解决 transient notification fan-out；Frame mutation gate解决明确属于 Frame/Activation authority 的操作。三者正交。

Runtime terminal会终止该 Runtime 的 State/Event logical clients及其 observations/subscriptions。State Authority fatal / Event Hub invariant fatal则报告 Session-fatal fact，由 Session/Main lifecycle owner提交 terminal/unwind。

---

## 4. Runtime / Frame

Startup 概念顺序：

```text
Realm State READY + SessionEventHub READY at Session level
→ Runner creates required Runtime-scoped clients
    ContentClient
    RealmStateClient
    SessionEventClient
    Viewport/Data bindings as applicable
→ loads/validates planned Definition Module
→ acquire Runtime Control
→ hello / identified
→ definition.initialize
→ ready
```

如果 required RealmStateClient 或 SessionEventClient 在 business initialize 前无法构造/绑定，属于 Runtime bootstrap failure。

```text
ready != Data exists != Renderer exists
```

State/Event Session services READY 是 business Runtime side effect 的前置条件，不是 Runtime `ready` 后置事实。

Frame author capability继续只暴露：

```text
id
params
signal
call(subsystem, params)
```

Author不见 activationId/generation/platform material 或 State/Event physical binding material。

---

## 5. FrameOutcome / Call

业务结果：

```text
completed(value)
cancelled()
failed(error)
```

`frame.call()` 是 control-flow composition；Realm State commit 是 shared-state coordination；Session Events publish 是 transient notification。

业务 MUST NOT：

```text
use frame.call() as ordinary Event Bus
use Session Events as request/reply RPC
use Realm State mutation to emulate child Frame flow
```

---

## 6. Mutation Gate

每个 local Frame Context有 commit-sensitive mutation gate，但 Realm State / Session Events不属于这个 Frame gate。

```text
RealmStateClient lifetime
    Runtime-scoped

SessionEventClient lifetime
    Runtime-scoped

State commit admission
    State contract conditions

Event publish/subscribe admission
    Event client/binding live + request valid/within limits

Frame/Activation
    not State/Event admission authority
```

因此 SDK MUST NOT 为 `state.commit()`、`events.publish()`、`events.subscribe()` 要求 Frame、activationId、ambient Frame context 或 mutation permit。

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
Input Event never replay
stable handler snapshot/order
```

Input `channels` 是 Input Interest 概念，与 Session Events business channel namespace没有协议关联。

---

## 8. Render Author Projection — M11 Surface Frozen

```ts
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

Render Event 是 RenderDomain-local presentation intent，不是 Session Event。需要两者时由 business owner显式分别提交。

---

## 9. Content Author Projection — M12 Frozen

```ts
interface SubsystemScope {
  readonly content: ContentClient;
}
```

ContentClient 是 Runtime-scoped readonly capability。普通 Content rejection不自动 fail Runtime/Frame；business自行决定 fallback/retry/outcome。

---

## 9a. Viewport Author Projection

```ts
interface ViewportSize { readonly width: number; readonly height: number }
interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (value: ViewportSize | null) => void): () => void;
}
interface SubsystemScope { readonly viewport: Viewport }
```

Viewport observation独立 Frame/Input/Event authority。

---

## 9b. Realm State Author Projection

```ts
interface SubsystemScope {
  readonly state: RealmStateClient;
}
```

RealmStateClient exact logical surface 由 Realm State v1 拥有，包括 read/readInitial/list/scan/commit/subscribe 与 OCC/evidence/lifetime。

RealmStateClient不暴露 Authority implementation、transport、Session ID、Frame/Activation identity、transaction coordinator或 persistence handle。

---

## 9c. Session Events Author Projection — v1 Frozen / not implemented

`SubsystemScope` add-only 暴露：

```ts
interface SubsystemScope {
  readonly events: SessionEventClient;
}
```

Exact v1 surface：

```ts
interface SessionEventClient {
  publish(
    channel: string,
    type: string,
    payload: JsonValue,
  ): Promise<void>;

  subscribe(
    channels: readonly string[],
    listener: SessionEventListener,
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

Author semantics：

```text
channel = exact Hub routing key
type = business discriminator, not v1 filter
source.subsystemKey = framework-derived publisher identity
subscribe resolves only after live Hub install
first callback after subscribe resolves
one subscription = one serial listener lane
close() synchronous local revoke
unexpected terminal observable via closed
no replay / no wildcard / no type filter / no RPC
```

Session Event listener是 Runtime-local callback。Throw/rejected Promise local isolate；不 retroactively fail publish，也不自动 terminal subscription。

Slow listener通过 bounded pending queue形成 subscriber-local backpressure；overflow terminal该 subscription，不反向使 accepted publisher失败。

---

## 10. Lifetime Matrix

```text
Frame lifetime
    owns Frame Context / frame.signal

Activation lifetime
    owns effective Input lease facts

Runtime lifetime
    owns SubsystemScope
    owns ContentClient / RealmStateClient / SessionEventClient / Viewport
    owns business RenderDomain registry
    owns State subscriptions + Event subscriptions created by its clients

Data carrier lifetime
    owns Input/Render/Viewport connection-local baseline

State/Event physical binding lifetime
    replaceable carrier under live Runtime-scoped logical client
```

因此：

```text
Frame suspend/close != State/Event client replacement
Activation change    != State/Event client replacement
Data reconnect       != State/Event client replacement
Renderer reload      != State/Event reset
Frame close          != RenderDomain close
```

Runtime terminal最终 terminal/inert RealmStateClient + SessionEventClient，并收敛其 subscriptions/resources。

---

## 11. Data / State / Events Planes

Renderer Data：

```text
SubsystemDataBinding
→ @loomrealm/data peer
→ InputManager / RenderManager / Viewport
```

State：

```text
RealmStateClient
→ State logical binding
→ RealmStateAuthority
```

Events：

```text
SessionEventClient
→ Events logical binding
→ SessionEventHub
```

State 与 Events MAY 共用 physical carrier，但 MUST NOT 进入 `loomrealm.renderer-data/1`、Runtime Control 或 `frame.call()` logical namespace。

---

## 12. Portability / Error Boundary

```text
business validation                    → FrameOutcome.failed
Input handler failure                  → local containment
Render author misuse                   → local author error
Content ordinary read failure          → ContentReadError, caller-local
Realm State conflict/invalid/limit     → State caller-visible error/evidence
Realm State OUTCOME_UNKNOWN            → caller reconciliation, no auto retry
Session Event invalid/limit/no-binding → Event caller-visible failure
Session Event OUTCOME_UNKNOWN          → publisher business reconciliation, no auto retry
Session Event listener failure         → local containment / diagnostics
Event subscription overflow            → subscription.closed overflow
Event binding loss                     → subscription.closed binding-terminal; client may recover binding
State Authority / Event Hub fatal      → report Session-fatal fact to Main/Session owner
Control ambiguity/fatal                → Runtime failure
Data protocol fatal                    → Data retirement
module/capability bootstrap             → Runtime bootstrap failure
```

Platform path/token/ticket/internal stack、State/Event carrier material不得泄漏给业务。

---

## 13. Final Invariants

1. Subsystem role platform-neutral；
2. Business Definition只依赖 `@loomrealm/subsystem`；
3. Input、Render、Content、Viewport、State、Session Events有独立 authority/lifetime；
4. State/Event clients都是 Runtime-scoped logical capabilities，不是 transport handles；
5. State/Event operations不创建或消费 Frame/Activation authority；
6. `frame.call()`、State commit、Event publish分别表达 control、current truth、transient notification；
7. `scope.events` exact-channel routing，type不参与v1 filtering；
8. Event source由framework binding派生，不能spoof；
9. Event subscribe async live-handle，closed提供终止证据，listener serial delivery；
10. Event overflow显式terminal，不silent drop，不retroactively fail accepted publish；
11. binding recovery不自动replay State mutation或 Session Event，也不reattach旧subscription；
12. ordinary listener/read/conflict/binding failures不自动升级 Runtime/Frame/Session；
13. Authority/Hub fatal只报告 Session-fatal fact，由 Main/Session owner terminal/unwind；
14. Hostra/PWA physical差异不得改变 author-visible State/Event semantics；
15. Renderer Data、State、Session Events logical planes保持分离。