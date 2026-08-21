# ADR 0023：User Input v1 semantic closure

> 状态：Accepted  
> 日期：2026-08-21  
> 影响范围：User Input Protocol v1、Renderer Data Profile v1、未来 `@loomrealm/data` Input codec/dispatcher、Subsystem InputManager/InputListener、Renderer Input Producer、M8/M10 conformance  
> 依赖：[User Input Protocol v1](../15-contracts/user-input-v1.md)、[Main ⇄ Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)  
> 不改变：Main 的 Frame/Activation/InputTarget authority、per-Subsystem Data cardinality、Control/Data cross-plane independence、Frame/Render lifecycle ownership

## 背景

User Input v1 已经具备稳定核心：

```text
ordinary input
= Main InputTarget
∩ Subsystem Interest[F]
∩ Renderer Producer(C)
∩ current Data Connection
```

但在 Frozen 前仍存在会让独立实现自行发明规则的空白：

```text
standard Keyboard/Pointer/Gamepad canonical payload
channel/identifier grammar
State/Event causal ordering
Activation/Data/Interest lifetime relationship
InputTarget direct replacement teardown
producer-loss reset/rebaseline
wire limits / exact schema / validation
protocol-invalid vs stale input drop
```

本 ADR 关闭这些自由度；目标不是增加 Input 功能，而是让两个独立实现仅根据 v1 规范即可得到相同 observable behavior。

---

## 决策 1：三个 lifetime 正交

```text
Desired Interest
    Frame-scoped local configuration

Input Lease
    InputTarget(frameId, activationId)
    Activation-scoped one-shot authority epoch

Wire Publication State
    current Data carrier scoped
    published Interest + retained State + Event stream
```

因此：

```text
fresh Activation
    MAY keep Desired Interest
    MUST reset old State/Event authority

fresh Data carrier
    MAY keep Desired Interest + current Activation
    MUST reset remote Interest/State/Event publication baseline
```

这避免把 Frame config、authority epoch 和 transport epoch折叠成一个隐式“input session”。

---

## 决策 2：wire surface固定为四种 message

```text
input.interest
input.state
input.event
input.reset
```

不增加：

```text
ACK/NACK
input revision/sequence
subscription delta
inputEpoch/inputSessionId
producerId envelope
per-channel reset
```

Carrier 已绑定 Session/subsystem/generation/profile；ordinary input只需要 `frameId + activationId + channel`。

---

## 决策 3：标准设备不泄漏 Platform API object

标准 v1 直接冻结：

```text
keyboard.state / keyboard.event
pointer.state  / pointer.event
gamepad.state  / gamepad.event
```

但不复制：

```text
DOM KeyboardEvent
DOM PointerEvent
browser Gamepad object
OS/native event struct
```

Renderer adapter负责把 Platform事实映射为 canonical payload。

### Keyboard

只表达 physical-control input，不表达 text/IME。合法 code 使用有限 physical-control grammar/set。

### Pointer

坐标使用 Renderer input surface normalized fixed-point：

```text
0 = left/top
1,000,000 = right/bottom
signed int32 allows off-surface capture position
```

### Gamepad

固定 standard logical layout；axis/button使用 integer fixed-point：

```text
axis   -1,000,000..1,000,000
button  0..1,000,000
pressed threshold = 500,000
```

vendor-specific设备/额外能力使用 `x.*` 或未来版本。

---

## 决策 4：State/Event 因果关系显式化

```text
State
    self-contained
    latest wins
    coalescible before emitted

Event
    transient
    ordered
    no replay
    retained Event is State-coalescing barrier
```

对标准 stateful family，如果 sibling `.state` 和 `.event` 同时 Effective：

```text
physical transition
→ post-transition State
→ Event
```

这样 Event handler观察 retained sibling State时拥有唯一语义，不依赖平台调度偶然顺序。

---

## 决策 5：Reset只做 Activation retained-State teardown

```text
input.reset(F,A)
```

清 `(F,A)` 全部 retained `.state`，不改 Interest、不 replay/撤销 Event。

Reset也是 global State coalescing barrier。

InputTarget old lease结束时 best-effort Reset；same carrier direct A1→A2 replacement必须把 Reset(A1)排在第一条 A2 ordinary input之前。

跨不同 Data carrier不存在跨 carrier ordering。

---

## 决策 6：Producer loss不升级 authority failure

`.state` Producer在 current lease中 unavailable：

```text
stop channel
→ best-effort Reset(F,A)
→ rebaseline remaining Effective State channels
```

Producer return形成 false→true，fresh State baseline。

Event producer loss只停止 future Event。

Producer availability永远不能创建 Main authority。

---

## 决策 7：custom channel只扩展 payload，不扩展 Core authority

```text
x.<custom-name>.state
x.<custom-name>.event
```

采用 ASCII finite grammar；payload必须是 bounded JSON object。

Custom channel依然服从：

```text
Frame Interest
Activation lease
State/Event generic semantics
fresh-carrier rules
limits/failure boundary
```

因此 custom 不形成绕过 User Input Core 的第二套 transport/authority模型。

---

## 决策 8：failure taxonomy分层

```text
protocol-invalid
    malformed/schema/channel/standard-payload/limit invalid
    → retire current Data

well-formed authority-inapplicable
    stale Activation/not-interested/closed local Frame
    → drop

well-formed unknown/stale Interest
    → inert config

Producer transition
    → reset/rebaseline policy

business handler failure
    → local SDK/business error policy
```

不得把 malformed Event当成“Event本来就可丢”；也不得把正常 stale input当成 Data protocol failure。

---

## 决策 9：limits与Wire taxonomy对齐

统一：

```text
message                   1 MiB UTF-8
JSON depth                64
frameId/activationId      1..128 UTF-8 bytes
channel                   <=128 ASCII bytes
Interest frames           <=128
Channels / Frame          <=64
total Interest pairs      <=4096
payload compact bytes     <=262,144
payload relative depth    <=32
```

标准设备再拥有明确 count/numeric bounds。

source duplicate member继续沿用 frozen Wire/ECMAScript `JSON.parse` observable semantics，不建立第二 tokenizer。

---

## 决策 10：当前 v1直接冻结，不制造 fake v2

当前不存在需要保留的第三方已部署 User Input v1 compatibility surface，因此 closure直接更新 current v1。

Frozen 后，以下不兼容改变需要新 User Input protocol version或新 Data Profile combination：

```text
wire message/schema
channel grammar
standard payload semantics
lifetime/lease rules
State/Event/Reset ordering
hard limits
failure/recovery behavior
```

---

## 结果

User Input v1 现在可以由一个统一模型解释：

```text
Frame owns Desired Interest lifetime
Activation owns ordinary input lease
Data carrier owns publication baseline

Effective
= current Data
∩ Main InputTarget(F,A)
∩ Interest[F]
∩ Producer(C)

State = current truth
Event = transient impulse
Reset = retained-State teardown barrier
```

后续 executable fixtures 与 package implementation是 conformance qualification，不再承担补协议语义的职责。