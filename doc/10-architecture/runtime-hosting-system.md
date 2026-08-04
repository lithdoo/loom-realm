# 运行承载系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem、Runtime Container、Frame/Input、Render 与平台宿主之间的承载关系  
> 依赖：[系统架构总览](./system-overview.md)、[栈式运行系统](./stack-runtime-system.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 承载粒度

```text
one descriptor.key
    → at most one active Runtime Container

one Runtime Container
    → 0..N Frame/Input Context
    → 0..N Render Context
    → one Main Control Connection
    → at most one Renderer Data Connection
```

Frame / Call Batch A-E 已 Frozen。Frame 是 Main-owned call/input Context；Render 是 Subsystem-owned presentation Context。

## 2. Runtime 与 Frame 边界

Runtime Bootstrap/ready/shutdown/failed 属于 Subsystem Control。Frame lifecycle 不启动、停止、restart Runtime。

Frame identity/caller/lifecycle/outcome/Stack、Activation、InputTarget 与 failure-unwind authority 都在 Main；Subsystem 只维护本地 Frame/Input Context。

## 3. Normal Frame Transaction

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

ordinary call无 reverse suspend；activate/resume ACK先于对应 InputTarget publication；same-Subsystem recursion复用 Runtime/Connection但仍 new childFrameId/new Activation。

## 4. Deadline / Error Boundary

全部 Frame Request finite deadline：

```text
Success        → known committed
Explicit Error → known not committed
Timeout/loss   → ambiguous → Runtime failure
```

Host/Transport不得在 timeout 后 application-level retry/replay。Recoverable只有 target-not-found/unavailable 与 `FRAME_INITIALIZE_REJECTED`；control divergence、protocol error、ambiguous timeout均 Runtime-fatal。

## 5. Batch E Runtime Failure Hosting

Runtime failure是 `descriptor.key` 级事件。Main维护 `failedRuntimeKeys`，并从 live Stack 中最下面的 failed-runtime Frame作为 unwind root；root..top整个 suffix 都要结束。

同一 Runtime在 Stack出现多次时不能只删最近 occurrence，也不能只删相同 key Frame后保留 descendants。

## 6. Failed Runtime Frame

Runtime terminal failed 后，不再向其发送正常 `frame.activate/suspend/resume/close`。

Main直接 retire其 live Frame：

```text
revoke public authority
→ closing
→ closed
→ remove
```

这里不要求 `frame.close ACK`。`closed` 表示 Main不再持有 live Frame authority；Runtime资源由 Supervisor/termination处理。Frame lifecycle仍没有 `failed`。

## 7. Healthy Descendant Frame

Affected suffix 中健康 Runtime SHOULD 保留 Container，只清 doomed Frame Context：

- initialize明确未 commit → 无 remote Context，无需 close；
- Context存在 → Main撤销公共 Activation/InputTarget、进入 `closing`，发送一次 `frame.close`；
- 已有 close pending → 使用既有 Request，不重复发；
- recovery 不额外要求 suspend-before-close，避免增加新的 timeout surface。

close ACK后正常移除 Frame。

## 8. Fixed-point Expansion

healthy cleanup 或 recovery resume若导致 Runtime timeout/diverge/protocol-fail/exit：

```text
failedRuntimeKeys += key
→ recompute lowest root across whole live Stack
```

若新 failed Runtime在旧 root下方还有 Frame，root必须下移。Recovery重复直到 fixed point。

最终只允许：

```text
healthy surviving Caller fresh-resume
```

或：

```text
Stack empty / InputTarget=null
```

## 9. Outcome / Caller Recovery

已 Return Acceptance 的 outcome不能被 Runtime crash覆盖。

final root无 accepted outcome时使用：

```text
FrameOutcome.failed.error.code = SUBSYSTEM_RUNTIME_FAILED
```

intermediate doomed Frame不逐层 resume；只向 final root下方 direct healthy Caller发送一次 fresh `frame.resume`。Resume ACK后才发布新 InputTarget；resume failure继续扩大 failed set/root。

## 10. Zero-frame / Session Policy

failed Runtime在 Stack无 live Frame时，Batch E不修改现有 Stack/InputTarget。required Runtime failure是否结束 Session属于更高层 policy。

Session termination/bootstrap-abort已经占优时，不要求为了继续游戏而 resume Caller。

## 11. Desktop / PWA

Desktop WebSocket 与 PWA MessagePort都必须保持 A-E应用语义：normal ordering、ACK-before-publish、finite deadline/no retry、lowest-root whole-suffix unwind、failed-runtime logical retire、fixed-point expansion、accepted outcome preservation。

## 12. Render / Data Independence

Frame unwind不隐式 create/hide/destroy Render，也不决定 Data Connection lifecycle。Runtime failure会使该 Runtime的 Data authority失效，但 Render/Data recovery仍属于独立协议域。

## 13. 核心不变量

- one Runtime可承载多个 Frame/Render；
- Runtime failure按 subsystem key影响 Stack；
- lowest failed-runtime Frame决定 whole suffix；
- failed Runtime Frame可无 close ACK retire；
- healthy descendant只 best-effort close；
- cleanup failure fixed-point扩大 root；
- accepted outcome不可覆盖；
- surviving Caller只用 fresh Activation；
- no caller cancel / no recovery abort-unwind/replay；
- Frame lifecycle不控制 Runtime/Render/Data lifecycle。
