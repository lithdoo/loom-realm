# Web 渲染端模块设计

> 层级：模块设计  
> 状态：M8 Implemented / Qualified；**M10 Input Implemented / Qualification Pending**
> 稳定程度：M8 Implementation Closed / M10 Regression Verified
> 主要定义：Renderer Control holder、per-subsystem Data reconciliation、M10 Input gate/publisher/source placement、M11+ Render placement  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[ADR 0029](../../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> M10 实施：[M10 / 02](https://github.com/lithdoo/loom-realm/blob/main/M10_02_RENDERER_INPUT_GATE.md) · [M10 / 03](https://github.com/lithdoo/loom-realm/blob/main/M10_03_RENDERER_INPUT_PRODUCERS.md)
> 最近复核：2026-09-07

Renderer 不是 Frame/Call participant。它镜像 Main committed authority，并在 current Data peers上执行 Input/Render child protocol role behavior。

---

## 1. Current Shape

```text
@loomrealm/renderer
└── one Control holder
    ├── current {peer,snapshot} | null
    ├── per-subsystem Data slot
    │   ├── 0..1 current RendererDataPeer
    │   ├── 0..1 pending acquire
    │   └── 0..1 failed desired identity
    ├── optional construction-time RendererInputSource object
    └── 0..1 active source subscription for current Control peer
```

M8已实现 Control-driven Data reconciliation。M10只在现有 holder/Data slot上增加 Input local state，不创建独立 connection/currentness layer。

---

## 2. Authority / Currentness

Main publishes committed：

```text
Runtime projection
Frame / Activation / InputTarget
DataAuthority {subsystemKey,generation,dataProfile}
```

Renderer不得：

```text
create/recover Frame or Activation
modify Stack
compute failure unwind
create InputTarget from focus/Interest
revalidate Control revision/session/schema
mint Data authority/currentness
```

Control snapshot whole-replace；local current holder不是 Main remote-currentness proof。Old peer late state/terminal不得影响 replacement current。

---

## 3. Exact M10 Construction Surface

Existing M8 call remains source-compatible：

```ts
createRendererControlHolder(data?: RendererDataBinding)
```

M10 exact additive surface：

```ts
createRendererControlHolder(
  data?: RendererDataBinding,
  input?: RendererInputSource,
): RendererControlHolder
```

No second factory, no mutable `setInputSource`, no producer registry。

No source：all Producer unavailable；Control/Data functionality unchanged。

---

## 4. Data Slot

Desired Data identity remains exactly：

```text
current Control peer
+ subsystemKey
+ generation
+ dataProfile
```

Data loss/provision failure不等于 Runtime/Frame failure。

fresh current Data peer建立新的 carrier-local Input/Render publication state；旧 slot的 handler/publisher settlement不得复活。

---

## 5. M10 Effective Input Gate

对 `(S,F,A,C)`：

```text
Effective
=
current matching Data
∧ current Control snapshot
∧ Main InputTarget == (S,F,A)
∧ mirrored F active with activationId A
∧ C ∈ current Interest[F]
∧ Producer(C) available
```

Interest / focus / component / carrier existence不能创建 authority。

Control 与 Data没有 cross-connection total order；Interest-first / Authority-first都通过 current facts重算收敛，不增加 ACK/revision join/barrier。

ADR 0029 的 Subsystem mutation gate不进入 Renderer Effective；Renderer无需知道业务是否暂时 suppress delivery。

---

## 6. Input Slot State

每个 current Data slot的 Input state只需要：

```text
current full Interest Registry
current Effective facts
one bounded User Input publisher
```

不得创建：

```text
InputTarget registry
Frame/Activation shadow state machine
Input Store/EventBus
currentness lease/heartbeat
```

Data retire立即销毁该 carrier-local Registry/Effective/publisher state。

---

## 7. Bounded Publisher

User Input coalescing/backpressure由 Renderer role拥有；`@loomrealm/data`只负责 validated serialized send。

```text
0..1 Data send inFlight
bounded pending input work
```

Frozen rules：

```text
State = latest pending per state channel between barriers
Event = ordered / no coalesce / bounded / may drop before emitted
Event = global State-coalescing barrier
Reset = teardown + global State-coalescing barrier
```

State不得跨 Event/Reset移动。Event overflow必须在 generic Data writer overflow之前 local-drop；不能把普通 Input backlog变成 Data local-fatal。

---

## 8. Exact RendererInputSource

Trusted Renderer integration surface复用现有 `@loomrealm/data` root types：

```ts
export type RendererInputSourceChange =
  | {
      kind: "availability";
      channel: InputChannelV1;
      available: boolean;
    }
  | {
      kind: "state";
      channel: InputStateChannelV1;
      payload: InputStateV1["payload"];
    }
  | {
      kind: "event";
      channel: InputEventChannelV1;
      payload: InputEventV1["payload"];
    };

export interface RendererInputSource {
  start(
    emit: (change: RendererInputSourceChange) => void,
  ): () => void;
}
```

这不增加 `@loomrealm/renderer → @loomrealm/wire` direct dependency；M10 renderer dependencies继续是 renderer-control + platform-ports + data。

`start()` returned stop function idempotent。

Source不知道 Frame/Activation/Interest/Data authority/wire envelope，也不能直接调用 Data peer。

---

## 9. Source Lifetime / Fresh Facts

Source object construction-time固定在 holder；active subscription跟 **current installed Control peer epoch** 走：

```text
no current Control
    → no active source subscription

Control current installed
    → producer facts reset empty/unavailable
    → source.start exactly once for this epoch

Control replaced/terminal
    → invalidate source callback identity synchronously
    → stop old subscription best-effort
    → old Producer facts invalid

same holder later installs new Control
    → same source object start again
    → fresh facts only
```

At most one active source subscription。Late emit from stopped/invalidated subscription MUST ignore。

`.state` Producer available requires：

```text
availability=true
AND fresh current sample exists in this source subscription
```

availability false clears cached producer sample；return必须 emit fresh sample before available=true。

Start bootstrap MUST NOT replay historical Event。

因此 Control peer terminal不是“source object永久销毁”；同一 holder后续 connect可以重新使用 source，而不会复用旧 producer facts。

---

## 10. Source Failure Boundary

每个 current Control epoch最多一次 `start()` attempt。

```text
start throws
OR returns non-function
OR emits partial facts then fails
    → invalidate attempted subscription
    → discard all partial producer facts
    → Producer unavailable for this Control epoch
    → no same-epoch retry
    → Control/Data remain current
```

later fresh Control epoch可以重新 `start()`。

Stop顺序：

```text
invalidate subscription/facts locally
→ call stop() best-effort
```

stop throw被 contained；不得 terminalize Control/Data或恢复 old producer facts。

---

## 11. Lease / Producer Transitions

same-carrier old lease → new lease：

```text
old Effective false immediately
→ discard obsolete not-started old State/Event
→ best-effort Reset(old)
→ first new ordinary input only after Reset barrier
```

`.state` producer loss：clear producer sample → Reset current lease → rebaseline其它 remaining Effective states；return时 fresh sample + fresh baseline。

`.event` producer loss/return只影响 future Events。

标准 paired transition source顺序：post-transition State change → Event change。

---

## 12. M11 Render Placement

Subsystem拥有 Domain Registry/State/revision；Renderer维护 authoritative replica + local presentation。

fresh Data：

```text
render.domains
→ fresh snapshot each Domain
→ patch/event
```

```text
Frame close != Domain destroy
Data retire != authoritative Domain destroy
```

Renderer MAY保留 stale presentation cache，但它不是 current authority proof。

---

## 13. Physical Realization

```text
M14 Hostra Desktop
    BrowserWindow
    Renderer Control WebSocket
    M9 Data WebSocket Broker
    real DOM/Gamepad RendererInputSource
    presentation

M16 PWA
    Window + MessagePort Control/Data
    same logical Input/Render semantics
```

M10 不新增 Platform Port，也不实现 BrowserWindow。

M14 browser input必须实现 exact M10 `RendererInputSource`，不得另开 DOM→Data shortcut。

---

## 14. Tests / Invariants

M10必须证明：

```text
existing createRendererControlHolder(data?) usage remains valid
exact second optional source argument
renderer dependency set unchanged
0..1 active source subscription
Control replacement/terminal source invalidation
same holder reconnect source restart
late old source callback ignored
start failure discards partial facts / no same-epoch retry
stop failure contained
fresh state sample required for availability
Interest-first / Authority-first convergence
fresh Activation/Data state baseline
same-carrier Reset-before-new-input
Event/Reset barrier correctness
bounded Event overflow without Data local-fatal
producer loss/return
old holder/Data slot cannot emit after replacement
```

Final invariants：

1. Renderer不是 Frame RPC participant；
2. Control holder仍是唯一 local Control current record；
3. M8 Data currentness不被 Input重复实现；
4. M10 Input只组合 current facts；
5. one construction-time source object，无 producer registry；
6. 0..1 current-Control source subscription，旧 callback不可复活；
7. source local failure不改变 Control/Data authority；
8. one bounded publisher per current Data slot；
9. Input/Data/Frame/Render lifetimes保持独立；
10. Hostra/PWA physical差异不得改变 logical User Input semantics。
