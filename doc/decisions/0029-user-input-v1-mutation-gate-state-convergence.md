# ADR 0029：User Input v1 mutation-gate State convergence correction

> 状态：Accepted  
> 日期：2026-09-07  
> 影响范围：User Input Protocol v1、User Input v1 Conformance、Subsystem InputManager/M10 implementation plans  
> 更新：[ADR 0023](./0023-user-input-v1-semantic-closure.md) 的 Subsystem receive-gate / retained-State 语义  
> 治理：[文档分层与变更规则](../00-overview/document-governance.md) §7 Frozen Preimplementation Correction  
> 不改变：wire schema、channel grammar、Main InputTarget authority、Renderer Effective gate、Activation identity、Data generation/profile、State/Event/Reset wire ordering、failure taxonomy

## 1. 问题

Frozen User Input v1 同时要求：

```text
Subsystem ordinary input receive gate includes local mutation gate
State = self-contained latest current truth
```

但 `frame.call()` 存在合法的 pre-commit recoverable rejection：

```text
F/A active
→ local mutation gate closes while frame.call is pending
→ Main has not committed suspension; InputTarget remains F/A
→ Renderer Effective remains true
→ new .state S1 arrives
→ old rule drops S1 because local mutation gate is closed
→ call is explicitly rejected pre-commit
→ same F/A becomes usable again
```

Renderer 没有观察到 Effective `false → true`，因此没有义务再次发送 baseline。若 Subsystem 已丢弃 S1，本地 retained State 可永久停留在旧值，直到下一次 physical state change。

这违反 `State = current truth` 的收敛目标。

当前尚无 User Input v1 conformant/deployed compatibility boundary；M10 尚未实现。因此按 document-governance §7 直接修正 current v1，不制造 fake v2。

---

## 2. 决策

必须区分：

```text
State retention eligibility
!=
business delivery eligibility
```

对 well-formed `input.state(F,A,C)`：

```text
current Data
∧ local Frame exists
∧ activationId == local current Activation
∧ C ∈ local Desired Interest[F]
```

成立时，InputManager **MUST retain the latest immutable State**，即使 local ordinary-mutation gate 因 commit-sensitive mutation 暂时关闭。

当 mutation gate open：

```text
retain latest State
→ deliver to current matching listeners
```

当 mutation gate temporarily closed but same local F/A still exists：

```text
retain latest State
→ suppress business delivery
```

`input.event` 在 gate closed 时仍然 drop；Event 不 replay。

`input.reset(F,A)` 若仍对应 local current Activation，则立即清该 Activation 的 retained/suppressed State，即使 mutation gate closed。

---

## 3. Gate reopen

只有明确 known-no-commit 且 same Activation 重新开放 ordinary mutation 时：

```text
same F/A survives
→ mutation gate reopens
→ deliver at most one latest retained State per still-interested .state channel
→ no Event replay
```

这不是 wire replay；只是 Subsystem-local latest-State convergence。

若 pending mutation随后：

```text
commits and revokes Activation
OR Frame closes/suspends administratively
OR Runtime becomes terminal/ambiguous
OR Data carrier retires
```

则 suppressed retained State按对应 lifetime boundary清除，不交给业务。

---

## 4. Listener-local baseline

同一 `(F,A,C.state)` 已有 retained State 时，新 listener 或 listener channel expansion若使该 listener首次 locally eligible：

```text
install listener/config atomically
→ deliver one current retained State to that listener
```

无需为了新增本地 listener重新发布 wire Interest，也不要求 Renderer重发 baseline。

`.event` listener 从注册/扩展后只接收 future Events。

---

## 5. Business handler isolation

Input handler throw/reject：

```text
business-local callback failure
→ contained by InputManager
→ does not escape into @loomrealm/data dispatch
→ does not retire Data
→ does not mutate Frame/Runtime authority
```

同一 accepted input 应继续尝试交付给其它仍匹配 listener；具体 diagnostics 不属于 M10 closure。

Retained State 暴露给 author 前必须成为 author-safe immutable snapshot，避免业务突变污染后续 listener baseline。

---

## 6. Author usage validation

`createInputListener` / `setChannels` 必须在提交 local Desired Interest 前验证：

```text
channel grammar/suffix
per-listener duplicate
resulting per-Frame union representability
current v1 Interest hard limits
```

失败：

```text
throw/reject local usage error
→ old listener contribution / DesiredRegistry unchanged
→ wire send count = 0
→ current Data peer unaffected
```

这是 author API representability validation，不改变 wire receiver validation ownership。

---

## 7. What remains unchanged

仍然成立：

```text
Main owns Frame/Activation/InputTarget
Desired Interest is Frame-scoped configuration
Renderer Effective = Data × InputTarget × active F/A × Interest × Producer
Control/Data have no global total order
State is self-contained/latest-wins
Event is transient/future-only/no replay
Reset is Activation-scoped retained-State teardown barrier
fresh Activation/Data never inherit old State/Event
protocol-invalid input retires Data
well-formed stale authority input drops
```

不增加：

```text
wire ACK/NACK
input revision/sequence
cross-plane barrier
InputTarget shadow authority
Renderer knowledge of Subsystem mutation gate
retry/replay/history
```

---

## 8. Conformance update

User Input v1 `fixtureSetRevision`：

```text
1 → 2
```

Revision 2 必须新增：

```text
mutation-gate-state-retained-not-delivered
mutation-gate-event-dropped
mutation-gate-recoverable-no-commit-reopens-with-latest-state
mutation-gate-commit-discards-suppressed-old-activation-state
mutation-gate-reset-clears-suppressed-state
listener-add-state-channel-receives-current-retained-baseline
listener-add-event-channel-no-replay
author-invalid-interest-local-atomic-rejection
handler-failure-does-not-retire-data
```

旧 revision 1 结果不得冒充 current complete User Input v1 conformance。
