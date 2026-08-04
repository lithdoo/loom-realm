# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议、Launcher、模块、跨平台 Transport、内容兼容和端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)、[正式契约目录](../15-contracts/README.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)、[Content API v1](../15-contracts/content-api-v1.md)  
> 最近复核：2026-08-04

## 1. 测试目标

测试不仅验证实现正确，还必须阻止下层实现破坏 Frozen Contract。

第一阶段重点验证：

- Game Package / Launcher / Supervisor / Subsystem Control v1；
- Frame / Call Batch A identity/lifecycle/Activation；
- Batch B exact seven RPC wire surface；
- Batch C transaction / acceptance / publication / rollback barriers；
- Caller relationship 不下发给 Subsystem；
- `frame.call` 不等待最终 Child outcome，也不依赖 reverse `frame.suspend`；
- `frame.return` success 不等于 close/resume 完成；
- activate/resume ACK 先于对应 InputTarget publication；
- post-commit failure 不恢复 revoked Activation；
- Frame/Render/Data Connection 生命周期独立。

## 2. 测试层次

```text
Schema / Contract Test
→ State Machine / Transaction Fixture
→ Launcher Filesystem / Process Conformance
→ Module Unit Test
→ Transport Conformance Test
→ Runtime Container Interop
→ Component Integration
→ End-to-End Vertical Test
→ Performance / Backpressure Test
```

Frozen Contract 必须先有机器可校验 fixture，再允许 Main/SDK 各自实现。

## 3. Game Package / Launcher / Subsystem Control

继续覆盖 Descriptor 集合校验、Entry containment、Host-selected Node/no shell、Token-before-spawn、Supervisor exit classification、hello/status/shutdown、Main-owned shutdown intent、wire limits、semantic error envelope、no heartbeat/reconnect/restart。

特别保持：

```text
spawn success ≠ connected ≠ identified ≠ ready
shutdown accepted ≠ stopped
unexpected exit including code 0 → failure
```

## 4. Frame / Call Batch A Conformance

至少：

```text
frame-id-unique
frame-id-no-reuse
permanent-subsystem-assignment
caller-immutable
lifecycle-starting-active-suspended-closing-closed
no-frame-ready
no-frame-status
no-frame-failed-lifecycle
outcome-failed-still-closes
activation-first
activation-resume-new-id
activation-revoked-rejected
activation-never-restored
stack-top-active
lower-frame-suspended
no-two-input-targets
runtime-not-ready-reject-frame
runtime-stopping-reject-frame
frame-close-does-not-destroy-render
frame-close-does-not-close-data-connection
```

## 5. Frame / Call Batch B Schema Conformance

唯一合法方法：

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

必须拒绝 `system.call / system.return / frame.ready / frame.status / frame.result / frame.cancel / frame.close(reason)`。

所有方法为 Request；params/result closed schema；structural invalid → `-32602`。

字段 fixture：

```text
initialize: frameId + input
activate:   frameId + new activationId
suspend:    frameId + current activationId
resume:     frameId + new activationId + returnedFrameId + result
close:      frameId only
call:       frameId + current activationId + targetSubsystemKey + input
return:     frameId + current activationId + result
```

`FrameOutcome.completed.value` REQUIRED，无值=`null`；failed outcome 与 JSON-RPC Error 分离。

## 6. Frame / Call Batch C Transaction Conformance

### 6.1 Initial Frame

```text
initial-initialize-before-activate
initial-activate-ack-before-publish
initial-no-target-before-activate-ack
initial-initialize-error-no-target
initial-activate-error-close-context
initial-activate-error-never-published
```

断言：`frame.activate` ACK 前 Renderer/Main publication fixture 不得出现新 Activation。

### 6.2 Call Acceptance

```text
call-precommit-reject-keeps-caller-active
call-precommit-reject-keeps-old-activation
call-accept-suspends-caller
call-accept-revokes-old-activation
call-accept-pushes-starting-child
call-accept-clears-input-target
call-success-before-child-initialize
call-success-does-not-mean-child-active
call-ordinary-flow-does-not-send-frame-suspend
```

特别验证 Main 的 wire trace：

```text
IN  frame.call Request
OUT frame.call Result
OUT frame.initialize Child
OUT frame.activate Child
```

不得是：

```text
IN  frame.call Request
OUT frame.suspend Caller
... wait ...
OUT frame.call Result
```

### 6.3 Sender Mutation Gate

Subsystem SDK fixture：

```text
call-pending-stops-ordinary-input-dispatch
call-pending-blocks-second-call
call-pending-blocks-return
call-error-releases-gate-keeps-old-activation
call-success-commits-local-suspended

return-pending-stops-ordinary-input-dispatch
return-pending-blocks-second-return
return-pending-blocks-call
return-error-releases-gate-keeps-frame-active
return-success-commits-local-closing
```

Input pending 时具体 drop/buffer/reset 不在 Batch C fixture 冻结；只验证不会继续进入业务 Handler。

### 6.4 Child Activation / Publication

```text
child-initialize-after-call-response
child-activate-after-initialize-ack
child-activate-ack-before-publish
call-gap-input-target-null
old-caller-target-never-republished-after-call-commit
no-two-input-targets-call-transition
```

Renderer Control fixture MAY coalesce intermediate revision，但最终 trace 必须满足 causal barrier。

### 6.5 Post-call Failure

```text
call-postcommit-initialize-error-no-old-activation-restore
call-postcommit-initialize-error-failed-outcome
call-postcommit-initialize-error-fresh-caller-resume
call-postcommit-activate-error-closes-child
call-postcommit-activate-error-fresh-caller-resume
call-postcommit-failure-never-restores-a1
```

Child initialize 没有 commit 时不要求 close target Context；initialize ACK 后 activate Error 必须 close。

### 6.6 Return Acceptance

```text
return-precommit-reject-keeps-child-active
return-precommit-reject-keeps-a2-valid
return-accept-stores-terminal-outcome
return-accept-revokes-a2
return-accept-enters-closing
return-accept-clears-input-target
return-success-before-frame-close
return-success-does-not-mean-closed
return-success-does-not-mean-caller-resumed
```

wire trace：

```text
IN  frame.return Request
OUT frame.return Result
OUT frame.close Child
... ACK ...
OUT frame.resume Caller
```

### 6.7 Close / Pop / Resume

```text
close-ack-before-pop
closing-frame-remains-live-before-close-ack
caller-resume-after-child-pop
resume-uses-fresh-activation
resume-ack-before-publish
resume-does-not-follow-with-activate
old-child-target-never-republished-after-return-commit
no-two-input-targets-return-transition
```

### 6.8 Initial Frame Return

```text
initial-return-accepts-outcome
initial-return-close-before-stack-empty
initial-return-stack-empty-no-input-target
```

Session exit policy不在 Frame fixture 中硬编码。

### 6.9 Same-Subsystem / Recursive Reentrancy

必须用单一模拟 Control Connection 验证：

```text
same-subsystem-call-new-frame-id
same-subsystem-call-new-activation
same-subsystem-no-nested-reverse-request
recursive-same-subsystem-depth-3
recursive-stack-f1-f2-suspended-f3-active
recursive-return-unwinds-with-fresh-activations
```

测试 handler 可以故意设置为“入站 Request handler pending 时拒绝处理反向 Request”，协议实现仍必须通过，以证明 v1 不依赖 bidirectional nested-request reentrancy。

### 6.10 Pre/Post Commit Classification

```text
precommit-error-may-abort
postcommit-error-never-restores-revoked-activation
postcommit-return-error-never-erases-outcome
```

Ambiguous timeout / lost Response 留到 Batch D，不在这里指定 retry。

## 7. `frame.suspend` Conformance

Batch C 明确 ordinary call 不使用它。

独立测试：

```text
main-initiated-suspend-ack-then-revoke
main-initiated-suspend-error-no-commit
suspend-never-allows-old-activation-resume
suspend-does-not-change-render-data-runtime
```

不要写“call must emit frame.suspend”的 fixture。

## 8. Main System Tests

- Frame mutation transaction single-flight；
- Call Acceptance Commit atomicity；
- Return Acceptance Commit atomicity；
- Response-before-dependent-RPC ordering；
- Renderer publisher only emits committed Activation；
- post-commit forward recovery；
- same-Subsystem recursive call without nested request handling；
- Main 不发布两个 ordinary InputTargets；
- Main 不维护 Render Registry。

## 9. Subsystem SDK / Test Subsystems

SDK contract API：

```text
onInitialize(frameId,input)
onActivate(frameId,activationId)
onSuspend(frameId,activationId)
onResume(frameId,activationId,returnedFrameId,outcome)
onClose(frameId)
call(frameId,activationId,targetSubsystemKey,input)
return(frameId,activationId,outcome)
```

SDK 必须把 call success 映射为 Caller suspended/revoked，return success 映射为 Child closing，并实现 pending mutation gate。

推荐 test-subsystems：

```text
same-subsystem-recursive
no-reentrant-handler
call-child-init-reject
call-child-activate-reject
return-normal
return-nested
stale-activation
multi-frame-input
render-without-frame
```

## 10. Renderer / User Input / Render

Renderer Control 尚未冻结 wire，但测试 adapter 必须接受以下 invariant：

```text
activate/resume ACK before publish
revoked Activation never republished
InputTarget=null transaction gap allowed
no two InputTargets
```

User Input 只允许 current active `frameId+activationId`；Render 使用独立 identity，不因 Frame transaction 自动 hide/destroy/resync。

## 11. E2E

Desktop E2E：

```text
bootstrap all required Runtime
→ hello / ready
→ initial initialize / activate ACK / publish
→ nested frame.call acceptance
→ child initialize / activate / publish
→ child frame.return acceptance
→ close child
→ caller resume fresh Activation / publish
→ same-Subsystem recursive variant
→ Renderer reload restores only committed Activation
→ normal subsystem.shutdown
```

Batch D 前 E2E 不自行增加 retry/idempotency 或 timeout recovery 作为兼容要求。

## 12. Golden / Fixture 规则

适合 Golden：Launcher/Control messages、Frame Batch B schema、Batch C transaction traces、Connection auth、User Input sequence、Render State/Event、Content Response。

已 Frozen Batch fixture 发生不兼容改变时必须先有 ADR / compatibility decision。
