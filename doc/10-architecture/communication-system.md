# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving；Realm State v1 logical plane + Hostra WS / Worker MessagePort physical realizations implemented and qualified；Session Events v1 logical semantics frozen / not implemented / not qualified
> 主要定义：Control Plane、Renderer Data Plane、Realm State Plane、Session Events Plane、Content Plane、carrier/application mapping、authority/recovery 与 communication-facing Platform responsibilities  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Realm State](./realm-state-system.md)、[Session Events](./session-events-system.md)  
> 被以下文档细化：[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：Realm State：[Realm State v1](../15-contracts/realm-state-v1.md)；Session Events：[Session Events v1](../15-contracts/session-events-v1.md) · [Conformance](../15-contracts/session-events-conformance-v1.md)  
> 最近复核：2026-10-13

---

## 1. 五类 Logical Communication Planes

```text
Control Plane
    Main ⇄ Subsystem
        Subsystem Control v1
        Frame / Call v1
        Runtime Control Profile v1

    Main ⇄ Renderer
        Renderer Control v1

Renderer Data Plane
    Renderer ⇄ Subsystem
        Renderer Data Application Profile v1
            Data Connection v1
            User Input v1
            Render Update v1
            Viewport role when current profile revision includes it

Realm State Plane
    RealmStateAuthority ⇄ Subsystem Runtime
        loomrealm.realm-state/1
        read / readInitial / list / commit / subscribe

Session Events Plane
    SessionEventHub ⇄ Subsystem Runtime
        loomrealm.session-events/1
        exact-channel routed transient business events
        publish / subscribe / terminal
        no replay / no state authority / no RPC

Content Plane
    Main/Renderer/Subsystem ⇄ Readonly Content Service
```

这些 planes MAY 共享 physical transport primitives，但 authority、lifecycle、failure/recovery、backpressure 与 retry semantics 独立。

```text
Renderer Data reconnect
    != Realm State reconnect/reset
    != Session Events replay/reset

Runtime Control loss
    != ordinary Realm State conflict
    != ordinary Session Event delivery failure

Realm State binding loss
    != Runtime/Session failure

Session Events binding loss
    != Realm State reset
    != Renderer Data failure
    != Main control transition

RealmStateAuthority fatal
    = Session-fatal condition report
    != direct Session unwind ownership

SessionEventHub invariant fatal
    = Session-fatal infrastructure fact report
    != business event
    != direct Session unwind ownership
```

---

## 2. MessageCarrier Boundary

现有 message-oriented Control/Data role implementation消费：

```text
MessageCarrier
```

Carrier只保证：

```text
message boundary
per-direction order
observable close/loss
bounded physical buffering
no adapter-created duplicate/retry
```

Carrier不定义：

```text
connection identity / establishment
reconnect policy
Runtime failure
Data generation/profile
Realm State authority / commit semantics
Session Events channel/routing/subscription semantics
Session terminal policy
```

Realm State logical contract不要求统一 physical MessageCarrier。Desktop MAY in-process；PWA/cross-process MAY MessagePort / IPC / another bounded private carrier。

Session Events 同样不绑定某一种 carrier。Carrier MUST NOT 自己创建 channel semantics、subscription registry、history replay、business retry、source identity 或 business authority。

State 和 Events MAY multiplex 同一 carrier，但：

```text
shared carrier
!= shared protocol
!= shared authority
!= shared ordering domain
```

---

## 3. Application Unit / Encoding Boundary

当前 Runtime Control / Renderer Control / Renderer Data Profile统一：

```text
one carrier application unit
= one UTF-8 JSON text string
```

映射：

```text
WebSocket      one text message
MessagePort    postMessage(string)
MemoryCarrier  string
```

Structured Clone只用于 Platform bootstrap/Port transfer；existing Control/Data application payload不允许出现第二套 structured-object model。

Realm State v1 当前 Hostra realization 使用独立 JSON-text WebSocket carrier，browser/Worker realization 使用 private MessagePort string units；两者共享 Realm State v1 validation/size/evidence semantics。

Session Events v1 冻结 logical binding requirements，不冻结一个跨平台统一 byte encoding。Remote realization MUST 能表达：

```text
publish request/result
subscribe request/establishment result
subscription event
subscription terminal
unsubscribe/close
binding/Hub terminal
stable failure
```

Desktop/PWA/in-process encoding可以不同，但 channel/type grammar、source authenticity、limits、routing、delivery、failure evidence MUST 相同。

---

## 4. Main ⇄ Subsystem Control

同一 current Control Connection：

```text
Subsystem Control + Frame / Call
```

由 one connection-wide dispatcher消费；same sender共享 Request ID namespace。

Control loss在无 shutdown intent时 Runtime-fatal；same-attempt无 reconnect。

Realm State request MUST NOT 塞进 Runtime Control / Frame Call namespace；`frame.call()` 继续只表达 control-flow composition。

Session Event publish/subscribe 同样 MUST NOT 塞进 Frame/Call namespace，也 MUST NOT 用 `frame.call()` 模拟 ordinary event fan-out。Session Events 不拥有 control continuation、child result 或 Runtime supervision。

---

## 5. Main ⇄ Renderer Control

Renderer Control只发布 Main committed logical authority：

```text
Runtime projection
Frame Stack / Activation
InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

不携：

```text
Data endpoint/ticket/Port
Interest Registry
Render State
Content credential
Realm State value / carrier material
Session Event channel/subscription state
```

Control loss使 Renderer失去 current Main authority，并 retire旧 Data connections；MUST NOT 因此 reset RealmStateAuthority 或要求 SessionEventHub replay。

Renderer v1 不直接订阅 Session Events；未来若需要必须定义 explicit role。

---

## 6. Renderer Data Application Profile

当前 baseline：

```text
loomrealm.renderer-data/1
= Connection 1 + User Input 1 + Render Update 1
```

Viewport add-only child revision仍属于 Renderer↔Subsystem Data plane。

Realm State 与 Session Events 都 MUST NOT 成为 Renderer Data child protocol。Session Events 是 Runtime-scoped Session capability，不依赖 current Renderer/Data generation。

---

## 7. Data Connection Authority

Main DataAuthority：

```text
S = subsystemKey
G = generation
P = dataProfile
```

Platform Broker依据 current `S/G/P` 建立物理两端。

Realm State Record identity/version/revision MUST NOT 使用 Data generation/profile。

Session Event channel/type/source/subscription identity MUST NOT 使用 Renderer Data generation/profile 作为 business identity/currentness。Event client lifetime跟随 Runtime/Session。

---

## 8. Dynamic Data Provisioning

```text
Main DataAuthority
→ Platform DataConnectionBroker
→ role-local DataBinding
→ DataPlane installs current carrier
```

RealmStateClient 与 SessionEventClient 都属于 Runtime-scoped Session capability；其 binding/provisioning 不由 Renderer DataAuthority 授权，也不通过 Data candidate/current机制建立。

---

## 9. Data Failure Boundary

```text
Data carrier loss
provisioning failure
unsupported dataProfile
same-generation reconnect failure
```

都不自动：

```text
fail Runtime
unwind Frame
reset Realm State
terminal RealmStateClient
terminal SessionEventClient
```

---

## 10. User Input Cross-plane Composition

```text
Effective(F,A,C)
=
current matching Data S/G/P
∧ Main InputTarget == (S,F,A)
∧ mirrored/local F active/current A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

Realm State revision不是 Input/Render cross-plane barrier。

Session Event delivery也不是 Input mutation permit。Event listener可以调用 normal capabilities，但事件本身不创建 current Frame、Activation 或 InputTarget authority。

---

## 11. Render Communication

```text
render.event
    RenderDomain-local / presentation transient intent
    Renderer Data plane
    no cross-Subsystem subscription

Session Event
    Session-scoped / cross-Subsystem business notification
    Session Events plane
    no automatic Renderer projection
```

两者 MUST NOT 自动桥接。

---

## 12. Realm State Plane

Logical protocol：

```text
loomrealm.realm-state/1
```

Authority semantics：

```text
one Session
→ one logical RealmStateAuthority
→ many Runtime-scoped RealmStateClient bindings
```

Realm State拥有 current/initial observation、Record OCC、commit evidence、explicit-Record subscription；不拥有 Session Event routing/history。

### Validation / Trust Boundary

```text
untrusted input
→ validate key/value/request + limits
→ trusted detached/immutable representation
→ Authority short serialized step
```

### Mutation Evidence

```text
pre-admission rejection → known no-commit
success                → known committed
dispatched + result lost → OUTCOME_UNKNOWN
```

### Binding Loss / Recovery

Old State subscription terminal；fresh binding需要 fresh subscribe + baseline；不 replay ambiguous mutation。Binding loss不自动 fail Runtime/Session。

---

## 13. Session Events Plane

完整语义以 [Session Events v1](../15-contracts/session-events-v1.md) 为准。

```text
one Session
→ one logical SessionEventHub
→ many Runtime-scoped SessionEventClient logical clients
→ zero or more exact-channel subscriptions per client
```

### Channel / Type

```text
channel
    exact Hub routing key
    '/' ordinary text, no hierarchy semantics

type
    business discriminator
    not a v1 routing filter
```

Hub MUST route only to matching subscriptions，而不是 broadcast-all + Runtime-local discard。

### Source

`source.subsystemKey` 由 authenticated Runtime binding identity 派生；publisher不能 spoof source。

### Publish

```text
publish success
    = Hub accepted/routed
    != listener completion
```

Post-dispatch lost result = `OUTCOME_UNKNOWN`；no automatic retry。

Zero subscribers succeeds。One event produces at most one delivery per matching subscription；two matching subscriptions in one Runtime independently receive。Self-delivery allowed。

Subscriber overflow does not retroactively fail accepted publish。

### Subscription Establishment

```text
subscribe(channels,listener)
→ validate complete set
→ atomic Hub install @ N
→ ack
→ Promise resolves with already-live handle
```

First callback MUST start after subscribe resolves。Failed/ambiguous establishment returns no handle/callback；orphan candidate fenced/retired。

### Subscription Terminal

Every subscription exposes one-shot non-rejecting `closed`：

```text
closed
overflow
binding-terminal
client-terminal
hub-terminal
```

`close()` synchronous/idempotent local revoke；remote cleanup may be async。

### Serial Delivery Lane

Each subscription has max one active listener invocation：

```text
A listener settles
→ then B listener may start
```

Listener throw/rejected Promise local isolate；does not terminal subscription by itself。

### Binding / Recovery

No usable binding：new publish/subscribe fail fast `BINDING_UNAVAILABLE`；no wait/queue。

Binding loss terminalizes old subscriptions `binding-terminal` but does not by itself terminal still-live logical client。Fresh binding may continue future operations；fresh subscribe required；no replay/reattach。

### Hub Fatal

Hub invariant fatal：self-terminal first → subscriptions hub-terminal → report Session-fatal fact → Main owns Session terminal/unwind。

### No RPC / Replay

```text
no request/reply
no durable subscription/history replay
no consumer group
no exactly-once
no auto retry
no global Session sequence
no wildcard/type-filter routing
```

业务若需要 request/result，应设计独立 command/call contract，不用 publish + reply-channel 模拟 RPC。

---

## 14. Content Plane

Content使用 HTTP/Fetch logical API。Content readonly definition、Realm State mutable current truth、Session Events transient notification 三者保持独立。

---

## 15. Diagnostics / Logging

Business Events 与 Diagnostics 可复用 routing core / carrier，但 QoS 不同：

```text
Business Event
    no silent drop while subscription healthy

Diagnostics
    MAY batch/sample/drop under its own future contract
```

推荐 `scope.log.*`，而不是普通 business event log channel。

---

## 16. Backpressure

所有 plane bounded。

```text
Realm State
    own bounded request/subscription profile

Session Events
    channel <= 256 UTF-8 bytes
    type <= 128 UTF-8 bytes
    payload <= 256 KiB / depth <=64
    channels/sub <=64
    live subs/client <=64
    pending/sub <=64 events / 8 MiB

Diagnostics
    independent policy
```

Session Event would-overflow：affected subscription explicit `overflow` terminal；accepted publish remains accepted；unrelated subscription stays healthy。

Transport不得以 automatic retry/duplicate 解决 backpressure。

---

## 17. Shared Carrier Multiplexing

State 和 Events MAY：

```text
separate carriers
```

或：

```text
one physical Session-service carrier
    ├── State logical binding
    └── Events logical binding
```

Multiplexing MUST preserve：

```text
logical protocol discriminator/correlation
independent evidence/failure
independent subscription identity
bounded/separable flow control
no cross-plane public ordering
```

Heavy Events/Diagnostics traffic MUST NOT indefinitely starve State。

Shared carrier loss可以同时影响两个 physical bindings，但各协议独立推导 `BINDING_UNAVAILABLE` / `OUTCOME_UNKNOWN` / terminal semantics。

---

## 18. No Cross-plane Global Order

不存在整个 Session 的单一 network sequence。

```text
Runtime Control ↛ Renderer Control total order
Renderer Control ↛ Renderer Data total order
Realm State revision ↛ Main/Render order
Session Event order ↛ Realm State/Main/Render order
Content version ↛ Realm State revision
```

Session Events 不暴露 universal event sequence。

---

## 19. Final Invariants

1. Control、Renderer Data、Realm State、Session Events、Content 是独立 logical planes；
2. Carrier描述 pipe，不拥有 application authority/retry/supervision；
3. Session Events exact-channel routing，type不参与v1过滤；
4. source由Runtime binding派生，不能spoof；
5. publish accepted不等待listener；post-dispatch ambiguity=OUTCOME_UNKNOWN；
6. subscription async建立、resolve后才callback；失败无half-open handle；
7. subscription `closed`提供异常终止证据；
8. one subscription one serial listener lane；
9. listener failure局部隔离；
10. bounded overflow显式terminal，不silent drop；
11. no-binding新操作fail-fast；fresh binding不replay、不reattach；
12. Runtime/Hub terminal与Frame/Renderer/Data currentness分离；
13. State/Event可共进程、共carrier但不共享authority/transaction/order；
14. `render.event`与Session Event不自动桥接；
15. Diagnostics与Business Events QoS独立；
16. Transport Adapter不拥有application retry或Runtime/Session authority。