# Renderer ⇄ Subsystem User Input Protocol v1

> 层级：正式契约  
> 状态：Active Design / Draft  
> 协议版本：1  
> 协议标识：`loomrealm.user-input / 1`  
> 稳定程度：Evolving  
> 配置方向：Subsystem → Renderer（Input Interest）  
> 输入方向：Renderer → Subsystem（State / Event / Reset）  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> Authority：[Main ⇄ Renderer Control Protocol v1](./main-renderer-control-v1.md)、[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 最近复核：2026-08-08

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Main 决定 ordinary input authority；Subsystem 只声明 Input Interest；Renderer Core 是 Main `InputTarget` 的 sender-side trusted enforcement point。最终只有 Effective Input Channel 才产生 State/Event 流。**

User Input v1 Core 定义 authority、Input Channel / Input Interest、Effective Channel、State / Event / Reset、ordering、coalescing、recovery 与扩展边界。标准设备具体 payload 由后续 Mapping/Profile 冻结，不直接复制浏览器或 OS Event 对象。

---

## 1. 协议位置

```text
Main
 │ Renderer Control
 │ current InputTarget
 ▼
Renderer ◀──────── Input Interest ─────── Subsystem
 │                                         ▲
 │ State / Event / Reset                   │
 └─────────────────────────────────────────┘
       current Data Connection
```

User Input domain 包含两种方向：

```text
Subsystem → Renderer
    current Input Interest

Renderer → Subsystem
    Input State
    Input Event
    Input Reset
```

不定义 Input ACK / Result / transactional Response。

## 2. Trust / Authority Model

ordinary input 的公共 authority 始终来自 Main：

```text
current Data Connection
+
Main current InputTarget
+
current Frame
+
current Activation
```

角色边界：

```text
Main
    owns InputTarget / Activation authority

Renderer Core
    trusted sender-side enforcement point for Main InputTarget routing

Subsystem
    independently validates local Frame/Activation freshness
    and local Input Interest
```

Subsystem **不能仅凭 User Input wire 独立证明 Main 当前 `InputTarget` 非空**；它能够重新验证的是：

```text
frameId exists
Frame is locally active
activationId is current
channel is locally interested
```

因此 v1 的安全模型不是“不信任 Renderer Core”。如果未来要求恶意 Renderer 也无法伪造 Main InputTarget authority，应设计独立的 signed/capability input authority，而不是给 v1 偷加 token。

Input Interest 不是 authority，也不是 permission grant。

## 3. Wire Authority Identity

每条 Renderer → Subsystem State/Event/Reset 的 authority identity 只需要：

```text
frameId
activationId
```

不重复：

```text
sessionId
subsystemKey
generation
connectionProfile
```

这些已经由 current Data Connection identity 绑定。

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
inputLeaseId
connectionId
operationId
inputSequence
```

`activationId` 已经是 ordinary-input authority epoch。

## 4. Input Channel

Input Channel 是一种可独立声明 Interest、独立定义 payload 的输入流。

标准 v1 Channel names：

```text
keyboard.state
keyboard.event
pointer.state
pointer.event
gamepad.state
gamepad.event
```

使用 `pointer` 而不是 `mouse`，避免绑定单一 pointing device。

Channel 名称只使用 exact match；v1 不支持 wildcard / prefix subscription。

```text
future new channel
MUST NOT silently expand an old Interest
```

## 5. Custom Channel Namespace

Subsystem 提供的 Renderer component MAY 定义自定义 Input Channel：

```text
x.<custom-name>.state
x.<custom-name>.event
```

示例：

```text
x.inventory.drag.state
x.inventory.drop.event
x.dialog.choice.event
```

标准前缀由 LoomRealm 保留；自定义 Channel不得占用 `keyboard.*`、`pointer.*`、`gamepad.*` 或未来保留标准前缀。

因为 Data Connection 已绑定 Subsystem，自定义名称无需重复 `subsystemKey`。

User Input Core 不解释自定义 payload 的业务含义，只要求其遵守 `.state/.event` 语义、plain-data 约束与通用 limits。

## 6. Input Interest

Input Interest 是 Subsystem 对当前 Data Connection 声明的**完整 exact Channel 集合**。

概念结构：

```ts
interface InputInterestV1 {
  readonly channels: readonly string[];
}
```

语义固定：

```text
full replacement
exact match
Runtime/Data-Connection scoped
not Frame-scoped
not Activation-scoped
not authority
```

Subsystem MAY 随业务状态或 Renderer component 状态变化更新 Interest。

Renderer收到新的 Interest后原子替换旧集合；v1 不定义：

```text
subscribe
unsubscribe
add
remove
patch
wildcard
```

## 7. Interest Lifecycle / Race Closure

新的 current Data Connection 初始：

```text
Interest = empty
```

因此 fresh connection 默认不产生 ordinary input traffic。

Subsystem建立 current Data Connection 后发布当前完整 Interest。

Interest 不跨 retired connection自动继承，也不通过 reconnect replay 恢复。

同一 current carrier 上，Interest publication按 Subsystem → Renderer per-direction order处理；多个尚未发送的完整 Interest MAY latest-state coalesce。

Interest update 不需要 ACK。

### 7.1 Interest 缩小

Subsystem MUST 先把新的完整 Interest 作为本地 current Interest，再进行 publication。

因此即使 Renderer 尚未观察到缩小，旧 Channel 消息迟到：

```text
message channel ∉ Subsystem local current Interest
→ MUST drop
```

移除 `.state` Channel时 Subsystem MUST 立即清空该 Channel retained state。

### 7.2 Interest 扩大

Subsystem先在本地允许新的 Channel，再 publication。

Renderer观察后：

```text
.event
    future Events only
    no history replay

.state
    if Channel becomes Effective
    → establish fresh State baseline
```

因此 Interest 不需要 revision / ACK / two-phase subscription。

## 8. Effective Input Channel

对某个 exact Channel `C`，定义：

```text
Effective(C)
=
Data Connection lifecycle == current
AND Main current InputTarget != null
AND InputTarget.subsystemKey == current Data Connection subsystemKey
AND mirrored Frame exists
AND mirrored Frame lifecycle == active
AND mirrored Frame activationId == InputTarget.activationId
AND C ∈ current Input Interest
AND Producer(C) is available
```

这是 User Input Core 的中心派生状态，不是新的 wire field。

ordinary State/Event 的有效发送集合因此等于：

```text
Main authority
∩ Subsystem Interest
∩ Producer availability
```

Interest 或 Producer 都只能缩小输入面，不能产生 Main authority。

## 9. Effective Transition Rules

### 9.1 `.state`: false → true

任意原因导致一个 `.state` Channel 从 non-effective 变为 effective 时：

```text
Renderer MUST promptly establish one fresh current State snapshot
before relying on later State changes for that Channel
```

典型原因：

```text
Interest newly includes the Channel
InputTarget becomes this Subsystem/Activation
fresh Activation becomes current
fresh Data Connection becomes current and Interest is republished
Producer becomes available
```

这条规则比“新增 Interest 时发送 snapshot”更强：**只要 State Channel 重新变得 Effective，就建立 fresh baseline。**

### 9.2 `.event`: false → true

只允许发送变为 Effective 之后发生的 Event：

```text
MUST NOT replay historical Events
```

### 9.3 Effective: true → false

Renderer MUST 立即停止该 Channel 的新 ordinary State/Event 发送。

如果 false 的原因已经形成 implicit reset boundary（Activation/Connection/Control/Session loss），按对应 implicit reset收敛。

如果 authority仍存在而只是 Producer 不可用，按 §15 Producer Loss Teardown 收敛。

如果只是 Interest移除，Subsystem本地 Interest gate与 retained-state clear已经闭环，不要求额外 wire ACK。

## 10. Renderer Send Gate

Renderer 只有在 `Effective(channel) == true` 时 MAY 发送普通 State/Event。

Renderer不得根据：

```text
Render focus
DOM focus
carrier physical existence
custom component existence
cached Activation
Interest alone
```

自行生成或扩大 InputTarget。

## 11. Subsystem Receive Gate

Subsystem 接收 State/Event 时 MUST 重新确认：

```text
frameId exists
Frame is locally active
message activationId == current Activation
message channel ∈ Subsystem local current Input Interest
```

否则 MUST drop；MAY 记录受限 diagnostics，但不得改变 Main Frame authority。

Subsystem不把“收到一个合法格式消息”解释成 Main InputTarget grant。

## 12. State Channels

所有 `.state` Channel 使用 **current-state snapshot** 语义：

```text
latest state wins
payload MUST be self-contained for that Channel
MAY coalesce before transmission
MUST NOT require an earlier State message to interpret correctly
MUST NOT replay across Activation or retired connection
```

例如标准 Mapping/Profile可以把：

```text
currently-held keyboard controls
pointer current position/buttons
current gamepad axes/buttons
```

建模为 State snapshot。

任何需要未来“release”消息才能解除的持续输入状态，MUST NOT 只依赖 Event 流表达。

## 13. Event Channels

所有 `.event` Channel 使用瞬时 Event 语义：

```text
ordered
MUST NOT coalesce
MUST NOT replay after reconnect
MUST NOT establish protocol-level persistent state that requires a future Event to clear
```

例如 click、wheel step、confirm/cancel、custom UI action 可以属于 Event。

如果业务需要“当前仍按住 / 仍拖动 / 当前轴值”等持续事实，应使用 State Channel。

## 14. Reset

Reset不是普通 Channel，而是 User Input Core teardown primitive：

```text
Reset(frameId, activationId)
```

含义：

> 清空该 Frame + Activation 下所有 User Input `.state` Channel 的当前输入状态。

Reset：

```text
does not modify Input Interest
does not replay/undo Events
is a global input ordering/coalescing barrier
```

Subsystem只在 `frameId + activationId` 仍对应本地 current Activation时应用 Reset；stale Reset可安全丢弃。

## 15. Producer Loss Teardown

如果一个**当前 Interested 且 Effective 的 `.state` Producer** 在 ordinary authority仍有效时变为 unavailable：

```text
Renderer MUST stop that Channel immediately
Renderer MUST best-effort send Reset(current frameId, activationId)
Renderer MUST promptly re-establish fresh snapshots
for every remaining Effective .state Channel
```

这使用已有全局 Reset收敛状态，不增加：

```text
channel.reset
producer.closed
channel.invalid
```

如果 Producer loss 与 Connection/Activation/Control loss同时发生，则对应 implicit reset boundary已经足够，不要求额外发送 Reset。

当 Producer重新 available 且 Channel重新 Effective 时，按 `.state false → true` 建立 fresh snapshot。

## 16. InputTarget Revocation Teardown

当 Renderer观察到旧 InputTarget 被移除或替换时：

```text
ordinary State/Event authority for old target ends immediately
```

如果旧 target 对应 Data Connection仍 current，Renderer MUST best-effort 向 **immediately previous** `frameId + activationId` 发送一次 Reset，然后停止旧 target ordinary input。

这是 Reset 允许在普通 Send Gate已经撤销后发送的 teardown 例外。

如果 Frame Control 已经撤销该 Activation，Subsystem的 implicit reset已经生效，迟到 Reset可丢弃。

## 17. InputTarget One-Shot Lease

为使 Renderer Control full-snapshot coalescing 与 User Input teardown闭合，v1 冻结：

> **一个已发布过的 `InputTarget(frameId, activationId)` 一旦被 Main 撤销、移除或替换，该同一 `frameId + activationId` MUST NOT 在之后再次成为 InputTarget。**

因此：

```text
A1 granted
→ A1 target revoked
→ A1 permanently input-dead
```

未来重新授予 ordinary input authority必须使用 fresh authority epoch，通常即 fresh `activationId`。

v1 不增加独立 `inputEpoch`。

该规则保证即使 Main coalesce：

```text
A1 → null → ?
```

Renderer也不会因为看不到中间 null 而错误地把 A1 当作连续未撤销 authority。

## 18. Implicit Reset Boundaries

以下事件本身 MUST 等价于清空相关 User Input State，无需依赖显式 Reset成功送达：

```text
Activation revoked/replaced
Frame leaves active
Data Connection current → retired
Renderer Control authority lost/replaced
Session ends
```

因此连接断开、Runtime/Frame authority变化不会因为缺失 release/event 永久保留旧输入状态。

## 19. Activation Boundary

Activation 是不可跨越的 User Input authority epoch。

旧 Activation 的：

```text
State
Event
Reset
```

都不能重新解释为 fresh Activation输入。

Renderer MUST NOT replay旧 Activation输入；Subsystem MUST reject stale `activationId`。

结合 InputTarget One-Shot Lease，v1 不支持在同一 `activationId` 上 revoke ordinary input 后再 re-grant。

## 20. Connection Re-establishment

如果 Data Connection丢失但相同 DataAuthority generation和 Frame/Activation仍有效：

```text
fresh connection starts with Interest = empty
Subsystem republishes current full Interest
Events during outage are lost / not replayed
Effective State Channels establish fresh snapshots
old remote State MUST NOT be assumed preserved
```

因此 User Input v1不需要 replay cursor、input revision或 connection-level resume token。

## 21. Ordering / Coalescing

User Input v1依赖 Data Connection提供 per-direction ordered carrier。

v1不增加独立 `inputSequence`。

State MAY coalesce，但不得跨 Event 或 Reset barrier移动。

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

多个 State Channel连续出现时，实现 MAY 在不跨 Event/Reset barrier 的前提下只保留每个 Channel最新 pending snapshot。

## 22. Backpressure

最小队列模型：

```text
State
    bounded latest pending snapshot per Effective Channel

Event
    bounded ordered FIFO

Reset
    teardown / ordering barrier priority

Interest
    latest full replacement state
```

不得无界增长。

Event overflow本身不是 Runtime failure。具体 numeric limits 与 drop policy在 Completion/Profile冻结；已保留/发送的 Event相对顺序不得改变，丢弃的 Event不得重放。

## 23. No Broadcast / No Frame Commands

ordinary User Input不是 broadcast。

一条 State/Event只属于：

```text
one current Data Connection
one Frame
one Activation
one exact Input Channel
```

User Input不得直接表达或代替：

```text
frame.call
frame.return
frame.close
frame.resume
Frame Stack mutation
InputTarget mutation
```

UI “取消”仍只是 Event；是否 `frame.return({type:"cancelled"})` 由 Subsystem业务逻辑决定。

## 24. Failure Boundary

以下事件本身不产生 Runtime failure或 Frame unwind：

```text
stale Activation input
not-interested Channel input
input dropped due to no current connection
Event lost during connection failure
State coalescing
Interest propagation gap
Producer availability change
local/reset teardown
Event overflow
```

Malformed/oversize wire和 numeric limits在 User Input completion阶段冻结；不得通过 User Input error重新定义 Frame/Runtime failure authority。

## 25. Device / Payload Mapping Boundary

Core v1不直接复制：

```text
KeyboardEvent
PointerEvent
TouchEvent
Gamepad object
DOM Event
Host object
```

后续 Standard Input Mapping Profile定义标准 Channel payload：

```text
keyboard.state / keyboard.event
pointer.state / pointer.event
gamepad.state / gamepad.event
```

Text / IME、gesture、accessibility action可以独立 Profile/Channel 扩展，不要求进入 Core v1。

自定义 `x.*` Channel payload由 Subsystem Renderer component 与 Runtime共同定义，但必须保持 plain-data、limits和 `.state/.event` Core语义。

## 26. Minimum Core Conformance Scenarios

至少覆盖：

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

## 27. Explicit Non-Goals Core Draft

当前 Core Draft不冻结：

```text
standard Channel exact payload schemas
DOM key/code mapping
pointer coordinate normalization
gamepad slot mapping
gesture recognition
text input / IME model
accessibility action mapping
message encoding
message size limits
Channel/count numeric limits
Event queue numeric limits / overflow final policy
compression / binary representation
input acknowledgement
input replay cursor
wildcard Interest
per-channel reset wire
untrusted-Renderer signed input capability
```

## 28. Core Invariants

1. Main `InputTarget` / Activation 是 ordinary input authority；
2. Renderer Core 是 Main InputTarget sender-side trusted enforcement point；
3. Subsystem重新验证 local Activation与 local Interest，但不从 User Input wire独立证明 Main InputTarget；
4. Input Interest只能缩小输入面，不能扩大 authority；
5. fresh Data Connection的 Interest默认 empty；
6. Interest是 Runtime/Data-Connection scoped full replacement exact set；
7. 标准 Channel使用 `keyboard|pointer|gamepad.(state|event)`；
8. 自定义 Channel使用 `x.*.(state|event)`；
9. v1不支持 wildcard Interest；
10. Effective Channel = Main authority ∩ Interest ∩ Producer availability；
11. `.state` 每次 non-effective→effective都建立 fresh self-contained baseline；
12. `.event` 只发送 Effective 后的 future Events，不 coalesce/replay；
13. Event与Reset是 State coalescing barrier；
14. Reset清空当前 Activation全部 input State；
15. Interest移除 `.state` Channel立即清空该 Channel本地 state；
16. Effective State Producer消失时 Reset并 rebaseline其余 State；
17. InputTarget撤销时 Renderer best-effort Reset旧 target；
18. 同一 `frameId + activationId` 的 InputTarget 一旦撤销不得 re-grant；
19. Activation/Connection/Control/Session authority loss形成 implicit reset；
20. reconnect从 empty Interest + fresh State恢复，不重放 Event；
21. input loss/overflow不等于 Runtime failure或 Frame unwind；
22. User Input不是 broadcast，也不是 Frame command。

## 29. Summary

```text
Subsystem
    publishes full Input Interest
        keyboard.state
        pointer.event
        x.inventory.drag.state

Renderer Core
    computes Effective(Channel):
        Main authority
        ∩ Interest
        ∩ Producer availability

    .state false→true
        → fresh baseline

    .event
        → future ordered transient events only

    teardown
        → Reset / implicit reset

Subsystem
    validates current Activation + local Interest
    accepts or drops
```

最终原则：

> **Connection 决定“管道是否有效”，Main InputTarget 决定“输入给谁”，Activation 决定“authority epoch”，Input Interest 决定“值得接收哪些流”，Producer 决定“哪些流此刻可生成”；只有它们的交集才是 Effective Input Channel。**
