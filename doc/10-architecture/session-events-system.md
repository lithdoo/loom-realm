# Session Events：Session 级跨 Subsystem 事件系统

> 层级：系统架构  
> 状态：Active Design / not implemented / not qualified  
> 稳定程度：**Core Semantics + Current Runtime Integration Frozen**  
> 主要定义：Session-scoped cross-Subsystem transient event distribution、Channel routing、SessionEventHub、Runtime-scoped SessionEventClient、subscription lifetime、serial delivery、failure/backpressure、与 Shared State / Render Event / Control / Diagnostics 的边界  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[Subsystem 模型](./subsystem-model.md)、[渲染系统](./rendering-system.md)  
> 正式化：[Session Events v1](../15-contracts/session-events-v1.md) · [Runtime Integration Profile](../15-contracts/session-events-runtime-profile-v1.md) · [Conformance](../15-contracts/session-events-conformance-v1.md)  
> 最近复核：2026-10-13

本文定义 LoomRealm 的 **Session Events**：同一 Session 内，不同 Subsystem Runtime 之间的 transient business event distribution capability。

目标 package：

```text
@loomrealm/session-events
```

逻辑角色：

```text
SessionEventHub
    Session-scoped routing / bounded delivery infrastructure

SessionEventClient
    Runtime-scoped publish / subscribe capability
```

Shared State 重命名完成前，现有 `Realm State` contract/code 与本文的 `Shared State` 指同一 shared mutable business-state capability。

---

## 1. 核心结论

1. Session Events 是独立于 Main、Shared State、Renderer Data 与 Content 的 logical communication plane；
2. Shared State 表达“当前 authoritative fact 是什么”，Session Events 表达“刚刚发生了什么”；
3. `SessionEventHub` 不是 business authority，只拥有 routing、subscription lifetime、bounded delivery mechanics；
4. event transient：不保存 current value、不 replay history；
5. Channel 是 v1 唯一 Hub routing/filter key；type 不参与 v1 routing；
6. `subscribe()` 异步建立，只返回已经 live 的 subscription；如果 candidate 在成功返回前已 terminal，则 reject 而不是返回死亡 handle；
7. 每个 subscription 是一条 serial delivery lane，同一时刻最多一个 listener invocation；
8. business delivery bounded；无法继续保证 delivery 时 subscription 显式 terminal，而不是 silent drop；
9. subscription unexpected terminal 通过 `closed` Promise 可观察；
10. `publish()` success 只表示 Hub accepted/routed，不等待 business listener；
11. author-facing logical failure 使用稳定 `SessionEventError` / `isSessionEventFailure()` surface；
12. source identity 来自绑定的 Runtime identity，publisher 不能伪造；
13. logical architecture 允许 State/Events 共进程、共 carrier，但 current Hostra/PWA v1 realization 冻结为 dedicated Event carrier；
14. Hub invariant-fatal 通过独立 `sessionEventsFatal` narrow fact 报 Main，Main 仍独占 Session terminal/unwind；
15. v1 不提供 RPC、replay、durable log、exactly-once、wildcard/type filtering 或 State+Event transaction。

---

## 2. Architecture Position

```text
Session composition
    ├── Main
    │     Control Authority
    ├── SharedStateAuthority
    │     Session Shared Business State Authority
    ├── SessionEventHub
    │     Session Event Distribution
    │     no business truth ownership
    └── Subsystem Runtimes
          ├── SharedStateClient
          ├── SessionEventClient
          ├── ContentClient
          ├── RenderDomain
          └── Input / Viewport / Frame capabilities
```

职责必须保持：

```text
Main
    who is current/running + control flow

Shared State
    current shared business truth

Session Events
    transient business notification

Render Event
    one RenderDomain presentation intent

Content
    installation definition/resource
```

SessionEventHub 不根据事件流重建 authoritative world state，也不拥有 Main lifecycle/control truth。

---

## 3. State vs Event Placement

如果 late joiner / restarted Runtime 必须知道某事实，或者未来判断依赖其 current value，该事实 MUST NOT 只存在于 Session Events。

典型 Shared State：

```text
player.hp
inventory/main
quest/progression
world/flags
party/members
```

典型 Session Event：

```text
channel = "battle"
type    = "enemy-defeated"

channel = "dialogue"
type    = "finished"
```

推荐组合：

```text
Battle publishes battle/enemy-defeated
        ↓
Quest listener decides consequence
        ↓
SharedStateClient.commit(...)
        ↓
quest/progression becomes authoritative
```

Event delivery success 不是 Shared State commit evidence；两者不原子、不共享 revision/order。

---

## 4. Channel Model

```text
channel
    Hub routing identity

type
    semantic discriminator inside channel

payload
    event business data
```

Channel exact match，允许 `/`：

```text
battle
battle/main
battle/encounter/42
```

在 v1 是三个独立 identity。

`/` 没有 hierarchy、prefix、wildcard、glob、regex 或 parent subscription 语义。

订阅 `battle` 不会收到 `battle/main`。

Type 不参与 v1 routing；订阅某 channel 会收到该 channel 下所有 types，由 listener 本地判断。

---

## 5. Author Projection

```ts
interface SubsystemScope {
  readonly events: SessionEventClient;
}

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

type SessionEventListener =
  (event: SessionEvent) => void | Promise<void>;

interface SessionEvent {
  readonly channel: string;
  readonly type: string;
  readonly payload: JsonValue;
  readonly source: {
    readonly subsystemKey: string;
  };
}

type SessionEventSubscriptionCloseReason =
  | "closed"
  | "overflow"
  | "binding-terminal"
  | "client-terminal"
  | "hub-terminal";

interface SessionEventSubscription {
  readonly closed: Promise<{
    readonly reason: SessionEventSubscriptionCloseReason;
  }>;
  close(): void;
}
```

Logical failure author surface：

```ts
class SessionEventError extends Error {
  readonly code:
    | "INVALID_REQUEST"
    | "LIMIT_EXCEEDED"
    | "TERMINAL"
    | "BINDING_UNAVAILABLE"
    | "OUTCOME_UNKNOWN";
  readonly path?: readonly (string | number)[];
}
```

并提供 structural `isSessionEventFailure()`；caller 不依赖 exact message 或跨 realm `instanceof` 做业务判断。

`source.subsystemKey` 是 authenticated logical publisher identity；publisher 不提供 `source`，Hub/binding 根据 Runtime binding 构造。

Author 不见 process/Worker/socket/port/generation/request-id 等 physical material。

---

## 6. Subscription Establishment

```text
Runtime subscribe(channels, listener)
        ↓
Hub validates complete exact-channel set
        ↓
atomic install @ N
        ↓
ack
        ↓
subscribe() resolves with already-live handle
```

匹配事件：

```text
accepted before N → not part of subscription
accepted after N  → eligible
```

如果 event 在 N 后但 subscribe result author-visible 之前到达，必须 bounded retain：

```text
subscribe resolves
→ listener may start
```

但如果 candidate 在成功 result author-visible 前已经 terminal：

```text
overflow          → subscribe rejects LIMIT_EXCEEDED
binding terminal  → subscribe rejects BINDING_UNAVAILABLE
client/Hub term.  → subscribe rejects TERMINAL
```

此时不返回 handle、不调用 listener；这不是 `OUTCOME_UNKNOWN`。

v1 不暴露 half-open subscription、`ready` 或 pending status。

建立失败/ack ambiguity 时不返回 handle、不调用 listener；Hub-side orphan candidate 必须由 binding/request lifetime fencing 回收。

---

## 7. Subscription Close / Terminal

`close()` 同步、幂等：

```text
close() returns
→ local subscription inert
→ no new listener invocation starts
```

Remote unsubscribe cleanup 可异步完成。

每个 successful subscription 暴露 non-rejecting one-shot：

```ts
subscription.closed
```

原因：

```text
closed
    explicit author close

overflow
    delivery queue cannot preserve guarantee

binding-terminal
    carrying binding lost/terminal

client-terminal
    Runtime-scoped client terminal

hub-terminal
    Hub/Session terminal
```

这样“business event 不 silent drop”形成闭环：如果系统无法继续交付，业务至少能够观察 subscription 已失效。

已经开始执行的 listener 不因 close/terminal 被强制取消；只保证之后不再启动新 invocation。

---

## 8. Publish / Routing / Multiplicity

```text
publisher
→ publish(channel,type,payload)
→ Hub validates + accepts
→ snapshot matching exact-channel subscriptions
→ admit one delivery per matching subscription
→ async serial subscription lanes
```

Hub-side filtering 是正常模型；不向 unrelated Runtime broadcast 后再本地丢弃。

一个 accepted event：

```text
one matching subscription
    → at most one delivery

two matching subscriptions in same Runtime
    → one delivery to each

publisher's own matching subscription
    → eligible self-delivery

zero subscribers
    → publish still succeeds
```

Publisher success：

```text
Hub accepted/routed
!= listener started/completed/succeeded
```

Individual subscriber overflow 不 retroactively fail accepted publish。

---

## 9. Serial Listener Lane

每个 subscription 一条独立 delivery lane：

```text
event A
→ listener(A)
→ wait sync return / Promise settle
→ event B
→ listener(B)
```

同一 subscription 同时最多一个 active listener invocation。

这个 await 只是 subscriber-local backpressure，不是 publish ACK。

Listener throw/rejected Promise local isolate + diagnostics；subscription 默认继续下一条，不因此 terminal。

Listener 可以 reenter publish/subscribe，也可以 close 自己，不得 deadlock Hub。

---

## 10. Ordering

同一 publisher binding：

```text
A accepted before B
→ any subscription receiving both observes A before B
```

不同 publishers 没有 global total order。不同 subscriptions 也可以以不同速度消费。

不存在：

```text
Session Event order == Shared State revision
Session Event order == Main Control order
Session Event order == Render/Input order
```

Hub 内部调度 counter 不升级为业务 universal clock。

---

## 11. Backpressure / Limits

v1 logical hard limits：

```text
channel UTF-8 <= 256 bytes
type UTF-8 <= 128 bytes
payload JSON <= 256 KiB
JsonValue depth <= 64
channels/subscription <= 64
live subscriptions/client <= 64
pending events/subscription <= 64
pending logical bytes/subscription <= 8 MiB
```

Slow listener 使 pending queue 增长；would-overflow 时：

```text
that subscription → overflow terminal
closed resolves overflow
no new listener invocation
accepted publish remains accepted
```

这提供自然的 consumer backpressure 边界，而不让一个慢 consumer 拖死 publisher。

---

## 12. Failure / Evidence

Stable failure codes：

```text
INVALID_REQUEST
LIMIT_EXCEEDED
TERMINAL
BINDING_UNAVAILABLE
OUTCOME_UNKNOWN
```

Author-facing failed `publish/subscribe` reject `SessionEventError`，remote transport error 先映射为稳定 failure surface 后再暴露给业务。

Publish：

```text
pre-dispatch rejection
    → known not accepted

success
    → known accepted

post-dispatch definitive result lost
    → OUTCOME_UNKNOWN
    → no automatic retry
```

Subscribe ambiguity 不产生业务 `OUTCOME_UNKNOWN` handle；失败 = no handle + no callbacks + orphan cleanup。

---

## 13. Logical Client / Binding Recovery

`SessionEventClient` 是 Runtime-scoped logical capability，不等于某个 socket/process/MessagePort。

无 usable binding 时：

```text
new publish → BINDING_UNAVAILABLE, no wait/queue
new subscribe → BINDING_UNAVAILABLE, no handle/wait
```

Binding loss：

```text
old subscriptions → binding-terminal
logical client remains live if Runtime remains live
fresh binding MAY be installed
future operations MAY proceed
business must fresh subscribe
no replay / no transparent reattach
```

Old-binding late events/results/acks 必须被 generation fencing 隔离。

---

## 14. Runtime / Session Lifetime

```text
Frame suspend/close
Activation replacement
Renderer reload
Data reconnect
    != Event client revoke/reset
```

Runtime terminal：

```text
client terminal
future operations TERMINAL
subscriptions client-terminal
```

Hub/Session terminal：

```text
Hub inert
future operations TERMINAL
subscriptions hub-terminal
```

Hub invariant fatal 时先 self-terminal，再通过 `MainSessionEventsFatalSource` 的 latched one-shot fact 向 Main 报告；Main 仍是唯一 terminal/unwind authority。Current composition implementing Session Events 必须在 `runMain()` 前提供 `sessionEventsFatal`。

Pre-READY Hub construction failure 是 bootstrap failure，不是假造 live-Hub fatal。

---

## 15. Render / Diagnostics Boundary

`render.event` 属 RenderDomain/presentation plane，不自动桥接 Session Events。

Diagnostics/logging 可以复用 routing core 或 carrier，但 logical role/QoS 独立；推荐 `scope.log.*` 而不是把 log 当普通 business event。

---

## 16. Physical Realization / Shared Carrier

Logical architecture 合法 placement：

```text
Event Hub 独立 Process/Worker
State + Events 共进程
Main + State + Events 共 Session host
in-process direct Hub
```

Logical contract 合法 carrier：

```text
State dedicated + Events dedicated

or

shared Session-service carrier
    ├── Shared State logical binding
    └── Session Events logical binding
```

核心规则：

> **shared carrier != shared logical protocol != shared authority != shared ordering domain**

共 carrier 仍需独立 correlation、flow-control、evidence/failure、subscription identity；Event/Diagnostics traffic 不得无限饿死 State。

Physical wire order 不创建 State/Event public happens-before。

但 current product profile 已冻结：

```text
Hostra
    SessionEventHub in LoomRealm Desktop process
    per Runtime dedicated private Events WebSocket

PWA
    SessionEventHub in Session Worker
    per Runtime dedicated private Events MessagePort
    installed through Runner provisioning control
```

Hostra 不扩展历史 M6 Control bootstrap，而通过 host-owned `LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT` seam；PWA 保持 `PwaRunnerBootstrapV1` closed schema 不变。精确规则见 [Runtime Integration Profile](../15-contracts/session-events-runtime-profile-v1.md)。

未来 multiplex 是 physical optimization，需要独立 profile/qualification，不改变 author API。

---

## 17. Explicit Non-goals

v1 不设计：

```text
request/reply RPC
service discovery
command bus
workflow/saga
durable event store / event sourcing
history replay/cursor
consumer groups
exactly-once
automatic retry
global Session sequence
State+Event transaction
channel ACL
channel wildcard/prefix/glob/regex
channel hierarchy semantics
type-filtered subscription
schema registry
Renderer direct subscription
Render Event bridge
updateChannels()
universal EventBus
```

---

## 18. Final Invariants

1. Session Events 只做 Session-scoped transient cross-Subsystem distribution；
2. Hub owns routing mechanics, not business truth；
3. channel 是唯一 v1 routing key，type 不参与过滤；
4. source 来自 authenticated Runtime binding，不能 spoof；
5. subscribe async 且只返回仍然 live 的 handle；pre-visible terminal 必须 reject；
6. first callback after subscribe resolve；
7. failed logical operation 使用稳定 SessionEventError / structural failure guard；
8. every successful subscription exposes `closed` terminal evidence；
9. close synchronous local revoke；
10. one subscription = one serial listener lane；
11. listener failure local isolate；
12. delivery bounded；overflow explicit terminal；
13. one accepted event at most one delivery per matching subscription；
14. distinct subscriptions independently receive；self-delivery allowed；
15. publish success independent of listener/overflow outcome；
16. no-binding fail-fast；binding recovery requires fresh subscribe and no replay；
17. Runtime/Hub terminal reasons are explicit and independent of Frame/Renderer/Data；
18. Hub fatal reports through narrow latched `sessionEventsFatal` fact；Main owns unwind；
19. State/Event non-atomic and no shared revision/order；
20. process placement and future carrier sharing cannot change logical semantics；
21. current Hostra/PWA v1 use dedicated Event carriers；
22. v1 remains intentionally smaller than a general message broker。