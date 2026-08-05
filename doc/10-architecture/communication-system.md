# 通信系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：控制面、数据面、内容面、协议职责域、事务因果、failure recovery 与 transport binding  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)  
> 最近复核：2026-08-05

## 1. 三类通信平面

```text
Control Plane
    Subsystem ⇄ Main
        Subsystem Control v1
        Frame / Call v1

    Renderer ⇄ Main
        Runtime / Stack / Activation / InputTarget / Grants

System Data Plane
    Subsystem ⇄ Renderer
        Connection Layer
        Render Update
        User Input

Content Plane
    Runtime / Renderer ⇄ Readonly Content Service
```

共享 Transport 不代表共享 identity/lifecycle/error/recovery model。

## 2. Main ⇄ Subsystem Control

Subsystem Control v1 管 Runtime identity/ready/shutdown/failed；Frame / Call v1 管 Frame/Stack/Input authority。

```text
Subsystem Control v1    Active / Normative / Frozen
Frame / Call v1         Active / Normative / Frozen
```

Frame wire exactly seven Requests：

```text
Main → Subsystem
    initialize / activate / suspend / resume / close
Subsystem → Main
    call / return
```

## 3. Normal Frame Ordering

```text
call Response
    before dependent Child initialize/activate

return Response
    before dependent close/resume

activate/resume ACK
    before corresponding InputTarget publication
```

ordinary call无 reverse suspend；same-Subsystem recursion不依赖 nested reverse-request handler。

## 4. Error / Timeout Boundary

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous → Runtime failure
```

Frame Control不做 application retry/replay/idempotency journal。

Recoverable：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

Control divergence / Frozen JSON-RPC protocol error / ambiguous timeout Runtime-fatal。Runtime diagnostics至少：`FRAME_CONTROL_TIMEOUT / FRAME_CONTROL_DIVERGENCE / FRAME_CONTROL_PROTOCOL_ERROR`。

## 5. Runtime Failure Recovery

```text
failedRuntimeKeys
→ lowest failed-runtime Frame
→ whole suffix Top→Bottom
→ failed Runtime Frame logical retire
→ healthy descendant frame.close
→ cleanup failure expands failed set/root
→ accepted outcome preserve
→ fresh final Caller resume or Stack empty
```

Data messages、Renderer reconnect、Render snapshot都不能决定或确认 unwind root。

## 6. Failed Runtime 通信规则

一旦 Runtime terminal failed，Main不再依赖新的 normal Frame RPC清理其 Frame；Main logical retire。迟到 Response只做 diagnostics。

健康 Runtime上的 doomed Frame仍可接收一次 best-effort `frame.close`；不要求额外 suspend-before-close。close失败使该 Runtime也 failed并触发 fixed-point expansion。

## 7. Frame / Call v1 JSON-RPC Connection Profile

承载 Frame / Call v1 的 Control Connection：

```text
one transport application unit = one JSON-RPC Request or Response
JSON-RPC Batch forbidden
```

同一发送方的 outbound JSON-RPC Request ID：

```text
positive safe integer 1..2^53-1
Connection lifetime never reused / never wrapped
no pending collision across Subsystem Control / Frame domains
```

两个方向 namespace独立。Frame Request ID不是 operationId/idempotency key。

## 8. Frame / Call v1 JSON / Limits

统一 application model只允许 plain JSON-compatible data。禁止 NaN/Infinity/BigInt/Transferable/Host object。

```text
max application message          1 MiB
max JSON container depth         64
max business JsonValue           512 KiB
max JsonValue string             256 KiB UTF-8
max object key                   256 UTF-8 bytes
max array/object members         16,384
frameId / activationId           1..128 UTF-8 bytes
targetSubsystemKey               1..256 UTF-8 bytes
FrameFailure.message             <=4096 UTF-8 bytes
```

Reference Compact JSON UTF-8 encoding用于 business value size、PWA whole-message equivalent size和跨 Transport fixture。

Desktop text carrier额外必须对**实际完整 WebSocket text UTF-8 bytes**执行 `<=1 MiB`硬限制；不能只按 parse后 compact equivalent判断。正常 Desktop sender输出 compact JSON，因此 outbound actual/reference size一致。

PWA object没有原始 JSON text bytes，按 reference compact equivalent执行 1 MiB whole-message limit。Structured Clone能力不进入 Frame application type system。

## 9. Frame Deadline Profile

每个发送角色只为自己能发送的方法选择 connection-stable sender-local monotonic deadline：

```text
Main
    initialize / activate / suspend / resume / close

Subsystem
    call / return
```

每个适用 method：

```text
1,000 .. 300,000 ms
```

Deadline不进入 RPC params、不由 Game Package/business input控制、不 per-request negotiation。两端无需使用相同数值。

Timeout语义仍只有 Batch D 的 ambiguous Runtime failure；Transport不得因此重发 operation。

## 10. Main ⇄ Renderer Control

Renderer不是 Frame RPC participant，只观察 Main已 commit Runtime/Stack/lifecycle/Activation/InputTarget。

```text
activate/resume ACK before publish
revoked Activation never republished
failure barrier may produce InputTarget=null
no two ordinary InputTargets
```

Recovery只有 final `frame.resume` ACK后才可发布新 Activation。

## 11. System Data Plane

每有效 Runtime与 Renderer最多一条长期 Data Connection，可承载 0..N Render Context + 0..N Frame Input Context。

```text
Connection Layer
Render Update
User Input
```

三个域共享物理 Transport但 Sequence/recovery/backpressure独立。

## 12. User Input / Render Independence

ordinary input合法至少要求 Frame exists + active + current activationId + Main-authorized InputTarget。

Call/return mutation gate和 failure barrier期间可 `InputTarget=null`。Frame Control failure不能通过 User Input resend/reset修复。

Frame active/suspended/closed/unwound不推导 Render visible/hidden/destroyed。Runtime failure可能使对应 Data/Render authority失效，但其 cleanup仍是独立协议问题。

## 13. Desktop WebSocket Binding

Desktop：Control/Data=localhost WebSocket。

Frame / Call Control mapping：one complete WebSocket text message = one JSON-RPC application message；binary message不作为 Frame v1 carrier；sender使用 compact JSON；receiver执行 actual text byte hard cap；adapter保持 order/message boundary，不 batch/coalesce/retry/replay Frame operation。

## 14. PWA MessagePort Binding

PWA Control/Data=MessagePort。PWA Bootstrap Credential / Worker→Control Port establishment尚属独立 Profile；一旦 Port建立，Frame / Call mapping已经冻结：

```text
one postMessage plain JSON-compatible object = one JSON-RPC application message
no Transferable dependency
reference compact equivalent size limits
same JSON/deadline/transaction/failure semantics as Desktop
```

## 15. Version Binding

`subsystem.hello.protocolVersions` 只协商 Subsystem Control v1。

Frame / Call v1无独立 `frame.hello/version/capabilities`，由 Host/runtime deployment profile静态绑定。Future dynamic Frame version negotiation必须通过新的 enclosing Profile或新的 Subsystem Control版本引入。

## 16. Retry / Recovery Boundaries

```text
Subsystem Control
    no state-changing app retry

Frame / Call
    no state-changing app retry/replay
    no abort/unwind recovery RPC
    ambiguous result → Runtime failure

User Input
    continuous may coalesce / discrete ordered

Render
    recoverable state may snapshot/coalesce
```

不要把 Data Plane 的重放/恢复思想套到 Frame Control。

## 17. Conformance

Frame v1兼容性由 [Frame / Call Protocol v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md) 判断。

Desktop/PWA adapter必须通过相同 abstract golden trace；Transport差异不能改变 Frame schema、commit point、timeout meaning、unwind root、outcome或 Activation。正式报告记录 tested fixtureSetRevision。

## 18. Security / Authority

所有 wire message视为不可信。Control hello绑定 key/credential；Frame operation验证 authenticated connection；Subsystem不能创建公共 frameId/activationId；Renderer不能生成/恢复 Activation；Failure unwind root/failed set只由 Main决定。Outbound implementation应在发送前做完整 schema/limit preflight。

## 19. 当前状态

已冻结：Game Package Desktop subset、Desktop Node.js Launcher v1、Subsystem Control v1、Frame / Call Protocol v1。

下一主要协议目标：

```text
Main ⇄ Renderer Control
→ Renderer ⇄ Subsystem Connection
→ User Input
→ Render Update
→ Render State
```
