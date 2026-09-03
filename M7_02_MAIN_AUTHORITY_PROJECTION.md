# M7 / 02 — Main Renderer Authority Projection + Binding

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M7 Renderer Control  
> 落地顺序：02  
> 最近复核：2026-09-03  
> 前置：[M7 / 01](M7_01_RENDERER_CONTROL_PACKAGE.md)  
> 冻结决策：[ADR 0027](doc/decisions/0027-freeze-renderer-control-v1-preimplementation.md)  
> 目标：让 `@loomrealm/main` 从既有 Runtime/Frame/Stack authority 纯投影 Renderer Snapshot，并关闭 Session identity、revision、optional `RendererControlBinding` candidate-slot lifecycle、hello atomicity、replacement 与 Session terminal；不得建立 shadow authority。

> **Main 现有 Runtime/Frame/Stack 状态始终是事实源。M7 增加的只是 pure projection + bounded Renderer connection bookkeeping。**

---

## 1. Frozen Scope

修改 `@loomrealm/main` + `@loomrealm/platform-ports` M7 slice；Main 新增 `@loomrealm/renderer-control` runtime dependency。

不改变 Runtime Control / Frozen Frame semantics，不新增 public Main Session controller 或 universal Renderer hosting interface。

---

## 2. Frozen `MainPlatform`

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
}
```

```ts
interface RendererControlBinding {
  acquire(
    rendererControlToken: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}
```

Optionality：

```text
rendererControl absent
→ no Renderer physical capability
→ no Renderer token/candidate slot
→ Runtime/Frame Session normal

rendererControl present
→ Main may arm the frozen bounded candidate slot
```

不得给 M6 Hostra/headless composition 加 fake/no-op Binding。

---

## 3. Candidate Slot Semantics

每次 `rendererControl.acquire(T, signal)` 只表示：

```text
arm exactly one slot for the next physical candidate using token T
```

它 MAY 长期 pending；**调用 `acquire` 本身不创建/显示 Renderer，也不发生 replacement。**

Binding 只在 Platform 实际有 candidate 时绑定该 slot 并返回一个 already-established `MessageCarrier<string>`。

Main 同时最多：

```text
one current Renderer peer
+
one armed/pending/bound candidate attempt
```

Current A 存在时，Main MAY 预挂 next slot 等待未来 reload/replacement candidate；pending slot 不改变 A currentness。

如果没有 Binding 或没有 candidate，Runtime/Frame 业务继续运行。

### Acquire settlement — frozen

```text
Promise resolves with MessageCarrier
→ slot has exactly one bound physical candidate
→ protocol attempt begins

slot AbortSignal aborts before resolution
→ ordinary slot cancellation
→ no late live carrier may be delivered

Promise rejects for any non-abort reason
→ RendererControlBinding is terminal for this Main Session
→ invalidate the slot/token
→ do not arm another Renderer slot in this Session
→ current Renderer, if any, is not revoked solely by Binding rejection
→ Runtime/Frame Session continues
```

这避免 typed Binding error hierarchy、retry policy 或第二个 Binding state machine。

一个 carrier 已经成功 acquire 之后发生的 bad hello、unsupported version、hello send failure 或 carrier terminal 属于**candidate protocol attempt terminal**；Session 仍 live 且 Binding 未 terminal 时 MAY 使用 fresh token arm 下一 slot。

---

## 4. `OpaqueMaterialGenerator`

M7 将 M5 `BootstrapTokenGenerator` current-v1 直接改为：

```ts
interface OpaqueMaterialGenerator {
  generate(): string;
}
```

每个 successful `generate()` 的共同冻结输出契约：

```text
ASCII string
1..128 bytes
fresh for the concrete Platform/Session lifetime
at least 128 bits of unpredictability for security-sensitive uses
opaque to Platform/Core consumers
```

这个共同范围同时满足当前三个真实 consumer：

```text
Session sessionId
Runtime bootstrap token
Renderer Control token
```

Main 对不同语义必须独立调用；不得复用同一值。Main 仍按各自 formal contract 做防御性表示验证。

Platform 只生成 material；Main 拥有 identity/credential registration/binding/currentness/consume/invalidate。无 compatibility alias、kind parameter、identity service、token registry 或 generic Crypto API。

---

## 5. Minimal Main State

允许长期状态：

```text
sessionId
rendererRevision
last committed Renderer payload/Snapshot
currentRendererPeer | null
at most one candidate-slot token + AbortController/attempt state
rendererBindingTerminal boolean/fact only if Binding has rejected
```

`rendererBindingTerminal` 可以由 accept-loop control flow 表达，不要求独立字段。禁止 Renderer Runtime/Frame/InputTarget shadow registry、RendererAuthorityManager、ProjectionFramework、ConnectionRegistry。

Existing `runtimes/frames/stack/currentActivationId/currentInputTarget()` remain single business source of truth。

---

## 6. Session Initialization / Revision

无论 Renderer capability 是否存在：

```text
generate + validate fresh sessionId
rendererRevision = 1
capture/freeze initial Renderer authority payload/Snapshot
currentRendererPeer = null
```

Revision advances exactly on committed Renderer-visible payload change；compare payload excluding `revision` itself；capability/connection/candidate/terminal bookkeeping不 bump。

Visible commit 在无 Renderer 时仍推进 revision。

---

## 7. Pure Projection / Runtime Mapping

Projector reads committed Main authority only，returns detached immutable Snapshot，no history/transport/credential/shadow state。

Runtime mapping frozen：

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

failure precedence > stopped。Session terminal后 Control retirement，normal cleanup后续 transitions不要求 publication。

Frame Stack bottom→top；active carries current activationId；closed omitted。InputTarget remains derived from active top + activationId。ACK-before-publication unchanged。

M7 `dataAuthorities=[]`。

---

## 8. One Commit Observation Discipline

所有 Renderer-visible Main mutation进入 existing serialized mutation lane：

```text
commit authority
→ capture payload
→ compare previous payload
→ if changed:
     rendererRevision++
     freeze Snapshot
     submit latest to current renderer-control Main peer if any
```

Bootstrap visible lifecycle assignments也进入该 boundary。No EventBus / TransactionManager / StateReplicator。

---

## 9. Candidate Slot Loop

仅当 `platform.rendererControl` 存在且 Binding 尚未 terminal：

```text
armCandidateSlot():
    generate/register fresh rendererControlToken T
    await rendererControl.acquire(T, slotSignal)
        // MAY wait until a future physical candidate exists
    candidate carrier returned
    create renderer-control Main peer
    await typed hello/terminal outcome

on acquired protocol attempt settle:
    invalidate attempt token if not already consumed
    if Session live && Binding not terminal:
        arm exactly one fresh next slot

on non-abort acquire rejection:
    invalidate token/slot
    latch Renderer Binding terminal for this Session
    arm no further slots
```

Rules：

```text
one slot maximum
arming a slot does not create/replace Renderer
current Renderer may coexist with pending next slot
protocol attempt settle → fresh token for next slot
Binding acquire rejection → no fresh slot
no protocol retry/replay
pending slot never blocks Runtime/Frame business
```

---

## 10. Version Negotiation Ownership

Renderer-control Main peer先完成：

```text
renderer.hello schema validation
protocolVersions validation
select supported protocolVersion=1
unsupported-version terminal
```

Main 接收 already-selected v1 typed fact + candidate token/identity。

Main MUST NOT parse/choose `protocolVersions`。

---

## 11. Hello Acceptance — Atomic Transaction

In Main serialized lane：

```text
require Session live
require candidate === bound current slot attempt
validate exact issued token
capture current Snapshot R
renderer-control exact prepare/preflight hello Result(id=1, selected-v1, R)

preflight fail:
    invalidate candidate token/attempt
    old current unchanged
    candidate fail closed

preflight success:
    consume token
    candidate becomes only currentRendererPeer
    old peer synchronously retires from future publication
    commit {R, preparedHelloText, oldPeer}
```

Outside transaction：send prepared text verbatim + request old close。

R+1 after acceptance goes to candidate `pendingLatest` and cannot be lost/sent before hello Result。

Hello send failure：candidate terminal；old not resurrected；next fresh slot MAY be armed while Session live and Binding not terminal。

---

## 12. Replacement / Late Old Send

Replacement commit：B current immediately；A non-current immediately；A no new publication/send start；A pendingLatest settles；A close requested。

Already-started A send MAY later settle/arrive；no cancellation requirement；late completion has no authority/revision effect。

Terminal identity check：only current peer terminal clears current；stale terminal ignored；terminal alone no revision bump。

---

## 13. Representation Failure

Unrepresentable initial candidate：fail before current switch；healthy old current remains。

Unrepresentable later state：current Renderer Control terminal；Main Runtime/Frame/Stack unchanged。

No Frame depth/Runtime count/DataAuthority count business limit、rollback、truncation或 Renderer-specific Frame error。

---

## 14. Session Terminal Boundary

On root-outcome / shutdown / fatal latch：

```text
stop issuing Renderer tokens/slots
abort armed/pending acquire if any
invalidate pending token
retire bound candidate peer if any
retire current peer if any
stop publication
```

Renderer cleanup不延迟 Main Session result/Runtime cleanup。Capability absent或 Binding 已 terminal 时为空操作。No final session-ended RPC。

---

## 15. Tests

必须覆盖：

```text
fresh sessionId + revision=1
OpaqueMaterialGenerator common output bound + independent values
visible commit exact revision behavior
rendererControl absent → no slot/no token + Session functional
Binding present → at most one slot
acquire may remain pending without creating replacement
current A + pending next slot leaves A current
slot bind returns exactly one candidate
abort-before-resolution has no late live carrier
non-abort acquire rejection terminalizes Binding for Session and stops re-arm
Binding rejection does not revoke healthy current Renderer or fail Runtime/Frame
carrier-acquired protocol terminal may re-arm fresh slot when Binding remains healthy
renderer-control peer owns version negotiation
Main does not renegotiate
hello preflight before switch
unrepresentable B cannot evict A
concurrent R+1 no loss
replacement/old inFlight/stale terminal identity safety
current terminal no revision bump
Session terminal aborts pending slot + retires peers
representation isolation
M7 dataAuthorities=[]
no shadow/framework
```

---

## 16. Frozen Closure

M7/02 implementation must produce：

```text
optional MainPlatform Renderer capability
one armed candidate-slot model when capability exists
explicit acquire cancellation vs Binding-terminal rejection semantics
OpaqueMaterialGenerator common output contract + migration
pure projection/revision discipline
protocol-owned negotiation
hello preflight/current-switch atomicity
replacement/terminal identity safety
Session terminal cleanup
representation isolation
```

Changing candidate-slot meaning、Binding rejection semantics、material output bound、optionality、negotiation ownership、current-switch ordering or Session terminal semantics requires ADR 0027 reopen。
