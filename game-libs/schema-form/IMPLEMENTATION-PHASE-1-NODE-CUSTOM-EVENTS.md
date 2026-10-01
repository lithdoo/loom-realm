# Phase 1 Implementation Contract: Web Presentation Node Custom Events

Status: **frozen / implementation-ready**

This document is the implementation contract for phase 1 of Schema Form support.

An implementation agent should be able to execute this document without making new
architecture decisions. If current repository code materially contradicts this
contract, stop and update the contract rather than inventing a new abstraction.

The phase implements exactly one capability:

> A live projected Web Presentation RenderNode may emit a bounded semantic custom
> event back to its owning Subsystem through the existing User Input v1 path.

This phase does **not** implement Schema Form state, validation, rendering, or browser
controls.

## 1. Frozen design rules

The implementation must remain deliberately small.

Use the existing objects and lifetimes:

- extend the existing `WebPresentationContext` directly;
- keep one shared `PresentationResourceClient`;
- create one context object per live RenderNode;
- bind node provenance inside `WebProjector`;
- use one attachment-scoped revocable callback through the existing presentation seam;
- re-check authority/currentness in `ControlHolder`;
- reuse existing User Input v1 custom-event transport;
- use targeted delivery in `RendererInputGate`.

Do not add:

- a reverse Render protocol;
- DOM `CustomEvent` routing;
- a second presentation store;
- a second Renderer↔Subsystem transport;
- `PresentationEventClient`;
- `context.events`;
- a global EventBus;
- a generic capability registry;
- a generic Renderer-local producer registry;
- component-supplied Renderer identity.

The reserved presentation event channel is the only new producer case needed here.

## 2. Public Web Presentation API

The existing context is reopened and frozen as:

```ts
export interface WebPresentationContext {
  readonly resources: PresentationResourceClient;

  emitCustomEvent(
    name: string,
    data?: InputEventV1["payload"],
  ): void;
}
```

`WebPresentationContext` must be exported from:

```text
@loomrealm/renderer/web-presentation
```

Concretely, `packages/renderer/src/web-presentation.ts` must export the type from
`internal/web-projector.ts`.

Do **not** add a direct `@loomrealm/wire` dependency to Renderer merely to spell
`JsonObject`. Reuse `InputEventV1["payload"]` from `@loomrealm/data`.

Business component usage:

```ts
context.emitCustomEvent("submit", {
  values: {
    name: "Alice",
  },
});
```

The component supplies only:

```text
name
data
```

It never supplies:

```text
sessionId
subsystemKey
generation
domainId
targetKey
frameId
activationId
input channel
```

Those remain Renderer/Main authority facts.

## 3. Reserved User Input channel

Add to `packages/data/src/model.ts`:

```ts
export const WEB_PRESENTATION_EVENT_CHANNEL_V1 =
  "x.loomrealm.web-presentation.event" as const;
```

Re-export it from `@loomrealm/data`.

The channel already conforms to User Input v1 custom-channel grammar, so:

- no User Input wire version changes;
- no new Data message shape;
- no Renderer Data profile change.

The payload delivered through the existing `InputEventV1` is:

```ts
interface WebPresentationCustomEventPayloadV1 {
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: string;
  readonly data: InputEventV1["payload"];
}
```

Example:

```json
{
  "domainId": "d3",
  "targetKey": "schema-form:12",
  "name": "submit",
  "data": {
    "values": {
      "name": "Alice"
    }
  }
}
```

The Renderer adds `domainId` and `targetKey`. The component cannot override them.

## 4. End-to-end path

The complete path is fixed:

```text
Business Web Component
    ↓
WebPresentationContext.emitCustomEvent(name, data)
    ↓
WebProjector exact-live-record gate
    ↓
current attachment callback
    ↓
ControlHolder attachment/currentness gate
    ↓
ControlHolder payload validation
    ↓
RendererInputGate.emitEventForSubsystem(...)
    ↓
x.loomrealm.web-presentation.event
    ↓
existing Renderer Data / User Input v1
    ↓
Subsystem InputListener
```

There is no other path for this event.

## 5. WebProjector implementation

### 5.1 Shared resource capability

Replace the current shared `WebPresentationContext` field with one shared resource
client:

```ts
private readonly resources: PresentationResourceClient;
```

Create it once in the constructor:

```ts
this.resources = createPresentationResourceClient(
  options.resourceClient,
  this.lifetime.signal,
);
```

### 5.2 Exact RenderNode provenance

Extend `LiveElement`:

```ts
interface LiveElement {
  readonly identity: string;
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;

  // existing fields remain
}
```

`targetKey` is the source `RenderNodeV1.key`.

Do not derive identity later from DOM state.

### 5.3 Current attachment callback

Add one mutable private callback slot:

```ts
private presentationEmitNodeEvent:
  ((event: RendererPresentationNodeEvent) => void) | null = null;
```

`WebProjector.reevaluate()` becomes:

```ts
reevaluate(
  source: RendererPresentationSource,
  emitNodeEvent: (event: RendererPresentationNodeEvent) => void,
): void
```

The method must store the callback for the current attachment before reconciliation:

```ts
this.presentationEmitNodeEvent = emitNodeEvent;
```

The per-node context must **not** capture the callback passed during the node's
creation. It must call through the projector's current callback slot.

This is required so the same `WebProjector` can be detached and later attached again
without retained nodes holding an obsolete revoked callback.

On `teardown()`:

```ts
this.presentationEmitNodeEvent = null;
```

Structural failure may leave the field intact because `failed` itself permanently
blocks emission.

### 5.4 Per-live-node context

Create one frozen context for every newly created `LiveElement`:

```ts
const context: WebPresentationContext = Object.freeze({
  resources: this.resources,

  emitCustomEvent: (name, data) => {
    this.emitNodeEvent(
      record,
      name,
      data ?? EMPTY_JSON_OBJECT,
    );
  },
});
```

Use one module-local constant:

```ts
const EMPTY_JSON_OBJECT =
  Object.freeze({}) as InputEventV1["payload"];
```

The context is delivered exactly once through the existing
`receiveRenderContext(context)` callback and remains stable for the lifetime of that
HTMLElement.

### 5.5 First stale gate and exact runtime ordering

`emitNodeEvent()` accepts runtime-untrusted arguments:

```ts
private emitNodeEvent(
  record: LiveElement,
  name: unknown,
  data: unknown,
): void
```

The exact order is:

```text
1. ended / structuralFailed?
   yes → drop

2. this.live.get(record.identity) === record?
   no → drop

3. presentationEmitNodeEvent exists?
   no → drop

4. forward Renderer-owned identity + raw name/data
   synchronously to the current attachment callback
```

The exact record comparison is mandatory:

```ts
this.live.get(record.identity) === record
```

Do not use only `Map.has(identity)`.

No name/data validation happens before steps 1–3. A stale or revoked presentation
source is inert even if it attempts to pass malformed arguments.

### 5.6 Emission during receiveRenderContext

Current WebProjector construction order is preserved:

```text
create HTMLElement
→ create LiveElement record
→ receiveRenderContext(context)
→ later install created records into this.live
```

Therefore an event emitted synchronously from inside `receiveRenderContext()` is
dropped by the exact-live-record gate.

This behavior is intentional and frozen.

Do not reorder reconciliation or insert the record into `this.live` early merely to
support emission during context delivery.

A node becomes an event source only after it is installed as the current live record.

## 6. Presentation seam

### 6.1 Internal event shape

Add to `packages/renderer/src/internal/presentation-seam.ts`:

```ts
export interface RendererPresentationNodeEvent {
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;

  readonly name: unknown;
  readonly data: unknown;
}
```

`name` and `data` are intentionally `unknown` here. They originate from business
JavaScript and are validated at the authoritative acceptance boundary.

Renderer-owned identity fields are trusted closure facts.

### 6.2 Effect signature

Change:

```ts
export interface RendererPresentationEffect {
  reevaluate(source: RendererPresentationSource): void;
}
```

to:

```ts
export interface RendererPresentationEffect {
  reevaluate(
    source: RendererPresentationSource,
    emitNodeEvent: (event: RendererPresentationNodeEvent) => void,
  ): void;
}
```

Existing JavaScript effects that ignore the second argument remain valid.

Do not put the reverse operation on `RendererPresentationSource`; that object remains
read-only presentation facts.

## 7. ControlHolder attachment lifetime

The reverse callback is scoped to one call of `attachRendererPresentation()`.

Add one private token and one private callback field. The exact private names are not
ABI, but the semantics are:

```ts
[presentationAttachment](effect) {
  if (this.presentationEffect !== null) {
    throw new TypeError(
      "Renderer presentation already attached",
    );
  }

  const token = {};

  const emitNodeEvent = (
    event: RendererPresentationNodeEvent,
  ): void => {
    if (this.presentationToken !== token) return;
    this.acceptPresentationNodeEvent(event);
  };

  this.presentationToken = token;
  this.presentationEffect = effect;
  this.presentationEmitNodeEvent = emitNodeEvent;

  if (this.currentValue !== null) {
    this.notifyPresentation();
  }

  return () => {
    if (this.presentationToken !== token) return;

    this.presentationToken = null;
    this.presentationEffect = null;
    this.presentationEmitNodeEvent = null;
  };
}
```

The callback object is stable for one attachment.

After detach, a retained old callback silently drops forever.

A later attachment creates a new token and a new callback.

No global reusable presentation event sink is allowed.

### 7.1 notifyPresentation

`notifyPresentation()` must invoke:

```ts
effect.reevaluate(
  this.presentationSource,
  emitNodeEvent,
);
```

only when both the effect and current attachment callback are present.

The callback supplied to the projector is the attachment-scoped callback described
above.

## 8. ControlHolder authoritative acceptance gate

Add one private `acceptPresentationNodeEvent()`.

The exact order is frozen.

### 8.1 Currentness checks

Before validating business arguments, check:

```text
current Control exists
AND event.sessionId == current Session
AND current DataAuthority contains event.subsystemKey
AND authority generation == event.generation
AND matching current Data slot exists
AND matching current Data carrier exists
AND carrier belongs to current Control peer
AND carrier generation matches event.generation
AND carrier dataProfile matches current authority
AND RenderStore.isPresentationTargetCurrent(
      event.domainId,
      event.targetKey
    )
```

If any currentness check fails:

```text
→ silent drop
→ no argument validation
→ no InputGate mutation
→ no Data publication
```

This is normal asynchronous lifetime/currentness behavior.

### 8.2 Argument validation

After currentness succeeds, validate `event.name`.

Required name rules:

```text
type = string
UTF-8 byte length = 1..128
valid Unicode scalar sequence
```

Implement this as one small private helper in `control.ts`.

Do not introduce a general Renderer validation framework.

Then construct the complete payload:

```ts
const payload = {
  domainId: event.domainId,
  targetKey: event.targetKey,
  name,
  data: event.data,
};
```

Validate the **complete** payload using the Data helper defined in §11.

Validation includes the Renderer-added envelope, not only component `data`.

If name or payload validation fails:

```text
→ synchronously throw TypeError
→ no InputGate mutation
→ no Data writer call
→ do not report Render/Data protocol-fatal
```

Any internal `DataProtocolError`/validation error from the Data helper is contained
and converted to a presentation-boundary `TypeError`.

The exception propagates synchronously back through the attachment callback and
`WebPresentationContext.emitCustomEvent()` when the source is still current.

Do not expose Data codec error classes as Web Presentation ABI.

### 8.3 Input authority gate

After validation, call exactly:

```ts
this.inputGate.emitEventForSubsystem(
  event.subsystemKey,
  WEB_PRESENTATION_EVENT_CHANNEL_V1,
  payload,
);
```

At this point:

- no current InputTarget;
- wrong current InputTarget;
- no current Activation;
- no Frame interest in the reserved channel;

are ordinary User Input applicability cases and are silently dropped by InputGate.

Argument validation still occurs first because the RenderNode itself was current.

## 9. RenderStore readonly current-target query

Add exactly one method:

```ts
isPresentationTargetCurrent(
  domainId: string,
  targetKey: string,
): boolean
```

Return `true` only when all are true:

```text
currentCarrier
registrySeen
every currently registered domain is baselined
requested domain exists
requested domain is baselined
targetKey is currently live in that domain
```

Implementation uses existing Store facts only.

It must not:

- mutate Store state;
- create a second index;
- create new authority;
- consume Render events;
- consult DOM.

The "every domain baselined" check is required. During same-generation carrier
recovery, Web Presentation freezes old DOM until complete rebaseline. Frozen old DOM
must not regain event authority during partial rebaseline.

## 10. RendererInputGate targeted delivery

Add exactly one public-internal method:

```ts
emitEventForSubsystem(
  subsystemKey: string,
  channel: InputEventChannelV1,
  payload: InputEventV1["payload"],
): void {
  const slot = this.slots.get(subsystemKey);
  if (slot === undefined) return;

  if (
    slot.lease !== null &&
    slot.effective.has(channel)
  ) {
    slot.publisher.offerEvent(
      slot.lease,
      channel,
      payload,
    );
  }
}
```

Do not implement this by calling the existing broadcast `emitEvent()`.

A node belonging to subsystem A can only address subsystem A.

If subsystem B currently owns InputTarget, the event from A is dropped and must never
be redirected to B.

All existing bounded queue/backpressure behavior remains owned by
`BoundedInputPublisher`.

## 11. Built-in producer availability

The reserved channel is a Renderer built-in producer.

Do not add mutable availability state for it.

Modify `producerAvailable()`:

```ts
if (
  channel === WEB_PRESENTATION_EVENT_CHANNEL_V1
) {
  return true;
}
```

Then execute the existing physical-source availability logic for all other channels.

Consequences:

- `resetProducerFacts()` does not affect the reserved channel;
- presentation detach needs no InputGate availability mutation;
- a Frame may publish Interest in the channel before a WebProjector is attached;
- no events exist unless a current presentation node actually emits.

This is intentional.

## 12. RendererInputSource may not use the reserved channel

In `ControlHolder.validateSourceChange()`, reject every
`RendererInputSourceChange` whose `channel` equals:

```text
x.loomrealm.web-presentation.event
```

The failure is:

```text
→ synchronous TypeError
→ no InputGate mutation for that change
```

Use the existing RendererInputSource failure/lifetime behavior around that exception.
Do not add a new quarantine or recovery mechanism specifically for this channel.

Reason:

```text
RendererInputSource
→ Renderer-wide producer
→ no RenderNode provenance

Web Presentation node event
→ exact subsystem/domain/target provenance
```

The reserved channel must have only the second provenance path.

## 13. Reuse User Input payload validation

Expose from `packages/data/src/input-codec.ts`:

```ts
export function validateInputPayloadV1(
  raw: unknown,
): InputEventV1["payload"] {
  return assertPayload(raw, "input");
}
```

Re-export it from `packages/data/src/index.ts`.

Do not duplicate these rules in Renderer:

```text
plain JSON object
finite JSON numbers
payload relative depth <= 32
container members <= 16,384
compact JSON <= 262,144 UTF-8 bytes
no cyclic / non-JSON host values
```

The helper is validation only; it may return the validated input object.

The existing `BoundedInputPublisher.offerEvent()` performs the synchronous detached
frozen snapshot before queueing.

The acceptance call chain therefore is synchronous:

```text
ControlHolder validate complete payload
→ InputGate targeted applicability check
→ BoundedInputPublisher detachedFrozen snapshot
→ enqueue
```

There is no asynchronous mutation window between validation and the queued snapshot.

## 14. Accepted-event boundary

Once `BoundedInputPublisher.offerEvent()` accepts and queues the event, the event is
established as a User Input event.

A later RenderNode removal does **not** retract or scan the Input queue.

Do not add coupling such as:

```text
RenderNode remove
→ search pending input events
→ delete matching targetKey events
```

Existing User Input lifecycle rules remain authoritative:

- lease replacement/reset may discard old-lease pending input;
- Data retirement retires that publisher/queue;
- bounded Event overflow may drop unsent events under existing rules.

RenderNode removal after queue acceptance is not a new cancellation rule.

## 15. Failure taxonomy

The implementation must follow this exact table:

| Condition | Behavior |
| --- | --- |
| projector ended / structural-failed | silent drop |
| exact LiveElement record no longer current | silent drop |
| no current attachment callback | silent drop |
| attachment token revoked | silent drop |
| old Session/generation/Data carrier | silent drop |
| target domain/node no longer presentation-current | silent drop |
| invalid event name on current source | synchronous `TypeError` |
| invalid/non-JSON/oversized complete payload on current source | synchronous `TypeError` |
| no current InputTarget/Activation | InputGate drop |
| no reserved-channel Frame Interest | InputGate drop |
| targeted event belongs to non-target subsystem | never redirected |
| reserved channel emitted by ordinary RendererInputSource | synchronous `TypeError` |
| event already queued, then node removed | keep normal queued event semantics |

No case above becomes Render protocol-fatal or Frame failure.

## 16. Files to change

The implementation scope is frozen to these existing areas.

```text
packages/data/src/model.ts
  add WEB_PRESENTATION_EVENT_CHANNEL_V1

packages/data/src/input-codec.ts
  export validateInputPayloadV1()

packages/data/src/index.ts
  re-export channel constant + validator

packages/renderer/src/internal/web-projector.ts
  shared resources only
  per-LiveElement context
  current attachment callback slot
  exact-live-record emit gate

packages/renderer/src/internal/presentation-seam.ts
  RendererPresentationNodeEvent
  second reevaluate callback parameter

packages/renderer/src/control.ts
  attachment token + revocable callback
  notifyPresentation callback forwarding
  authoritative currentness gate
  name/full-payload validation
  reserved RendererInputSource rejection
  targeted publication

packages/renderer/src/internal/render-store.ts
  isPresentationTargetCurrent()

packages/renderer/src/internal/input-gate.ts
  emitEventForSubsystem()
  reserved channel built-in availability

packages/renderer/src/web-presentation.ts
  export WebPresentationContext

doc/15-contracts/web-presentation-api-v1.md
  reopen frozen context shape
  define node custom-event capability/lifetime/failure semantics

doc/15-contracts/user-input-v1.md
  reserve x.loomrealm.web-presentation.event provenance
  document built-in producer + targeted routing
  no wire version change
```

A small dedicated Renderer test file may be added for WebProjector node-event behavior
if existing tests do not provide an appropriate home. Do not create production
abstractions merely to make tests convenient.

No change is required to:

```text
InputEventV1 wire shape
Renderer Data profile
Main Control protocol
Subsystem Frame model
Render Update wire protocol
RenderDomain public API
desktop keyboard/pointer event mechanism
```

## 17. Explicitly rejected alternatives

Do not use DOM events as the transport:

```text
Custom Element
→ DOM CustomEvent
→ Window listener
→ Renderer
```

DOM propagation is presentation state, not Renderer provenance authority.

Do not reuse:

```ts
RenderDomain.emit(...)
```

`render.event` is Subsystem → Renderer. This capability is Renderer Presentation →
Subsystem.

Do not let the component send:

```ts
emitCustomEvent({
  domainId,
  targetKey,
  ...
});
```

Renderer identity is closure-bound.

Do not add an abstraction whose only consumer is this path when an existing object can
hold the required behavior.

## 18. Required test closure

Implementation is incomplete until all cases below are covered.

### WebProjector

```text
two live nodes receive different context objects
same live node retains the same context
both contexts share the same resources capability
node A emits Renderer-bound identity A
node B emits Renderer-bound identity B
event inside receiveRenderContext() is dropped
removed node retained context is inert
teardown retained context is inert
structural-failed projector retained context is inert
reattached same projector uses the new attachment callback
```

### Presentation seam / attachment

```text
attachment callback is stable within one attachment
detach permanently revokes the old callback
new attachment creates a distinct callback
old attachment cannot emit into the new attachment
existing effect that ignores second reevaluate argument still works
```

### RenderStore

```text
live fully-baselined target → true
missing domain → false
missing target → false
carrier lost → false
partial rebaseline → false
complete rebaseline + live target → true
```

### InputGate

```text
targeted subsystem receives event when lease + Interest are current
other subsystem never receives it
wrong InputTarget → drop
no Interest → drop
reserved channel remains producer-available across resetProducerFacts()
existing Event queue bounds/order remain unchanged
```

### ControlHolder integration

```text
current node event reaches owning Subsystem as existing input.event
frameId/activationId come from current Main authority
payload domainId/targetKey come from Renderer-bound node identity
old Session → drop
old generation → drop
retired carrier → drop
removed target → drop
partial rebaseline → drop
invalid current-source name → synchronous TypeError
invalid current-source JSON → synchronous TypeError
oversized complete payload → synchronous TypeError
ordinary RendererInputSource reserved-channel attempt → synchronous TypeError
accepted queued event is not retracted by later RenderNode removal
```

### Data helper

```text
valid JSON object accepted
non-object rejected
non-plain object rejected
cycle rejected
NaN / Infinity rejected
depth/member/byte limit violations rejected
```

## 19. Agent implementation order

Implement in this order to keep each layer independently testable:

```text
1. Data
   constant + validateInputPayloadV1()

2. InputGate
   built-in availability + targeted event

3. RenderStore
   readonly current-target query

4. presentation-seam
   event shape + callback parameter

5. ControlHolder
   attachment revocation + currentness + validation + routing

6. WebProjector
   per-node context + current callback + exact-live gate

7. public web-presentation export

8. contract docs

9. full tests / qualification
```

Do not start Schema Form phase 2 in the same implementation change.

## 20. Frozen completion invariant

Phase 1 is complete only when this is true:

> A current live projected RenderNode can synchronously emit a bounded JSON semantic
> event through its existing Web Presentation context. Renderer binds the source
> identity, independently re-validates current presentation authority, and targets only
> the owning subsystem. Main-owned InputTarget/Activation and Subsystem-owned Interest
> still decide actual User Input delivery. Stale, revoked, forged, or malformed sources
> cannot cross the boundary.

After this invariant is satisfied, Schema Form phase 2 must require no additional
Renderer architecture design.
