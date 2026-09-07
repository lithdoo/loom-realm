# M10 / 03 — Renderer Input Producers

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M10 User Input  
> 落地顺序：03  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md)  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> 目标：给 Renderer input gate 提供一个 holder-lifetime canonical input source；M10 使用 deterministic realization，真实 BrowserWindow/DOM mapping 留到 M14。

> **Producer 只描述 canonical device facts。它不知道 Frame、Activation、Interest、Data authority、Subsystem 或 wire ordering。**

---

## 1. Construction / Lifetime

Renderer role construction时最多注入一个 input source：

```text
create Renderer holder
+ optional canonical input source
→ holder/input gate owns consumption for that holder lifetime
```

固定：

```text
single construction-time injection
no runtime producer registry
no plugin registration API
source availability may change
holder terminal/replacement stops old source consumption
```

精确 TypeScript 命名可在实现中选择；不得为了命名对称扩展为通用 device framework。

---

## 2. Boundary

```text
physical/test environment
→ canonical input source
→ Renderer input gate
→ bounded input publisher
→ @loomrealm/data RendererDataPeer
```

source 提供的事实只需要覆盖：

```text
channel availability change
current self-contained payload for .state baseline
future canonical state/event transition
```

DOM/OS/native event object 不进入 gate、Data peer 或 wire。

---

## 3. Ownership

Source owns：

```text
Keyboard / Pointer / Gamepad / x.* canonical payload creation
channel availability
current sample for .state
future physical/canonical transition
```

Input gate/publisher owns：

```text
InputTarget/Frame/Activation applicability
Interest
Data currentness
Reset decision
lease teardown
State/Event/Reset ordering
coalescing/backpressure
```

Producer不能选择 `frameId` / `activationId`，也不能直接调用 Data peer。

---

## 4. Canonical Transition

标准 stateful family在一个 physical transition 同时改变 State并产生 Event时，source先把 post-transition facts交给 gate；若 sibling `.state` Effective，publisher最终必须观察为：

```text
post-transition State
→ corresponding Event
```

repeat 等“不改变 State”的 Event不要求虚构额外 State。

如果 sibling `.state` 不 Effective，不为了 Event发送未订阅 State。

Event/Reset barrier 与 coalescing规则属于 M10/02 publisher，不由 source重复实现。

---

## 5. Deterministic M10 Source

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
write Data carrier/peer directly
construct input.state/event/reset wire object
set InputTarget
inject Interest Registry
select Frame/Activation
bypass input gate/publisher
```

M14 Browser source必须进入同一 construction seam 和 input gate，不得重做 authority semantics。

---

## 6. Browser / PWA Placement

```text
M10
    deterministic canonical source
    proves role semantics

M14 Desktop
    DOM / Pointer / Gamepad APIs
    physical facts → same canonical source seam

M16 PWA
    same logical Renderer input semantics
```

因此 M10 不新增 Platform Port。Input environment属于 concrete Renderer product composition。

---

## 7. Abstraction Budget

允许：

```text
one narrow holder-lifetime input source seam
small deterministic test implementation
small browser realization later in M14
```

禁止：

```text
InputDeviceRegistry
GenericProducer<T>
plugin system
EventBus / Observable framework
Action/Command mapping
focus/gesture framework
platform detection in Renderer Core
```

---

## 8. Done

M10/03 必须证明：

```text
source injected once for one holder lifetime
old holder/source cannot affect replacement holder
unavailable channel cannot produce ordinary input
availability return rebaselines .state when Effective
paired transition preserves State-before-Event
source cannot choose authority identity or bypass publisher
canonical payload validation remains @loomrealm/data responsibility
```

下一步：[M10 / 04 — Vertical Integration](M10_04_VERTICAL_INTEGRATION.md)。
