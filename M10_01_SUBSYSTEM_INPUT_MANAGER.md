# M10 / 01 — Subsystem InputManager

> 状态：**Implemented / Qualified**
> 阶段：M10 User Input  
> 落地顺序：01  
> 最近复核：2026-09-07  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> 修正决策：[ADR 0029](doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> Author boundary：[packages/subsystem/DESIGN.md](packages/subsystem/DESIGN.md)  
> 目标：在现有 M4 Frame Runtime + M8 Data peer 上实现唯一 role-local `InputManager`；公开 SDK 语义冻结，编码阶段只允许 private realization choices。

> **InputManager 拥有 Desired Interest、listener lifecycle、retained State 与 local delivery；FrameRuntime 仍是 local Frame/Activation/mutation-gate 唯一事实源，`@loomrealm/data` 仍拥有 wire validation/serialization。**

---

## 1. Position / Wiring

每个 Subsystem instance exactly one InputManager：

```text
SubsystemHost
├── FrameRuntime          // local Frame/Activation/mutation gate source
├── InputManager          // one instance
└── current Data peer     // M8 lifecycle
```

固定 wiring：

```text
scope.createInputListener(...) → same InputManager
FrameRuntime transition        → direct same-package InputManager hook/query
current SubsystemDataPeer      ↔ same InputManager
```

现有 `FrameRuntime` 依赖 business `SubsystemDefinition`，而 scope 必须在 Definition factory 时已经可用，因此 bootstrap 使用最小 late binding：

```text
create InputManager
→ create scope
→ definition factory(scope)
→ create FrameRuntime(definition, ...)
→ bind exact same FrameRuntime facts into InputManager once
```

实现可用 private setter 或 closure；不得创建 dummy/shadow Frame registry、EventBus、service locator 或第二条 Data reader/writer。

---

## 2. Minimal Exact Author Surface

M10 root-export **只**冻结以下 Input 名称：

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

以及 `SubsystemScope.createInputListener(...)`。

类型关系冻结为：

```ts
export type InputStateChannel =
  | "keyboard.state"
  | "pointer.state"
  | "gamepad.state"
  | `x.${string}.state`;

export type InputEventChannel =
  | "keyboard.event"
  | "pointer.event"
  | "gamepad.event"
  | `x.${string}.event`;

export type InputChannel = InputStateChannel | InputEventChannel;

export type KeyboardStateInput = KeyboardStatePayloadV1;
export type KeyboardEventInput = KeyboardEventPayloadV1;
export type PointerStateInput = PointerStatePayloadV1;
export type PointerEventInput = PointerEventPayloadV1;
export type GamepadStateInput = GamepadStatePayloadV1;
export type GamepadEventInput = GamepadEventPayloadV1;

// implementation-private structural alias; NOT a root export
type CustomInputObject = InputStateV1["payload"];

export type InputPayload<C extends InputChannel> =
  C extends "keyboard.state" ? KeyboardStateInput :
  C extends "keyboard.event" ? KeyboardEventInput :
  C extends "pointer.state" ? PointerStateInput :
  C extends "pointer.event" ? PointerEventInput :
  C extends "gamepad.state" ? GamepadStateInput :
  C extends "gamepad.event" ? GamepadEventInput :
  C extends `x.${string}.state` | `x.${string}.event` ? CustomInputObject :
  never;

export type InputHandler<C extends InputChannel> =
  (value: InputPayload<C>) => void | Promise<void>;

export type Unsubscribe = () => void;

export interface CreateInputListenerOptions {
  readonly frame: Frame;
  readonly channels: readonly InputChannel[];
}

export interface InputListener {
  on<C extends InputChannel>(
    channel: C,
    handler: InputHandler<C>,
  ): Unsubscribe;
  setChannels(channels: readonly InputChannel[]): void;
  close(): void;
}

interface SubsystemScope {
  readonly signal: AbortSignal;
  createInputListener(options: CreateInputListenerOptions): InputListener;
}
```

上述 `*PayloadV1` / `InputStateV1` 只表示 implementation 可 type-alias 复用现有 `@loomrealm/data` declarations；业务 Definition 仍只 import `@loomrealm/subsystem`。

Standard payload 字段、range、canonical ordering 的唯一事实源仍是 User Input v1；Subsystem 不复制第二套 payload semantics。

Supporting shapes **不为了对称性单独 root-export**。需要其类型时直接从 payload 派生，例如：

```ts
type KeyboardCode = KeyboardEventInput["code"];
type PointerSample = PointerStateInput["pointers"][number];
type GamepadSample = GamepadStateInput["gamepads"][number];
type GamepadButton = GamepadEventInput["button"];
type CustomPayload = InputPayload<"x.example.state">;
```

Handler 只收到 payload，不收到 protocol envelope、frameId、activationId、generation、Data peer 或 carrier。

---

## 3. Listener Contribution vs Registration

两个概念保持分离：

```text
listener channels contribution → Desired Interest
listener.on(...)                → callback registration only
```

规则：

```text
createInputListener({channels})
    one listener contribution
    channels MAY be []

on(channel, handler)
    channel must currently be in this contribution
    one independent registration
    MUST NOT change Interest

setChannels(channels)
    changes this contribution only
    preserves registrations
    removed-channel registrations dormant
    re-add reactivates them

unsubscribe()
    removes one registration only
    no Interest change
    idempotent

close()
    atomically disables registrations + removes contribution
    idempotent
```

`on()` / `setChannels()` after close → `TypeError`。Foreign/invalid Frame → `TypeError`；known local closed Frame → existing `FrameClosedError`。

---

## 4. Author Validation / Desired Interest

`createInputListener` / `setChannels` 在 mutation 前验证：

```text
exact User Input v1 channel grammar/suffix
no duplicate channel in supplied contribution
resulting Frame union <= 64 channels
resulting Registry <= 128 Frames / 4096 pairs
```

非法 usage → `TypeError`；hard-limit overflow → `RangeError`。

失败必须：

```text
old contribution unchanged
old DesiredRegistry unchanged
wire send = 0
Data peer unaffected
```

每个 listener 保存 contribution，InputManager 派生：

```text
DesiredRegistry[F] = union(live listener contributions for F)
```

Config mutation：

```text
validate
→ atomic local commit
→ local eligibility immediately reflects new value
→ required retained-State local baseline
→ only if derived Registry changed, queue latest full input.interest
```

`on()` / `unsubscribe()` 永不发送 Interest。

Interest publisher只有：

```text
0..1 sendInterest inFlight
0..1 pendingLatest full Registry
```

fresh Data peer丢弃旧 publisher state，并从 current DesiredRegistry重新 publication；不 retry/replay old send。

---

## 5. Retained State / Local Baseline

对 current `(F,A,C.state)` 保存 latest **detached deep-immutable** payload snapshot。

```text
protocol-owned payload
→ detach
→ recursively immutable author snapshot
→ retain/deliver
```

具体 clone/freeze 实现是 private mechanics。Author-visible object identity 不是 contract；业务只能依赖 immutable structural value。

`.state` handler首次 locally eligible：

```text
on(C.state, handler)
OR setChannels reactivates dormant state handler
```

若 current retained State 存在：

```text
commit registration/config
→ synchronously deliver one latest local baseline
→ method returns
```

`.event` registration/reactivation永不 replay。

Derived union 真正移除一个 `.state` channel时立即清 retained State；later re-add 等待 fresh Renderer baseline。

---

## 6. Receive Gate / ADR 0029

well-formed `.state(F,A,C)` retention eligibility：

```text
current Data peer
∧ local Frame exists
∧ activationId == current local Activation
∧ C ∈ DesiredRegistry[F]
```

满足即可 retain latest；只有：

```text
Frame active
∧ ordinary mutation gate open
```

才交 business handlers。

因此 pending commit-sensitive mutation：

```text
State → retain latest / suppress delivery
Event → drop
Reset(current F/A) → clear retained/suppressed State
```

known-no-commit + same Activation reopen 顺序：

```text
restore mutation eligibility
→ synchronously converge latest retained State
→ only then make recoverable frame.call rejection observable
```

异步 handler Promise 不等待。Commit/revoke/admin suspend/close/terminal/Data retire 均清对应 suppressed old-Activation State。

---

## 7. Deterministic Handler Delivery

Observable order冻结，但**不冻结 ordinal/counter 等内部机制**：

```text
single channel
    matching handlers by successful on() registration order

multi-channel local convergence
    channels by canonical ASCII order
    then matching handlers by successful on() registration order
```

实现可用 array insertion order 或任何等价 private representation；不得因为文档引入专门的 registration sequence abstraction。

每次 delivery 捕获 stable matching-registration snapshot。Handler 在当前 invocation 中 unsubscribe/close/setChannels/on 只影响 subsequent delivery。

Sync throw contained，并继续尝试后续 matching handlers。

---

## 8. Async Handler Isolation

`InputHandler` MAY return `Promise<void>`，但 business async completion 不是 Data flow control：

```text
invoke synchronously
→ observe Promise rejection only for containment
→ do not await before later handlers
→ do not return/chain business Promise into @loomrealm/data dispatcher
```

never-settling Promise 不得 stall Data reader；async completion order不构成 Input ordering guarantee。

不新增 generic async scheduler/diagnostics framework。

---

## 9. Activation / Data / Frame Cleanup

Child-call成功：listener + Desired Interest可跨 suspension保留，但 A1 State/Event 不跨到 fresh A2；A2 等 fresh baseline。

Fresh Data：

```text
clear old-carrier retained State
keep DesiredRegistry/listeners
→ republish current full Registry
→ fresh State baseline
→ Event future-only
```

Frame close protocol success成立前，本地必须：

```text
close listeners bound to F
remove DesiredRegistry[F]
clear retained/suppressed State[F]
```

Runtime terminal最终清全部 Input local state。

---

## 10. Abstraction Budget

允许：

```text
one InputManager
per-listener contribution + registration records
one derived DesiredRegistry
minimal immutable retained State
one latest-only Interest publisher
small direct FrameRuntime hooks/queries
small recursive JSON detach/freeze helper
```

禁止：

```text
InputStore / GenericSubscription / EventBus / Observable
registration-order helper abstraction required only by docs
Generic async scheduler
Frame/Activation/InputTarget shadow registry
second Data reader/writer
cross-plane ACK/revision/barrier
retry/replay/history
platform event objects in author API
extra root supporting types only for symmetry
```

---

## 11. Done

M10/01 必须证明：

```text
minimal exact root Input exports compile
supporting shapes remain accessible through payload indexed access without root export
handler gets payload only
channels own Interest; on/unsubscribe do not
empty contribution valid / duplicates invalid
unsubscribe + close idempotent
setChannels preserves dormant handlers
successful-on() registration order + stable-snapshot delivery
state local baseline / event no replay
payload object identity not relied upon
async handler never stalls Data dispatch
invalid config rejects atomically without Data failure
multiple listener union / close isolation
ADR 0029 State convergence before recoverable rejection
committed mutation never leaks old suppressed State
Frame close local-first cleanup
fresh Data clears State + republishes Interest
```

下一步：[M10 / 02 — Renderer Input Gate](M10_02_RENDERER_INPUT_GATE.md)。
