# M10 / 03 — Renderer Input Producers

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M10 User Input  
> 落地顺序：03  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md)  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> 目标：给 Renderer input gate 提供最小 canonical producer seam，用 deterministic producer 完成 M10 qualification；真实 BrowserWindow/DOM 接入留到 M14。

> **Producer 只描述“某 channel 当前是否可生产，以及当前 canonical state / future event 是什么”；它不知道 Frame、Activation、Interest、Data authority 或 Subsystem。**

---

## 1. Boundary

```text
physical/test input source
→ canonical Producer(C)
→ Renderer input gate
→ @loomrealm/data typed Renderer peer
```

Producer 输入必须已经是 Frozen User Input v1 canonical payload；DOM/OS/native event object 不进入 gate 或 wire。

M10 不要求 BrowserWindow、DOM listener、Gamepad API 或 Pointer Events physical composition。

---

## 2. Minimal Seam

实现只允许一个窄 producer-facing seam，覆盖：

```text
availability change
current self-contained payload for .state baseline
future payload delivery for .state/.event changes
```

精确 TypeScript 命名可在实现中选择，但不得把它扩展成：

```text
InputDevice framework
plugin registry
platform service
focus manager
gesture system
key binding system
command/action mapping
```

M10 deterministic producer 与 M14 real browser producer必须走同一 gate semantics；M14 不得重做一套输入 authority。

---

## 3. Producer Responsibilities

Producer owns：

```text
canonical Keyboard / Pointer / Gamepad / x.* payload creation
channel availability
current sample for .state
future physical/canonical changes
```

Producer does not own：

```text
InputTarget
Frame/Activation validity
Interest Registry
Data currentness
Reset decision
State/Event send ordering across lease boundaries
backpressure settlement policy
```

这些仍由 Renderer input gate + `@loomrealm/data` current peer处理。

---

## 4. State / Event Ordering

当一个 physical transition 同时产生 sibling State + Event，而对应 State channel Effective：

```text
post-transition input.state
→ corresponding input.event
```

若 State channel不 Effective，则不得为了 Event 虚构 State publication。

Event：

```text
ordered
future-only
not coalesced
may be dropped before emitted under bounded backpressure
```

State：

```text
self-contained latest state
may coalesce before emitted
fresh Effective transition requires current baseline
```

---

## 5. Deterministic M10 Producer

M10 qualification使用 production-shaped deterministic source，可控制：

```text
channel available/unavailable
current State payload
State transition
Event emission
paired State+Event transition
```

Fixture 不得：

```text
write Data carrier directly
construct input.state/event/reset wire text
set InputTarget
inject Interest Registry into Renderer local state
bypass Renderer gate
```

它只扮演 physical producer。

---

## 6. Browser/PWA Placement

```text
M10
    deterministic canonical producer
    proves role semantics

M14 Desktop
    real browser DOM/Gamepad producer
    maps physical events → same canonical producer seam

M16 PWA
    uses same logical Renderer input semantics
```

因此 M10 不新增 Platform Port；input environment 属于 Renderer product composition，不进入 `@loomrealm/platform-ports` Main/Subsystem capability contracts。

---

## 7. Abstraction Budget

允许：

```text
one narrow producer seam
small deterministic implementation for tests/vertical
bounded local queue/coalescing required by User Input v1
```

禁止：

```text
InputDeviceRegistry
GenericProducer<T>
EventBus / Observable framework
Action/Command abstraction
platform detection
DOM types in protocol/core state
producer-created Frame/Activation identity
```

---

## 8. Done

M10/03 必须证明：

```text
unavailable producer cannot emit
availability return triggers fresh .state baseline when Effective
paired transition orders State before Event
Event is never replayed after inactive/Data boundary
Producer cannot bypass current Renderer input gate
canonical payload validation remains owned by existing Data profile mechanics
```

下一步：[M10 / 04 — Vertical Integration](M10_04_VERTICAL_INTEGRATION.md)。
