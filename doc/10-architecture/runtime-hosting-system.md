# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem Runtime、Control、Frame/Input、Render 与 Platform Runtime Hosting 的承载关系  
> 依赖：[系统架构总览](./system-overview.md)、[平台组合系统](./platform-composition-system.md)、[栈式运行系统](./stack-runtime-system.md)、[Subsystem Control v1](../15-contracts/subsystem-control-protocol-v1.md)、[Runtime Control Profile v1](../15-contracts/runtime-control-profile-v1.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-19

## 1. 承载粒度

```text
one descriptor.key
    → at most one active Runtime Container

one Runtime Container
    → 0..N Frame/Input Context
    → 0..N Render Domains
    → one Main Control carrier

(Session, current Renderer, subsystemKey)
    → 0..1 current Renderer⇄Subsystem Data Connection
```

Frame 是 Main-owned call/input Context；Render Domain 是 Subsystem-owned presentation Context。

Runtime Container 的**逻辑角色**平台无关；Process/Worker 只是 Platform Runtime Hosting 的物理实现。

---

## 2. Runtime Hosting Port

Main 不应直接拥有 `child_process` / `Worker` API。架构上 Main 消费 Platform 提供的 Runtime Hosting / Supervisor 能力：

```text
Main
  │ validated descriptor / launch attempt
  ▼
Runtime Hosting
  │
  ├── Hostra Desktop → Node child process
  └── PWA            → Dedicated Worker
```

Runtime Hosting 负责：

```text
physical container creation
bootstrap material delivery
termination observation
bounded cleanup/force termination
```

但不拥有：

```text
Subsystem public lifecycle
Frame Stack/Activation
failure unwind root
DataAuthority
Render lifecycle
```

---

## 3. Runtime Control Boundary

当前 Runtime bootstrap/ready/shutdown/failed 属于 Subsystem Control v1。

当前 Control/Frame 组合：

```text
Runtime Control Application Profile v1
=
Subsystem Control v1 + Frame / Call v1
```

```text
launch success != connected != identified != ready
ready != Data Connection exists
```

`ready` 不携 Renderer Data endpoint。

Control carrier 的物理建立属于 Platform Runtime Control Binding；建立后 application semantics 不因 WebSocket/MessagePort 而变化。

---

## 4. Runtime 与 Frame 边界

Frame lifecycle 不启动、停止、restart Runtime。

Frame identity/caller/lifecycle/outcome/Stack、Activation、InputTarget 与 failure-unwind authority 都在 Main；Subsystem 只维护本地 Frame/Input Context。

同一 Runtime 可以在 Stack 中出现多个 Frame；same-Subsystem recursion 复用 Runtime/Control/Data carrier，但仍获得 fresh childFrameId / Activation。

---

## 5. Frame Transaction / Failure

Transport/Platform 必须保持：

```text
frame.call Request
→ acceptance commit
→ frame.call Response
→ Child initialize/activate

frame.return Request
→ acceptance commit
→ frame.return Response
→ close/resume
```

activate/resume ACK 先于对应 InputTarget publication。

Frame Request：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Platform/Transport 不得在 timeout 后 application-level retry/replay。

Runtime failure 按 `descriptor.key` 影响 Stack；Main 从最低 live failed-runtime Frame 计算 whole-suffix fixed-point unwind。Platform Supervisor 只报告实际 Runtime terminal fact，不计算 Frame recovery。

---

## 6. Runtime Control Carrier Profile

当前 Control carrier 同时承载 Control v1 + Frame v1 时，必须满足 Runtime Control Profile v1：

```text
one transport application unit = one JSON-RPC message
no JSON-RPC Batch
plain JSON application values
Request ID positive safe integer
sender-side Request ID never reused for Connection lifetime
shared sender-side namespace across Control + Frame
message <= 1 MiB
JSON depth <= 64
```

Frame 仍满足其 Frozen business value/identity/deadline limits。

Desktop parsed JSON 与 PWA Structured Clone 必须进入同一 application validator；Structured Clone 不能扩大正式 JSON model。

---

## 7. Data Authority / Connection Boundary

Runtime `ready` 不是 Data carrier discovery。

```text
Main Renderer Control
    DataAuthority{subsystemKey,generation,connectionProfile}
        ↓
Platform Data Connection Broker
    establishes/binds physical endpoints
        ↓
Renderer⇄Subsystem Data Connection
    current → retired
```

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
```

same generation 仍授权时，old carrier retired 后可建立 fresh carrier。

Data carrier replacement 不重建 Runtime Container。

---

## 8. Input / Render Lifetime

一个 Runtime 可以同时维护多个 Frame-scoped Input configurations 与多个 Render Domains。

```text
Frame suspension
    does not destroy Input Interest configuration
    does not destroy Render Domain

fresh Activation
    may reuse Frame Interest configuration
    never reuses old Activation input state/event

Data carrier replacement
    fresh User Input registry starts empty on wire
    Render recovers via Registry + fresh Snapshots
```

Frame unwind 不隐式 create/hide/destroy Render Domain，也不决定 Data Connection lifecycle。

---

## 9. Zero-frame / Session Policy

Runtime 可以同时：

```text
ready
Data Connection current or absent
0 live Frames
0..N Render Domains
```

这些状态互相独立。

failed Runtime 在 Stack 无 live Frame 时，Frame v1 不修改现有 Stack/InputTarget。required Runtime failure 是否结束 Session 属于更高层 Main/product policy。

---

## 10. Hostra Desktop / PWA Realization

```text
Hostra Desktop
    Runtime Container   Node child process
    Supervisor          process lifecycle
    Runtime Control     localhost WebSocket

PWA
    Runtime Container   Dedicated Worker
    Supervisor          Worker lifecycle
    Runtime Control     authenticated/transferred MessagePort
```

两者实现同一个 Runtime Hosting/Control architecture，而不是两个不同 Runtime application model。

完整平台关系见 [平台组合系统](./platform-composition-system.md)。

---

## 11. Version Binding

`subsystem.hello.protocolVersions` 只协商 Subsystem Control；当前 conformant Runtime 支持/选择 version 1。

Frame / Call v1 没有独立 `frame.hello/version/capabilities`，由 Runtime Control Profile v1 静态绑定。

Control 与 Frame 是独立版本空间；当前二者恰好均为 1。

---

## 12. 核心不变量

- Runtime Container 是 platform-neutral logical role；Process/Worker 是 Platform realization；
- one descriptor.key → at most one active Runtime Container；
- current Runtime Control = Control v1 + Frame v1；
- `ready` 不携 Data endpoint；
- Frame lifecycle 不启动/停止 Runtime；
- Platform Supervisor 不拥有 Frame/failure-unwind authority；
- Frame / Call v1 保持 Frozen；
- Runtime failure按 subsystem key影响 Stack；
- accepted outcome不可覆盖；surviving Caller只用 fresh Activation；
- no Frame retry/replay；
- DataAuthority/Data carrier独立于 Runtime ready；
- Data loss不等于 Runtime failure/Frame unwind；
- Frame lifecycle不控制 Runtime/Render/Data lifecycle；
- Desktop/PWA physical hosting不同但 Runtime application semantics相同。
