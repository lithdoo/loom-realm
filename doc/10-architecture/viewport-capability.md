# Renderer → Subsystem Viewport Capability

> 层级：系统架构  
> 状态：Active Design / Candidate for Freeze  
> 稳定程度：ADR 0036 accepted；formal contracts pending freeze  
> 主要定义：Viewport observation authority、Runtime-scoped author projection、Renderer Data Profile v2 composition、physical realization boundary  
> 依赖：[系统架构总览](./system-overview.md)、[Renderer⇄Subsystem 协议分层](./renderer-subsystem-protocol-layers.md)、[Subsystem 模型](./subsystem-model.md)、[ADR 0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)  
> 候选正式契约：[Viewport State v1](../15-contracts/viewport-state-v1.md)、[Renderer Data Profile v2](../15-contracts/renderer-data-profile-v2.md)  
> 最近复核：2026-09-16

---

## 1. Problem Boundary

Viewport 是 current Renderer presentation surface 的逻辑 CSS geometry fact，不是 ordinary user input。

```text
visible/suspended Frame may still own a live RenderDomain
child Frame may be the only InputTarget
Window/surface may resize during that suspension
```

因此：

```text
Viewport observation must survive InputTarget changes
Viewport does not create or widen Input authority
```

---

## 2. Authority Map

```text
Main
    owns DataAuthority {subsystemKey,generation,dataProfile}
    does NOT own width/height

Renderer physical realization
    observes current presentation-surface logical CSS size

Viewport State v1
    copies that retained observation over current Data carrier

Subsystem Host
    retains last successfully accepted observation

SubsystemScope.viewport
    readonly Runtime-scoped author projection

Business Runtime
    owns what viewport means for camera/projection/layout policy
```

Viewport is not DOM authority, Render authority, Frame authority or presentation currentness authority.

---

## 3. Lifetime Model

```text
Viewport object lifetime
    = Subsystem Runtime / SubsystemScope lifetime

Viewport retained value lifetime
    = last successfully accepted observation across Data carrier replacements

Physical publication lifetime
    = current Data carrier
```

Orthogonal lifetimes：

```text
Frame / Activation / InputTarget changes
    do not clear viewport

Data carrier loss
    does not clear retained author value

fresh carrier
    establishes a fresh physical baseline

Runtime terminal
    ends author callbacks
```

A non-null retained value is not proof that a carrier exists, a Renderer is current, or the surface is presently paintable.

---

## 4. Profile Composition

```text
loomrealm.renderer-data/1
    Connection1 + Input1 + Render1
    Frozen compatibility profile

loomrealm.renderer-data/2
    Connection1 + Input1 + Render1 + Viewport1
    candidate current target profile
```

Target product policy for the implementation subject chooses profile v2 for current DataAuthorities. Profile selection is Main application authority; physical broker only realizes the selected `(S,G,P)`.

No carrier negotiation, downgrade handshake, Game Entry feature declaration or per-Subsystem profile preference is introduced in this slice.

---

## 5. Author Projection

```ts
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface Viewport {
  readonly current: ViewportSize | null;
  subscribe(listener: (viewport: ViewportSize | null) => void): () => void;
}

export interface SubsystemScope {
  readonly viewport: Viewport;
}
```

Semantics：

```text
initial current = null until first accepted baseline
accepted state is detached/immutable
subscribe synchronously delivers current once
future delivery only on structural value change
unsubscribe idempotent
callback throw/rejection local-contained
callback result never controls Data reader/backpressure
```

The public surface intentionally contains no manager, source, transport, generation, Renderer id or wire message.

---

## 6. Physical Source Boundary

Concrete Renderer composition owns a narrow trusted source. Desktop first realization observes `window.innerWidth/innerHeight` as positive integer CSS pixels and coalesces resize publication; focus/blur and keyboard availability do not control viewport semantics.

PWA may use a different physical event source but must produce the same logical CSS-pixel meaning.

Excluded from v1：

```text
devicePixelRatio
orientation
screen/display id
safe-area
focus/visibility
DOM element rect
fullscreen mode
render scale
```

Each has different authority/lifetime and requires independent evidence before any future capability expansion.

---

## 7. Failure / Recovery

```text
malformed viewport.state
    → Viewport child protocol fatal
    → retire current Data carrier
    → not automatic Runtime/Frame failure

carrier loss
    → preserve last accepted viewport observation

fresh carrier
    → Renderer publishes current legal baseline when available
    → equal baseline: no author callback
    → changed baseline: update + callback

listener failure
    → local containment only
```

Viewport has no replay log, ACK, sequence/revision or historical event semantics.

---

## 8. Final Invariants

1. Viewport is Renderer-observed environment state, not User Input.
2. Main owns only DataAuthority selection/currentness, not viewport values.
3. `SubsystemScope.viewport` is Runtime-scoped and readonly.
4. Frame suspension/InputTarget loss cannot block viewport convergence.
5. Data carrier replacement resets wire baseline but not retained author value.
6. Profile v1 remains Frozen; profile v2 is an explicit new compatibility boundary.
7. Business packages own viewport policy; Core owns only bounded raw state replication.
8. No generic environment/service-locator abstraction is introduced.
