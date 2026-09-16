# Renderer → Subsystem Viewport State v1

> 层级：正式契约 / Child Protocol  
> 状态：Draft / Normative Candidate / Not Frozen  
> 协议版本：1  
> 协议标识：`loomrealm.viewport-state/1`  
> 主要定义：Renderer→Subsystem current presentation-surface logical viewport retained state、fresh-carrier baseline、validation、coalescing、failure/currentness boundary  
> 依赖：[Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md)、[ADR 0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> 组合：[Renderer Data Profile v2](./renderer-data-profile-v2.md)  
> Conformance：[Viewport State v1 Conformance](./viewport-state-conformance-v1.md)  
> 最近复核：2026-09-16

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达候选规范强度。Freeze 前这些关键字仍可经设计评审修订；实现不得把本文 Draft 状态冒充已冻结 Current。

---

## 1. Scope

Viewport State v1只复制一个事实：

```text
current Renderer presentation surface logical CSS width/height
```

它不表达用户动作、Frame focus、DOM element geometry或 render scale。

唯一方向：

```text
Renderer → Subsystem
```

唯一消息：

```text
viewport.state
```

不存在：

```text
viewport.event
viewport.reset
viewport.interest
viewport.request
viewport.ack
viewport.revision
```

---

## 2. Exact Message

```ts
interface ViewportStateV1 {
  readonly type: "viewport.state";
  readonly width: number;
  readonly height: number;
}
```

Top-level MUST exact-own only：

```text
type
width
height
```

`width` / `height` MUST：

```text
finite
integer
positive
safe integer
```

语义单位固定为 logical CSS pixel。

不得携带或隐式编码：

```text
devicePixelRatio
physical display pixels
screen/display id
orientation
safe-area
focus/visibility
DOMRect/element identity
Frame/Activation/InputTarget
subsystem business id
sequence/revision/timestamp
camera/tile/chunk/map policy
```

---

## 3. State Semantics

每个消息是 self-contained current truth：

```text
viewport.state(W,H)
```

不依赖 earlier viewport message。

Sender MAY 在尚未进入 shared serialized writer emission boundary 前 coalesce 中间尺寸，只保留 latest state。相同 `{width,height}` MAY suppress。

一旦一个 viewport message已进入 Profile 定义的 emitted/ordered-send boundary，后续 coalescing不得撤回或重排它。

Receiver只保留 latest successfully accepted viewport value；不建立 history、event log、ACK、replay cursor 或跨 carrier revision continuity。

---

## 4. Fresh Carrier Baseline

每个 fresh current Data carrier都有独立 Viewport publication baseline。

如果 Renderer physical source已经拥有合法 current viewport，Renderer MUST promptly enqueue一份 fresh `viewport.state` baseline。该 baseline不要求 width/height 与上一 carrier不同。

如果 fresh carrier安装时尚无合法 physical sample：

```text
no synthetic 0/null/default viewport.state is sent
```

Renderer MUST在首次取得合法 sample 时 promptly publish。Subsystem author retained value可以仍是 `null`（从未见过 baseline）或上一 carrier最后成功 observation；absence of fresh viewport message本身不代表 value reset。

Viewport baseline与 Input/Render child baseline共享 carrier ordering，但不创建 cross-child atomic transaction/barrier。

---

## 5. Carrier Loss / Replacement

Viewport wire publication state是 carrier-scoped；Subsystem author retained observation不是。

```text
current carrier lost/retired
→ wire baseline ends
→ author retained viewport remains unchanged
```

fresh carrier：

```text
fresh viewport baseline equal retained value
→ accepted
→ no author-visible change required

fresh viewport baseline differs
→ replace retained value
→ notify author subscribers
```

A retained non-null viewport MUST NOT be interpreted as proof that：

```text
a current carrier exists
a Renderer participant is current
the presentation surface is paintable
DOM is connected
```

Those currentness facts belong to their existing authorities.

---

## 6. Input / Frame Independence

Viewport State v1 MUST NOT be gated by：

```text
Main InputTarget
Frame active/suspended state
Activation id
Input Interest
keyboard/pointer/gamepad producer availability
```

A visible map Frame may be suspended behind a child Frame and still receive viewport convergence through its Subsystem Runtime's current Data connection.

Viewport publication MUST NOT create or widen ordinary input authority.

---

## 7. Physical Source Requirements

Renderer-side source MUST normalize to positive safe-integer logical CSS pixels before publication.

Desktop realization SHOULD：

```text
sample window.innerWidth / window.innerHeight
floor to integer
publish initial legal sample
coalesce resize burst before emission
suppress unchanged sample
```

Zero/invalid physical samples MUST NOT be serialized as legal `viewport.state`; they do not erase last legal retained source observation.

Focus/blur MUST NOT control viewport state availability. Hidden/visible transitions MAY trigger a resample for convergence but visibility itself is not payload state.

---

## 8. Validation / Failure

Profile receiver performs common representation preflight before child dispatch. Viewport child then exact-validates message kind/shape/value.

Malformed Viewport message is protocol-invalid：

```text
→ Viewport child protocol fatal
→ current Data carrier terminal/retired according to Profile v2
```

It is NOT：

```text
Runtime automatic failure
Frame automatic failure/unwind
User Input reset
Render Domain destroy
```

Well-formed duplicate/same-value state is accepted and MAY produce no author callback.

---

## 9. Author Projection Requirement

A conforming Subsystem host exposes retained Viewport state through the `@loomrealm/subsystem` Runtime-scoped projection：

```ts
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (viewport: ViewportSize | null) => void): () => void;
}
```

Required semantics：

```text
initial current = null until first accepted state
accepted value detached/immutable
subscribe synchronously delivers current exactly once
future callback only when retained structural value changes
unsubscribe idempotent
Runtime terminal ends future callbacks
```

Listener synchronous throw MUST be contained. If a callback returns a thenable despite the `void` author type, its completion MUST NOT become Data-reader/backpressure flow control; rejection MUST be locally contained/reported rather than becoming an unhandled protocol failure.

---

## 10. Limits

Viewport State v1 inherits Profile v2 common application-unit / JSON-depth gates. It defines no larger custom payload budget because its exact message is constant-size apart from decimal number representation.

Implementations MUST NOT add arbitrary metadata/extensions under this v1 message.

---

## 11. Final Invariants

1. Viewport State v1 is retained state, not an event stream.
2. It is independent of Frame/Activation/InputTarget/Input Interest.
3. It uses logical CSS pixels only.
4. Carrier replacement creates a fresh wire baseline but does not clear retained author observation.
5. No revision/ACK/replay/history exists.
6. Malformed viewport data retires Data, not Runtime/Frame authority.
7. Main never transports or owns the width/height value.
8. Business policy such as min/max/settle/camera remains outside this protocol.
