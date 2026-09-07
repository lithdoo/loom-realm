# 测试策略

> 层级：实施计划  
> 状态：Tracking  
> 稳定程度：Evolving  
> 主要定义：protocol mechanics、role authority、Platform provisioning、M10 Input revision 2、Desktop/PWA E2E qualification  
> 依赖：[正式契约目录](../15-contracts/README.md)、[Phase 1 交付计划](./phase-1-delivery-plan.md)、[ADR 0028](../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 最近复核：2026-09-07

测试目标不是“消息能通”，而是证明每层不能绕过 authority、lifecycle、failure-domain、PREPARE 与 package boundary。

---

## 1. Ownership

```text
Foundation/Wire
    carrier + generic JSON representation

protocol package
    wire/profile mechanics + conformance

Main / Renderer / Subsystem
    role authority/control-flow

Platform/Launcher/Broker
    physical hosting/provisioning/current install

M13/M14/M16
    business/product/cross-platform E2E
```

Nearest owner owns nearest test；giant E2E不替代 package/role/conformance evidence。

---

## 2. Common Carrier Rules

Current message-oriented application carriers：

```text
one carrier unit = one UTF-8 JSON text string
```

Adapter tests覆盖 boundary/order/close/loss/no duplicate/no retry。Protocol package拥有 domain validation与 terminal mechanics。

---

## 3. PREPARE / Runtime / Frame

Game/Launcher PREPARE negative cases必须证明：

```text
Runner/Worker creation = 0
business import = 0
Runtime Control establishment = 0
```

Runtime Control package继续证明 one reader/one writer、strict IDs、finite deadlines、terminal first-wins、no retry/replay/reconnect。

Frame authority继续独立证明 ACK-before-publication、post-commit no rollback、ambiguous mutation→Runtime failure、fixed-point unwind、fresh surviving Caller Activation。

M10不得弱化这些 gates。

---

## 4. Renderer Control / Data Baseline

M7 tests继续拥有 Renderer hello/currentness/replacement/revision。

M8 tests继续拥有 role-local Data acquire/install/clear/close/currentness。

M9 tests继续拥有：

```text
Main full Data authority sink
exact HostedRuntime target
Hostra provisioner/IPC
Desktop paired Data WS Broker
commit-time revalidation
install-before-role-delivery
no rollback/resurrection
same-generation physical replacement
```

Data failure != Runtime failure / Frame unwind。

---

## 5. M10 User Input Conformance

Current formal fixture：

```text
protocol = loomrealm.user-input
protocolVersion = 1
fixtureSetRevision = 2
```

M10必须通过全部 platform-independent Renderer/Subsystem role obligations；旧 revision 1不能作为 current closure evidence。

### Subsystem

必须覆盖：

```text
listener union / close isolation / setChannels shrink-expand
invalid author channel/union local atomic rejection
new .state listener receives current retained baseline
new .event listener receives no history
fresh Data clears old retained State + republishes Interest
Frame close local-first cleanup
handler throw/rejected Promise contained without Data terminal
```

ADR 0029 trace：

```text
F/A active + retained S0
→ pending commit-sensitive frame.call
→ mutation gate closed
→ S1 arrives: retained, not business-delivered
→ Event arrives: dropped
→ explicit pre-commit rejection
→ same F/A reopens
→ latest S1 delivered
→ no Event replay
```

成功 commit 对照必须证明 suppressed old-Activation State永不进入旧 business continuation。

### Renderer

必须覆盖：

```text
Effective = Data × InputTarget × active F/A × Interest × Producer
Interest-first / Authority-first convergence
fresh Activation/Data state baseline
same-carrier Reset-before-new-input
producer loss/return
Control/Data replacement stale work isolation
```

---

## 6. M10 Ordering / Backpressure

Renderer input publisher必须单独证明：

```text
State latest-pending coalescing only between barriers
Event never coalesces/replays
Event = global State-coalescing barrier
Reset = global State-coalescing barrier
State cannot cross Event/Reset
standard State-before-Event causality
all input queues bounded
Event overflow drops before emitted
surviving Events keep order
ordinary Input backlog does not overflow generic Data writer into local-fatal
lease/Data retirement discards obsolete not-started input
```

具体 Event queue capacity是 implementation-local test constant，不形成 protocol compatibility surface。

---

## 7. M10 Producer Seam

M10 deterministic source与未来 M14 browser source必须走同一 production seam。

Required：

```text
one optional source injected at holder construction
no runtime producer registry
source cannot choose frameId/activationId
source cannot bypass gate/publisher/Data peer
old holder/source cannot affect replacement
availability loss/return semantics correct
```

Fixture只控制 canonical physical facts，不直接写 User Input message或 authority state。

---

## 8. M10 Real Vertical

必须组合 production path：

```text
real LogicalGameBootstrap
→ real Main Runtime/Frame/InputTarget
→ real Renderer Control holder
→ real M9 authority feed/Broker
→ real Hostra provisioner
→ real paired Data WS
→ real RendererDataPeer/SubystemDataPeer
→ Renderer gate/publisher
→ deterministic canonical source
→ Subsystem InputManager
→ business InputListener
```

仅 physical input source可 deterministic。

至少覆盖：

```text
initial input
Interest-first / Authority-first
nested child call / fresh resume Activation
recoverable no-commit State convergence
committed call old-State suppression
same-generation Data reconnect fresh baseline/no Event replay
producer loss/return
handler failure isolation
Frame close cleanup
```

Fresh-generation Input behavior使用 role-level deterministic Data fixture；不得为测试提前扩 Main generation allocator。

---

## 9. M10 Claim Boundary

M10 closure wording：

```text
User Input v1 Renderer/Subsystem role implementation
qualified against current platform-independent fixtureSetRevision=2
on Hostra/Desktop physical Data lifecycle
```

不得声明完整 Hostra/PWA transport-equivalence conformance；PWA physical mapping留到 M16。

---

## 10. M11 / M12 / M13

M11 Render：fresh Data Domain Registry/Snapshot、Patch revision、Frame/Data lifetime independence。

M12 Content：readonly logical Content与 executable authority分离。

M13 `loom.map`：业务 package只依赖 `@loomrealm/subsystem`，用真实 Input/Render/Content/Frame call验证 author surface。

---

## 11. M14 Desktop Full E2E

M14必须组合：

```text
Hostra PREPARE
Main / Node Runner / Runtime Control
physical Renderer Control WebSocket
BrowserWindow
M9 Data Broker
M10 real DOM/Gamepad source via same input seam
M11 Render
M12 Content
business nested Frames / reload / shutdown
```

BrowserWindow tests不得重做 Input authority或绕过 M10 publisher。

---

## 12. M16 Cross-platform Equivalence

PWA完成 Worker/Window/MessagePort/Broker/Content后，比较 normalized logical/application traces：

```text
same Game logical topology
same Frame/Input/Render/Content scenario
same protocol/application observable outcome
```

不比较 PID/Worker/WS/Port/IPC physical identity。

这里才完成 User Input + Renderer Data Profile 的 Hostra/PWA transport-equivalence claim。

---

## 13. Root Gates

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
Subsystem InputManager tests
Renderer gate/publisher/source tests
real M10 vertical
```

文档阶段不放空 gate。

---

## 14. Final Test Invariants

1. tests不能通过 bypass authority来“证明”功能；
2. protocol mechanics与 role authority测试分离；
3. M9 physical Data lifecycle不冒充 M10/M11 business baseline；
4. M10 revision 2必须证明 same-Activation State convergence与 Event non-replay；
5. handler/author usage错误不升级 Data/Runtime failure；
6. Input backpressure在 role-local publisher处理，不依赖 generic Data writer failure；
7. M14才宣称 Desktop full E2E；
8. M16才宣称 full cross-platform equivalence；
9. no generic RPC/authority/event/input/connection/transaction/retry framework for test convenience。
