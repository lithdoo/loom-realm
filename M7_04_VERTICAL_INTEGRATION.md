# M7 / 04 — Renderer Control Vertical Integration

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：04  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md) → [M7 / 03](M7_03_RENDERER_CONTROL_STORE.md)  
> 目标：把 `@loomrealm/main`、`@loomrealm/renderer-control`、`@loomrealm/renderer` 通过 deterministic transport-independent carrier 组合成第一条真实 M7 vertical，并验证既有 Runtime/Frame semantics 在 Renderer mirror 中保持一致。

核心原则：

> **M7/04 验证真实 consumer integration，但仍不把 Desktop BrowserWindow、PWA MessagePort、Data Broker 或 future Platform ports 提前带入。**

---

## 1. Vertical Shape

目标链路：

```text
existing LogicalGameBootstrap
→ @loomrealm/main
→ Main committed Runtime/Frame authority
→ RendererAuthoritySnapshotV1
→ @loomrealm/renderer-control Main peer
→ deterministic MessageCarrier<string>
→ @loomrealm/renderer-control Renderer peer
→ @loomrealm/renderer Control Store
```

Subsystem side继续复用已存在的：

```text
Main
↔ @loomrealm/runtime-control
↔ MemoryCarrier
↔ @loomrealm/subsystem/host
↔ test business Definition
```

因此完整测试拓扑是：

```text
Subsystem test runtime
        ↕ Runtime Control
       Main
        ↓ committed authority projection
 Renderer Control Main peer
        ↕ MemoryCarrier
 Renderer Control Renderer peer
        ↓
 Renderer Control Store
```

---

## 2. Why MemoryCarrier First

M7 要验证的是：

```text
protocol mechanics
Main authority projection
Renderer atomic mirror
cross-package causal ordering
terminal semantics
bounded publication
```

不是：

```text
WebSocket handshake
BrowserWindow lifecycle
MessagePort transfer
Hostra/PWA bootstrap plumbing
```

因此 first qualification 使用 `@loomrealm/foundation` deterministic memory carrier，复用 M3–M5 已验证的 semantic-first 方法。

---

## 3. No New Platform Port By Default

M7/04 默认不扩展 `@loomrealm/platform-ports`。

理由：

```text
renderer-control consumes already-established MessageCarrier<string>
vertical test composition can create deterministic carrier directly
no second concrete platform realization is required to close M7 semantics
```

只有在真实 Main/Renderer consumer 集成证明存在一个：

```text
Core ↔ Platform capability/fact
with stable platform-neutral semantics
```

且无法合理留在 composition/test harness 时，才 reopen `platform-ports`。

禁止提前定义：

```text
RendererPlatform
RendererControlHosting
UniversalConnectionBroker
PlatformRendererServices
```

---

## 4. Integration Composition Ownership

M7 test/integration composition负责：

```text
construct Main
construct renderer-control peers
construct Renderer role
connect deterministic carriers
supply Main-owned rendererControlToken auth callback/decision
start/stop participants in deterministic order
capture terminal outcomes
```

这些 glue 若只有测试使用，应保留 test-local。

不要把 one-off composition glue发布成 capability package。

---

## 5. Initial Hello Scenario

第一条必须通过的真实链路：

```text
Main Session exists
→ Main owns current committed Snapshot R
→ Renderer obtains attempt token from test composition
→ renderer peer sends renderer.hello
→ Main auth accepts/consumes token
→ Main peer returns protocolVersion=1 + Snapshot R
→ Renderer peer validates
→ Renderer atomically installs Snapshot R
```

验证：

```text
hello is first application message
one successful token consumption
hello Result precedes later renderer.state
initial Snapshot exactly equals Main committed projection
```

---

## 6. Runtime Lifecycle Trace

复用真实 Main Runtime lifecycle：

```text
declared
→ starting
→ connected
→ identified
→ ready
```

每次 Renderer-visible commit：

```text
Main revision advances
→ latest full Snapshot eligible for publication
→ Renderer eventually observes a newer complete Snapshot
```

允许 coalescing；测试不得要求观察每个 intermediate revision。

最终 Renderer state必须等价于 Main current committed state。

---

## 7. Initial Frame Trace

验证：

```text
initial Frame starting
→ frame.initialize completes
→ frame.activate ACK accepted
→ Main commits active + fresh activationId
→ InputTarget may become non-null
→ Renderer receives complete committed state
```

断言：

```text
Renderer never observes InputTarget for unacknowledged Activation
active Frame and InputTarget identities match exactly
```

---

## 8. frame.call Trace

真实业务 Definition 触发 call：

```text
Caller active
→ Main begins call transaction
→ caller suspension / InputTarget revocation commits as defined
→ child Frame starts
→ child activate ACK
→ Main commits child active + fresh Activation/InputTarget
→ Renderer mirrors committed results
```

Renderer不得：

```text
interpret "call" command
predict child
retain old caller InputTarget
```

测试应比较 Main committed Snapshot 与 Renderer Store，而不是比较命令事件序列。

---

## 9. frame.return Trace

```text
Child active
→ child return
→ Main commits child close/removal
→ caller resume handshake
→ fresh caller Activation ACK
→ Main commits caller active + fresh InputTarget
→ Renderer mirrors result
```

验证旧 caller `frameId + old activationId` 永不重新成为 authority。

---

## 10. Runtime Failure / Unwind Trace

利用 M5 已有 failure scenario：

```text
Runtime fails
→ Main first-wins failure cause
→ fixed-point unwind
→ committed final Runtime/Stack/InputTarget state
→ Renderer Control publishes resulting Snapshot(s)
→ Renderer Store matches final committed authority
```

Renderer side没有 unwind algorithm。

---

## 11. DataAuthority Logical Trace

M7 可使用 synthetic/logical DataAuthority 来验证 Renderer Control projection，无需建立 Data carrier。

至少验证：

```text
authority appears
generation replacement
profile replacement requires fresh generation
authority disappears
control loss invalidates usability
```

不得在测试里为了“完整”而实现 M8 DataConnectionBroker。

---

## 12. Connection Replacement / Reload

Scenario：

```text
Renderer connection A current
→ fresh token + connection B hello
→ B becomes current
→ A stops receiving publication
→ B receives current full Snapshot
```

不 replay A 缺失的 revisions。

Renderer role应建立新 current authority universe/connection context，而不是尝试 merge old connection history。

---

## 13. Slow Consumer / Coalescing

制造 blocked/slow writer：

```text
Snapshot R in-flight
R+1 pending
R+2 committed
R+3 committed
```

允许：

```text
unsent R+1 replaced by R+3
```

目标 invariant：

```text
0..1 in-flight
+
at most one latest unsent Snapshot
```

Renderer最终获得合法 latest complete state；不要求接收每个 revision。

---

## 14. Terminal Scenarios

至少覆盖：

```text
carrier closes during hello
carrier closes after current
invalid Renderer hello
invalid inbound JSON/schema
Main-side publication failure
Renderer-side invalid Snapshot
connection replaced while write pending
```

要求：

```text
terminal first-wins
no retry/replay
pending work settles
Renderer authority fails closed when proof is lost
no unbounded task/listener leak
```

---

## 15. Package Graph Check

M7/04 后预期新增 dependency direction：

```text
foundation ─────┐
wire ───────────┼→ renderer-control
                │
renderer-control → main
renderer-control → renderer
```

更准确的 package dependency graph 要服从实际 `package.json`，但必须保持：

```text
renderer-control !→ main
renderer-control !→ renderer
renderer !→ main
main !→ renderer
```

不要形成 role package cycle。

---

## 16. Root Scripts / CI

只有在真实 package 实现出现后，再增加对应脚本，例如：

```text
test:renderer-control
test:renderer
```

CI 应分别覆盖：

```text
renderer-control package conformance
main package Renderer projection tests
renderer package Control Store tests
M7 cross-package vertical
```

不要把 M7 测试全部塞进一个巨型 root E2E，使 package-local failure 难以定位。

---

## 17. Physical Platform Deferred

M7/04 明确不关闭：

```text
Desktop BrowserWindow Renderer bootstrap
Hostra Renderer Control WebSocket adapter
PWA Renderer bootstrap
MessagePort transfer
actual platform token delivery UI/process boundary
```

这些能力在出现对应 product composition milestone 时落地。

如果后续 phase plan 明确要求 M7 就包含某个 physical Renderer Control slice，应单独新增后续编号文档，而不是污染当前 protocol/role qualification。

---

## 18. Step Closure

M7/04 complete when：

```text
Main ↔ renderer-control ↔ Renderer real consumers run together
initial hello works
Runtime lifecycle projection works
initial Frame works
call/return works
failure/unwind result projection works
connection replacement works
slow consumer remains bounded
terminal behavior is deterministic
no physical platform dependency is required for semantic qualification
```

完成后进入：

```text
M7_05_QUALIFICATION_CLOSURE.md
```
