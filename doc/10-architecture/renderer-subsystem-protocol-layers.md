# Renderer–Subsystem 协议分层

> 层级：系统架构  
> 状态：Archived Design / Conceptual  
> 稳定程度：Evolving  
> 主要定义：Renderer 与 Subsystem 数据面职责及其对 Main committed control/recovery state 的依赖  
> 依赖：[通信系统](./communication-system.md)、[运行承载系统](./runtime-hosting-system.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-05

本文只描述 Renderer ⇄ Subsystem 数据面的概念边界，不冻结 Data Connection / Render / User Input wire，也不能覆盖正式契约。

Frame / Call Protocol v1 已整体 Active / Normative / Frozen。全部 Frame RPC、transaction、timeout/error、Runtime failure unwind、JSON/ID/limit/deadline/profile semantics 都属于 **Main ⇄ Subsystem Control Plane**。Renderer/Data Plane不是 Frame recovery或 Frame conformance authority。

## 1. 基本拓扑

每个 Subsystem Runtime 与 Renderer之间最多一条长期 Data Transport：Desktop WebSocket / PWA MessagePort。物理连接粒度=Subsystem，不是 Frame/Render。

## 2. 三个数据协议域

```text
Renderer ⇄ Subsystem Runtime

Connection Layer
    identity / auth / lifecycle

Render Update
    Subsystem → Renderer presentation state/events

User Input
    Renderer → Subsystem ordinary input
```

三个域共享物理 Transport，但 identity/lifecycle/sequence/recovery/backpressure独立。

## 3. Control / Data 分离

```text
Main ⇄ Subsystem Control
    Subsystem Control v1
    Frame / Call v1
        seven Frame RPC
        transaction barriers
        error/timeout classification
        Runtime failure fixed-point unwind
        JSON/ID/limits/deadline/transport binding

Main ⇄ Renderer Control
    committed Runtime / Stack / lifecycle / Activation / InputTarget

Renderer ⇄ Subsystem Data
    User Input(frameId + activationId)
    Render Update(independent Render identity)
```

禁止通过 Data Plane发送 Frame RPC、重试 Frame operation、确认 applied/not-applied、计算 unwind root、扩展 Frame value type或恢复 Frame authority。

## 4. Connection Layer

负责 Data Grant、Session/Subsystem/Connection identity、version/capability、liveness、replace/close。

不拥有 Frame lifecycle/Stack/Activation/InputTarget、Frame RPC deadline/error state、Request ID、Frame message limit、failedRuntimeKeys/unwind root、Render Registry或 business state。

Data reconnect只恢复数据连接，不能取消 Runtime failure或 Frame unwind。

## 5. User Input

ordinary input至少要求：Frame exists + active + activation current + Frame==Main InputTarget。

Renderer不生成 Activation、不恢复缓存旧 Activation、不根据 Render focus改变 InputTarget。

Normal transaction与 failure recovery都允许 `InputTarget=null`，此时停止 ordinary input routing。

## 6. Normal Causal Barriers

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller InputTarget publication
```

call/return Response-before-dependent-RPC只属于 Main⇄Subsystem Control ordering，不进入 Data Plane。

## 7. Frame Control Failure Boundary

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Renderer/Data不得在 timeout后重放 Frame operation、用 reconnect判断远端 commit、用本地 snapshot修复 divergence或接受迟到 Response恢复 authority。

## 8. Runtime Failure Recovery Boundary

Main按：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame root
→ whole suffix Top→Bottom unwind
→ fixed-point expansion
→ final healthy Caller resume or Stack empty
```

Renderer/Data不得只删除 failed Runtime自己的 input records并保留 descendants、自行推断 root、恢复 intermediate doomed Caller或覆盖 Main已 accepted outcome。

## 9. Frame v1 Transport Profile 与 Data Plane 无关

Frame v1对 Control carrier冻结：Desktop WebSocket text / PWA plain JSON MessagePort mapping、1 MiB message、JSON-only values、Request ID/deadline profile。

这些规则不能被 Data Connection的 Structured Clone、binary payload、snapshot/replay能力借用来扩展 Frame Control wire。

反方向也一样：Frame v1 limits不自动成为未来 Render/User Input limits；每个 Data protocol必须单独冻结自己的 payload/backpressure/recovery规则。

## 10. Render Update Independence

```text
Activation replacement ≠ Render epoch replacement
Frame suspended ≠ Render hidden
Frame closed/unwound ≠ Render destroyed
Frame Control failure ≠ Render replay authority
```

healthy Runtime的 doomed Frame被 close后，Render是否保留仍由 Subsystem/Render Protocol决定。

## 11. Runtime Failure / Data Connection

Runtime terminal failure通常使该 Runtime的 Data Connection authority失效；但 Data Connection不能定义 Frame cleanup。failed Runtime Frame在 Main侧可无 close ACK logical retire；Data/Render cleanup独立处理。

## 12. Version Boundary

Frame / Call v1没有独立 runtime handshake；`subsystem.hello.protocolVersions`只协商 Subsystem Control。未来 Data Connection version negotiation不得被解释成 Frame version negotiation。

## 13. Cancellation

Renderer不能代表 suspended Caller发 `frame.cancel`。UI返回/取消作为 current active Frame User Input，由该 Frame决定是否 return cancelled。

## 14. 当前拆分方向

```text
Renderer ⇄ Subsystem
├── Connection Protocol
├── Render Update Protocol
└── User Input Protocol

另有 Render State Contract
```

旧 Frame-scoped Data Protocol只作为历史，不得把 Frame RPC、transaction/error/failure-unwind、Frame limits或 Activation authority重新引入 Data Plane。
