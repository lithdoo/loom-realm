# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Archived Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Subsystem 数据面职责及其对 Main committed control/recovery state 的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)、[User Input Protocol v1](../15-contracts/user-input-v1.md)  
> 最近复核：2026-08-08

本文只描述 Renderer ⇄ Subsystem 数据面的概念边界；正式语义以 `doc/15-contracts` 为准。

Frame / Call Protocol v1 已整体 Active / Normative / Frozen。全部 Frame RPC、transaction、timeout/error、Runtime failure unwind、JSON/ID/limit/deadline/profile semantics 都属于 **Main ⇄ Subsystem Control Plane**。Renderer/Data Plane不是 Frame recovery或 Frame conformance authority。

## 1. 基本拓扑

每个 Subsystem Runtime 与 Renderer之间最多一条 current Data Connection。

物理 carrier可由 Desktop WebSocket 或 PWA MessagePort承载，但 carrier establishment属于 Host/Platform binding；Connection Core只定义建立后的 authority/lifecycle。

连接粒度=Subsystem，不是 Frame/Activation/Render。

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
        presentation state/events
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

Connection Core不负责：

```text
Data Grant payload
endpoint/Port discovery
bearer ticket format
Connection hello/ping/replay
Frame lifecycle
Render lifecycle
User Input payload
```

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

Subsystem声明 Data-Connection scoped full exact Interest：

```text
keyboard.state / keyboard.event
pointer.state / pointer.event
gamepad.state / gamepad.event
x.<custom-name>.state / x.<custom-name>.event
```

fresh Data Connection默认 `Interest=empty`；v1无 wildcard。

Interest不是 authority。

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

因此 Main full-Snapshot coalescing不需要保留中间 null revision，也不会隐藏 same-authority revoke→regrant。

重新授予 ordinary input authority使用 fresh authority epoch，通常即 fresh `activationId`。

## 9. Normal Causal Barriers

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller InputTarget publication
```

call/return Response-before-dependent-RPC只属于 Main⇄Subsystem Control ordering，不进入 Data Plane。

## 10. Frame Control Failure Boundary

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Renderer/Data不得在 timeout后重放 Frame operation、用 reconnect判断远端 commit、用本地 snapshot修复 divergence或接受迟到 Response恢复 authority。

## 11. Runtime Failure Recovery Boundary

Main按：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame root
→ whole suffix Top→Bottom unwind
→ fixed-point expansion
→ final healthy Caller resume or Stack empty
```

Renderer/Data不得自行推断 root、恢复 doomed Caller或覆盖 Main已 accepted outcome。

## 12. Frame v1 Transport Profile 与 Data Plane 无关

Frame v1对 Control carrier冻结 Desktop WebSocket / PWA MessagePort application semantics与自身 limits。

这些规则不能被 Data Connection的 transport能力借用来扩展 Frame Control wire。

反方向也一样：Frame v1 limits不自动成为 Render/User Input limits；每个 Data protocol必须单独冻结 payload/backpressure/recovery规则。

## 13. Render Update Independence

```text
Activation replacement ≠ Render epoch replacement
Frame suspended ≠ Render hidden
Frame closed/unwound ≠ Render destroyed
Data Connection retired ≠ Render destroyed
```

healthy Runtime的 doomed Frame被 close后，Render是否保留仍由 Subsystem/Render Protocol决定。

## 14. Runtime Failure / Data Connection

Runtime terminal failure通常使该 Runtime的 DataAuthority失效；但 Data Connection failure不反向定义 Runtime failure，也不定义 Frame cleanup。

## 15. Version Boundary

Frame / Call v1没有独立 runtime handshake；`subsystem.hello.protocolVersions`只协商 Subsystem Control。

未来 Data Connection/User Input/Render version negotiation不得被解释成 Frame version negotiation。

## 16. Cancellation

Renderer不能代表 suspended Caller发 `frame.cancel`。UI返回/取消只是 current active Frame User Input Event，由该 Frame决定是否 return cancelled。

## 17. 当前拆分方向

```text
Renderer ⇄ Subsystem
├── Data Connection Contract
├── User Input Protocol
└── Render Update Protocol

另有 Render State Contract
```

旧 Frame-scoped Data Protocol只作为历史，不得把 Frame RPC、transaction/error/failure-unwind、Frame limits或 Activation authority重新引入 Data Plane。
