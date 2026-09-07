# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10 Input + M11 Render implementation slices Frozen**  
> 主要定义：Subsystem logical role、Definition Module ABI、Runtime/Frame local context、FrameOutcome、Input author projection/Interest/State、Render Domain、错误收敛与 role-facing Platform boundary  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)  
> 正式 Input：[User Input v1](../15-contracts/user-input-v1.md) · [ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 正式 Render：[Render Update v1](../15-contracts/render-update-v1.md)  
> M10 实施：[M10 / 01](../../M10_01_SUBSYSTEM_INPUT_MANAGER.md) · [M10 / 05](../../M10_05_QUALIFICATION_CLOSURE.md)  
> M11 实施：[M11 / 01](../../M11_01_SUBSYSTEM_RENDER_MANAGER.md) · [M11 / 05](../../M11_05_QUALIFICATION_CLOSURE.md)  
> 最近复核：2026-09-07

---

## 1. Role Boundary

Subsystem Runtime负责：

```text
business state
Runtime-level business initialization/cleanup
local Frame Context + mutation gate
Frame-scoped Desired Input Interest
retained author-safe Input State + business delivery
outbound Frame call/return role
business Render Domain authoritative state + transient Event intent
Content client usage
```

Subsystem不负责 Game/Platform manifest、executable selection、Process/Worker、Main public Frame/Activation/InputTarget authority、DataAuthority、Renderer hosting 或 DataConnectionBroker。

---

## 2. Definition Module / Platform Boundary

Platform LaunchPlan为每个 logical subsystem key选择 executable `.mjs` Definition Module：

```text
default export = SubsystemDefinitionFactory
```

Hostra/PWA artifact MAY不同，但进入同一 author/host ABI。Definition Module不得读取 Platform Launch Manifest、探测平台分支业务语义、打开 Control/Data carrier、读取 bootstrap material、spawn Process/Worker 或拥有 Broker。

业务 Definition source只依赖 `@loomrealm/subsystem`；SDK package内部可使用 shared JSON/protocol mechanics，但不得把 protocol envelope/peer/Platform capability变成业务依赖。

Runner把 physical resources投影为窄 role-local capabilities：

```text
RuntimeControlBinding
SubsystemDataBinding
ContentClient
```

---

## 3. Authority Boundary

```text
Main
    Runtime public lifecycle
    Frame / Stack / Activation / InputTarget
    transaction/failure unwind
    DataAuthority

Subsystem
    business state
    local Frame Context + mutation gate
    Desired Interest[F]
    retained Input State / business delivery
    business Render Domain Registry/State/Event intent

Platform
    executable binding + physical topology/provisioning
```

任何 Runner/module/transport ownership都不能产生第二份 Frame/Input/Render authority。

---

## 4. Runtime / Frame

Startup：

```text
Runner loads planned module
→ validates ABI
→ create SDK instance
→ acquire Runtime Control
→ hello / identified
→ definition.initialize
→ ready
```

`ready != Data exists != Renderer exists != Frame exists != Input baseline exists != Render baseline exists`。

`frame.initialize`只建立 local context；首次 successful `frame.activate`安装 fresh Activation后，author handler才启动 exactly once。

Frame author capability只暴露：

```text
id
params
signal
call(subsystem, params)
```

Author不见 activationId。

---

## 5. FrameOutcome / Call

业务结果直接对应 Frozen Frame v1：

```text
completed(value)
cancelled
failed(error)
```

Accepted child call：

```text
caller Activation
→ Main commit suspension/revoke
→ child lifecycle/outcome
→ caller fresh resume Activation
→ frame.call resolves outcome
```

只有明确 pre-commit recoverable rejection可以 typed reject并确认 same current Activation继续；timeout/loss/divergence等 ambiguous/fatal绝不重新进入业务 continuation。

M10进一步冻结 recoverable rejection的本地顺序：

```text
same Activation mutation gate reopen
→ synchronously deliver current retained State convergence
→ then frame.call rejection becomes observable to business catch
```

只保证 handler同步 invocation已尝试；async handler Promise不等待。

---

## 6. Mutation Gate

每个 local Frame Context有 commit-sensitive mutation gate。pending call/return、administrative suspend、closing/closed、Runtime terminal都会阻止 ordinary business mutation。

Input 必须区分：

```text
State retention eligibility
!= business delivery eligibility
```

因此 pending mutation期间 same-current-Activation `.state` 更新 latest retained State但不交业务；Event drop。只有明确 known-no-commit + same Activation重新开放时，latest State local-converge，Event不 replay。commit/revoke/terminal则丢弃 suppressed old State。

这条由 User Input v1 revision 2 / ADR 0029冻结；Renderer不感知 Subsystem mutation gate。

Render Domain authority不由 Frame mutation gate创建或销毁；Render protocol也不引入 Frame/Activation identity。业务代码若在 ordinary business path调用 RenderDomain，仍受该 path 的既有 mutation discipline约束。

---

## 7. Input Author Projection — Frozen M10

Author-facing channel是 User Input v1 canonical channels的业务 projection：

```text
keyboard.state / keyboard.event
pointer.state  / pointer.event
gamepad.state  / gamepad.event
x.<custom>.state / x.<custom>.event
```

Handler接收 canonical **payload only**，不接收 `input.*` envelope、Frame/Activation/Data identity。

标准 payload结构与 User Input v1完全一致；custom payload是 bounded JSON object。

`SubsystemScope.createInputListener({frame,channels})` 是唯一 M10 creation seam。

---

## 8. Interest Contribution vs Handler Registration

InputListener绑定同一 Subsystem instance 的 branded live Frame capability。

```text
Desired Interest[F]
= union(all live listener channel contributions for F)
```

固定：

```text
channels / setChannels
    own this listener's Interest contribution

on(channel, handler)
    callback registration only
    does not change Interest

unsubscribe
    removes one callback only
    idempotent

close
    removes listener contribution + registrations
    idempotent
```

`setChannels` shrink保留 callback registration为 dormant；re-add重新激活。`channels=[]` 合法。

Author config invalid/duplicate/hard-limit overflow必须在 local commit前拒绝，旧 Desired Interest不变、wire send=0、Data不受影响。

---

## 9. Retained State / Deterministic Delivery

InputManager保存 current `(F,A,C.state)` latest **detached deep-immutable** author payload。

State handler首次 locally eligible且已有 retained State：

```text
registration/config commit
→ one synchronous current local baseline
```

如果 derived union真正移除 state channel，则 retained State同时清除；later re-add等待 fresh Renderer baseline。

Event永不 local replay。

每次 delivery捕获 stable matching-handler snapshot：

```text
single channel
    registration order

multi-channel local convergence
    canonical ASCII channel order
    then registration order
```

Handler在 callback中 unsubscribe/close/setChannels/on只影响 subsequent delivery。

---

## 10. Async Handler Boundary

Input handler可以返回 Promise，但业务 async completion不是 Data flow control：

```text
invoke synchronously
sync throw → contained
Promise reject → observed/contained
Promise pending forever → does not stall later handler or Data reader
```

InputManager不得把 handler Promise return/chain到 `@loomrealm/data` inbound dispatcher。

因此 Data peer等待的是 InputManager对本条 application message的同步 local application完成，而不是业务 async task完成。

---

## 11. Input Across Activation / Data

Child-call suspension：listener + Desired Interest保留，ordinary delivery停止；fresh A2后同一 config重新生效，但 A1 State/Event不跨到 A2。

Fresh Data carrier：

```text
old carrier retained State cleared
remote Registry/State/Event history = empty
Desired Interest/listeners remain
→ republish current Registry
→ fresh State baseline
→ Event future-only
```

Frame close protocol success成立前必须已关闭 listeners、移除 Desired Interest、清 retained/suppressed State。

---

## 12. Business Exception / Runtime Failure

ordinary uncaught business exception在 authority明确健康时 → sanitized `FrameOutcome.failed` → normal return。

```text
Input handler sync/async failure → local containment
pre-commit call rejection       → State convergence then typed local error
protocol ambiguity/Control loss → Runtime failure
Data failure                    → Data unavailable, not Frame unwind
```

Input handler failure不得阻止其它 matching handler同步 invocation。

---

## 13. Administrative Suspend / Terminal

`frame.suspend` 是 administrative one-way suspension：revoke Activation、close ordinary gates、abort frame signal、保留 context供 close cleanup。Child-call suspension不是 administrative suspend。

一个 Runtime instance只有一个 first terminal cause：graceful shutdown或 Runtime-fatal。SDK先 abort relevant signals，再 bounded cleanup；Input listeners/Interest/retained State 与 live Render Domains 最终全部清除。

---

## 14. DataPlane

Subsystem SDK只有一个 connection-wide Data peer/reader：

```text
SubsystemDataBinding
      ↓
@loomrealm/data peer
      ↓
InputManager / RenderManager publication
```

`@loomrealm/data`拥有 carrier reader、JSON/profile validation、typed demux、serialized send/terminal；Input/Render manager不得竞争 raw carrier。

InputManager拥有 latest-only Interest publisher；RenderManager拥有 bounded current-carrier publication coordinator。二者都复用同一 Data peer，不形成第二 writer/currentness abstraction；Data peer retirement触发 fresh-role publication，不 retry/replay old send。

---

## 15. Render Domain — Frozen M11

Exact author seam：

```text
SubsystemScope.createRenderDomain(initialState) → RenderDomain
RenderDomain.replace(state): void
RenderDomain.emit(event): void
RenderDomain.close(): void
```

M11 root只新增：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
```

`RenderManager` internal-only。Author不见 `domainId`、generation、Registry、revision、Snapshot/Patch、carrier 或 send outcome。

所有 author operations 都是 synchronous local-only：

```text
validate Frozen Render v1 representability
→ detach caller-owned value
→ atomic local commit / bounded Event offer
→ return
```

成功提交的 state/event 必须始终可表示为 Frozen Render Update v1；调用方后续 mutation 不得改变已提交值。

Local error：

```text
invalid shape / semantic usage / stale Event target / closed handle → TypeError
hard-limit overflow                                         → RangeError
```

失败 local-atomic，不产生由失败调用引起的新 publication，也不升级 Data/Runtime/Frame。

必须保持：

```text
live business Domains / Subsystem instance <= 256
Frame close/suspend != Domain destroy/hide
Activation change   != Domain lifetime
Data retire          != business Domain destroy
```

SDK mint `domainId`，一个 Subsystem Runtime instance 内不复用已 mint 值。

business Node key 使用更强 local invariant：

```text
Domain-wide current-state unique
live key keeps stable tag
once removed from one business RenderDomain lifetime
→ cannot be introduced again in that business RenderDomain lifetime
```

`close()` 幂等；close 后 `replace/emit` → TypeError。

`emit` 要求 `targetKey` 当前存在于 business authoritative state。Fresh Data publication：

```text
render.domains(current Registry)
→ fresh Snapshot each current Domain
→ Patch/Snapshot/Event
```

same-generation reconnect保留 wire emitted identity history，但重建 carrier-local baseline/revision；无 current carrier 的 Event 不得带到 future carrier，current carrier + unbaselined Domain 的 Event MAY bounded-pend behind establishing Snapshot，carrier loss/Domain removal则丢弃，永不 replay。

Exact implementation contract 见 [M11 / 01](../../M11_01_SUBSYSTEM_RENDER_MANAGER.md) 与 [M11 / 02](../../M11_02_RENDER_PUBLICATION.md)。

---

## 16. Dynamic Provisioning / Content

Hostra Data：Broker → Runner IPC → Data WS → SubsystemDataBinding。

PWA Data：Broker → Worker provisioning → transferred MessagePort → SubsystemDataBinding。

Provisioning不是 Runtime Control、Data application protocol或 author API；provisioning failure不自动失败 Runtime/Frame。

Content只通过 platform-neutral `ContentClient`；ordinary readonly content capability与 executable module resolution严格分离。

---

## 17. Portability / Error Boundary

业务应满足：

```text
@loomrealm/map → @loomrealm/subsystem
```

共享 logical ABI/capability/business semantics，而不是 module path、artifact bytes、Runner/transport。

错误分域：

```text
business validation → FrameOutcome.failed
pre-commit call rejection → typed local error after State convergence
Render author misuse/limit → local TypeError / RangeError
protocol ambiguity/fatal → Runtime failure when Control; Data retirement when Data
module load/ABI → bootstrap failure
Data provisioning/loss → Data unavailable
Input handler failure → local callback containment
```

Platform path/token/ticket/internal stack不得泄漏给普通业务错误。

---

## 18. Final Invariants

1. Subsystem role platform-neutral；
2. Main独占 public Frame/Activation/InputTarget authority；
3. Definition artifact由 Platform LaunchPlan选择，业务只见统一 ABI；
4. ready不暗示 Data/Renderer/Input/Render baseline；
5. initialize只建 Frame Context，activate后才启动 handler；
6. FrameOutcome与 protocol三态一一对应；
7. ambiguous/fatal绝不重新进入业务 continuation；
8. Desired Interest Frame-scoped，Input lease Activation-scoped，wire publication carrier-scoped；
9. channels贡献 Interest，handler registration不改变 Interest；
10. retained State author-visible值 detached/immutable，Event不 replay；
11. deterministic handler invocation使用 stable snapshot + registration order；
12. async Input handler不成为 Data flow control；
13. known-no-commit State convergence先于 recoverable `frame.call` rejection observable；
14. one Data peer统一 demux Input/Render；
15. M11 exact Render author API synchronous local-only，成功值始终 Frozen-v1 representable；
16. business Render Domain独立于 Frame/Data carrier；SDK domainId Runtime-instance 内不复用；business Node key Domain-lifetime one-shot；
17. fresh Data重新建立 Input/Render baselines，Render Event不跨 carrier replay；
18. Render author error/Data failure不升级 Runtime/Frame；
19. Platform provisioning不污染 application protocols；
20. Hostra/PWA physical差异不得改变 business-observable semantics。
