# Session Events：Session 级跨 Subsystem 事件系统

> 层级：系统架构  
> 状态：Active Design / not implemented / not qualified  
> 稳定程度：Evolving  
> 主要定义：Session-scoped cross-Subsystem transient event distribution、Channel routing、SessionEventHub、Runtime-scoped SessionEventClient、subscription establishment/close、delivery/failure/backpressure、与 Shared State / Render Event / Control / Diagnostics 的边界  
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
2. Session Events 表达 **“Session 中刚刚发生了什么”**，Shared State 表达 **“Session 中当前 authoritative business fact 是什么”**；
3. `SessionEventHub` 不是 business authority，只拥有 routing、subscription lifetime、bounded delivery 等 mechanics；
4. event 默认 transient：不保存 current value、不 replay history、不为 late subscriber 重放过去事件；
5. v1 使用 **Channel** 作为唯一 Hub routing/filter key；每个 publish 指定一个 channel，每个 subscription 原子订阅一个或多个 exact channels；
6. channel MAY 包含 `/`，但 v1 中 `/` 没有 parent/child、prefix、wildcard 或 pattern 语义；
7. `type` 只表达某个 channel 内的 business event semantic，不参与 v1 Hub routing/filtering；
8. `subscribe()` 是异步 establishment；成功 resolve 时 subscription 已经 live，不暴露 half-open handle；
9. listener 第一次调用 MUST 晚于对应 `subscribe()` Promise resolve；
10. `SessionEventSubscription.close()` 同步、幂等，本地立即 revoke；remote cleanup MAY 异步完成；
11. `publish()` 表达 notification，不建立跨 Runtime synchronous call stack，也不等待 subscriber business handler 完成；
12. subscriber callback failure 必须 local isolate，不得 retroactively fail 已接受 publish；
13. v1 不提供 request/reply、RPC、consumer group、durable subscription、event journal、exactly-once、automatic retry 或 Shared State transaction coupling；
14. business event 与 `render.event` 是不同语义；
15. logging/diagnostics 可复用物理 routing 基础设施，但必须使用独立 logical role / QoS。

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

禁止把 Event Bus 变成隐式 distributed state machine。

---

## 4. Session Event vs Render Event

现有 `RenderDomain.emit(renderEvent)` 保持 presentation-local semantic，不升级为 cross-Subsystem event bus。

```text
Render Event
    owner/scope: one Subsystem RenderDomain
    purpose: transient presentation intent / trace
    transport: Renderer Data plane
    cross-Subsystem subscription: NO

Session Event
    owner/scope: one Session
    purpose: transient cross-Subsystem business notification
    transport: Session Events plane
    cross-Subsystem subscription: YES
```

Render Event MUST NOT 被隐式桥接成 Session Event；Session Event 也 MUST NOT 自动投影为 Render Event。

---

## 5. Channel Model

Channel 是 v1 唯一 routing/filter scope：

```text
channel
    Hub routing identity

type
    semantic discriminator inside one channel

payload
    event business data
```

合法示例：

```text
battle
battle/main
battle/encounter/42
dialogue
quest
```

`/` 在 v1 只是 channel 字符内容，不具有层级或匹配语义：

```text
"battle"
!= "battle/main"
!= "battle/encounter/42"
```

因此：

```text
subscribe(["battle"])
```

不会收到 `battle/main` 或 `battle/encounter/42`。

v1 不建立 channel hierarchy、prefix/wildcard/glob/regex matching 或 Channel Registry。

同一 channel 可以包含多个 event type；订阅某 channel 的 listener 接收该 channel 下全部事件，再根据 `event.type` 本地判别。v1 不提供 type-filtered subscription。

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

interface SessionEventSubscription {
  close(): void;
}
```

一个 subscription 的 channel set 必须作为整体建立，不出现 partially installed subscription。

Author-facing source identity 只暴露 logical identity，例如 `subsystemKey`；不得泄漏 pid、Worker identity、socket/port、endpoint、generation token 等 physical material。

---

## 7. Subscription Establishment / Close

### Establishment

`subscribe()` 是异步 protocol operation：

```text
Runtime
    subscribe(channels, listener)
        ↓
SessionEventHub validates complete channel set
        ↓
atomically installs subscription @ N
        ↓
acknowledgement reaches Runtime
        ↓
subscribe() Promise resolves with live handle
```

关键 observable semantics：

```text
subscribe() resolves
    = Hub-side subscription already live
```

v1 不暴露：

```text
subscription.ready
pending subscription status
half-open author-visible handle
```

对于 matching event：

```text
accepted before N
    → not delivered through this subscription

accepted after N
    → eligible
```

如果 matching event 在 `N` 之后、但 subscribe result 回到 Runtime 之前已经进入 delivery path，framework 必须 bounded retain，并保证：

```text
subscribe() resolves first
→ listener may run afterwards
```

因此 callback 可以安全引用已经返回的 subscription handle。

### Establishment failure

建立失败时不返回可用 handle，也不得产生 callback。

如果 Hub 已内部安装 candidate subscription，但 acknowledgement 因 binding loss 等原因无法完成，framework 必须通过 binding/request lifetime fencing 回收该 orphan candidate，不能留下没有 owner 的隐藏订阅。

这种 subscription establishment ambiguity 不需要暴露成业务 `OUTCOME_UNKNOWN`；publish ambiguity 才可能具有不可撤销的业务通知副作用。

### Close

`close()` 保持同步和幂等：

```text
subscription.close()
    ↓
local handle immediately inert
    ↓
close() returns
    ↓
listener MUST NOT run again
```

Hub-side unsubscribe / remote cleanup MAY 在之后异步完成。

因此即使 physical binding 已失效，`close()` 仍必须能够完成本地 revoke；author 不需要 `await subscription.close()`。

Late event / acknowledgement 必须被 closed-subscription fencing 丢弃，不得重新进入 listener。

---

## 8. Publish / Delivery Semantics

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

Hub routing MUST NOT 正常实现为 broadcast-all + Runtime-local channel discard。

必须区分：

```text
publish accepted
    != every subscriber received
    != every listener started
    != every listener succeeded
    != business consequence committed
```

Publisher MUST NOT 等待 remote business listener 完成。Listener throw / rejected thenable local isolate，不 retroactively fail publisher、rollback Shared State 或成为 flow-control ACK。

---

## 9. Lifetime / Currentness

```text
one Session
→ one logical SessionEventHub
→ many Runtime-scoped SessionEventClient bindings
→ zero or more subscriptions per client
```

`SessionEventClient` lifetime 与 Runtime 绑定，但不与 Frame / Activation / Renderer / Data generation 绑定。

```text
Frame suspend / close
Activation replacement
Renderer reload
Renderer Data reconnect
    != SessionEventClient revoked
    != Session subscription reset
```

Runtime terminal 终止该 Runtime 的 client/subscriptions；Session terminal 终止 Hub 和所有 clients/subscriptions。

Physical event binding loss 不等于 Shared State reset、Renderer/Data failure 或 Main control transition。Fresh binding 不 replay missed history，也不透明恢复旧 subscription identity；需要继续观察时建立 fresh subscription。

---

## 10. Ordering / Replay / Delivery Guarantees

v1 baseline：

```text
no history replay
no durable subscription
no consumer offset
no universal Session event log
no exactly-once delivery
no automatic application retry
no cross-plane total order
```

Same publisher/binding accepted order 对同一个收到两条事件的 subscription 保持；跨 publisher 不建立 global total order。

Session Event order 与 Shared State revision、Main Control、Render/Input 等均不存在 normative total order。

---

## 11. Backpressure

Session Events MUST bounded。至少限制：

```text
per-binding ingress
per-client/subscription queued events
single event encoded size
aggregate queued bytes
listener delivery concurrency
```

Business event delivery MUST NOT silent drop while subscription remains healthy。

Channel routing MUST ensure unrelated Runtime bindings do not consume delivery queue/byte budget for channels they did not subscribe。

具体 queue count/byte limits 属 formal contract / physical profile 收口项。

---

## 12. Failure Boundary

以下均不自动成为 Main Runtime/Frame failure：

```text
publish rejected before acceptance
subscribe establishment failure
subscription callback throws
subscription close
binding loss
subscriber overflow
```

只有 SessionEventHub infrastructure fatal / invariant loss 才 MAY 上报 Session-fatal fact；Session terminal 与 Runtime/Frame unwind 仍由 Main / Session lifecycle owner 提交。

`publish()` 在 dispatch 后丢失 definitive acceptance result 时可能产生 `OUTCOME_UNKNOWN`；framework MUST NOT 自动 retry。

`subscribe()` 建立失败/歧义则必须收敛为“没有 author-visible live subscription”，而不是暴露 half-open object。

---

## 13. Diagnostics / Logging

Diagnostics / Log 与 Business Events 可复用 routing core / physical connection，但 logical role 与 QoS 必须分离。

推荐 author API：

```ts
scope.log.info(message, fields)
scope.log.warn(message, fields)
scope.log.error(message, fields)
```

而不是把日志作为普通 business channel/type。

---

## 14. Physical Realization

逻辑设计不依赖 Process/Worker topology，也不要求 Session Events 独占 communication pipe。

合法 realization：

```text
A. SessionEventHub 独立 Process / Worker
B. SessionEventHub 与 SharedStateAuthority 共用 Process / Worker
C. Main + SharedStateAuthority + SessionEventHub 共用 Session host
D. same-process / in-process Hub
```

通信可以独立 carrier，也可以：

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

共 carrier 时仍必须保持独立 protocol namespace、correlation、flow-control accounting、evidence/error interpretation 与 subscription identity。

Session Events 内部的 channel routing 仍发生在 Hub side；共用 carrier 不是广播 unrelated channels 给所有 Runtime 的理由。

---

## 15. Explicit Non-goals

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
channel ACL / multi-tenant policy engine
channel wildcard / prefix / glob / regex subscription
channel hierarchy semantics
type-filtered subscription
type wildcard / pattern routing
schema registry
Renderer direct subscription
Render Event bridge
universal application store
```

如果未来出现“调用另一个 Subsystem 并等待明确结果”的需求，应单独设计 command/call contract，不应通过 publish + reply-channel 演化成 RPC。

---

## 16. Communication Plane Integration

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

不同 plane MAY share physical primitives，但必须保持独立 logical contracts、lifetime/currentness、backpressure/recovery semantics，且不得发明 cross-plane global ordering。

---

## 17. Final Invariants

1. Session Events 只做 Session-scoped transient cross-Subsystem distribution；
2. SessionEventHub 是 routing infrastructure，不是 business authority；
3. Shared State 保存 current authoritative fact，Session Events 不保存 current value；
4. channel 是 v1 唯一 Hub routing/filter key；
5. subscription 原子订阅一个或多个 exact channels；
6. channel MAY 包含 `/`，但 `/` 在 v1 没有 hierarchy/prefix/wildcard 语义；
7. type 是 channel 内 business semantic discriminator，不参与 v1 filtering；
8. `subscribe()` 异步建立，resolve 时 Hub-side subscription 已 live；
9. listener 第一次调用 MUST 晚于 subscribe resolve；
10. 建立失败不返回 half-open handle，也不产生 callback；
11. `close()` 同步、幂等，本地立即 inert；remote cleanup MAY 异步；
12. publish acceptance 不等待 subscriber business handler；
13. listener failure local isolate，不 retroactively fail publisher；
14. Event delivery 与 Shared State commit 不原子、不共享 revision/sequence；
15. SessionEventClient 是 Runtime-scoped capability，不消费 Frame/Activation/InputTarget authority；
16. `render.event` 保持 RenderDomain-local / presentation-oriented；
17. Business Events 与 Diagnostics/Log 可复用 mechanics，但 logical role / QoS 分离；
18. queues/buffers 必须 bounded，business event overflow 不允许 silent drop；
19. SessionEventHub 可以独立进程，也可以和 Shared State/Main 共置；
20. Shared State 与 Session Events 可以独立 carrier，也可以 multiplex 同一 physical carrier；
21. shared carrier 不创建 shared authority、transaction、revision、retry 或 public cross-plane ordering；
22. physical transport 不拥有 application retry、business authority 或 Session terminal；
23. Desktop/PWA 可采用不同物理 realization，但必须保持相同 logical observable semantics；
24. v1 不成为 RPC、event sourcing、durable log、workflow engine 或 universal EventBus。
