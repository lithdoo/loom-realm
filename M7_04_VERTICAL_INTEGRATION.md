# M7 / 04 — Renderer Control Vertical Integration

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M7 Renderer Control  
> 落地顺序：04  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md) → [M7 / 02](M7_02_MAIN_AUTHORITY_PROJECTION.md) → [M7 / 03](M7_03_RENDERER_CONTROL_HOLDER.md)  
> 冻结决策：[ADR 0027](doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 目标：用 deterministic `RendererControlBinding + MemoryCarrier` 跑通真实 Main → renderer-control → Renderer vertical，验证 frozen authority/currentness/race/bounded/fail-closed semantics；不使用 test-only authority bypass。

> **MemoryCarrier 可以是假 physical transport，但 Binding、Main authority、candidate-slot lifecycle、hello acceptance、replacement、Renderer holder必须全部走生产代码路径。**

---

## 1. Frozen Vertical

```text
LogicalGameBootstrap
→ real @loomrealm/main Session
→ optional platform.rendererControl: RendererControlBinding
→ real Main bounded candidate-slot loop
→ existing Runtime/Frame/Stack authority
→ real projection/revision/hello acceptance
→ renderer-control Main peer
→ MemoryCarrier<string>
→ renderer-control Renderer peer
→ @loomrealm/renderer current peer + Snapshot holder
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

Fixture可在 test-only side观察：

```text
Main交付的 token
armed slot count
bound candidate count
candidate Renderer endpoint of MemoryCarrier pair
abort/close facts
Binding terminal rejection trigger
```

但不得通过 fixture：

```text
认证 token
决定 current Renderer
协商 protocol version
构造 Snapshot/revision
访问 Main private authority
绕过 renderer-control peer
```

Test Binding只实现 physical candidate-slot delivery/establishment semantics。

---

## 3. Candidate Slot / Binding Lifecycle Evidence

必须分别证明：

### Pending slot does not create Renderer

```text
Main calls acquire(T)
→ Promise remains pending
→ fixture creates no candidate solely because acquire was called
→ current Renderer/Runtime/Frame state unchanged
```

### Exactly one candidate per slot

```text
one armed slot T
→ first physical candidate binds and receives T
→ one carrier resolves
→ second physical candidate for the already-bound slot receives no T
→ second candidate never reaches a Main renderer-control peer
```

### No slot means no participant

```text
no armed slot
→ physical candidate appears
→ candidate receives no Main token
→ no live Renderer Control participant/carrier is exposed to Main
→ fixture rejects/closes/discards it
```

### Abort cancellation

```text
slot pending
→ signal abort
→ acquire settles as cancellation
→ late candidate/carrier is not delivered as live result
```

### Binding terminal rejection

```text
slot pending
→ acquire rejects for non-abort reason
→ Binding terminal for this Main Session
→ Main invalidates slot/token
→ Main arms no further Renderer slot
→ healthy current Renderer, if any, remains current solely with respect to this Binding failure
→ Runtime/Frame Session continues
```

### Protocol attempt terminal is not Binding terminal

After carrier acquisition：bad hello / unsupported version / hello send failure / peer terminal MAY settle that candidate attempt；if Session live and Binding itself has not rejected, Main MAY arm one fresh next slot with fresh token。

---

## 4. Session / Initial Revision

Session creation：

```text
fresh sessionId from valid opaque material
initial Renderer revision = 1
initial Snapshot frozen
```

Renderer尚未连接时 Runtime bootstrap/Frame commit可继续推进 revision。

Hello取得当时 current `R`，不假设 `R=1`。Transport/candidate bookkeeping不推进 revision。

---

## 5. Initial Hello Exact Preflight + Atomicity

### Representable current Snapshot

在 hello acceptance附近并发 Renderer-visible Main commit：

```text
commit before atomic acceptance
→ hello contains R+1

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
→ current Snapshot/prepared hello exceeds v1 limits
```

必须：

```text
B fails closed
B token/attempt invalidated
A remains current
A is NOT retired
Main Runtime/Frame authority unchanged
```

---

## 6. Renderer Initial Handoff / Local Currentness

验证：

```text
Renderer peer validates/returns R
→ Renderer role installs {newPeer,R} atomically
→ only then later state consumption starts
```

制造 R+1 已在 peer/carrier侧等待的时序，确保 initial install后才应用 R+1。

Replacement 后还必须证明：旧 Renderer 在观察 terminal 前 MAY 仍有本地 Snapshot，但该本地 holder不会被测试/实现当作独立的 Main remote-currentness proof；不得增加 lease/epoch/heartbeat层。

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

failure precedence高于 stopped。Session terminal后不要求继续观察 cleanup 的 stopping/stopped publication。

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

Old `frameId + activationId` never regrant由 Main trace证明，不由 receiver历史 Set证明。

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
→ Main has one armed future candidate slot
→ B binds carrier/token and sends hello
→ protocol peer selects v1
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
late A message has no effect on B holder/currentness
A late terminal cannot clear B
B hello send failure does not resurrect A
fresh attempt required after failed B
```

不得测试“replacement 后 A 绝不收到任何 bytes”。

---

## 12. Slow Consumer / Bounded Publication

制造：

```text
R inFlight
R+1 pending
R+2 commit
R+3 commit
```

实现始终：

```text
0..1 inFlight
0..1 pendingLatest
```

`R+1` 可被 `R+3` 替换；无 revision-sized queue/history/listener。

M7只证明 Core structural boundedness，不声称 Hostra/PWA stalled-write finite timeout已 qualification。

---

## 13. Representation Failure During Current Connection

构造合法 Main authority但 outbound full state不可表示：

```text
Main commits authority
→ peer exact outbound preflight fails
→ current Renderer Control terminalizes
```

验证 Main Runtime/Frame/Stack unchanged、no rollback、no Renderer-specific Frame error、no Snapshot truncation，Renderer holder最终 `current=null`。

---

## 14. Current / Stale Peer Terminal

```text
current B terminal
→ Main currentRendererPeer=null
→ rendererRevision unchanged solely for transport loss
→ Renderer B holder current=null
```

```text
stale A terminal after B current
→ Main ignores A for currentness
→ Renderer holder ignores A for B state
```

---

## 15. Main Session Terminal

分别覆盖 root outcome / external shutdown / fatal。

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

Binding已经 terminal或 capability absent时不得额外制造 cleanup framework。

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
Binding non-abort rejection
```

要求 terminal first-wins、pending settles、no retry/replay、no old-current rollback、no unbounded task/listener leak。

---

## 17. Frozen Runtime Dependency Sets

为避免箭头语义歧义，冻结为明确的 `depends on`：

```text
@loomrealm/platform-ports depends on:
    @loomrealm/foundation

@loomrealm/renderer-control depends on:
    @loomrealm/foundation
    @loomrealm/wire

@loomrealm/main depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/wire

@loomrealm/renderer depends on:
    @loomrealm/renderer-control
```

禁止反向 role/protocol dependency：renderer-control→main/renderer/platform-ports、platform-ports→main/renderer-control、renderer→main/platform-ports、main→renderer。

---

## 18. CI Shape

分别保留：

```text
renderer-control package tests
platform-ports M7 contract tests
main projection/candidate-slot/hello tests
renderer holder tests
M7 cross-package vertical
existing M1–M6 regression
```

不要集中成巨型 E2E。

---

## 19. Physical Platform Deferred

M7 不 qualification Hostra BrowserWindow/Renderer WS、PWA Renderer MessagePort、actual stalled-write timeout policy、Data Broker。

`RendererControlBinding` logical Core↔Platform contract在 M7 已冻结并由 deterministic implementation真实消费。Hostra physical Renderer Control M14关闭；PWA M16关闭。

---

## 20. Frozen Closure

M7/04 complete when：

```text
real RendererControlBinding → Main candidate-slot loop → peer → Renderer path works
acquire pending/no-slot/extra-candidate semantics proven
abort vs non-abort Binding terminal semantics proven
hello exact preflight/current switch ordering proven
concurrent revision cannot be lost
Renderer initial handoff cannot lose first later state
replacement blocks new old-peer sends without fictitious cancellation
local holder is not treated as remote currentness proof
old/current terminal identity-safe
Session terminal retires Renderer authority
call/return/failure traces pass
slow consumer structurally bounded
representation failure isolated
no test-built authority Snapshot
```

除 ADR 0027 Reopen Rule外，不允许实施阶段重新选择 ingress/attempt/currentness/Binding-failure模型。
