# M10 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Ready for Implementation**  
> 阶段：M10 User Input  
> 落地顺序：05  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md) → [M10 / 03](M10_03_RENDERER_INPUT_PRODUCERS.md) → [M10 / 04](M10_04_VERTICAL_INTEGRATION.md)  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> Conformance：[User Input v1 Conformance](doc/15-contracts/user-input-conformance-v1.md)  
> 修正决策：[ADR 0029](doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 目标：冻结唯一 M10 implementation + qualification boundary；从本文起实现阶段不得再决定新的 public SDK semantics、authority/lifetime、source lifecycle 或 backpressure policy。

> **M10 closure = 在 qualified M9 Data lifecycle 上，Main InputTarget、Subsystem Desired Interest、Renderer Producer经 current Data收敛为 deterministic business input；State保持 current truth，Event保持 future-only，所有旧 lease/carrier/source facts均不可复活。**

---

## 1. Closure Scope

必须实现：

```text
@loomrealm/subsystem
    exact Input author types + SubsystemScope.createInputListener
    exactly one InputManager / instance
    listener contribution + registration semantics
    Desired Interest aggregation + local validation
    retained detached immutable State + delivery gate
    deterministic synchronous handler invocation order
    async handler isolation from Data flow control
    latest-only Interest publisher

@loomrealm/renderer
    exact createRendererControlHolder(data?, input?) extension
    exact RendererInputSource surface
    current Interest Registry per Data peer
    Effective gate
    bounded State/Event/Reset publisher
    current-Control-scoped source subscription

existing @loomrealm/data
    User Input codecs/typed peers/serialized send reused unchanged

M9 Desktop vertical
    real paired Data lifecycle consumed by M10 business input
```

M10 不改变 Main InputTarget authority，不新增 Platform Port，不新增 wire message/version。

---

## 2. No Remaining Design Decisions

实现阶段 **可以**选择：

```text
private class/function names
private Map/Set/array layout
private queue capacity finite constant
private JSON detach/freeze helper implementation
private source-subscription token representation
private test file split
```

实现阶段 **不得再选择**：

```text
handler receives payload vs envelope
on() whether changes Interest
setChannels whether deletes handlers
unsubscribe/close idempotence
handler invocation order
mutation during delivery current-vs-next effect
whether async handlers block Data reader
recoverable frame.call rejection vs State convergence ordering
Renderer source construction API/lifetime/restart behavior
Event/Reset barrier behavior
Data/Control/Activation authority semantics
```

这些已由 M10/01–04 冻结。

---

## 3. Abstraction Budget

允许：

```text
one InputManager per Subsystem instance
listener contribution + registration records
one derived DesiredRegistry
minimal immutable retained State
0..1 inFlight + pendingLatest Interest publication
one Renderer input gate per current Data slot
one bounded input publisher
one construction-time RendererInputSource object
0..1 current source subscription
```

禁止：

```text
Generic Input / Queue / Authorization framework
InputDeviceRegistry / plugin system
Action/Command mapping
EventBus / Observable / Store
Frame/InputTarget/Activation shadow registry
Data generation allocator for M10 tests
cross-plane ACK/revision/barrier
second Data reader/writer
retry/replay/history
BrowserWindow/DOM composition
new Input error hierarchy solely for M10
```

---

## 4. Exact Subsystem SDK Evidence

编译/运行 evidence必须证明：

```text
root exports exact InputChannel/InputPayload/InputHandler/InputListener surface
SubsystemScope exposes createInputListener
standard channel maps to exact canonical payload type
custom x.* maps to JSON object payload
handler sees payload only
business Definition needs only @loomrealm/subsystem import
```

Listener behavior：

```text
channels own Interest contribution
on/unsubscribe never change Interest
channels=[] valid
duplicate contribution invalid
setChannels preserves handler registrations
removed handler registration becomes dormant
re-add reactivates same registration
unsubscribe idempotent
close idempotent
on/setChannels after close → TypeError
foreign Frame → TypeError
known local closed Frame → FrameClosedError
hard-limit overflow → RangeError
invalid mutation leaves local/wire/Data state unchanged
```

---

## 5. Retained State / Handler Evidence

必须证明：

```text
retained author State detached/deep-immutable
business mutation cannot corrupt later baseline
new active .state registration gets one synchronous retained baseline
reactivated dormant .state handler gets current baseline when retained state still exists
union true→false clears retained state
.event registration/reactivation gets no history
```

Determinism：

```text
same-channel handlers invoked by registration order
multi-channel local convergence uses canonical ASCII channel order
stable registration snapshot captured before delivery
handler unsubscribe/close/setChannels during delivery affects subsequent delivery only
sync throw contained; later handlers still attempted
Promise rejection contained
Promise never settles does not stall later handlers/Data reader
async completion not awaited by @loomrealm/data dispatch
```

---

## 6. Mutation Gate / ADR 0029 Evidence

```text
pending commit-sensitive mutation
→ current same-Activation State retained but not delivered
→ Event dropped
→ current Reset clears retained/suppressed State

known no-commit + same Activation reopen
→ mutation eligibility restored
→ latest retained State handlers synchronously attempted
→ only then frame.call recoverable rejection becomes observable
→ no Event replay

commit / Activation revoke / admin suspend / terminal
→ suppressed old-Activation State discarded
```

Qualification必须明确断言：business `catch` 开始时，同步 State-handler side effect已经发生；不等待 async handler Promise settlement。

---

## 7. Renderer Gate / Publisher Evidence

必须证明：

```text
Effective = Data × InputTarget × active F/A × Interest × Producer
Interest-first and authority-first converge
unknown/stale Interest stays inert
fresh state Effective transition sends self-contained baseline
.event begins future-only
same-carrier target replacement orders Reset(old) before new ordinary input
producer loss Reset/rebaseline correct
Control loss disables input immediately
Data retirement discards Registry/publisher state
old Data/Control facts cannot emit after replacement
```

Ordering/backpressure：

```text
State latest-pending coalescing only between barriers
Event never coalesces/replays
Event is global State-coalescing barrier
Reset is global State-coalescing barrier
State cannot move across retained Event/Reset
standard paired transition: post-transition State before Event
bounded Event overflow drops before emitted
surviving Event order preserved
Input backlog does not overflow @loomrealm/data generic writer into local-fatal
lease/Data retirement discards obsolete not-started pending input
```

具体 Event queue capacity不形成 compatibility surface。

---

## 8. Renderer Source Evidence

Exact surface：

```text
createRendererControlHolder(data?, input?)
RendererInputSource.start(emit) → idempotent stop
RendererInputSourceChange = availability | state | event
```

必须证明：

```text
old one-argument factory call remains valid
source object fixed at holder construction
no current Control → no active subscription
current Control install → exactly one start
replacement/terminal → invalidate + stop old subscription
late old emit ignored
same holder later current Control → same source object restarted
fresh subscription inherits no old producer facts
state availability requires current sample
state loss clears producer sample
state return provides fresh sample before available=true
source cannot choose frameId/activationId or bypass publisher/Data peer
```

M14 real browser mapping必须复用这一 exact seam。

---

## 9. Real Vertical Evidence

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

仅 physical canonical input source可 deterministic。

至少覆盖：

```text
initial active Frame input
exact SDK contribution/handler semantics
Interest-first / authority-first
nested child call / fresh caller Activation
recoverable frame.call no-commit State-before-rejection convergence
committed call suppresses old-Activation retained State
same-generation Data reconnect / fresh State / no Event replay
fresh-generation role fixture
Control replacement + source restart / late-source isolation
producer loss/return
handler sync/async isolation
Frame close cleanup
```

Fresh-generation behavior使用 role-level deterministic Data fixture证明；不得为此提前扩大 Main generation machinery。

---

## 10. Formal Conformance Boundary

Current User Input v1：

```text
protocolVersion = 1
fixtureSetRevision = 2
```

M10 必须通过所有 platform-independent Renderer/Subsystem protocol role obligations，并通过本文新增的 exact SDK/source qualification cases。

SDK/source cases是 `@loomrealm/subsystem` / `@loomrealm/renderer` implementation qualification；它们不改变 User Input wire version、schema 或 formal cross-platform transport claim。

M10 **不得**宣称 Hostra/PWA full transport-equivalence conformance；PWA physical realization尚属 M16。M10 closure wording固定为：

```text
User Input v1 Renderer/Subsystem role implementation
qualified against current platform-independent fixtureSetRevision=2
plus frozen M10 SDK/source projection semantics
on Hostra/Desktop physical Data lifecycle
```

完整 cross-platform Profile/User Input conformance claim留到 M16。

---

## 11. Regression Boundary

M10 必须保持：

```text
M3 Runtime Control semantics unchanged
M5 Main Frame/Activation/InputTarget authority unchanged
M7 Renderer currentness/replacement unchanged
M8 Data role currentness/failure isolation unchanged
M9 Broker paired installation/recovery unchanged
Data failure != Runtime failure / Frame unwind
```

除 ADR 0029 明确的 Subsystem-local State retention correction外，不修改 Frozen User Input v1 wire/authority/lifetime模型。

---

## 12. CI Gate

实现完成时 root 新增：

```text
npm run test:m10
```

至少组合：

```text
M9 dependency/build gates
current User Input fixtureSetRevision=2
Subsystem exact SDK surface/type tests
Subsystem InputManager lifecycle/order/async tests
Renderer gate/publisher/source lifecycle tests
real M10 vertical
```

文档阶段不提前加入空 `test:m10`。

---

## 13. Closure Claim

文档现在允许声明：

```text
M10 design = Implementation Frozen / Ready for Implementation
no further design round is expected before coding
```

M10 实现与 qualification通过后才允许声明：

```text
Subsystem InputListener/InputManager implemented
Renderer User Input gate/publisher/source integration implemented
User Input v1 current platform-independent role semantics qualified
frozen M10 SDK/source projection qualified
fresh Activation/Data input baseline qualified on Desktop M9 lifecycle
```

不得声明：

```text
Desktop BrowserWindow input complete
Render complete
Content complete
PWA / full cross-platform User Input conformance complete
```

这些分别属于 M14、M11、M12、M16。
