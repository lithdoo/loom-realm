# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议、Launcher、Frame transaction/error/recovery、Transport、内容兼容和端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)、[正式契约目录](../15-contracts/README.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 测试目标

测试不仅验证实现正确，还必须阻止实现破坏 Frozen Contract。

当前重点：Launcher/Subsystem Control；Frame Batch A identity/lifecycle/Activation；B exact wire；C transaction/publication；D error/timeout/no-retry；E deterministic Runtime-failure unwind；Frame/Render/Data independence。

## 2. 测试层次

```text
Schema / Contract Test
→ State Machine / Transaction Fixture
→ Error / Timeout Fixture
→ Runtime Failure Unwind Fixture
→ Launcher / Supervisor Conformance
→ Module Unit Test
→ Transport Conformance
→ Runtime Container Interop
→ Component Integration
→ End-to-End
```

## 3. Frame Batch A/B

Batch A：Frame ID unique/no-reuse、permanent subsystem assignment、caller immutable、lifecycle only five states、no ready/status/failed-lifecycle、Activation fresh/revoked-never-restored、stable Stack、no two InputTargets、Frame/Render independence。

Batch B：exact seven methods/directions、all Request、closed schema、exact fields、`completed.value` required、no caller wire/close reason/system.call/frame.result/frame.cancel/frame.abort/frame.unwind、structural invalid→`-32602`。

## 4. Batch C Transaction Conformance

至少：

```text
initial-initialize-before-activate
initial-activate-ack-before-publish
call-accept-suspends-caller
call-accept-revokes-old-activation
call-success-before-child-initialize
call-ordinary-flow-does-not-send-frame-suspend
call-gap-input-target-null
child-activate-ack-before-publish
return-accept-stores-terminal-outcome
return-accept-revokes-old-activation
return-success-before-frame-close
return-success-does-not-mean-caller-resumed
close-ack-before-normal-pop
resume-ack-before-publish
same-subsystem-no-nested-reverse-request
recursive-same-subsystem-depth-3
precommit-recoverable-error-may-abort
postcommit-never-restores-revoked-activation
accepted-outcome-never-erased
```

## 5. Batch D Result / Error Conformance

Finite deadline：七方法不得无限 pending。

```text
success-is-known-commit
explicit-error-is-known-no-commit
explicit-error-still-requires-failure-classification
timeout-is-ambiguous
response-loss-is-ambiguous
pending-connection-loss-is-ambiguous
```

No retry：

```text
no-retry-after-initialize-timeout
no-retry-after-activate-timeout
no-retry-after-resume-timeout
no-retry-after-call-timeout
no-retry-after-return-timeout
jsonrpc-id-not-idempotency-key
late-response-does-not-recover-runtime
```

Recoverable：

```text
call-target-not-found-keeps-caller-active
call-target-unavailable-before-acceptance
initialize-rejected-has-frame-failure
initialize-rejected-runtime-stays-healthy
accepted-child-init-rejected-forward-failed-outcome
accepted-child-init-rejected-fresh-caller-activation
```

Fatal：

```text
frame-not-found-divergence-fatal
frame-state-mismatch-divergence-fatal
activation-mismatch-divergence-fatal
stack-mismatch-divergence-fatal
ownership-mismatch-divergence-fatal
valid-activate-semantic-error-does-not-local-close-repair
invalid-params-protocol-fatal
method-not-found-protocol-fatal
```

Mutation gate：

```text
call-timeout-does-not-release-gate
call-timeout-does-not-reuse-old-activation
return-timeout-does-not-release-gate
return-timeout-does-not-restore-active
fatal-explicit-error-does-not-release-gate-to-normal-processing
```

## 6. Batch E Root Selection

必须验证 Runtime failure是 key级而不是 Frame级：

```text
failure-root-is-lowest-failed-runtime-occurrence
failure-root-not-nearest-occurrence
failure-does-not-remove-only-same-key-frames
whole-root-to-top-suffix-is-doomed
same-runtime-multiple-frame-recursion
same-runtime-separated-by-other-subsystems
```

示例 fixture：

```text
F1 A
F2 B   ← expected root
F3 C
F4 B
F5 D

failed={B}
expected suffix=F2..F5
```

## 7. Batch E Cleanup Ordering

```text
failure-unwind-top-to-bottom
failure-barrier-clears-input-target
no-new-call-return-from-doomed-suffix
failed-runtime-frame-does-not-receive-close
failed-runtime-frame-logical-retire-without-ack
failed-runtime-active-frame-revokes-public-activation
healthy-descendant-context-absent-no-close
healthy-descendant-context-exists-one-close
healthy-descendant-does-not-require-extra-suspend
existing-close-request-is-not-duplicated
healthy-descendant-close-ack-before-removal
```

特别验证 normal `close ACK before pop` 与 failure-path exception：

```text
healthy Runtime → ACK required
failed Runtime  → ACK impossible/not required; logical retire
```

## 8. Batch E Fixed-point Expansion

```text
cleanup-close-timeout-adds-runtime-to-failed-set
cleanup-close-divergence-adds-runtime
cleanup-protocol-error-adds-runtime
new-failed-runtime-with-lower-frame-moves-root-down
new-failed-runtime-without-lower-frame-keeps-root
multiple-root-expansions-converge
fixed-point-eventually-resumes-or-empty
no-retry-during-fixed-point-unwind
```

关键 fixture：

```text
F1 D
F2 A
F3 B   ← B initially fails
F4 C
F5 D

close(F5) timeout
→ D failed
→ root must move F3 → F1
→ entire Stack unwinds
```

## 9. Transaction-in-flight Recovery

覆盖 failure barrier与已有 RPC race：

```text
crash-before-call-acceptance-uses-precommit-state
crash-after-call-acceptance-preserves-suspended-caller
crash-during-child-initialize
crash-after-initialize-before-activate
activate-response-after-barrier-never-publishes-activation
crash-before-return-acceptance-no-terminal-outcome
crash-after-return-acceptance-preserves-outcome
close-pending-at-barrier-not-resent
resume-response-after-frame-becomes-doomed-not-published
late-response-from-failed-runtime-diagnostic-only
```

只允许 Main已 commit facts进入 recovery。

## 10. Outcome Preservation / Caller Failure

```text
accepted-completed-outcome-survives-runtime-crash
accepted-cancelled-outcome-survives-runtime-crash
accepted-failed-outcome-survives-runtime-crash
intermediate-doomed-accepted-outcome-not-mutated
root-without-outcome-generates-subsystem-runtime-failed
runtime-diagnostic-code-not-required-in-caller-failure-data
```

Caller-visible platform code必须：

```text
SUBSYSTEM_RUNTIME_FAILED
```

但仅在 final root没有 accepted outcome时生成。

## 11. Surviving Caller Recovery

```text
intermediate-doomed-frames-are-not-resumed
only-final-root-direct-caller-is-resumed
recovery-resume-uses-fresh-activation
recovery-never-restores-old-caller-activation
recovery-resume-ack-before-inputtarget-publish
recovery-resume-timeout-fails-caller-runtime
recovery-resume-failure-expands-root
same-subsystem-failed-runtime-does-not-resume-lower-same-runtime-frame
```

最后一项尤其重要：如果 lower Frame 与 failed root属于同 Runtime，则它不可能是 surviving healthy Caller；lowest-root算法必须自动把 root下移到更低 occurrence。

## 12. Initial / Zero-frame / Session Cases

```text
initial-runtime-failure-unwinds-whole-stack
initial-root-no-caller-resume
initial-root-without-outcome-records-subsystem-runtime-failed
initial-accepted-outcome-preserved
zero-frame-runtime-failure-keeps-current-stack
zero-frame-runtime-failure-keeps-current-inputtarget
session-termination-does-not-force-recovery-resume
```

## 13. Renderer / Input / Render

Renderer fixture：

```text
failure-barrier-publishes-no-old-target
recovery-gap-allows-inputtarget-null
old-activation-never-republished
new-recovery-activation-only-after-resume-ack
no-two-inputtargets-during-unwind
renderer-reload-does-not-cancel-runtime-failure
```

Frame unwind不得隐式删除 healthy Runtime Render；Runtime failure后的 Data/Render cleanup单独测试。

## 14. Main System Tests

- Frame Stack transaction single-flight；
- RuntimeFailureUnwindCoordinator failed-set/fixed-point；
- lowest root across repeated subsystem keys；
- logical retirement vs healthy close；
- pending RPC state tracking；
- accepted outcome preservation；
- root outcome synthesis；
- only final Caller resume；
- resume failure expansion；
- no retry/replay；
- no two InputTargets；
- Main不维护 Render Registry。

## 15. Subsystem SDK / Test Subsystems

SDK继续验证 `onInitialize/onActivate/onSuspend/onResume/onClose/call/return`、mutation gate/deadline/failure coordination。

推荐 test-subsystems：

```text
frame-init-business-reject
frame-rpc-never-respond
frame-rpc-late-respond
frame-state-divergence
activation-divergence
same-subsystem-recursive
no-reentrant-handler
runtime-crash-on-close
runtime-crash-on-resume
runtime-multiple-frame-occurrence
callee-cancelled
stale-activation
render-without-frame
```

## 16. Transport Conformance

Desktop WebSocket 与 PWA MessagePort必须跑相同 A-E trace。Transport不能增加 application retry、改变 root算法、在 failed Runtime上补 close RPC或把 reconnect当 Frame recovery。

## 17. E2E

正常：bootstrap→initial→nested call→return→resume→Renderer reload→shutdown。

Failure：

```text
child Runtime crash → Caller gets SUBSYSTEM_RUNTIME_FAILED
ancestor Runtime crash → whole suffix unwind
same Runtime repeated → lowest occurrence root
healthy descendant close → Runtime survives
cleanup timeout → root expands downward
accepted return outcome + crash → original outcome delivered
resume failure → further root expansion
initial Runtime failure → Stack empty
zero-frame Runtime failure → current unrelated Stack unchanged
```

## 18. Golden / Fixture 规则

适合 Golden：Launcher/Control messages、Frame Schema、Batch C transaction traces、Batch D error/timeout traces、Batch E unwind traces、Connection auth、User Input sequence、Render State/Event、Content Response。

已 Frozen A-E fixture发生不兼容改变时必须先有 ADR/版本决策。
