# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Archived Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Subsystem 数据面职责及其对 Main committed control/recovery state 的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[渲染系统](./rendering-system.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)、[User Input Protocol v1](../15-contracts/user-input-v1.md)  
> 最近复核：2026-08-08

本文只描述 Renderer ⇄ Subsystem 数据面的概念边界；正式语义以 `doc/15-contracts` 为准。

Frame / Call Protocol v1 已整体 Active / Normative / Frozen。全部 Frame RPC、transaction、timeout/error、Runtime failure unwind、JSON/ID/limit/deadline/profile semantics 都属于 **Main ⇄ Subsystem Control Plane**。Renderer/Data Plane不是 Frame recovery或 Frame conformance authority。

## 1. 基本拓扑

每个 Subsystem Runtime 与 Renderer之间最多一条 current Data Connection。

物理 carrier可由 Desktop WebSocket 或 PWA MessagePort承载，但 carrier establishment属于 Host/Platform binding；Connection Core只定义建立后的 authority/lifecycle。

连接粒度=Subsystem，不是 Frame/Activation/Domain/Node。

一条 current Data Connection MAY承载：

```text
0..N Frame/Input contexts
0..N Render Domains
```

## 2. 三个数据协议域

```text
Renderer ⇄ Subsystem Runtime

Data Connection Contract
    Session / Renderer / subsystemKey / generation
    current / retired

User Input
    Subsystem → Renderer
        Input Interest
    Renderer → Subsystem
        State / Event / Reset

Render Update
    Subsystem → Renderer
        Domain lifecycle / current Domain State
```

三个域共享物理 carrier，但 authority、identity、ordering、recovery、backpressure与limits各自独立。

## 3. Control / Data 分离

```text
Main ⇄ Subsystem Control
    Subsystem Control
    Frame / Call

Main ⇄ Renderer Control
    committed Runtime / Stack / Activation / InputTarget / DataAuthority

Renderer ⇄ Subsystem Data
    Data Connection
    User Input
    Render Update
```

禁止通过 Data Plane发送 Frame RPC、重试 Frame operation、确认 applied/not-applied、计算 unwind root或恢复 Frame authority。

## 4. Data Connection Contract

Data Connection authority来自 Main `DataAuthority(subsystemKey, generation)`。

Connection identity：

```text
Session
+ current Renderer participant
+ subsystemKey
+ generation
```

lifecycle：

```text
current → retired
retired terminal
```

Connection Core不负责 endpoint/Port discovery、bearer ticket、Connection hello/ping/replay、Frame lifecycle、Render Domain lifecycle或 child-protocol payload。

同 generation允许在旧 carrier retired 后建立 fresh carrier；Data reconnect只恢复数据连接，不能取消 Runtime failure或 Frame unwind。

## 5. User Input Authority

Main仍是 ordinary input authority。

```text
Main
    InputTarget / Activation authority

Renderer Core
    trusted sender-side InputTarget enforcement point

Subsystem
    local Frame/Activation + local Interest validation
```

User Input wire只携 `frameId + activationId` authority identity；Subsystem不能从该 wire独立证明 Main当前 `InputTarget` 非空。

Renderer不得根据 Render focus、DOM focus、Interest或 custom component自行生成 InputTarget。

## 6. Input Interest / Effective Channel

Subsystem声明 Data-Connection scoped full exact Interest。

fresh Data Connection默认 `Interest=empty`；v1无 wildcard。

对 Channel `C`：

```text
Effective(C)
=
current matching Data Connection
∧ Main current InputTarget matches
∧ active/current Activation matches
∧ C is interested
∧ Producer(C) available
```

只有 Effective Channel 才产生普通 State/Event。

## 7. State / Event / Reset

```text
.state
    self-contained current snapshot
    latest wins
    may coalesce
    every false→true Effective transition establishes fresh baseline

.event
    ordered transient event
    no coalescing
    no history/reconnect replay
    not sole representation of persistent held state

reset
    clears all input State for frameId + activationId
    global ordering/coalescing barrier
```

InputTarget撤销时旧 target ordinary input立即停止，并在旧 Data Connection仍 current 时 best-effort Reset。

如果 Effective `.state` Producer消失而 authority仍有效，则 Reset current Activation并为剩余 Effective State Channels重新建立 fresh baselines。

## 8. InputTarget One-Shot Lease

Renderer Control v1冻结：

```text
published InputTarget(frameId, activationId)
→ revoked/removed/replaced
→ same frameId + activationId never becomes InputTarget again
```

重新授予 ordinary input authority使用 fresh authority epoch，通常即 fresh `activationId`。

## 9. Render Domain Model

当前 Render 架构已经收敛为：

```text
Subsystem Runtime
└── 0..N Render Domains
    ├── domainId
    ├── zIndex
    └── 0..N ordered roots
        └── Node
            ├── key
            ├── tag
            ├── attrs
            ├── data
            └── ordered children[]
```

Domain identity：

```text
subsystemKey + domainId
```

Domain 是：

```text
Render lifecycle unit
atomic current-state unit
global composition unit
```

Domain Host不是 Render Node，因此协议允许多个 roots，不强迫轻量 Domain创建 fake container root。

## 10. Node / Component Boundary

Node key当前设计为 current Domain Tree-wide unique reconciliation identity。

Node tag是逻辑 Renderer Component type：

```text
(subsystemKey, tag)
→ Renderer Component Factory
```

它不是任意 DOM tag。

`attrs` 是 string→string declarative attributes，`data` 是 JSON object component state，`children[]` 是 ordered child relation。

Renderer MAY对 full current Domain State按 stable key做本地 reconciliation，但本地 diff不意味着 Render Update wire已经支持 Tree Patch。

## 11. Domain Composition

Domain zIndex由 Subsystem控制：

```text
lower zIndex → below
higher zIndex → above
```

Frame Stack order不能充当 Domain z-order。

多个 Subsystem可能产生相同 zIndex；equal-zIndex deterministic tie-break及其不可依赖范围由 Render Update/Composition contract冻结，不能使用 connection/reconnect arrival order作为业务语义。

## 12. Domain / Frame / Data Independence

```text
Activation replacement != Domain epoch replacement
Frame suspended != Domain hidden
Frame closed/unwound != Domain destroyed
Data Connection retired != authoritative Domain destroyed
Domain/Node != ordinary Input authority
```

healthy Runtime的 doomed Frame被 close后，Domain是否保留仍由 Subsystem/Render Protocol决定。

Data outage期间 Renderer MAY保留最后合法 presentation，但 fresh connection后的 authoritative recovery必须由 Render Update Domain Registry + fresh Domain State闭合。

## 13. Normal Causal Barriers

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller InputTarget publication
```

这些只约束 InputTarget，不创建/切换/销毁 Render Domain。

## 14. Frame Control Failure Boundary

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Renderer/Data不得在 timeout后重放 Frame operation、用 reconnect判断远端 commit、用本地 snapshot修复 divergence或接受迟到 Response恢复 authority。

## 15. Runtime Failure Recovery Boundary

Main按 Frozen Frame rules计算 whole-suffix unwind。Renderer/Data不得自行推断 root、恢复 doomed Caller或覆盖 Main已 accepted outcome。

Render Domain cleanup仍由 Runtime/Data/Render contract独立收敛，不由 Frame unwind推导。

## 16. Frame Transport 与 Data Plane 无关

Frame v1对 Control carrier冻结 Desktop WebSocket / PWA MessagePort application semantics与自身 limits。

Frame limits不自动成为 Render/User Input limits；每个 Data protocol必须单独冻结 payload/backpressure/recovery规则。

## 17. Version Boundary

Frame / Call v1没有独立 runtime handshake；未来 Data/User Input/Render version negotiation不得被解释成 Frame version negotiation。

Render Update / Render Tree 是否需要 revision、Tree Patch、resume cursor必须由自身 closure证明，不从 Legacy Client State Tree或 Frame sequence继承。

## 18. Cancellation

Renderer不能代表 suspended Caller发 `frame.cancel`。UI返回/取消只是 current active Frame User Input Event，由该 Frame决定是否 return cancelled。

## 19. 当前拆分方向

```text
Renderer ⇄ Subsystem
├── Data Connection Contract
├── User Input Protocol
└── Render Update Protocol

Render state schema
└── Render Tree Contract

Renderer component loading
└── Renderer Component Bootstrap/Profile
```

旧 Frame-scoped Data/Client State Protocol只作为历史，不得把 Frame RPC、transaction/error/failure-unwind、Frame limits或 Activation authority重新引入 Data Plane。
