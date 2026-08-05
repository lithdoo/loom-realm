# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议、Launcher、Frame transaction/error/recovery/limits、Transport、内容兼容和端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)、[正式契约目录](../15-contracts/README.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)、[Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)  
> 最近复核：2026-08-05

## 1. 测试目标

测试不仅验证实现正确，还必须阻止实现破坏 Frozen Contract。

Frame / Call Protocol v1 的设计与 conformance catalog 已全部 Frozen；当前实施任务是把 catalog落成 executable fixture/harness，并分别验证 Main、Subsystem、Desktop/PWA Transport adapter。

## 2. 测试层次

```text
Schema / JSON Profile Test
→ Identity / State Machine Fixture
→ Transaction Golden Trace
→ Error / Timeout Fixture
→ Runtime Failure Unwind Fixture
→ Limit / Request ID / Deadline Fixture
→ Transport / Version Conformance
→ Launcher / Supervisor Conformance
→ Module Unit Test
→ Runtime Container Interop
→ Component Integration
→ End-to-End
```

## 3. Frame v1 Normative Source

测试身份：

```text
protocol = loomrealm.frame-call
version = 1
```

Batch A-F只用于 fixture分组，不是独立兼容等级。

Fixture最低必测项见 [Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)。本文件说明实施方式和 E2E组合，不重新定义协议。

## 4. Identity / Lifecycle / Wire

至少覆盖：

```text
frame/activation unique + no reuse
caller immutable
subsystem binding permanent
five lifecycle states only
no Frame ready/status
outcome != lifecycle
stable Stack / no two InputTargets
exact seven methods/directions
all Frame methods are Request
closed schema
completed.value required
no caller wire / close reason
no frame.result/cancel/abort/unwind/version/capabilities
no JSON-RPC Batch
```

## 5. Transaction Golden Traces

至少：

```text
initial-initialize-before-activate
initial-activate-ack-before-publish
call-accept-suspends-caller
call-success-before-child-initialize
ordinary-call-no-reverse-suspend
call-gap-inputtarget-null
child-activate-ack-before-publish
return-accept-stores-outcome
return-success-before-frame-close
return-success-not-caller-resumed
close-before-resume
resume-ack-before-publish
same-subsystem-no-nested-reverse-request
recursive-same-subsystem-depth-3
precommit-recoverable-abort
postcommit-never-restores-revoked-activation
accepted-outcome-never-erased
```

## 6. Error / Timeout / Mutation Gate

```text
success-is-known-commit
explicit-error-is-known-no-commit
explicit-error-still-requires-classification
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

## 7. Runtime Failure Root / Cleanup

```text
failure-root-is-lowest-failed-runtime-occurrence
failure-root-not-nearest-occurrence
whole-root-to-top-suffix-is-doomed
same-runtime-multiple-frame-recursion
failure-unwind-top-to-bottom
failure-barrier-clears-input-target
failed-runtime-frame-does-not-receive-close
failed-runtime-frame-logical-retire-without-ack
healthy-descendant-context-absent-no-close
healthy-descendant-context-exists-one-close
healthy-descendant-does-not-require-extra-suspend
existing-close-request-is-not-duplicated
healthy-descendant-close-ack-before-removal
```

## 8. Fixed-point Expansion

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
F3 B   ← initial B failure
F4 C
F5 D

close(F5) timeout
→ D failed
→ root F3 → F1
→ whole Stack unwind
```

## 9. Transaction-in-flight Recovery

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

## 10. Outcome / Surviving Caller

```text
accepted-completed-outcome-survives-runtime-crash
accepted-cancelled-outcome-survives-runtime-crash
accepted-failed-outcome-survives-runtime-crash
root-without-outcome-generates-subsystem-runtime-failed
intermediate-doomed-frames-are-not-resumed
only-final-root-direct-caller-is-resumed
recovery-resume-uses-fresh-activation
recovery-resume-ack-before-inputtarget-publish
recovery-resume-timeout-fails-caller-runtime
same-subsystem-failed-runtime-does-not-resume-lower-same-runtime-frame
initial-runtime-failure-stack-empty
zero-frame-runtime-failure-keeps-current-stack
```

## 11. JSON / Number Profile Tests

```text
plain-json-values-accepted
undefined-rejected
nan-rejected
positive-infinity-rejected
negative-infinity-rejected
bigint-rejected
unsafe-integer-rejected
safe-integer-boundaries
unpaired-surrogate-rejected
duplicate-json-member-rejected
negative-zero-reference-encodes-as-zero
```

PWA额外确保 Structured Clone不会让 ArrayBuffer/MessagePort/Blob等绕过 validator。

## 12. Wire Limit Boundary Tests

每个 limit同时测试 exactly-at-limit 与 one-over-limit：

```text
reference message 1 MiB
Desktop actual WebSocket text 1 MiB
JSON depth 64 / 65
business JsonValue 512 KiB + 1
JsonValue string 256 KiB + 1
object key 256 / 257 bytes
array elements 16384 / 16385
object members 16384 / 16385
frameId 128 / 129 bytes
activationId 128 / 129 bytes
targetSubsystemKey 256 / 257 bytes
FrameFailure.code 128 / 129
FrameFailure.message 4096 / 4097 bytes
```

Business/PWA semantic size使用 Reference Compact JSON UTF-8 encoding。

Desktop还必须单独验证实际 carrier hard cap：构造一个 compact equivalent `<1 MiB`、但因 insignificant whitespace使实际 WebSocket text `>1 MiB` 的消息，必须在解析路径中拒绝，不能让 compact-size检查绕过实际输入资源上限。

## 13. JSON-RPC Request ID Tests

同一 sender / Connection：

```text
positive-safe-integer-only
zero-rejected
negative-rejected
fraction-rejected
string-id-rejected
null-id-rejected
max-safe-id-accepted
over-max-id-rejected
lifetime-id-reuse-rejected
pending-id-collision-across-control-domains-rejected
late-response-cannot-bind-new-request
allocator-exhaustion-does-not-wrap
```

Main与Subsystem相反方向可以同时使用相同数值 ID。

## 14. Deadline Profile Tests

按 sender role验证：

```text
Main
    initialize / activate / suspend / resume / close deadline present

Subsystem
    call / return deadline present
```

共同验证：

```text
min-1000ms
max-300000ms
integer-only
connection-stable-profile
deadline-not-in-rpc-params
deadline-not-game-package-controlled
deadline-uses-monotonic-clock
timeout-still-ambiguous-no-retry
```

不要求 Main配置 call/return，也不要求 Subsystem配置五个 Main→Subsystem方法；两端 deadline 数值也无需相同。

使用 virtual/injectable clock，不依赖真实长时间 sleep。

## 15. Desktop WebSocket Conformance

```text
one-complete-text-message-one-rpc
binary-frame-not-frame-v1-carrier
no-jsonrpc-batch
sender-emits-compact-json
ordered-per-direction
no-adapter-duplicate
no-adapter-retry
actual-text-byte-hard-limit
reference-compact-semantic-limit
whitespace-cannot-bypass-hard-limit
oversize-protocol-failure
connection-loss-propagated
```

WebSocket fragmentation不能改变 application message边界。

## 16. PWA MessagePort Conformance

在 Control Port已经安全建立后：

```text
one-postmessage-one-rpc-object
plain-json-compatible-only
no-transferable-dependency
bigint-rejected
arraybuffer-rejected
messageport-rejected
blob-rejected
same-reference-size-limit
ordered-per-direction
no-adapter-duplicate
no-adapter-retry
```

PWA Bootstrap/credential/Port establishment单独测试，不属于 Frame v1 application conformance。

## 17. Cross-transport Golden Trace

Desktop WebSocket与PWA MessagePort至少对以下同一 abstract trace产生相同 authority outcome：

```text
initial-frame-success
nested-call-return-resume
same-subsystem-recursion
initialize-business-rejection
call-timeout
return-timeout
runtime-crash-whole-suffix
cleanup-timeout-root-expansion
accepted-outcome-then-crash
recovery-resume-failure
```

差异只能来自 carrier/bootstrap/platform lifecycle integration。

## 18. Version / Profile Tests

```text
protocol-id-loomrealm-frame-call
protocol-version-1
no-frame-hello
no-frame-version-method
no-frame-capability-method
subsystem-hello-versions-remain-control-only
no-runtime-frame-version-downgrade
partial-frame-method-support-not-conformant
custom-retry-extension-not-conformant
closed-schema-extension-not-conformant
nonstandard-envelope-extension-not-conformant
```

## 19. Main System Tests

- Stack mutation single-flight；
- Frame Protocol Validator；
- connection-wide outbound Request ID allocator；
- deadline profile/monotonic scheduler；
- RuntimeFailureUnwindCoordinator failed-set/fixed-point；
- accepted outcome preservation；
- no retry/replay；
- no two InputTargets；
- Main不维护 Render Registry。

## 20. Subsystem SDK / Test Subsystems

SDK验证 `onInitialize/onActivate/onSuspend/onResume/onClose/call/return`、preflight validator、Request ID allocator、mutation gate、deadline/failure coordination。

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
oversize-message
unsafe-json-number
request-id-reuse
callee-cancelled
stale-activation
render-without-frame
```

## 21. E2E

正常：bootstrap→initial→nested call→return→resume→Renderer reload→shutdown。

Failure：child crash→Caller `SUBSYSTEM_RUNTIME_FAILED`；ancestor crash→whole suffix；same Runtime repeated→lowest occurrence；cleanup timeout→root expansion；accepted outcome + crash→original outcome；resume failure→further expansion；initial failure→empty Stack。

Interop：同一 scripted scenario分别运行 Desktop WebSocket与PWA MessagePort adapter并比较 normalized Frame authority trace。

## 22. Fixture Revision / CI

Executable fixture corpus SHOULD跟踪：

```text
fixtureFormatVersion = 1
protocol = loomrealm.frame-call
protocolVersion = 1
fixtureSetRevision = N
```

新增验证既有 Frozen v1语义的 fixture只提升 fixtureSetRevision，不改变 protocolVersion。

CI最终应分别报告：

```text
Frame v1 Main conformance
Frame v1 Subsystem conformance
Frame v1 Desktop Transport conformance
Frame v1 PWA Transport conformance
```

每份 conformance report MUST记录 tested `fixtureSetRevision`。

当前文档冻结了 conformance要求；在这些 executable checks实际建立并通过前，不得把“协议已 Frozen”误写成“实现已经 conformant”。
