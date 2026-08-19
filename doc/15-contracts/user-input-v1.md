# Renderer ⇄ Subsystem User Input Protocol v1

> 层级：正式契约  
> 状态：Active Design / Core Closure Candidate  
> 协议版本：1  
> 协议标识：`loomrealm.user-input / 1`  
> 稳定程度：Stabilizing  
> 配置方向：Subsystem → Renderer（Frame Input Interest Registry）  
> 输入方向：Renderer → Subsystem（State / Event / Reset）  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> Authority：[Main ⇄ Renderer Control Protocol v1](./main-renderer-control-v1.md)、[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 最近复核：2026-08-19

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Main 决定哪个 Frame + Activation 当前拥有 ordinary input authority；Subsystem 声明每个 Frame 想接收哪些 Input Channel；Renderer Core 只计算 Main Authority × Frame Interest × Producer Availability 的交集。**

Frame Interest 是配置，不是 authority。它以 Frame 为语义作用域，以 current Data Connection 为 publication / recovery 作用域；Frame suspend / fresh Activation 不自动删除 Interest，Data Connection replacement 会清空全部 Interest publication state。

标准设备的 canonical wire payload 属于 User Input v1 本身；浏览器 / OS / 设备事件如何转换成 canonical payload 属于 Renderer implementation。

---

## 1. Direction / Surface

```text
Subsystem → Renderer
    Frame Input Interest Registry Snapshot

Renderer → Subsystem
    Input State
    Input Event
    Input Reset
```

User Input v1 不定义：

```text
Input ACK / Result
transactional Response
Frame RPC
InputTarget mutation
per-Frame Data Connection
subscription handshake
```

User Input v1 不创建 Frame、Activation 或 InputTarget，也不代替 Frame / Call v1。

## 2. Trust / Authority

```text
Main
    owns Frame / Activation / InputTarget authority

Subsystem
    owns Frame-scoped Input Interest configuration

Renderer Core
    trusted sender-side enforcement point
    for Main InputTarget × Interest × Producer
```

Interest 只能缩小普通输入面，不能创造或扩大 authority。

Subsystem 收到普通 State/Event 后仍 MUST 重新确认：

```text
current Data Connection
frameId exists locally
Frame locally active
activationId == local current Activation
channel ∈ local Interest[frameId]
local enclosing Frame gate allows ordinary input
```

否则 MUST drop。

User Input wire 本身不提供 Main-signed InputTarget proof。若未来要求不信任 Renderer Core，应另行设计 signed/capability authority；不得给 v1 偷加 token。

## 3. Authority Identity

Renderer → Subsystem 的 State/Event/Reset authority identity 只需要：

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

这些由 current Data Connection 绑定。

`activationId` 已是 input authority epoch；v1 不增加：

```text
inputEpoch
inputSessionId
inputLeaseId
connectionId
operationId
inputSequence
```

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

名称 exact-match；不支持 wildcard / prefix subscription。

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
x.map.interact.event
```

Data Connection 已绑定 Subsystem，因此 custom name 不重复 `subsystemKey`。

User Input Core 不解释 `x.*` payload 的业务含义，只要求 plain-data、通用 limits 与 `.state/.event` 语义。

## 5. Standard Channel Payload Boundary

标准 Channel 的 canonical wire payload schema MUST 在 User Input v1 Frozen 前直接写入本协议并进入同一 conformance corpus：

```text
keyboard.state / keyboard.event
pointer.state / pointer.event
gamepad.state / gamepad.event
```

不建立独立 Standard Input Mapping Profile。

以下属于 Renderer implementation，不进入协议：

```text
DOM KeyboardEvent / PointerEvent / Gamepad object 读取方式
OS/native event adapter
浏览器兼容补丁
设备 polling cadence
平台 API 差异
内部 key lookup table
内部 coordinate transform pipeline
```

如果某个 coordinate / key / button identifier 的含义会影响 Subsystem 对 wire payload 的解释，该含义 MUST 与 payload schema 一起冻结。

## 6. Frame Input Interest Registry

Interest 的语义作用域是 Frame，不是 Runtime，也不是 Activation。

概念结构：

```ts
interface FrameInputInterestV1 {
  readonly frameId: string;
  readonly channels: readonly string[];
}

interface InputInterestV1 {
  readonly type: "input.interest";
  readonly frames: readonly FrameInputInterestV1[];
}
```

`InputInterestV1` 是 current Data Connection 上的 **full registry snapshot**：

```text
InterestRegistry
= Map<frameId, Set<channel>>
```

收到一条合法 `input.interest` 后，Renderer MUST 原子替换整份旧 Registry。

### 6.1 Canonical form

要求：

```text
frames[] 中 frameId unique
channels[] 中 channel unique
channels[] MUST NOT empty
frameId absent == Interest[frameId] empty
```

因此不得同时保留两种“空 Interest”表示。清空全部 Interest：

```json
{"type":"input.interest","frames":[]}
```

### 6.2 Full replacement only

不存在：

```text
input.subscribe
input.unsubscribe
input.add
input.remove
per-Frame Interest ACK
Interest revision
Interest replay cursor
wildcard
```

多个尚未发送的完整 Registry Snapshot MAY latest-state coalesce，只要不会跨越同一 Data Connection 上已经 emitted 的 application-message ordering barrier。

### 6.3 Frame-scoped semantics

Interest 表达：

> 当 Frame `F` 未来拥有 ordinary input authority 时，Subsystem 希望接收哪些 Channel。

它不表达：

```text
F 当前 active
F 当前是 InputTarget
F 当前 Activation
F 位于 Stack 哪一层
F 是 caller 还是 child
```

Interest 不携 `activationId`。

## 7. Interest Lifetime

Frame Interest 配置与 Frame lifetime 对齐，但不等于 Frame lifecycle authority。

### 7.1 Suspension / resume

Frame suspend 时：

```text
Interest[F] MAY remain registered
ordinary input becomes non-Effective because authority ended
```

child-call 后 Frame 使用 fresh Activation resume 时：

```text
Interest[F] MAY be reused immediately
no Interest re-registration is required
```

因此：

```text
Frame Interest survives suspension
Frame Interest survives Activation replacement
```

但旧 Activation 的 Input State/Event 绝不存活到 fresh Activation，见 §12–§15。

### 7.2 Frame close

当 Subsystem 的 local Frame Context 被 terminalize / 删除时，Subsystem MUST 同时从 local Interest Registry 删除该 `frameId`。

该删除 MUST 在 Subsystem 把 `frame.close` 视为本地成功完成前成立；对应 `input.interest` publication MAY 因正常 coalescing / transport scheduling 稍后到达 Renderer。

Renderer 正确性不得依赖 Interest 删除先于 Main Control 的 Frame removal 到达。

### 7.3 Dynamic update

同一 live Frame 的 Interest MAY 随业务状态变化：

```text
absent → non-empty
non-empty → different non-empty
non-empty → absent
```

Interest mutation 不得创建 Activation、不得改变 InputTarget、不得改变 Frame lifecycle。

## 8. Fresh Data Connection Baseline

fresh current Data Connection 的 User Input 状态固定从：

```text
InterestRegistry = {}
```

开始。

**Data Connection establishment 不要求 Subsystem 立即发送 Interest。**

以下状态合法：

```text
Data Connection current
InputTarget = F/A
Interest[F] absent
```

结果只是：

```text
ordinary input disabled until Interest[F] appears
```

同一 DataAuthority generation 下建立 fresh carrier 也不继承旧 carrier 的 Interest Registry。

如果 Subsystem 仍希望 live Frames 接收输入，它 MUST 在 fresh carrier 上重新发布当前需要的完整 Registry Snapshot。

## 9. Control / Data Cross-Plane Ordering

Renderer Control Connection 与 Renderer ⇄ Subsystem Data Connection 是独立连接，不存在跨连接 total order。

因此下面两种顺序都 MUST 安全：

### Interest first

```text
Interest[F] arrives
Control mirror does not yet contain F / InputTarget F/A
→ store Interest[F] as inert configuration
→ no ordinary input

later Control publishes InputTarget F/A
→ recompute Effective
```

### Authority first

```text
Control publishes InputTarget F/A
Interest[F] absent
→ no ordinary input

later Interest[F] arrives
→ recompute Effective
```

不得增加：

```text
cross-plane ACK
Control/Data revision join
barrier message
subscription handshake
```

Renderer MUST 在以下任一事实变化后重新计算 Effective：

```text
Control authority snapshot
Interest Registry snapshot
Producer availability
Data Connection current/retired state
```

## 10. Renderer Does Not Interpret Stack Operations

User Input implementation MUST NOT依赖或推导：

```text
push
pop
frame.call
frame.return
caller
child
failure unwind root
resume reason
```

Renderer 只观察 committed facts：

```text
current Data Connection
mirrored live Frame state
current Activation
current InputTarget
InterestRegistry
Producer availability
```

因此“新 child 通常需要等待自己的 Interest，而 caller resume 可复用既有 Interest”是状态交集自然产生的结果，不是 Renderer 对 push/pop 的特殊分支。

## 11. Effective Channel

对 current Data Connection 对应 Subsystem `S`、Frame `F`、Activation `A`、Channel `C`：

```text
Effective(F, A, C)
=
Data Connection for S is current
AND Main current InputTarget == (S, F, A)
AND mirrored F exists
AND mirrored F lifecycle == active
AND mirrored F activationId == A
AND C ∈ Interest[F]
AND Producer(C) available
```

等价于：

```text
ordinary send set
=
Main authority
∩ Frame Interest
∩ Producer availability
```

Interest / Producer 只能缩小输入面，不能创造 Main authority。

## 12. Effective Transitions

### `.state`: false → true

任意原因导致 State Channel重新 Effective：

```text
Renderer MUST promptly establish one fresh self-contained current State snapshot
```

典型原因：

```text
Interest[F] 新增 C
InputTarget 切入 F/A
fresh Activation
fresh Data Connection + Interest re-publication
Producer 恢复
```

### `.event`: false → true

只允许 Effective 之后发生的 future Event；MUST NOT replay history。

### true → false

Renderer MUST立即停止该 Channel 的新 ordinary State/Event。

原因可能是：

```text
InputTarget revoke / replace
Frame leaves active
Interest[F] removes C or disappears
Producer loss
Data Connection retired
```

协议不要求 Renderer 根据原因推导 Stack operation。

## 13. Renderer Send Gate

Renderer 只有 `Effective(F,A,C)==true` 时 MAY 发送 ordinary State/Event。

不得根据以下事实自行创建/扩大 InputTarget：

```text
DOM focus
Render focus
carrier physical existence
component existence
cached Activation
Interest alone
Producer availability alone
```

Renderer 发送的普通 input MUST 使用 current target 的 `frameId + activationId`。

## 14. Subsystem Receive Gate

Subsystem 收到 State/Event MUST 重新确认：

```text
Data Connection current
frameId exists locally
Frame locally active
activationId == current local Activation
channel ∈ local Interest[frameId]
local Frame mutation/ordinary-input gate open
```

否则 MUST drop。

迟到的旧 Activation、旧 Interest 或 mutation-gated input 不产生 Runtime failure，也不得被业务消费。

## 15. Activation Boundary

Activation 是不可跨越的 input authority epoch。

以下事件形成 implicit Input State reset boundary：

```text
Activation revoked / replaced
Frame leaves active
InputTarget identity changes away from old target
Data Connection current → retired
Renderer Control lost / replaced
Session ends
```

因此：

```text
Interest[F] MAY survive fresh Activation
BUT
old Activation State/Event MUST NOT survive or replay
```

例如：

```text
F/A1 keyboard.state: W=down
F suspended
user releases W
F resumes as A2
```

A2 重新 Effective 后必须建立 fresh State；不得恢复 A1 的 `W=down`。

## 16. InputTarget Revocation / One-Shot Lease

Renderer 观察到旧 InputTarget 被移除 / 替换：

```text
old ordinary State/Event authority ends immediately
```

若旧 target 对应 Data Connection仍 current，Renderer MUST best-effort 向 immediately previous `frameId + activationId` 发送 Reset，然后停止旧 ordinary input。

一个已经发布的：

```text
InputTarget(frameId, activationId)
```

一旦 revoked / removed / replaced，同一 `frameId + activationId` MUST NOT 后来再次成为 InputTarget；该 one-shot lease 由 Main ⇄ Renderer Control v1 保证。

未来 ordinary input grant 使用 fresh authority epoch，通常为 fresh `activationId`。

## 17. State

所有 `.state` Channel 使用 current-state snapshot 语义：

```text
self-contained
latest wins
MAY coalesce
MUST NOT require earlier State to interpret
MUST NOT replay across Activation
MUST NOT replay across retired Data Connection
```

持续事实不能只依赖 Event 表达；例如 held control、current pointer state、current gamepad axes 应有 State 表达。

## 18. Event

所有 `.event` Channel：

```text
ordered
transient
MUST NOT coalesce
MUST NOT replay
MAY be lost
MUST NOT establish persistent protocol state requiring a future Event to clear
```

Event loss本身不是 Runtime failure / Frame unwind。

## 19. Reset

Reset 是 teardown primitive，不是普通 Channel：

```text
Reset(frameId, activationId)
```

含义：清空该 Frame + Activation 下所有 User Input `.state` current state。

```text
does not modify Interest[F]
does not undo/replay Event
is a global State ordering/coalescing barrier
```

Subsystem 只在 `frameId + activationId` 仍对应本地 current Activation 时应用；stale Reset MAY drop。

## 20. Producer Loss Teardown

当前 Interested + Effective 的 `.state` Producer 变 unavailable，而 ordinary authority仍有效时：

```text
stop that Channel immediately
best-effort Reset(current frameId, activationId)
promptly fresh-snapshot every remaining Effective .state Channel
```

因为 Reset 清除该 Activation 下全部 retained input state，所以其余仍 Effective 的 State Channels 必须重新建立 baseline。

Producer 恢复且 Channel 再次 Effective → fresh State baseline。

Event Producer loss没有 persistent teardown obligation。

## 21. Interest Shrink / Expand

### Shrink

Subsystem 更新 Interest 时 MUST 先原子更新 local Interest Registry，再 publication。

因此迟到消息：

```text
C ∉ local Interest[F]
→ drop
```

移除 `.state` Channel 时，Subsystem MUST 清空该 Channel 的 retained local state。

若整个 `F` entry消失，也必须清空该 Frame 当前 retained input state；这不改变 Main Frame/InputTarget authority。

### Expand

Renderer 观察到 Interest[F] 新增 Channel 后：

```text
.event → if Effective, future events only
.state → if Effective, fresh self-contained current snapshot
```

## 22. Closed / Unknown Frame Interest

由于 Control 与 Data Plane 可乱序，Renderer MAY 暂时保存一个当前 Control mirror 未知或已不再 live 的 `Interest[F]`。

该 entry：

```text
is inert
cannot create authority
cannot produce ordinary input
```

Renderer 不得把“Interest 指向 unknown Frame”本身当作协议错误。

`frameId` 在 Session 内永不复用，因此 stale Interest 不能后来错误绑定到另一个 Frame lifetime。

Subsystem MUST最终通过后续 full Registry Snapshot移除已 terminalized local Frame entries；所有 Registry 仍受 hard limits 约束。

## 23. Connection Re-establishment

current carrier 丢失：

```text
old carrier → retired
old InterestRegistry discarded
old input State discarded
Events during outage lost / no replay
```

若同 generation 仍被 Main授权，fresh carrier建立后：

```text
InterestRegistry = {}
```

Subsystem MAY随后发布当前 live Frame 的完整 Interest Registry。

当 target Frame + fresh Interest重新满足 Effective：

```text
.state → fresh snapshots
.event → future-only
```

不需要：

```text
input revision
replay cursor
connection resume token
subscription replay journal
```

## 24. Ordering / Coalescing

依赖 Data Connection per-direction ordered carrier；v1 不增加 `inputSequence`。

State MAY coalesce，但不得跨 Event / Reset barrier。

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

Interest Registry 是 Subsystem → Renderer 方向的 latest-state configuration；同方向多个尚未 emitted Registry MAY coalesce。

Renderer Control 与 Data Connection 之间无 global total order，见 §9。

## 25. Backpressure

所有队列 MUST bounded：

```text
Interest latest full Registry Snapshot
State    latest pending snapshot per Effective Channel
Event    bounded ordered queue
Reset    teardown/ordering barrier priority
```

协议不冻结具体 Event queue capacity，也不冻结 drop-oldest / drop-newest。

必须保持：

```text
no unbounded queue
surviving Events preserve relative order
dropped Events never replay
Event overflow != Runtime failure / Frame unwind
```

## 26. Failure / Frame Boundary

以下不产生 Runtime failure或 Frame unwind：

```text
stale Activation input
unknown/stale Frame Interest
not-interested input
dropped input due to no connection
Event loss
State coalescing
Interest propagation gap
Control/Data cross-plane skew
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

## 27. Frame / Input / Data / Render Independence

```text
Frame-scoped Interest != per-Frame Data Connection
Frame suspend          != Interest removal
fresh Activation       != Interest replacement
Frame close            != Data Connection retire
Interest removal       != Frame close
Interest               != InputTarget authority
Data Connection current!= ordinary input authority
Render Domain          != Input authority
```

Render Update 与 User Input 是同一 Data Connection 上的 sibling protocols；User Input 的 Frame scope 不改变 Render Domain lifecycle。

## 28. Wire / Limit Closure

User Input v1 Frozen 前 MUST直接关闭：

```text
six standard Channel canonical payload schemas
payload identifier semantics required for interop
message encoding / closed-schema details
message size/depth limits
Frame Interest entry/count limits
Channel/count/name limits
standard payload numeric ranges
```

Phase-1 至少要求：

```text
max Interest frame entries <= Renderer Control max live Frame bound + bounded cross-plane skew allowance
all numeric integer semantics use safe integer
all v1 wire objects closed schema
```

具体 hard values应在 Frozen 前写入本节并进入 exactly-at / over-limit fixtures。

v1 明确不增加：

```text
input acknowledgement
input replay cursor
wildcard Interest
incremental subscribe/unsubscribe
per-Frame Interest revision
Activation-scoped Interest
per-channel reset wire
untrusted-Renderer signed input capability
```

## 29. Minimum Core Conformance

至少覆盖：

```text
fresh-connection-interest-registry-empty
no-mandatory-interest-on-connection-establish

frame-interest-full-registry-replacement
duplicate-frame-interest-rejected
duplicate-channel-rejected
empty-frame-entry-rejected
frame-absence-means-no-interest
interest-latest-snapshot-coalescing

interest-before-frame-authority-inert
authority-before-interest-no-send
authority-plus-interest-starts-send
cross-plane-order-independent
unknown-frame-interest-inert
closed-frame-interest-inert

new-child-waits-for-own-interest
suspended-caller-interest-retained
caller-resume-reuses-interest
fresh-activation-reuses-interest-config
fresh-activation-does-not-reuse-input-state
renderer-does-not-interpret-push-pop

current-target-interested-channel-send
null-target-no-send
not-interested-channel-no-send
wrong-subsystem-no-send
non-current-connection-no-send
renderer-is-inputtarget-enforcement-point

interest-expand-state-fresh-baseline
interest-expand-event-future-only
interest-shrink-drops-late-message
interest-shrink-clears-removed-state

state-effective-false-to-true-fresh-baseline
event-effective-false-to-true-no-history-replay
state-latest-coalescing
state-self-contained
event-order-preserved
event-not-coalesced
event-reset-are-coalescing-barriers

custom-x-channel-frame-scoped
same-subsystem-two-frames-different-interest
reserved-channel-collision-rejected
producer-loss-reset-and-rebaseline
producer-return-fresh-state

stale-activation-rejected
inputtarget-revocation-best-effort-reset
inputtarget-one-shot-no-same-activation-regrant
activation-replacement-implicit-reset
connection-retire-implicit-reset
reset-clears-all-input-state-but-not-interest

same-generation-reconnect-registry-empty
reconnect-republish-live-frame-interests
same-generation-reconnect-no-event-replay
same-generation-reconnect-fresh-state

input-loss-does-not-fail-runtime
input-loss-does-not-unwind-frame
ui-cancel-does-not-directly-mutate-frame
```

标准 payload schema 加入本协议后，对应 canonical decoding 与 exactly-at / over-limit fixtures 直接加入同一 User Input v1 corpus。

## 30. Core Invariants

1. Main 是 ordinary `InputTarget` / Activation 的唯一公共 authority；
2. Input Interest 是 Subsystem-owned、Frame-scoped configuration，不是 authority；
3. Interest 不携 Activation；Frame suspension / fresh Activation 不自动删除 Frame Interest；
4. Interest 通过 current Data Connection 上的 full Frame Interest Registry Snapshot 发布；
5. fresh Data Connection 的 Interest Registry 必须从 empty 开始，且 connection establishment 不要求立即发布 Interest；
6. Renderer 不解释 push/pop/call/return；只对 current Control authority、Interest Registry 与 Producer availability 做交集；
7. Control 与 Data Plane 无跨连接 total order；Interest-first 与 Authority-first 都必须安全收敛；
8. 新 Frame 没有自己的 Interest 时不产生输入；恢复旧 Frame 可直接复用该 Frame 已存在的 Interest；
9. Frame Interest 可跨 Activation 保存，但 Input State/Event 永远不得跨 Activation replay；
10. `.state` 每次 Effective false→true 都建立 fresh self-contained baseline；`.event` 永远 future-only；
11. Reset 清 Activation-scoped Input State，不修改 Frame Interest；
12. Frame-scoped Interest 不改变 Data Connection 的 per-Subsystem cardinality；
13. Interest、Frame lifecycle、Data lifecycle 与 Render lifecycle 相互不拥有彼此；
14. Interest / Producer 只能缩小输入面，永远不能创造或扩大 Main authority；
15. Subsystem receive gate 重新验证 local Frame + Activation + Interest，防止 stale/in-flight input 被业务消费。
