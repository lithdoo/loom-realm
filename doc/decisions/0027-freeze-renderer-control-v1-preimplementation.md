# ADR 0027：冻结 Renderer Control v1 与 M7 Preimplementation Closure

> 状态：Accepted  
> 日期：2026-09-03  
> 影响范围：M7 Renderer Control、`@loomrealm/renderer-control`、`@loomrealm/main`、`@loomrealm/renderer`、`@loomrealm/platform-ports`  
> 依赖：[ADR 0021](./0021-runtime-control-preimplementation-closure.md)、[ADR 0026](./0026-session-scoped-platform-instance.md)、[Main ⇄ Renderer Control v1](../15-contracts/main-renderer-control-v1.md)  
> 实施文档：仓库根目录 `M7_01_*` → `M7_05_*`

## 背景

M7 只建立一个具体、bounded、fail-closed 的 Main → Renderer committed authority mirror，不建立通用 RPC/状态同步框架。

冻结前必须关闭：Renderer physical ingress、capability absence、candidate lifecycle、version negotiation ownership、hello preflight/current switch race、replacement/in-flight send、Session terminal、Runtime projection、identity material与 representation failure。

---

## 1. Frozen `RendererControlBinding`

`@loomrealm/platform-ports` 增加：

```ts
import type { MessageCarrier } from "@loomrealm/foundation";

export interface RendererControlBinding {
  acquire(
    rendererControlToken: string,
    signal: AbortSignal,
  ): Promise<MessageCarrier>;
}
```

一个 `acquire(T, signal)` = **arm exactly one candidate slot using Main-issued token T**。

固定语义：

```text
acquire MAY remain pending until Platform has a physical candidate Renderer
calling acquire MUST NOT by itself mean "create a new visible Renderer now"
calling acquire MUST NOT itself replace the current Renderer
Platform binds at most one physical candidate to T
Platform delivers exact T to that candidate bootstrap
Platform establishes one already-connected MessageCarrier
Promise resolves at most once with that carrier
```

如果在没有 armed slot 时出现额外 physical candidate，或一个 slot 已经绑定 candidate 后又出现额外 candidate：

```text
Platform MUST NOT give it the armed token
Platform MUST NOT expose it as a live Renderer Control participant
Platform rejects/closes/discards it according to product policy
```

Abort-before-resolution：slot canceled；后续 late candidate/carrier不得作为 live result，Platform关闭/丢弃。

Binding不解析 Renderer Control、不认证 token、不协商版本、不决定 currentness、不做 protocol retry/replay。

这使 Main 可以在 current Renderer存在时预挂 exactly one future candidate slot，而不会因 `acquire()` 调用本身自动产生 replacement。

---

## 2. Binding Availability Is Optional

M7 Main-facing shape：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
}
```

```text
rendererControl absent
→ no Renderer Control physical capability
→ no Renderer token/candidate slot
→ Runtime/Frame Session normal

rendererControl present
→ Main maintains frozen bounded current/candidate model
```

M7 deterministic Platform提供 Binding；M6 Hostra Runtime-only/headless可 omit；Hostra/PWA physical realization分别 M14/M16。

Optional availability不放松 Binding存在后的 protocol semantics。

---

## 3. `OpaqueMaterialGenerator`

M5 `BootstrapTokenGenerator` current-v1 直接收敛为：

```ts
export interface OpaqueMaterialGenerator {
  generate(): string;
}
```

Main分别取得 fresh Session identity、Runtime bootstrap credential、Renderer Control credential material。Generator只生成 fresh/high-entropy/opaque material；Main拥有 identity/currentness/registration/binding/consumption/invalidation。

无 compatibility alias、identity service、token registry或 crypto facade。

---

## 4. Protocol Negotiation Ownership

```text
renderer-control Main peer
    parse/validate renderer.hello
    validate protocolVersions
    select supported protocolVersion = 1
    unsupported → protocol error/terminal
    then invoke Main authority acceptance

Main
    validate Session/candidate/token/currentness
    never parse or negotiate protocolVersions
```

Protocol mechanics stay in protocol package；authority stays in Main。

---

## 5. Session / Revision / Projection

Main Session：

```text
fresh sessionId
rendererRevision = 1
initial Renderer-visible payload/Snapshot frozen
```

Revision advances exactly on committed Renderer-visible payload change, comparing payload without revision field；connection/candidate/transport changes do not bump。

Snapshot is pure projection of existing Main Runtime/Frame/Stack/currentActivation/currentInputTarget authority；no shadow Renderer registries。

M7 `dataAuthorities=[]`；real Data policy begins M8。

Runtime mapping：

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

failure precedence > stopped。Session terminal后 Control retires；normal cleanup后续 transitions不要求 publication。

---

## 6. Bounded Main Candidate Model

Binding存在时 Main Session内部最多：

```text
one current Renderer peer
+
one armed/pending/candidate attempt
```

Main可在 current Renderer存在时 arm下一 slot；slot MAY长期 pending，且其存在不意味着新的 Renderer已经创建。

Attempt settle后，Session仍 live时 Main MAY arm one fresh next slot with fresh token。Next slot是 fresh attempt，不是 retry/replay。

Renderer absence、pending slot或 Binding absence不得阻塞 Runtime/Frame business execution。

---

## 7. Hello Exact Preflight Before Current Switch

Renderer-control peer已选择 v1 后，Main serialized authority lane固定：

```text
require Session live + exact candidate attempt
validate exact candidate token
capture current committed Snapshot R
renderer-control exact side-effect-free prepare/preflight hello Result(id=1,v1,R)

preflight failure:
    invalidate attempt/token
    old current unchanged
    candidate fail closed

preflight success:
    consume token
    candidate becomes only current Renderer
    old peer synchronously retires from future publication
    commit {R, preparedHelloText, oldPeer}
```

Transaction外发送同一 prepared text并 request old close。

因此 unrepresentable candidate不能驱逐 healthy old current；R+1不能落入 capture/current-install gap。

Hello Result send失败：new candidate terminal；old不复活；fresh slot/attempt恢复。

---

## 8. Replacement / In-flight Send

Replacement commit后：

```text
old peer non-current immediately
no new old publication/send may start
old pendingLatest settles/discards
old close requested
```

Foundation `send()` 不承诺取消已开始发送。Already-started old in-flight send MAY later settle/arrive；其 late activity没有 current-authority effect，不得恢复 old或清除/覆盖 new Renderer state。

不得引入 cancelable writer/transport ACK只为禁止 late bytes。

---

## 9. Renderer Initial Handoff

Renderer peer先返回 validated initial Snapshot R；Renderer role原子安装 `{peer,R}`；之后才开始 consume later `renderer.state`。

Later-state surface必须 lazy/explicit-start或等价保证。Renderer role不建立第二套 revision/session validator。

---

## 10. Session Terminal

Main latch root outcome / external shutdown / fatal：

```text
no fresh Renderer token/slot
abort armed/pending Binding acquire
invalidate pending token
retire candidate peer
retire current peer
stop publication
```

Renderer cleanup不改变/延迟 Main Session result，也不成为 Runtime shutdown coordinator。无 final `session.ended` RPC/Snapshot。

---

## 11. Representation Failure Isolation

Renderer Control 1 MiB/depth/member limits是 wire safety，不是 Runtime count/Frame depth/DataAuthority业务 limit。

完整 Snapshot不可表示：

```text
Renderer Control candidate/current fails closed
Main Runtime/Frame/Stack unchanged
no rollback
no truncation
no Renderer-specific frame.call error
```

Frozen Frame v1不新增 Renderer stack-limit semantics。

---

## 12. M7 vs Physical Qualification

M7实现并 qualification：

```text
renderer-control concrete peers
OpaqueMaterialGenerator + RendererControlBinding contract
optional-capability Main path
Binding-present deterministic MemoryCarrier path
Main pure projection/revision/candidate-slot/currentness
Renderer minimal current holder
hello/replacement/session-terminal races
1 inFlight + 1 pendingLatest structural boundedness
representation isolation
```

Deferred：Hostra Renderer WS/BrowerWindow + stalled-write policy(M14)、PWA Renderer MessagePort(M16)、Data/Input/Render/Content(M8+)。

---

## Compatibility / Reopen Rule

Current project无 compatibility obligation：`BootstrapTokenGenerator → OpaqueMaterialGenerator` 直接修正，无 alias/v2。

只有 implementation evidence证明 correctness/security contradiction、Frozen contract conflict或 Frozen capability无法表达真实必要 consumer semantics 才允许 reopen。

不得因代码复用、generic framework、未来 M8+、测试便利、命名/目录对称或 transport API偏好 reopen。

---

## Final Invariants

1. Main owns Renderer application authority/currentness；renderer-control owns protocol mechanics/version negotiation。  
2. `RendererControlBinding.acquire` arms one candidate slot；它不是 Renderer launch/replacement command。  
3. 一个 armed slot最多绑定一个 candidate；无 slot的额外 candidate不得获得 token/live carrier。  
4. `MainPlatform.rendererControl` optional；absence无需 fake Binding。  
5. Binding存在时最多 one current + one armed/pending/candidate attempt。  
6. Hello exact outbound preflight先于 current switch，并与 visible mutation共享 Main serialization。  
7. Replacement主动撤销 old current，但不虚构 in-flight send cancellation。  
8. Renderer先安装 initial Snapshot再 consume later state。  
9. Session terminal撤销全部 Renderer attempt/current authority。  
10. Representation failure不改变 Frozen Frame / Runtime authority。  
11. M7 DataAuthority policy保持空。  
12. No generic RPC/Publisher/Store/ConnectionRegistry/Renderer mega-port/shadow authority。  
13. 本 ADR + Frozen protocol + `M7_01`–`M7_05` 是 M7 implementation事实源。