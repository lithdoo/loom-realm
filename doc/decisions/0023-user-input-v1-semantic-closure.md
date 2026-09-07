# ADR 0023：User Input v1 semantic closure

> 状态：Accepted / **partially updated by ADR 0029**  
> 日期：2026-08-21  
> 影响范围：User Input Protocol v1、Renderer Data Profile v1、未来 `@loomrealm/data` Input codec/dispatcher、Subsystem InputManager/InputListener、Renderer Input Producer、M8/M10 conformance  
> 依赖：[User Input Protocol v1](../15-contracts/user-input-v1.md)、[Main ⇄ Renderer Control v1](../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Frame / Call v1](../15-contracts/frame-call-protocol-v1.md)  
> 后续修正：[ADR 0029](./0029-user-input-v1-mutation-gate-state-convergence.md) 仅更新 Subsystem mutation-gate / retained-State convergence；其余本 ADR 结论继续有效  
> 不改变：Main 的 Frame/Activation/InputTarget authority、per-Subsystem Data cardinality、Control/Data cross-plane independence、Frame/Render lifecycle ownership

## 背景

User Input v1 在 Frozen 前需要关闭：

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

核心模型：

```text
ordinary input
= Main InputTarget
∩ Subsystem Interest[F]
∩ Renderer Producer(C)
∩ current Data Connection
```

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

fresh Activation可保留 Desired Interest但必须终止旧 State/Event authority；fresh Data carrier可保留 Desired Interest + current Activation，但 remote Interest/State/Event publication baseline重新从 empty开始。

---

## 决策 2：wire surface固定四种 message

```text
input.interest
input.state
input.event
input.reset
```

不增加 ACK/NACK、input revision/sequence、subscription delta、inputEpoch/inputSessionId、producerId envelope、per-channel reset。

Carrier已绑定 Session/subsystem/generation/profile；ordinary input只需要 `frameId + activationId + channel`。

---

## 决策 3：标准设备不泄漏 Platform API object

标准 v1：

```text
keyboard.state / keyboard.event
pointer.state  / pointer.event
gamepad.state  / gamepad.event
```

不复制 DOM/OS/native event object。Renderer adapter负责映射为 canonical payload。

Keyboard只表达 physical-control input；Pointer使用 Renderer input surface normalized fixed-point；Gamepad固定 standard logical layout与 integer fixed-point values。Vendor-specific能力使用 `x.*` 或未来版本。

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
    retained Event is global State-coalescing barrier
```

标准 stateful family若 sibling `.state` / `.event` 同时 Effective：

```text
physical transition
→ post-transition State
→ Event
```

这样 Event handler观察 retained sibling State时拥有唯一语义。

> ADR 0029 后续补充：Subsystem commit-sensitive mutation gate暂时关闭时，same-current-Activation `.state` 不再简单丢弃，而是 retain latest + suppress business delivery；known-no-commit same-Activation reopen时 local-converge latest State。Event仍不 replay。

---

## 决策 5：Reset只做 Activation retained-State teardown

`input.reset(F,A)` 清 `(F,A)` 全部 retained `.state`，不改 Interest、不 replay/撤销 Event，并且是 global State-coalescing barrier。

InputTarget old lease结束时 best-effort Reset；same-carrier direct A1→A2必须把 Reset(A1)排在第一条 A2 ordinary input之前。跨不同 carrier无 ordering requirement。

---

## 决策 6：Producer loss不升级 authority failure

`.state` Producer unavailable：

```text
stop channel
→ best-effort Reset(F,A)
→ rebaseline remaining Effective State channels
```

Producer return形成 fresh State baseline；Event producer loss只停止 future Event。Producer availability永远不能创建 Main authority。

---

## 决策 7：custom channel只扩展 payload，不扩展 Core authority

```text
x.<custom-name>.state
x.<custom-name>.event
```

采用 ASCII finite grammar；payload必须是 bounded JSON object，并服从 Frame Interest、Activation lease、State/Event generic semantics、fresh-carrier rules、limits/failure boundary。

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

ADR 0029 进一步明确：handler throw/reject不得逃逸成 Data fatal；mutation-gate same-Activation State属于 local retention/suppression，不属于 stale drop。

---

## 决策 9：limits与Wire taxonomy对齐

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

标准设备另有明确 count/numeric bounds；source duplicate member继续沿用 frozen Wire/ECMAScript `JSON.parse` semantics。

---

## 决策 10：current v1直接冻结，不制造 fake v2

当前不存在需要保留的第三方已部署 User Input v1 compatibility surface，因此 closure直接更新 current v1。

Frozen 后，wire message/schema、channel grammar、standard payload、lifetime/lease、State/Event/Reset ordering、limits、failure/recovery 的不兼容改变需要新 protocol version或新 Data Profile combination。

ADR 0029 按 document-governance §7 在首次 conformant implementation前修正一个已证明的 State convergence contradiction，并将 `fixtureSetRevision` 从 1 更新到 2；它不改变 protocol version或上述治理边界。

---

## 结果

Current User Input v1：

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

Current implementation/conformance应以 User Input v1 + ADR 0029 + `fixtureSetRevision=2` 为准；本 ADR 其它冻结结论继续有效。
