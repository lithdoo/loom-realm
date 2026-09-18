# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving；Viewport 为待冻结、未实施的 Profile /1 修订目标  
> 主要定义：Control Plane、Renderer Data Plane、Content Plane、carrier/application mapping、authority/recovery 与 communication-facing Platform responsibilities  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)  
> 被以下文档细化：[渲染系统](./rendering-system.md)、[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 正式化：[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Viewport State v1](../15-contracts/viewport-state-v1.md)  
> 最近复核：2026-09-18；实际冻结以[账本](../30-implementation/viewport-core-freeze-ledger.md)为准。

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
            Viewport State v1（本次修订目标；尚未实施）

Content Plane
    Main/Renderer/Subsystem ⇄ Readonly Content Service
```

这些平面共享某些 transport primitives，但 authority/lifecycle/recovery 完全独立。Viewport 是现有 Data Plane 下的独立 child，不是第四个通信平面或 Input `x.*`。

---

## 2. MessageCarrier Boundary

所有 message-oriented Control/Data role implementation 消费：

```text
MessageCarrier
```

Carrier 只保证：

```text
message boundary
per-direction order
observable close/loss
production adapter avoids unbounded physical buffering（threshold/config 不属于 Foundation contract）
no adapter-created duplicate/retry
```

Carrier 不定义：

```text
connection identity
establishment
reconnect policy
Runtime failure
Data generation/profile
```

Viewport 不新增 MessageCarrier 方法或连接。

---

## 3. Unified Application Unit

当前 Runtime Control / Renderer Control / Renderer Data Profile 统一：

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

Structured Clone 只用于 Platform bootstrap/Port transfer；application payload 不允许出现第二套 structured-object model。Viewport 共用现有 Wire 与 Data Profile preflight，不引入专用编码。

---

## 4. Main ⇄ Subsystem Control

同一 current Control Connection：

```text
Subsystem Control + Frame / Call
```

由 one connection-wide dispatcher 消费；same sender 共享 Request ID namespace。

Control loss 在无 shutdown intent 时 Runtime-fatal；same-attempt 无 reconnect。

Platform 只建立 carrier，不改变 hello/Frame transaction semantics。

---

## 5. Main ⇄ Renderer Control

Renderer Control 只发布 Main committed logical authority：

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
Viewport width/height
Content credential
```

Control loss 使 Renderer 失去 current Main authority，并 retire 旧 Data connections。Main 不作为 Viewport size mirror。

---

## 6. Renderer Data Application Profile

本次明确批准首次发布前的修订目标：

```text
loomrealm.renderer-data/1
= Connection 1 + User Input 1 + Render Update 1 + Viewport State 1
```

Profile 负责：

```text
child protocol version binding
JSON text mapping
single connection-wide Data dispatcher
input.* / render.* / exact viewport.state demux
single connection-wide serialized writer
fresh-carrier child baseline
```

Connection Core 本身 zero application messages。旧 executable 仍为三个 child，旧/新 `/1` 不可混连，必须同一 build cohort 协调升级。Viewport source 注入 Renderer，size 经 Data peer 到 Subsystem `scope.viewport`，不经 InputTarget/Frame gate、不修改 Store/Projector。详细契约及冻结状态分别见 [Profile](../15-contracts/renderer-data-profile-v1.md) 与[账本](../30-implementation/viewport-core-freeze-ledger.md)。

---

## 7. Data Connection Authority

Main DataAuthority：

```text
S = subsystemKey
G = generation
P = dataProfile
```

Platform Broker 依据 current `S/G/P` 建立物理两端。

```text
DataAuthority exists != carrier exists
carrier exists != current authority
```

current gate 至少匹配：

```text
Session
current Renderer
S
G
P
```

同 generation/profile 顺序 reconnect 允许；真实 profile identity change 必须 fresh generation。同 identity 的本次预发布整体修订禁止旧/新 binary 混配，`S/G/P` 本身不提供 binary fingerprint。

---

## 8. Dynamic Provisioning

已经运行的 Subsystem Runtime 需要后续取得 Data carrier。

```text
Main DataAuthority
→ Platform DataConnectionBroker
→ platform-local provisioning
→ role-local DataBinding
→ DataPlane installs current carrier
```

Hostra：Runner IPC/equivalent + endpoint/ticket + WebSocket。

PWA：Worker provisioning path + transferred MessagePort。

Provisioning material 不进入 Runtime Control / Renderer Control / business payload。Viewport 不增加 provisioning API。

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

Data current→retired；仍授权时可以 later fresh carrier。Viewport Runtime 保留最后有效尺寸、fresh peer 独立重发 baseline；保留的尺寸不证明当前可绘制。

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

Renderer Control 与 Data Connection 无跨连接 total order。

因此：

```text
Interest first → inert until authority
Authority first → no send until Interest
```

不建立 cross-plane ACK/revision join/barrier。Viewport 独立于此 Input 公式，也不授予 Frame mutation permit。

---

## 11. Render Communication

Render Update 方向：

```text
Subsystem → Renderer
```

fresh Data carrier：

```text
render.domains
→ fresh snapshots
→ patch/event
```

Data carrier loss 只丢 replica transport baseline，不销毁 Subsystem authoritative Domain。Viewport 不改变 Render update/Store/Projector。

---

## 12. Content Plane

Content 使用 HTTP/Fetch logical API，而不是 MessageCarrier 协议。

```text
Desktop → localhost HTTP
PWA     → same-origin Fetch/SW
```

Content credential/bootstrap mechanism 属于 Platform implementation；logical route/cache/error/integrity 由 Content API 定义。

---

## 13. Backpressure

所有 plane 必须 bounded，但 policy 由对应协议域负责：

```text
Renderer Control → latest full snapshot
User Input       → state coalesce + bounded event queue
Render Update    → protocol revision/commit rules
Viewport State   → per peer one inFlight + one latest pending before shared writer
Content          → HTTP request/concurrency policy
```

Viewport A→B→A、终止/重连的唯一算法见 [Viewport State v1 §4](../15-contracts/viewport-state-v1.md)；现有 writer 容量 1024 是实现事实，不是通用协议阈值。

Transport 不得为了缓解 backpressure 重试/duplicate application mutation。

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
Input ↛ shared revision with Render/Viewport
```

Viewport 不创建跨 child baseline barrier。

---

## 15. Final Invariants

1. Control/Data/Content 是独立通信平面；
2. current message-oriented profiles 统一 UTF-8 JSON text string；
3. Carrier 只描述已建立 pipe，不描述 authority/establishment；
4. Runtime Control 使用 one dispatcher + shared sender ID namespace；
5. Renderer Control 只复制 logical authority，不携 Viewport size；
6. DataAuthority = S/G/dataProfile，不携物理 material；
7. Renderer Data Profile v1 本次修订目标静态绑定 Connection/Input/Render/Viewport v1，旧 executable 尚未实现；
8. Data Broker/provisioning 属于 Platform；
9. Data provisioning/loss 不等于 Runtime failure；
10. Control/Data 无跨连接 total order；
11. User Input 使用 authority×Interest×Producer 交集，Viewport 不经该交集；
12. Render/Data/Frame lifecycles 相互独立；
13. Transport Adapter 不拥有 application retry/recovery；旧/新 `/1` binary 不得混连。