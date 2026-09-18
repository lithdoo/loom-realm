# Renderer Data Application Profile v1 Conformance

> 层级：正式契约 / Conformance  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> fixtureSetRevision：2  
> 适用 Profile：`loomrealm.renderer-data/1`  
> 依赖：[Renderer Data Profile v1](./renderer-data-profile-v1.md)、[Data Connection v1 Conformance](./renderer-subsystem-data-connection-conformance-v1.md)、[User Input v1 Conformance](./user-input-conformance-v1.md)、[Render Update v1 Conformance](./render-update-conformance-v1.md)、[ADR 0025](../decisions/0025-renderer-data-profile-v1-preimplementation-closure.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 最近复核：2026-09-07

本文件验证 `loomrealm.renderer-data/1` 的组合层 obligations；child protocol 的完整语义仍由各自 Conformance 定义。

---

## 1. Profile Binding

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Current child conformance：

```text
User Input protocolVersion = 1 / fixtureSetRevision = 2
```

Profile identity不因 fixture revision变化；ADR 0029 没有改变 Data Profile wire/version combination。

---

## 2. Required Claims

完整 Profile claim至少证明：

```text
exact profile identity/version binding
one inbound reader / exact namespace routing
one serialized outbound writer
role-exact direction legality
first-wins terminal / fail-closed carrier retirement
fresh-carrier Input + Render baseline reset/republication
all current child conformance obligations
Hostra/PWA abstract transport equivalence
```

仅通过 Data Connection、Input 或 Render其中一部分不构成完整 Profile conformance。

---

## 3. Harness Observables

至少观察：

```text
carrier.messages() call count
max concurrent carrier.send count
sent application-unit order
role dispatch target
terminal fact / close request
pending send settlement
fresh-peer child publication state
```

Application unit始终是 one UTF-8 JSON text string。

---

## 4. Identity / Direction

Required：

```text
profile-exact-identity
profile-unsupported-rejected-before-read/write
profile-change-requires-fresh-generation
subsystem-outbound: input.interest + render.* only
renderer-outbound: input.state/event/reset only
wrong-direction-message-protocol-fatal
```

不得通过 MessagePort structured object拓宽 application model。

---

## 5. Reader / Dispatcher

Required：

```text
one-reader-per-peer
input.* exact input dispatcher
render.* exact render dispatcher
unknown profile namespace rejected
one inbound unit dispatches exactly once
handler protocol-fatal retires current peer
handler throw/local-fatal retires peer unless child contract explicitly contains it before returning
```

M10 InputManager必须 containment business handler failure，使其不逃逸到 Data dispatch；Profile runtime无需识别 business callback。

---

## 6. Writer

Required：

```text
one serialized writer
max concurrent carrier.send = 1
exact outbound profile validation before send
terminal first-wins
no retry/replay/duplicate after failed send
```

Generic Data writer的 finite capacity是 fail-closed mechanical bound；User Input v1 revision 2要求 Renderer在进入该 writer前执行自身 bounded coalescing/drop policy，普通 Input backlog不得依赖 generic writer overflow作为 backpressure策略。

---

## 7. Child Ordering Independence

Input 与 Render共享 physical writer order但不共享 authority/revision/transaction。

Required：

```text
input ordering obeys User Input v1
render ordering obeys Render Update v1
input message does not advance Render revision
render message does not change Input lease/Interest
child failure classification maps to correct DataTerminal.protocol family
```

---

## 8. Fresh Carrier

每个 fresh current peer：

```text
Input remote Interest/State/Event history = empty
Render remote Domain/Snapshot/Patch chain = empty
```

Role-local desired business state MAY survive according to child lifetime rules and MUST re-establish current baselines through the fresh peer。

Required：

```text
fresh-carrier-input-interest-republication
fresh-carrier-input-state-baseline/no-event-replay
fresh-carrier-render-domains/snapshots
same-generation-reconnect-fresh-child-publication
fresh-generation-replacement-fresh-child-publication
fresh-carrier-does-not-restart-runtime/frame
```

---

## 9. Terminal / Failure Boundary

Required：

```text
malformed/profile-invalid → profile protocol-fatal
input-invalid → input protocol-fatal
render-invalid → render protocol-fatal
carrier close/loss → carrier terminal
terminal first-wins
terminal closes current carrier best-effort
Data terminal != Runtime failure / Frame unwind
```

Fresh current carrier reacquisition由 role/Platform lifecycle负责，不属于 Profile retry/reconnect mechanics。

---

## 10. Platform Equivalence

完整 conformance要求：

```text
Hostra WebSocket text
PWA MessagePort string
→ same profile application trace semantics
```

Adapter不得 retry、duplicate、reorder或将 structured object直接交给 Profile Core。

M10可以在 Hostra/Desktop Data physical lifecycle完成 current platform-independent Input role qualification；full Profile Hostra/PWA equivalence直到 M16。

---

## 11. Revision 2

Profile `fixtureSetRevision = 2` 的唯一新增组合义务来自 current User Input revision 2：

```text
mutation-gate State convergence remains inside Subsystem Input role
business handler failure is contained before Data dispatch failure
Renderer Input backlog is bounded/coalesced before generic Data writer overflow
```

Profile identity、Data Connection version、Render Update version均不变；revision 1结果不得冒充 current complete `loomrealm.renderer-data/1` conformance。
