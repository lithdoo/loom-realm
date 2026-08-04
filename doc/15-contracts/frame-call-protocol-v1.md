# Main ⇄ Subsystem Frame / Call Protocol v1

> 层级：正式契约  
> 状态：Draft；Batch A / B 已 Normative / Frozen  
> 协议版本：1（目标版本）  
> 稳定程度：Batch A / B Frozen；Batch C+ Evolving  
> 主要定义：已 ready Runtime Container 中 Frame/Input Context 的身份、生命周期、Activation 与 Frame / Call RPC wire surface  
> 依赖：[栈式运行系统](../10-architecture/stack-runtime-system.md)、[模块子系统模型](../10-architecture/subsystem-model.md)、[Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)  
> 决策记录：[ADR 0010：冻结 Frame / Call Protocol v1 Batch A](../decisions/0010-freeze-frame-call-protocol-v1-batch-a.md)、[ADR 0011：冻结 Frame / Call Protocol v1 Batch B](../decisions/0011-freeze-frame-call-protocol-v1-batch-b.md)  
> 最近复核：2026-08-04

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

本文采用分批冻结：

```text
Batch A  Identity / Authority / Lifecycle / Activation       ← Frozen
Batch B  RPC Wire Schema / Direction / Local Semantics        ← Frozen
Batch C  Call / Return transaction / commit barrier           ← Draft
Batch D  Error / timeout / retry / cancellation               ← Draft
Batch E  Runtime failure unwind                                ← Draft
Batch F  Limits / fixtures / profile/version completion       ← Draft
```

**只有明确标记为 Batch A / B 的语义已经成为 v1 不可由后续批次静默改变的 Normative 基线。**

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

Batch A 不冻结 wire field；最终 RPC Schema 由 Part II / Batch B 冻结。

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

Runtime 已进入 `stopping / stopped / failed` 时 MUST NOT 建立新的 Frame。

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

Subsystem MUST NOT 自行创建公共 `frameId`、修改 Stack / Caller / Frame→Subsystem assignment、签发 `activationId`、恢复 suspended Frame 或改变公共 Input Target。

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

Frame 进入 `closed` 后，即使再次对同一 Subsystem 使用相同调用参数，也 MUST 分配新的 `frameId`。

PID、Worker identity、Control Connection ID、System Data Connection ID、Render identity MUST NOT 代替 `frameId`。

### 4.2 Frame → Subsystem Assignment

每个 Frame 创建时永久绑定一个已声明 `descriptor.key`：

```text
frameId
→ exactly one descriptor.key
```

该映射由 Main 创建并拥有，Frame 生命周期内 MUST NOT migrate 到另一个 Subsystem。

Main → Subsystem 的 Frame control operation 运行在已经通过 `subsystem.hello` 绑定到目标 `descriptor.key` 的 Control Connection 上，因此 Frame RPC 不需要重复建立第二份 source Subsystem identity。

旧协议中的 `systemId` 只作为 Legacy 数据协议字段保留；Frame / Call v1 使用 `descriptor.key` / `subsystemKey` 概念，不得继续把旧 `systemId` 当作新的 Frame Protocol identity 来源。

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

`callerFrameId` MUST immutable。suspend、resume、Activation replacement、Renderer reload 或 Data Connection replacement 都不得改变它。

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

v1 MUST NOT 增加 `initialized / ready / failed / cancelled / completed` 作为 Frame lifecycle state。

### 6.1 `starting`

Main 已分配 Frame identity，并正在建立目标 Subsystem 中的 Frame/Input Context。

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
可以在协议允许时发起 ordinary call / return
```

正常稳定状态中至多一个 Frame 可以是 ordinary `active` / Input-eligible Frame。

协议事务切换过程中 MAY 短暂存在零个 active Frame，但 MUST NOT 向 Renderer 发布两个同时有效的 ordinary Input Target。

### 6.3 `suspended`

`suspended` Frame 仍然 live、仍在调用栈中，但 `currentActivationId = null`，不接收 ordinary User Input，也不能作为 ordinary call / return authority。

`suspended` MUST NOT 推导 business Tick paused、业务状态冻结、Render hide/freeze/destroy 或 System Data Connection close。

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

`closed` 是 terminal lifecycle state。进入后 Frame 不再 live，不得 activate / resume / suspend / return，`frameId` 不得复用。

Main MAY 保留只读 tombstone 用于诊断或调用历史，但 tombstone 不得重新成为有效 Frame。

## 7. Frozen Lifecycle State Machine

正常路径：

```text
starting
    │ first activation committed
    ▼
active
    │ child call established
    ▼
suspended
    │ child returns + new Activation
    ▼
active
    │ return / unwind / termination
    ▼
closing
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

Batch B 冻结操作与局部前置条件；Batch C/D 冻结事务级转换与非法转换的最终 error / failure handling。

## 8. No Frame `ready`

Frame / Call Protocol v1 明确：

```text
DOES NOT define Frame ready state
DOES NOT define frame.ready
DOES NOT define frame.status
```

Frame initialization 成功只表示目标 Subsystem 已建立对应 Frame/Input Context，可以继续接受 Main 的首次 Activation control operation。

它不表示 Frame 已 active、Input Target 已发布、Render ready、业务 world 独立 ready 或 System Data Connection ready。

Frame 首次获得 ordinary input eligibility 的平台边界只能来自首次 Activation 被成功提交。

## 9. Activation Identity

Activation 表示一个 Frame 的一次 ordinary User Input 有效周期。

`activationId` MUST：

```text
Main-generated
Session-scoped unique
opaque
immutable
never reused
```

它不是 Frame / Subsystem / Render identity、Render Revision、Runtime generation、Connection identity 或 security credential。

## 10. Current Activation Invariant

Main 对每个 Frame 最多维护：

```ts
currentActivationId: string | null
```

状态关系：

```text
starting    currentActivationId = null
active      currentActivationId = exactly one valid activationId
suspended   currentActivationId = null
closing     currentActivationId = null
closed      currentActivationId = null
```

只有 `active` Frame 才能拥有有效 current Activation。

## 11. Activation Creation

Main MUST 在 Frame first becomes active 和 Frame resumes after child call / unwind recovery 时创建全新的 `activationId`。

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

Frame 离开 `active` 时，其当前 Activation MUST 永久失效，包括 `active → suspended`、`active → closing`、Runtime failure handling 和 Session termination。

一旦 `(frameId, activationId)` 被 revoke，它在当前 Session 内 MUST 永久不能重新成为合法 ordinary input identity。

## 13. Ordinary Input Eligibility

普通 User Input 合法性至少要求：

```text
Frame exists
AND Frame lifecycle == active
AND provided activationId == currentActivationId
AND Frame is current Main-authorized Input Target
```

任何旧 Activation MUST 被 User Input Protocol / Subsystem Frame Input Router 拒绝。

Batch A 只冻结 identity/eligibility；具体 User Input wire error、Sequence 和 reset 由 User Input Protocol 冻结。

## 14. Stack Invariants

Frame / Call v1 使用 Main-owned 单一 LIFO Call Stack。

```text
Stack contains all currently live call Frames.
```

稳定状态：

```text
Stack[0]     initial Frame
Stack[top]   current active Frame
all non-top live Frames   suspended
```

因此 Stack 非空时稳定状态 exactly one active Frame；调用 / 恢复事务中 MAY 短暂无 active Frame，但 Main MUST NOT 发布两个 ordinary Input Target。

## 15. Frame Outcome Is Not Lifecycle State

v1 明确区分：

```text
Frame lifecycle
    starting / active / suspended / closing / closed

Frame outcome
    completed / cancelled / failed
```

Batch A 只冻结 outcome 的三种语义类别，不冻结其字段形状；最终 wire union 见 Batch B §22。

Frame outcome 描述“这次调用如何结束”；lifecycle 描述“Frame Context 当前是否仍存在”。因此 Runtime failure、业务 failure 或 cancellation 不得通过把 lifecycle 直接设置成 `failed / cancelled` 来跳过 `closing → closed` cleanup。

Main 实现 SHOULD 将生命周期与结果分开保存。

## 16. Runtime Relationship

Frame / Call Protocol 只运行于已经 ready 且没有 shutdown intent 的 Runtime Container。

Frame lifecycle MUST NOT 启动、关闭、重新启动 Runtime，替代 `subsystem.shutdown`，或改变 Runtime ready / stopping / stopped / failed 状态机。

Subsystem Control failure 可以触发 Frame unwind，但 Frame Protocol 不反向修改 Subsystem Control v1 的 Runtime lifecycle 含义。

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

Frame create / close MUST NOT implicitly create / close System Data Connection。

Subsystem MAY 在自身业务实现中显式把 Frame 与业务对象或 Render 关联，但该关系不进入公共 Frame lifecycle。

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

# Part II · Batch B — Normative / Frozen

## 19. Batch B Scope

Batch B 冻结完整 Frame / Call v1 方法集合、方向、JSON-RPC request/result 形状、FrameOutcome wire union，以及每个方法的局部前置/后置条件。

Batch B 不冻结跨多个 RPC 的事务顺序、rollback、timeout/retry、最终 semantic error registry、Runtime failure unwind 或 wire numeric limits。

## 20. Transport / Envelope Rules

Frame / Call v1 运行在已经通过 `subsystem.hello` 认证的 Main ⇄ Subsystem Control Connection 上，使用 JSON-RPC 2.0。

全部七个方法都是 JSON-RPC **Request**，不是 Notification：

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

v1 不定义：

```text
frame.ready
frame.status
frame.cancel
frame.result
frame.ping
frame.render.*
system.call
system.return
```

Method 名大小写敏感、精确匹配。所有 `params` MUST 使用 JSON Object，不使用 positional array。

## 21. Common `JsonValue`

业务输入、成功结果 value 和 failure data 只允许 JSON value：

```ts
type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
```

不得传输 `undefined`、NaN / Infinity、Function、BigInt、Buffer identity、File Handle、Socket、DOM object、Process Handle 或 arbitrary Host object。

精确消息大小与 nesting limits 由 Batch F 冻结。

## 22. `FrameOutcome` Wire Schema

```ts
type FrameOutcome =
  | {
      readonly type: "completed";
      readonly value: JsonValue;
    }
  | {
      readonly type: "cancelled";
    }
  | {
      readonly type: "failed";
      readonly error: FrameFailure;
    };

interface FrameFailure {
  readonly code: string;
  readonly message?: string;
  readonly data?: JsonValue;
}
```

`completed.value` REQUIRED；无业务返回值时必须显式使用 `null`。

`cancelled` v1 不携带额外业务 Payload。

`FrameOutcome.failed` 表示某个 Frame 调用最终以失败结果结束，**不是 JSON-RPC Error**。JSON-RPC Error 表示当前 RPC 本身不能合法完成。稳定平台 failure/error code registry 由 Batch D/E 冻结。

## 23. Closed Wire Objects

所有 Batch B RPC params、success result、`FrameOutcome` 与 `FrameFailure` 都是 closed schema，概念上 `additionalProperties = false`。

v1 不提供开放式 `metadata / context / extensions / runtimeInfo / clientInfo / extra` 字典。需要新增平台语义时必须增加明确字段并定义兼容性，或提升 Protocol/Profile version。

业务扩展数据只能进入 `input`、`FrameOutcome.value` 或 `FrameFailure.data`。

结构错误（缺字段、JSON 类型错误、unknown discriminant、extra forbidden field、invalid FrameOutcome shape）使用标准 JSON-RPC `-32602 Invalid params`。状态/权限等 semantic error 的 code 与 fatal/local 分类由 Batch D 冻结。

## 24. `frame.initialize`

```text
Direction: Main → Subsystem
Type:      Request
```

```ts
interface FrameInitializeParams {
  readonly frameId: string;
  readonly input: JsonValue;
}

interface FrameInitializeResult {}
```

Main 发送前必须已经分配 `frameId`、建立 Main-owned FrameRecord、使 lifecycle 为 `starting`，并永久绑定目标 `descriptor.key`。目标 Runtime 必须 `ready` 且没有 shutdown intent。

成功 Response 表示：Subsystem 已建立该 `frameId` 对应 Frame/Input Context，可以继续接受首次 `frame.activate`。

成功后 Main 的公共状态仍为：

```text
lifecycle = starting
currentActivationId = null
ordinary input eligibility = false
```

`frame.initialize` 不激活 Frame、不发布 Input Target、不创建/等待 Render、不建立 Data Connection、不创建 Runtime。

### 24.1 No `callerFrameId` on initialize wire

`frame.initialize` MUST NOT 携带 `callerFrameId`。

Caller relationship 是 Main-owned Stack state。目标 Subsystem 不需要复制第二份 Caller relationship 才能处理输入、发起 `frame.call` 或执行 `frame.return`；`frame.return` 后由 Main 根据自身 Registry 决定 Caller。

业务若确实需要调用来源信息，调用者必须显式编码到业务 `input`，不能把 Main-owned Caller relationship 偷渡成隐式业务 API。

## 25. `frame.activate`

```text
Direction: Main → Subsystem
Type:      Request
```

```ts
interface FrameActivateParams {
  readonly frameId: string;
  readonly activationId: string;
}

interface FrameActivateResult {}
```

`frame.activate` **只用于首次从 `starting` 进入 `active`**，不用于恢复 suspended Frame；恢复必须使用 `frame.resume`。

Main 发送时：

```text
Frame lifecycle == starting
Frame Context initialization succeeded
currentActivationId == null
activationId is newly generated by Main
```

成功 Response 表示 Subsystem 已为 `frameId` 安装该首次 Activation，并将其他 Activation 视为无效。

它本身不表示 Renderer 已经得到新的 Input Target。Main 何时 commit `active`、何时发布 Input Target 由 Batch C 冻结。

## 26. `frame.suspend`

```text
Direction: Main → Subsystem
Type:      Request
```

```ts
interface FrameSuspendParams {
  readonly frameId: string;
  readonly activationId: string;
}

interface FrameSuspendResult {}
```

Main 发送时：

```text
Frame lifecycle == active
currentActivationId == activationId
```

成功 Response 表示 Subsystem 已永久 revoke `(frameId, activationId)`，并停止把该 Frame 视为 ordinary-input eligible。该旧 Activation 后续不得重新合法。

`suspend` 不隐式改变 business Tick、业务状态、Render、System Data Connection 或共享 Runtime 资源。

## 27. `frame.resume`

```text
Direction: Main → Subsystem
Type:      Request
```

```ts
interface FrameResumeParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly returnedFrameId: string;
  readonly result: FrameOutcome;
}

interface FrameResumeResult {}
```

其中：

```text
activationId      = Main 新生成的 replacement Activation
returnedFrameId   = 已终止的直接 Child Frame
result            = Child 最终 FrameOutcome
```

Main 发送时：

```text
Frame lifecycle == suspended
currentActivationId == null
returnedFrameId is the direct Child according to Main Registry
activationId is new and never used
```

`frame.resume` 在 Subsystem 侧必须作为一个不可分割的控制操作，同时：

```text
1. deliver child result
2. install new activationId
```

不得暴露“Result 已交付但 Activation 尚未安装”或“Activation 已安装但 Result 尚未交付”的中间成功状态。

Main 的 Stack / Input Target commit 顺序由 Batch C 冻结。

## 28. `frame.close`

```text
Direction: Main → Subsystem
Type:      Request
```

```ts
interface FrameCloseParams {
  readonly frameId: string;
}

interface FrameCloseResult {}
```

Main 发送前已经决定该 Frame 进入或已经进入 `closing`，且 Frame 仍 live。

成功 Response 表示 Subsystem 已删除该 Frame/Input Context、拒绝该 `frameId` 的未来 ordinary input，并释放 Frame-owned control resources。

`frame.close` MUST NOT 因此自动 stop Runtime、删除共享 world state、destroy Render、close System Data Connection 或清空共享 Repository Cache。

Batch B 有意不加入 `reason / outcome / callerFrameId / activationId / subsystemKey`。`returned / call-aborted / unwind / session teardown` 属于 Main 的事务/failure policy，不改变“删除 Frame Context”这一基础 contract。

成功后 Main 何时最终 commit `closing → closed` 由 Batch C 冻结。

## 29. `frame.call`

```text
Direction: Subsystem → Main
Type:      Request
```

```ts
interface FrameCallParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly targetSubsystemKey: string;
  readonly input: JsonValue;
}

interface FrameCallResult {
  readonly childFrameId: string;
}
```

Main 必须验证：

```text
Request 来自 frameId 所属 Subsystem 的已认证 Control Connection
Frame exists
Frame lifecycle == active
Frame is current Stack Top
activationId == currentActivationId
Frame is current ordinary Input Target / call authority
targetSubsystemKey 已由 Game Entry 声明
target Runtime observedState == ready
target Runtime has no shutdown intent
```

`targetSubsystemKey` 可以等于 Caller 自己的 `subsystemKey`；same-Subsystem / recursive call 合法，但建立新的 `childFrameId` 并复用同一 Runtime Container。

成功 Result 中的 `childFrameId` 是 Main 分配的 Child identity。

Batch B 只冻结“成功的 `frame.call` 对应一个确定 childFrameId”；何时算 call establishment committed、何时发送 success Response、Caller suspend / Child activate / Stack push 的精确顺序和 partial failure rollback 由 Batch C 冻结。

`frame.call` 不是等待 Child 最终业务结果的 long-running RPC。

## 30. `frame.return`

```text
Direction: Subsystem → Main
Type:      Request
```

```ts
interface FrameReturnParams {
  readonly frameId: string;
  readonly activationId: string;
  readonly result: FrameOutcome;
}

interface FrameReturnResult {}
```

Main 必须验证 Request 来自 `frameId` 所属 Subsystem、Frame 存在且为当前 active Stack Top，并且 `activationId == currentActivationId`。

`frame.return` 表示当前 active Frame 请求以给定 `FrameOutcome` 结束自己的调用。它不是 `frame.close`、Runtime shutdown 或 Render destroy。

成功 Response 表示 Main 已接受该 `FrameOutcome` 作为这个 Frame 的 terminal outcome。接受后，同一 Frame 不得再次 ordinary return/call，也不得继续拥有 ordinary input eligibility。

何时进入 `closing`、何时 `frame.close`、何时 Stack pop、何时 resume Caller 与发布新 Input Target 由 Batch C 冻结。

### 30.1 No Caller on return wire

`frame.return` MUST NOT 携带 `callerFrameId` 或 target Subsystem identity。Receiver 由 Main-owned `frameId → callerFrameId` relationship 决定。

Subsystem 只能声明 outcome，不能选择“把结果 return 给哪个 Frame”。

## 31. Identity Field Matrix

| Method | `frameId` | `activationId` | Subsystem identity |
|---|---:|---:|---|
| `frame.initialize` | ✓ | — | source 来自 Connection |
| `frame.activate` | ✓ | ✓ new | source 来自 Connection |
| `frame.suspend` | ✓ | ✓ current | source 来自 Connection |
| `frame.resume` | ✓ | ✓ new | source 来自 Connection |
| `frame.close` | ✓ | — | source 来自 Connection |
| `frame.call` | ✓ | ✓ current | 仅 `targetSubsystemKey` |
| `frame.return` | ✓ | ✓ current | source 来自 Connection |

新协议不得加入 `sourceSubsystemKey / systemId / connectionId / pid / launchId` 来重复声明发送者 identity。

`callerFrameId` 仍是 Batch A 冻结的 Main-owned relationship，但 MUST NOT 成为 Main ⇄ Subsystem Frame RPC wire 的必需字段。它可以未来出现在 Main ⇄ Renderer Control Stack descriptor 或 diagnostics 中。

## 32. Result Delivery Model

v1 不定义：

```text
frame.result
call.result
frame.completed
frame.failed
```

Child 最终业务结果只通过：

```text
Child Subsystem
    frame.return(... result ...)
        ↓
Main
        ↓
Caller Subsystem
    frame.resume(... returnedFrameId, result, new activationId ...)
```

交付。

因此 `frame.call` 只负责建立调用，不挂起等待 Child 的整个业务生命周期。

恢复 suspended Frame 时也不得执行：

```text
frame.resume(result)
→ frame.activate(newActivation)
```

Batch B 冻结为一个 `frame.resume` RPC 同时交付 Child Outcome 和 replacement Activation。

## 33. Batch B Frozen Invariants

1. Frame / Call v1 wire surface 只有 7 个方法。
2. 所有 7 个方法都是 JSON-RPC Request。
3. Main→Subsystem：`initialize / activate / suspend / resume / close`。
4. Subsystem→Main：`call / return`。
5. 旧 `system.call / system.return` 不进入 v1。
6. 所有 Frame control request 都显式携带 `frameId`。
7. 只有依赖当前 input epoch 的操作携带 `activationId`。
8. `frame.activate.activationId` 是首次新 Activation。
9. `frame.resume.activationId` 是 replacement 新 Activation。
10. `frame.suspend / frame.call / frame.return.activationId` 必须指向当前 Activation。
11. `frame.initialize` 不携带 `callerFrameId`。
12. `frame.return` 不携带 `callerFrameId`；Receiver 由 Main 决定。
13. Main→Subsystem Frame RPC 不重复携带 source `subsystemKey`。
14. `frame.call` 只携带目标 `targetSubsystemKey`。
15. `frame.close` v1 不携带 close reason。
16. `frame.resume` 在一个 RPC 中同时交付 Child Outcome 与新 Activation。
17. Frame outcome wire union 固定为 `completed / cancelled / failed`。
18. `completed.value` 必填；无结果用 `null`。
19. `FrameOutcome.failed` 与 JSON-RPC Error 是不同概念。
20. v1 没有独立 `frame.result`。
21. `frame.call` 不作为等待最终业务结果的 long-running RPC。
22. Frame RPC 对象为 closed schema，不提供任意 metadata bag。
23. 结构性 Schema 错误使用 JSON-RPC `-32602`。
24. 语义错误 code / fatal policy 留给 Batch D。
25. Batch B 不改变 Batch A lifecycle / Activation 模型。

---

# Part III · Batch C+ — Draft / Non-Normative

以下内容只用于记录下一批设计方向，除非引用 Part I/II，不构成最终事务或错误 contract。

## 34. Batch C — Transaction / Commit Barrier

仍需冻结：

- initial Frame transaction；
- child call establishment；
- Caller suspend / Child initialize / Stack push / Child activate 的精确顺序；
- `frame.call` success Response commit point；
- return / close / resume transaction；
- Activation commit barrier；
- Main ⇄ Renderer Input Target publish happens-before rule；
- partial failure rollback boundaries。

## 35. Batch D — Error / Timeout / Retry / Cancellation

仍需冻结：

- semantic error codes；
- initialize business rejection；
- control divergence classification；
- request timeout；
- retry / idempotency；
- caller cancellation scope。

## 36. Batch E — Runtime Failure Unwind

仍需冻结：

- Runtime failure multi-Frame suffix-unwind；
- initial Frame failure；
- best-effort close semantics；
- surviving caller resume semantics。

Batch A 已冻结：受影响 Frame 的 current Activation 必须失效，outcome 与 lifecycle 分离，Frame cleanup 不能通过删除 Renderer Render Store 完成。

## 37. Renderer Recovery

Renderer reload 不关闭 Main、Runtime Container 或 Frame Context。

恢复按独立域处理：

```text
Main Control
    restore Stack / lifecycle / current Activation / Input Target

System Data / User Input
    restore authorized Data Connection and input routing

Render Update
    independently restore Subsystem-owned Render State
```

不得从 Frame 集合推导全部 Render 或 Data Connection 生命周期，也不得恢复本地缓存中的旧 Activation。

## 38. Batch F — Completion

最终冻结：

- wire numeric limits；
- conformance fixtures；
- Desktop / PWA transport-independent fixture；
- Frame / Call protocol profile/version completion；
- full protocol status transition to Active / Normative / Frozen。

## 39. Related Documents

- [Subsystem Control Protocol v1](./subsystem-control-lifecycle-protocol.md)；
- [栈式运行系统](../10-architecture/stack-runtime-system.md)；
- [模块子系统模型](../10-architecture/subsystem-model.md)；
- [通信系统](../10-architecture/communication-system.md)；
- [Renderer–Subsystem 协议分层](../10-architecture/renderer-subsystem-protocol-layers.md)。
