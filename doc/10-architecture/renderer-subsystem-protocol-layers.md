# Renderer ⇄ Subsystem 协议分层

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：current v1 Frozen；Viewport/Profile v2 Candidate for Freeze  
> 主要定义：Renderer Control、DataAuthority、Renderer Data Profile v1/v2、User Input、Render Update、Viewport State 与 Platform Broker 的分层关系  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[通信系统](./communication-system.md)、[Viewport Capability](./viewport-capability.md)  
> 正式化：[Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Renderer Data Profile v2](../15-contracts/renderer-data-profile-v2.md)、[Data Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md)、[User Input v1](../15-contracts/user-input-v1.md)、[Render Update v1](../15-contracts/render-update-v1.md)、[Viewport State v1](../15-contracts/viewport-state-v1.md)  
> 决策：[ADR 0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> 最近复核：2026-09-16

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
Renderer Data Application Profile
├── /1 Frozen
│   ├── Data Connection v1   Frozen
│   ├── User Input v1        Frozen
│   └── Render Update v1     Frozen
│
└── /2 Candidate
    ├── Data Connection v1   Frozen
    ├── User Input v1        Frozen
    ├── Render Update v1     Frozen
    └── Viewport State v1    Candidate
 │
 ▼
Subsystem
```

Main不转发 ordinary User Input、Viewport State 或 Render Update。共享 Data carrier只共享 transport/order/terminal，不合并 child-protocol authority。

---

## 2. Authority Separation

```text
Main
    Frame / Activation / InputTarget
    DataAuthority generation/profile

Subsystem
    Desired Interest[F]
    retained viewport observation
    Render Domain authoritative business state

Renderer
    read-only Main mirror
    Input Producer availability
    presentation-surface viewport observation
    Render replica/presentation

Platform
    physical Data endpoint/provisioning
    trusted physical viewport event source realization
```

核心约束：

```text
Control authority != Input Interest
Input Interest     != Producer availability
Viewport state     != Input authority
Data authority     != physical carrier
Data carrier       != ordinary input authority
Frame authority    != Render Domain authority
Viewport observation != Render/DOM desired-state authority
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

Compatibility/current target：

```text
loomrealm.renderer-data/1  Frozen compatibility
loomrealm.renderer-data/2  candidate target subject
```

DataAuthority只授权 current Renderer为 `(S,G,P)` 建立/持有 Data Connection，不携 endpoint/ticket/MessagePort/Interest/Input/Viewport/Render state。

Data Connection cardinality：

```text
(Session, current Renderer, subsystemKey)
    → 0..1 current Data Connection
```

一个 carrier承载多个 Frame/Input contexts 与 Render Domains，并在 v2 中额外承载一个 Subsystem-scoped current viewport state stream；它仍不是 per-Frame/per-Activation/per-Domain connection。

Profile改变必须 fresh Data generation。

---

## 4. Data Application Profiles

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1

loomrealm.renderer-data/2
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
exact direction + namespace demux
fresh-carrier child baseline
terminal first-wins / no retry-replay-migration
```

Profile v1保持 Frozen。Profile v2 是显式 successor candidate；不得把 `viewport.state` 当 v1 optional extension。

目标 implementation subject 的 canonical Main policy选择 `/2`；当前 slice不引入 carrier negotiation、Game Entry requested profile、per-Subsystem capability flags或自动 downgrade。

---

## 5. User Input: Three Lifetimes

User Input有三个正交 lifetime：

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

因此 fresh Activation可复用 Desired Interest但不可复用 old State/Event；fresh Data carrier重新建立 remote publication baseline。

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

Interest/Producer只能缩小，不能创建 Main authority。Renderer不得从 DOM focus、Render focus、component lifetime、carrier existence或 cached Activation生成 InputTarget。

Subsystem receiver仍做 local Frame/Activation/Interest gate；well-formed stale input只 drop。

---

## 7. Viewport State: Independent Runtime Observation

Viewport State不是 User Input 的第四种 producer。

```text
Viewport object lifetime
    Subsystem Runtime-scoped

Viewport author retained value
    last successfully accepted observation

Viewport wire publication baseline
    current Data carrier-scoped
```

因此：

```text
Frame suspend / InputTarget loss
    MUST NOT block viewport convergence

Data carrier loss
    MUST NOT clear retained author viewport

fresh carrier
    fresh viewport wire baseline when legal sample available
```

Viewport payload只含 logical CSS `width/height`；DPR/focus/visibility/screen/DOMRect不进入 v1。

Main只选择 Data profile/currentness，不拥有 width/height。Business Runtime决定 viewport如何影响 camera/projection/layout policy。

---

## 8. Control / Data Cross-plane Ordering

Renderer Control 与 Data独立，无 global total order。

合法：

```text
Interest[F] before Control knows F
Control/InputTarget before Interest[F]
Viewport state before/after Render baseline
```

收敛由各 child retained/currentness规则完成，不增加：

```text
cross-plane ACK
revision join
barrier message
subscription handshake
atomic Input+Viewport+Render super-snapshot
```

---

## 9. User Input State / Event / Reset

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

标准 Keyboard/Pointer/Gamepad sibling State/Event同时 Effective时，physical transition保持 post-transition State → Event。

same-carrier direct InputTarget `A1 → A2`：old lease ends → best-effort Reset(A1) → first A2 ordinary input。

---

## 10. Canonical Standard Input

Frozen User Input v1不复制 Platform API object。

```text
Keyboard  physical-control code set, not text/IME
Pointer   normalized fixed-point Renderer input-surface coordinates
Gamepad   fixed standard logical layout
```

无法可靠映射到标准模型的能力使用 `x.*` custom channel或未来版本。Viewport已证明具有不同 lifetime，因此不得再以 custom input channel承载。

---

## 11. Fresh Data Carrier

old current carrier retired时，各 child wire publication baseline结束。

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

### Viewport (/2 only)

```text
Renderer has legal current sample
→ promptly enqueue fresh viewport.state baseline

no legal sample yet
→ no synthetic null/0/default message
→ first legal sample publishes later
```

Subsystem `scope.viewport.current` retains the last accepted observation across carrier loss; equal fresh baseline need not create an author callback。

same-generation reconnect：Input/Render/Viewport wire baselines fresh；Render wire Domain lifetime preserved；business InputListener/RenderDomain/Viewport capability objects不因 carrier替换自动重建。

---

## 12. Failure Boundaries

User Input区分 protocol-invalid、well-formed authority-inapplicable、unknown/stale Interest与 Producer loss/return；既有规则不变。

Viewport：

```text
malformed viewport.state
    → child protocol fatal
    → retire Data carrier

well-formed same value
    → accept / no callback required

listener throw/rejection
    → local containment
    → not Data reader flow control
```

任一 Data child protocol fatal都不直接等于 Runtime failure或 Frame unwind。

---

## 13. Render Independence

Render Update复制 Subsystem-owned authoritative presentation state。

```text
Frame close != Domain destroy
Activation change != Domain lifecycle
Input Interest != Render visibility
Viewport observation != Render commit
Data retire != authoritative business Domain destroy
```

Viewport变化只有在 business Runtime据其 policy提交新 Render state后才影响 Store/DOM；Core viewport receiver不直接修改 presentation。

---

## 14. Platform Provisioning / Physical Viewport

Broker建立物理 Data carrier因平台不同：

```text
Hostra
    Broker → Runner provisioning IPC → Data WebSocket

PWA
    Broker → MessageChannel → transfer Ports
```

最终产生 role-local `RendererDataBinding` / `SubsystemDataBinding` 并安装匹配 `(S,G,P)` 的 carrier。

Viewport physical source同样可因平台不同：Desktop可观察 Renderer Window CSS size；PWA可使用对应浏览器 surface source。Physical source不拥有 Main/Data/Frame/Render authority，也不向 business暴露 DOM object。

---

## 15. Final Invariants

1. Main Control authority、Subsystem desired/retained state、Renderer local observation/replica、Platform physical topology分离；
2. DataAuthority使用 `(S,G,dataProfile)`，physical carrier不拥有 generation/profile；
3. `/1` = Frozen Connection1 + Input1 + Render1；`/2` = candidate `/1` + Viewport1；
4. Profile replacement需要 fresh generation；
5. Data connection per-Subsystem，不 per-Frame/Activation/Domain；
6. User Input = current Data × Main InputTarget × Interest[F] × Producer；
7. Viewport State独立于 InputTarget/Interest/Producer，author capability Runtime-scoped；
8. Control/Data无跨连接 total order；各 child独立收敛；
9. fresh Data carrier重新建立所有 Profile child publication baseline；
10. shared reader/writer/order/terminal不创建 shared child revision/transaction；
11. protocol-invalid child traffic retire Data，well-formed stale input按既有 contract drop；
12. carrier loss不清空 retained viewport observation，也不销毁 business RenderDomain；
13. Platform provisioning/source只提供 physical capability，不拥有 application authority；
14. 当前 slice不建立 generic Environment service locator或 profile negotiation framework。
