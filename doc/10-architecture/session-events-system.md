# Session Events：Session 级跨 Subsystem 事件系统

> 层级：系统架构  
> 状态：Active Design / not implemented / not qualified  
> 稳定程度：Evolving  
> 主要定义：Session-scoped cross-Subsystem transient event distribution、Channel routing、SessionEventHub、Runtime-scoped SessionEventClient、routing/currentness、delivery/failure/backpressure、与 Shared State / Render Event / Control / Diagnostics 的边界  
> 依赖：[系统架构总览](./system-overview.md)、[通信系统](./communication-system.md)、[Subsystem 模型](./subsystem-model.md)、[渲染系统](./rendering-system.md)  
> 正式化：[Session Events v1](../15-contracts/session-events-v1.md)  
> 最近复核：2026-10-13

本文定义 LoomRealm 的 **Session Events**：同一 Session 内，不同 Subsystem Runtime 之间的 transient business event distribution capability。

目标 package 名：

```text
@loomrealm/session-events
```

目标逻辑角色：

```text
SessionEventHub
    Session-scoped routing / delivery infrastructure

SessionEventClient
    Runtime-scoped publish / subscribe capability
```

Shared State 重命名工作另见仓库根目录 `TODO-shared-state.md`。在该迁移完成前，现有代码/契约中的 `Realm State` 与本文所称 `Shared State` 指同一 shared business state capability；Session Events 不属于该重命名的一部分。

---

## 1. 核心结论

1. Session Events 是独立于 Main、Shared State、Renderer Data 与 Content 的 logical communication plane；
2. Session Events 用于表达 **“Session 中刚刚发生了什么”**，而 Shared State 表达 **“Session 中当前 authoritative business fact 是什么”**；
3. `SessionEventHub` **不是 business authority**，只拥有 routing、subscription lifetime、bounded delivery 等 mechanics；
4. event 默认 transient：不保存 current value、不 replay history、不为 late subscriber 重放过去事件；
5. v1 使用 **Channel** 作为唯一 Hub routing/filter key；每个 publish 指定一个 channel，每个 subscription 原子订阅一个或多个 exact channels；
6. channel MAY 包含 `/`，但 v1 中 `/` 没有 parent/child、prefix、wildcard 或 pattern 语义；
7. `type` 只表达某个 channel 内的 business event semantic，不参与 v1 Hub routing/filtering；
8. Session Events 是 cross-Subsystem capability，不依赖 Renderer、Frame、Activation、InputTarget 或 RenderDomain；
9. `publish()` 表达 notification，不建立跨 Runtime synchronous call stack，也不等待 subscriber business handler 完成；
10. subscriber callback failure 必须 local isolate，不得 retroactively fail 已接受 publish；
11. v1 不提供 request/reply、RPC、consumer group、durable subscription、event journal、exactly-once、automatic retry 或 Shared State transaction coupling；
12. business event 与 `render.event` 是不同语义：前者跨 Subsystem，后者只属于 RenderDomain / presentation-oriented transient intent；
13. logging/diagnostics 可复用 Session Events 的物理 routing 基础设施，但 MUST 使用独立 logical role / QoS，不得把普通 business channel/type 当作正式日志 API。

---

## 2. Architecture Position

```text
Session composition
    ├── Main
    │     Control Authority
    │
    ├── SharedStateAuthority
    │     Session Shared Business State Authority
    │
    ├── SessionEventHub
    │     Session Event Distribution
    │     no business truth ownership
    │
    └── Subsystem Runtimes
          ├── SharedStateClient
          ├── SessionEventClient
          ├── ContentClient
          ├── RenderDomain
          └── Input / Viewport / Frame capabilities
```

必须保持：

```text
Main
    "谁正在运行 / active / 当前 control flow 是什么"

Shared State
    "共享业务事实现在是什么"

Session Events
    "一个 transient business fact / notification 刚刚发生"

Render Event
    "一个 RenderDomain 的 transient presentation intent"

Content
    "安装定义是什么"
```

SessionEventHub 不维护游戏世界的第二份状态，不根据事件流重建 authoritative business state，也不拥有 Main lifecycle/control truth。

---

## 3. State vs Event Placement Rule

一个事实如果 late joiner / restarted Runtime 必须知道，或者未来业务判断依赖其 current value，它 MUST NOT 只存在于 Session Events。

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

channel = "achievement"
type    = "triggered"
```

推荐组合：

```text
Battle Subsystem
    publish(channel="battle", type="enemy-defeated")
        ↓
Quest Subsystem handler
    decides business consequence
        ↓
SharedStateClient.commit(...)
        ↓
quest/progression becomes authoritative
```

禁止把 Event Bus 变成隐式 distributed state machine：

```text
MUST NOT require every Runtime to replay all historical events
MUST NOT infer current authoritative world state only from received events
MUST NOT use event delivery success as a replacement for Shared State commit evidence
```

判断规则：

> 如果 late subscriber 必须知道这个信息，那么该信息需要存在于 authoritative state / content / control owner 中，而不能只存在 Event Bus。

---

## 4. Session Event vs Render Event

现有 `RenderDomain.emit(renderEvent)` 保持 presentation-local semantic，不升级为 cross-Subsystem event bus。

```text
Render Event
    owner/scope: one Subsystem RenderDomain
    purpose: transient presentation intent / trace
    transport: Renderer Data plane
    cross-Subsystem subscription: NO
    business truth: NO

Session Event
    owner/scope: one Session
    purpose: transient cross-Subsystem business notification
    transport: Session Events plane
    cross-Subsystem subscription: YES
    business truth: NO
```

例如：

```text
render.event("character-hit-flash")
    → presentation effect

session event
    channel = "combat"
    type    = "character-damaged"
    → Battle / Quest / Audio / Achievement 等领域可观察的业务事件
```

Render Event MUST NOT 被桥接成 Session Event 的隐式来源；Session Event 也 MUST NOT 自动投影为 Render Event。需要两者时，由明确的 business owner 分别提交相应 intent。

---

## 5. Channel Model

Channel 是 v1 的唯一 routing/filter scope。

```text
channel
    Hub routing identity

type
    semantic discriminator inside one channel

payload
    event business data
```

例如：

```text
battle
battle/main
battle/encounter/42
dialogue
quest
```

`/` 允许出现在 channel 中，为业务命名和未来协议演进保留空间，但 v1 只进行 exact string matching：

```text
"battle"
!= "battle/main"
!= "battle/encounter/42"
```

因此：

```text
subscribe(["battle"])
```

不会收到：

```text
battle/main
battle/encounter/42
```

v1 不建立：

```text
channel hierarchy
parent subscription
prefix match
wildcard
glob
regex
Channel Registry
createChannel/deleteChannel/listChannels
```

Channel 不是 Process/Worker/Runtime identity，不得包含需要由 physical topology 决定的语义。

### Type does not route in v1

同一 channel 可以包含多个 event type：

```text
channel = "battle"
    type = "started"
    type = "enemy-defeated"
    type = "turn-started"
    type = "damage"
    type = "ended"
```

订阅 `battle` 的 subscriber 接收该 channel 下的全部 Session Events，然后由 business listener 根据 `event.type` 做本地判别。

v1 不提供 type-filtered subscription。未来如果真实负载要求更细粒度 selector，可以在新 protocol revision 中 add-only 设计，但不得改变 v1 exact-channel semantics。

---

## 6. Author Projection

目标 author-facing capability：

```ts
interface SubsystemScope {
  readonly events: SessionEventClient;
}
```

v1 candidate logical surface：

```ts
interface SessionEventClient {
  publish(
    channel: string,
    type: string,
    payload: JsonValue,
  ): Promise<void>;

  subscribe(
    channels: readonly string[],
    listener: (event: SessionEvent) => void | Promise<void>,
  ): Promise<SessionEventSubscription>;
}

interface SessionEvent {
  readonly channel: string;
  readonly type: string;
  readonly payload: JsonValue;
  readonly source: {
    readonly subsystemKey: string;
  };
}

interface SessionEventSubscription {
  close(): void;
}
```

一个 subscription 的 channel set 必须作为整体建立，不出现 partially installed subscription。

Author-facing source identity SHOULD 只暴露 logical identity，例如 `subsystemKey`；MUST NOT 因 Desktop 使用 process、PWA 使用 Worker 而泄漏 pid、Worker identity、socket/port、endpoint、generation token 等 physical material。

---

## 7. Publish / Delivery Semantics

核心因果关系：

```text
publisher
    publish(channel,type,payload)
        ↓
SessionEventHub validates + accepts event
        ↓
match subscriptions by exact channel
        ↓
route only to matching subscriptions
        ↓
bounded asynchronous delivery
        ↓
Runtime-local listener execution
```

Hub routing MUST NOT 采用：

```text
broadcast all Session Events to every Runtime
→ each Runtime locally discards unrelated channels
```

作为正常模型。Channel 的目的之一就是在 Hub/broker side 避免无意义的跨 Runtime / cross-process traffic 与序列化成本。

必须区分：

```text
publish accepted
    != every subscriber received
    != every listener started
    != every listener succeeded
    != business consequence committed
```

Publisher MUST NOT 等待 remote business listener 完成，避免形成：

```text
A publish
→ B handler
→ B publish
→ C handler
→ ... distributed synchronous call stack
```

Listener invocation 属 Runtime-local callback execution。Listener synchronous throw / rejected thenable MUST local isolate / diagnostic，MUST NOT retroactively fail publisher、terminate unrelated subscription、rollback Shared State 或成为 SessionEventHub flow-control ACK。

一个 subscriber 如果需要 authoritative consequence，应在自己的 handler 中使用其正常 capability（例如 `SharedStateClient.commit()`）；该 commit 拥有自己的 OCC/evidence semantics，与 Event delivery 不组成原子 transaction。

---

## 8. Lifetime / Currentness

```text
one Session
→ one logical SessionEventHub
→ many Runtime-scoped SessionEventClient bindings
→ zero or more subscriptions per client
```

`SessionEventClient` lifetime 与 Runtime 绑定，但不与 Frame / Activation / Renderer / Data generation 绑定。

必须保持：

```text
Frame suspend / close
Activation replacement
Renderer reload
Renderer Data reconnect
    != SessionEventClient revoked
    != Session subscription reset
```

Runtime terminal：

```text
→ terminate that Runtime's SessionEventClient
→ close/inert its subscriptions
→ reject/stop future publish from stale client
```

Session terminal：

```text
→ SessionEventHub terminal
→ all clients/subscriptions terminal/inert
```

Physical event binding loss 本身不等于 Shared State reset、Renderer/Data failure 或 Main control transition。是否允许同 Runtime 建立 fresh event binding，由未来 platform profile 定义；fresh binding MUST NOT replay missed history。

如果 SessionEventHub 自身无法继续维持 routing/lifetime invariants，可报告 Session-fatal infrastructure fact；**Main / Session lifecycle owner 仍是唯一提交 Session terminal / Runtime unwind 的 authority**。SessionEventHub 自己不拥有 control unwind。

---

## 9. Ordering / Replay / Delivery Guarantees

v1 architecture baseline：

```text
no history replay
no durable subscription
no consumer offset
no universal Session event log
no exactly-once delivery
no automatic application retry
no cross-plane total order
```

Same publisher/binding 的 accepted event SHOULD 保持 per-binding send order；跨不同 publishers 不建立 global total order。

尤其不存在：

```text
Session Event order == Shared State revision order
Session Event order == Main Control order
Session Event order == Render revision order
Session Event order == Input order
```

需要 state/event causal relation 时，由业务显式建模。例如 event payload 可以携带业务 operation identifier；Shared State 中也可以保存相同 marker 以供 reconciliation。Event core 不自动创建 distributed transaction 或 universal clock。

---

## 10. Backpressure

Session Events MUST bounded。

至少要限制：

```text
per-binding ingress
per-client/subscription queued events
single event encoded size
aggregate queued bytes
listener delivery concurrency
```

普通 business events MUST NOT silent drop。如果实现无法继续保证其声明的 delivery/order semantics，应产生明确 overflow / terminal outcome，而不是悄悄丢事件并继续假装 subscription 健康。

Channel routing MUST ensure unrelated Runtime bindings do not consume delivery queue/byte budget for channels they did not subscribe。

具体 queue count/byte limits 属 formal contract / physical profile 收口项。

Publisher 也不得通过 transport-level automatic retry 解决 backpressure，因为 retry 可能重复 business notification。

---

## 11. Failure Boundary

以下均不自动成为 Main Runtime/Frame failure：

```text
one event publish rejected before acceptance
one subscription callback throws
one subscription closes
one event binding is lost
one subscriber overflows
```

这些 failure 需要由 Session Events 自己的 logical contract 分类，并在其边界内收敛。

只有 SessionEventHub infrastructure fatal / invariant loss 才 MAY 上报 Session-fatal fact；即使如此，Session terminal 与 Runtime/Frame unwind 仍由既有 Main owner 提交。

Session Events MUST NOT：

```text
change Main InputTarget
create/revoke Activation
mutate Shared State
change Renderer DataAuthority
create RenderDomain
own persistence policy
```

---

## 12. Diagnostics / Logging

跨 Subsystem 日志聚合是 Session-scoped messaging 的重要 consumer，但 **Diagnostics != Business Event**。

原因：

```text
Business Event
    missed delivery may change business behavior

Diagnostics / Log
    may need batching / sampling / lossy overflow policy
    must not backpressure critical business events indefinitely
```

因此 author API SHOULD 是独立 capability，例如：

```ts
scope.log.info(message, fields)
scope.log.warn(message, fields)
scope.log.error(message, fields)
```

而不是：

```ts
scope.events.publish("log", "message", ...)
```

实现 MAY 在 `@loomrealm/session-events` 内复用同一 routing core / physical connection，但 business events 与 diagnostics MUST 具有独立 logical role、queue/backpressure policy 与 observability semantics。

目标物理路径可为：

```text
Subsystem logger
→ diagnostic role/channel
→ Session composition
→ console / file / devtools / telemetry sink
```

具体 diagnostics schema、sink、sampling 与 retention 不在 Session Events v1 business contract 中冻结。

---

## 13. Physical Realization

逻辑设计不依赖 Process/Worker topology，也不要求 Session Events 独占 physical communication pipe。

合法 realization 包括：

```text
A. SessionEventHub 独立 Process / Worker

B. SessionEventHub 与 SharedStateAuthority 共用 Process / Worker

C. Main + SharedStateAuthority + SessionEventHub 共用 Session host

D. same-process / in-process Hub
```

通信也允许：

```text
Runtime
    ├── Shared State dedicated carrier
    └── Session Events dedicated carrier
```

或者：

```text
Runtime
    │
    ▼
shared Session-service physical carrier
    ├── Shared State logical binding
    └── Session Events logical binding
```

核心规则：

> **shared carrier != shared logical protocol != shared authority != shared ordering domain**

即使 State 与 Events 共进程、共 MessagePort/WebSocket/IPC，也必须保持独立 protocol namespace、correlation、flow-control accounting、evidence/error interpretation 与 subscription identity。

同一 physical carrier loss 可以同时影响多个 logical bindings，但这是 common physical cause，不产生 State/Event semantic coupling。

Session Events 内部的 channel routing 仍必须发生在 Hub side；共用 physical carrier 不是广播 unrelated channels 给所有 Runtime 的理由。

---

## 14. Explicit Non-goals

v1 不设计：

```text
request/reply RPC
service discovery
command bus
workflow engine
saga coordinator
durable event store
event sourcing
history replay / cursor
consumer groups
exactly-once delivery
automatic retry
global Session sequence
cross-plane transaction
Shared State commit + Event publish atomicity
topic/channel ACL / multi-tenant policy engine
channel wildcard / prefix / glob / regex subscription
channel hierarchy semantics
type-filtered subscription
type wildcard / pattern routing
schema registry
Renderer direct subscription
Render Event bridge
universal application store
```

如果未来出现“调用另一个 Subsystem 并等待明确结果”的需求，应单独设计 command/call contract，不应通过 publish + reply-channel 将 Session Events 偷偷演化成 RPC。

---

## 15. Communication Plane Integration

LoomRealm logical communication planes 扩展为：

```text
Control Plane
    Main ⇄ Subsystem / Renderer

Renderer Data Plane
    Renderer ⇄ Subsystem

Shared State Plane
    SharedStateAuthority ⇄ Subsystem Runtime

Session Events Plane
    SessionEventHub ⇄ Subsystem Runtime
    exact-channel routed publish / subscribe

Content Plane
    Content Service ⇄ Main / Renderer / Subsystem
```

不同 plane：

```text
MAY share physical primitives
MUST keep independent logical contracts
MUST keep independent lifetime/currentness
MUST keep independent backpressure/recovery semantics
MUST NOT invent cross-plane global ordering
```

---

## 16. Final Invariants

1. Session Events 只做 Session-scoped transient cross-Subsystem distribution；
2. SessionEventHub 是 routing infrastructure，不是 business authority；
3. Shared State 保存 current authoritative fact，Session Events 不保存 current value；
4. channel 是 v1 唯一 Hub routing/filter key；每个 event 指定一个 channel；
5. subscription 原子订阅一个或多个 exact channels；Hub 不向不匹配 channel 的 Runtime 正常推送事件；
6. channel MAY 包含 `/`，但 `/` 在 v1 没有 hierarchy/prefix/wildcard 语义；
7. type 是 channel 内 business semantic discriminator，不参与 v1 subscription filtering；
8. late subscriber 不 replay 过去事件；
9. publish acceptance 不等待 subscriber business handler；
10. listener failure local isolate，不 retroactively fail publisher；
11. Event delivery 与 Shared State commit 不原子、不共享 revision/sequence；
12. SessionEventClient 是 Runtime-scoped capability，不消费 Frame/Activation/InputTarget authority；
13. `render.event` 保持 RenderDomain-local / presentation-oriented，不升级为 Session Event；
14. Business Events 与 Diagnostics/Log 可以复用 mechanics，但 logical role / QoS 必须分离；
15. queues/buffers 必须 bounded，business event overflow 不允许 silent drop；
16. SessionEventHub 可以独立进程，也可以和 Shared State/Main 共置；physical placement 不属于 logical protocol；
17. Shared State 与 Session Events 可以独立 carrier，也可以 multiplex 同一 physical carrier；
18. shared carrier 不创建 shared authority、transaction、revision、retry 或 public cross-plane ordering；
19. physical transport 不拥有 application retry、business authority 或 Session terminal；
20. SessionEventHub infrastructure fatal 只报告 Session-fatal fact，Main/Session lifecycle owner 提交 terminal/unwind；
21. Desktop/PWA 可采用不同物理 realization，但必须保持相同 logical observable semantics；
22. v1 不成为 RPC、event sourcing、durable log、workflow engine 或 universal EventBus。
