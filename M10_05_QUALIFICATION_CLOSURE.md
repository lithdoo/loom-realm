# M10 / 05 — Qualification and Closure

> 状态：**Implementation Frozen / Ready for Implementation**  
> 阶段：M10 User Input  
> 落地顺序：05  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md) → [M10 / 03](M10_03_RENDERER_INPUT_PRODUCERS.md) → [M10 / 04](M10_04_VERTICAL_INTEGRATION.md)  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> Conformance：[User Input v1 Conformance](doc/15-contracts/user-input-conformance-v1.md)  
> 修正决策：[ADR 0029](doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)

> **M10 closure = 在 qualified M9 Data lifecycle 上，Main InputTarget、Subsystem Desired Interest、Renderer Producer经 current Data收敛为 deterministic business input；State保持 current truth，Event保持 future-only，旧 lease/carrier/source facts不可复活。**

---

## 1. Closure Scope

必须实现：

```text
@loomrealm/subsystem
    minimal exact Input author surface
    exactly one InputManager / instance
    listener contribution + registration semantics
    Desired Interest aggregation + validation
    retained immutable State + delivery gate
    deterministic synchronous delivery semantics
    async handler isolation
    latest-only Interest publisher

@loomrealm/renderer
    createRendererControlHolder(data?, input?)
    RendererInputSource
    current Interest Registry per Data peer
    Effective gate
    bounded State/Event/Reset publisher
    current-Control-scoped source subscription
    local start/stop failure containment

existing @loomrealm/data
    typed User Input mechanics reused unchanged

M9 Desktop vertical
    real paired Data lifecycle consumed by M10
```

M10不改变 Main InputTarget authority，不新增 Platform Port、wire message/version或 package。

---

## 2. No Remaining Design Decisions

实现阶段可以选择：

```text
private class/function names
Map/Set/array layout
how registration order is represented internally
finite Event queue capacity
JSON detach/freeze implementation
source-subscription token representation
one-time FrameRuntime binding representation
test file split
```

实现阶段不得再选择：

```text
root Input export set
handler payload vs envelope
on() whether changes Interest
setChannels whether deletes handlers
unsubscribe/close idempotence
observable handler order
mutation during delivery current-vs-next effect
whether async handlers block Data reader
recoverable frame.call rejection vs State convergence ordering
Renderer source API/lifetime/restart/failure behavior
Event/Reset barrier behavior
Data/Control/Activation authority semantics
```

---

## 3. Abstraction Budget

允许：

```text
one InputManager
listener contribution + registration records
one DesiredRegistry
minimal immutable retained State
0..1 inFlight + pendingLatest Interest publication
one Renderer input gate per current Data slot
one bounded input publisher
one construction-time RendererInputSource
0..1 current source subscription
one local source-start staging record
```

禁止：

```text
Generic Input / Queue / Authorization framework
InputDeviceRegistry / plugin system
Action/Command mapping
EventBus / Observable / Store
registration ordinal/counter abstraction required only by docs
extra root supporting aliases only for symmetry
Frame/InputTarget/Activation shadow registry
Data generation allocator for M10 tests
cross-plane ACK/revision/barrier
second Data reader/writer
retry/replay/history
BrowserWindow/DOM composition
new Input error hierarchy solely for M10
generic source retry/backoff framework
```

---

## 4. Exact Subsystem SDK Evidence

Root exports exactly：

```text
InputStateChannel
InputEventChannel
InputChannel
KeyboardStateInput
KeyboardEventInput
PointerStateInput
PointerEventInput
GamepadStateInput
GamepadEventInput
InputPayload
InputHandler
Unsubscribe
CreateInputListenerOptions
InputListener
```

以及 `SubsystemScope.createInputListener`。

必须证明：

```text
six standard payload names structurally match User Input v1 payloads
custom x.* resolves through InputPayload<C> to bounded JSON object shape
supporting nested types are obtainable through payload indexed access
supporting aliases are not separately root-exported merely for symmetry
handler sees payload only
business Definition needs only @loomrealm/subsystem import
```

Listener behavior：

```text
channels own Interest contribution
on/unsubscribe never change Interest
channels=[] valid
duplicate contribution invalid
setChannels preserves registrations
removed registration dormant / re-add reactivates
unsubscribe idempotent
close idempotent
on/setChannels after close → TypeError
foreign Frame → TypeError
known local closed Frame → FrameClosedError
hard-limit overflow → RangeError
invalid mutation leaves local/wire/Data state unchanged
```

Bootstrap evidence必须证明 InputManager可在 Definition factory前创建并由 scope引用，FrameRuntime随后一次性绑定；不得创建 dummy/shadow Frame registry。

---

## 5. Retained State / Handler Evidence

必须证明：

```text
retained State detached/deep-immutable
business mutation cannot corrupt later baseline
payload object identity not required
new active state registration gets one synchronous retained baseline
reactivated dormant state registration gets current baseline while union stayed live
true union removal clears retained State
event registration/reactivation gets no history
```

Determinism：

```text
same-channel matching handlers follow successful on() registration order
multi-channel local convergence uses canonical ASCII channel order
stable matching-registration snapshot per delivery
callback mutation affects subsequent delivery only
sync throw contained; later matching handlers still attempted
Promise rejection contained
Promise never settles does not stall later handlers/Data reader
```

Qualification **不得**要求某个 private ordinal/counter implementation。

---

## 6. Mutation Gate / ADR 0029 Evidence

```text
pending commit-sensitive mutation
→ same-Activation State retained but not delivered
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

Business `catch` 开始时，同步 State-handler side effect必须已发生；async handler Promise settlement不属于 barrier。

---

## 7. Renderer Gate / Publisher Evidence

必须证明：

```text
Effective = Data × InputTarget × active F/A × Interest × Producer
Interest-first / authority-first converge
unknown/stale Interest inert
fresh state Effective transition sends self-contained baseline
event begins future-only
same-carrier target replacement Reset(old) before new ordinary input
producer loss Reset/rebaseline
Control loss disables immediately
Data retirement discards Registry/publisher state
old Data/Control facts cannot emit after replacement
```

Ordering/backpressure：

```text
State latest-pending only between barriers
Event never coalesces/replays
Event = global State-coalescing barrier
Reset = global State-coalescing barrier
State cannot cross Event/Reset
post-transition State before paired Event
bounded Event overflow drops before emitted
surviving Event order preserved
ordinary Input backlog cannot overflow generic Data writer into local-fatal
lease/Data retirement discards obsolete not-started input
```

Event queue capacity是 private finite constant，不形成 compatibility surface。

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
old one-argument factory call valid
no source → Producer unavailable
source object fixed at holder construction
no current Control → no subscription
current Control install → exactly one start attempt
successful start → exactly one active subscription
replacement/terminal → invalidate + stop old subscription
late old emit ignored
same holder later current Control → same source object restarted
fresh subscription inherits no old facts
start never replays historical Event
state availability requires fresh sample
state loss clears sample
state return supplies fresh sample before available=true
source cannot choose Frame/Activation or bypass publisher/Data peer
```

Failure：

```text
start throw/non-function/partial bootstrap failure
→ partial facts discarded
→ Producer unavailable for current Control epoch
→ no same-epoch retry
→ Control/Data remain current

stop throw
→ subscription already invalidated
→ contained
→ old facts never resurrect
```

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
minimal exact SDK surface behavior
initial active Frame input
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

Source start/stop failure可由 renderer package deterministic tests独立证明，不要求塞进大 vertical。

---

## 10. Formal Conformance Boundary

Current User Input v1：

```text
protocolVersion = 1
fixtureSetRevision = 2
```

M10必须通过全部 platform-independent Renderer/Subsystem protocol role obligations，以及本 milestone 的 SDK/source projection qualification。

M10 closure wording：

```text
User Input v1 Renderer/Subsystem role implementation
qualified against current platform-independent fixtureSetRevision=2
plus frozen M10 SDK/source projection semantics
on Hostra/Desktop physical Data lifecycle
```

不得声明完整 Hostra/PWA transport-equivalence；留到 M16。

---

## 11. Regression Boundary

必须保持：

```text
M3 Runtime Control unchanged
M5 Main Frame/Activation/InputTarget authority unchanged
M7 Renderer currentness/replacement unchanged
M8 Data role currentness/failure isolation unchanged
M9 Broker paired installation/recovery unchanged
Data failure != Runtime failure / Frame unwind
```

除 ADR 0029 的 Subsystem-local correction外，不修改 Frozen User Input v1 wire/authority/lifetime模型。

---

## 12. CI Gate

实现完成时 root 新增：

```text
npm run test:m10
```

至少组合：

```text
M9 dependency/build gates
User Input fixtureSetRevision=2
Subsystem minimal SDK surface/type/bootstrap tests
Subsystem InputManager lifecycle/order/async tests
Renderer gate/publisher/source lifecycle/failure tests
real M10 vertical
```

文档阶段不提前加入空 gate。

---

## 13. Closure Claim

当前文档允许声明：

```text
M10 design = Implementation Frozen / Ready for Implementation
no further design round is expected before coding
```

实现 + qualification通过后才允许声明 M10 implemented/qualified。

不得提前声明 BrowserWindow Input、Render、Content 或 PWA/full cross-platform User Input conformance complete。
