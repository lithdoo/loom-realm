# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Control Plane、Renderer Data Plane、Content Plane、carrier/application mapping、authority/recovery 与 communication-facing Platform responsibilities  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)  
> 被以下文档细化：[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：`doc/15-contracts` 对应协议/Profile  
> 最近复核：2026-08-19

---

## 1. 三类通信平面

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

Content Plane
    Main/Renderer/Subsystem ⇄ Readonly Content Service
```

这些平面共享某些 transport primitives，但 authority/lifecycle/recovery完全独立。

---

## 2. MessageCarrier Boundary

所有 message-oriented Control/Data role implementation消费：

```text
MessageCarrier<string>
```

Carrier只保证：

```text
message boundary
per-direction order
observable close/loss
bounded buffering
no adapter-created duplicate/retry
```

Carrier不定义：

```text
connection identity
establishment
reconnect policy
Runtime failure
Data generation/profile
```

---

## 3. Unified Application Unit

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

Structured Clone只用于 Platform bootstrap/Port transfer；application payload不允许出现第二套 structured-object model。

---

## 4. Main ⇄ Subsystem Control

同一 current Control Connection：

```text
Subsystem Control + Frame / Call
```

由 one connection-wide dispatcher消费；same sender共享 Request ID namespace。

Control loss在无 shutdown intent时 Runtime-fatal；same-attempt无 reconnect。

Platform只建立 carrier，不改变 hello/Frame transaction semantics。

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
```

Control loss使 Renderer失去 current Main authority，并 retire旧 Data connections。

---

## 6. Renderer Data Application Profile

当前：

```text
loomrealm.renderer-data/1
= Connection 1 + User Input 1 + Render Update 1
```

Profile负责：

```text
child protocol version binding
JSON text mapping
single connection-wide Data dispatcher
input.* / render.* demux
fresh-carrier child baseline
```

Connection Core本身 zero application messages。

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

---

## 8. Dynamic Provisioning

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

Data carrier loss只丢 replica transport baseline，不销毁 Subsystem authoritative Domain。

---

## 12. Content Plane

Content使用 HTTP/Fetch logical API，而不是 MessageCarrier协议。

```text
Desktop → localhost HTTP
PWA     → same-origin Fetch/SW
```

Content credential/bootstrap mechanism属于 Platform implementation；logical route/cache/error/integrity由 Content API定义。

---

## 13. Backpressure

所有 plane必须 bounded，但 policy由对应协议域负责：

```text
Renderer Control → latest full snapshot
User Input       → state coalesce + bounded event queue
Render Update    → protocol revision/commit rules
Content          → HTTP request/concurrency policy
```

Transport不得为了缓解 backpressure重试/duplicate application mutation。

---

## 14. No Cross-plane Global Order

不存在整个 LoomRealm Session 的单一 network sequence。

只依赖：

```text
per-connection per-direction order
protocol-defined causal barriers
current authority conjunction
```

尤其：

```text
Runtime Control ↛ total order with Renderer Control
Renderer Control ↛ total order with Data
Input ↛ shared revision with Render
```

---

## 15. Final Invariants

1. Control/Data/Content是独立通信平面；
2. current message-oriented profiles统一 UTF-8 JSON text string；
3. Carrier只描述已建立 pipe，不描述 authority/establishment；
4. Runtime Control使用 one dispatcher + shared sender ID namespace；
5. Renderer Control只复制 logical authority；
6. DataAuthority = S/G/dataProfile，不携物理 material；
7. Renderer Data Profile v1静态绑定 Connection/Input/Render v1；
8. Data Broker/provisioning属于 Platform；
9. Data provisioning/loss不等于 Runtime failure；
10. Control/Data无跨连接 total order；
11. User Input使用 authority×Interest×Producer交集；
12. Render/Data/Frame lifecycles相互独立；
13. Transport Adapter不拥有 application retry/recovery。