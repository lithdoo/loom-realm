# M7 / 04 — Renderer Control Vertical Integration

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：04  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md) → [M7 / 03](M7_03_RENDERER_CONTROL_STORE.md)  
> 目标：通过 deterministic MemoryCarrier 跑通真实 Main integration → renderer-control → Renderer role vertical，验证 causal/authority semantics；不引入 test-only authority bypass 或预测式 Platform abstraction。

核心原则：

> **MemoryCarrier 可以是假物理 transport，但 Main projection、peer、authentication/current-connection decision、Renderer application path 必须是真生产代码路径。**

---

## 1. Vertical Shape

```text
existing LogicalGameBootstrap
→ @loomrealm/main
→ existing Runtime/Frame/Stack authority
→ real Main renderer projection/revision path
→ @loomrealm/renderer-control Main peer
→ MemoryCarrier<string>
→ @loomrealm/renderer-control Renderer peer
→ @loomrealm/renderer current Snapshot
```

Subsystem side继续复用真实：

```text
Main
↔ @loomrealm/runtime-control
↔ MemoryCarrier
↔ @loomrealm/subsystem/host
↔ test business Definition
```

---

## 2. What May Be Fake

测试可 fake：

```text
physical renderer transport
physical BrowserWindow / Worker
platform token delivery mechanism
```

测试不得 fake：

```text
Main authority state
AuthorityRevision
Snapshot construction
hello authentication decision
current Renderer connection decision
renderer-control peers
Renderer current Snapshot application
```

禁止 harness 读取 Main private `stack` 后手工拼 Snapshot。

---

## 3. Ingress Must Be Production-shaped

M7 尚不预定义新的 `@loomrealm/platform-ports` renderer port。

但 established MemoryCarrier 必须进入**真实 Main integration seam**，不能靠 test-only public API 或绕过 Main authority。

如果实现发现：

```text
无法把 established carrier 接入 live Main
除非暴露 private authority
或加入 test-only production API
```

则停止实现，重新评估一个最窄的 Core↔Platform ingress capability。只有这个真实阻塞出现时才定义 exact port shape。

禁止预先创建：

```text
RendererPlatform
UniversalConnectionBroker
PlatformRendererServices
RendererHosting mega-interface
```

这与 platform architecture 的原则一致：conceptual role-facing port 只有在真实 consumer closure 时才冻结 exact TypeScript shape。

---

## 4. Integration Composition

M7 test composition只负责：

```text
construct real Main
construct real Renderer role
create deterministic carrier pair
supply physical bootstrap glue needed to reach production integration seam
start/stop participants
observe results
```

测试 glue 如果没有独立产品语义，就保持 test-local，不发布 capability package。

---

## 5. Initial Hello

第一条真实链路：

```text
Main Session has current committed Snapshot R
→ fresh rendererControlToken owned by Main
→ Renderer peer sends renderer.hello(id=1)
→ Main authenticates/consumes token
→ Main peer returns Snapshot R
→ Renderer peer validates
→ Renderer role installs accepted Snapshot R
```

验证：

```text
hello first
one successful token consumption
hello Result before renderer.state
Renderer Snapshot equals Main real projection
```

---

## 6. Runtime Lifecycle Projection

覆盖 Main real mapping：

```text
bootstrap key not yet materialized → declared
starting → starting
connected → connected
identified / initializing → identified
ready → ready
stopping → stopping
expected termination observed → stopped
failure → failed
```

测试比较 Main projector output 与 Renderer current Snapshot；不得创建第二套 expected renderer lifecycle state machine。

允许 publication coalescing，不要求观察全部 intermediate revisions。

---

## 7. Frame / Activation Traces

### Initial Frame

```text
starting
→ initialize success
→ activate Response accepted
→ Main commits active + fresh activationId
→ projection may expose InputTarget
```

### frame.call

```text
caller active
→ Main commits suspended caller / revoked old Activation
→ child starts
→ child activate Response accepted
→ Main commits child active + fresh Activation/InputTarget
```

### frame.return

```text
child closing/removal commit
→ caller resume Response accepted
→ Main commits caller active + fresh Activation/InputTarget
```

验证 lifetime Main invariant：旧 `frameId + activationId` 永不 regrant。该断言来自 Main trace，不要求 Renderer peer 保存历史 Set。

---

## 8. Runtime Failure / Unwind

复用 M5 failure scenario：

```text
Runtime failure
→ Main first-wins failure authority
→ fixed-point unwind
→ committed current state
→ renderer projection/publication
→ Renderer current Snapshot converges
```

Renderer side无 unwind algorithm。

---

## 9. DataAuthority Scope in M7

Main M7 vertical固定：

```text
dataAuthorities = []
```

不要构造 synthetic Main DataAuthority allocator/generation policy。

非空 DataAuthority 只在：

```text
renderer-control package fixtures
renderer role accepted-Snapshot fixtures
```

验证 representation/atomic storage。真实 Main DataAuthority add/replace/revoke trace进入 M8。

---

## 10. Connection Replacement

需要验证真实 Main current-connection decision：

```text
connection A current
→ fresh token + connection B successful hello
→ B current
→ A no longer receives valid publication
→ Renderer role ignores old peer output
```

不 replay A 缺失 revisions。

如果完成这个 trace 必须手工改 Main private state，则 ingress/current-connection boundary 尚未关闭，M7/04 不得通过。

---

## 11. Slow Consumer / Bounded Publication

制造：

```text
R in-flight
R+1 pending
R+2 committed
R+3 committed
```

必须观察实现状态仍为：

```text
0..1 in-flight
+
0..1 pendingLatest
```

`R+1` 可被 `R+3` 替换。不能出现按 revision 增长的 queue/history/listener。

---

## 12. Terminal Scenarios

至少覆盖：

```text
carrier closes during hello
carrier closes while current
invalid hello
invalid inbound Snapshot/wire
publication failure
connection replacement while write pending
```

要求：

```text
terminal first-wins
pending settles
no retry/replay
current Renderer peer terminal → Renderer currentSnapshot=null
no unbounded task/listener leak
```

---

## 13. Correct Package Dependency Direction

M7 target：

```text
foundation ─────┐
wire ───────────┴→ renderer-control

main ─────────────→ renderer-control
renderer ─────────→ renderer-control
```

必须保持：

```text
renderer-control !→ main
renderer-control !→ renderer
renderer !→ main
main !→ renderer
```

不要形成 role cycle。

---

## 14. CI Shape

真实实现出现后分别保留：

```text
renderer-control package tests
main projection tests
renderer role tests
M7 vertical tests
```

不要把全部行为塞进单一巨型 E2E。

---

## 15. Physical Platform Deferred

M7/04 不关闭：

```text
Desktop BrowserWindow bootstrap
Hostra Renderer Control WebSocket
PWA MessagePort bootstrap
physical token delivery
Data Broker
```

M7 的目标是 protocol/role semantics。物理产品 integration 后续由真实 Hostra/PWA consumer 再关闭。

---

## 16. Step Closure

M7/04 complete when：

```text
real Main projection path → real Main peer works
real Renderer peer → real Renderer current Snapshot works
no test manually constructs authority Snapshot
initial hello works
Runtime lifecycle mapping works
call/return/fresh Activation traces work
failure/unwind projection works
connection replacement works
slow consumer remains structurally bounded
terminal behavior deterministic
package dependency direction is correct
no speculative Platform abstraction was added
```
