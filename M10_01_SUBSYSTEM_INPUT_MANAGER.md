# M10 / 01 — Subsystem InputManager

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M10 User Input  
> 落地顺序：01  
> 最近复核：2026-09-07  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> 修正决策：[ADR 0029](doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> Author boundary：[packages/subsystem/DESIGN.md](packages/subsystem/DESIGN.md)  
> 目标：在现有 M4 Frame Runtime + M8 Data peer 上实现唯一 role-local `InputManager`；只暴露业务 listener，不复制 Frame authority、Data lifecycle 或 wire mechanics。

> **InputManager 拥有 desired Interest、listener lifecycle、retained State 与 local delivery；FrameRuntime 仍是 local Frame/Activation/mutation-gate 唯一事实源，`@loomrealm/data` 仍拥有 wire validation/serialization。**

---

## 1. Construction / Position

每个 Subsystem instance exactly one InputManager：

```text
SubsystemHost
├── FrameRuntime          // local Frame/Activation/mutation gate source
├── InputManager          // one instance
└── current Data peer     // M8 lifecycle
```

固定 wiring：

```text
scope.createInputListener(...)
→ same InputManager

FrameRuntime lifecycle transition
→ direct same-package InputManager cleanup/reopen hook or query

current SubsystemDataPeer
↔ same InputManager
```

不得建立 Frame shadow registry、EventBus、service locator 或第二条 Data reader。

---

## 2. Author Surface

沿用既有 target surface：

```ts
interface CreateInputListenerOptions {
  readonly frame: Frame;
  readonly channels: readonly InputChannel[];
}

interface InputListener {
  on<T>(channel: InputChannel, handler: (value: T) => void): Unsubscribe;
  setChannels(channels: readonly InputChannel[]): void;
  close(): void;
}
```

通过 `SubsystemScope.createInputListener(...)` 创建。Author 不见：

```text
activationId
generation / dataProfile
input.interest/state/event/reset
RendererDataPeer / MessageCarrier
```

---

## 3. Local Author Validation

`createInputListener` / `setChannels` 在改变任何 local state 前必须验证：

```text
channel grammar/suffix
no duplicate contribution
resulting Frame union <= 64 channels
resulting Registry <= 128 Frames / 4096 pairs
```

失败：

```text
local usage error
→ old listener contribution unchanged
→ old DesiredRegistry unchanged
→ wire send = 0
→ current Data peer unaffected
```

这是 author representability validation，不建立第二套 inbound wire/schema validator。

---

## 4. Desired Interest

每个 listener 保存自己的 channel contribution；InputManager 只派生：

```text
DesiredRegistry = Map<frameId, Set<channel>>
```

同一 Frame 多 listener取 union。

`setChannels()` / `close()`：

```text
validate candidate
→ atomically commit local contribution
→ recompute affected union
→ local receive/delivery eligibility立即反映新值
→ queue latest full input.interest snapshot
```

Wire 始终 full replacement，不做 incremental subscribe/unsubscribe。

Interest publisher只需要：

```text
0..1 inFlight send
0..1 pendingLatest full Registry
```

fresh Data peer丢弃旧 publisher state，并从 current DesiredRegistry重新 publication；不 retry/replay old send。

---

## 5. Retained State / Listener Baseline

InputManager 对 current `(F,A,C.state)` 保存最新 author-safe immutable State snapshot。

当一个 listener 首次 locally eligible 且该 channel已有 current retained State：

```text
install listener/config first
→ deliver exactly one latest retained State to that listener
```

无需为了新增本地 listener制造 Interest shrink/expand，也不要求 Renderer重发 baseline。

`.event` listener永远 future-only，不做 local replay。

Interest union真正移除一个 `.state` channel时立即清该 channel retained State；移除整个 Frame entry时清该 Frame retained State。

---

## 6. Receive: Retention Gate vs Business Gate

well-formed `.state(F,A,C)` 先检查 retention eligibility：

```text
message from current Data peer
∧ local Frame exists
∧ activationId == current local Activation
∧ C ∈ DesiredRegistry[F]
```

不满足 → drop。

满足时：

```text
retain latest immutable State
```

随后只有：

```text
Frame active
∧ ordinary mutation gate open
```

才交给 business listeners。

因此 commit-sensitive mutation pending 时：

```text
State → retain latest, suppress delivery
Event → drop
Reset(current F/A) → clear retained/suppressed State
```

这不改变 Renderer Effective，也不增加 cross-plane signal。

---

## 7. Mutation Reopen / Activation Boundary

只有明确 known-no-commit 且 same Activation 恢复 ordinary mutation 时：

```text
mutation gate reopens on same F/A
→ deliver at most one latest retained State per still-interested .state channel
→ no Event replay
```

如果 mutation commit / Activation revoke / administrative suspend / Frame close / Runtime terminal：

```text
old/suppressed Activation State discarded
```

Child-call正常成功：listener + Desired Interest可跨 suspension保留，但 A1 State/Event 不跨到 fresh A2；A2 等待 fresh Renderer baseline。

---

## 8. Data / Frame Cleanup

Fresh Data peer：

```text
clear all old-carrier retained State
DesiredRegistry/listeners remain
remote Registry assumed empty
→ republish current full DesiredRegistry
→ fresh .state baseline
→ Event future-only
```

Frame close protocol success成立前，本地必须已经：

```text
close listeners bound to F
remove DesiredRegistry[F]
clear retained/suppressed State for F
```

wire Interest cleanup可以随后 coalesce/send；本地正确性不依赖远端先观察。

Runtime terminal最终清全部 listener/Interest/retained State。

---

## 9. Handler Isolation

一个 accepted input delivery使用当前匹配 listener集合；单个 handler throw 或 returned Promise reject：

```text
contained by InputManager
→ does not escape @loomrealm/data handler
→ does not retire Data
→ does not modify Frame/Runtime authority
→ does not prevent other matching listeners from being attempted
```

M10 不建立 diagnostics/event framework。

---

## 10. Implementation Budget

允许：

```text
one InputManager per Subsystem instance
per-listener contribution records
one derived DesiredRegistry
minimal immutable retained State
one latest-only Interest publisher
small direct FrameRuntime integration hooks/queries
```

禁止：

```text
InputStore / GenericSubscription / EventBus
InputTarget/Frame/Activation shadow authority
second Data reader/writer
cross-plane ACK/revision/barrier
retry/replay/history
platform event objects in author API
```

---

## 11. Done

M10/01 必须证明：

```text
local invalid configuration rejects atomically without Data failure
multiple listener union / close isolation / shrink-expand
new state listener receives current retained local baseline
new event listener receives no historical Event
pending mutation retains State but suppresses delivery
recoverable no-commit same-Activation reopen delivers latest State
committed mutation never leaks suppressed old-Activation State
handler failure does not retire Data
Frame close local-first cleanup
fresh Data peer clears State + republishes Interest
```

下一步：[M10 / 02 — Renderer Input Gate](M10_02_RENDERER_INPUT_GATE.md)。
