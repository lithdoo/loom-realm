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

> **Main 决定输入 authority；Subsystem 只声明自己感兴趣的 Input Channels；Renderer 只采集并发送两者交集。Input Interest 只能缩小输入面，不能扩大 InputTarget / Activation authority。**

User Input v1 Core 定义 authority、Input Channel / Input Interest、State / Event / Reset、ordering、coalescing、recovery 与扩展边界。标准设备具体 payload 仍由后续 Mapping/Profile 冻结，不直接复制浏览器或 OS Event 对象。

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

## 2. Authority 与 Interest 分离

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

Input Interest 不是 authority，也不是 permission grant。

有效发送集合是：

```text
Main-authorized input
∩
Subsystem current Input Interest
```

因此即使 Subsystem声明任意 Channel，只要 `InputTarget=null`、连接非 current 或 Activation不匹配，Renderer仍 MUST NOT发送 ordinary input。

## 3. Renderer Send Gate

Renderer 发送 State/Event 时必须同时满足：

```text
Data Connection lifecycle == current
Main current InputTarget != null
InputTarget.subsystemKey == current Data Connection subsystemKey
mirrored Frame exists
mirrored Frame lifecycle == active
mirrored Frame activationId == InputTarget.activationId
channel ∈ current Input Interest
```

任一条件不成立：

```text
MUST NOT send ordinary State/Event
```

Renderer不得根据 Render focus、DOM focus、carrier存在、自定义组件存在或 cached Activation自行扩展 InputTarget。

## 4. Subsystem Receive Gate

Subsystem接收 State/Event 时必须重新确认：

```text
frameId exists
Frame is locally active
message activationId == current Activation
message channel ∈ Subsystem local current Input Interest
```

否则 MUST drop；MAY记录受限 diagnostics，但不得改变 Main Frame authority。

Interest由 Subsystem自己维护，因此 Interest缩小时，即使旧消息仍在 carrier 上迟到，也可以在本地 gate 被丢弃。

## 5. Wire Authority Identity

每条 Renderer → Subsystem input message 的 authority identity只需要：

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

这些已由 current Data Connection绑定。

```ts
interface UserInputAuthorityV1 {
  readonly frameId: string;
  readonly activationId: string;
}
```

v1 不新增 `inputEpoch`、`inputSessionId`、`connectionId` 或 operation ID；`activationId` 已经是 ordinary-input authority epoch。

## 6. Input Channel

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

使用 `pointer` 而不是 `mouse`，避免把协议绑定到单一 pointing device。

Channel 名称使用 exact match；v1 不支持 wildcard / prefix subscription。

原因：

```text
future new channel
MUST NOT silently expand an old Interest
```

## 7. Custom Channel Namespace

Subsystem提供的 Renderer component MAY 定义自定义 Input Channel。

自定义 Channel MUST 使用：

```text
x.<custom-name>.(state|event)
```

示例：

```text
x.inventory.drag.state
x.inventory.drop.event
x.dialog.choice.event
```

标准前缀由 LoomRealm保留；自定义 Channel不得占用 `keyboard.*`、`pointer.*`、`gamepad.*` 或未来保留标准前缀。

因为 Data Connection已绑定 Subsystem，自定义名称无需重复 `subsystemKey`。

User Input Core不解释自定义 payload 的业务含义，只要求其遵守对应 `.state` / `.event` 语义和通用 wire limits。

## 8. Input Interest

Input Interest 是 Subsystem 对当前 Data Connection声明的 **完整 Channel 集合**。

概念结构：

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

Subsystem MAY 随业务/Renderer component 状态变化更新 Interest。

Renderer收到新的 Interest后原子替换旧集合；不定义 subscribe/unsubscribe/add/remove patch wire。

## 9. Interest Lifecycle

新的 current Data Connection 的初始 Interest固定为：

```text
empty set
```

因此新连接默认不产生 ordinary input traffic。

Subsystem建立 current Data Connection 后，应发布当前完整 Interest。

Interest不跨 retired connection自动继承，也不通过 reconnect replay 恢复。

同一 current carrier 上，Interest publication按 Subsystem → Renderer carrier order处理；多个尚未发送的完整 Interest MAY latest-state coalesce。

## 10. Interest Change Semantics

新增 `.state` Channel Interest：

```text
Renderer SHOULD promptly emit one fresh current State snapshot
if ordinary input authority is currently valid
```

新增 `.event` Channel Interest：

```text
future Events only
MUST NOT replay events from before the Interest became effective
```

移除 `.state` Channel Interest：

```text
Subsystem MUST immediately clear its locally retained state for that removed Channel
```

移除 `.event` Channel Interest不需要历史清理。

Interest变化不需要 ACK；传播期间允许短暂少发/多发，但 Receive Gate保证已移除 Channel的迟到输入不会重新生效。

## 11. State Channels

所有以 `.state` 结尾的 Channel 使用 **current-state snapshot** 语义。

要求：

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

建模为对应 State snapshot。

任何需要未来“release”消息才能解除的持续输入状态，不应只依赖 Event 流表达。

## 12. Event Channels

所有以 `.event` 结尾的 Channel 使用瞬时 Event 语义。

要求：

```text
ordered
MUST NOT coalesce
MUST NOT replay after reconnect
MUST NOT establish protocol-level persistent state that requires a future Event to clear
```

例如概念上的 click、wheel step、confirm/cancel、custom UI action 可以属于 Event。

如果业务需要“当前仍按住/仍拖动/当前轴值”等持续事实，应使用对应 State Channel。

## 13. Reset

Reset不是普通 Channel，而是 User Input Core 的 teardown primitive。

```text
Reset(frameId, activationId)
```

表示：

> 清空该 Frame + Activation 下所有 User Input `.state` Channel 的当前输入状态。

Reset不改变 Input Interest，也不影响历史 Event。

Reset是全局 input ordering barrier。

## 14. InputTarget Revocation Teardown

当 Renderer观察到旧 InputTarget 被移除或替换时，普通 State/Event authority立即失效。

如果旧 target 对应 Data Connection仍 current，Renderer MUST best-effort 向 **immediately previous** `frameId + activationId` 发送一次 Reset，然后停止旧 target ordinary input。

这是 Reset 唯一允许在普通 Send Gate已经撤销后发送的 teardown 例外。

Subsystem只在该 `frameId + activationId` 仍是本地 current Activation时应用 Reset；若 Activation已经被 Frame Control撤销，则旧 state本就必须被清空，迟到 Reset可安全丢弃。

## 15. Implicit Reset Boundaries

以下事件本身 MUST 等价于清空相关 User Input State，无需依赖 Reset成功送达：

```text
Activation revoked/replaced
Frame leaves active
Data Connection current → retired
Renderer Control authority lost/replaced
Session ends
```

因此连接断开、Runtime/Frame authority变化时不会因为缺失 release/event 而永久保留旧输入状态。

## 16. Activation Boundary

Activation 是不可跨越的 User Input authority epoch。

旧 Activation 的：

```text
State
Event
Reset
```

都不能重新解释为 fresh Activation输入。

Renderer MUST NOT replay旧 Activation输入；Subsystem MUST reject stale activationId。

v1 不依赖“同一 Activation revoke input 后再次 re-grant”语义；需要重新建立 ordinary input authority时应使用新的 authority epoch，而不是恢复旧输入状态。

## 17. Connection Re-establishment

如果 Data Connection丢失但相同 DataAuthority generation和 Frame/Activation仍有效：

```text
fresh connection starts with Interest = empty
Subsystem republishes current full Interest
Events during outage are lost / not replayed
interested State Channels are re-established from fresh snapshots
old remote State MUST NOT be assumed preserved
```

因此 User Input v1不需要 replay cursor、input revision或 connection-level resume token。

## 18. Ordering 与 Coalescing

User Input v1依赖 Data Connection提供 Renderer → Subsystem per-direction ordered carrier。

v1不增加独立 `inputSequence`。

State MAY coalesce，但不得跨 Event 或 Reset barrier移动。

示例：

```text
State A1
State A2
Event E
State A3
State A4
Reset
State A5
```

可以收敛为：

```text
State A2
Event E
State A4
Reset
State A5
```

不得把 A1/A2 合并到 Event E 之后，也不得把 Reset 前 State移动到 Reset之后。

多个 State Channel连续出现时，实现 MAY 在不跨 Event/Reset barrier 的前提下保留每个 Channel 的最新待发送 snapshot。

## 19. Backpressure

建议的最小队列模型：

```text
State
    bounded latest pending snapshot per interested Channel

Event
    bounded ordered FIFO

Reset
    ordering barrier / teardown priority

Interest
    latest full replacement state
```

不得无界增长。

Event overflow本身不是 Runtime failure；具体 numeric limits 与 drop policy在 Completion/Profile冻结。已发送/保留的 Event相对顺序不得改变，丢弃的 Event不得重放。

## 20. No Broadcast / No Frame Commands

ordinary User Input不是 Subsystem broadcast。

一条 State/Event只属于：

```text
one current Data Connection
one Frame
one Activation
one exact Input Channel
```

User Input不得直接表达或代替 `frame.call`、`frame.return`、`frame.close`、`frame.resume`、Frame Stack mutation或 InputTarget mutation。

UI “取消”仍只是输入 Event；是否 `frame.return({type:"cancelled"})` 由 Subsystem业务逻辑决定。

## 21. Failure Boundary

以下事件本身不产生 Runtime failure或 Frame unwind：

```text
stale Activation input
not-interested Channel input
input dropped due to no current connection
Event lost during connection failure
State coalescing
Interest propagation gap
local/reset teardown
```

Malformed/oversize wire和 numeric limits在 User Input completion阶段冻结；不得通过 User Input error重新定义 Frame/Runtime failure authority。

## 22. Device / Payload Mapping Boundary

Core v1不直接复制：

```text
KeyboardEvent
PointerEvent
TouchEvent
Gamepad object
DOM Event
Host object
```

后续 Standard Input Mapping Profile应定义标准 Channel payload：

```text
keyboard.state / keyboard.event
pointer.state / pointer.event
gamepad.state / gamepad.event
```

Text / IME、gesture、accessibility action可以独立 Profile/Channel 扩展，不要求塞入 Core v1。

自定义 `x.*` Channel payload由 Subsystem Renderer component 与 Subsystem Runtime共同定义，但必须保持 plain-data、limits和 `.state/.event` Core语义。

## 23. Minimum Core Conformance Scenarios

至少覆盖：

```text
current-target-interested-channel-send
null-target-no-send
not-interested-channel-no-send
wrong-subsystem-no-send
non-current-connection-no-send

interest-default-empty
interest-full-replacement
interest-exact-match-no-wildcard
interest-removal-drops-late-message
interest-removal-clears-removed-state
state-interest-add-sends-fresh-snapshot
event-interest-add-no-history-replay
custom-x-channel-accepted
reserved-channel-collision-rejected

stale-activation-rejected
inputtarget-revocation-best-effort-reset
activation-replacement-implicit-reset
connection-retire-implicit-reset

state-latest-coalescing
state-self-contained
event-order-preserved
event-not-coalesced
event-reset-are-coalescing-barriers
reset-clears-all-input-state

same-generation-reconnect-interest-empty
same-generation-reconnect-no-event-replay
same-generation-reconnect-fresh-state

input-loss-does-not-fail-runtime
input-loss-does-not-unwind-frame
ui-cancel-does-not-directly-mutate-frame
```

## 24. Explicit Non-Goals Core Draft

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
```

## 25. Core Invariants

1. Main InputTarget/Activation是 ordinary input authority；
2. Input Interest只能缩小输入面，不能扩大 authority；
3. User Input domain包含 Subsystem→Renderer Interest 与 Renderer→Subsystem State/Event/Reset；
4. 新 Data Connection的 Interest默认 empty；
5. Interest是 Runtime/Data-Connection scoped full replacement exact set；
6. 标准 Channel使用 `keyboard|pointer|gamepad.(state|event)`；
7. 自定义 Channel使用 `x.*.(state|event)`；
8. v1不支持 wildcard Interest；
9. wire authority identity = `frameId + activationId`；
10. Subsystem重新验证 Activation与 local Interest；
11. `.state` 是 self-contained latest-state snapshot，可 coalesce；
12. `.event` 是 ordered transient input，不可 coalesce/replay；
13. Event与Reset是 State coalescing barrier；
14. Reset清空当前 Activation全部 input State；
15. Interest移除 `.state` Channel立即清空该 Channel本地 state；
16. InputTarget撤销时 Renderer best-effort Reset旧 target；
17. Activation/Connection/Control/Session authority loss形成 implicit reset；
18. reconnect从 empty Interest + fresh State恢复，不重放 Event；
19. input loss/overflow不等于 Runtime failure或 Frame unwind；
20. User Input不是 broadcast，也不是 Frame command。

## 26. Summary

```text
Subsystem
    publishes full Input Interest
        keyboard.state
        pointer.event
        x.inventory.drag.state

Renderer
    Main authority valid?
    AND channel interested?
        ↓
    collect / normalize only useful inputs
        ↓
    State / Event / Reset
        ↓
    attach frameId + activationId
        ↓
Subsystem
    validate current Activation + local Interest
    accept or drop
```

最终原则：

> **Connection 决定“管道是否有效”，Main InputTarget 决定“输入给谁”，Activation 决定“输入是否仍可接受”，Input Interest 决定“这个 Subsystem 当前值得接收哪些输入流”。**
