# LoomRealm Session Events v1 Contract

> 层级：正式契约  
> 状态：**Active / Normative / Implemented / Qualified**
> 契约版本：1  
> 逻辑协议：`loomrealm.session-events/1`  
> 稳定程度：**Architecture + Logical Semantics + Deterministic Surface Frozen**  
> 架构来源：[Session Events：Session 级跨 Subsystem 事件系统](../10-architecture/session-events-system.md)  
> 可执行断言：[Session Events v1 Conformance](./session-events-conformance-v1.md)  
> 相关契约：[Realm State v1](./realm-state-v1.md) · [Session Events Runtime Integration Profile v1](./session-events-runtime-profile-v1.md)  
> 最近复核：2026-10-14

本文定义 Session Events v1 的 normative logical contract。本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> [!IMPORTANT]
> 本协议定义 logical observable semantics，不定义 Event Hub 必须运行在哪个 Process / Worker，也不要求独占物理通信管道。Session Events MAY 与 Shared State 共进程，也 MAY multiplex 到同一 physical carrier；这些选择不得改变本文定义的逻辑行为。
>
> 本文是 Session Events v1 实现的 normative SSOT。当前 Hostra/PWA product realization 的 concrete binding seam 由 [Session Events Runtime Integration Profile v1](./session-events-runtime-profile-v1.md) 冻结；实现不得为了进程拓扑、传输便利或性能优化重新设计 routing、ordering、subscription lifetime、failure evidence 或 delivery guarantees。

---

## 1. Scope / Logical Role

一个 live Session MUST 恰好拥有一个 logical `SessionEventHub`。

每个进入 live business execution 的 Subsystem Runtime MUST 恰好拥有一个 Runtime-scoped `SessionEventClient`，用于同一 Session 内的 transient cross-Subsystem business event publish / subscribe。`SessionEventClient` 是标准 Runtime capability，不是可选 feature probe；current product 如何在 business Definition import 前建立其 initial usable physical binding，由 Runtime Integration Profile 冻结。

```text
Main
    Control Authority

Shared State / current Realm State
    Session Shared Business State Authority

SessionEventHub
    Session-scoped routing / delivery infrastructure
    no business truth ownership

Subsystem Runtime
    domain execution
    exactly one Runtime-scoped SessionEventClient
```

Session Events 表达：

> “Session 中刚刚发生了什么。”

Session Events MUST NOT 表达或拥有：

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

## 2. Author-facing Surface

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

export type SessionEventSubscriptionCloseReason =
  | "closed"
  | "overflow"
  | "binding-terminal"
  | "client-terminal"
  | "hub-terminal";

export interface SessionEventSubscriptionClose {
  readonly reason: SessionEventSubscriptionCloseReason;
}

export interface SessionEventSubscription {
  readonly closed: Promise<SessionEventSubscriptionClose>;
  close(): void;
}

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
```

职责固定：

```text
channel
    Hub routing / delivery scope

type
    business semantic discriminator inside the channel

payload
    business event data

source.subsystemKey
    authenticated logical publisher identity
```

Business-visible event MUST NOT 暴露：

```text
pid
Worker identity
socket / port
endpoint / ticket
physical binding generation
host process identity
transport request id
```

Author-facing rejected `publish()` / `subscribe()` Promises MUST reject with the stable `SessionEventError` surface defined in §11。

---

## 3. Channel / Type / Payload

### 3.1 Channel

Every published event MUST name exactly one channel。Every subscription MUST declare one or more exact channels。

Channel MUST：

```text
be non-empty
be valid Unicode scalar-value text
UTF-8 encoded length <= 256 bytes
not contain U+0000..U+001F or U+007F
be compared case-sensitively by exact scalar sequence
MAY contain '/'
```

v1 does not normalize Unicode or slash structure。

因此以下都 MAY 是合法且互不相等的 identity，只要满足上述通用约束：

```text
battle
/battle
battle/
battle//main
battle/main
battle/encounter/42
```

`/` 在 v1 没有 hierarchy、prefix、parent/child 或 wildcard 语义。

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

### 3.2 Event Type

Event type MUST：

```text
be non-empty
be valid Unicode scalar-value text
UTF-8 encoded length <= 128 bytes
not contain U+0000..U+001F or U+007F
be compared case-sensitively by exact scalar sequence
not depend on JS Symbol / constructor identity
```

`/` has no special meaning in event type。

**Event type does not participate in v1 Hub routing or subscription filtering.**

A subscription to channel `battle` receives every accepted event routed to `battle` regardless of type。Business listener MAY branch on `event.type` locally。

Type-filtered subscriptions、type selector sets、type wildcard/prefix/regex routing are reserved for a future protocol revision。

### 3.3 Subscription Channel Set

`subscribe(channels, listener)` MUST treat the complete `channels` array as one atomic selector set。

```text
channels.length == 0
    → INVALID_REQUEST

channels.length > 64
    → LIMIT_EXCEEDED

duplicate exact channel identity
    → INVALID_REQUEST
```

The Hub MUST validate the entire set before installing any part of the subscription。There MUST NOT be an author-visible partially installed channel set。

A Runtime-scoped client MUST have at most 64 simultaneously live subscriptions。Attempting to establish the 65th live subscription MUST fail `LIMIT_EXCEEDED` before installation。

### 3.4 JsonValue / Payload

Payload MUST be a valid detached `JsonValue`。

Allowed logical values are JSON-compatible：

```text
null
boolean
finite number
string
array of JsonValue
object with string keys and JsonValue values
```

Not allowed：

```text
undefined
NaN / Infinity / -Infinity
BigInt
Symbol
function
Date / Map / Set / class instance as semantic object
cyclic graph
```

Payload encoded JSON size MUST be <= 256 KiB。Container nesting depth MUST be <= 64。

Encoded size = UTF-8 byte length of ECMAScript `JSON.stringify(value)` with no replacer and no pretty-print argument。

Depth is：

```text
scalar = 0
array/object = 1 + max(child depth)
empty array/object = 1
```

Accepted publish MUST detach payload from publisher ownership before logical acceptance。Subscriber-visible payload MUST be isolated such that publisher mutation or one subscriber's mutation cannot affect another subscriber's observation。

In-process and cross-process realizations MUST expose equivalent isolation semantics。

---

## 4. Source Authenticity

`source.subsystemKey` MUST be derived from the authenticated/bound Runtime identity of the publishing `SessionEventClient`。

Publisher business code MUST NOT provide or override `source`。

Remote wire input claiming an arbitrary business-visible source identity MUST NOT be trusted。The Hub/binding layer MUST derive source identity from binding/session association and construct the delivered `SessionEvent.source` itself。

In-process realization MUST obey the same rule；direct object invocation MUST NOT create a source-spoofing bypass。

Self-delivery is allowed：if Runtime `A` subscribes a matching channel and publishes to that channel, its matching subscription is eligible like every other subscription。

---

## 5. Publish Acceptance / Evidence

`publish()` is an asynchronous logical operation：

```text
await client.publish(channel, type, payload)
```

Successful resolution means：

```text
SessionEventHub accepted the validated event
and committed routing admission against the then-current matching subscriptions
```

It does NOT mean：

```text
every subscriber received the event
every listener started
every listener completed
every listener succeeded
any Shared State consequence committed
```

Publisher MUST NOT synchronously execute subscriber business callbacks as part of publish completion。

Evidence model：

```text
invalid / limit / terminal / no-binding rejection before dispatch
    → known not accepted

successful publish result
    → known accepted

dispatched publish + definitive result lost
    → OUTCOME_UNKNOWN
```

After `OUTCOME_UNKNOWN` the framework MUST NOT automatically retry。The event MAY already have been accepted and routed。

Zero matching subscribers MUST NOT make publish fail。

### 5.1 Subscriber overflow does not fail accepted publish

For every matching subscription current at publish acceptance, routing MUST attempt one logical delivery admission。

If an individual matching subscription cannot accept the event because its bounded delivery queue would overflow：

```text
that subscription
    → terminal(reason = "overflow")

accepted publish
    → remains accepted/successful
```

Consumer health MUST NOT retroactively redefine publisher acceptance。

If the Hub/client ingress cannot admit the publish itself before acceptance, the publish MUST fail `LIMIT_EXCEEDED` or another applicable known-not-accepted failure；it MUST NOT be partially accepted and reported as a deterministic rejection。

---

## 6. Routing / Delivery Multiplicity

Routing recipient set is determined at publish acceptance time from subscriptions whose exact channel set contains `event.channel`。

Filtering MUST occur at the Hub/routing side。Normal implementation MUST NOT broadcast every Session Event to every Runtime and rely on client-local channel discard。

For one accepted event and one matching live subscription：

```text
at most one listener invocation may be produced for that event
```

If the subscription remains healthy and the event was successfully admitted to its queue, exactly one listener invocation MUST occur。

If delivery cannot be preserved, the subscription MUST become observably terminal rather than silently skip the event while remaining healthy。

Two different subscriptions owned by the same Runtime are independent recipients：

```text
subscription A matches → one A delivery
subscription B matches → one B delivery
```

The framework MUST NOT perform Runtime-level dedup across distinct subscription identities。

One subscription containing multiple channels still receives an event at most once because each event has exactly one channel。

---

## 7. Subscription Establishment

`subscribe(channels, listener)` is asynchronous and MUST NOT synchronously return a half-open handle。

It establishes one exact multi-channel subscription at one logical linearization point `N` inside Hub routing state。

For a matching event：

```text
event accepted before N
    → MUST NOT be delivered through this subscription

event accepted after N
    → eligible for this subscription
```

### 7.1 Successful establishment

The returned Promise MUST resolve only after the complete channel set has been atomically installed by the Hub **and the subscription is still live when the successful result becomes author-visible**。

```text
subscribe() Promise resolves
    = subscription is already live
```

v1 MUST NOT expose：

```text
subscription.ready
pending status
half-open author-visible subscription
already-terminal handle as successful establishment
```

### 7.2 First callback ordering

The listener MUST NOT be invoked before `subscribe()` resolves with that subscription handle。

If a matching event becomes eligible after `N` but before successful establishment acknowledgement becomes author-visible：

```text
bounded retain
→ resolve subscribe()
→ only then invoke listener
```

### 7.3 Establishment failure / ambiguity

Failed `subscribe()` MUST NOT expose a usable or half-created subscription。

If the Hub installed an internal candidate but definitive acknowledgement cannot be delivered, binding/request lifetime mechanics MUST retire/fence that orphan candidate。It MUST NOT continue delivering callbacks。

Subscription-establishment ambiguity MUST NOT surface as a business `OUTCOME_UNKNOWN` handle state。

```text
failure
→ no author-visible live subscription
→ no listener invocation
```

If there is no usable binding when subscribe is admitted locally, it MUST fail fast `BINDING_UNAVAILABLE` and MUST NOT wait/queue for a future binding。

### 7.4 Terminal before successful establishment becomes author-visible

A subscription candidate MAY be installed at `N` and then become terminal before the successful subscribe result becomes author-visible—for example because retained post-`N` events overflow the bounded queue or the carrying binding terminals。

In that race, `subscribe()` MUST reject and MUST NOT resolve an already-terminal handle。

Required mapping：

```text
candidate overflow before successful result becomes author-visible
    → LIMIT_EXCEEDED

carrying binding terminal before successful result becomes author-visible
    → BINDING_UNAVAILABLE

owning client or Hub terminal before successful result becomes author-visible
    → TERMINAL
```

The candidate MUST be retired/fenced；retained undelivered events MAY be discarded；listener MUST NOT be invoked。

This failure is deterministic establishment failure, not `OUTCOME_UNKNOWN`。

---

## 8. Subscription Terminal / Close Surface

`SessionEventSubscription.closed` MUST be a stable Promise created with the handle and MUST settle exactly once。It MUST resolve, never reject。

Reasons：

```text
closed
    explicit author close()

overflow
    bounded delivery could not preserve guarantees

binding-terminal
    physical binding carrying this subscription became terminal

client-terminal
    owning Runtime-scoped SessionEventClient became terminal

hub-terminal
    SessionEventHub / Session became terminal
```

### 8.1 Explicit close

`close()` is synchronous and idempotent。

```text
close() returns
→ subscription is locally inert
→ no new listener invocation may start
→ closed is settled with reason="closed" unless already terminal for another reason
```

Remote unsubscribe cleanup MAY complete asynchronously after `close()` returns。

`close()` MUST NOT require a usable physical binding to make the local handle inert。

If a listener invocation is already running when `close()` occurs, v1 does not cancel that already-started callback or its returned Promise；the guarantee is **no new invocation starts after close returns**。

### 8.2 Unexpected terminal

Unexpected terminal MUST be author-observable through `closed`。Business code is not required to await it, but the framework MUST provide the evidence。

No synthetic SessionEvent with `type="terminal"` is delivered through the business listener。

After any terminal reason：

```text
no new listener invocation
no transparent subscription reactivation
late old-binding event/ack fenced
```

---

## 9. Listener Execution / Ordering

Each live subscription owns one logical delivery lane。

At most one listener invocation for that subscription MAY be active at a time。

```text
event A admitted
→ invoke listener(A)
→ wait until sync return / returned Promise settles
→ invoke next queued event B
```

This listener-local await is **not** publisher acknowledgement。Publish has already completed according to §5。

Listener synchronous throw or returned rejected thenable MUST be locally contained / diagnosed and MUST NOT：

```text
retroactively fail publish
terminal the subscription by itself
terminal another subscription
rollback Shared State
make SessionEventHub fatal
```

After listener failure, the subscription continues with the next queued event unless it was explicitly closed or independently terminalized。

Listener MAY reenter `publish()` / `subscribe()` and MAY call its own `close()` without deadlocking Hub routing state。

### 9.1 Event ordering

For events accepted in order from the same logical publisher binding：

```text
A accepted before B
```

any one subscription receiving both MUST invoke its listener for A before B。

For events from different publishers, v1 defines no global total order。A subscription will observe some stable queue order, but that cross-publisher relative order MUST NOT be treated as a Session-wide clock or shared with another plane。

Different subscriptions are independent delivery lanes and MAY progress at different speeds。

---

## 10. Backpressure / Overflow

Session Events MUST be bounded。

Logical hard limits：

```text
channel UTF-8 bytes                    <= 256
event type UTF-8 bytes                 <= 128
single payload encoded JSON size       <= 256 KiB
JsonValue nesting depth                <= 64
channels per subscription              <= 64
live subscriptions per client          <= 64
pending events per subscription        <= 64
pending logical bytes per subscription <= 8 MiB
```

Pending event = accepted/routed event not yet started in the listener。The currently active listener event is not counted as pending。

Pending logical bytes for one queued event =：

```text
UTF-8 bytes(channel)
+ UTF-8 bytes(type)
+ encoded JSON bytes(payload)
+ UTF-8 bytes(source.subsystemKey)
```

If enqueuing one event would exceed either per-subscription pending bound：

```text
subscription → terminal("overflow")
undelivered queued events MAY be discarded
closed MUST resolve overflow
no further listener invocation may start
publish acceptance remains unaffected
```

An already-running listener MAY finish naturally after overflow terminal；no new listener invocation starts。

Physical adapters/carriers MUST also use bounded buffering and MUST NOT defeat these semantics with unbounded Promise/message accumulation。

Diagnostics may use separate lossy/batching policy, but MUST NOT consume unbounded capacity from business events or Shared State traffic。

---

## 11. Stable Failure Shape

```ts
export type SessionEventFailureCode =
  | "INVALID_REQUEST"
  | "LIMIT_EXCEEDED"
  | "TERMINAL"
  | "BINDING_UNAVAILABLE"
  | "OUTCOME_UNKNOWN";

export interface SessionEventFailure {
  readonly code: SessionEventFailureCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export class SessionEventError extends Error implements SessionEventFailure {
  readonly code: SessionEventFailureCode;
  readonly path?: readonly (string | number)[];
}

export function isSessionEventFailure(
  value: unknown,
): value is SessionEventFailure;
```

`@loomrealm/session-events` MUST export `SessionEventError` and `isSessionEventFailure()`。

Every author-facing rejected `publish()` / `subscribe()` Promise MUST reject with a `SessionEventError` whose `.code`、`.message`、`.path` are observably equivalent to the logical failure。Remote wire failures MUST be reconstructed into this local SDK Error surface；transport-private Error objects MUST NOT leak directly to business code。

`isSessionEventFailure()` MUST recognize structurally equivalent failures and MUST NOT require `instanceof SessionEventError`, so callers can safely classify failures across package/realm boundaries。

Rules：

```text
code     normative and machine-readable
message  diagnostic only; callers MUST NOT branch on exact text
path     optional structural diagnostic path only
```

Failure mapping：

```text
INVALID_REQUEST
    malformed channel/type/payload/channels request

LIMIT_EXCEEDED
    normative size/count/capacity limit exceeded before acceptance/installation

TERMINAL
    logical SessionEventClient or Hub is terminal

BINDING_UNAVAILABLE
    live logical client currently has no usable physical binding

OUTCOME_UNKNOWN
    publish was dispatched but definitive acceptance result was lost
```

`OUTCOME_UNKNOWN` applies only to publish evidence。Subscribe establishment ambiguity is fenced/retired and does not expose a half-open subscription。

Wire transport MUST preserve `code` and `path` semantics and MUST NOT expose JS stack traces、filesystem paths、credentials、ports or transport-private objects。

---

## 12. Logical Client / Binding / Recovery

`SessionEventClient` identity/lifetime MUST NOT equal one physical Process / Worker / MessagePort / WebSocket / IPC connection。

```text
live Runtime-scoped SessionEventClient
        │
        ├─ physical binding A
        │      ↓ lost
        └─ physical binding B
```

### 12.1 No usable binding = fail fast

If a live logical client has no usable physical binding when a new operation is admitted locally：

```text
publish
    → BINDING_UNAVAILABLE
    → known not accepted
    → no wait / no queue / no automatic retry

subscribe
    → BINDING_UNAVAILABLE
    → no handle
    → no wait / no queue for reconnect
```

### 12.2 In-flight binding loss

```text
publish not dispatched
    → BINDING_UNAVAILABLE / known not accepted

publish dispatched, definitive result lost
    → OUTCOME_UNKNOWN

subscribe not successfully acknowledged
    → establishment fails; no handle; orphan candidate fenced/retired

live subscription on lost binding
    → closed(reason="binding-terminal")
```

### 12.3 Binding generation fencing

Every physical binding MUST have private identity/generation fencing。After binding A becomes terminal：

```text
late A publish result MUST NOT complete an operation on binding B
late A subscription event MUST NOT reach fresh B subscription
late A subscribe ack MUST NOT resurrect orphan subscription
late A message MUST NOT change already returned OUTCOME_UNKNOWN
```

### 12.4 Recovery

A fresh physical binding MAY be installed under the same still-live Runtime-scoped `SessionEventClient`。

```text
old binding terminal
→ old subscriptions terminal(binding-terminal)
→ fresh binding installed
→ future publish/subscribe may proceed
→ business explicitly fresh subscribes
→ no missed-history replay
```

Framework MUST NOT transparently resume an old subscription or retry an ambiguous publish。

Whether a concrete platform automatically attempts to establish a fresh binding is outside this logical contract；logical operations MUST remain fail-fast while no usable binding exists。

---

## 13. Client / Hub Lifetime and Fatal Boundary

```text
Frame suspend/close     != SessionEventClient revoked
Activation replacement != SessionEventClient replaced
Renderer reload         != Session Events reset
Data reconnect          != Session Events replay/reset
```

Runtime terminal：

```text
→ its SessionEventClient becomes terminal/inert
→ future publish/subscribe fail TERMINAL
→ its live subscriptions close client-terminal
```

Session / Hub terminal：

```text
→ SessionEventHub terminal/inert
→ all clients reject new operations TERMINAL
→ live subscriptions close hub-terminal when callback lifetime permits observation
```

If SessionEventHub detects an invariant-fatal condition, it MUST become terminal/inert before reporting a Session-fatal infrastructure fact to Main/Session lifecycle owner。

```text
Hub detects fatal
→ Hub self-terminal
→ stop admitting new publish/subscribe
→ terminalize subscriptions hub-terminal
→ report Session-fatal fact
→ Main commits Session terminal / Runtime unwind
```

The current exact Main-facing fatal capability and latching semantics are frozen by [Session Events Runtime Integration Profile v1](./session-events-runtime-profile-v1.md)。

SessionEventHub does not own Main control transitions or process termination。

Failure during Hub construction before it reaches READY and joins the live Session is bootstrap failure, not live-Hub fatal reporting。

---

## 14. Shared State Interaction

Shared State and Session Events are orthogonal：

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

A business MAY explicitly carry its own operation identifier in State and Event payloads for reconciliation。

---

## 15. Render Event / Diagnostics Boundary

`RenderDomain.emit()` / `render.event` remains presentation-local Renderer Data semantics。Session Events MUST NOT implicitly bridge to or from Render Events。

Diagnostics/logging MAY reuse routing implementation or physical carrier, but MUST remain a distinct logical role / QoS domain。Business code SHOULD use a logger capability rather than ordinary business event channel/type for logs。

---

## 16. Physical Placement / Shared Carrier

Physical placement is non-normative。Valid realizations include：

```text
A. dedicated Event process/Worker
B. Shared State + SessionEventHub in one process/Worker
C. Main + Shared State + SessionEventHub in one Session host
D. same-process/in-process Hub
```

Co-location MUST NOT：

```text
merge State/Event logical identity
create State+Event atomic transaction
change payload isolation
expose process identity
invoke listener synchronously inside publisher call stack
create hidden cross-plane ordering
change failure/evidence semantics
```

Session Events MAY use a dedicated physical carrier or multiplex with Shared State：

```text
shared Session-service physical carrier
    ├── Shared State logical binding
    └── Session Events logical binding
```

Normative rule：

> **shared carrier != shared logical protocol != shared authority != shared ordering domain**

When multiplexed, logical namespaces/correlation、flow-control accounting、failure/evidence interpretation and subscription identity MUST remain independent。

A shared carrier MAY share endpoint/framing primitive/connection liveness/serialization infrastructure/private scheduler, but MUST NOT implicitly share business authority、revision、retry、queue semantics、operation evidence or application error codes。

Heavy Session Event / Diagnostics traffic MUST NOT indefinitely starve Shared State operations。

Physical wire order MUST NOT become a public State/Event happens-before relation。

Current Hostra/PWA v1 products deliberately use dedicated Event carriers；that current realization is frozen separately by [Session Events Runtime Integration Profile v1](./session-events-runtime-profile-v1.md)。The logical MAY-multiplex rule remains reserved for a future physical profile and does not require current product implementations to multiplex。

---

## 17. Logical Binding Protocol Requirements

Exact byte framing is a physical profile/private implementation choice；Desktop/PWA/in-process realizations MAY differ。However every remote realization MUST be able to express behavior equivalent to：

```text
publish request / definitive result
subscribe request / definitive establishment result
subscription event delivery
subscription terminal notification
subscription close/unsubscribe
binding terminal
Hub terminal
stable SessionEventFailure
```

Subscription identity on a remote binding MUST be scoped/fenced by that binding。A binding terminal MUST allow the Hub to retire all subscriptions owned by that binding, including orphan candidates whose subscribe acknowledgement was never observed。

Publisher-supplied wire data MUST NOT be authoritative for `source.subsystemKey`。

Physical framing corruption、impossible correlation、wrong protocol or invalid response body MAY terminalize only the affected physical binding unless Hub invariants themselves are lost。

A valid framed logical request with invalid channel/type/payload/channels MUST return `INVALID_REQUEST` or `LIMIT_EXCEEDED` as applicable and SHOULD leave the binding usable。

Transport MUST NOT automatically retry application publish requests。

---

## 18. Protocol / Platform Boundary

Logical protocol identifier：

```text
loomrealm.session-events/1
```

Physical realization MAY be：

```text
in-process binding
MessagePort
IPC
WebSocket
shared multiplexed Session-service carrier
dedicated Events carrier
```

All realizations MUST preserve：

```text
channel/type grammar + limits
source authenticity
publish acceptance/evidence
routing multiplicity
async subscription establishment
first callback after subscribe resolve
subscription closed surface
serial per-subscription listener lane
bounded queue + overflow terminal
synchronous local close
binding fail-fast/fencing/recovery
client/Hub lifetime
failure shape
```

The protocol MUST NOT be embedded as a semantic child of Renderer Data、Frame/Call or Main control authority。

The current concrete Hostra/PWA binding mechanisms are normative only through [Session Events Runtime Integration Profile v1](./session-events-runtime-profile-v1.md) and do not redefine the logical protocol identifier。

---

## 19. Explicit Non-goals

v1 does not provide：

```text
request/reply RPC
service discovery
command bus
workflow engine / saga coordinator
durable event store / event sourcing
history replay / cursor
consumer groups
exactly-once delivery
automatic retry
global Session event sequence
cross-plane transaction
Shared State commit + Event publish atomicity
channel ACL / multi-tenant policy engine
channel wildcard / prefix / glob / regex
channel hierarchy semantics
type-filtered subscription
type wildcard / pattern routing
schema registry
Renderer direct subscription
Render Event bridge
universal application store
subscription channel mutation/updateChannels()
```

If business needs “call another Subsystem and wait for a result”, design a separate command/call contract rather than publish + reply-channel RPC emulation。

---

## 20. Conformance Requirements

Before implementation can be marked Qualified, automated qualification MUST cover at least：

```text
Capability / Identity
- one live Session owns exactly one logical SessionEventHub
- every successfully bootstrapped live Subsystem Runtime owns exactly one Runtime-scoped SessionEventClient
- Event client is available as a standard Runtime capability, not an optional business probe

Identity / Validation
- exact channel matching; '/' has no hierarchy semantics
- channel/type UTF-8/control-character limits
- JsonValue size/depth algorithm
- payload detached from publisher and isolated between subscribers
- source derived from bound Runtime identity; spoof attempt cannot alter source

Routing
- unrelated Runtime binding receives no normal delivery
- one accepted event → at most one delivery per matching subscription
- two matching subscriptions in one Runtime each receive one delivery
- self-publish to matching own subscription is delivered
- zero subscriber publish succeeds

Publish Evidence
- known pre-dispatch rejection = not accepted
- success = Hub accepted, not handler completion
- lost definitive result after dispatch → OUTCOME_UNKNOWN
- no automatic publish retry
- subscriber overflow does not retroactively fail accepted publish

Subscription Establishment
- complete channel set installed atomically
- empty/duplicate/too-many channels rejected
- subscribe resolves only after Hub installation and only while still live
- first callback after Promise resolve
- failed/ambiguous establishment exposes no handle/callback
- orphan candidate is retired on binding failure
- overflow before successful result becomes visible → LIMIT_EXCEEDED / no handle
- binding terminal before successful result becomes visible → BINDING_UNAVAILABLE / no handle
- client/Hub terminal before successful result becomes visible → TERMINAL / no handle

Failure Surface
- rejected publish/subscribe uses SessionEventError
- code/message/path preserve logical failure
- isSessionEventFailure recognizes structural equivalents without instanceof requirement
- remote transport-private Error does not leak to business code

Delivery Lane
- at most one active listener invocation per subscription
- next event waits for previous Promise settlement
- listener throw/rejection local containment; subsequent event continues
- same-publisher accepted order preserved
- reentrant publish/subscribe/close does not deadlock

Terminal / Close
- closed Promise settles exactly once and never rejects
- explicit close is synchronous/idempotent and reason=closed
- no new callback starts after close returns
- active callback is not forcibly cancelled by close
- overflow → closed(reason=overflow)
- binding loss → binding-terminal
- Runtime client terminal → client-terminal
- Hub/Session terminal → hub-terminal

Backpressure
- 64 pending-event / 8 MiB bounds exact
- overflow terminals instead of silent drop
- overflow does not block Hub publish admission lane indefinitely
- unrelated subscriptions remain healthy

Binding / Lifetime
- no usable binding → publish/subscribe BINDING_UNAVAILABLE without wait/queue
- pre-dispatch publish loss known not accepted
- dispatched publish lost result = OUTCOME_UNKNOWN
- late old-binding messages fenced from fresh binding
- fresh binding does not replay or reattach old subscription
- fresh subscribe required after recovery
- Frame/Activation/Renderer/Data changes do not revoke Event client
- qualification proves deliberate fresh-binding replacement; no automatic reconnect scheduler is required

Physical Equivalence
- in-process and remote profiles expose equivalent observables
- current Hostra dedicated WebSocket profile passes
- current PWA dedicated MessagePort profile passes
- State/Events shared carrier, if/when implemented, creates no cross-plane order/transaction
- Event traffic cannot indefinitely starve Shared State on any future multiplexed carrier
```

---

## 21. Implementation Freeze Rule

Session Events v1 logical contract **and the current Runtime Integration Profile v1** have no remaining architecture or deterministic-surface blocker for implementation。

Implementation MAY choose internal maps/indexes、serialization/framing、private subscription ids、binding generation token、scheduler、queue data structures、package-private factory/type names and automatic rebinding strategy, provided all normative observable semantics and the frozen current Hostra/PWA binding seams remain unchanged。

Implementation MUST NOT invent new public behavior for convenience。If implementation finds a genuinely missing observable rule, treat it as a contract defect and deliberately revise this contract rather than choose platform-specific semantics silently。

---

## 22. Core Invariants

1. one live Session has one logical SessionEventHub；
2. every live business Subsystem Runtime has exactly one Runtime-scoped SessionEventClient；the client is a standard capability, not optional business configuration；
3. SessionEventHub owns routing/delivery mechanics, not business truth；
4. SessionEventClient is Runtime-scoped logical capability, not a process/socket identity；
5. every event names exactly one channel and one type；channel alone is v1 routing key；
6. `/` is ordinary channel text with no hierarchy/prefix/wildcard meaning；
7. type is delivered business discriminator, not routing filter；
8. source.subsystemKey is derived from authenticated binding identity and cannot be publisher-spoofed；
9. one accepted event produces at most one delivery per matching subscription；distinct subscriptions are independent recipients；
10. self-delivery is allowed；zero-subscriber publish succeeds；
11. publish success means Hub accepted/routed, not subscriber handled；
12. dispatched publish with lost definitive result = OUTCOME_UNKNOWN and is never auto-retried；
13. subscriber overflow does not retroactively fail an accepted publish；
14. subscribe is async and resolves only after atomic Hub installation while the subscription is still live；
15. listener cannot start before corresponding subscribe resolves；
16. failed/ambiguous/pre-visible-terminal establishment exposes no half-open or already-terminal subscription；
17. author-facing logical failures reject with stable SessionEventError semantics and structural failure guard；
18. every successful subscription exposes a one-shot non-rejecting `closed` terminal surface；
19. close() is synchronous/idempotent local revocation；remote cleanup is asynchronous detail；
20. one subscription has one serial listener lane with at most one active invocation；
21. listener failure is local and does not terminal the subscription by itself；
22. bounded delivery overflow terminals explicitly instead of silently dropping while healthy；
23. no usable binding fails new operations fast without wait/queue；
24. binding loss terminals old subscriptions but not the still-live logical client；fresh binding requires fresh subscribe and no replay；automatic rebinding policy is non-normative；
25. Runtime terminal terminals its client/subscriptions；Hub/Session terminal terminals all；
26. Frame/Activation/Renderer/Data lifetimes do not authorize or revoke Session Events；
27. Shared State and Events remain non-atomic and share no revision/order；
28. physical placement/carrier multiplexing is non-normative at logical layer and cannot alter semantics；current Hostra/PWA use dedicated Event carriers；
29. no RPC、replay、event sourcing、exactly-once、wildcard/type filtering or universal EventBus semantics in v1；
30. Desktop/PWA/in-process realizations MUST be observably equivalent at the logical boundary。
