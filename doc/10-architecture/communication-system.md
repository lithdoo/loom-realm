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

Snapshot包含 Runtime projection、Frame Stack、Activation、InputTarget 与逻辑 DataAuthority；不包含 Data bootstrap material / Render State / Content Grant。

恢复模型：

```text
full Snapshot
Session-local monotonic revision
revision gap allowed
latest-state coalescing
no replay/patch
Control loss → revoke InputTarget/DataAuthority → retire Data Connections
```

InputTarget进一步使用 one-shot lease：

```text
published InputTarget(frameId, activationId)
→ revoked/removed/replaced
→ same frameId + activationId MUST NOT become InputTarget again
```

这样 Main 可以继续 coalesce 中间 full Snapshots，而不会隐藏同一 input authority 的 revoke→regrant。

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

以下事件 retire connection：carrier loss、DataAuthority removal/replacement、Renderer Control loss、Renderer participant replacement、Session end。

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
User Input
    Subsystem → Renderer: Input Interest
    Renderer → Subsystem: State / Event / Reset

Render Update
    Subsystem → Renderer
```

User Input反向 Interest只是输入域自己的 filtering/configuration state，不是新的第三个 System Data protocol，也不产生 Main authority。

User Input与Render Update共享 carrier，但必须独立定义 payload、ordering/sequence、backpressure、recovery 与 limits。

## 9. User Input v1 Core

权威草案：[User Input v1](../15-contracts/user-input-v1.md)。

### Authority / Trust

Main仍独占 ordinary input authority。

```text
Main
    owns InputTarget / Activation

Renderer Core
    trusted sender-side InputTarget enforcement point

Subsystem
    validates local Frame/Activation + local Interest
```

Subsystem不能从 User Input wire独立证明 Main当前 `InputTarget` 非空；如果未来要求不信任 Renderer，应另行设计 signed/capability authority，而不是扩展 v1普通 payload。

wire authority identity保持：

```text
frameId + activationId
```

不重复 sessionId/subsystemKey/generation。

### Input Channel / Interest

标准 Channel：

```text
keyboard.state
keyboard.event
pointer.state
pointer.event
gamepad.state
gamepad.event
```

自定义 Renderer component：

```text
x.<custom-name>.state
x.<custom-name>.event
```

Interest：

```text
Subsystem → Renderer
full replacement exact set
new current Data Connection default = empty
Runtime/Data-Connection scoped
no wildcard
not authority
```

Interest缩小时，Subsystem先更新 local Interest gate；迟到旧消息自然丢弃，因此无需 ACK/revision。

### Effective Input Channel

对 exact Channel `C`：

```text
Effective(C)
=
current matching Data Connection
∧ Main current InputTarget matches this Subsystem
∧ active Frame/current Activation matches
∧ C ∈ current Input Interest
∧ Producer(C) available
```

因此：

```text
Interest != authority
Producer availability != authority
```

二者都只能缩小输入面。

### Effective Transition

`.state` 从 false→true 时，无论原因是 Interest、InputTarget、Activation、reconnect 或 Producer恢复：

```text
Renderer MUST establish a fresh self-contained State baseline
```

`.event` false→true 只允许 future Events，不补历史。

true→false 时立即停止普通 State/Event。

### State / Event / Reset

```text
.state
    self-contained current snapshot
    latest wins
    may coalesce

.event
    ordered transient event
    no coalescing
    no replay
    must not be sole persistent held-state representation

reset
    clears all input state for frameId + activationId
    global ordering/coalescing barrier
```

Event与Reset是 State coalescing barrier。

### Teardown

InputTarget撤销/替换时，Renderer停止旧 target普通输入；若旧 Data Connection仍 current，best-effort Reset immediately previous target。

如果一个当前 Effective `.state` Producer消失而 ordinary authority仍有效：

```text
Reset current Activation
→ fresh snapshots for remaining Effective .state Channels
```

这样不需要 per-channel reset wire。

Activation revocation/replacement、Frame leaves active、Data Connection retire、Renderer Control loss/replacement、Session end都是 implicit reset boundary。

### Recovery / Failure

fresh Data Connection从 `Interest=empty` 开始；Subsystem重新发布完整 Interest；Event不重放，Effective State以 fresh baseline恢复。

User Input无 transactional ACK；input loss、Interest传播 gap、Producer availability change、State coalescing、Event overflow都不得自行升级为 Runtime failure或 Frame unwind。

标准 Channel payload、numeric limits、Event overflow final policy仍待 Completion/Profile冻结。

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

Data reconnect后的 Render recovery由 Render Update / Render State自己的 snapshot/revision model决定，不参与 Frame recovery。

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
- Renderer Core是 ordinary InputTarget sender-side trusted enforcement point；
- Input Interest只允许过滤，不允许授予 authority；
- Producer availability只允许过滤，不允许授予 authority；
- InputTarget lease撤销后 same `frameId + activationId` 不 re-grant；
- Renderer Control不携Data bootstrap secret；
- Control loss/replacement撤销 Renderer input/Data authority；
- Subsystem不能创建公共 frameId/activationId；
- Renderer不能生成/恢复 Activation；
- stale Activation input必须拒绝；
- removed Interest Channel的迟到 input必须拒绝；
- transport不能成为 Runtime/Frame recovery authority。

## 15. 当前推进状态

```text
Game Package v2 / Desktop Launcher       Frozen
Subsystem Control v1                     Frozen
Subsystem Control v2                     Draft
Runtime Control Profile v1               Frozen
Frame / Call v1 + Conformance            Frozen
Frame suspend clarification              Frozen clarification
Renderer Control v1                      Draft / input lease closed
Data Connection Contract v1              Draft / lifecycle closed
User Input v1                            Core Draft / semantic closure review
    ↓
Standard Input Mapping + wire/limits
    ↓
Render Update v1
Render State Contract v1
Content Access Profile
```
