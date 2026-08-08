# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Control Plane、System Data Plane、Content Plane、协议职责域、authority/recovery 与 Transport binding  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 最近复核：2026-08-08

## 1. 三类通信平面

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control
        Frame / Call
        future Data Lease Control if required

    Renderer ⇄ Main
        Renderer Control

System Data Plane
    Subsystem ⇄ Renderer
        Connection
        Render Update
        User Input

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

核心：

```text
shared Transport != shared protocol domain
Runtime != Frame != Data Connection != Render != Content
```

## 2. Main ⇄ Subsystem Control Domains

### Subsystem Control

v1 Frozen；v2 Draft。

```text
Subsystem Control v1
    Runtime identity/lifecycle
    Desktop historical ready.rendererDataEndpoint binding

Subsystem Control v2
    Runtime identity/lifecycle only
    ready has no Data endpoint
```

跨 Desktop/PWA 的后续方向使用 v2，使 Data transport discovery退出 Runtime lifecycle。

### Frame / Call v1

Active / Normative / Frozen。

```text
Main → Subsystem
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close

Subsystem → Main
    frame.call
    frame.return
```

Renderer不是 Frame participant。

## 3. Runtime Control Profiles

Profile v1 已冻结：

```text
Subsystem Control v1
+
Frame / Call v1
```

同一 sender/Control Connection跨协议 Request共享 positive-safe-integer、Connection-lifetime never-reuse ID namespace；no JSON-RPC Batch。

未来 Profile v2 只有在所需组成协议冻结后才定义，可能组合：

```text
Subsystem Control v2
Frame / Call v1
Data Lease Control v1 if required
```

不得修改 Profile v1 偷加 Data method。

## 4. Frame Ordering / Commit

```text
call Response before dependent Child initialize/activate
return Response before dependent close/resume
activate/resume ACK before InputTarget publication
```

ordinary call不依赖 reverse `frame.suspend`。

Frame suspend clarification：

```text
child-call suspension
    → existing child-outcome frame.resume can reactivate

explicit administrative frame.suspend
    → one-way quiesce in v1
    → no generic resume; continue to close/failure cleanup
```

## 5. Frame Error / Failure Recovery

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

no retry/replay/idempotency journal。

Runtime failure：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix Top→Bottom
→ failed logical retire / healthy close
→ cleanup failure expands failed set/root
→ accepted outcome preserved
→ fresh final Caller resume or Stack empty
```

Data/Renderer/Render reconnect不得计算、确认或取消 unwind root。

## 6. Main ⇄ Renderer Control v1

Renderer Control是 authority replication，不是 command protocol。

```text
renderer.hello
renderer.state(full Snapshot)
```

Snapshot：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority {
    subsystemKey
    generation
    connectionProfile
}
```

不包含：

```text
Data endpoint / MessagePort
Data bearer token
Render State
Content Grant
```

模型：

```text
full Snapshot
Session-local monotonic revision
revision gap allowed
latest-state coalescing
no replay/patch
reconnect = current Snapshot
```

Renderer Control loss：

```text
stop ordinary input
invalidate InputTarget
invalidate DataAuthority
close all Data Connections
fresh hello/current Snapshot
```

## 7. Data Authority / Lease

Main是 Renderer⇄Subsystem Data Connection authority。

```text
subsystemKey + generation
```

标识一个 Session中的逻辑 Data lease generation。

generation：

```text
Subsystem-scoped
positive safe integer
strictly increases on replacement
never reused
```

Renderer Control只发布逻辑 authority；实际 endpoint/Port/credential属于 Connection Bootstrap/Profile。

## 8. Renderer ⇄ Subsystem Connection

每个有效 Runtime最多一条 current Renderer Data Connection。

```text
one Runtime
    → 0..N Frame/Input Context
    → 0..N Render Context
    → at most one Renderer Data Connection
```

Connection Protocol下一阶段负责：

```text
matching DataAuthority generation
identity/authentication
establish/replace/close
Desktop/PWA bootstrap profiles
connection failure
```

Connection生命周期不由 Frame lifecycle推导。

## 9. System Data Protocol Domains

建立后的 Data Connection承载至少两个独立 application domains：

```text
User Input
Render Update
```

它们共享物理 Transport，但必须拥有独立：

```text
identity
sequence
backpressure
recovery
payload limits
```

不得把 Frame v1 的 no-retry/1MiB/deadline自动继承给 Data protocols；各自冻结自己的 Profile。

## 10. User Input Authority

ordinary input至少要求：

```text
Frame exists
Frame active
activationId current
Frame == Main InputTarget
matching current Data generation connection exists
```

InputTarget变化本身就是旧 Activation continuous-input intent的终止边界；Renderer不要求一定观察到中间 `InputTarget=null` revision。

旧 Activation输入不得自动 replay 到新 Activation。

## 11. Render Independence

Render完全由 Subsystem-owned Render identity/lifecycle管理。

不得推导：

```text
Frame active → Render visible
Frame suspend → Render hidden
Frame close/unwind → Render destroyed
Data Connection close → Render authority destroyed
```

Data reconnect后的 Render recovery由 Render Update/State protocol决定，不参与 Frame recovery。

## 12. Renderer Control Backpressure

Renderer Control full Snapshot使用 bounded latest-state coalescing：

```text
at most one replaceable unsent latest Snapshot
no unbounded historical Snapshot queue
```

slow Renderer持续无法 drain时关闭 Control Connection，随后以 fresh full Snapshot恢复。

Phase-1 topology：

```text
Runtime <= 256
live Stack <= 64
DataAuthority <= 256
```

保证合法 Renderer Control state可单条 Snapshot表示。

## 13. Desktop Binding

Desktop：

```text
Main⇄Subsystem Control     localhost WebSocket
Main⇄Renderer Control      localhost WebSocket
Renderer⇄Subsystem Data   transport profile to be frozen
Content                    localhost HTTP
```

Frame v1：one complete WebSocket text message = one JSON-RPC application message；actual text bytes与reference semantic limits都需验证；no adapter retry/replay。

Data Connection endpoint/auth不再从 Subsystem Control v2 `ready` 推导。

## 14. PWA Binding

PWA目标：

```text
Subsystem Control v2      authenticated MessagePort profile
Frame / Call v1           same application semantics
Renderer Control v1       authenticated Main↔Window/Renderer Control Port profile
Renderer⇄Subsystem Data  MessagePort-based connection profile
Content                   same-origin Fetch/Service Worker
```

PWA Bootstrap Credential / Port transfer如何建立属于 Host/Profile。

Frame v1在 authenticated Port建立后继续：

```text
one postMessage plain JSON object = one RPC
no Transferable dependency
same transaction/error/unwind semantics
```

## 15. Content Plane

Readonly Content API定义逻辑内容：

```text
manifest / record / group / resource
```

与 Control/Data plane独立。

```text
Content API
    request/response/cache/version/error/integrity

Content Access Bootstrap/Profile
    capability distribution/rotation
```

Content credential不得进入 Frame、Renderer Authority Snapshot或 Render State。

## 16. Security / Fail Closed

- wire视为不可信；
- Control bootstrap credential按 secret处理；
- Main是 Frame/Input/Data lease authority；
- Renderer Control不携Data bootstrap secret；
- Control loss撤销 input/Data authority；
- Subsystem不能创建公共 frameId/activationId；
- Renderer不能生成/恢复 Activation；
- Transport不能成为 recovery authority。

## 17. 当前推进状态

```text
Game Package v2 / Desktop Launcher       Frozen
Subsystem Control v1                     Frozen
Subsystem Control v2                     Draft
Runtime Control Profile v1               Frozen
Frame / Call v1 + Conformance            Frozen
Frame suspend clarification              Frozen clarification
Renderer Control v1                      Draft / under review
    ↓
Renderer ⇄ Subsystem Connection v1       next
    ↓
User Input v1
Render Update v1
Render State Contract v1
Content Access Profile
```