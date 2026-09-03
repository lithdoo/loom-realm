# M7 / 04 — Renderer Control Vertical Integration

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：04  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md) → [M7 / 03](M7_03_RENDERER_CONTROL_STORE.md)  
> 目标：通过 deterministic MemoryCarrier 跑通真实 Main integration → renderer-control → Renderer role vertical，验证 authority、hello/replacement 并发、boundedness 与 fail-closed；不引入 test-only authority bypass 或预测式 Renderer Platform abstraction。

核心原则：

> **MemoryCarrier 可以是假物理 transport，但 Main authority、revision、hello acceptance、current-peer replacement、Renderer application path必须都是真生产路径。**

---

## 1. Vertical Shape

```text
LogicalGameBootstrap
→ real @loomrealm/main Session
→ existing Runtime/Frame/Stack authority
→ real Renderer projection/revision/hello acceptance
→ @loomrealm/renderer-control Main peer
→ MemoryCarrier<string>
→ @loomrealm/renderer-control Renderer peer
→ @loomrealm/renderer currentPeer + currentSnapshot
```

Subsystem side继续复用：

```text
Main
↔ @loomrealm/runtime-control
↔ MemoryCarrier
↔ @loomrealm/subsystem/host
↔ test business Definition
```

---

## 2. What May Be Fake

可 fake：

```text
physical Renderer transport
BrowserWindow / Worker
physical token delivery mechanism
```

不得 fake：

```text
Main authority
sessionId / AuthorityRevision
Snapshot projection
opaque material generation contract
hello token authentication/consumption
current Renderer peer decision
peer replacement retirement
renderer-control peers
Renderer current Snapshot application
```

禁止 harness 读取 Main private state后手工拼 Snapshot。

---

## 3. Ingress Must Be Production-shaped

M7尚不预定义 RendererHosting/RendererControlHost 等新的 renderer physical port。

established MemoryCarrier 必须进入真实 Main integration seam；不能靠 test-only public API或 authority bypass。

若无法做到：

```text
established carrier
→ real Main hello acceptance/current-peer path
```

而不暴露 Main internals，则停止实现并基于真实阻塞关闭一个最窄 Core↔Platform ingress capability。

允许的 `platform-ports` M7变化仅包括已有多消费者证明的 fresh opaque material capability泛化；它不等于 Renderer physical ingress port。

---

## 4. Integration Composition

M7 test composition只负责：

```text
construct real Main
construct real Renderer role
provide real narrow platform capability view including opaqueTokens
create deterministic carrier pair
route carrier through production ingress seam
start/stop participants
observe results
```

one-off glue保持 test-local，不发布 service framework。

---

## 5. Session / Initial Revision

第一条 evidence从 Main Session creation开始：

```text
fresh sessionId generated
initial Renderer authority revision = 1
initial full Snapshot frozen
```

随后 Runtime bootstrap等 visible commit可以在没有 Renderer connection时继续推进 revision。

hello时 Renderer取得**当时 current revision R**，不假设 R=1。

验证：

```text
revision never starts at 0
revision comparison excludes revision field itself
transport/current-peer bookkeeping does not bump revision
```

---

## 6. Initial Hello Atomicity

必须构造 race test：

```text
Main current Snapshot = R
candidate hello arrives
```

在 hello acceptance serialization boundary附近并发触发一个 Renderer-visible Main commit。

只允许两种合法结果：

```text
commit happens before atomic hello acceptance
→ hello Snapshot already contains R+1

or

hello acceptance captures R first
→ candidate becomes current in same atomic step
→ later commit R+1 enters pendingLatest
→ hello Result(R) sends first
→ renderer.state(R+1) later
```

绝不允许：

```text
hello returns R
Main current = R+1
R+1 neither in hello nor pending/sent
```

验证 Renderer side：

```text
initial Snapshot installed with new peer
before later state consumption starts
```

---

## 7. Runtime Lifecycle Projection

覆盖：

```text
not materialized → declared
starting → starting
connected → connected
identified / initializing → identified
ready → ready
stopping → stopping
expected termination observed → stopped
failure → failed
```

比较 Main projector current output与 Renderer current Snapshot；不建立第二套 expected lifecycle machine。

允许 publication coalescing。

---

## 8. Frame / Activation Traces

### Initial Frame

```text
starting
→ initialize success
→ activate Response accepted
→ Main commits active + fresh Activation/InputTarget
→ Renderer mirrors committed state
```

### frame.call

```text
caller active
→ Main commits caller suspended / old Activation revoked / child starting
→ child activate ACK
→ Main commits child active + fresh Activation/InputTarget
```

### frame.return

```text
child closing/removal commit
→ caller resume ACK
→ Main commits caller active + fresh Activation/InputTarget
```

验证 old `frameId + activationId` never regrant；该 lifetime invariant由 Main trace证明，不由 receiver历史 Set证明。

---

## 9. Runtime Failure / Unwind

复用 M5 real failure scenario：

```text
Runtime failure
→ Main first-wins failure
→ fixed-point unwind
→ committed authority
→ projection/publication
→ Renderer converges
```

Renderer无 unwind algorithm。

---

## 10. DataAuthority Scope

Main M7 vertical固定：

```text
dataAuthorities = []
```

不要构造 synthetic Main allocator/generation policy。

非空 DataAuthority只在 renderer-control/renderer package fixture验证 representation；真实 lifecycle进 M8。

---

## 11. Connection Replacement Is Active

必须使用两个真实 Renderer peers：A、B。

```text
A current with Snapshot RA
→ fresh token + B hello
→ Main atomic acceptance makes B only current
→ A immediately removed from publication authority
→ A Main peer actively retire/close carrier
→ B installs hello Snapshot RB
→ A observes terminal and clears its local current authority
```

验证：

```text
A receives no post-replacement valid state
A carrier close/terminal actually occurs; not merely silence
A late terminal cannot clear B Renderer role current state
B hello Result send failure does not resurrect A as current
fresh attempt required after failed B
```

M7 Data/Input尚未存在，所以 product-level old participant input rejection在后续 Data/Input milestone消费同一 current-participant authority；M7必须先证明 Control currentness/terminal闭合。

---

## 12. Slow Consumer / Bounded Publication

制造：

```text
R in-flight
R+1 pending
R+2 committed
R+3 committed
```

结构必须始终：

```text
0..1 in-flight
+
0..1 pendingLatest
```

`R+1` 可被 `R+3` 替换；不能出现 revision-sized queue/history/listener。

M7只证明 core structural boundedness。MemoryCarrier不代替 Hostra/PWA concrete stalled-write finite close policy evidence。

---

## 13. Representation Failure Must Not Contaminate Frame Semantics

构造一个超过 Renderer Control wire representation limit 的合法 Main projection fixture/scenario（可通过 package-level synthetic projector fixture，不必强迫真实 Frame Stack达到某 magic count）。

验证：

```text
outbound preflight rejects full Snapshot
Renderer Control attempt/current peer terminalizes
Main Runtime/Frame/Stack authority unchanged
no Frame transaction rollback
no Renderer-specific frame.call error
no truncation/drop
```

M7不得新增：

```text
max Frame Stack = N business rule
max Runtime = N business rule
max DataAuthority = N business rule
```

只保留 formal wire size/depth/member limits。

---

## 14. Current Peer Terminal

验证：

```text
current B peer terminal
→ Main currentRendererPeer = null
→ rendererRevision unchanged solely because of transport loss
→ Renderer B currentPeer/currentSnapshot = null
```

以及：

```text
stale A terminal after B current
→ Main ignores for currentness
→ Renderer role ignores for B state
```

恢复只允许 fresh token + fresh hello current Snapshot。

---

## 15. Other Terminal Scenarios

至少覆盖：

```text
carrier closes during hello
hello Result send failure
invalid hello/auth/version
invalid inbound/outbound wire
replacement while old write pending
representation preflight failure
```

要求：

```text
terminal first-wins
pending settles
no retry/replay
no old-current rollback
no task/listener leak
```

---

## 16. Correct Package Dependency Direction

```text
foundation ─────┐
wire ───────────┴→ renderer-control

platform-ports ← main → renderer-control
renderer ─────────────→ renderer-control
```

保持：

```text
renderer-control !→ main/renderer/platform-ports
renderer !→ main
main !→ renderer
```

`platform-ports` 的 M7 refinement只提供 narrow opaque material primitive，不提供 universal Renderer services。

---

## 17. CI Shape

分别保留：

```text
renderer-control package tests
platform-ports/main opaque material integration tests
main projection/hello tests
renderer role tests
M7 cross-package vertical
```

不要集中成一个巨型 E2E。

---

## 18. Physical Platform Deferred

M7/04不关闭：

```text
Desktop BrowserWindow Renderer bootstrap
Hostra Renderer Control WebSocket
PWA Renderer Control MessagePort
physical renderer token delivery
concrete stalled-write timeout policy
Data Broker
```

这些由后续真实 product composition qualification关闭。

---

## 19. Step Closure

M7/04 complete when：

```text
real Main → peer → Renderer path works
initial revision/session semantics work
hello concurrent commit race is impossible/lossless
Renderer hello handoff cannot lose first later state
replacement actively closes old connection
old/new peer terminal races are identity-safe
call/return/fresh Activation traces work
failure/unwind projection works
slow consumer stays structurally bounded
representation failure only kills Renderer Control
no test-built authority Snapshot
no speculative Renderer Platform abstraction
```