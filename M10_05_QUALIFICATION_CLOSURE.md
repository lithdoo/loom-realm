# M10 / 05 — Qualification and Closure

> 状态：**Implemented / Qualified / Closed**
> 阶段：M10 User Input  
> 落地顺序：05  
> 最近复核：2026-09-07  
> 前置：[M10 / 01](M10_01_SUBSYSTEM_INPUT_MANAGER.md) → [M10 / 02](M10_02_RENDERER_INPUT_GATE.md) → [M10 / 03](M10_03_RENDERER_INPUT_PRODUCERS.md) → [M10 / 04](M10_04_VERTICAL_INTEGRATION.md)  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> Conformance：[User Input v1 Conformance](doc/15-contracts/user-input-conformance-v1.md)  
> 修正决策：[ADR 0029](doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)

M10 implementation 与 qualification 已完成。M10/05记录可重复、可审计的正式 evidence；不重新设计 Input API、authority、wire 或新的 runtime abstraction。

---

## 1. Close Gate

M10 只有在以下全部成立后才能声明 Closed：

```text
fixtureSetRevision = 2

Subsystem Interest Sender      qualified
Renderer Input Sender         qualified
Subsystem Input Receiver      qualified

M10 SDK/source projection     qualified
Hostra/Desktop real vertical  pass
M9 regression                 pass
```

完整 Hostra/PWA transport equivalence 不属于 M10，留到 M16。

---

## 2. Qualification Runner

已增加 implementation-neutral conformance runner：

```text
formal fixture
→ role adapter
→ current @loomrealm/* implementation
→ observable trace/result
```

runner 只观察协议允许的行为，不依赖 private `Map`、queue、class 或内部字段。

Role adapters exactly：

```text
subsystem-interest-sender
renderer-input-sender
subsystem-input-receiver
```

每个 fixture 至少记录：

```text
protocol = loomrealm.user-input
protocolVersion = 1
fixtureSetRevision = 2
role
group
fixture
result
```

不增加第二套 runtime、Data authority 或 test-only generation model。

---

## 3. Required Fixture Groups

按 Frozen Conformance Profile 覆盖全部 platform-independent required groups：

```text
wire-schema / limits / channel
interest / author-usage / listener
lifetime / fresh-carrier
authority / producer
mutation-gate
state-event / reset / backpressure
keyboard / pointer / gamepad / custom
failure
```

优先证明高风险语义：

```text
Interest-first / authority-first convergence
mutation-gate retained State + Event drop
known-no-commit same-Activation State-before-rejection convergence
commit discards suppressed old-Activation State
same-generation reconnect fresh State / no Event replay
InputTarget replacement Reset(old) before new input
producer loss/return baseline semantics
bounded backlog + stale lease/carrier isolation
```

Fixture 名称和 expected observable behavior 以 current `user-input-conformance-v1.md` 为准；本文件不复制第二份规范。

---

## 4. M10-specific Qualification

Formal protocol role qualification 之外，还必须证明当前 M10 implementation contract：

### Subsystem author surface

```text
SubsystemScope.createInputListener
channels/setChannels owns Interest contribution
on/unsubscribe owns callbacks only
setChannels keeps dormant registrations
stable registration-order delivery
handler receives canonical payload only
business Definition depends only on @loomrealm/subsystem
```

### Renderer source surface

```text
createRendererControlHolder(data?, input?)
one construction-time RendererInputSource
0..1 subscription for current Control
replacement/terminal invalidates old subscription
late old emit ignored
same holder may restart same source for later Control
source cannot choose Frame/Activation
```

这些属于 M10 implementation qualification，不升级成 User Input v1 protocol structure。

---

## 5. Real Vertical

复用现有 M9/M10 physical path：

```text
Hostra prepare/runtime
→ Main Runtime/Frame/InputTarget authority
→ Renderer Control
→ Desktop Data Broker
→ RendererDataPeer ⇄ SubsystemDataPeer
→ Renderer Input Gate
→ Subsystem InputManager
→ business Definition
```

至少保留：

```text
initial active Frame input
nested Frame / fresh Activation
recoverable no-commit convergence
committed-call old Activation suppression
same-generation Data reconnect
Control replacement / source restart
producer loss/return
Frame close cleanup
old Data/Control/source isolation
```

真实 Browser DOM/Gamepad source 不属于 M10；M14 必须复用已经冻结的 M10 source contract。

---

## 6. Regression Gate

最终 root gate 已表达：

```text
npm run test:m10
= M9 regression
+ M10 package/SDK/source tests
+ User Input fixtureSetRevision 2 qualification
+ real M10 Hostra/Desktop vertical
```

M10 close 不允许通过改变以下既有语义换取测试通过：

```text
Main InputTarget authority
Frame / Activation ownership
Renderer currentness
Data currentness/failure isolation
Data failure != Runtime failure / Frame unwind
State current-truth / Event future-only
no retry / no replay
```

---

## 7. Abstraction Budget

Close 工作允许新增：

```text
fixture catalog
small role adapters
trace/assert helpers
qualification report output
```

禁止新增：

```text
generic conformance framework for future protocols
Generic Input / EventBus / Observable / Store
shadow Frame/InputTarget/Data authority
protocol simulator replacing real role implementation
retry/replay/ACK layer
new public M10 API only for testing
```

测试 seam 可以是 package-private；不得为了 harness 扩张生产架构。

---

## 8. Closure Record

全部 gate 已通过，本文件状态为：

```text
M10 = Implemented / Qualified / Closed
```

并记录一次固定 qualification snapshot：

```text
protocol = loomrealm.user-input
protocolVersion = 1
fixtureSetRevision = 2
roles = subsystem-interest-sender | renderer-input-sender | subsystem-input-receiver
platform-independent role qualification = pass (168 required entries / 303 role records)
M10 SDK/source qualification = pass
Hostra/Desktop vertical = pass
M9 regression = pass
```

固定证据记录见 [M10 qualification](doc/30-implementation/m10-qualification.md)，独立 CI 为 `.github/workflows/m10.yml`。

README 与 Phase 1 delivery status 已同步更新，M11 implementation gate 可以开启。

M10 close 不声明：

```text
BrowserWindow/DOM physical input complete
Render complete
Content complete
PWA complete
Hostra/PWA transport equivalence complete
```
