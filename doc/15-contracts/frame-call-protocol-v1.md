# Main ⇄ Subsystem Frame / Call Protocol v1

> 层级：正式契约  
> 状态：Draft；Batch A 已 Normative / Frozen  
> 协议版本：1（目标版本）  
> 稳定程度：Batch A Frozen；Batch B+ Evolving  
> 主要定义：已 ready Runtime Container 中 Frame/Input Context 的身份、权威、生命周期、Activation，以及后续 Call / Return wire contract 的冻结边界  
> 依赖：[栈式运行系统](../10-architecture/stack-runtime-system.md)、[模块子系统模型](../10-architecture/subsystem-model.md)、[Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)  
> 决策记录：[ADR 0010：冻结 Frame / Call Protocol v1 Batch A](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)  
> 最近复核：2026-08-03

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

本文采用分批冻结：

```text
Batch A  Identity / Authority / Lifecycle / Activation    ← Frozen
Batch B  RPC Schema                                        ← Draft
Batch C  Call / Return transaction / commit barrier         ← Draft
Batch D  Error / timeout / retry / cancellation              ← Draft
Batch E  Runtime failure unwind                              ← Draft
Batch F  Limits / fixtures / profile/version completion      ← Draft
```

**只有明确标记为 Batch A 的语义已经成为 v1 不可由后续批次静默改变的 Normative 基线。**

Runtime Container Bootstrap、Subsystem identity、Runtime ready / shutdown / restart 已由独立 [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md) 冻结，Frame / Call Protocol 不得重新定义这些语义。

Frame 只代表调用 / ordinary User Input Context。本文不定义 Render 创建、可见性、销毁、Render Snapshot、Render Revision 或 Renderer Store 生命周期。

---

# Part I · Batch A — Normative / Frozen

## 1. Scope

Batch A 冻结：

```text
Frame identity
Frame → Subsystem assignment
caller relationship
Frame lifecycle authority
Frame lifecycle state model
Activation identity / lifecycle
ordinary input eligibility invariants
Stack stable-state invariants
Frame outcome 与 lifecycle 的分离
```

Batch A 不冻结：

```text
frame.initialize final wire Schema
frame.activate final wire Schema
frame.suspend final wire Schema
frame.resume final wire Schema
frame.close final wire Schema
frame.call / frame.return final wire Schema
Call / Return transaction ordering
rollback
error code
request timeout / retry
caller cancellation
Runtime failure suffix-unwind
Frame Protocol wire limits
Frame Protocol version/profile negotiation
```

后续批次 MUST 遵守本 Part 已冻结语义。

## 2. Preconditions

建立任何 Frame 前：

```text
Game Entry 已声明目标 Subsystem
→ 目标 Runtime Container 已启动
→ Control Connection 已 identified
→ Runtime observed state == ready
→ Runtime 没有 Main-owned shutdown intent
```

Frame / Call MUST NOT：

```text
首次启动 Runtime
restart Runtime
等待 Runtime Bootstrap
执行 subsystem.hello
改变 Runtime shutdown intent
```

Runtime 已进入：

```text
stopping
stopped
failed
```

时 MUST NOT 建立新的 Frame。

## 3. Authority

Frame 是 Main-owned control object。

Main 是以下公共状态的唯一权威：

```text
frameId
Frame → descriptor.key assignment
callerFrameId
Frame lifecycle state
Frame Stack position
current activationId
ordinary Input eligibility
current Input Target
```

Subsystem：

- 接收 Main 的 Frame control operation；
- 为 `frameId` 维护自身 Frame/Input Context；
- 按 Main 签发的 Activation 校验 ordinary User Input；
- 可以自由决定 Frame Context 如何映射到内部业务对象。

Subsystem MUST NOT：

```text
自行创建公共 frameId
自行改变 Frame Stack
自行修改 Frame → Subsystem assignment
自行修改 callerFrameId
自行签发 activationId
自行把 suspended Frame 恢复为 active
自行决定公共 Input Target
```

Renderer 只持有 Main Frame/Stack/Input Target 状态的只读镜像，不拥有 Frame lifecycle authority。

## 4. Frame Identity

### 4.1 `frameId`

`frameId` MUST：

```text
Main-generated
Session-scoped unique
opaque
immutable
never reused within the Session
```

一个 `frameId` 在整个 Session 内只能表示同一个 Frame。

Frame 进入 `closed` 后，即使再次对同一 Subsystem 使用相同调用参数，也 MUST 分配新的 `frameId`。

PID、Worker identity、Control Connection ID、System Data Connection ID、Render identity MUST NOT 代替 `frameId`。

### 4.2 Frame → Subsystem Assignment

每个 Frame 创建时永久绑定一个已声明：

```text
descriptor.key
```

概念关系：

```text
frameId
→ exactly one descriptor.key
```

该映射由 Main 创建并拥有，Frame 生命周期内 MUST NOT migrate 到另一个 Subsystem。

Main → Subsystem 的 Frame control operation 运行在已经通过 `subsystem.hello` 绑定到目标 `descriptor.key` 的 Control Connection 上，因此 Frame RPC 不需要重复建立第二份 Subsystem identity。

旧协议中的 `systemId` 只作为 Legacy 数据协议字段保留；Frame / Call v1 的当前架构身份使用 `descriptor.key` / `subsystemKey` 概念，不得继续把旧 `systemId` 当作新的 Frame Protocol identity 来源。

## 5. Caller Relationship

每个 Frame 创建时永久确定：

```ts
callerFrameId: string | null
```

规则：

```text
initial Frame
    callerFrameId = null

called Frame
    callerFrameId = direct caller frameId
```

`callerFrameId` MUST immutable。

以下行为不得改变 caller relationship：

```text
suspend
resume
Activation replacement
Renderer reload
System Data Connection replacement
```

v1 使用单一 LIFO Call Stack，因此一个 Frame 最多只有一个直接 Caller。

## 6. Frame Lifecycle State

Frame / Call v1 冻结的公共 lifecycle state 只有：

```ts
type FrameLifecycleState =
  | "starting"
  | "active"
  | "suspended"
  | "closing"
  | "closed";
```

v1 MUST NOT 增加公共：

```text
initialized
ready
failed
cancelled
completed
```

作为 Frame lifecycle state。

### 6.1 `starting`

`starting` 表示 Main 已分配 Frame identity，并正在建立目标 Subsystem 中的 Frame/Input Context。

它覆盖内部事务阶段：

```text
frameId allocated
→ initialize pending
→ initialize accepted
→ waiting for first activation commit
```

这些内部阶段不得被提升为第二套公共 Frame lifecycle。

### 6.2 `active`

`active` Frame：

```text
位于当前 Stack Top
拥有 exactly one current activationId
可以成为 ordinary Input Target
可以在后续协议允许时发起 ordinary call / return
```

正常稳定状态中至多一个 Frame 可以是普通 `active` / Input-eligible Frame。

协议事务切换过程中 MAY 短暂存在零个 active Frame，但 MUST NOT 向 Renderer 发布两个同时有效的 ordinary Input Target。

### 6.3 `suspended`

`suspended` Frame：

```text
仍然 live
仍然位于调用栈中
currentActivationId = null
不接收 ordinary User Input
不能作为 ordinary call / return authority
```

`suspended` 只描述调用与普通输入资格。

它 MUST NOT 推导：

```text
business Tick paused
business state frozen
Render hidden
Render frozen
Render destroyed
System Data Connection closed
```

### 6.4 `closing`

`closing` 表示 Frame 的公共终止流程已经由 Main 接受或启动。

进入 `closing` 后：

```text
currentActivationId = null
不得获得新的 ordinary input eligibility
不得再次发起普通 call
不得再次普通 return
```

Main / Subsystem MAY 执行该 Frame 自身所需的有限 cleanup。

### 6.5 `closed`

`closed` 是 terminal lifecycle state。

进入 `closed` 后：

```text
Frame 不再 live
不得 activate / resume / suspend / return
frameId 不得复用
```

Main MAY 保留只读 tombstone 用于诊断或调用历史，但 tombstone 不得重新成为有效 Frame。

## 7. Frozen Lifecycle State Machine

正常路径：

```text
starting
    │
    │ first activation committed
    ▼
active
    │
    ├──── child call established ────▶ suspended
    │                                  │
    │                                  │ child returns + new Activation
    │                                  ▼
    ◀──────────────────────────────── active
    │
    │ return / unwind / termination
    ▼
closing
    │
    ▼
closed
```

额外允许：

```text
starting  → closing
suspended → closing
```

用于 call-abort、Runtime failure unwind、Session termination 等终止流程。

以下转换不得成为正常 lifecycle：

```text
starting → suspended
active → active        via duplicate activation
suspended → suspended  via duplicate suspend
suspended → active     without a new Activation
closing → active
closing → suspended
closed → anything
```

后续 Batch B-D 将冻结具体 operation 与非法转换的 wire error 行为，但不得改变上述 lifecycle 图。

## 8. No Frame `ready`

Frame / Call Protocol v1 明确：

```text
DOES NOT define Frame ready state
DOES NOT define frame.ready
DOES NOT define frame.status
```

Frame initialization 成功只表示：

> 目标 Subsystem 已建立对应 Frame/Input Context，可以继续接受 Main 的首次 Activation control operation。

它不表示：

```text
Frame 已 active
Input Target 已发布
Render 已创建或 ready
业务 world 独立 ready
System Data Connection ready
```

Frame 首次获得 ordinary input eligibility 的平台边界只能来自首次 Activation 被成功提交。

## 9. Activation Identity

Activation 表示：

> 一个 Frame 的一次 ordinary User Input 有效周期。

`activationId` MUST：

```text
Main-generated
Session-scoped unique
opaque
immutable
never reused
```

`activationId` 不是：

```text
Frame identity
Subsystem identity
Render identity
Render Revision
Runtime generation
Connection identity
security credential
```

## 10. Current Activation Invariant

Main 对每个 Frame 最多维护：

```ts
currentActivationId: string | null
```

状态关系冻结为：

```text
starting
    currentActivationId = null

active
    currentActivationId = exactly one valid activationId

suspended
    currentActivationId = null

closing
    currentActivationId = null

closed
    currentActivationId = null
```

因此：

> 只有 `active` Frame 才能拥有有效 current Activation。

## 11. Activation Creation

Main MUST 在以下情况创建新的 Activation：

```text
Frame first becomes active
Frame resumes after child call / unwind recovery
```

每次 MUST 分配全新的 `activationId`。

例如：

```text
F1 / A1 active
→ F1 suspended
→ F2 / A2 active
→ F2 terminates
→ F1 / A3 active
```

恢复 Caller 时 MUST NOT 恢复 `A1`。

冻结不变量：

```text
Activation never rolls back.
Activation never resumes.
A reactivated Frame always receives a new Activation.
```

## 12. Activation Revocation

Frame 离开 `active` 时，其当前 Activation MUST 永久失效。

包括：

```text
active → suspended
active → closing
Runtime failure handling
Session termination
```

一旦 `(frameId, activationId)` 被 revoke，它在当前 Session 内 MUST 永久不能重新成为合法 ordinary input identity。

即使同一个 Frame 后续重新进入 `active`，也必须使用新的 Activation。

## 13. Ordinary Input Eligibility

普通 User Input 合法性至少要求：

```text
Frame exists
AND Frame lifecycle == active
AND provided activationId == currentActivationId
AND Frame is current Main-authorized Input Target
```

任何旧 Activation MUST 被 User Input Protocol / Subsystem Frame Input Router 拒绝。

该规则专门隔离：

```text
Renderer 延迟消息
旧 Data Connection 队列
浏览器 / OS 调度延迟
事件循环延迟
Activation 切换前已经排队的普通输入
```

Batch A 只冻结 identity/eligibility 规则；具体 User Input wire error、Sequence 和 reset 由 User Input Protocol 冻结。

## 14. Stack Invariants

Frame / Call v1 使用 Main-owned 单一 LIFO Call Stack。

冻结：

```text
Stack contains all currently live call Frames.
```

稳定状态：

```text
Stack[0]
    initial Frame

Stack[top]
    current active Frame

all non-top live Frames
    suspended
```

因此正常稳定状态：

```text
exactly one active Frame when Stack is non-empty
all other live Frames are suspended
```

调用 / 恢复事务中 MAY 有短暂 transitional state，但 Main MUST NOT 发布两个普通 Input Target。

## 15. Frame Outcome Is Not Lifecycle State

v1 明确区分：

```text
Frame lifecycle
    starting / active / suspended / closing / closed

Frame outcome
    completed / cancelled / failed
```

概念结果：

```ts
type FrameOutcome =
  | { readonly type: "completed"; readonly value?: unknown }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly error: unknown };
```

上面只用于说明两个维度，**不是 Batch A 冻结的最终 wire Schema**。

Frame outcome 描述：

```text
这次调用如何结束
```

Lifecycle 描述：

```text
Frame Context 当前是否仍存在
```

因此 Runtime failure、业务 failure 或 cancellation 不得通过把 lifecycle state 直接设置成 `failed / cancelled` 来跳过 `closing → closed` cleanup 语义。

Main 实现 SHOULD 将生命周期与结果分开保存，例如：

```ts
interface FrameRecordConcept {
  readonly frameId: string;
  readonly subsystemKey: string;
  readonly callerFrameId: string | null;
  state: FrameLifecycleState;
  currentActivationId: string | null;
  outcome: FrameOutcome | null;
}
```

## 16. Runtime Relationship

Frame / Call Protocol 只运行于已经 ready 且没有 shutdown intent 的 Runtime Container。

Frame lifecycle MUST NOT：

```text
启动 Runtime
关闭 Runtime
重新启动 Runtime
替代 subsystem.shutdown
改变 Runtime ready / stopping / stopped / failed state machine
```

Subsystem Control Protocol failure 可能触发 Frame unwind，但 Frame Protocol 不反向修改 Subsystem Control v1 的 Runtime lifecycle 含义。

## 17. Render / Data Connection Independence

以下全部禁止成为平台级隐式规则：

```text
starting   → render.create
active     → render.show
suspended  → render.hide / freeze
resume     → render.restore / resync
closing    → render.destroy
closed     → delete Renderer Render Store
```

同样：

```text
Frame create / close
MUST NOT implicitly create / close System Data Connection
```

Subsystem MAY 在自身业务实现中显式把 Frame 与某些业务对象或 Render 关联，但该关系不进入公共 Frame lifecycle。

## 18. Batch A Frozen Invariants

1. Frame 是 Main-owned call / ordinary-input control object。
2. `frameId` 由 Main 生成、Session 内唯一、opaque、永不复用。
3. 每个 Frame 永久绑定一个 `descriptor.key`。
4. `callerFrameId` 创建后 immutable。
5. Main 是 Frame lifecycle、Stack、Activation 与 Input eligibility 的唯一权威。
6. Frame lifecycle 只有 `starting / active / suspended / closing / closed`。
7. `completed / cancelled / failed` 是 termination outcome，不是 lifecycle state。
8. v1 不存在 Frame `ready / initialized / frame.status` 公共状态。
9. 只有 `active` Frame 才拥有有效 `currentActivationId`。
10. `activationId` 由 Main 生成、Session 内唯一、opaque、永不复用。
11. Frame 首次 active 和每次重新 active 都必须获得新的 Activation。
12. Activation 一旦 revoke 永久失效；Activation never rolls back。
13. 正常稳定状态至多一个 ordinary active / Input-eligible Frame。
14. 非栈顶 live Frame 在稳定状态中必须是 suspended。
15. Frame 只能在 ready 且无 shutdown intent 的 Runtime 上建立。
16. Frame lifecycle 不启动、停止或重启 Runtime。
17. Frame lifecycle 不隐式控制 Render 或 System Data Connection。
18. Frame / Call MAY 共享已认证 Subsystem Control Connection，但不得重新定义 Subsystem Control v1。

---

# Part II · Batch B+ — Draft / Non-Normative

以下内容保留当前设计方向，用于下一批冻结；除非明确引用 Part I，不构成最终 wire contract。

## 19. Planned RPC Surface

计划收敛为：

```text
Main → Subsystem
    frame.initialize
    frame.activate
    frame.suspend
    frame.resume
    frame.close

Subsystem → Main
    frame.call
    frame.return
```

不计划增加：

```text
frame.ready
frame.status
frame.ping
frame.render.*
```

最终 JSON Schema 在 Batch B 冻结。

## 20. Draft Call Direction

只有当前 Stack Top 的 active Frame 可以发起普通 call / return。

调用目标使用当前 Descriptor identity：

```text
targetSubsystemKey
```

而不是通过旧 `systemId` 重新建立第二套 Subsystem identity。

调用成功与最终业务结果继续保持两个阶段：

```text
frame.call success
    child call established

later frame.resume(... outcome ...)
    caller receives business result
```

精确事务顺序在 Batch C 冻结。

## 21. Draft Failure Direction

当前计划：

- `frame.initialize` MAY 有 recoverable business rejection；
- 已进入合法 Frame lifecycle 后的 activate / suspend / resume / close 状态不同步倾向视为 control divergence；
- state-changing Frame RPC 不做 application-level retry；
- ambiguous timeout 倾向进入 Runtime failure path；
- Runtime failure 使用 deterministic call-stack unwind。

这些语义在 Batch D/E 前仍是 Draft。

## 22. Runtime Failure

Runtime Container terminal failure 会使其承载的 Frame/Input Context 失去权威处理方。

Batch A 已冻结：

```text
这些 Frame 的 valid Activation 必须失效
Frame outcome 与 lifecycle state 分离
Frame cleanup 不能通过 Render Store 删除完成
```

多 Frame Runtime failure 的具体 stack suffix unwind 算法在 Batch E 冻结。

## 23. Renderer Recovery

Renderer reload 不关闭 Main、Runtime Container 或 Frame Context。

恢复仍按独立域处理：

```text
Main Control
    restore Stack / lifecycle / current Activation / Input Target

System Data / User Input
    restore authorized Data Connection and input routing

Render Update
    independently restore Subsystem-owned Render State
```

不得从 Frame 集合推导全部 Render 或 Data Connection 生命周期。

## 24. Remaining Freeze Checklist

### Batch B

- 7 个 RPC 的最终 JSON Schema；
- ID / business JSON value wire types；
- method direction / request-result form；
- operation pre/postcondition。

### Batch C

- initial Frame transaction；
- child call establishment；
- return / resume transaction；
- Activation commit barrier；
- Main ⇄ Renderer Input Target publish causal rule；
- rollback boundaries。

### Batch D

- semantic error codes；
- initialize business rejection；
- control divergence classification；
- timeout；
- no-retry；
- cancellation scope。

### Batch E

- Runtime failure multi-Frame suffix-unwind；
- initial Frame failure；
- best-effort close semantics；
- surviving caller resume semantics。

### Batch F

- wire limits；
- conformance fixtures；
- Desktop / PWA transport-independent fixture；
- Frame / Call protocol profile/version completion；
- full protocol status transition to Active / Normative / Frozen。

## 25. Related Documents

- [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)；
- [栈式运行系统](../10-architecture/stack-runtime-system.md)；
- [模块子系统模型](../10-architecture/subsystem-model.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)。
