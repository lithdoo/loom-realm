# LoomRealm Session Events v1 Contract

> 层级：正式契约  
> 状态：**Active / Normative Candidate / Not Implemented / Not Qualified**  
> 契约版本：1  
> 逻辑协议：`loomrealm.session-events/1`  
> 稳定程度：Architecture direction closed；deterministic surface / limits 待实现前复核  
> 架构来源：[Session Events：Session 级跨 Subsystem 事件系统](../10-architecture/session-events-system.md)  
> 相关契约：[Realm State v1](./realm-state-v1.md)  
> 最近复核：2026-10-13

本文定义 Session Events v1 的 logical protocol candidate。本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> [!IMPORTANT]
> 本协议定义 logical observable semantics，不定义 Event Hub 必须运行在哪个 Process / Worker，也不要求独占物理通信管道。实现 MAY 将 Session Events 与 Shared State 放在同一进程，也 MAY multiplex 到同一 physical carrier；这些选择不得改变本文定义的逻辑行为。

---

## 1. Scope / Logical Role

一个 live Session MUST 恰好拥有一个 logical `SessionEventHub`。

每个 live Subsystem Runtime MAY 获得一个 Runtime-scoped `SessionEventClient`，用于在同一 Session 内 publish / subscribe transient business events。

```text
Main
    Control Authority

Shared State / current Realm State
    Session Shared Business State Authority

SessionEventHub
    Session-scoped event routing / delivery infrastructure
    no business truth ownership

Subsystem Runtime
    domain execution
    Runtime-scoped SessionEventClient
```

Session Events 表达：

> “Session 中刚刚发生了什么。”

它 MUST NOT 表达或拥有：

```text
current authoritative business state
Frame / Activation / InputTarget authority
request/reply RPC
workflow / saga coordination
durable event log / event sourcing
history replay / consumer offsets
Shared State transaction authority
Renderer / RenderDomain authority
```

如果 restarted / late-joining Runtime 必须知道一个事实，该事实 MUST NOT 只存在于 Session Events；它必须存在于 Shared State、Main、Content 或其他明确 authority 中。

---

## 2. Logical Identity and Core Types

Target author-facing surface：

```ts
export interface SessionEvent<T extends JsonValue = JsonValue> {
  readonly channel: string;
  readonly type: string;
  readonly payload: T;
  readonly source: {
    readonly subsystemKey: string;
  };
}

export type SessionEventListener =
  (event: SessionEvent) => void | Promise<void>;

export interface SessionEventClient {
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

export interface SessionEventSubscription {
  close(): void;
}
```

v1 将职责明确分为：

```text
channel
    Hub routing / delivery scope

type
    business semantic discriminator inside the channel

payload
    business event data
```

`source.subsystemKey` 是 logical identity。Business-visible event MUST NOT 暴露：

```text
pid
Worker identity
socket / port
endpoint / ticket
physical binding generation
host process identity
```

Exact TypeScript names MAY be adjusted before this candidate is marked Frozen；本节的 logical roles and observables are normative direction。

---

## 3. Channel / Event Type / Payload

### 3.1 Channel

Every published event MUST name exactly one channel。

Every subscription MUST declare one or more exact channels。

Channel is a stable logical routing identity and MUST NOT encode physical Process / Worker / socket identity。

Channel MUST：

```text
be non-empty
be valid Unicode scalar-value text
be compared case-sensitively by exact scalar sequence
MAY contain '/'
```

`/` has **no hierarchy or matching semantics in v1**。

For example：

```text
battle
battle/main
battle/encounter/42
```

are three independent exact channel identities。

Therefore：

```text
subscribe(["battle"])
```

MUST NOT match：

```text
battle/main
battle/encounter/42
```

v1 MUST NOT provide：

```text
channel wildcard
channel prefix matching
channel glob
channel regex
implicit parent/child subscription
channel registry
createChannel()
deleteChannel()
listChannels()
```

Whether leading/trailing `/`、consecutive `//` and the exact UTF-8 byte limit are accepted MUST be frozen before implementation begins；implementations MUST NOT invent platform-specific normalization meanwhile。

### 3.2 Event Type

Event type is a semantic discriminator inside one channel。

Event type MUST：

```text
be non-empty
be valid Unicode scalar-value text
be compared case-sensitively by exact scalar sequence
not depend on JS Symbol / constructor identity
```

**Event type does not participate in v1 Hub routing or subscription filtering.**

A subscription to channel `battle` receives every accepted event routed to `battle`, regardless of whether the event type is：

```text
enemy-defeated
turn-started
damage
ended
```

Business listeners MAY branch on `event.type` locally。

Type-filtered subscriptions、type selector sets、type wildcard/prefix/regex routing are explicitly reserved for a future protocol revision and MUST NOT be assumed by v1 implementations。

### 3.3 Subscription Channel Set

`subscribe(channels, listener)` MUST treat the complete `channels` array as one atomic selector set。

```text
channels.length == 0
    → INVALID_REQUEST

duplicate exact channel identity
    → INVALID_REQUEST
```

The Hub MUST validate the entire set before installing any part of the subscription。There MUST NOT be an author-visible partially installed channel set。

### 3.4 Payload Isolation

Payload MUST be a detached valid `JsonValue`。

Accepted publish MUST detach payload from publisher ownership before logical acceptance。Subscriber-visible payload MUST be isolated such that mutation by：

```text
publisher after publish
subscriber A during callback
```

cannot change what another subscriber observes。

Implementation MAY use JSON encode/decode、structured clone、immutable trusted representation、copy-on-delivery or equivalent mechanism。Observable isolation MUST be identical for in-process and cross-process realizations。

---

## 4. Publish Acceptance / Evidence

`publish()` is an asynchronous logical operation。

```text
await client.publish(channel, type, payload)
```

successful resolution means：

```text
SessionEventHub accepted the validated event
and committed its routing admission against the then-current matching channel subscriptions
```

It does NOT mean：

```text
every subscriber callback started
every subscriber callback completed
every subscriber callback succeeded
any Shared State consequence committed
```

Publisher MUST NOT synchronously execute remote/subscriber business callbacks as part of publish completion。

Evidence model：

```text
invalid / rejected before dispatch
    → known not accepted

successful publish result
    → known accepted

dispatched publish + definitive result lost
    → OUTCOME_UNKNOWN
```

After `OUTCOME_UNKNOWN`，framework MUST NOT automatically retry。The event MAY already have been accepted and delivered to zero, some, or all eligible subscribers。

---

## 5. Subscription Establishment / Channel Routing Linearization

`subscribe(channels, listener)` is an asynchronous establishment operation and MUST NOT synchronously return a half-open subscription handle。

It establishes one multi-channel exact subscription at one logical linearization point `N` inside SessionEventHub routing state。

For an event whose exact `event.channel` belongs to that subscription's channel set：

```text
event accepted before N
    → MUST NOT be delivered through this subscription

event accepted after N
    → eligible for this subscription
```

An event whose channel is not in the set MUST NOT be sent to or delivered through that subscription。

### 5.1 Successful establishment

The returned Promise MUST resolve only after the complete channel set has been atomically installed by the Hub。

Author-visible invariant：

```text
subscribe() Promise resolves
    = subscription is already live
```

There MUST NOT be an author-visible state equivalent to：

```text
subscription object exists
but remote/Hub establishment is still pending
```

Therefore v1 MUST NOT require author code to observe or await：

```text
subscription.ready
subscription.status == "pending"
half-open subscription identity
```

### 5.2 First callback ordering

The listener MUST NOT be invoked before the `subscribe()` Promise has resolved to the corresponding `SessionEventSubscription`。

If a matching event becomes eligible after `N` but before the successful subscribe result is observed by the Runtime：

```text
Hub/binding/runtime delivery layer
    → retain the event in bounded order
    → resolve subscribe()
    → only then invoke listener
```

This guarantees that callback code may safely refer to the returned subscription handle after `await subscribe(...)` has completed。

### 5.3 Establishment failure / ambiguity

A failed `subscribe()` MUST NOT expose a usable or half-created author-facing `SessionEventSubscription`。

If the Hub installed an internal candidate subscription but definitive establishment acknowledgement cannot be delivered, the framework MUST retire/fence that orphaned candidate through binding/request lifetime mechanics。It MUST NOT allow an unowned hidden subscription to continue delivering business callbacks。

Unlike `publish()` ambiguity, subscription-establishment ambiguity does not need to become an author-visible `OUTCOME_UNKNOWN` business outcome, because no business event publication has occurred and no author-visible live subscription was returned。

A failed establishment MAY report `BINDING_UNAVAILABLE` or another applicable pre-live subscription failure according to the final failure mapping, but MUST preserve：

```text
failure
→ no author-visible live subscription
→ no listener invocation for that failed establishment
```

### 5.4 Routing

Routing recipient set is determined at publish acceptance time from subscriptions whose exact channel set contains `event.channel`。

Filtering MUST occur at the Hub/routing side。An implementation MUST NOT broadcast every Session Event to every Runtime and rely on business/client-local channel filtering as the normal routing model。

`event.type` MUST NOT affect recipient selection in v1。

Zero matching subscribers MUST NOT make publish fail。

---

## 6. Subscription Close Semantics

`SessionEventSubscription.close()` is synchronous and MUST be idempotent。

Its author-visible meaning is local immediate revocation：

```text
close() returns
→ this subscription is locally inert
→ its listener MUST NOT be invoked again
```

Remote Hub cleanup / unsubscribe transport MAY complete asynchronously after `close()` returns。

`close()` MUST NOT require a usable physical binding in order to make the local handle inert。Therefore v1 does not expose `Promise<void>` from `close()` merely to wait for remote cleanup。

An implementation MAY send best-effort or protocol-defined remote unsubscribe cleanup after local revocation, but late events/acks belonging to the closed subscription MUST be fenced from business callback delivery。

Closing before Runtime teardown, during binding loss, or repeatedly MUST preserve the same local invariant：after `close()` returns, no further listener invocation occurs。

---

## 7. Ordering

v1 MUST NOT expose a global Session event revision or universal event sequence。

For events accepted in order from the same logical client/binding：

```text
A accepted before B
```

any one subscription that receives both MUST observe A before B。

Different publishers do not establish a global total order。

There is no normative total order between Session Events and：

```text
Shared State revision / commit
Main control transitions
Renderer Data
Input
Render Update
Content
```

Internal counters used for routing/queue mechanics MUST NOT become business-visible cross-plane clocks。

---

## 8. Listener Execution Boundary

Listener invocation is Runtime-local callback execution and MUST occur outside SessionEventHub routing/admission critical section。

Listener synchronous throw or returned rejected thenable MUST be locally contained / diagnosed and MUST NOT：

```text
retroactively fail publish
make another subscription fail
rollback Shared State
make SessionEventHub fatal by itself
be used as publisher flow-control acknowledgement
```

Listener MAY reenter SessionEventClient operations without deadlocking Hub routing state。

A listener MAY call its own already-returned subscription `close()`；the local close invariant applies immediately after `close()` returns。

`publish accepted != listener handled` is a normative invariant。

---

## 9. Backpressure / Overflow

All Session Events delivery MUST be bounded。

Implementations MUST bound at least：

```text
single event payload size
per-binding ingress
per-subscription or per-client pending event count
pending logical bytes
listener delivery concurrency
physical adapter buffering
```

Channel routing exists partly to avoid unnecessary cross-Runtime traffic：an event MUST only consume recipient delivery capacity for matching subscriptions selected by §5，not for unrelated Runtime bindings。

Business event delivery MUST NOT silently drop while leaving the affected subscription apparently healthy。

If a subscription can no longer preserve the ordering/delivery guarantees declared by v1 because its bounded queue is exhausted, it MUST become terminal with an explicit overflow outcome。The exact numeric v1 limits and terminal event/error shape MUST be frozen before implementation begins。

Diagnostics / logging MAY use a separate lossy/sampling policy, but that is a distinct logical role and MUST NOT weaken business-event guarantees or monopolize Shared State / business-event flow control。

---

## 10. Failure Shape

Candidate logical failure codes：

```ts
export type SessionEventFailureCode =
  | "INVALID_REQUEST"
  | "LIMIT_EXCEEDED"
  | "TERMINAL"
  | "BINDING_UNAVAILABLE"
  | "OUTCOME_UNKNOWN";
```

`OUTCOME_UNKNOWN` is reserved for publish dispatch where the Hub may have accepted a business event but definitive acceptance evidence was lost。

A subscription callback failure is NOT a publish failure code。

Subscription-establishment ambiguity MUST NOT create an author-visible half-open subscription or business `OUTCOME_UNKNOWN` handle state；the framework must retire/fence orphan establishment state as defined in §5.3。

Exact stable failure object shape MUST be frozen before implementation begins。

---

## 11. Logical Client vs Physical Binding

`SessionEventClient` identity/lifetime MUST NOT equal one physical Process / Worker / MessagePort / WebSocket / IPC connection。

```text
live Runtime-scoped SessionEventClient
        │
        ├─ physical binding A
        │      ↓ lost
        └─ physical binding B
```

Physical binding identity/generation is private fencing material, not business authority。

After binding A is terminal, late A messages MUST NOT affect operations or subscriptions created on binding B。

Fresh binding MUST NOT replay missed Session Events。Old subscription identities MUST NOT transparently resume unless a future contract explicitly introduces such semantics。

Physical binding loss by itself MUST NOT：

```text
reset Shared State
change Main Frame / Activation / InputTarget
change Renderer DataAuthority
replay missed events
invent successful publish evidence
```

A live subscription attached to a lost binding MAY become terminal according to the final subscription-terminal surface, but the framework MUST NOT silently resume the old subscription on a fresh binding。Business must establish a fresh subscription if continued observation is required。

---

## 12. Physical Placement Is Non-normative

The logical contract does not define a required process topology。

All of the following are valid realizations：

```text
A. dedicated Event process/Worker

B. Shared State + SessionEventHub in one process/Worker

C. Main + Shared State + SessionEventHub in one Session host

D. same-process/in-process Hub implementation
```

Co-location MUST NOT：

```text
merge Shared State and Session Events logical identities
create implicit State+Event atomic transactions
change payload isolation
expose process identity to business code
invoke subscriber callbacks synchronously inside publisher call stack
create hidden cross-plane ordering
change logical failure/evidence semantics
```

A common physical process failure MAY simultaneously make multiple logical planes unavailable。That is a shared physical cause, not proof that the logical protocols share authority or failure semantics。

---

## 13. Shared Physical Carrier / Multiplexing

Session Events MAY use a dedicated physical carrier or MAY multiplex with Shared State over the same established physical connection。

Both are valid：

```text
Runtime
    ├── Shared State carrier
    └── Session Events carrier
```

or：

```text
Runtime
    │
    ▼
shared Session-service physical carrier
    ├── Shared State logical binding
    └── Session Events logical binding
```

The contract MUST NOT require either topology。

Normative rule：

> **shared carrier != shared logical protocol != shared authority != shared ordering domain**

When multiplexed, implementations MUST retain distinct logical protocol namespaces and routing/correlation domains, for example conceptually：

```text
loomrealm.shared-state/1
loomrealm.session-events/1
```

During the pending Realm State → Shared State rename, an implementation MAY temporarily use the existing `loomrealm.realm-state/1` State identifier；that compatibility detail MUST NOT change the Session Events protocol identity。

A multiplexed carrier MAY share：

```text
socket / MessagePort / IPC endpoint
physical framing primitive
connection establishment
connection liveness
serialization infrastructure
private scheduler
```

It MUST NOT implicitly share：

```text
request semantics
business authority
logical retry policy
logical revisions / sequence numbers
queue accounting policy
publish/commit evidence
subscription identities
application error codes
```

### 13.1 Correlation

If multiple logical protocols share one physical request-id space, logical correlation identity MUST include the protocol/plane discriminator or an equivalent collision-proof private mechanism。

A State request and an Event publish with the same numeric private request id MUST never be interpreted as the same logical operation。

### 13.2 Flow-control Isolation

Multiplexing MUST NOT allow heavy Session Event or Diagnostics traffic to indefinitely starve Shared State operations。

The physical implementation MUST provide bounded and logically separable flow-control accounting sufficient to preserve each protocol's guarantees，例如：

```text
Shared State queue / budget
Session Events business queue / budget
Diagnostics queue / budget
```

The exact scheduler is private implementation detail；absence of unbounded starvation/cross-plane queue takeover is normative。

Within the Session Events plane, Hub-side channel routing MUST avoid enqueueing unrelated events onto non-matching Runtime logical bindings merely because those bindings share the same physical carrier。

### 13.3 Shared Carrier Loss

One shared carrier loss MAY simultaneously produce：

```text
Shared State binding unavailable
Session Events binding unavailable
```

Each logical protocol MUST still interpret its own in-flight evidence independently。

For example：

```text
State commit dispatched + result lost
    → State OUTCOME_UNKNOWN according to State contract

Event publish dispatched + result lost
    → Session Events OUTCOME_UNKNOWN according to this contract
```

An Event subscription overflow MUST NOT terminalize an otherwise healthy Shared State logical binding。A State-level logical error MUST NOT terminalize an otherwise healthy Events logical binding unless the common physical carrier itself has become invalid/terminal。

### 13.4 No Cross-plane Ordering from Wire Order

Physical frame/message order on a shared carrier MUST NOT become a public happens-before relation between State and Events。

For example：

```text
wire receives State commit request
then Event publish request
```

MUST NOT by itself imply a business-visible guarantee that the State commit completed before Event acceptance。

There is no shared State/Event revision, global sequence, transaction, barrier, or implicit transactional outbox in v1。

---

## 14. Shared State Interaction

Shared State and Session Events are intentionally orthogonal：

```text
Shared State
    current authoritative fact
    version / OCC / commit evidence

Session Events
    transient notification
    channel-routed
    no retained current value
```

v1 MUST NOT provide：

```text
commitAndPublish()
Shared State commit + Event publish atomicity
automatic State revision injection into events
automatic event publication for every State write
event-log reconstruction of State
```

Business requiring reconciliation MAY explicitly carry a business operation identifier in both State and Event payload/model。

---

## 15. Render Event Boundary

`RenderDomain.emit()` / `render.event` remains Renderer Data / presentation-local semantics。

Session Events MUST NOT implicitly bridge to or from Render Events。

```text
Render Event
    presentation intent inside one Subsystem RenderDomain

Session Event
    channel-routed cross-Subsystem transient business notification
```

---

## 16. Diagnostics Boundary

Logging/diagnostics MAY reuse the same physical Session-service carrier and routing implementation, but MUST remain a distinct logical role / QoS domain。

Business code SHOULD consume a logger capability rather than publish a normal business channel/type named `log`。

Diagnostics MAY support sampling / batching / lossy overflow in a future contract；such policy MUST NOT leak into business Session Events or Shared State semantics。

---

## 17. Protocol / Platform Boundary

Logical protocol identifier：

```text
loomrealm.session-events/1
```

Physical realization MAY differ across Desktop / Hostra / PWA and MAY differ per deployment：

```text
in-process binding
MessagePort
IPC
WebSocket
shared multiplexed Session-service carrier
dedicated Events carrier
```

The physical realization MUST preserve the same observable：

```text
publish acceptance/evidence
async subscription establishment
subscribe resolve only after Hub installation
first callback only after subscribe resolve
synchronous local-inert close()
atomic multi-channel subscription establishment
exact channel routing
no v1 type filtering
payload isolation
ordering
binding fencing
failure interpretation
bounded delivery
lifetime
```

The protocol MUST NOT be embedded as a semantic child of Renderer Data、Frame/Call or Main control authority。

---

## 18. Implementation Freeze Rule

Implementation MUST NOT begin by choosing a process topology and then deriving protocol behavior from that topology。

Required sequence：

```text
logical contract
→ deterministic conformance assertions
→ physical profile / carrier composition
→ implementation
→ qualification
```

Before this candidate is marked Frozen, the remaining contract work is：

```text
exact channel grammar edge cases / byte limit
exact event-type grammar / byte limit
exact JsonValue size/depth limits
exact publish/subscription queue limits
exact failure object shape
exact subscription terminal surface
exact physical framing/profile rules where required
conformance document
```

The following MUST remain implementation details：

```text
whether Hub shares a process with Shared State
whether Hub shares a process with Main
whether State and Events share a physical carrier
private multiplexing envelope shape
private scheduler / queue data structures
private binding generation token
remote unsubscribe cleanup timing after local close
```

The following v1 semantic direction is already closed and MUST NOT be redesigned during implementation：

```text
channel is the only Hub routing/filter key
'/' is permitted in channel text but has no hierarchy semantics
subscription may include one or more exact channels atomically
type is delivered metadata / business discriminator, not a routing filter
no wildcard/prefix/regex channel routing
no type-filtered subscription in v1
subscribe() is async and returns only an already-live subscription
listener cannot run before subscribe() resolves
close() is synchronous local immediate revocation
failed establishment exposes no half-open subscription
```

---

## 19. Core Invariants

1. one live Session has one logical SessionEventHub；
2. SessionEventHub owns routing/delivery mechanics, not business truth；
3. SessionEventClient is Runtime-scoped logical capability, not a process/socket identity；
4. every event names exactly one channel and one type；channel is the v1 routing key；
5. one subscription atomically registers one or more exact channels；unrelated channels are not delivered to that subscription；
6. `/` is allowed in channel identity but has no parent/child、prefix or wildcard meaning in v1；
7. event type is a business discriminator and does not participate in v1 routing/filtering；
8. publish success means Hub accepted/routed, not subscriber handled；
9. dispatched publish with lost definitive result may be OUTCOME_UNKNOWN and MUST NOT auto-retry；
10. `subscribe()` is asynchronous and resolves only after Hub-side atomic installation；
11. listener invocation MUST occur after the corresponding `subscribe()` Promise resolves；
12. failed/ambiguous establishment exposes no author-visible half-open subscription and no listener callbacks；
13. `close()` is synchronous/idempotent and makes the local subscription inert before returning；
14. remote unsubscribe cleanup MAY be asynchronous and is not part of author-visible close completion；
15. payload ownership is detached/isolated identically for in-process and cross-process realizations；
16. same publisher order is preserved for subscriptions receiving the same accepted events；no global publisher order exists；
17. no history replay / durable subscription / consumer offset / event sourcing in v1；
18. listener failure is local and never retroactively fails publish；
19. business delivery is bounded and MUST NOT silently drop while remaining healthy；
20. physical placement is non-normative；Hub MAY be dedicated or co-located with Shared State/Main；
21. State and Events MAY use separate carriers or multiplex one physical carrier；
22. shared carrier never creates shared authority、revision、transaction、retry or public cross-plane ordering；
23. multiplexed flow control MUST prevent one logical plane from taking unbounded ownership of another plane's capacity；
24. Hub-side channel routing MUST avoid normal broadcast of unrelated events to non-matching Runtime bindings；
25. one shared carrier failure may affect multiple bindings physically, but each protocol derives logical evidence/failure independently；
26. Shared State + Event atomic transaction does not exist in v1；
27. Render Event remains a separate presentation-local concept；
28. Diagnostics may share mechanics/carrier but retain distinct QoS semantics；
29. Desktop/PWA and co-located/separate realizations MUST be observably equivalent at the logical protocol boundary。
