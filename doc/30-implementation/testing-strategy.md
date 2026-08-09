# 测试策略

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Evolving  
> 主要定义：Runtime Control、Frame transaction/error/recovery/limits、Renderer/Data/Input/Render、Transport、内容与端到端测试分层  
> 依赖：[仓库与分包方案](./repository-layout.md)、[正式契约目录](../15-contracts/README.md)、[Runtime Control Profile v2](../15-contracts/runtime-control-profile-v2.md)、[Frame / Call Protocol v1](../15-contracts/frame-call-protocol-v1.md)、[Frame / Call v1 Conformance](../15-contracts/frame-call-conformance-v1.md)  
> 最近复核：2026-08-09

## 1. 测试目标

测试不仅验证实现正确，还必须阻止实现破坏当前协议边界。

当前协议栈：

```text
Subsystem Control v2
+ Runtime Control Profile v2
+ Frame / Call v1 Frozen
+ Renderer Control v1
+ Data Connection v1
+ User Input v1
+ Render Update v1 closure candidate
+ Content API v1
```

Control v1 / Runtime Control Profile v1已实现前废弃，测试必须证明实现**不会**advertise/select/fallback到 version 1。

## 2. 测试层次

```text
Schema / Closed-wire Test
→ Identity / State Machine Fixture
→ Protocol Composition Fixture
→ Transaction Golden Trace
→ Error / Timeout / Recovery Fixture
→ Limit / Request ID / Revision Fixture
→ Transport / Platform Binding Conformance
→ Module Unit Test
→ Runtime Container Interop
→ Renderer/Data/Input/Render Integration
→ End-to-End
```

## 3. Subsystem Control v2

至少覆盖：

```text
hello-first-message
bootstrap-token-valid/invalid/consumed
control-version-2-selected
control-version-1-not-selected
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

明确反向 fixture：

```text
advertise-only-version-1 → unsupported
ready.rendererDataEndpoint → closed-schema protocol error
v1 fallback path → must not exist
```

## 4. Runtime Control Profile v2

当前组合：

```text
Control v2 + Frame v1
```

至少：

```text
hello-before-frame-operation
hello-versions-control-only
Frame version statically bound to 1
shared-sender-id-namespace-across-control-and-frame
no-jsonrpc-batch-on-control-carrier
ready-under-profile-requires-complete-frame-role
frame-failure-enters-runtime-failed-path
shutdown-deadline-distinct-from-frame-deadline
no-data-method-in-runtime-control-profile
no-profile-v1-fallback
```

Desktop WebSocket与PWA MessagePort对相同 abstract Control/Frame trace应得到相同 application outcome。

## 5. Frame v1 Normative Source

测试身份：

```text
protocol = loomrealm.frame-call
version = 1
```

Batch A-F只用于历史/fixture分组，不是独立兼容等级。

[Frame / Call v1 Conformance Profile](../15-contracts/frame-call-conformance-v1.md)仍是 Frame角色最小规范来源。

## 6. Frame Identity / Lifecycle / Wire

至少覆盖：

```text
frame/activation unique + no reuse
caller immutable
subsystem binding permanent
five lifecycle states only
outcome != lifecycle
stable Stack / no two InputTargets
exact seven methods/directions
all Frame methods are Request
closed schema
completed.value required
no caller wire / close reason
no frame.result/cancel/abort/unwind/version/capabilities
no JSON-RPC Batch
```

## 7. Frame Transaction Golden Traces

```text
initial-initialize-before-activate
initial-activate-ack-before-publish
call-accept-suspends-caller
call-success-before-child-initialize
ordinary-call-no-reverse-suspend
call-gap-inputtarget-null
child-activate-ack-before-publish
return-accept-stores-outcome
return-success-before-frame-close
close-before-resume
resume-ack-before-publish
same-subsystem-no-nested-reverse-request
precommit-recoverable-abort
postcommit-never-restores-revoked-activation
accepted-outcome-never-erased
```

## 8. Frame Error / Timeout / Mutation Gate

```text
Success        → known commit
Explicit Error → known no-commit
Timeout/loss   → ambiguous
```

验证 no retry、late response不恢复、fatal divergence进入 Runtime failure、mutation gate不回退旧 Activation。

Recoverable至少：target not-found/unavailable、`FRAME_INITIALIZE_REJECTED`。

Fatal至少：Frame/Activation/Stack/ownership mismatch、invalid params/method、timeout/connection loss。

## 9. Runtime Failure Unwind

```text
failure-root-is-lowest-failed-runtime-occurrence
whole-root-to-top-suffix-is-doomed
same-runtime-multiple-frame-recursion
failure-unwind-top-to-bottom
failure-barrier-clears-input-target
failed-runtime-frame-logical-retire-without-ack
healthy-descendant-context-exists-one-close
cleanup-failure-expands-root
multiple-root-expansions-converge
accepted-outcome-preserved
only-final-direct-caller-resumed
recovery-resume-uses-fresh-activation
fixed-point-eventually-resumes-or-empty
```

关键 trace必须覆盖同一 Runtime在 Stack多个位置出现以及 cleanup timeout导致 root下移。

## 10. JSON / Number / Limit Tests

共享协议 JSON边界至少：

```text
undefined / NaN / Infinity / BigInt rejected
unsafe integer rejected
unpaired surrogate rejected
duplicate JSON member rejected
closed-schema unknown fields rejected
```

Frame hard limits同时测试 exactly-at-limit / one-over-limit：

```text
message 1 MiB
JSON depth 64
business JsonValue 512 KiB
frameId / activationId 128 bytes
targetSubsystemKey 256 bytes
```

Desktop实际 WebSocket text bytes也必须有 hard cap；PWA Structured Clone不得绕过 JSON semantic validator。

## 11. JSON-RPC Request ID

同一 sender / Runtime Control Connection：

```text
positive-safe-integer-only
Connection-lifetime no reuse
pending collision across Control+Frame rejected
late response cannot bind new request
allocator exhaustion does not wrap
```

Main与Subsystem两个方向的 sender namespace相互独立。

## 12. Renderer Control v1

至少：

```text
hello-first / one-shot token
full atomic authority snapshot
session/revision monotonic
revision gaps accepted
revision regression rejected
InputTarget references active/current activation
InputTarget one-shot no same-activation regrant
DataAuthority has no endpoint/token/Port
control-loss-clears-inputtarget
control-loss-invalidates-dataauthority
control-loss-retires-data-connections
bounded-latest-snapshot-publication
snapshot-topology-limits
```

Renderer不得计算 Runtime failure unwind。

## 13. Data Connection v1

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

Platform binding额外证明 actual carrier安全绑定到 Session/current Renderer/subsystem/generation。

## 14. User Input v1 Core

至少：

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

Standard Input Mapping另测 keyboard/pointer/gamepad exact payload、坐标/键值 normalization和 limits。

## 15. Render Update v1 Incremental Closure

当前 fixture必须按 closure candidate，而不是旧 Snapshot-only草案设计。

Fresh baseline：

```text
registry-before-render-state
fresh-snapshot-establishes-current-revision
no-patch-before-fresh-snapshot
no-event-before-fresh-snapshot
```

Revision：

```text
post-baseline-commit-R-to-R-plus-1
patch-base-matches-current
patch-gap-or-base-mismatch-fails-closed
post-baseline-snapshot-gap/stale-fails-closed
publication-cursor-resets-on-fresh-carrier
```

Patch operations：

```text
insert-root/child/subtree
remove-leaf/subtree-cascade
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

Event/barrier：

```text
patch-insert-X-then-event-target-X
event-X-then-patch-remove-X
stale-event-target-dropped
event-no-replay/no-coalesce
event-overflow-does-not-block-authoritative-progress
```

Recovery：

```text
authoritative-continuity-failure-retires-data-connection
fresh-registry-plus-snapshots-recovery
same-generation-reconnect-does-not-use-cache-as-patch-base
data-retire-does-not-destroy-presentation-cache-authority-semantics
```

## 16. Render Limits / Component Boundary

Completion阶段需要 exactly-at/over-limit fixtures：

```text
message size
JSON depth
tree depth
node count
patch op count
attrs/data count/size/depth
key/tag/domainId bytes
zIndex range
Event FIFO capacity/drop policy
```

Component Factory暂时未加载属于 presentation/bootstrap concern；unknown/undeclared tag是否 authoritative invalid由 Renderer Component Profile冻结。

## 17. Desktop / PWA Cross-platform

同一 abstract trace在 Desktop WebSocket与PWA MessagePort/Host binding上应得到相同：

```text
Control v2 Runtime lifecycle
Frame authority/outcome/unwind
Renderer Control authority
Data Connection current/retired identity
User Input state recovery
Render Domain authoritative state
```

差异只能来自 carrier/bootstrap/platform lifecycle integration。

## 18. Content

至少覆盖：

```text
manifest/record/group/resource GET+HEAD
logical identity/path traversal rejection
ETag/304
contentVersion isolation
MIME correctness
Desktop bearer auth semantics
PWA same-origin semantics
409 state/version conflict
422 schema/integrity failure
content limits/concurrency profile
no physical path/token leak
```

Content Access Profile完成后增加 capability issuance/distribution/rotation fixtures。

## 19. Test Subsystems

推荐：

```text
control-v2-valid
control-v1-only-rejected
frame-init-business-reject
frame-rpc-never-respond
frame-rpc-late-respond
frame-state-divergence
same-subsystem-recursive
runtime-crash-on-close
runtime-crash-on-resume
runtime-multiple-frame-occurrence
stale-activation
input-interest-toggle
input-producer-loss
render-patch-stream
render-invalid-patch
render-event-barrier
render-without-frame
```

## 20. E2E

正常：

```text
Game bootstrap
→ Control v2 ready
→ initial Frame
→ Renderer Control
→ Data carrier
→ User Input + Render Snapshot/Patch/Event
→ nested call/return/resume
→ Renderer reload/recovery
→ shutdown
```

Failure：Runtime crash、Frame timeout/divergence、Data carrier loss/reconnect、Renderer Control loss、invalid Render Patch、Content fault分别验证其独立 failure boundary。

## 21. Fixture Revision / CI

每个协议 fixture corpus独立跟踪 protocol/version/fixtureSetRevision。

Frame示例：

```text
fixtureFormatVersion = 1
protocol = loomrealm.frame-call
protocolVersion = 1
fixtureSetRevision = N
```

CI最终至少报告：

```text
Subsystem Control v2 conformance
Runtime Control Profile v2 integration
Frame v1 Main / Subsystem / Desktop / PWA conformance
Renderer Control v1 conformance
Data Connection v1 conformance
User Input v1 Core conformance
Render Update v1 conformance
Content API v1 conformance
```

协议已写完不等于实现 conformant；只有 executable fixture实际通过后才能声明对应角色兼容。
