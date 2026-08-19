# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：protocol conformance、role/package integration、Platform port/adapters、Hostra/PWA semantic equivalence 与 E2E 测试分层  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[正式契约目录](../15-contracts/README.md)、[独立分包与发布架构](./package-architecture.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)  
> 最近复核：2026-08-19

## 1. 测试目标

测试同时验证三类边界：

```text
protocol conformance
    独立角色对 application contract 的可观察语义一致

package / role architecture
    public surface / dependency direction / authority 不越界

platform composition equivalence
    Hostra Desktop / PWA 使用不同 physical mechanisms
    但对相同 abstract application trace 得到等价 logical outcome
```

不把 platform implementation choice 变成 protocol conformance requirement。

---

## 2. 测试层次

```text
Schema / Closed-wire
→ Identity / State Machine
→ Protocol Composition
→ Transaction Golden Trace
→ Error / Timeout / Recovery
→ Hard Limit / ID / Revision
→ Capability Package Unit
→ Role-facing Platform Port Fake
→ Technical Adapter Contract
→ Role Package Integration
→ Platform Composition Integration
→ Hostra/PWA Abstract-trace Equivalence
→ Desktop/PWA E2E
```

可复用协议 fixture/helper 跟随最近的 capability package：

```text
@loomrealm/runtime-control/testing
@loomrealm/renderer-control/testing
@loomrealm/data/testing
@loomrealm/content/testing
```

仓库级 platform/e2e fixtures 不发布。

---

## 3. Subsystem Control v1

```text
hello-first-message
bootstrap-token-valid/invalid/consumed
control-version-1-selected
connection-bound-descriptor-key
launch-not-connected-not-identified-not-ready
ready-closed-schema-no-data-endpoint
ready-does-not-imply-data-connection
stopping-requires-main-intent
stopped-only-from-supervisor
unexpected-control-loss-fails-runtime
unexpected-exit-code-zero-fails-runtime
no-same-attempt-reconnect
no-automatic-restart
wire-limits
```

WebSocket/MessagePort bootstrap mechanism不进入这些 fixtures；建立后的 Control trace 相同。

---

## 4. Runtime Control Profile / Frame v1

Runtime Control Profile：

```text
hello-before-frame-operation
shared-sender-id-namespace-across-control-and-frame
no-jsonrpc-batch
ready-requires-complete-frame-role
frame-failure-enters-runtime-failed-path
no-data-method-in-runtime-control-profile
```

Frame v1：

```text
identity/lifecycle/Activation no reuse
exact seven Requests / closed schema
Response-before-dependent-RPC
activate/resume ACK-before-publication
post-commit no rollback
same-Subsystem recursion
Success/Explicit Error/ambiguous timeout classification
no retry / late response no recovery
lowest failed-runtime occurrence whole-suffix unwind
fixed-point expansion
accepted outcome preservation
fresh final Caller resume
```

Transport adapters 对同一 abstract Control/Frame trace 必须得到相同 application outcome。

---

## 5. Renderer Control v1

```text
hello-first / one-shot bootstrap auth where applicable
full atomic authority snapshot
session/revision monotonic
revision gaps accepted
revision regression rejected
InputTarget references active/current activation
InputTarget one-shot no regrant
DataAuthority has no endpoint/token/Port
control-loss-clears-inputtarget
control-loss-invalidates-dataauthority
control-loss-retires-data-connections
bounded-latest-snapshot-publication
```

Renderer 不计算 Runtime failure unwind。

Renderer Control 与 Data Plane 不要求 cross-connection total order。

---

## 6. Data Connection / Data Broker

Data Connection Core：

```text
current-generation-establish
no-authority-not-current
wrong-subsystem-not-current
stale-generation-not-current
one-current-connection
serialized-same-generation-replacement
retired-never-current-again
generation-replacement-retires-old
control-loss-retires-all
same-generation-reestablish-after-loss
data-loss-does-not-fail-runtime
data-loss-does-not-unwind-frame
frame-close-does-not-retire-healthy-data-connection
```

System Platform Data Connection Broker integration：

```text
broker-binds-current-session
broker-binds-current-renderer
broker-binds-target-subsystem
broker-binds-current-generation
broker-does-not-mint-generation
broker-does-not-install-two-current-carriers
broker-retires-old-before-same-generation-replacement
```

Hostra broker 可用 localhost carrier；PWA broker 可用 MessageChannel。测试 logical binding，不能要求 bootstrap wire相同。

---

## 7. User Input v1

Frame Interest Registry：

```text
fresh-connection-interest-registry-empty
no-mandatory-interest-on-connection-establish
frame-interest-full-registry-replacement
duplicate-frame-interest-rejected
duplicate-channel-rejected
empty-frame-entry-rejected
frame-absence-means-no-interest
```

Cross-plane ordering：

```text
interest-before-frame-authority-inert
authority-before-interest-no-send
authority-plus-interest-starts-send
cross-plane-order-independent
```

Frame/Activation lifecycle：

```text
new-child-waits-for-own-interest
suspended-caller-interest-retained
caller-resume-reuses-interest
fresh-activation-reuses-interest-config
fresh-activation-does-not-reuse-input-state
```

Dynamic Interest：

```text
interest-expand-state-fresh-baseline
interest-expand-event-future-only
interest-shrink-drops-late-input
```

Authority/reconnect：

```text
inputtarget-revoke-stops-immediately
inputtarget-one-shot-still-enforced
frame-close-interest-cannot-create-authority
stale-closed-frame-interest-inert
same-generation-reconnect-registry-empty
reconnect-republish-live-frame-interests
reconnect-no-event-replay
reconnect-fresh-state-baseline
renderer-does-not-interpret-push-pop
renderer-does-not-create-inputtarget-from-interest
```

Subsystem receive gate还需测试 stale Activation / removed channel / mutation gate drop。

---

## 8. Render Update v1

```text
fresh-connection-domain-registry
fresh-snapshot-each-current-domain
revision-chain-R-to-R-plus-1
patch-atomic-commit
invalid-patch-no-partial-apply
node-key-one-shot
same-live-key-tag-stable
render-event-transient
render-event-target-current-node
continuity-failure-fresh-baseline
frame-close-does-not-destroy-domain
data-retire-does-not-destroy-authoritative-domain
```

Patch-vs-Snapshot heuristic、event queue concrete capacity不是 conformance requirement。

---

## 9. Subsystem SDK / Role Tests

`@loomrealm/subsystem` 使用 in-memory Platform ports：

```text
runtime-control-binding-one-shot
control-loss-runtime-failure
frame-activation-hidden-from-author
frame-call-resumes-after-fresh-activation
handler-completion-sends-single-return
mutation-gate

listener-bound-to-frame-owner
multiple-listeners-union-interest
listener-survives-frame-suspension
fresh-activation-does-not-reuse-state
frame-close-terminalizes-listeners
fresh-data-carrier-republishes-full-registry

render-domain-survives-data-reconnect
fresh-render-registry-and-snapshots
frame-close-does-not-auto-close-domain

no-global-current-subsystem-context
no-author-websocket-messageport-surface
```

同一 business definition 可用两套 fake platform ports 运行并比较 abstract trace。

---

## 10. Main / Renderer Role Port Tests

Main：

```text
fake-runtime-hosting-launch/terminate
fake-control-host-binding
fake-renderer-hosting
fake-data-broker
platform-facts-do-not-mutate-authority
```

Renderer：

```text
fake-renderer-control-binding
fake-data-binding
interest-authority-order-independent
carrier-replacement-keeps-role-state-boundaries
```

Role unit tests不依赖真实 Hostra/Browser API。

---

## 11. Technical Adapter Contract

### WebSocket

验证：

```text
message boundary
per-direction order
observable close/loss
bounded buffering
no application retry/duplicate
text JSON profile where required
```

### MessagePort

验证：

```text
one application unit per postMessage
per-direction order
observable close/loss abstraction
no duplicate/retry
Structured Clone does not widen LoomRealm JSON semantics
```

Adapter 不测试 Main authority、Frame unwind、Data generation ownership。

---

## 12. Platform Composition Integration

### Hostra Desktop

```text
Node Runtime Hosting
process termination observation
Runtime Control WebSocket binding
Hostra Renderer Hosting
Renderer Control WebSocket binding
Data broker endpoint identity binding
filesystem/HTTP Content
```

### PWA

```text
Dedicated Worker Runtime Hosting
Worker termination observation
Runtime Control MessagePort binding
Window Renderer Hosting
Renderer Control MessagePort binding
MessageChannel Data broker
Service Worker/Fetch Content
```

这些测试可以验证不同 physical trace，但不能把 platform details 提升为 application contract。

---

## 13. Cross-platform Abstract-trace Equivalence

使用相同：

```text
Game Package logical descriptors
business Subsystem definitions
Frame call/return scenario
input producer scenario
Render desired state scenario
Content fixture
failure/reconnect scenario
```

分别跑 Hostra Desktop/PWA composition，并比较：

```text
Runtime public lifecycle
Frame Stack/Activation/outcomes
accepted outcome/failure unwind result
Renderer Control logical authority
Data current/retired state
User Input delivered logical messages
Render authoritative replica state
Content logical response
```

明确不比较：

```text
PID vs Worker id
WebSocket URL vs MessagePort
HTTP port vs Service Worker internals
Hostra Window id vs browser Window object
bootstrap message sequence
```

这类 equivalence 是跨平台架构真正的验收标准。

---

## 14. E2E

Desktop E2E：

```text
Game Package bootstrap
required Runtime ready
initial Frame
nested call/return
Renderer Control
Data Input/Render
Content
Renderer reload
Data same-generation reconnect
shutdown
```

PWA E2E 运行同一 logical scenario。

Phase 1 最少应有一个共享 business Subsystem fixture（最终可以是 `loom.map` 最小场景）同时通过两套 E2E。

---

## 15. Dependency / Public Surface Checks

自动检查：

```text
map does not import platform/transport packages
subsystem does not import WebSocket/MessagePort concrete adapter
renderer/main do not import apps/*
wire has no domain/platform authority types
apps may depend on roles/adapters
public exports do not expose internal activation/bootstrap/carrier mechanics to business author
```

---

## 16. Done Criteria

一个 cross-platform vertical slice 只有在以下均成立时才算完成：

```text
protocol fixtures pass
role package tests pass
platform port fake tests pass
adapter contract tests pass
Hostra Desktop composition E2E pass
PWA composition E2E pass
same abstract trace logical outcome equivalent
business package contains no platform branch
```
