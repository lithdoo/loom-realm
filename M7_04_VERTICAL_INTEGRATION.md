# M7 / 04 — Renderer Control Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M7 Renderer Control  
> 落地顺序：04  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md) → [M7 / 03](M7_03_RENDERER_CONTROL_STORE.md)  
> 冻结决策：[ADR 0027](doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 目标：用 deterministic `RendererControlBinding + MemoryCarrier` 跑通真实 Main → renderer-control → Renderer vertical，验证 frozen authority/currentness/race/bounded/fail-closed semantics；不使用 test-only authority bypass。

> **MemoryCarrier 可以是假 physical transport，但 Binding、Main authority、accept loop、hello acceptance、replacement、Renderer holder必须全部走生产代码路径。**

---

## 1. Frozen Vertical

```text
LogicalGameBootstrap
→ real @loomrealm/main Session
→ platform.rendererControl: RendererControlBinding
→ real Main accept loop
→ existing Runtime/Frame/Stack authority
→ real projection/revision/hello acceptance
→ renderer-control Main peer
→ MemoryCarrier<string>
→ renderer-control Renderer peer
→ @loomrealm/renderer current peer + Snapshot
```

Subsystem side继续复用：

```text
Main
↔ runtime-control
↔ MemoryCarrier
↔ subsystem/host
↔ test business Definition
```

---

## 2. Deterministic `RendererControlBinding` Fixture

M7 test Platform必须真实实现 frozen Binding shape：

```ts
acquire(rendererControlToken, signal): Promise<MessageCarrier>
```

Fixture可额外在 test-only side观察：

```text
Main交付的 token
pending acquire count
candidate Renderer endpoint of the MemoryCarrier pair
abort/close facts
```

但不得通过 fixture：

```text
认证 token
决定 current Renderer
构造 Snapshot/revision
访问 Main private authority
绕过 renderer-control peer
```

Test Binding只实现 physical delivery/establishment semantics。

---

## 3. Bounded Attempt Lifecycle

必须证明 Main：

```text
at most one pending acquire/candidate attempt
Renderer absence does not block Runtime/Frame Session progress
fresh attempt uses fresh token
attempt settle/terminal invalidates old token
current A may coexist with exactly one future candidate B
```

Pending acquire Session terminal时必须收到 abort；abort后 fixture不得晚交付 live carrier。

---

## 4. Session / Initial Revision

Session creation：

```text
fresh sessionId
initial Renderer revision = 1
initial Snapshot frozen
```

Renderer尚未连接时 Runtime bootstrap/Frame commit可继续推进 revision。

Hello取得当时 current `R`，不假设 `R=1`。

验证 transport/candidate bookkeeping不推进 revision。

---

## 5. Initial Hello Exact Preflight + Atomicity

必须构造两类 evidence。

### Representable current Snapshot

在 hello acceptance附近并发一个 Renderer-visible Main commit：

合法结果只有：

```text
commit before atomic acceptance
→ hello already contains R+1

or

acceptance captures/prepares R first
→ candidate becomes current in same serialized transaction
→ later commit R+1 enters pendingLatest
→ prepared hello Result(R) sends first
→ renderer.state(R+1) later
```

不得丢失 R+1。

### Unrepresentable current Snapshot

```text
A healthy current
→ B candidate hello
→ current Snapshot/prepared hello exceeds v1 representation limits
```

必须：

```text
B fails closed
B token/attempt invalidated
A remains current
A is NOT retired
Main Runtime/Frame authority unchanged
```

这证明 exact preflight发生在 current switch之前。

---

## 6. Renderer Initial Handoff

验证：

```text
Renderer peer validates/returns R
→ Renderer role installs {newPeer,R} atomically
→ only then later state consumption starts
```

制造 R+1 已在 carrier/peer侧等待的时序，确保 initial install后才应用 R+1，不丢失、不错误归属。

---

## 7. Runtime Lifecycle Projection

冻结 mapping evidence：

```text
not materialized → declared
failure           → failed
expected physical terminated → stopped
starting          → starting
connected         → connected
identified / initializing → identified
ready             → ready
stopping          → stopping
```

failure precedence高于 stopped。

Session terminal后不要求继续观察 shutdown cleanup的 stopping/stopped publication，因为 Renderer Control同时 retirement。

---

## 8. Frame / Activation Traces

### Initial Frame

```text
starting
→ initialize success
→ activate ACK
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
child closing/removal
→ caller resume ACK
→ Main commits caller active + fresh Activation/InputTarget
```

验证 old `frameId + activationId` never regrant；由 Main trace证明，不由 receiver历史 Set证明。

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

## 10. M7 DataAuthority Scope

Main vertical固定：

```text
dataAuthorities = []
```

非空 DataAuthority只在 renderer-control/renderer package fixture验证 formal representation。真实 lifecycle M8。

---

## 11. Active Replacement

使用两个真实 Renderer peers A/B：

```text
A current
→ Main already has one pending fresh Binding attempt
→ B obtains candidate carrier/token and sends hello
→ Main exact preflight succeeds
→ atomic acceptance commits B current / A non-current
→ A peer synchronously rejects future publication submissions
→ A pendingLatest cleared
→ A carrier close requested
→ B installs initial Snapshot
→ A eventually observes terminal
```

必须验证：

```text
A no new send is initiated after replacement commit
A already-started inFlight send MAY later settle/arrive
such late A message has no effect on B role current state
A late terminal cannot clear B
B hello send failure does not resurrect A
fresh attempt required after failed B
```

不得写“replacement 后 A 绝不收到任何 bytes”这种 Foundation carrier无法保证的测试。

---

## 12. Slow Consumer / Bounded Publication

制造：

```text
R inFlight
R+1 pending
R+2 commit
R+3 commit
```

实现结构始终：

```text
0..1 inFlight
0..1 pendingLatest
```

`R+1` 可被 `R+3` 替换；无 revision-sized queue/history/listener。

M7只证明 Core structural boundedness，不声称 Hostra/PWA stalled-write finite timeout已 qualification。

---

## 13. Representation Failure During Current Connection

构造合法 Main authority但 outbound full state message不可表示：

```text
Main commits authority
→ peer exact outbound preflight fails
→ current Renderer Control terminalizes
```

验证：

```text
Main Runtime/Frame/Stack unchanged
no transaction rollback
no Renderer-specific frame.call error
no Snapshot truncation/drop
Renderer holder eventually current=null
```

---

## 14. Current / Stale Peer Terminal

验证：

```text
current B terminal
→ Main currentRendererPeer=null
→ rendererRevision unchanged solely for transport loss
→ Renderer B current=null
```

以及：

```text
stale A terminal after B current
→ Main ignores A for currentness
→ Renderer role ignores A for B state
```

---

## 15. Main Session Terminal

分别覆盖：

```text
root outcome
external shutdown
fatal Main terminal
```

一旦 terminal latch：

```text
pending Binding acquire aborted
candidate token invalidated
candidate peer retired if present
current peer retired/close requested
no new Renderer attempt issued
no further publication submitted
Main Session result/cleanup does not wait for Renderer physical close
```

Renderer current peer最终 terminal并把 local current清空。

不发送 final `session.ended` Snapshot/RPC。

---

## 16. Other Terminal Scenarios

至少：

```text
carrier closes during hello
hello Result send failure
invalid hello/auth/version
replacement while old write inFlight
current state representation preflight failure
Binding aborted at Session terminal
```

要求：

```text
terminal first-wins
pending settles
no retry/replay
no old-current rollback
no unbounded task/listener leak
```

---

## 17. Frozen Dependency Direction

```text
foundation ─────┐
wire ───────────┴→ renderer-control

foundation → platform-ports
platform-ports →? NO (consumer direction is Main importing platform-ports)
main → platform-ports
main → renderer-control
renderer → renderer-control
```

保持：

```text
renderer-control !→ main/renderer/platform-ports
renderer !→ main/platform-ports
main !→ renderer
platform-ports !→ main/renderer-control
```

---

## 18. CI Shape

分别保留：

```text
renderer-control package tests
platform-ports M7 contract tests
main projection/accept-loop/hello tests
renderer role tests
M7 cross-package vertical
existing M1–M6 regression
```

不要集中成巨型 E2E。

---

## 19. Physical Platform Deferred

M7 不 qualification：

```text
Hostra BrowserWindow/Renderer WS physical realization
PWA Renderer MessagePort physical realization
actual stalled-write timeout policy
Data Broker
```

但 `RendererControlBinding` logical Core↔Platform contract在 M7 已冻结并由 deterministic implementation真实消费。

Hostra physical Renderer Control必须在 M14 Desktop Full E2E前关闭；PWA在 M16前关闭。

---

## 20. Frozen Closure

M7/04 complete when：

```text
real RendererControlBinding → Main accept loop → peer → Renderer path works
one candidate bound enforced
hello exact preflight/current switch ordering proven
concurrent revision cannot be lost
Renderer initial handoff cannot lose first later state
replacement blocks new old-peer sends without fictitious cancellation
old/current terminal identity-safe
Session terminal retires Renderer authority
call/return/failure traces pass
slow consumer structurally bounded
representation failure isolated
no test-built authority Snapshot
```

除 ADR 0027 Reopen Rule外，不允许实施阶段重新选择 ingress/attempt/currentness模型。