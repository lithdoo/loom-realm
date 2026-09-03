# `@loomrealm/main`

> 状态：**M5 Implemented Baseline / M7 Renderer Control Implemented and Qualified**
> 阶段：M7 Renderer Control implementation closure
> 最近复核：2026-09-03  
> 冻结决策：[ADR 0027](../../doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> M7 实施顺序：[`M7_02_MAIN_AUTHORITY_PROJECTION.md`](../../M7_02_MAIN_AUTHORITY_PROJECTION.md)

`@loomrealm/main` 是 platform-neutral Main application authority runtime。M5 已实现 Runtime/Frame/Stack authority vertical；M7 在不改变该 authority model 的前提下增加 Renderer Control pure projection、revision、optional Binding candidate-slot loop 与 current Renderer participant authority。

---

## 1. Public Surface Direction

M7 继续保持一个 `runMain()` 拥有一个 Main Session lifetime；**不新增 public Main Session controller/service locator**。

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
}
```

Renderer candidate ingress通过 optional `MainPlatform.rendererControl` 进入 Session internal loop，而不是公开 `attachRenderer()` controller。

```text
rendererControl absent → Runtime/Frame Session remains valid; no Renderer attempt
rendererControl present → frozen candidate-slot/currentness semantics apply
```

M6 Hostra Runtime-only baseline无需 fake Binding；M14再加入 physical Renderer Control realization。

---

## 2. Runtime Dependencies Through M7

```text
@loomrealm/main depends on:
    @loomrealm/platform-ports
    @loomrealm/runtime-control
    @loomrealm/renderer-control
    @loomrealm/wire
```

Main MUST NOT depend on `@loomrealm/renderer`、Game Package、concrete Launcher、Node/Worker/WebSocket/MessagePort或 M8 Data role policy。

---

## 3. M5 Runtime Bootstrap — Semantics Preserved

```text
LogicalGameBootstrap
→ one required Runtime record per subsystemKey
→ opaqueMaterial.generate() fresh runtime bootstrap material
→ Main validates/registers/binds token
→ RuntimeHosting.launch({subsystemKey,bootstrapToken})
→ HostedRuntime.runtimeControl.acquire()
→ MainRuntimeControlPeer
→ authenticate/consume subsystem.hello token
→ identified → ready
```

M7 rename `BootstrapTokenGenerator → OpaqueMaterialGenerator` does not move credential authority。

每次 successful material generation必须满足：

```text
ASCII 1..128 bytes
fresh
>=128 bits unpredictability for security-sensitive uses
```

Session identity、Runtime bootstrap token、Renderer token分别独立调用，不复用同一值；无 compatibility alias、kind parameter或 generic Crypto service。

---

## 4. Single Main Authority Owner

一个 `MainSessionRuntime` 继续单点拥有：

```text
Runtime records
Frame records
Stack
current Activation
Session terminal
Renderer current participant/candidate bookkeeping
Renderer AuthorityRevision
```

InputTarget仍由 active Stack top + current Activation即时派生。

M7 MUST NOT新增 Renderer Runtime/Frame/InputTarget shadow registry、RendererAuthorityManager 或 ConnectionRegistry。

Renderer Snapshot永远是 existing authority 的 detached pure projection。

---

## 5. Frame / Call Transactions — Frozen M5 Semantics

Main继续遵守 Frozen Frame v1：

```text
Initial: initialize ACK → activate fresh A ACK → commit active/InputTarget
Call:    validate → revoke caller A/suspend/push child → Response barrier
         → initialize child → activate Achild ACK → commit child active/InputTarget
Return:  accept outcome/revoke child A/closing → Response barrier
         → close/pop → resume caller A' ACK → commit caller active/InputTarget
```

Renderer publication永远在 committed authority之后，不参与 transaction决定。

---

## 6. Runtime Failure / Unwind — Main Only

M5 first-wins Runtime failure + whole-suffix fixed-point unwind保持不变。

Renderer Control/Binding/representation failure不能触发 Runtime failure/unwind，也不能改变 accepted Frame outcome。

---

## 7. Renderer Session Identity / Revision

Session初始化：

```text
sessionId = fresh validated opaque material
rendererRevision = 1
freeze initial Renderer authority payload/Snapshot
currentRendererPeer = null
```

Revision increment exactly on committed Renderer-visible payload change；compare payload excluding revision；advance even when no Renderer/capability；no bump for connection/replacement/transport bookkeeping。

---

## 8. Renderer Projection

Pure projector reads only committed Main authority：Runtime state、live Frame Stack、current Activation、`currentInputTarget()`、M7 `dataAuthorities=[]`。

Runtime mapping：

```text
no record                                → declared
failure != null                          → failed
physicallyTerminated && expected stop    → stopped
starting                                 → starting
connected                                → connected
identified / initializing                → identified
ready                                    → ready
stopping                                 → stopping
```

failure precedence高于 stopped。Session terminal后 Control retirement，normal cleanup后续状态无需 publication。

---

## 9. Renderer-visible Commit Observation

所有 visible mutation使用 existing serialized mutation discipline：

```text
commit Main authority
→ capture new Renderer payload
→ compare last payload
→ if changed:
     rendererRevision++
     freeze Snapshot
     submit latest to current renderer-control Main peer if any
```

Bootstrap中的 visible lifecycle assignment也进入同一 observation point。无 EventBus/transaction framework。

---

## 10. Optional Renderer Candidate-slot Loop

仅当 `platform.rendererControl` 存在且 Binding尚未 terminal：

```text
issue/register fresh renderer token
→ rendererControl.acquire(token, slotSignal)
→ candidate carrier
→ renderer-control Main peer
→ typed renderer.hello/version negotiation
→ Main atomic token/currentness acceptance
→ success/current or candidate terminal
```

Bounds：

```text
one current Renderer
one armed/pending/bound candidate maximum
arming acquire does not create/show/replace Renderer
Renderer absence/capability absence does not block Runtime/Frame business
```

Settlement：

```text
slot abort before acquire resolution
→ cancel slot; no late live result

non-abort acquire rejection
→ Renderer Binding terminal for this Main Session
→ invalidate token/slot
→ arm no further Renderer slot
→ healthy current Renderer not revoked solely for this rejection
→ Runtime/Frame Session continues

carrier acquired then peer/protocol terminal
→ candidate attempt terminal only
→ fresh slot MAY re-arm while Session live and Binding healthy
```

No typed Binding error hierarchy/retry manager。

---

## 11. Protocol Negotiation vs Main Authority

Renderer-control Main peer owns renderer.hello wire/schema、`protocolVersions` validation、v1 selection、unsupported-version outcome。

Main receives only already-selected v1 typed fact + candidate token/peer identity。Main MUST NOT parse `protocolVersions` or implement second negotiation。

---

## 12. Hello Acceptance Transaction

在 existing Main serialized authority lane内：

```text
require Session live + exact bound candidate
validate exact candidate token
capture current Snapshot R
invoke renderer-control exact prepared hello preflight
    using selected v1 + id=1 + R

preflight failure:
    invalidate attempt/token
    old current unchanged
    candidate fail closed

preflight success:
    consume token
    candidate becomes only currentRendererPeer
    old peer synchronously retires from future publication
    commit accepted R + prepared text
```

Transaction外发送 prepared hello text并 request old close。

R+1 在 acceptance之后 commit进入 candidate `pendingLatest`；不能丢失或先于 hello Result发送。

Hello send失败不 resurrect old；candidate terminal后，若 Binding healthy则 fresh slot MAY继续。

---

## 13. Replacement / Late Old Send

Replacement commit后 old peer non-current、no new publication/send start、pendingLatest settled、close requested。

Already-started old `send()` MAY later settle/arrive；Foundation不承诺 cancellation。Late completion无 Main authority effect；stale old terminal不得清除 new current。

---

## 14. Renderer Control Representation Failure

```text
unrepresentable candidate hello
→ candidate fails before current switch
→ healthy old current remains

unrepresentable later state
→ current Renderer Control terminal
→ Main Runtime/Frame/Stack unchanged
```

无 Frame rollback、Renderer-specific frame.call error或 Snapshot truncation。

---

## 15. Session Terminal / Cleanup

M5 public terminal语义保持：root outcome / shutdown / fatal。

```text
when Main Session terminal latches:
    stop fresh Renderer slots/tokens
    abort pending RendererControlBinding.acquire if any
    invalidate pending attempt
    retire bound candidate if any
    retire current Renderer peer if any
    stop further Renderer publication
```

Capability absent或 Binding已 terminal时为空操作。

Renderer cleanup不改变/延迟 Main Session result，也不成为 Runtime shutdown coordinator。不发送 final Renderer session-ended RPC。

---

## 16. M7 Data Boundary

M7 Snapshot formal type包含 DataAuthority，但 Main implementation固定：

```text
dataAuthorities=[]
```

M8才增加真实 DataAuthority allocation/generation/profile policy。

---

## 17. M7 Qualification

Main必须通过：

```text
initial sessionId/revision=1
opaque material output bound + independent use
pure projection / no shadow authority
visible commit exact revision bump
rendererControl absent path valid/nonblocking
acquire pending does not create Renderer
abort cancellation vs non-abort Binding terminal rejection
Binding terminal stops re-arm but not Runtime/Frame
carrier-acquired peer failure can re-arm while Binding healthy
renderer-control peer owns version negotiation
hello exact preflight before current switch
concurrent R+1 no loss
unrepresentable B cannot evict A
replacement / stale terminal identity safety
old already-inFlight completion no currentness effect
current terminal no revision bump
Session terminal aborts/retire Renderer attempts
representation failure isolation
call/return/failure M5 regressions
```

完整 evidence见 `M7_05_QUALIFICATION_CLOSURE.md`。

---

## 18. Freeze Statement

M5 Runtime/Frame semantics已实现；M7 Renderer Control slice从 2026-09-03 起 preimplementation frozen。

实施者只能决定内部 helper/file/class命名；不得重新决定：

```text
MainPlatform optional Renderer capability
OpaqueMaterialGenerator common output contract
RendererControlBinding candidate-slot/rejection semantics
one-current + one-candidate model
protocol negotiation ownership
revision ownership
projection vs shadow state
hello preflight/current switch ordering
replacement/inFlight semantics
Session terminal Renderer retirement
DataAuthority defer-to-M8
```

只能按 ADR 0027 Reopen Rule修改。
