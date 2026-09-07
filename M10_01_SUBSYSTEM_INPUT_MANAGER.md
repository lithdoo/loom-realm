# M10 / 01 — Subsystem InputManager

> 状态：**Implementation Frozen / Ready for Implementation**  
> 阶段：M10 User Input  
> 落地顺序：01  
> 最近复核：2026-09-07  
> 正式协议：[User Input v1](doc/15-contracts/user-input-v1.md)  
> 修正决策：[ADR 0029](doc/decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> Author boundary：[packages/subsystem/DESIGN.md](packages/subsystem/DESIGN.md)  
> 目标：在现有 M4 Frame Runtime + M8 Data peer 上实现唯一 role-local `InputManager`；公开 SDK 语义在本文冻结，编码阶段只允许选择 private layout/name，不得再发明 author-visible behavior。

> **InputManager 拥有 Desired Interest、listener lifecycle、retained State 与 local delivery；FrameRuntime 仍是 local Frame/Activation/mutation-gate 唯一事实源，`@loomrealm/data` 仍拥有 wire validation/serialization。**

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
→ direct same-package InputManager hook/query

current SubsystemDataPeer
↔ same InputManager
```

不得建立 Frame shadow registry、EventBus、service locator 或第二条 Data reader/writer。

---

## 2. Exact Author Surface

M10 root-export 以下业务类型；名字与行为冻结：

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

export type InputJsonObject = JsonObject;

export type KeyboardCode = KeyboardCodeV1;
export type PointerKind = "mouse" | "touch" | "pen";
export type PointerButton =
  | "primary"
  | "auxiliary"
  | "secondary"
  | "back"
  | "forward";

export interface PointerSample {
  readonly pointerId: number;
  readonly kind: PointerKind;
  readonly x: number;
  readonly y: number;
  readonly buttons: readonly PointerButton[];
}

export interface GamepadAxes {
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
}

export interface GamepadButtons {
  // exact User Input v1 standard logical button fields
}

export interface GamepadSample {
  readonly gamepadId: number;
  readonly axes: GamepadAxes;
  readonly buttons: GamepadButtons;
}

export type GamepadButtonName = keyof GamepadButtons;

export interface KeyboardStateInput {
  readonly down: readonly KeyboardCode[];
}

export interface KeyboardEventInput {
  readonly action: "down" | "up";
  readonly code: KeyboardCode;
  readonly repeat: boolean;
}

export interface PointerStateInput {
  readonly pointers: readonly PointerSample[];
}

export interface PointerEventInput {
  readonly action: "down" | "up" | "cancel";
  readonly pointer: PointerSample;
  readonly button: PointerButton | null;
}

export interface GamepadStateInput {
  readonly gamepads: readonly GamepadSample[];
}

export interface GamepadEventInput {
  readonly action: "down" | "up";
  readonly gamepadId: number;
  readonly button: GamepadButtonName;
  readonly value: number;
}

export type InputPayload<C extends InputChannel> =
  C extends "keyboard.state" ? KeyboardStateInput :
  C extends "keyboard.event" ? KeyboardEventInput :
  C extends "pointer.state" ? PointerStateInput :
  C extends "pointer.event" ? PointerEventInput :
  C extends "gamepad.state" ? GamepadStateInput :
  C extends "gamepad.event" ? GamepadEventInput :
  C extends `x.${string}.state` | `x.${string}.event` ? InputJsonObject :
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
```

`KeyboardCode` exact union = User Input v1 frozen `KEYBOARD_CODES_V1` set；实现可用内部 type alias 复用 `KeyboardCodeV1`，但 author root name固定为 `KeyboardCode`。

`GamepadButtons` exact fields、所有 standard payload numeric range/canonical ordering以 User Input v1 为唯一事实源；author types只是结构等价 projection，不能出现第二套字段/范围。Supporting type names固定为：

```text
InputJsonObject
KeyboardCode
PointerKind
PointerButton
PointerSample
GamepadAxes
GamepadButtons
GamepadSample
GamepadButtonName
```

`SubsystemScope` exact M10 extension：

```ts
interface SubsystemScope {
  readonly signal: AbortSignal;
  createInputListener(options: CreateInputListenerOptions): InputListener;
}
```

Custom `x.*` handler value是 `InputJsonObject`；它结构上复用 shared bounded JSON object model，不要求业务 import `@loomrealm/wire`。

Handler **只收到 payload**，绝不收到：

```text
input.state / input.event envelope
frameId / activationId
generation / dataProfile
RendererDataPeer / MessageCarrier
```

实现可在 package 内部通过 type alias 复用 `@loomrealm/data` / shared JSON types，但 root-export 使用上述 exact author names；业务 Definition 只 import `@loomrealm/subsystem`。

---

## 3. Listener Contribution vs Handler Registration

两个概念必须分离：

```text
listener.channels contribution
    owns Desired Interest contribution

listener.on(...)
    owns callback registration only
```

固定规则：

```text
createInputListener({channels})
    creates exactly one listener contribution
    channels MAY be []

on(channel, handler)
    MUST NOT change Interest
    channel MUST currently belong to this listener contribution
    one call = one independent registration

setChannels(channels)
    changes this listener contribution only
    preserves existing handler registrations
    removed-channel handlers become dormant
    re-added channel reactivates those handlers

unsubscribe()
    removes exactly its registration
    MUST NOT change Interest
    idempotent

close()
    atomically disables all registrations + removes this contribution
    idempotent
```

`on()` / `setChannels()` after `close()` synchronously throw `TypeError`；`unsubscribe()` after listener close remains harmless/idempotent。

`createInputListener` 必须使用同一 Subsystem instance 的 live branded `Frame` capability；foreign/invalid capability同步 `TypeError`，已知 local closed Frame使用现有 `FrameClosedError`。

---

## 4. Local Author Validation

`createInputListener` / `setChannels` 在改变任何 local state 前验证：

```text
exact User Input v1 channel grammar/suffix
no duplicate channel in supplied contribution
resulting Frame union <= 64 channels
resulting Registry <= 128 Frames / 4096 pairs
```

失败：

```text
invalid/duplicate/illegal usage → TypeError
representability hard-limit overflow → RangeError

old listener contribution unchanged
old DesiredRegistry unchanged
wire send = 0
current Data peer unaffected
```

这是 author representability validation，不建立第二套 inbound wire/schema validator。

---

## 5. Desired Interest

每个 listener 保存自己的 contribution；InputManager 派生：

```text
DesiredRegistry = Map<frameId, Set<channel>>
```

同一 Frame 多 listener取 union。

Config mutation顺序：

```text
validate candidate
→ atomically commit local contribution/lifecycle
→ recompute affected union
→ local receive/delivery eligibility立即反映新值
→ perform any required local retained-State baseline delivery
→ if derived DesiredRegistry changed, queue latest full input.interest snapshot
```

`on()` / `unsubscribe()` 永不 publication Interest。

如果 listener contribution变化但 derived union未变，不发送冗余 Registry。

Wire 始终 full replacement，不做 incremental subscribe/unsubscribe。

Interest publisher exact shape：

```text
0..1 inFlight sendInterest
0..1 pendingLatest full Registry
```

fresh Data peer丢弃旧 publisher state，并从 current DesiredRegistry重新 publication；不 retry/replay old send。

---

## 6. Retained State / Author-safe Value

InputManager 对 current `(F,A,C.state)` 保存最新 **detached deep-immutable** State payload snapshot。

```text
wire/data payload object
→ detach from protocol-owned mutable object graph
→ recursively make author-visible snapshot immutable
→ retain/deliver that snapshot
```

具体 clone/freeze helper是 private mechanics，不形成新的 public abstraction；业务对收到对象的突变尝试不得改变以后 retained baseline。

Author-visible payload **object identity不是 contract**；实现可以对同一 immutable retained version复用对象，也可以等价重新 materialize，业务只能依赖结构值语义。

Interest union真正移除一个 `.state` channel时立即清该 channel retained State；移除整个 Frame entry时清该 Frame retained State。

---

## 7. Handler Eligibility / Local Baseline

State handler首次 locally eligible有两种来源：

```text
A. on(C.state, handler) registration
   while C already belongs to listener contribution

B. setChannels(...) re-add/expand C.state
   with previously registered dormant handlers
```

若 `(F,A,C.state)` 已有 current retained State：

```text
commit registration/config first
→ synchronously invoke eligible handler(s) exactly once with latest retained State
→ method returns
```

无需制造 wire Interest toggle，也不要求 Renderer重发 baseline。

`.event` registration/expansion只接收 future Event，绝不 local replay。

如果 union曾真正移除 `.state`，其 retained State已清除，因此以后 re-add 必须等待 Renderer fresh baseline；不能复活旧 local State。

---

## 8. Receive: Retention Gate vs Business Gate

well-formed `.state(F,A,C)` 先检查 retention eligibility：

```text
message from current Data peer
∧ local Frame exists
∧ activationId == current local Activation
∧ C ∈ DesiredRegistry[F]
```

不满足 → drop。

满足：

```text
retain latest immutable State
```

随后只有：

```text
Frame active
∧ ordinary mutation gate open
```

才交 business handlers。

因此 commit-sensitive mutation pending：

```text
State → retain latest, suppress delivery
Event → drop
Reset(current F/A) → clear retained/suppressed State
```

这不改变 Renderer Effective，也不增加 cross-plane signal。

---

## 9. Deterministic Handler Invocation

每次 business delivery先捕获一个 stable matching-registration snapshot。

顺序冻结：

```text
single channel delivery
    handlers by global InputManager registration order

multi-channel local convergence
    channels by canonical ASCII channel order
    then handlers by global registration order
```

因此 handler 在 invocation 中调用：

```text
unsubscribe
listener.close
listener.setChannels
new listener.on
```

只影响 **subsequent delivery**，不改变当前已捕获 snapshot。

每个 matching handler 都必须被 synchronously attempted；一个 handler同步 throw不能阻止后续 handler invocation。

---

## 10. Async Handler Isolation

`InputHandler` MAY return `Promise<void>`，但 business async completion **不是 Data flow control**。

固定：

```text
invoke handler synchronously
→ if it returns Promise, observe settlement only for rejection containment
→ DO NOT await it before invoking next handler
→ DO NOT return/chain it into @loomrealm/data inbound dispatcher
```

所以：

```text
sync throw            → contained
Promise reject        → contained
Promise never settles → does not stall Data reader / other input delivery
```

Async Promise completion order不构成 Input delivery ordering guarantee。

M10 不建立 diagnostics/event framework；具体 logging 属于以后独立 diagnostics policy。

---

## 11. Mutation Reopen / Activation Boundary

只有明确 known-no-commit 且 same Activation 恢复 ordinary mutation时：

```text
restore same F/A mutation eligibility
→ synchronously perform retained-State convergence
   canonical state-channel order
   matching handlers global registration order
→ only after all eligible handler invocations have been attempted,
   settle frame.call() with recoverable rejection
```

异步 handler Promise 不等待 settlement。

因此业务 `catch` / rejected-Promise continuation开始时，所有 current retained State handler的同步 invocation side effects已经发生。

如果 mutation commit / Activation revoke / administrative suspend / Frame close / Runtime terminal：

```text
old/suppressed Activation State discarded
```

Child-call正常成功：listener + Desired Interest可跨 suspension保留，但 A1 State/Event 不跨到 fresh A2；A2 等待 fresh Renderer baseline。

---

## 12. Data / Frame Cleanup

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

## 13. Implementation Budget

允许：

```text
one InputManager per Subsystem instance
per-listener contribution + registration records
one global registration ordinal
one derived DesiredRegistry
minimal immutable retained State
one latest-only Interest publisher
small direct FrameRuntime hooks/queries
small recursive JSON detach/freeze helper
```

禁止：

```text
InputStore / GenericSubscription / EventBus
Generic async task scheduler
InputTarget/Frame/Activation shadow authority
second Data reader/writer
cross-plane ACK/revision/barrier
retry/replay/history
platform event objects in author API
```

---

## 14. Done

M10/01 必须证明：

```text
exact root-export Input SDK names/types compile
standard/supporting author type names are frozen
handler receives payload only, never protocol envelope
channels own Interest; on/unsubscribe never mutate Interest
empty contribution valid / duplicates invalid
unsubscribe + close idempotent
setChannels preserves dormant handlers
global registration-order + stable-snapshot delivery
state on()/reactivation local baseline
.event no local replay
payload object identity not relied upon
async handler never stalls Data dispatch
local invalid configuration rejects atomically without Data failure
multiple listener union / close isolation
pending mutation retains State but suppresses delivery
recoverable no-commit convergence happens before frame.call rejection is observable
committed mutation never leaks suppressed old-Activation State
Frame close local-first cleanup
fresh Data clears State + republishes Interest
```

下一步：[M10 / 02 — Renderer Input Gate](M10_02_RENDERER_INPUT_GATE.md)。
