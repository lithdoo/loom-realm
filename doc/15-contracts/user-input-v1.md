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
> Conformance：[User Input v1 Conformance Profile](./user-input-conformance-v1.md)  
> 决策：[ADR 0023](../decisions/0023-user-input-v1-semantic-closure.md)  
> 最近复核：2026-08-21

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。

核心原则：

> **Main 决定 ordinary input authority；Subsystem 声明 Frame-scoped desired Interest；Renderer 只发送 `Main InputTarget × Interest[F] × Producer(C)` 的交集。Desired Interest、Activation input lease 与 carrier publication state 是三个不同 lifetime。State 是 self-contained latest state；Event 是 future-only transient impulse；Reset 是 Activation-scoped retained-State teardown barrier。**

---

## 1. Scope / Direction

User Input v1 在 current Renderer ⇄ Subsystem Data Connection 上运行。

```text
Subsystem → Renderer
    input.interest

Renderer → Subsystem
    input.state
    input.event
    input.reset
```

它负责：

```text
Frame-scoped desired Input Interest publication
ordinary input sender/receiver gate
Activation-scoped input lease
standard Keyboard / Pointer / Gamepad canonical payload
custom x.* channel envelope
State/Event/Reset ordering and coalescing
fresh-carrier input baseline
producer loss / authority replacement teardown
input-local failure/drop boundary
```

它不负责：

```text
Frame creation / call / return / close
InputTarget mutation
Renderer focus authority
Render Domain lifecycle
Input ACK / Result
input replay / history
text editing / IME / composition
platform event API
physical Data provisioning
```

---

## 2. Authority / Trust Model

Authority ownership：

```text
Main
    Frame / Activation / InputTarget

Subsystem
    desired Interest[F]

Renderer
    Producer(C) availability
    trusted sender-side enforcement
```

对 Subsystem `S`、Frame `F`、Activation `A`、Channel `C`：

```text
Effective(F,A,C)
=
current Data Connection for S
AND Main current InputTarget == (S,F,A)
AND mirrored F exists
AND mirrored F lifecycle == active
AND mirrored F activationId == A
AND C ∈ published Interest[F]
AND Producer(C) available
```

Interest 和 Producer 只能缩小 ordinary input 面，不能创造或扩大 Main authority。

Subsystem 收到 ordinary State/Event 后仍 MUST重新验证 local gate；Renderer 不是 cryptographic authority proof。v1 不增加 signed token/capability。

---

## 3. Three Lifetimes

User Input v1 必须区分三个正交 lifetime：

```text
A. Desired Interest lifetime
   = Frame-scoped local business configuration

B. Ordinary input lease lifetime
   = one InputTarget(frameId, activationId)
   = Activation-scoped authority epoch

C. Wire publication lifetime
   = current Data carrier
   = published Interest Registry + retained State baseline + Event stream
```

### 3.1 Desired Interest

Desired Interest 可跨：

```text
Frame suspension
fresh Activation
same-generation Data reconnect
fresh Data generation
```

前提是 local Frame 仍 live、Subsystem 仍希望该 Frame 接收相同 Channel。

### 3.2 Input lease

一个已经 published 的：

```text
InputTarget(frameId, activationId)
```

一旦 revoked/replaced，旧 lease 永久结束；同一 `frameId + activationId` 不得重新成为 InputTarget。

fresh ordinary grant 使用 fresh Activation authority epoch。

### 3.3 Carrier publication state

fresh carrier 总是从：

```text
remote Interest Registry = {}
retained Input State      = {}
Event history             = none
```

开始。

Desired Interest/local listener 可以继续存在，但 wire Registry必须重新 publication；所有重新 Effective 的 `.state` Channel 建立 fresh State baseline，`.event` 只接收 future events。

---

## 4. Application Unit / Message Surface

每个 application unit：

```text
one carrier application unit
= one UTF-8 JSON text string
= exactly one User Input message object
```

v1 exact message union：

```ts
type UserInputMessageV1 =
  | InputInterestV1
  | InputStateV1
  | InputEventV1
  | InputResetV1;
```

```ts
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

Frozen v1 不增加：

```text
sequence
revision
inputEpoch
inputSessionId
producerId in envelope
ACK / NACK
replay cursor
subscription revision
```

`frameId + activationId` 是 ordinary input lease identity；Session/subsystem/generation/profile由 current Data Connection 绑定。

---

## 5. Channel Identity / Grammar

标准 v1 Channel exact names：

```text
keyboard.state
keyboard.event
pointer.state
pointer.event
gamepad.state
gamepad.event
```

自定义 Channel：

```text
x.<custom-name>.state
x.<custom-name>.event
```

`<custom-name>`：

```text
one or more dot-separated segments
segment = [a-z][a-z0-9-]{0,31}
total channel length = 1..128 ASCII bytes
```

例如：

```text
x.inventory.drag.state
x.inventory.drop.event
x.dialog.choice.event
```

规则：

```text
.state suffix → only valid in input.state
.event suffix → only valid in input.event
standard prefixes keyboard./pointer./gamepad. are closed/reserved
unknown non-x channel is invalid
case-sensitive
no Unicode normalization
no wildcard/prefix subscription
```

Custom payload 语义由 Subsystem/Renderer product约定，但仍必须是 bounded plain JSON object，并服从 `.state` / `.event` 通用语义。

---

## 6. Frame Input Interest Registry

`input.interest` 是 current carrier 上的 full replacement Registry：

```text
InterestRegistry = Map<frameId, Set<channel>>
```

合法 snapshot：

```text
0..128 frame entries
frameId unique
1..64 channels per present frame entry
channel unique per frame
<=4096 total frame×channel pairs
```

Canonical wire form：

```text
frames[] sorted by frameId UTF-8 lexical order
channels[] sorted by ASCII byte order
```

`frameId` absent == empty Interest。不得发送空 channels entry。

清空全部：

```json
{"type":"input.interest","frames":[]}
```

不存在 incremental subscribe/unsubscribe、Interest ACK、revision、replay cursor。

### 6.1 Unknown/stale Frame Interest

Control/Data 无跨连接 total order，因此 well-formed `Interest[F]` 在 Renderer Control mirror 尚不知道 F、或 F 已消失时：

```text
store as inert configuration
no authority
no ordinary input
not protocol error
```

`frameId` 在 Session 内不复用，因此 stale entry 不会后来绑定到另一个 Frame lifetime。

### 6.2 Frame close

Subsystem local Frame terminalize 前 MUST：

```text
remove desired Interest[F]
clear retained local input state for F
close/disable bound listeners
```

wire full Registry publication MAY稍后 coalesce/send；Renderer正确性不得依赖这个 publication 先于 Control Frame removal 到达。

---

## 7. Cross-plane Convergence

Renderer Control 与 Data Connection 独立，没有 global total order。

两种顺序都合法：

```text
Interest first
    Interest[F] inert
    → later InputTarget F/A
    → recompute Effective

Authority first
    InputTarget F/A but no Interest
    → no input
    → later Interest[F]
    → recompute Effective
```

不得增加 cross-plane ACK/revision join/barrier/handshake。

Renderer 在任一事实变化后重新计算 Effective：

```text
Control authority snapshot
Interest Registry snapshot
Producer availability
current Data connection
```

Renderer/User Input 不解释 push/pop/call/return/caller/child/unwind；只组合 current committed facts。

---

## 8. Effective Transition State Machine

对每个 `(F,A,C)`：

### false → true, `.state`

Renderer MUST promptly queue one fresh self-contained current State baseline。

典型原因：

```text
Interest expands
InputTarget changes to F/A
fresh Activation
fresh carrier + Interest republish
Producer returns
```

### false → true, `.event`

只允许 transition 后发生的 future Event；不 replay过去事件。

### true → false

Renderer MUST立即停止为该 lease/channel产生新的 ordinary message。

原因包括：

```text
InputTarget revoke/replace
Frame no longer active
Interest shrink
Producer loss
Data retirement
```

---

## 9. Renderer Send Gate / Subsystem Receive Gate

Renderer only when `Effective(F,A,C)` MAY send ordinary State/Event，并使用 current `frameId + activationId`。

以下事实不能创建 authority：

```text
DOM focus
Render focus
component existence
physical carrier existence
cached activation
Interest alone
Producer alone
```

Subsystem 收到 State/Event MUST重新确认：

```text
message belongs to current Data carrier
local Frame exists
Frame active
activationId == current local Activation
channel ∈ local desired Interest[F]
local ordinary-input/mutation gate open
```

否则 MUST drop，不交给 business handler，也不升级 Runtime failure。

---

## 10. State Semantics

所有 `.state` Channel：

```text
self-contained
latest wins
MAY coalesce before emitted
must not require earlier State
must not replay across Activation
must not replay across retired carrier
```

`emitted` = application unit 已被 current carrier ordered-send boundary成功接受。从 emitted 起不能 retract/reorder/retry。

持续事实不得只靠 Event 表达。

---

## 11. Event Semantics

所有 `.event` Channel：

```text
ordered
transient
MUST NOT coalesce
MUST NOT replay
MAY be dropped before emitted under bounded backpressure
MUST NOT be persistent correctness唯一来源
```

surviving Events 保持相对顺序。

Event 本身不改变 retained protocol State；标准 Producer 的 state transition relationship 见 §18–§20。

---

## 12. Reset Semantics

`input.reset(F,A)` 是 teardown primitive，不是 Channel。

收到并且 `(F,A)` 仍是 local current Activation 时：

```text
clear all retained User Input .state for (F,A)
```

它：

```text
does not modify Interest[F]
does not replay/cancel historical Events
is a global Renderer→Subsystem State/Event coalescing barrier
```

well-formed stale Reset MAY drop。

Reset 是 best-effort wire notification；Activation/Data boundary本身已经隐式终止旧 retained State，因此 Reset 丢失不能导致旧 lease重新有效。

---

## 13. InputTarget Replacement / Lease Teardown

Renderer 观察到 old target `(S1,F1,A1)` 被 revoke/replaced：

```text
old lease ends immediately
no new old-lease ordinary messages
```

如果 old target 的 Data carrier仍 current，Renderer MUST best-effort queue：

```text
input.reset(F1,A1)
```

### 13.1 Same Data carrier direct replacement

如果 Control snapshot直接：

```text
(S,F,A1) → (S,F2,A2)
```

且使用同一 current Data carrier，即使中间 `null` snapshot 被 Control publication coalesce 掉：

```text
Reset(A1) MUST be ordered before first ordinary Input(A2)
```

如果 old/new target 属于不同 Subsystem/Data carrier，不存在跨 carrier ordering requirement；每条 carrier独立 obey自己的 lease boundary。

### 13.2 Fresh Activation

Interest[F] MAY继续存在，但 A2 的 State/Event从 fresh lease开始：

```text
.state → fresh baseline
.event → future-only
```

绝不继承 A1 retained State/Event。

---

## 14. Fresh Carrier / Data Generation

current carrier retired：

```text
published Interest Registry discarded
retained Input State discarded
all not-emitted Events discarded
old carrier messages no longer current
```

same-generation reconnect 与 fresh-generation replacement 都建立 fresh User Input wire publication state：

```text
InterestRegistry = {}
State = {}
Event history = none
```

local Desired Interest 与 live Frame/Activation 可继续存在，因此 Subsystem InputManager SHOULD自动重新 publication current full desired Registry。

重新 Effective 后：

```text
.state fresh baseline
.event future-only
```

Data reconnect/generation replacement本身不等于 Runtime restart、Frame restart 或 Activation replacement。

---

## 15. Interest Shrink / Expand

Subsystem mutation顺序：

```text
atomic local desired Interest update
→ local receive gate immediately reflects new value
→ queue latest full Registry publication
```

### Shrink

移除 State Channel 时 MUST立即清该 Channel local retained state；移除整个 Frame entry时清该 Frame当前 retained input state。

late removed-channel State/Event → drop。

### Expand

新增加：

```text
.state + Effective → fresh current baseline
.event + Effective → future Events only
```

Interest mutation不改变 Main authority、Frame lifecycle或Activation。

---

## 16. Producer Availability / Loss

Producer availability 是 Renderer-local gate，不是 Main authority。

`.event` Producer loss：

```text
future Event stops
no replay obligation
```

当前 Effective `.state` Producer 变 unavailable，而 same lease/Data仍有效：

```text
stop that Channel
→ best-effort Reset(F,A)
→ fresh baseline every remaining Effective .state Channel after Reset
```

原因：Reset清整个 `(F,A)` retained State，因此 remaining State Channels必须重建。

Producer返回：对应 `.state` false→true，fresh baseline；`.event` future-only。

---

## 17. Standard Keyboard Model

Keyboard v1 是 **physical-control input**，不是文本输入。

不承载：

```text
locale character
IME/composition
text editing intent
clipboard
layout-transformed text
```

### 17.1 KeyboardCodeV1

合法 code 是下列 finite grammar/set：

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

这些 identifier 表达 physical/logical control identity，不表达最终字符。平台 adapter 将 OS/DOM/native key identity映射到该集合；无法可靠映射的 control不进入标准 keyboard channel，可由 custom `x.*` 暴露。

### 17.2 `keyboard.state`

```ts
interface KeyboardStatePayloadV1 {
  readonly down: readonly KeyboardCodeV1[];
}
```

规则：

```text
0..128 entries
unique
ASCII lexical sorted
represents all currently held standard KeyboardCodeV1 controls visible to producer
```

### 17.3 `keyboard.event`

```ts
interface KeyboardEventPayloadV1 {
  readonly action: "down" | "up";
  readonly code: KeyboardCodeV1;
  readonly repeat: boolean;
}
```

规则：

```text
first down: repeat=false
repeated down while already held: repeat=true
up: repeat=false
```

如果 `keyboard.state` 同时 Effective：

```text
first down / up transition
→ queue post-transition keyboard.state
→ queue keyboard.event
```

repeat=true 不改变 held State，因此不要求额外 State emission。

---

## 18. Standard Pointer Model

Pointer v1 提供 Renderer **input surface normalized coordinates**，不绑定 RenderDomain/DOM element坐标。

### 18.1 Coordinate

`x/y` 是 signed 32-bit integer fixed-point：

```text
0          = left/top edge
1,000,000  = right/bottom edge
```

允许超出 `[0,1,000,000]` 表达 capture/drag 时的 off-surface position，但必须保持 signed int32：

```text
-2,147,483,648 .. 2,147,483,647
```

origin top-left，x向右，y向下。

### 18.2 Identity / buttons

```ts
type PointerKindV1 = "mouse" | "touch" | "pen";

type PointerButtonV1 =
  | "primary"
  | "auxiliary"
  | "secondary"
  | "back"
  | "forward";

interface PointerSampleV1 {
  readonly pointerId: number;
  readonly kind: PointerKindV1;
  readonly x: number;
  readonly y: number;
  readonly buttons: readonly PointerButtonV1[];
}
```

`pointerId` positive safe integer，one-shot within one Activation input lease；结束的 pointer lifetime在同一 lease不得复用 ID。

`buttons` unique，并按上方 enum 顺序排列。

### 18.3 `pointer.state`

```ts
interface PointerStatePayloadV1 {
  readonly pointers: readonly PointerSampleV1[];
}
```

```text
0..32 pointers
pointerId unique
sorted ascending pointerId
```

### 18.4 `pointer.event`

```ts
interface PointerEventPayloadV1 {
  readonly action: "down" | "up" | "cancel";
  readonly pointer: PointerSampleV1;
  readonly button: PointerButtonV1 | null;
}
```

规则：

```text
down/up  → button MUST non-null
cancel   → button MUST null
pointer sample describes transition-time/post-transition control values
```

如果 `pointer.state` 同时 Effective，任何 down/up/cancel transition：

```text
queue post-transition pointer.state
→ queue pointer.event
```

对于 touch/pen lifetime结束，post-transition State MAY不再包含该 pointer；Event仍携最后 transition sample。

v1 不标准化 wheel、gesture、pressure、tilt、pointer capture API 或 raw motion；需要时使用 `x.*` 或未来版本。

---

## 19. Standard Gamepad Model

Gamepad v1 只定义一个固定 standard logical layout；vendor-specific extra controls不进入标准 channel。

### 19.1 Identity

`gamepadId` positive safe integer，one-shot within one Activation input lease。设备离开后同一 lease不得复用 ID；fresh Activation可重新 mint。

### 19.2 Fixed-point values

```text
axis:   -1,000,000 .. +1,000,000
button:  0 .. 1,000,000
```

axis：

```text
leftX/rightX  -1,000,000 = left, +1,000,000 = right
leftY/rightY  -1,000,000 = up,   +1,000,000 = down
```

button canonical pressed threshold：

```text
value >= 500,000 → pressed
value <  500,000 → released
```

协议不定义 deadzone；Subsystem业务可自行应用。

### 19.3 Layout

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
```

全部 members required；平台无法映射为该 standard layout 的设备不作为标准 gamepad producer，可由 `x.*` 暴露。

### 19.4 `gamepad.state`

```ts
interface GamepadStatePayloadV1 {
  readonly gamepads: readonly GamepadSampleV1[];
}
```

```text
0..16 gamepads
gamepadId unique
sorted ascending gamepadId
```

### 19.5 `gamepad.event`

```ts
type GamepadButtonNameV1 = keyof GamepadButtonsV1;

interface GamepadEventPayloadV1 {
  readonly action: "down" | "up";
  readonly gamepadId: number;
  readonly button: GamepadButtonNameV1;
  readonly value: number;
}
```

Event只在 canonical pressed boolean发生 threshold transition时产生：

```text
released → pressed = down
pressed  → released = up
```

`value` 是 transition 后 button value。

如果 `gamepad.state` 同时 Effective：

```text
queue post-transition gamepad.state
→ queue gamepad.event
```

连接/断开本身只通过 self-contained `gamepad.state` membership变化表达；v1 不增加 connect/disconnect Event。

---

## 20. Standard State-before-Event Causality

对 keyboard/pointer/gamepad family：

如果对应 `.state` 与 `.event` 在同一 `(F,A)` 同时 Effective，并且一个 physical transition会改变 State且产生 Event：

```text
post-transition State
MUST be queued/emitted before
corresponding Event
```

因此 Subsystem Event handler若维护 retained sibling State，总能看到 post-transition State。

如果 sibling `.state` 未 Interested/Effective，不要求为了 Event额外发送未订阅 State。

Event 被保留在 outbound queue 时是 State coalescing barrier：不得把它之前建立因果 State 的 pending snapshot coalesce到 Event之后。

Event 在 emitted 前因 backpressure被丢弃后，该 barrier消失。

---

## 21. Ordering / Coalescing

Data carrier每方向 ordered；v1 不增加 inputSequence。

Renderer→Subsystem：

```text
State MAY coalesce
Event MUST NOT coalesce
Reset MUST NOT coalesce across another retained barrier
Event/Reset are global State coalescing barriers
```

例如：

```text
State S1
State S2
Event E
State S3
State S4
Reset
State S5
```

MAY成为：

```text
State S2
Event E
State S4
Reset
State S5
```

但不得把 `State S2` 移到 `E` 后，也不得把 `State S4` 移到 `Reset` 后。

Subsystem→Renderer 的 Interest Registry是另一方向的 latest full snapshot；尚未 emitted 的多个 Registry可独立 latest-state coalesce。

---

## 22. Backpressure

所有队列 MUST bounded。

建议结构不属于 wire，但 observable rules 固定：

```text
Interest: latest unsent full Registry
State: latest pending snapshot per Effective state Channel between barriers
Event: bounded ordered queue
Reset: teardown barrier, prioritized over obsolete pending State
```

允许丢未 emitted Event；surviving Events保持相对顺序，永不 replay。

不能因为 Event backlog无限阻塞 authority teardown或持续 State convergence。

Event overflow本身不是 Runtime failure/Frame unwind。

---

## 23. Wire / Representation

User Input v1 使用 frozen Wire JSON semantics：

```text
one UTF-8 JSON text application unit
plain JSON-compatible parsed value
all protocol objects closed schema
integer semantic fields = safe integer unless narrower range specified
```

禁止 application model：

```text
undefined
NaN / Infinity
BigInt
Function / Symbol
ArrayBuffer / Blob / MessagePort
DOM/Host object
class instance
invalid Unicode scalar sequence
```

source duplicate object member遵循 frozen Wire / ECMAScript `JSON.parse` observable semantics；User Input不得增加第二个 duplicate-member tokenizer/parser。parsed result仍必须满足 exact closed schema。

---

## 24. Exact Closed Schemas

Top-level exact key sets：

```text
input.interest
    type, frames

FrameInputInterest
    frameId, channels

input.state
    type, frameId, activationId, channel, payload

input.event
    type, frameId, activationId, channel, payload

input.reset
    type, frameId, activationId
```

Standard payload exact key sets：

```text
keyboard.state payload
    down

keyboard.event payload
    action, code, repeat

pointer.state payload
    pointers

PointerSample
    pointerId, kind, x, y, buttons

pointer.event payload
    action, pointer, button

gamepad.state payload
    gamepads

GamepadSample
    gamepadId, axes, buttons

GamepadAxes
    leftX, leftY, rightX, rightY

GamepadButtons
    south, east, west, north,
    leftBumper, rightBumper,
    leftTrigger, rightTrigger,
    select, start, leftStick, rightStick,
    dpadUp, dpadDown, dpadLeft, dpadRight, home

gamepad.event payload
    action, gamepadId, button, value
```

Unknown member、missing required member、wrong primitive/container、wrong standard channel payload → protocol-invalid。

Custom `x.*` payload root仍必须是 JSON object，但其 member schema由product定义，不属于 Core。

---

## 25. Hard Limits

Connection/application baseline：

```text
max application message UTF-8 bytes       1,048,576
max JSON container nesting depth          64
max generic array/object members          16,384
```

Identity/channel：

```text
frameId                                   1..128 UTF-8 bytes
activationId                              1..128 UTF-8 bytes
channel                                   1..128 ASCII bytes
custom segment                            1..32 ASCII bytes
```

Interest：

```text
max Frame Interest entries                128
max Channels per Frame                    64
max total frame×channel pairs             4,096
```

Payload：

```text
max payload compact JSON UTF-8 bytes      262,144
max payload relative container depth      32
max payload array/object members          16,384
```

Standard：

```text
keyboard.state down entries               <=128
pointer.state pointers                     <=32
gamepad.state gamepads                     <=16
pointerId/gamepadId                        1..Number.MAX_SAFE_INTEGER
pointer x/y                                signed int32
gamepad axis                               -1,000,000..1,000,000
gamepad button value                       0..1,000,000
```

`payload compact JSON bytes`按 frozen Wire compact serialization semantics衡量；实现可用等价 bounded walker，不要求先生成无界字符串。

128 Interest frame bound允许当前 Renderer Control最多64 live Frames外加 bounded cross-plane stale skew；它不是扩大 Main live Frame authority。

---

## 26. Validation Order

Receiver固定逻辑顺序：

```text
carrier application string
→ UTF-8 whole-message bound
→ Wire parseJsonText semantics
→ generic representation/depth bound
→ top-level type discrimination
→ exact closed schema
→ identifier/channel/count/payload hard limits
→ standard payload semantic validation when standard channel
→ authority/applicability gate
→ retained State/Event/Reset effect or Interest atomic replacement
```

representation/schema/limits invalid不能降级成“stale input drop”。

---

## 27. Failure Taxonomy

### 27.1 Protocol-invalid / Data-fatal

包括：

```text
malformed JSON/application unit
unknown input.* type
wrong direction/schema
unknown field/missing required field
invalid channel grammar/suffix
reserved unknown standard channel
invalid standard payload
hard limit violation
invalid numeric range/canonical form
```

行为：

```text
stop trusting current Data stream
→ retire current Data Connection
→ recover only through fresh current carrier if DataAuthority still current
```

不等于 Runtime failure/Frame unwind。

### 27.2 Well-formed authority-inapplicable

包括：

```text
stale activation State/Event/Reset
unknown/closed local Frame input
not-interested input
local mutation gate closed
message from no-longer-current carrier
```

行为：drop；不 retire Data。

### 27.3 Well-formed Interest/control skew

unknown/stale Frame Interest：store inert / eventually replaced；不 retire Data。

### 27.4 Producer transition

producer loss/return是本地 availability transition，按 §16 reset/rebaseline；不 retire Data。

### 27.5 Business handler failure

`InputListener` handler throw/reject属于 Subsystem SDK/business local error policy，不改变 wire validity，不授权 Renderer/Main修改 Frame/Runtime authority。

---

## 28. Data / Frame / Render Independence

```text
Frame-scoped Interest != per-Frame Data Connection
Frame suspend          != Interest removal
fresh Activation       != Interest replacement
Frame close            != Data Connection retire
Interest removal       != Frame close
Interest               != InputTarget authority
Data current            != ordinary input authority
Render Domain          != Input authority
```

Render Update 与 User Input 是同一 Data carrier上的 sibling protocols；共享 physical ordering不创建 shared authority/revision/transaction。

---

## 29. Explicit Non-goals

Frozen v1 不定义：

```text
text/IME/composition protocol
clipboard
wheel/gesture/pressure/tilt/raw-pointer-motion
vendor gamepad extension
haptics/output
input ACK/NACK
replay/history
input sequence/revision
wildcard Interest
incremental subscription
Activation-scoped Interest
per-channel Reset message
signed untrusted-Renderer authority capability
cross-Control/Data transaction
Frame mutation from input protocol
```

这些未来若需要，应以新 channel/profile/version清晰演进，而不是扩大 current v1已有字段语义。

---

## 30. Frozen Conformance Matrix

Normative conformance obligations由 [User Input v1 Conformance Profile](./user-input-conformance-v1.md) `fixtureSetRevision = 1` 固定。

至少证明：

```text
three-lifetime separation
Interest full replacement/canonical form
Interest-first / authority-first convergence
fresh Activation vs retained Interest
fresh carrier re-publication/fresh State
State false→true baseline
standard State-before-Event causality
Event/Reset coalescing barriers
direct A1→A2 lease replacement
producer loss Reset/rebaseline
interest shrink local drop
stale authority input drop
protocol-invalid message retires Data
standard Keyboard/Pointer/Gamepad canonical mapping bounds
custom x.* envelope
Hostra/PWA same abstract input trace
```

Executable fixture materialization可以在 Data/Input implementation qualification阶段落地；它不能改变本协议已经冻结的 observable semantics。

---

## 31. Frozen Compatibility Boundary

以下任一不兼容改变需要新的 User Input protocol version或新的 Data Profile combination：

```text
message kinds/schema
channel grammar/reserved names
standard payload schema/identifier semantics
standard numeric mapping/ranges
Interest canonical/lifetime semantics
Input lease/Activation semantics
State/Event/Reset ordering/coalescing
State-before-Event causality
producer-loss teardown
hard limits
wire encoding/validation
failure/drop/recovery boundary
```

Frozen v1 不通过新增可选字段或“宽容解析”偷偷演进。

---

## 32. Final Invariants

1. Main 是 ordinary InputTarget/Activation 唯一公共 authority；
2. Desired Interest 是 Subsystem-owned Frame-scoped configuration，不是 authority；
3. Input lease 是 Activation-scoped one-shot authority epoch；
4. wire Interest/retained State/Event stream是 carrier-scoped publication state；
5. Desired Interest可跨 fresh Activation/Data carrier保存，但旧 State/Event绝不跨 lease/carrier replay；
6. fresh carrier remote Interest/State/Event history均从 empty开始；
7. Renderer不解释 push/pop/call/return，只计算 current facts交集；
8. Control/Data无跨连接 total order，Interest-first/Authority-first都安全；
9. `.state` self-contained/latest-wins，false→true建立 fresh baseline；
10. `.event` future-only/ordered/transient/no replay；
11. 标准 stateful Event在 sibling State Effective时必须位于 post-transition State之后；
12. Reset清 `(F,A)` 全部 retained State但不改 Interest；
13. same-carrier direct InputTarget replacement先 teardown old lease再允许 new lease ordinary input；
14. Keyboard/Pointer/Gamepad wire payload和identifier/numeric semantics在 v1内完整冻结；
15. well-formed stale input drop，protocol-invalid input retire Data；两者不能混淆；
16. Input/Data/Frame/Render lifecycle与authority相互不拥有彼此。