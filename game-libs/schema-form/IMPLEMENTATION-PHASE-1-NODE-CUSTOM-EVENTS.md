# Phase 1 Implementation: Web Presentation Node Custom Events

Status: implementation-ready

This document defines the first implementation phase required by Schema Form:

> A projected Web Presentation RenderNode may emit a semantic custom event back to
> its owning Subsystem through the existing User Input v1 path.

This phase implements only the LoomRealm architecture extension. It does not
implement Schema Form business behavior or Schema Form browser components.

The implementation should stay deliberately small:

- extend the existing `WebPresentationContext` directly;
- bind event provenance in `WebProjector`;
- re-check currentness in `ControlHolder`;
- reuse existing User Input v1 custom event transport;
- add no reverse Render protocol;
- add no DOM event bus;
- add no second presentation store;
- add no generic capability framework;
- add no generic producer registry for this one built-in event source.

## 1. Required observable API

The existing context becomes:

```ts
interface WebPresentationContext {
  readonly resources: PresentationResourceClient;

  emitCustomEvent(
    name: string,
    data?: JsonObject,
  ): void;
}
```

A business Custom Element uses it as:

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

It must never supply or override:

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

## 2. End-to-end path

The complete path is:

```text
Business Web Component
    ↓
WebPresentationContext.emitCustomEvent(name, data)
    ↓
WebProjector identity-bound closure
    ↓
attachment-scoped Renderer presentation callback
    ↓
ControlHolder currentness validation
    ↓
RendererInputGate.emitEventForSubsystem(...)
    ↓
x.loomrealm.web-presentation.event
    ↓
existing Renderer Data / User Input v1
    ↓
Subsystem InputListener
```

No new Renderer↔Subsystem message type is introduced.

The User Input message remains the existing:

```ts
interface InputEventV1 {
  readonly type: "input.event";
  readonly frameId: string;
  readonly activationId: string;
  readonly channel: InputEventChannelV1;
  readonly payload: JsonObject;
}
```

## 3. Reserved channel

Add one exported constant owned by the Data/User Input contract:

```ts
export const WEB_PRESENTATION_EVENT_CHANNEL_V1 =
  "x.loomrealm.web-presentation.event" as const;
```

The presentation event payload is:

```ts
interface WebPresentationCustomEventPayloadV1 {
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: string;
  readonly data: JsonObject;
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

The reserved channel is a Renderer-built-in event producer. For InputGate
availability it is always considered available.

This avoids introducing a second availability registry solely for Web Presentation.

Ordinary `RendererInputSource` must not be allowed to publish the reserved channel.
The channel's provenance must remain the Web Presentation node-event path.

## 4. WebProjector: shared resources, per-node context

Current implementation shares one `WebPresentationContext` across all elements.
That must change because `emitCustomEvent()` must identify the exact RenderNode that
received the context.

Keep only the resource client shared:

```ts
private readonly resources: PresentationResourceClient;
```

Create it once:

```ts
this.resources = createPresentationResourceClient(
  options.resourceClient,
  this.lifetime.signal,
);
```

Extend `LiveElement` with the missing node key:

```ts
interface LiveElement {
  readonly identity: string;
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;

  // existing fields...
}
```

When a new element is created, create its context once:

```ts
const context: WebPresentationContext = Object.freeze({
  resources: this.resources,

  emitCustomEvent: (name, data = EMPTY_JSON_OBJECT) => {
    this.emitNodeEvent(record, name, data);
  },
});

receiver.receiveRenderContext?.(context);
```

The context remains stable for that HTMLElement lifetime.

### 4.1 First stale gate

Before forwarding:

```ts
private emitNodeEvent(
  record: LiveElement,
  name: string,
  data: unknown,
): void {
  if (this.ended || this.failed) return;

  if (this.live.get(record.identity) !== record) {
    return;
  }

  // validate arguments, then forward
}
```

The identity check must compare the exact `LiveElement` record, not merely
`Map.has(identity)`.

This prevents an old retained HTMLElement/context from emitting after its live node
has been removed or replaced.

### 4.2 Argument failure behavior

Invalid component arguments are presentation-local programmer errors.

Examples:

```text
empty event name
oversized event name
invalid Unicode event name
non-JSON data
cyclic data
Date / DOM object / class instance
NaN / Infinity / BigInt / Function / Symbol
payload over User Input limits
```

These should fail synchronously at the presentation boundary and must not reach the
Data writer.

Currentness/lifetime failure is different:

```text
node removed
projector torn down
structural failure
old Session
old generation
carrier lost
partial rebaseline
no current InputTarget
no current Interest
```

Those are normal races and are silently dropped.

## 5. Presentation seam: one revocable callback, no new framework

Do not add a generic event bus or a public event-client object.

Add one internal node-event shape:

```ts
export interface RendererPresentationNodeEvent {
  readonly sessionId: string;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;
  readonly name: string;
  readonly data: JsonObject;
}
```

Extend the existing effect callback with one function argument:

```ts
export interface RendererPresentationEffect {
  reevaluate(
    source: RendererPresentationSource,
    emitNodeEvent: (event: RendererPresentationNodeEvent) => void,
  ): void;
}
```

Existing JavaScript consumers that ignore the second argument remain valid.

### 5.1 Attachment-scoped revocation

The reverse callback must be created per presentation attachment.

Conceptually:

```ts
[presentationAttachment](effect) {
  const token = {};

  const emitNodeEvent = (event: RendererPresentationNodeEvent) => {
    if (this.presentationToken !== token) return;
    this.acceptPresentationNodeEvent(event);
  };

  this.presentationToken = token;
  this.presentationEffect = effect;
  this.presentationEmitNodeEvent = emitNodeEvent;

  // existing initial reevaluation...

  return () => {
    if (this.presentationToken !== token) return;

    this.presentationToken = null;
    this.presentationEffect = null;
    this.presentationEmitNodeEvent = null;
  };
}
```

An old projector may retain an old callback after detach, but the token check makes
that capability permanently inert.

There is no reusable global presentation event sink.

## 6. ControlHolder: authoritative second gate

`ControlHolder` is the authoritative acceptance boundary.

For each node event, verify:

```text
current Control exists
AND event.sessionId == current Session
AND current DataAuthority contains event.subsystemKey
AND authority generation == event.generation
AND matching current Data carrier exists
AND carrier belongs to current Control peer
AND carrier generation/profile match current authority
AND RenderStore is presentation-current
AND event.domainId is current and baselined
AND event.targetKey is live in that domain
```

Only after those checks build:

```ts
const payload = {
  domainId: event.domainId,
  targetKey: event.targetKey,
  name: event.name,
  data: event.data,
};
```

Validate the complete payload before sending it to InputGate.

Then call:

```ts
this.inputGate.emitEventForSubsystem(
  event.subsystemKey,
  WEB_PRESENTATION_EVENT_CHANNEL_V1,
  payload,
);
```

The component-provided event cannot choose another subsystem.

## 7. RenderStore: one readonly target-current query

Add one method only:

```ts
isPresentationTargetCurrent(
  domainId: string,
  targetKey: string,
): boolean;
```

Its semantics match existing Web Presentation eligibility.

Return true only when:

```text
currentCarrier
AND registrySeen
AND every current domain is baselined
AND requested domain exists
AND requested domain is baselined
AND targetKey is live in that domain
```

The "every domain baselined" check is required because same-generation carrier loss
freezes the previous DOM until complete rebaseline. A frozen old DOM must not become
an input source during partial rebaseline.

This method is a readonly query over existing Store facts. It creates no new
authority or retained state.

## 8. InputGate: targeted event only

Current `emitEvent()` broadcasts a Renderer-wide physical producer event to every
eligible subsystem slot.

Node events already have an owning subsystem, so add one method:

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

This preserves all existing Main-owned gates:

```text
InputTarget
Activation
Frame interest
Data currentness
bounded Event queue
```

If a node belongs to subsystem A while subsystem B owns the current InputTarget, the
A event is dropped. It must never be redirected to B.

### 8.1 Built-in channel availability

Keep the existing physical availability map unchanged.

Modify `producerAvailable()` only:

```ts
if (channel === WEB_PRESENTATION_EVENT_CHANNEL_V1) {
  return true;
}
```

Then continue with existing physical source logic.

`resetProducerFacts()` therefore needs no special case and cannot accidentally
disable Web Presentation events.

This is simpler than introducing a second mutable local-availability registry.

## 9. Block the reserved channel from RendererInputSource

In `ControlHolder.validateSourceChange()`, reject:

```ts
change.channel === WEB_PRESENTATION_EVENT_CHANNEL_V1
```

for every physical/input-source change kind.

Reason:

```text
RendererInputSource
→ Renderer-wide physical/custom producer
→ has no RenderNode provenance

Web Presentation custom event
→ exact subsystem/domain/target provenance
```

Allowing the ordinary source seam to publish the reserved channel would permit a
source to forge `domainId` / `targetKey` and would bypass targeted routing.

## 10. Reuse User Input payload validation

Do not duplicate User Input JSON limits in Renderer.

Expose one small Data helper from the existing input codec:

```ts
export function validateInputPayloadV1(
  raw: unknown,
): JsonObject {
  return assertPayload(raw, "input");
}
```

Re-export it from `@loomrealm/data`.

The helper owns the existing User Input rules:

```text
plain JSON object
payload depth <= 32
container members <= 16,384
compact JSON <= 262,144 UTF-8 bytes
finite JSON numbers
no cyclic/non-JSON host values
```

`ControlHolder` validates the complete reserved payload:

```ts
validateInputPayloadV1({
  domainId,
  targetKey,
  name,
  data,
});
```

The existing InputGate publisher then performs its normal synchronous detached/frozen
snapshot before queueing.

Because validation and queue snapshot happen in one synchronous call chain, the
component cannot mutate the accepted object between those two steps.

Event-name validation remains a Web Presentation concern:

```text
1..128 UTF-8 bytes
valid Unicode scalar string
```

Use one small local helper; do not introduce a general validation framework for this.

## 11. Files to change

Required implementation scope:

```text
packages/data/src/model.ts
  add WEB_PRESENTATION_EVENT_CHANNEL_V1

packages/data/src/input-codec.ts
  expose validateInputPayloadV1()

packages/data/src/index.ts
  export channel constant + validation helper

packages/renderer/src/internal/web-projector.ts
  shared resources
  per-LiveElement context
  identity-bound emitCustomEvent()

packages/renderer/src/internal/presentation-seam.ts
  node-event type
  second reevaluate callback argument

packages/renderer/src/control.ts
  attachment-scoped callback revocation
  currentness gate
  reserved-channel source rejection
  validated targeted publication

packages/renderer/src/internal/render-store.ts
  isPresentationTargetCurrent()

packages/renderer/src/internal/input-gate.ts
  emitEventForSubsystem()
  built-in reserved-channel availability

packages/renderer/src/web-presentation.ts
  export WebPresentationContext type if needed by browser consumers

doc/15-contracts/web-presentation-api-v1.md
  reopen context shape and define node custom-event semantics

doc/15-contracts/user-input-v1.md
  reserve x.loomrealm.web-presentation.event provenance
  no wire version change
```

No change is required to:

```text
InputEventV1 wire shape
Renderer Data profile
Main Control protocol
Frame model
Render Update protocol
RenderDomain public API
desktop keyboard/pointer source behavior
```

## 12. Explicitly rejected implementation shortcuts

### DOM CustomEvent / Window listener

Do not implement:

```text
Custom Element
→ DOM CustomEvent
→ window listener
→ Renderer
```

DOM ancestry/event propagation is presentation state, not Renderer provenance
authority.

### Reverse RenderEvent

Do not reuse:

```ts
RenderDomain.emit(...)
```

`render.event` is Subsystem → Renderer. Node custom events are Renderer
Presentation → Subsystem. Reusing the Render direction would invert the existing
contract.

### Component-supplied identity

Do not expose:

```ts
emitCustomEvent({
  domainId,
  targetKey,
  ...
});
```

The node must not assert its own Renderer identity.

### Generic capability/event framework

Do not add:

```text
PresentationEventClient
context.events
global EventBus
generic capability registry
generic local producer registry
second presentation transport
```

None is required for this feature.

## 13. Test closure

Implementation is not complete until the following cases pass.

### WebProjector

```text
two live nodes receive different identity-bound contexts
same live node keeps the same context
node A emits targetKey A
node B emits targetKey B
removed node's retained context cannot emit
projector teardown prevents retained context emission
structural-failed projector prevents emission
invalid name/data fails before Renderer/Data publication
```

### Presentation attachment

```text
attached projector can emit
detach revokes old callback
new attachment gets a new callback
old attachment cannot emit through the new attachment
```

### RenderStore / currentness

```text
live baselined target → true
missing domain → false
missing target → false
carrier lost → false
partial rebaseline → false
complete rebaseline + live target → true
```

### InputGate

```text
targeted subsystem receives event when lease + interest are current
other subsystem never receives it
wrong InputTarget → drop
no interest → drop
reserved channel stays available across resetProducerFacts()
existing bounded Event queue behavior remains unchanged
```

### ControlHolder integration

```text
current node event reaches owning Subsystem as input.event
payload contains Renderer-added domainId/targetKey
Frame/Activation come from current Main authority
old Session event → drop
old generation event → drop
retired Data carrier event → drop
removed target event → drop
partial rebaseline event → drop
ordinary RendererInputSource reserved-channel attempt → reject locally
invalid JSON/oversized presentation payload never reaches Data writer
```

## 14. Completion invariant

Phase 1 is complete when this statement is true:

> A live projected RenderNode can emit a bounded JSON semantic event through its
> existing Web Presentation context; Renderer binds and re-validates the node
> provenance; existing Main InputTarget/Activation/Interest authority decides whether
> the owning Subsystem receives it; stale or forged sources cannot cross the boundary.

At that point Schema Form phase 2 should require no further Renderer architecture
change. It only needs to listen to the reserved channel and implement its own
form-state/rendering behavior.
