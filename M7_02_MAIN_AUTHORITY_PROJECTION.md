# M7 / 02 — Main Renderer Authority Projection

> 状态：Active Design / Draft  
> 阶段：M7 Renderer Control  
> 落地顺序：02  
> 最近复核：2026-09-03  
> 前置：[M7 / 01 — Renderer Control Package](M7_01_RENDERER_CONTROL_PACKAGE.md)  
> 目标：让 `@loomrealm/main` 从既有 Runtime/Frame/Stack authority 纯投影出完整 Renderer Snapshot，并关闭 revision、hello/current-connection、identity material 与 publication observation；不建立第二套 Renderer shadow authority。

核心原则：

> **Main 现有 Runtime/Frame/Stack 状态就是事实源。M7 只增加纯 projection + 最小 Renderer Control bookkeeping；所有 hello/current/revision 决策继续服从 Main 单一 serialized authority owner。**

---

## 1. Scope

主要修改：

```text
@loomrealm/main
@loomrealm/platform-ports   // 仅 fresh opaque material capability 的窄泛化
```

消费：

```text
@loomrealm/renderer-control
```

M7/02 不改变 Runtime Control / Frozen Frame application semantics，也不新增 Renderer physical hosting port。

---

## 2. New Main State Must Stay Minimal

允许新增长期状态：

```text
sessionId
rendererRevision
last committed Renderer authority payload/snapshot for change detection
one current Renderer peer reference | null
minimal issued/consumed rendererControlToken attempt state
```

MUST NOT新增：

```text
RendererRuntimeRegistry
RendererFrameRegistry
rendererStack shadow copy
stored rendererInputTarget independent of currentInputTarget()
RendererAuthorityManager
ProjectionFramework
ConnectionRegistry framework
```

现有 `runtimes`、`frames`、`stack`、`currentActivationId` 与 derived `currentInputTarget()` 继续是唯一业务事实源。

---

## 3. Fresh Opaque Material Capability

M5 的 `BootstrapTokenGenerator` 已证明 Main 需要 environment-backed high-entropy opaque material。M7 新增 `rendererControlToken`，并需要 Session-unique opaque `sessionId`，因此现在有多个真实消费者，允许把该 capability 收敛为通用但仍极窄的：

```ts
interface OpaqueTokenGenerator {
  generate(): string;
}
```

目标 Main-facing platform view概念上：

```text
opaqueTokens: OpaqueTokenGenerator
```

Main 对每次用途分别调用 `generate()`：

```text
fresh Session sessionId material
fresh Runtime bootstrap token
fresh Renderer Control token
```

每次返回值都独立；不得复用同一个字符串承担两个 identity/credential 语义。

`OpaqueTokenGenerator` 只生成 material，不拥有：

```text
Session identity authority
Runtime Launch Attempt authority
renderer currentness
token registration/binding/consumption
```

这些仍全部由 Main 拥有。

这是有多个真实消费者支撑的 capability 泛化，不是 Renderer mega-port。现有 Hostra/test Platform 只需机械适配该 material provider；不得借此引入 universal identity service。

---

## 4. Session Initialization

Main Session 创建时，在任何 Renderer-visible mutation publication 之前：

```text
generate + validate fresh sessionId
rendererRevision = 1
capture initial Renderer authority payload
freeze initial Snapshot revision 1
currentRendererPeer = null
```

初始 payload 包含完整 declared Runtime topology、empty/live Frame current state、derived InputTarget 与 M7 empty DataAuthority。

`sessionId` never reused；Main 应对 generator output 做协议长度/字符串/Session-local reuse 防御性检查。

---

## 5. Pure Snapshot Projection

概念函数：

```ts
captureRendererAuthoritySnapshot(): RendererAuthoritySnapshotV1
```

Projector：

```text
reads committed Main authority only
returns detached immutable value
never mutates Main state
never exposes RuntimeRecord / FrameRecord
contains no history / transport / credential
```

Renderer Runtime/Frame/InputTarget 每次从现有 authority推导，不维护 shadow records。

---

## 6. Revision Change Detection

`rendererRevision`：

```text
starts at 1
Session-local
positive safe integer
strictly increases on Renderer-visible committed authority payload change
never reused / never wraps
```

比较的是 **authority payload excluding revision**。实现不得：

```text
include revision in equality comparison
→ revision changes itself
→ self-trigger endless revision bump
```

最小做法：在 authority commit observation helper 中捕获新的 detached payload，与上次 committed payload 做 exact semantic comparison；有变化才 increment 并冻结新 Snapshot。

不因 reconnect、same Snapshot resend、peer replacement、transport terminal 等递增。

---

## 7. One Commit Observation Discipline

所有 Renderer-visible authority mutation进入同一 Main serialization discipline：

```text
authoritative mutation commits
→ capture payload
→ if changed:
     rendererRevision++
     freeze Snapshot
     submit latest Snapshot to current renderer-control Main peer if any
```

当前 bootstrap flow 中直接发生的 visible Runtime phase assignment（如 connected / identified）也必须通过同一 commit observation boundary；不得绕过。

只允许一个窄 helper，不引入 EventBus / TransactionManager / StateReplicator。

---

## 8. Runtime Lifecycle Is Pure Mapping

```text
bootstrap key 尚无 RuntimeRecord           → declared
starting                                → starting
connected                               → connected
identified                              → identified
initializing                            → identified
ready                                   → ready
stopping                                → stopping
failed                                  → failed
expected physical termination observed → stopped
```

如果 `stopped` 与现有 Main shutdown lifetime存在无法表达的真实冲突，reopen formal contract；不得新增 shadow `rendererPhase`。

---

## 9. Frame / Activation / InputTarget Projection

Stack：bottom → top，live Frames only。

```text
starting   → starting
active     → active + current activationId
suspended  → suspended
closing    → closing
closed     → omitted
```

InputTarget继续由：

```text
active Stack top + currentActivationId
```

即时派生；禁止独立 stored Renderer InputTarget。

ACK barrier不变：

```text
activate/resume Response accepted
→ Main commits fresh Activation
→ only then Renderer projection may expose it
```

revoked activationId / frameId reuse等 lifetime invariant由 Main generation逻辑和 tests证明，不由 renderer-control receiver保存历史 Set。

---

## 10. DataAuthority in M7

正式 Snapshot保留字段，但 M7 Main固定：

```text
dataAuthorities = []
```

M7 不实现 DataAuthority allocation/generation/profile policy、Registry、GenerationAllocator、fake Broker。

真实 policy 在 M8 real Renderer + Subsystem Data consumer出现时关闭。

---

## 11. Hello Acceptance Is a Main Authority Transaction

必须提供一个**单次 Main-owned hello acceptance seam**；精确函数名不冻结。

概念：

```text
acceptRendererHello(candidatePeer, token, versions)
```

必须在 Main 的 serialized authority lane 中不可分割地完成：

```text
validate candidate attempt/current Session
validate + consume rendererControlToken
select supported protocol version
capture exact current committed Snapshot R
record candidate as the only current Renderer peer
retire previous current peer from publication
return accepted {version, snapshot:R}
```

这一步与 Renderer-visible mutation串行，因此不存在：

```text
capture R
→ commit R+1 while no current peer observes it
→ later mark peer current
```

的 revision loss race。

Main peer在 transaction完成后发送 hello Result(R)。期间 later committed R+n 可被 peer收敛到 `pendingLatest`，但不能先于 hello Result发送。

---

## 12. Replacement Is Active Revocation

new hello acceptance commit 后：

```text
new peer = only current
old peer = immediately non-current
old peer receives no further publication
old peer retirement/close requested
```

old peer不能因为 new hello Result发送失败而恢复 current；恢复只能 fresh attempt/token。

Main 的 current peer terminal handler必须 identity-check：

```text
if terminal peer === currentRendererPeer:
    currentRendererPeer = null
else:
    ignore as stale peer terminal
```

peer terminal本身不改变 Runtime/Frame authority，也不推进 `rendererRevision`。

---

## 13. Renderer Control Token Attempts

每个 token：

```text
fresh
opaque
high entropy
Session-bound
one successful hello consumption
```

Main 保存最小 attempt state即可；不要创建 TokenRegistry framework。

fresh reload/reconnect由 Platform/composition取得新的 Main-issued token；physical delivery仍后续 concrete platform负责。

---

## 14. Representation Failure Does Not Change Business Authority

Main projector/outbound peer必须 preflight完整 Snapshot against Renderer Control wire limits。

如果当前 authority无法表示：

```text
Runtime/Frame/Stack authority remains unchanged
no truncation/drop
Renderer Control hello attempt or current Connection fails closed
```

M7 不增加 Frame Stack depth、Runtime count 或 DataAuthority count 业务上限，也不修改 Frozen Frame `frame.call` error surface。

这保证 Renderer Control 只是 mirror capability，不反向成为 Main业务 authority gate。

---

## 15. Integration Ingress Rule

M7/04 必须走：

```text
live Main authority
→ real hello acceptance / projector / revision path
→ real renderer-control Main peer
```

禁止 harness：

```text
read Main private stack
manually construct Snapshot
fake revision
bypass token/current-peer decision
```

Renderer physical carrier ingress的 exact Platform port仍不预声明。如果 established carrier无法在不暴露 Main internals/test-only API 的情况下进入 production path，才基于该真实阻塞关闭最窄 ingress port。

`OpaqueTokenGenerator` 的泛化不是 Renderer ingress port；它已有多个真实 Main material消费者。

---

## 16. Failure / Shutdown

Runtime failure/unwind/shutdown authority不变。

Renderer看到的只是 committed projection。

Renderer Control loss/replacement不成为 Main Session shutdown coordinator。

---

## 17. Tests

至少覆盖：

```text
sessionId fresh/valid and initial revision=1
revision comparison excludes revision itself
visible commit increments exactly once
non-visible/transport change does not increment
runtime lifecycle pure mapping
activate/resume ACK before target
call/return/failure projection
M7 dataAuthorities=[]
hello acceptance atomic against concurrent visible mutation
R+1 committed during hello send becomes pending, not lost/not sent before hello Result
new peer replacement makes old non-current
old peer actively retired/closed
stale old peer terminal cannot clear new current
current peer terminal clears current peer only
unrepresentable Snapshot fails Renderer Control without mutating Frame/Runtime authority
no shadow authority
```

---

## 18. Step Closure

M7/02 complete when：

```text
fresh opaque material source is real and narrow
sessionId + rendererRevision initialize deterministically
Snapshot is pure projection
all visible mutation uses one observation discipline
hello acceptance is atomic with Main authority mutation
replacement actively revokes old peer
peer terminal cleanup is identity-safe
representation failure cannot alter business authority
M7 DataAuthority policy remains deferred
real Main integration path requires no authority bypass
```