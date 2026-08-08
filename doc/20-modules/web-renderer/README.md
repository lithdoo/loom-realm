# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web Renderer 内部模块、Render 下行、User Input Channel/Interest、Main committed control/recovery state  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[User Input Protocol v1](../../15-contracts/user-input-v1.md)  
> 最近复核：2026-08-08

Frame / Call Protocol v1 已整体 Frozen，但 Renderer **不是 Frame / Call conformance role**：七个 Frame RPC只存在于 Main⇄Subsystem Control。Renderer只服从 Main发布的 committed authority与 causal barrier。

## 1. 模块结构

```text
Web Renderer
├── Main Control Connection
├── Control State Store
├── System Data Connection Registry
├── Render Registry / Store / Scheduler
├── Input Interest Registry
├── Input Channel Producers
│   ├── Keyboard Producer
│   ├── Pointer Producer
│   ├── Gamepad Producer
│   └── Custom Renderer Component Producers (x.*)
├── Frame Input Router
├── Resource Client
└── Presentation State
```

## 2. Renderer 不是 Frame RPC Participant

Renderer不发送/处理 initialize/activate/suspend/resume/close/call/return，也不决定 Frame JSON limits、Request ID、deadline、timeout classification或 Runtime failure unwind root。

Renderer只镜像 Main已 commit的 Runtime/Frame Stack/lifecycle/current Activation/InputTarget。

## 3. Publication Barrier

```text
frame.activate ACK
    happens-before Child InputTarget publication

frame.resume ACK
    happens-before Caller replacement InputTarget publication
```

Main MAY coalesce intermediate revision，但不得提前发布 Activation、revive revoked Activation或暴露两个 ordinary InputTargets。

`InputTarget=null` 是合法 normal/recovery gap。

## 4. Failure Visibility

Runtime failure recovery开始后，Renderer只服从 Main committed recovery projection：

```text
old affected InputTarget disappears
→ recovery may remain InputTarget=null
→ Stack/lifecycle revisions may shrink as suffix unwinds
→ only final healthy Caller resume ACK can publish new InputTarget
```

Renderer MUST NOT根据 failed subsystemKey 自己计算 Stack、恢复 cached Activation、用 Data reconnect恢复 Frame authority或用迟到 Frame RPC Response撤销 Main failure。

## 5. Control State Store

稳定状态通常是 Stack Top=active+current Activation，lower live Frames=suspended。

Recovery合法状态包括 Top closing、zero active Frame、`InputTarget=null`、多个 Frame连续从 suffix移除。Renderer必须接受这些状态，不做本地修复。

## 6. Input Interest Registry

每条 current Subsystem Data Connection维护一个 current Input Interest：

```text
new current connection
    → Interest = empty

Subsystem publishes full Interest
    → atomically replace old set
```

Interest只决定哪些 Channel值得采集/normalize/queue/send，不产生输入 authority。

最终发送条件始终是：

```text
Main current InputTarget/Activation authority
∩
Subsystem current Input Interest
```

Renderer MUST NOT 因为某 Channel被 Interested、某 Render component存在或 DOM focus变化而自行生成 InputTarget。

## 7. Input Channel Producers

标准 Producers对应：

```text
keyboard.state / keyboard.event
pointer.state / pointer.event
gamepad.state / gamepad.event
```

Producer只有在至少存在相应 current Interested Channel且 ordinary input可能有效时 SHOULD 执行昂贵的采集/normalize工作。

`.state` Producer提供该 Channel自包含 current snapshot；`.event` Producer提供瞬时 ordered event。

Renderer Core不把浏览器原始 `KeyboardEvent` / `PointerEvent` / `Gamepad` Host object直接当稳定 wire payload。

## 8. Custom Renderer Component Channels

Subsystem提供的自定义 Renderer component MAY 注册自定义 Input Channel Producer：

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
current Interest filtering
Main InputTarget/Activation gate
State/Event ordering/coalescing rules
wire limits
routing to owning Subsystem connection
```

自定义 Component不能通过注册 `x.*` Channel绕过 Main authority，也不能占用标准保留 Channel前缀。

## 9. Frame Input Router

```text
raw / custom component input
→ resolve exact Input Channel
→ channel interested?
→ read Main current InputTarget
→ require current matching Data Connection
→ require mirrored active Frame/current Activation
→ attach frameId + activationId
→ User Input State/Event
```

任一普通 gate失败则不发送。

revoked/removed Frame历史输入不得重放到新 Activation。

## 10. InputTarget Teardown / Reset

Renderer观察到旧 InputTarget被移除或替换时：

```text
stop old ordinary State/Event immediately
```

如果旧 target 的 Data Connection仍 current，Renderer按 User Input v1 best-effort发送旧 `frameId + activationId` Reset。

如果 Connection已 retired，则 Connection retirement本身是 implicit reset boundary。

Renderer不得等待 Reset ACK；User Input没有 transactional ACK。

## 11. Interest Change Behavior

新增 `.state` Interest：Renderer SHOULD尽快发送 fresh current snapshot（前提是 ordinary authority有效）。

新增 `.event` Interest：只发送之后发生的 Event，不补历史。

移除 Channel后立即停止新采集/发送；迟到消息由 Subsystem local Interest gate负责丢弃。

Renderer MAY对尚未发送的完整 Interest state只保留最新版本；Input Interest不需要 patch/replay。

## 12. User Input Backpressure

Renderer内部应按 User Input Core维护独立策略：

```text
State
    latest pending snapshot per interested Channel

Event
    bounded ordered FIFO

Reset
    teardown / ordering barrier
```

State不得跨 Event/Reset barrier coalesce；Event不得 coalesce或 reconnect replay。

具体 numeric limits由 User Input completion/profile冻结。

## 13. Data / Render Independence

Runtime failure可能使对应 Data Connection authority失效；这不等于 Renderer可以删除全部相关 Render state并推导 Frame lifecycle。

Frame close/unwind不自动删除 Render Record。Render recovery、snapshot、visibility/order仍属于 Render Protocol。

Input Interest同样不拥有 Render lifecycle；一个 Render component存在不意味着其 Channel必须 Interested。

## 14. Renderer Reload

```text
reconnect Main
→ restore current committed Runtime/Stack/Activation/InputTarget
→ rebuild Data Connections
→ each fresh Data Connection starts Interest=empty
→ Subsystem republishes full Interest
→ fresh interested State snapshots restore input state
→ independently restore Render State
```

Reload不得恢复 cached old Activation、历史 Event、旧 Interest、未 commit transaction state或 failed Runtime旧 input authority。

## 15. Cancellation Boundary

Renderer不能代表 suspended Caller发送 `frame.cancel`。UI cancel只是当前 active Frame的 User Input Event；由 Subsystem业务逻辑决定是否 `frame.return({type:"cancelled"})`。

## 16. Core Invariants

- Renderer不参与 Frame RPC/retry/unwind/version negotiation；
- Renderer只镜像 Main committed authority；
- Input Interest只过滤，不授予 authority；
- fresh Data Connection Interest默认 empty；
- exact Channel only，no wildcard；
- standard Channel由 Renderer Core/Profile提供；
- custom Renderer component只使用 `x.*.(state|event)`；
- `.state` latest snapshot / `.event` ordered transient；
- Event/Reset是 State coalescing barrier；
- InputTarget撤销时 old target best-effort Reset；
- revoked Activation/Event/Interest不得跨 reload/reconnect恢复；
- Frame/Render/Data/Input lifecycle保持独立。
