# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving；Realm State v1 logical plane + Hostra WS / Worker MessagePort physical realizations implemented and qualified
> 主要定义：Control Plane、Renderer Data Plane、Realm State Plane、Content Plane、carrier/application mapping、authority/recovery 与 communication-facing Platform responsibilities  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Realm State](./realm-state-system.md)  
> 被以下文档细化：[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：`doc/15-contracts` 对应协议/Profile；Realm State：[Realm State v1](../15-contracts/realm-state-v1.md)  
> 最近复核：2026-10-05

---

## 1. 四类 Logical Communication Planes

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

Content Plane
    Main/Renderer/Subsystem ⇄ Readonly Content Service
```

这些 planes MAY 共享某些 physical transport primitives，但 authority、lifecycle、failure/recovery 与 retry semantics独立。

尤其：

```text
Renderer Data reconnect
    != Realm State reconnect/reset

Runtime Control loss
    != ordinary Realm State conflict

Realm State binding loss
    != Runtime/Session failure

RealmStateAuthority fatal
    = Session-fatal condition report
    != binding reconnect event
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
production adapter avoids unbounded physical buffering
no adapter-created duplicate/retry
```

Carrier不定义：

```text
connection identity
establishment
reconnect policy
Runtime failure
Data generation/profile
Realm State authority / commit semantics
Session terminal policy
```

Realm State logical contract **不要求** 一个统一 physical MessageCarrier：

```text
Desktop same-process
    MAY use direct in-process binding

PWA / cross-process realization
    MAY use MessagePort / IPC / another bounded private carrier
```

如果 Realm State realization 使用 message-oriented carrier，carrier仍只负责 transport facts；MUST NOT 自己 retry/duplicate mutation，也 MUST NOT 把 transport loss擅自解释为 `CONFLICT`、known no-commit、Runtime failure 或 Session terminal。

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

Realm State v1 当前 Hostra realization 使用独立 JSON-text WebSocket carrier，browser/Worker realization 使用 private MessagePort string units；两者共享 [Realm State v1](../15-contracts/realm-state-v1.md) validation/size/evidence semantics，物理 carrier不是第二套数据模型。合法的大型 logical result 使用 State 专用透明分帧 `loomrealm.realm-state.frame/1`，不会引入 transport-specific logical size limit。

---

## 4. Main ⇄ Subsystem Control

同一 current Control Connection：

```text
Subsystem Control + Frame / Call
```

由 one connection-wide dispatcher消费；same sender共享 Request ID namespace。

Control loss在无 shutdown intent时 Runtime-fatal；same-attempt无 reconnect。

Platform只建立 carrier，不改变 hello/Frame transaction semantics。

Realm State request MUST NOT 塞进 Runtime Control / Frame Call message namespace；`frame.call()` 继续只表达 control-flow composition。

Realm State request也 MUST NOT 携带或依赖 `frameId` / `activationId` / InputTarget 来建立 State mutation authority。

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
Realm State value / Realm State carrier material
```

Control loss使 Renderer失去 current Main authority，并 retire旧 Data connections；MUST NOT 因此 reset RealmStateAuthority。

---

## 6. Renderer Data Application Profile

当前 baseline：

```text
loomrealm.renderer-data/1
= Connection 1 + User Input 1 + Render Update 1
```

后续已设计的 Viewport retained role仍属于相同 Renderer↔Subsystem Data plane revision/profile演进。

Profile负责：

```text
child protocol version binding
JSON text mapping
single connection-wide Data dispatcher
input.* / render.* / profile child demux
fresh-carrier child baseline
```

Connection Core本身 zero application messages。

Realm State MUST NOT 成为 Renderer Data child protocol：它是 Session business-state authority，不是 current Renderer replica traffic。

---

## 7. Data Connection Authority

Main DataAuthority：

```text
S = subsystemKey
G = generation
P = dataProfile
```

Platform Broker依据 current `S/G/P` 建立物理两端。

```text
DataAuthority exists != carrier exists
carrier exists != current authority
```

current gate至少匹配：

```text
Session
current Renderer
S
G
P
```

同 generation/profile顺序 reconnect允许；profile change必须 fresh generation。

Realm State Record identity/version/revision MUST NOT 使用 Data generation/profile 作为业务 identity 或 OCC metadata。

---

## 8. Dynamic Data Provisioning

已经运行的 Subsystem Runtime需要后续取得 Data carrier。

```text
Main DataAuthority
→ Platform DataConnectionBroker
→ platform-local provisioning
→ role-local DataBinding
→ DataPlane installs current carrier
```

Hostra：Runner IPC/equivalent + endpoint/ticket + WebSocket。

PWA：Worker provisioning path + transferred MessagePort。

Provisioning material不进入 Runtime Control / Renderer Control / business payload。

RealmStateClient binding属于 Runtime-scoped Session capability bootstrap，不由 Renderer DataAuthority 动态授权，也不通过 Data Broker candidate/current机制建立。

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
change Main DataAuthority
reset Realm State
terminal RealmStateClient
```

Data current→retired；仍授权时可以 later fresh carrier。

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

Renderer Control 与 Data Connection无跨连接 total order。

因此：

```text
Interest first → inert until authority
Authority first → no send until Interest
```

不建立 cross-plane ACK/revision join/barrier。

Realm State revision不是 Input/Render cross-plane barrier。Subsystem业务可以读取 State 后更新其 local/Render authority，但 Realm State `commit()` 本身不消费 Frame/Activation mutation permit，core也不建立 `Realm State revision == Render revision` 之类全局序列。

---

## 11. Render Communication

Render Update方向：

```text
Subsystem → Renderer
```

fresh Data carrier：

```text
render.domains
→ fresh snapshots
→ patch/event
```

Data carrier loss只丢 replica transport baseline，不销毁 Subsystem authoritative Domain，也不影响 Realm State authority。

---

## 12. Realm State Plane

Logical protocol：

```text
loomrealm.realm-state/1
```

至少表达：

```text
current read
initial read
flat materialized Record discovery
Record-version conditional atomic commit
commit evidence
explicit-Record subscription baseline/change/terminal/close
client / authority terminal
Session-fatal report to Main/Session lifecycle owner
```

Authority semantics：

```text
one Session
→ one logical RealmStateAuthority
→ many Runtime-scoped RealmStateClient bindings
```

Realm State plane不建立：

```text
Frame / Activation / InputTarget mutation authority
Renderer identity/generation
DataAuthority profile
namespace ACL
Collection version
transaction ID / dedup journal
replay cursor
remote commit cancellation
Runtime/Session supervision policy in carrier/binding
```

### Validation / Trust Boundary

每个不可信 physical boundary的接收侧必须建立 trusted validated representation；同一 trusted internal path 不要求 SDK/binding/Authority重复执行等价 deep validation。

```text
untrusted input
→ validate key/value/request + limits
→ trusted detached/immutable representation
→ Authority short serialized step
```

### Mutation Evidence

```text
explicit invalid/limit/conflict/pre-admission terminal
    → known no-commit

successful response
    → known committed

dispatched mutation + definitive result lost
    → OUTCOME_UNKNOWN
```

Transport/adapter MUST NOT 自动 retry `OUTCOME_UNKNOWN`；否则可能 duplicate business mutation。

### Subscription Delivery / Callback Boundary

Subscription establishment 的 baseline capture + observer registration 属 Authority linearization；business listener invocation 不属于 Authority lane。

```text
Authority captures notification
→ leaves serialized lane
→ binding/SDK delivers callback
```

Listener sync throw / returned rejected thenable MUST 本地隔离/诊断；MUST NOT retroactively fail commit、make Authority fatal、terminate Session 或作为 backpressure ACK。

Listener MAY reenter RealmStateClient operations；binding MUST NOT 持有 Authority lock 调用 listener。

Subscription delivery MUST bounded。无法继续保证 ordered relevant changes时：

```text
MUST terminal overflow
MUST NOT silently drop
```

### Binding Loss / Recovery

```text
binding loss
→ old subscription terminal(binding-terminal)
→ affected old client/binding terminal according to profile
→ old identity not reattached
```

Binding loss本身 MUST NOT：

```text
fail Main Runtime
unwind Frame
terminate Session
reset RealmStateAuthority
change DataAuthority
```

如果 profile 支持后续恢复，必须建立 fresh logical binding，再 fresh subscribe + fresh baseline；不 replay history。

RealmStateAuthority fatal 则不同：它报告 Session-fatal condition，由 Main/Session lifecycle owner提交 terminal/unwind；Authority/carrier本身不直接拥有该 transition。

---

## 13. Content Plane

Content使用 HTTP/Fetch logical API，而不是 MessageCarrier协议。

```text
Desktop → localhost HTTP
PWA     → same-origin Fetch/SW
```

Content credential/bootstrap mechanism属于 Platform implementation；logical route/cache/error/integrity由 Content API定义。

Content 是 readonly definition authority；Realm State 是 mutable Session business-state authority。两者不得因都使用 `(namespace,key)` 风格命名而合并成一个 generic repository protocol。

---

## 14. Backpressure

所有 plane必须 bounded，但 policy由对应协议域负责：

```text
Renderer Control → latest full snapshot
User Input       → state coalesce + bounded event queue
Render Update    → protocol revision/commit rules
Realm State      → bounded request/subscription physical profile; commit lane never blocked by listener delivery
Content          → HTTP request/concurrency policy
```

Transport不得为了缓解 backpressure重试/duplicate application mutation。

Realm State subscription queue 已按 v1 profile 实现 64 events / 8 MiB 双重上限；Authority 与 carrier delivery 均不得以 unbounded queue 取代该约束。

---

## 15. No Cross-plane Global Order

不存在整个 LoomRealm Session 的单一 network sequence。

只依赖：

```text
per-connection/per-binding order
protocol-defined causal barriers
current authority conjunction
```

尤其：

```text
Runtime Control ↛ total order with Renderer Control
Renderer Control ↛ total order with Renderer Data
Input ↛ shared revision with Render
Realm State revision ↛ Main Control revision
Realm State revision ↛ Renderer Data revision
Content version ↛ Realm State revision
```

Realm State global revision只在该 RealmStateAuthority 内定义 successful commit order，不升级成整个 Session 的 universal clock。

---

## 16. Final Invariants

1. Control、Renderer Data、Realm State、Content是独立 logical communication planes；
2. current Control/Data message-oriented profiles继续统一 UTF-8 JSON text string；Realm State 使用独立 Hostra JSON-text 与 Worker MessagePort realization；
3. Carrier只描述已建立 pipe，不描述 application authority/establishment/Session supervision；
4. Runtime Control使用 one dispatcher + shared sender ID namespace；Realm State不复用该 dispatcher；
5. Renderer Control只复制 Main logical authority，不携 Realm State business values；
6. DataAuthority = S/G/dataProfile，不携物理 material，也不拥有 Realm State binding；
7. Renderer Data Profile只拥有 Renderer↔Subsystem connection-local application roles；
8. Data Broker/provisioning属于 Platform；Realm State binding不使用 Data candidate/current authority；
9. Data provisioning/loss不等于 Runtime failure/Frame unwind/Realm State reset；
10. Realm State operations不消费 Frame/Activation/InputTarget authority；
11. Realm State mutation使用 Record-version OCC + explicit evidence；transport不得 retry/duplicate；
12. Realm State listener delivery在 Authority lane外，callback failure局部隔离且允许安全 reentrancy；
13. Realm State subscription/binding loss只终止该 State binding，不自动改变 Main Runtime/Session；
14. RealmStateAuthority fatal只报告 Session-fatal condition，由 Main/Session lifecycle owner提交 terminal/unwind；
15. Control/Data/Realm State之间无跨连接 global total order；
16. User Input使用 authority×Interest×Producer交集；Realm State不创建 Input/Frame mutation permit；
17. Render/Data/Frame/Realm State lifecycles相互独立但都受 Session terminal上界约束；
18. Transport Adapter不拥有 application retry/recovery 或 Runtime/Session authority。
