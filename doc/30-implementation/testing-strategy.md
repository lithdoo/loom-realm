# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：Game/Platform PREPARE、Game Package snapshot、Runtime Control mechanics、Main logical bootstrap、protocol conformance、Role/SDK control-flow、Runner/provisioning、Hostra/PWA semantic equivalence 与 E2E  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[独立分包与发布架构](./package-architecture.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0021](../decisions/0021-runtime-control-preimplementation-closure.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-21

测试目标不是“消息能通”，而是证明每一层不能绕过 authority/failure/lifecycle/PREPARE invariant。

---

## 1. Test Layers

```text
Game Entry document representation
→ Game Package validation/snapshot
→ matching Launcher Game consumption
→ Platform launch manifest / exact join / PREPARE
→ LogicalGameBootstrap projection
→ Main logical bootstrap

Foundation MessageCarrier + Wire primitives
→ Runtime Control profile limits
→ one reader/dispatcher + one writer
→ Control/Frame protocol state/correlation
→ role-specific peers
→ Main/Subsystem Host authority/control-flow mapping

Renderer/Data/Content protocols
→ RuntimeHosting/Runner/provisioning integration
→ Platform composition
→ Hostra/PWA abstract-trace equivalence
→ E2E
```

Package-local fixture stays with nearest capability；Platform/E2E fixture stays repository-level。

---

## 2. Unified Carrier Model

All message-oriented profiles share：

```text
one carrier unit = one UTF-8 JSON text string
```

Tests：

```text
websocket-text-unit
messageport-postmessage-string-unit
memory-carrier-string-unit
structured-clone-object-not-accepted-as-application-unit
no-binary-websocket-for-current-profiles
no-application-retry-or-duplicate
per-direction-order
observable-close/loss
production-adapter-no-unbounded-physical-buffering
```

Foundation tests only opaque message/order/terminal facts；domain package tests JSON/protocol semantics。

---

## 3. `@loomrealm/game-package`

### Representation / schema

```text
valid-minimal-game-entry
malformed-json
formatVersion-exact-1
closed-top-level-schema
closed-initial-schema
closed-descriptor-schema
Descriptor-exactly-key
invalid-direct-JsonValue
```

### Key semantics

```text
key-non-empty
whitespace-only-follows-current-formal-contract
key-uniqueness-case-sensitive
no-trim
no-case-fold
no-unicode-normalization
duplicate-error-points-to-later-occurrence
declaration-order-preserved
```

### Initial input opacity

Schema-level platform-looking fields rejected；same names inside `initial.input` accepted including `module/env/platform/launcher/__proto__/constructor`。

### Validated snapshot

```text
validated-result-detached-from-source
source-mutation-after-validation-no-effect
returned-containers-deeply-frozen
nested-input-deeply-frozen
caller-input-not-mutated/frozen
deep-input-no-call-stack-overflow
shared-acyclic-graph-no-exponential-copy
proto-key-remains-data
no-getter-toJSON-invocation
```

### Errors / boundary

```text
GamePackageError-class-code-path-stable
Wire-error-not-required-by-consumer
malformed-json-mapped
runtime-dependency-only-wire
no-main/launcher/node/filesystem/fetch
root-export-only
npm-pack-dry-run
```

---

## 4. Consumer Boundary Tests

Prevent architecture regression：

```text
main-package-has-no-game-package-dependency
main-bootstrap-fixture-does-not-use-GameEntryV1
business-package-has-no-game-package-or-launcher-dependency
business-package-has-no-runtime-control-direct-dependency
```

Hostra/PWA launcher：

```text
launcher-prepare-consumes-Game-source-without-manual-game-package-step
Game-validation-failure-happens-inside-launcher-PREPARE
prepared-result-not-released-before-full-PREPARE
logical-bootstrap-contains-only-keys-and-initial
logical-bootstrap-has-no-formatVersion-brand-module-path-url
```

---

## 5. Main Logical Bootstrap

Main local tests use hand-built/fake `LogicalGameBootstrap` directly：

```text
complete-key-registry-install
initial-target-input-install
no-formatVersion-document-metadata
no-GamePackageError-handling
no-GameEntry-parser
```

Defensive Main assertions MUST NOT recreate GameEntryV1 validator。

---

## 6. Hostra Launcher PREPARE

```text
raw-common-Game-entry-consumed-by-Hostra-launcher
valid-launch-hostra-json
closed-hostra-schema
format-version
binding-key-duplicate/missing/undeclared
exact-game-hostra-key-set
module-mjs-only
absolute-traversal-url-backslash-rejection
installation-containment
symlink-junction-reparse-escape-rejection
regular-file-required
all-required-modules-resolved-before-first-spawn
node-runtime-capability-preflight
host-runner-entry-capability-preflight
manifest-cannot-select-node-runner-argv-env-token-endpoint
immutable-plan-lookup-by-key
logical-bootstrap-projection
```

Every PREPARE negative case：

```text
process spawn count = 0
business module import count = 0
Runtime Control establish count = 0
```

---

## 7. PWA Launcher PREPARE

```text
raw-common-Game-entry-consumed-by-PWA-launcher
valid-launch-pwa-json
closed-pwa-schema
format-version
binding-key-duplicate/missing/undeclared
exact-game-pwa-key-set
module-mjs-only
absolute-traversal-external-url-backslash-rejection
installation-registry-resolution
same-origin-trusted-installation-policy
all-required-modules-resolved-before-first-worker
worker-runner-capability-preflight
manifest-cannot-select-runner-ports-credentials-CSP
immutable-plan-lookup-by-key
logical-bootstrap-projection
```

Every PREPARE negative case：

```text
Worker creation count = 0
business module import count = 0
Runtime Control establish count = 0
```

---

## 8. `@loomrealm/runtime-control` — Representation / Limits

M3 package tests MUST begin from deterministic `MessageCarrier`，not WebSocket/MessagePort implementations。

```text
actual-utf8-message-1mib-exact-and-over
json-depth-64-exact-and-over
no-jsonrpc-batch
malformed-json-protocol-fatal
invalid-jsonrpc-envelope-protocol-fatal
unpaired-surrogate-rejected
control-token-version-error-limits
frame-business-string-key-member-array-identity-limits
invalid-response-protocol-fatal
unknown-semantic-code-protocol-fatal
```

Wire alignment：

```text
duplicate-json-source-follows-wire-json-parse
parsed-result-still-closed-schema
runtime-control-does-not-add-private-json-parser
```

Outbound resource safety：

```text
bounded-size-measurement-stops-over-limit
shared-dag-wire-expansion-counted-per-occurrence
no-arbitrarily-large-stringify-before-limit-check
```

---

## 9. Runtime Control — Reader / Dispatcher / Writer

```text
exactly-one-code-path-iterates-carrier-messages
control-frame-share-one-dispatcher
responses-correlate-connection-wide
response-correlation-not-blocked-by-long-role-handler
request-notification-dispatch-preserves-inbound-order
one-serialized-outbound-writer
concurrent-high-level-sends-preserve-writer-order
```

Critical deadlock regression：

```text
handler A remains pending
→ later carrier unit is Response to local outbound Request
→ reader correlates Response without waiting handler A
```

This proves `single reader != blocking handler loop`。

---

## 10. Runtime Control — Request IDs

Same sender/connection：

```text
positive-safe-integer-only
local-allocation-1-2-3
strict-monotonic-increase
control-frame-share-one-namespace
remote-id-equal-last-rejected
remote-id-lower-than-last-rejected
allocated-id-never-reused-after-send-error
allocated-id-never-reused-after-timeout
late-response-cannot-match-new-operation
max-safe-integer-allowed
allocator-exhaustion-no-wrap
```

Two sender directions remain independent。

No connection-lifetime all-seen ID Set should be required by conformance；O(1) last-remote-ID validation is sufficient under current contract。

---

## 11. Runtime Control — Hello / Control State

```text
hello-first
hello-one-shot
hello-request-only
protocol-version-list-1..16
protocol-version-entry-positive-safe-integer
protocol-version-no-duplicate
select-control-1
unsupported-version-semantic-error
```

Authentication ownership：

```text
auth-callback-invoked-only-after-wire-schema-version-valid
auth-callback-receives-key-token-material
runtime-control-does-not-own-token-registry
invalid-key-token-consumed-mismatch-map-generic-auth-failure
duplicate-control-connection-separate-code
accepted-auth-binds-connection-key
```

Control legality：

```text
status-before-hello-fatal
frame-before-hello-fatal
identified-initializing-ready-legal
identified-ready-legal
repeated-status-fatal
ready-to-initializing-fatal
stopping-to-ready-fatal
stopping-requires-main-shutdown-intent
failed-blocks-normal-operation
stopped-never-produced-by-runtime-control
```

---

## 12. Runtime Control — Frame Surface / Response Barrier

```text
exact-seven-frame-requests
exact-method-directions
closed-params-results-outcome-error-data
no-extra-frame-method
recoverable-frame-semantic-codes-classified
fatal-divergence-codes-classified
```

Response barrier：

```text
handler-success-result-encoded-before-afterResponse
handler-semantic-error-encoded-before-afterResponse
carrier-send-response-resolves-before-afterResponse-starts
frame-call-response-before-child-initialize
frame-call-response-before-child-activate
frame-return-response-before-close
frame-return-response-before-resume
afterResponse-not-run-if-response-send-terminally-fails
```

Main/Subsystem authority mutation itself is tested in role packages；M3 only proves causal mechanics。

---

## 13. Runtime Control — Call/Return Mutation Gate

Protocol-side：

```text
first-call-pending
second-call-rejected-locally
return-while-call-pending-rejected-locally
call-while-return-pending-rejected-locally
recoverable-precommit-error-releases-gate
timeout-terminal-does-not-release-old-activation-for-normal-use
fatal-semantic-error-terminal
```

M4 Subsystem Host separately proves pending mutation also stops ordinary input dispatch/business continuation。

---

## 14. Runtime Control — Deadlines

Use deterministic injected scheduler；do not rely only on wall-clock sleep。

Frame：

```text
frame-deadline-min-1000
frame-deadline-max-300000
fraction-zero-negative-over-max-rejected
frame-deadline-stable-per-connection
frame-deadline-not-in-rpc-params
```

Control：

```text
hello-deadline-finite-positive
shutdown-deadline-finite-positive
hello-shutdown-values-independent-from-frame
```

Lifecycle/race：

```text
deadline-armed-before-first-carrier-send
deadline-covers-send-stall-and-response-wait
response-settlement-first-cancels-deadline
timeout-settlement-first-wins
request-id-remains-consumed-after-timeout
late-response-diagnostics-only
no-retry-replay-after-timeout
shutdown-timeout-does-not-fabricate-stopped
```

---

## 15. Runtime Control — Terminal

```text
carrier-closed-terminal
carrier-lost-terminal
protocol-fatal-terminal
request-timeout-terminal
local-handler-throw-local-fatal
terminal-first-wins
terminal-immutable
pending-requests-settle-exactly-once
all-deadline-handles-retired
no-new-normal-send-after-terminal
close-idempotent
late-response-cannot-recover-terminal
no-same-attempt-control-reconnect
```

Role-specific mapping of terminal to Runtime failure/stopped is tested in Main/Supervisor later；M3 tests only typed connection fact。

---

## 16. Runtime Control — Package Boundary

```text
root-export-only
no-control-frame-profile-testing-subpath
runtime-dependencies-exactly-foundation-wire
foundation-used-for-messagecarrier-only
wire-used-for-generic-json-jsonrpc
no-main-subsystem-game-package-launcher-dependency
no-node-websocket-messageport-worker-fetch-filesystem
no-generic-rpc-public-framework
no-schema-dsl-public-framework
npm-pack-dry-run
```

Declaration/API tests SHOULD fail if internal dispatcher/request allocator/pending table becomes public accidentally。

---

## 17. Frozen Frame Authority Conformance

Frame role/authority tests remain independently required：

```text
exact-seven-RPC
Response-before-dependent-RPC
ACK-before-publication
post-commit-no-rollback
accepted-outcome-preserved
ambiguous-mutation-Runtime-fatal
whole-suffix-fixed-point-unwind
fresh-surviving-Caller-resume
```

ADR 0021 does not reopen these semantics。

---

## 18. Subsystem Author / Host SDK

M4 real consumer qualification：

```text
subsystem-host-uses-SubsystemRuntimeControlPeer
business-author-root-does-not-import-runtime-control
initialize-does-not-start-handler
activate-starts-handler-exactly-once
pending-call-return-gates-ordinary-input
child-completed-cancelled-failed-resolves-FrameOutcome
precommit-recoverable-rejection-preserves-Activation
Runtime-fatal-never-reenters-business-continuation
uncaught-business-exception-maps-to-frame-failed-when-authority-healthy
administrative-suspend-aborts-and-discards-late-completion
```

M3 does not build fake author SDK to claim this closure。

---

## 19. Main Authority / Fake Platform Ports

M5 real consumer qualification implemented：

```text
main-root-public-boundary
logical-bootstrap-defensive-install
MainPlatform-scheduler-bootstrapTokens-runtimeHosting-only
bootstrap-token-freshness-and-duplicate-fail-closed
RuntimeHosting-launch-request-key-plus-token-only
main-uses-real-MainRuntimeControlPeer
hello-auth-callback-owns-token-registration-consumption
required-runtime-identified-ready-gate
initial-frame-activate-ACK-before-publication
cross-subsystem-nested-call-return
same-subsystem-recursion-no-reentrant-deadlock
recoverable-target-rejection-preserves-Activation
child-runtime-loss-whole-suffix-unwind-fresh-caller-resume
root-runtime-loss-no-stale-business-continuation
root-outcome-and-external-abort-graceful-shutdown
shutdown-success-waits-natural-termination-before-escalation
termination-observation-rejection-not-treated-as-terminated
npm-pack-dry-run
```

Fake Platform replaces physical hosting only；test path still uses real Runtime Control peers + MemoryCarrier + `@loomrealm/subsystem/host` business Definitions. Renderer Control/DataAuthority tests remain M7/M8 gates, not M5 requirements.

---

## 20. Runner / Supervision

Hostra：

```text
Host-owned-Runner-is-process-entry
business-module-not-argv-entry
exact-planned-module-imported
safe-env-shell-false
spawned-connected-identified-ready-distinct
unexpected-code0-exit-fails-Runtime
actual-termination-produces-stopped
no-auto-restart
```

PWA equivalent with Worker Runner。

Transport adapter tests additionally prove WebSocket/MessagePort both deliver only string units to Runtime Control and never reimplement JSON-RPC semantics/retry。

---

## 21. Data / Provisioning

```text
DataAuthority-S-G-P-current-gate
profile-change-fresh-generation
one-Data-dispatcher
same-S-G-P-sequential-reconnect
stale-duplicate-provisioning-material-rejected
fresh-carrier-Input-registry-state-empty
fresh-carrier-Render-registry-snapshot-baseline
```

Provisioning failure remains distinct from Runtime/Frame failure and DataAuthority mutation。

---

## 22. Content / Execution Boundary

```text
business-content-client-logical-only
Content-capability-cannot-fetch-arbitrary-executable-target
Runtime-token-Data-ticket-Content-credential-separated
Platform-executable-resolver-not-exposed-as-ordinary-Content
```

---

## 23. Cross-platform Equivalence

Shared：same Game logical content/scenario/formal contracts/Content fixture。

Before Runtime E2E：Hostra/PWA prepared `LogicalGameBootstrap` semantically equivalent。

Runtime Control transport equivalence uses same abstract traces through：

```text
Memory reference trace
Hostra WebSocket string adapter
PWA MessagePort string adapter
```

Compare protocol outcomes/authority facts，not physical PID/Worker/Port/WS traces。

---

## 24. E2E PREPARE Gate

Every full E2E includes invalid Game/Platform binding/module/capability cases and proves no business Runtime side effect before PREPARE failure。

---

## 25. Test Ownership Rule

```text
low-level carrier/JSON representation
    → Foundation / Wire

Runtime Control protocol mechanics
    → runtime-control package tests

role authority/control-flow
    → Main / Subsystem Host tests

platform carrier establishment
    → adapter/platform tests

same abstract semantics across platforms
    → repository equivalence tests

full user-visible chain
    → E2E
```

Do not duplicate role authority inside Runtime Control fixtures merely to make M3 look end-to-end。

---

## 26. Final Test Invariants

1. Game Package tests document validation/snapshot，not Platform launch；
2. Runtime Control tests protocol mechanics，not Main/Subsystem authority；
3. one reader/dispatcher + one writer is directly regression-tested；
4. same-sender Request IDs strict monotonic and shared across Control/Frame；
5. duplicate JSON source semantics match Wire，no private parser；
6. response barrier/deadline/terminal races are deterministic with injected scheduler；
7. Main/Subsystem Host provide real downstream qualification in M5/M4；
8. Launcher PREPARE negative tests prove zero Runtime side effect；
9. Role/business dependency guards prevent Game/Launcher/Runtime Control leakage；
10. Frame Frozen authority semantics remain independently conformant；
11. Provisioning failure domain remains distinct；
12. Cross-platform equivalence compares logical/protocol/application outcomes，not physical artifacts。
