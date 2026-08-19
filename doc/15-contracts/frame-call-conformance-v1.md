# Frame / Call Protocol v1 Conformance Profile

> 层级：正式契约 / Conformance Profile  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> 适用协议：`loomrealm.frame-call / 1`  
> 依赖：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)、[Runtime Control Profile v1](./runtime-control-profile-v1.md)  
> 决策记录：[ADR 0015](../decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)、[ADR 0018](../decisions/0018-preimplementation-v1-closure.md)  
> 最近复核：2026-08-19

本文只定义如何验证 Frame / Call v1；与主协议冲突时以主协议为准。

2026-08-19 首次实现前的 transport mapping reset 将 PWA fixture从 structured object carrier改为 `postMessage(string)`；Frame transaction/wire method semantics不变。

---

## 1. Conformance Claim

只能声明：

```text
LoomRealm Frame / Call v1 Main Conformant
LoomRealm Frame / Call v1 Subsystem Conformant
LoomRealm Frame / Call v1 Transport Adapter Conformant
```

Report至少：

```text
protocol = loomrealm.frame-call
protocolVersion = 1
fixtureSetRevision = <tested revision>
role = main | subsystem | transport
result = pass
```

不得声明 partial compatibility。

---

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

fixture revision只表示覆盖增加/当前 v1 preimplementation correction，不成为业务协议协商字段。

---

## 3. Normalized State / Faults

Main trace至少：

```text
Stack bottom→top
Frame {frameId, subsystemKey, callerFrameId, state, currentActivationId, outcome}
Runtime ready/failed
InputTarget|null
failedRuntimeKeys
pending Request/fault when relevant
```

Harness至少支持：

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

Timeout SHOULD使用 virtual/injectable monotonic clock。

---

## 4. Identity / Lifecycle

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

Suspension：

```text
explicit-suspend-revokes-activation
explicit-suspend-disables-input
explicit-suspend-administrative-state
explicit-suspend-no-generic-resume
explicit-suspend-may-close
explicit-suspend-timeout-runtime-fatal
call-suspension-does-not-send-frame-suspend
child-call-suspension-resumes-only-with-returned-child
administrative-suspend-cannot-forge-returned-child
administrative-suspend-cannot-reuse-old-activation
```

---

## 5. Wire Schema

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

---

## 6. Transactions

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

---

## 7. Error / Timeout

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

---

## 8. Runtime Failure

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

---

## 9. Hard Limits

每项 exactly-at-limit / one-over-limit：

```text
actual-json-text-message-1mib
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

共同：

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

所有 transport都直接验证实际 UTF-8 JSON text carrier unit；不存在 PWA object/reference-equivalent独立计量规则。

---

## 10. Deadlines

Main：

```text
main-initialize-deadline-present
main-activate-deadline-present
main-suspend-deadline-present
main-resume-deadline-present
main-close-deadline-present
```

Subsystem：

```text
subsystem-call-deadline-present
subsystem-return-deadline-present
```

共同：

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

---

## 11. Request ID

同一 sender / Control Connection：

```text
positive-safe-integer-only
zero/negative/fraction/string/null-rejected
lifetime-reuse-rejected
pending-collision-across-control-domains-rejected
late-response-cannot-match-new-operation
allocator-exhaustion-does-not-wrap
```

两个 sender方向 namespace独立。

---

## 12. Desktop WebSocket Transport

```text
websocket-text-message-only
one-json-text-rpc-per-complete-message
ordered-per-direction
no-adapter-duplicate
no-adapter-retry
no-jsonrpc-batch
sender-emits-compact-json
actual-text-byte-hard-limit
oversize-protocol-failure
connection-loss-propagated
```

WebSocket fragmentation不改变 complete-message boundary。

---

## 13. PWA MessagePort Transport

在 Platform已 provisioning Control MessagePort前提：

```text
postmessage-payload-is-string
one-json-text-rpc-per-postmessage
ordered-per-direction
no-adapter-duplicate
no-adapter-retry
no-jsonrpc-batch
actual-utf8-text-byte-hard-limit
structured-object-payload-rejected
undefined/bigint/application-host-object-not-representable
connection-loss-propagated
```

MessagePort/Worker如何创建转移属于 Platform implementation，不属于 Frame conformance。

---

## 14. Cross-transport Equivalence

相同 abstract trace：

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

Desktop/PWA MUST产生相同 Frame authority/outcome/Activation/unwind结果。

允许差异只有 carrier/bootstrap/platform lifecycle integration。

---

## 15. Version / Binding

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
runtime-control-profile-uses-json-text-carrier
```

---

## 16. Fixture Revision Rule

新增 fixture MAY增加 `fixtureSetRevision` 而保持 protocolVersion=1，只要验证当前 Frozen Contract已经决定的行为。

ADR 0018记录的首次实现前 transport-mapping correction需要新的 fixtureSetRevision，旧 revision不能自动声明通过当前 revision。

后续若要改变 method/field/authority/commit/suspend/error/timeout/unwind/limit semantics，则必须重新经过协议版本/冻结治理；ADR 0018的 preimplementation特例不能无限延伸。

---

## 17. Final Rule

```text
Frame / Call v1 conformance
=
current Frozen Frame / Call v1
+ applicable fixture catalog
+ explicit fixtureSetRevision
+ same fault → same authority outcome
```

内部 class/thread/queue/transport convenience不属于 compatibility依据。