# 测试策略

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving overall / **M10 qualification Frozen**  
> 主要定义：protocol mechanics、role authority、Platform provisioning、M10 Input revision 2 + frozen SDK/source projection、Desktop/PWA E2E qualification  
> 依赖：[正式契约目录](../15-contracts/README.md)、[Phase 1 交付计划](./phase-1-delivery-plan.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> M10 closure：[M10 / 05](https://github.com/lithdoo/loom-realm/blob/main/M10_05_QUALIFICATION_CLOSURE.md)
> 最近复核：2026-09-07

测试目标不是“消息能通”，而是证明每层不能绕过 authority、lifecycle、failure-domain、public SDK semantics、PREPARE 与 package boundary。

---

## 1. Ownership

```text
Foundation/Wire
    carrier + generic JSON representation

protocol package
    wire/profile mechanics + conformance

Main / Renderer / Subsystem
    role authority/control-flow + frozen role projection

Platform/Launcher/Broker
    physical hosting/provisioning/current install

M13/M14/M16
    business/product/cross-platform E2E
```

Nearest owner owns nearest test；giant E2E不替代 package/role/conformance evidence。

---

## 2. Common Carrier Rules

Current message-oriented application carriers：one carrier unit = one UTF-8 JSON text string。

Adapter tests覆盖 boundary/order/close/loss/no duplicate/no retry。Protocol package拥有 domain validation与 terminal mechanics。

---

## 3. PREPARE / Runtime / Frame

Game/Launcher PREPARE negative cases必须证明：

```text
Runner/Worker creation = 0
business import = 0
Runtime Control establishment = 0
```

Runtime Control继续证明 one reader/one writer、strict IDs、finite deadlines、terminal first-wins、no retry/replay/reconnect。

Frame authority继续独立证明 ACK-before-publication、post-commit no rollback、ambiguous mutation→Runtime failure、fixed-point unwind、fresh surviving Caller Activation。M10不得弱化这些 gates。

---

## 4. Renderer Control / Data Baseline

M7 owns Renderer hello/currentness/replacement/revision。

M8 owns role-local Data acquire/install/clear/close/currentness。

M9 owns Main Data authority sink、exact HostedRuntime、Hostra provisioner/IPC、Desktop paired Broker、install/revalidation/no rollback、same-generation replacement。

Data failure != Runtime failure / Frame unwind。

---

## 5. M10 Formal User Input Conformance

```text
protocol = loomrealm.user-input
protocolVersion = 1
fixtureSetRevision = 2
```

M10必须通过全部 platform-independent Renderer/Subsystem protocol role obligations；旧 revision 1不能作为 current closure evidence。

Formal protocol tests继续验证：three lifetimes、Effective convergence、State/Event/Reset、ADR 0029、fresh Activation/Data、producer loss、barriers/backpressure、failure taxonomy。

SDK/source projection tests属于 role/package qualification，不修改 wire version。

---

## 6. Minimal Exact Subsystem SDK Surface

Type/build tests只锁定 root Input exports：

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
SubsystemScope.createInputListener
```

必须证明：

```text
six standard payload types structurally equal User Input v1 canonical payloads
custom x.* resolves through InputPayload<C> to bounded JSON object shape
supporting nested shapes can be expressed via indexed access on payload types
supporting aliases are not required as separate root exports
business fixture imports only @loomrealm/subsystem
handler cannot observe protocol envelope/frameId/activationId/Data peer
```

Bootstrap test使用真实顺序：

```text
create InputManager + scope
→ definition factory(scope)
→ create FrameRuntime(definition)
→ one-time bind exact FrameRuntime facts to InputManager
```

并证明没有 dummy/shadow Frame registry；binding在任何 author Frame handler可运行前完成。

---

## 7. Listener Contribution / Registration Tests

Required：

```text
channels=[] valid
channels contribution creates Interest
on() does not change Interest
unsubscribe does not change Interest
setChannels changes only this listener contribution
setChannels preserves registrations
removed registration dormant
re-add reactivates same registration
multiple listener union
close isolation
unsubscribe idempotent
close idempotent
on/setChannels after close → TypeError
foreign Frame → TypeError
known local closed Frame → FrameClosedError
duplicate/invalid channels → TypeError
hard-limit overflow → RangeError
invalid mutation old local state unchanged / wire send zero / Data current
```

Contribution变化但 derived union未变时，不发送冗余 Interest snapshot。

---

## 8. Retained State / Deterministic Delivery Tests

Required：

```text
retained payload detached/deep-immutable
author mutation cannot corrupt later baseline
payload structural value semantic; object identity not required
new active state registration gets one synchronous retained baseline
reactivated dormant state registration gets current baseline while union stayed live
true union removal clears retained State
later re-add after true removal waits for fresh Renderer baseline
event registration/reactivation has no history
```

Delivery ordering：

```text
same channel → matching handlers by successful on() registration order
multi-channel convergence → canonical ASCII channel order, then successful on() registration order
stable matching-registration snapshot per delivery
callback mutation affects next delivery only
sync throw contained + later matching handlers attempted
```

Tests must **not** assert an internal ordinal/counter or require a dedicated ordering helper；only observable call order matters。

---

## 9. Async Handler Isolation Tests

Required：

```text
handler may return Promise<void>
returned Promise not awaited before next handler
Promise reject contained
never-settling Promise does not stall Data reader
business async settlement order does not alter Input protocol ordering
@loomrealm/data dispatch settles after synchronous InputManager application, not business Promise completion
```

不得用 generic async scheduler/framework实现测试便利。

---

## 10. ADR 0029 / Recoverable Call Ordering

```text
F/A active + retained S0
→ pending frame.call
→ mutation gate closed
→ S1 retained / not delivered
→ Event dropped
→ explicit pre-commit rejection received internally
→ same F/A reopens
→ current retained State handlers synchronously invoked
→ only then frame.call rejection becomes observable
→ business catch sees synchronous State side effect
→ no Event replay
```

成功 commit 对照证明 suppressed old-Activation State永不进入旧 continuation。Async handler Promise completion不属于 rejection ordering barrier。

---

## 11. Renderer Gate / Backpressure

Required：

```text
Effective = Data × InputTarget × active F/A × Interest × Producer
Interest-first / Authority-first convergence
fresh Activation/Data state baseline
same-carrier Reset-before-new-input
producer loss/return
Control/Data replacement stale work isolation

State latest-pending only between barriers
Event never coalesces/replays
Event = global State-coalescing barrier
Reset = global State-coalescing barrier
State cannot cross Event/Reset
standard State-before-Event
all input queues bounded
Event overflow drops before emitted
surviving Events keep order
ordinary Input backlog does not overflow generic Data writer into local-fatal
```

Event queue capacity是 implementation-local finite constant。

---

## 12. Exact Renderer Source Tests

Surface：

```text
createRendererControlHolder(data?, input?)
RendererInputSource.start(emit) → idempotent stop
RendererInputSourceChange = availability | state | event
```

Required：

```text
existing one-argument factory valid
no source → Producer unavailable
source object fixed at holder construction
no current Control → start count 0
current Control install → exactly one start attempt
successful start → exactly one active subscription
Control replacement/terminal → old subscription invalidated + stopped
late stopped-subscription emit ignored
same holder later installs Control → same source object start again
fresh start inherits no producer facts
start does not replay historical Event
state available requires fresh current sample
state availability=false clears cached sample
return requires fresh sample before available=true
source cannot choose Frame/Activation or bypass gate/Data peer
paired source State then Event preserves causal order
```

Failure boundary：

```text
start throw/non-function/partial bootstrap failure
→ partial facts discarded
→ Producer unavailable for current Control epoch
→ no same-epoch retry
→ Control/Data remain current

stop throw
→ local subscription already invalidated
→ contained
→ old facts never resurrect
```

M14 browser source必须通过相同 surface/semantics。

---

## 13. M10 Real Vertical

必须组合：

```text
real LogicalGameBootstrap
→ real Main Runtime/Frame/InputTarget
→ real Renderer Control holder
→ real M9 authority feed/Broker
→ real Hostra provisioner
→ real paired Data WS
→ real RendererDataPeer/SubsystemDataPeer
→ Renderer gate/publisher/source
→ Subsystem InputManager
→ business InputListener
```

仅 physical input source可 deterministic。

至少覆盖：minimal SDK behavior、initial input、Interest/Authority order、nested child call/fresh resume Activation、recoverable no-commit convergence、committed old-State suppression、same-generation reconnect、fresh-generation role fixture、Control replacement/source restart、producer loss/return、handler sync/async isolation、Frame close cleanup。

Source start/stop local failure由 renderer package deterministic tests证明，不要求塞进大 vertical。不得为测试提前扩 Main generation allocator。

---

## 14. M10 Claim Boundary

M10 closure wording：

```text
User Input v1 Renderer/Subsystem role implementation
qualified against current platform-independent fixtureSetRevision=2
plus frozen M10 SDK/source projection semantics
on Hostra/Desktop physical Data lifecycle
```

完整 Hostra/PWA transport equivalence留到 M16。

---

## 15. M11 / M12 / M13

M11 Render：fresh Data Domain Registry/Snapshot、Patch revision、Frame/Data lifetime independence。

M12 Content：readonly logical Content与 executable authority分离。

M13 `loom.map`：业务 package只依赖 `@loomrealm/subsystem`，用真实 Input/Render/Content/Frame call验证 author surface。

---

## 16. M14 Desktop Full E2E

M14组合 Hostra PREPARE、Main/Node Runner/Runtime Control、physical Renderer Control WS、BrowserWindow、M9 Broker、M10 real DOM/Gamepad `RendererInputSource`、M11 Render、M12 Content、business nested Frames/reload/shutdown。

BrowserWindow tests不得重做 Input authority或绕过 M10 publisher。

---

## 17. M16 Cross-platform Equivalence

PWA完成 Worker/Window/MessagePort/Broker/Content后比较 normalized logical/application traces；这里才完成 User Input + Renderer Data Profile Hostra/PWA transport-equivalence claim。

---

## 18. Root Gates

Current：

```text
npm run test:m8
npm run test:m9
npm run test:game-launcher-hostra
npm run test:packages
npm run docs:build
npm run docs:check-links
```

M10 implementation完成时新增：

```text
npm run test:m10
```

至少组合：

```text
M9 dependencies/build
User Input fixtureSetRevision=2
Subsystem minimal SDK surface/type/bootstrap tests
Subsystem InputManager lifecycle/order/async tests
Renderer gate/publisher/source lifecycle/failure tests
real M10 vertical
```

---

## 19. Final Test Invariants

1. tests不能通过 bypass authority“证明”功能；  
2. protocol mechanics与 role projection/authority测试分离；  
3. M9 Data lifecycle不冒充 M10 business baseline；  
4. M10 revision 2证明 same-Activation State convergence与 Event non-replay；  
5. minimal SDK handler/Interest/lifecycle/type semantics有独立 evidence；  
6. tests不冻结私有 registration ordinal/counter；  
7. async handler不成为 Data flow-control dependency；  
8. source currentness跟 current Control subscription，不复用 stale facts；  
9. source lifecycle failure不升级 Control/Data failure，也不创建 retry loop；  
10. Input backpressure不依赖 generic Data writer failure；  
11. M14才宣称 Desktop full E2E；M16才宣称 full cross-platform equivalence；  
12. no generic RPC/authority/event/input/connection/transaction/retry framework for test convenience。
