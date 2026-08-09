# Renderer ⇄ Subsystem User Input Protocol v1

> 层级：正式契约  
> 状态：Active Design / Core Closure Candidate  
> 协议版本：1  
> 协议标识：`loomrealm.user-input / 1`  
> 稳定程度：Stabilizing  
> 配置方向：Subsystem → Renderer（Input Interest）  
> 输入方向：Renderer → Subsystem（State / Event / Reset）  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> Authority：[Main ⇄ Renderer Control Protocol v1](./main-renderer-control-v1.md)、[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 最近复核：2026-08-09

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Main 决定 ordinary input authority；Subsystem 只声明 Input Interest；Renderer Core 是 Main `InputTarget` 的 sender-side trusted enforcement point。只有 `Main authority ∩ Interest ∩ Producer availability` 的 Effective Channel 才产生普通输入流。**

标准设备的 canonical wire payload 属于 **User Input v1 本身**，不再建立独立 Standard Input Mapping Profile。浏览器/OS/设备事件如何转换成 canonical payload 属于 Renderer implementation。

---

## 1. Direction / Surface

```text
Subsystem → Renderer
    Input Interest

Renderer → Subsystem
    Input State
    Input Event
    Input Reset
```

不定义 Input ACK / Result / transactional Response。

User Input v1 不创建 Frame、Activation 或 InputTarget，也不代替 Frame / Call RPC。

---

## 2. Trust / Authority

```text
Main
    owns InputTarget / Activation authority

Renderer Core
    trusted sender-side InputTarget enforcement point

Subsystem
    validates local Frame/Activation freshness
    + local Input Interest
```

Subsystem 不能仅凭 User Input wire 独立证明 Main 当前 `InputTarget != null`。Subsystem 必须重新确认：

```text
frameId exists
Frame locally active
activationId current
channel locally interested
```

Input Interest 不是 authority/permission grant。

如果未来要求不信任 Renderer Core，应设计独立 signed/capability authority；不得给 v1 偷加 token。

---

## 3. Wire Authority Identity

Renderer → Subsystem 的 State/Event/Reset 只携：

```ts
interface UserInputAuthorityV1 {
  readonly frameId: string;
  readonly activationId: string;
}
```

不重复：

```text
sessionId
subsystemKey
generation
connectionProfile
```

这些已由 current Data Connection 绑定。

v1 不增加 `inputEpoch/inputSessionId/inputLeaseId/connectionId/operationId/inputSequence`；`activationId` 已是 authority epoch。

---

## 4. Input Channel

Input Channel 是可独立声明 Interest、独立产生 State/Event 的输入流。

标准 v1 Channel names：

```text
keyboard.state
keyboard.event
pointer.state
pointer.event
gamepad.state
gamepad.event
```

名称 exact-match；不支持 wildcard/prefix subscription。

标准前缀由 LoomRealm 保留。

自定义 Channel：

```text
x.<custom-name>.state
x.<custom-name>.event
```

例如：

```text
x.inventory.drag.state
x.inventory.drop.event
x.dialog.choice.event
```

Data Connection 已绑定 Subsystem，因此 custom name 不重复 `subsystemKey`。

User Input Core 不解释 `x.*` payload 业务含义，只要求 plain-data、通用 limits 与 `.state/.event` 语义。

---

## 5. Standard Channel Payload Boundary

标准 Channel 的 **canonical wire payload schema** 必须在 User Input v1 Frozen 前直接写入本协议并进入同一 conformance corpus：

```text
keyboard.state / keyboard.event
pointer.state / pointer.event
gamepad.state / gamepad.event
```

不建立单独 Mapping/Profile 版本空间。

协议只标准化双方必须共同理解的 canonical wire facts；以下属于 Renderer implementation，不进入协议：

```text
DOM KeyboardEvent/PointerEvent/Gamepad object 读取方式
OS/native event adapter
浏览器兼容补丁
设备 polling cadence
平台 API 差异
内部 key lookup table
内部 coordinate transform pipeline
```

如果某个 coordinate/key/button identifier 的**含义会影响 Subsystem 对 wire payload 的解释**，该含义必须和 payload schema 一起在 User Input v1 中冻结；不能只写成实现约定。

Text/IME、gesture、accessibility action 若未来需要，可定义新的 Channel；不要求另建 Profile。

---

## 6. Input Interest

```ts
interface InputInterestV1 {
  readonly channels: readonly string[];
}
```

语义：

```text
full replacement
exact match
Runtime/Data-Connection scoped
not Frame-scoped
not Activation-scoped
not authority
```

fresh Data Connection：

```text
Interest = empty
```

Subsystem 建立连接后发布当前完整 Interest；不跨 retired connection 自动继承。

多个尚未发送的完整 Interest MAY latest-state coalesce。

不存在：

```text
subscribe/unsubscribe
add/remove patch
wildcard
interest revision
ACK
```

### Interest shrink

Subsystem MUST 先更新本地 current Interest 再 publication，因此迟到的已移除 Channel message：

```text
channel ∉ local current Interest
→ drop
```

移除 `.state` Channel 时 Subsystem MUST 清空该 Channel retained state。

### Interest expand

Renderer 观察到新 Interest 后：

```text
.event → future events only
.state → if becomes Effective, establish fresh current snapshot
```

---

## 7. Effective Channel

对 Channel `C`：

```text
Effective(C)
=
Data Connection current
AND Main InputTarget != null
AND InputTarget.subsystemKey == current Data Connection subsystemKey
AND mirrored Frame exists
AND Frame active
AND mirrored Frame activationId == InputTarget.activationId
AND C ∈ current Interest
AND Producer(C) available
```

即：

```text
ordinary send set
=
Main authority
∩ Subsystem Interest
∩ Producer availability
```

Interest/Producer 只能缩小输入面，不能创造 Main authority。

---

## 8. Effective Transitions

### `.state`: false → true

任意原因导致 State Channel重新 Effective：

```text
Renderer MUST promptly establish one fresh self-contained current State snapshot
```

典型原因：Interest新增、InputTarget切入、fresh Activation、fresh Data Connection、Producer恢复。

### `.event`: false → true

只允许 Effective 之后发生的未来 Event；MUST NOT replay history。

### true → false

Renderer MUST 立即停止该 Channel 的新 ordinary State/Event。

如果原因形成 implicit reset boundary，按对应 boundary 收敛；如果只是 Producer loss，按 Producer Loss Teardown；如果只是 Interest移除，本地 Interest gate 已闭环。

---

## 9. Renderer Send Gate / Subsystem Receive Gate

Renderer 只有 `Effective(channel)==true` 时 MAY 发送 ordinary State/Event。

不得根据：

```text
DOM focus
Render focus
carrier physical existence
component existence
cached Activation
Interest alone
```

自行创建/扩大 InputTarget。

Subsystem 收到 State/Event 必须重新确认：

```text
frameId exists
Frame locally active
activationId == current Activation
channel ∈ local current Interest
```

否则 drop；不得把“收到合法格式 input”解释成 Main authority grant。

---

## 10. State

所有 `.state` Channel 使用 current-state snapshot 语义：

```text
self-contained
latest wins
MAY coalesce
MUST NOT require earlier State to interpret
MUST NOT replay across Activation/retired connection
```

持续事实不能只依赖 Event 表达；例如 held control/current pointer state/current gamepad axes 应有 State 表达。

---

## 11. Event

所有 `.event` Channel：

```text
ordered
transient
MUST NOT coalesce
MUST NOT replay
MAY be lost
MUST NOT establish persistent protocol state requiring a future Event to clear
```

Event loss 本身不是 Runtime failure/Frame unwind。

---

## 12. Reset

Reset 是 teardown primitive，不是普通 Channel：

```text
Reset(frameId, activationId)
```

含义：清空该 Frame + Activation 下所有 User Input `.state` current state。

```text
does not modify Interest
does not undo/replay Event
is a global State ordering/coalescing barrier
```

Subsystem 只在 `frameId+activationId` 仍对应本地 current Activation 时应用；stale Reset 可 drop。

---

## 13. Producer Loss Teardown

当前 Interested + Effective 的 `.state` Producer 在 ordinary authority仍有效时变 unavailable：

```text
stop that Channel immediately
best-effort Reset(current frameId, activationId)
promptly fresh-snapshot every remaining Effective .state Channel
```

不增加 `channel.reset/producer.closed/channel.invalid`。

Producer 恢复且 Channel再次 Effective → fresh State baseline。

Event Producer loss 没有 persistent teardown obligation。

---

## 14. InputTarget Revocation / One-Shot Lease

Renderer 观察到旧 InputTarget被移除/替换：

```text
old ordinary State/Event authority ends immediately
```

旧 target 对应 Data Connection仍 current 时，Renderer MUST best-effort 向 immediately previous `frameId+activationId` 发送 Reset，然后停止旧 ordinary input。

一个已发布：

```text
InputTarget(frameId, activationId)
```

一旦 revoked/removed/replaced，同一 `frameId+activationId` MUST NOT 后来再次成为 InputTarget。

未来 ordinary input grant 使用 fresh authority epoch，通常是 fresh `activationId`。v1 不增加 `inputEpoch`。

---

## 15. Implicit Reset Boundaries

以下事件本身等价于清空相关 User Input State：

```text
Activation revoked/replaced
Frame leaves active
Data Connection current → retired
Renderer Control lost/replaced
Session ends
```

因此显式 Reset 丢失也不会永久保留旧 held state。

Activation 是不可跨越的 input authority epoch；旧 Activation 的 State/Event/Reset 都不能重新解释为 fresh Activation input。

---

## 16. Connection Re-establishment

相同 DataAuthority generation仍 current、但 carrier丢失：

```text
fresh connection starts Interest=empty
Subsystem republishes full Interest
Events during outage lost / no replay
Effective State Channels establish fresh snapshots
old remote State not assumed preserved
```

不需要 replay cursor/input revision/connection resume token。

---

## 17. Ordering / Coalescing

依赖 Data Connection per-direction ordered carrier；v1 不增加 `inputSequence`。

State MAY coalesce，但不得跨 Event/Reset barrier。

例如：

```text
State A1
State A2
Event E
State A3
State A4
Reset
State A5
```

MAY 收敛为：

```text
State A2
Event E
State A4
Reset
State A5
```

---

## 18. Backpressure

所有队列 MUST bounded：

```text
State    latest pending snapshot per Effective Channel
Event    bounded ordered queue
Reset    teardown/ordering barrier priority
Interest latest full replacement
```

协议不冻结具体 Event queue capacity，也不冻结 drop-oldest/drop-newest；这些是 implementation policy。

必须保持：

```text
no unbounded queue
surviving Events preserve relative order
dropped Events never replay
Event overflow != Runtime failure / Frame unwind
```

---

## 19. Failure / Frame Boundary

以下不产生 Runtime failure或 Frame unwind：

```text
stale Activation input
not-interested input
dropped input due to no connection
Event loss
State coalescing
Interest propagation gap
Producer availability change
Reset teardown
Event overflow
```

User Input 不能表达/代替：

```text
frame.call
frame.return
frame.close
frame.resume
Frame Stack mutation
InputTarget mutation
```

UI cancel 只是 Event；是否 `frame.return({type:"cancelled"})` 由 Subsystem业务逻辑决定。

---

## 20. Wire / Limit Closure

User Input v1 Frozen 前还必须直接在本协议关闭：

```text
six standard Channel canonical payload schemas
payload identifier semantics required for interop
message encoding / closed-schema details
message size/depth limits
Channel/count limits
standard payload numeric ranges
```

不需要协议化：

```text
DOM/OS event adapter implementation
polling cadence
internal producer registry implementation
concrete Event FIFO capacity/drop preference
compression/binary representation unless later proven necessary
```

v1 明确不计划增加：

```text
input acknowledgement
input replay cursor
wildcard Interest
per-channel reset wire
untrusted-Renderer signed input capability
```

---

## 21. Minimum Core Conformance

```text
current-target-interested-channel-send
null-target-no-send
not-interested-channel-no-send
wrong-subsystem-no-send
non-current-connection-no-send
renderer-is-inputtarget-enforcement-point

interest-default-empty
interest-full-replacement
interest-exact-match-no-wildcard
interest-removal-drops-late-message
interest-removal-clears-removed-state
interest-update-no-ack-required

state-effective-false-to-true-fresh-baseline
event-effective-false-to-true-no-history-replay
state-latest-coalescing
state-self-contained
event-order-preserved
event-not-coalesced
event-reset-are-coalescing-barriers

custom-x-channel-accepted
reserved-channel-collision-rejected
producer-loss-reset-and-rebaseline
producer-return-fresh-state

stale-activation-rejected
inputtarget-revocation-best-effort-reset
inputtarget-one-shot-no-same-activation-regrant
activation-replacement-implicit-reset
connection-retire-implicit-reset
reset-clears-all-input-state

same-generation-reconnect-interest-empty
same-generation-reconnect-no-event-replay
same-generation-reconnect-fresh-state

input-loss-does-not-fail-runtime
input-loss-does-not-unwind-frame
ui-cancel-does-not-directly-mutate-frame
```

标准 payload schema 加入本协议后，对应 exactly-at/over-limit 与 canonical decoding fixtures 直接加入同一 User Input v1 corpus。

---

## 22. Core Invariants

1. Main InputTarget/Activation 是 ordinary input authority；
2. Renderer Core 是 sender-side trusted enforcement point；
3. Subsystem重新验证 local Activation + Interest；
4. Interest只能缩小输入面，fresh connection默认 empty；
5. Channel exact-match，无 wildcard；
6. Effective = Main authority ∩ Interest ∩ Producer availability；
7. `.state` 每次 false→true建立 fresh self-contained baseline；
8. `.event` future-only、ordered、no coalesce/replay；
9. Reset是全部 State teardown barrier；
10. Producer loss、InputTarget revoke、Activation/Connection/Control loss都有明确 State收敛；
11. 同一 InputTarget lease revoke后不 regrant；
12. reconnect从 empty Interest + fresh State恢复；
13. Event queue bounded，但具体容量/drop preference不是协议；
14. standard canonical payload属于 User Input v1，不建立额外 Mapping Profile；
15. platform/DOM/device → canonical payload 的转换属于 Renderer implementation；
16. input loss/overflow不等于 Runtime failure或 Frame unwind。
