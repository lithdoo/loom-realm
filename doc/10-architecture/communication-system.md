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
    Renderer ⇄ Subsystem
        Data Connection Contract
        User Input
        Render Update

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

核心：

```text
shared Transport != shared protocol domain
Runtime != Frame != Data Connection != User Input != Render != Content
```

## 2. Main ⇄ Subsystem Control Domains

Subsystem Control v1 Frozen；v2 Draft。

```text
Subsystem Control v1
    Runtime identity/lifecycle
    Desktop historical ready.rendererDataEndpoint binding

Subsystem Control v2
    Runtime identity/lifecycle only
    ready has no Data endpoint
```

Frame / Call v1 Active / Normative / Frozen；Renderer不是 Frame participant。

```text
Main → Subsystem
    initialize / activate / suspend / resume / close

Subsystem → Main
    call / return
```

ordinary call不依赖 reverse suspend；activate/resume ACK先于 InputTarget publication。

## 3. Runtime Control Profiles

Profile v1：

```text
Subsystem Control v1
+
Frame / Call v1
```

同 sender跨协议共享 Connection-lifetime Request-ID namespace；no JSON-RPC Batch。

未来 Profile v2 只有在组成协议冻结后才定义，不预先假设必须增加 Data control method。

## 4. Frame Failure Boundary

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

Frame no retry/replay。

Runtime failure：

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix Top→Bottom
→ failed logical retire / healthy close
→ fixed-point expansion
→ accepted outcome preserved
→ fresh final Caller resume or Stack empty
```

Data/Renderer/Render reconnect不得计算、确认或取消 unwind root。

## 5. Main ⇄ Renderer Control v1

Renderer Control是 committed authority replication：

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

不包含 Data bootstrap material / Render State / Content Grant。

恢复模型：

```text
full Snapshot
Session-local monotonic revision
revision gap allowed
latest-state coalescing
no replay/patch
Control loss → revoke InputTarget/DataAuthority → retire Data Connections
```

## 6. Data Authority

Main是 Renderer⇄Subsystem Data authority。

```text
subsystemKey + generation
```

表示 Session内一个 Data authority generation。

`generation`：

```text
Subsystem-scoped
positive safe integer
strictly increases on authority replacement
never reused
!= reconnect counter
```

Renderer Control只发布逻辑 authority；Host/Platform carrier establishment不进入 Authority Snapshot。

## 7. Renderer ⇄ Subsystem Data Connection Contract

权威草案：[Data Connection Contract v1](../15-contracts/renderer-subsystem-data-connection-v1.md)。

Connection Core零 application methods，只定义 current carrier authority。

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

每个 `(Session, current Renderer participant, subsystemKey)` 同时最多一条 current carrier；installation必须 serialized。

以下事件 retire connection：

```text
carrier loss
DataAuthority removal/replacement
Renderer Control loss
Renderer participant replacement
Session end
```

同 generation仍授权时，可以在旧 carrier retired 后建立 fresh current carrier。

边界：

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Activation replacement != Data generation replacement
Data retire != Render destroy
```

## 8. System Data Application Domains

建立后的 current Data Connection承载两个独立 application domains：

```text
Renderer → Subsystem
    User Input

Subsystem → Renderer
    Render Update
```

它们共享 carrier，但必须独立定义 payload、ordering/sequence、backpressure、recovery 与 limits。

Connection Contract不增加第三套业务消息。

## 9. User Input v1 Core

权威草案：[User Input v1](../15-contracts/user-input-v1.md)。

ordinary input合法至少要求：

```text
current Data Connection
Main current InputTarget != null
InputTarget.subsystemKey matches current connection
Frame active
activationId current
```

wire authority identity：

```text
frameId + activationId
```

不重复 sessionId/subsystemKey/generation。

Core三类：

```text
discrete
    ordered
    no coalescing
    no reconnect replay

continuous
    latest-state semantics
    may coalesce

reset
    clears current Activation continuous intent
```

以下事件都是 implicit continuous reset boundary：

```text
InputTarget replacement
Activation revocation/replacement
Data Connection current → retired
Renderer Control loss/replacement
Session end
```

User Input无ACK、不是事务、不是broadcast、不是Frame command；input/Data loss本身不导致 Runtime failure。

具体 Keyboard/Pointer/Touch/Gamepad normalized payload 与 numeric limits仍待 User Input completion/profile冻结。

## 10. Render Update Independence

Render Update是下一主要 Data protocol target。

Render必须保持 Subsystem-owned identity/lifecycle：

```text
Frame active != Render visible
Frame suspend != Render hidden
Frame close/unwind != Render destroy
Activation replacement != Render epoch
Data retire != Render destroy
```

Data reconnect后的 Render recovery由 Render Update / Render State 自己的 snapshot/revision model决定，不参与 Frame recovery。

## 11. Renderer Control Backpressure

Renderer Control full Snapshot使用 bounded latest-state coalescing：

```text
at most one replaceable unsent latest Snapshot
no unbounded historical Snapshot queue
```

slow Renderer持续无法 drain时关闭 Control Connection，以 fresh full Snapshot恢复。

Phase-1 topology：

```text
Runtime <= 256
live Stack <= 64
DataAuthority <= 256
```

## 12. Desktop / PWA Binding

Desktop目标：

```text
Main⇄Subsystem Control     localhost WebSocket
Main⇄Renderer Control      localhost WebSocket
Renderer⇄Subsystem Data    Host-established carrier
Content                    localhost HTTP
```

PWA目标：

```text
Subsystem Control v2       authenticated MessagePort profile
Frame / Call v1            same application semantics
Renderer Control v1        authenticated Control Port profile
Renderer⇄Subsystem Data    Host-established MessagePort carrier
Content                    same-origin Fetch / Service Worker
```

WebSocket endpoint、ticket、MessagePort creation/transfer等属于 Host/Platform binding，不属于 Data Connection Core。

## 13. Content Plane

Readonly Content API定义 logical manifest/record/group/resource access。

```text
Content API
    request/response/cache/version/error/integrity

Content Access Bootstrap/Profile
    capability distribution/rotation
```

Content credential不得进入 Frame、Renderer Authority Snapshot或 Render State。

## 14. Security / Fail Closed

- wire视为不可信；
- Main是 Frame/Input/Data authority；
- Renderer Control不携Data bootstrap secret；
- Control loss/replacement撤销 Renderer input/Data authority；
- Subsystem不能创建公共 frameId/activationId；
- Renderer不能生成/恢复 Activation；
- stale Activation input必须拒绝；
- transport不能成为 Runtime/Frame recovery authority。

## 15. 当前推进状态

```text
Game Package v2 / Desktop Launcher       Frozen
Subsystem Control v1                     Frozen
Subsystem Control v2                     Draft
Runtime Control Profile v1               Frozen
Frame / Call v1 + Conformance            Frozen
Frame suspend clarification              Frozen clarification
Renderer Control v1                      Draft / under review
Data Connection Contract v1              Draft / lifecycle closed
User Input v1                            Core Draft / current review
    ↓
User Input payload mapping + limits
    ↓
Render Update v1
Render State Contract v1
Content Access Profile
```
