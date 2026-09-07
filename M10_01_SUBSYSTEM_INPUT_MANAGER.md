# M10 / 01 — Subsystem InputManager

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M10 User Input  
> 落地顺序：01  
> 最近复核：2026-09-07  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> 组合协议：[Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> Author boundary：[packages/subsystem/DESIGN.md](packages/subsystem/DESIGN.md)  
> 目标：在现有 M4 Frame Runtime + M8 Data peer 之上实现最小 `InputListener` / InputManager；不把 Activation、Data generation、wire message 或 carrier 暴露给业务。

> **InputManager 只拥有 Subsystem-local desired Interest、listener lifecycle、retained input state 与 receive gate。Main 仍拥有 InputTarget；`@loomrealm/data` 仍拥有 User Input wire mechanics。**

---

## 1. Position

```text
business Frame
→ InputListener contribution
→ InputManager DesiredRegistry
→ current SubsystemDataPeer
→ input.interest full snapshot

current SubsystemDataPeer
→ input.state / input.event / input.reset
→ InputManager receive gate
→ business listener
```

M10 不创建第二条 Data reader，不改变 M8 Data peer lifecycle。

---

## 2. Frozen Author Surface

沿用现有 Subsystem target surface：

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

不得增加 Input service locator、subscription framework、EventBus 或 generic observable API。

---

## 3. Desired Interest

每个 listener 贡献自己的 channel set；InputManager 只派生一个：

```text
Map<frameId, Set<channel>>
```

同一 Frame 多 listener 取 union。

`setChannels()` / `close()` 顺序固定：

```text
update local contribution
→ recompute affected Frame union
→ local receive gate立即生效
→ queue latest full input.interest snapshot
```

Wire publication始终是 full Registry，不做 incremental subscribe/unsubscribe。

---

## 4. Frame / Activation Lifecycle

Child-call suspension：

```text
F/A1 active
→ child call accepted
→ A1 revoked / F suspended
→ listener + Desired Interest remain
→ ordinary input stops
→ F resumes with fresh A2
→ same listener config reused
```

A1 retained State/Event不得进入 A2。

Frame close前本地必须已经：

```text
close listeners bound to F
remove Interest[F]
clear retained state for F
```

wire cleanup可以随后 coalesce/send；本地正确性不依赖远端先收到 Registry 更新。

---

## 5. Fresh Data Peer

Data peer loss/replace不销毁业务 listener 或 DesiredRegistry。

每个 fresh current Data peer：

```text
remote Interest Registry assumed empty
→ publish current full DesiredRegistry
→ receive fresh State baselines
→ Event remains future-only
```

不得迁移旧 carrier 的 unsent queue、retained remote state 或 Event history。

---

## 6. Receive Gate

well-formed State/Event 交给业务前必须重新验证：

```text
message from current Data peer
∧ local Frame exists
∧ Frame active
∧ activationId == current local Activation
∧ channel ∈ Desired Interest[F]
∧ Frame mutation gate open
```

不满足 → drop。

```text
stale authority/data
!= protocol fatal
!= Runtime failure
```

Malformed/invalid User Input message仍由 `@loomrealm/data` 按 Frozen profile 处理；InputManager 不写第二套 schema validator。

`input.reset(F,A)` 只清 current `(F,A)` retained State；stale Reset drop。

---

## 7. Implementation Budget

允许：

```text
one InputManager per Subsystem instance
per-listener contribution records
one derived DesiredRegistry
minimal retained State keyed by current Frame/Activation/channel
latest full-registry publication scheduling
```

禁止：

```text
InputStore framework
GenericSubscription / EventBus
InputTarget shadow authority
Activation allocator
second Data reader/writer
retry/replay/history
platform event objects in author API
```

---

## 8. Done

M10/01 完成必须证明：

```text
multiple listener union
setChannels shrink/expand
listener close isolation
child-call suspend/resume preserves config but not old lease state
Frame close local-first cleanup
fresh Data peer full Interest republish
stale State/Event/Reset drop
business handler cannot receive input while Frame mutation gate closed
```

下一步：[M10 / 02 — Renderer Input Gate](M10_02_RENDERER_INPUT_GATE.md)。
