# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：Game/Platform launch preflight、protocol conformance、Role/SDK control-flow、Runner/Platform provisioning、Hostra/PWA semantic equivalence 与 E2E  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[独立分包与发布架构](./package-architecture.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-20

测试目标不只是“消息能通”，而是验证每一层不能绕过上层 authority/failure/lifecycle/preflight invariant。

---

## 1. Test Layers

```text
Game common manifest
→ Platform launch manifest
→ exact join / executable preflight
→ Wire primitive
→ Protocol schema/state machine
→ Application Profile composition
→ Transaction golden traces
→ Failure/ambiguity/recovery
→ Capability package unit
→ Role/SDK control-flow
→ Platform-port fake integration
→ RuntimeHosting/Runner/provisioning integration
→ Technical adapter contract
→ Platform composition
→ Hostra/PWA abstract-trace equivalence
→ E2E
```

可复用 fixtures跟最近 capability package；Platform/E2E fixtures留在仓库级 tests。

---

## 2. Unified Carrier Model

所有 message-oriented profile必须共享：

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
bounded-buffering
```

---

## 3. Game Package v1

```text
valid-minimal-game-entry
formatVersion-exact-1
closed-top-level-schema
closed-initial-schema
closed-descriptor-schema
Descriptor-exactly-key
key-non-empty
key-uniqueness-case-sensitive
initial-target-declared
initial-input-JsonValue
module-field-rejected
launcher/env/platform-field-rejected
common-validation-no-filesystem-fetch
common-validation-no-module-import
common-validation-zero-runtime-side-effect
```

同一个 `ValidatedGameEntryV1`必须可输入 Hostra/PWA planner，而不携 executable binding。

---

## 4. Hostra Launch Manifest / Preflight

```text
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
```

Main-facing launch request必须不含 module/path/URL。

---

## 5. PWA Launch Manifest / Preflight

```text
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
messagechannel-capability-preflight
manifest-cannot-select-worker-runner-or-ports
manifest-cannot-override-csp-credential-policy
immutable-plan-lookup-by-key
```

---

## 6. Zero-side-effect Launch Transaction

逐步 fault-inject：

```text
Game JSON parse
Game schema validation
Platform manifest parse
Platform schema validation
exact key-set join
Nth module syntax validation
Nth module physical/registry resolution
containment/same-origin check
hosting capability validation
plan freeze
```

每个 failure都必须断言：

```text
process/Worker creation count = 0
business Definition Module import count = 0
Runtime Control establishment count = 0
Launch Attempt physical resource count = 0
```

这是新的 bootstrap hard gate。

Definition Module actual import/default-export ABI failure发生在 Runner中时允许已有单个 physical Runtime Container；此时测试要求 all-required bootstrap失败并对已启动 sibling Runtime统一 cleanup，不能把它伪装成 preflight error。

---

## 7. Subsystem Control / Runtime Control Profile

```text
hello-first
bootstrap token valid/invalid/consumed
connection-bound subsystem key
launch != connected != identified != ready
ready has no endpoint/dataProfile/ticket/Port/module
ready independent from Data carrier/provisioning
stopping requires Main intent
stopped only actual supervisor termination
unexpected Control loss fails Runtime
unexpected code-0 exit fails Runtime
no same-attempt reconnect/restart

Control+Frame one dispatcher
shared sender Request ID namespace
no Batch
JSON-text application unit
```

---

## 8. Frame / Call v1

```text
identity/Activation never reused
exact seven Requests
closed schemas
Response-before-dependent-RPC
activate/resume ACK-before-publication
post-commit no rollback
same-Subsystem recursion
Success/Explicit Error/ambiguous classification
no retry / late response no recovery
lowest failed-runtime occurrence
whole-suffix fixed-point unwind
accepted outcome preservation
fresh final Caller resume
```

Game/Launcher reset不得改变任何 Frozen Frame fixture。

---

## 9. Subsystem SDK Frame Projection

### Context/activation

```text
frame.initialize-does-not-start-business-handler
frame.activate-starts-handler-exactly-once
business-never-mutates-starting-frame
activationId-hidden-from-author
```

### Outcomes

```text
handler-completed-outcome-sends-completed-return
handler-cancelled-outcome-sends-cancelled-return
handler-failed-outcome-sends-failed-return
child-completed-resolves-frame-call-outcome
child-cancelled-resolves-frame-call-outcome
child-failed-resolves-frame-call-outcome
```

Child `cancelled/failed` MUST NOT become JS rejection。

### Recoverable pre-commit rejection

```text
target-not-found-rejects-typed-call-error
target-unavailable-rejects-typed-call-error
recoverable-rejection-preserves-current-activation
recoverable-rejection-releases-mutation-gate
business-may-catch-and-continue
```

### Runtime-fatal negative invariant

```text
call-timeout-does-not-reenter-business-continuation
control-loss-does-not-reenter-business-continuation
divergence-does-not-reenter-business-continuation
fatal-protocol-error-does-not-reenter-business-continuation
runtime-fatal-keeps-mutation-gate-closed
runtime-fatal-aborts-frame-and-instance-signals
late-response-after-runtime-fatal-never-resumes-business
```

必须构造：

```ts
try {
  await frame.call(...);
} catch {
  mutate();
}
```

并证明 Runtime-fatal 场景下 `catch` 永不获得执行机会。

### Business exception

```text
uncaught-business-exception-becomes-frame-failed
business-exception-does-not-fail-runtime-by-default
sdk-invariant-corruption-does-fail-runtime
```

### Administrative suspend

```text
administrative-suspend-aborts-frame-signal
administrative-suspend-closes-ordinary-mutation-gate
late-handler-resolution-after-admin-suspend-discarded
child-call-suspension-does-not-abort-frame-signal
```

---

## 10. Definition Module / Author Surface Isolation

```text
platform-selected-module-default-export-accepted
Game/Platform launch config unavailable from author root
module-path-unavailable-from-SubsystemLaunchContext
Hostra/PWA selected artifact enters same SubsystemDefinitionFactory ABI
business cannot import game-launcher-hostra/pwa
business cannot import subsystem/host
business source contains no platform branch
```

Cross-platform不同 build artifact不能成为不同 author API。

---

## 11. Renderer Control

```text
hello/token/version
full atomic snapshot
session/revision monotonic + gaps
InputTarget references active/current Activation
InputTarget one-shot no regrant
DataAuthority = S/G/dataProfile
dataProfile not endpoint/credential
dataProfile change requires fresh generation
endpoint/ticket/Port/module absent from snapshot
control loss clears InputTarget/DataAuthority and retires Data
bounded latest snapshot
WebSocket/MessagePort JSON-text equivalence
```

Renderer不计算 unwind。

---

## 12. Renderer Data Profile

```text
profile-id-exact-loomrealm-renderer-data-1
profile-binds-connection1-input1-render1
unsupported-profile-no-current-install
profile-change-requires-fresh-generation
single-data-dispatcher
input-type-demux
render-type-demux
unknown-type-fail-closed
one-json-text-object-per-unit
no-structured-clone-application-object
fresh-input-baseline
fresh-render-baseline
input-render-state-independent
```

---

## 13. Data Connection Core / Broker

Core：

```text
current S/G/P establish
wrong session/renderer/subsystem/generation/profile not current
one current per Subsystem
serialized replacement
retired never current again
same S/G/P sequential reconnect
authority replacement retires old
control loss retires all
data loss does not fail Runtime/unwind Frame
Frame close does not retire Data
```

Broker：

```text
binds current Session
binds current Renderer
binds S/G/P
never mints generation/profile
never installs two current carriers
old retired before same-authority replacement
physical endpoint cannot create authority
```

---

## 14. Platform Provisioning

### Hostra

```text
Node Runner has dedicated provisioning channel
provisioning channel != Runtime Control
provisioning channel != stdout/stderr
provisioning channel != Data carrier
Data offer binds own S/G/P
one-time ticket/material
stale/duplicate/consumed offer rejected
same S/G/P reconnect gets fresh offer
authority replacement invalidates old material
provisioning failure does not fail Runtime
provisioning failure does not unwind Frame
ready does not wait for Data offer
```

### PWA

```text
Worker has dedicated provisioning path
transferred Data Port binds own S/G/P
stale/duplicate Port not installed
same S/G/P fresh MessageChannel reconnect
profile change fresh generation
transfer/install failure does not fail Runtime/Frame
```

两平台不要求 provisioning wire相同，只要求最终 role-port semantics等价。

---

## 15. User Input v1 / SDK

Protocol：

```text
fresh connection Interest Registry empty
full registry replacement
Interest-first / Authority-first convergence
new child waits own Interest
suspended caller Interest retained
fresh Activation reuses config not old State/Event
state false→true fresh baseline
event future-only
interest shrink drops late input
renderer does not interpret stack ops
```

SDK：

```text
listener branded Frame owner check
multiple-listeners union/ref-count contributions
listener close does not remove other's channel
setChannels local-first shrink
frame-close removes listeners/Interest/state before local close success
fresh Data republish full desired registry
stale Activation/removed channel/mutation gate input drop
```

---

## 16. Render Update / SDK

Protocol：

```text
fresh carrier render.domains first
fresh snapshot each current Domain
strict revision chain
atomic Patch
node-key one-shot
stable live tag
Event transient/no replay
```

SDK：

```text
SDK mints domainId
business name != domainId
RenderDomain survives Data reconnect
fresh carrier Registry + Snapshots
Frame close does not auto-close Domain
one Data dispatcher, no competing reader
```

---

## 17. Main / Renderer / Subsystem Role Ports

Main fake ports：

```text
RuntimeHosting launch/terminate
launch accepts subsystemKey, not module
RuntimeHosting internally bound to immutable plan
RuntimeControlHost
RendererHosting/ControlHost
DataConnectionBroker
physical facts never mutate authority without Main decision
```

Renderer fake ports：

```text
RendererControlBinding
RendererDataBinding
profile mismatch no install
carrier replacement preserves child boundaries
```

Subsystem fake ports：

```text
RuntimeControlBinding one-shot
SubsystemDataBinding connection stream
Data availability independent from ready
```

---

## 18. RuntimeHosting / Runner Integration

### Hostra

```text
Main launch(key) → exact frozen Hostra plan lookup
Host-owned Runner is argv entry
business module is not argv entry
planned module imported exactly
Host-selected Node / safe env / shell=false
spawn != connected != identified != ready
unexpected exit code 0 fails Runtime
no auto restart
```

### PWA

```text
Main launch(key) → exact frozen PWA plan lookup
Host-owned Worker Runner is constructor target
business module imported by Runner
Runtime Control postMessage(string)
Worker created != connected != identified != ready
unexpected Worker termination fails Runtime
no auto restart
```

---

## 19. Public Surface / Dependency Tests

自动检查：

```text
business packages import @loomrealm/subsystem only
business cannot import @loomrealm/subsystem/host
business cannot import game-launcher-*
main cannot import game-launcher-*
game-package cannot import platform launcher/module resolver
subsystem author root does not export MessageCarrier/bootstrap/generation/profile/module
runtime-control does not define author SDK
wire/foundation contain no domain authority
game-launcher-hostra contains no PWA schema
game-launcher-pwa contains no Hostra schema
role core does not import apps/* or concrete Platform adapters
apps may depend on roles/launchers/adapters/business
```

---

## 20. Cross-platform Abstract Trace

共享：

```text
same Game Entry logical topology
same Subsystem keys
same logical initial/frame/input scenario
same Content fixture/business expectations
same formal protocol/profile semantics
same failure/reconnect scenario
```

允许：

```text
Hostra Launch Manifest != PWA Launch Manifest
Hostra Definition artifact/path != PWA Definition artifact/path
```

分别跑 Hostra/PWA，比较：

```text
Runtime public lifecycle
Frame Stack/Activation/Outcome
failure unwind result
Renderer logical authority S/G/P
Data current/retired state
User Input delivered logical messages
Render authoritative replica
Content logical response
business Definition observable state
```

不比较：

```text
module path/bytes
PID/Worker id
IPC/ticket vs Port transfer
WS URL vs MessagePort
HTTP port vs Service Worker internals
bootstrap/provisioning message sequence
```

---

## 21. E2E

共同 scenario：

```text
Game common bootstrap
current Platform launch preflight
all required Runtime ready before/without mandatory Data
initial Frame
nested call: completed/cancelled/failed variants
recoverable call rejection
Data establishment
Input/Render/Content
same-generation Data reconnect
Renderer reload
shutdown
```

另有 failure E2E：

```text
ambiguous Frame mutation
→ Runtime failure
→ no business continuation reentry
→ Main unwind converges
```

---

## 22. Done Criteria

```text
Game common manifest tests pass
Hostra/PWA manifest + exact-join tests pass
all preflight negative cases prove zero Runtime side effect
protocol/profile fixtures pass
SDK control-flow negative invariants pass
role ports/fakes pass
Runner/provisioning tests pass
adapter contracts pass
Desktop E2E pass
PWA E2E pass
platform-specific Definition artifacts produce equivalent abstract trace
business contains no platform launch branch
no Runtime-fatal continuation escape hatch
no physical executable/Data material leaks into Main/application protocols
```
