# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：协议 conformance、package unit/integration、adapter equivalence 与 Desktop/PWA E2E 测试分层  
> 依赖：[正式契约目录](../15-contracts/README.md)、[独立分包与发布架构](./package-architecture.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)、[Frame v1 Conformance](../15-contracts/frame-call-conformance-v1.md)  
> 最近复核：2026-08-17

## 1. 测试目标

测试必须同时验证两类边界：

```text
protocol conformance
    跨角色可观察语义一致

package architecture
    public surface / dependency direction / adapter authority 不越界
```

当前协议栈：

```text
Game Package / Desktop Launcher
Subsystem Control
Runtime Control Profile
Frame / Call
Renderer Control
Data Connection
User Input
Render Update
Content API
```

不测试从未实现的历史版本兼容，也不把以下实现选择变成 conformance requirement：

```text
Component Registry/Factory
DOM/OS event adapter
endpoint/ticket/MessagePort delivery mechanism
queue concrete capacity/drop preference
Patch-vs-Snapshot heuristic
cache/index/scheduler implementation
Desktop/PWA composition wiring details
```

## 2. 测试层次

```text
Schema / Closed-wire
→ Identity / State Machine
→ Protocol Composition
→ Transaction Golden Trace
→ Error / Timeout / Recovery
→ Hard Limit / ID / Revision
→ Capability Package Unit
→ Adapter Contract / Semantic Equivalence
→ Role Package Integration
→ Desktop/PWA Composition E2E
```

可复用协议 fixture/helper 跟随最近的 capability package，例如：

```text
@loomrealm/runtime-control/testing
@loomrealm/renderer-control/testing
@loomrealm/data/testing
@loomrealm/content/testing
```

仓库级 test Subsystem/E2E 位于 `tests/`，默认不发布。

## 3. Subsystem Control v1

```text
hello-first-message
bootstrap-token-valid/invalid/consumed
control-version-1-selected
connection-bound-descriptor-key
spawn-not-connected-not-identified-not-ready
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

`ready.rendererDataEndpoint` 必须是 closed-schema error。

## 4. Runtime Control Profile v1

```text
hello-before-frame-operation
hello-versions-control-only
Frame v1 statically bound
shared-sender-id-namespace-across-control-and-frame
no-jsonrpc-batch
ready-requires-complete-frame-role
frame-failure-enters-runtime-failed-path
shutdown-deadline-distinct-from-frame-deadline
no-data-method-in-runtime-control-profile
```

这些 fixture 可以统一发布在 `@loomrealm/runtime-control/testing`，但仍分别标记 Control/Frame/Profile protocol identity/version。

WebSocket 与 MessagePort adapter 对同一 abstract trace 得到相同 application outcome。

## 5. Frame / Call v1

正式最小 corpus 以 [Frame v1 Conformance](../15-contracts/frame-call-conformance-v1.md) 为准。

重点覆盖：

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

Suspend 直接测试主协议：

```text
child-call-suspension-resumable-with-corresponding-child-outcome
ordinary-call-no-reverse-suspend
administrative-suspend-revokes-activation
administrative-suspend-no-generic-resume
administrative-suspend-may-close
administrative-suspend-timeout-runtime-fatal
```

## 6. JSON / Request ID / Limits

共享 JSON 边界：

```text
undefined / NaN / Infinity / BigInt rejected
unsafe integer rejected
unpaired surrogate rejected
duplicate JSON member rejected
closed-schema unknown field rejected
```

Frame limits测试 exactly-at / one-over：

```text
message 1 MiB
JSON depth 64
business JsonValue 512 KiB
frameId/activationId 128 bytes
targetSubsystemKey 256 bytes
```

Request ID：positive safe integer、sender Connection lifetime no reuse、Control+Frame pending collision rejected、allocator exhaustion no wrap。

## 7. Renderer Control v1

```text
hello-first / one-shot token
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
snapshot-topology-limits
```

Renderer 不得计算 Runtime failure unwind。

Renderer Control token/Port 如何由 composition root/adapter 交付不做跨实现 conformance，只测试成功 bootstrap 后的协议行为和失效边界。

## 8. Data Connection v1 / Carrier Adapter

Core：

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

`@loomrealm/transport-websocket` / `@loomrealm/transport-messageport` 只需证明 actual carrier 在安装为 current 前绑定正确 Session/current Renderer/subsystem/generation，并保持 child protocol 所需的 ordering/message-boundary/loss semantics。

Adapter 测试不得要求 endpoint/ticket/Port bootstrap wire 相同，也不得让 adapter 获得 DataAuthority ownership。

## 9. User Input v1

Core：

```text
interest-default-empty
interest-full-replacement
no-wildcard
null-target-no-send
wrong-subsystem-no-send
state-false-to-true-fresh-baseline
event-future-only-no-replay
state-latest-coalescing
event/reset-as-barriers
producer-loss-reset-and-rebaseline
inputtarget-revocation-best-effort-reset
inputtarget-one-shot-no-regrant
activation/connection/control-loss-implicit-reset
same-generation-reconnect-interest-empty
same-generation-reconnect-fresh-state
input-loss-does-not-fail-runtime
```

标准 `keyboard/pointer/gamepad` payload 允许在实现阶段同步细化；一旦某个 canonical schema 写入 User Input v1，就加入同一 `@loomrealm/data/testing` corpus：

```text
canonical-schema-valid/invalid
identifier/coordinate/button semantics
exactly-at/over numeric limits
platform adapters produce equivalent canonical payload for equivalent logical input
```

不测试某个 Renderer 必须使用 DOM API、固定 key lookup table 或 polling cadence。

Event queue只验证 bounded + surviving order + no replay，不要求固定 capacity/drop policy。

## 10. Render Update v1

Fresh baseline：

```text
registry-before-render-state
fresh-snapshot-establishes-current-revision
no-patch-before-fresh-snapshot
no-event-before-fresh-snapshot
```

Revision：

```text
post-baseline-exact-R-to-R-plus-1
patch-base-matches-current
patch-gap/base-mismatch-fails-closed
post-baseline-snapshot-gap/stale-fails-closed
publication-cursor-resets-on-fresh-carrier
```

Patch：

```text
insert-root-child-subtree
remove-leaf-subtree-cascade
move-reorder/reparent/root-transition
move-detach-then-resolve
move-before-self-rejected
move-under-descendant-rejected
update-attrs/data-set-remove
patch-local-tombstone-blocks-key-reuse
one-shot-node-key
same-live-key-tag-stable
atomic-no-partial-apply
```

`tag` 只测试 string、byte limit、same live key stable，不测试 known/unknown/component semantics。

Hard limits 可在 Patch engine/real fixture 开发中逐步确定；确定后补 exactly-at/over fixture，而不是在实现前阻塞全部 Render path。

## 11. Content API / Content Adapter

Content contract：

```text
manifest/record/group/resource GET+HEAD
logical path traversal rejection
ETag/304
contentVersion isolation
MIME correctness
Desktop bearer auth semantics
PWA same-origin semantics
409 state/version conflict
422 schema/integrity failure
no physical path/token leak
```

Adapter：

```text
content-fs
    trusted logical identity cannot escape package root

content-http
    preserves Content API status/header/body semantics

content-service-worker
    preserves same logical identity/cache/version semantics
```

Range 若实现宣称支持，测试标准 HTTP 行为；不要求所有 adapter 支持。

## 12. Package Architecture Checks

CI 应增加静态依赖约束：

```text
wire must not import domain/role packages
contract/capability must not import role implementation
main/subsystem/renderer must not import apps/*
Core must not import @loomrealm/map
@loomrealm/map may import @loomrealm/subsystem
adapter must not import product composition root
```

同时对公开 package 做：

```text
exports surface smoke test
pack dry-run
tarball consumer smoke test
no internal relative-path consumption
package dependency graph cycle check
```

npm semver 不与 protocol version 做数值相等断言。

## 13. Desktop / PWA Semantic Equivalence

相同 abstract application trace 应得到相同：

```text
Control Runtime lifecycle
Frame authority/outcome/unwind
Renderer Control authority
Data Connection current/retired
User Input canonical semantics/recovery
Render Domain authoritative state
Content logical API semantics
```

平台差异只能来自 Adapter/composition lifecycle integration。

## 14. E2E

Desktop：

```text
Game bootstrap
→ launcher-node
→ Control WebSocket adapter
→ Runtime ready
→ initial Frame
→ Renderer Control
→ Data carrier
→ User Input + Render
→ Content reads
→ nested call/return
→ Renderer reload/recovery
→ shutdown
```

PWA：同一 application trace 替换为 Worker/MessagePort/Service Worker adapters。

Failure：Runtime crash、Frame timeout/divergence、Data loss、Renderer Control loss、invalid Render Patch、Content fault分别验证独立 failure boundary。

## 15. CI / Fixture Revision

每个真正协议 corpus 独立记录：

```text
protocol
protocolVersion
fixtureSetRevision
role
```

Package 可以聚合多个 corpus，但不能把它们的 protocolVersion 合并。

只有 executable fixtures 通过后，具体实现才能声明 conformant；只有 package architecture checks 通过后，workspace 才能作为独立可发布模块进入 release pipeline。
