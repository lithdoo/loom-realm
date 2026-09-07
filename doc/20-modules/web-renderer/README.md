# Web 渲染端模块设计

> 层级：模块设计  
> 状态：M8 Implemented / Qualified；**M10 Input Implemented / Qualified**；**M11 Render Implementation Frozen / Ready**  
> 稳定程度：M8 Implementation Closed / M10 Implementation Closed / M11 implementation shape Frozen  
> 主要定义：Renderer Control holder、per-subsystem Data reconciliation、M10 Input gate/publisher/source placement、M11 internal Render Store placement  
> 依赖：[渲染系统](../../10-architecture/rendering-system.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)、[Renderer Data Profile v1](../../15-contracts/renderer-data-profile-v1.md)、[User Input v1](../../15-contracts/user-input-v1.md)、[Render Update v1](../../15-contracts/render-update-v1.md)、[ADR 0029](../../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> M10 实施：[M10 / 02](https://github.com/lithdoo/loom-realm/blob/main/M10_02_RENDERER_INPUT_GATE.md) · [M10 / 03](https://github.com/lithdoo/loom-realm/blob/main/M10_03_RENDERER_INPUT_PRODUCERS.md)  
> M11 实施：[M11 / 03](https://github.com/lithdoo/loom-realm/blob/main/M11_03_RENDERER_STORE.md) · [M11 / 05](https://github.com/lithdoo/loom-realm/blob/main/M11_05_QUALIFICATION_CLOSURE.md)  
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

M8已实现 Control-driven Data reconciliation。M10只在现有 holder/Data slot上增加 Input local state，不创建独立 connection/currentness layer。M11同样复用该 Data slot/currentness，不创建独立 Render Session/Connection Manager。

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

## 12. M11 Render Placement — Frozen

M11 receiver Store挂在既有 desired Data identity：

```text
current Control peer
+ subsystemKey
+ generation
+ dataProfile
```

而 current `RendererDataPeer` / Registry / baseline / revision 是 carrier-local currentness。

Store internal state至少表达：

```text
current Registry
per-Domain unbaselined | baselined(revision)
current committed zIndex/tree
generation-scoped observed Domain/Node one-shot history
```

same-generation carrier replacement：

```text
old peer/current baseline retired
one-shot history retained
last committed Store MAY remain stale presentation cache
fresh peer
→ render.domains
→ fresh Snapshot each current Domain
→ current replica rebuilt
```

fresh generation建立 fresh Render identity universe；由 receiver-role deterministic fixture证明，不为测试新增 generation authority。

Render handlers固定：

```text
valid Registry/Snapshot/Patch commit
OR well-formed Event deliver/drop
→ DataInboundDisposition.accepted

schema/limit invalid
OR authoritative continuity invalid
→ DataInboundDisposition.protocol-fatal
→ existing @loomrealm/data retires current Data peer
```

well-formed stale/missing-target Event只 drop，不 terminalize Data；failed Snapshot/Patch不得 partial mutate current replica。

M11 **不新增 public `@loomrealm/renderer` Render/presentation API**。不得 root-export `RenderStore`、RenderSession、subscription/EventBus/PresentationAdapter。Store与 qualification observation seam保持 package-internal/test-only；physical presentation consumer属于 M14。

```text
Frame close != Domain destroy
Data retire != business Domain destroy
Render/Data failure != Runtime failure / Frame unwind
```

---

## 13. Physical Realization

```text
M14 Hostra Desktop
    BrowserWindow
    Renderer Control WebSocket
    M9 Data WebSocket Broker
    real DOM/Gamepad RendererInputSource
    M11 internal current Render replica → presentation
    M12 Content → resource resolution

M16 PWA
    Window + MessagePort Control/Data
    same logical Input/Render semantics
    complete Render transport-equivalence claim
```

M10/M11 都不新增 Platform Port，也不实现 BrowserWindow。

M14 browser input必须实现 exact M10 `RendererInputSource`，不得另开 DOM→Data shortcut。M14 presentation消费 M11 internal current replica，不反向改变 M11 receiver semantics/public boundary。

---

## 14. Tests / Invariants

M10必须继续证明：

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

M11 additionally必须证明：

```text
no new public Renderer Render exports
Registry/Snapshot/Patch atomic application
protocol-fatal vs well-formed stale-Event drop distinction
same-generation reconnect preserves identity history but resets carrier baseline
old peer cannot mutate current replica
fresh-generation reset by receiver fixture
Render failure does not affect Runtime/Frame authority
```

Final invariants：

1. Renderer不是 Frame RPC participant；
2. Control holder仍是唯一 local Control current record；
3. M8 Data currentness不被 Input/Render重复实现；
4. M10 Input只组合 current facts；
5. one construction-time source object，无 producer registry；
6. 0..1 current-Control source subscription，旧 callback不可复活；
7. source local failure不改变 Control/Data authority；
8. one bounded Input publisher per current Data slot；
9. M11 Render Store挂现有 Data slot并保持 internal-only；
10. same-generation Render identity history不等于 carrier baseline；
11. Input/Data/Frame/Render lifetimes保持独立；
12. Hostra/PWA physical差异不得改变 logical Input/Render semantics。
