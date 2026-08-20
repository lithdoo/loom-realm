# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：Game/Platform PREPARE、Game Package snapshot、Main logical bootstrap、protocol conformance、Role/SDK control-flow、Runner/provisioning、Hostra/PWA semantic equivalence 与 E2E  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[独立分包与发布架构](./package-architecture.md)、[ADR 0020](../decisions/0020-game-entry-consumer-boundary.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

测试目标不是“消息能通”，而是证明每一层不能绕过 authority/failure/lifecycle/PREPARE invariant。

---

## 1. Test Layers

```text
Game Entry document representation
→ Game Package validation/snapshot
→ matching Launcher Game consumption
→ Platform launch manifest
→ exact join / executable PREPARE
→ LogicalGameBootstrap projection
→ Main logical bootstrap
→ Wire primitive
→ Protocol schema/state machine
→ Application Profile composition
→ Role/SDK control-flow
→ RuntimeHosting/Runner/provisioning integration
→ Platform composition
→ Hostra/PWA abstract-trace equivalence
→ E2E
```

可复用 fixture跟最近 capability package；Platform/E2E fixture留仓库级 tests。

---

## 2. Unified Carrier Model

所有 message-oriented profiles共享：

```text
one carrier unit = one UTF-8 JSON text string
```

测试：

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

Schema-level platform-looking fields are rejected：

```text
GameEntry.module
Descriptor.launcher
Initial.env (outside input)
```

But inside `initial.input` these ordinary business JSON member names MUST be accepted：

```text
module
env
platform
launcher
__proto__
constructor
```

```text
closed Game schema != recursive JSON-key blacklist
```

### Validated snapshot

```text
validated-result-detached-from-source
source-mutation-after-validation-no-effect
returned-containers-deeply-frozen
nested-input-deeply-frozen
caller-input-not-mutated
caller-input-not-frozen
deep-input-no-call-stack-overflow
shared-acyclic-graph-no-exponential-copy
proto-key-remains-data
no-getter-toJSON-invocation
```

### Errors

```text
GamePackageError-class-stable
code-stable
path-stable
human-message-not-compatibility-contract
Wire-error-not-required-by-consumer
malformed-json-mapped-to-GAME_ENTRY_INVALID
unsupported-version-category
initial-input-category
```

### Package boundary

```text
runtime-dependency-only-wire
no-foundation
no-main
no-launcher
no-node-platform-api
no-filesystem-fetch
root-export-only
npm-pack-dry-run
```

---

## 4. Consumer Boundary Tests

必须防止架构回退：

```text
main-package-has-no-game-package-dependency
main-bootstrap-fixture-does-not-use-GameEntryV1
business-package-has-no-game-package-or-launcher-dependency
```

Hostra/PWA launcher：

```text
launcher-prepare-consumes-Game-source-without-manual-game-package-step
Game-validation-failure-happens-inside-launcher-PREPARE
prepared-result-not-released-before-full-PREPARE
logical-bootstrap-contains-only-keys-and-initial
logical-bootstrap-has-no-formatVersion/brand/module/path/URL
```

This is a package/consumer invariant, not merely documentation wording。

---

## 5. Main Logical Bootstrap

Main local tests SHOULD use hand-built/fake `LogicalGameBootstrap` directly：

```text
complete-key-registry-install
initial-target/input-install
no-formatVersion/document-metadata
no-GamePackageError-handling
no-GameEntry-parser
```

Defensive Main assertions MUST NOT recreate a second GameEntryV1 validator。

---

## 6. Hostra Launcher PREPARE

```text
raw/common-Game-entry-consumed-by-Hostra-launcher
valid-launch-hostra-json
closed-hostra-schema
format-version
binding-key-duplicate
binding-key-missing
binding-key-undeclared
exact-game-hostra-key-set
module-mjs-only
absolute-traversal-url-backslash-rejection
installation-containment
symlink-junction-reparse-escape-rejection
regular-file-required
all-required-modules-resolved-before-first-spawn
node-runtime-capability-preflight
host-runner-entry-capability-preflight
manifest-cannot-select-node-executable
manifest-cannot-select-runner-entry
manifest-cannot-inject-arbitrary-argv-env-token-endpoint
immutable-plan-lookup-by-key
logical-bootstrap-projection
```

Every PREPARE negative case proves：

```text
process spawn count = 0
business module import count = 0
Runtime Control establish count = 0
```

---

## 7. PWA Launcher PREPARE

```text
raw/common-Game-entry-consumed-by-PWA-launcher
valid-launch-pwa-json
closed-pwa-schema
format-version
binding-key-duplicate
binding-key-missing
binding-key-undeclared
exact-game-pwa-key-set
module-mjs-only
absolute-traversal-external-url-backslash-rejection
installation-registry-resolution
same-origin/trusted-installation-policy
all-required-modules-resolved-before-first-worker
worker-runner-capability-preflight
manifest-cannot-select-runner/ports/credentials/CSP
immutable-plan-lookup-by-key
logical-bootstrap-projection
```

Every PREPARE negative case proves：

```text
Worker creation count = 0
business module import count = 0
Runtime Control establish count = 0
```

---

## 8. Runtime Control / Frame

Runtime Control：

```text
one-carrier-reader
one-UTF8-JSON-text-per-message
hello-first
shared-sender-request-id-namespace
no-Batch
no-retry
finite-deadlines
same-attempt-control-reconnect-rejected
```

Frame Frozen conformance：

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

---

## 9. Subsystem Author / Host SDK

```text
initialize-does-not-start-handler
activate-starts-handler-exactly-once
child-completed/cancelled/failed-resolves-FrameOutcome
pre-commit-recoverable-rejection-preserves-Activation
Runtime-fatal-never-reenters-business-continuation
uncaught-business-exception-maps-to-frame-failed-when-authority-healthy
administrative-suspend-aborts-and-discards-late-completion
business-author-surface-has-no-game-package/launcher/host-import
```

---

## 10. Main Authority / Fake Platform Ports

```text
logical-key-registry
fake-plan-bound-RuntimeHosting
launch-request-key-only
physical-facts-do-not-self-mutate-authority
Runtime lifecycle
Frame/Activation Registry
failure classifier/unwind golden traces
Renderer Control snapshot
DataAuthority generation/profile
fake Broker does not mint authority
Data provisioning/loss does not fail Runtime/Frame
```

---

## 11. Runner / Supervision

Hostra：

```text
Host-owned-Runner-is-process-entry
business-module-not-argv-entry
exact-planned-module-imported
safe-env/shell-false
spawned/connected/identified/ready-distinct
unexpected-code0-exit-fails-Runtime
actual-termination-produces-stopped
no-auto-restart
```

PWA：

```text
Host-owned-Worker-Runner-is-constructor-entry
business-module-not-Worker-entry
exact-planned-module-imported
created/connected/identified/ready-distinct
unexpected-termination-fails-Runtime
actual-termination-produces-stopped
no-auto-restart
```

---

## 12. Data / Provisioning

```text
DataAuthority-S/G/P-current-gate
profile-change-fresh-generation
one-Data-dispatcher
same-S/G/P-sequential-reconnect
stale/duplicate-provisioning-material-rejected
fresh-carrier-Input-registry/state-empty
fresh-carrier-Render-registry/snapshot-baseline
```

Provisioning failure：

```text
!= Runtime failure
!= Frame unwind
!= DataAuthority mutation
```

Hostra tests Runner IPC + ticket/Data WS；PWA tests Port transfer/MessageChannel。

---

## 13. Content / Execution Boundary

```text
business-content-client-logical-only
Content-capability-cannot-fetch-arbitrary-executable-target
Runtime-token/Data-ticket/Content-credential-separated
Platform-executable-resolver-not-exposed-as-ordinary-Content
```

---

## 14. Cross-platform Equivalence

Shared input：

```text
same Game Entry source/logical content
same logical scenario/business input
same formal contracts
same Content fixture/expectation
```

Platform-specific：

```text
Hostra manifest/artifact
PWA manifest/artifact
physical carriers/provisioning
```

Before Runtime E2E，assert：

```text
Hostra prepared LogicalGameBootstrap
== semantic PWA prepared LogicalGameBootstrap
```

Compare abstract trace：

```text
Runtime lifecycle
Frame/Activation/Outcome/unwind
Renderer authority
Data S/G/P lifecycle
Input delivered semantics
Render authoritative replica
Content logical response
business observable state
```

Do not compare module path/bytes、PID/Worker id、IPC/Port/WS/HTTP physical trace。

---

## 15. E2E PREPARE Gate

Every full E2E suite MUST include negative PREPARE cases：

```text
invalid Game Entry
invalid Platform Launch Manifest
missing/extra binding
invalid/outside module
hosting capability unavailable
```

All MUST prove no business Runtime side effect before failure。

---

## 16. Test Ownership Rule

```text
package-local semantic contract
    → package tests

role authority/control-flow
    → role package tests

platform integration
    → platform tests

same abstract semantics across platforms
    → repository equivalence tests

full user-visible chain
    → E2E
```

Do not use fake Hostra/PWA planner inside M2 to claim real consumer qualification；M6/M15 provide it。

---

## 17. Final Test Invariants

1. Game Package tests document validation/snapshot, not Platform launch；
2. Main tests logical bootstrap without Game Package parser；
3. Launcher tests begin from Game source/common document and own Game Package invocation；
4. PREPARE negative tests prove zero Runtime side effect；
5. Role/business dependency guards prevent Game/Launcher leakage；
6. Frame Frozen semantics remain independently conformant；
7. Provisioning failure domain remains distinct；
8. Cross-platform equivalence compares logical facts/outcomes, including prepared `LogicalGameBootstrap` semantics。
