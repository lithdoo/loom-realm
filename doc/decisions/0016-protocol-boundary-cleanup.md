# ADR 0016：协议边界清理与 Data Authority 方向

> 状态：Accepted；由 [ADR 0017](./0017-system-level-platform-composition.md) 扩展 Platform boundary，并由 [ADR 0018](./0018-preimplementation-v1-closure.md) 收口 current v1 字段/Profile/Runner 关系  
> 日期：2026-08-08  
> 最近复核：2026-08-19  
> 影响范围：Subsystem Control、Renderer Control、Renderer Data、Content、Frame、Render/Input boundary

## 背景

Frame / Call v1形成 Main-owned Frame/Activation authority 后，Renderer/Data/Content设计需要回答：

```text
Runtime ready 与 Data physical provisioning 是否耦合？
Renderer Control 应发布 logical authority还是 endpoint/credential？
Data carrier loss/replace如何和 Runtime/Frame failure分离？
User Input / Render sharing one carrier时如何保持独立 semantics？
哪些 Host/Platform details真的需要标准化成 application Profile？
```

原则：

> **按 authority/lifecycle 拆协议；只标准化独立实现若不共享就会无法互操作或破坏安全的事实。**

```text
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

---

## 决策 1：Subsystem Control 只管理 Runtime Lifecycle

`subsystem.status({state:"ready"})`：

```json
{"state":"ready"}
```

只表示 Runtime required initialization完成并承担 Runtime Control Profile角色。

不携/不暗示：

```text
Renderer Data endpoint
Data ticket/MessagePort
Data generation/dataProfile
Platform provisioning offer
Frame / Render / InputTarget
```

Data physical provisioning完全独立。

---

## 决策 2：Renderer Control 只复制 Main Logical Authority

Renderer Control Snapshot包含：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority {
  subsystemKey,
  generation,
  dataProfile
}
```

当前：

```text
dataProfile = loomrealm.renderer-data/1
```

不包含：

```text
WebSocket URL
MessagePort
bearer ticket
Platform provisioning handle
Interest Registry
Render State
```

旧字段名 `connectionProfile` 已由 ADR 0018直接从 current v1删除；`dataProfile` 明确表示完整 Data application stack，而不是 connection technology。

---

## 决策 3：Generation + Data Profile Model

Main是 DataAuthority唯一公共 authority。

```text
DataAuthority(S,G,P)
```

含义：current Renderer participant被允许为 Subsystem `S` 持有 generation `G`、Data Profile `P` 的 current Data Connection。

`generation`：

```text
positive safe integer
Subsystem-scoped within Session
never reused
strictly increases on authority replacement
```

`dataProfile`：

```text
complete Data application stack identity
immutable within one generation
not transport
not credential
```

Profile改变必须 fresh generation。

---

## 决策 4：Renderer Data Application Profile v1

Current Profile：

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

它冻结：

```text
child protocol version binding
one UTF-8 JSON text carrier unit
one connection-wide Data dispatcher
input.* / render.* demux
fresh-carrier child baseline
```

Profile不增加 Data hello/RPC/ACK。

这解决了“Connection/Input/Render以后如何版本组合”的问题，而不把 Platform bootstrap wire误升成 application protocol。

---

## 决策 5：Renderer Control 是 DataAuthority 的父级 Authority

Renderer失去 current Main Control authority：

```text
stop ordinary input
invalidate InputTarget
invalidate DataAuthority
retire old Renderer Data Connections
fresh Renderer Control hello
obtain current full Snapshot
Platform re-establishes authorized Data carriers
```

Renderer具有 Control mirror，因此可独立校验 `RendererDataBinding`给出的 S/G/P是否匹配 current authority。

---

## 决策 6：Subsystem 不复制第二份 Main DataAuthority

Subsystem没有 Renderer Control mirror，也不增加新的 Main→Subsystem DataAuthority application protocol。

System Platform DataConnectionBroker负责在 Subsystem side产出：

```text
SubsystemDataBinding
    → already authority-bound {generation,dataProfile,carrier}
```

Platform必须在安装/交付前证明：

```text
current Session
current Renderer
own subsystemKey
current generation
current dataProfile
```

Subsystem SDK仍验证 local owner、shape、current carrier replacement、staleness等 local invariants，但不通过第二份 Main authority source重复签发 DataAuthority。

这样保持 Main单一 authority，而不是为了“多验证一次”制造双权威。

---

## 决策 7：Data Physical Provisioning 属于 Platform

典型：

```text
Hostra
    DataConnectionBroker
    → Runner provisioning IPC
    → endpoint/ticket
    → Data WebSocket

PWA
    DataConnectionBroker
    → Worker provisioning path
    → transferred MessagePort
```

这些 material/schema/API默认属于 Platform implementation。

Provisioning：

```text
!= Runtime Control
!= Renderer Control
!= Renderer Data application payload
!= business API
```

Provisioning/Data establishment failure本身：

```text
!= Runtime failure
!= Frame unwind
!= DataAuthority mutation
```

仍授权时可以 later fresh establishment。

---

## 决策 8：Data Connection Lifecycle 独立

```text
current → retired
```

每 Subsystem / current Renderer最多 one current Data Connection。

同一 `S/G/P`允许：

```text
carrier A current
→ retired/lost
→ carrier B fresh current
```

这不是新的 generation，也不是 Runtime/Frame recovery。

```text
Frame close != Data retire
Data loss != Runtime failure
Data reconnect != Frame recovery
Data retire != Render Domain destroy
```

---

## 决策 9：Renderer Control Full Snapshot

Renderer Control v1继续：

```text
full Authority Snapshot
monotonic Session-local revision
revision gap allowed
latest-state coalescing
no historical replay
reconnect = current snapshot
```

不建立 delta/resync log作为另一 authority source。

---

## 决策 10：Frame Suspend 语义留在 Frame v1

```text
child-call suspension
    → corresponding Child terminal Outcome
    → frame.resume(...freshActivation)

administrative frame.suspend
    → no generic normal resume
    → later close/failure cleanup
```

不增加另一个 suspend clarification protocol。

---

## 决策 11：Content API 与 Platform Credential Plumbing 分离

Content API定义 logical readonly route/cache/error/integrity/request-authorization semantics。

Desktop bearer issuance/injection/rotation与 PWA same-origin Service Worker authority属于 Platform implementation。

```text
no Content Access Bootstrap application Profile
no credential in Frame/Render/business payload
```

只有真实第三方 interoperable credential-delivery wire出现后才重新评估。

---

## 决策 12：Render `tag` / Presentation 不形成 Component Profile

Render Core复制：

```text
key / tag / attrs / data / children
```

`tag` opaque。

不定义：

```text
Component Registry/Factory
known/unknown tag
component module loading
per-tag schema
DOM/Canvas/WebGL mapping
```

这些是 Renderer/product implementation。

---

## 决策 13：Standard Input Payload 属于 User Input v1

keyboard/pointer/gamepad canonical payload若影响双方 wire解释，就直接冻结在 User Input v1。

DOM/OS/device adapter、poll cadence、lookup table不形成 Standard Input Mapping Profile。

---

## 决策 14：不要为 Implementation Parameters 制造 Profile

默认不单独协议化：

```text
HTTP Range support
Event queue concrete capacity/drop policy
Content deployment size/concurrency/rate/timeouts
Patch-vs-Snapshot heuristic
cache/index/scheduler size
Runner provisioning internal payload
Host token/ticket/MessagePort delivery shape
```

只冻结 correctness所需的 observable semantics和 bounds。

---

## 决策 15：Current Message-oriented Profiles 统一 JSON Text

依据 ADR 0018，current Runtime Control / Renderer Control / Renderer Data Profiles统一：

```text
one carrier application unit
= one UTF-8 JSON text string
```

```text
WebSocket   text message
MessagePort postMessage(string)
```

Structured Clone只用于 Platform bootstrap/Port transfer。

Foundation仍把 carrier string视为 opaque；JSON semantics在 wire/Profile层。

---

## 当前协议主线

```text
Game Package v1
Desktop Node.js Launcher / Subsystem Runner Profile v1
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1 + Conformance
Main ⇄ Renderer Control v1
Renderer Data Application Profile v1
Renderer ⇄ Subsystem Data Connection v1
User Input v1
Render Update v1
Content API v1
```

其中 Node Runner Profile定义真实 Desktop Runtime integration boundary；Runtime/Data Application Profiles定义真正的 protocol composition/version binding，而不是单纯 Host glue。

---

## 结果

每个正式边界只回答自己的问题：

```text
Game Package       → 哪些 business Subsystem/module？
Node Runner Profile→ Desktop 如何受控加载该 module并监督 Runtime？
Subsystem Control  → Runtime是谁、是否ready、如何停止？
Frame / Call       → Frame/Activation如何提交与失败收敛？
Renderer Control   → Main当前公开 authority是什么？
Data Profile       → current Data carrier运行哪套 child stack？
Data Connection    → carrier是否 current/合法？
User Input         → ordinary input如何受 authority/Interest约束？
Render Update      → authoritative Render如何复制？
Content API        → logical readonly content如何读取？
Platform           → physical Runner/carrier/provisioning如何实现？
```

最终目标：

> **单一 authority、闭合 lifecycle、最小 wire surface、明确 version composition，并且只标准化真正影响 interoperability 的事实。**