# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议、Launcher、模块、跨平台 Transport、内容兼容和端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)、[正式契约目录](../15-contracts/README.md)、[Desktop Node.js Launcher Profile v1](../15-contracts/nodejs-launcher-profile-v1.md)、[Subsystem Control Protocol v1](../15-contracts/subsystem-control-lifecycle-protocol.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-04

## 1. 测试目标

测试不仅验证实现正确，还必须阻止下层实现破坏 Frozen Contract。

第一阶段重点验证：Game Package/Launcher/Subsystem Control v1；Frame A identity/lifecycle/Activation；Batch B exact seven RPC；Batch C transaction/acceptance/publication；Batch D error/timeout/no-retry/cancellation；Frame/Render/Data lifecycle independence。

## 2. 测试层次

```text
Schema / Contract Test
→ State Machine / Transaction Fixture
→ Error / Timeout Fixture
→ Launcher Filesystem / Process Conformance
→ Module Unit Test
→ Transport Conformance Test
→ Runtime Container Interop
→ Component Integration
→ End-to-End Vertical Test
```

Frozen Contract 必须先有机器可校验 fixture，再允许 Main/SDK 各自实现。

## 3. Launcher / Subsystem Control

继续覆盖 Descriptor 集合校验、Entry containment、Host-selected Node/no shell、Token-before-spawn、Supervisor exit classification、hello/status/shutdown、Main-owned shutdown intent、semantic error envelope、no heartbeat/reconnect/restart。

保持：`spawn success ≠ connected ≠ identified ≠ ready`、shutdown accepted≠stopped、unexpected exit including code 0→failure。

## 4. Frame Batch A/B

Batch A fixture：frame ID unique/no-reuse、permanent subsystem assignment、caller immutable、lifecycle only starting/active/suspended/closing/closed、no ready/status/failed-lifecycle、Activation fresh/revoked-never-restored、stable stack、no two InputTargets、Frame close不控制 Render/Data。

Batch B fixture：exact seven method/direction、all Request、closed schema、exact fields、`completed.value` required、no caller wire/close reason/system.call/frame.result/frame.cancel、structural invalid→`-32602`。

## 5. Batch C Transaction Conformance

至少覆盖：

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
close-ack-before-pop
resume-ack-before-publish
same-subsystem-no-nested-reverse-request
recursive-same-subsystem-depth-3
precommit-error-may-abort
postcommit-error-never-restores-revoked-activation
postcommit-return-error-never-erases-outcome
```

Subsystem SDK mutation gate fixture 验证 call/return pending停止 ordinary input/第二个 call/return；Success分别 commit suspended/closing；Explicit precommit Error 可释放 gate。

## 6. Batch D Request Result Conformance

### 6.1 Finite Deadline

```text
frame-initialize-finite-deadline
frame-activate-finite-deadline
frame-suspend-finite-deadline
frame-resume-finite-deadline
frame-close-finite-deadline
frame-call-finite-deadline
frame-return-finite-deadline
```

Batch D 不固定具体毫秒数；fixture 只验证 Request 不允许无限 pending，并允许 Profile 注入 policy。

### 6.2 Success / Error / Ambiguous

```text
success-is-known-commit
explicit-error-is-known-no-commit
timeout-is-ambiguous
response-loss-is-ambiguous
pending-connection-loss-is-ambiguous
```

不得把 timeout fixture 实现成普通 Error Response。

### 6.3 No Retry / Replay

```text
no-retry-after-initialize-timeout
no-retry-after-activate-timeout
no-retry-after-resume-timeout
no-retry-after-call-timeout
no-retry-after-return-timeout
no-operation-id-required
jsonrpc-id-not-idempotency-key
late-success-does-not-recover-runtime
late-error-does-not-recover-runtime
```

Transport mock 应记录 wire count，证明同一 application Frame operation timeout 后没有第二次发送。

## 7. Batch D Recoverable Semantic Errors

### Call target

```text
call-target-not-found-recoverable
call-target-not-found-keeps-caller-active
call-target-not-found-keeps-activation
call-target-unavailable-recoverable
call-target-unavailable-before-acceptance
```

### Initialize rejection

```text
initialize-rejected-has-frame-failure
initialize-rejected-no-context-commit
initialize-rejected-runtime-stays-healthy
accepted-child-init-rejected-forward-failed-outcome
accepted-child-init-rejected-fresh-caller-activation
initial-frame-init-rejected-no-runtime-failure
```

业务 input 不满足条件必须使用 `FRAME_INITIALIZE_REJECTED`，不能错误使用 `-32602`。

## 8. Batch D Divergence / Protocol Fatal

```text
frame-not-found-divergence-fatal
frame-state-mismatch-divergence-fatal
activation-mismatch-divergence-fatal
stack-mismatch-divergence-fatal
ownership-mismatch-divergence-fatal
valid-main-activate-semantic-reject-fatal
valid-main-resume-semantic-reject-fatal
valid-main-close-semantic-reject-fatal
invalid-params-protocol-fatal
method-not-found-protocol-fatal
internal-error-protocol-fatal
```

验证 Runtime failure diagnostics：

```text
FRAME_CONTROL_TIMEOUT
FRAME_CONTROL_DIVERGENCE
FRAME_CONTROL_PROTOCOL_ERROR
```

这些 diagnostics 不得被测试成 Caller-visible `FrameOutcome.failed.error.code`；后者由 Batch E 冻结。

## 9. Mutation Gate on Ambiguous Sender Request

Subsystem SDK 必须覆盖：

```text
call-timeout-does-not-release-gate
call-timeout-does-not-reuse-old-activation
call-timeout-stops-frame-processing
call-timeout-reports-runtime-failure
return-timeout-does-not-release-gate
return-timeout-does-not-restore-active
return-timeout-stops-frame-processing
```

如果 Control Connection 同时丢失，允许由 Subsystem Control connection-loss fixture 触发 Main failure；不得再补 Frame Request retry。

## 10. Cancellation Conformance

```text
frame-cancel-method-rejected
caller-cannot-remotely-cancel-child
callee-return-cancelled-valid
cancelled-is-outcome-not-lifecycle
session-shutdown-not-frame-cancel
```

## 11. Main System Tests

- transaction single-flight / acceptance atomicity；
- Response-before-dependent-RPC；
- Renderer publication only after ACK；
- finite deadline manager；
- explicit Error classifier；
- ambiguous timeout→Runtime failure；
- late Response diagnostic-only；
- recoverable initialize rejection；
- divergence/protocol failure classification；
- no retry/replay/idempotency journal；
- no two InputTargets；Main不维护 Render Registry。

## 12. Subsystem SDK / Test Subsystems

SDK API保持 `onInitialize/onActivate/onSuspend/onResume/onClose/call/return`，增加 deadline/mutation-gate/failure coordination。

推荐 test-subsystems：

```text
frame-init-business-reject
frame-rpc-never-respond
frame-rpc-late-respond
frame-state-divergence
activation-divergence
same-subsystem-recursive
no-reentrant-handler
callee-cancelled
stale-activation
render-without-frame
```

## 13. Renderer / User Input / Render

Renderer fixture继续验证 activate/resume ACK before publish、revoked never republished、InputTarget null gap、no two InputTargets。Frame Control timeout/divergence 不通过 Renderer reconnect恢复。

User Input 只允许 current active frame+activation；Render 使用独立 identity。

## 14. E2E

正常 E2E 保留 bootstrap→initial→nested call→return→resume→Renderer reload→shutdown。

增加 failure E2E：

```text
call target unavailable → caller continues
child initialize rejected → failed outcome / fresh resume
outbound activate timeout → Runtime failure
subsystem frame.call timeout → mutation gate remains / Runtime failure
late response after timeout → no recovery
control divergence → Runtime failure
```

Batch E 前 E2E 不硬编码 Runtime failed 后具体 suffix unwind，只验证 Batch D 已正确产生 failure classification并停止正常 Frame processing。

## 15. Golden / Fixture 规则

适合 Golden：Launcher/Control messages、Frame Schema、Batch C transaction traces、Batch D semantic errors和 timeout traces、Connection auth、User Input sequence、Render State/Event、Content Response。

已 Frozen Batch fixture 发生不兼容改变时必须先有 ADR / compatibility decision。
