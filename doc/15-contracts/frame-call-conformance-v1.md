# Frame / Call Protocol v1 Conformance Profile

> 层级：正式契约 / Conformance Profile  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> 适用协议：`loomrealm.frame-call / 1`  
> 依赖：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 决策记录：[ADR 0015](../decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)  
> 最近复核：2026-08-09

本文只定义如何验证 Frame / Call v1；不新增业务语义。与主协议冲突时，以 [Frame / Call v1](./frame-call-protocol-v1.md) 为准。

## 1. Conformance Claim

正式声明只能使用：

```text
LoomRealm Frame / Call v1 Main Conformant
LoomRealm Frame / Call v1 Subsystem Conformant
LoomRealm Frame / Call v1 Transport Adapter Conformant
```

Report 至少记录：

```text
protocol = loomrealm.frame-call
protocolVersion = 1
fixtureSetRevision = <tested revision>
role = main | subsystem | transport
result = pass
```

不得声明 partial compatibility，例如 `v1 except recovery`、`Batch C compatible`、`v1 with retry extension`。

## 2. Fixture Manifest

```ts
interface FrameCallFixtureManifestV1 {
  readonly fixtureFormatVersion: 1;
  readonly protocol: "loomrealm.frame-call";
  readonly protocolVersion: 1;
  readonly fixtureSetRevision: number;
  readonly fixtures: readonly FrameCallFixtureDescriptorV1[];
}

interface FrameCallFixtureDescriptorV1 {
  readonly id: string;
  readonly role: "main" | "subsystem" | "transport";
  readonly group:
    | "identity-lifecycle"
    | "wire-schema"
    | "transactions"
    | "errors-timeouts"
    | "runtime-failure"
    | "limits"
    | "transport-version";
}
```

`fixtureSetRevision` 只表示覆盖增加，不改变 protocol version。

Behavioral fixture 至少表达：initial normalized state、ordered inputs/events、expected outbound wire/commit、fault injection、forbidden outputs、final normalized state。

## 3. Normalized State / Faults

Main trace 至少归一化：

```text
Stack bottom→top
Frame {frameId, subsystemKey, callerFrameId, state, currentActivationId, outcome}
Runtime ready/failed
InputTarget|null
failedRuntimeKeys
pending Request/fault when relevant
```

Harness 至少支持：

```text
timeout
response-loss
connection-loss
runtime-failed
runtime-exit
semantic-error
protocol-error
late-response
```

Timeout SHOULD 使用 virtual/injectable monotonic clock。

## 4. Identity / Lifecycle Required Fixtures

```text
frame-id-session-unique
frame-id-never-reused
activation-id-session-unique
activation-id-never-reused
caller-immutable
subsystem-binding-permanent
lifecycle-only-five-states
no-frame-ready-status
outcome-not-lifecycle
revoked-activation-never-valid-again
stable-stack-top-active
no-two-inputtargets
frame-render-data-independence
```

### Suspension provenance

```text
explicit-suspend-revokes-activation
explicit-suspend-disables-input
explicit-suspend-produces-administrative-suspended-state
explicit-suspend-no-generic-resume
explicit-suspend-may-close
explicit-suspend-timeout-runtime-fatal
call-suspension-does-not-send-frame-suspend
child-call-suspension-resumes-only-with-returned-child
administrative-suspend-cannot-forge-returned-child
administrative-suspend-cannot-reuse-old-activation
```

这些 fixture 已并入主协议，不再依赖独立 clarification 文档。

## 5. Wire Schema Required Fixtures

```text
exact-seven-methods
exact-method-directions
all-frame-methods-are-request
params-are-object
closed-params-results
initialize-no-caller-field
close-only-frame-id
resume-outcome-plus-replacement-activation
completed-value-required
no-system-call-return
no-frame-result
no-frame-cancel
no-frame-abort-unwind
no-frame-reactivate
extra-field-invalid-params
```

## 6. Transaction Required Fixtures

```text
initial-initialize-before-activate
initial-activate-ack-before-publish
call-accept-suspends-caller
call-accept-revokes-old-activation
call-success-before-child-initialize
ordinary-call-no-reverse-suspend
call-gap-inputtarget-null
child-activate-ack-before-publish
return-accept-stores-outcome
return-accept-revokes-old-activation
return-success-before-close
return-success-not-caller-resumed
close-before-resume
resume-ack-before-publish
same-subsystem-no-nested-reverse-request
same-subsystem-recursive-depth-3
precommit-recoverable-abort
postcommit-no-activation-rollback
accepted-outcome-terminal
```

## 7. Errors / Timeout Required Fixtures

```text
success-known-commit
explicit-error-known-no-commit
explicit-error-still-classified
initialize-rejected-runtime-healthy
initialize-rejected-forward-failed-outcome
activate-timeout-runtime-failed
suspend-timeout-runtime-failed
call-timeout-gate-held
return-timeout-gate-held
late-response-no-recovery
no-retry-after-timeout
jsonrpc-id-not-operation-id
frame-not-found-divergence-fatal
frame-state-divergence-fatal
activation-divergence-fatal
stack-divergence-fatal
ownership-divergence-fatal
protocol-error-fatal
no-caller-driven-cancel
```

## 8. Runtime Failure Required Fixtures

```text
lowest-failed-runtime-occurrence-root
same-runtime-multiple-occurrence
whole-suffix-doomed
top-to-bottom-unwind
failed-runtime-no-frame-rpc
failed-runtime-logical-retire
healthy-descendant-context-absent-no-close
healthy-descendant-one-close
healthy-descendant-no-extra-suspend
existing-close-not-duplicated
cleanup-timeout-expands-failed-set
new-failed-runtime-lower-frame-moves-root
multiple-root-expansion-converges
accepted-completed-outcome-preserved
accepted-cancelled-outcome-preserved
accepted-failed-outcome-preserved
root-without-outcome-subsystem-runtime-failed
intermediate-doomed-not-resumed
recovery-resume-fresh-activation
recovery-resume-ack-before-publish
recovery-resume-failure-expands-root
initial-runtime-failure-stack-empty
zero-frame-runtime-failure-keeps-stack
session-termination-no-forced-resume
```

## 9. Hard Limit Fixtures

每个限制覆盖 exactly-at-limit 与 one-over-limit：

```text
reference-message-1mib
websocket-actual-text-1mib
json-depth-64
business-jsonvalue-512kib
json-string-256kib
object-key-256-bytes
array-elements-16384
object-members-16384
frame-id-128-bytes
activation-id-128-bytes
target-subsystem-key-256-bytes
frame-failure-code-128
frame-failure-message-4096
request-id-max-safe-integer
request-id-reuse-rejected
```

还必须：

```text
nan-rejected
positive-infinity-rejected
negative-infinity-rejected
unsafe-integer-rejected
unpaired-surrogate-rejected
duplicate-json-object-member-rejected
jsonrpc-batch-rejected
invalid-response-is-protocol-fatal
```

Desktop 同时验证 actual complete WebSocket text bytes 与 reference compact equivalent；PWA object carrier验证 reference compact equivalent。

## 10. Deadline Fixtures

Main role：

```text
main-initialize-deadline-present
main-activate-deadline-present
main-suspend-deadline-present
main-resume-deadline-present
main-close-deadline-present
```

Subsystem role：

```text
subsystem-call-deadline-present
subsystem-return-deadline-present
```

共同验证：

```text
deadline-min-1000ms
deadline-max-300000ms
deadline-integer-only
deadline-stable-for-connection
deadline-not-in-rpc-params
deadline-not-game-package-controlled
deadline-uses-monotonic-clock
timeout-remains-ambiguous-no-retry
```

## 11. Request ID Fixtures

同一 sender / Control Connection：

```text
positive-safe-integer-only
zero-rejected
negative-rejected
fraction-rejected
string-id-rejected
null-id-rejected
lifetime-reuse-rejected
pending-collision-across-control-domains-rejected
late-response-cannot-match-new-operation
allocator-exhaustion-does-not-wrap
```

两个方向 sender namespace 独立。

## 12. Desktop WebSocket Transport Fixtures

```text
websocket-text-message-only
one-rpc-per-complete-websocket-message
ordered-per-direction
no-adapter-duplicate
no-adapter-retry
no-jsonrpc-batch
sender-emits-compact-json
actual-text-byte-hard-limit
reference-compact-semantic-limit
whitespace-cannot-bypass-actual-byte-limit
oversize-protocol-failure
connection-loss-propagated
```

WebSocket fragmentation 不改变 complete-message application boundary。

## 13. PWA MessagePort Transport Fixtures

在 Host 已建立 Control MessagePort 的前提下：

```text
one-postmessage-one-rpc-object
plain-json-compatible-only
no-transferable-dependency
undefined-rejected
bigint-rejected
arraybuffer-rejected
messageport-rejected
blob-rejected
reference-compact-json-size-limit
ordered-per-direction
no-adapter-duplicate
no-adapter-retry
connection-loss-propagated
```

Worker/MessagePort 如何建立属于 Host implementation，不属于 Frame conformance。

## 14. Cross-transport Equivalence

Desktop 与 PWA adapter 对同一 abstract trace MUST 产生相同 Frame authority结果：

```text
initial-frame-success
nested-call-return-resume
same-subsystem-recursion
administrative-suspend-close
initialize-business-rejection
call-timeout
return-timeout
runtime-crash-whole-suffix
cleanup-timeout-root-expansion
accepted-outcome-then-crash
recovery-resume-failure
```

允许差异只有 carrier/bootstrap/platform lifecycle integration；不允许差异包括 Frame schema、commit point、timeout含义、retry、suspend provenance、unwind root、outcome与 Activation。

## 15. Version / Binding Fixtures

```text
protocol-id-is-loomrealm-frame-call
protocol-version-is-1
no-frame-hello
no-frame-version-method
no-frame-capability-method
subsystem-hello-versions-remain-control-only
no-runtime-frame-version-downgrade
partial-method-implementation-not-conformant
custom-retry-extension-not-conformant
closed-schema-extension-not-conformant
```

## 16. Fixture Revision Rule

新增 fixture MAY 增加 `fixtureSetRevision` 而保持 protocolVersion=1，只要它验证已经由 Frozen Contract 决定的行为。

如果 fixture 要求改变合法 wire、字段语义、commit point、suspend provenance、error classification、timeout/no-retry、failure unwind或 Frozen limits，则不能只升级 fixture revision，必须走新的协议版本决策。

正式 report MUST记录 tested `fixtureSetRevision`；旧 revision pass 不能自动声明通过更高 revision。

## 17. Final Rule

Frame / Call v1 conformance =：

```text
Frozen Frame / Call v1 Contract
+ applicable fixture catalog
+ explicit fixtureSetRevision
+ same fault → same authority outcome
```

内部 class/thread/queue/transport convenience 不属于兼容性依据。
