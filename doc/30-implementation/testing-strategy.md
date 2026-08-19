# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：protocol conformance、Role/SDK control-flow、Runner/Platform provisioning、Hostra/PWA semantic equivalence 与 E2E  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[独立分包与发布架构](./package-architecture.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> 最近复核：2026-08-19

测试目标不只是“消息能通”，而是验证每一层不能绕过上层 authority/failure/lifecycle invariant。

---

## 1. Test Layers

```text
Wire primitive
→ Protocol schema/state machine
→ Application Profile composition
→ Transaction golden traces
→ Failure/ambiguity/recovery
→ Capability package unit
→ Role/SDK control-flow
→ Platform-port fake integration
→ Runner/provisioning integration
→ Technical adapter contract
→ Platform composition
→ Hostra/PWA abstract-trace equivalence
→ E2E
```

可复用 fixtures 跟最近 capability package；Platform/E2E fixtures留在仓库级 tests。

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

## 3. Game Package / Definition Module

```text
Descriptor closed schema = {key,module}
no launcher/env legacy fields
key uniqueness / initial target reference
module .mjs only
absolute/traversal/url/backslash rejection
installation containment
same logical module usable by Desktop/PWA resolver
Definition Module default export ABI
module-load-does-not-start-runtime-by-itself
```

Descriptor-set failure必须 zero Runtime side effect。

---

## 4. Subsystem Control / Runtime Control Profile

```text
hello-first
bootstrap token valid/invalid/consumed
connection-bound descriptor.key
launch != connected != identified != ready
ready has no endpoint/dataProfile/ticket/Port
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

## 5. Frame / Call v1

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

---

## 6. Subsystem SDK Frame Projection

这是必须独立于 protocol fixture验证的 author-control-flow contract。

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

必须显式构造：

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

## 7. Renderer Control

```text
hello/token/version
full atomic snapshot
session/revision monotonic + gaps
InputTarget references active/current Activation
InputTarget one-shot no regrant
DataAuthority = S/G/dataProfile
dataProfile not endpoint/credential
dataProfile change requires fresh generation
endpoint/ticket/Port absent from snapshot
control loss clears InputTarget/DataAuthority and retires Data
bounded latest snapshot
WebSocket/MessagePort JSON-text equivalence
```

Renderer不计算 unwind。

---

## 8. Renderer Data Profile

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

## 9. Data Connection Core / Broker

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

## 10. Platform Provisioning

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

## 11. User Input v1 / SDK

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

## 12. Render Update / SDK

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

## 13. Main / Renderer Role Ports

Main fake ports：

```text
RuntimeHosting launch/terminate
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
carrier replacement preserves correct child boundaries
```

Subsystem fake ports：

```text
RuntimeControlBinding one-shot
SubsystemDataBinding connection stream
Data availability independent from ready
```

---

## 14. Public Surface / Dependency Tests

自动检查：

```text
business packages import @loomrealm/subsystem only
business cannot import @loomrealm/subsystem/host
subsystem author root does not export MessageCarrier/bootstrap/generation/profile
runtime-control does not define author SDK
wire/foundation contain no domain authority
role core does not import apps/* or concrete Platform adapters
apps may depend on roles/adapters/business
```

---

## 15. Cross-platform Abstract Trace

使用完全相同：

```text
Game Package {key,module}
Definition Module bytes/ABI
Frame scenario
Input producer scenario
Render desired state scenario
Content fixture
failure/reconnect scenario
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
PID/Worker id
IPC/ticket vs Port transfer
WS URL vs MessagePort
HTTP port vs Service Worker internals
bootstrap/provisioning message sequence
```

---

## 16. E2E

共同 scenario：

```text
Game Package bootstrap
Runner loads same Definition Module
required Runtime ready before/without mandatory Data
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

## 17. Done Criteria

```text
protocol/profile fixtures pass
SDK control-flow negative invariants pass
role ports/fakes pass
Runner/provisioning tests pass
adapter contracts pass
Desktop E2E pass
PWA E2E pass
same Definition Module abstract trace equivalent
business contains no platform branch
no Runtime-fatal continuation escape hatch
no physical Data material leaks into application protocols
```
