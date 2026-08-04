# ADR 0013：冻结 Frame / Call Protocol v1 Batch D

> 状态：Accepted  
> 日期：2026-08-04  
> 影响范围：Frame / Call Protocol v1 error / timeout / retry / cancellation  
> 依赖：ADR 0010 / 0011 / 0012

## Context

Batch A 已冻结 Frame identity/lifecycle/Activation；Batch B 已冻结七个 JSON-RPC Request 与 wire schema；Batch C 已冻结 call/return transaction、acceptance barrier、InputTarget publication barrier 与 `Pre-commit abort / Post-commit forward recovery`。

Batch C 仍留下一个关键缺口：当 Request 没有获得干净的 Success 或 Error Response 时，发送方可能无法知道对端到底有没有应用操作。如果 v1 在这种 ambiguous state 下尝试自动 retry、replay 或猜测 commit 结果，就需要 operation id、dedup journal、replay cache 和 reconnect/resync 等额外协议，并会破坏已冻结的 one-shot Activation / no-rollback 模型。

同时需要区分两类显式 Error：正常可恢复拒绝，以及表明 Main 与 Subsystem Frame Control state 已经分叉的错误。

## Decision

### 1. 三种 Request 结果

Frame / Call v1 把 Request 结果分为：

```text
Success Response
    → RPC postcondition 已知 commit

Explicit Error Response
    → RPC postcondition 已知未 commit

Timeout / Response loss / pending-request connection loss
    → applied/not-applied unknown
    → ambiguous control state
```

Ambiguous state MUST NOT 被当成普通 recoverable Error。

### 2. 有限 deadline，但数值不在 Batch D 固定

所有七个 Frame / Call Request MUST 有 finite deadline。

具体 timeout 毫秒数属于 Host / Transport Profile policy；Batch D 不固定 Desktop/PWA 的默认秒数。

### 3. v1 不做 application-level retry

七个 Frame / Call Request：

```text
frame.initialize
frame.activate
frame.suspend
frame.resume
frame.close
frame.call
frame.return
```

MUST NOT 在 timeout、connection loss 或 reconnect 后自动 retry/replay。

v1 不定义：

```text
operationId
idempotencyKey
dedup journal
replay cache
state-changing request replay
```

JSON-RPC `id` 只用于 Request/Response correlation，不是业务幂等 identity。

### 4. Ambiguous result 是 Runtime-fatal

当 Main 对 Main→Subsystem Frame RPC 无法确定 applied/not-applied 时，Main MUST 停止向该 Runtime 发新的正常 Frame Control operation，并将该 Runtime 进入 failure path。

当 Subsystem 对自己发出的 `frame.call` / `frame.return` 无法确定 Main 是否 acceptance-commit 时，Subsystem MUST 保持 mutation gate、停止正常 Frame processing，并进入 Runtime failure path；不得解除 gate 后继续使用旧 Activation。

一旦 timeout failure 已 commit，迟到 Response 只用于 diagnostics，MUST NOT 恢复 Runtime/Frame state、Activation 或撤销 failure。

### 5. Recoverable semantic errors

Batch D 冻结最小 recoverable registry：

```text
FRAME_CALL_TARGET_NOT_FOUND
FRAME_CALL_TARGET_UNAVAILABLE
FRAME_INITIALIZE_REJECTED
```

前两个只允许发生在 `frame.call` Call Acceptance Commit 之前；Caller 保持 active，旧 Activation 继续有效。

`FRAME_INITIALIZE_REJECTED` 表示目标 Runtime 正常处理 `frame.initialize`，但业务上拒绝建立本次 Frame Context；target Runtime 保持 healthy，且 initialize postcondition没有 commit。

`FRAME_INITIALIZE_REJECTED` MUST 携带 `FrameFailure`。如果 Child call 已经被 Main acceptance-commit，则 Main 将该 rejection forward-resolve 为 Child `FrameOutcome.failed`，并以 fresh Activation 恢复 surviving Caller；不得恢复 Caller 的旧 Activation。

### 6. Control divergence semantic errors

Batch D 冻结：

```text
FRAME_NOT_FOUND
FRAME_STATE_MISMATCH
ACTIVATION_MISMATCH
FRAME_STACK_MISMATCH
FRAME_OWNERSHIP_MISMATCH
```

这些错误表示双方对 Frame authority/state 的理解不一致，属于 Runtime-fatal control divergence，不作为普通业务拒绝继续运行。

合法 Main-issued `frame.activate / frame.suspend / frame.resume / frame.close` 除 transport/implementation failure 外 MUST 成功；若对端以 Frame lifecycle/identity/Activation semantic error 拒绝，按 control divergence 处理。

### 7. JSON-RPC protocol/schema errors是 control-fatal

Frame / Call v1 使用标准 JSON-RPC protocol errors。Batch B 已冻结 structural invalid params → `-32602`。

在 Frozen method surface 上出现 parse/invalid request/method-not-found/invalid-params/internal-error，说明实现不兼容、协议消息损坏或 control implementation failure，不能作为游戏业务错误继续正常 Frame operation。

### 8. Semantic error envelope

Frame / Call v1 复用 Subsystem Control v1 的 LoomRealm semantic envelope：

```text
error.code = -32000
error.data.code = stable semantic code
```

`FRAME_INITIALIZE_REJECTED` 的 `error.data` 额外携带 `failure: FrameFailure`；其他 Frozen semantic error data 不携带开放式 metadata bag。

### 9. Runtime failure diagnostic categories

Frame Control 导致 Runtime failure 时，至少使用以下诊断类别：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

它们属于 Runtime failure diagnostics / `subsystem.status(failed)` error code 语义，不等同于最终返回给 Caller 的 `FrameOutcome.failed.error.code`；Caller-visible Runtime failure outcome 由 Batch E 冻结。

### 10. Caller-driven cancellation 不进入 v1

v1 不定义 `frame.cancel`，也不允许 suspended Caller 远程取消 Child。

`FrameOutcome.cancelled` 仍合法，但只表示当前 active Frame 自己通过 `frame.return({type:"cancelled"})` 结束。

Session termination 使用更高层 Session/Subsystem shutdown 流程，不通过 Frame cancellation 表达。

## Consequences

优点：

- ambiguous delivery 不需要猜测或重新同步；
- 不需要 operation journal / dedup / replay cache；
- 与 one-shot Activation、post-commit no-rollback 完全一致；
- same-Subsystem recursive call 仍保持简单；
- Batch E 可以只面对“Runtime 已 failed，如何 deterministic unwind”这一问题。

代价：

- 单次 Frame Control timeout 会让整个相关 Runtime 进入 failure path，而不是尝试局部恢复；
- v1 不提供 caller-driven cancellation；
- 对实现正确性要求较高，Frame state divergence 会被快速升级为 Runtime failure。

## Rejected Alternatives

### Retry every timed-out RPC

拒绝。无法知道第一次是否已应用，会要求 operation identity、dedup journal 和 replay semantics。

### Treat timeout as normal Error

拒绝。普通 Error 已由 Batch C 定义为 postcondition明确未 commit；timeout 无法提供这一保证。

### Resync Frame state after divergence

拒绝。需要新增 Frame snapshot/reconcile protocol，并可能破坏 Activation never-revive / accepted outcome terminal 的冻结规则。

### Add caller-driven `frame.cancel` in v1

拒绝。会引入 cancel vs return / close / Runtime failure / call-startup races；第一版不承担该复杂度。

## Follow-up

Batch E 冻结 Runtime failure 后的 multi-Frame suffix unwind、transaction 中 Runtime crash、initial Frame failure、best-effort cleanup 和 surviving Caller resume。

Batch F 冻结 wire limits、完整 conformance fixtures、Desktop/PWA profile/version completion，并最终冻结整个 Frame / Call Protocol v1。
