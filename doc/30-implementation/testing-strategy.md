# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：Control、Frame、Renderer/Data/Input/Render、Content 与跨平台测试分层  
> 依赖：[正式契约目录](../15-contracts/README.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)、[Frame v1 Conformance](../15-contracts/frame-call-conformance-v1.md)  
> 最近复核：2026-08-09

## 1. 测试目标

测试必须验证**跨角色可观察语义**，并阻止实现重新耦合协议边界。

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
Host ticket/token/MessagePort delivery mechanism
queue concrete capacity/drop preference
Patch-vs-Snapshot heuristic
cache/index/scheduler implementation
```

## 2. 测试层次

```text
Schema / Closed-wire
→ Identity / State Machine
→ Protocol Composition
→ Transaction Golden Trace
→ Error / Timeout / Recovery
→ Hard Limit / ID / Revision
→ Transport semantic equivalence
→ Module Unit
→ Runtime/Renderer integration
→ End-to-End
```

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

Desktop WebSocket 与 PWA MessagePort 对同一 abstract trace 得到相同 application outcome。

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

共享 JSON边界：

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

Renderer不得计算 Runtime failure unwind。

Renderer Control token如何由 Host交付不做跨实现 conformance，只测试成功 bootstrap 后的协议行为和失效边界。

## 8. Data Connection v1

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

Desktop/PWA Host integration只需证明实际 carrier 在安装为 current 前绑定正确 Session/current Renderer/subsystem/generation；不要求 endpoint/ticket/Port wire相同。

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

标准 `keyboard/pointer/gamepad` payload 一旦在 User Input v1 中冻结，直接加入同一 corpus：

```text
canonical-schema-valid/invalid
identifier/coordinate/button semantics
exactly-at/over numeric limits
platform adapters produce equivalent canonical payload for equivalent logical input
```

不测试某个 Renderer 必须使用 DOM API、某个 key lookup table 或固定 polling cadence。

Event queue测试协议事实：

```text
bounded
surviving order preserved
dropped event never replayed
overflow does not fail Runtime/Frame
```

不要求固定 capacity/drop-oldest/drop-newest。

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

`tag` conformance只测试：

```text
is string
within byte limit
same live key stable
no semantic/known/unknown validation required
```

Event/recovery：

```text
patch-insert-X-then-event-target-X
event-X-then-patch-remove-X
stale-event-target-dropped
event-no-replay/no-coalesce
event-overflow-does-not-block-authoritative-progress
authoritative-failure-retires-data-connection
fresh-registry-plus-snapshots-recovery
data-retire-does-not-fail-runtime/unwind-frame
```

Event queue不要求固定数字/丢弃偏好。

Hard limits一旦冻结，做 exactly-at/over：message、JSON depth、tree depth、node count、patch op count、attrs/data、domainId/key/tag bytes、zIndex。

## 11. Content API v1

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

Range：若实现宣称支持，测试标准 HTTP `206/Content-Range/416`；不要求所有实现支持，也没有 Range Profile conformance。

Deployment limits：测试 bounded 行为与 `413/429/timeout`，不要求不同部署共享具体资源上限/并发数字。

Host grant如何生成/注入/轮换不做 Content API conformance；只验证最终请求 authorization 行为。

## 12. Desktop / PWA Semantic Equivalence

相同 abstract application trace 应得到相同：

```text
Control Runtime lifecycle
Frame authority/outcome/unwind
Renderer Control authority
Data Connection current/retired
User Input canonical semantics/recovery
Render Domain authoritative state
Content logical HTTP/Fetch semantics
```

平台差异只能来自 Host carrier/credential establishment 与 platform lifecycle integration。

## 13. E2E

正常：

```text
Game bootstrap
→ Control ready
→ initial Frame
→ Renderer Control
→ Host-established Data carrier
→ User Input + Render Snapshot/Patch/Event
→ nested call/return/resume
→ Renderer reload/recovery
→ Content reads
→ shutdown
```

Failure：Runtime crash、Frame timeout/divergence、Data loss、Renderer Control loss、invalid Render Patch、Content fault分别验证独立 failure boundary。

## 14. CI / Fixture Revision

每个真正协议 corpus独立记录 protocol/version/fixtureSetRevision。

CI至少报告：

```text
Subsystem Control v1
Runtime Control Profile v1
Frame v1 Main / Subsystem / Transport
Renderer Control v1
Data Connection v1
User Input v1
Render Update v1
Content API v1
```

只有 executable fixtures通过后，具体实现才能声明 conformant。
