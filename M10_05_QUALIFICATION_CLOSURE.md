# M10 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M10 User Input  
> 落地顺序：05  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md) → [M10 / 03](M10_03_RENDERER_INPUT_PRODUCERS.md) → [M10 / 04](M10_04_VERTICAL_INTEGRATION.md)  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> 目标：定义唯一 M10 implementation qualification boundary；实现只满足 Frozen User Input semantics 与现有 role boundaries，不借 M10 扩张平台、Store、authority 或通用输入框架。

> **M10 closure = 在 qualified M9 Data lifecycle 上，Main InputTarget、Subsystem Interest、Renderer Producer 三者经 current Data 正确收敛为 business input；fresh Activation/Data 建立 fresh baseline，旧 lease/event 永不复活。**

---

## 1. Closure Scope

必须实现：

```text
@loomrealm/subsystem
    InputListener author surface
    one role-local InputManager
    Desired Interest aggregation
    receive gate / retained state cleanup
    fresh Data Interest republish

@loomrealm/renderer
    current Interest Registry per Data peer
    Effective input gate
    Reset / fresh baseline / State-Event ordering
    minimal producer-facing seam

existing @loomrealm/data
    typed User Input messages/codecs/reader/writer reused unchanged

M9 vertical
    real paired Desktop Data lifecycle consumed by M10 business input
```

M10 不改变 Main InputTarget authority，不新增 Platform Port。

---

## 2. Abstraction Budget

允许：

```text
one InputManager per Subsystem instance
InputListener records + derived DesiredRegistry
one Renderer-local input gate over existing holder/Data slots
one narrow canonical producer seam
bounded State coalescing / Event queue required by Frozen protocol
```

禁止：

```text
Generic Input framework
InputDeviceRegistry / plugin system
Action/Command mapping
EventBus / Observable / Store framework
InputTarget shadow registry
Activation/Data generation allocator
cross-plane ACK/revision/barrier
second Data reader/writer
retry/replay/history
BrowserWindow/DOM physical composition
```

若实现需要上述任一项，先证明 Frozen contract + current real consumer 无法直接完成；否则不得加入。

---

## 3. Subsystem Evidence

必须证明：

```text
public API only exposes business concepts
multiple listeners union correctly
one listener close does not remove another contribution
setChannels shrink updates local receive gate before wire publication
Frame close performs local-first listener/Interest/state cleanup
child-call suspension preserves desired config but revokes ordinary delivery
fresh Activation reuses config with fresh state baseline
fresh Data peer republishes full current Interest Registry
stale State/Event/Reset drop without Runtime failure
mutation gate blocks business input during commit-sensitive Frame mutation
```

Author code不得 import protocol/platform packages。

---

## 4. Renderer Evidence

必须证明：

```text
Effective = Data × InputTarget × active F/A × Interest × Producer
Interest-first and authority-first both converge
unknown/stale Interest remains inert
Interest shrink stops production immediately
fresh .state Effective transition sends self-contained baseline
.event starts future-only
same-carrier InputTarget replacement orders Reset(old) before ordinary input(new)
producer loss Reset semantics are correct
producer return rebaselines state
Control loss disables input immediately
Data retirement discards carrier-local Registry/publication state
old Data/Control facts cannot emit after replacement
```

Renderer不得解释 Frame call stack semantics；只组合 committed current facts。

---

## 5. Producer / Backpressure Evidence

必须证明：

```text
unavailable producer emits nothing
canonical payload only
paired physical transition: post-transition State before Event when State Effective
State may coalesce before emitted
Event never coalesces/replays
bounded queue does not migrate across lease/Data retirement
producer cannot choose frameId/activationId
```

M10 deterministic producer必须经过同一 production input gate，不得直接写 Data peer/wire。

---

## 6. Real Vertical Evidence

必须使用真实：

```text
Main Runtime/Frame/InputTarget authority
Renderer Control holder
M9 Desktop authority feed + Broker
Hostra Runtime data provisioner
paired Data WebSocket
RendererDataPeer + SubsystemDataPeer
Subsystem business Definition
```

仅 physical input source可 deterministic。

至少覆盖：

```text
initial active Frame input
Interest-first convergence
authority-first convergence
nested child call / caller fresh resume Activation
same-generation Data reconnect with fresh baseline
historical Event no replay
producer loss/return
Frame close cleanup
```

---

## 7. Regression Boundary

M10 必须保持：

```text
M3 Runtime Control semantics unchanged
M5 Main Frame/Activation/InputTarget authority unchanged
M7 Renderer currentness/replacement unchanged
M8 Data role currentness/failure isolation unchanged
M9 Broker paired installation/recovery unchanged
Data failure != Runtime failure / Frame unwind
```

M10 不修改 Frozen User Input v1 wire schema。

---

## 8. CI Gate

实现完成时 root 新增：

```text
npm run test:m10
```

它至少组合：

```text
M9 dependencies/build
Subsystem InputManager tests
Renderer input gate/producer tests
User Input protocol regression
real M10 vertical
```

文档阶段不提前加入空的 `test:m10` script。

---

## 9. Closure Claim

M10 完成后允许声明：

```text
User Input v1 real Renderer/Subsystem role behavior implemented / qualified
Subsystem InputListener/InputManager implemented
Renderer sender gate + canonical producer integration implemented
fresh Activation/Data input baseline qualified on Desktop M9 physical Data lifecycle
```

不得声明：

```text
Desktop BrowserWindow input complete
Render complete
Content complete
PWA input equivalence complete
```

这些分别属于 M14、M11、M12、M16。
