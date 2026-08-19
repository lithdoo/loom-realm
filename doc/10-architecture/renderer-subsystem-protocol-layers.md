# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Active Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Subsystem 数据面职责、Frame-scoped User Input Interest，以及它们对 Main committed authority / Platform Data Broker 的依赖  
> 依赖：[平台组合系统](./platform-composition-system.md)、[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[渲染系统](./rendering-system.md)、[User Input v1](../15-contracts/user-input-v1.md)、[Render Update v1](../15-contracts/render-update-v1.md)  
> 最近复核：2026-08-19

本文只描述 Renderer ⇄ Subsystem 数据面的概念分层；正式 wire/limits/conformance 以 `15-contracts` 为准。

## 1. 基本拓扑

每个 Subsystem Runtime 与 current Renderer 之间最多一条 current Data Connection：

```text
(Session, current Renderer, subsystemKey)
    → 0..1 current Data Connection
```

连接粒度 = Subsystem，不是 Frame/Activation/Domain/Node。一条 current Data Connection MAY 承载：

```text
0..N Frame/Input contexts
0..N Render Domains
```

actual carrier 由 system Platform Data Connection Broker 建立；Desktop 可使用 authenticated localhost carrier，PWA 可使用 MessagePort。

---

## 2. 三个数据协议域

```text
Renderer ⇄ Subsystem Runtime

Data Connection v1
    Session / Renderer / subsystemKey / generation
    current / retired

User Input v1
    Subsystem → Renderer
        full Frame Interest Registry snapshot
    Renderer → Subsystem
        State / Event / Reset

Render Update v1
    Subsystem → Renderer
        Domain Registry / Snapshot / Patch / Event
```

三个域共享物理 carrier，但 authority、identity、ordering、recovery、backpressure 与 limits 各自独立。

---

## 3. Control / Data / Platform 分离

```text
Main ⇄ Subsystem Control
    Subsystem Control v1
    Frame / Call v1

Main ⇄ Renderer Control
    committed Runtime / Stack / Activation / InputTarget / DataAuthority

Renderer ⇄ Subsystem Data
    Data Connection
    User Input
    Render Update

Platform
    establishes physical Control/Data carriers
```

禁止通过 Data Plane：

```text
发送 Frame RPC
重试 Frame operation
确认 ambiguous Frame commit
计算 unwind root
恢复 Frame authority
```

Platform 也不得从 endpoint/Port 推导 Main authority。

---

## 4. Data Connection

Authority 来自 Main：

```text
DataAuthority(subsystemKey, generation, connectionProfile)
```

Platform Data Connection Broker 据此建立 matching Renderer / Subsystem endpoints。

Connection identity：

```text
Session
+ current Renderer participant
+ subsystemKey
+ generation
```

Lifecycle：

```text
current → retired
retired terminal
```

Connection Core 不负责 endpoint/ticket/Port discovery、Frame lifecycle、Render Domain lifecycle 或 child-protocol payload。

同 generation 仍授权时，可在旧 carrier retired 后建立 fresh carrier；Data reconnect 只恢复数据面，不能取消 Runtime failure 或 Frame unwind。

---

## 5. User Input Authority

Main 仍是 ordinary input authority：

```text
Main
    InputTarget / Activation authority

Renderer Core
    trusted sender-side enforcement point

Subsystem
    local Frame/Activation + local Frame Interest validation
```

User Input wire carrying `frameId + activationId` 不能独立证明 Main current `InputTarget`；Renderer Core sender gate 是 v1 trust boundary 的一部分。

Renderer 不得根据 DOM focus、Render focus、Interest 或 local presentation state 自行生成 InputTarget。

---

## 6. Frame Interest Registry

User Input Interest 的**配置 scope = Frame**，publication scope = current Data Connection。

概念状态：

```text
InterestRegistry = Map<frameId, Set<channel>>
```

Subsystem 发布整个 registry 的 full replacement snapshot：

```text
F1 → keyboard.event, pointer.state
F2 → gamepad.event, x.battle.action.event
```

规则：

```text
no activationId in Interest
no subscribe/unsubscribe patch
no ACK
no Interest revision
no wildcard
frame absence = Interest[F] empty
fresh Data Connection registry = empty
```

Interest 是 configuration，不是 authority；它只能缩小输入面，不能创建/扩展 Main InputTarget authority。

---

## 7. Effective Input

对 Subsystem `S`、Frame `F`、Activation `A`、Channel `C`：

```text
Effective(F,A,C)
=
current matching Data Connection for S
∧ Main current InputTarget == (S,F,A)
∧ mirrored Frame F active/current Activation A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

只有 Effective Channel 产生 ordinary State/Event。

Renderer 不解释：

```text
call / return / push / pop / caller / child / unwind
```

只对 current committed facts 做 conjunction。

---

## 8. Control / Interest Ordering

Renderer Control 与 Data Connection 没有 cross-connection total order。

### Interest first

```text
Interest snapshot arrives
→ store full registry atomically
→ unknown/non-authoritative Frame entries inert
→ later Control authority may make matching entry effective
```

### Authority first

```text
InputTarget(F,A) arrives
→ Interest[F] absent
→ no ordinary input
→ later Interest snapshot may make it effective
```

不需要 cross-plane ACK/barrier/sequence/revision join。

stale Interest for closed/unknown Frame 不能产生 authority；frameId never reused，后续 full registry snapshot 自然收敛。

---

## 9. Frame / Activation Input Lifetime

```text
Frame = input configuration lifetime
Activation = ordinary input authority epoch
```

Frame suspension 可以保留 `Interest[F]`；fresh Activation 可以继续使用同一 Frame Interest configuration。

但是：

```text
old Activation Input State/Event
    MUST NOT cross into fresh Activation
```

例如 caller F1/A1 suspend 后，F1 以 fresh A3 resume：

```text
Interest[F1] may already exist
→ no new Interest publication required if same Data carrier survived
→ .state establishes fresh current baseline for A3
→ .event future-only
```

new child F2/A2 如果 `Interest[F2]` 不存在，则没有 ordinary input，直到 registry 包含 F2。

fresh Data Connection 是例外：old registry 不继承，所有 live Frame Interest 需要重新由 Subsystem 发布 current full snapshot。

---

## 10. State / Event / Reset

```text
.state
    self-contained current snapshot
    latest wins / may coalesce
    every Effective false→true transition establishes fresh baseline

.event
    ordered transient
    no history/reconnect/Activation replay

reset
    clears retained input State for frameId + activationId
    does not change Interest[F]
```

典型 `.state` false→true 原因：

```text
Interest added
InputTarget switch
fresh Activation
fresh Data Connection
Producer restore
```

InputTarget revoke/replace 立即结束 old ordinary authority；Activation revoked/replaced 与 Frame leaves active 都是 implicit input-state teardown boundary。

---

## 11. Subsystem Receive Gate

Subsystem 不能只信任到达的 input message。

收到 `(frameId, activationId, channel)` 时至少验证：

```text
message belongs to current Data Connection
local frameId exists
local Frame active
activationId == current local Activation
channel ∈ local Interest[frameId]
local mutation gate allows delivery
```

否则 drop，不把 stale/in-flight ordinary input 解释成 Runtime failure。

---

## 12. Render Domain Model

```text
Subsystem Runtime
└── 0..N Render Domains
    ├── domainId
    ├── zIndex
    └── 0..N ordered roots
```

Domain 是 Render lifecycle / atomic authoritative-state / global composition unit。

Render Domain 与 Frame/Input Interest lifecycle 独立：

```text
Frame suspend != Domain hidden
Frame close != Domain destroy
Activation replacement != Domain lifecycle
```

---

## 13. Render Update / Recovery

```text
render.domains
    full Domain Registry

render.snapshot(revision)
    full baseline / commit

render.patch(baseRevision, revision)
    exact R→R+1 atomic commit

render.event
    transient presentation impulse
```

fresh Data Connection：

```text
render.domains(current Registry)
→ fresh Snapshot every current Domain
→ Patch/Event
```

无 ACK/NACK、Patch history replay、resume cursor 或 Renderer→Subsystem resync RPC。

Data retire不销毁 authoritative Render Domain。

---

## 14. Presentation Boundary

Render Core 只传 plain data；`tag` 是 opaque string。

协议不定义 Component Registry/Factory、code loading、DOM/Canvas/WebGL mapping 或 per-tag schema。

Presentation object 的存在不产生 ordinary input authority；Presentation MAY 提供 `x.*` producer，但仍通过 User Input conjunction gate。

---

## 15. Frame Failure Boundary

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Main 按 Frozen Frame v1 计算 failure unwind。Renderer/Data/Platform 不得 replay Frame operation、推断 unwind root、恢复旧 Activation 或覆盖 accepted outcome。

---

## 16. Current Layering

```text
Renderer ⇄ Subsystem
├── Data Connection v1
├── User Input v1
│   └── Frame Interest Registry
└── Render Update v1

System Platform Composition
└── establishes physical Data carrier

Renderer presentation implementation
└── implementation-owned; no LoomRealm wire/Profile
```

核心不变量：

- Data Connection 是 per-Subsystem，不是 per-Frame；
- Frame-scoped Interest 不改变 Data Connection cardinality；
- Interest 可跨 Activation configuration lifetime，Input State/Event 不可跨 Activation；
- Renderer 不解释 stack operation history；
- Control/Data arrival order 任意但 conjunction 必须安全收敛；
- User Input / Render Update sibling domains 不拥有彼此 lifecycle；
- Platform 只建立 carrier，不成为 Data/Input/Render authority。
