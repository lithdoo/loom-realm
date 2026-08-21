# Frame / Call Protocol v1 Conformance Profile

> 层级：正式契约 / Conformance Profile  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> 适用协议：`loomrealm.frame-call / 1`  
> 依赖：[Frame / Call Protocol v1](./frame-call-protocol-v1.md)、[Runtime Control Profile v1](./runtime-control-profile-v1.md)  
> 决策记录：[ADR 0015](../decisions/0015-freeze-frame-call-protocol-v1-batch-f.md)、[ADR 0018](../decisions/0018-preimplementation-v1-closure.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)  
> 最近复核：2026-08-21

本文只定义如何验证 Frame / Call v1；与主协议冲突时以主协议为准。

Current first-implementation corrections：

```text
ADR 0018
    PWA structured application object
    → postMessage(string)

ADR 0021
    same-sender Request ID
    → strict monotonic

    duplicate JSON source member fixture
    → follow frozen Wire / ECMAScript JSON.parse observable semantics

    deadline / Response barrier / terminal mechanics
    → explicit implementation-level conformance
```

Frame transaction/authority/Outcome/unwind semantics不变。

---

## 1. Conformance Claim

Only：

```text
LoomRealm Frame / Call v1 Main Conformant
LoomRealm Frame / Call v1 Subsystem Conformant
LoomRealm Frame / Call v1 Transport Adapter Conformant
```

Report at minimum：

```text
protocol = loomrealm.frame-call
protocolVersion = 1
fixtureSetRevision = <tested revision>
role = main | subsystem | transport
result = pass
```

No partial compatibility claim。

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

fixture revision only records coverage/current-v1 preimplementation corrections；not a business protocol negotiation field。

---

## 3. Normalized State / Faults

Main trace at minimum：

```text
Stack bottom→top
Frame {frameId, subsystemKey, callerFrameId, state, currentActivationId, outcome}
Runtime ready/failed
InputTarget|null
failedRuntimeKeys
pending Request/fault when relevant
```

Harness supports：

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

Timeout fixtures MUST use deterministic injectable relative scheduler or equivalent virtual elapsed-time source；wall-clock sleeping alone cannot be the only conformance proof。

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

## 6. Transactions / Response Barrier

```text
initial-initialize-before-activate
initial-activate-ack-before-publish
call-accept-suspends-caller
call-accept-revokes-old-activation
call-success-before-child-initialize
call-response-send-accepted-before-child-initialize
ordinary-call-no-reverse-suspend
call-gap-inputtarget-null
child-activate-ack-before-publish
return-accept-stores-outcome
return-accept-revokes-old-activation
return-success-before-close
return-response-send-accepted-before-close
return-success-not-caller-resumed
close-before-resume
resume-ack-before-publish
same-subsystem-no-nested-reverse-request
same-subsystem-recursive-depth-3
precommit-recoverable-abort
postcommit-no-activation-rollback
accepted-outcome-terminal
```

Response barrier fixture MUST prove dependent `afterResponse`/reverse RPC starts only after the corresponding Response has been accepted by the local `MessageCarrier.send()` ordering boundary。

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
unknown-semantic-error-code-fatal
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

Each exactly-at-limit / one-over-limit：

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
```

Common representation/profile：

```text
nan-rejected
positive-infinity-rejected
negative-infinity-rejected
unsafe-integer-rejected
unpaired-surrogate-rejected
jsonrpc-batch-rejected
invalid-response-is-protocol-fatal
outbound-shared-dag-size-preflight-bounded
```

Source duplicate-member correction：

```text
duplicate-json-source-follows-wire-json-parse
parsed-result-still-closed-schema
no-private-duplicate-member-parser
```

A valid fixture SHOULD demonstrate last parsed member semantics using the current Wire parser；it MUST NOT require lexical duplicate rejection that `parseJsonText` cannot observe。

All transports validate actual UTF-8 JSON text carrier unit；no PWA object/reference-equivalent sizing rule。

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

Common：

```text
deadline-min-1000ms
deadline-max-300000ms
deadline-integer-only
deadline-stable-for-connection
deadline-not-in-rpc-params
deadline-not-game-package-controlled
deadline-uses-relative-monotonic-scheduler
deadline-armed-before-first-carrier-send
deadline-covers-send-and-response
response-before-timeout-cancels-deadline
timeout-before-response-wins-settlement
timeout-remains-ambiguous-no-retry
```

Late response after timeout MUST NOT settle the same operation twice or restore Frame/Activation authority。

---

## 11. Request ID

Same sender / Control Connection：

```text
positive-safe-integer-only
zero-negative-fraction-string-null-rejected
strict-monotonic-increase
control-frame-shared-namespace
remote-id-regression-rejected
remote-id-reuse-rejected
pending-collision-across-control-domains-impossible-with-allocator
late-response-cannot-match-new-operation
allocator-exhaustion-does-not-wrap
```

Two sender direction namespaces independent。

Expected local allocator trace：

```text
1, 2, 3, ... Number.MAX_SAFE_INTEGER
```

Gaps MAY occur only if an allocated ID is consumed by a failed/pre-send/terminal attempt；an allocated value MUST never be reused and future IDs remain greater。

---

## 12. Runtime Control Dispatcher Mechanics

Conformance fixtures for the enclosing shared Control Connection：

```text
single-carrier-reader
control-frame-share-dispatcher
response-correlation-not-blocked-by-long-handler
inbound-request-notification-order-preserved
single-serialized-writer
pending-response-correlated-connection-wide
terminal-settles-pending-once
```

This section verifies Frame operates correctly inside Runtime Control Profile；it does not create a separate Frame dispatcher contract。

---

## 13. Desktop WebSocket Transport

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

WebSocket fragmentation does not change complete-message boundary。

---

## 14. PWA MessagePort Transport

With Platform already provisioning Control MessagePort：

```text
postmessage-payload-is-string
one-json-text-rpc-per-postmessage
ordered-per-direction
no-adapter-duplicate
no-adapter-retry
no-jsonrpc-batch
actual-utf8-text-byte-hard-limit
structured-object-payload-rejected
undefined-bigint-application-host-object-not-representable
connection-loss-propagated
```

MessagePort/Worker creation/transfer belongs to Platform implementation，not Frame conformance。

---

## 15. Cross-transport Equivalence

Same abstract trace：

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

Desktop/PWA MUST produce same Frame authority/outcome/Activation/unwind results。

Allowed differences only carrier/bootstrap/platform lifecycle integration。

---

## 16. Version / Binding

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
runtime-control-request-id-is-strict-monotonic
```

---

## 17. Fixture Revision Rule

Adding fixtures MAY increase `fixtureSetRevision` while `protocolVersion=1` when they verify semantics already fixed by current Frozen Contract/current preimplementation correction。

ADR 0018 and ADR 0021 corrections require a fixture revision that includes their current transport/request-ID/Wire-alignment/mechanics fixtures；older revision cannot automatically claim current conformance。

After first conformant compatibility obligation exists, changes to method/field/authority/commit/suspend/error/timeout/unwind/limit semantics require normal protocol version/freeze governance；ADR 0018/0021 are not permanent exemptions。

---

## 18. Final Rule

```text
Frame / Call v1 conformance
=
current Frozen Frame / Call v1
+ current Runtime Control Profile mechanics where applicable
+ applicable fixture catalog
+ explicit fixtureSetRevision
+ same fault → same authority outcome
```

Internal class/thread/queue/transport convenience is not compatibility evidence。
