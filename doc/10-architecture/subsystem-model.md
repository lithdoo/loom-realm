# 模块子系统模型

> 层级：系统架构  
> 状态：Active Design  
> 稳定程度：Evolving  
> 主要定义：Subsystem logical role、Definition Module ABI、Runtime/Frame local context、FrameOutcome、Input Interest/State、Render Domain、错误收敛与 role-facing Platform boundary  
> 依赖：[系统架构总览](./system-overview.md)、[运行承载系统](./runtime-hosting-system.md)、[栈式运行系统](./stack-runtime-system.md)、[通信系统](./communication-system.md)、[渲染系统](./rendering-system.md)  
> 正式 Input：[User Input v1](../15-contracts/user-input-v1.md) · [ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 实现草案：[package design source](https://github.com/lithdoo/loom-realm/blob/main/packages/subsystem/DESIGN.md)  
> 最近复核：2026-09-07

---

## 1. Role Boundary

Subsystem Runtime负责：

```text
business state
Runtime-level business initialization/cleanup
local Frame Context + mutation gate
Frame-scoped Desired Input Interest + retained State
outbound Frame call/return role
Render Domain authoritative state
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
    Render Domain Registry/State

Platform
    executable binding + physical topology/provisioning
```

任何 Runner/module/transport ownership都不能产生第二份 Frame/Input authority。

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

`ready != Data exists != Renderer exists != Frame exists != Render baseline exists`。

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

---

## 6. Mutation Gate

每个 local Frame Context有 commit-sensitive mutation gate。pending call/return、administrative suspend、closing/closed、Runtime terminal都会阻止 ordinary business mutation。

Input 必须区分：

```text
State retention eligibility
!= business delivery eligibility
```

因此 pending mutation期间 same-current-Activation `.state` 可以更新 latest retained State，但不交业务；Event drop。只有明确 known-no-commit + same Activation重新开放时，latest State local-converge，Event不 replay。commit/revoke/terminal则丢弃 suppressed old State。

这条由 User Input v1 revision 2 / ADR 0029冻结；Renderer不感知 Subsystem mutation gate。

---

## 7. Business Exception / Runtime Failure

ordinary uncaught business exception在 authority明确健康时 → sanitized `FrameOutcome.failed` → normal return。

protocol ambiguity、SDK invariant corruption、Control loss → Runtime failure。

InputListener handler throw/reject属于 local business callback failure：必须 contained，不得升级为 Data/Runtime failure，也不得阻止其它匹配 listener被尝试交付。

---

## 8. Administrative Suspend / Terminal

`frame.suspend` 是 administrative one-way suspension：revoke Activation、close ordinary gates、abort frame signal、保留 context供 close cleanup。Child-call suspension不是 administrative suspend。

一个 Runtime instance只有一个 first terminal cause：graceful shutdown或 Runtime-fatal。SDK先 abort relevant signals，再 bounded cleanup；Input listeners/Interest/retained State最终全部清除。

---

## 9. Input Interest / Listener

InputListener绑定 branded Frame capability。

```text
Desired Interest[F]
= union(all live listener channel contributions for F)
```

Interest是 Frame-scoped desired configuration，不是 Main authority。Publication始终是 full Registry snapshot。

Author mutation必须先验证 candidate representability；非法 channel/duplicate/union hard-limit失败要 local-atomically reject：旧 Desired Interest不变、wire send=0、Data peer不受影响。

同一 `(F,A,C.state)` 已有 retained State时，新 `.state` listener首次 locally eligible可直接得到 current retained baseline；`.event` listener只接收 future Event。

---

## 10. Input Across Activation / Data

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

## 11. DataPlane

Subsystem SDK只有一个 connection-wide Data peer/reader：

```text
SubsystemDataBinding
      ↓
@loomrealm/data peer
      ↓
InputManager / RenderManager
```

`@loomrealm/data`拥有 carrier reader、JSON/profile validation、typed demux、serialized send/terminal；Input/Render manager不得竞争 raw carrier。

InputManager拥有 latest-only Interest publisher，而不是第二 writer；Data peer retirement触发 fresh-role publication，不做 retry/replay old send。

---

## 12. Render Domain

Subsystem author创建 `RenderDomain`表达 authoritative presentation state/event。SDK mint domainId；business name不是 protocol identity。

```text
Frame close/suspend != Domain destroy/hide
Activation change   != Domain lifetime
Data retire          != authoritative Domain destroy
```

fresh Data carrier重新 publication Domain Registry + fresh Snapshots，不能复用旧 Patch chain。

---

## 13. Dynamic Provisioning / Content

Hostra Data：Broker → Runner IPC → Data WS → SubsystemDataBinding。

PWA Data：Broker → Worker provisioning → transferred MessagePort → SubsystemDataBinding。

Provisioning不是 Runtime Control、Data application protocol或 author API；provisioning failure不自动失败 Runtime/Frame。

Content只通过 platform-neutral `ContentClient`；ordinary readonly content capability与 executable module resolution严格分离。

---

## 14. Portability / Error Boundary

业务应满足：

```text
@loomrealm/map → @loomrealm/subsystem
```

共享 logical ABI/capability/business semantics，而不是 module path、artifact bytes、Runner/transport。

错误分域：

```text
business validation → FrameOutcome.failed
pre-commit call rejection → typed local error
protocol ambiguity/fatal → Runtime failure
module load/ABI → bootstrap failure
Data provisioning/loss → Data unavailable
Input handler failure → local callback containment
```

Platform path/token/ticket/internal stack不得泄漏给普通业务错误。

---

## 15. Final Invariants

1. Subsystem role platform-neutral；
2. Main独占 public Frame/Activation/InputTarget authority；
3. Definition artifact由 Platform LaunchPlan选择，业务只见统一 ABI；
4. ready不暗示 Data/Renderer；
5. initialize只建 Frame Context，activate后才启动 handler；
6. FrameOutcome与 protocol三态一一对应；
7. ambiguous/fatal绝不重新进入业务 continuation；
8. Desired Interest Frame-scoped，Input lease Activation-scoped，wire publication carrier-scoped；
9. mutation gate关闭时 State retention与 business delivery分离，确保 known-no-commit same-Activation current-State收敛；
10. Event不 replay；handler failure不升级 Data/Runtime；
11. fresh Data重新建立 Input/Render baselines；
12. Render Domain独立于 Frame/Data carrier；
13. one Data peer统一 demux；
14. Platform provisioning不污染 application protocols；
15. executable capability与 readonly Content capability分离；
16. Hostra/PWA physical差异不得改变 business-observable semantics。
