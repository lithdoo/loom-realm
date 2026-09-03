# `@loomrealm/main`

> 状态：**M5 Implemented Baseline / Runtime Control Consumer Qualified / M7 Renderer Control Slice Frozen for Implementation**  
> 阶段：M7 Renderer Control preimplementation closure  
> 最近复核：2026-09-03  
> 冻结决策：[ADR 0027](../../doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> M7 实施顺序：[`M7_02_MAIN_AUTHORITY_PROJECTION.md`](../../M7_02_MAIN_AUTHORITY_PROJECTION.md)

`@loomrealm/main` 是 platform-neutral Main application authority runtime。M5 已实现 Runtime/Frame/Stack authority vertical；M7 在不改变该 authority model 的前提下增加 Renderer Control pure projection、revision、bounded Binding accept loop 与 current Renderer participant authority。

---

## 1. Public Surface Direction

M7 继续保持一个 `runMain()` 拥有一个 Main Session lifetime；**不新增 public Main Session controller/service locator**。

Root public concepts仍包含：

```text
runMain
MainRuntimeFatalError
LogicalGameBootstrap
MainPlatform
MainPolicy
RunMainOptions
MainSessionResult
MainFrameOutcome / MainFrameFailure
MainRuntimeFailure
```

M7 `MainPlatform` frozen target：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl: RendererControlBinding;
}
```

Renderer candidate ingress通过 `MainPlatform.rendererControl` 进入 Session internal accept loop，而不是公开 `attachRenderer()` controller。

---

## 2. Runtime Dependencies Through M7

```text
@loomrealm/main
    ├── @loomrealm/platform-ports
    ├── @loomrealm/runtime-control
    ├── @loomrealm/renderer-control
    └── @loomrealm/wire
```

Main MUST NOT depend on：

```text
@loomrealm/renderer
@loomrealm/game-package
@loomrealm/game-launcher-hostra/pwa
concrete Hostra/PWA types
Node/Worker/WebSocket/MessagePort
@loomrealm/data M8+ role policy
```

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

M7 rename `BootstrapTokenGenerator → OpaqueMaterialGenerator` does not move credential authority；只是 material source泛化，且无 compatibility alias。

---

## 4. Single Main Authority Owner

一个 `MainSessionRuntime` 继续单点拥有：

```text
Runtime records
Frame records
Stack
current Activation
Session terminal
Renderer current participant/attempt bookkeeping
Renderer AuthorityRevision
```

InputTarget仍由 active Stack top + current Activation即时派生。

M7 MUST NOT新增：

```text
RendererRuntimeRegistry
RendererFrameRegistry
rendererStack
rendererInputTarget storage
RendererAuthorityManager
ConnectionRegistry
```

Renderer Snapshot是 existing authority 的 detached pure projection。

---

## 5. Frame / Call Transactions — Frozen M5 Semantics

Main继续遵守 Frozen Frame v1：

```text
Initial: initialize ACK → activate fresh A ACK → commit active/InputTarget

Call: validate → revoke caller A/suspend/push child → response send barrier
      → initialize child → activate fresh Achild ACK → commit child active/InputTarget

Return: accept outcome/revoke child A/closing → response send barrier
        → close/pop → resume caller fresh A' ACK → commit caller active/InputTarget
```

Renderer publication永远在 committed authority之后，不参与 transaction决定。

---

## 6. Runtime Failure / Unwind — Main Only

M5 first-wins Runtime failure + whole-suffix fixed-point unwind保持不变。

Renderer Control只观察最终/中间 committed projection；Control failure不能触发 Runtime failure/unwind，也不能改变 accepted Frame outcome。

---

## 7. Renderer Session Identity / Revision

Session初始化：

```text
sessionId = fresh validated opaque material
rendererRevision = 1
freeze initial Renderer authority payload/Snapshot
currentRendererPeer = null
```

Revision：

```text
increment exactly on committed Renderer-visible payload change
compare payload excluding revision
advance even when no Renderer is connected
no bump for connection/replacement/transport-only bookkeeping
```

---

## 8. Renderer Projection

Pure projector reads only committed Main authority：

```text
Runtime state
live Frame Stack
current Activation
currentInputTarget()
M7 dataAuthorities=[]
```

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

failure precedence高于 stopped。

Session terminal后 Renderer Control retirement，因此 normal shutdown cleanup后续状态无需 publication。

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
     submit latest to current renderer-control Main peer
```

Bootstrap flow中的 connected/identified等 assignment也必须进入同一 observation point。

不增加 EventBus/transaction framework。

---

## 10. Frozen Renderer Control Accept Loop

Main Session内部异步运行：

```text
issue/register fresh renderer token
→ platform.rendererControl.acquire(token, attemptSignal)
→ candidate carrier
→ renderer-control Main peer
→ candidate renderer.hello
→ Main atomic hello acceptance
→ success/current or terminal
→ if Session still live, arm one fresh next attempt
```

Bounds：

```text
one current Renderer
one pending/candidate attempt maximum
Renderer absence does not block Runtime/Frame business
```

Binding Session-lifetime failure停止 Renderer attempts，但不升级为 Runtime/Frame failure。

---

## 11. Hello Acceptance Transaction

在 existing Main serialized authority lane内固定：

```text
require Session live + exact pending candidate
validate exact token/version
capture current Snapshot R
invoke renderer-control exact side-effect-free prepared hello preflight

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

R+1 在 acceptance之后 commit时必须进入 candidate `pendingLatest`；不能丢失，也不能先于 hello Result发送。

Hello send失败不回滚 old current；candidate terminal后 Main currentness identity-check清空，fresh attempt继续。

---

## 12. Replacement / Late Old Send

Replacement commit后：

```text
old peer non-current immediately
old peer no new publication/send start
old pendingLatest settled
a close requested
```

Already-started old `send()` MAY later settle/arrive；Foundation不承诺 cancellation。其 late completion无 Main authority effect。

Stale old terminal不得清除 new current。

---

## 13. Renderer Control Representation Failure

Renderer wire limits不是 Main business limits。

```text
unrepresentable candidate hello
→ candidate fails before current switch
→ healthy old current remains

unrepresentable later state
→ current Renderer Control terminal
→ Main Runtime/Frame/Stack unchanged
```

无 Frame rollback、无 Renderer-specific frame.call error、无 Snapshot truncation。

---

## 14. Session Terminal / Cleanup

M5 public terminal语义保持：root outcome / shutdown / fatal。

M7 增加一个 terminal side effect boundary：

```text
when Main Session terminal latches:
    stop fresh Renderer attempts
    abort pending RendererControlBinding.acquire
    invalidate pending attempt
    retire candidate
    retire current Renderer peer
    stop further Renderer publication
```

Renderer cleanup不改变/延迟已提交 Main Session result，也不成为 Runtime shutdown coordinator。

Main不发送 final Renderer session-ended RPC。

Runtime graceful shutdown/physical termination仍按 M5流程执行。

---

## 15. M7 Data Boundary

M7 Snapshot formal type包含 DataAuthority，但 Main implementation固定：

```text
dataAuthorities=[]
```

M8才增加真实 DataAuthority allocation/generation/profile policy。

---

## 16. M7 Qualification

Main必须通过：

```text
initial sessionId/revision=1
opaque material independent use
pure projection / no shadow authority
visible commit exact revision bump
Renderer absence nonblocking
one candidate bound
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

完整 evidence见根目录 `M7_05_QUALIFICATION_CLOSURE.md`。

---

## 17. Freeze Statement

M5 Runtime/Frame semantics已实现；M7 Renderer Control slice从 2026-09-03 起 preimplementation frozen。

允许实施者决定内部 helper/file/class命名；不得重新决定：

```text
MainPlatform M7 capability shape
one-current + one-candidate model
revision ownership
projection vs shadow state
hello preflight/current switch ordering
replacement/inFlight semantics
Session terminal Renderer retirement
DataAuthority defer-to-M8
```

这些只能按 ADR 0027 Reopen Rule修改。