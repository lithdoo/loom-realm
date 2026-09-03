# M7 / 02 — Main Renderer Authority Projection + Binding

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M7 Renderer Control  
> 落地顺序：02  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md)  
> 冻结决策：[ADR 0027](doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 目标：让 `@loomrealm/main` 从既有 Runtime/Frame/Stack authority 纯投影 Renderer Snapshot，并精确关闭 Session identity、revision、RendererControlBinding accept loop、hello atomicity、replacement 与 Session terminal；不得建立 shadow authority。

> **Main 现有 Runtime/Frame/Stack 状态始终是事实源。M7 增加的只是 pure projection + bounded Renderer connection bookkeeping。**

---

## 1. Frozen Scope

修改：

```text
@loomrealm/main
@loomrealm/platform-ports M7 slice
```

新增 runtime dependency：

```text
@loomrealm/renderer-control
```

不改变 Runtime Control / Frozen Frame semantics，不新增 universal Renderer hosting interface。

---

## 2. Frozen `MainPlatform`

M7 target：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl: RendererControlBinding;
}
```

其中 `RendererControlBinding` exact contract：

```ts
interface RendererControlBinding {
  acquire(
    rendererControlToken: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}
```

一次 `acquire` = 一个 candidate Renderer Control attempt。Success只给 already-established carrier；不授予 currentness。

Main 同时最多：

```text
one current Renderer peer
one pending/candidate attempt
```

不得建立 ConnectionRegistry。

---

## 3. `OpaqueMaterialGenerator`

M7 将 M5 `BootstrapTokenGenerator` current-v1 直接收敛/重命名为：

```ts
interface OpaqueMaterialGenerator {
  generate(): string;
}
```

Main 独立调用取得：

```text
Session sessionId material
Runtime bootstrapToken material
Renderer Control token material
```

每个值必须 fresh；不得一个字符串复用多个语义。

Platform只生成 material。Main继续拥有 identity/credential validation、registration、binding、attempt currentness、consumption/invalidation。

不保留 `BootstrapTokenGenerator` compatibility alias。

---

## 4. Minimal Main State

允许长期状态：

```text
sessionId
rendererRevision
last committed Renderer authority payload/Snapshot
currentRendererPeer | null
current/pending Renderer attempt token + AbortController/state
```

MUST NOT新增：

```text
RendererRuntimeRegistry
RendererFrameRegistry
rendererStack shadow copy
stored rendererInputTarget
RendererAuthorityManager
ProjectionFramework
ConnectionRegistry
```

现有 `runtimes` / `frames` / `stack` / `currentActivationId` / `currentInputTarget()` 继续是唯一业务事实源。

---

## 5. Session Initialization

在 Renderer accept loop开始前：

```text
generate + validate fresh sessionId
rendererRevision = 1
capture initial Renderer authority payload
freeze initial Snapshot revision 1
currentRendererPeer = null
```

初始 Snapshot包含 declared Runtime topology、当前 live Frame state、derived InputTarget、`dataAuthorities=[]`。

Renderer absence不得阻塞 Runtime bootstrap/Frame业务运行。

---

## 6. Pure Projection

概念函数：

```ts
captureRendererAuthoritySnapshot(): RendererAuthoritySnapshotV1
```

必须：

```text
read committed Main authority only
return detached immutable value
never mutate Main
never expose RuntimeRecord/FrameRecord
contain no history/transport/credential
```

Renderer-visible state每次从 Main authority推导；无 shadow records。

---

## 7. AuthorityRevision

固定：

```text
initial = 1
Session-local
positive safe integer
increment exactly when Renderer-visible committed payload changes
never reuse/wrap
```

Change detection比较 payload excluding `revision` 本身。

不因以下递增：

```text
renderer connection/replacement
same Snapshot resend
candidate attempt
transport terminal
```

即使无 current Renderer，visible commit仍推进 revision，使 later hello取得真正 current R。

---

## 8. One Commit Observation Discipline

所有 Renderer-visible authority mutation必须进入现有 Main serialized mutation lane 的同一 observation helper：

```text
authoritative mutation commits
→ capture payload
→ compare with last committed payload
→ if changed:
     rendererRevision++
     freeze Snapshot
     submit latest to current Main peer if any
```

现有 bootstrap中 connected/identified 等 visible assignment也必须进入该 discipline。

只允许窄 helper；不引入 EventBus / TransactionManager / StateReplicator。

---

## 9. Runtime Lifecycle Mapping

冻结，不再留 reopen 条件：

```text
no RuntimeRecord                         → declared
failure != null                          → failed
physicallyTerminated && expected stop    → stopped
starting                                 → starting
connected                                → connected
identified / initializing                → identified
ready                                    → ready
stopping                                 → stopping
```

failure precedence高于 stopped。

Session terminal latch后 Renderer Control立即 retirement；因此 normal Session cleanup后续 stopping/stopped变化不要求再 publication。`stopped` 仍是合法 pure projection状态。

---

## 10. Frame / Activation / InputTarget Projection

Stack bottom → top，live Frames only：

```text
starting   → starting
active     → active + current activationId
suspended  → suspended
closing    → closing
closed     → omitted
```

InputTarget继续即时派生：

```text
active Stack top + currentActivationId
→ {subsystemKey,frameId,activationId}
otherwise null
```

ACK causal barrier保持：activate/resume Response accepted后 Main才 commit fresh Activation/InputTarget。

Lifetime identity invariants由 Main allocator/tests证明，不由 renderer-control receiver保存永久 history。

---

## 11. M7 DataAuthority

M7 Main固定：

```text
dataAuthorities = []
```

不实现 DataAuthority Registry / GenerationAllocator / ProfileManager / fake Broker。M8由真实 Renderer+Subsystem Data consumers关闭。

---

## 12. Renderer Accept Loop

Main Session启动后异步运行一个 bounded accept loop：

```text
while Session live and binding available:
    issue/register fresh rendererControlToken
    await platform.rendererControl.acquire(token, attemptSignal)
    create candidate Main peer for returned carrier
    await candidate hello outcome

    after candidate attempt settles:
        if Session still live:
            arm exactly one fresh next attempt
```

规则：

```text
at most one acquire/candidate attempt pending
current Renderer may coexist with one future candidate
binding wait never blocks Runtime/Frame Session progress
attempt terminal invalidates its token
no protocol retry/replay; next iteration is fresh attempt/token
```

如果 Binding 自身发生 Session-lifetime terminal failure，Main停止新的 Renderer attempts，但不把该 physical capability failure升级为 Runtime/Frame Session failure。

---

## 13. Hello Acceptance — Frozen Atomic Transaction

Main必须提供一个 single acceptance seam；函数名可选，语义不可变。

在 Main serialized lane 内：

```text
1. require Session nonterminal
2. require candidate === current pending attempt
3. validate exact issued token + supported version
4. capture current committed Snapshot R
5. call renderer-control exact side-effect-free hello outbound prepare/preflight for id=1/version=1/R

if step 5 fails:
    invalidate candidate token/attempt
    old current Renderer remains unchanged
    candidate fails closed

if step 5 succeeds:
6. consume token
7. set candidate as only currentRendererPeer
8. synchronously mark old peer retired from future publication
9. commit accepted {R, preparedHelloText, oldPeer}
```

Transaction外：

```text
candidate peer sends preparedHelloText verbatim
oldPeer retirement requests carrier.close()
```

这样同时关闭 representability/current-switch 与 R→R+1 race。

Hello Result send失败：candidate peer terminal；identity-safe current terminal handler清空 candidate currentness；old peer不复活；fresh attempt继续。

---

## 14. Replacement

B acceptance commit 后：

```text
B = only current immediately
A = non-current immediately
A receives no new publication submission
A pendingLatest settles/discards
A close requested
```

A 已经开始的 in-flight send MAY随后完成/到达；Main不得尝试取消 Foundation carrier send。其 completion不改变 currentness/revision。

Current peer terminal handler必须 identity-check：

```text
if terminalPeer === currentRendererPeer:
    currentRendererPeer = null
else:
    stale terminal ignored
```

Peer terminal本身不推进 revision。

---

## 15. Representation Failure

Main/renderer-control outbound path必须 preflight actual full message。

如果 current Snapshot后续不可表示：

```text
Main Runtime/Frame/Stack authority unchanged
no rollback/truncation
current Renderer peer terminalized/retired
rendererRevision remains authority-derived only
```

不增加 Frame depth、Runtime count、DataAuthority count业务上限，也不改 Frozen Frame errors。

---

## 16. Session Terminal Boundary

一旦 Main latch root-outcome / shutdown / fatal terminal：

```text
stop issuing Renderer tokens
abort pending RendererControlBinding.acquire
invalidate pending attempt token
retire candidate peer if any
retire currentRendererPeer if any
clear Main current renderer peer reference
stop/discard future Renderer publication
```

Renderer cleanup不成为 Session result barrier；Main无需等待 physical Renderer carrier close才能完成既有 Session terminal/Runtime cleanup。

不发送 final Snapshot/session-ended RPC。

---

## 17. Tests

必须覆盖：

```text
fresh sessionId + initial revision 1
OpaqueMaterialGenerator values independent
revision comparison excludes revision
visible commit increments exactly once
no visible change/transport bookkeeping does not increment
runtime lifecycle frozen mapping
activate/resume ACK-before-target
M7 dataAuthorities=[]
accept loop at most one pending candidate
Renderer absence does not block Session
hello preflight before current switch
unrepresentable B cannot evict healthy A
hello concurrent R+1 cannot be lost
replacement B makes A non-current synchronously
A pending cleared / close requested
A inFlight late completion cannot restore authority
stale A terminal cannot clear B
current B terminal clears current only
Session terminal aborts pending acquire + retires peers
representation failure cannot mutate Frame/Runtime authority
no shadow authority/framework
```

---

## 18. Frozen Closure

M7/02 实施完成条件：

```text
MainPlatform exact M7 view implemented
OpaqueMaterialGenerator + RendererControlBinding consumed
bounded background accept loop implemented
pure projection + revision discipline implemented
hello exact preflight/current switch atomicity implemented
replacement/session terminal identity-safe
representation failure isolated
M7 DataAuthority remains deferred
```

除 ADR 0027 Reopen Rule外，编码阶段不得重新决定 Platform ingress、current-switch顺序或 Session terminal语义。