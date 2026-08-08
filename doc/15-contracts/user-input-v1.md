# Renderer → Subsystem User Input Protocol v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> 协议版本：1  
> 协议标识：`loomrealm.user-input / 1`  
> 稳定程度：Evolving  
> 方向：Renderer → Subsystem  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> Authority：[Main ⇄ Renderer Control Protocol v1](./main-renderer-control-v1.md)、[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 最近复核：2026-08-08

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **User Input 是 Main 当前 InputTarget 授权的 Activation 内、Renderer → Subsystem 单向传递的临时输入流；它不是事务、不是广播、不能跨 Activation 或 Connection recovery 重放。**

当前 Draft 先冻结 Core authority / ordering / recovery / backpressure 语义。键盘、Pointer、Touch、Gamepad 等设备如何 normalized 为具体业务 payload，将由后续 Input Mapping/Profile 收敛，不在本文提前绑定浏览器 DOM Event schema。

---

## 1. 协议位置

```text
Main
 │
 │ Renderer Control
 │ current InputTarget
 ▼
Renderer
 │
 │ current Data Connection
 │ User Input v1
 ▼
Subsystem Runtime
```

User Input v1 strictly：

```text
Renderer → Subsystem
```

不定义反向 Input ACK / Result / Response。

## 2. Renderer Send Gate

Renderer 只有同时满足以下条件时 MAY 发送 ordinary User Input：

```text
Data Connection lifecycle == current
Main current InputTarget != null
InputTarget.subsystemKey == current Data Connection subsystemKey
mirrored Frame exists
mirrored Frame lifecycle == active
mirrored Frame activationId == InputTarget.activationId
```

任一条件不成立：

```text
MUST NOT send ordinary User Input
```

Renderer不得根据 Render focus、DOM focus、Data carrier存在或 cached Activation自行生成 InputTarget。

## 3. Subsystem Receive Gate

Subsystem 只有在本地 Frame/Input Context确认：

```text
frameId exists
Frame is locally active
message activationId == current Activation
```

时才 MAY 将消息交给业务输入处理。

否则 MUST 丢弃该 ordinary input；MAY 记录受限 diagnostics，但不得因此改变 Main Frame authority。

因此 User Input 有双重 gate：

```text
Main → Renderer
    decides where ordinary input may be sent

Main → Subsystem via Frame Control
    establishes which Activation may accept it
```

Renderer不是最终 Frame authority。

## 4. Wire Identity

每条 User Input application message 的 authority identity 只需要：

```text
frameId
activationId
```

不重复携带：

```text
sessionId
subsystemKey
generation
connectionProfile
```

这些已经由 current Data Connection identity绑定。

Core envelope 概念：

```ts
interface UserInputAuthorityV1 {
  readonly frameId: string;
  readonly activationId: string;
}
```

v1 不新增：

```text
inputEpoch
inputSessionId
connectionId
operationId
```

`activationId` 已经是 ordinary-input authority epoch。

## 5. No Broadcast

ordinary User Input 不是 Subsystem broadcast。

一条输入只属于：

```text
one current Data Connection
one Frame
one Activation
```

Renderer只向 Main current InputTarget 指向的 Subsystem发送。

Subsystem内部如何把输入分发给自己的业务对象，不属于 wire protocol。

## 6. Delivery Model

User Input v1：

```text
no ACK
no application Response
no application retry
no reconnect replay
```

Data Connection 在发送附近丢失时：

```text
input may have arrived
or may not have arrived
```

这种 uncertainty 是允许的普通输入语义。

它 MUST NOT 被提升为：

```text
Runtime failure
Frame control divergence
Frame unwind
```

User Input 不是事务协议。

## 7. Input Classes

Core v1 采用三个语义类别：

```text
discrete
continuous
reset
```

具体设备 payload 不由本节冻结。

### 7.1 Discrete

Discrete 表示不可通过“只保留最新状态”安全替代的离散动作，例如概念上的：

```text
press/release edge
click/tap
confirm/cancel action
wheel step
```

要求：

```text
ordered
MUST NOT coalesce with another discrete message
MUST NOT replay after reconnect
```

### 7.2 Continuous

Continuous 表示当前连续意图/状态，而不是必须完整保留的增量历史，例如概念上的：

```text
movement axes
pointer position
analog value
held-intent state
```

要求：

```text
latest-state semantics
MAY coalesce before transmission
older unsent state MAY be replaced by newer state
MUST NOT replay across Activation
```

Continuous payload SHOULD 是自包含 current state，而不是只能依赖先前消息解释的 delta。

### 7.3 Reset

Reset 表示：

```text
clear all ordinary continuous input intent
for this frameId + activationId
```

典型本地来源：

```text
window/page blur
input capture lost
explicit local input reset
```

Reset 是当前 Activation 内的 ordering barrier：Subsystem应用 Reset 后不得继续保留它之前的 continuous intent。

## 8. Implicit Reset Boundaries

以下事件 MUST 等价于清空相关 ordinary continuous input state：

```text
Activation revoked/replaced
Frame leaves active
Data Connection current → retired
Renderer Control authority lost/replaced
Session ends
```

因此即使显式 Reset 因连接已经丢失而无法送达，也不能导致旧 continuous intent 跨 authority boundary继续生效。

## 9. Activation Boundary

Activation 是不可跨越的 User Input epoch。

例如：

```text
Frame F / Activation A1
    continuous movement

call acceptance
    A1 revoked

later
Frame F / Activation A2
```

A1 的 discrete / continuous / reset 都不能重新解释为 A2 输入。

Renderer MUST NOT 自动 replay A1 输入。

Subsystem MUST reject stale A1 after Activation replacement。

## 10. Connection Re-establishment

如果 Data Connection 丢失，但：

```text
same DataAuthority generation remains current
same Frame/Activation remains current
```

fresh Data Connection建立后：

```text
Discrete input during outage
    lost / not replayed

Continuous input
    Renderer SHOULD send a fresh current-state message if intent still exists

old remote continuous state
    MUST NOT be assumed preserved across retired connection
```

因此 User Input v1 不需要 reconnect replay cursor。

## 11. Ordering

User Input v1 依赖 Data Connection Contract要求的 Renderer → Subsystem per-direction ordered carrier。

Core v1 暂不增加独立 `inputSequence`。

例如发送：

```text
Discrete A
Continuous B
Reset
Continuous C
```

合法 carrier 必须保持该 application-message order。

如果未来支持 unordered carrier，需要新的 Data/Profile 语义，不能静默改变 v1。

## 12. Backpressure Principle

不同类别使用不同队列策略：

```text
Discrete
    preserve order
    do not coalesce

Continuous
    latest state wins
    MAY coalesce before transmission

Reset
    preserve ordering barrier semantics
```

实现不得为降低压力而：

```text
merge/reorder discrete actions
convert discrete into continuous
move continuous state across Reset barrier
```

Discrete queue MUST 有 hard bound，不能无界增长。

具体 queue/message limits 与 overflow behavior 在 User Input v1 Completion/Profile 阶段冻结；在冻结前实现不得声称完整 v1 conformance。

## 13. InputTarget Replacement

Main MAY 在 Renderer Control publication 中 coalesce 中间 `InputTarget=null` revision。

Renderer观察到：

```text
old InputTarget != new InputTarget
```

时，MUST 将 replacement 本身视为旧 Activation continuous intent 的 implicit reset/revocation boundary。

因此无需强制 Main 发布每一个 null gap 才能安全停止旧 continuous input。

## 14. No Frame Commands

User Input payload MUST NOT直接表达或代替：

```text
frame.call
frame.return
frame.close
frame.cancel
frame.resume
Frame Stack mutation
InputTarget mutation
```

例如 UI “取消”只是普通输入；Subsystem业务逻辑可以在处理后自行选择 `frame.return({type:"cancelled"})`。

Renderer不能替 Subsystem提交 Frame outcome。

## 15. Failure Boundary

以下输入层问题本身不产生 Runtime failure：

```text
stale Activation input received
input dropped due to no current connection
input lost during connection failure
continuous state coalesced
local input reset
```

Protocol-level malformed/oversize message如何处理，以及是否需要关闭 Data Connection，将在 User Input wire/limits completion 阶段冻结。

不得通过 User Input error处理重新定义 Frame / Runtime failure authority。

## 16. Device Mapping Boundary

Core v1 不直接复制浏览器/OS原生事件对象，例如：

```text
KeyboardEvent
PointerEvent
TouchEvent
Gamepad object
DOM Event
Host object
```

后续 Input Mapping/Profile 应定义跨 Desktop/PWA 可验证的 normalized plain-data schema。

该 Profile必须保持本文已经冻结的：

```text
frameId + activationId authority
discrete / continuous / reset semantics
no replay across Activation
no broadcast
```

## 17. Minimum Core Conformance Scenarios

至少覆盖：

```text
current-target-send
null-target-no-send
wrong-subsystem-no-send
non-current-connection-no-send

stale-activation-rejected
activation-replacement-stops-old-input
inputtarget-replacement-implicit-reset

discrete-order-preserved
discrete-not-coalesced
continuous-latest-state-coalescing
reset-clears-continuous-intent

connection-retire-clears-continuous-intent
same-generation-reconnect-no-discrete-replay
same-generation-reconnect-fresh-continuous-state

input-loss-does-not-fail-runtime
input-loss-does-not-unwind-frame
ui-cancel-does-not-directly-mutate-frame
```

## 18. Explicit Non-Goals Core Draft

当前 Core Draft 不冻结：

```text
Keyboard/Pointer/Touch/Gamepad具体normalized payload
DOM key/code mapping
gesture recognition
text input / IME model
accessibility action mapping
message encoding
message size limits
queue numeric limits
discrete overflow final policy
compression
binary representation
input acknowledgement
input replay cursor
```

这些必须在继续设计时显式收敛，不能由实现私有约定冒充 v1 compatibility。

## 19. Core Invariants

1. User Input strictly Renderer → Subsystem；
2. 只有 current Data Connection 才能承载 ordinary input；
3. Renderer只向 Main current InputTarget发送；
4. wire authority identity = frameId + activationId；
5. Subsystem必须重新验证 current Activation；
6. stale Activation永远不成为当前输入；
7. User Input无ACK、不是事务；
8. Data/input loss不导致 Runtime failure或 Frame unwind；
9. discrete有序且不可coalesce；
10. continuous采用 latest-state semantics并允许coalesce；
11. reset清空当前 Activation continuous intent；
12. Activation变化 / Connection retired / Control loss均形成 implicit reset boundary；
13. reconnect不重放 discrete；
14. reconnect后的 continuous 使用 fresh current state重新建立；
15. ordinary User Input不是 broadcast，也不是 Frame command。

## 20. Summary

```text
raw local input
→ normalize by future Input Mapping/Profile
→ read current Main InputTarget
→ require current matching Data Connection
→ attach frameId + activationId
→ classify discrete / continuous / reset
→ send Renderer → Subsystem

Subsystem
→ require matching current Frame Activation
→ accept or drop
```

最终原则：

> **Connection 决定“这根管道是否当前有效”，InputTarget 决定“输入应该去哪”，Activation 决定“这条输入现在是否仍有资格被接受”。**
