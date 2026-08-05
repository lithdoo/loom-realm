# Frame / Call Protocol v1 Conformance Profile

> 层级：正式契约 / Conformance Profile  
> 状态：Active / Normative  
> Profile 版本：1  
> 稳定程度：Frozen  
> 适用协议：`loomrealm.frame-call / 1`  
> 依赖：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 决策记录：[ADR 0015：冻结 Batch F](../decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)  
> 最近复核：2026-08-05

本文定义如何验证一个 Main、Subsystem 或 Control Transport Adapter 是否符合 Frame / Call Protocol v1。它不新增业务语义；若本文与主协议冲突，以 [Frame / Call Protocol v1](./frame-call-protocol-v1.md) 为准。

## 1. Conformance Claim

正式声明只能使用：

```text
LoomRealm Frame / Call v1 Main Conformant
LoomRealm Frame / Call v1 Subsystem Conformant
LoomRealm Frame / Call v1 Transport Adapter Conformant
```

完整产品必须通过其承担的全部角色。

正式 conformance report MUST 至少记录：

```text
protocol = loomrealm.frame-call
protocolVersion = 1
fixtureSetRevision = <tested revision>
role = main | subsystem | transport
result = pass
```

不得把以下措辞作为正式互操作声明：

```text
v1 except Runtime recovery
Batch C compatible
mostly v1 compatible
v1 with custom retry extension
```

## 2. Fixture Manifest Model

机器可执行 fixture corpus SHOULD 使用：

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

`protocolVersion` 与 `fixtureSetRevision` 不同：前者改变 wire/semantic compatibility；后者只表示测试覆盖增加。

## 3. Golden Trace Model

Behavioral fixture 至少描述：

```text
fixture id / role
initial normalized authority state
ordered input/events
expected outbound wire
expected Main/Subsystem commit
fault injection
forbidden outputs
expected final normalized state
```

实现内部 class、thread、function 或 queue 名称不得成为通过 fixture 的必要条件。

## 4. Normalized Authority State

Main trace 至少可归一化为：

```ts
type FixtureFrameState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";

interface FixtureFrameRecord {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;
  readonly state: FixtureFrameState;
  readonly currentActivationId: string | null;
  readonly outcome: FrameOutcome | null;
}

interface FixtureInputTarget {
  readonly subsystemKey: string;
  readonly frameId: string;
  readonly activationId: string;
}
```

Trace 还需表达：Stack bottom→top、Runtime ready/failed、InputTarget|null、failedRuntimeKeys、pending Request/fault events when relevant。

## 5. Fault Injection Vocabulary

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

Timeout fixture SHOULD 使用 virtual/injectable monotonic clock，不依赖真实长时间 sleep。

## 6. Batch A Required Fixtures

至少：

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
frame-render-independence
```

## 7. Batch B Required Fixtures

至少：

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
extra-field-invalid-params
```

## 8. Batch C Required Fixtures

至少：

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

## 9. Batch D Required Fixtures

至少：

```text
success-known-commit
explicit-error-known-no-commit
explicit-error-still-classified
initialize-rejected-runtime-healthy
initialize-rejected-forward-failed-outcome
activate-timeout-runtime-failed
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

## 10. Batch E Required Fixtures

至少：

```text
lowest-failed-runtime-occurrence-root
same-runtime-multiple-occurrence
whole-suffix-doomed
top-to-bottom-unwind
failed-runtime-no-close-rpc
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

## 11. Batch F Limit Fixtures

每个限制 MUST 覆盖 exactly-at-limit 与 one-over-limit：

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

还必须验证：

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

Message size fixture 必须区分：

```text
Desktop text carrier
    actual complete WebSocket text UTF-8 bytes <= 1 MiB
    AND reference compact equivalent <= 1 MiB

PWA object carrier
    reference compact equivalent <= 1 MiB
```

应包含“compact后小于1 MiB、但实际 WebSocket text因大量 insignificant whitespace超过1 MiB”的拒绝 fixture，证明实际 carrier hard cap不能被 compact-size绕过。

## 12. Deadline Profile Fixtures

Deadline fixture按 sender role验证：

### Main role

```text
main-initialize-deadline-present
main-activate-deadline-present
main-suspend-deadline-present
main-resume-deadline-present
main-close-deadline-present
```

### Subsystem role

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

Fixture 不要求 Main 与 Subsystem 使用相同 deadline 数值，也不要求某角色配置自己永远不会发送的方法。

## 13. Request ID Fixtures

同一发送方同一 Control Connection：

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

Main→Subsystem 与 Subsystem→Main 的 ID namespace独立，因此双方 MAY 同时存在相同数值的 outbound ID。

## 14. Desktop WebSocket Transport Fixtures

至少：

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

底层 WebSocket fragmentation 不改变“one complete WebSocket message = one application message”。

## 15. PWA MessagePort Transport Fixtures

在 Control MessagePort 已建立的前提下至少：

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
connection-loss-runtime-lifecycle-mapping-by-profile
```

PWA Bootstrap Credential / Worker creation 如何建立 Control MessagePort 是独立 Profile，不属于 Frame / Call application conformance。

## 16. Cross-transport Semantic Equivalence

Desktop 与 PWA adapter MUST 对同一抽象 trace 产生相同 Frame authority结果。

至少使用：

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

允许差异只有 carrier/bootstrap/platform lifecycle event；不允许差异包括 Frame schema、commit point、timeout含义、retry、unwind root、outcome与 Activation。

## 17. Version / Binding Fixtures

至少：

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

## 18. Fixture Revision Rule

新增 fixture MAY 增加 `fixtureSetRevision` 而保持 Frame / Call protocolVersion=1，前提是新增 fixture 只验证已经由 Frozen Contract 决定的行为。

如果为了让 fixture通过必须改变：合法 wire、字段语义、commit point、error classification、timeout/no-retry、failure unwind或 Frozen limits，则不能只升级 fixture revision，必须先走新的协议/ADR兼容性决策。

正式 conformance report MUST写明 tested `fixtureSetRevision`。较旧 revision的 pass记录不能自动宣称通过较新 corpus。

## 19. 推荐实现目录

```text
packages/frame-call-protocol/
├── src/
├── conformance/
│   └── v1/
│       ├── manifest.json
│       ├── schema/
│       ├── transactions/
│       ├── errors-timeouts/
│       ├── runtime-failure/
│       ├── limits/
│       └── transport/
└── test/
```

目录结构不是 wire Contract；fixture id/expected behavior才是兼容性依据。

## 20. Final Rule

Frame / Call v1 conformance 的判断标准是：

```text
Frozen Contract
+
本 Profile 的适用 fixture catalog
+
记录明确的 fixtureSetRevision
+
相同 fault 下的相同 authority outcome
```

Transport便利性、内部恢复技巧或“基本兼容”不能覆盖正式 v1 规则。
