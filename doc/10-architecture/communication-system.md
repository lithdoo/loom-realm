# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Control Plane、System Data Plane、Content Plane、authority/recovery 与 communication-facing Platform Binding  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[运行承载系统](./runtime-hosting-system.md)、[ADR 0016](../decisions/0016-protocol-boundary-cleanup.md)  
> 最近复核：2026-08-19

## 1. 三类通信平面

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control v1
        Frame / Call v1
        Runtime Control Profile v1

    Renderer ⇄ Main
        Renderer Control v1

System Data Plane
    Renderer ⇄ Subsystem
        Data Connection v1
        User Input v1
        Render Update v1

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

核心：

```text
shared Transport != shared protocol domain
Runtime != Frame != Renderer Control != Data Connection != User Input != Render != Content
```

实际 carrier 的创建属于 Platform Composition；本文件只定义通信相关的 role/authority 边界。

---

## 2. Main ⇄ Subsystem Runtime Control

Subsystem Control v1 只拥有 Runtime identity/lifecycle：

```text
Subsystem → Main
    subsystem.hello
    subsystem.status

Main → Subsystem
    subsystem.shutdown
```

```text
launch != connected != identified != ready
ready != Data Connection established
```

`ready` 不携 Data endpoint、MessagePort、Data credential 或 DataAuthority。

当前组合：

```text
Runtime Control Application Profile v1
=
Subsystem Control v1
+
Frame / Call v1
```

同一 sender 跨 Control + Frame 共享 Connection-lifetime Request-ID namespace；one JSON-RPC message per transport unit；no JSON-RPC Batch。

物理 Control carrier 由 Platform Runtime Control Binding 建立；建立后 WebSocket/MessagePort 不改变 application semantics。

---

## 3. Frame Failure Boundary

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

Frame v1 no retry/replay。

Runtime failure unwind authority只在 Main；Data/Renderer/Transport/Platform reconnect不得计算、确认或取消 unwind root。

---

## 4. Main ⇄ Renderer Control v1

Renderer Control 复制 Main committed authority：

```text
Runtime projection
Frame Stack
Activation
InputTarget
DataAuthority { subsystemKey, generation, connectionProfile }
```

不包含：

```text
Data endpoint / ticket / MessagePort
Render State
Content Grant
```

恢复使用 full current Snapshot；Control loss/replacement 撤销 old InputTarget/DataAuthority 使用并 retire old Data Connections。

Renderer Control 与 Renderer⇄Subsystem Data 没有 cross-connection total order；User Input 只组合各自当前状态，不要求跨通道 barrier/ACK。

---

## 5. Data Authority

Main 是 Renderer⇄Subsystem Data authority。

```text
DataAuthority {
    subsystemKey,
    generation,
    connectionProfile
}
```

`generation`：

```text
Subsystem-scoped within Session
positive safe integer
never reused
!= transport reconnect counter
```

Renderer Control 只发布逻辑 authority；实际 carrier establishment 属于 Platform Data Connection Broker。

---

## 6. Data Connection Broker 与 Data Connection v1

系统级物理协调：

```text
Main current DataAuthority(S,G)
        ↓
Platform Data Connection Broker
       / \
      ▼   ▼
Renderer Subsystem
```

Broker 在 carrier 安装为 current 前必须绑定：

```text
current Session
current Renderer participant
subsystemKey
generation
```

Broker 不拥有 generation，也不能把 endpoint/ticket/Port 当作 DataAuthority identity。

Data Connection v1 本身只定义建立后的合法 carrier：

```text
identity = Session + current Renderer + subsystemKey + generation
lifecycle = current → retired
```

每个 `(Session, current Renderer, subsystemKey)` 同时最多一条 current carrier；installation serialized。

同 generation 仍授权时，旧 carrier retired 后 MAY establish fresh carrier。

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
Activation replacement != Data generation replacement
Data retire != Render Domain destroy
```

---

## 7. Communication-facing Platform Bindings

完整 Platform architecture 见 [平台组合系统](./platform-composition-system.md)。通信面只需要这些投影：

```text
Runtime Control Binding
Renderer Control Binding
Data Connection Broker
Content Binding
```

典型实现：

```text
Hostra Desktop
    Runtime Control      localhost WebSocket
    Renderer Control     localhost WebSocket
    Data                 authenticated localhost carrier
    Content              localhost HTTP

PWA
    Runtime Control      MessagePort
    Renderer Control     MessagePort
    Data                 MessageChannel / transferred Port
    Content              same-origin Fetch / Service Worker
```

Endpoint、ticket、Port、Worker startup message 都是 platform/bootstrap material，不是 application authority。

---

## 8. Data Application Domains

current Data Connection 承载两个 sibling domains：

```text
User Input
    Subsystem → Renderer: Frame Interest Registry snapshot
    Renderer → Subsystem: State / Event / Reset

Render Update
    Subsystem → Renderer: Domain Registry / Snapshot / Patch / Event
```

两者共享 carrier，但独立定义 payload、ordering、backpressure、recovery 与 lifecycle。

---

## 9. User Input v1

```text
Effective(F,A,C)
=
current matching Data Connection
∧ Main current InputTarget == (S,F,A)
∧ mirrored Frame F active/current Activation A
∧ C ∈ Interest[F]
∧ Producer(C) available
```

Interest 是 Subsystem-owned Frame-scoped configuration：

```text
full Frame Interest Registry replacement
fresh Data Connection registry empty
no ACK/revision/patch/wildcard
not authority
```

Control authority 与 Interest snapshot 可任意顺序到达：

```text
Interest first  → store; inert until authority
Authority first → no input until Interest[F]
```

Renderer 不解释 call/return/push/pop/unwind，只对 current facts 做 conjunction。

`.state` 每次 non-effective→effective 建 fresh current self-contained baseline；`.event` future-only/no replay。Activation replacement不复用旧 Input State/Event；Reset清理 Activation-scoped state，不修改 Frame Interest。

---

## 10. Render Update

方向固定：

```text
Subsystem → Renderer only
```

当前模型：

```text
render.domains
render.snapshot(revision)
render.patch(baseRevision, revision)
render.event
```

fresh Data Connection：

```text
current Registry
→ fresh Snapshot every current Domain
→ ordinary Patch/Event
```

无 ACK/NACK、Patch history replay、resume cursor、Renderer→Subsystem resync RPC。

Render lifecycle 不由 Frame lifecycle 或 Platform carrier lifecycle拥有。

---

## 11. Backpressure / Carrier Minimum

Transport adapter向上至少提供：

```text
ordered delivery per direction
application-message boundary
observable close/loss
bounded buffering
no adapter-created application retry/duplicate
```

不要求两个方向 global total order。

各 child protocol 自己定义 coalescing/recovery/backpressure；Platform 不增加统一 replay/resync router。

---

## 12. Content Plane

Readonly Content API 定义 logical access、cache/version/error/integrity/authorization semantics。

```text
Desktop → filesystem + localhost HTTP
PWA     → Fetch + Service Worker / OPFS
```

这些是 Platform/Adapter realization；credential/bootstrap plumbing 不进入 Frame、Renderer Authority Snapshot、Render State 或 ordinary business payload。

---

## 13. Security / Fail Closed

- wire 视为不可信；
- Main 是 Frame/Input/Data authority；
- Input Interest/Producer availability只能过滤，不能授予 authority；
- Renderer Control loss/replacement撤销 old ordinary input/Data authority usage；
- stale Activation input必须拒绝；
- Renderer Control不携 Data bootstrap secret；
- Runtime `ready` 不传 Data endpoint/credential；
- Platform/Transport不能成为 Runtime/Frame recovery authority；
- Platform bootstrap material默认不升级为 application protocol。

---

## 14. 核心不变量

1. Control/Data/Content 是独立通信平面；
2. physical carrier establishment 属于 Platform Composition；
3. Runtime Control application semantics不随 WebSocket/MessagePort改变；
4. Renderer Control只复制逻辑 authority；
5. Data Connection Broker不拥有 Main DataAuthority；
6. Data loss不等于 Runtime failure/Frame unwind；
7. User Input Interest 是 Frame-scoped configuration；
8. User Input 不解释 Frame stack operation history；
9. Render 与 User Input 是 Data Connection sibling domains；
10. Content logical semantics 不受平台 adapter 选择影响。
