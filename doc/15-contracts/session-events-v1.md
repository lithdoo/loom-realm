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
  readonly type: string;
  readonly payload: T;
  readonly source: {
    readonly subsystemKey: string;
  };
}

export interface SessionEventClient {
  publish(type: string, payload: JsonValue): Promise<void>;

  subscribe(
    type: string,
    listener: (event: SessionEvent) => void | Promise<void>,
  ): Promise<SessionEventSubscription>;
}

export interface SessionEventSubscription {
  close(): void;
}
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

## 3. Event Type / Payload

v1 使用 exact string event type。

Event type MUST：

```text
be non-empty
be valid Unicode scalar-value text
be compared case-sensitively by exact scalar sequence
not depend on JS Symbol / constructor identity
```

v1 subscription MUST match exact event type only。Wildcard / regex / prefix subscription 不属于 v1。

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
await client.publish(type, payload)
```

successful resolution means：

```text
SessionEventHub accepted the validated event
and committed its routing admission against the then-current subscriptions
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

## 5. Subscription Establishment / Routing Linearization

`subscribe(type, listener)` establishes an exact-type subscription at one logical linearization point `N` inside SessionEventHub routing state。

```text
event accepted before N
    → MUST NOT be delivered through this subscription

event accepted after N
    → eligible for this subscription
```

The returned Promise MUST resolve before the listener is first invoked。

If an event becomes eligible after subscription linearization but before the subscribe Promise resolves, the binding/runtime delivery layer MUST preserve it in bounded order and invoke only after resolution。

Routing recipient set is determined at publish acceptance time from subscriptions current at that point。

Zero matching subscribers MUST NOT make publish fail。

`SessionEventSubscription.close()` MUST be idempotent。After it returns, that subscription's listener MUST NOT be invoked again。

---

## 6. Ordering

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

## 7. Listener Execution Boundary

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

`publish accepted != listener handled` is a normative invariant。

---

## 8. Backpressure / Overflow

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

Business event delivery MUST NOT silently drop while leaving the affected subscription apparently healthy。

If a subscription can no longer preserve the ordering/delivery guarantees declared by v1 because its bounded queue is exhausted, it MUST become terminal with an explicit overflow outcome。The exact numeric v1 limits and terminal event/error shape MUST be frozen before implementation begins。

Diagnostics / logging MAY use a separate lossy/sampling policy, but that is a distinct logical role and MUST NOT weaken business-event guarantees or monopolize Shared State / business-event flow control。

---

## 9. Failure Shape

Candidate logical failure codes：

```ts
export type SessionEventFailureCode =
  | "INVALID_REQUEST"
  | "LIMIT_EXCEEDED"
  | "TERMINAL"
  | "BINDING_UNAVAILABLE"
  | "OUTCOME_UNKNOWN";
```

`OUTCOME_UNKNOWN` is valid only where publish dispatch may have reached the Hub but definitive acceptance evidence was lost。

A subscription callback failure is NOT a publish failure code。

Exact stable failure object shape MUST be frozen before implementation begins。

---

## 10. Logical Client vs Physical Binding

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

---

## 11. Physical Placement Is Non-normative

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

## 12. Shared Physical Carrier / Multiplexing

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

### 12.1 Correlation

If multiple logical protocols share one physical request-id space, logical correlation identity MUST include the protocol/plane discriminator or an equivalent collision-proof private mechanism。

A State request and an Event publish with the same numeric private request id MUST never be interpreted as the same logical operation。

### 12.2 Flow-control Isolation

Multiplexing MUST NOT allow heavy Session Event or Diagnostics traffic to indefinitely starve Shared State operations。

The physical implementation MUST provide bounded and logically separable flow-control accounting sufficient to preserve each protocol's guarantees，例如：

```text
Shared State queue / budget
Session Events business queue / budget
Diagnostics queue / budget
```

The exact scheduler is private implementation detail；absence of unbounded starvation/cross-plane queue takeover is normative。

### 12.3 Shared Carrier Loss

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

### 12.4 No Cross-plane Ordering from Wire Order

Physical frame/message order on a shared carrier MUST NOT become a public happens-before relation between State and Events。

For example：

```text
wire receives State commit request
then Event publish request
```

MUST NOT by itself imply a business-visible guarantee that the State commit completed before Event acceptance。

There is no shared State/Event revision, global sequence, transaction, barrier, or implicit transactional outbox in v1。

---

## 13. Shared State Interaction

Shared State and Session Events are intentionally orthogonal：

```text
Shared State
    current authoritative fact
    version / OCC / commit evidence

Session Events
    transient notification
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

## 14. Render Event Boundary

`RenderDomain.emit()` / `render.event` remains Renderer Data / presentation-local semantics。

Session Events MUST NOT implicitly bridge to or from Render Events。

```text
Render Event
    presentation intent inside one Subsystem RenderDomain

Session Event
    cross-Subsystem transient business notification
```

---

## 15. Diagnostics Boundary

Logging/diagnostics MAY reuse the same physical Session-service carrier and routing implementation, but MUST remain a distinct logical role / QoS domain。

Business code SHOULD consume a logger capability rather than publish a normal business topic named `log`。

Diagnostics MAY support sampling / batching / lossy overflow in a future contract；such policy MUST NOT leak into business Session Events or Shared State semantics。

---

## 16. Protocol / Platform Boundary

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
subscription linearization
routing semantics
payload isolation
ordering
binding fencing
failure interpretation
bounded delivery
lifetime
```

The protocol MUST NOT be embedded as a semantic child of Renderer Data、Frame/Call or Main control authority。

---

## 17. Implementation Freeze Rule

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
exact topic grammar/byte limit
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
```

---

## 18. Core Invariants

1. one live Session has one logical SessionEventHub；
2. SessionEventHub owns routing/delivery mechanics, not business truth；
3. SessionEventClient is Runtime-scoped logical capability, not a process/socket identity；
4. publish success means Hub accepted/routed, not subscriber handled；
5. dispatched publish with lost definitive result may be OUTCOME_UNKNOWN and MUST NOT auto-retry；
6. subscription establishment has a defined routing linearization point；
7. payload ownership is detached/isolated identically for in-process and cross-process realizations；
8. same publisher order is preserved for subscriptions receiving the same accepted events；no global publisher order exists；
9. no history replay / durable subscription / consumer offset / event sourcing in v1；
10. listener failure is local and never retroactively fails publish；
11. business delivery is bounded and MUST NOT silently drop while remaining healthy；
12. physical placement is non-normative；Hub MAY be dedicated or co-located with Shared State/Main；
13. State and Events MAY use separate carriers or multiplex one physical carrier；
14. shared carrier never creates shared authority、revision、transaction、retry or public cross-plane ordering；
15. multiplexed flow control MUST prevent one logical plane from taking unbounded ownership of another plane's capacity；
16. one shared carrier failure may affect multiple bindings physically, but each protocol derives logical evidence/failure independently；
17. Shared State + Event atomic transaction does not exist in v1；
18. Render Event remains a separate presentation-local concept；
19. Diagnostics may share mechanics/carrier but retain distinct QoS semantics；
20. Desktop/PWA and co-located/separate realizations MUST be observably equivalent at the logical protocol boundary。
