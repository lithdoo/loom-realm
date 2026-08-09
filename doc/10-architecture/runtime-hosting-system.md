# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem、Runtime Container、Control、Frame/Input、Render 与平台宿主之间的承载关系  
> 依赖：[系统架构总览](./system-overview.md)、[栈式运行系统](./stack-runtime-system.md)、[Subsystem Control v2](../15-contracts/subsystem-control-protocol-v2.md)、[Runtime Control Profile v2](../15-contracts/runtime-control-profile-v2.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-09

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

Frame是 Main-owned call/input Context；Render Domain是 Subsystem-owned presentation Context。

## 2. Runtime Control Boundary

当前 Runtime bootstrap/ready/shutdown/failed属于：

```text
Subsystem Control v2
```

当前 Control/Frame组合属于：

```text
Runtime Control Application Profile v2
=
Subsystem Control v2 + Frame / Call v1
```

Control v1/Profile v1已实现前废弃。

```text
spawn != connected != identified != ready
ready != Data Connection exists
```

`ready`不携 Renderer Data endpoint。

## 3. Runtime 与 Frame 边界

Frame lifecycle不启动、停止、restart Runtime。

Frame identity/caller/lifecycle/outcome/Stack、Activation、InputTarget 与 failure-unwind authority都在 Main；Subsystem只维护本地 Frame/Input Context。

## 4. Normal Frame Transaction

Transport adapter必须保持：

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

ordinary call无 reverse suspend；activate/resume ACK先于对应 InputTarget publication；same-Subsystem recursion复用 Runtime/Control/Data carrier但仍使用 new childFrameId/new Activation。

## 5. Deadline / Error Boundary

全部 Frame Request finite deadline：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Host/Transport不得在 timeout后 application-level retry/replay。

## 6. Runtime Failure Hosting

Runtime failure是 `descriptor.key`级事件。Main维护 `failedRuntimeKeys`，并从 live Stack中最下面的 failed-runtime Frame作为 unwind root；root..top整个 suffix都要结束。

同一 Runtime在 Stack出现多次时不能只删最近 occurrence。

## 7. Failed / Healthy Frame Cleanup

failed Runtime terminal后，不再向其发送正常 `frame.activate/suspend/resume/close`。Main直接 logical retire对应 live Frames；Runtime资源由 Supervisor/termination处理。

Affected suffix中 healthy Runtime只清 doomed Frame Context：Context存在时 best-effort `frame.close`，已有 pending close不重复发送。

cleanup/resume failure可使新 Runtime加入 failed set，重新计算 root直到 fixed point。

## 8. Outcome / Caller Recovery

已 Return Acceptance 的 outcome不能被 Runtime crash覆盖。

final root无 accepted outcome时使用 `SUBSYSTEM_RUNTIME_FAILED`；只向 final root下方 direct healthy Caller进行 fresh Activation resume，ACK后才发布 InputTarget。

## 9. Runtime Control Carrier Profile

当前 Control carrier同时承载 Control v2 + Frame v1时，必须满足 Profile v2：

```text
one transport application unit = one JSON-RPC message
no JSON-RPC Batch
plain JSON application values
Request ID positive safe integer
sender-side Request ID never reused for Connection lifetime
shared sender-side namespace across Control + Frame
message <=1 MiB
JSON depth <=64
```

Frame仍额外满足其 Frozen business value/identity/deadline limits。

## 10. Desktop / PWA

Desktop：Control v2可绑定 localhost WebSocket。

PWA：Control v2可绑定 authenticated MessagePort。

建立后两者必须保持相同 Control v2 lifecycle 与 Frame v1 transaction semantics；PWA Structured Clone不能扩大协议 JSON model。

## 11. Version Binding

`subsystem.hello.protocolVersions`只协商 Subsystem Control；当前 conformant Runtime支持/选择 version 2。

Frame / Call v1没有独立 `frame.hello/version/capabilities`，由 Runtime Control Profile v2静态绑定。

```text
Control version = 2
Frame version   = 1
```

是正常且有意的组合。

## 12. Data Authority / Connection Boundary

Runtime `ready`不是 Data carrier discovery。

Data链路：

```text
Main Renderer Control
    DataAuthority{subsystemKey,generation,connectionProfile}
→ Host/Platform Binding
    endpoint/ticket/MessagePort establishment
→ Renderer⇄Subsystem Data Connection
    current → retired
```

```text
Data loss != Runtime failure
Data loss != Frame unwind
Frame close != Data retire
```

same generation仍授权时，old carrier retired后可建立 fresh carrier。

## 13. Zero-frame / Session Policy

Runtime可以：

```text
ready
Data Connection current or absent
0 live Frames
0..N Render Domains
```

这些状态互相独立。

failed Runtime在 Stack无 live Frame时，Frame v1不修改现有 Stack/InputTarget。required Runtime failure是否结束 Session属于更高层 policy。

## 14. Render Independence

Frame unwind不隐式 create/hide/destroy Render Domain，也不决定 Data Connection lifecycle。

Data carrier retired时 Renderer可以保留最后合法 presentation cache；authoritative Render恢复由 Render Update通过 fresh Registry/Snapshots完成。

## 15. Conformance

实现适用：

- Subsystem Control v2 conformance；
- Runtime Control Profile v2 integration conformance；
- [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)；
- Data Connection/Profile适用 carrier conformance。

## 16. 核心不变量

- current Runtime Control=Control v2 + Frame v1；
- Control v1/Profile v1已实现前废弃；
- `ready`不携 Data endpoint；
- one Runtime可承载多个 Frame/Render Domains；
- Frame / Call v1保持 Frozen；
- Runtime failure按 subsystem key影响 Stack；
- lowest failed-runtime Frame决定 whole suffix；
- failed Runtime Frame可无 close ACK retire；
- healthy descendant只 best-effort close；
- cleanup failure fixed-point扩大 root；
- accepted outcome不可覆盖；
- surviving Caller只用 fresh Activation；
- no caller cancel / no recovery abort-unwind/replay；
- DataAuthority/Data carrier独立于 Runtime ready；
- Frame lifecycle不控制 Runtime/Render/Data lifecycle。
