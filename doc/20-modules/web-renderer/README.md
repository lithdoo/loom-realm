# Web 渲染端模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Web Renderer 内部模块、Render Domain/Tree 下行、User Input Channel/Interest、Main committed control/recovery state  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[通信系统](../../10-architecture/communication-system.md)、[Frame / Call Protocol v1](../../15-contracts/frame-call-protocol-v1.md)、[User Input Protocol v1](../../15-contracts/user-input-v1.md)  
> 最近复核：2026-08-08

Frame / Call Protocol v1 已整体 Frozen，但 Renderer **不是 Frame / Call conformance role**。七个 Frame RPC只存在于 Main⇄Subsystem Control；Renderer只服从 Main发布的 committed authority与 causal barrier。

## 1. 模块结构

```text
Web Renderer
├── Main Control Connection
├── Control State Store
├── System Data Connection Registry
├── Render Domain Registry
├── Render Domain Store
├── Renderer Component Registry
├── Domain Tree Reconciler
├── Global Domain Composer / Scheduler
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

User Input v1 的 v1 trust model：

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

Renderer依赖 Renderer Control v1 one-shot lease：

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

## 7. Render Domain Registry / Store

Renderer对每个 current/known Subsystem维护独立 Render Domain namespace。

```text
Renderer Render Domain Store

Map<subsystemKey,
    Map<domainId,
        DomainState
    >
>
```

一个 Subsystem Runtime MAY拥有 `0..N` Domains。

Domain identity：

```text
(subsystemKey, domainId)
```

Renderer不能根据 Frame Stack创建、隐藏或销毁 Domain。Domain lifecycle只服从 Subsystem发布的 Render Update lifecycle state。

Domain是一个原子 authoritative Render state unit，当前设计至少包含：

```text
zIndex
0..N ordered roots
whole current Node Tree
```

Renderer收到完整合法 Domain State后原子替换该 Domain Store；实际 Component/DOM/Canvas/WebGL reconciliation是派生过程。

## 8. Domain Host / Global Composition

Renderer为每个 Domain提供一个系统级 Domain Host。Domain Host：

```text
is composition boundary
is NOT Render Node
has no key/tag/attrs/data
```

因此一个 Domain可以直接拥有多个 top-level roots，不需要创建 fake container root。

Renderer全局 composition 至少按 Domain `zIndex`工作：

```text
lower zIndex → below
higher zIndex → above
```

同 zIndex 的最终 deterministic tie-break仍由 Render Update/Composition contract冻结；实现不得依赖连接到达顺序、Domain创建时序或 reconnect顺序作为业务 z-order。

## 9. Domain Tree / Reconciliation

当前 Render Node设计：

```text
Node
    key
    tag
    attrs : string→string
    data  : JSON object
    children[] ordered
```

Domain拥有 `0..N` ordered roots。

Renderer必须验证：

```text
Node key unique across all roots + descendants in one current Domain Tree
roots order preserved
children order preserved
plain declarative attrs/data
```

稳定 `key` 是 Renderer本地 reconciliation identity；Renderer MAY比较 old/new full Domain State，在 wire仍是完整 state的情况下只更新实际变化的 Component/DOM/Scene实例。

协议不因为 Renderer内部 diff 而自动获得 Tree Patch语义。

## 10. Renderer Component Registry

Node `tag` 是逻辑 Renderer Component type，不是 DOM tag。

Renderer Component resolution至少按：

```text
(subsystemKey, tag)
→ Component Factory
```

隔离。

因此不同 Subsystem可以使用相同 tag 字符串而对应不同组件实现。

Custom Renderer Component MAY产生 DOM/Canvas/WebGL presentation，也 MAY注册 `x.*` User Input Channel Producer。

Renderer Core负责：

```text
Component namespace/availability validation
Domain Tree lifecycle and reconciliation
Input Producer availability tracking
User Input authority/Interest gate
wire limits
```

Component不能通过 tag/attrs/data直接获得 Frame/Input authority。

Component implementation如何被 Host/Package加载不属于 Render Tree State；Render wire不得传 executable Function/Class/Host object。

## 11. Input Interest Registry

每条 current Subsystem Data Connection维护一个 current Input Interest：

```text
new current connection
    → Interest = empty

Subsystem publishes full Interest
    → atomically replace old set
```

Interest只决定哪些 Channel值得采集/normalize/queue/send，不产生输入 authority。

Subsystem缩小 Interest时会先更新自身 local Interest gate，因此传播中的旧消息可在 Subsystem端安全丢弃；Renderer不需要 Interest ACK/revision。

## 12. Input Channel Producers

标准 Producers对应：

```text
keyboard.state / keyboard.event
pointer.state / pointer.event
gamepad.state / gamepad.event
```

`.state` Producer提供该 Channel自包含 current snapshot；`.event` Producer提供瞬时 ordered event。

Renderer Core不把浏览器原始 `KeyboardEvent` / `PointerEvent` / `Gamepad` Host object直接当稳定 wire payload。

Producer availability 是 Effective Channel 的必要条件，不产生 authority。

## 13. Custom Renderer Component Channels

Subsystem自定义 Renderer Component MAY注册：

```text
x.<custom-name>.state
x.<custom-name>.event
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

Node/Component出现不意味着 Channel Interested；Component消失导致 Producer unavailable 时使用 User Input Producer Loss teardown。

## 14. Effective Input Channel Resolver

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

## 15. Effective Transition Behavior

### `.state` false → true

Renderer MUST尽快建立 fresh current snapshot baseline，而不是等待下一次物理输入变化。

### `.event` false → true

只发送之后发生的 Event，不补历史。

### true → false

立即停止新的普通 State/Event。

Interest移除由 Subsystem local gate清理；authority loss由 implicit reset清理；Producer loss按下一节处理。

## 16. Producer Loss Teardown

如果一个当前 Effective `.state` Producer 在 ordinary authority仍有效时消失：

```text
stop missing Channel
→ best-effort Reset(current frameId, activationId)
→ re-establish fresh snapshots for all remaining Effective .state Channels
```

这样复用已有 Reset，不增加 per-channel reset/producer-closed wire。

如果 Producer loss 与 Connection/Activation/Control loss同时发生，对应 implicit reset已经足够。

Producer重新 available 后按 `.state false → true` 建立 fresh baseline。

## 17. Frame Input Router

```text
raw / custom component input
→ resolve exact Input Channel
→ compute Effective(Channel)
→ if false: no ordinary send
→ attach frameId + activationId
→ User Input State/Event
```

Domain/Node identity不进入 ordinary input authority envelope；revoked/removed Frame历史输入不得重放到新 Activation。

## 18. InputTarget Teardown / Reset

Renderer观察到旧 InputTarget被移除或替换时立即停止旧 ordinary State/Event。

如果旧 target 的 Data Connection仍 current，Renderer按 User Input v1 best-effort发送旧 `frameId + activationId` Reset。

如果 Connection已 retired，则 Connection retirement本身是 implicit reset boundary。

同一 old `frameId + activationId` 不会再次成为 InputTarget，因此不需要处理 revoke→same-lease regrant race。

## 19. User Input Backpressure

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

## 20. Data / Domain Independence

Runtime failure可能使对应 Data Connection authority失效；这不等于 Renderer可以根据 Frame/Data状态推导 Domain authoritative destroy。

```text
Frame close/unwind != Domain destroy
Data Connection retire != Domain destroy
Input Interest change != Domain lifecycle
Producer availability != Domain lifecycle
```

Renderer MAY在 Data outage期间保留最后合法 Domain presentation Store；fresh connection后的 authoritative Domain recovery由 Render Update定义。

## 21. Renderer Reload

```text
reconnect Main
→ restore current committed Runtime/Stack/Activation/InputTarget
→ rebuild Data Connections
→ each fresh Data Connection starts Input Interest=empty
→ Subsystem republishes Input Interest
→ Effective .state Channels emit fresh baselines
→ independently recover Render Domain Registry + fresh Domain States
```

Reload不得恢复 cached old Activation、历史 Event、旧 Interest、未 commit transaction state或 failed Runtime旧 input authority。

旧 Domain presentation是否暂存、何时删除 stale Domain由 Render Update recovery语义决定，不从 Frame Stack推导。

## 22. Cancellation Boundary

Renderer不能代表 suspended Caller发送 `frame.cancel`。UI cancel只是当前 active Frame的 User Input Event；由 Subsystem业务逻辑决定是否 `frame.return({type:"cancelled"})`。

## 23. Core Invariants

- Renderer不参与 Frame RPC/retry/unwind/version negotiation；
- Renderer只镜像 Main committed control authority；
- Renderer Core是 Main InputTarget sender-side trusted enforcement point；
- InputTarget lease一旦撤销，同一 `frameId + activationId` 不 re-grant；
- 每个 Subsystem可拥有 `0..N` Render Domains；
- Domain identity=`subsystemKey + domainId`；
- Domain是 lifecycle/atomic-state/global-composition unit；
- Domain拥有 zIndex + `0..N` ordered roots；
- Domain Host不是 Render Node；
- Node key在当前 Domain Tree内全局唯一；
- roots/children均保持 authoritative order；
- tag按 Subsystem scope解析到 Renderer Component，不等于 DOM tag；
- Renderer可以按 stable key本地 reconciliation，但这不等于 wire Tree Patch；
- Input Interest只过滤，不授予 authority；
- fresh Data Connection Interest默认 empty；
- Effective Channel = Main authority ∩ Interest ∩ Producer availability；
- `.state` 每次 false→true建立 fresh baseline；
- `.event` 只发送 future ordered transient events；
- Producer loss使用 Reset + remaining State rebaseline；
- Frame/Domain/Data/Input lifecycle保持独立。
