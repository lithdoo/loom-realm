# M10 / 03 — Renderer Input Producers

> 状态：**Implemented / Qualified**
> 阶段：M10 User Input  
> 落地顺序：03  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md)  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> 目标：冻结 Renderer holder 的唯一 canonical input source seam；M10 使用 deterministic realization，真实 BrowserWindow/DOM mapping 留到 M14。编码阶段不得再选择另一套 producer lifecycle/API。

> **Source 只描述 canonical device facts。它不知道 Frame、Activation、Interest、Data authority、Subsystem 或 wire ordering。**

---

## 1. Exact Construction Surface

现有 M8 factory保持兼容并增加第二个 optional 参数：

```ts
export function createRendererControlHolder(
  data?: RendererDataBinding,
  input?: RendererInputSource,
): RendererControlHolder;
```

没有 Input source 时：

```text
all Producer(C) unavailable
→ Renderer Control/Data仍正常工作
→ no ordinary User Input
```

不新增 `RendererPlatform`、Platform Port、producer registry 或 options service locator。

---

## 2. Exact Source Surface

M10 root-export：

```ts
export type RendererInputSourceChange =
  | {
      readonly kind: "availability";
      readonly channel: InputChannelV1;
      readonly available: boolean;
    }
  | {
      readonly kind: "state";
      readonly channel: InputStateChannelV1;
      readonly payload: InputStateV1["payload"];
    }
  | {
      readonly kind: "event";
      readonly channel: InputEventChannelV1;
      readonly payload: InputEventV1["payload"];
    };

export interface RendererInputSource {
  start(
    emit: (change: RendererInputSourceChange) => void,
  ): () => void;
}
```

`InputChannelV1` / `InputStateChannelV1` / `InputEventChannelV1` / `InputStateV1` / `InputEventV1` 全部来自现有 `@loomrealm/data` root export。这样 `@loomrealm/renderer` **不新增对 `@loomrealm/wire` 的直接 dependency**。

Source payload仍是 exact Data/User Input JSON object payload model；这是 trusted Renderer integration surface，不是 business author API。

`start()` 返回的 stop function必须 idempotent。

---

## 3. Holder / Control Lifetime

Source **object identity** 在 holder construction时固定；没有 runtime replace/register API。

现有 `RendererControlHolder` 可 sequential install新的 current Control peer，因此必须区分：

```text
source object lifetime
    = RendererControlHolder object lifetime

active source subscription lifetime
    = one current installed Control peer epoch
```

固定 mechanics：

```text
no current Control peer
    → no active source subscription

current Control peer installed
    → discard previous producer-local facts
    → start source exactly once for this current epoch

current Control peer replaced/terminal
    → invalidate this source subscription synchronously
    → call its stop() best-effort/idempotently
    → all Producer(C)=unavailable for retired epoch

later current Control peer installed on same holder
    → reuse same construction-time source object
    → call start() again for a fresh subscription/facts baseline
```

At most one `start()` subscription active at a time。

late `emit(...)` from an invalidated/stopped subscription MUST be ignored by subscription identity/currentness check；不得影响新的 current Control/Data slot。

因此：

```text
Control peer terminal != source object destroyed
same holder reconnect MAY reuse same source object
new holder has its own source injection
```

---

## 4. Start / Stop Failure Boundary

Source是 trusted local integration，但其 lifecycle failure不等于 Main/Data authority failure。

`start(emit)` 必须按一个 local bootstrap attempt处理：

```text
producer facts reset empty/unavailable
→ call source.start(emit)
→ if it returns a function, subscription installed
→ otherwise start failure
```

如果 `start()` throw、返回非 function、或在返回前发生 local bootstrap exception：

```text
invalidate this attempted subscription
→ discard every producer fact emitted by this failed start
→ Producer(C)=unavailable for this current Control epoch
→ no retry within the same Control epoch
→ Control peer/Data peers remain current
```

later fresh current Control epoch MAY call `start()` again。

`stop()` 先失效 subscription/facts，再 best-effort调用；stop throw被 contained，不恢复 old Producer facts，也不 terminalize Control/Data。

这不是 retry framework；每个 current Control epoch最多一次 start attempt。

---

## 5. Fresh Source Bootstrap

每次 successful `start()` 建立 fresh producer facts，不继承上一 subscription。

Start bootstrap允许同步 emit：

```text
current .state samples
availability facts
```

但 MUST NOT replay historical `.event`；Event从 successful current subscription建立后只表示 future physical/canonical event。

如果 source需要为 available `.state` channel建立 current事实：

```text
emit current State sample
→ emit availability=true
```

Start返回前已经 emit 的 facts只有在 `start()`最终成功时才一起 commit为 current producer facts；start failure时全部丢弃。

---

## 6. Producer-local Facts

Input gate从 current active source subscription只保存：

```text
availability per channel
latest current canonical payload per .state channel
```

新的 source subscription从：

```text
all channels unavailable
no cached State sample
```

开始。

### State channel availability

`.state` channel只有同时存在：

```text
availability = true
AND current State sample exists
```

才算 Producer available。

source 在首次/重新变 available 前必须先 emit current self-contained State sample，再 emit `availability=true`；gate在没有 current sample时不得把 state channel视为 available。

`availability=false`：

```text
Producer false immediately
→ clear cached producer-local State sample for that channel
→ apply M10/02 producer-loss Reset/rebaseline semantics if it had been Effective
```

return时必须 fresh sample → available=true，保证 false→true baseline不是旧 cache。

### Event channel availability

`.event` 只需要 availability fact；false时停止 future Event，true后只允许 future Event。

---

## 7. Source Change Processing

```text
state change
    → validate current subscription identity
    → update producer-local current sample
    → if channel Effective, offer current State to bounded publisher

event change
    → validate current subscription identity
    → only if event channel Effective, offer future Event to publisher

availability change
    → update Producer(C)
    → recompute Effective
```

Source不能选择 `frameId` / `activationId`，也不能直接调用 Data peer。

Trusted source的 payload canonical validity最终仍由 `@loomrealm/data` outbound validation保证；Source不得依赖 gate替它修复/normalize非法 payload。

---

## 8. Canonical Transition Ordering

标准 stateful family在一个 physical transition同时改变 State并产生 Event时，source必须按：

```text
emit post-transition State
→ emit corresponding Event
```

Input gate先更新 producer-local sample；如果 sibling `.state` Effective，M10/02 publisher最终观察：

```text
post-transition State
→ corresponding Event
```

repeat 等“不改变 State”的 Event不要求虚构额外 State。

如果 sibling `.state` 不 Effective，不为了 Event发送未订阅 State。

Event/Reset barrier 与 coalescing属于 M10/02 publisher，不由 source重复实现。

---

## 9. Deterministic M10 Source

M10 qualification使用一个真实实现 `RendererInputSource` surface 的 deterministic source，可控制：

```text
start success/failure
stop throw
start/stop count
channel availability
current State sample
State transition
Event emission
paired State+Event transition
late emit after stop
```

每次 successful `start()` 必须 materialize该时刻的 fresh producer facts，而不是 replay上一 subscription历史。

Fixture 不得：

```text
write Data carrier/peer directly
construct input.state/event/reset envelope
set InputTarget
inject Interest Registry
select Frame/Activation
bypass input gate/publisher
```

---

## 10. Browser / PWA Placement

```text
M10
    deterministic RendererInputSource
    proves role semantics

M14 Desktop
    DOM Keyboard/Pointer/Gamepad mapping
    physical facts → exact same RendererInputSource seam

M16 PWA
    same logical source/gate semantics
```

M14 real source必须能在每次 successful `start()` 提供 fresh canonical current State samples；不能把 DOM Event object交给 Core。

---

## 11. Dependency / Abstraction Budget

`@loomrealm/renderer` M10 runtime dependencies remain exactly current set：

```text
@loomrealm/renderer-control
@loomrealm/platform-ports
@loomrealm/data
```

M10 source surface复用 `@loomrealm/data` exported types，不添加 `@loomrealm/wire` dependency。

允许：

```text
one RendererInputSource interface
one narrow discriminated change union
one active subscription token/currentness check
one local start bootstrap staging record
small deterministic implementation
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
Platform input capability/port
runtime mutable source replacement
source retry/backoff loop
```

---

## 12. Done

M10/03 必须证明：

```text
factory old one-argument calls remain valid
renderer package dependency set unchanged
source public types resolve through @loomrealm/data only
source object injected once at holder construction
0..1 active source subscription
current Control replacement/terminal stops old subscription
same holder later Control install restarts same source object with fresh facts
late stopped-source emit ignored
start throw/non-function return discards partial facts and leaves Control/Data healthy
no same-Control start retry
stop throw contained after local invalidation
start does not replay historical Event
fresh .state availability requires fresh current sample
availability loss clears producer sample + applies Reset semantics
availability return fresh-baselines .state when Effective
paired transition preserves State-before-Event
source cannot choose authority identity or bypass publisher
canonical payload validation remains @loomrealm/data responsibility
```

下一步：[M10 / 04 — Vertical Integration](M10_04_VERTICAL_INTEGRATION.md)。
