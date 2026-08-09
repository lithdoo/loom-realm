# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Active Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Subsystem 数据面职责及其对 Main committed authority 的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[渲染系统](./rendering-system.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)、[User Input v1](../15-contracts/user-input-v1.md)  
> 最近复核：2026-08-09

本文只描述 Renderer ⇄ Subsystem 数据面的概念分层；正式 wire/limits/conformance 以 `15-contracts` 为准。

## 1. 基本拓扑

每个 Subsystem Runtime 与 current Renderer之间最多一条 current Data Connection。

```text
(Session, current Renderer, subsystemKey)
    → 0..1 current Data Connection
```

物理 carrier可由 Desktop WebSocket 或 PWA MessagePort承载，但 establishment属于 Host/Platform Binding；Connection Core只定义建立后的 authority/lifecycle。

连接粒度=Subsystem，不是 Frame/Activation/Domain/Node。一条 current Data Connection MAY承载：

```text
0..N Frame/Input contexts
0..N Render Domains
```

## 2. 三个数据协议域

```text
Renderer ⇄ Subsystem Runtime

Data Connection v1
    Session / Renderer / subsystemKey / generation
    current / retired

User Input v1
    Subsystem → Renderer
        Input Interest
    Renderer → Subsystem
        State / Event / Reset

Render Update v1
    Subsystem → Renderer
        Domain Registry / Snapshot / Patch / Event
```

三个域共享物理 carrier，但 authority、identity、ordering、recovery、backpressure与limits各自独立。

## 3. Control / Data 分离

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
```

禁止通过 Data Plane发送 Frame RPC、重试 Frame operation、确认 ambiguous Frame commit、计算 unwind root或恢复 Frame authority。

## 4. Data Connection

Authority来自 Main：

```text
DataAuthority(subsystemKey, generation, connectionProfile)
```

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

Connection Core不负责 endpoint/Port discovery、bearer ticket、hello/ping/replay、Frame lifecycle、Render Domain lifecycle或 child-protocol payload。

同 generation仍授权时，可在旧 carrier retired后建立 fresh carrier；Data reconnect只恢复数据面，不能取消 Runtime failure或 Frame unwind。

## 5. User Input Authority

Main仍是 ordinary input authority：

```text
Main
    InputTarget / Activation authority

Renderer Core
    trusted sender-side InputTarget enforcement point

Subsystem
    local Frame/Activation + local Interest validation
```

User Input wire只携 `frameId + activationId` authority identity。Subsystem不能仅从 User Input wire独立证明 Main当前 `InputTarget`非空，因此 Renderer Core的 sender gate是 v1 trust boundary的一部分。

Renderer不得根据 DOM focus、Render focus、Interest或 Component自行生成 InputTarget。

## 6. Input Interest / Effective Channel

fresh Data Connection默认：

```text
Interest = empty
```

Subsystem发布 full exact Interest。对 Channel `C`：

```text
Effective(C)
=
current matching Data Connection
∧ Main current InputTarget matches this Subsystem
∧ mirrored Frame active/current Activation matches
∧ C in current Interest
∧ Producer(C) available
```

只有 Effective Channel产生 ordinary State/Event。

## 7. State / Event / Reset

```text
.state
    self-contained current snapshot
    latest wins / may coalesce
    every false→true transition establishes fresh baseline

.event
    ordered transient
    no coalescing / no history/reconnect replay

reset
    clears all input State for frameId + activationId
    ordering/coalescing barrier
```

InputTarget撤销后立即停止旧 ordinary input；旧 Data Connection仍 current时 best-effort Reset。

Effective `.state` Producer loss时，Reset current Activation，并为剩余 Effective State Channels建立 fresh baselines。

## 8. InputTarget One-Shot Lease

```text
published InputTarget(frameId, activationId)
→ revoked/removed/replaced
→ same frameId + activationId never becomes InputTarget again
```

未来 ordinary input grant使用 fresh Activation epoch。

## 9. Render Domain Model

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

Domain identity=`subsystemKey + domainId`。Domain是 Render lifecycle、atomic authoritative-state、global composition unit；Domain Host不是 Render Node。

同 DataAuthority generation内 `domainId` one-shot。Node key在 Domain lifecycle内 one-shot并且 current tree全局唯一。

## 10. Render Update Incremental Model

当前 closure candidate：

```text
render.domains
    full Domain Registry

render.snapshot(revision)
    full recursive Tree baseline / commit

render.patch(baseRevision, revision)
    exact R→R+1 atomic commit
    insert / remove / move / update by Node key

render.event
    transient presentation impulse
```

Wire继续使用 recursive Tree；Renderer内部 MAY维护 `key→node` / `key→parent` 索引用于 Patch与 reconciliation。

Patch不是 generic JSON Patch：不使用 JSON Pointer/path identity，不定义 DOM mutation command family。

## 11. Render Revision / Recovery

Domain revision是 authoritative publication commit number，不是 transport sequence或 replay cursor。

fresh Data Connection：

```text
render.domains(current Registry)
→ fresh Snapshot for every current Domain
→ Patch/Event
```

baseline之后 authoritative commit严格 `R→R+1`。

Patch base mismatch或 authoritative candidate invalid意味着 replication chain divergence：

```text
retire current Data carrier
→ establish fresh carrier
→ Registry + fresh Snapshots
```

无 ACK/NACK、Patch history replay、resume cursor或 Renderer→Subsystem resync RPC。

## 12. Node / Component Boundary

Node tag是 logical Renderer Component type：

```text
(subsystemKey, tag)
→ Renderer Component Factory
```

它不是任意 DOM tag。

`attrs`是 string→string declarative attributes；`data`是 JSON object component state；`children[]`是 ordered structure。

Component code/bootstrap不进入 Render Update payload。Component existence也不产生 ordinary input authority。

## 13. Domain Composition

```text
lower zIndex → below
higher zIndex → above
```

Frame Stack order不能充当 Domain z-order。

多个 Subsystem可以使用相同 zIndex；equal-z tie-break必须 deterministic/non-semantic，不得使用 connection/reconnect arrival order作为业务语义。

## 14. Domain / Frame / Data Independence

```text
Activation replacement != Domain lifecycle change
Frame suspended != Domain hidden
Frame closed/unwound != Domain destroyed
Data Connection retired != authoritative Domain destroyed
Domain/Node != ordinary Input authority
```

Data outage期间 Renderer MAY保留最后合法 presentation cache，但 fresh connection上的 current authority必须由 Registry + fresh Snapshot重新证明。

## 15. Frame Failure Boundary

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Main按 Frozen Frame v1规则计算 whole-suffix unwind。Renderer/Data不得 replay Frame operation、推断 unwind root、恢复旧 Activation或覆盖 accepted outcome。

## 16. Version / Limit Boundary

Frame / Call v1没有独立 runtime handshake。Data Connection/User Input/Render各自拥有自己的版本、limits、ordering和recovery规则。

Frame message limits不自动成为 User Input/Render limits；共享 carrier不代表共享协议序列。

## 17. Cancellation

Renderer不能代表 suspended Caller发送 `frame.cancel`。UI cancel只是 current active Frame的 User Input Event，由 Subsystem业务逻辑决定是否 `frame.return({type:"cancelled"})`。

## 18. 当前分层

```text
Renderer ⇄ Subsystem
├── Data Connection v1
├── User Input v1
└── Render Update v1

Renderer component loading
└── Renderer Component Bootstrap/Profile
```

旧 Frame-scoped Data/Client-State模型已经从当前文档树移除；设计历史由 ADR 0004/0006 与 Git history保留。
