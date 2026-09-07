# Renderer ⇄ Subsystem User Input Protocol v1

> 层级：正式契约  
> 状态：Active / Normative / Frozen  
> 协议版本：1  
> 协议标识：`loomrealm.user-input / 1`  
> 稳定程度：Frozen  
> 配置方向：Subsystem → Renderer（Frame Input Interest Registry）  
> 输入方向：Renderer → Subsystem（State / Event / Reset）  
> Carrier：[Renderer ⇄ Subsystem Data Connection Contract v1](./renderer-subsystem-data-connection-v1.md)  
> Authority：[Main ⇄ Renderer Control Protocol v1](./main-renderer-control-v1.md)、[Frame / Call Protocol v1](./frame-call-protocol-v1.md)  
> 组合：[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)  
> Conformance：[User Input v1 Conformance Profile](./user-input-conformance-v1.md)，`fixtureSetRevision = 2`  
> 决策：[ADR 0023](../decisions/0023-user-input-v1-semantic-closure.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 最近复核：2026-09-07

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

> **Main 决定 ordinary input authority；Subsystem 声明 Frame-scoped Desired Interest；Renderer 只发送 `current Data × Main InputTarget × active F/A × Interest[F] × Producer(C)`。State 是 self-contained current truth；Event 是 future-only transient impulse；Reset 是 Activation-scoped retained-State teardown barrier。**

---

## 1. Scope / Ownership

User Input v1 运行在 current Renderer ⇄ Subsystem Data Connection 上：

```text
Subsystem → Renderer
    input.interest

Renderer → Subsystem
    input.state
    input.event
    input.reset
```

Authority：

```text
Main
    Frame / Activation / InputTarget

Subsystem
    Desired Interest[F]
    local retained State / business delivery gate

Renderer
    Producer(C) availability
    trusted sender-side Effective enforcement
```

不属于本协议：Frame create/call/return/close、InputTarget mutation、Renderer focus authority、Render lifecycle、ACK/NACK、replay/history、text/IME、platform event API、physical Data provisioning。

---

## 2. Three Lifetimes

必须区分：

```text
Desired Interest
    Frame-scoped local business configuration

Input Lease
    InputTarget(frameId, activationId)
    Activation-scoped one-shot authority epoch

Wire Publication State
    current Data carrier scoped
    published Interest Registry + retained State baseline + Event stream
```

Desired Interest MAY 跨 Frame child-call suspension、fresh Activation、same-generation reconnect、fresh generation 保存，只要 Frame仍 live且业务仍需要相同 channel。

旧 `frameId + activationId` 一旦 revoked/replaced 永不重新成为 InputTarget。

fresh carrier总是从：

```text
remote Interest Registry = {}
retained wire State       = {}
Event history             = none
```

开始；旧 State/Event绝不跨 Activation或 carrier replay。

---

## 3. Wire Surface

每个 application unit：

```text
one UTF-8 JSON text string
= exactly one message object
```

```ts
type UserInputMessageV1 =
  | InputInterestV1
  | InputStateV1
  | InputEventV1
  | InputResetV1;

interface FrameInputInterestV1 {
  readonly frameId: string;
  readonly channels: readonly InputChannelV1[];
}

interface InputInterestV1 {
  readonly type: "input.interest";
  readonly frames: readonly FrameInputInterestV1[];
}

interface InputStateV1 {
  readonly type: "input.state";
  readonly frameId: string;
  readonly activationId: string;
  readonly channel: InputStateChannelV1;
  readonly payload: JsonObjectV1;
}

interface InputEventV1 {
  readonly type: "input.event";
  readonly frameId: string;
  readonly activationId: string;
  readonly channel: InputEventChannelV1;
  readonly payload: JsonObjectV1;
}

interface InputResetV1 {
  readonly type: "input.reset";
  readonly frameId: string;
  readonly activationId: string;
}
```

v1 不增加：sequence、revision、inputEpoch/inputSessionId、producerId envelope、ACK/NACK、replay cursor、subscription revision。

---

## 4. Channel Identity

标准 channel exact names：

```text
keyboard.state
keyboard.event
pointer.state
pointer.event
gamepad.state
gamepad.event
```

Custom：

```text
x.<custom-name>.state
x.<custom-name>.event
```

`<custom-name>` 是一个或多个 dot-separated segment：

```text
segment = [a-z][a-z0-9-]{0,31}
channel total = 1..128 ASCII bytes
```

规则：case-sensitive；无 wildcard/prefix subscription；standard prefixes closed/reserved；unknown non-`x.*` invalid；`.state` 只用于 State，`.event` 只用于 Event。

Custom payload root MUST 是 bounded JSON object，并服从相同 lifetime/authority/State/Event 规则。

---

## 5. Frame Input Interest Registry

`input.interest` 是 current carrier上的 full replacement：

```text
InterestRegistry = Map<frameId, Set<channel>>
```

限制：

```text
0..128 frame entries
frameId unique
1..64 channels / present frame
channel unique / frame
<=4096 total frame×channel pairs
```

Canonical form：

```text
frames[] sorted by frameId UTF-8 lexical order
channels[] sorted by ASCII byte order
```

`frameId` absent == empty Interest；不得发送 empty-channel frame entry；清空全部使用 `{"type":"input.interest","frames":[]}`。

不存在 incremental subscribe/unsubscribe、Interest ACK、revision 或 replay cursor。

unknown/stale Frame Interest MUST 保存为 inert configuration；不创建 authority，也不是 protocol error。Frame id 在 Session 内不复用。

Subsystem local Frame terminalize 前 MUST 已经 remove Desired Interest、clear retained local input state、close/disable bound listeners；wire cleanup MAY 稍后 coalesce/send。

---

## 6. Cross-plane Effective Gate

对 `(S,F,A,C)`：

```text
Effective
=
current Data Connection for S
AND Main current InputTarget == (S,F,A)
AND mirrored F exists
AND mirrored F lifecycle == active
AND mirrored F activationId == A
AND C ∈ published Interest[F]
AND Producer(C) available
```

Renderer 在 Control snapshot、Interest Registry、Producer availability、current Data 任一变化后重算。

Interest-first 与 Authority-first 都必须收敛；Control/Data 无 global total order，不增加 ACK/revision join/barrier/handshake。

Renderer不解释 push/pop/call/return/caller/child/unwind。

---

## 7. Effective Transitions

`.state` `false → true`：Renderer MUST promptly queue one fresh self-contained current State baseline。

典型原因：Interest expand、fresh InputTarget/Activation、fresh carrier + Interest republish、Producer return。

`.event` `false → true`：只允许 transition 后的 future Event，无 replay。

`true → false`：立即停止产生新的 ordinary input；原因包括 InputTarget revoke/replace、Frame不 active、Interest shrink、Producer loss、Data retirement、Control loss。

---

## 8. Subsystem Receive Semantics

### 8.1 Retention eligibility

well-formed `.state(F,A,C)` 在以下条件成立时可更新 local latest retained State：

```text
message belongs to current Data carrier
local Frame exists
activationId == current local Activation
C ∈ local Desired Interest[F]
```

否则 drop。

Retained State 暴露给 author 前 MUST 是 author-safe immutable snapshot；业务突变不得改变以后 listener看到的 retained baseline。

### 8.2 Business delivery eligibility

只有进一步满足：

```text
Frame active
AND local ordinary-input/mutation gate open
```

才将 State/Event交给 business handler。

因此 commit-sensitive mutation 暂时关闭 gate 时：

```text
State → retain latest, suppress business delivery
Event → drop
Reset(current F/A) → clear all retained/suppressed State for F/A
```

这不会改变 Renderer Effective，也不增加 Renderer对 Subsystem mutation gate 的知识。

### 8.3 Known no-commit reopen

只有明确 known-no-commit 且 same Activation恢复 ordinary mutation时：

```text
same F/A survives
→ deliver at most one latest retained State per still-interested .state channel
→ Event remains future-only; no replay
```

如果 pending mutation随后 commit/revoke Activation、administrative suspend、Frame close、Runtime terminal/ambiguous 或 Data retire，则 suppressed old State清除且不得交给业务。

### 8.4 Listener-local baseline

同一 current `(F,A,C.state)` 已有 retained State时，新 listener或 listener channel expansion首次 locally eligible：

```text
install config atomically
→ deliver one latest retained State to that listener
```

无需制造 wire Interest toggle。`.event` listener只接收 future Event。

### 8.5 Handler failure

Input handler throw/reject是 business-local callback failure：MUST NOT 逃逸成 Data protocol/local fatal、MUST NOT改变 Frame/Runtime authority，并且不得阻止其它当前匹配 listener被尝试交付。

---

## 9. State / Event / Reset

### State

所有 `.state`：

```text
self-contained
latest wins
MAY coalesce before emitted
must not require earlier State
must not replay across Activation/carrier
```

`emitted` = application unit已被 current carrier ordered-send boundary成功接受；emitted 后不可 retract/reorder/retry。

### Event

所有 `.event`：

```text
ordered
transient
MUST NOT coalesce
MUST NOT replay
MAY drop before emitted under bounded backpressure
MUST NOT be persistent correctness唯一来源
```

surviving Events保持相对顺序。

### Reset

`input.reset(F,A)` 不是 channel；若 `(F,A)` 仍是 local current Activation，则清该 Activation全部 retained `.state`，不改 Interest、不 replay/cancel Event。

Reset 是 global Renderer→Subsystem State-coalescing barrier。stale Reset MAY drop。Reset best-effort 丢失不能让旧 lease重新有效。

---

## 10. InputTarget Replacement

Renderer观察 old target `(S1,F1,A1)` revoke/replace：

```text
old lease ends immediately
→ no new old-lease ordinary input
→ if old carrier still current, best-effort queue Reset(F1,A1)
```

同一 current Data carrier直接：

```text
(S,F,A1) → (S,F2,A2)
```

即使中间 null snapshot被 Control coalesce：

```text
Reset(A1) MUST be ordered before first ordinary Input(A2)
```

不同 carrier无跨-carrier ordering requirement。

fresh Activation复用 Interest MAY，但 State必须 fresh baseline、Event future-only；绝不继承旧 Activation retained State/Event。

---

## 11. Fresh Carrier / Interest Mutation

current carrier retired：

```text
published Interest Registry discarded
retained input publication State discarded
all not-emitted Events discarded
old carrier messages no longer current
```

same-generation reconnect 与 fresh-generation replacement均建立 fresh wire publication state。

Subsystem SHOULD 自动向 fresh peer republish current full Desired Interest；current local retained State必须清除，重新 Effective 后等待 fresh Renderer baseline。

Interest mutation顺序：

```text
validate candidate author config
→ atomic local Desired Interest update
→ local eligibility immediately reflects new value
→ queue latest full Registry publication
```

Shrink：移除 `.state` channel时立即清该 channel retained State；移除 Frame entry时清该 Frame全部 retained State。late removed-channel State/Event drop。

Expand：`.state` 在 Renderer Effective 后 fresh baseline；`.event` future-only。

Author-side invalid channel/union/hard-limit configuration MUST local-atomically reject，保持旧 Desired Interest不变、wire send=0、Data peer不受影响。

---

## 12. Producer Availability

Producer availability 是 Renderer-local gate，不是 Main authority。

`.event` Producer loss：停止 future Event，无 replay。

current Effective `.state` Producer loss且 same lease/Data有效：

```text
stop affected State channel
→ best-effort Reset(F,A)
→ fresh baseline every remaining Effective .state channel after Reset
```

Producer return：`.state` fresh baseline；`.event` future-only。

---

## 13. Standard Keyboard

Keyboard v1 是 physical-control input，不承载 locale character、IME/composition、text editing、clipboard。

合法 `KeyboardCodeV1` exact set：

```text
KeyA .. KeyZ
Digit0 .. Digit9
F1 .. F24
Numpad0 .. Numpad9
ArrowUp ArrowDown ArrowLeft ArrowRight
Space Enter Escape Tab Backspace
ShiftLeft ShiftRight
ControlLeft ControlRight
AltLeft AltRight
MetaLeft MetaRight
CapsLock
Insert Delete Home End PageUp PageDown
Minus Equal BracketLeft BracketRight Backslash
Semicolon Quote Backquote Comma Period Slash
NumpadAdd NumpadSubtract NumpadMultiply NumpadDivide
NumpadDecimal NumpadEnter
```

无法可靠映射的 control不进入标准 keyboard channel，可用 custom `x.*`。

```ts
interface KeyboardStatePayloadV1 {
  readonly down: readonly KeyboardCodeV1[];
}
```

`down` 0..128、unique、ASCII lexical sorted，表示当前 held standard controls。

```ts
interface KeyboardEventPayloadV1 {
  readonly action: "down" | "up";
  readonly code: KeyboardCodeV1;
  readonly repeat: boolean;
}
```

first down `repeat=false`；repeated down while held `repeat=true`；up `repeat=false`。

若 `keyboard.state` 同时 Effective，first down/up transition：post-transition State → Event；repeat=true不改变 held State，因此不要求额外 State。

---

## 14. Standard Pointer

Pointer 坐标是 Renderer input surface normalized fixed-point：

```text
0          = left/top
1,000,000  = right/bottom
```

允许 signed int32 off-surface：`-2,147,483,648 .. 2,147,483,647`。origin top-left，x右，y下。

```ts
type PointerKindV1 = "mouse" | "touch" | "pen";
type PointerButtonV1 =
  | "primary" | "auxiliary" | "secondary" | "back" | "forward";

interface PointerSampleV1 {
  readonly pointerId: number;
  readonly kind: PointerKindV1;
  readonly x: number;
  readonly y: number;
  readonly buttons: readonly PointerButtonV1[];
}
```

`pointerId` positive safe integer，one-shot within one Activation lease；ended id不得在同 lease复用。`buttons` unique且按 enum order。

```ts
interface PointerStatePayloadV1 {
  readonly pointers: readonly PointerSampleV1[];
}
```

0..32 pointers；id unique、ascending。

```ts
interface PointerEventPayloadV1 {
  readonly action: "down" | "up" | "cancel";
  readonly pointer: PointerSampleV1;
  readonly button: PointerButtonV1 | null;
}
```

down/up button non-null；cancel button null；sample描述 transition/post-transition values。若 `.state` 同时 Effective，down/up/cancel：post-transition State → Event。

v1 不标准化 wheel、gesture、pressure、tilt、capture API、raw motion。

---

## 15. Standard Gamepad

Gamepad v1 固定 standard logical layout；vendor-specific extras不进入标准 channel。

`gamepadId` positive safe integer、one-shot within one Activation lease。

```text
axis:   -1,000,000 .. +1,000,000
button:  0 .. 1,000,000
pressed threshold = 500,000
```

```ts
interface GamepadAxesV1 {
  readonly leftX: number;
  readonly leftY: number;
  readonly rightX: number;
  readonly rightY: number;
}

interface GamepadButtonsV1 {
  readonly south: number;
  readonly east: number;
  readonly west: number;
  readonly north: number;
  readonly leftBumper: number;
  readonly rightBumper: number;
  readonly leftTrigger: number;
  readonly rightTrigger: number;
  readonly select: number;
  readonly start: number;
  readonly leftStick: number;
  readonly rightStick: number;
  readonly dpadUp: number;
  readonly dpadDown: number;
  readonly dpadLeft: number;
  readonly dpadRight: number;
  readonly home: number;
}

interface GamepadSampleV1 {
  readonly gamepadId: number;
  readonly axes: GamepadAxesV1;
  readonly buttons: GamepadButtonsV1;
}

interface GamepadStatePayloadV1 {
  readonly gamepads: readonly GamepadSampleV1[];
}
```

0..16 gamepads；id unique、ascending。

```ts
type GamepadButtonNameV1 = keyof GamepadButtonsV1;

interface GamepadEventPayloadV1 {
  readonly action: "down" | "up";
  readonly gamepadId: number;
  readonly button: GamepadButtonNameV1;
  readonly value: number;
}
```

Event仅在 canonical pressed boolean跨 threshold时产生；value是 transition后值。若 `.state` 同时 Effective：post-transition State → Event。连接/断开只通过 state membership变化表达。

---

## 16. State-before-Event / Coalescing Barriers

对 keyboard/pointer/gamepad family，当 sibling `.state` 与 `.event` 对同一 `(F,A)` 同时 Effective，且 physical transition改变 State并产生 Event：

```text
post-transition State
MUST be queued/emitted before
corresponding Event
```

Event handler若维护 retained sibling State，总能观察 post-transition State。

Renderer→Subsystem ordered stream：

```text
State MAY coalesce
Event MUST NOT coalesce
Event is a global State-coalescing barrier
Reset is a global State-coalescing barrier
```

State不得跨 retained Event/Reset barrier移动。若未 emitted Event因 backpressure被丢弃，该 barrier消失。

Subsystem→Renderer Interest 是独立方向的 latest full snapshot；多个尚未 emitted Registry MAY latest-state coalesce。

---

## 17. Backpressure

所有队列 MUST bounded。

observable rules：

```text
Interest
    latest unsent full Registry

State
    latest pending snapshot per Effective state channel between barriers

Event
    bounded ordered queue
    MAY drop before emitted
    surviving Events preserve order

Reset
    teardown barrier
    prioritized over obsolete pending old-State work
```

Event backlog不得无限阻塞 authority teardown或持续 State convergence；Event overflow不是 Runtime failure/Frame unwind。

Renderer role MUST apply User Input coalescing/drop policy before generic Data writer capacity can turn ordinary Input backlog into Data local-fatal。

---

## 18. Wire / Validation / Limits

Wire uses frozen JSON semantics：one UTF-8 JSON text unit、plain JSON-compatible value、closed schemas、safe integers unless narrower。

禁止：`undefined`、NaN/Infinity、BigInt、Function/Symbol、ArrayBuffer/Blob/MessagePort、DOM/Host object、class instance、invalid Unicode scalar sequence。

source duplicate object member遵循 frozen Wire / ECMAScript `JSON.parse` observable semantics；不得增加第二 tokenizer/parser。

Top-level exact keys：

```text
input.interest  type, frames
FrameInterest   frameId, channels
input.state     type, frameId, activationId, channel, payload
input.event     type, frameId, activationId, channel, payload
input.reset     type, frameId, activationId
```

Standard payload exact schemas就是 §§13–15；unknown/missing/wrong member、wrong channel payload均 invalid。

Hard limits：

```text
application message UTF-8              <= 1,048,576 bytes
JSON container depth                    <= 64
generic array/object members            <= 16,384
frameId / activationId                  1..128 UTF-8 bytes
channel                                 1..128 ASCII bytes
custom segment                          1..32 ASCII bytes
Interest Frames                         <= 128
Channels / Frame                        1..64
total Interest pairs                    <= 4,096
payload compact JSON                    <= 262,144 UTF-8 bytes
payload relative depth                  <= 32
payload array/object members            <= 16,384
keyboard.state down                     <= 128
pointer.state pointers                  <= 32
gamepad.state gamepads                  <= 16
pointerId / gamepadId                   positive safe integer
pointer x/y                             signed int32
gamepad axis                            -1,000,000..1,000,000
gamepad button                          0..1,000,000
```

Receiver order：

```text
application string
→ whole-message bound
→ frozen JSON parse / generic representation bounds
→ type discrimination / exact schema
→ identity/channel/count/payload limits
→ standard payload validation
→ authority/applicability
→ local retention/delivery or Interest replacement
```

Protocol-invalid不能降级为 stale drop。

---

## 19. Failure Taxonomy

### Protocol-invalid / Data-fatal

malformed JSON、unknown/wrong type/direction/schema、invalid channel/standard payload、hard-limit violation等：

```text
stop trusting current Data stream
→ retire current Data Connection
→ recover only through fresh current carrier if DataAuthority remains current
```

不等于 Runtime failure/Frame unwind。

### Well-formed authority-inapplicable

stale Activation、unknown/closed local Frame、not-interested、no-longer-current carrier：drop only。

### Mutation-gate-local

same current F/A/C `.state` 在 commit-sensitive mutation gate closed：retain latest + suppress business delivery；`.event` drop。known no-commit same-Activation reopen按 §8.3 local-converge。

### Interest/control skew

unknown/stale Frame Interest：store inert。

### Producer transition

loss/return按 §12；不 retire Data。

### Business handler failure

InputListener handler throw/reject：local containment；不改变 wire validity，不 retire Data，不授权 Main/Renderer改变 authority。

---

## 20. Frame / Data / Render Independence

```text
Frame-scoped Interest != per-Frame Data Connection
Frame suspend          != Interest removal
fresh Activation       != Interest replacement
Frame close            != Data retire
Interest removal       != Frame close
Interest               != InputTarget authority
Data current            != ordinary input authority
Render Domain           != Input authority
```

Input 与 Render 是同一 Data carrier上的 sibling protocols；shared ordering不创建 shared authority/revision/transaction。

---

## 21. Non-goals

v1 不定义：text/IME/composition、clipboard、wheel/gesture/pressure/tilt/raw motion、vendor gamepad extension、haptics/output、ACK/NACK、replay/history、input sequence/revision、wildcard Interest、incremental subscription、Activation-scoped Interest、per-channel Reset、signed untrusted-Renderer capability、cross-Control/Data transaction、Frame mutation from input protocol。

---

## 22. Conformance / Compatibility

Current conformance：

```text
protocol = loomrealm.user-input
protocolVersion = 1
fixtureSetRevision = 2
```

Revision 2在原有 three-lifetime、Interest、Effective、State/Event/Reset、standard payload、limits、failure、transport-equivalence obligations上新增 ADR 0029：

```text
mutation-gate State retention without business delivery
known-no-commit same-Activation local State convergence
commit/revoke discard of suppressed old State
Reset clearing suppressed State
listener-local retained State baseline
handler failure isolation
author invalid Interest local atomic rejection
```

旧 fixture revision 1不得冒充 current complete conformance。

以下不兼容改变需要新 User Input version或新 Data Profile combination：wire messages/schema、channel grammar、standard payload/identifier/numeric semantics、Interest/Activation lifetime、State/Event/Reset ordering/coalescing、hard limits、failure/recovery、encoding/mapping。

ADR 0029 是首次 conformant implementation前的一次 current-v1 correction；不形成未来破坏 compatibility 的通用豁免。

---

## 23. Final Invariants

1. Main 是 ordinary InputTarget/Activation 唯一公共 authority；
2. Desired Interest 是 Subsystem-owned Frame-scoped configuration，不是 authority；
3. Input lease 是 Activation-scoped one-shot authority epoch；
4. wire publication state是 carrier-scoped；
5. Desired Interest可跨 fresh Activation/Data保存，旧 State/Event不可 replay；
6. Renderer只组合 current facts，不解释 Frame stack；
7. Control/Data无 global total order；
8. `.state` self-contained/latest-wins，且临时 mutation gate关闭不能破坏 same-Activation current-State convergence；
9. `.event` future-only/ordered/transient/no replay；
10. Event/Reset都是 global State-coalescing barriers；
11. standard stateful Event在 sibling State Effective时必须位于 post-transition State之后；
12. Reset清 `(F,A)` 全部 retained State但不改 Interest；
13. same-carrier direct target replacement先 teardown old lease，再允许 new lease input；
14. fresh carrier从 empty Interest/State/Event history开始；
15. protocol-invalid retire Data，well-formed stale input drop，business handler failure local-contain；
16. Input/Data/Frame/Render lifetimes与authority互不拥有彼此。
