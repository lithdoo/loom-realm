# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web Renderer 内部模块、Render 下行、User Input Channel/Interest、Main committed control/recovery state  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[User Input Protocol v1](../../15-contracts/user-input-v1.md)  
> 最近复核：2026-08-08

Frame / Call Protocol v1 已整体 Frozen，但 Renderer **不是 Frame / Call conformance role**。七个 Frame RPC只存在于 Main⇄Subsystem Control；Renderer只服从 Main发布的 committed authority与 causal barrier。

## 1. 模块结构

```text
Web Renderer
├── Main Control Connection
├── Control State Store
├── System Data Connection Registry
├── Render Registry / Store / Scheduler
├── Input Interest Registry
├── Input Channel Producer Registry
│   ├── Keyboard Producer
│   ├── Pointer Producer
│   ├── Gamepad Producer
│   └── Custom Renderer Component Producers (x.*)
├── Effective Input Channel Resolver
├── Frame Input Router
├── Resource Client
└── Presentation State
```

## 2. Renderer 不是 Frame RPC Participant

Renderer不发送/处理 initialize/activate/suspend/resume/close/call/return，也不决定 Frame JSON limits、Request ID、deadline、timeout classification或 Runtime failure unwind root。

Renderer只镜像 Main已 commit的 Runtime/Frame Stack/lifecycle/current Activation/InputTarget。

## 3. Renderer Core 的 Input Trust Boundary

User Input v1 的 v1 trust model 明确：

```text
Main
    owns InputTarget / Activation authority

Renderer Core
    trusted sender-side enforcement point

Subsystem
    validates local Frame/Activation + local Interest
```

Renderer Core MUST执行 Main InputTarget gate；自定义 Renderer component不能自行选择 Subsystem、Frame 或 Activation。

Subsystem收到 User Input时不能从 wire独立证明 Main当前 `InputTarget` 非空，因此 Renderer Core 的 sender-side gate 是 v1安全边界的一部分。

## 4. Publication Barrier / InputTarget Lease

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller replacement InputTarget publication
```

Main MAY coalesce intermediate revision，但不得提前发布 Activation、revive revoked Activation或暴露两个 ordinary InputTargets。

`InputTarget=null` 是合法 normal/recovery gap。

Renderer还依赖 Renderer Control v1 的 one-shot lease：

```text
published InputTarget(frameId, activationId)
→ revoked/removed/replaced
→ same frameId + activationId can never become InputTarget again
```

因此 Renderer不需要依赖一定观察到中间 null revision，也不需要独立 `inputEpoch`。

## 5. Failure Visibility

Runtime failure recovery开始后，Renderer只服从 Main committed recovery projection：

```text
old affected InputTarget disappears
→ recovery may remain InputTarget=null
→ Stack/lifecycle revisions may shrink as suffix unwinds
→ only final healthy Caller resume ACK can publish new InputTarget
```

Renderer MUST NOT根据 failed subsystemKey 自己计算 Stack、恢复 cached Activation、用 Data reconnect恢复 Frame authority或用迟到 Frame RPC Response撤销 Main failure。

## 6. Control State Store

稳定状态通常是 Stack Top=active+current Activation，lower live Frames=suspended。

Recovery合法状态包括 Top closing、zero active Frame、`InputTarget=null`、多个 Frame连续从 suffix移除。Renderer必须接受这些状态，不做本地修复。

## 7. Input Interest Registry

每条 current Subsystem Data Connection维护一个 current Input Interest：

```text
new current connection
    → Interest = empty

Subsystem publishes full Interest
    → atomically replace old set
```

Interest只决定哪些 Channel值得采集/normalize/queue/send，不产生输入 authority。

Subsystem缩小 Interest时会先更新自身 local Interest gate，因此传播中的旧消息可在 Subsystem端安全丢弃；Renderer不需要 Interest ACK/revision。

## 8. Input Channel Producers

标准 Producers对应：

```text
keyboard.state / keyboard.event
pointer.state / pointer.event
gamepad.state / gamepad.event
```

`.state` Producer提供该 Channel自包含 current snapshot；`.event` Producer提供瞬时 ordered event。

Renderer Core不把浏览器原始 `KeyboardEvent` / `PointerEvent` / `Gamepad` Host object直接当稳定 wire payload。

Producer availability 是 Effective Channel 的必要条件，不产生 authority。

## 9. Custom Renderer Component Channels

Subsystem提供的自定义 Renderer component MAY 注册：

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

Custom Producer负责自身 payload语义；Renderer Core负责：

```text
Channel namespace validation
Producer availability tracking
current Interest filtering
Main InputTarget/Activation gate
State/Event ordering/coalescing rules
wire limits
routing to owning Subsystem connection
```

自定义 Component不能通过注册 `x.*` Channel绕过 Main authority，也不能占用标准保留 Channel前缀。

## 10. Effective Input Channel Resolver

对 exact Channel `C`：

```text
Effective(C)
=
current matching Data Connection
∧ Main current InputTarget matches this Subsystem
∧ mirrored active Frame/current Activation matches
∧ C ∈ current Input Interest
∧ Producer(C) available
```

只有 Effective Channel 才能产生普通 State/Event。

这使以下变化统一成为 Effective transition：

```text
Interest change
InputTarget change
Activation change
Data reconnect
Producer availability change
```

## 11. Effective Transition Behavior

### `.state` false → true

Renderer MUST尽快建立 fresh current snapshot baseline，而不是等待下一次物理输入变化。

因此以下场景都能正确恢复当前 held/axis/pointer state：

```text
new Interest
InputTarget newly granted
fresh Activation
fresh Data Connection + republished Interest
Producer becomes available
```

### `.event` false → true

只发送之后发生的 Event，不补历史。

### true → false

立即停止新的普通 State/Event。

Interest移除由 Subsystem local gate清理；authority loss由 implicit reset清理；Producer loss按下一节处理。

## 12. Producer Loss Teardown

如果一个当前 Effective `.state` Producer 在 ordinary authority仍有效时消失：

```text
stop missing Channel
→ best-effort Reset(current frameId, activationId)
→ re-establish fresh snapshots for all remaining Effective .state Channels
```

这样复用已有 Reset，不增加 per-channel reset/producer-closed wire。

如果 Producer loss 与 Connection/Activation/Control loss同时发生，对应 implicit reset已经足够。

Producer重新 available 后按 `.state false → true` 建立 fresh baseline。

## 13. Frame Input Router

```text
raw / custom component input
→ resolve exact Input Channel
→ compute Effective(Channel)
→ if false: no ordinary send
→ attach frameId + activationId
→ User Input State/Event
```

revoked/removed Frame历史输入不得重放到新 Activation。

## 14. InputTarget Teardown / Reset

Renderer观察到旧 InputTarget被移除或替换时：

```text
stop old ordinary State/Event immediately
```

如果旧 target 的 Data Connection仍 current，Renderer按 User Input v1 best-effort发送旧 `frameId + activationId` Reset。

如果 Connection已 retired，则 Connection retirement本身是 implicit reset boundary。

Renderer不得等待 Reset ACK；User Input没有 transactional ACK。

同一 old `frameId + activationId` 不会再次成为 InputTarget，因此不需要处理 revoke→same-lease regrant race。

## 15. User Input Backpressure

Renderer内部按 User Input Core维护：

```text
State
    latest pending snapshot per Effective Channel

Event
    bounded ordered FIFO

Reset
    teardown / ordering barrier

Interest
    latest full replacement set
```

State不得跨 Event/Reset barrier coalesce；Event不得 coalesce或 reconnect replay。

具体 numeric limits由 User Input completion/profile冻结。

## 16. Data / Render Independence

Runtime failure可能使对应 Data Connection authority失效；这不等于 Renderer可以删除全部相关 Render state并推导 Frame lifecycle。

Frame close/unwind不自动删除 Render Record。Render recovery、snapshot、visibility/order仍属于 Render Protocol。

Input Interest和Producer availability同样不拥有 Render lifecycle；Render component存在不意味着其 Channel必须 Interested。

## 17. Renderer Reload

```text
reconnect Main
→ restore current committed Runtime/Stack/Activation/InputTarget
→ rebuild Data Connections
→ each fresh Data Connection starts Interest=empty
→ Subsystem republishes full Interest
→ Effective .state Channels emit fresh baselines
→ independently restore Render State
```

Reload不得恢复 cached old Activation、历史 Event、旧 Interest、未 commit transaction state或 failed Runtime旧 input authority。

## 18. Cancellation Boundary

Renderer不能代表 suspended Caller发送 `frame.cancel`。UI cancel只是当前 active Frame的 User Input Event；由 Subsystem业务逻辑决定是否 `frame.return({type:"cancelled"})`。

## 19. Core Invariants

- Renderer不参与 Frame RPC/retry/unwind/version negotiation；
- Renderer只镜像 Main committed authority；
- Renderer Core是 Main InputTarget sender-side trusted enforcement point；
- InputTarget lease一旦撤销，同一 `frameId + activationId` 不 re-grant；
- Input Interest只过滤，不授予 authority；
- fresh Data Connection Interest默认 empty；
- exact Channel only，no wildcard；
- standard Channel由 Renderer Core/Profile提供；
- custom Renderer component只使用 `x.*.(state|event)`；
- Effective Channel = Main authority ∩ Interest ∩ Producer availability；
- `.state` 每次 false→true建立 fresh baseline；
- `.event` 只发送 future ordered transient events；
- Producer loss使用 Reset + remaining State rebaseline；
- Event/Reset是 State coalescing barrier；
- InputTarget撤销时 old target best-effort Reset；
- revoked Activation/Event/Interest不得跨 reload/reconnect恢复；
- Frame/Render/Data/Input lifecycle保持独立。
