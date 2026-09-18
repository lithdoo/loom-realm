# Renderer ⇄ Subsystem 协议分层

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Stabilizing  
> 主要定义：Renderer Control、DataAuthority、Renderer Data Profile、User Input、Render Update 与 Platform Broker 的分层关系  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[通信系统](./communication-system.md)  
> 正式化：[Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Data Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md)、[User Input v1](../15-contracts/user-input-v1.md)、[Render Update v1](../15-contracts/render-update-v1.md)、[Viewport State v1](../15-contracts/viewport-state-v1.md)  
> 最近复核：2026-08-26（2026-09-18 对齐 ADR0036 四-child 修订候选）

---

## 1. Layer Map

```text
Main
 │
 │ Renderer Control v1
 │   Runtime / Stack / Activation / InputTarget
 │   DataAuthority {S,G,dataProfile}
 ▼
Renderer
 │
 │ Platform DataConnectionBroker realizes current authority
 │
 ▼
Renderer Data Application Profile v1
├── Data Connection v1                 Frozen
├── User Input v1                      Frozen
├── Render Update v1                   Frozen
└── Viewport State v1                  Normative candidate
 │
 ▼
Subsystem
```

Main不转发 ordinary User Input/Render Update，也不持有/转发 Viewport size。共享 Data carrier只共享 transport/order，不合并 child-protocol authority。Profile v1 经[ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md) 批准首次发布前修订为四 child（新增 Renderer→Subsystem 只读 `viewport.state`）；修订候选的签署与实施状态以[冻结账本](../30-implementation/viewport-core-freeze-ledger.md)为准，旧三-child executable 与新四-child `/1` 不得混连。

---

## 2. Authority Separation

```text
Main
    Frame / Activation / InputTarget
    DataAuthority generation/profile

Subsystem
    Desired Interest[F]
    Render Domain authoritative business state

Renderer
    read-only Main mirror
    Input Producer availability
    Render replica/presentation

Platform
    physical Data endpoint/provisioning
```

核心约束：

```text
Control authority != Input Interest
Input Interest     != Producer availability
Data authority     != physical carrier
Data carrier       != ordinary input authority
Frame authority    != Render Domain authority
```

---

## 3. DataAuthority / Connection

Main发布：

```ts
interface RendererDataAuthorityV1 {
  subsystemKey: string;
  generation: number;
  dataProfile: string;
}
```

当前 Profile：

```text
dataProfile = loomrealm.renderer-data/1
```

它只授权 current Renderer为 `(S,G,P)` 建立/持有 Data Connection。

不携：

```text
endpoint
ticket
MessagePort
Interest
Input state
Render state
```

Data Connection cardinality：

```text
(Session, current Renderer, subsystemKey)
    → 0..1 current Data Connection
```

一个 carrier承载：

```text
0..N Frame/Input contexts
0..N Render Domains
```

不是 per-Frame/per-Activation/per-Domain connection。

---

## 4. Data Application Profile

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
+ Viewport State v1
```

Profile固定 shared carrier mechanics：

```text
one carrier unit = one UTF-8 JSON text string
common 1 MiB / depth-64 preflight
one connection-wide inbound reader / ordered dispatcher
one connection-wide outbound serialized writer
input.* / render.* / viewport.state exact direction + demux
fresh-carrier child baseline
terminal first-wins / no retry-replay-migration
```

Data Connection v1、User Input v1、Render Update v1 已 Frozen；Profile v1 的现行修订目标为 ADR0036 四-child 组合（含唯一 Renderer→Subsystem `viewport.state`），其候选/冻结/实施状态以[冻结账本](../30-implementation/viewport-core-freeze-ledger.md)为准，旧/新 `/1` 必须同一 build cohort，不得混连。后续实现只能证明这些 observable semantics；不得通过 package/Platform convenience 反向重新解释组成契约。

Profile改变必须 fresh Data generation。

---

## 5. User Input: Three Lifetimes

User Input不应被理解为一个单一“input session”。它有三个正交 lifetime：

```text
Desired Interest[F]
    Frame-scoped
    Subsystem-owned

Input Lease(F,A)
    Activation-scoped
    Main InputTarget-owned
    one-shot

Wire Publication State
    current Data carrier scoped
    Interest Registry + retained State + Event stream
```

因此：

```text
Frame suspension / fresh Activation
    MAY preserve Desired Interest[F]
    MUST NOT preserve old Activation State/Event

fresh Data carrier
    MAY preserve Desired Interest + current Activation
    MUST reset remote Interest/State/Event publication baseline
```

这个分层避免把 Frame config、authority epoch、transport epoch互相冒充。

---

## 6. User Input Effective Gate

对 `(S,F,A,C)`：

```text
Effective(F,A,C)
=
current Data(S,G,P)
∧ Main InputTarget == (S,F,A)
∧ mirrored/local F active/current A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

```text
InputTarget = public authority
Interest[F] = desired configuration
Producer    = Renderer-local capability availability
```

Interest/Producer只能缩小，不能创建 Main authority。

Renderer不得从：

```text
DOM focus
Render focus
component lifetime
carrier existence
cached Activation
```

生成 InputTarget。

Subsystem receiver仍做 local Frame/Activation/Interest gate，well-formed stale input只 drop。

---

## 7. Control / Data Cross-plane Ordering

Renderer Control 与 Data独立，无 global total order。

合法：

```text
Interest[F] before Control knows F
Control/InputTarget before Interest[F]
```

收敛：

```text
Interest only  → inert config
Authority only → no ordinary input
both           → recompute Effective
```

不增加：

```text
cross-plane ACK
revision join
barrier message
subscription handshake
```

Renderer不解释 call/push/pop；新 child等待自己的 Interest、old caller fresh resume可复用 retained Interest，都是状态交集自然结果。

---

## 8. User Input State / Event / Reset

```text
State
    self-contained
    latest wins
    coalescible before emitted

Event
    ordered
    transient
    no replay
    may drop before emitted

Reset(F,A)
    clears retained State for old lease
    does not modify Interest
    global State coalescing barrier
```

标准 Keyboard/Pointer/Gamepad如果 sibling State/Event同时 Effective：

```text
physical transition
→ post-transition State
→ Event
```

retained Event是 State coalescing barrier，避免高背压把因果 State重排到 Event之后。

same-carrier direct InputTarget `A1 → A2`：

```text
old lease ends
→ best-effort Reset(A1)
→ first A2 ordinary input
```

Control publication即使跳过中间 `null`，语义不变。

---

## 9. Canonical Standard Input

Frozen User Input v1不复制 Platform API object。

```text
Keyboard
    physical-control code set
    not text/IME

Pointer
    Renderer input-surface normalized fixed-point coordinates
    0 = left/top
    1,000,000 = right/bottom

Gamepad
    fixed standard logical layout
    fixed-point axes/buttons
```

Platform adapter：

```text
DOM / OS / native device facts
→ canonical User Input v1 payload
```

无法可靠映射到标准模型的能力使用 `x.*` custom channel或未来版本，不扩大标准 payload hidden semantics。

---

## 10. Fresh Data Carrier

old current carrier retired：

```text
User Input publication state ends
Render publication stream ends
```

fresh carrier：

### User Input

```text
remote Interest Registry = {}
retained State = {}
Event history = none
→ republish current Desired Interest
→ State fresh baseline
→ Event future-only
```

### Render

```text
first Render message = current Registry
→ fresh Snapshot each current Domain
→ ordinary commit/Event
```

### Viewport

```text
fresh RendererDataPeer publisher cursor = empty
→ republish participant latest valid size as baseline
→ Runtime retained size not cleared on Data loss
```

same-generation reconnect：

```text
Input publication baseline fresh
Render publication baseline fresh
Render wire Domain lifetime preserved
```

fresh generation：

```text
Input publication baseline fresh
Render wire universe fresh
```

Business Frame/InputListener/RenderDomain object不因 carrier替换自动重建。

---

## 11. Input Failure Boundary

User Input区分：

```text
protocol-invalid
    malformed/schema/channel/standard-payload/limit error
    → retire Data

well-formed authority-inapplicable
    stale Activation/not-interested/closed local Frame
    → drop

well-formed unknown/stale Interest
    → inert config

Producer loss/return
    → Reset/rebaseline or future-only transition
```

以上 Data/Input-plane failure均不直接等于 Runtime failure或 Frame unwind。

Malformed Event不能借“Event may drop”被宽容处理；stale合法 input也不能升级成 protocol fatal。

---

## 12. Render Independence

Render Update复制 Subsystem-owned authoritative presentation state。

```text
Frame close != Domain destroy
Activation change != Domain lifecycle
Input Interest != Render visibility
Data retire != authoritative business Domain destroy
```

Renderer replica通过 fresh baseline恢复；Data loss后的旧 Store最多是 stale presentation cache。

---

## 13. Platform Provisioning

Broker建立物理 carrier因平台不同：

```text
Hostra
    Broker → Runner provisioning IPC → Data WebSocket

PWA
    Broker → MessageChannel → transfer Ports
```

最终都产生 role-local：

```text
RendererDataBinding
SubsystemDataBinding
```

并安装匹配 `(S,G,P)` 的 current carrier。

Provisioning material不是 Data application payload，也不拥有 Input/Render authority。

---

## 14. Final Invariants

1. Main Control authority、Subsystem desired state、Renderer local producer/replica、Platform physical topology分离；
2. DataAuthority使用 `(S,G,dataProfile)`，physical carrier不拥有 generation/profile；
3. current Profile v1 = Frozen Connection1 + Frozen Input1 + Frozen Render1 + ADR0036 修订候选 Viewport State 1（签署状态见[冻结账本](../30-implementation/viewport-core-freeze-ledger.md)）；Profile composition/mechanics 的修订同样受账本治理；
4. Data connection per-Subsystem，不 per-Frame/Activation/Domain；
5. User Input = current Data × Main InputTarget × Interest[F] × Producer；
6. Desired Interest、Activation input lease、carrier publication state是三个独立 lifetime；
7. Control/Data无跨连接 total order；Interest-first/Authority-first都安全收敛；
8. fresh Activation可复用 Desired Interest但不复用 State/Event；
9. fresh Data carrier重新建立 Input/Render publication baseline；
10. Data Profile使用 one ordered reader/dispatcher + one serialized writer，但不创建 shared child revision/transaction；
11. standard stateful Input遵循 post-transition State-before-Event；
12. protocol-invalid Input/Render/Profile retire Data，well-formed stale child input/event按各自 contract drop-only；
13. Frame/Input/Data/Render authority与lifecycle相互不拥有彼此；
14. Platform provisioning只建立 physical carrier，不拥有 application authority。