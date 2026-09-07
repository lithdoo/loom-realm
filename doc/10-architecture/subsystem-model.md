# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving overall / **M10 Input + M11 Render implementation slices Frozen**  
> 主要定义：Subsystem logical role、Definition Module ABI、Runtime/Frame local context、FrameOutcome、Input author projection、Render Domain author projection、错误收敛与 role-facing Platform boundary  
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
business Render Domain authority + transient Render Event intent
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

---

## 6. Mutation Gate

每个 local Frame Context有 commit-sensitive mutation gate。pending call/return、administrative suspend、closing/closed、Runtime terminal都会阻止 ordinary business mutation。

Input 必须区分：

```text
State retention eligibility
!= business delivery eligibility
```

pending mutation期间 same-current-Activation `.state` 更新 latest retained State但不交业务；Event drop。known-no-commit + same Activation重新开放时 latest State local-converge；commit/revoke/terminal丢弃 suppressed old State。

Render Domain authority不由 Frame mutation gate创建或销毁；业务若在 handler 内调用 RenderDomain 方法，该调用本身仍是普通 synchronous author mutation，必须遵守当前业务执行路径的既有 Frame/mutation discipline，但 Render protocol不增加 Frame identity或 mutation-gate字段。

---

## 7. Input Author Projection — Frozen M10

Author-facing channel是 User Input v1 canonical channels的业务 projection：

```text
keyboard.state / keyboard.event
pointer.state  / pointer.event
gamepad.state  / gamepad.event
x.<custom>.state / x.<custom>.event
```

Handler接收 canonical payload only，不接收 `input.*` envelope、Frame/Activation/Data identity。

`SubsystemScope.createInputListener({frame,channels})` 是唯一 M10 creation seam。

---

## 8. Interest Contribution vs Handler Registration

```text
Desired Interest[F]
= union(all live listener channel contributions for F)
```

固定：

```text
channels / setChannels → listener Interest contribution
on(channel, handler)   → callback registration only
unsubscribe            → removes one callback only / idempotent
close                  → contribution + registrations removed / idempotent
```

Author config invalid/duplicate/hard-limit overflow必须在 local commit前拒绝，旧 Desired Interest不变、wire send不因失败调用改变、Data不受影响。

---

## 9. Retained State / Deterministic Delivery

InputManager保存 current `(F,A,C.state)` latest detached deep-immutable author payload。

State handler首次 locally eligible且已有 retained State时同步交付一次 current local baseline；Event不 replay。

Derived union真正移除 state channel则清对应 retained State。

Delivery order：

```text
single channel → registration order
multi-channel convergence → canonical ASCII channel order → registration order
```

Handler mutation只影响 subsequent delivery；sync throw/async reject local containment，不成为 Data flow control。

---

## 10. Input Across Activation / Data

Child-call suspension：listener + Desired Interest保留，fresh A2后同一 config重新生效，但 A1 State/Event不跨到 A2。

Fresh Data：

```text
old carrier retained State cleared
Desired Interest/listeners remain
→ republish current Registry
→ fresh State baseline
→ Event future-only
```

Frame close protocol success成立前必须关闭相关 listeners、移除 Desired Interest、清 retained/suppressed State。

---

## 11. Business Exception / Runtime Failure

```text
ordinary uncaught business exception → sanitized FrameOutcome.failed
Input handler failure              → local callback containment
pre-commit call rejection          → State convergence then typed local error
protocol ambiguity/Control loss    → Runtime failure
Data failure                       → Data unavailable, not Frame unwind
```

---

## 12. Administrative Suspend / Terminal

`frame.suspend` 是 administrative one-way suspension：revoke Activation、close ordinary gates、abort frame signal、保留 context供 close cleanup。Child-call suspension不是 administrative suspend。

一个 Runtime instance只有一个 first terminal cause。SDK先 abort relevant signals，再 bounded cleanup；Input local state与 Render Domains最终清理。

---

## 13. DataPlane

Subsystem SDK只有一个 connection-wide Data peer/reader：

```text
SubsystemDataBinding
      ↓
@loomrealm/data peer
      ↓
InputManager / RenderManager publication
```

`@loomrealm/data`拥有 carrier reader、JSON/profile validation、typed demux、serialized send/terminal；Input/Render manager不得竞争 raw carrier。

Fresh Data peer分别触发 current Input Interest publication 与 current Render Registry/Snapshot baseline；不 retry/replay old send。

---

## 14. Frozen M11 Render Author Projection

Author-facing exact seam：

```text
SubsystemScope.createRenderDomain(initialState) → RenderDomain

RenderDomain.replace(state): void
RenderDomain.emit(event): void
RenderDomain.close(): void
```

Root新增类型仅：

```text
RenderNode
RenderDomainState
RenderEvent
RenderDomain
```

`RenderManager` internal-only。Author不见 domainId/generation/Registry/revision/Snapshot/Patch/carrier/send outcome。

所有操作：

```text
validate
→ detach caller-owned value
→ atomic local commit / bounded Event offer
→ synchronous return
```

成功提交的 state/event 必须始终可表示为 Frozen Render Update v1；author object后续 mutation不得改变已提交值。

Local errors：

```text
invalid shape / semantic usage / stale Event target / closed handle → TypeError
hard-limit overflow                                         → RangeError
```

失败 local-atomic，不产生由该失败调用引起的新 publication；不升级 Data/Runtime/Frame。

---

## 15. Render Domain Identity / Lifetime

```text
Frame create/suspend/close != Domain create/hide/destroy
Activation change          != Domain lifetime
Data retire                != business Domain destroy
```

live business Domains / Subsystem instance `<= 256`。

SDK mint `domainId`，一个 Subsystem Runtime instance 内永不复用已 mint 值。

Node key：

```text
Domain-wide current-state unique
live key keeps stable tag
once removed from one business RenderDomain lifetime
→ cannot be introduced again in that business RenderDomain lifetime
```

这是 local stronger invariant；wire generation-scoped emitted history仍由 publication负责。

`close()` 幂等；close后 replace/emit → TypeError。Runtime terminal最终关闭全部 live Domains。

---

## 16. Render Publication / Event

Fresh current Data：

```text
render.domains(current Registry)
→ fresh Snapshot each current Domain
→ Patch/Snapshot/Event
```

same-generation reconnect保留 wire Domain/Node emitted identity history，但重建 carrier-local baseline/revision。

Event：

```text
emit requires current business target
no carrier → not retained for future carrier
current carrier + unbaselined → MAY bounded-pend behind establishing Snapshot
carrier loss / Domain removal → pending Event discarded
never replay across carrier
```

publication send terminal只结束 current Data publication；business Domain authority保留，existing host Data lifecycle决定 fresh peer。

---

## 17. Dynamic Provisioning / Content

Hostra Data：Broker → Runner IPC → Data WS → SubsystemDataBinding。

PWA Data：Broker → Worker provisioning → transferred MessagePort → SubsystemDataBinding。

Provisioning不是 Runtime Control、Data application protocol或 author API；provisioning failure不自动失败 Runtime/Frame。

Content只通过 platform-neutral `ContentClient`；ordinary readonly content capability与 executable module resolution严格分离。

---

## 18. Portability / Error Boundary

业务应满足：

```text
@loomrealm/map → @loomrealm/subsystem
```

共享 logical ABI/capability/business semantics，而不是 module path、artifact bytes、Runner/transport。

错误分域：

```text
business validation             → FrameOutcome.failed
pre-commit call rejection       → typed local error after State convergence
Render author misuse/limit      → local TypeError / RangeError
protocol ambiguity/fatal        → Runtime failure when Control; Data retirement when Data
Data provisioning/loss          → Data unavailable
Input handler failure           → local callback containment
```

Platform path/token/ticket/internal stack不得泄漏给普通业务错误。

---

## 19. Final Invariants

1. Subsystem role platform-neutral；
2. Main独占 public Frame/Activation/InputTarget authority；
3. ready不暗示 Data/Renderer/Input/Render baseline；
4. FrameOutcome与 protocol三态一一对应；
5. ambiguous/fatal绝不重新进入业务 continuation；
6. Desired Interest Frame-scoped，Input lease Activation-scoped，wire publication carrier-scoped；
7. async Input handler不成为 Data flow control；
8. known-no-commit State convergence先于 recoverable `frame.call` rejection observable；
9. one Data peer统一 demux；
10. business Render authority只在 Subsystem；
11. exact Render author API同步 local-only并始终提交可表示状态；
12. business Render Domain独立于 Frame/Data carrier；
13. SDK domainId Runtime-instance 内不复用；business Node key Domain-lifetime one-shot；
14. fresh Data重新建立 Input/Render baselines，Event不 replay；
15. Render author error/Data failure不升级 Runtime/Frame；
16. Platform provisioning不污染 application protocols；
17. Hostra/PWA physical差异不得改变 business-observable semantics。
