# 栈式运行系统

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：调用栈、Frame 生命周期、Activation、事务提交、Runtime failure unwind 与 ordinary InputTarget  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)  
> 正式化：[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 被以下文档使用：[Subsystem 模型](./subsystem-model.md)、[运行时启动系统](./runtime-bootstrap-system.md)  
> 最近复核：2026-08-19

本文是 Frame/Stack 的架构事实源；精确 wire/error/deadline/conformance 由 Frozen Frame / Call v1 定义。

---

## 1. Goal

为多个独立 Subsystem提供单一 LIFO call / ordinary input control-flow model。

```text
Frame
    = Main-owned call/input context
```

Frame不拥有 Runtime/Data/Render lifecycle。

---

## 2. Authority

Main唯一拥有：

```text
frameId
Frame→subsystemKey
callerFrameId
Frame lifecycle/outcome
Stack
Activation
InputTarget
normal transaction serialization
failure unwind
```

Subsystem只维护 local Context/mutation gate；Renderer只观察 committed projection。

---

## 3. Identity

```text
frameId       Session-scoped unique / never reused
activationId  Session-scoped unique / never reused
callerFrameId immutable
subsystemKey  immutable per Frame
```

PID/Worker/Connection/Render identity不能代替 Frame identity。

---

## 4. Lifecycle

```text
starting
active
suspended
closing
closed
```

稳定状态：

```text
Stack empty
OR
exactly one active Frame = Stack Top
all lower live Frames suspended
```

transaction/recovery gap中 MAY暂时 zero active。

active Frame有 exactly one current Activation；其他 lifecycle无 current Activation。

---

## 5. Activation

Activation 是一次 ordinary-input/call-return authority epoch。

```text
first activation fresh
child-call acceptance revokes caller activation permanently
resume uses fresh activation
revoked activation never valid again
```

Activation不是 resumable token。

---

## 6. InputTarget

Main current ordinary input authority：

```text
InputTarget = null
OR
{subsystemKey, frameId, activationId}
```

非空 target必须引用 active Stack Top/current Activation。

`active + InputTarget=null` 合法，用于已 commit但尚未完成 publication/transaction barrier等场景。

Renderer不得从 focus/Interest/Render state自行创建 target。

---

## 7. Initial Frame

```text
allocate F0 starting
Stack=[F0]
InputTarget=null
→ frame.initialize ACK
→ mint A0
→ frame.activate(F0,A0) ACK
→ commit F0 active/A0
→ publish InputTarget F0/A0
```

ACK-before-publication。

---

## 8. Call Acceptance

稳定起点：

```text
F1/A1 active Stack Top
InputTarget=F1/A1
```

合法 call被 Main原子 accept：

```text
revoke A1
F1 → suspended(cause=child-call)
allocate F2 starting/caller=F1
push F2
InputTarget=null
```

然后先完成 call Response，再进行 dependent Child initialize/activate。

```text
call Response
→ frame.initialize(F2)
→ fresh A2
→ frame.activate(F2,A2) ACK
→ publish F2/A2 InputTarget
```

old A1永不恢复。

---

## 9. Return Acceptance

稳定起点：F2/A2 active Top。

Main原子 accept return：

```text
store F2 outcome
revoke A2
F2 → closing
InputTarget=null
```

先 return Response，再：

```text
frame.close(F2) ACK
→ F2 closed/pop
→ mint fresh A3
→ frame.resume(F1,A3,F2,outcome) ACK
→ F1 active/A3
→ publish F1/A3 InputTarget
```

Accepted outcome不可覆盖。

---

## 10. Administrative Suspend

`frame.suspend` 是 Main explicit administrative operation，不用于 ordinary child call。

Success 后：

```text
revoke current Activation
Frame → suspended(cause=administrative)
InputTarget cannot reference old epoch
```

v1无 generic normal reactivation；后续只 close/failure cleanup。

---

## 11. Commit Evidence

state-changing Frame Request：

```text
Success Response
    → known committed

Explicit Error
    → protocol-defined known no-commit or fatal

Timeout/loss
    → applied/not-applied ambiguous
    → Runtime failure
```

No application retry/replay/idempotency journal。

---

## 12. Mutation Gate

Subsystem outbound `frame.call` / `frame.return` pending时必须：

```text
stop new ordinary input dispatch
block second call/return
```

只有明确 recoverable pre-commit Error才可重新开放 current Activation。

Runtime-fatal/ambiguous绝不恢复旧 epoch。

---

## 13. Response-before-dependent-RPC

Main MUST NOT依赖同一 Subsystem nested reverse request reentrancy。

```text
complete frame.call Response
before Child initialize/activate

complete frame.return Response
before close/resume
```

这使 same-Subsystem recursion仍可使用简单 ordered dispatcher。

---

## 14. Runtime Failure Unwind

Runtime failure集合：

```text
failedRuntimeKeys
```

Main：

```text
find lowest live Frame whose subsystemKey failed
→ that Frame = unwind root
→ root..top whole suffix doomed
→ cleanup Top→Bottom
→ failed Runtime Frames logical retire
→ healthy descendants best-effort close
→ cleanup failure may expand failed set
→ repeat until fixed point
→ preserve accepted root outcome if any
→ otherwise synthesize SUBSYSTEM_RUNTIME_FAILED
→ fresh resume direct healthy Caller or Stack empty
```

同一 Runtime在 Stack出现多次，取最低 occurrence。

Renderer/Subsystem/Platform不得自行计算 unwind root。

---

## 15. Input / Interest Boundary

Main只拥有 InputTarget/Activation；Subsystem拥有 Frame-scoped Interest：

```text
Interest[F]
```

Frame suspension可保留 Interest[F]；fresh Activation可复用配置，但 old Activation Input State/Event不可复用。

Interest不改变 Stack/Activation/InputTarget。

---

## 16. Render / Data Independence

```text
Frame create  != Data create
Frame close   != Data retire
Frame active  != Render visible
Frame suspend != Render hidden
Frame close   != Render destroy
```

Data reconnect不能证明 Frame RPC commit，也不能恢复 revoked Activation。

---

## 17. SDK Projection Constraint

高层 `@loomrealm/subsystem` 可以把 child call/return映射成 async continuation，但必须保留协议事实：

```text
child terminal Outcome resolves call result
recoverable pre-commit rejection may reject
Runtime-fatal/ambiguous must not re-enter business continuation
```

SDK ergonomics不得弱化 Frame authority/commit semantics。

---

## 18. Final Invariants

1. Main是 Frame/Stack/Activation/InputTarget唯一公共 authority；
2. Frame/Activation identity永不复用；
3. stable Stack至多一个 active Top；
4. first activate/resume都使用 fresh Activation；
5. accepted call永久 revoke caller old Activation；
6. accepted outcome不可回滚；
7. Response-before-dependent-RPC；
8. ACK-before-InputTarget publication；
9. timeout/loss ambiguity Runtime-fatal/no retry；
10. failure unwind取 failed Runtime最低 occurrence并处理 whole suffix；
11. fresh final Caller resume；
12. Interest可跨 Activation配置复用但不拥有 authority；
13. Frame/Data/Render lifecycle独立；
14. SDK不得把 Runtime-fatal变成可 catch 后继续的普通业务异常。